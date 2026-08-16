/**
 * ==========================================================================
 * TRANSFER QUEUE PROCESSOR — v3
 * Progetto: 1JPUJQRac9_W78r5L3nDILLcvxVfU05dMAEn1qh0CHci_SbNjMoczzrUs
 * Legato al file centrale Strutture (tab Foglio1 + Queue).
 * ==========================================================================
 *
 * COSA CAMBIA RISPETTO ALLA v2, E PERCHÉ.
 *
 * 1) MAX_VERIFY_MS: 6000 -> 30000.
 *    Era la causa dei doppioni. Dopo il POST si aspetta che n8n riscriva
 *    ": Pending" sulla riga struttura. n8n ci mette ~13 secondi
 *    (esecuzione 742784: Pending Transfer1 parte a 5,19 s e dura 8,18 s).
 *    Con 6 secondi la finestra si chiudeva sempre prima, la riga veniva
 *    segnata SENT e dopo 90 secondi rimandata. Prova: Suite 10/Giovì riga
 *    134, 16:47:20 -> 16:50:20, due giri da 90 s, stesso Id.
 *    30000 era il valore prima del refactor 2026-06-08 (processQueue_BACKUP).
 *
 * 2) Colonne per NOME, non per numero fisso.
 *    La v2 leggeva lo Stato da getRange(riga, 22) e l'Id da sourceRow[23],
 *    uguale per tutti e 18 i file struttura. Basta una colonna inserita da
 *    una struttura e si legge la cella sbagliata. Ora le colonne si
 *    risolvono dalle intestazioni. Se un nome non si trova si torna al
 *    numero di prima (comportamento identico alla v2) e si scrive un
 *    avviso nella colonna Error della Queue: non si perde niente e si vede.
 *
 * 3) La riga si conferma per Id, non si prende per numero.
 *    La v2 si fidava del RowNumber salvato in Queue dalla scansione, anche
 *    di ore prima. Se nel frattempo qualcuno inserisce o cancella una riga,
 *    quel numero punta al transfer di un altro cliente — e si manda quello.
 *    Ora il RowNumber è solo un suggerimento: si controlla che l'Id di
 *    quella riga sia quello atteso; se non torna si cerca l'Id nella
 *    colonna Id. Se l'Id non c'è, la riga va in ERROR e NON si manda niente.
 *    Regola: comanda l'Id, mai la posizione.
 *
 * Colonne Queue: A=FileName, B=SpreadsheetId, C=Status,
 *   D=LastUpdate, E=Attempts, F=Error, G=TransferId, H=RowNumber, I=Fornitore
 */

var TE_WEBHOOK_URL = "https://transfer.app.n8n.cloud/webhook/transfer/approve/request";

var TE_MAX_VERIFY_MS   = 30000;  // (1) era 6000
var TE_RESEND_AFTER_MS = 90000;
var TE_MAX_ATTEMPTS    = 6;
var TE_TIME_BUDGET_MS  = 270000;
var TE_VERIFY_POLL_MS  = 1000;

/** Nomi accettati per ogni campo. Il primo è quello canonico. */
var TE_HEADER_ALIASES = {
  mese:              ["Mese"],
  note:              ["Note"],
  data:              ["Data"],
  ora:               ["Time", "Ora"],
  trs_da:            ["TRS> DA"],
  trs_per:           ["TRS <PER"],
  pax:               ["PAX"],
  nome:              ["Nome"],
  fornitore:         ["Fornitore"],
  volo:              ["Volo"],
  cell:              ["cell.", "cell", "Cellulare"],
  autista:           ["Autista"],
  veicolo:           ["Veicolo"],
  h_extra_ritardi:   ["h extra/ritardi"],
  tariffa_a_noi:     ["Tariffa a noi"],
  tariffa:           ["Tariffa"],
  fee:               ["Fee"],
  modalita:          ["Modalità"],
  tipologia_incasso: ["Tipologia incasso"],
  n_pratica:         ["n. pratica", "mail"],
  addebitato:        ["Addebitato"],
  stato:             ["Stato"],
  eseguito:          ["Eseguito"],
  id:                ["Id"]
};

/** Numeri di colonna della v2: usati solo come rete se il nome non si trova. */
var TE_LEGACY_COL = {
  mese: 1, note: 2, data: 3, ora: 4, trs_da: 5, trs_per: 6, pax: 7, nome: 8,
  fornitore: 9, volo: 10, cell: 11, autista: 12, veicolo: 13, h_extra_ritardi: 14,
  tariffa_a_noi: 15, tariffa: 16, fee: 17, modalita: 18, tipologia_incasso: 19,
  n_pratica: 20, addebitato: 21, stato: 22, eseguito: 23, id: 24
};


// ==========================================================================
// FUNZIONI PURE — nessun SpreadsheetApp qui dentro, così si provano offline
// (banco: banchi/te/banco-queue.js)
// ==========================================================================

/** Intestazioni sporche: "Tariffa " con lo spazio in coda esiste davvero. */
function teNormHeader_(h) {
  return (h === null || h === undefined ? "" : h)
    .toString().trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Dalla riga di intestazione ricava il numero di colonna (1-based) di ogni campo.
 * Se un campo non si trova, ripiega sul numero della v2 e lo segnala.
 */
function teBuildColMap_(headerRow) {
  var col = {};
  var warnings = [];
  var norm = [];
  var i;
  for (i = 0; i < (headerRow || []).length; i++) norm.push(teNormHeader_(headerRow[i]));

  for (var key in TE_HEADER_ALIASES) {
    if (!TE_HEADER_ALIASES.hasOwnProperty(key)) continue;
    var aliases = TE_HEADER_ALIASES[key];
    var found = 0;
    for (var a = 0; a < aliases.length && !found; a++) {
      var target = teNormHeader_(aliases[a]);
      for (i = 0; i < norm.length; i++) {
        if (norm[i] === target) { found = i + 1; break; }
      }
    }
    if (found) {
      col[key] = found;
    } else {
      col[key] = TE_LEGACY_COL[key];
      warnings.push(key);
    }
  }
  return { col: col, warnings: warnings };
}

/**
 * Trova la riga che porta davvero quell'Id.
 * hintRow (il RowNumber salvato in Queue) è solo una scorciatoia: vale se
 * l'Id di quella riga combacia. Altrimenti si cerca. -1 = non trovato.
 *
 * idValues: array di valori della colonna Id, dalla riga firstDataRow in giù.
 */
function teFindRowById_(idValues, wantedId, hintRow, firstDataRow) {
  var want = (wantedId === null || wantedId === undefined ? "" : wantedId).toString().trim();
  if (!want) return -1;
  var base = firstDataRow || 2;

  var hintIdx = (hintRow || 0) - base;
  if (hintIdx >= 0 && hintIdx < idValues.length) {
    var atHint = (idValues[hintIdx] || "").toString().trim();
    if (atHint === want) return hintRow;
  }

  for (var i = 0; i < idValues.length; i++) {
    if ((idValues[i] || "").toString().trim() === want) return base + i;
  }
  return -1;
}

/** Costruisce il payload leggendo per nome di colonna. */
function teBuildPayload_(sourceRow, col, meta) {
  function v(key) {
    var c = col[key];
    if (!c || c < 1 || c > sourceRow.length) return "";
    var val = sourceRow[c - 1];
    return (val === null || val === undefined) ? "" : val;
  }
  return {
    spreadsheetId: meta.spreadsheetId,
    spreadsheetUrl: meta.spreadsheetUrl,
    fileName: meta.fileName,
    sheetName: meta.sheetName,
    riga: meta.riga,
    data: {
      mese:              v("mese"),
      note:              v("note"),
      data:              meta.dataFormattata,
      ora:               v("ora"),
      trs_da:            v("trs_da"),
      trs_per:           v("trs_per"),
      pax:               v("pax"),
      nome:              v("nome"),
      fornitore:         v("fornitore"),
      volo:              v("volo"),
      cell:              v("cell"),
      autista:           v("autista"),
      veicolo:           v("veicolo"),
      h_extra_ritardi:   v("h_extra_ritardi"),
      tariffa_a_noi:     v("tariffa_a_noi"),
      tariffa:           v("tariffa"),
      fee:               v("fee"),
      modalita:          v("modalita"),
      tipologia_incasso: v("tipologia_incasso"),
      n_pratica:         v("n_pratica"),
      addebitato:        v("addebitato"),
      stato:             v("stato"),
      eseguito:          v("eseguito"),
      id:                v("id")
    }
  };
}

/** L'ack di n8n: lo Stato diventa "<qualcosa>: Pending". */
function teIsAck_(statoValue) {
  return (statoValue === null || statoValue === undefined ? "" : statoValue)
    .toString().indexOf(": Pending") !== -1;
}


// ==========================================================================
// TIMER
// ==========================================================================

function processQueueTimer1() { processQueueTimer("Timer1"); }

function processQueueTimer(timerName) {
  try {
    Logger.log("\n⏰ " + timerName + " - " + new Date().toISOString());
    var queueSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Queue");
    if (!queueSheet) { Logger.log("❌ Queue non trovato!"); return; }

    var data = queueSheet.getDataRange().getValues();
    if (data.length <= 1) { Logger.log("📭 Queue vuota"); return; }

    var pendingCount = 0;
    for (var i = 1; i < data.length; i++) {
      if (data[i][2] === "PENDING" || data[i][2] === "SENT") pendingCount++;
    }
    Logger.log("📊 " + (data.length - 1) + " righe, " + pendingCount + " da lavorare");
    if (pendingCount === 0) return;

    processQueue();
  } catch (err) {
    Logger.log("❌ " + timerName + ": " + err + "\n" + err.stack);
  }
}


// ==========================================================================
// PROCESSO PRINCIPALE
// ==========================================================================

function processQueue() {
  var queueSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Queue");
  if (!queueSheet) return;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { Logger.log("Lock occupato, skip"); return; }

  var t0 = Date.now();
  try {
    var data = queueSheet.getDataRange().getValues();

    for (var i = 1; i < data.length; i++) {
      if (Date.now() - t0 > TE_TIME_BUDGET_MS) {
        Logger.log("Budget tempo raggiunto, continuo al prossimo timer");
        break;
      }

      var row           = data[i];
      var fileName      = row[0];
      var spreadsheetId = row[1];
      var status        = row[2];
      var transferId    = (row[6] || "").toString().trim();
      var hintRow       = row[7];
      var rowIndex      = i + 1;

      if (status === "DONE" || status === "ERROR") continue;

      var attempts = parseInt(row[4], 10);
      if (isNaN(attempts)) attempts = 0;   // righe vecchie: colonna E era un booleano
      var lastTs = row[3] ? new Date(row[3]).getTime() : 0;

      try {
        var sourceSpreadsheet = SpreadsheetApp.openById(spreadsheetId);
        var sourceSheet = sourceSpreadsheet.getSheetByName("Prenotazioni");
        if (!sourceSheet) throw new Error("Foglio Prenotazioni non trovato");

        var lastCol = Math.max(24, sourceSheet.getLastColumn());
        var lastRow = sourceSheet.getLastRow();
        if (lastRow < 2) throw new Error("Foglio Prenotazioni vuoto");

        // (2) colonne per nome
        var headerRow = sourceSheet.getRange(1, 1, 1, lastCol).getValues()[0];
        var mapped = teBuildColMap_(headerRow);
        var col = mapped.col;

        // (3) la riga si conferma per Id
        var idValues = sourceSheet.getRange(2, col.id, lastRow - 1, 1).getValues()
          .map(function (r) { return r[0]; });
        var rowNumber = teFindRowById_(idValues, transferId, hintRow, 2);

        if (rowNumber === -1) {
          teMarkQueue_(queueSheet, rowIndex, "ERROR", attempts,
            "Id " + transferId + " non trovato nella colonna Id di " + fileName +
            " — non mando niente");
          continue;
        }
        if (rowNumber !== hintRow) {
          Logger.log("↔️ " + fileName + " Id " + transferId +
            ": riga spostata da " + hintRow + " a " + rowNumber);
          queueSheet.getRange(rowIndex, 8).setValue(rowNumber);
        }

        var avviso = mapped.warnings.length
          ? "colonne non trovate per nome, uso i numeri vecchi: " + mapped.warnings.join(", ")
          : "";
        if (avviso) Logger.log("⚠️ " + fileName + ": " + avviso);

        var sourceRow = sourceSheet.getRange(rowNumber, 1, 1, lastCol).getValues()[0];

        // Già preso in carico da n8n: chiudi e vai
        if (teIsAck_(sourceRow[col.stato - 1])) {
          teMarkQueue_(queueSheet, rowIndex, "DONE", "", avviso);
          continue;
        }

        if (status === "SENT" && (Date.now() - lastTs) < TE_RESEND_AFTER_MS) continue;

        if (attempts >= TE_MAX_ATTEMPTS) {
          teMarkQueue_(queueSheet, rowIndex, "ERROR", attempts,
            "Max tentativi (" + attempts + ") senza conferma writeback");
          continue;
        }

        var payload = teBuildPayload_(sourceRow, col, {
          spreadsheetId: spreadsheetId,
          spreadsheetUrl: sourceSpreadsheet.getUrl(),
          fileName: fileName,
          sheetName: "Prenotazioni",
          riga: rowNumber,
          dataFormattata: formatDate(sourceRow[col.data - 1])
        });

        var code = -1;
        try {
          var response = UrlFetchApp.fetch(TE_WEBHOOK_URL, {
            method: "post",
            contentType: "application/json",
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
          });
          code = response.getResponseCode();
        } catch (eFetch) {
          code = -1;
        }
        attempts++;

        if (code >= 200 && code < 300) {
          // (1) finestra a 30 secondi: n8n scrive l'ack intorno al secondo 13
          var ack = false;
          var vEnd = Date.now() + TE_MAX_VERIFY_MS;
          while (Date.now() < vEnd) {
            Utilities.sleep(TE_VERIFY_POLL_MS);
            if (teIsAck_(sourceSheet.getRange(rowNumber, col.stato).getValue())) {
              ack = true;
              break;
            }
          }
          if (ack) {
            teMarkQueue_(queueSheet, rowIndex, "DONE", "", avviso);
          } else {
            teMarkQueue_(queueSheet, rowIndex, "SENT", attempts,
              "Inviato HTTP " + code + ", nessun writeback entro " +
              (TE_MAX_VERIFY_MS / 1000) + "s (tent " + attempts + ")" +
              (avviso ? " | " + avviso : ""));
          }
        } else {
          teMarkQueue_(queueSheet, rowIndex,
            attempts >= TE_MAX_ATTEMPTS ? "ERROR" : "PENDING", attempts,
            "HTTP " + code + " - riprovo (tent " + attempts + ")");
        }

      } catch (err) {
        var att2 = attempts + 1;
        teMarkQueue_(queueSheet, rowIndex,
          att2 >= TE_MAX_ATTEMPTS ? "ERROR" : "PENDING", att2,
          err.toString().substring(0, 500));
        continue;
      }
    }
  } finally {
    lock.releaseLock();
  }
}

/** Scrive Status, LastUpdate, Attempts, Error in un colpo solo. */
function teMarkQueue_(queueSheet, rowIndex, status, attempts, error) {
  queueSheet.getRange(rowIndex, 3, 1, 4).setValues([[
    status, new Date(), attempts === undefined ? "" : attempts, error || ""
  ]]);
  SpreadsheetApp.flush();
}

function formatDate(value) {
  try {
    if (!value) return "";
    if (value instanceof Date) {
      return Utilities.formatDate(value, Session.getScriptTimeZone(), "dd/MM/yyyy");
    }
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy");
  } catch (err) {
    return String(value || "");
  }
}


// ==========================================================================
// SETUP E MANUTENZIONE
// ==========================================================================

function installAllTimerTriggers() {
  removeAllTimerTriggers();
  ScriptApp.newTrigger("processQueueTimer1").timeBased().everyMinutes(1).create();
  Logger.log("✅ trigger processQueueTimer1 ogni minuto");
}

function removeAllTimerTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  triggers.forEach(function (trigger) {
    if (trigger.getHandlerFunction().indexOf("processQueueTimer") === 0) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  Logger.log("✅ " + removed + " trigger rimossi");
}

/**
 * Righe rimaste in ERROR dal refactor 2026-06-08, quando la colonna E è
 * passata da booleano Processing a contatore Attempts.
 * Le rimette in PENDING con il contatore azzerato. Da lanciare a mano, una volta.
 */
function sbloccaErroriVecchi() {
  var queueSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Queue");
  if (!queueSheet) return;
  var data = queueSheet.getDataRange().getValues();
  var n = 0;
  for (var i = 1; i < data.length; i++) {
    var err = (data[i][5] || "").toString();
    if (data[i][2] === "ERROR" && err.indexOf("Cannot convert") !== -1) {
      teMarkQueue_(queueSheet, i + 1, "PENDING", 0, "");
      n++;
    }
  }
  Logger.log("✅ " + n + " righe sbloccate");
}

function debugQueue() {
  var queueSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Queue");
  if (!queueSheet) { Logger.log("❌ Queue non trovato!"); return; }
  var data = queueSheet.getDataRange().getValues();
  Logger.log("📊 DEBUG - " + (data.length - 1) + " righe");
  for (var i = 1; i < data.length; i++) {
    Logger.log("  " + (i + 1) + ": " + data[i][0] + " | " + data[i][2] +
      " | TID=" + data[i][6] + " | Row=" + data[i][7]);
  }
}
