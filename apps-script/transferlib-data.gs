// =====================================================================
// TransferLib — la colonna Data: o è una data, o si cancella
// =====================================================================
//
// DA DOVE VIENE. 18/08 sera. Agostino scrive «mercoledì 3 settem» nella colonna
// Data e Google risponde *«Non valido: questo valore non corrisponde al tipo di
// colonna data»*. Quel rifiuto è di Google — sulla colonna c'è il tipo «data» —
// e blocca il valore prima che qualunque script lo veda.
//
// Agostino: «devi fare in modo che lo script cancelli la cella se l'input è
// testuale, finché non la scrive in formato data».
//
// LA REGOLA, UNA SOLA.
//
//   Google l'ha capita come data  → si lascia stare
//   la cella è vuota              → non è un errore, si lascia stare
//   qualunque altra cosa          → si cancella, e la cella dice perché
//
// Niente conversioni, niente tentativi di indovinare cosa intendeva. Sui
// transfer una data indovinata male è peggio di una cella vuota: se il codice
// legge «3 settembre» e sbaglia l'anno, l'autista si presenta fra dodici mesi
// e nessuno se ne accorge finché il cliente non resta a terra. Una cella vuota
// e rossa invece si vede subito.
//
// Come si riconosce una data: Google, quando quello che scrivi È una data,
// nella cella non ci mette il testo — ci mette un valore data, e `getValue()`
// restituisce un oggetto `Date`. Se torna una stringa, quello che c'è dentro è
// testo. Non serve altro per decidere.
//
// ⚠️ NON FUNZIONA finché sulla colonna Data resta il «tipo di colonna» di
// Google: quello blocca prima e questo codice non viene nemmeno chiamato.
// Va tolto sul foglio — Dati → Tipo di colonna → Nessuno.
//
// Banco: banchi/te/banco-data.js


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
