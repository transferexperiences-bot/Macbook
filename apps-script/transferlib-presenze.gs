// =====================================================================
// TransferLib — «Presenze»: quali fogli stanno girando col codice nuovo
// =====================================================================
//
// DA DOVE NASCE (19/08, Agostino): «hai modo di verificare se l'ho fatto per
// tutti?». No: gli script legati ai fogli non si vedono da fuori — non
// compaiono nemmeno in Drive (la prova è in `backups/apps-script/INVENTARIO.md`).
// L'unico modo di sapere se un foglio sta girando col codice nuovo è che sia
// **il codice nuovo a dirlo**.
//
// E serve anche dopo: il 19/08 alle 16:08 su Pietra Blu il file `Guscio` è
// sparito, e ce ne siamo accorti perché per caso stavamo guardando lì. Con
// questo, un foglio che smette di farsi vivo si nota da solo.
//
// COME FUNZIONA. Ogni foglio, mentre fa il suo giro (`processFile`, ogni
// minuto) e a ogni modifica, aggiorna **la sua riga** nel foglio «Presenze»
// dentro Strutture: nome, id, ultimo giro, ultima modifica, versione della
// libreria. Una riga per foglio, non una riga per volta: non cresce.
//
// QUANTO COSTA. Niente: c'è una memoria locale (`CacheService`) che tiene il
// segno per 5 minuti, quindi si scrive al massimo una volta ogni 5 minuti per
// foglio, e negli altri giri non si apre nemmeno Strutture.
//
// LA REGOLA CHE NON SI TOCCA: questo è un accessorio. Sta tutto dentro un
// `try/catch` e non restituisce niente a nessuno — se si rompe, si rompe da
// solo e in silenzio. Un salvataggio non può fallire per colpa di un censimento.
//
// Banco: banchi/te/banco-presenze.js


var TE_PRESENZE = "Presenze";

/** Si cambia a ogni aggiornamento della libreria: è quello che si legge nel censimento. */
var TE_VERSIONE = "19/08/2026 — data + tendina";

/** Ogni quanto si riscrive, per foglio. */
var TE_PRESENZE_OGNI_MS = 5 * 60 * 1000;


/**
 * Segna che questo foglio è vivo e sta girando con questa libreria.
 * @param {string} quale 'sweep' (il giro ogni minuto) | 'onEdit' (una modifica)
 */
function teSegnalaPresenza(spreadsheetId, fileName, quale) {
  try {
    var colonna = (quale === 'onEdit') ? 4 : 3;

    // Il freno: si scrive al massimo una volta ogni 5 minuti per tipo.
    // La cache è del progetto che chiama, cioè del singolo foglio.
    var cache = null;
    try { cache = CacheService.getScriptCache(); } catch (e) {}
    var chiave = 'te_presenza_' + quale;
    if (cache && cache.get(chiave)) return;

    var sh = SpreadsheetApp.openById(STRUTTURE_ID).getSheetByName(TE_PRESENZE);
    if (!sh) {
      sh = SpreadsheetApp.openById(STRUTTURE_ID).insertSheet(TE_PRESENZE);
      sh.appendRow(["Foglio", "SpreadsheetId", "Ultimo giro", "Ultima modifica",
                    "Versione libreria"]);
      sh.setFrozenRows(1);
    }

    var adesso = new Date();
    var n = sh.getLastRow();
    var dati = n > 1 ? sh.getRange(2, 1, n - 1, 5).getValues() : [];

    var riga = -1;
    for (var i = 0; i < dati.length; i++) {
      if ((dati[i][1] || "").toString() === spreadsheetId) { riga = i + 2; break; }
    }

    if (riga === -1) {
      // Riga nuova. L'id sta in B ed è la chiave: il nome del file cambia, l'id no.
      sh.appendRow([fileName, spreadsheetId,
                    quale === 'onEdit' ? "" : adesso,
                    quale === 'onEdit' ? adesso : "",
                    TE_VERSIONE]);
    } else {
      sh.getRange(riga, colonna).setValue(adesso);
      sh.getRange(riga, 5).setValue(TE_VERSIONE);
      if ((dati[riga - 2][0] || "").toString() !== fileName) {
        sh.getRange(riga, 1).setValue(fileName);
      }
    }

    if (cache) cache.put(chiave, '1', Math.round(TE_PRESENZE_OGNI_MS / 1000));

  } catch (err) {
    // Accessorio: non deve poter far fallire niente, mai.
    try { Logger.log("presenza (ignorato): " + err); } catch (e) {}
  }
}
