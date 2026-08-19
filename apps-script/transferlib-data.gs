// =====================================================================
// TransferLib — controllo della colonna Data
// ⚠️ SCRITTO E DELIBERATAMENTE **NON INSTALLATO**. Leggi prima di usarlo.
// =====================================================================
//
// COSA È SUCCESSO, 18/08 sera.
//
// Agostino scrive «mercoledì 3 settem» nella colonna Data e Google risponde
// *«Non valido: questo valore non corrisponde al tipo di colonna data»*. Lui
// chiede che sia lo script a cancellare la cella quando l'input è testuale, e
// io scrivo questo file. Per farlo funzionare però bisogna togliere il «tipo di
// colonna» di Google — altrimenti blocca prima e il codice non parte.
//
// E LÌ LA RISPOSTA CHE CHIUDE LA QUESTIONE:
//
//     «Non voglio modificare la tipologia di colonna, e ti spiego perché:
//      così io clicco due volte e posso selezionare la data.»
//
// Il tipo di colonna non è solo un controllo: è **il calendario col doppio
// clic**. Toglierlo per guadagnare un messaggio d'errore più bello sarebbe uno
// scambio pessimo — si perde uno strumento che la struttura usa tutti i giorni.
//
// E il tipo di colonna fa già il lavoro, meglio: blocca il testo **alla
// radice**, prima ancora che entri nella cella. Il nostro codice al confronto
// arriva sempre dopo.
//
// PERCHÉ IL FILE RESTA QUI.
//
// Perché la decisione sia rintracciabile, e perché se un domani su un foglio il
// tipo di colonna non ci fosse, questo è pronto. Per installarlo: rimettere in
// `onEditStruttura` la chiamata a `controllaData` quando la modifica tocca
// `col.data`.
//
// ⚠️ ATTENZIONE SE LO RIACCENDI: `controllaData` forza il formato di
// visualizzazione a ogni scrittura. Con il tipo di colonna attivo quel
// `setNumberFormat` si mette a litigare con la formattazione di Google. Le due
// cose non convivono: o l'una o l'altra.
//
// Banco: banchi/te/banco-data.js (verde, ma prova codice non installato)


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
