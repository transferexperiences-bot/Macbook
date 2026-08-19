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
// E poi, tolta la convalida, la seconda metà del problema: «se scrivo 7/8 resta
// in formato numerico, non viene convertito nel formato attuale data, tipo
// mercoledì 7 agosto, e non mi va bene». Giusto: la convalida di Google non
// c'entrava niente con **come si vede** la data. Quello è il formato di
// visualizzazione della cella, ed è una cosa a parte.
//
// LA REGOLA.
//
//   Google l'ha capita come data  → si lascia il valore, e si mette il formato
//                                   esteso: «ven 7 agosto 2026»
//   la cella è vuota              → non è un errore, si lascia stare
//   qualunque altra cosa          → si cancella, e la cella dice perché
//
// Il formato lo mette il codice, non tu a mano su diciotto colonne. E lo rimette
// ogni volta: se qualcuno riformatta la colonna, alla prima data scritta torna
// com'era.
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
 * Come si vedono le date sui fogli struttura: «ven 7 agosto 2026».
 * È il formato che c'è già sulle righe vecchie — qui si scrive una volta sola,
 * e da qui vale per tutti i fogli.
 *
 * `dddd` invece di `ddd` darebbe «venerdì» per esteso: si cambia qui.
 */
var TE_FORMATO_DATA = "ddd d MMMM yyyy";


/**
 * Controlla la cella Data della riga toccata.
 * @return {string} 'formattata' | 'svuotata' | 'niente'
 */
function controllaData(sheet, riga, col) {
  if (!col.data) return 'niente';

  var cella = sheet.getRange(riga, col.data);
  var v = cella.getValue();

  // È una data vera: si tiene il valore e si mette il formato esteso, così
  // «7/8» scritto di fretta si vede come «ven 7 agosto 2026» come tutte le altre.
  if (Object.prototype.toString.call(v) === "[object Date]") {
    cella.setNumberFormat(TE_FORMATO_DATA);
    if (cella.getNote()) { cella.setNote(null); cella.setBackground(null); }
    return 'formattata';
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
