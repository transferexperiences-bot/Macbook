// Etichette che dicono la cosa, non il numero. Le prende dall'elenco che il bot ha appena
// scritto: dalla riga «#6 · 20:00 (senza nome) · Pietra Blu → Monopoli · 8 pax · 50,00€ · Id ...»
// tira fuori «20:00 Pietra Blu→Monopoli». Il testo che torna al bot resta «rientro #6».
function descriviScelta(testo, numero) {
  const T = String(testo || '');
  const rx = new RegExp('(?:^|\\n)[^\\n]{0,4}#\\s*' + numero + '\\b([^\\n]*(?:\\n(?![^\\n]{0,4}#\\s*\\d)[^\\n]*){0,3})', 'i');
  const m = T.match(rx);
  if (!m) return '';
  let riga = String(m[1] || '').replace(/\s+/g, ' ').trim();
  riga = riga.replace(/\bId\s+[A-Z0-9\/\-]+.*/i, '').replace(/[·•|]\s*$/, '').trim();
  const ora = (riga.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/) || [])[0] || '';
  let tratta = '';
  const t1 = riga.match(/([A-Za-zÀ-ÿ0-9'’\.\- ]{2,28}?)\s*(?:→|->|>)\s*([A-Za-zÀ-ÿ0-9'’\.\- ]{2,28})/);
  if (t1) tratta = t1[1].trim() + '→' + t1[2].trim();
  let nome = '';
  if (!tratta) {
    const pezzi = riga.split(/\s*[·•]\s*/).map((s) => s.trim()).filter(Boolean);
    for (const p of pezzi) {
      if (/^\d/.test(p) || /€/.test(p) || /pax/i.test(p) || /^\(/.test(p)) continue;
      nome = p; break;
    }
  }
  let out = [ora, tratta || nome].filter(Boolean).join(' ');
  if (!out) return '';
  if (out.length > 34) out = out.slice(0, 33).trim() + '…';
  return out;
}

function costruisciTastiera(etichette, opzioni) {
  const o = opzioni || {};
  const MAX = o.max || 10;
  const TESTO = String(o.testo || '');
  const _cb = (s) => { let t = String(s); while (t.length > 64) t = t.slice(0, -1); return t; };
  const NUM = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
  const lab = (Array.isArray(etichette) ? etichette : [])
    .map((s) => String(s == null ? '' : s).trim())
    .filter((s) => s.length > 0 && s !== '…' && s !== '...')
    .slice(0, MAX);
  if (!lab.length) return { righe: [], tipo: 'niente' };
  const SI = /^(?:[✅☑️]\s*)?(conferma|confermo|salva|s[iì]\b|ok\b|procedi|invia|manda|approva|va bene)/i;
  const NO = /^(?:[❌✖️]\s*)?(annulla|annullo|no\b|scarta|rifiuta|cancella|lascia|non )/i;
  const SCELTA = /(#\s*\d+|^\s*(?:opzione|scelta|candidato|rientro|numero)\s*\d+|^\s*\d+\s*[·\.\)]\s)/i;
  const quanteScelte = lab.filter((s) => SCELTA.test(s)).length;
  const elenco = quanteScelte >= 2 || lab.length > 3;
  const righe = [];
  if (elenco) {
    lab.forEach((s, i) => {
      const pulita = s.replace(/^[✅❌☑️✖️]\s*/, '');
      const n = (pulita.match(/#\s*(\d+)/) || pulita.match(/^\s*(\d+)/) || [])[1];
      const desc = n ? descriviScelta(TESTO, n) : '';
      righe.push([{ text: (NUM[i] || (i + 1) + '.') + ' ' + (desc || pulita), callback_data: _cb(s) }]);
    });
    return { righe: righe, tipo: 'elenco' };
  }
  const bottoni = lab.map((s) => {
    const pulita = s.replace(/^[✅❌☑️✖️]\s*/, '');
    const icona = SI.test(pulita) ? '✅ ' : NO.test(pulita) ? '❌ ' : '';
    return { text: icona + pulita, callback_data: _cb(s) };
  });
  righe.push(bottoni);
  return { righe: righe, tipo: 'decisione' };
}

/* WRAPPER V7 — Switch (intent) architecture: parse [INTENT:] and [BUTTONS:] from agent output */
try {

const rawOutput =
  $input.first()?.json?.output ??
  $input.first()?.json?.text ??
  '';

let chiave = [];
let textBody = String(rawOutput);

// Estrai marker [INTENT: conferma|modifica|chat]
let intent = 'chat'; // default
// FIX 08/06: prendi l'ULTIMA occorrenza [INTENT:...] (la direttiva reale).
// L'AI a volte cita [INTENT: conferma] nella spiegazione e mette la direttiva vera ([INTENT: chat]) alla fine:
// prima si prendeva la PRIMA -> salvataggio errato su Annulla.
const intentRxG = /\[INTENT:\s*(conferma|modifica|chat|save_pending|delete_pending|cancella)\s*\]/ig;
const allIntents = Array.from(textBody.matchAll(intentRxG));
if (allIntents.length) {
  intent = allIntents[allIntents.length - 1][1].toLowerCase();
}
// rimuovi TUTTI i marker [INTENT:...] dal testo mostrato
textBody = textBody.replace(intentRxG, '').trim();

// Estrai marker [BUTTONS: a | b | c]
const buttonsRx = /\n?[ \t]*\[BUTTONS:\s*([^\]\n]+?)\s*\][ \t]*\s*$/i;
const buttonsMatch = textBody.match(buttonsRx);
if (buttonsMatch) {
  chiave = buttonsMatch[1].split('|').map(s => s.trim())
    .filter(s => s.length > 0 && s !== '…' && s !== '...').slice(0, 10);   // 12/08: erano 3
  textBody = textBody.replace(buttonsRx, '').trim();
}

// === GUARDIA DEPOSITO (03/07/2026) — applica la §4.38 in modo deterministico ===
// I bottoni "con/senza deposito" valgono SOLO se TUTTI i transfer del recap sono di
// clienti diretti. Se nel testo compare almeno un "Fornitori: X" con X diverso da
// Transfer Experience, o una Modalità B2B (Fattura / Sconto in fattura / Dalla struttura),
// i bottoni tornano semplici: [Conferma (tutti) | Annulla].
if (chiave.some(b => /deposito/i.test(b))) {
  let hasB2B = false;
  const supplierRx = /Fornitori?\s*:\s*([^\n]+)/gi;
  for (const m of textBody.matchAll(supplierRx)) {
    const v = m[1].trim();
    if (v && !/transfer\s*experience/i.test(v) && !/^[—\-–]+$/.test(v)) { hasB2B = true; break; }
  }
  if (!hasB2B && /Modalit[aà]\s*:\s*(Fattura|Sconto in fattura|Dalla struttura)/i.test(textBody)) {
    hasB2B = true;
  }
  if (hasB2B) {
    const isBatch = chiave.some(b => /tutti/i.test(b));
    const annulla = chiave.find(b => /annull/i.test(b)) || 'Annulla';
    chiave = [isBatch ? 'Conferma tutti' : 'Conferma', annulla];
  }
}


// === GUARDIA ANTI-RAGIONAMENTO (23/07/2026) ===
// L'agente (Opus) a volte antepone il proprio ragionamento interno — spesso in inglese
// ("I have everything...", "Wait — §4.39...") — al messaggio vero (visto 22/07 sera,
// exec 545033/545447). Rimozione deterministica e CONSERVATIVA:
//  A) se un blocco successivo inizia con emoji di risposta (🚐 ✅ ⚠️ 📅 ...) o "TRANSFER n"
//     e il testo PRIMA contiene marcatori forti di ragionamento -> via tutto il pre-blocco;
//  B) altrimenti togliamo solo i paragrafi iniziali che matchano i marcatori, uno a uno.
// Fail-safe: se dopo la pulizia resta poco testo (<30 char) teniamo l'originale.
{
  const REASONING_RX = /(^|[\s>])(Let me\b|I have\b|I need\b|I'll\b|I will\b|I can\b|I should\b|I must\b|Now I\b|Wait\b|Actually\b|Both\b|The (user|client|tariffs?)\b|This (is|looks)\b|Per\s*§\s*\d|§\s*\d+\.\d+|Devo\s+(emettere|gestire|salvare|mostrare|chiedere)\b|L'utente ha (cliccato|premuto|scritto)\b|Salvataggio in corso)/;
  const REPLY_START_RX = /^\s*(?:[\u{1F690}-\u{1F6FF}\u{1F4C5}\u{1F550}-\u{1F567}\u{2705}\u{26A0}\u{274C}\u{1F4CD}\u{1F3AF}\u{1F3E2}\u{1F4B3}\u{1F4B6}\u{1F194}\u{1F4CB}\u{1F50D}\u{2139}]|TRANSFER\s*\d|Riepilogo\b)/u;
  const paras = textBody.split(/\n{2,}/);
  let cut = -1;
  for (let i = 1; i < paras.length; i++) {
    if (REPLY_START_RX.test(paras[i])) { cut = i; break; }
  }
  let cleaned = null;
  if (cut > 0 && REASONING_RX.test(paras.slice(0, cut).join('\n\n'))) {
    cleaned = paras.slice(cut).join('\n\n').trim();          // caso A
  } else {
    let k = 0;
    while (k < paras.length - 1 && k < 15 && REASONING_RX.test(paras[k])) k++;
    if (k > 0) cleaned = paras.slice(k).join('\n\n').trim(); // caso B
  }
  if (cleaned && cleaned.length >= 30) textBody = cleaned;
}

let raw_text = textBody;

raw_text = raw_text.replace(/\[APPEND_OK\]/g, '').trim();

// Pulizia testo: rimuove null chars (NON spazi normali!)
// 21/08/2026: la sentinella NON si scrive piu' come sequenza di escape unicode. Caricando
// via API quella sequenza si e' rotta due volte in due modi diversi (una volta e' arrivata
// come byte NUL vero, una volta con il backslash raddoppiato). Il carattere si costruisce
// con String.fromCharCode: stesso identico comportamento, niente da sbagliare in trasporto.
const NUL = String.fromCharCode(0);
const RX_NUL = new RegExp(NUL, 'g');
let text = String(raw_text)
  .replace(/\\n/g, '\n')
  .replace(RX_NUL, '')
  .trim();

if (!text || text.trim() === '') text = String.fromCharCode(0x200B);

// Ricalcola giorno della settimana
const ITALIAN_DAYS = ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'];
const WEEKDAY_RX = /(\d{2})\/(\d{2})\/(\d{4})\s*\(\s*(luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)\s*\)/gi;
text = text.replace(WEEKDAY_RX, (full, dd, mm, yyyy) => {
  const date = new Date(yyyy + '-' + mm + '-' + dd + 'T12:00:00');
  if (isNaN(date.getTime())) return full;
  return dd + '/' + mm + '/' + yyyy + ' (' + ITALIAN_DAYS[date.getDay()] + ')';
});

// Normalizza simbolo EUR
text = text.replace(/(\d+(?:[.,]\d+)?)\s*(?:EUR|euro|Euro|EURO|€)\b/g, '€$1');
text = text.replace(/(?:EUR|euro|Euro|EURO)\s*(\d+(?:[.,]\d+)?)/g, '€$1');
text = text.replace(/€\s+(\d)/g, '€$1');

// Rimuove righe con campi vuoti
const EMPTY_SKIPPABLE_FIELDS = [
  'Pax','Nome','Volo','Autista','Veicolo','h extra','Tariffa','Acconto',
  '%','Fee','Note','Cell','Cell.','Telefono','Bagagli','Email','Modalità','Modalita'
];
const escFields = EMPTY_SKIPPABLE_FIELDS.map(f => f.replace(/[.%]/g, m => '\\' + m));
const EMPTY_FIELD_RX = new RegExp(
  '^\\s*(?:' + escFields.join('|') + ')\\s*:\\s*(?:[—\\-]|null|undefined|N\\/A)?\\s*$',
  'gmi'
);
text = text.replace(EMPTY_FIELD_RX, '');
text = text.replace(/\n{3,}/g, '\n\n');

// Strip + Markdown -> HTML Telegram
text = text.replace(/<\/?[a-zA-Z][^>]*>/g, '');

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const codeBlocks = [];
text = text.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, inner) => {
  const idx = codeBlocks.length;
  codeBlocks.push(inner.trim());
  return NUL + 'CB' + idx + NUL;
});

const inlineCodes = [];
text = text.replace(/`([^`]+)`/g, (_, inner) => {
  const idx = inlineCodes.length;
  inlineCodes.push(inner);
  return NUL + 'IC' + idx + NUL;
});

const parts = text.split(new RegExp('(' + NUL + '(?:CB|IC)\\d+' + NUL + ')'));
text = parts.map(part => {
  if (new RegExp('^' + NUL + '(?:CB|IC)\\d+' + NUL + '$').test(part)) return part;
  return escapeHtml(part);
}).join('');

text = text.replace(/\*\*(.+?)\*\*/gs, '<b>$1</b>');
text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/gs, '<i>$1</i>');
text = text.replace(/__(.+?)__/gs, '<u>$1</u>');
text = text.replace(/~~(.+?)~~/gs, '<s>$1</s>');

codeBlocks.forEach((block, i) => {
  text = text.replace(NUL + 'CB' + i + NUL, '<pre>' + escapeHtml(block) + '</pre>');
});
inlineCodes.forEach((block, i) => {
  text = text.replace(NUL + 'IC' + i + NUL, '<code>' + escapeHtml(block) + '</code>');
});

const ALLOWED = new Set(['b','i','u','s','code','pre','a','tg-spoiler']);
text = text.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)[^>]*>/g, (full, tag) => {
  return ALLOWED.has(tag.toLowerCase()) ? full : '';
});

for (const tag of ['b','i','u','s','code','pre']) {
  const openRe = new RegExp('<' + tag + '(\\s[^>]*)?>', 'g');
  const closeRe = new RegExp('</' + tag + '>', 'g');
  const openCount = (text.match(openRe) || []).length;
  const closeCount = (text.match(closeRe) || []).length;
  if (openCount !== closeCount) {
    text = text.replace(new RegExp('</?' + tag + '(\\s[^>]*)?>', 'g'), '');
  }
}

if (text.length > 20000) text = text.slice(0, 19990) + '…';

// === Costruzione replyMarkup dinamico per HTTP Request Telegram ===
// SALVA SUBITO (11/07/2026): seconda riga con il bottone di salvataggio rapido.
// Compare quando c'è una bozza di transfer in gioco (recap mostrato oppure l'agente
// sta ancora chiedendo dettagli su una bozza aperta). Il callback_data "Salva subito"
// è un comando di override già previsto dal system prompt (§4.1 SALVA SUBITO):
// salva con i campi mancanti vuoti, senza altre domande.
const btnsJoined = (Array.isArray(chiave) ? chiave.join(' ') : '');
const hasRecap = /(?:^|\n)\s*(?:📅|🕐|🕒|🔴|🆔)?\s*(?:Data|Ora|Da|Per|Id)\s*:/i.test(text)
              || /TRANSFER\s*\d/i.test(text)
              || /Riepilogo\s+\d+\s+transfer/i.test(text);
const hasConfirmBtn = /conferma/i.test(btnsJoined);
const isCancelFlow = intent === 'cancella' || /cancell/i.test(btnsJoined) || /cancell/i.test(text.slice(0, 200));

// 07/08/2026 (Agostino): «quando chiedo il recap dei servizi di un fornitore non ha senso
// il bottone Salva subito, quei servizi sono GIÀ salvati». Quindi il bottone compare solo
// se c'è davvero qualcosa da salvare: una bozza in registro, oppure una proposta nuova
// fatta in questo turno. Su un elenco letto dal foglio non compare.
const _ID_RX = /TR[\/-]\d{8}[\/-][A-Za-z0-9-]{4,}/g;
const _idsTesto = [...new Set(text.match(_ID_RX) || [])];
let _idsBozza = [];
try {
  for (const r of $('Leggi Bozze').all()) {
    const d = r.json.Dati ?? r.json.dati;
    if (d) _idsBozza = _idsBozza.concat(Object.keys(JSON.parse(String(d)) || {}));
  }
} catch (e) {}
const _cEBozza = _idsTesto.some((x) => _idsBozza.indexOf(x) !== -1);
const _propostaNuova = /Se vuoi puoi aggiungere|procedo col salvataggio|salvataggio in corso/i.test(text);
const _elencoDalFoglio = /Booking\s+\d+\s+of\s+\d+/i.test(text)
  || /\b\d+\s+(?:risultati|transfer trovati|servizi trovati)/i.test(text)
  || /(?:^|\n)\s*Totale:\s*[\d.,]+\s*€/i.test(text);
const showFastSave = (hasRecap || hasConfirmBtn)
  && !isCancelFlow
  && (_cEBozza || _propostaNuova || hasConfirmBtn)
  // 07/08/2026 (Agostino): «quando chiedo un recap dei servizi di un fornitore non ha senso
  // che mi metti il bottone Salva subito, quei servizi sono già salvati».
  // Su un elenco che viene dal foglio il bottone si mostra SOLO se in questo turno l'agente
  // ha davvero proposto una scheda nuova. Se resta una bozza vecchia in coda al messaggio
  // non si perde niente: la riga «Dimmi conferma quando vuoi salvarlo» resta, e «conferma»
  // la salva. Il bottone lì rischiava invece di ri-mandare i servizi già sul gestionale.
  && !(_elencoDalFoglio && !_propostaNuova);

let replyMarkupJson = null;
const kbRows = [];
if (Array.isArray(chiave) && chiave.length > 0) {
  for (const riga of costruisciTastiera(chiave, { max: 10, testo: textBody }).righe) kbRows.push(riga);
}
if (showFastSave && !/salva subito/i.test(btnsJoined)) {
  kbRows.push([{ text: '💾 Salva subito', callback_data: 'Salva subito' }]);
}
if (kbRows.length > 0) {
  replyMarkupJson = JSON.stringify({ inline_keyboard: kbRows });
}

// === NON SI PARLA DEL GESTIONALE SENZA AVERLO APERTO ===
// Nasce il 10/08/2026: su un messaggio di conferma cliente incollato in chat, l'agente ha
// risposto «è un transfer già salvato» senza cercarlo. Sul gestionale non c'era.
//
// Allargata il 21/08/2026, esecuzioni 781061 e 781122. Ore 19:06, il bot scrive:
//     «"Calaponti" — ho due luoghi simili NEL GESTIONALE: quale intendo?»
//     «"Otella" non lo trovo tra le destinazioni.»
// e tre minuti dopo:
//     «la conferma di "Otella" — NON LA TROVO NEL GESTIONALE, dimmi il nome esatto.»
// In tutti e due i turni i tool sul gestionale chiamati sono ZERO: nei sub-run c'è solo
// Simple Memory e il modello. Non ha aperto niente. Poi su quelle due frasi ha costruito
// due domande, e Agostino ha risposto a domande inventate.
//
// La guardia del 10/08 non le prendeva: guardava un tool solo (cerca_servizi) e tre frasi
// («già salvato», «risulta salvato», «non risulta sul gestionale»).
//
// Adesso ogni famiglia di affermazione è legata al tool che la potrebbe provare. Se quel
// tool in questo turno non ha girato, la parte falsa della frase viene sostituita con
// quella vera — e la domanda resta in piedi, perché la domanda spesso è buona: è la
// premessa che è inventata.
const _giroDi = (nome) => { try { return $(nome).all().length > 0; } catch (e) { return false; } };
const _hoCercato = _giroDi('cerca_servizi');           // nome storico, usato più sotto
const _visto = {
  servizi: _hoCercato,
  luoghi: _giroDi('get_destination'),
  fornitori: _giroDi('get_fornitore'),
  autisti: _giroDi('get_autista'),
};
// «non lo trovo nel gestionale» detto in generale: basta che ne abbia aperto UNO qualsiasi.
_visto.qualcosa = _visto.servizi || _visto.luoghi || _visto.fornitori || _visto.autisti
  || _giroDi('get_modalita') || _giroDi('get_mezzo') || _giroDi('cerca_cliente')
  || _giroDi('tool_scheda_cliente');

const _AFFERMAZIONI = [
  { prova: 'luoghi', cosa: 'i luoghi',
    rx: /non\s+(?:l[oa]\s+|li\s+|le\s+)?(?:trovo|ho|vedo)\s+(?:tra|fra|n[ae]ll)[^,.;\n]{0,40}(?:destinazion\w*|luogh\w*|indirizz\w*|post\w*)/gi,
    con: 'non l\'ho ancora cercato fra le destinazioni' },
  { prova: 'luoghi', cosa: 'i luoghi',
    rx: /(?:ho|ci\s+sono|trovo|esistono)\s+(?:due|tre|\d+|pi[ùu])\s+(?:luogh\w*|post\w*|destinazion\w*|indirizz\w*)\s+simil\w*(?:\s+(?:nel|sul)\s+gestionale)?/gi,
    con: 'potrebbero esserci più posti con un nome simile — non ho ancora guardato' },
  { prova: 'fornitori', cosa: 'i fornitori',
    rx: /non\s+(?:l[oa]\s+|li\s+|le\s+)?(?:trovo|ho|vedo)\s+(?:tra|fra|n[ae]ll)[^,.;\n]{0,30}fornitor\w*/gi,
    con: 'non l\'ho ancora cercato fra i fornitori' },
  { prova: 'autisti', cosa: 'gli autisti',
    rx: /non\s+(?:l[oa]\s+|li\s+|le\s+)?(?:trovo|ho|vedo)\s+(?:tra|fra|n[ae]ll)[^,.;\n]{0,30}autist\w*/gi,
    con: 'non l\'ho ancora cercato fra gli autisti' },
  { prova: 'qualcosa', cosa: 'il gestionale',
    rx: /non\s+(?:l[oa]\s+|li\s+|le\s+)?(?:trovo|ho|vedo|risulta)\s*(?:[^,.;\n]{0,20}?)\s*(?:nel|sul)\s+gestionale/gi,
    con: 'non l\'ho ancora cercato nel gestionale' },
];

{
  const _prima = text;
  const _toccate = [];
  let _quante = 0;
  for (const a of _AFFERMAZIONI) {
    if (_visto[a.prova]) continue;                 // ha guardato: la frase è sua e resta
    a.rx.lastIndex = 0;
    if (!a.rx.test(text)) continue;
    a.rx.lastIndex = 0;
    text = text.replace(a.rx, () => { _quante++; return a.con; });
    if (_toccate.indexOf(a.cosa) === -1) _toccate.push(a.cosa);
  }
  // Se la riscrittura ha toccato mezzo messaggio, il rischio è di rigirarlo male: si
  // rimette il testo di prima e si mette la nota in testa. Meglio una nota in più che un
  // messaggio storto.
  if (_quante > 4 || (text.trim().length < 30 && _prima.trim().length >= 30)) {
    text = '⚠️ <b>Non ho aperto il gestionale in questo passaggio.</b> Quello che dico qui '
         + 'sotto su ' + _toccate.join(' e ') + ' è da verificare.\n\n' + _prima;
  } else if (_toccate.length) {
    text += '\n\n⚠️ Su ' + _toccate.join(' e ') + ' non ho ancora aperto il gestionale in '
          + 'questo passaggio: dimmi «controlla» e guardo.';
  }
  var _affermaSenzaProva = _toccate;
}

// I transfer hanno una nota loro, che nomina l'Id: era così dal 10/08 e resta.
const _RX_SALVATO = /(gi[àa]\s+salvat[oa](?:\s+(?:sul|nel)\s+gestionale)?|gi[àa]\s+(?:sul|nel)\s+gestionale|already\s+saved|risulta\s+salvat[oa]|non\s+risulta\s+(?:sul|nel)\s+gestionale|non\s+(?:è|e')\s+salvat[oa](?:\s+(?:sul|nel)\s+gestionale)?)/gi;
if (!_hoCercato && _RX_SALVATO.test(text)) {
  text = text.replace(_RX_SALVATO, 'ancora da verificare sul gestionale');
  const _quale = (_idsTesto && _idsTesto.length) ? _idsTesto[0] : '';
  text += '\n\n⚠️ Non ho aperto il gestionale in questo passaggio: dimmi «controlla '
        + (_quale || 'questo transfer') + '» e lo verifico riga per riga.';
}

// === SALVA E MOSTRA, INVECE DI CHIEDERE (20/08/2026) ===
// Nasce dall'analisi delle chat vere (12/01-09/05/2026, 5.000 messaggi): su 919 domande
// del bot, circa 600 sono «⚠️ Confermi l'inserimento?», e Agostino risponde in una o due
// parole («sì», «vai», «conferma») nel 41% dei casi. Quella domanda non protegge niente:
// è un pedaggio pagato OGNI volta che il lavoro è giusto.
// Regola nuova, decisa da Agostino il 19/08: una scheda NUOVA e COMPLETA si salva subito,
// e il tap si paga solo quando il bot ha sbagliato — bottone Annulla, che passa dalla
// cancellazione morbida di sempre (Allert = Cancellato, mai delete).
// La conferma RESTA dove sbagliare fa male:
//   · soldi in ballo (acconto, deposito, SumUp, preventivi)
//   · tariffa mancante o DA DEFINIRE
//   · cancellazioni e modifiche
//   · schede con dei buchi, o con un ⛔ dentro
// In tutti quei casi non si tocca niente: il giro resta quello di prima.
let salvataggioDiretto = false;
if (intent === 'chat' && hasRecap && hasConfirmBtn && !isCancelFlow && !_elencoDalFoglio) {
  // \s comprende il newline: con \s*\S un campo vuoto («Ora:» e a capo) sembrava pieno
  // perché il controllo saltava alla riga dopo. Dopo i due punti si guarda solo la RIGA.
  const _campo = (s, nomi) => new RegExp('(^|\\n)[^\\p{L}\\n]*[ \\t]*(?:' + nomi + ')[ \\t]*:[ \\t]*\\S', 'iu').test(s);
  const _schede = String(text).split(/\|\|\|/).filter((s) => /TR[\/-]\d{8}[\/-][A-Za-z0-9-]{4,}/.test(s));
  const _tutteComplete = _schede.length > 0 && _schede.every((s) =>
    _campo(s, 'Data|Date') && _campo(s, 'Ora|Time') &&
    _campo(s, 'Da|From') && _campo(s, 'Per|To') && _campo(s, 'Tariffa|Fare'));
  const _tariffaAperta = /Tariffa[^\n]*(?:DA DEFINIRE|da definire)/i.test(text) ||
    /(^|\n)[^\p{L}\n]*\s*Tariffa\s*:\s*0\s*(?:€|$)/imu.test(text);
  // 21/08/2026, esecuzione 780488. Il freno «soldi in ballo» è scattato sulla parola
  // «Acconto» dentro la riga di cortesia «Se vuoi puoi aggiungere: Autista, Veicolo,
  // Acconto»: lì l'acconto NON c'è, è un campo che il bot si offre di riempire. Quella
  // riga si toglie prima di cercare. Un acconto vero — «Acconto: 50» in scheda, o «gli ho
  // preso 50 di caparra» in una frase — resta dov'è e frena come prima.
  const _senzaCortesia = String(text).replace(/(^|\n)[^\n]*Se vuoi puoi aggiung\w*[^\n]*/gi, '');
  const _soldiAperti = /(acconto|deposito|caparra|sumup|preventiv\w+|PREV-\d{4})/i.test(_senzaCortesia);
  // 21/08/2026, esecuzioni 780488 e 780489. Quando il bot dice «tolgo il secondo» o
  // «elimino quello delle 13:30», nel recap resta SOLO la scheda sopravvissuta: la riga da
  // togliere non c'è più, e quindi nessuno la cancella. Salvare da soli in quel turno vuol
  // dire aggiornare una riga e lasciare l'altra sul gestionale dicendo «✅ confermato».
  // Finché la cancellazione di una riga già scritta non passa da un comando vero, qui si
  // chiede. È il caso in cui sbagliare costa: si tiene, non si indovina.
  const _toglieQualcosa = /\b(?:tolgo|levo|elimino|rimuovo|cancello|scarto|togliamo|eliminiamo)\b/i.test(text);
  const _bloccante = text.indexOf('⛔') !== -1;
  if (_tutteComplete && !_tariffaAperta && !_soldiAperti && !_bloccante && !_toglieQualcosa) {
    intent = 'conferma';
    salvataggioDiretto = true;
    replyMarkupJson = null;   // i bottoni li mette il messaggio dopo il salvataggio
  }
}

let cancelId = '';
if (intent === 'cancella') {
  const mId = String(text).match(/Id:\s*([A-Za-z0-9\/_\-]+)/i);
  cancelId = mId ? mId[1].trim() : '';
}
return {
  agent_output_clean: text,
  chiave: chiave,
  telegram: { text: text, parse_mode: 'HTML' },
      intent: intent,
  id: cancelId,
  replyMarkupJson: replyMarkupJson,
  salvataggio_diretto: salvataggioDiretto,
  afferma_senza_prova: (typeof _affermaSenzaProva !== 'undefined' ? _affermaSenzaProva : [])
};

} catch (err) {
  console.error('[Code in JavaScript] fatal error:', err && err.message, err && err.stack);
  return [{
    json: {
      agent_output_clean: '⚠️ Errore temporaneo di elaborazione. Riprova tra qualche secondo.',
      chiave: [],
      telegram: { text: '⚠️ Errore temporaneo di elaborazione. Riprova tra qualche secondo.', parse_mode: 'HTML' },
      intent: 'chat',
      id: '',
      replyMarkupJson: null,
      _error: String(err && err.message || err)
    }
  }];
}
