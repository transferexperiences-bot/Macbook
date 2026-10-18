#!/usr/bin/env python3
"""ore_confronto.py - tabella 'Ore autisti' (mese per mese, 4 colonne) nel file 'Transfer 2026 - Gestionale'.
Regola Agostino 14/10/2026: per ogni autista e mese sempre Fogli viaggio · Moox · Stima gestionale · Dichiarato,
piu' In Giornate (valore usato per pagare) e i giorni.
Uso: python3 ore_confronto.py <AAAA-MM> [<AAAA-MM> ...] [--scrivi]
Fonti (ponti n8n, POST JSON su https://transfer.app.n8n.cloud/webhook/<ponte>):
  gest-read {"q":"<mese> <anno>"}  servizi (stima)       · gs-read Check list 'Fogli di viaggio' (fogli)
  moox-api {"azione":"giro"}         soste per la regola · gx-graph tblGiornate (In Giornate) e tblOreConfronto (scrittura)
Moox = regola rendicontazione-autisti §0: dal primo ritiro all'ultimo rilascio, attese fuori sede pagate, pause in base no.
Dichiarato: si conserva quello gia' scritto nella tabella (lo inserisce a mano Agostino o la chat).
"""
import json, re, sys, math, subprocess, datetime as dt, collections, os, time
W = 'https://transfer.app.n8n.cloud/webhook/'
CHECK = '1z77zMyUch9s9Hx5yH7NoomHDYkZqTo_yPhpGAW34MrI'
D0 = dt.date(1899, 12, 30)
MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre']
ALIAS = {'Giovanni Ruggero':'Giovanni Ruggiero','Ardito Giuseppe':'Giuseppe Ardito','Ambrogio Tauro':'Tauro Ambrogio','Katia Secondo':'Katiuscia Secondo',
         'Katia secondo':'Katiuscia Secondo','Gianvito':'Giovanni Vito Antonio'}
ESCLUDI = {'Cancellato','','Your Driver','World Transfer','Davide Franco','Emanuele Pastoressa','Tedi tour operator',
           'Michele NCC Puglia','Puglia On','Stefano NCC','Wayid','De Rasmo','Paolo Calessino','Nicola Narracci','Agostino Narracci'}
POL = (40.9946, 17.2190); DEP = (40.9626, 17.1047)

def post(p, body, tries=4):
    for i in range(tries):
        try:
            o = subprocess.run(['curl','-s','-m','150','-X','POST',W+p,'-H','Content-Type: application/json','-d','@-'],
                               input=json.dumps(body), capture_output=True, text=True).stdout
            return json.loads(o)
        except Exception:
            time.sleep(10)
    raise SystemExit(f'ponte {p} non risponde')
def gx(metodo, percorso, corpo=None):
    b = {'metodo': metodo, 'percorso': percorso}
    if corpo is not None: b['corpo'] = corpo
    for t in range(6):
        r = post('gx-graph', b)
        if r.get('ok'): break
        if any(x in str(r) for x in ('Unavailable','Throttl','Timeout','TooManyRequests','CannotAcquireLock')): time.sleep(20 * (t + 1)); continue
        break
    if not r.get('ok'): raise SystemExit(f'gx-graph errore: {str(r)[:300]}')
    return r['risposta']
nm = lambda s: ALIAS.get(str(s).strip(), str(s).strip())
def pd(s):
    s = str(s); m = re.search(r'(\d{1,2}) (\w+) (\d{4})', s)
    if m and m.group(2) in MESI: return dt.date(int(m.group(3)), MESI.index(m.group(2))+1, int(m.group(1)))
    m = re.search(r'(\d{1,2})/(\d{1,2})/(\d{2,4})', s)
    if m: y = int(m.group(3)); return dt.date(y if y > 99 else 2000+y, int(m.group(2)), int(m.group(1)))
def tm(s):
    m = re.match(r'\s*(\d{1,2})[:.](\d{2})', str(s)); return int(m.group(1))*60+int(m.group(2)) if m else None
def hx(v):
    m = re.search(r'(\d+(?:[.,]\d+)?)', str(v or '')); return float(m.group(1).replace(',', '.')) if m else 0
def dur(r):
    t = (str(r.get('Transfer > Da',''))+' '+str(r.get('Transfer < Per',''))).lower()
    m = re.search(r'(\d+(?:[.,]\d+)?)\s*(h|ore)\b', t)
    if m: return float(m.group(1).replace(',', '.'))*60
    if any(k in t for k in ('dispo','tour','giornata','disposizione')): return 240
    return 60
def km(a, b): return math.hypot((a[0]-b[0])*111, (a[1]-b[1])*84)
def base(p): return km(p, POL) < 3.5 or km(p, DEP) < 1

S = {}
def add(a, d, s, e, t, src):
    if s < 120: d = d - dt.timedelta(1); s += 1440; e += 1440
    S.setdefault((nm(a), d), []).append((s, e, t, src))

MX = {}
MOOX_KO = []
def moox(tg, d):
    k = (tg, d)
    if k in MX: return MX[k]
    f = f'mx_{tg}_{d}.json'
    if os.path.exists(f):
        try: j = json.load(open(f))
        except Exception: j = {}
    else:
        try:
            j = post('moox-api', {'azione':'giro','targa':tg,'giorno':str(d)}, tries=6)
            json.dump(j, open(f, 'w'))
        except SystemExit:
            MOOX_KO.append(f'{tg} {d}'); j = {}
    tr = []
    for x in j.get('tratte', []) or []:
        def mm(s):
            dd, hh = s.split(); dd = dt.date(d.year, int(dd.split('/')[1]), int(dd.split('/')[0]))
            return (dd-d).days*1440+tm(hh)
        tr.append((mm(x['da']), mm(x['a']), tuple(map(float, x['partenza'].split(','))), tuple(map(float, x['arrivo'].split(',')))))
    MX[k] = tr; return tr

def unisci(iv, gap):
    iv = sorted(iv); bl = [list(iv[0])]
    for s, e in iv[1:]:
        if s - bl[-1][1] < gap: bl[-1][1] = max(bl[-1][1], e)
        else: bl.append([s, e])
    return sum(b[1]-b[0] for b in bl)/60
def fogli(A, d):
    f = [(s, e) for s, e, t, src in S.get((A, d), []) if src == 'F']
    return unisci(f, 1.01) if f else None
def stima(A, d):
    g = [(s, e) for s, e, t, src in S.get((A, d), []) if src == 'G']
    return unisci(g, 60) if g else None
def regola(A, d):
    allsv = sorted(S.get((A, d), []))
    if not allsv: return None
    g = [x for x in allsv if x[3] == 'G']
    start = min(x[0] for x in (g or allsv)); end = max(x[1] for x in (g or allsv))
    ivs = sorted([[s, e, t] for s, e, t, _ in allsv if s >= start-30]); bl = [ivs[0][:]]
    for s, e, t in ivs[1:]:
        b = bl[-1]
        if s - b[1] < 60: b[1] = max(b[1], e); continue
        tr = moox(b[2], d) if b[2] else []
        prev = [x for x in tr if x[1] <= s]; p = prev[-1][3] if prev else None
        if p and not base(p): b[1] = max(b[1], e)
        else: bl.append([s, e, t])
    return sum(min(b[1], end)-max(b[0], start) for b in bl if min(b[1], end) > max(b[0], start))/60

def norm(x): return ' '.join(sorted(str(x).casefold().split()))
def anagrafica():
    v = gx('GET', "tables('tblAutisti')/range?$select=values")['values']
    h = v[0]; iA, iC, iAl = h.index('Autista'), h.index('Categoria'), h.index('Alias')
    m = {}
    for r in v[1:]:
        if not r[iA] or str(r[iC]).strip() in ('Sub-appalto', 'Nessuno', 'Collega'): continue
        m[norm(r[iA])] = r[iA]
        for a in str(r[iAl] or '').replace(',', '|').split('|'):
            if a.strip(): m[norm(a)] = r[iA]
    for k, v2 in ALIAS.items(): m.setdefault(norm(k), v2)
    return m

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]; scrivi = '--scrivi' in sys.argv
    mesi = [tuple(map(int, a.split('-'))) for a in args]
    AN = anagrafica(); oggi = dt.date.today()
    # gestionale
    for y, m in mesi:
        rows = post('gest-read', {'q': f'{MESI[m-1]} {y}'}).get('rows', [])
        for r in rows:
            if 'ancell' in str(r.get('Allert','')) or not r.get('Autista') or 'ancell' in str(r['Autista']): continue
            d = pd(r.get('Data')); t = tm(r.get('Time'))
            if not d or t is None or (d.year, d.month) != (y, m): continue
            tg = str(r.get('Veicolo','')).split()[-1] if r.get('Veicolo') else ''
            add(r['Autista'], d, t, t+dur(r)+60*hx(r.get('h extra')), tg, 'G')
    # fogli di viaggio (tutto il foglio, a blocchi)
    seen = set(); s0 = 1
    while True:
        v = post('gs-read', {'docId': CHECK, 'range': f'Fogli di viaggio!A{s0}:P{s0+1999}'}).get('values', [])
        for r in v:
            if len(r) < 9: continue
            d = pd(r[3]); s = tm(r[4]); e = tm(r[8]); a = nm(r[2])
            if not d or s is None or e is None or (d.year, d.month) not in mesi: continue
            k = (a, d, s, e)
            if k in seen: continue
            seen.add(k)
            if e < s:
                if e < 180: e += 1440
                else:
                    try: s = e - float(str(r[15]).replace(',', '.'))*60
                    except Exception: continue
            if e - s > 13*60: continue
            add(a, d, s, e, str(r[1]).split()[-1] if r[1] else '', 'F')
        if len(v) < 2000: break
        s0 += 2000
    # Giornate (valore usato per pagare)
    addr = gx('GET', "tables('tblGiornate')/range?$select=address")['address'].split('!')[1]
    last = int(re.findall(r'\d+', addr.split(':')[1])[0]); G = collections.defaultdict(float); NG = collections.Counter()
    for a0 in range(4, last+1, 1500):
        vals = gx('GET', f"worksheets('Giornate')/range(address='A{a0}:L{min(a0+1499,last)}')?$select=values")['values']
        for r in vals:
            if isinstance(r[0], (int, float)) and r[0]:
                d = D0 + dt.timedelta(int(r[0]))
                if (d.year, d.month) in mesi: G[(r[1], d.year, d.month)] += float(r[2] or 0); NG[(r[1], d.year, d.month)] += 1
    # aggregato per autista e mese
    T = collections.defaultdict(lambda: collections.Counter())
    for (A0, d), _ in list(S.items()):
        A = AN.get(norm(A0))
        if (d.year, d.month) not in mesi or not A or A in ESCLUDI or d >= oggi: continue
        f, mo, st = fogli(A0, d), regola(A0, d), stima(A0, d)
        if mo is None: mo = st   # 17/10 Agostino: Moox e stima gestionale = una sola voce
        k = (A, d.year, d.month); T[k]['gg'] += 1; T[k]['ggf'] += f is not None
        T[k]['f'] += f or 0; T[k]['m'] += mo or 0; T[k]['s'] += st or 0
    # per giorno (foglio 'Ore giorno', tblOreGiorno) - richiesta Agostino 15/10: Paga da giorno per giorno
    GD = {}
    for (A0, d), _ in list(S.items()):
        A = AN.get(norm(A0))
        if (d.year, d.month) not in mesi or not A or A in ESCLUDI or d >= oggi: continue
        f, mo, st = fogli(A0, d), regola(A0, d), stima(A0, d)
        if mo is None: mo = st   # voce unica Moox/gestionale
        k = (A, d)
        o = GD.get(k, [None, None, None])
        GD[k] = [(o[0] or 0) + f if f is not None else o[0], (o[1] or 0) + mo if mo is not None else o[1], (o[2] or 0) + (st or 0)]
    out = []
    for (A, y, m), c in sorted(T.items(), key=lambda x: (x[0][1], x[0][2], x[0][0])):
        out.append([f'{y}-{m:02d}', A, c['gg'], c['ggf'], round(c['f'], 1), round(c['m'], 1), round(c['s'], 1), None,
                    round(G.get((A, y, m), 0), 1), ''])
    json.dump(out, open('ore_confronto_out.json', 'w'), ensure_ascii=False)
    print(f'righe {len(out)}'); [print(r) for r in out]
    if MOOX_KO: print('Moox senza risposta (giorno contato senza soste Moox):', ', '.join(MOOX_KO))
    if not scrivi: return
    # scrittura: chiave Mese + Autista, aggiorna in posto (il Dichiarato gia' scritto si conserva), aggiunge le mancanti
    addr = gx('GET', "tables('tblOreConfronto')/range?$select=address")['address'].split('!')[1]
    a1, a2 = addr.split(':'); r1 = int(re.findall(r'\d+', a1)[0]); r2 = int(re.findall(r'\d+', a2)[0])
    cur = gx('GET', f"worksheets('Ore autisti')/range(address='A{r1}:J{r2}')?$select=values")['values']
    idx = {(str(r[0]), r[1]): r1+i for i, r in enumerate(cur) if i > 0 and r[0]}
    nuovi = []
    for r in out:
        k = (r[0], r[1])
        if k in idx:
            rn = idx[k]; old = cur[rn-r1]
            r[7] = old[7] if old[7] not in ('', None) else None; r[9] = old[9] or ''
            gx('PATCH', f"worksheets('Ore autisti')/range(address='A{rn}:J{rn}')", {'values': [r]})
        else: nuovi.append(r)
    vuote = [r1+i for i, r in enumerate(cur) if i > 0 and not r[0] and not r[1]]
    while nuovi and vuote:
        rn = vuote.pop(0); gx('PATCH', f"worksheets('Ore autisti')/range(address='A{rn}:J{rn}')", {'values': [nuovi.pop(0)]})
    for i in range(0, len(nuovi), 100):
        gx('POST', "tables('tblOreConfronto')/rows/add", {'index': None, 'values': nuovi[i:i+100]})
    print(f'aggiornate {len(out)-len(nuovi)} · nuove {len(nuovi)}')
    ore_giorno(GD, mesi, AN)

def verosimile(f, m, s):
    if f is not None and m is not None: return 'Fogli' if abs(f - m) <= 1 else 'Moox'
    if f is not None: return 'Fogli'
    return 'Moox'   # Moox/gestionale, voce unica dal 17/10

def ore_giorno(GD, mesi, AN):
    # tblOreGiorno: Data · Autista · Fogli h · Moox h · Stima h · Dichiarato h · Paga da · Ore scelte* · In Giornate h · Applicata · Note
    addr = gx('GET', "tables('tblOreGiorno')/range?$select=address")['address'].split('!')[1]
    r1 = int(re.findall(r'\d+', addr.split(':')[0])[0]); r2 = int(re.findall(r'\d+', addr.split(':')[1])[0])
    cur = gx('GET', f"worksheets('Ore giorno')/range(address='A{r1}:K{r2}')?$select=values")['values']
    idx = {(int(r[0]), r[1]): r1 + i for i, r in enumerate(cur) if i > 0 and isinstance(r[0], (int, float)) and r[0]}
    # Giornate: riga, ore, fonte per applicare la scelta
    ga = gx('GET', "tables('tblGiornate')/range?$select=address")['address'].split('!')[1]
    last = int(re.findall(r'\d+', ga.split(':')[1])[0]); GR = {}
    for a0 in range(4, last + 1, 1500):
        vals = gx('GET', f"worksheets('Giornate')/range(address='A{a0}:F{min(a0+1499,last)}')?$select=values")['values']
        for i, r in enumerate(vals):
            if isinstance(r[0], (int, float)) and r[0] and r[3] != 'RICONOSCIUTE': GR[(int(r[0]), r[1])] = (a0 + i, r[2], r[3])
    TAR = {}
    for r in gx('GET', "tables('tblAutisti')/range?$select=values")['values'][1:]:
        TAR[r[0]] = (r[2], r[3])
    nuovi = []; applicate = 0; flag = 0
    BLK_AE = [list(r[:5]) for r in cur]; BLK_I = [[r[8]] for r in cur]
    for (A, d), (f, m, s) in sorted(GD.items(), key=lambda x: (x[0][1], x[0][0])):
        sd = (d - D0).days; k = (sd, A)
        rg = GR.get(k)
        row = [sd, A, round(f, 2) if f is not None else None, round(m, 2) if m is not None else None, round(s or 0, 2)]
        if k in idx:
            rn = idx[k]; old = cur[rn - r1]
            BLK_AE[rn - r1] = [x if x is not None else '' for x in row]; BLK_I[rn - r1] = [rg[1] if rg else '']
            scelta, appl = old[6], old[9]
            vs = {'Fogli': f, 'Moox': m, 'Stima': m, 'Dichiarato': old[5] if old[5] not in ('', None) else None}.get(scelta)
            if (scelta and scelta == appl and rg and vs is not None and isinstance(rg[1], (int, float))
                    and abs(vs - rg[1]) > 0.1 and TAR.get(A, ('',))[0] != 'Giornata + %'):
                # 18/10: 'Applicata' diceva fatto ma in Giornate ci sono altre ore -> non si applica da soli, si chiede ad Agostino
                gx('PATCH', f"worksheets('Ore giorno')/range(address='G{rn}')", {'values': [['']]})
                gx('PATCH', f"worksheets('Ore giorno')/range(address='J{rn}:K{rn}')", {'values': [['', f'⚠ da scegliere: pagato {rg[1]:g} h, {scelta} {vs:g} h']]})
                flag += 1
            elif scelta and scelta != appl and rg and TAR.get(A, ('',))[0] != 'Giornata + %':
                v = {'Fogli': f, 'Moox': m, 'Stima': m, 'Dichiarato': old[5] if old[5] not in ('', None) else None}.get(scelta)
                if v is not None:
                    eur = round(v * float(TAR.get(A, ('', 10))[1] or 10), 2)
                    gx('PATCH', f"worksheets('Giornate')/range(address='C{rg[0]}:F{rg[0]}')", {'values': [[round(v, 2), scelta.upper() if scelta != 'Dichiarato' else 'RICONOSCIUTE', 'A', eur]]})
                    gx('PATCH', f"worksheets('Ore giorno')/range(address='J{rn}')", {'values': [[scelta]]})
                    applicate += 1
        else:
            # 18/10: 'Paga da' = la fonte che coincide con le ore gia' in Giornate; se nessuna coincide, la sceglie Agostino
            gh = rg[1] if rg and isinstance(rg[1], (int, float)) else None
            pv = next((lab for lab, x in (('Fogli', f), ('Moox', m)) if gh is not None and x is not None and abs(x - gh) <= 0.1), None)
            if gh is not None and pv is None and TAR.get(A, ('',))[0] != 'Giornata + %':
                nuovi.append(row + [None, '', None, gh, '', f'⚠ da scegliere: pagato {gh:g} h', None])
            else:
                pv = pv or verosimile(f, m, s)
                nuovi.append(row + [None, pv, None, gh, pv, '', None])   # 12 colonne: L Mese e' formula
    # scrittura a blocchi (17/10: una PATCH per riga faceva scattare il limite di Microsoft)
    for i in range(1, len(cur), 150):
        a, b = r1 + i, r1 + min(i + 149, len(cur) - 1)
        gx('PATCH', f"worksheets('Ore giorno')/range(address='A{a}:E{b}')", {'values': BLK_AE[i:i+150]})
        gx('PATCH', f"worksheets('Ore giorno')/range(address='I{a}:I{b}')", {'values': BLK_I[i:i+150]})
    for i in range(0, len(nuovi), 100):
        gx('POST', "tables('tblOreGiorno')/rows/add", {'index': None, 'values': nuovi[i:i+100]})
    colori(r2 + 1, r2 + len(nuovi))
    print(f'ore giorno: nuove {len(nuovi)} · scelte applicate a Giornate {applicate} · da scegliere (pagato diverso) {flag}')

FASCE = (('#FFC7CE', '#9C0006'), ('#FFD8A8', '#9C5700'), ('#C6EFCE', '#006100'))   # >15 h rosso · 10-15 arancio · fino a 10 verde
def colori(a, b):
    # colora 'Ore scelte' (H) delle righe nuove: Microsoft Graph v1.0 non ha la formattazione condizionale
    if b < a: return
    v = gx('GET', f"worksheets('Ore giorno')/range(address='H{a}:H{b}')?$select=values")['values']
    for i, (h,) in enumerate(v):
        if not isinstance(h, (int, float)) or h <= 0: continue
        bg, fg = FASCE[0] if h > 15 else FASCE[1] if h > 10 else FASCE[2]
        gx('PATCH', f"worksheets('Ore giorno')/range(address='H{a + i}')/format/fill", {'color': bg})
        gx('PATCH', f"worksheets('Ore giorno')/range(address='H{a + i}')/format/font", {'color': fg})

if __name__ == '__main__': main()
