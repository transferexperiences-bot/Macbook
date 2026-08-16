/**
 * ==========================================================================
 * Transfer Experience — Library "TransferLib" v2
 * Progetto: 1vo74eNOp7bRgiU-ioVRTRCfb2k9rmDVlV5lmW_DoFKTTKZM_or7K0o96
 * Importata da TUTTI e 18 i file struttura.
 * ==========================================================================
 *
 * COSA CAMBIA RISPETTO ALLA v1.
 *
 * Le colonne non sono più numeri fissi. La v1 aveva:
 *
 *   const SCHEMA = { ORA_COL: 4, TELEFONO_COL: 11, FORNITORE_COL: 9,
 *                    STATO_COL: 22, ID_COL: 24 };
 *
 * uguale per tutti i file. Basta che una struttura inserisca una colonna e
 * quel file legge Stato e Id dalle celle sbagliate — con lo stesso codice
 * per tutti gli altri. Ora si risolvono dalle intestazioni. Se un nome non
 * si trova si torna al numero di prima (identico alla v1) e si scrive nel
 * log: non si perde niente e si vede.
 *
 * Il resto è invariato: normalizzazione Ora e Telefono, recupero degli
 * eventi Stato non propagati verso Strutture/Queue.
 *
 * Ogni file struttura installa due trigger che chiamano processFile:
 *   - onChange (installable)
 *   - sweepCheck (time-driven, ogni minuto)
 */

const STRUTTURE_ID = "1wWn3ZGZR1biuHVevIer5QP3GKZvuDkBf9poUGsZmkyg";

const SHEET_NAME = "Prenotazioni";
const FIRST_DATA_ROW = 2;

/** Stati che fanno scattare la sincronizzazione con Strutture/Queue. */
const VALID_STATES = ["Pronto", "Modificato", "Cancellato"];

/**
 * Nomi accettati per colonna. Il primo è quello canonico.
 * Confronto ESATTO dopo normalizzazione, mai "contiene": cercare per pezzi
 * farebbe beccare a "Tariffa" anche "Tariffa a noi", e sui soldi non si scherza.
 */
const COL_ALIASES = {
  ora:       ["Time", "Ora", "Orario", "Ora pickup"],
  telefono:  ["cell.", "cell", "Cellulare", "Telefono", "Tel."],
  fornitore: ["Fornitore", "Struttura"],
  stato:     ["Stato", "Status"],
  id:        ["Id", "Id transfer"]
};

/** Prima i due che, se sbagliati, fanno danno vero. */
const RESOLVE_ORDER = ["id", "stato", "fornitore", "ora", "telefono"];

/** Numeri della v1: rete di sicurezza se il nome non si trova. */
const LEGACY_COL = { ora: 4, telefono: 11, fornitore: 9, stato: 22, id: 24 };


// ==========================================================================
// RISOLUZIONE COLONNE
// ==========================================================================

/**
 * Riduce un'intestazione alla forma nuda: via maiuscole, accenti, spazi e
 * punteggiatura. Sui fogli veri lo stesso nome è scritto in modi diversi:
 *   "Tariffa " (spazio in coda) = "Tariffa" | "cell." = "cell" = "Cell"
 *   "Modalità" = "Modalita" | "TRS> DA" = "TRS DA" | "n. pratica" = "N Pratica"
 * Restano distinti "tariffa" e "tariffaanoi", che sono cose diverse.
 */
function normHeader(h) {
  let s = (h === null || h === undefined ? "" : h).toString().toLowerCase();
  s = s.replace(/[àáâãä]/g, "a").replace(/[èéêë]/g, "e").replace(/[ìíîï]/g, "i")
       .replace(/[òóôõö]/g, "o").replace(/[ùúûü]/g, "u")
       .replace(/[ç]/g, "c").replace(/[ñ]/g, "n");
  return s.replace(/[^a-z0-9]+/g, "");
}

/**
 * Dalla riga di intestazione ricava i numeri di colonna (1-based).
 *
 * 1) per NOME, dai più importanti in giù; una colonna presa non si tocca più
 * 2) chi non si trova ripiega sul numero della v1, ma solo se è ancora libero
 * 3) chi resta fuori vale null — meglio vuoto e segnalato che pieno e sbagliato
 *
 * Nessun passaggio "somiglia a": le somiglianze, sui fogli, fanno danni.
 *
 * @return {{col: Object, warnings: Array<string>}}
 */
function buildColMap(headerRow) {
  const norm = (headerRow || []).map(normHeader);
  const col = {};
  const warnings = [];
  const claimed = {};

  RESOLVE_ORDER.forEach(function (key) {
    let found = 0;
    (COL_ALIASES[key] || []).some(function (alias) {
      const target = normHeader(alias);
      if (!target) return false;
      for (let i = 0; i < norm.length; i++) {
        if (norm[i] === target && !claimed[i + 1]) { found = i + 1; return true; }
      }
      return false;
    });
    if (found) { col[key] = found; claimed[found] = key; }
  });

  RESOLVE_ORDER.forEach(function (key) {
    if (col[key]) return;
    const legacy = LEGACY_COL[key];
    if (legacy && !claimed[legacy]) {
      col[key] = legacy;
      claimed[legacy] = key;
      warnings.push(key + " → colonna " + legacy + " (per posizione)");
    } else {
      col[key] = null;
      warnings.push(key + " → NON RISOLTA");
    }
  });

  return { col: col, warnings: warnings };
}

/**
 * Mostra come si risolvono le colonne di un file struttura. Non scrive niente.
 * Utile dopo che qualcuno ha messo mano alle intestazioni.
 */
function diagnosticaIntestazioni(spreadsheetId, fileName) {
  const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(SHEET_NAME);
  if (!sheet) return { error: "tab Prenotazioni mancante", fileName: fileName };
  const lastCol = Math.max(24, sheet.getLastColumn());
  const m = buildColMap(sheet.getRange(1, 1, 1, lastCol).getValues()[0]);
  Logger.log((m.warnings.length ? "⚠️ " : "✅ ") + (fileName || spreadsheetId) +
    " — Stato=" + m.col.stato + " Id=" + m.col.id +
    (m.warnings.length ? " | da guardare: " + m.warnings.join("; ") : " | tutto per nome"));
  return m;
}


// ==========================================================================
// FUNZIONE PRINCIPALE
// ==========================================================================

/**
 * Scansiona la tab Prenotazioni del file struttura indicato.
 * Sistema Ora/Telefono e mette in Queue gli eventi Stato non propagati.
 */
function processFile(spreadsheetId, fileName) {
  const t0 = Date.now();
  try {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    if (!ss) return { error: "spreadsheet not found", spreadsheetId };

    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return { skipped: "tab Prenotazioni mancante", fileName };

    const lastRow = sheet.getLastRow();
    if (lastRow < FIRST_DATA_ROW) return { ok: true, processed: 0, fileName };
    const numRows = lastRow - FIRST_DATA_ROW + 1;

    const lastCol = Math.max(24, sheet.getLastColumn());
    const headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const mapped = buildColMap(headerRow);
    const col = mapped.col;
    if (mapped.warnings.length) {
      Logger.log("⚠️ " + fileName + ": " + mapped.warnings.join("; "));
    }

    // Senza Stato o senza Id non si tocca niente: sono le due colonne che, se
    // sbagliate, fanno marcare o accodare la riga di un altro cliente.
    if (!col.stato || !col.id) {
      Logger.log("❌ " + fileName + ": colonne Stato/Id non individuabili, salto il file");
      return { skipped: "colonne Stato/Id non individuabili", fileName: fileName };
    }

    const oraRange   = sheet.getRange(FIRST_DATA_ROW, col.ora,       numRows, 1);
    const telRange   = sheet.getRange(FIRST_DATA_ROW, col.telefono,  numRows, 1);
    const statoRange = sheet.getRange(FIRST_DATA_ROW, col.stato,     numRows, 1);
    const idRange    = sheet.getRange(FIRST_DATA_ROW, col.id,        numRows, 1);
    const fornRange  = sheet.getRange(FIRST_DATA_ROW, col.fornitore, numRows, 1);

    const oraVals   = oraRange.getValues();
    const telVals   = telRange.getValues();
    const statoVals = statoRange.getValues();
    const idVals    = idRange.getValues();
    const fornVals  = fornRange.getValues();

    // ---------- 1) Normalizzazione Ora in-place ----------
    let oraFixed = 0;
    const oraOut = oraVals.map(function (row) {
      const v = row[0];
      const n = normalizeOra(v);
      if (n !== null && n !== v) { oraFixed++; return [n]; }
      return row;
    });
    if (oraFixed > 0) oraRange.setValues(oraOut);

    // ---------- 2) Normalizzazione Telefono in-place ----------
    let telFixed = 0;
    const telOut = telVals.map(function (row) {
      const v = row[0];
      const n = normalizeTelefono(v);
      if (n !== null && n !== v) { telFixed++; return [n]; }
      return row;
    });
    if (telFixed > 0) telRange.setValues(telOut);

    // ---------- 3) Recupero eventi Stato persi ----------
    const queued = recoverMissedStateEvents({
      spreadsheetId: spreadsheetId,
      fileName: fileName,
      statoVals: statoVals,
      idVals: idVals,
      fornVals: fornVals,
      numRows: numRows
    });

    return {
      ok: true,
      fileName: fileName,
      oraFixed: oraFixed,
      telFixed: telFixed,
      queued: queued,
      colWarnings: mapped.warnings,
      elapsedMs: Date.now() - t0
    };
  } catch (err) {
    Logger.log("processFile error on " + fileName + ": " + err + "\n" + (err.stack || ""));
    return { error: String(err), fileName: fileName };
  }
}


// ==========================================================================
// RECUPERO EVENTI STATO PERSI
// ==========================================================================

/**
 * Per ogni riga con Stato in VALID_STATES e Id valorizzato, controlla:
 *   - non è già PENDING in Strutture/Queue
 *   - lo Stato in Strutture/Foglio1 è diverso (oppure manca del tutto la riga)
 * In tal caso scrive una nuova riga PENDING in Queue.
 *
 * RowNumber finisce in Queue solo come suggerimento: chi la consuma
 * (processQueue) riconferma la riga cercando l'Id.
 */
function recoverMissedStateEvents(args) {
  const struttureSS = SpreadsheetApp.openById(STRUTTURE_ID);
  const queueSheet = struttureSS.getSheetByName("Queue");
  const foglio1 = struttureSS.getSheetByName("Foglio1");
  if (!queueSheet || !foglio1) {
    Logger.log("Queue o Foglio1 mancanti in Strutture");
    return 0;
  }

  // Id già PENDING o SENT in Queue: non riaccodare.
  const queueData = queueSheet.getDataRange().getValues();
  const queueOpenIds = new Set();
  for (let r = 1; r < queueData.length; r++) {
    const st = queueData[r][2];
    if (st === "PENDING" || st === "SENT") {
      const tid = (queueData[r][6] || "").toString().trim();
      if (tid) queueOpenIds.add(tid);
    }
  }

  // Mappa Id → Stato in Foglio1
  const f1Data = foglio1.getDataRange().getValues();
  const f1Headers = f1Data[0].map(normHeader);
  const f1IdCol = f1Headers.indexOf(normHeader("Id"));
  const f1StatoCol = f1Headers.indexOf(normHeader("Stato"));
  const f1IdToStato = new Map();
  if (f1IdCol >= 0 && f1StatoCol >= 0) {
    for (let r = 1; r < f1Data.length; r++) {
      const id = (f1Data[r][f1IdCol] || "").toString().trim();
      if (id) f1IdToStato.set(id, f1Data[r][f1StatoCol]);
    }
  } else {
    Logger.log("⚠️ Foglio1: colonne Id/Stato non trovate per nome");
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    Logger.log("Lock non disponibile, skip questo giro");
    return 0;
  }

  let queued = 0;
  try {
    for (let i = 0; i < args.numRows; i++) {
      const stato = (args.statoVals[i][0] || "").toString().trim();
      const id    = (args.idVals[i][0]    || "").toString().trim();
      const forn  = args.fornVals[i][0];

      if (!VALID_STATES.includes(stato)) continue;
      if (!id) continue;
      if (queueOpenIds.has(id)) continue;
      if (f1IdToStato.get(id) === stato) continue;  // già in sync

      queueSheet.appendRow([
        args.fileName,              // A: FileName
        args.spreadsheetId,         // B: SpreadsheetId
        "PENDING",                  // C: Status
        new Date(),                 // D: LastUpdate
        0,                          // E: Attempts (dal 2026-06-08 è un contatore)
        "",                         // F: Error
        id,                         // G: TransferId — comanda questo
        FIRST_DATA_ROW + i,         // H: RowNumber — solo suggerimento
        forn                        // I: Fornitore
      ]);
      queueOpenIds.add(id);
      queued++;
      Logger.log("Sweep: recuperato " + args.fileName + " Id " + id + " Stato " + stato);
    }
  } finally {
    lock.releaseLock();
  }
  return queued;
}


// ==========================================================================
// NORMALIZZAZIONE ORA
// ==========================================================================

/**
 * "9" → "09:00" | "21" → "21:00" | "830" → "08:30" | "1430" → "14:30"
 * "9.30" → "09:30" | "21,15" → "21:15"
 * "21:00" → null (già giusto) | "" → null | "abc" → null
 *
 * CORREZIONE v2 — la v1 non rispettava il suo stesso commento.
 * Il controllo «è già giusto» girava sulla stringa DOPO aver sostituito la
 * virgola: "21,15" diventava "21:15", la guardia diceva «a posto» e tornava
 * null, quindi la cella restava "21,15". Colpiva ogni orario con virgola o
 * punto e due cifre d'ora ("10.30", "18,45", ...). Ora il confronto si fa
 * col valore ORIGINALE: null vuol dire solo «non c'è niente da cambiare».
 */
function normalizeOra(value) {
  if (value === "" || value === null || value === undefined) return null;

  const original = value.toString();
  const v = original.replace(/[.,;]/g, ":").replace(/\s+/g, "");
  const out = canonicalOra(v);

  if (out === null) return null;
  return out === original ? null : out;
}

/** Ritorna "HH:MM" se riconoscibile, altrimenti null. */
function canonicalOra(v) {
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) return v;

  if (/^\d+$/.test(v)) {
    if (v.length === 1) {
      return "0" + parseInt(v, 10) + ":00";
    }
    if (v.length === 2) {
      const h = parseInt(v, 10);
      if (h >= 0 && h <= 23) return v + ":00";
      return null;
    }
    if (v.length === 3) {
      const h = parseInt(v[0], 10);
      const m = parseInt(v.slice(1), 10);
      if (h >= 0 && h <= 9 && m >= 0 && m <= 59) return "0" + h + ":" + v.slice(1);
      return null;
    }
    if (v.length === 4) {
      const h = parseInt(v.slice(0, 2), 10);
      const m = parseInt(v.slice(2), 10);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return v.slice(0, 2) + ":" + v.slice(2);
      return null;
    }
    return null;
  }

  const m = v.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m) {
    const h = parseInt(m[1], 10);
    const mi = parseInt(m[2], 10);
    if (h >= 0 && h <= 23 && mi >= 0 && mi <= 59) {
      const hh = h < 10 ? "0" + h : String(h);
      const mm = mi < 10 ? "0" + mi : String(mi);
      return hh + ":" + mm;
    }
  }

  return null;
}


// ==========================================================================
// NORMALIZZAZIONE TELEFONO  (invariata dalla v1)
// ==========================================================================

/**
 * "39 346 5389493" → "393465389493" | "+39 346 5389493" → "+393465389493"
 * "(346) 538-9493" → "3465389493" | "abc" → null | già pulito → null
 */
function normalizeTelefono(value) {
  if (value === "" || value === null || value === undefined) return null;
  const v = value.toString();

  const hasPlus = v.trim().startsWith("+");
  const digits = v.replace(/\D/g, "");

  if (digits.length === 0) return null;
  if (digits.length < 6) return null;

  const cleaned = (hasPlus ? "+" : "") + digits;
  if (cleaned === v) return null;

  return cleaned;
}
