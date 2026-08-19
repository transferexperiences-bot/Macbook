// =====================================================================
// Tool - Rientro (f3Y46avI5O8dEnYn) — nodo "Trova Rientro"
// =====================================================================
//
// COSA CAMBIA, E PERCHÉ (18/08/2026).
//
// Il tool restituiva liste lunghe di andate e ogni tanto una destinazione
// inventata. Tre guasti veri, tutti del 18/08:
//
// A) TROPPI CANDIDATI — quello che Agostino diceva non filtrava niente.
//    Esecuzione 755902 (09:40): «Manca da aggiungere alle dodici un parto e
//    rientro per avratere di Dashka Potanis» → 4 candidati da scegliere a mano,
//    anche se il nome (Dashka) e la destinazione (Auraterrae) ne indicavano UNO.
//    Esecuzione 758295 (15:32): «rientro da Bari per Pietrablu tra un'ora» →
//    6 candidati, anche se solo due partivano da Pietra Blu.
//    Risultato: tre chiamate in 90 secondi per un rientro solo (755902/755905/
//    755914) e due per l'altro (758295/758387).
//    Ora i candidati vengono ristretti DAL CODICE con quello che ha detto lui:
//      1. l'andata deve partire PRIMA dell'ora del rientro (stesso giorno),
//      2. l'andata deve venire dalla destinazione che ha detto,
//      3. il nome del cliente nella sua frase.
//    Ogni filtro si applica solo se lascia almeno un candidato, e viene sempre
//    scritto in `come_ho_scelto`: se resta uno solo si va avanti dicendo perché,
//    se restano in due o più sceglie ancora Agostino coi bottoni.
//
// B) DESTINAZIONE INVENTATA — pescata dalla frase con un «per» qualsiasi.
//    Esecuzione 755905 (09:41): `recap_da_salvare` conteneva
//    «Per: avratere di Dashka Potanis», con l'avviso «✅ l'hai detta tu».
//    Era una trascrizione storpiata, pronta per finire sul gestionale.
//    Ora la destinazione presa dalla frase vale solo se somiglia a un posto che
//    sul gestionale esiste davvero (colonne Da/Per e Fornitori): altrimenti si
//    butta, si usa quella dedotta girando l'andata e lo si dice.
//
// C) ANDATE FUORI ORARIO — un'andata delle 19:15 proposta per un rientro
//    chiesto per le 12:00 (755902, candidato #4). Ora si scartano.
//
// Restano identiche le tre regole del 17/08 (riga nuova con Id nuovo, autista e
// veicolo mai ereditati, destinazione detta che vince) e la modalità del 12/08.
// Il nodo continua a NON salvare niente.
//
// Banco: banchi/te/banco-rientro.js (dati veri di 755902, 755905, 755914,
// 758295, 758387, 741981).
// Per tornare indietro: restore_workflow_version f3Y46avI5O8dEnYn
// versione cef25980-839e-4130-b975-37a32e9fa611.

// La modalità del rientro NON è quella dell'andata (regola di Agostino, 12/08/2026).
// Se l'andata è in fattura il rientro segue la fattura. Ma se sull'andata hai già incassato
// (contanti, carta, link), sul rientro c'è da incassare di nuovo: si scrive «Incassare».
function modalitaRientro(mod) {
  const m = String(mod == null ? '' : mod).trim();
  const s = m.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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
// "8:5" / "8.30" / "18:15" -> minuti dalla mezzanotte, per confrontare gli orari.
function minuti(v) {
  const m = /^(\d{1,2})[:.](\d{1,2})/.exec(String(v == null ? '' : v).trim());
  if (!m) { const h = /^(\d{1,2})$/.exec(String(v == null ? '' : v).trim()); return h ? Number(h[1]) * 60 : null; }
  return Number(m[1]) * 60 + Number(m[2]);
}

// (B) I posti che sul gestionale esistono davvero: colonne Da/Per di tutte le
// righe, più i fornitori. Serve a non far entrare nel recap una destinazione
// nata da una trascrizione storpiata («avratere di Dashka Potanis», 755905).
const POSTI = (function () {
  const visti = Object.create(null);
  const out = [];
  for (let i = 0; i < righe.length; i++) {
    const t = righe[i] || {};
    const vals = [t['Transfer > Da'], t['Transfer < Per'], t['Fornitori']];
    for (let k = 0; k < vals.length; k++) {
      const v = String(vals[k] == null ? '' : vals[k]).trim();
      if (!v) continue;
      const n = norm(v);
      if (!n || visti[n]) continue;
      visti[n] = 1; out.push(v);
    }
  }
  return out;
})();
function postoNoto(x) {
  if (!x) return false;
  for (let i = 0; i < POSTI.length; i++) if (luogoCombacia(POSTI[i], x)) return true;
  return false;
}
// Un nome di posto è fatto di poche parole e non contiene cifre.
function sembraLuogo(c) {
  const s = String(c == null ? '' : c).trim();
  if (!s || s.length < 2) return false;
  if (/\d/.test(s)) return false;
  return s.split(/\s+/).length <= 3;
}

// (3) La destinazione detta da Agostino. Si legge dalla frase originale quando
// non arriva già pronta nell'input `destinazione`.
// Attenzione ai falsi positivi: in «per le 18.30» dopo "per" c'è un orario, non
// un luogo; in «per favore» non c'è niente; e in «per avratere di Dashka Potanis»
// il posto finisce al «di» (il resto è il nome del cliente).
const NON_LUOGHI = /^(le|la|il|lo|l|i|gli|favore|cortesia|ora|adesso|oggi|domani|ieri|stasera|stamattina|rientro|ritorno|andata|piacere|caso|ora\b)$/i;
function estraiDestinazione(txt) {
  if (!txt) return '';
  const m = /\b(?:per|verso|fino a|direzione|destinazione|riportal[oaie]\s+a|riportare\s+a|riportarli\s+a)\s+(.+?)(?:\s+(?:alle|all|ore|ora|oggi|domani|ieri|entro|verso le|con|senza)\b|[,;.]|$)/i.exec(txt);
  if (!m) return '';
  let c = m[1].trim();
  // via l'articolo iniziale: «per il Serafini» -> «Serafini»
  c = c.replace(/^(?:il|lo|la|l['’]|i|gli|le)\s*/i, '').trim();
  // il posto finisce dove comincia il cliente: «avratere di Dashka Potanis» -> «avratere»
  c = c.split(/\s+(?:di|del|dello|della|dei|degli|delle|per|con)\s+/i)[0].trim();
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

// (3)+(B) destinazione: prima l'input esplicito, poi la frase. In tutti e due i
// casi deve essere un posto che sta in piedi, altrimenti si butta e si dice.
const destInput = String(trig.destinazione || '').trim();
const destFrase = destInput ? '' : estraiDestinazione(libero);
let destDetta = '';
let destFonte = '';          // 'input' | 'frase' | ''
let destScartata = '';       // cosa ho buttato, per dirlo negli avvisi
let destNonNota = false;     // detta da lui ma non risulta sul gestionale
if (destInput) {
  if (postoNoto(destInput) || sembraLuogo(destInput)) {
    destDetta = destInput; destFonte = 'input'; destNonNota = !postoNoto(destInput);
  } else { destScartata = destInput; }
} else if (destFrase) {
  // dalla frase mi fido solo se il posto esiste davvero sul gestionale:
  // le trascrizioni storpiate non devono finire nel recap (755905).
  if (postoNoto(destFrase)) { destDetta = destFrase; destFonte = 'frase'; }
  else { destScartata = destFrase; }
}

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
// (D) L'Id dell'andata NON compare in nessun testo che possa finire nel
// messaggio di salvataggio: lo tiene solo il campo dati id_andata_solo_riferimento.
// Prova: 18/08 esecuzione 758399. Nella scheda c'era «↩️ Andata: 16:45 · Id
// TR-20260818-47a6fd0f…»; il modello di Parse transfer ha pescato quell'Id dal
// testo e l'ha messo nel transfer da salvare. Google Sheets appendOrUpdate fa
// match sull'Id: ha AGGIORNATO la riga 1114 dell'andata invece di aggiungerne
// una nuova. L'andata delle 16:45 Pietra Blu → Città di Bari di LADANOV IGOR è
// stata sovrascritta dal rientro (e si è tenuta l'autista dell'andata).
// La regola scritta a parole non basta: chi salva non legge queste regole,
// legge il testo. Quindi nel testo l'Id non ci va.
function regolaRigaNuova() {
  return '⛔ REGOLA 1 — Un rientro è SEMPRE un transfer NUOVO. ' +
    'NON cercare l\'andata con cerca_servizi per «modificarla», NON produrre [INTENT: modifica], ' +
    'e nel messaggio che mandi a tool_transfer NON scrivere MAI un Id: l\'Id del rientro lo genera il salvataggio. ' +
    'Se ci finisce dentro l\'Id dell\'andata, il gestionale non aggiunge una riga: SOVRASCRIVE l\'andata ' +
    '(16/08 esecuzione 742264 e 18/08 esecuzione 758399, una prenotazione vera persa).';
}

if (!luogo) {
  return [{ json: Object.assign({}, base, {
    esito: 'dati_mancanti',
    istruzioni: 'Manca il LUOGO. Chiedi ad Agostino da dove deve partire il rientro (es. "rientro da Sabbiadoro alle 17") e richiama il tool. NON inventare il luogo.\n' + regolaRigaNuova()
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
      '⛔ NON inventare il transfer di andata e NON salvare niente.\n' + regolaRigaNuova()
  }) }];
}

// se Agostino ha già scelto un Id, tengo solo quello
let idEsplicito = false;
if (idScelto) {
  const solo = trovati.filter(c => String(c.riga['Id'] || '').trim().toUpperCase() === idScelto);
  if (solo.length) { trovati = solo; idEsplicito = true; }
  else {
    // può aver scelto un Id di un altro giorno: cerco ovunque
    const ovunque = [];
    for (let i = 0; i < righe.length; i++) {
      const t = righe[i] || {};
      if (String(t['Id'] || '').trim().toUpperCase() === idScelto) ovunque.push({ riga: t, dt: parseDataIT(t['Data'], giornoBase.getFullYear()), row_number: i + 2 });
    }
    if (ovunque.length) { trovati = ovunque; idEsplicito = true; }
    else return [{ json: Object.assign({}, base, {
      esito: 'nessuno',
      istruzioni: 'L\'Id ' + idScelto + ' non esiste nel gestionale. Non salvare niente: dillo ad Agostino.\n' + regolaRigaNuova()
    }) }];
  }
}

// ---------- 2-bis. (A)+(C) restringo con quello che ha detto Agostino ----------
// Ogni filtro entra solo se lascia almeno un candidato, e resta scritto.
const comeHoScelto = [];
const scartati = [];
function filtra(etichetta, tieni) {
  if (trovati.length <= 1) return;
  const dentro = [], fuori = [];
  for (let i = 0; i < trovati.length; i++) (tieni(trovati[i]) ? dentro : fuori).push(trovati[i]);
  if (!dentro.length || !fuori.length) return;   // non decide niente: lascio stare
  for (let i = 0; i < fuori.length; i++) scartati.push({ c: fuori[i], perche: etichetta });
  trovati = dentro;
  comeHoScelto.push(etichetta + ' (scartate ' + fuori.length + ')');
}

if (!idEsplicito) {
  // (C) l'andata parte prima del rientro. Solo se il rientro è lo stesso giorno
  // dell'andata: se l'andata è di ieri il confronto non vuol dire niente.
  const minRientro = minuti(ora);
  if (minRientro !== null && !base.allargato_a_ieri) {
    filtra('l\'andata deve partire prima delle ' + ora, (c) => {
      const m = minuti(c.riga['Time']);
      return m === null || m <= minRientro;
    });
  }
  // (A) il rientro torna dove l'andata era partita: se Agostino ha detto la
  // destinazione, l'andata giusta è quella che veniva da lì.
  if (destDetta) {
    filtra('l\'andata deve venire da «' + destDetta + '»', (c) => luogoCombacia(c.riga['Transfer > Da'], destDetta));
  }
  // (A) il nome del cliente detto nella frase.
  if (libero) {
    const tokFrase = norm(libero).split(' ').filter(x => x.length >= 4);
    const combaciaNome = (nome) => {
      const tokNome = norm(nome).split(' ').filter(x => x.length >= 4);
      if (!tokNome.length || !tokFrase.length) return false;
      return tokNome.some(a => tokFrase.some(b =>
        a === b || (a.slice(0, 4) === b.slice(0, 4) && Math.abs(a.length - b.length) <= 2)));
    };
    if (trovati.some(c => combaciaNome(c.riga['Nome']))) {
      filtra('il cliente nominato nella tua frase', (c) => combaciaNome(c.riga['Nome']));
    }
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
    come_ho_scelto: comeHoScelto,
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
      (comeHoScelto.length ? ' (ho già tolto quelle che non tornano: ' + comeHoScelto.join('; ') + ')' : '') +
      '. Mostra ad Agostino l\'elenco esattamente come te l\'ho dato, con l\'Id di ciascuna, ' +
      'e chiudi il messaggio con i bottoni [BUTTONS: rientro #1 | rientro #2 | ...] uno per candidato. ' +
      'Quando sceglie, richiama tool_rientro passando id = l\'Id ESATTO di quel candidato (più luogo e ora). ' +
      '⛔ NON scegliere tu al posto suo e NON salvare niente adesso.\n' + regolaRigaNuova()
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

// (A) se ho ristretto io, si dice come e con cosa. Non si sceglie in silenzio.
if (comeHoScelto.length) {
  avvisi.push('🔎 Ho preso questa andata fra ' + (trovati.length + scartati.length) + ': ' + comeHoScelto.join('; ') +
    '. Se non è questa dimmelo, ti rimostro l\'elenco.');
}

// (3)+(B) si dice sempre da dove viene la destinazione, non si decide in silenzio
if (destScartata) {
  avvisi.push('⚠️ Dalla tua frase avevo capito «' + destScartata + '» come destinazione, ma non somiglia a nessun posto del gestionale: ' +
    'l\'ho lasciata perdere e ho messo «' + perRientro + '». Se il rientro va davvero altrove, dimmi il posto.');
}
if (destDetta && norm(destDetta) !== norm(perDedotto)) {
  avvisi.push('✅ Destinazione «' + destDetta + '»: l\'hai detta tu, e vince su quella dedotta dall\'andata («' + (perDedotto || '—') + '»).');
  if (fornitore && norm(destDetta) === norm(fornitore)) {
    avvisi.push('⚠️ «' + destDetta + '» è anche il nome del fornitore: controlla che sia davvero il posto dove torna il cliente.');
  }
} else if (destDetta) {
  avvisi.push('✅ Destinazione «' + destDetta + '»: l\'hai detta tu, e coincide con quella dedotta dall\'andata.');
} else if (!destScartata) {
  avvisi.push('⚠️ Destinazione «' + (perRientro || '—') + '» dedotta girando l\'andata: non l\'hai detta tu. Se torna altrove, dimmelo.');
}
if (destNonNota) {
  avvisi.push('⚠️ «' + destDetta + '» non risulta scritto così sul gestionale: controlla il nome prima di salvare.');
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
// (E) 19/08/2026 — trovato rigiocando le esecuzioni vere dentro questo codice.
// Sull'esecuzione 758387 il rientro veniva fuori «Pietra Blu → Pietra Blu»: l'andata da cui
// partiva era la riga 1112, che il guasto del 18/08 aveva trasformato nel rientro stesso.
// Un transfer che parte e arriva nello stesso posto non è mai giusto, qualunque sia la causa:
// qui si ferma e si chiede, invece di preparare una riga senza senso.
if (perRientro && daRientro && norm(daRientro) === norm(perRientro)) {
  avvisi.push('⛔ Partenza e destinazione sono lo stesso posto («' + daRientro + '»): così il rientro non ha senso. ' +
    'Vuol dire che l\'andata da cui l\'ho ricavato non torna (può essere una riga sbagliata sul gestionale). ' +
    'Dimmi tu da dove parte e dove torna, e NON salvare niente.');
}

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
  // (D) niente Id neanche qui: è il testo che Agostino vede e che rischia di
  // essere ricopiato nel messaggio di salvataggio.
  avvisi.push('⛔ ATTENZIONE: il ' + dataRientro + ' esiste GIÀ un transfer da «' + daRientro + '» per «' + perRientro +
    '» a nome ' + (giaPresente.Nome || '—') + ' (ore ' + (giaPresente.Ora || '—') +
    '). Potrebbe essere un doppione: fattelo confermare da Agostino prima di salvare.');
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
if (autistaR) campi.push('Autista: ' + autistaR);
if (veicoloR) campi.push('Veicolo: ' + veicoloR);
// (D) nelle Note il riferimento all'andata c'è, ma NON come Id: un Id dentro il
// testo da salvare fa aggiornare la riga dell'andata invece di crearne una nuova.
campi.push('Note: ' + ('Rientro dell\'andata delle ' + (String(r['Time'] || '').trim() || '—') +
  (nome ? ' di ' + nome : '') + (noteOrig ? ' · ' + noteOrig.slice(0, 160) : '')));

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
  // (D) niente Id qui: questo testo viene ricopiato nel messaggio di salvataggio
  '↩️ Andata: ' + String(r['Time'] || '—') + ' del ' + fmtIT(c.dt || giornoUsato) +
    ' · ' + (perDedotto || '—') + ' → ' + (daRientro || '—')
].join('\n');

const bloccante = avvisi.some(a => a.indexOf('⛔') === 0);

return [{ json: Object.assign({}, base, {
  esito: bloccante ? 'da_completare' : 'pronto',
  // (1) l'Id dell'andata ha un nome che dice a cosa serve: solo riferimento.
  id_andata_solo_riferimento: idAndata,
  destinazione_da: destDetta ? (destFonte === 'input' ? 'detta_da_agostino' : 'letta_dalla_frase') : 'dedotta_dall_andata',
  destinazione_scartata: destScartata,
  come_ho_scelto: comeHoScelto,
  scartati: scartati.map(s => ({ Ora: String(s.c.riga['Time'] || ''),
    Nome: String(s.c.riga['Nome'] || ''), Da: String(s.c.riga['Transfer > Da'] || ''), perche: s.perche })),
  andata: {
    // (D) l'Id sta solo in id_andata_solo_riferimento: qui no, così non finisce
    // per sbaglio nel testo che va al salvataggio.
    Data: fmtIT(c.dt || giornoUsato), Ora: String(r['Time'] || ''),
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
    + '\n' + regolaRigaNuova()
    + '\n⛔ REGOLA 2 — Autista e veicolo del rientro sono quelli che vedi qui (vuoti se non li ha detti Agostino adesso). NON copiarli dall\'andata, NON aggiungerli al recap di tua iniziativa.'
    + '\n⛔ REGOLA 3 — La destinazione «' + (perRientro || '—') + '» è quella che vale. Se Agostino te ne dice un\'altra, richiama tool_rientro passando destinazione = quella nuova: NON correggerla tu e NON rimetterci quella dedotta dall\'andata.'
}) }];
