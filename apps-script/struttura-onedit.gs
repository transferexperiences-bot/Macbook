/**
 * ========================================================================
 * FOGLI STRUTTURA — script legato (copia di lavoro)
 * ========================================================================
 *
 * PROVENIENZA. Incollato da Agostino il 18/08/2026 dal progetto Apps Script
 * legato al foglio **Pietra Blu** (`1x258IpxTwf6bvc03sEb1RBJf8wSR5hIM3_uhFkirLCY`),
 * file `Logica incasso.gs` e `Webhook.gs`. Qui stanno insieme perché è così
 * che sono arrivate; sul foglio vero sono due file. Snapshot datato in
 * `backups/apps-script/`.
 *
 * PERCHÉ È NEL REPO. Non per pubblicarlo — Apps Script non si raggiunge da qui.
 * Serve al banco `banchi/te/banco-stato-cancellato.js`, che lo carica e lo fa
 * girare vero contro un finto SpreadsheetApp. Le regole si provano sul codice
 * che gira in produzione, non su una parafrasi.
 *
 * COSA C'È DENTRO, E COSA SI ROMPE.
 *
 * Su ogni modifica del foglio partono TRE esecuzioni: `onEdit_completo` e
 * `onEdit` come trigger installabili, più `onEdit` come trigger semplice.
 * Si contendono lo stesso `LockService.getScriptLock()`.
 *
 * `incassare_` contiene la trappola che il 17/08 ha fatto sparire la riga 69 di
 * 6 Stelle Mama: se la riga ha Modalità = «Incassare» (col. R) e la Tipologia
 * incasso (col. S) non è ancora scelta, **qualunque** cosa scrivi su quella
 * riga viene cancellata con `e.range.clearContent()` — compreso `Pronto` nella
 * colonna V. `onEdit` intanto ha già messo la riga in coda. Un minuto dopo lo
 * sweeper rilegge lo Stato, lo trova vuoto e scarta: `Stato ora è ""`.
 *
 * L'avviso è un toast di 4 secondi in un angolo del foglio. Se non stai
 * guardando in quel momento, il transfer è sparito e nessuno te lo dice.
 *
 * NON MODIFICARE QUESTO FILE per correggere il guasto: è la fotografia di com'è
 * adesso, ed è il metro con cui si misura la correzione.
 */

/**
 * ========================================
 * TRIGGER 2: onEditCorrezioni
 * ========================================
 * Trigger: onEdit generico
 * Gestisce correzioni ora/telefono e logica Incassare
 */
function onEditCorrezioni(e) {
  onEdit_completo(e);
}

function onEdit_completo(e) {
  try {
    const sh = e.range.getSheet();
    if (sh.getName() !== "Prenotazioni") return;

    // 1) Correzione immediata sulla cella modificata
    correzioniPrenotazioni_(e);

    // 2) Logica INCASSARE sulla cella modificata
    incassare_(e);

    // 3) Sweep rapido: ricontrolla tutte le celle ORA e TELEFONO
    sweepRapido_(sh);

  } catch (err) {
    console.error("onEdit_completo error:", err);
  }
}

/**
 * ========================================
 * FUNZIONI PURE DI CORREZIONE
 * (riutilizzate da onEdit e da sweep)
 * ========================================
 */

/**
 * Correzione ORA — restituisce il valore corretto o null se non valido
 */
function correggiOra_(v) {
  v = v.replace(/[.,;]/g, ":").replace(/\s+/g, "");

  if (/^\d+$/.test(v)) {
    if (v.length === 1) v = `0${v}:00`;
    else if (v.length === 2) v = `${v}:00`;
    else if (v.length === 3) v = `0${v[0]}:${v.slice(1)}`;
    else if (v.length === 4) v = `${v.slice(0, 2)}:${v.slice(2)}`;
    else return null;
  }

  const m = v.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) return null;

  let hh = parseInt(m[1], 10);
  let mm = parseInt(m[2], 10);

  if (m[2].length === 1) mm = mm * 10;

  if (isNaN(hh) || isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Correzione TELEFONO — restituisce il valore pulito o null se già ok
 */
function correggiTelefono_(v) {
  const pulito = v.replace(/[^\d]/g, "");
  return (pulito !== v) ? pulito : null;
}

/**
 * ========================================
 * CORREZIONE IMMEDIATA (singola cella onEdit)
 * ========================================
 */
function correzioniPrenotazioni_(e) {
  const cell = e.range;
  const raw = e.value;
  if (raw == null) return;

  let v = raw.toString().trim();

  // Correzione ORA (colonna D = 4)
  if (cell.getColumn() === 4) {
    const corrected = correggiOra_(v);
    if (corrected !== null) {
      cell.setNumberFormat("@");
      cell.setValue(corrected);
    }
    return;
  }

  // Correzione TELEFONO (colonna K = 11)
  if (cell.getColumn() === 11) {
    const corrected = correggiTelefono_(v);
    if (corrected !== null) {
      cell.setNumberFormat("@");
      cell.setValue(corrected);
    }
    return;
  }
}

/**
 * ========================================
 * SWEEP RAPIDO — gira ad ogni onEdit
 * Ricontrolla colonna ORA e TELEFONO
 * in blocco (veloce con getValues/setValues)
 * ========================================
 */
function sweepRapido_(sh) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;

  const numRows = lastRow - 1;

  // --- ORA (colonna D = 4) ---
  const oraRange = sh.getRange(2, 4, numRows, 1);
  const oraVals = oraRange.getValues();
  let oraModificato = false;

  for (let i = 0; i < oraVals.length; i++) {
    const raw = oraVals[i][0];
    if (raw == null || raw === "") continue;
    const v = String(raw).trim();
    const corrected = correggiOra_(v);
    if (corrected !== null && corrected !== v) {
      oraVals[i][0] = corrected;
      oraModificato = true;
    }
  }

  if (oraModificato) {
    oraRange.setNumberFormat("@");
    oraRange.setValues(oraVals);
  }

  // --- TELEFONO (colonna K = 11) ---
  const telRange = sh.getRange(2, 11, numRows, 1);
  const telVals = telRange.getValues();
  let telModificato = false;

  for (let i = 0; i < telVals.length; i++) {
    const raw = telVals[i][0];
    if (raw == null || raw === "") continue;
    const v = String(raw).trim();
    const corrected = correggiTelefono_(v);
    if (corrected !== null) {
      telVals[i][0] = corrected;
      telModificato = true;
    }
  }

  if (telModificato) {
    telRange.setNumberFormat("@");
    telRange.setValues(telVals);
  }
}

/**
 * ========================================
 * LOGICA "Incassare" su Prenotazioni
 * - Modalità in colonna R (18)
 * - Tipologia incasso in colonna S (19)
 * ========================================
 */
function incassare_(e) {
  try {
    const sh = e.range.getSheet();
    if (sh.getName() !== "Prenotazioni") return;

    const COL_MODALITA = 18; // R
    const COL_TIPO = 19;     // S
    const PLACEHOLDER = "⬇️ Scegli tipologia";

    const TIPI = [
      "Incassa PREZZO PIENO (commissione: alla struttura)",
      "Incassa SOLO NETTO (commissione già pagata in struttura / prezzo scontato)",
      "Incassa PREZZO PIENO (commissione: nessuna)"
    ];

    const row = e.range.getRow();
    if (row === 1) return;

    const startCol = e.range.getColumn();
    const endCol = startCol + e.range.getNumColumns() - 1;

    const modalitaCell = sh.getRange(row, COL_MODALITA);
    const tipoCell = sh.getRange(row, COL_TIPO);

    const modalita = String(modalitaCell.getValue() || "").trim().toLowerCase();
    const tipoVal = String(tipoCell.getValue() || "").trim();

    const editToccaR = !(COL_MODALITA < startCol || COL_MODALITA > endCol);
    const editToccaS = !(COL_TIPO < startCol || COL_TIPO > endCol);

    if (editToccaR) {
      const isSingleCellEdit =
        (e.range.getNumRows() === 1 && e.range.getNumColumns() === 1 && e.range.getColumn() === COL_MODALITA);

      const newVal = String(e.value || "").trim().toLowerCase();
      const oldVal = String(e.oldValue || "").trim().toLowerCase();

      const justSwitchedToIncassare =
        isSingleCellEdit && newVal === "incassare" && oldVal !== "incassare";

      if (justSwitchedToIncassare) {
        SpreadsheetApp.getUi().alert(
          "Tipologia incasso",
          "Hai selezionato 'Incassare'.\n\nScegli la tipologia in colonna S (riga " + row + ").",
          SpreadsheetApp.getUi().ButtonSet.OK
        );
      }

      if (modalita === "incassare") {
        const rule = SpreadsheetApp.newDataValidation()
          .requireValueInList([PLACEHOLDER, ...TIPI], true)
          .setAllowInvalid(false)
          .build();
        tipoCell.setDataValidation(rule);

        const cur = String(tipoCell.getValue() || "").trim();
        if (!cur) tipoCell.setValue(PLACEHOLDER);

        const cur2 = String(tipoCell.getValue() || "").trim();
        if (cur2 === PLACEHOLDER) tipoCell.setBackground("#fff2cc");
        else tipoCell.setBackground(null);

      } else {
        if (tipoCell.getDataValidation()) tipoCell.clearDataValidations();
        if (String(tipoCell.getValue() || "").trim()) tipoCell.clearContent();
        tipoCell.setBackground(null);
      }
      return;
    }

    const tipologiaNonScelta = (modalita === "incassare") && (!tipoVal || tipoVal === PLACEHOLDER);
    if (tipologiaNonScelta && !editToccaS) {
      e.range.clearContent();
      SpreadsheetApp.getActive().toast(
        "Prima seleziona 'Tipologia incasso' (colonna S).",
        "Bloccato",
        4
      );
      return;
    }

    if (editToccaS && modalita === "incassare") {
      const newTipo = String(tipoCell.getValue() || "").trim();
      if (newTipo && newTipo !== PLACEHOLDER) tipoCell.setBackground(null);
      else tipoCell.setBackground("#fff2cc");
    }

  } catch (err) {
    console.error("incassare_ error:", err);
  }
}

/**
 * ========================================
 * TRIGGER 1: onEdit per Queue (Strutture)
 * ========================================
 * v4: Dedup check — controlla se esiste già PENDING
 *     in Queue per stesso TransferId
 * v3: Aggiunto campo Fornitore nella Queue
 * Con LockService + flush per evitare conflitti
 */
function onEdit(e) {
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
      let queueData = null;
      let hasValidRows = false;

      for (let i = 0; i < rowsToProcess; i++) {
        const currentRow = firstDataRow + i;
        const statoValue = rangeData[i][0];

        if (!VALID_STATES.includes(statoValue)) continue;

        hasValidRows = true;

        let transferId = (rangeData[i][ID_COL - TRIGGER_COL] || "").toString().trim();

        if (!transferId) {
          const now = new Date();
          const pad = (n) => String(n).padStart(2, '0');
          const uuid = Utilities.getUuid();
          transferId = "TR-" + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + "-" + uuid;

          sheet.getRange(currentRow, ID_COL).setValue(transferId);
          SpreadsheetApp.flush();
          Logger.log("ID generato per riga " + currentRow + ": " + transferId);
        }

        const fornitore = (fornitoreData[i][0] || "").toString().trim();

        if (!queueSheet) {
          const queueSpreadsheet = SpreadsheetApp.openById(QUEUE_SHEET_ID);
          queueSheet = queueSpreadsheet.getSheetByName("Queue");
          if (!queueSheet) {
            Logger.log("Foglio Queue non trovato!");
            return;
          }
          // Leggi dati esistenti per dedup check
          queueData = queueSheet.getDataRange().getValues();
        }

        // ===== DEDUP CHECK su TransferId =====
        // Se esiste già una riga PENDING con lo stesso TransferId, skip
        let alreadyPending = false;
        for (let r = 1; r < queueData.length; r++) {
          const qTransferId = (queueData[r][6] || "").toString().trim();
          const qStatus = (queueData[r][2] || "").toString().trim();
          if (qTransferId === transferId && qStatus === "PENDING") {
            alreadyPending = true;
            break;
          }
        }

        if (alreadyPending) {
          Logger.log("DEDUP: TransferId " + transferId + " già PENDING in Queue, skip");
          continue;
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
          fornitore           // I: Fornitore
        ]);

        // Aggiorna queueData locale per gestire batch (evita duplicati nello stesso batch)
        queueData.push([fileName, spreadsheetId, "PENDING", new Date(), false, "", transferId, currentRow, fornitore]);

        Logger.log("Queue: " + fileName + " | Transfer: " + transferId + " | Fornitore: " + fornitore + " | Riga: " + currentRow);
      }

      if (queueSheet && hasValidRows) {
        SpreadsheetApp.flush();
      }

    } finally {
      queueLock.releaseLock();
    }

  } catch (err) {
    Logger.log("Errore onEdit: " + err);
  }
}
