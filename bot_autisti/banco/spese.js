// spese.js — spese, pasti, lavaggi, rifornimenti e cisterna, in qualsiasi momento della giornata. Funzione pura:
//   passo(sp, evento, ctx) -> { sp, messaggi, scritture, avvisi }
// sp = stato della registrazione in corso (sta nella sessione, non nella memoria del modello)
// evento: {tipo:'tap', data:'RS|<passo>|<v>'} | {tipo:'foto', link, file_uid, lettura:{...}} | {tipo:'testo', testo, intento?} | {tipo:'menu'}
// v2 (Agostino 21/10: «più intelligente, chiede solo conferma»): dalla foto il bot capisce da solo cos'è (scontrino di
// gasolio, pasto, pedaggio, contatore della cisterna...), legge la targa se si vede e propone tutto in un messaggio:
// l'autista conferma con un tap. Il menu esce solo se la foto non si capisce.
// La vision legge; il codice controlla (tetti, prezzo al litro, doppioni) e decide cosa chiedere.
// Le Tipologie sono quelle di oggi in Recap (le legge «Aggiungi Spese»): non cambiarle.
const C = typeof require !== 'undefined' ? require('./cisterna.js') : globalThis.CI;
const eur = x => (Math.round(x * 100) / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const virgola = x => (Math.round(x * 100) / 100).toFixed(2).replace('.', ',');              // locale italiano: decimali con la virgola
const B = (p, ...xs) => xs.map(r => r.map(([t, v]) => ({ text: t, callback_data: `RS|${p}|${v}`.slice(0, 64) })));
const TETTO_PASTO = 10, MAX_PASTI = 2, TETTO_LAVAGGIO = 100;                                    // regole di oggi, ora nel codice
const PREZZO_L = [1.2, 2.4];
const SPESE = { ped: 'Pedaggio', par: 'Parcheggio', apt: 'Parcheggio Aeroporto', tes: 'Tessera/Abbonamento', man: 'Manutenzione', gen: 'Spesa Generica' };
const num = v => { const n = parseFloat(String(v ?? '').replace(/[^\d,.-]/g, '').replace(',', '.')); return isNaN(n) ? null : n; };
const ICONA = { 'Rifornimento da stazione di servizio': '⛽', 'Rifornimento da cisterna interna': '🛢️', AdBlue: '💧', Pasto: '🍝', 'Lavaggio non convenzionato': '🧽', 'Lavaggio convenzionato Mancini': '🧽', 'Spesa Varia': '🧾' };

const menu = t => ({ testo: t || 'Cosa registro?', bottoni: B('menu', [['⛽ Distributore', 'rif'], ['🛢️ Cisterna', 'cis']], [['🍝 Pasto', 'pas'], ['🧽 Lavaggio', 'lav']], [['🧾 Altra spesa', 'spe'], ['💧 AdBlue', 'adb']]) });

// targa letta sulla foto -> mezzo della flotta (Veicoli di Programma Autisti 2.0)
const pulisci = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function mezzoDaTarga(targa, flotta) {
  const t = pulisci(targa); if (t.length < 5) return null;
  return (flotta || []).find(m => pulisci(m).endsWith(t) || pulisci(m).includes(t)) || null;
}
// cosa dice la foto -> che registrazione è (null = non si capisce, si chiede)
function capisci(L) {
  if (!L) return null;
  if (L.tipo === 'contatore' || C.lettura(L.contatore) !== null) return { k: 'cis' };
  // mezzo fotografato all'autolavaggio (senza scontrino) = lavaggio convenzionato Mancini, gratuito (regola di Rendicontazione)
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
// una frase sola con tutto quello che ho capito, e i bottoni per confermare
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
// legge i dati della foto nello scontrino in corso (il codice controlla, la vision ha solo letto)
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
// correzione a parole: «sono 80 euro», «40 litri», «era un pasto», «con l'incasso» — la legge il codice
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
  // testo libero già capito dal modello (intento + importo/litri): si parte da lì, poi serve comunque la foto
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
  // foto senza nessuna registrazione aperta: capisco da solo cos'è
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
  // una foto nuova mentre si conferma: se è un altro scontrino, si riparte da quello
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
if (typeof module !== 'undefined') module.exports = { passo, riga, virgola, capisci, mezzoDaTarga };
