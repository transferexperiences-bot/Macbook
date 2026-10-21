// incassi.js — incassi della giornata di un autista. Funzioni pure, nessuna scrittura.
// Segue la skill contanti-consegnati (COME FUNZIONA, Agostino 08-13/10/2026) e la regola del 20/10:
// un solo riepilogo; non si chiedono i servizi a fattura o già chiusi; la carta si riscontra su SumUp;
// i contanti si mostrano soltanto (la consegna la registra Agostino con la skill, Show = "Si").
const SALTA = { 'Fattura': 'fattura', 'Sconto in fattura': 'fattura', 'Dalla struttura': 'struttura', 'Omaggio': 'omaggio' };
const ELETTR = ['Carta', 'Link'];
const r2 = x => Math.round(x * 100) / 100;
const num = v => { const n = parseFloat(String(v ?? '').replace(/[^\d,.-]/g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const ID_RE = /TR[\/-][A-Za-z0-9_\/-]+/;
const MIN = 6e4, ORA = 36e5, GG = 864e5;

// REGOLA ZERO: righe cancellate mai mostrate, contate o chieste (Hide si ignora: artefatto del ponte)
function cancellata(r) {
  const n = String(r.Note ?? '').toLowerCase();
  return /cancellat/i.test(String(r.Allert ?? '') + String(r.Autista ?? '')) || n.includes('cancellazione') || n.includes('cancellato il') || String(r.Id ?? '').includes('-DUP');
}
const chiuso = v => ['si', 'sì', 'true'].includes(String(v ?? '').trim().toLowerCase());
// punto 11: Tariffa − |Acconto|, e − |Fee| quando Stato % = Pagata
const importo = r => r2(num(r.Tariffa) - Math.abs(num(r.Acconto)) - (String(r['Stato %'] ?? '').trim().toLowerCase() === 'pagata' ? Math.abs(num(r.Fee)) : 0));
// punto 12: «il driver incassa N (in contanti / con link)» nelle Note di qualunque riga
function incassoNote(r) {
  const n = String(r.Note ?? ''), m = n.match(/incassa(?:re|to)?\s+(?:€\s*)?(\d+(?:[.,]\d+)?)/i);
  if (/nulla da incassare|paga la struttura/i.test(n)) return null;
  if (m) return { importo: num(m[1]), tipo: /link|carta|pos/i.test(n) && !/contant/i.test(n) ? 'elettronico' : 'contanti' };
  if (/incassato in contanti/i.test(n)) return { importo: null, tipo: 'contanti' };
  return null;
}
const oraServ = (iso, time) => { const h = String(time ?? '').match(/(\d{1,2})[:.](\d{2})/); return Date.parse(`${iso}T${h ? h[1].padStart(2, '0') + ':' + h[2] : '12:00'}:00+02:00`); };

// Riconciliazione carta/link di TUTTI gli autisti insieme (SumUp è un conto unico: una transazione vale una volta sola).
// servizi: [{r: riga gestionale, iso: 'AAAA-MM-GG'}]; sumup: transazioni (anche dei giorni prima);
// usate: id di transazioni già abbinate nel tab SumUp del gestionale; gruppi: {autista: gruppo id Telegram} per i link firmati
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
  // Link da 7 giorni prima a 1 giorno dopo; Carta lo stesso giorno (da 2 ore prima fino alle 04:00 della notte dopo)
  const fineGiorno = iso => Date.parse(`${iso}T23:59:59+02:00`) + 4 * ORA;
  const vale = (t, x) => (!t.firma || String(gruppi[x.autista] || '') === t.firma) &&
    (x.mod === 'Link' ? t.ts >= x.t - 7 * GG && t.ts <= x.t + GG : t.ts >= x.t - 2 * ORA && t.ts <= fineGiorno(x.iso));
  const vicina = (c, t0) => c.slice().sort((a, b) => (b.firma ? 1 : 0) - (a.firma ? 1 : 0) || Math.abs(a.ts - t0) - Math.abs(b.ts - t0))[0];
  const ug = (a, b) => Math.abs(a - b) <= 0.5;
  // 1. transazione con l'Id della riga
  for (const x of aperti()) { const t = tx.find(t => !U.has(t.id) && t.rif === x.id); if (t) prendi([x], [t], 'Id'); }
  // a. transazione singola dello stesso importo (prima i link firmati dall'autista, poi la più vicina all'orario)
  for (const x of aperti()) { const c = libere().filter(t => ug(Number(t.amount), x.imp) && vale(t, x)); if (c.length) prendi([x], [vicina(c, x.t)], 'importo'); }
  // b. una transazione per 2-4 corse dello stesso cliente o dello stesso autista nello stesso giorno
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
  // c. pagamento diviso: 2-3 transazioni dello stesso tipo a pochi minuti l'una dall'altra che sommano la corsa
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
  // e/f. non chiuso: POS più piccoli dopo l'orario (misto contanti + POS) o importo vicino ma diverso -> si chiede, con l'indizio
  for (const x of aperti()) {
    const pos = libere().filter(t => t.payment_type === 'POS' && t.ts >= x.t - 30 * MIN && t.ts <= x.t + 6 * ORA && Number(t.amount) < x.imp);
    const vic = libere().filter(t => t.ts >= x.t - 30 * MIN && t.ts <= x.t + 3 * ORA && !ug(Number(t.amount), x.imp) && Math.abs(Number(t.amount) - x.imp) <= 30);
    esito[x.id] = { esito: 'chiedi', motivo: 'non trovato su SumUp', indizio: pos.length ? 'misto' : vic.length ? 'importo diverso' : '', trovati: (pos.length ? pos : vic).slice(0, 3).map(t => ({ importo: Number(t.amount), ora: new Date(t.ts).toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }), tipo: t.payment_type })) };
  }
  return { esito, usate: [...U] };
}

// Riepilogo della giornata di un autista. righeOggi: sue righe del giorno; esitiCarta: riconcilia(...).esito;
// righeAperte: sue righe dei giorni prima (ultimi 30) per i contanti ancora da consegnare
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
// testi (generati dal codice, mai dal modello)
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
// domanda sul pagamento non trovato: testo della skill (punto 9), senza accuse, una sola per autista
function testoVerificaPOS(nome, xs) {
  const righe = xs.map(x => `• ${x.ora} ${x.tratta}, ${x.cliente}, ${eur(x.importo)} (segnato ${x.modalita})` + (x.trovati && x.trovati.length ? ` — ho trovato ${x.trovati.map(t => `${t.tipo} ${eur(t.importo)} alle ${t.ora}`).join(', ')}` : ''));
  return `Sul POS/link non troviamo questi pagamenti:\n${righe.join('\n')}\nMi confermi l'importo esatto, l'ora e con quale POS o link è stato pagato? Se è stato pagato insieme ad altre corse o in contanti dimmelo. Grazie!`;
}
if (typeof module !== 'undefined') module.exports = { cancellata, importo, incassoNote, riconcilia, riepilogo, testoRiepilogo, testoVerificaPOS, eur, num };
