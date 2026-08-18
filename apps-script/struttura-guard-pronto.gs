// =====================================================================
// GUARD PRONTO — la guardia di Suite 10, portata sugli altri fogli
// =====================================================================
//
// COS'È. Su Suite 10, mettere «Pronto» su una riga senza Fornitore, senza
// Modalità di pagamento o con Tariffa a 0 non manda niente: la guardia blocca.
// Su Pietra Blu quella guardia non c'è, e la riga parte com'è — cioè un
// transfer che arriva su Telegram senza prezzo, o senza sapere chi paga.
//
// Agostino l'ha voluta ovunque. Questo file la porta di là, con due cose
// sistemate rispetto all'originale.
//
// ---------------------------------------------------------------------
// COSA CAMBIA RISPETTO ALLA VERSIONE DI SUITE 10
// ---------------------------------------------------------------------
//
// 1) L'AVVISO NON SI PERDE PIÙ. L'originale fa così:
//
//        sheet.getRange(currentRow, TRIGGER_COL).setValue("");
//        try { SpreadsheetApp.getUi().alert(...); } catch (e2) {}
//
//    `getUi()` funziona solo se il foglio è aperto davanti a qualcuno. In un
//    trigger senza interfaccia lancia, il `catch` vuoto se lo mangia, e allora
//    «Pronto» sparisce **senza che nessuno sappia perché**. È la stessa morte
//    silenziosa di `incassare_`, con un'altra faccia.
//
//    Qui l'avviso lo scriviamo PRIMA sulla cella dello Stato, come nota: la
//    nota resta lì finché non si sistema, e non dipende da nessuna finestra.
//    L'alert diventa un di più, non l'unico canale.
//
// 2) LA MOTIVAZIONE STA DOVE È SUCCESSO. Non «Manca: Fornitore» in una finestra
//    che chiudi e non ritrovi più, ma sulla riga, accanto alla cella che hai
//    appena toccato.
//
// COSA NON CAMBIA. Le regole sono identiche a quelle di Suite 10, eccezione
// `isFree` compresa: i transfer di cortesia passano con tariffa 0. Non ho
// inventato nessun controllo nuovo — questo non è il momento di cambiare le
// regole dei soldi, è il momento di portarle dove mancano.
//
// LE COLONNE RESTANO NUMERI. `gv[8]`, `gv[15]`, `gv[17]` come nell'originale.
// So che è fragile e so che va risolto per nome: si fa nel trasloco in
// `TransferLib`, su tutto il file insieme. Cambiare metà file a numeri e metà
// a nomi è peggio di lasciarlo com'è.
//
// ---------------------------------------------------------------------
// DOVE SI INCOLLA
// ---------------------------------------------------------------------
//
// In `Logica incasso.gs` di Pietra Blu (e degli altri fogli senza guardia):
//
//   a) incolla `teMotiviBlocco_` in fondo al file, come funzione nuova;
//   b) dentro `onEdit`, subito DOPO questa riga:
//
//          if (!VALID_STATES.includes(statoValue)) continue;
//
//      incolla il blocco marcato «INNESTO» qui sotto.
//
// 🔴 Tocca il salvataggio: si incolla solo dopo un sì esplicito.
// Banco: banchi/te/banco-guard-pronto.js


/**
 * Decide se una riga può andare in «Pronto». Funzione pura: nessun
 * SpreadsheetApp qui dentro, così si prova offline sui casi veri.
 *
 * @param {Array} gv  i valori della riga, colonne 1..24 (indice 0 = colonna A)
 * @return {{problemi: Array<string>, isFree: boolean}}
 *         `problemi` vuoto = si può mettere Pronto.
 */
function teMotiviBlocco_(gv) {
  gv = gv || [];

  var fornitoreG = (gv[8]  || "").toString().trim();   // I — Fornitore
  var modalitaG  = (gv[17] || "").toString().trim();   // R — Modalità
  var tariffaRaw = gv[15];                             // P — Tariffa

  var tariffaNum = parseFloat(
    String(tariffaRaw).replace(/[^0-9.,-]/g, "").replace(",", "."));
  var tariffaZero = (tariffaRaw === "" || tariffaRaw === null || tariffaRaw === undefined)
    ? true
    : (isNaN(tariffaNum) ? true : tariffaNum === 0);

  // I transfer di cortesia hanno tariffa 0 per davvero e devono passare.
  // Si guarda in tre posti perché la struttura lo scrive dove le viene comodo:
  // nelle Note (B), nella Tipologia incasso (S), o nella Modalità stessa (R).
  var isFree = /compliment|complement|free shuttle|cmp shuttle|shuttle gratis|navetta gratu|gratis|gratuit|omaggio|free/i
    .test(((gv[1] || "") + " " + (gv[18] || "") + " " + modalitaG));

  var problemi = [];
  if (!fornitoreG) problemi.push("Fornitore");
  if (!modalitaG)  problemi.push("Modalita/Pagamento");
  if (tariffaZero && !isFree) problemi.push("Tariffa a 0");

  return { problemi: problemi, isFree: isFree };
}


/**
 * Applica la guardia: svuota lo Stato e lascia la motivazione ATTACCATA alla
 * cella, così non dipende da una finestra che potrebbe non aprirsi mai.
 * Ritorna true se ha bloccato.
 */
function teApplicaGuardPronto_(sheet, riga, colStato, problemi) {
  if (!problemi.length) return false;

  var testo = "⛔ Non posso mettere PRONTO: manca " + problemi.join(", ") + ".\n" +
              "Compila e rimetti Pronto. Questa nota sparisce da sola.";

  var cella = sheet.getRange(riga, colStato);
  cella.setValue("");
  cella.setNote(testo);          // <- resta sul foglio, non serve nessuna UI
  cella.setBackground("#f4cccc");
  SpreadsheetApp.flush();

  // Il toast si vede solo se stai guardando, ma se ci sei è immediato.
  try {
    SpreadsheetApp.getActive().toast(
      "Riga " + riga + ": manca " + problemi.join(", ") + ".", "PRONTO bloccato", 10);
  } catch (e) {}

  // L'alert è l'ultimo dei tre canali, non il primo. Se non c'è UI, pazienza:
  // la nota sulla cella c'è già.
  try {
    SpreadsheetApp.getUi().alert(
      "Impossibile mettere PRONTO (riga " + riga + ")",
      "Manca: " + problemi.join(", ") + ".\n\nCompila i campi e riprova.",
      SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {}

  return true;
}


/**
 * Quando la riga torna a posto, l'avviso se ne deve andare da solo.
 * Da chiamare quando `Pronto` passa la guardia.
 */
function tePuliscoAvvisoPronto_(sheet, riga, colStato) {
  var cella = sheet.getRange(riga, colStato);
  if (cella.getNote()) {
    cella.setNote(null);
    cella.setBackground(null);
  }
}


/* =====================================================================
 * INNESTO — dentro `onEdit`, subito dopo
 *     if (!VALID_STATES.includes(statoValue)) continue;
 * =====================================================================

        // ===== GUARD PRONTO =====
        if (statoValue === "Pronto") {
          var gv = sheet.getRange(currentRow, 1, 1, 24).getValues()[0];
          var esito = teMotiviBlocco_(gv);
          if (teApplicaGuardPronto_(sheet, currentRow, TRIGGER_COL, esito.problemi)) {
            continue;                     // NON si accoda: niente riga orfana
          }
          tePuliscoAvvisoPronto_(sheet, currentRow, TRIGGER_COL);
        }

 * ===================================================================== */
