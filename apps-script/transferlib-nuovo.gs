// =====================================================================
// TransferLib — AGGIUNTA DEL 18/08/2026
// =====================================================================
//
// Si incolla IN FONDO al codice di TransferLib, una volta sola in assoluto.
// Non sostituisce niente: aggiunge. Quello che c'è già resta com'è.
//
// Contiene due pezzi che fino a oggi erano copiati su ogni foglio struttura,
// ognuno andato per conto suo:
//
//   `enqueueFromEdit`   — la parte che mette in coda
//   `onEditStruttura`   — il punto d'ingresso: correzioni, tendina, accodamento
//
// Da qui in avanti si correggono qui, in un posto solo, e vale su tutti e
// diciotto i fogli nell'istante in cui salvi.
//
// Banco: banchi/te/banco-accoda.js — 40 prove.
// =====================================================================








/** Aggiunge a `buildColMap` i campi che servono alle guardie. */
(function estendiColonne_() {
  COL_ALIASES.modalita          = ["Modalità", "Modalita"];
  COL_ALIASES.tipologia_incasso = ["Tipologia incasso", "Tipologia d'incasso"];
  COL_ALIASES.tariffa           = ["Tariffa", "Prezzo"];
  COL_ALIASES.note              = ["Note", "Nota"];

  ["modalita", "tipologia_incasso", "tariffa", "note"].forEach(function (k) {
    if (RESOLVE_ORDER.indexOf(k) === -1) RESOLVE_ORDER.push(k);
  });

  LEGACY_COL.modalita = 18;
  LEGACY_COL.tipologia_incasso = 19;
  LEGACY_COL.tariffa = 16;
  LEGACY_COL.note = 2;
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

    // 1-bis) la Data: si converte quello che si capisce, si butta il resto
    if (col.data && e.range.getColumn() <= col.data &&
        col.data <= e.range.getColumn() + e.range.getNumColumns() - 1) {
      try { controllaData(sheet, e.range.getRow(), col); } catch (err) {
        Logger.log("controllo data: " + err);
      }
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


/**
 * Controlla la cella Data della riga toccata.
 * @return {string} 'svuotata' | 'niente'
 */
function controllaData(sheet, riga, col) {
  if (!col.data) return 'niente';

  var cella = sheet.getRange(riga, col.data);
  var v = cella.getValue();

  // È una data vera: a posto. Se c'era un avviso vecchio, via.
  if (Object.prototype.toString.call(v) === "[object Date]") {
    if (cella.getNote()) { cella.setNote(null); cella.setBackground(null); }
    return 'niente';
  }

  // Vuota: non è un errore, magari la stanno ancora scrivendo.
  if (v === "" || v === null || v === undefined) {
    if (cella.getNote()) { cella.setNote(null); cella.setBackground(null); }
    return 'niente';
  }

  // Tutto il resto è testo: si cancella.
  cella.clearContent();
  cella.setNote(
    "⛔ Qui va una data, non del testo. L'ho tolta.\n" +
    "Scrivila così: 3/9/2026\n" +
    "Questa nota sparisce da sola quando la data è giusta.");
  cella.setBackground("#f4cccc");
  SpreadsheetApp.flush();
  return 'svuotata';
}
