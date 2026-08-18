/**
 * ========================================================================
 * FOGLI STRUTTURA — variante SUITE 10 (copia di lavoro)
 * ========================================================================
 *
 * PROVENIENZA. Incollato da Agostino il 18/08/2026 dal progetto Apps Script
 * legato al foglio **Suite 10/Giovì** (`1Rv-tlt3m-8YdRA574aBJYY_QZnIlgJgxEEVtK24wXkY`).
 * Due file: lo *shim* di `TransferLib` e `enqueueTransfer`.
 * Gli script legati ai fogli non sono leggibili da Drive (vedi
 * `backups/apps-script/INVENTARIO.md`), quindi questa copia arriva a mano.
 *
 * PERCHÉ STA QUI. Perché NON è lo stesso codice di `struttura-onedit.gs`
 * (Pietra Blu). Sono due varianti divergenti dello stesso pezzo, e ognuna ha
 * qualcosa che manca all'altra:
 *
 *   qui c'è, a Pietra Blu no    → GUARD PRONTO (fornitore / modalità / tariffa 0)
 *   a Pietra Blu c'è, qui no    → dedup sulle PENDING; correzione Ora e Telefono;
 *                                 tutta la logica «Incassare»
 *
 * La funzione si chiama pure diversamente: qui `enqueueTransfer`, là `onEdit`.
 * Stesso lavoro, due nomi, due storie.
 *
 * ATTENZIONE — LA GUARDIA SVUOTA LO STATO.
 *
 *     sheet.getRange(currentRow, TRIGGER_COL).setValue("");
 *
 * Se manca il Fornitore, manca la Modalità o la Tariffa è 0, «Pronto» viene
 * cancellato. Qui almeno la riga NON entra in coda (il `continue` arriva prima
 * dell'`appendRow`), quindi non lascia una riga di coda orfana come fa
 * `incassare_` su Pietra Blu. Ma l'avviso è un `alert` dentro un `try/catch`
 * vuoto: in un trigger senza interfaccia non compare, e allora «Pronto»
 * sparisce e basta.
 *
 * ⚠️ Questo apre una domanda sul 17/08. Avevo attribuito lo `Stato ora è ""`
 * della riga 69 di 6 Stelle Mama a `incassare_`. Ma anche QUESTA guardia
 * produce uno Stato vuoto, e non so quale delle due varianti giri su 6 Stelle
 * Mama. Finché non lo so, quella diagnosi resta un'ipotesi con due candidati.
 *
 * NON MODIFICARE: è la fotografia di com'è oggi.
 */

// ============================================================
// FILE 1 — Shim per file struttura (chiama la libreria TransferLib)
// ============================================================

/**
 * Handler del trigger installable onChange.
 * Scatta su qualunque modifica del foglio (anche programmatica).
 */
function onChangeHandler(e) {
  // Filtra eventi che non ci interessano: cambi di formato, eventi "OTHER"
  if (e && (e.changeType === "FORMAT" || e.changeType === "OTHER")) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  TransferLib.processFile(ss.getId(), ss.getName());
}

/**
 * Handler del trigger time-driven (ogni minuto).
 * Rete di sicurezza: rifa sempre il check anche se onChange si è perso qualcosa.
 */
function sweepCheck() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  TransferLib.processFile(ss.getId(), ss.getName());
}

/**
 * Funzione di test: esegui dall'editor (Apps Script → ▶ Esegui)
 * per verificare che tutto funzioni e vedere il risultato nei log.
 */
function testProcessNow() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const result = TransferLib.processFile(ss.getId(), ss.getName());
  Logger.log("Risultato: " + JSON.stringify(result));
  return result;
}


// ============================================================
// FILE 2 — enqueueTransfer (v3, senza dedup)
// ============================================================

/**
 * ========================================
 * TRIGGER 1: onEdit per Queue (Strutture)
 * ========================================
 * v3: Aggiunto campo Fornitore nella Queue
 * Con LockService + flush per evitare conflitti
 */
function enqueueTransfer(e) {
  try {
    const SHEET_NAME = "Prenotazioni";
    const TRIGGER_COL = 22; // Colonna V = Stato
    const ID_COL = 24;      // Colonna X = Id
    const FORNITORE_COL = 9; // Colonna I = Fornitore
    const VALID_STATES = ["Pronto", "Modificato", "Cancellato"];

    if (!e || !e.range || !e.source) return;

    const ss = e.source;
    const sheet = e.range.getSheet();

    if (!sheet || sheet.getName() !== SHEET_NAME) return;

    const startCol = e.range.getColumn();
    const endCol = startCol + e.range.getNumColumns() - 1;

    if (TRIGGER_COL < startCol || TRIGGER_COL > endCol) return;

    const startRow = e.range.getRow();
    const numRows = e.range.getNumRows();
    const firstDataRow = Math.max(startRow, 2);
    const rowsToProcess = numRows - (firstDataRow - startRow);

    if (rowsToProcess <= 0) return;

    const rangeData = sheet.getRange(firstDataRow, TRIGGER_COL, rowsToProcess, ID_COL - TRIGGER_COL + 1).getValues();

    // Leggi anche la colonna Fornitore per le stesse righe
    const fornitoreData = sheet.getRange(firstDataRow, FORNITORE_COL, rowsToProcess, 1).getValues();

    const QUEUE_SHEET_ID = "1wWn3ZGZR1biuHVevIer5QP3GKZvuDkBf9poUGsZmkyg";
    const spreadsheetId = ss.getId();
    const fileName = ss.getName();

    // ===== LOCK PER SERIALIZZARE SCRITTURE IN QUEUE =====
    const queueLock = LockService.getScriptLock();
    queueLock.waitLock(10000);

    try {
      let queueSheet = null;
      let hasValidRows = false;

      for (let i = 0; i < rowsToProcess; i++) {
        const currentRow = firstDataRow + i;
        const statoValue = rangeData[i][0];

        if (!VALID_STATES.includes(statoValue)) continue;

        // ===== GUARD PRONTO: blocca se manca Fornitore/Pagamento o Tariffa 0 =====
        if (statoValue === "Pronto") {
          const gv = sheet.getRange(currentRow, 1, 1, 24).getValues()[0];
          const fornitoreG = (gv[8] || "").toString().trim();
          const modalitaG = (gv[17] || "").toString().trim();
          const tariffaRaw = gv[15];
          const tariffaNum = parseFloat(String(tariffaRaw).replace(/[^0-9.,-]/g, "").replace(",", "."));
          const tariffaZero = (tariffaRaw === "" || tariffaRaw === null || tariffaRaw === undefined) ? true : (isNaN(tariffaNum) ? true : tariffaNum === 0);
          const isFree = /compliment|complement|free shuttle|cmp shuttle|shuttle gratis|navetta gratu|gratis|gratuit|omaggio|free/i.test(((gv[1]||"") + " " + (gv[18]||"") + " " + modalitaG));
          const problemi = [];
          if (!fornitoreG) problemi.push("Fornitore");
          if (!modalitaG) problemi.push("Modalita/Pagamento");
          if (tariffaZero && !isFree) problemi.push("Tariffa a 0");
          if (problemi.length) {
            sheet.getRange(currentRow, TRIGGER_COL).setValue("");
            SpreadsheetApp.flush();
            try { SpreadsheetApp.getUi().alert("Impossibile mettere PRONTO (riga " + currentRow + ")", "Manca: " + problemi.join(", ") + "." + String.fromCharCode(10) + String.fromCharCode(10) + "Compila i campi e riprova.", SpreadsheetApp.getUi().ButtonSet.OK); } catch (e2) {}
            continue;
          }
        }
        hasValidRows = true;

        // ===== GENERA ID SE MANCANTE =====
        let transferId = (rangeData[i][ID_COL - TRIGGER_COL] || "").toString().trim();

        if (!transferId) {
          const now = new Date();
          const pad = (n) => String(n).padStart(2, '0');
          const uuid = Utilities.getUuid();
          transferId = "TR-" + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + "-" + uuid;

          sheet.getRange(currentRow, ID_COL).setValue(transferId);
          SpreadsheetApp.flush();
          Logger.log("🆔 ID generato per riga " + currentRow + ": " + transferId);
        }

        // Leggi il fornitore dalla riga corrente
        const fornitore = (fornitoreData[i][0] || "").toString().trim();

        // ===== SCRIVI IN QUEUE: UNA RIGA PER TRANSFER =====
        if (!queueSheet) {
          const queueSpreadsheet = SpreadsheetApp.openById(QUEUE_SHEET_ID);
          queueSheet = queueSpreadsheet.getSheetByName("Queue");
          if (!queueSheet) {
            Logger.log("❌ Foglio Queue non trovato!");
            return;
          }
        }

        queueSheet.appendRow([
          fileName,           // A: FileName
          spreadsheetId,      // B: SpreadsheetId
          "PENDING",          // C: Status
          new Date(),         // D: LastUpdate
          false,              // E: Processing
          "",                 // F: Error
          transferId,         // G: TransferId
          currentRow,         // H: RowNumber
          fornitore           // I: Fornitore  ← NUOVO
        ]);

        Logger.log("✅ Queue: " + fileName + " | Transfer: " + transferId + " | Fornitore: " + fornitore + " | Riga: " + currentRow);
      }

      if (queueSheet && hasValidRows) {
        SpreadsheetApp.flush();
      }

    } finally {
      queueLock.releaseLock();
    }

  } catch (err) {
    Logger.log("❌ Errore onEdit: " + err);
  }
}
