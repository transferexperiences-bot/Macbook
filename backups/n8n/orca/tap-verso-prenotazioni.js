// ORCA — «il messaggio sparisce di qua e compare di là» (20/08/2026)
//
// Chiesto da Agostino: «quando cliccavo un bottone tu cancellavi i bottoni e facevi un edit
// di quel messaggio — Prenotazione confermata, cancellata, annullata. Dovrai fare la stessa
// cosa, l'unica cosa che il messaggio viene cancellato e viene scritto nell'altra chat».
// L'altra chat, confermata da lui: quella di PRENOTAZIONI.
//
// Sono due bot distinti che parlano tutti e due con lui:
//   Orca         bot «Orca»   (chat 522233722)
//   Prenotazioni bot «Prenotazioni»   (chat 522233722)
// Stesso numero di chat — è il suo id Telegram — ma due conversazioni separate. Per spostare
// un messaggio da una all'altra basta cambiare il TOKEN nell'URL: il chat_id resta identico.
//
// Due modifiche sole, nessun nodo nuovo:
//
//   1. «TG - Remove Buttons» → rinominato «TG - Cancella la scheda».
//      Da editMessageReplyMarkup (tastiera vuota, messaggio che resta) a deleteMessage.
//
//   2. «TG - Send Dynamic» → l'URL diventa un'espressione che sceglie il bot.
//      Il corpo NON cambia: chat_id, testo e bottoni restano quelli di prima.
//
// ⚠️ LA REGOLA CHE PROTEGGE LA CATENA
// Un messaggio mandato dal bot Prenotazioni, se porta dei bottoni, quando lui li preme
// sveglia il workflow PRENOTAZIONI — non Orca. Orca non lo vedrebbe mai e il giro si
// spezzerebbe a metà. Quindi il dirottamento vale solo per le risposte SENZA bottoni, che
// sono poi quelle che lui ha descritto: «Prenotazione confermata / cancellata / annullata».
// Se Orca sta ancora chiedendo qualcosa (risposta con bottoni), la risposta resta su Orca,
// dove i tap funzionano.
//
// E la risposta lunga viene spezzata in più pezzi da «Code Parser Intent», con i bottoni
// solo sull'ultimo: la scelta va fatta guardando TUTTA la risposta, non il singolo pezzo,
// altrimenti i primi pezzi finiscono di là e l'ultimo resta di qua.
//
// Banco: banchi/te/banco-tap-verso-prenotazioni.js

// ---------------------------------------------------------------------------------------
// 1) «TG - Cancella la scheda» — metodo deleteMessage
//
// URL:  https://api.telegram.org/botORCA_TOKEN_REDACTED/deleteMessage
// Body:
//   ={{ (() => { const n = $('Normalizer (kind/text/file_id)').first().json || {};
//       const premuto = (String(n.kind || '') === 'callback') ? Number(n.message_id || 0) : 0;
//       return JSON.stringify({ chat_id: n.chat_id, message_id: premuto }); })() }}
//
// Con message_id 0 (turno che non è un tap) Telegram risponde errore e «neverError» se lo
// mangia: è esattamente quello che già succedeva prima con editMessageReplyMarkup.
function corpoCancella(normalizer) {
  const n = normalizer || {};
  const premuto = String(n.kind || '') === 'callback' ? Number(n.message_id || 0) : 0;
  return { chat_id: n.chat_id, message_id: premuto };
}

// ---------------------------------------------------------------------------------------
// 2) «TG - Send Dynamic» — l'URL sceglie il bot
//
// ={{ (() => {
//   const n = $('Normalizer (kind/text/file_id)').first().json || {};
//   const tap = String(n.kind || '') === 'callback';
//   const conBottoni = $('Code Parser Intent').all().some((i) => !!((i.json || {}).hasButtons));
//   const ORCA = 'botORCA_TOKEN_REDACTED';
//   const PRENOTAZIONI = 'botPRENOTAZIONI_TOKEN_REDACTED';
//   return 'https://api.telegram.org/' + ((tap && !conBottoni) ? PRENOTAZIONI : ORCA) + '/sendMessage';
// })() }}
const ORCA = 'botORCA_TOKEN_REDACTED';
const PRENOTAZIONI = 'botPRENOTAZIONI_TOKEN_REDACTED';

function scegliBot(normalizer, pezziDellaRisposta) {
  const n = normalizer || {};
  const tap = String(n.kind || '') === 'callback';
  const conBottoni = (pezziDellaRisposta || []).some((p) => !!((p || {}).hasButtons));
  return tap && !conBottoni ? PRENOTAZIONI : ORCA;
}

function urlInvio(normalizer, pezziDellaRisposta) {
  return 'https://api.telegram.org/' + scegliBot(normalizer, pezziDellaRisposta) + '/sendMessage';
}

module.exports = { corpoCancella, scegliBot, urlInvio, ORCA, PRENOTAZIONI };
