// =====================================================================
// TransferLib — `enqueueFromEdit`: la parte che mette in coda, una volta sola
// =====================================================================
//
// PERCHÉ ESISTE. Oggi la funzione che accoda è **copiata su ogni foglio
// struttura**, e ogni copia è andata per conto suo: Pietra Blu la chiama
// `onEdit` e ha la guardia incasso, Suite 10 la chiama `enqueueTransfer` e ha
// la GUARD PRONTO, gli altri non si sa. Tutti i guasti di questi due giorni
// stanno nella metà copiata. Questa funzione la sostituisce: sta qui, gira a
// Head, e una correzione vale su tutti e diciotto i fogli nello stesso istante.
//
// ---------------------------------------------------------------------
// I QUATTRO GUASTI CHE CHIUDE
// ---------------------------------------------------------------------
//
// 1) LA CORSA SULL'ID. Il vecchio `onEdit` leggeva la riga **prima** di
//    prendere il lock, quindi il lock non proteggeva niente: due esecuzioni
//    entravano con la stessa fotografia, vedevano l'Id vuoto, ne coniavano uno
//    ciascuna e la seconda sovrascriveva la prima. L'Id finito in coda non
//    esisteva più nel foglio → «Id … non trovato», l'errore più frequente di
//    tutta la coda, e il transfer non partiva.
//    **Qui si legge TUTTO dentro il lock.** Chi entra dopo vede l'Id già scritto.
//
// 2) IL TRIGGER TRIPLO. La funzione sui fogli si chiamava `onEdit`, quindi
//    Google faceva partire anche il trigger semplice — che non ha i permessi
//    per aprire il foglio Strutture e moriva ogni volta in silenzio. Tre
//    esecuzioni per modifica, tre concorrenti sullo stesso lock.
//    **Il guscio la chiama `teOnEdit`**: nome non magico, niente trigger
//    semplice, una esecuzione sola.
//
// 3) IL `catch` CHE INGOIA. `catch (err) { Logger.log(...) }` e l'esecuzione
//    risultava «Completata» anche quando non aveva accodato niente.
//    **Qui ogni guasto lascia una nota rossa sulla cella dello Stato**, dove
//    la vedi, e finisce in coda come ERROR.
//
// 4) LE COLONNE PER NUMERO. `22`, `24`, `9` fissi: bastava una colonna
//    inserita da una struttura e si leggeva la cella sbagliata.
//    **Qui si risolvono per nome** con `buildColMap`, che era già in questa
//    libreria e nessuno usava per accodare.
//
// ---------------------------------------------------------------------
// LE DUE GUARDIE, UNIFICATE
// ---------------------------------------------------------------------
//
// - **GUARD PRONTO** (era solo su Suite 10): senza Fornitore, senza Modalità o
//   con Tariffa 0 non si manda. Eccezione `isFree` per i transfer di cortesia.
//   Blocca davvero, ma lascia la nota sulla cella: non sparisce niente in
//   silenzio come faceva l'`alert` dentro il `catch` vuoto.
//
// - **TIPOLOGIA INCASSO** (era solo su Pietra Blu, e cancellava lo Stato):
//   qui **non blocca più**. Segnala e lascia partire. Una tariffa da
//   ricontrollare si vede sulla scheda prima del ✅; un `Pronto` cancellato è
//   un transfer che sparisce. In dubbio si tiene.
//
// Banco: banchi/te/banco-accoda.js


/** Aggiunge a `buildColMap` i campi che servono alle guardie. */
(function estendiColonne_() {
  COL_ALIASES.modalita          = ["Modalità", "Modalita"];
  COL_ALIASES.tipologia_incasso = ["Tipologia incasso", "Tipologia d'incasso"];
  COL_ALIASES.tariffa           = ["Tariffa", "Prezzo"];
  COL_ALIASES.note              = ["Note", "Nota"];
  COL_ALIASES.data              = ["Data", "Date"];

  ["modalita", "tipologia_incasso", "tariffa", "note", "data"].forEach(function (k) {
    if (RESOLVE_ORDER.indexOf(k) === -1) RESOLVE_ORDER.push(k);
  });

  LEGACY_COL.modalita = 18;
  LEGACY_COL.tipologia_incasso = 19;
  LEGACY_COL.tariffa = 16;
  LEGACY_COL.note = 2;
  LEGACY_COL.data = 3;
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
