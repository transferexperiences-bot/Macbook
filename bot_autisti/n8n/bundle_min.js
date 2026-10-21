const O = (() => {
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
function oreAutista(S, A, d, moox, calcolo) {
  const arco = {}, eff = regola(S, A, d, moox, false), cont = regola(S, A, d, moox, true, arco);
  if (eff === null) return null;
  const c = String(calcolo || '').toLowerCase().startsWith('cont') ? 'Continuative' : 'Effettive';
  return { calcolo: c, regola_vuota: !calcolo, effettive: eff, continuative: cont, ore: c === 'Continuative' ? cont : eff, inizio: arco.inizio, fine: arco.fine };
}
return { nm, pd, tm, iso, eventi, assegna, tratte, regola, oreAutista, unisci };
})();
const I = (() => {
const SALTA = { 'Fattura': 'fattura', 'Sconto in fattura': 'fattura', 'Dalla struttura': 'struttura', 'Omaggio': 'omaggio' };
const ELETTR = ['Carta', 'Link'];
const r2 = x => Math.round(x * 100) / 100;
const num = v => { const n = parseFloat(String(v ?? '').replace(/[^\d,.-]/g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const ID_RE = /TR[\/-][A-Za-z0-9_\/-]+/;
const MIN = 6e4, ORA = 36e5, GG = 864e5;
function cancellata(r) {
  const n = String(r.Note ?? '').toLowerCase();
  return /cancellat/i.test(String(r.Allert ?? '') + String(r.Autista ?? '')) || n.includes('cancellazione') || n.includes('cancellato il') || String(r.Id ?? '').includes('-DUP');
}
const chiuso = v => ['si', 'sì', 'true'].includes(String(v ?? '').trim().toLowerCase());
const importo = r => r2(num(r.Tariffa) - Math.abs(num(r.Acconto)) - (String(r['Stato %'] ?? '').trim().toLowerCase() === 'pagata' ? Math.abs(num(r.Fee)) : 0));
function incassoNote(r) {
  const n = String(r.Note ?? ''), m = n.match(/incassa(?:re|to)?\s+(?:€\s*)?(\d+(?:[.,]\d+)?)/i);
  if (/nulla da incassare|paga la struttura/i.test(n)) return null;
  if (m) return { importo: num(m[1]), tipo: /link|carta|pos/i.test(n) && !/contant/i.test(n) ? 'elettronico' : 'contanti' };
  if (/incassato in contanti/i.test(n)) return { importo: null, tipo: 'contanti' };
  return null;
}
const oraServ = (iso, time) => { const h = String(time ?? '').match(/(\d{1,2})[:.](\d{2})/); return Date.parse(`${iso}T${h ? h[1].padStart(2, '0') + ':' + h[2] : '12:00'}:00+02:00`); };
function riconcilia(servizi, sumup, { usate = [], gruppi = {} } = {}) {
  const U = new Set(usate), esito = {};
  const tx = (sumup || []).filter(t => String(t.status).toUpperCase() === 'SUCCESSFUL' && t.type !== 'REFUND')
    .map(t => ({ ...t, ts: Date.parse(t.timestamp), rif: (String(t.client_transaction_id || '').match(ID_RE) || [''])[0], firma: (String(t.client_transaction_id || '').match(/^LIB-(-?\d+)-/) || [])[1] || '' }));
  const S = servizi.filter(({ r }) => !cancellata(r) && ELETTR.includes(String(r['Modalità'] ?? '').trim()) && !chiuso(r.Show) && !String(r.Conto ?? '').trim() && importo(r) > 0)
    .map(({ r, iso }) => ({ id: String(r.Id), autista: String(r.Autista ?? ''), cliente: String(r.Nome ?? '').trim(), mod: String(r['Modalità']).trim(), imp: importo(r), iso, t: oraServ(iso, r.Time) }));
  const ids = new Set(servizi.map(({ r }) => String(r.Id)));
  const prendi = (xs, ts, come) => { ts.forEach(t => U.add(t.id)); xs.forEach(x => esito[x.id] = { esito: 'carta_ok', come, sumup: ts.map(t => t.transaction_code), sumup_importo: r2(ts.reduce((s, t) => s + Number(t.amount), 0)) }); };
  const aperti = () => S.filter(x => !esito[x.id]);
  const libere = () => tx.filter(t => !U.has(t.id) && !(t.rif && !ids.has(t.rif)));     // Id di un altro servizio -> esclusa
  const fineGiorno = iso => Date.parse(`${iso}T23:59:59+02:00`) + 4 * ORA;
  const vale = (t, x) => (!t.firma || String(gruppi[x.autista] || '') === t.firma) &&
    (x.mod === 'Link' ? t.ts >= x.t - 7 * GG && t.ts <= x.t + GG : t.ts >= x.t - 2 * ORA && t.ts <= fineGiorno(x.iso));
  const vicina = (c, t0) => c.slice().sort((a, b) => (b.firma ? 1 : 0) - (a.firma ? 1 : 0) || Math.abs(a.ts - t0) - Math.abs(b.ts - t0))[0];
  const ug = (a, b) => Math.abs(a - b) <= 0.5;
  for (const x of aperti()) { const t = tx.find(t => !U.has(t.id) && t.rif === x.id); if (t) prendi([x], [t], 'Id'); }
  for (const x of aperti()) { const c = libere().filter(t => ug(Number(t.amount), x.imp) && vale(t, x)); if (c.length) prendi([x], [vicina(c, x.t)], 'importo'); }
  const gruppiDi = xs => { const out = []; const n = xs.length; for (let m = 1; m < (1 << n); m++) { const g = xs.filter((_, i) => m & (1 << i)); if (g.length >= 2 && g.length <= 4) out.push(g); } return out.sort((a, b) => a.length - b.length); };
  for (const chiave of ['cliente', 'autista']) {
    const per = {}; for (const x of aperti()) (per[x[chiave] + '|' + x.iso] = per[x[chiave] + '|' + x.iso] || []).push(x);
    for (const xs of Object.values(per)) {
      if (xs.length < 2 || xs.length > 8) continue;
      for (const g of gruppiDi(xs)) {
        if (g.some(x => esito[x.id])) continue;
        const tot = r2(g.reduce((s, x) => s + x.imp, 0)), t0 = Math.max(...g.map(x => x.t));
        const c = libere().filter(t => ug(Number(t.amount), tot) && g.every(x => vale(t, x)));
        if (c.length) prendi(g, [vicina(c, t0)], 'somma ' + chiave);
      }
    }
  }
  for (const x of aperti()) {
    const c = libere().filter(t => vale(t, x) && Number(t.amount) < x.imp).sort((a, b) => a.ts - b.ts);
    let trovato = null;
    for (let i = 0; i < c.length && !trovato; i++) for (let j = i + 1; j < c.length && !trovato; j++) {
      if (c[j].ts - c[i].ts > 15 * MIN || c[j].payment_type !== c[i].payment_type) continue;
      if (ug(Number(c[i].amount) + Number(c[j].amount), x.imp)) trovato = [c[i], c[j]];
      for (let k = j + 1; k < c.length && !trovato; k++) if (c[k].ts - c[i].ts <= 15 * MIN && ug(Number(c[i].amount) + Number(c[j].amount) + Number(c[k].amount), x.imp)) trovato = [c[i], c[j], c[k]];
    }
    if (trovato) prendi([x], trovato, 'pagamento diviso');
  }
  for (const x of aperti()) {
    const pos = libere().filter(t => t.payment_type === 'POS' && t.ts >= x.t - 30 * MIN && t.ts <= x.t + 6 * ORA && Number(t.amount) < x.imp);
    const vic = libere().filter(t => t.ts >= x.t - 30 * MIN && t.ts <= x.t + 3 * ORA && !ug(Number(t.amount), x.imp) && Math.abs(Number(t.amount) - x.imp) <= 30);
    esito[x.id] = { esito: 'chiedi', motivo: 'non trovato su SumUp', indizio: pos.length ? 'misto' : vic.length ? 'importo diverso' : '', trovati: (pos.length ? pos : vic).slice(0, 3).map(t => ({ importo: Number(t.amount), ora: new Date(t.ts).toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }), tipo: t.payment_type })) };
  }
  return { esito, usate: [...U] };
}
function riepilogo(righeOggi, esitiCarta, righeAperte = []) {
  const righe = [];
  for (const r of righeOggi.filter(r => !cancellata(r)).sort((a, b) => String(a.Time).localeCompare(String(b.Time)))) {
    const mod = String(r['Modalità'] ?? '').trim(), imp = importo(r), nota = incassoNote(r);
    const b = { id: String(r.Id), ora: String(r.Time ?? ''), tratta: `${r['Transfer > Da'] ?? ''} → ${r['Transfer < Per'] ?? ''}`, cliente: String(r.Nome ?? ''), modalita: mod, importo: imp };
    if (String(r.Conto ?? '').trim()) { righe.push({ ...b, esito: 'salta', motivo: 'chiuso da Agostino' }); continue; }
    if (SALTA[mod]) {
      if (nota && nota.importo) righe.push({ ...b, importo: nota.importo, esito: nota.tipo === 'contanti' ? 'contanti' : 'chiedi', motivo: nota.tipo === 'contanti' ? 'dalle Note' : 'incasso elettronico nelle Note', da_note: true });
      else righe.push({ ...b, esito: 'salta', motivo: SALTA[mod] });
      continue;
    }
    if (imp <= 0) { righe.push({ ...b, esito: 'salta', motivo: 'importo zero' }); continue; }
    if (ELETTR.includes(mod)) {
      if (chiuso(r.Show)) righe.push({ ...b, esito: 'carta_ok', come: 'già verificata' });
      else righe.push({ ...b, ...(esitiCarta[b.id] || { esito: 'chiedi', motivo: 'non trovato su SumUp' }) });
      continue;
    }
    if (mod === 'Contanti' || (nota && nota.tipo === 'contanti')) { righe.push({ ...b, esito: chiuso(r.Show) ? 'consegnato' : 'contanti' }); continue; }
    righe.push({ ...b, esito: 'modalita', motivo: mod ? `«${mod}»` : 'vuota' });    // l'autista deve ancora segnare la modalità
  }
  const conta = e => righe.filter(x => x.esito === e);
  const somma = xs => r2(xs.reduce((t, x) => t + x.importo, 0));
  const prima = righeAperte.filter(r => !cancellata(r) && !chiuso(r.Show) && !String(r.Conto ?? '').trim() && (String(r['Modalità'] ?? '').trim() === 'Contanti') && importo(r) > 0);
  const giorniPrima = [...new Set(prima.map(r => r.Data))];
  return {
    righe,
    n: Object.fromEntries(['salta', 'carta_ok', 'contanti', 'consegnato', 'chiedi', 'modalita'].map(e => [e, conta(e).length]).concat([['totale', righe.length]])),
    contanti_oggi: somma(conta('contanti')),
    contanti_prima: somma(prima.map(r => ({ importo: importo(r) }))),
    giorni_prima: giorniPrima,
    da_chiedere: conta('chiedi'),
    da_segnare: conta('modalita')
  };
}
const eur = x => (Math.round(x * 100) / 100).toLocaleString('it-IT', { minimumFractionDigits: x % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' €';
function testoRiepilogo(R) {
  const p = [`Oggi ${R.n.totale} servizi`];
  const salta = R.righe.filter(x => x.esito === 'salta');
  if (salta.length) p.push(`${salta.length} senza incasso (${[...new Set(salta.map(x => x.motivo))].join(', ')})`);
  const c = R.righe.filter(x => x.esito === 'carta_ok');
  if (c.length) p.push(`${c.length} carta/link ✅ SumUp`);
  const k = R.righe.filter(x => x.esito === 'contanti' || x.esito === 'consegnato');
  if (k.length) p.push(`${k.length} contanti (${k.map(x => eur(x.importo)).join(' + ')})`);
  if (R.da_segnare.length) p.push(`${R.da_segnare.length} senza modalità`);
  if (R.da_chiedere.length) p.push(`${R.da_chiedere.length} da verificare`);
  let t = p.join(' · ') + '.';
  t += `\n💵 Contanti di oggi: <b>${eur(R.contanti_oggi)}</b>`;
  if (R.contanti_prima) t += ` · ancora da consegnare dai giorni prima: ${eur(R.contanti_prima)}`;
  return t + '.';
}
function testoVerificaPOS(nome, xs) {
  const righe = xs.map(x => `• ${x.ora} ${x.tratta}, ${x.cliente}, ${eur(x.importo)} (segnato ${x.modalita})` + (x.trovati && x.trovati.length ? ` — ho trovato ${x.trovati.map(t => `${t.tipo} ${eur(t.importo)} alle ${t.ora}`).join(', ')}` : ''));
  return `Sul POS/link non troviamo questi pagamenti:\n${righe.join('\n')}\nMi confermi l'importo esatto, l'ora e con quale POS o link è stato pagato? Se è stato pagato insieme ad altre corse o in contanti dimmelo. Grazie!`;
}
return { cancellata, importo, incassoNote, riconcilia, riepilogo, testoRiepilogo, testoVerificaPOS, eur, num };
})();
const CI = (() => {
function lettura(v) {
  const m = String(v ?? '').match(/^\s*(\d{1,3})\s*$/);
  return m ? +m[1] : null;                          // illeggibile -> null: si richiede la foto, mai un numero inventato
}
function litri(prima, dopo) {
  const a = lettura(prima), b = lettura(dopo);
  if (a === null || b === null) return { ok: false, motivo: 'lettura illeggibile' };
  return { ok: true, prima: a, dopo: b, litri: (b - a + 1000) % 1000, giro: b < a };
}
function controlla(prima, dopo, ultimaDopo, dichiarati) {
  const r = litri(prima, dopo); if (!r.ok) return { ...r, avvisi: [] };
  const avvisi = [];
  const u = lettura(ultimaDopo);
  if (u !== null && u !== r.prima) avvisi.push({ tipo: 'buco', testo: `il contatore era a ${u} dopo l'ultimo rifornimento registrato, ora parte da ${r.prima}: ${(r.prima - u + 1000) % 1000} l non registrati` });
  if (r.litri === 0) avvisi.push({ tipo: 'zero', testo: 'prima e dopo uguali: 0 litri' });
  if (r.litri > 100) avvisi.push({ tipo: 'troppi', testo: `${r.litri} l in un solo rifornimento` });
  if (dichiarati != null && Math.abs(Number(dichiarati) - r.litri) > 2) avvisi.push({ tipo: 'diversi', testo: `contatore ${r.litri} l, l'autista dice ${dichiarati} l` });
  return { ...r, avvisi };
}
return { lettura, litri, controlla };
})();
const C = (() => {
const eur = I.eur;
const h = x => { const m = Math.round(x * 60); return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`; };
const hm = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
const B = (passo, ...xs) => [xs.map(([t, v]) => ({ text: t, callback_data: `RA|${passo}|${v}`.slice(0, 64) }))];
const SOGLIA_PCT = 0.15, SOGLIA_MIN = 45;                  // Agostino 20/10: segnala solo oltre il 15% E oltre 45 minuti
const MODALITA = { c: 'Contanti', k: 'Carta', l: 'Link', n: 'Non incassato' };
const CARBURANTE = { 1: '¼', 2: '½', 3: '¾', 4: 'Pieno' };
function oltreSoglia(dich, moox) {
  if (moox == null) return false;
  const d = Math.abs(dich - moox) * 60;
  return d > SOGLIA_MIN && d > SOGLIA_PCT * moox * 60;
}
const minuti = x => { const m = String(x ?? '').match(/^\s*(\d{1,2})(?:[:.,h](\d{1,2}))?\s*$/); if (!m) return null; const mm = m[2] ? (m[2].length === 1 ? +m[2] * 10 : +m[2]) : 0; return +m[1] <= 30 && mm < 60 ? (+m[1]) * 60 + mm : null; };
function leggiOrari(t, base, campi) {
  let a = campi && minuti(campi.inizio), b = campi && minuti(campi.fine);
  if (a == null && b == null) {
    const tt = String(t).toLowerCase();
    const ore = [...tt.matchAll(/(\d{1,2})(?:[:.,h](\d{1,2}))?/g)].map(x => minuti(x[0].replace('h', ':'))).filter(x => x != null);
    const soloFine = /fini|finit|termin|smont|chius|arriv|rientr/.test(tt), soloInizio = /inizi|partit|cominc|attacc|preso servizio/.test(tt);
    if (ore.length >= 2) { a = ore[0]; b = ore[ore.length - 1]; }
    else if (ore.length === 1 && soloFine && !soloInizio) b = ore[0];
    else if (ore.length === 1 && soloInizio && !soloFine) a = ore[0];
    else if (ore.length === 1 && base && base.inizio != null) { const x = ore[0]; if (Math.abs(x - base.fine) <= Math.abs(x - base.inizio) || x >= base.inizio + 240) b = x; else a = x; }   // un orario solo: è la fine se sta più vicino alla fine
    else return null;
  }
  if (a == null) a = base && base.inizio; if (b == null) b = base && base.fine;
  if (a == null || b == null) return null;
  if (b <= a) b += 1440;
  return b - a > 20 * 60 ? null : { inizio: a, fine: b };
}
function apriChiusura(ctx) {
  const sv = ctx.servizi.slice().sort((a, b) => String(a.Time).localeCompare(String(b.Time)));
  const lista = sv.map(r => `${r.Time} ${r['Transfer > Da']} → ${r['Transfer < Per']}`).join('\n');
  return {
    passo: 'riep', dati: { ore: null, modalita: {}, verifiche: '', carburante: null, problemi: null, km: null },
    msg: { testo: `Ciao ${ctx.nome}, giornata finita? Oggi risultano ${sv.length} servizi:\n${lista}`, bottoni: B('riep', ['✅ Sì, ho finito', 'ok'], ['🚗 Ho ancora servizi', 'no']) }
  };
}
const msgOre = ctx => {
  const o = ctx.ore;
  if (o.tipo === 'tuktuk') return { testo: `Oggi la base del giorno è ${eur(o.base)}. Ti torna?`, bottoni: B('ore', ['✅ Sì', 'ok'], ['✏️ No', 'cor']) };
  return { testo: `Ore di oggi: <b>${h(o.ore)} ${o.calcolo === 'Continuative' ? 'di fila' : 'effettive'}</b> (dalle ${hm(o.inizio)} alle ${hm(o.fine)}). Confermi?`, bottoni: B('ore', ['✅ Confermo', 'ok'], ['✏️ Correggo', 'cor']) };
};
function msgIncassi(ctx, s) {
  const R = ctx.incassi, out = [{ testo: I.testoRiepilogo(R) }];
  const manca = R.da_segnare.filter(x => !s.dati.modalita[x.id]);
  if (manca.length) {
    const x = manca[0], i = R.da_segnare.indexOf(x);
    out.push({ testo: `${x.ora} ${x.tratta} (${x.cliente}), ${eur(x.importo)}: segna la modalità.`, bottoni: B('mod', ['💵 Contanti', `${i}c`], ['💳 Carta/POS', `${i}k`], ['🔗 Link', `${i}l`], ['❌ Non incassato', `${i}n`]) });
    return { passo: 'mod', out };
  }
  if (R.da_chiedere.length && !s.dati.verifiche) { out.push({ testo: I.testoVerificaPOS(ctx.nome, R.da_chiedere) + '\n<i>Scrivimi qui la risposta.</i>' }); return { passo: 'pos', out }; }
  return { passo: 'spese', out: out.concat(msgSpese(ctx)) };
}
function msgSpese(ctx) {
  const sp = ctx.spese || [];
  const t = sp.length ? `Spese registrate oggi: ${sp.map(x => `${x.tipo} ${eur(x.importo)}${x.pagato === 'inc' || x.pagato === 'incasso' ? ' (contanti incasso)' : x.pagato === 'mie' ? ' (soldi tuoi)' : ''}`).join(' · ')}. Manca qualcosa?` : 'Oggi non hai registrato spese né rifornimenti. Manca qualcosa?';
  return [{ testo: t, bottoni: B('spese', ['✅ È tutto', 'ok'], ['➕ Aggiungo', 'add']) }];
}
const msgCarb = () => [{ testo: 'Carburante a fine giornata?', bottoni: B('carb', ['¼', '1'], ['½', '2'], ['¾', '3'], ['Pieno', '4']) }];
const msgProb = () => [{ testo: 'Problemi col mezzo (spie, danni, rumori)?', bottoni: B('prob', ['✅ Nessuno', 'no'], ['⚠️ Sì', 'si']) }];
const msgKm = ctx => [{ testo: `Mandami la foto del cruscotto con i km.${ctx.mezzo && ctx.mezzo.km ? ` (Ultimi registrati: ${ctx.mezzo.km.toLocaleString('it-IT')} km)` : ''}` }];
function msgFine(ctx, s) {
  const d = s.dati, o = d.ore;
  const r = [`<b>Riepilogo ${ctx.giornoTxt}</b>`, `⏱ Ore: ${o ? h(o.ore) + (o.da_approvare ? ' (da approvare da Agostino)' : '') : '—'}`,
    `💵 Contanti di oggi: ${eur(ctx.incassi.contanti_oggi + Object.entries(d.modalita).filter(([, m]) => m === 'Contanti').reduce((t, [id]) => t + (ctx.incassi.da_segnare.find(x => x.id === id) || {}).importo || 0, 0))}`,
    `⛽ Carburante: ${CARBURANTE[d.carburante] || '—'} · 🔧 Problemi: ${d.problemi ? d.problemi : 'nessuno'} · 🛣 Km: ${d.km ? d.km.toLocaleString('it-IT') : '—'}`];
  return [{ testo: r.join('\n'), bottoni: B('fine', ['✅ Tutto giusto', 'ok'], ['✏️ Correggo qualcosa', 'cor']) }];
}
function passo(s, ev, ctx) {
  const out = [], scritture = [], avvisi = [];
  const res = () => ({ sessione: s, messaggi: out, scritture, avvisi });
  if (ev.tipo === 'avvio') {
    if (s && s.passo && s.passo !== 'chiusa' && s.giorno === ctx.giorno) return res();   // già aperta: niente doppioni
    const a = apriChiusura(ctx); s = { chat: ctx.chat, autista: ctx.autista, giorno: ctx.giorno, passo: a.passo, dati: a.dati, ultimo: a.msg }; out.push(a.msg); return res();
  }
  if (!s || s.passo === 'chiusa') { if (ev.tipo !== 'ripeti') out.push({ testo: 'Non ho nessuna chiusura aperta. Scrivimi pure cosa ti serve.' }); return res(); }
  if (ev.tipo === 'ripeti') { if (s.passo === 'spese') out.push(...msgSpese(ctx)); else if (s.passo === 'ore') out.push(msgOre(ctx)); else if (s.ultimo) out.push(s.ultimo); return res(); }
  const [pre, p, v] = ev.tipo === 'tap' ? String(ev.data).split('|') : [];
  if (ev.tipo === 'tap' && (pre !== 'RA' || p !== s.passo.replace(/_.*/, ''))) { out.push({ avviso_tap: 'Già registrato ✅' }); return res(); }   // doppio tap o bottone vecchio
  switch (s.passo) {
    case 'riep':
      if (v === 'no') { s.passo = 'riep'; out.push({ testo: 'Ok, ti riscrivo 20 minuti dopo l\'ultimo servizio. Buon lavoro!' }); s.rinvia = true; break; }
      if (v === 'ok') { s.passo = 'ore'; out.push(msgOre(ctx)); }
      break;
    case 'ore':
      if (ev.tipo === 'testo') { s.passo = 'ore_testo'; return passo(s, ev, ctx); }      // «ho finito alle 19:40» al posto del bottone
      if (v === 'ok') { s.dati.ore = { ore: ctx.ore.ore, fonte: 'CONFERMATE', da_approvare: false }; const m = msgIncassi(ctx, s); s.passo = m.passo; out.push(...m.out); }
      else if (v === 'cor') { s.passo = 'ore_testo'; out.push({ testo: 'Scrivimi a che ora hai iniziato e finito (es. «8:10 18:40»).' }); }
      break;
    case 'ore_testo': {
      if (ev.tipo !== 'testo') break;
      const o = leggiOrari(ev.testo, s.dati.proposta || ctx.ore, ev.campi);
      if (!o) { out.push({ testo: 'Non ho capito gli orari. Scrivimi per esempio «ho finito alle 19:40» oppure «8:10 18:40».' }); break; }
      const ore = (o.fine - o.inizio) / 60;
      s.dati.proposta = { ...o, ore }; s.passo = 'ore_conf';
      out.push({ testo: `Dalle ${hm(o.inizio)} alle ${hm(o.fine)} = <b>${h(ore)}</b>. Giusto?`, bottoni: B('ore', ['✅ Giusto', 'ok2'], ['✏️ Correggo', 'cor']) });
      break;
    }
    case 'ore_conf':
      if (ev.tipo === 'testo') {                         // un orario scritto qui è una correzione; altro testo: rispondo e ripropongo
        if (leggiOrari(ev.testo, s.dati.proposta || ctx.ore, ev.campi)) { s.passo = 'ore_testo'; return passo(s, ev, ctx); }
        out.push({ testo: (ev.intento && ev.intento.risposta) ? String(ev.intento.risposta).slice(0, 400) : 'Se gli orari vanno bene tocca «Giusto», altrimenti scrivimeli.' });
        if (s.ultimo) out.push(s.ultimo); break;
      }
      if (v === 'cor') { s.passo = 'ore_testo'; out.push({ testo: 'Scrivimi di nuovo inizio e fine.' }); break; }
      if (v !== 'ok2') break;
      if (oltreSoglia(s.dati.proposta.ore, ctx.ore.moox)) { s.passo = 'ore_motivo'; out.push({ testo: `Moox segna ${h(ctx.ore.moox)}. Mi dici il motivo della differenza? Lo passo ad Agostino.` }); break; }
      s.dati.ore = { ore: s.dati.proposta.ore, fonte: 'CONFERMATE', da_approvare: false };
      { const m = msgIncassi(ctx, s); s.passo = m.passo; out.push(...m.out); }
      break;
    case 'ore_motivo': {
      if (ev.tipo !== 'testo') break;
      s.dati.ore = { ore: s.dati.proposta.ore, fonte: 'DICHIARATE', da_approvare: true, motivo: String(ev.testo).slice(0, 300) };
      avvisi.push({ tipo: 'ore', testo: `⏱ <b>${ctx.nome}</b> ${ctx.giornoTxt}: dichiara ${h(s.dati.proposta.ore)} (${hm(s.dati.proposta.inizio)}-${hm(s.dati.proposta.fine)}), Moox ${h(ctx.ore.moox)}.\nMotivo: ${s.dati.ore.motivo}`,
        bottoni: [[{ text: '✅ Approva', callback_data: `AG|ore|ok|${ctx.chat}|${ctx.giorno}` }, { text: '❌ Rifiuta: ore Moox', callback_data: `AG|ore|no|${ctx.chat}|${ctx.giorno}` }]] });
      out.push({ testo: 'Grazie, l\'ho passato ad Agostino.' });
      const m = msgIncassi(ctx, s); s.passo = m.passo; out.push(...m.out);
      break;
    }
    case 'mod': {
      const i = parseInt(v), x = ctx.incassi.da_segnare[i];
      if (!x || !MODALITA[String(v).slice(-1)]) break;
      const mod = MODALITA[String(v).slice(-1)]; s.dati.modalita[x.id] = mod;
      if (mod === 'Non incassato') avvisi.push({ tipo: 'incasso', testo: `❌ <b>${ctx.nome}</b> ${ctx.giornoTxt} ${x.ora} ${x.tratta} (${x.cliente}) ${eur(x.importo)}: NON incassato.` });
      else scritture.push({ dove: 'gestionale', Id: x.id, campi: { 'Modalità': mod } });
      const m = msgIncassi(ctx, s); s.passo = m.passo; out.push(...m.out.slice(1));
      break;
    }
    case 'pos':
      if (ev.tipo !== 'testo') break;
      s.dati.verifiche = String(ev.testo).slice(0, 500);
      avvisi.push({ tipo: 'pos', testo: `💳 <b>${ctx.nome}</b> ${ctx.giornoTxt}, pagamenti non trovati su SumUp:\n${ctx.incassi.da_chiedere.map(x => `• ${x.ora} ${x.cliente} ${eur(x.importo)} (${x.modalita})`).join('\n')}\nRisposta: ${s.dati.verifiche}` });
      for (const x of ctx.incassi.da_chiedere) scritture.push({ dove: 'gestionale_nota', Id: x.id, nota: `Chiesto a ${ctx.nome} verifica POS (TG ${ctx.oraTxt})` });
      out.push({ testo: 'Grazie, lo controllo con Agostino.' }); s.passo = 'spese'; out.push(...msgSpese(ctx));
      break;
    case 'spese':
      if (v === 'add') { s.passo = 'spese'; out.push({ testo: 'Mandami la foto dello scontrino (o scrivimi cosa hai pagato).' }); s.dati.spesa_aperta = true; break; }
      if (v === 'ok') { s.passo = 'carb'; out.push(...msgCarb()); }
      break;
    case 'carb':
      if (!CARBURANTE[v]) break;
      s.dati.carburante = +v; s.passo = 'prob'; out.push(...msgProb()); break;
    case 'prob':
      if (v === 'no') { s.dati.problemi = null; s.passo = 'km'; out.push(...msgKm(ctx)); }
      else if (v === 'si') { s.passo = 'prob_testo'; out.push({ testo: 'Descrivimi il problema e, se puoi, mandami una foto.' }); }
      break;
    case 'prob_testo':
      if (ev.tipo !== 'testo' && ev.tipo !== 'foto') break;
      s.dati.problemi = String(ev.testo || (ev.lettura && ev.lettura.descrizione) || 'vedi foto').slice(0, 300);
      avvisi.push({ tipo: 'mezzo', urgente: true, testo: `🔧 <b>${ctx.nome}</b> segnala un problema sul ${ctx.mezzo ? ctx.mezzo.nome : 'mezzo'}: ${s.dati.problemi}` });
      out.push({ testo: 'Ricevuto, l\'ho passato subito ad Agostino.' }); s.passo = 'km'; out.push(...msgKm(ctx));
      break;
    case 'km': {
      const k = ev.tipo === 'foto' ? ev.lettura && ev.lettura.km : ev.tipo === 'testo' ? parseInt(String(ev.testo).replace(/\D/g, '')) : null;
      if (!k) { out.push({ testo: 'Non riesco a leggere i km: rifai la foto o scrivimeli.' }); break; }
      const ult = ctx.mezzo && ctx.mezzo.km;
      if (ult && (k < ult || k - ult > 1500)) { s.dati.km_proposti = k; s.passo = 'km_conf'; out.push({ testo: `Leggo ${k.toLocaleString('it-IT')} km, ma gli ultimi registrati sono ${ult.toLocaleString('it-IT')}. È giusto?`, bottoni: B('km', ['✅ Sì', 'ok'], ['✏️ No', 'cor']) }); break; }
      s.dati.km = k; s.passo = 'fine'; out.push(...msgFine(ctx, s));
      break;
    }
    case 'km_conf':
      if (v === 'ok') { s.dati.km = s.dati.km_proposti; avvisi.push({ tipo: 'mezzo', testo: `🛣 ${ctx.nome}: km ${s.dati.km} sul ${ctx.mezzo.nome}, ultimi registrati ${ctx.mezzo.km}.` }); s.passo = 'fine'; out.push(...msgFine(ctx, s)); }
      else if (v === 'cor') { s.passo = 'km'; out.push(...msgKm(ctx)); }
      break;
    case 'fine':
      if (v === 'cor') { s.passo = 'ore'; out.push({ testo: 'Ok, ripartiamo dalle ore.' }, msgOre(ctx)); break; }
      if (v !== 'ok') break;
      scritture.push({ dove: 'riepilogo_servizi', chiave: `CH-${ctx.giorno}-${ctx.autista}`, campi: { Data: ctx.giornoTxt, Autista: ctx.autista, Mezzo: ctx.mezzo ? ctx.mezzo.nome : '', 'n. servizi': ctx.servizi.length, 'Ore comunicate': s.dati.ore && Math.round(s.dati.ore.ore * 100) / 100, Incasso: ctx.incassi.contanti_oggi, Km: s.dati.km, Annotazioni: s.dati.problemi || '' } });
      scritture.push({ dove: 'stato_mezzo', mezzo: ctx.mezzo && ctx.mezzo.nome, campi: { km: s.dati.km, carburante: CARBURANTE[s.dati.carburante], problemi: s.dati.problemi, autista: ctx.autista, giorno: ctx.giorno } });
      s.passo = 'salvataggio'; out.push({ testo: 'Salvo…' });
      break;
  }
  const ult = [...out].reverse().find(m => m.bottoni || (m.testo && !m.chat)); if (s && ult) s.ultimo = ult;
  return res();
}
return { passo, leggiOrari, oltreSoglia };
})();
const A = (() => {
const B = (p, ...xs) => xs.map(r => r.map(([t, v]) => ({ text: t, callback_data: `RP|${p}|${v}`.slice(0, 64) })));
const CARB = { 1: '¼', 2: '½', 3: '¾', 4: 'Pieno' };
function apri(ctx) {
  const sv = ctx.servizi.slice().sort((a, b) => String(a.Time).localeCompare(String(b.Time)));
  const primo = sv[0];
  return { passo: 'mezzo', dati: { mezzo: null, km: null, spie: [], carburante: null, pulizia: null, danni: null, problemi: {} },
    msg: { testo: `Buongiorno ${ctx.nome}! Oggi ${sv.length} servizi, il primo alle ${primo.Time}: ${primo['Transfer > Da']} → ${primo['Transfer < Per']}.\nPrendi il <b>${ctx.mezzo ? ctx.mezzo.nome : '?'}</b>?`,
      bottoni: B('mezzo', [['✅ Sì', 'ok'], ['🔁 Un altro', 'alt']]) } };
}
function prossimo(ap, ctx, out) {
  const d = ap.dati, aperti = (ctx.mezzo && ctx.mezzo.problemi_aperti) || [];
  const p = aperti.find(x => !(x.id in d.problemi));
  if (p) { ap.passo = 'prob'; ap.prob = p.id; out.push({ testo: `Il ${p.giorno} ${p.da === ctx.autista ? 'hai segnalato' : p.da + ' ha segnalato'}: «${p.testo}». È ancora così?`, bottoni: B('prob', [['⚠️ Sì, ancora', 'si'], ['✅ Risolto', 'no']]) }); return; }
  if (d.km == null) { ap.passo = 'km'; out.push({ testo: '📸 Foto del cruscotto acceso: leggo km e spie.' }); return; }
  if (d.carburante == null) { ap.passo = 'carb'; out.push({ testo: 'Carburante?', bottoni: B('carb', [['¼', '1'], ['½', '2'], ['¾', '3'], ['Pieno', '4']]) }); return; }
  if (d.pulizia == null) { ap.passo = 'pul'; out.push({ testo: 'Il mezzo è pulito?', bottoni: B('pul', [['✅ Pulito', 'ok'], ['🧽 Interno da pulire', 'int'], ['🚿 Esterno da lavare', 'est']]) }); return; }
  if (d.danni == null) { ap.passo = 'danni'; out.push({ testo: 'Danni nuovi (graffi, ammaccature, vetri)?', bottoni: B('danni', [['✅ Nessuno', 'no'], ['📸 Sì, mando la foto', 'si']]) }); return; }
  ap.passo = 'fatto';
  out.push({ testo: `✅ Check-in fatto: ${d.mezzo}, ${d.km.toLocaleString('it-IT')} km, carburante ${CARB[d.carburante]}${d.spie.length ? ', spie: ' + d.spie.join(', ') : ''}. Buon lavoro!` });
}
function passo(ap, ev, ctx) {
  const out = [], scritture = [], avvisi = [];
  const res = () => ({ ap, messaggi: out, scritture, avvisi });
  if (ev.tipo === 'avvio') { if (ap && ap.giorno === ctx.giorno) return res(); const a = apri(ctx); ap = { giorno: ctx.giorno, passo: a.passo, dati: a.dati, ultimo: a.msg }; out.push(a.msg); return res(); }
  if (!ap || ap.passo === 'fatto') return res();
  const [pre, p, v] = ev.tipo === 'tap' ? String(ev.data).split('|') : [];
  if (ev.tipo === 'tap' && (pre !== 'RP' || p !== ap.passo.replace(/_.*/, ''))) { out.push({ avviso_tap: 'Già registrato ✅' }); return res(); }
  const d = ap.dati;
  switch (ap.passo) {
    case 'mezzo':
      if (ev.tipo === 'foto') {                         // foto del mezzo o del cruscotto: se si legge la targa, si prende quella
        const L = ev.lettura || {}, t = String(L.targa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const m = t.length >= 5 ? (ctx.flotta || []).find(x => x.toUpperCase().replace(/[^A-Z0-9]/g, '').endsWith(t)) : null;
        if (!m) { out.push({ testo: 'Non leggo la targa: tocca il bottone qui sopra.' }); break; }
        d.mezzo = m;
        if (ctx.mezzo && m !== ctx.mezzo.nome) avvisi.push({ tipo: 'mezzo', testo: `🚐 ${ctx.nome} prende il ${m} invece del ${ctx.mezzo.nome} assegnato.` });
        if (L.km) { const k = parseInt(String(L.km).replace(/\D/g, '')); if (k) { d.km = k; d.spie = L.spie || []; d.foto_km = ev.link; } }
        ap.mezzo_ctx = (ctx.altri_mezzi || {})[m] || { nome: m };
        out.push({ testo: `🚐 ${m}, ok.` }); prossimo(ap, { ...ctx, mezzo: ap.mezzo_ctx }, out); break;
      }
      if (v === 'ok') { d.mezzo = ctx.mezzo.nome; prossimo(ap, ctx, out); }
      else if (v === 'alt') { ap.passo = 'mezzo_alt'; out.push({ testo: 'Quale?', bottoni: B('mezzo', ...(ctx.flotta || []).map((m, i) => [[m, 'm' + i]])) }); }
      break;
    case 'mezzo_alt': { const i = /^m(\d+)$/.exec(v || ''); if (!i || !ctx.flotta[+i[1]]) break; d.mezzo = ctx.flotta[+i[1]];
      if (ctx.mezzo && d.mezzo !== ctx.mezzo.nome) avvisi.push({ tipo: 'mezzo', testo: `🚐 ${ctx.nome} prende il ${d.mezzo} invece del ${ctx.mezzo.nome} assegnato.` });
      ctx = { ...ctx, mezzo: (ctx.altri_mezzi || {})[d.mezzo] || { nome: d.mezzo } }; ap.mezzo_ctx = ctx.mezzo; prossimo(ap, ctx, out); break; }
    case 'prob':
      if (v !== 'si' && v !== 'no') break;
      d.problemi[ap.prob] = v === 'si' ? 'ancora' : 'risolto';
      scritture.push({ dove: 'evento_mezzo', mezzo: d.mezzo, tipo: v === 'si' ? 'problema confermato' : 'problema risolto', rif: ap.prob, autista: ctx.autista, giorno: ctx.giorno });
      prossimo(ap, { ...ctx, mezzo: ap.mezzo_ctx || ctx.mezzo }, out); break;
    case 'km': {
      if (ev.tipo !== 'foto') { out.push({ testo: '📸 Mi serve la foto del cruscotto.' }); break; }
      const L = ev.lettura || {}, k = parseInt(String(L.km ?? '').replace(/\D/g, '')), ult = (ap.mezzo_ctx || ctx.mezzo || {}).km;
      if (!k) { out.push({ testo: 'Non leggo i km: rifai la foto con il quadro acceso.' }); break; }
      if (ult && (k < ult || k - ult > 1500)) { ap.passo = 'km_conf'; d.km_letti = k; d.spie_lette = L.spie || []; out.push({ testo: `Leggo ${k.toLocaleString('it-IT')} km ma gli ultimi registrati sono ${ult.toLocaleString('it-IT')}. È giusto?`, bottoni: B('km', [['✅ Sì', 'ok'], ['📸 Rifaccio la foto', 'cor']]) }); break; }
      d.km = k; d.foto_km = ev.link; d.spie = L.spie || [];
      if (d.spie.length) avvisi.push({ tipo: 'mezzo', urgente: true, testo: `⚠️ ${ctx.nome}, ${d.mezzo}: spie accese al check-in: ${d.spie.join(', ')}.` });
      prossimo(ap, { ...ctx, mezzo: ap.mezzo_ctx || ctx.mezzo }, out); break;
    }
    case 'km_conf':
      if (v === 'cor') { ap.passo = 'km'; out.push({ testo: '📸 Rifai la foto del cruscotto.' }); break; }
      if (v !== 'ok') break;
      d.km = d.km_letti; d.spie = d.spie_lette; avvisi.push({ tipo: 'mezzo', testo: `🛣 ${ctx.nome}, ${d.mezzo}: ${d.km} km al check-in, ultimi registrati ${(ap.mezzo_ctx || ctx.mezzo).km}.` });
      prossimo(ap, { ...ctx, mezzo: ap.mezzo_ctx || ctx.mezzo }, out); break;
    case 'carb': if (!CARB[v]) break; d.carburante = +v; prossimo(ap, { ...ctx, mezzo: ap.mezzo_ctx || ctx.mezzo }, out); break;
    case 'pul': if (!['ok', 'int', 'est'].includes(v)) break; d.pulizia = v; prossimo(ap, { ...ctx, mezzo: ap.mezzo_ctx || ctx.mezzo }, out); break;
    case 'danni':
      if (v === 'no') { d.danni = ''; prossimo(ap, { ...ctx, mezzo: ap.mezzo_ctx || ctx.mezzo }, out); }
      else if (v === 'si') { ap.passo = 'danni_foto'; out.push({ testo: '📸 Mandami la foto del danno e scrivimi dove si trova.' }); }
      break;
    case 'danni_foto':
      if (ev.tipo !== 'foto' && ev.tipo !== 'testo') break;
      d.danni = String(ev.testo || (ev.lettura && ev.lettura.descrizione) || 'vedi foto').slice(0, 300); d.foto_danno = ev.link || d.foto_danno;
      avvisi.push({ tipo: 'mezzo', urgente: true, testo: `🔧 ${ctx.nome}, ${d.mezzo}: danno nuovo al check-in: ${d.danni}.` });
      prossimo(ap, { ...ctx, mezzo: ap.mezzo_ctx || ctx.mezzo }, out); break;
  }
  if (ap.passo === 'fatto') scritture.push({ dove: 'stato_mezzo', mezzo: d.mezzo, momento: 'check-in', campi: { km: d.km, carburante: CARB[d.carburante], spie: d.spie.join(', '), pulizia: d.pulizia, danni: d.danni, autista: ctx.autista, giorno: ctx.giorno, foto_km: d.foto_km || '', foto_danno: d.foto_danno || '' } });
  const ult = [...out].reverse().find(m => m.bottoni || (m.testo && !m.chat)); if (ap && ult) ap.ultimo = ult;
  return res();
}
return { passo };
})();
const SP = (() => {
const C = CI;
const eur = x => (Math.round(x * 100) / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const virgola = x => (Math.round(x * 100) / 100).toFixed(2).replace('.', ',');              // locale italiano: decimali con la virgola
const B = (p, ...xs) => xs.map(r => r.map(([t, v]) => ({ text: t, callback_data: `RS|${p}|${v}`.slice(0, 64) })));
const TETTO_PASTO = 10, MAX_PASTI = 2, TETTO_LAVAGGIO = 100;                                    // regole di oggi, ora nel codice
const PREZZO_L = [1.2, 2.4];
const SPESE = { ped: 'Pedaggio', par: 'Parcheggio', apt: 'Parcheggio Aeroporto', tes: 'Tessera/Abbonamento', man: 'Manutenzione', gen: 'Spesa Generica' };
const num = v => { const n = parseFloat(String(v ?? '').replace(/[^\d,.-]/g, '').replace(',', '.')); return isNaN(n) ? null : n; };
const ICONA = { 'Rifornimento da stazione di servizio': '⛽', 'Rifornimento da cisterna interna': '🛢️', AdBlue: '💧', Pasto: '🍝', 'Lavaggio non convenzionato': '🧽', 'Lavaggio convenzionato Mancini': '🧽', 'Spesa Varia': '🧾' };
const menu = t => ({ testo: t || 'Cosa registro?', bottoni: B('menu', [['⛽ Distributore', 'rif'], ['🛢️ Cisterna', 'cis']], [['🍝 Pasto', 'pas'], ['🧽 Lavaggio', 'lav']], [['🧾 Altra spesa', 'spe'], ['💧 AdBlue', 'adb']]) });
const pulisci = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function mezzoDaTarga(targa, flotta) {
  const t = pulisci(targa); if (t.length < 5) return null;
  return (flotta || []).find(m => pulisci(m).endsWith(t) || pulisci(m).includes(t)) || null;
}
function capisci(L) {
  if (!L) return null;
  if (L.tipo === 'contatore' || C.lettura(L.contatore) !== null) return { k: 'cis' };
  if (L.tipo === 'lavaggio' || (L.tipo === 'mezzo' && /lavagg|autolavag|portale|car ?wash|spazzol/i.test(L.descrizione || ''))) return { k: 'lvm' };
  const c = String(L.categoria || '').toLowerCase(), carb = String(L.carburante || '').toLowerCase(), es = String(L.esercente || '').toLowerCase();
  if (c === 'carburante') return { k: /adblue/.test(carb) ? 'adb' : 'rif' };
  if (c === 'pasto') return { k: 'pas' };
  if (c === 'lavaggio') return { k: 'lav' };
  if (c === 'pedaggio') return { k: 'spe', voce: 'ped' };
  if (c === 'parcheggio') return { k: 'spe', voce: /aeroport/.test(es) ? 'apt' : 'par' };
  return null;
}
function nuova(tipo, ctx, n, voce) {
  const base = { serve_foto: true, serve_importo: true, serve_mezzo: false, serve_pagato: true };
  const T = {
    rif: { tipologia: 'Rifornimento da stazione di servizio', descrizione: 'Rifornimento gasolio', serve_mezzo: true, serve_litri: true },
    cis: { tipologia: 'Rifornimento da cisterna interna', descrizione: 'Rifornimento da cisterna', cisterna: true, serve_importo: false, serve_pagato: false, serve_mezzo: true, importo: 0 },
    adb: { tipologia: 'AdBlue', descrizione: 'AdBlue', serve_mezzo: true },
    pas: { tipologia: 'Pasto', descrizione: 'Pasto' },
    lav: { tipologia: 'Lavaggio non convenzionato', descrizione: 'Lavaggio', serve_mezzo: true },
    lvm: { tipologia: 'Lavaggio convenzionato Mancini', descrizione: 'Lavaggio Mancini - Gratuito convenzionato', serve_mezzo: true, serve_importo: false, serve_pagato: false, importo: 0 },
    spe: { tipologia: 'Spesa Varia', descrizione: SPESE[voce] || 'Spesa Generica', serve_mezzo: ['ped', 'par', 'apt', 'man', 'tes'].includes(voce) }
  }[tipo];
  if (!T) return null;
  const sp = { n, passo: '', tipo, voce: voce || '', dati: { ...base, ...T } };
  if (sp.dati.serve_mezzo && ctx.mezzo) sp.dati.mezzo = ctx.mezzo.nome;             // il mezzo di oggi: si propone, non si chiede
  return sp;
}
function riga(sp, ctx) {
  const d = sp.dati, rif = `SP-${ctx.giorno}-${ctx.chat}-${sp.n}`;
  return { dove: 'recap', rif, campi: { Data: ctx.dataTxt, Autista: ctx.autista, Mezzo: d.mezzo || '', Tipologia: d.tipologia, Litri: d.litri != null ? virgola(d.litri) : '',
    'Descrizione': `${d.descrizione}${d.pagato ? ' · pagato con ' + (d.pagato === 'inc' ? 'contanti incasso' : 'soldi propri (rimborso)') : ''}${d.senza_foto ? ' · ⚠️ senza scontrino' : ''} · rif ${rif}`, '€': virgola(d.importo || 0), Foto1: d.foto1 || '', Foto2: d.foto2 || '' },
    pagato: d.pagato || null, importo: d.importo || 0, file_uid: [d.file_uid, d.file_uid2].filter(Boolean).join(',') };
}
function proposta(sp, out) {
  const d = sp.dati, ic = ICONA[d.tipologia] || '🧾';
  let t;
  if (d.cisterna) t = `${ic} Cisterna: contatore ${String(d.prima).padStart(3, '0')} → ${String(d.dopo).padStart(3, '0')} = <b>${virgola(d.litri)} litri</b>${d.mezzo ? ` sul <b>${d.mezzo}</b>` : ''}.`;
  else {
    const cosa = d.tipologia === 'Spesa Varia' ? d.descrizione.split(' - ')[0] : d.tipologia === 'Rifornimento da stazione di servizio' ? 'Rifornimento' : d.tipologia.replace(' non convenzionato', '');
    const dove = d.esercente ? ` da ${d.esercente}` : '';
    if (d.tipologia === 'Lavaggio convenzionato Mancini') { t = `${ic} Lavaggio da Mancini, convenzionato: <b>0 €</b>${d.mezzo ? ` · mezzo <b>${d.mezzo}</b>` : ''}.`; }
    const quanto = d.litri != null && !d.cisterna ? `<b>${virgola(d.litri)} l</b> a <b>${eur(d.importo)}</b>${d.prezzo_l ? ` (${virgola(d.prezzo_l)} €/l)` : ''}` : `<b>${eur(d.importo)}</b>`;
    if (!t) t = `${ic} ${cosa}${dove}: ${quanto}${d.mezzo ? ` sul <b>${d.mezzo}</b>` : ''}.`;
    if (d.nota_tetto) t += `\n<i>${d.nota_tetto}</i>`;
    if (d.senza_foto) t += '\n<i>Senza scontrino: la segno così e lo dico ad Agostino.</i>';
  }
  if (d.dubbio) t += `\n⚠️ ${d.dubbio}: controlla.`;
  const altro = d.serve_mezzo ? [['✏️ Correggo', 'cor'], ['🚐 Altro mezzo', 'alt']] : [['✏️ Correggo', 'cor'], ['❌ Annulla', 'no']];
  sp.passo = 'conferma';
  if (d.serve_pagato && !d.pagato) out.push({ testo: t + '\nCome l\'hai pagato?', bottoni: B('conferma', [['💵 Con l\'incasso', 'inc'], ['👤 Soldi miei', 'mie']], altro) });
  else out.push({ testo: t + ' Giusto?', bottoni: B('conferma', [['✅ Giusto, registra', 'ok'], altro[0]], [altro[1]]) });
}
function avanti(sp, ctx, out) {          // dopo ogni dato: il prossimo che manca davvero, poi la proposta da confermare
  const d = sp.dati;
  if (d.serve_foto && !d.foto1) { sp.passo = 'foto'; out.push({ testo: d.cisterna ? '📸 Foto del contatore PRIMA del rifornimento.' : '📸 Mandami la foto dello scontrino.' }); return; }
  if (d.cisterna && !d.foto2) { sp.passo = 'foto2'; out.push({ testo: `Contatore PRIMA: <b>${String(d.prima).padStart(3, '0')}</b>. 📸 Ora la foto DOPO il rifornimento.` }); return; }
  if (d.serve_importo && d.importo == null) { sp.passo = 'importo'; out.push({ testo: '💶 Non leggo il totale: quanto hai pagato?' }); return; }
  if (d.serve_litri && d.litri == null) { sp.passo = 'litri'; out.push({ testo: `Leggo ${eur(d.importo)} ma non i litri: quanti litri?` }); return; }
  if (d.serve_mezzo && !d.mezzo) { sp.passo = 'mezzo2'; out.push({ testo: 'Su quale mezzo?', bottoni: B('mezzo', ...coppie(ctx.flotta)) }); return; }
  proposta(sp, out);
}
const coppie = fl => { const r = []; (fl || []).slice(0, 8).forEach((m, i) => { if (i % 2 === 0) r.push([]); r[r.length - 1].push([m, 'm' + i]); }); return r; };
function daFoto(sp, ev, ctx, out, avvisi) {
  const d = sp.dati, L = ev.lettura || {};
  d.foto1 = ev.link; d.file_uid = ev.file_uid || '';
  const m = mezzoDaTarga(L.targa, ctx.flotta); if (m && d.serve_mezzo) d.mezzo = m;
  if (L.data && ctx.giorno && L.data !== ctx.giorno) avvisi.push({ tipo: 'spesa', testo: `🧾 ${ctx.nome}: scontrino con data ${L.data} registrato il ${ctx.giorno}.` });
  const imp = num(L.totale); if (imp != null && imp > 0) d.importo = imp;
  if (L.esercente) d.esercente = String(L.esercente).slice(0, 40);
  if (d.tipologia === 'Rifornimento da stazione di servizio' || d.tipologia === 'AdBlue') {
    const l = num(L.litri); if (l != null && l > 0) d.litri = l;
    if (/adblue/i.test(L.carburante || '')) { d.tipologia = 'AdBlue'; d.descrizione = 'AdBlue'; d.serve_litri = false; }
  }
  completa(sp, ctx, avvisi);
}
function completa(sp, ctx, avvisi) {     // controlli del codice su quello che si sa; si rifanno dopo ogni correzione
  const d = sp.dati; d.dubbio = ''; d.nota_tetto = '';
  if (d.importo && d.litri && !d.cisterna) {
    d.prezzo_l = d.importo / d.litri;
    if (d.tipologia !== 'AdBlue' && (d.prezzo_l < PREZZO_L[0] || d.prezzo_l > PREZZO_L[1])) d.dubbio = `prezzo ${virgola(d.prezzo_l)} €/l fuori dal normale`;
  }
  if (d.tipologia === 'Lavaggio convenzionato Mancini') return;
  d.descrizione = d.tipologia === 'Spesa Varia' ? `${d.descrizione.split(' - ')[0]}${d.esercente ? ' - ' + d.esercente : ''}`
    : d.cisterna ? `Rifornimento da cisterna, contatore ${String(d.prima).padStart(3, '0')} → ${String(d.dopo).padStart(3, '0')}`
    : `${d.tipologia === 'AdBlue' ? 'AdBlue' : d.tipologia === 'Pasto' ? 'Pasto' : d.tipologia.startsWith('Lavaggio') ? 'Lavaggio' : 'Rifornimento gasolio'}${d.esercente ? ' - ' + d.esercente : ''}${d.prezzo_l ? ' · ' + virgola(d.prezzo_l) + ' €/l' : ''}`;
  if (d.tipologia === 'Pasto' && d.importo > TETTO_PASTO) { d.nota_tetto = `scontrino ${eur(d.importo)}: si rimborsano ${eur(TETTO_PASTO)}`; d.descrizione += ` · scontrino ${eur(d.importo)} → registrati ${eur(TETTO_PASTO)}`; d.scontrino = d.importo; d.importo = TETTO_PASTO; }
  if (d.tipologia.startsWith('Lavaggio') && d.importo > TETTO_LAVAGGIO) d.dubbio = `lavaggio da ${eur(d.importo)}, sopra ${eur(TETTO_LAVAGGIO)}`;
  if (d.dubbio && avvisi) avvisi.push({ tipo: 'spesa', testo: `🧾 ${ctx.nome}: ${d.dubbio}.` });
}
function correggi(sp, testo, ctx) {
  const d = sp.dati, t = String(testo).toLowerCase(), fatto = [];
  const l = t.match(/(\d+(?:[.,]\d+)?)\s*(?:l\b|lt|litri)/); if (l && !d.cisterna) { d.litri = num(l[1]); fatto.push('litri'); }
  const e = t.match(/(\d+(?:[.,]\d+)?)\s*(?:€|euro|eur)/) || (!l && t.match(/^\s*(\d+(?:[.,]\d+)?)\s*$/)); if (e && !d.cisterna) { d.importo = num(e[1]); fatto.push('importo'); }
  if (/incass/.test(t)) { d.pagato = 'inc'; fatto.push('pagato'); } else if (/miei|mia|mio|personal|propri/.test(t)) { d.pagato = 'mie'; fatto.push('pagato'); }
  const m = (ctx.flotta || []).find(x => t.includes(x.toLowerCase().split(' ')[0]) && t.includes(x.toLowerCase().split(' ').pop().slice(-3).toLowerCase())) || mezzoDaTarga(t, ctx.flotta);
  if (m && d.serve_mezzo) { d.mezzo = m; fatto.push('mezzo'); }
  const tipi = [['rif', /gasolio|diesel|benzina|rifornim/], ['adb', /adblue/], ['pas', /pasto|pranzo|cena|panino/], ['lav', /a pagamento|pagato io|pagat[oa] da me|non (era )?convenzion|lavagg/], ['spe:ped', /pedagg|autostrad|telepass/], ['spe:par', /parchegg/]];
  const nt = tipi.find(([, r]) => r.test(t));
  if (nt && !d.cisterna) {
    const [k, voce] = nt[0].split(':'), vecchi = { foto1: d.foto1, importo: d.importo, litri: d.litri, esercente: d.esercente, pagato: d.pagato, mezzo: d.mezzo };
    if (k !== sp.tipo || (voce || '') !== sp.voce) { const ns = nuova(k, ctx, sp.n, voce); if (sp.tipo === 'lvm') { vecchi.importo = null; ns.dati.serve_foto = false; } Object.assign(ns.dati, Object.fromEntries(Object.entries(vecchi).filter(([, x]) => x != null))); if (d.scontrino) ns.dati.importo = d.scontrino; sp = ns; fatto.push('tipo'); }
  }
  return { sp, fatto };
}
function passo(sp, ev, ctx) {
  const out = [], scritture = [], avvisi = [];
  const res = () => ({ sp, messaggi: out, scritture, avvisi });
  const [pre, p, v] = ev.tipo === 'tap' ? String(ev.data).split('|') : [];
  const n = () => (ctx.n_registrazioni || 0) + 1;
  if (ev.tipo === 'menu') { sp = { n: n(), passo: 'menu', dati: {} }; out.push(menu()); return res(); }
  if (!sp && ev.tipo === 'testo') {
    const it = ev.intento || {}, k = { rifornimento: 'rif', cisterna: 'cis', adblue: 'adb', pasto: 'pas', lavaggio: 'lav', pedaggio: 'spe:ped', parcheggio: 'spe:par' }[it.intento];
    if (!k) { sp = { n: n(), passo: 'menu', dati: {} }; out.push(menu()); return res(); }
    const [kk, voce] = k.split(':'); sp = nuova(kk, ctx, n(), voce);
    if (num(it.importo) > 0 && !sp.dati.cisterna) sp.dati.importo = num(it.importo);
    if (num(it.litri) > 0 && !sp.dati.cisterna) sp.dati.litri = num(it.litri);
    if (it.pagato === 'incasso') sp.dati.pagato = 'inc'; else if (it.pagato === 'miei') sp.dati.pagato = 'mie';
    if (kk === 'pas' && (ctx.pasti_oggi || 0) >= MAX_PASTI) { out.push({ testo: `⚠️ Hai già registrato ${MAX_PASTI} pasti oggi: il limite è ${MAX_PASTI} al giorno.` }); sp = null; return res(); }
    avanti(sp, ctx, out); return res();
  }
  if (!sp && ev.tipo === 'foto') {
    if (ctx.foto_viste && ev.file_uid && ctx.foto_viste.includes(ev.file_uid)) { out.push({ testo: '⚠️ Questa foto l\'ho già registrata.' }); return res(); }
    const c = capisci(ev.lettura);
    if (!c) { sp = { n: n(), passo: 'menu', dati: { foto_in_attesa: ev } }; out.push(menu('Ho la foto ma non capisco cos\'è. Cosa registro?')); return res(); }
    if (c.k === 'pas' && (ctx.pasti_oggi || 0) >= MAX_PASTI) { out.push({ testo: `⚠️ Hai già registrato ${MAX_PASTI} pasti oggi: il limite è ${MAX_PASTI} al giorno.` }); return res(); }
    sp = nuova(c.k, ctx, n(), c.voce); sp.passo = 'foto';
    return passo(sp, ev, ctx);
  }
  if (!sp) return res();
  if (ev.tipo === 'tap' && (pre !== 'RS' || p !== sp.passo.replace(/2$/, ''))) { out.push({ avviso_tap: 'Già registrato ✅' }); return res(); }
  const d = sp.dati;
  if (ev.tipo === 'foto' && !['foto', 'foto2'].includes(sp.passo)) { sp = null; return passo(null, ev, ctx); }
  switch (sp.passo) {
    case 'menu': {
      if (v === 'spe') { sp.passo = 'tipo'; sp.dati = { foto_in_attesa: d.foto_in_attesa }; out.push({ testo: 'Che spesa?', bottoni: B('tipo', [['🛣️ Pedaggio', 'ped'], ['🅿️ Parcheggio', 'par']], [['✈️ Parcheggio aeroporto', 'apt'], ['💳 Tessera', 'tes']], [['🔧 Manutenzione', 'man'], ['🧾 Altro', 'gen']]) }); break; }
      if (v === 'pas' && (ctx.pasti_oggi || 0) >= MAX_PASTI) { out.push({ testo: `⚠️ Hai già registrato ${MAX_PASTI} pasti oggi: il limite è ${MAX_PASTI} al giorno.` }); sp = null; break; }
      const nv = nuova(v, ctx, sp.n); if (!nv) break;
      const attesa = d.foto_in_attesa; sp = nv;
      if (attesa) { sp.passo = 'foto'; return passo(sp, attesa, ctx); }
      avanti(sp, ctx, out); break;
    }
    case 'tipo': {
      if (!SPESE[v]) break;
      const attesa = d.foto_in_attesa; sp = nuova('spe', ctx, sp.n, v);
      if (attesa) { sp.passo = 'foto'; return passo(sp, attesa, ctx); }
      avanti(sp, ctx, out); break;
    }
    case 'foto': case 'foto2': {
      if (ev.tipo !== 'foto') {
        if (ev.tipo === 'testo' && !d.cisterna && /senza|non (ce|c'è|ho)|perso/i.test(ev.testo)) { d.serve_foto = false; d.senza_foto = true; avanti(sp, ctx, out); break; }
        out.push({ testo: d.cisterna ? '📸 Mi serve la foto del contatore: è obbligatoria.' : '📸 Mi serve la foto dello scontrino (se non ce l\'hai scrivimi «senza scontrino»).' }); break;
      }
      if (ctx.foto_viste && ev.file_uid && ctx.foto_viste.includes(ev.file_uid)) { out.push({ testo: '⚠️ Questa foto l\'ho già registrata. Mandami quella giusta.' }); break; }
      const L = ev.lettura || {};
      if (d.cisterna) {
        const val = C.lettura(L.contatore);
        if (val === null) { out.push({ testo: 'Non riesco a leggere il contatore: rifai la foto più vicina, con le tre cifre ben visibili.' }); break; }
        const m = mezzoDaTarga(L.targa, ctx.flotta); if (m) d.mezzo = m;
        if (sp.passo === 'foto') { d.foto1 = ev.link; d.file_uid = ev.file_uid || ''; d.prima = val; avanti(sp, ctx, out); break; }
        d.foto2 = ev.link; d.file_uid2 = ev.file_uid || ''; d.dopo = val;
        const k = C.controlla(d.prima, d.dopo, ctx.cisterna_ultima_dopo, null);
        d.litri = k.litri; completa(sp, ctx);
        k.avvisi.forEach(a => avvisi.push({ tipo: 'cisterna', testo: `🛢️ ${ctx.nome}: ${a.testo}.` }));
        if (k.avvisi.some(a => a.tipo === 'zero' || a.tipo === 'troppi')) d.dubbio = k.avvisi.filter(a => a.tipo === 'zero' || a.tipo === 'troppi').map(a => a.testo).join('; ');
        avanti(sp, ctx, out); break;
      }
      daFoto(sp, ev, ctx, out, avvisi); avanti(sp, ctx, out); break;
    }
    case 'litri': { const l = num(ev.testo); if (!l || l <= 0 || l > 120) { out.push({ testo: 'Scrivimi solo il numero dei litri (es. 45,2).' }); break; } d.litri = l; completa(sp, ctx, avvisi); avanti(sp, ctx, out); break; }
    case 'importo': { const x = num(ev.testo); if (!x || x <= 0 || x > 2000) { out.push({ testo: 'Scrivimi solo l\'importo (es. 12,50).' }); break; } d.importo = x; completa(sp, ctx, avvisi); avanti(sp, ctx, out); break; }
    case 'mezzo2': { const i = /^m(\d+)$/.exec(v || ''); if (!i || !(ctx.flotta || [])[+i[1]]) break; d.mezzo = ctx.flotta[+i[1]]; avanti(sp, ctx, out); break; }
    case 'correzione': {
      if (ev.tipo !== 'testo') break;
      const r = correggi(sp, ev.testo, ctx); sp = r.sp;
      if (!r.fatto.length) { out.push({ testo: 'Non ho capito cosa cambiare. Scrivimi per esempio «80 euro», «40 litri», «era un pasto», «con l\'incasso».' }); sp.passo = 'correzione'; break; }
      completa(sp, ctx, avvisi); avanti(sp, ctx, out); break;
    }
    case 'conferma':
      if (ev.tipo === 'testo') { const r = correggi(sp, ev.testo, ctx); sp = r.sp; if (r.fatto.length) { completa(sp, ctx, avvisi); avanti(sp, ctx, out); } else out.push({ testo: 'Tocca un bottone qui sopra, oppure scrivimi cosa correggere.' }); break; }
      if (v === 'no') { out.push({ testo: '❌ Annullato, non ho registrato niente.' }); sp = null; break; }
      if (v === 'cor') { sp.passo = 'correzione'; out.push({ testo: d.cisterna ? 'Rimandami le due foto del contatore, prima e dopo.' : 'Cosa cambio? Scrivimi per esempio «80 euro», «40 litri», «era un pasto».' }); if (d.cisterna) { sp = nuova('cis', ctx, sp.n); avanti(sp, ctx, out); } break; }
      if (v === 'alt') { sp.passo = 'mezzo2'; d.mezzo = null; out.push({ testo: 'Su quale mezzo?', bottoni: B('mezzo', ...coppie(ctx.flotta)) }); break; }
      if (v === 'inc' || v === 'mie') d.pagato = v;
      if (!['ok', 'inc', 'mie'].includes(v)) break;
      scritture.push(riga(sp, ctx)); sp.passo = 'salvataggio';
      if (sp.dati.senza_foto) avvisi.push({ tipo: 'spesa', testo: `🧾 ${ctx.nome}: ${sp.dati.tipologia} senza scontrino, ${eur(sp.dati.importo || 0)}${sp.dati.pagato === 'mie' ? ' (soldi suoi, da rimborsare)' : ''}.` });   // avviso solo se la registra davvero     // la conferma la manda il workflow dopo aver scritto
      break;
  }
  const ult = [...out].reverse().find(m => m.bottoni || (m.testo && !m.chat)); if (sp && ult) sp.ultimo = ult;
  return res();
}
return { passo, riga, virgola, capisci, mezzoDaTarga };
})();