// =====================================================================
// TransferLib — recupero delle righe rimaste indietro (sostituisce
// `recoverMissedStateEvents`)
// =====================================================================
//
// IL GUASTO CHE CHIUDE.
//
// «Righe che seppure c'è il Pronto non arrivano.» La rete di sicurezza per
// quelle esiste già — `sweepCheck` gira ogni minuto su ogni foglio e chiama
// `recoverMissedStateEvents` — ma fa la domanda sbagliata:
//
//     if (!id) continue;                              // buco 1
//     if (queueOpenIds.has(id)) continue;
//     if (f1IdToStato.get(id) === stato) continue;    // buco 2
//
// **Buco 2.** Confronta lo Stato del foglio struttura con quello scritto in
// `Strutture/Foglio1`. Se combaciano decide «già in sync» e salta. Ma
// combaciare non vuol dire essere arrivato: una riga `Pronto` di qua e
// `Pronto` di là, con la scheda mai partita, viene saltata **per sempre**.
// Ogni minuto, all'infinito, in silenzio.
//
// **Buco 1.** Una riga con lo Stato messo ma la cella Id vuota non viene mai
// ripescata: gli Id li genera solo `onEdit`. Se `onEdit` è saltato — lock
// occupato, trigger triplo, errore ingoiato dal `catch` — quella riga è
// invisibile a tutti e due i meccanismi.
//
// **Buco 3.** Quando salta non lo dice a nessuno: `Logger.log` e via.
//
// LA DOMANDA GIUSTA.
//
// Non «lo Stato combacia con Foglio1?», che non c'entra niente, ma
// **«questa riga l'ha presa n8n?»**. E la risposta è già nella cella:
//
//     Pronto            → nessuno l'ha presa      → si rimanda
//     Pronto: Pending   → n8n ce l'ha in mano     → si lascia stare
//     Confermato        → chiusa                  → si lascia stare
//     (vuoto)           → non è una richiesta     → si lascia stare
//
// Lo Stato è già la ricevuta. Basta leggerlo per quello che è: tutti i casi da
// lasciar stare cadono fuori da soli, perché nessuno di quei valori sta in
// `VALID_STATES`. Niente Foglio1, niente confronti che non significano nulla.
//
// LE DUE FRENATE, perché «rimanda sempre» diventerebbe una valanga.
//
//   1. si aspetta `TE_RECUPERO_ATTESA_MS` dall'ultimo tentativo, così non si
//      riaccoda una riga otto secondi dopo che è stata scartata;
//   2. dopo `TE_RECUPERO_MAX` tentativi a vuoto **si grida** invece di
//      continuare: una riga che non parte dopo cinque giri non è un intoppo,
//      è un guasto, e deve arrivare a un umano.
//
// La memoria dei tentativi è la coda stessa: si contano le righe di Queue con
// quell'Id. Nessuno stato nuovo da mantenere da nessuna parte.
//
// 🔴 `TransferLib` gira a **Head**: una modifica qui è viva su tutti e diciotto
// i fogli nell'istante in cui salvi. Si incolla solo dopo un sì esplicito.
//
// Banco: banchi/te/banco-recupero.js


/** Quanto si aspetta prima di riprovare la stessa riga. */
var TE_RECUPERO_ATTESA_MS = 5 * 60 * 1000;   // 5 minuti

/** Dopo quanti tentativi a vuoto si smette di ritentare e si grida. */
var TE_RECUPERO_MAX = 5;


/**
 * Decide cosa fare di UNA riga. Funzione pura: nessun SpreadsheetApp, nessuna
 * data presa dall'orologio di sistema. Si prova offline.
 *
 * @param {{stato: string, id: string}} riga   com'è adesso sul foglio struttura
 * @param {{aperte: number, totali: number, ultimaMs: (number|null)}} storia
 *        quello che la coda sa di quell'Id: quante righe aperte (PENDING/SENT),
 *        quante in tutto, e quando è stata toccata l'ultima volta
 * @param {number} adessoMs
 * @return {{azione: string, motivo: string, generaId: boolean}}
 *         azione ∈ 'manda' | 'salta' | 'grida'
 */
function teDecidiRecupero_(riga, storia, adessoMs) {
  var stato = ((riga && riga.stato) || "").toString().trim();
  var id    = ((riga && riga.id)    || "").toString().trim();
  storia = storia || { aperte: 0, totali: 0, ultimaMs: null };

  // Unico filtro sullo Stato, e fa tutto il lavoro: «Pronto: Pending»,
  // «Confermato» e la cella vuota non sono in VALID_STATES, quindi cadono qui.
  if (VALID_STATES.indexOf(stato) === -1) {
    return { azione: 'salta', motivo: 'stato «' + stato + '»: non è una richiesta aperta', generaId: false };
  }

  // Già in coda e non ancora chiusa: sta lavorando qualcun altro.
  if (storia.aperte > 0) {
    return { azione: 'salta', motivo: 'già in coda (PENDING/SENT)', generaId: false };
  }

  // Buco 1 chiuso: senza Id non si salta, si genera. Una riga con lo Stato
  // messo è una richiesta vera anche se `onEdit` non le ha dato un Id.
  if (!id) {
    return { azione: 'manda', motivo: 'stato «' + stato + '» senza Id: ne genero uno', generaId: true };
  }

  if (storia.totali >= TE_RECUPERO_MAX) {
    return {
      azione: 'grida',
      motivo: 'stato «' + stato + '» da ' + storia.totali + ' tentativi e non parte',
      generaId: false
    };
  }

  if (storia.ultimaMs && (adessoMs - storia.ultimaMs) < TE_RECUPERO_ATTESA_MS) {
    return { azione: 'salta', motivo: 'riprovata da poco, aspetto', generaId: false };
  }

  // Buco 2 chiuso: qui NON si guarda più Foglio1.
  return {
    azione: 'manda',
    motivo: 'stato «' + stato + '» e nessuno l\'ha presa' +
            (storia.totali ? ' (tentativo ' + (storia.totali + 1) + ')' : ''),
    generaId: false
  };
}


/**
 * Riassume cosa sa la coda, per Id. Un giro solo su Queue invece di uno per riga.
 * @return {Object} id → {aperte, totali, ultimaMs}
 */
function teStoriaCoda_(queueData) {
  var storia = {};
  for (var r = 1; r < (queueData || []).length; r++) {
    var id = (queueData[r][6] || "").toString().trim();
    if (!id) continue;
    var st = (queueData[r][2] || "").toString().trim();
    var ts = queueData[r][3] ? new Date(queueData[r][3]).getTime() : 0;

    if (!storia[id]) storia[id] = { aperte: 0, totali: 0, ultimaMs: null };
    storia[id].totali++;
    if (st === "PENDING" || st === "SENT") storia[id].aperte++;
    if (ts && (!storia[id].ultimaMs || ts > storia[id].ultimaMs)) storia[id].ultimaMs = ts;
  }
  return storia;
}


/**
 * Genera un Id con la stessa regola di `onEdit`: se cambiassero le due regole
 * si ritroverebbero Id di due forme diverse sullo stesso foglio.
 */
function teNuovoId_(adesso) {
  var d = adesso || new Date();
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  return "TR-" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
         "-" + Utilities.getUuid();
}


/**
 * Grida: la riga finisce in coda marcata ERROR con il motivo, così resta
 * scritta e la ritrovi. Se in Proprietà script ci sono `TE_TELEGRAM_TOKEN` e
 * `TE_TELEGRAM_CHAT`, arriva anche un messaggio.
 *
 * Il token NON sta nel codice: sta nelle proprietà, così questo file si può
 * committare senza pulire niente.
 */
function teGrida_(queueSheet, args, i, id, motivo) {
  var testo = "🚨 " + args.fileName + " riga " + (FIRST_DATA_ROW + i) +
              " — " + motivo + " (Id " + id + ")";

  queueSheet.appendRow([
    args.fileName, args.spreadsheetId, "ERROR", new Date(),
    TE_RECUPERO_MAX, testo, id, FIRST_DATA_ROW + i, args.fornVals[i][0]
  ]);
  Logger.log(testo);

  try {
    var p = PropertiesService.getScriptProperties();
    var tok = p.getProperty("TE_TELEGRAM_TOKEN");
    var chat = p.getProperty("TE_TELEGRAM_CHAT");
    if (tok && chat) {
      UrlFetchApp.fetch("https://api.telegram.org/bot" + tok + "/sendMessage", {
        method: "post",
        payload: { chat_id: chat, text: testo },
        muteHttpExceptions: true
      });
    }
  } catch (e) {
    Logger.log("Avviso Telegram non partito: " + e);
  }
}


/**
 * Rete di sicurezza: ogni minuto ripesca le righe con lo Stato messo che
 * nessuno ha preso. Sostituisce la vecchia `recoverMissedStateEvents`.
 *
 * Cosa NON fa più: leggere `Strutture/Foglio1` e confrontarci lo Stato. Quel
 * confronto era il buco 2 — e toglierlo rende il giro anche più leggero, il
 * che non guasta visto che `sweepCheck` andava in timeout undici volte il 16/08.
 */
function recoverMissedStateEvents(args) {
  var struttureSS = SpreadsheetApp.openById(STRUTTURE_ID);
  var queueSheet = struttureSS.getSheetByName("Queue");
  if (!queueSheet) {
    Logger.log("Queue mancante in Strutture");
    return 0;
  }

  var storia = teStoriaCoda_(queueSheet.getDataRange().getValues());

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    Logger.log("Lock non disponibile, skip questo giro");
    return 0;
  }

  var adesso = new Date();
  var adessoMs = adesso.getTime();
  var queued = 0;

  try {
    for (var i = 0; i < args.numRows; i++) {
      var stato = (args.statoVals[i][0] || "").toString().trim();
      var id    = (args.idVals[i][0]    || "").toString().trim();

      var esito = teDecidiRecupero_(
        { stato: stato, id: id },
        storia[id] || { aperte: 0, totali: 0, ultimaMs: null },
        adessoMs);

      if (esito.azione === 'salta') continue;

      if (esito.azione === 'grida') {
        teGrida_(queueSheet, args, i, id, esito.motivo);
        storia[id].aperte++;          // gridato una volta, non si rigrida ogni minuto
        continue;
      }

      // azione === 'manda'
      if (esito.generaId) {
        id = teNuovoId_(adesso);
        // L'Id va scritto sul foglio struttura, altrimenti al giro dopo la riga
        // è di nuovo senza Id e se ne genera un altro: si moltiplicherebbero.
        SpreadsheetApp.openById(args.spreadsheetId)
          .getSheetByName(SHEET_NAME)
          .getRange(FIRST_DATA_ROW + i, args.colId)
          .setValue(id);
        SpreadsheetApp.flush();
        Logger.log("Sweep: Id generato per " + args.fileName +
                   " riga " + (FIRST_DATA_ROW + i) + ": " + id);
      }

      queueSheet.appendRow([
        args.fileName,              // A: FileName
        args.spreadsheetId,         // B: SpreadsheetId
        "PENDING",                  // C: Status
        adesso,                     // D: LastUpdate
        0,                          // E: Attempts
        "",                         // F: Error
        id,                         // G: TransferId — comanda questo
        FIRST_DATA_ROW + i,         // H: RowNumber — solo suggerimento
        args.fornVals[i][0]         // I: Fornitore
      ]);

      if (!storia[id]) storia[id] = { aperte: 0, totali: 0, ultimaMs: null };
      storia[id].aperte++;
      storia[id].totali++;
      storia[id].ultimaMs = adessoMs;
      queued++;
      Logger.log("Sweep: recuperato " + args.fileName + " Id " + id + " — " + esito.motivo);
    }
  } finally {
    lock.releaseLock();
  }
  return queued;
}


/* =====================================================================
 * DA FARE INSIEME A QUESTO, dentro `processFile`:
 *
 * `recoverMissedStateEvents` adesso deve poter SCRIVERE l'Id sul foglio, e per
 * farlo gli serve sapere in quale colonna sta. Nella chiamata, aggiungere
 * `colId`:
 *
 *     const queued = recoverMissedStateEvents({
 *       spreadsheetId: spreadsheetId,
 *       fileName: fileName,
 *       statoVals: statoVals,
 *       idVals: idVals,
 *       fornVals: fornVals,
 *       numRows: numRows,
 *       colId: col.id            // <-- riga nuova
 *     });
 *
 * `col.id` è già lì sopra, risolto da `buildColMap`: si passa e basta.
 * ===================================================================== */
