// =====================================================================
// TransferLib — la colonna Data: convertire quello che si capisce,
// buttare quello che non si capisce
// =====================================================================
//
// DA DOVE VIENE. 18/08 sera. Sul foglio, nella colonna Data, Agostino scrive
// «mercoledì 3 settem» e Google risponde:
//
//     Non valido: questo valore non corrisponde al tipo di colonna data
//
// Quel rifiuto è di Google, non nostro: sulla colonna c'è impostato il tipo
// «data», e il valore viene bloccato PRIMA che qualunque script veda qualcosa.
// Comodo, ma cieco — non dice cosa scrivere, e non lascia traccia.
//
// Agostino: «devi fare in modo che lo script cancelli la cella se l'input è
// testuale». Quindi si toglie il controllo di Google e se ne occupa la libreria,
// che può fare due cose che Google non fa:
//
//   1. **capire** quello che la struttura ha scritto davvero. «3/9», «3-9-2026»,
//      «3 settembre», «mercoledì 3 settembre 2026» sono tutte la stessa data:
//      si convertono, non si buttano.
//   2. **spiegare** quando non ci riesce: la cella si svuota e prende una nota
//      rossa che dice cosa scrivere. Non un rifiuto muto.
//
// ⚠️ NON FUNZIONA finché sulla colonna Data resta il tipo di colonna di Google:
// quello blocca prima e il nostro codice non viene nemmeno chiamato. Va tolto
// (Dati → Tipo di colonna → Nessuno, oppure Dati → Convalida dati → Rimuovi).
//
// L'ANNO QUANDO MANCA. «3 settembre» non dice l'anno. Si prende quello corrente,
// e se la data verrebbe più di 60 giorni nel passato si passa all'anno dopo:
// a dicembre «3 gennaio» è quasi sempre l'anno nuovo, non dieci mesi fa.
// Sessanta giorni di margine perché una prenotazione inserita in ritardo di una
// settimana capita; una di dieci mesi no.
//
// Banco: banchi/te/banco-data.js


var TE_MESI = {
  gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
  luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12
};

/** I giorni della settimana si buttano: non servono a costruire la data. */
var TE_GIORNI_SETTIMANA = [
  "lunedi", "martedi", "mercoledi", "giovedi", "venerdi", "sabato", "domenica",
  "lun", "mar", "mer", "gio", "ven", "sab", "dom"
];


/** Via accenti, maiuscole e punteggiatura: «Mercoledì,» → «mercoledi». */
function teNudo_(s) {
  return (s === null || s === undefined ? "" : s).toString().toLowerCase()
    .replace(/[àáâãä]/g, "a").replace(/[èéêë]/g, "e").replace(/[ìíîï]/g, "i")
    .replace(/[òóôõö]/g, "o").replace(/[ùúûü]/g, "u")
    .replace(/[,.;]/g, " ").replace(/\s+/g, " ").trim();
}


/**
 * Trova il mese da una parola, anche troncata: «settem» → 9.
 * Minimo tre lettere, altrimenti «ma» sarebbe marzo e maggio insieme.
 * @return {number} 1-12, oppure 0 se non è un mese
 */
function teMeseDaParola_(parola) {
  var p = teNudo_(parola);
  if (p.length < 3) return 0;
  var trovato = 0;
  for (var nome in TE_MESI) {
    if (nome.indexOf(p) === 0) {
      if (trovato && trovato !== TE_MESI[nome]) return 0;   // ambiguo: meglio niente
      trovato = TE_MESI[nome];
    }
  }
  return trovato;
}


/**
 * Cosa fare della cella Data.
 *
 * @param {*} valore      quello che c'è nella cella
 * @param {Date} adesso   passato da fuori, così il banco non dipende dall'orologio
 * @return {Date|null|false}
 *         Date  → è da correggere, ecco il valore giusto
 *         null  → va già bene com'è, non si tocca
 *         false → non si capisce: la cella va svuotata
 */
function normalizzaData(valore, adesso) {
  var oggi = adesso || new Date();

  // Google l'ha già interpretata come data: non c'è niente da fare.
  if (Object.prototype.toString.call(valore) === "[object Date]") return null;

  var s = (valore === null || valore === undefined ? "" : valore).toString().trim();
  if (!s) return null;                       // cella vuota: non è un errore

  var g = 0, m = 0, a = 0;

  // --- 1) tutta numerica: 3/9, 03/09/2026, 3-9-26, 3.9.2026 ---
  var num = s.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
  if (num) {
    g = parseInt(num[1], 10);
    m = parseInt(num[2], 10);
    a = num[3] ? parseInt(num[3], 10) : 0;
  }

  // --- 2) alla rovescia: 2026-09-03 ---
  if (!g) {
    var iso = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if (iso) { a = parseInt(iso[1], 10); m = parseInt(iso[2], 10); g = parseInt(iso[3], 10); }
  }

  // --- 3) a parole: «mercoledì 3 settembre 2026», «3 set», «3 settem» ---
  if (!g) {
    var nudo = teNudo_(s);
    var pezzi = nudo.split(" ");
    // via il giorno della settimana, ma solo se è il primo pezzo:
    // «mar» in mezzo può essere marzo.
    if (pezzi.length && TE_GIORNI_SETTIMANA.indexOf(pezzi[0]) !== -1) pezzi.shift();

    for (var i = 0; i < pezzi.length; i++) {
      if (/^\d{1,2}$/.test(pezzi[i]) && !g) { g = parseInt(pezzi[i], 10); continue; }
      if (/^\d{4}$/.test(pezzi[i])) { a = parseInt(pezzi[i], 10); continue; }
      if (!m) { var mm = teMeseDaParola_(pezzi[i]); if (mm) m = mm; }
    }
  }

  if (!g || !m) return false;                          // non ci siamo capiti
  if (g < 1 || g > 31 || m < 1 || m > 12) return false;

  if (!a) a = oggi.getFullYear();
  else if (a < 100) a += 2000;                         // «26» → 2026

  var d = new Date(a, m - 1, g);
  d.setHours(0, 0, 0, 0);

  // Giorno che non esiste: 31 febbraio diventerebbe 3 marzo. Meglio dirlo.
  if (d.getDate() !== g || d.getMonth() !== m - 1) return false;

  // Anno non scritto e data già passata da un pezzo: quasi sempre è l'anno dopo.
  if (!num || !num[3]) {
    if (!a || a === oggi.getFullYear()) {
      var limite = new Date(oggi.getTime() - 60 * 24 * 60 * 60 * 1000);
      if (d < limite) d = new Date(a + 1, m - 1, g);
    }
  }

  return d;
}


/**
 * Applica la regola sulla cella Data della riga toccata.
 * @return {string} 'corretta' | 'svuotata' | 'niente'
 */
function controllaData(sheet, riga, col, adesso) {
  if (!col.data) return 'niente';

  var cella = sheet.getRange(riga, col.data);
  var esito = normalizzaData(cella.getValue(), adesso);

  if (esito === null) { return 'niente'; }

  if (esito === false) {
    cella.clearContent();
    cella.setNote(
      "⛔ Data non riconosciuta, l'ho tolta.\n" +
      "Scrivila così: 3/9/2026 — oppure «3 settembre».\n" +
      "Questa nota sparisce quando la data è giusta.");
    cella.setBackground("#f4cccc");
    SpreadsheetApp.flush();
    return 'svuotata';
  }

  cella.setValue(esito);
  cella.setNumberFormat("dd/MM/yyyy");
  if (cella.getNote()) { cella.setNote(null); cella.setBackground(null); }
  return 'corretta';
}
