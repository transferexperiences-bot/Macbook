// =====================================================================
// TransferLib — `onEditStruttura`: l'unico punto d'ingresso di una modifica
// =====================================================================
//
// PERCHÉ. Spegnendo il vecchio `onEdit_completo` si perdevano tre cose. Due
// erano già coperte altrove — la correzione di Ora e Telefono la rifà
// `processFile` ogni minuto, e l'avviso sulla tipologia mancante è diventato
// una nota sulla cella. La terza no: **il menu a tendina nella colonna
// Tipologia incasso**, che compare da solo quando metti «Incassare».
//
// Agostino la vuole. Quindi invece di riaccendere il trigger vecchio su
// qualche foglio, la tendina viene qui: un posto solo, e ce l'hanno tutti e
// diciotto invece dei pochi che avevano `incassare_`.
//
// COSA FA QUESTA FUNZIONE, IN ORDINE.
//
//   1. corregge la cella che hai appena scritto, se è Ora o Telefono
//      (immediato come prima; il giro su tutto il foglio resta a `teSweep`,
//       ed è quello che faceva durare le esecuzioni 7-20 secondi)
//   2. se hai toccato Modalità, sistema la tendina della Tipologia incasso
//   3. se hai toccato Stato, accoda — `enqueueFromEdit`
//
// COSA NON FA PIÙ, DI PROPOSITO.
//
// Il vecchio `incassare_` apriva una finestra modale con `getUi().alert()`
// quando sceglievi «Incassare». In un trigger senza interfaccia quella
// chiamata lancia, e il `catch` vuoto se la mangiava insieme a tutto il resto
// della funzione. Al suo posto: la cella si colora di giallo e ci compare
// «⬇️ Scegli tipologia». Si vede, non si può ignorare, e non può far saltare
// niente.
//
// E soprattutto: **non cancella più quello che hai scritto**. Era la trappola
// che il 17/08 ha fatto sparire la riga 69 di 6 Stelle Mama.
//
// Banco: banchi/te/banco-accoda.js


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
