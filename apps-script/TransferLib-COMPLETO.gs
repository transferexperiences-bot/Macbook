// =====================================================================
// TransferLib — FILE COMPLETO, 19/08/2026 (sera)
// =====================================================================
//
// Questo è TUTTO il contenuto di `Codice.gs` dentro il progetto TransferLib:
// la libreria com'era + le aggiunte di oggi in fondo.
//
// SI USA COSÌ: apri TransferLib, clicca nel codice, Ctrl+A, Canc, incolla
// questo, Ctrl+S. Non serve sapere cosa c'era prima: qui dentro c'è tutto.
//
// 19/08: contiene anche la correzione della colonna Data, accanto a quelle di
// Ora e Telefono — testo che si legge come data diventa una data vera, testo
// che non si legge si cancella. Perché e con quali cautele: la testa di
// `apps-script/transferlib-data.gs`.
//
// Progetto: 1vo74eNOp7bRgiU-ioVRTRCfb2k9rmDVlV5lmW_DoFKTTKZM_or7K0o96
// =====================================================================


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
// NORMALIZZAZIONE DATA  (19/08 — vedi apps-script/transferlib-data.gs)
// ==========================================================================
//
// Stesso mestiere di `normalizeOra`: «7/8» → data vera, «merc 8» → via.
// Il ramo che scrive parte SOLO se nella cella c'è del testo, cioè solo
// dove il «tipo di colonna» di Google non sta guardando: dove c'è, il testo
// non entra proprio e qui non si arriva. Così il calendario col doppio clic
// resta dov'è, e il formato non litiga con nessuno.


/**
 * Come si vedono le date sui fogli struttura: «ven 7 agosto 2026».
 * È il formato che c'è già sulle righe vecchie. Si cambia qui, una volta sola,
 * e vale su tutti e diciotto i fogli. `dddd` darebbe «venerdì» per esteso.
 */
var TE_FORMATO_DATA = "ddd d MMMM yyyy";


/**
 * Da testo a data vera, oppure niente. Sorella di `canonicalOra`.
 *
 *   "7/8"        → 7 agosto (anno: vedi sotto)
 *   "7-8"        → uguale        "7.8" → uguale
 *   "07/08/2026" → 7 agosto 2026
 *   "7/8/26"     → 7 agosto 2026
 *   "merc 8" | "domani" | "3 settembre" | "45000" → null
 *
 * L'ANNO, QUANDO NON C'È. Si prende quello di oggi; ma se la data così
 * ottenuta è già passata da più di 30 giorni, si passa all'anno dopo — perché
 * un transfer si scrive prima, non un anno dopo. È l'unica cosa "dedotta" qui
 * dentro, ed è dichiarata: a fine dicembre «3/1» vuol dire gennaio prossimo.
 *
 * @param {*} valore quello che c'è nella cella
 * @param {Date} oggi la data di riferimento (il banco ne passa una finta)
 * @return {Date|null}
 */
function canonicalData(valore, oggi) {
  if (valore === "" || valore === null || valore === undefined) return null;

  var s = valore.toString().trim().replace(/\s+/g, "");
  var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2}|\d{4}))?$/);
  if (!m) return null;

  var giorno = parseInt(m[1], 10);
  var mese = parseInt(m[2], 10);
  if (giorno < 1 || giorno > 31 || mese < 1 || mese > 12) return null;

  var anno;
  if (m[3] === undefined) {
    anno = oggi.getFullYear();
    if (new Date(anno, mese - 1, giorno).getTime() < oggi.getTime() - 30 * 86400000) {
      anno = anno + 1;
    }
  } else {
    anno = parseInt(m[3], 10);
    if (anno < 100) anno = 2000 + anno;
  }

  var d = new Date(anno, mese - 1, giorno);
  // «31/2» diventerebbe il 3 marzo da solo: quello non è correggere, è inventare.
  if (d.getDate() !== giorno || d.getMonth() !== mese - 1) return null;
  return d;
}


/**
 * Sistema la cella Data appena scritta.
 * @return {string} 'convertita' | 'svuotata' | 'niente'
 */
function correggiCellaData(cella, oggi) {
  var v = cella.getValue();

  function togliAvviso() {
    if (cella.getNote()) { cella.setNote(null); cella.setBackground(null); }
  }

  // Google l'ha già capita come data: non la tocchiamo, né il valore né il
  // formato. Qui potrebbe esserci il tipo di colonna, e con quello non si litiga.
  if (Object.prototype.toString.call(v) === "[object Date]") {
    togliAvviso();
    return 'niente';
  }

  // Vuota: non è un errore. Magari la stanno ancora scrivendo, o l'hanno
  // appena tolta dopo un avviso — nel dubbio l'avviso se ne va.
  if (v === "" || v === null || v === undefined) {
    togliAvviso();
    return 'niente';
  }

  var d = canonicalData(v, oggi || new Date());
  if (d) {
    // Prima il formato, poi il valore: se la cella è formattata come testo
    // («@», ci finisce da sola dopo un incolla) scrivere una data dentro un
    // formato testo la ririduce a stringa, e saremmo punto e a capo.
    cella.setNumberFormat(TE_FORMATO_DATA);
    cella.setValue(d);
    togliAvviso();
    return 'convertita';
  }

  // Testo che non si legge come data: si cancella, e si dice perché.
  cella.clearContent();
  cella.setNote(
    "⛔ Qui va una data, non del testo. L'ho tolta.\n" +
    "Scrivila così: 7/8  oppure  7/8/2026\n" +
    "Questa nota sparisce da sola quando la data è giusta.");
  cella.setBackground("#f4cccc");
  SpreadsheetApp.flush();
  return 'svuotata';
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


/** Aggiunge a `buildColMap` i campi che servono alle guardie. */
(function estendiColonne_() {
  COL_ALIASES.modalita          = ["Modalità", "Modalita"];
  COL_ALIASES.tipologia_incasso = ["Tipologia incasso", "Tipologia d'incasso"];
  COL_ALIASES.tariffa           = ["Tariffa", "Prezzo"];
  COL_ALIASES.note              = ["Note", "Nota"];
  COL_ALIASES.data              = ["Data", "Date"];

  ["modalita", "tipologia_incasso", "tariffa", "note", "data"].forEach(function (k) {
    if (RESOLVE_ORDER.indexOf(k) === -1) RESOLVE_ORDER.push(k);
  });

  LEGACY_COL.modalita = 18;
  LEGACY_COL.tipologia_incasso = 19;
  LEGACY_COL.tariffa = 16;
  LEGACY_COL.note = 2;
  LEGACY_COL.data = 3;
})();


/**
 * Perché questa riga non può andare in «Pronto». Funzione pura.
 * Regole identiche alla GUARD PRONTO di Suite 10, eccezione compresa.
 *
 * @param {Array} riga    valori della riga, dalla colonna 1
 * @param {Object} col    mappa colonne di `buildColMap`
 * @return {Array<string>} vuoto = si può mandare
 */
function motiviBlocco(riga, col) {
  function v(k) {
    var c = col[k];
    if (!c || c > riga.length) return "";
    var x = riga[c - 1];
    return (x === null || x === undefined) ? "" : x;
  }

  var fornitore = v("fornitore").toString().trim();
  var modalita  = v("modalita").toString().trim();
  var tariffa   = v("tariffa");

  var num = parseFloat(String(tariffa).replace(/[^0-9.,-]/g, "").replace(",", "."));
  var zero = (tariffa === "" || tariffa === null || tariffa === undefined)
    ? true : (isNaN(num) ? true : num === 0);

  // I transfer di cortesia hanno tariffa 0 per davvero. Si guarda in tre posti
  // perché la struttura lo scrive dove le viene comodo.
  var testo = v("note").toString() + " " + v("tipologia_incasso").toString() + " " + modalita;
  var cortesia = /compliment|complement|free shuttle|cmp shuttle|shuttle gratis|navetta gratu|gratis|gratuit|omaggio/i.test(testo);

  var problemi = [];
  if (!fornitore) problemi.push("Fornitore");
  if (!modalita)  problemi.push("Modalita/Pagamento");
  if (zero && !cortesia) problemi.push("Tariffa a 0");
  return problemi;
}


/** Id con la stessa forma di sempre: cambiarla creerebbe due famiglie di Id. */
function nuovoId(adesso) {
  var d = adesso || new Date();
  var p = function (n) { return (n < 10 ? "0" : "") + n; };
  return "TR-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + Utilities.getUuid();
}


/**
 * Lascia un avviso ATTACCATO alla cella. Non un toast di quattro secondi, non
 * un alert che senza interfaccia non compare: una nota, che resta finché la
 * cosa non è sistemata.
 */
function avvisaSullaCella(sheet, riga, colonna, testo) {
  try {
    var cella = sheet.getRange(riga, colonna);
    if (testo) { cella.setNote(testo); cella.setBackground("#f4cccc"); }
    else if (cella.getNote()) { cella.setNote(null); cella.setBackground(null); }
  } catch (e) {
    Logger.log("nota non scritta su riga " + riga + ": " + e);
  }
}


/**
 * Mette in coda le righe toccate da una modifica. La chiama il guscio di ogni
 * foglio (`teOnEdit`), che è l'unica cosa che resta copiata — dieci righe che
 * non cambiano mai.
 *
 * @return {{accodate: number, bloccate: number, saltate: number}}
 */
function enqueueFromEdit(e) {
  var esito = { accodate: 0, bloccate: 0, saltate: 0 };
  var sheet = null, colStato = 22, primaRiga = FIRST_DATA_ROW;

  try {
    if (!e || !e.range || !e.source) return esito;
    sheet = e.range.getSheet();
    if (!sheet || sheet.getName() !== SHEET_NAME) return esito;

    var lock = LockService.getScriptLock();
    // 20 s: la vecchia versione ne aspettava 10 e con tre esecuzioni in corsa
    // scadeva. Ora l'esecuzione è una sola, ma il margine non costa niente.
    lock.waitLock(20000);

    try {
      // ===== DA QUI IN GIÙ SI LEGGE, E SI LEGGE DENTRO IL LOCK =====
      // È il punto di tutta la correzione: chi entra dopo vede quello che ha
      // scritto chi è entrato prima.
      var lastCol = Math.max(24, sheet.getLastColumn());
      var mappa = buildColMap(sheet.getRange(1, 1, 1, lastCol).getValues()[0]);
      var col = mappa.col;

      if (!col.stato || !col.id) {
        Logger.log("❌ " + e.source.getName() + ": colonne Stato/Id non individuabili, non accodo niente");
        return esito;
      }
      colStato = col.stato;
      if (mappa.warnings.length) {
        Logger.log("⚠️ " + e.source.getName() + ": " + mappa.warnings.join("; "));
      }

      // La modifica tocca la colonna Stato?
      var da = e.range.getColumn();
      var a = da + e.range.getNumColumns() - 1;
      if (col.stato < da || col.stato > a) return esito;

      var partenza = Math.max(e.range.getRow(), FIRST_DATA_ROW);
      var quante = e.range.getNumRows() - (partenza - e.range.getRow());
      if (quante <= 0) return esito;
      primaRiga = partenza;

      var dati = sheet.getRange(partenza, 1, quante, lastCol).getValues();

      var queueSheet = SpreadsheetApp.openById(STRUTTURE_ID).getSheetByName("Queue");
      if (!queueSheet) { Logger.log("❌ Foglio Queue non trovato"); return esito; }

      // Id già in coda e non chiusi: non si accoda due volte.
      var qd = queueSheet.getDataRange().getValues();
      var aperti = {};
      for (var r = 1; r < qd.length; r++) {
        var s = (qd[r][2] || "").toString().trim();
        if (s === "PENDING" || s === "SENT") {
          var t = (qd[r][6] || "").toString().trim();
          if (t) aperti[t] = true;
        }
      }

      var adesso = new Date();
      var fileName = e.source.getName();
      var spreadsheetId = e.source.getId();

      for (var i = 0; i < quante; i++) {
        var rigaFoglio = partenza + i;
        var riga = dati[i];
        var stato = (riga[col.stato - 1] || "").toString().trim();

        if (VALID_STATES.indexOf(stato) === -1) continue;

        // --- GUARD PRONTO: blocca, ma lasciando detto perché ---
        if (stato === "Pronto") {
          var problemi = motiviBlocco(riga, col);
          if (problemi.length) {
            sheet.getRange(rigaFoglio, col.stato).setValue("");
            avvisaSullaCella(sheet, rigaFoglio, col.stato,
              "⛔ Non posso mettere PRONTO: manca " + problemi.join(", ") + ".\n" +
              "Compila e rimetti Pronto. Questa nota sparisce da sola.");
            SpreadsheetApp.flush();
            esito.bloccate++;
            Logger.log("⛔ " + fileName + " riga " + rigaFoglio + ": manca " + problemi.join(", "));
            continue;
          }
        }

        // --- Id: si legge e si scrive DENTRO il lock, quindi niente corsa ---
        var id = (riga[col.id - 1] || "").toString().trim();
        if (!id) {
          id = nuovoId(adesso);
          sheet.getRange(rigaFoglio, col.id).setValue(id);
          SpreadsheetApp.flush();
          Logger.log("🆔 " + fileName + " riga " + rigaFoglio + ": Id generato " + id);
        }

        if (aperti[id]) { esito.saltate++; continue; }

        // --- Tipologia incasso: si segnala, NON si blocca ---
        // (era la guardia che su Pietra Blu cancellava lo Stato)
        var tip = col.tipologia_incasso
          ? (riga[col.tipologia_incasso - 1] || "").toString().trim() : "";
        var mod = col.modalita
          ? (riga[col.modalita - 1] || "").toString().trim().toLowerCase() : "";
        if (mod === "incassare" && (!tip || tip.indexOf("Scegli") !== -1)) {
          avvisaSullaCella(sheet, rigaFoglio, col.stato,
            "⚠️ Tipologia incasso da scegliere.\nIl transfer è partito lo stesso: " +
            "controlla la tariffa sulla scheda prima di confermare.");
        } else {
          avvisaSullaCella(sheet, rigaFoglio, col.stato, null);   // tutto a posto: via la nota
        }

        queueSheet.appendRow([
          fileName, spreadsheetId, "PENDING", adesso, 0, "",
          id, rigaFoglio,
          col.fornitore ? (riga[col.fornitore - 1] || "") : ""
        ]);
        aperti[id] = true;
        esito.accodate++;
        Logger.log("✅ " + fileName + " riga " + rigaFoglio + " → coda, Id " + id);
      }

      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }

  } catch (err) {
    // Il guasto NON si ingoia: resta scritto sulla cella, dove lo vedi.
    Logger.log("❌ enqueueFromEdit: " + err + "\n" + (err.stack || ""));
    if (sheet) {
      avvisaSullaCella(sheet, primaRiga, colStato,
        "❌ Il salvataggio non è riuscito: " + err + "\n" +
        "Rimetti lo Stato per riprovare. Se si ripete, chiama Agostino.");
    }
  }
  return esito;
}


var TE_TIPOLOGIA_PLACEHOLDER = "⬇️ Scegli tipologia";

var TE_TIPOLOGIE = [
  "Incassa PREZZO PIENO (commissione: alla struttura)",
  "Incassa SOLO NETTO (commissione già pagata in struttura / prezzo scontato)",
  "Incassa PREZZO PIENO (commissione: nessuna)"
];


/**
 * La tendina della Tipologia incasso, sulla riga toccata.
 * Si chiama solo quando la modifica tocca la colonna Modalità.
 */
function preparaTipologiaIncasso(sheet, riga, col) {
  if (!col.modalita || !col.tipologia_incasso) return;

  var cellaTipo = sheet.getRange(riga, col.tipologia_incasso);
  var modalita = (sheet.getRange(riga, col.modalita).getValue() || "").toString().trim().toLowerCase();

  if (modalita === "incassare") {
    var regola = SpreadsheetApp.newDataValidation()
      .requireValueInList([TE_TIPOLOGIA_PLACEHOLDER].concat(TE_TIPOLOGIE), true)
      .setAllowInvalid(false)
      .build();
    cellaTipo.setDataValidation(regola);

    var ora = (cellaTipo.getValue() || "").toString().trim();
    if (!ora) { cellaTipo.setValue(TE_TIPOLOGIA_PLACEHOLDER); ora = TE_TIPOLOGIA_PLACEHOLDER; }
    cellaTipo.setBackground(ora === TE_TIPOLOGIA_PLACEHOLDER ? "#fff2cc" : null);
    return;
  }

  // Non è più «Incassare»: via tendina, via il segnaposto, via il giallo.
  // Si cancella SOLO il segnaposto: se lì dentro c'è una tipologia vera scelta
  // da qualcuno, non è roba nostra da buttare.
  if (cellaTipo.getDataValidation()) cellaTipo.clearDataValidations();
  if ((cellaTipo.getValue() || "").toString().trim() === TE_TIPOLOGIA_PLACEHOLDER) {
    cellaTipo.clearContent();
  }
  cellaTipo.setBackground(null);
}


/**
 * Corregge la cella appena scritta, se è Ora o Telefono. Immediato, come
 * faceva `correzioniPrenotazioni_`, ma senza rifare il giro su tutto il foglio.
 */
function correggiCellaToccata(e, col) {
  if (!e.range || e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return;
  var c = e.range.getColumn();

  // La Data è a parte, per due motivi: non restituisce una stringa da
  // riscrivere ma una data vera, e qui la cella vuota non vuol dire «non fare
  // niente» ma «togli l'avviso». Vedi `transferlib-data.gs`.
  if (col.data && c === col.data) { correggiCellaData(e.range); return; }

  var v = e.range.getValue();
  if (v === "" || v === null || v === undefined) return;

  var n = null;
  if (c === col.ora) n = normalizeOra(v);
  else if (c === col.telefono) n = normalizeTelefono(v);

  if (n !== null && n !== v) {
    e.range.setNumberFormat("@");
    e.range.setValue(n);
  }
}


/**
 * L'unico punto d'ingresso di una modifica su un foglio struttura.
 * Il guscio (`teOnEdit`) chiama solo questa.
 */
function onEditStruttura(e) {
  try {
    if (!e || !e.range || !e.source) return;
    var sheet = e.range.getSheet();
    if (!sheet || sheet.getName() !== SHEET_NAME) return;
    if (e.range.getRow() < FIRST_DATA_ROW) return;

    var lastCol = Math.max(24, sheet.getLastColumn());
    var col = buildColMap(sheet.getRange(1, 1, 1, lastCol).getValues()[0]).col;

    // 1) la cella che hai appena scritto
    try { correggiCellaToccata(e, col); } catch (err) {
      Logger.log("correzione cella: " + err);
    }

    // 2) la tendina, se hai toccato Modalità
    var da = e.range.getColumn();
    var a = da + e.range.getNumColumns() - 1;
    if (col.modalita && col.modalita >= da && col.modalita <= a) {
      try { preparaTipologiaIncasso(sheet, e.range.getRow(), col); } catch (err) {
        Logger.log("tendina tipologia: " + err);
      }
    }

    // 3) l'accodamento, se hai toccato Stato
    if (col.stato && col.stato >= da && col.stato <= a) {
      enqueueFromEdit(e);
    }

  } catch (err) {
    Logger.log("❌ onEditStruttura: " + err + "\n" + (err.stack || ""));
    // Il guasto resta scritto dove lo vedi, non solo nel log.
    try {
      var sh = e.range.getSheet();
      var c = buildColMap(sh.getRange(1, 1, 1, Math.max(24, sh.getLastColumn())).getValues()[0]).col;
      if (c.stato) {
        avvisaSullaCella(sh, e.range.getRow(), c.stato,
          "❌ Il salvataggio non è riuscito: " + err + "\nRimetti lo Stato per riprovare.");
      }
    } catch (e2) {}
  }
}
