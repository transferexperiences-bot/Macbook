// =====================================================================
// Tool - Rientro (f3Y46avI5O8dEnYn) — nodo "Trova Rientro"
// =====================================================================
//
// COSA CAMBIA, E PERCHÉ (17/08/2026).
//
// Le tre regole del rientro stavano solo nella *descrizione* del tool, cioè in
// parole rivolte al modello. È esattamente la cosa che CLAUDE.md vieta: quello
// che conta va prodotto dal codice. Qui vengono messe nel codice.
//
// 1) UN RIENTRO È SEMPRE UNA RIGA NUOVA, CON UN Id NUOVO.
//    Prova: esecuzione 742264 del 16/08 15:31. Una richiesta di rientro è
//    diventata la MODIFICA dell'andata: chiamato cerca_servizi invece di
//    tool_rientro, riusato l'Id TR/07082026/SSD1XU4R9NS80YGD con
//    intent: modifica, ereditati autista (Giovanni Vito Antonio) e veicolo.
//    La scrittura è avvenuta davvero (Parse transfer, esecuzione 742281).
//    Ora il nodo dichiara `intent: 'nuovo'` come dato, mette l'Id dell'andata
//    in un campo che si chiama `id_andata_solo_riferimento`, e ogni ramo di
//    uscita porta la stessa riga ⛔ generata dal codice, non scritta a mano
//    nella descrizione.
//
// 2) AUTISTA E VEICOLO RESTANO VUOTI.
//    Chi porta all'andata non è detto che faccia il ritorno. Il nodo non legge
//    MAI r['Autista'] / r['Veicolo'] dell'andata: li prende solo dai nuovi
//    input `autista` e `veicolo`, cioè solo se Agostino li ha detti adesso.
//    Se sono vuoti non finiscono nemmeno nel recap, così il parser di
//    Parse transfer li lascia vuoti (regola sua: campo mancante -> "").
//
// 3) LA DESTINAZIONE CHE DICE AGOSTINO VINCE.
//    Questa non era «da rafforzare»: non era implementata. Non esisteva un
//    input `destinazione` e la meta era SEMPRE dedotta girando l'andata.
//    Prova: esecuzione 741981 del 16/08 12:32.
//      query: "aggiungo rientro da Sabbiadoro per il Serafini alle 18.30"
//      uscita: Per = "Bari Airport"
//    Agostino aveva detto «per il Serafini» e il codice non l'ha nemmeno
//    guardato. Ora c'è l'input `destinazione`, e in mancanza di quello la
//    destinazione si legge dalla frase originale. Quella detta vince sempre
//    su quella dedotta, e la scelta viene scritta negli avvisi.
//
// Cosa NON è cambiato: il nodo continua a non salvare niente, la modalità si
// decide come dal 12/08, i candidati multipli li sceglie Agostino con i bottoni.
//
// Banco: banchi/te/banco-rientro.js (dati veri di 741981 e 742264).
// Per tornare indietro: restore_workflow_version f3Y46avI5O8dEnYn
// versione 43ba2bc1-62ca-4623-9b29-7edc2980b183.

// La modalità del rientro NON è quella dell'andata (regola di Agostino, 12/08/2026).
// Se l'andata è in fattura il rientro segue la fattura. Ma se sull'andata hai già incassato
// (contanti, carta, link), sul rientro c'è da incassare di nuovo: si scrive «Incassare».
// Valori veri della colonna Modalità: Contanti 235 · Fattura 206 · Incassare 128 · Carta 111 ·
// Sconto in fattura 104 · Dalla struttura 12 · «Al ritorno» 6 · Link 3 · casi a mano.
function modalitaRientro(mod) {
  const m = String(mod == null ? '' : mod).trim();
  const s = m.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!s) return { valore: '', motivo: 'sull\'andata non c\'e la modalita: la scrivi tu' };
  if (/(^|\b)(fattura|sconto in fattura|dalla struttura|bonifico|invoice)/.test(s)) {
    return { valore: m, motivo: 'modalita da fatturare: copiata tale e quale dall\'andata' };
  }
  if (/(contant|carta|card|link|pos\b|bancomat|cash|paypal|sumup|satispay)/.test(s)) {
    return { valore: 'Incassare', motivo: 'sull\'andata hai gia incassato (' + m + '): sul rientro c\'e da incassare' };
  }
  if (/al ritorno/.test(s)) {
    return { valore: 'Incassare', motivo: 'sull\'andata era segnato «al ritorno»: si incassa su questo rientro' };
  }
  if (/incassare/.test(s)) return { valore: 'Incassare', motivo: 'da incassare, come l\'andata' };
  return { valore: m, motivo: 'modalita fuori standard («' + m + '»): copiata tale e quale, controllala' };
}

// === Tool - Rientro :: nodo "Trova Rientro" ===
// "inserisci rientro da Sabbiadoro alle 17" → cerca i transfer ARRIVATI a Sabbiadoro
// (oggi, al massimo ieri), e prepara il transfer inverso conservando nome, cellulare,
// pax, fornitore, modalità e tariffa. Non salva niente: prepara e basta.

const trig = ($('Trigger Rientro').first().json) || {};
let righe = [];
try { righe = $('Leggi Prenotazioni NCC 3.0').all().map(r => r.json || {}); } catch (e) { righe = []; }

// ---------- utilità ----------
const norm = (s) => String(s == null ? '' : s)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const SINONIMI = [
  ['apt', 'aeroporto', 'airport', 'aereoporto'],
  ['bari', 'bri'], ['brindisi', 'bds'],
  ['staz', 'stazione', 'station'],
];
function espandi(t) {
  for (const gruppo of SINONIMI) if (gruppo.indexOf(t) !== -1) return gruppo;
  return [t];
}
// Due luoghi "si somigliano" solo su parole intere significative (>=3 lettere) e
// confronto per inizio parola. Le paroline come "a", "di", "il" non contano mai:
// altrimenti la "a" di «Polignano a Mare» finirebbe dentro «bari» e proporrebbe
// transfer che non c'entrano niente.
function luogoCombacia(cella, cercato) {
  const a = norm(cella), b = norm(cercato);
  if (!a || !b) return false;
  if (a === b) return true;
  if (b.length >= 4 && a.indexOf(b) !== -1) return true;
  if (a.length >= 4 && b.indexOf(a) !== -1) return true;
  const tokA = a.split(' ').filter(x => x.length >= 3);
  const tokB = b.split(' ').filter(x => x.length >= 3);
  if (!tokA.length || !tokB.length) return false;
  return tokB.every(t => espandi(t).some(v => tokA.some(x =>
    x === v ||
    (v.length >= 4 && x.indexOf(v) === 0) ||
    (x.length >= 4 && v.indexOf(x) === 0)
  )));
}

const due = (n) => String(n).padStart(2, '0');
function fmtIT(d) { return due(d.getDate()) + '/' + due(d.getMonth() + 1) + '/' + d.getFullYear(); }
function oggiRoma() {
  const s = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' }); // YYYY-MM-DD
  const p = s.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}
function piuGiorni(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
// Stessa lettura delle date usata da Ricerca Servizi: sul gestionale la Data è
// scritta a parole ("mer 5 agosto 2026"), non in numeri.
const MESI = { gennaio:0,febbraio:1,marzo:2,aprile:3,maggio:4,giugno:5,luglio:6,agosto:7,
  settembre:8,ottobre:9,novembre:10,dicembre:11,gen:0,feb:1,mar:2,apr:3,mag:4,giu:5,
  lug:6,ago:7,set:8,ott:9,nov:10,dic:11 };
function parseDataIT(v, annoDiRipiego) {
  const s = String(v == null ? '' : v).toLowerCase().trim();
  if (!s) return null;
  let m = s.match(/(\d{1,2})\s+([a-zà-ÿ]+)\s+(\d{4})/);
  if (m && MESI[m[2]] !== undefined) return new Date(Number(m[3]), MESI[m[2]], Number(m[1]));
  m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) { let a = Number(m[3]); if (a < 100) a += 2000; return new Date(a, Number(m[2]) - 1, Number(m[1])); }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // riga senza anno ("mar 04 agosto"): uso l'anno di riferimento e lo segnalo
  m = s.match(/(\d{1,2})\s+([a-zà-ÿ]+)\s*$/);
  if (m && MESI[m[2]] !== undefined && annoDiRipiego) {
    const d = new Date(annoDiRipiego, MESI[m[2]], Number(m[1]));
    d.__annoDedotto = true;
    return d;
  }
  return null;
}
function normOra(v) {
  const s = String(v == null ? '' : v).trim();
  let m = /^(\d{1,2})[:.](\d{2})/.exec(s);
  if (m) { const h = Number(m[1]); if (h >= 0 && h <= 23) return due(h) + ':' + m[2]; return ''; }
  m = /^(\d{1,2})$/.exec(s);
  if (m) { const h = Number(m[1]); if (h >= 0 && h <= 23) return due(h) + ':00'; }
  return '';
}

// (3) La destinazione detta da Agostino. Si legge dalla frase originale quando
// non arriva già pronta nell'input `destinazione`.
// Attenzione ai falsi positivi: in «per le 18.30» dopo "per" c'è un orario, non
// un luogo, e in «per favore» non c'è niente. Si scarta tutto ciò che comincia
// con una cifra o con una parola che non è un posto.
const NON_LUOGHI = /^(le|la|il|lo|l|i|gli|favore|cortesia|ora|adesso|oggi|domani|ieri|stasera|stamattina|rientro|ritorno|andata|piacere|caso|ora\b)$/i;
function estraiDestinazione(txt) {
  if (!txt) return '';
  const m = /\b(?:per|verso|fino a|direzione|destinazione|riportal[oaie]\s+a|riportare\s+a|riportarli\s+a)\s+(.+?)(?:\s+(?:alle|all|ore|ora|oggi|domani|ieri|entro|verso le|con|senza)\b|[,;.]|$)/i.exec(txt);
  if (!m) return '';
  let c = m[1].trim();
  // via l'articolo iniziale: «per il Serafini» -> «Serafini»
  c = c.replace(/^(?:il|lo|la|l['’]|i|gli|le)\s*/i, '').trim();
  if (!c) return '';
  if (/^\d/.test(c)) return '';                       // «per le 18.30», «per il 20»
  if (NON_LUOGHI.test(c)) return '';                  // «per favore», «per ora»
  if (c.length < 2) return '';
  return c;
}

// ---------- 1. cosa ha chiesto Agostino ----------
const libero = String(trig.query || trig.message || trig.testo || trig.input || trig.data_libera || '').trim();
let luogo = String(trig.luogo || '').trim();
let ora = normOra(trig.ora || '');
let idScelto = String(trig.id || '').trim().toUpperCase();
let dataRich = String(trig.data || '').trim();

// (2) autista e veicolo: SOLO da quello che ha detto adesso, mai dall'andata
const autistaDetto = String(trig.autista || '').trim();
const veicoloDetto = String(trig.veicolo || '').trim();

if (!luogo && libero) {
  const m = /\b(?:da|dal|dalla|dallo|dai|dagli)\s+(.+?)(?:\s+(?:alle|ore|all\s|per\s|il\s|oggi|domani|ieri|verso)\b|[,;.]|$)/i.exec(libero);
  if (m) luogo = m[1].trim();
}
if (!ora && libero) {
  let m = /\b(?:alle|ore|h)\s*(\d{1,2})(?:[:.](\d{2}))?/i.exec(libero);
  if (!m) m = /\b(\d{1,2})[:.](\d{2})\b/.exec(libero);
  if (m) ora = normOra(m[2] !== undefined && m[2] !== null ? (m[1] + ':' + m[2]) : m[1]);
}
// pulizia coda: "sabbiadoro alle" -> "sabbiadoro"
luogo = luogo.replace(/\s+(alle|ore|oggi|domani|ieri)\s*$/i, '').trim();

// (3) destinazione: prima l'input esplicito, poi la frase
const destDetta = String(trig.destinazione || '').trim() || estraiDestinazione(libero);

const oggi = oggiRoma();
let giornoBase = oggi;
if (dataRich) { const d = parseDataIT(dataRich); if (d) giornoBase = d; }
else if (libero) {
  const qn = norm(libero);
  if (/\bdomani\b/.test(qn)) giornoBase = piuGiorni(oggi, 1);
  else if (/\bieri\b/.test(qn)) giornoBase = piuGiorni(oggi, -1);
  else { const d = parseDataIT((/(\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?)/.exec(libero) || [])[1] || ''); if (d) giornoBase = d; }
}

const base = {
  luogo: luogo, ora: ora,
  destinazione_detta: destDetta,
  giorno_cercato: fmtIT(giornoBase),
  allargato_a_ieri: false,
  intent: 'nuovo'          // (1) un rientro è sempre una riga nuova. Mai 'modifica'.
};

// (1) La regola non sta più solo nella descrizione del tool: la scrive il codice,
// e viene fuori da ogni ramo, con dentro l'Id vero da NON riusare.
function regolaRigaNuova(idAndata) {
  return '⛔ REGOLA 1 — Un rientro è SEMPRE un transfer NUOVO con un Id NUOVO. ' +
    'NON cercare l\'andata con cerca_servizi per «modificarla», NON produrre [INTENT: modifica], ' +
    'NON riusare l\'Id dell\'andata' + (idAndata ? ' (' + idAndata + ')' : '') + ': quell\'Id sta solo nelle Note come riferimento. ' +
    'Riusarlo riscrive una prenotazione vera (è successo il 16/08, esecuzione 742264).';
}

if (!luogo) {
  return [{ json: Object.assign({}, base, {
    esito: 'dati_mancanti',
    istruzioni: 'Manca il LUOGO. Chiedi ad Agostino da dove deve partire il rientro (es. "rientro da Sabbiadoro alle 17") e richiama il tool. NON inventare il luogo.\n' + regolaRigaNuova('')
  }) }];
}

// ---------- 2. cerca le andate ----------
function candidatiDelGiorno(giorno) {
  const out = [];
  for (let i = 0; i < righe.length; i++) {
    const t = righe[i] || {};
    if (String(t['Allert'] || '').trim().toLowerCase() === 'cancellato') continue;
    const dt = parseDataIT(t['Data'], giorno.getFullYear());
    if (!dt || fmtIT(dt) !== fmtIT(giorno)) continue;
    if (!luogoCombacia(t['Transfer < Per'], luogo)) continue;
    const nome = String(t['Nome'] || '').trim();
    const id = String(t['Id'] || '').trim();
    if (!nome && !id) continue; // riga vuota
    out.push({ riga: t, dt: dt, row_number: i + 2 });
  }
  out.sort((a, b) => String(a.riga['Time'] || '').localeCompare(String(b.riga['Time'] || '')));
  return out;
}

let trovati = candidatiDelGiorno(giornoBase);
let giornoUsato = giornoBase;
if (!trovati.length) {
  const ieri = piuGiorni(giornoBase, -1);
  const t2 = candidatiDelGiorno(ieri);
  if (t2.length) { trovati = t2; giornoUsato = ieri; base.allargato_a_ieri = true; }
}
base.giorno_trovato = fmtIT(giornoUsato);

if (!trovati.length) {
  return [{ json: Object.assign({}, base, {
    esito: 'nessuno',
    istruzioni: 'Nessun transfer verso «' + luogo + '» il ' + fmtIT(giornoBase) + ' né il giorno prima. ' +
      'Dillo ad Agostino così com\'è e chiedi se il luogo è scritto in un altro modo o se la data è diversa. ' +
      '⛔ NON inventare il transfer di andata e NON salvare niente.\n' + regolaRigaNuova('')
  }) }];
}

// se Agostino ha già scelto un Id, tengo solo quello
if (idScelto) {
  const solo = trovati.filter(c => String(c.riga['Id'] || '').trim().toUpperCase() === idScelto);
  if (solo.length) trovati = solo;
  else {
    // può aver scelto un Id di un altro giorno: cerco ovunque
    const ovunque = [];
    for (let i = 0; i < righe.length; i++) {
      const t = righe[i] || {};
      if (String(t['Id'] || '').trim().toUpperCase() === idScelto) ovunque.push({ riga: t, dt: parseDataIT(t['Data'], giornoBase.getFullYear()), row_number: i + 2 });
    }
    if (ovunque.length) trovati = ovunque;
    else return [{ json: Object.assign({}, base, {
      esito: 'nessuno',
      istruzioni: 'L\'Id ' + idScelto + ' non esiste nel gestionale. Non salvare niente: dillo ad Agostino.\n' + regolaRigaNuova('')
    }) }];
  }
}

const scheda = (c, n) => {
  const r = c.riga;
  return (n ? '#' + n + ' · ' : '') + String(r['Time'] || '—') + '  ' +
    String(r['Nome'] || '(senza nome)') + '  ·  ' +
    String(r['Transfer > Da'] || '—') + ' → ' + String(r['Transfer < Per'] || '—') +
    '  ·  ' + String(r['Pax'] || '?') + ' pax  ·  ' + (String(r['Tariffa'] || '').trim() || 'tariffa —') +
    '  ·  Id ' + String(r['Id'] || '—');
};

// ---------- 3. più di uno: deve scegliere Agostino ----------
if (trovati.length > 1) {
  return [{ json: Object.assign({}, base, {
    esito: 'scegli',
    quanti: trovati.length,
    candidati: trovati.map((c, i) => ({
      n: i + 1,
      Id: String(c.riga['Id'] || ''),
      Data: fmtIT(c.dt || giornoUsato),
      Ora: String(c.riga['Time'] || ''),
      Da: String(c.riga['Transfer > Da'] || ''),
      Per: String(c.riga['Transfer < Per'] || ''),
      Pax: String(c.riga['Pax'] || ''),
      Nome: String(c.riga['Nome'] || ''),
      Fornitore: String(c.riga['Fornitori'] || ''),
      Tariffa: String(c.riga['Tariffa'] || '')
    })),
    elenco: trovati.map((c, i) => scheda(c, i + 1)).join('\n'),
    istruzioni: 'Ci sono ' + trovati.length + ' andate verso «' + luogo + '»' +
      (base.allargato_a_ieri ? ' (del giorno prima, ' + fmtIT(giornoUsato) + ')' : '') +
      '. Mostra ad Agostino l\'elenco esattamente come te l\'ho dato, con l\'Id di ciascuna, ' +
      'e chiudi il messaggio con i bottoni [BUTTONS: rientro #1 | rientro #2 | ...] uno per candidato. ' +
      'Quando sceglie, richiama tool_rientro passando id = l\'Id ESATTO di quel candidato (più luogo e ora). ' +
      '⛔ NON scegliere tu al posto suo e NON salvare niente adesso.\n' + regolaRigaNuova('')
  }) }];
}

// ---------- 4. uno solo: preparo il rientro ----------
const c = trovati[0];
const r = c.riga;
const idAndata = String(r['Id'] || '').trim();
const daRientro = String(r['Transfer < Per'] || '').trim();   // dove si trova ora
const perDedotto = String(r['Transfer > Da'] || '').trim();   // da dove era partito
// (3) quella detta vince, sempre. Se non l'ha detta, si gira l'andata.
const perRientro = destDetta || perDedotto;
const nome = String(r['Nome'] || '').trim();
const cell = String(r['Cell.'] || r['Cell'] || '').trim();
const pax = String(r['Pax'] || '').trim();
const fornitore = String(r['Fornitori'] || '').trim();
const modalita = String(r['Modalità'] || r['Modalita'] || '').trim();
const _mr = modalitaRientro(modalita);   // 12/08/2026: la modalità del rientro si decide, non si ricopia
const modalitaR = _mr.valore;
const tariffa = String(r['Tariffa'] || '').trim();
const noteOrig = String(r['Note'] || '').trim();
const dataRientro = fmtIT(giornoBase);   // il rientro va sul giorno chiesto, non su quello dell'andata

// (2) mai dall'andata: solo quello che Agostino ha detto adesso
const autistaR = autistaDetto;
const veicoloR = veicoloDetto;
const autistaAndata = String(r['Autista'] || '').trim();
const veicoloAndata = String(r['Veicolo'] || '').trim();

const avvisi = [];
if (!ora) avvisi.push('⛔ Manca l\'ORA del rientro: chiedila ad Agostino prima di mostrare la scheda.');
if (base.allargato_a_ieri) avvisi.push('⚠️ L\'andata NON è di oggi: è del ' + fmtIT(giornoUsato) + '. Il rientro l\'ho messo il ' + dataRientro + '.');

// (3) si dice sempre da dove viene la destinazione, non si decide in silenzio
if (destDetta && norm(destDetta) !== norm(perDedotto)) {
  avvisi.push('✅ Destinazione «' + destDetta + '»: l\'hai detta tu, e vince su quella dedotta dall\'andata («' + (perDedotto || '—') + '»).');
  if (fornitore && norm(destDetta) === norm(fornitore)) {
    avvisi.push('⚠️ «' + destDetta + '» è anche il nome del fornitore: controlla che sia davvero il posto dove torna il cliente.');
  }
} else if (destDetta) {
  avvisi.push('✅ Destinazione «' + destDetta + '»: l\'hai detta tu, e coincide con quella dedotta dall\'andata.');
} else {
  avvisi.push('⚠️ Destinazione «' + (perRientro || '—') + '» dedotta girando l\'andata: non l\'hai detta tu. Se torna altrove, dimmelo.');
}

if (!tariffa) avvisi.push('⚠️ L\'andata non ha tariffa: il rientro resta DA DEFINIRE.');
else avvisi.push('⚠️ Tariffa ' + tariffa + ' copiata dall\'andata: confermala o correggila.');
if (!cell) avvisi.push('⚠️ Sull\'andata non c\'è il cellulare del cliente.');
if (modalitaR) avvisi.push('✅ Modalità rientro: «' + modalitaR + '» — ' + _mr.motivo + '.');
else avvisi.push('⚠️ Sull\'andata non c\'è la modalità di pagamento: sul rientro scrivila tu.');

// (2) autista e veicolo: si dice sempre cosa si è fatto, e cosa NON si è ereditato
if (autistaR || veicoloR) {
  avvisi.push('✅ ' + (autistaR ? 'Autista «' + autistaR + '»' : 'Autista vuoto') +
    (veicoloR ? ', veicolo «' + veicoloR + '»' : ', veicolo vuoto') + ': l\'hai detto tu adesso, non viene dall\'andata.');
}
if (!autistaR) {
  avvisi.push('✅ Autista e veicolo del rientro restano VUOTI: non si ereditano mai dall\'andata' +
    (autistaAndata || veicoloAndata
      ? ' (all\'andata c\'erano ' + (autistaAndata || '—') + (veicoloAndata ? ' · ' + veicoloAndata : '') + ')'
      : '') +
    '. Se il rientro lo fa qualcuno, dimmelo e lo scrivo.');
}

if (c.dt && c.dt.__annoDedotto) avvisi.push('⚠️ Sull\'andata la Data è scritta senza anno («' + String(r['Data'] || '') + '»): ho dato per buono il ' + fmtIT(c.dt) + '. Controlla.');
if (!perRientro) avvisi.push('⛔ Non so dove far tornare il cliente: sull\'andata manca il luogo di partenza e tu non hai detto la destinazione.');

// rientro già presente?
let giaPresente = null;
for (let i = 0; i < righe.length; i++) {
  const t = righe[i] || {};
  if (String(t['Allert'] || '').trim().toLowerCase() === 'cancellato') continue;
  const dt = parseDataIT(t['Data'], giornoBase.getFullYear());
  if (!dt || fmtIT(dt) !== dataRientro) continue;
  if (String(t['Id'] || '').trim().toUpperCase() === idAndata.toUpperCase()) continue;
  if (!luogoCombacia(t['Transfer > Da'], daRientro)) continue;
  if (perRientro && !luogoCombacia(t['Transfer < Per'], perRientro)) continue;
  if (nome && norm(t['Nome']) !== norm(nome)) continue;
  giaPresente = { Id: String(t['Id'] || ''), Ora: String(t['Time'] || ''), Nome: String(t['Nome'] || '') };
  break;
}
if (giaPresente) {
  avvisi.push('⛔ ATTENZIONE: il ' + dataRientro + ' esiste GIÀ un transfer da «' + daRientro + '» per «' + perRientro +
    '» a nome ' + (giaPresente.Nome || '—') + ' (ore ' + (giaPresente.Ora || '—') + ', Id ' + (giaPresente.Id || '—') +
    '). Potrebbe essere un doppione.');
}

const campi = [
  'Nuovo transfer',
  'Data: ' + dataRientro,
  'Ora: ' + (ora || 'DA DEFINIRE'),
  'Da: ' + daRientro,
  'Per: ' + perRientro,
  'Pax: ' + (pax || ''),
  'Nome: ' + nome,
  'Cell: ' + cell,
  'Modalità: ' + modalitaR,
  'Fornitori: ' + fornitore,
  'Tariffa: ' + (tariffa || 'DA DEFINIRE')
];
// (2) autista e veicolo entrano nel recap SOLO se Agostino li ha detti adesso.
// Se non ci sono, il parser di Parse transfer li lascia vuoti (regola sua:
// campo mancante -> stringa vuota). Così non c'è modo di ereditarli per sbaglio.
if (autistaR) campi.push('Autista: ' + autistaR);
if (veicoloR) campi.push('Veicolo: ' + veicoloR);
campi.push('Note: ' + ('Rientro di ' + idAndata + (noteOrig ? ' · ' + noteOrig.slice(0, 160) : '')));

const schedaTesto = [
  '🔄 RIENTRO da preparare',
  '📅 Data: ' + dataRientro,
  '🕐 Ora: ' + (ora || 'DA DEFINIRE'),
  '📍 Da: ' + daRientro,
  '🎯 Per: ' + (perRientro || 'DA DEFINIRE') + (destDetta ? ' (l\'hai detta tu)' : ' (dedotta dall\'andata)'),
  '👥 Pax: ' + (pax || '—'),
  '👤 Nome: ' + (nome || '—'),
  '📞 Cell: ' + (cell || '—'),
  '💳 Modalità: ' + (modalitaR || '—'),   // 12/08: la modalità DEL RIENTRO, non quella dell'andata
  '🏢 Fornitori: ' + (fornitore || '—'),
  '💰 Tariffa: ' + (tariffa || 'DA DEFINIRE'),
  '🚐 Autista: ' + (autistaR || '— (non ereditato dall\'andata)'),
  '🚗 Veicolo: ' + (veicoloR || '— (non ereditato dall\'andata)'),
  '↩️ Andata: ' + String(r['Time'] || '—') + ' del ' + fmtIT(c.dt || giornoUsato) + ' · Id ' + idAndata
].join('\n');

const bloccante = avvisi.some(a => a.indexOf('⛔') === 0);

return [{ json: Object.assign({}, base, {
  esito: bloccante ? 'da_completare' : 'pronto',
  // (1) l'Id dell'andata ha un nome che dice a cosa serve: solo riferimento.
  id_andata_solo_riferimento: idAndata,
  destinazione_da: destDetta ? 'detta_da_agostino' : 'dedotta_dall_andata',
  andata: {
    Id: idAndata, Data: fmtIT(c.dt || giornoUsato), Ora: String(r['Time'] || ''),
    Da: perDedotto, Per: daRientro, Nome: nome, Cell: cell,
    Pax: pax, Fornitore: fornitore, Modalita: modalita, Tariffa: tariffa, Note: noteOrig,
    Autista: autistaAndata, Veicolo: veicoloAndata
  },
  rientro: {
    Data: dataRientro, Ora: ora, Da: daRientro, Per: perRientro, Pax: pax,
    Nome: nome, Cell: cell, Modalita: modalitaR, Fornitori: fornitore, Tariffa: tariffa,
    Autista: autistaR, Veicolo: veicoloR
  },
  scheda: schedaTesto,
  recap_da_salvare: campi.join(' | '),
  avvisi: avvisi,
  istruzioni: (bloccante
    ? 'MANCA qualcosa (vedi avvisi con ⛔). Chiedi ad Agostino solo il dato mancante e richiama il tool. ⛔ NON salvare.'
    : 'Mostra ad Agostino la "scheda" così com\'è, aggiungi gli "avvisi" sotto, e chiudi con [BUTTONS: ✅ Conferma rientro | ❌ Annulla]. ' +
      'SOLO quando conferma, chiama tool_transfer passando in message esattamente il campo "recap_da_salvare", senza cambiare nulla. ' +
      '⛔ NON chiamare tool_transfer adesso e NON modificare i valori: nome, cellulare, pax, fornitore, modalità e tariffa vengono dall\'andata. '
      + 'In particolare la MODALITÀ va copiata esattamente come è scritta qui (Carta, Contanti, Fattura, Incassare, Sconto in fattura, Dalla struttura…): ⛔ NON convertirla, NON normalizzarla, NON sostituirla con un valore che ti sembra più standard.')
    + '\n' + regolaRigaNuova(idAndata)
    + '\n⛔ REGOLA 2 — Autista e veicolo del rientro sono quelli che vedi qui (vuoti se non li ha detti Agostino adesso). NON copiarli dall\'andata, NON aggiungerli al recap di tua iniziativa.'
    + '\n⛔ REGOLA 3 — La destinazione «' + (perRientro || '—') + '» è quella che vale. Se Agostino te ne dice un\'altra, richiama tool_rientro passando destinazione = quella nuova: NON correggerla tu e NON rimetterci quella dedotta dall\'andata.'
}) }];
