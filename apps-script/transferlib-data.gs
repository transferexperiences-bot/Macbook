// =====================================================================
// TransferLib — la colonna Data, insieme a Ora e Telefono
// =====================================================================
//
// DA DOVE NASCE (19/08, Agostino):
//
//     «Abbiamo la parte dello script che si occupa delle correzioni. Che cosa
//      fa? Corregge l'ora se non rispecchia il formato dei due punti. Bene,
//      applichiamo anche la data: se la data non corrisponde a numero ma a
//      testo, viene cancellata o convertita in numero.»
//
// Ed è la cosa giusta: è lo stesso mestiere di `normalizeOra` («830» → «08:30»),
// applicato a un'altra colonna. Stessa forma, stesso punto d'ingresso.
//
// PERCHÉ IERI AVEVO DETTO DI NO, E PERCHÉ OGGI SI FA.
//
// Il 18/08 questo file era scritto ma **non installato**: sulla colonna c'era
// il «tipo di colonna» di Google, che blocca il testo alla radice e in più dà
// il calendario col doppio clic. Toglierlo sarebbe stato uno scambio pessimo.
//
// Poi il 19/08 sera: «se nella cella digito merc 8 questa non viene cancellata
// o sistemata». Quel testo è **entrato e rimasto**. Vuol dire che lì il tipo di
// colonna non arriva, quindi in quella cella non guarda nessuno.
//
// Ed è proprio questo a rendere il codice sicuro:
//
//   • dove il tipo di colonna C'È, il testo non entra mai → questo codice non
//     parte nemmeno, e il calendario resta dov'è, intatto;
//   • dove NON c'è, il testo entra → parte questo, e la cella la sistemiamo noi.
//
// Le due cose non si pestano i piedi, perché il ramo che scrive si accende solo
// quando nella cella c'è del testo — cioè solo dove Google non stava guardando.
// Per la stessa ragione il formato di visualizzazione lo tocchiamo **solo** in
// quel ramo: mai su una cella che Google ha già capito come data.
//
// COSA FA, IN UNA RIGA: se è testo che si legge come data la converte in data
// vera; se è testo che non si legge la cancella e lo scrive sulla cella.
//
// COSA NON FA, DI PROPOSITO: non indovina. «merc 8», «domani», «3 settembre»
// non diventano niente — si cancellano. Una data indovinata male è peggio di
// una cella vuota: la cella vuota si vede, la data sbagliata parte.
//
// Banco: banchi/te/banco-data.js


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
