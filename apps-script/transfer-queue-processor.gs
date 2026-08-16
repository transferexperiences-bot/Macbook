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

/**
 * Nomi accettati per ogni campo. Il primo è quello canonico.
 *
 * REGOLA: qui dentro si mettono solo nomi INTERI e non ambigui. Il confronto
 * è esatto (dopo normalizzazione), MAI "contiene". Se cercassimo per pezzi,
 * "Tariffa" beccherebbe "Tariffa a noi" e finiremmo a mandare il costo nostro
 * al posto del prezzo al cliente. Su una riga vera vuol dire fatturare storto.
 *
 * Per questo i campi dei soldi e l'Id hanno pochi alias, scelti stretti; i
 * campi innocui (nome, note, volo) ne hanno di più.
 */
var TE_HEADER_ALIASES = {
  mese:              ["Mese"],
  note:              ["Note", "Nota", "Annotazioni"],
  data:              ["Data", "Data servizio", "Giorno"],
  ora:               ["Time", "Ora", "Orario", "Ora pickup"],
  trs_da:            ["TRS> DA", "TRS DA", "Da", "Partenza", "Pickup"],
  trs_per:           ["TRS <PER", "TRS PER", "Per", "Destinazione", "Arrivo"],
  pax:               ["PAX", "N. PAX", "Passeggeri", "Persone"],
  nome:              ["Nome", "Nome cliente", "Cliente", "Ospite"],
  fornitore:         ["Fornitore", "Struttura"],
  volo:              ["Volo", "Flight", "N. volo"],
  cell:              ["cell.", "cell", "Cellulare", "Telefono", "Tel."],
  autista:           ["Autista", "Driver"],
  veicolo:           ["Veicolo", "Mezzo"],
  h_extra_ritardi:   ["h extra/ritardi", "h extra", "Extra/ritardi"],
  tariffa_a_noi:     ["Tariffa a noi", "Costo a noi"],
  tariffa:           ["Tariffa", "Prezzo"],
  fee:               ["Fee", "Commissione"],
  modalita:          ["Modalità", "Modalita"],
  tipologia_incasso: ["Tipologia incasso", "Tipologia d'incasso"],
  n_pratica:         ["n. pratica", "mail", "email", "Pratica"],
  addebitato:        ["Addebitato"],
  stato:             ["Stato", "Status"],
  eseguito:          ["Eseguito", "Svolto"],
  id:                ["Id", "Id transfer"]
};

/**
 * Ordine di risoluzione: prima i nomi più specifici, così una colonna presa
 * non può più essere rubata. "Tariffa a noi" si prende la sua prima che
 * "Tariffa" vada a cercare; Id e Stato per primi perché sono i due che, se
 * sbagliati, fanno danno vero.
 */
var TE_RESOLVE_ORDER = [
  "id", "stato", "eseguito", "addebitato",
  "tariffa_a_noi", "tipologia_incasso", "h_extra_ritardi", "n_pratica",
  "trs_da", "trs_per", "tariffa", "fee", "modalita",
  "mese", "note", "data", "ora", "pax", "nome", "fornitore", "volo",
  "cell", "autista", "veicolo"
];

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

/**
 * Riduce un'intestazione alla sua forma nuda: via maiuscole, accenti, spazi e
 * punteggiatura. Serve perché sui fogli veri gli stessi nomi sono scritti in
 * modi diversi:
 *   "Tariffa " (con lo spazio in coda) = "Tariffa"
 *   "cell." = "cell" = "Cell"
 *   "Modalità" = "Modalita"
 *   "TRS> DA" = "TRS DA" = "trs>da"
 *   "n. pratica" = "N Pratica"
 * Restano invece ben distinti "tariffa" e "tariffaanoi": sono cose diverse.
 */
function teNormHeader_(h) {
  var s = (h === null || h === undefined ? "" : h).toString().toLowerCase();
  s = s.replace(/[àáâãä]/g, "a").replace(/[èéêë]/g, "e").replace(/[ìíîï]/g, "i")
       .replace(/[òóôõö]/g, "o").replace(/[ùúûü]/g, "u")
       .replace(/[ç]/g, "c").replace(/[ñ]/g, "n");
  return s.replace(/[^a-z0-9]+/g, "");
}

/**
 * Dalla riga di intestazione ricava il numero di colonna (1-based) di ogni campo.
 *
 * Tre passaggi:
 *   1. per NOME, nell'ordine di specificità, e una colonna presa non si tocca più;
 *   2. chi non si è trovato ripiega sul numero della v2, ma solo se quella
 *      colonna è ancora libera (altrimenti scriverebbe sopra a un altro campo);
 *   3. chi resta fuori vale null: il chiamante decide se è grave.
 *
 * Non esiste nessun passaggio "somiglia a": preferisco un campo vuoto e un
 * avviso a un campo pieno col valore sbagliato.
 */
function teBuildColMap_(headerRow) {
  var norm = [];
  var i, k, key;
  for (i = 0; i < (headerRow || []).length; i++) norm.push(teNormHeader_(headerRow[i]));

  var col = {};
  var warnings = [];
  var claimed = {};   // numero di colonna -> campo che se l'è presa

  // 1) per nome
  for (k = 0; k < TE_RESOLVE_ORDER.length; k++) {
    key = TE_RESOLVE_ORDER[k];
    var aliases = TE_HEADER_ALIASES[key] || [];
    var found = 0;
    for (var a = 0; a < aliases.length && !found; a++) {
      var target = teNormHeader_(aliases[a]);
      if (!target) continue;
      for (i = 0; i < norm.length; i++) {
        if (norm[i] === target && !claimed[i + 1]) { found = i + 1; break; }
      }
    }
    if (found) { col[key] = found; claimed[found] = key; }
  }

  // 2) rete: il numero della v2, se libero
  for (k = 0; k < TE_RESOLVE_ORDER.length; k++) {
    key = TE_RESOLVE_ORDER[k];
    if (col[key]) continue;
    var legacy = TE_LEGACY_COL[key];
    if (legacy && !claimed[legacy]) {
      col[key] = legacy;
      claimed[legacy] = key;
      warnings.push(key + " → colonna " + legacy + " (per posizione)");
    } else {
      col[key] = null;
      warnings.push(key + " → NON RISOLTA");
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

// Timer2 e Timer3 non si usano più (dal 08/07 gira solo Timer1), ma restano
// come alias: se in giro c'è ancora un attivatore vecchio che punta a questi
// nomi, continua a funzionare invece di andare in errore ogni minuto.
function processQueueTimer2() { processQueueTimer("Timer2"); }
function processQueueTimer3() { processQueueTimer("Timer3"); }

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

      if (status === "DONE" || status === "ERROR" || status === "IGNORATO") continue;

      // Righe senza TransferId: residui del refactor 08/06, nate senza Id.
      // Non sono transfer persi e non c'è niente da mandare. Si archiviano come
      // IGNORATO — non ERROR, che vorrebbe dire "guasto da guardare".
      if (!transferId) {
        teMarkQueue_(queueSheet, rowIndex, "IGNORATO", "",
          "Riga di coda senza TransferId (residuo del refactor 08/06) — niente da mandare");
        continue;
      }

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

        // Senza Stato o senza Id non si tira a indovinare: sono le due colonne
        // che, sbagliate, mandano il transfer di un altro o marcano la riga
        // sbagliata. Meglio fermarsi e dirlo.
        if (!col.stato || !col.id) {
          teMarkQueue_(queueSheet, rowIndex, "ERROR", attempts,
            "Su " + fileName + " non riesco a individuare le colonne " +
            (!col.stato ? "Stato " : "") + (!col.id ? "Id" : "").trim() +
            " — non mando niente. Controlla le intestazioni della riga 1.");
          continue;
        }

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
 * Manutenzione della coda, da lanciare a mano. Fa due cose distinte:
 *
 *  a) Righe SENZA TransferId -> IGNORATO.
 *     Sono residui del refactor 2026-06-08: nate senza Id e senza RowNumber,
 *     è da lì che veniva "Exception: Cannot convert '' to int.". Non sono
 *     transfer persi, non c'è niente da mandare. IGNORATO le toglie di mezzo
 *     senza cancellare niente e senza farle sembrare un guasto aperto.
 *
 *  b) Righe in ERROR CON un TransferId -> PENDING, contatore azzerato.
 *     Quelle sì che vale la pena riprovare.
 *
 * Si può rilanciare quante volte si vuole: è idempotente.
 */
function sistemaCodaVecchia() {
  var queueSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Queue");
  if (!queueSheet) return;
  var data = queueSheet.getDataRange().getValues();
  var ignorate = 0, riaperte = 0;

  for (var i = 1; i < data.length; i++) {
    var status = data[i][2];
    var transferId = (data[i][6] || "").toString().trim();
    if (status === "DONE" || status === "IGNORATO") continue;

    if (!transferId) {
      teMarkQueue_(queueSheet, i + 1, "IGNORATO", "",
        "Riga di coda senza TransferId (residuo del refactor 08/06) — niente da mandare");
      ignorate++;
    } else if (status === "ERROR") {
      teMarkQueue_(queueSheet, i + 1, "PENDING", 0, "");
      riaperte++;
    }
  }
  Logger.log("✅ " + ignorate + " righe senza Id archiviate, " + riaperte + " riaperte");
}

/** Vecchio nome, lasciato per non rompere niente. */
function sbloccaErroriVecchi() { sistemaCodaVecchia(); }

/**
 * Mostra, per ogni struttura che compare in Queue, come si risolve ogni colonna.
 * Da lanciare a mano quando si sospetta un'intestazione storta, o dopo che
 * qualcuno ha messo mano a un foglio. Non scrive niente.
 */
function diagnosticaIntestazioni() {
  var queueSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Queue");
  if (!queueSheet) return;
  var data = queueSheet.getDataRange().getValues();

  var visti = {};
  for (var i = 1; i < data.length; i++) {
    var id = data[i][1], nome = data[i][0];
    if (!id || visti[id]) continue;
    visti[id] = true;

    try {
      var sheet = SpreadsheetApp.openById(id).getSheetByName("Prenotazioni");
      if (!sheet) { Logger.log("— " + nome + ": nessuna tab Prenotazioni"); continue; }
      var lastCol = Math.max(24, sheet.getLastColumn());
      var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      var m = teBuildColMap_(header);
      if (m.warnings.length) {
        Logger.log("⚠️ " + nome + " — Stato=" + m.col.stato + " Id=" + m.col.id +
          " | da guardare: " + m.warnings.join("; "));
      } else {
        Logger.log("✅ " + nome + " — tutto per nome. Stato=" + m.col.stato +
          " Id=" + m.col.id);
      }
    } catch (e) {
      Logger.log("❌ " + nome + ": " + e);
    }
  }
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
