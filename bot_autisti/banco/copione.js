// copione.js — chiusura della giornata: il copione con i bottoni. Funzione pura:
//   passo(sessione, evento, ctx) -> { sessione, messaggi: [{testo, bottoni}], scritture: [...], avvisi: [...] }
// sessione = riga della tabella «Sessioni autisti» (sopravvive a riavvii; niente memoria del modello)
// evento   = {tipo:'avvio'} | {tipo:'tap', data:'RA|<passo>|<valore>'} | {tipo:'testo', testo} | {tipo:'foto', lettura:{...}}
// ctx      = dati già letti dal workflow: autista, giorno, servizi, ore, incassi, spese, mezzo (nessuna lettura qui)
// Le scritture NON si fanno qui: il workflow le esegue, rilegge il foglio e solo dopo manda «salvato».
const I = typeof require !== 'undefined' ? require('./incassi.js') : globalThis.I;
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
// «8:10 18:40», «dalle 8.10 alle 18.40», «8-18:40» -> minuti; il codice legge, il modello non decide
// orari scritti dall'autista -> minuti. Prima i campi già capiti dal modello (inizio/fine «HH:MM»), poi il testo letto dal codice.
// «19,4» = 19:40; «ho finito alle 19:40» cambia solo la fine; «ho iniziato alle 7» solo l'inizio. Il resto resta quello proposto.
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
if (typeof module !== 'undefined') module.exports = { passo, leggiOrari, oltreSoglia };
