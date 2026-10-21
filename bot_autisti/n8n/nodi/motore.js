// Motore: un evento -> il passo giusto del copione (chiusura RA, apertura RP, spese RS, decisioni di Agostino AG).
// (in testa a questo nodo c'è il pacchetto dei moduli: C chiusura, A apertura, SP spese, I incassi)
const AGOSTINO = '522233722';
const PROVA = true;                                       // fase di prova: si scrive solo nelle tabelle RA, mai su fogli veri
const ev = { ...$('Decidi').first().json };
// vocale: si usa la trascrizione come testo scritto (e si dice all'autista cosa si è capito)
let trascritto = null;
if (ev.tipo === 'vocale') { try { trascritto = $('Testo dal vocale').first().json.testo || ''; } catch (e) { trascritto = ''; } ev.tipo = trascritto ? 'testo' : 'vocale_vuoto'; ev.testo = trascritto; }
const righe = $('Leggi sessione').all().map(i => i.json).filter(r => r && r.chat);
let st = {}; try { st = righe.length ? JSON.parse(righe[0].stato || '{}') : {}; } catch (e) { st = {}; }
let foto = null; try { foto = $('Lettura foto').first().json; } catch (e) { foto = null; }
let nuovo = null; let giornataLetta = false; try { $('Moox giro').first(); giornataLetta = true; } catch (e) { giornataLetta = false; }
if (giornataLetta) nuovo = preparaGiornata().ctx;
if (nuovo) st.ctx = nuovo;
const ctx = st.ctx || null;
st.reg = st.reg || [];                                     // registrazioni spese del giorno: contatori e doppioni foto
const out = [], avvisi = [], scritture = [];
const ora = new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
const evento = ev.tipo === 'tap' ? { tipo: 'tap', data: ev.data }
  : ev.tipo === 'foto' ? { tipo: 'foto', link: 'tg:' + ev.file_id, file_uid: ev.file_uid, testo: ev.testo, lettura: foto || {} }
  : ev.tipo === 'testo' ? { tipo: 'testo', testo: ev.testo } : { tipo: ev.tipo };
const ctxSpese = () => ({ ...(ctx || {}), chat: ev.chat, n_registrazioni: st.reg.length, pasti_oggi: st.reg.filter(r => r.tipologia === 'Pasto').length, foto_viste: st.reg.flatMap(r => String(r.file_uid || '').split(',')).filter(Boolean), mezzo: (ctx && ctx.mezzo) || null, flotta: (ctx && ctx.flotta) || [], cisterna_ultima_dopo: st.cisterna_dopo || (ctx && ctx.cisterna_ultima_dopo) || null });
const ctxChiusura = () => ({ ...ctx, chat: ev.chat, oraTxt: ora, spese: st.reg.map(r => ({ tipo: r.tipologia, importo: r.importo, pagato: r.pagato })), incassi: { ...ctx.incassi, contanti_oggi: ctx.incassi.contanti_oggi } });
// chi ha fatto l'ultima domanda: il testo successivo va a lui (Agostino 21/10: «22,30» detto per le ore è finito nell'importo di una spesa lasciata aperta)
const usa = (r, flusso) => { out.push(...(r.messaggi || [])); avvisi.push(...(r.avvisi || [])); scritture.push(...(r.scritture || [])); if (flusso && (r.messaggi || []).some(x => x.testo)) st.ultimo_flusso = flusso; };
const attendeTesto = s => s && ['ore_testo', 'ore_motivo', 'pos', 'prob_testo', 'km', 'litri', 'importo', 'danni_foto'].includes(s.passo);
const attendeFoto = s => s && ['km', 'prob_testo', 'danni_foto', 'foto', 'foto2'].includes(s.passo);
const senzaGiornata = () => out.push({ testo: 'Non trovo servizi per questa giornata. ' + ((ctx && ctx.avvisi_dati) || []).join(' · ') });

if (trascritto) out.push({ testo: `🎙️ <i>«${trascritto.replace(/[<>&]/g, '').slice(0, 300)}»</i>` });
if (ev.tipo === 'vocale_vuoto') out.push({ testo: 'Non riesco a capire il vocale: me lo scrivi?' });
else if (ev.tipo === 'nulla') out.push({ testo: 'Posso leggere messaggi scritti, vocali e foto: mandami uno di questi.' });
else if (ev.tipo === 'comando') {
  const c = ev.comando;
  if (c === 'annulla') { st.spesa = null; out.push({ testo: 'Ok, annullato.' }); }
  else if (c === 'prova') {                              // la prova carica solo la giornata: la chiusura parte quando l'autista dice che ha finito (Agostino 21/10)
    st.spesa = null; st.chiusura = null; st.apertura = null; st.ultimo_flusso = null;
    if (!ctx || !ctx.servizi.length) senzaGiornata();
    else { const sv = ctx.servizi.slice().sort((a, b) => String(a.Time).localeCompare(String(b.Time)));
      out.push({ testo: `🧪 Prova: sei <b>${ctx.nome}</b>, giornata ${ctx.giorno.split('-').reverse().slice(0, 2).join('/')} — ${sv.length} servizi, dal primo alle ${sv[0].Time} all'ultimo alle ${sv[sv.length - 1].Time}.\nScrivimi come faresti da autista (anche vocali e foto). /chiusura e /apertura partono subito.` });
      if (ctx.avvisi_dati.length) out.push({ testo: '<i>Nota per la prova: ' + ctx.avvisi_dati.join(' · ') + '</i>' }); }
  }
  else if (c === 'chiusura') {
    if (!ctx || !ctx.servizi.length) senzaGiornata();
    else { st.chiusura = null; const r = C.passo(null, { tipo: 'avvio' }, ctxChiusura()); st.chiusura = r.sessione; usa(r, 'chiusura');
      if (ctx.avvisi_dati.length) out.push({ testo: '<i>Nota per la prova: ' + ctx.avvisi_dati.join(' · ') + '</i>' }); }
  } else if (c === 'apertura') {
    if (!ctx || !ctx.servizi.length) senzaGiornata();
    else { st.apertura = null; const r = A.passo(null, { tipo: 'avvio' }, ctx); st.apertura = r.ap; usa(r, 'apertura'); }
  } else if (c === 'spesa') { const r = SP.passo(null, { tipo: 'menu' }, ctxSpese()); st.spesa = r.sp; usa(r, 'spesa'); }
  else out.push({ testo: 'Comandi di prova: /prova Nome Cognome gg/mm · /chiusura · /apertura · /spesa · /annulla' });
} else if (ev.tipo === 'tap') {
  const pre = ev.data.split('|')[0];
  if (pre === 'RA' && st.chiusura) { const r = C.passo(st.chiusura, evento, ctxChiusura()); st.chiusura = r.sessione; usa(r, 'chiusura'); }
  else if (pre === 'RP' && st.apertura) { const r = A.passo(st.apertura, evento, ctx); st.apertura = r.ap; usa(r, 'apertura'); }
  else if (pre === 'RS' && st.spesa) { const r = SP.passo(st.spesa, evento, ctxSpese()); st.spesa = r.sp; usa(r, 'spesa'); }
  else if (pre === 'AG' && ev.da_id === AGOSTINO) {
    const [, cosa, esito, chat, giorno] = ev.data.split('|');
    scritture.push({ dove: 'decisione_agostino', rif: `${cosa}-${chat}-${giorno}`, cosa, esito, chat, giorno });
    out.push({ testo: esito === 'ok' ? '✅ Approvato. Registrato.' : '❌ Rifiutato: si pagano le ore Moox. Registrato.' });
    if (chat !== ev.chat) out.push({ chat, testo: esito === 'ok' ? `✅ Agostino ha approvato le tue ore del ${giorno.split('-').reverse().slice(0, 2).join('/')}.` : `Agostino ha confermato le ore Moox per il ${giorno.split('-').reverse().slice(0, 2).join('/')}.` });
  } else out.push({ avviso_tap: 'Questo bottone non è più attivo' });
} else if (ev.tipo === 'foto') {
  // la foto dice da sola cos'è: scontrino/contatore -> spese; cruscotto -> km della chiusura o dell'apertura; danno -> problema
  const t = (foto && foto.tipo) || 'altro';
  const daSpesa = t === 'scontrino' || t === 'contatore';
  if (st.spesa && (daSpesa || ['foto', 'foto2'].includes(st.spesa.passo))) { const r = SP.passo(st.spesa, evento, ctxSpese()); st.spesa = r.sp; usa(r, 'spesa'); }
  else if (!daSpesa && attendeFoto(st.chiusura)) { const r = C.passo(st.chiusura, evento, ctxChiusura()); st.chiusura = r.sessione; usa(r, 'chiusura'); }
  else if (!daSpesa && st.apertura && (attendeFoto(st.apertura) || st.apertura.passo === 'mezzo')) { const r = A.passo(st.apertura, evento, ctx); st.apertura = r.ap; usa(r, 'apertura'); }
  else if (t === 'danno') {
    const testo = `${foto.descrizione || 'danno'}${ev.testo ? ' — ' + ev.testo : ''}`;
    avvisi.push({ tipo: 'mezzo', urgente: true, testo: `🔧 <b>${(ctx && ctx.nome) || ev.nome_tg}</b> manda la foto di un danno${ctx && ctx.mezzo ? ' sul ' + ctx.mezzo.nome : ''}: ${testo}` });
    out.push({ testo: `Ricevuto: ${foto.descrizione || 'danno'}. L'ho passato subito ad Agostino.` });
  } else { const r = SP.passo(null, evento, ctxSpese()); st.spesa = r.sp; usa(r, 'spesa'); }
} else if (ev.tipo === 'testo') {
  // ogni testo l'ha già letto il modello («Capisci testo»): intento, orari, cifre, risposta. Il codice decide cosa farne.
  let it = {}; try { const r = $('Capisci testo').first().json; const tt = o => typeof o === 'string' ? [o] : Array.isArray(o) ? o.flatMap(tt) : (o && typeof o === 'object') ? Object.values(o).flatMap(tt) : []; const tx = tt(r).find(t => /\{[\s\S]*\}/.test(t)) || '';
    // il modello a volte si corregge e manda due JSON di fila (21/10, «ha già pagato?»): vale l'ultimo che si legge
    const objs = []; let dep = 0, ini = -1, str = false, esc = false;
    for (let i = 0; i < tx.length; i++) { const ch = tx[i];
      if (str) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') str = false; continue; }
      if (ch === '"') str = true; else if (ch === '{') { if (!dep++) ini = i; } else if (ch === '}' && dep && !--dep) objs.push(tx.slice(ini, i + 1)); }
    for (const o of objs.reverse()) { try { it = JSON.parse(o); break; } catch (e) {} } } catch (e) { it = {}; }
  // azione decisa dal modello (versione conversazione); le vecchie risposte con «intento» restano valide
  const SPESE = ['rifornimento', 'cisterna', 'adblue', 'pasto', 'lavaggio', 'pedaggio', 'parcheggio'];
  const az = it.azione || (SPESE.includes(it.intento) ? 'spesa' : it.intento === 'chiusura' ? 'avvia_chiusura' : it.intento === 'apertura' ? 'avvia_apertura' : it.intento === 'segnalazione' ? 'segnalazione' : it.intento === 'risposta' ? 'risposta' : 'chiacchiera');
  if (az === 'spesa' && !it.intento) it.intento = it.spesa;
  const campi = { inizio: it.inizio || null, fine: it.fine || null };
  const evT = { ...evento, campi, intento: it };
  const aperta = c => c && !['chiusa', 'salvataggio', 'fatto'].includes(c.passo);
  const risp = () => it.risposta ? out.push({ testo: String(it.risposta).slice(0, 1500) }) : null;
  const ripetiDomanda = () => {
    // si rimandano tutte le domande in sospeso (la spesa che aspetta la foto e la chiusura/apertura), con i loro bottoni; l'ultima toccata va in fondo
    const princ = aperta(st.chiusura) ? C.passo(st.chiusura, { tipo: 'ripeti' }, ctxChiusura()).messaggi : aperta(st.apertura) && st.apertura.ultimo ? [st.apertura.ultimo] : [];
    const sp = !st.spesa ? [] : ['foto', 'foto2'].includes(st.spesa.passo) ? [{ testo: st.spesa.dati && st.spesa.dati.cisterna ? '📸 Aspetto ancora la foto del contatore della cisterna.' : '📸 Aspetto ancora la foto dello scontrino (o /annulla).' }] : st.spesa.ultimo ? [st.spesa.ultimo] : [];
    const rip = st.ultimo_flusso === 'spesa' ? [...princ, ...sp] : [...sp, ...princ];
    rip.forEach(m => out.push(m.testo && !/^↩️/.test(m.testo) ? { ...m, testo: '↩️ ' + m.testo } : m));
  };
  const vuoleTesto = {
    spesa: () => st.spesa && (attendeTesto(st.spesa) || ['correzione', 'conferma', 'foto'].includes(st.spesa.passo)),
    chiusura: () => aperta(st.chiusura) && (attendeTesto(st.chiusura) || ['ore', 'ore_conf'].includes(st.chiusura.passo)),
    apertura: () => aperta(st.apertura) && attendeTesto(st.apertura) };
  const ordine = [st.ultimo_flusso, 'chiusura', 'apertura', 'spesa'].filter((x, i, a) => x && a.indexOf(x) === i);
  const chi = ordine.find(f => vuoleTesto[f] && vuoleTesto[f]());
  // risposta a parole a una domanda con bottoni («mezzo serbatoio» = [½]): vale solo un bottone che esiste davvero nella domanda in sospeso
  const inSospeso = () => { const f = st.ultimo_flusso === 'spesa' && st.spesa ? 'spesa' : aperta(st.chiusura) ? 'chiusura' : aperta(st.apertura) ? 'apertura' : st.spesa ? 'spesa' : null;
    const m = f === 'chiusura' ? C.passo(st.chiusura, { tipo: 'ripeti' }, ctxChiusura()).messaggi.find(x => x.bottoni) : f ? (st[f] || {}).ultimo : null; return m && m.bottoni ? { f, bottoni: m.bottoni.flat() } : null; };
  const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9¼½¾àèéìòù ]/g, '').trim();
  const sosp = it.bottone ? inSospeso() : null;
  const scelto = sosp && sosp.bottoni.find(b => norm(b.text) === norm(it.bottone)) || (sosp && sosp.bottoni.find(b => norm(b.text).includes(norm(it.bottone)) && norm(it.bottone).length >= 2));
  if (scelto) {
    const evB = { tipo: 'tap', data: scelto.callback_data };
    if (sosp.f === 'chiusura') { const r = C.passo(st.chiusura, evB, ctxChiusura()); st.chiusura = r.sessione; usa(r, 'chiusura'); }
    else if (sosp.f === 'apertura') { const r = A.passo(st.apertura, evB, ctx); st.apertura = r.ap; usa(r, 'apertura'); }
    else { const r = SP.passo(st.spesa, evB, ctxSpese()); st.spesa = r.sp; usa(r, 'spesa'); }
    out.unshift({ testo: `<i>→ ${scelto.text}</i>` });
  }
  else if (az === 'impara' && ev.da_id === AGOSTINO && it.nota) {
    scritture.push({ dove: 'memoria', nota: String(it.nota).slice(0, 500), chi: 'Agostino' });
    out.push({ testo: it.risposta ? String(it.risposta).slice(0, 600) : `Ok, me lo ricordo: «${String(it.nota).slice(0, 200)}».` }); ripetiDomanda();
  }
  else if (az === 'annulla' && st.spesa) { st.spesa = null; out.push({ testo: it.risposta || 'Ok, ho annullato la spesa a metà.' }); ripetiDomanda(); }
  else if (az === 'segnalazione') {
    avvisi.push({ tipo: it.mezzo ? 'mezzo' : 'segnalazione', urgente: true, testo: `📢 <b>${(ctx && ctx.nome) || ev.nome_tg}</b>: ${ev.testo}` });
    const rs = it.risposta ? String(it.risposta).slice(0, 600) : '';
    out.push({ testo: /agostino/i.test(rs) ? rs : (rs ? rs + '\n' : '') + 'L\'ho passato subito ad Agostino.' });   // l'avviso parte davvero (avvisi): una frase sola, non due
    ripetiDomanda();
  }
  else if (st.spesa && ['foto', 'foto2'].includes(st.spesa.passo) && /senza|non (ce|c'è|ce l'ho|ho)|perso/i.test(ev.testo || '')) {   // «non ho lo scontrino»: decide la spesa (Agostino 21/10: si registra segnata e lui viene avvisato)
    const r = SP.passo(st.spesa, evT, ctxSpese()); st.spesa = r.sp; usa(r, 'spesa');
  }
  else if (chi && (az === 'risposta' || (!it.risposta && az !== 'spesa'))) {          // risponde alla domanda in corso: decide il passo del copione
    if (chi === 'spesa') { const r = SP.passo(st.spesa, evT, ctxSpese()); st.spesa = r.sp; usa(r, 'spesa'); }
    else if (chi === 'chiusura') { const r = C.passo(st.chiusura, evT, ctxChiusura()); st.chiusura = r.sessione; usa(r, 'chiusura'); }
    else { const r = A.passo(st.apertura, evT, ctx); st.apertura = r.ap; usa(r, 'apertura'); }
  }
  else if (az === 'spesa' && SPESE.includes(it.intento)) { const r = SP.passo(null, evT, ctxSpese()); st.spesa = r.sp; usa(r, 'spesa'); if (!r.messaggi.length) risp(); }
  else if (az === 'avvia_chiusura' && !aperta(st.chiusura) && ctx && ctx.servizi.length) { st.chiusura = null; const r = C.passo(null, { tipo: 'avvio' }, ctxChiusura()); st.chiusura = r.sessione; usa(r, 'chiusura'); }
  else if (az === 'avvia_apertura' && !aperta(st.apertura) && ctx && ctx.servizi.length) { st.apertura = null; const r = A.passo(null, { tipo: 'avvio' }, ctx); st.apertura = r.ap; usa(r, 'apertura'); }
  else { if (!risp()) out.push({ testo: 'Ciao! Sono l\'assistente degli autisti: chiudo e apro la giornata con te, registro spese e rifornimenti (basta la foto dello scontrino o del contatore), ti dico i servizi di oggi e passo subito ad Agostino qualsiasi problema. Cosa ti serve?' }); ripetiDomanda(); }
}

// registrazioni spese chiuse: contatori del giorno e ultima lettura cisterna
for (const w of scritture) if (w.dove === 'recap') {
  st.reg.push({ rif: w.rif, tipologia: w.campi.Tipologia, importo: w.importo, pagato: w.pagato, file_uid: w.file_uid || '' });
  const m = String(w.campi.Descrizione).match(/contatore (\d{3}) → (\d{3})/); if (m) { st.cisterna_dopo = m[2]; scritture.push({ dove: 'evento_mezzo', tipo: 'cisterna', mezzo: w.campi.Mezzo, testo: `prima=${m[1]} dopo=${m[2]} litri=${w.campi.Litri}` }); }
}
// spesa lasciata a metà mentre la chiusura chiede delle spese: si ricorda, non si perde
if (st.spesa && st.chiusura && st.chiusura.passo === 'spese' && out.some(x => /Manca qualcosa\?/.test(x.testo || ''))) out.push({ testo: `⚠️ Hai lasciato a metà: <b>${st.spesa.dati && st.spesa.dati.tipologia || 'una spesa'}</b>. Scrivimi quello che manca (es. l'importo), oppure /annulla per toglierla.` });
let dopo = '';
if (st.spesa && st.spesa.passo === 'salvataggio') { st.spesa = null; if (st.chiusura && !['chiusa', 'salvataggio'].includes(st.chiusura.passo)) dopo = 'Torniamo alla chiusura della giornata: rispondi alla domanda qui sopra, oppure mandami un\'altra spesa.'; }
let chiusa = false;
if (st.chiusura && st.chiusura.passo === 'salvataggio') { st.chiusura.passo = 'chiusa'; chiusa = true; }
// problemi segnalati: diventano eventi aperti del mezzo (li ritrova l'apertura del giorno dopo)
for (const a of avvisi) if (a.tipo === 'mezzo' && a.urgente) scritture.push({ dove: 'evento_mezzo', tipo: 'problema', mezzo: (ctx && ctx.mezzo && ctx.mezzo.nome) || '', testo: a.testo.replace(/<[^>]+>/g, '').replace(/^[^:]*:\s*/, ''), stato: 'aperto' });

// in prova Agostino è anche l'autista: gli avvisi gli arrivano nella stessa chat, marcati
const messaggi = out.map(m => ({ chat: m.chat || ev.chat, ...m }));
for (const a of avvisi) messaggi.push({ chat: AGOSTINO, testo: (ev.chat === AGOSTINO ? '📣 <b>Per Agostino</b>\n' : '') + a.testo, bottoni: a.bottoni });
st.storia = (st.storia || []);
if (ev.tipo === 'testo' && ev.testo) st.storia.push({ u: ev.testo });
else if (ev.tipo === 'foto') st.storia.push({ u: `[foto: ${(foto && (foto.descrizione || foto.tipo)) || 'foto'}]` });
else if (ev.tipo === 'tap') st.storia.push({ u: `[tocca: ${ev.etichetta || ev.data}]` });
else if (ev.tipo === 'comando') st.storia.push({ u: '/' + ev.comando + ' ' + (ev.argomenti || []).join(' ') });
for (const x of out) if (x.testo && !x.chat) st.storia.push({ b: x.testo });
st.storia = st.storia.slice(-30);
st.aggiornato = new Date().toISOString();
return [{ json: { chat: ev.chat, autista: (ctx && ctx.autista) || '', giorno: (ctx && ctx.giorno) || '', row_id: ev.row_id, stato: JSON.stringify(st), messaggi, scritture: scritture.map(w => ({ ...w, chat: ev.chat, autista: (ctx && ctx.autista) || '', giorno: (ctx && ctx.giorno) || '', prova: PROVA })), chiusa, dopo,
  query_id: ev.query_id, msg_id: ev.msg_id, msg_testo: ev.msg_testo, etichetta: ev.etichetta, avviso_tap: (out.find(m => m.avviso_tap) || {}).avviso_tap || '' } }];
