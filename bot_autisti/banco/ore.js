// ore.js — ore della giornata di un autista, stessa regola di ore_confronto.py (regola Moox/gestionale 19/10/2026).
// Funzioni pure: niente rete, niente fogli. Si incolla tale e quale in un nodo Code di n8n.
// effettive    = turno meno le soste libere (mezzo fermo 60+ min in base/casa, fuori dai servizi e dalle dispo)
// continuative = turno intero, dal posizionamento al rientro, senza togliere le soste
const POL = [40.9946, 17.2190], DEP = [40.9626, 17.1047];
const MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const ALIAS = {'Giovanni Ruggero':'Giovanni Ruggiero','Ardito Giuseppe':'Giuseppe Ardito','Ambrogio Tauro':'Tauro Ambrogio','Katia Secondo':'Katiuscia Secondo',
  'Katia secondo':'Katiuscia Secondo','Gianvito':'Giovanni Vito Antonio'};
const STACCO = 360, MATTINA = 360;

const nm = s => { s = String(s ?? '').trim(); return ALIAS[s] || s; };
const giorno = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / 864e5);           // giorni dal 1970
const iso = g => new Date(g * 864e5).toISOString().slice(0, 10);
function pd(s) {
  s = String(s ?? ''); let m = s.match(/(\d{1,2}) (\w+) (\d{4})/);
  if (m && MESI.includes(m[2])) return giorno(+m[3], MESI.indexOf(m[2]) + 1, +m[1]);
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) { const y = +m[3]; return giorno(y > 99 ? y : 2000 + y, +m[2], +m[1]); }
  return null;
}
function tm(s) { const m = String(s ?? '').match(/^\s*(\d{1,2})[:.](\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null; }
function hx(v) { const m = String(v || '').match(/(\d+(?:[.,]\d+)?)/); return m ? parseFloat(m[1].replace(',', '.')) : 0; }
function dur(r) {
  const t = (String(r['Transfer > Da'] ?? '') + ' ' + String(r['Transfer < Per'] ?? '')).toLowerCase();
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(h|ore)\b/);
  if (m) return parseFloat(m[1].replace(',', '.')) * 60;
  if (['dispo', 'tour', 'giornata', 'disposizione'].some(k => t.includes(k))) return 240;
  return 60;
}
const km = (a, b) => Math.hypot((a[0] - b[0]) * 111, (a[1] - b[1]) * 84);
const base = p => km(p, POL) < 3.5 || km(p, DEP) < 1;
const cmp = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; };

// servizi del gestionale -> eventi grezzi [autista, giorno, inizio, fine, targa]
function eventi(rows) {
  const out = [];
  for (const r of rows) {
    if (String(r.Allert ?? '').includes('ancell') || !r.Autista || String(r.Autista).includes('ancell')) continue;
    const d = pd(r.Data), t = tm(r.Time);
    if (d === null || t === null) continue;
    const tg = r.Veicolo ? String(r.Veicolo).trim().split(/\s+/).pop() : '';
    out.push([nm(r.Autista), d, t, t + dur(r) + 60 * hx(r['h extra']), tg]);
  }
  return out;
}
// giorno contabile per turni (regola 19/10): {"autista|giorno": [[s,e,targa,'G'],...]}
function assegna(raw) {
  const per = {}, S = {};
  for (const [a, d, s, e, t] of raw) (per[a] = per[a] || []).push([d * 1440 + s, d * 1440 + e, t, 'G']);
  for (const a of Object.keys(per)) {
    let g0 = null, fine = null;
    for (const [s, e, t, src] of per[a].sort(cmp)) {
      if (fine === null || s - fine >= STACCO || (Math.floor(s / 1440) > g0 && s % 1440 >= MATTINA)) { g0 = Math.floor(s / 1440); fine = e; }
      else fine = Math.max(fine, e);
      const k = a + '|' + g0; (S[k] = S[k] || []).push([s - g0 * 1440, e - g0 * 1440, t, src]);
    }
  }
  return S;
}
// tratte Moox (risposta di moox-api azione giro) -> [[da, a, [lat,lon] partenza, [lat,lon] arrivo]] in minuti dal giorno d
function tratte(j, d) {
  const y = new Date(d * 864e5).getUTCFullYear(), out = [];
  for (const x of (j && j.tratte) || []) {
    const mm = s => { const [dd, hh] = s.split(' '); const [g, m] = dd.split('/'); return (giorno(y, +m, +g) - d) * 1440 + tm(hh); };
    out.push([mm(x.da), mm(x.a), x.partenza.split(',').map(Number), x.arrivo.split(',').map(Number)]);
  }
  return out;
}
function unisci(iv, gap) {
  iv = iv.slice().sort(cmp); const bl = [iv[0].slice()];
  for (const [s, e] of iv.slice(1)) { if (s - bl[bl.length - 1][1] < gap) bl[bl.length - 1][1] = Math.max(bl[bl.length - 1][1], e); else bl.push([s, e]); }
  return bl.reduce((t, b) => t + b[1] - b[0], 0) / 60;
}
function turno(tr, ivs, s0, e0, lo, hi, dispo, conSoste, arco) {
  const casa = tr[0][2], libero = p => base(p) || km(p, casa) < 1;
  const mosse = tr.filter(x => s0 - 30 <= x[0] && x[0] < hi).map(x => x[1]);
  if (mosse.length) e0 = Math.max(Math.min(e0, Math.max(...mosse)), s0);
  const pre = tr.filter(x => lo <= x[0] && x[0] < s0 && libero(x[2]));
  const start = pre.length ? pre[pre.length - 1][0] : s0;
  const post = tr.filter(x => x[1] >= e0 - 30 && x[1] <= hi && libero(x[3]));
  let end = post.length ? Math.max(e0, post[0][1]) : e0;
  end = Math.min(end, Math.max(hi, e0));
  if (arco) { arco.inizio = Math.min(arco.inizio ?? start, start); arco.fine = Math.max(arco.fine ?? end, end); }
  let pausa = 0;
  if (!conSoste) {
    const tt = tr.filter(x => x[1] > start && x[0] < end);
    for (let i = 1; i < tt.length; i++) {
      const a = Math.max(tt[i - 1][1], start), b = Math.min(tt[i][0], end);
      if (b - a < 60 || !libero(tt[i - 1][3])) continue;
      if (dispo.some(([s, e]) => s < b && e > a)) continue;
      const occ = ivs.reduce((t, [s, e]) => t + Math.max(0, Math.min(e, b) - Math.max(s, a)), 0);
      pausa += Math.max(0, (b - a) - occ);
    }
  }
  return Math.max(0, end - start - pausa) / 60;
}
// ore di un autista in un giorno. S = assegna(...), moox(targa, giorno) -> tratte(...) oppure [] se non c'è Moox
function regola(S, A, d, moox, conSoste = false, arco = null) {
  const allsv = (S[A + '|' + d] || []).slice().sort(cmp);
  if (!allsv.length) return null;
  let g = allsv.filter(x => x[3] === 'G').map(x => x.slice()); if (!g.length) g = allsv.map(x => x.slice());
  const con = g.filter(y => y[2]);
  for (const x of g) if (!x[2] && con.length) x[2] = con.reduce((b, y) => Math.abs(y[0] - x[0]) < Math.abs(b[0] - x[0]) ? y : b)[2];
  let tot = 0;
  for (const tg of [...new Set(g.map(x => x[2]))].sort()) {
    const mine = g.filter(x => x[2] === tg).map(x => [x[0], x[1]]).sort(cmp);
    const tr = tg ? moox(tg, d) : [];
    if (!tr.length) { tot += unisci(mine, 60); if (arco) { arco.inizio = Math.min(arco.inizio ?? mine[0][0], mine[0][0]); arco.fine = Math.max(arco.fine ?? 0, ...mine.map(x => x[1])); } continue; }
    const altri = [];
    for (const k of Object.keys(S)) { const [a2, d2] = k.split('|'); if (+d2 !== d || nm(a2) === A) continue; for (const [s, e, t2, src] of S[k]) if (t2 === tg && src === 'G') altri.push([s, e]); }
    altri.sort(cmp);
    const segs = [[mine[0]]];
    for (const [s, e] of mine.slice(1)) {
      const last = segs[segs.length - 1]; const fine = last[last.length - 1][1];
      if (altri.some(([a]) => fine <= a && a < s)) segs.push([[s, e]]); else last.push([s, e]);
    }
    for (const sg of segs) {
      const s0 = sg[0][0], e0 = Math.max(...sg.map(x => x[1]));
      const lo = Math.max(...altri.filter(([a, b]) => b <= s0).map(x => x[1]), s0 - 240);
      const hi = Math.min(...altri.filter(([a]) => a >= e0 - 30).map(x => x[0]), e0 + 600);
      tot += turno(tr, sg, s0, e0, lo, hi, sg.filter(([s, e]) => e - s > 90), conSoste, arco);
    }
  }
  return tot;
}
// ore secondo le condizioni dell'autista (colonna «Calcolo ore» di Anag autisti)
function oreAutista(S, A, d, moox, calcolo) {
  const arco = {}, eff = regola(S, A, d, moox, false), cont = regola(S, A, d, moox, true, arco);
  if (eff === null) return null;
  const c = String(calcolo || '').toLowerCase().startsWith('cont') ? 'Continuative' : 'Effettive';
  return { calcolo: c, regola_vuota: !calcolo, effettive: eff, continuative: cont, ore: c === 'Continuative' ? cont : eff, inizio: arco.inizio, fine: arco.fine };
}
if (typeof module !== 'undefined') module.exports = { nm, pd, tm, iso, eventi, assegna, tratte, regola, oreAutista, unisci };
