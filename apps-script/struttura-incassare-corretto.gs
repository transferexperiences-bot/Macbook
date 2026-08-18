// =====================================================================
// CORREZIONE — la guardia incasso non mangia più il salvataggio
// =====================================================================
//
// DA INCOLLARE al posto di `incassare_` in `Logica incasso.gs`, su OGNI foglio
// struttura. Sostituisce solo quella funzione: il resto del file non si tocca.
// Aggiunge sopra una costante nuova, `TE_COL_PROTETTE`.
//
// COSA CAMBIA, IN UNA RIGA.
//
// Oggi: tipologia incasso non scelta → `e.range.clearContent()` cancella quello
// che hai appena scritto, qualunque colonna sia.
// Dopo: se la modifica tocca lo **Stato** o l'**Id**, non si cancella niente.
// Si segnala e si lascia passare.
//
// PERCHÉ COSÌ E NON ALTRIMENTI.
//
// La guardia ha ragione a esistere: senza tipologia la tariffa esce sbagliata,
// e i soldi sono zona rossa. Ma protegge i soldi cancellando il salvataggio, e
// fra i due il salvataggio viene prima — «in dubbio si risponde / si tiene».
// Una tariffa da ricontrollare è una scheda che guardi due secondi in più;
// un `Pronto` cancellato è un transfer che sparisce e te lo dice il cliente.
//
// Il transfer parte lo stesso, e la tariffa la vedi **sulla scheda Telegram**
// prima di premere ✅. Il controllo resta, si sposta dove lo vedi davvero.
//
// L'AVVISO. Il toast di quattro secondi non basta: se non stai guardando il
// foglio in quel momento, non è mai esistito. Al suo posto la cella della
// tipologia si colora e prende una **nota**, che resta lì finché non la
// sistemi, e il toast dura dieci secondi invece di quattro.
//
// COSA NON CAMBIA. Su tutte le altre colonne la guardia si comporta come prima:
// blocca e cancella. Se vuoi togliere la cancellazione ovunque — e secondo me
// andrebbe tolta, cancellare quello che uno ha appena scritto non è mai giusto —
// basta allargare `TE_COL_PROTETTE`. È una riga.
//
// Banco: banchi/te/banco-stato-cancellato.js, blocco 2.

/**
 * Colonne che la guardia incasso non deve MAI cancellare.
 *
 *   22 = V, Stato   — è il salvataggio: cancellarlo perde il transfer
 *   24 = X, Id      — è l'identità della riga: senza, la coda non la ritrova
 *
 * Sono numeri e non nomi perché tutto il resto di questo file lavora a numeri:
 * mescolare i due modi qui dentro farebbe più danni che bene. Il passaggio ai
 * nomi va fatto su tutto il file insieme, con `TransferLib.buildColMap()`.
 */
var TE_COL_PROTETTE = [22, 24];

/**
 * ========================================
 * LOGICA "Incassare" su Prenotazioni
 * - Modalità in colonna R (18)
 * - Tipologia incasso in colonna S (19)
 * ========================================
 */
function incassare_(e) {
  try {
    const sh = e.range.getSheet();
    if (sh.getName() !== "Prenotazioni") return;

    const COL_MODALITA = 18; // R
    const COL_TIPO = 19;     // S
    const PLACEHOLDER = "⬇️ Scegli tipologia";

    const TIPI = [
      "Incassa PREZZO PIENO (commissione: alla struttura)",
      "Incassa SOLO NETTO (commissione già pagata in struttura / prezzo scontato)",
      "Incassa PREZZO PIENO (commissione: nessuna)"
    ];

    const row = e.range.getRow();
    if (row === 1) return;

    const startCol = e.range.getColumn();
    const endCol = startCol + e.range.getNumColumns() - 1;

    const modalitaCell = sh.getRange(row, COL_MODALITA);
    const tipoCell = sh.getRange(row, COL_TIPO);

    const modalita = String(modalitaCell.getValue() || "").trim().toLowerCase();
    const tipoVal = String(tipoCell.getValue() || "").trim();

    const editToccaR = !(COL_MODALITA < startCol || COL_MODALITA > endCol);
    const editToccaS = !(COL_TIPO < startCol || COL_TIPO > endCol);

    if (editToccaR) {
      const isSingleCellEdit =
        (e.range.getNumRows() === 1 && e.range.getNumColumns() === 1 && e.range.getColumn() === COL_MODALITA);

      const newVal = String(e.value || "").trim().toLowerCase();
      const oldVal = String(e.oldValue || "").trim().toLowerCase();

      const justSwitchedToIncassare =
        isSingleCellEdit && newVal === "incassare" && oldVal !== "incassare";

      // L'alert è modale e in un trigger installabile può non avere una UI:
      // se lancia, si tira dietro tutto il resto della funzione. Il promemoria
      // vero è la nota sulla cella, che resta; questo è solo di cortesia.
      if (justSwitchedToIncassare) {
        try {
          SpreadsheetApp.getUi().alert(
            "Tipologia incasso",
            "Hai selezionato 'Incassare'.\n\nScegli la tipologia in colonna S (riga " + row + ").",
            SpreadsheetApp.getUi().ButtonSet.OK
          );
        } catch (errUi) {
          SpreadsheetApp.getActive().toast(
            "Scegli la tipologia incasso in colonna S (riga " + row + ").",
            "Tipologia incasso", 10
          );
        }
      }

      if (modalita === "incassare") {
        const rule = SpreadsheetApp.newDataValidation()
          .requireValueInList([PLACEHOLDER, ...TIPI], true)
          .setAllowInvalid(false)
          .build();
        tipoCell.setDataValidation(rule);

        const cur = String(tipoCell.getValue() || "").trim();
        if (!cur) tipoCell.setValue(PLACEHOLDER);

        const cur2 = String(tipoCell.getValue() || "").trim();
        if (cur2 === PLACEHOLDER) tipoCell.setBackground("#fff2cc");
        else tipoCell.setBackground(null);

      } else {
        if (tipoCell.getDataValidation()) tipoCell.clearDataValidations();
        if (String(tipoCell.getValue() || "").trim()) tipoCell.clearContent();
        tipoCell.setBackground(null);
        tipoCell.setNote(null);
      }
      return;
    }

    const tipologiaNonScelta = (modalita === "incassare") && (!tipoVal || tipoVal === PLACEHOLDER);
    if (tipologiaNonScelta && !editToccaS) {

      // ===== LA CORREZIONE =====
      // Se la modifica tocca anche una sola colonna protetta, non si cancella
      // NIENTE — nemmeno le altre celle di un incollaggio largo. Meglio una
      // tariffa da ricontrollare che un salvataggio perso.
      let toccaProtette = false;
      for (let c = startCol; c <= endCol; c++) {
        if (TE_COL_PROTETTE.indexOf(c) !== -1) { toccaProtette = true; break; }
      }

      if (toccaProtette) {
        tipoCell.setBackground("#fff2cc");
        tipoCell.setNote(
          "⚠️ Tipologia incasso da scegliere (riga " + row + ").\n" +
          "Il transfer è partito lo stesso: controlla la tariffa sulla scheda " +
          "prima di confermare.\nLa nota sparisce quando scegli la tipologia."
        );
        SpreadsheetApp.getActive().toast(
          "Manca la Tipologia incasso (colonna S, riga " + row + "). " +
          "Il transfer parte lo stesso: controlla la tariffa sulla scheda.",
          "Da sistemare", 10
        );
        return;
      }

      e.range.clearContent();
      SpreadsheetApp.getActive().toast(
        "Prima seleziona 'Tipologia incasso' (colonna S).",
        "Bloccato",
        4
      );
      return;
    }

    if (editToccaS && modalita === "incassare") {
      const newTipo = String(tipoCell.getValue() || "").trim();
      if (newTipo && newTipo !== PLACEHOLDER) {
        tipoCell.setBackground(null);
        tipoCell.setNote(null);          // scelta la tipologia, l'avviso sparisce
      } else {
        tipoCell.setBackground("#fff2cc");
      }
    }

  } catch (err) {
    console.error("incassare_ error:", err);
  }
}
