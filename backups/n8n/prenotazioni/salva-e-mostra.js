// === SALVA E MOSTRA, INVECE DI CHIEDERE — 20/08/2026 ===
// Nodo: «Salva e mostra» in Prenotazioni Transfer 6.0, subito dopo «Code in JavaScript».
//
// Nasce dall'analisi delle chat vere (12/01-09/05/2026, 5.000 messaggi, in ANALISI-CHAT.md):
// su 919 domande del bot, circa 600 sono «⚠️ Confermi l'inserimento?», e Agostino risponde
// in una o due parole nel 41% dei casi. Quella domanda non protegge niente: è un pedaggio
// pagato OGNI volta che il lavoro è giusto.
//
// Regola decisa da Agostino il 19/08/2026: una scheda NUOVA e COMPLETA si salva subito, e
// il tap si paga solo quando il bot ha sbagliato — col bottone Annulla, che passa dalla
// cancellazione morbida di sempre (Allert = Cancellato, mai delete).
//
// La conferma RESTA dov'è seria, e in questi casi non si tocca niente:
//   · soldi in ballo: acconto, deposito, SumUp, preventivi
//   · tariffa mancante, «DA DEFINIRE» o a zero
//   · cancellazioni e modifiche
//   · schede con un campo vuoto, o con un ⛔ nel testo
//   · elenchi letti dal gestionale (quei transfer sono già salvati)
//
// Banco: banchi/te/banco-salva-e-mostra.js
// il nodo gira in «Run Once for All Items»: l'item arriva da $input, ma si tiene anche
// $json come ripiego, così il codice regge in tutte e due le modalità.
const j = (typeof $input !== 'undefined' && $input.first && $input.first().json)
  ? $input.first().json
  : (typeof $json !== 'undefined' ? $json : {});
const text = String(j.agent_output_clean || '');
const chiave = Array.isArray(j.chiave) ? j.chiave : [];
const intent = String(j.intent || 'chat').toLowerCase();

const btns = chiave.join(' ');
const hasRecap = /(?:^|\n)\s*(?:📅|🕐|🕒|🔴|🆔)?\s*(?:Data|Ora|Da|Per|Id)\s*:/i.test(text)
              || /TRANSFER\s*\d/i.test(text);
const hasConfirmBtn = /conferma/i.test(btns);
const isCancelFlow = intent === 'cancella' || /cancell/i.test(btns) || /cancell/i.test(text.slice(0, 200));
const elencoDalFoglio = /Booking\s+\d+\s+of\s+\d+/i.test(text)
  || /\b\d+\s+(?:risultati|transfer trovati|servizi trovati)/i.test(text)
  || /(?:^|\n)\s*Totale:\s*[\d.,]+\s*€/i.test(text);

// Dopo i due punti si guarda solo la RIGA: \s comprende il newline, e con \s*\S un campo
// vuoto («Ora:» e a capo) risultava pieno perché il controllo saltava alla riga dopo.
const campo = (s, nomi) =>
  new RegExp('(^|\\n)[^\\p{L}\\n]*[ \\t]*(?:' + nomi + ')[ \\t]*:[ \\t]*\\S', 'iu').test(s);

let salvataggioDiretto = false;
let intentNuovo = intent;

if (intent === 'chat' && hasRecap && hasConfirmBtn && !isCancelFlow && !elencoDalFoglio) {
  const schede = text.split(/\|\|\|/).filter((s) => /TR[\/-]\d{8}[\/-][A-Za-z0-9-]{4,}/.test(s));
  const tutteComplete = schede.length > 0 && schede.every((s) =>
    campo(s, 'Data|Date') && campo(s, 'Ora|Time') &&
    campo(s, 'Da|From') && campo(s, 'Per|To') && campo(s, 'Tariffa|Fare'));
  const tariffaAperta = /Tariffa[^\n]*(?:DA DEFINIRE|da definire)/i.test(text)
    || /(^|\n)[^\p{L}\n]*[ \t]*Tariffa[ \t]*:[ \t]*0[ \t]*(?:€)?[ \t]*$/imu.test(text);
  const soldiAperti = /(acconto|deposito|caparra|sumup|preventiv\w+|PREV-\d{4})/i.test(text);
  const bloccante = text.indexOf('⛔') !== -1;

  if (tutteComplete && !tariffaAperta && !soldiAperti && !bloccante) {
    intentNuovo = 'conferma';
    salvataggioDiretto = true;
  }
}

return [{ json: Object.assign({}, j, {
  intent: intentNuovo,
  salvataggio_diretto: salvataggioDiretto,
  // se salva da solo, i bottoni di conferma non servono più: quello buono (Annulla) lo
  // mette il messaggio dopo il salvataggio, nel nodo «Bottone Annulla».
  replyMarkupJson: salvataggioDiretto ? null : (j.replyMarkupJson || null)
}) }];
