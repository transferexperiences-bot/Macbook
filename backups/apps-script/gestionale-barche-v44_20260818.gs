/**
 * ========================================================================
 * GESTIONALE BARCHE — Apps Script V4.4  (istantanea 18/08/2026)
 * ========================================================================
 *
 * PROVENIENZA. Progetto `1rF0UF5s0AHafDeBocGdyyLVhO6UQZBfFw8Re35eLr29EoPKhcr-2iMYP`,
 * letto da Drive con l'export `application/vnd.google-apps.script+json` — non
 * incollato a mano. Ultima modifica sul server: 05/08/2026.
 *
 * PERCHÉ STA QUI. È l'unico posto dove sono già risolti due problemi che sui
 * fogli struttura non lo sono:
 *
 *   `_parseDataFlessibile_`  — accetta la data in dd/mm/yyyy, yyyy-mm-dd e
 *                              testuale, invece di fidarsi del formato cella
 *   `_inviaTransferWebhook_` — manda il transfer a n8n risolvendo le colonne
 *                              per nome (`colMap[...] || numero`), con l'ora di
 *                              pickup calcolata (inizio − 20 minuti)
 *   `cercaCol_`              — un terzo risolutore di colonne per nome, diverso
 *                              sia da `TransferLib.buildColMap` sia da
 *                              `teBuildColMap_`. Tre implementazioni della
 *                              stessa idea in tre punti diversi: è il lavoro
 *                              di convergenza da fare.
 *
 * Nessun token qui dentro: verificato prima di committare.
 * NON è un file da modificare: è una fotografia.
 */

/**
 * GESTIONALE BARCHE — Apps Script V4.4
 * Aggiornato 2026-05-07
 *
 * NOVITÀ V4.4:
 * - FIX BUG CRITICO "chi arriva prima vince" applicato in modo coerente:
 *   il ciclo di lookup conflitti dentro _calcolaPostiDisponibili_ ora considera
 *   SOLO le righe sopra (numero riga minore) come bloccanti. Le righe sotto
 *   non possono più cancellare prenotazioni già confermate sopra.
 * - FIX POSTI DISPONIBILI per Privato: ora scala come il Gruppo
 *   (capienza - paxCorrente), uniformando la UX. Esempio capienza 8, Privato 3
 *   → mostra 5; Privato 8 → mostra 0 (SOLD OUT).
 * - PROTEZIONE PRENOTAZIONI ESISTENTI: una riga già inserita vale come
 *   "confermata" e non viene mai sovrascritta dal ricalcolo di righe successive.
 * - TRANSFER semplificato a checkbox booleano (TRUE/FALSE):
 *     FALSE → TRUE        : richiesta nuovo transfer (azione: "nuovo")
 *     TRUE  → FALSE       : cancellazione transfer (azione: "cancella")
 *     TRUE invariato +
 *     cambio Data o Ora I.: modifica transfer    (azione: "modifica")
 *   Niente più suffissi -A/-R, niente più dropdown A / A/R / Modifica / Cancella.
 *   id transfer = id prenotazione, payload più pulito.
 * - SCAFFOLDING SYNC TEMPLATE STRUTTURE (Opzione A):
 *   Aggiunto foglio "Strutture" (Nome | Spreadsheet ID | Telegram | Stato | Ultimo Sync).
 *   Funzione _pushDashboardATemplates_() chiamata dopo ogni edit/refresh: se la
 *   scheda è vuota, no-op silenzioso; se popolata, apre via openById ogni
 *   struttura attiva e ricopia la dashboard. Latenza 1-5 secondi.
 *
 * NOVITÀ V4.3 (storico):
 * - Fee Riepilogo: 5 colonne, cristallizzazione su Modalità Pagamento
 * - Prenotazioni: colonna "Fee Manuale"
 *
 * NOVITÀ V4.2 (storico):
 * - Auto-aggiornamento universale (Dashboard + Fee + Sub) ogni minuto
 * - Sub Appaltatori: foglio flat auto-popolato
 *
 * NOVITÀ V4.1 (storico):
 * - Sub Appaltatori ledger
 * - ID univoco auto-generato
 * - Auto-correzione cellulare
 * - Porto dropdown in Dashboard
 *
 * REQUISITI:
 * - La colonna "Tipologia" nella Tabella deve essere di tipo TESTO
 * - Dropdown Tipologia: Gruppo / Privato
 * - Regola "chi arriva prima vince" (V4.4: applicata correttamente)
 *
 * FOGLI RICHIESTI: Dashboard, Prenotazioni, Flotta, Tipi Tour, Porti,
 *                  Sub Appaltatori, Strutture (nuovo, può restare vuoto)
 */

// ── COSTANTI ──────────────────────────────────────────────────────────────
var MAX_BARCHE = 11;
var PORTO_DEFAULT = "Porto di Polignano";
var SLOTS_GESTIONALE = [
  "09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30",
  "13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30",
  "17:00","17:30","18:00","18:30","19:00"
];
var N_COLS_DASH = 2 + SLOTS_GESTIONALE.length; // 23

// ── MENU ──────────────────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("⚓ Gestionale")
    .addItem("Setup Dashboard (prima volta)", "setupDashboardGestionale")
    .addItem("⚓ Ricrea sezione Porto", "setupPortoSection")
    .addSeparator()
    .addItem("Setup Sub Appaltatori", "setupSubAppaltatori")
    .addItem("🏨 Setup scheda Strutture", "setupSchedaStrutture")
    .addSeparator()
    .addItem("🔄 Aggiorna Dashboard", "aggiornaDashboard")
    .addItem("📊 Aggiorna Fee Riepilogo", "aggiornaFeeRiepilogo")
    .addItem("📊 Aggiorna Sub Appaltatori Riepilogo", "aggiornaSubAppaltRiepilogo")
    .addItem("🔄 Aggiorna TUTTO", "aggiornaAutoTutto")
    .addSeparator()
    .addItem("▶ Avvia auto-aggiornamento (ogni min)", "installaTriggerdashboard")
    .addItem("⏹ Ferma auto-aggiornamento", "rimuoviTriggerDashboard")
    .addSeparator()
    .addItem("🔗 Attiva Transfer webhook (una volta)", "installaTriggerOnEdit")
    .addItem("☑ Converti colonna Transfer in checkbox", "convertiTransferInCheckbox")
    .addToUi();
}

// ══════════════════════════════════════════════════════════════════════════
// onEdit — Smista le modifiche per foglio
// ══════════════════════════════════════════════════════════════════════════
function onEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  var nome = sheet.getName();

  if (nome === "Dashboard") {
    _onEditDashboard_(e, sheet);
  } else if (nome === "Porti") {
    _onEditPorti_(e, sheet);
  } else if (nome === "Prenotazioni") {
    _onEditPrenotazioni_(e, sheet);
  } else if (nome === "Fee Riepilogo") {
    _onEditFeeRiepilogo_(e, sheet);
  } else if (nome === "Sub Appaltatori") {
    _onEditSubAppaltatori_(e, sheet);
  }
}

// ── Dashboard: cambio data o modifica porto ──
function _onEditDashboard_(e, sheet) {
  var row = e.range.getRow();
  var col = e.range.getColumn();

  // Cambio data in B2 → aggiorna tutto
  if (row === 2 && col === 2) {
    aggiornaDashboard();
    return;
  }

  // Modifica dropdown porto
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var nBarche = _contaBarche_(ss);
  var portoTitleRow = 5 + nBarche;
  var portoDataStart = portoTitleRow + 1;

  if (row >= portoDataStart && row < portoDataStart + nBarche) {
    var barcaNome = sheet.getRange(row, 1).getValue().toString().trim();
    if (!barcaNome) return;
    var dataFiltro = _leggiDataDashboard_(sheet);

    if (col === 2) {
      var nuovoDefault = sheet.getRange(row, 2).getValue().toString().trim();
      if (nuovoDefault) {
        var nuoviValori = [];
        for (var s = 0; s < SLOTS_GESTIONALE.length; s++) nuoviValori.push(nuovoDefault);
        sheet.getRange(row, 3, 1, SLOTS_GESTIONALE.length).setValues([nuoviValori]);
        var portiRiga = nuoviValori;
        _salvaPortiInFoglio_(ss, dataFiltro, barcaNome, portiRiga);
      }
    } else if (col >= 3 && col <= 2 + SLOTS_GESTIONALE.length) {
      var portiRiga = sheet.getRange(row, 3, 1, SLOTS_GESTIONALE.length).getValues()[0];
      _salvaPortiInFoglio_(ss, dataFiltro, barcaNome, portiRiga);
    }
  }
}

// ── Porti: modifica diretta → aggiorna dashboard ──
function _onEditPorti_(e, sheet) {
  if (e.range.getRow() <= 1) return;
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    _aggiornaPortiDashboard_();
    lock.releaseLock();
  } catch (err) {}
}

// ── Prenotazioni: auto-correzione cellulare, auto-ID, ricalcola posti ──
function _onEditPrenotazioni_(e, sheet) {
  if (e.range.getRow() <= 1) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var editRow = e.range.getRow();

  // Leggi header e mappa colonne
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colMap = {};
  for (var hi = 0; hi < headers.length; hi++) {
    colMap[headers[hi].toString().trim().toLowerCase()] = hi + 1;
  }

  // ── Auto-correzione cellulare ──
  var C_CELL = colMap["cellulare"] || colMap["telefono"] || 0;
  if (C_CELL > 0 && e.range.getColumn() === C_CELL) {
    var valCell = e.range.getValue();
    if (valCell) {
      var corretto = _correggiTelefono_(valCell);
      if (corretto !== null) {
        e.range.setValue(corretto);
      }
    }
  }

  // ── V4.5: Prezzo/Totale/Ora Fine modificati a mano → sfondo rosa (forzati) ──
  var colsMan45 = [colMap["prezzo unitario"] || -1, colMap["totale"] || -1, colMap["ora fine"] || -1];
  if (colsMan45.indexOf(e.range.getColumn()) >= 0) {
    var vMan45 = e.range.getValue();
    if (vMan45 !== "" && vMan45 !== null && vMan45 !== undefined) e.range.setBackground("#FCE4EC");
    else e.range.setBackground(null);
  }

  // ── V4.3: Fee Manuale — modifica manuale → sfondo rosa (forzata) ──
  var C_FEE_MAN_PREN = colMap["fee manuale"] || 0;
  if (C_FEE_MAN_PREN > 0 && e.range.getColumn() === C_FEE_MAN_PREN) {
    var feeVal = e.range.getValue();
    if (feeVal !== "" && feeVal !== null && feeVal !== undefined) {
      e.range.setBackground("#FCE4EC");
    } else {
      e.range.setBackground(null);
    }
  }

  // ── V4.4: Transfer come checkbox booleano ──
  //   FALSE → TRUE         : richiesta nuovo transfer (azione "nuovo")
  //   TRUE  → FALSE        : cancellazione transfer (azione "cancella")
  //   TRUE + cambio Data/Ora Inizio: modifica transfer (azione "modifica")
  var C_TRANSFER = colMap["transfer"] || 0;
  if (C_TRANSFER > 0) {
    var nuovaAzioneTransfer = null;
    var colEdit = e.range.getColumn();

    if (colEdit === C_TRANSFER) {
      // Edit diretto sulla cella Transfer
      var nuovoVal = (e.range.getValue() === true);
      var oldRaw = e.oldValue;
      var vecchioVal = (oldRaw === true || oldRaw === "TRUE" || oldRaw === "true");
      if (nuovoVal && !vecchioVal) nuovaAzioneTransfer = "nuovo";
      else if (!nuovoVal && vecchioVal) nuovaAzioneTransfer = "cancella";
    } else {
      // Edit su Data o Ora Inizio mentre Transfer è TRUE → modifica
      var C_DATA_T = colMap["data"] || 2;
      var C_ORA_INIZIO_T = colMap["ora inizio"] || 3;
      if (colEdit === C_DATA_T || colEdit === C_ORA_INIZIO_T) {
        var transferAttivo = (sheet.getRange(editRow, C_TRANSFER).getValue() === true);
        if (transferAttivo) nuovaAzioneTransfer = "modifica";
      }
    }

    if (nuovaAzioneTransfer) {
      try {
        _inviaTransferWebhook_(ss, sheet, editRow, colMap, nuovaAzioneTransfer);
      } catch(err) {
        Logger.log("Transfer webhook error: " + err.message);
      }
    }
  }

  // ── Auto-generazione ID univoco ──
  var C_ID = colMap["id"] || 0;
  if (C_ID > 0) {
    var idVal = sheet.getRange(editRow, C_ID).getValue();
    var C_DATA_CHECK = colMap["data"] || 2;
    var hasDati = sheet.getRange(editRow, C_DATA_CHECK).getValue();
    if (!idVal && hasDati) {
      sheet.getRange(editRow, C_ID).setValue(_generaIdUnivoco_());
    }
  }

  var colData = colMap["data"] || 2;
  var dataEditata = sheet.getRange(editRow, colData).getValue();
  if (!dataEditata) {
    try { _calcolaPostiDisponibili_(ss, sheet, editRow); } catch(e) {}
    return;
  }

  // Normalizza la data editata
  var dataNorm = null;
  if (dataEditata instanceof Date) {
    dataNorm = new Date(dataEditata.getFullYear(), dataEditata.getMonth(), dataEditata.getDate());
  } else {
    dataNorm = _parseDataFlessibile_(dataEditata.toString());
  }

  // Ricalcola SOLO le righe con la stessa data
  var lastRow = sheet.getLastRow();
  var allData = sheet.getRange(1, colData, lastRow, 1).getValues();
  for (var r = 2; r <= lastRow; r++) {
    try {
      var rowDate = allData[r - 1][0];
      if (!rowDate) continue;
      var rowDateNorm = null;
      if (rowDate instanceof Date) {
        rowDateNorm = new Date(rowDate.getFullYear(), rowDate.getMonth(), rowDate.getDate());
      } else {
        rowDateNorm = _parseDataFlessibile_(rowDate.toString());
      }
      if (rowDateNorm && dataNorm && rowDateNorm.getTime() === dataNorm.getTime()) {
        _calcolaPostiDisponibili_(ss, sheet, r);
      }
    } catch (errRiga) {
      Logger.log("onEdit riga " + r + ": " + errRiga.message);
    }
  }

  // ── V4.5: aggiorna Retribuzioni se toccate colonne staff ──
  try {
    var colsStaff45 = [colMap["skipper"] || -1, colMap["guida"] || -1, colMap["costo skipper"] || -1, colMap["costo guida"] || -1];
    if (colsStaff45.indexOf(e.range.getColumn()) >= 0) aggiornaRetribuzioni();
  } catch(eR) { Logger.log("retribuzioni: " + eR.message); }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    aggiornaDashboard();
    // V4.4: push verso template strutture (no-op se scheda Strutture vuota)
    try { _pushDashboardATemplates_(ss); } catch(eP) { Logger.log("pushTemplates: " + eP.message); }
    lock.releaseLock();
  } catch (err) {}
}

// ══════════════════════════════════════════════════════════════════════════
// _calcolaPostiDisponibili_ — CUORE DELLA LOGICA
//
// V4.4 — Regola "chi arriva prima vince" applicata correttamente:
// solo le righe SOPRA (numero riga minore) bloccano la corrente.
// Le righe SOTTO non hanno priorità e non possono cancellare prenotazioni
// già confermate sopra.
//
// Per ogni riga in Prenotazioni:
// 1. Legge dati riga (data, barca, ora, tipologia, pax)
// 2. Cerca capienza barca e durata tour
// 3. Calcola Ora Fine
// 4. Cerca ALTRE prenotazioni SOPRA sullo stesso slot (barca + data + ora sovrapposta)
// 5. Applica regola "chi arriva prima vince"
// 6. Imposta dropdown Tipologia dinamico
// 7. Auto-corregge se la scelta non è valida
// 8. Calcola posti disponibili (Privato e Gruppo scalano in modo coerente)
// 9. Aggiorna prezzi
// ══════════════════════════════════════════════════════════════════════════
function _calcolaPostiDisponibili_(ss, foglio, riga) {
  return; // DISATTIVATA_V5 - ora gestita da formule nel foglio


  // ── 1. Mappa colonne per nome (dinamica) ──
  var headers = foglio.getRange(1, 1, 1, foglio.getLastColumn()).getValues()[0];
  var col = {};
  for (var i = 0; i < headers.length; i++) {
    col[headers[i].toString().trim().toLowerCase()] = i + 1;
  }
  var C_STATO       = col["stato"] || 1;
  var C_DATA        = col["data"] || 2;
  var C_ORA_INIZIO  = col["ora inizio"] || 3;
  var C_BARCA       = col["barca"] || 4;
  var C_TIPO_TOUR   = col["tipo tour"] || 5;
  var C_ORA_FINE    = col["ora fine"] || 6;
  var C_TIPOLOGIA   = col["tipologia"] || 7;
  var C_PAX         = col["n. pax"] || col["pax"] || 8;
  var C_DISPONIBILI = col["posti disponibili"] || 9;
  var C_PREZZO_U    = col["prezzo unitario"] || 0;
  var C_TOTALE      = col["totale"] || 0;
  var C_MOD_PAG     = col["modalità pagamento"] || col["modalita pagamento"] || 0;
  var C_SUB_A       = col["sub appaltato a"] || 0;
  var C_COSTO_SUB   = col["costo sub appalto"] || 0;
  var C_NETTO       = col["netto"] || 0;
  var C_FEE_MAN     = col["fee manuale"] || 0;
  var C_FORNITORE   = col["fornitore"] || 0;
  var C_DURATA_MAN  = col["durata (min)"] || col["durata min"] || col["durata"] || 0; // V4.5

  // ── 2. Leggi dati riga corrente ──
  var rowData = foglio.getRange(riga, 1, 1, foglio.getLastColumn()).getValues()[0];
  var dataVal    = rowData[C_DATA - 1];
  var oraInizio  = formatOra_(rowData[C_ORA_INIZIO - 1]);
  var barcaNome  = (rowData[C_BARCA - 1] || "").toString().trim();
  var tipoTour   = (rowData[C_TIPO_TOUR - 1] || "").toString().trim();
  var tipologia  = (rowData[C_TIPOLOGIA - 1] || "").toString().trim().toLowerCase();
  var paxCorrente = parseInt(rowData[C_PAX - 1]) || 0;

  if (!dataVal || !barcaNome || !oraInizio) return;

  // Normalizza data
  var dataNorm = null;
  if (dataVal instanceof Date) {
    dataNorm = new Date(dataVal.getFullYear(), dataVal.getMonth(), dataVal.getDate());
  } else {
    dataNorm = _parseDataFlessibile_(dataVal.toString());
  }
  if (!dataNorm) return;

  // ── 3. Capienza barca (da Flotta) ──
  var capacita = 10;
  var foglioFlotta = ss.getSheetByName("Flotta");
  if (foglioFlotta && foglioFlotta.getLastRow() > 1) {
    var fData = foglioFlotta.getDataRange().getValues();
    var fH = fData[0].map(function(h) { return h.toString().trim().toLowerCase(); });
    var fColNome = cercaCol_(fH, ["nome barca","barca","nome","imbarcazione"]);
    var fColCap = cercaCol_(fH, ["capienza max","capienza","capacita","posti","pax"]);
    if (fColNome < 0) fColNome = 0;
    for (var r = 1; r < fData.length; r++) {
      if ((fData[r][fColNome] || "").toString().trim() === barcaNome) {
        capacita = fColCap >= 0 ? (parseInt(fData[r][fColCap]) || 10) : 10;
        break;
      }
    }
  }

  // ── 4. Durata tour e prezzi (da Tipi Tour) ──
  var durata = 90;
  var prezzoGruppo = 0;
  var prezzoPrivato = 0;
  var foglioTour = ss.getSheetByName("Tipi Tour") || ss.getSheetByName("Tour");
  if (foglioTour && tipoTour && foglioTour.getLastRow() > 1) {
    var tData = foglioTour.getDataRange().getValues();
    var tH = tData[0].map(function(h) { return h.toString().trim().toLowerCase(); });
    var tColNome = cercaCol_(tH, ["nome","tipo","tour"]);
    var tColDurata = cercaCol_(tH, ["durata","minuti"]);
    var tColPG = cercaCol_(tH, ["prezzo gruppo","gruppo","prezzo/pax","prezzo pax"]);
    var tColPP = cercaCol_(tH, ["prezzo privato","privato","prezzo esclusivo"]);
    if (tColNome < 0) tColNome = 0;
    for (var rt = 1; rt < tData.length; rt++) {
      if ((tData[rt][tColNome] || "").toString().trim() === tipoTour) {
        durata = tColDurata >= 0 ? (parseInt(tData[rt][tColDurata]) || 90) : 90;
        prezzoGruppo = tColPG >= 0 ? (parseFloat(tData[rt][tColPG]) || 0) : 0;
        prezzoPrivato = tColPP >= 0 ? (parseFloat(tData[rt][tColPP]) || 0) : 0;
        break;
      }
    }
  }

  // ── V4.5: durata personalizzata dalla riga (vince sul listino) ──
  if (C_DURATA_MAN > 0) {
    var durMan = parseInt(rowData[C_DURATA_MAN - 1]);
    if (durMan > 0) durata = durMan;
  }

  // ── 5. Calcola Ora Fine ──
  var startMin = oraToMin_(oraInizio);
  if (startMin >= 0) {
    var oraFine = minToOra_(startMin + durata);
    try {
      var rngOF = foglio.getRange(riga, C_ORA_FINE);
      if ((rngOF.getBackground() || "").toLowerCase() !== "#fce4ec") rngOF.setValue(oraFine); // V4.5 mano vince
    } catch(e) {}
  }

  // ── 6. Cerca ALTRE prenotazioni SOPRA sullo stesso slot ──
  // V4.4 FIX: applichiamo la regola "chi arriva prima vince" in modo coerente.
  // Solo le righe SOPRA (rp+1 < riga) influenzano la corrente.
  // Le righe SOTTO sono "arrivate dopo": non hanno priorità su di me e non
  // possono cancellare la mia prenotazione. Quando le righe sotto si
  // ricalcolano, vedranno me sopra e si bloccheranno se necessario.
  var paxAltriGruppo = 0;      // pax totali delle ALTRE righe Gruppo SOPRA
  var haPrivatoAltro = false;  // un'altra riga SOPRA ha Privato?
  var haGruppoAltro = false;   // un'altra riga SOPRA ha Gruppo?
  var haAltroTour = false;     // un'altra riga SOPRA ha un Tipo Tour DIVERSO?
  var tourAltro = "";
  var curStart = startMin;
  var curEnd = startMin + durata;

  var allData = foglio.getDataRange().getValues();
  for (var rp = 1; rp < allData.length; rp++) {
    if (rp + 1 === riga) continue; // salta riga corrente

    // V4.4: skip righe SOTTO — non possono bloccarmi
    var altraSopra = (rp + 1) < riga;
    if (!altraSopra) continue;

    // Ignora annullate
    var stato = (allData[rp][C_STATO - 1] || "").toString().toLowerCase();
    if (stato.indexOf("annull") >= 0 || stato.indexOf("cancel") >= 0) continue;

    // Stessa barca?
    var rpBarca = (allData[rp][C_BARCA - 1] || "").toString().trim();
    if (rpBarca !== barcaNome) continue;

    // Stessa data?
    var rpData = allData[rp][C_DATA - 1];
    var rpDataNorm = null;
    if (rpData instanceof Date) {
      rpDataNorm = new Date(rpData.getFullYear(), rpData.getMonth(), rpData.getDate());
    } else if (rpData) {
      rpDataNorm = _parseDataFlessibile_(rpData.toString());
    }
    if (!rpDataNorm || rpDataNorm.getTime() !== dataNorm.getTime()) continue;

    // Orari sovrapposti?
    var rpOraI = formatOra_(allData[rp][C_ORA_INIZIO - 1]);
    var rpOraF = formatOra_(allData[rp][C_ORA_FINE - 1]);
    if (!rpOraI) continue;
    if (!rpOraF) { var m = oraToMin_(rpOraI); rpOraF = minToOra_(m + 120); }
    var iMin = oraToMin_(rpOraI);
    var fMin = oraToMin_(rpOraF);
    if (!(iMin < curEnd && fMin > curStart)) continue;

    // Slot sovrapposto e altra riga SOPRA — classifica
    var rpTipo = (allData[rp][C_TIPOLOGIA - 1] || "").toString().toLowerCase();
    var rpPax = parseInt(allData[rp][C_PAX - 1]) || 0;
    var rpTourNome = (allData[rp][C_TIPO_TOUR - 1] || "").toString().trim();

    if (tipoTour && rpTourNome && rpTourNome !== tipoTour) {
      haAltroTour = true;
      tourAltro = rpTourNome;
    }

    if (rpTipo.indexOf("privat") >= 0) {
      haPrivatoAltro = true;
    } else if (rpTipo.indexOf("grupp") >= 0) {
      haGruppoAltro = true;
      paxAltriGruppo += rpPax;
    }
  }

  // ── 7. REGOLA "CHI ARRIVA PRIMA VINCE" ──
  var isGruppo  = (tipologia.indexOf("grupp") >= 0);
  var isPrivato = (tipologia.indexOf("privat") >= 0);

  if (haPrivatoAltro) {
    // ── CASO A: Slot bloccato da Privato sopra ──
    if (tipologia) {
      try {
        foglio.getRange(riga, C_TIPOLOGIA).setValue("");
        SpreadsheetApp.flush();
      } catch(e) {}
      tipologia = "";
      isGruppo = false;
      isPrivato = false;
    }
    try { foglio.getRange(riga, C_TIPOLOGIA).clearDataValidation(); } catch(e) {}
    _scrivi_(foglio, riga, C_DISPONIBILI, "SOLD OUT");
    _coloraDisponibili_(foglio, riga, C_DISPONIBILI, 0, true);
    _coloraTipologia_(foglio, riga, C_TIPOLOGIA, "");
    try { SpreadsheetApp.flush(); } catch(e) {}
    return;

  } else if (haAltroTour) {
    // ── CASO A2: Slot bloccato da tour diverso sopra ──
    if (tipologia) {
      try {
        foglio.getRange(riga, C_TIPOLOGIA).setValue("");
        SpreadsheetApp.flush();
      } catch(e) {}
      tipologia = "";
      isGruppo = false;
      isPrivato = false;
    }
    try { foglio.getRange(riga, C_TIPOLOGIA).clearDataValidation(); } catch(e) {}
    _scrivi_(foglio, riga, C_DISPONIBILI, "SOLD OUT");
    _coloraDisponibili_(foglio, riga, C_DISPONIBILI, 0, true);
    _coloraTipologia_(foglio, riga, C_TIPOLOGIA, "");
    SpreadsheetApp.getActiveSpreadsheet().toast(
      "La barca " + barcaNome + " ha già un \"" + tourAltro + "\" in questo orario. Non può fare due tour diversi contemporaneamente.",
      "⚓ Tour non disponibile", 6
    );
    try { SpreadsheetApp.flush(); } catch(e) {}
    return;

  } else if (haGruppoAltro) {
    // ── CASO B: Slot condiviso (stesso tour, Gruppo sopra) — solo Gruppo ──
    _impostaDropdown_(foglio, riga, C_TIPOLOGIA, ["Gruppo"]);

    if (isPrivato) {
      try {
        foglio.getRange(riga, C_TIPOLOGIA).setValue("Gruppo");
        SpreadsheetApp.flush();
      } catch(e) {}
      tipologia = "gruppo";
      isPrivato = false;
      isGruppo = true;
      SpreadsheetApp.getActiveSpreadsheet().toast(
        "Lo slot ha già una prenotazione Gruppo — impostato automaticamente come Gruppo.",
        "⚓ Tipologia corretta", 5
      );
    }

  } else {
    // ── CASO C: Slot libero — libera scelta ──
    _impostaDropdown_(foglio, riga, C_TIPOLOGIA, ["Gruppo", "Privato"]);
  }

  // ── 8. Calcolo posti disponibili — V4.4: Privato e Gruppo scalano coerentemente ──
  // Esempio capienza 8: Privato 3 → mostra 5; Privato 8 → mostra 0 (SOLD OUT).
  // Stessa logica del Gruppo, salvo che Privato non condivide con altri gruppi.
  var disponibili;
  var soldOut = false;

  if (isPrivato) {
    disponibili = Math.max(0, capacita - paxCorrente);
  } else if (isGruppo) {
    disponibili = Math.max(0, capacita - paxCorrente - paxAltriGruppo);
  } else {
    disponibili = Math.max(0, capacita - paxAltriGruppo);
  }

  if (disponibili === 0) soldOut = true;

  // ── 9. Scrivi posti disponibili + formattazione ──
  if (soldOut) {
    _scrivi_(foglio, riga, C_DISPONIBILI, "SOLD OUT");
  } else {
    _scrivi_(foglio, riga, C_DISPONIBILI, disponibili);
  }
  _coloraDisponibili_(foglio, riga, C_DISPONIBILI, disponibili, soldOut);
  _coloraTipologia_(foglio, riga, C_TIPOLOGIA, tipologia);

  // ── 10. Dropdown N. Pax ──
  if (disponibili >= 0 && !soldOut) {
    var maxPax = isPrivato ? capacita : (capacita - paxAltriGruppo);
    if (maxPax < 1) maxPax = 1;
    var paxOptions = [];
    for (var px = 1; px <= maxPax; px++) paxOptions.push(px.toString());
    _impostaDropdown_(foglio, riga, C_PAX, paxOptions);
  }

  // ── 11. Prezzi ──
  if (C_PREZZO_U > 0 && (prezzoGruppo > 0 || prezzoPrivato > 0)) {
    // V4.5 mano vince sempre: sfondo rosa = valore forzato, lo script non lo tocca
    var rngPU = foglio.getRange(riga, C_PREZZO_U);
    var puMan = (rngPU.getBackground() || "").toLowerCase() === "#fce4ec";
    var prezzo = puMan ? (parseFloat(rngPU.getValue()) || 0) : (isPrivato ? prezzoPrivato : prezzoGruppo);
    if (!puMan) _scrivi_(foglio, riga, C_PREZZO_U, prezzo);
    if (C_TOTALE > 0) {
      var rngTot = foglio.getRange(riga, C_TOTALE);
      if ((rngTot.getBackground() || "").toLowerCase() !== "#fce4ec") {
        var totale = isPrivato ? prezzo : (prezzo * paxCorrente);
        _scrivi_(foglio, riga, C_TOTALE, totale);
      }
    }
  }

  // ── 12. Sub Appalto + Netto ──
  if (C_SUB_A > 0) {
    _aggiornaDropdownSubAppaltatori_(ss, foglio, riga, C_SUB_A);
  }
  if (C_NETTO > 0 && C_TOTALE > 0) {
    var totaleVal = foglio.getRange(riga, C_TOTALE).getValue();
    var costoSubVal = C_COSTO_SUB > 0 ? (parseFloat(foglio.getRange(riga, C_COSTO_SUB).getValue()) || 0) : 0;
    var netto = (parseFloat(totaleVal) || 0) - costoSubVal;
    _scrivi_(foglio, riga, C_NETTO, totaleVal ? netto : "");
  }

  // ── 13. Fee auto-calcolata ──
  if (C_FEE_MAN > 0 && C_FORNITORE > 0) {
    var cellaFee = foglio.getRange(riga, C_FEE_MAN);
    var bgFee = cellaFee.getBackground();
    var valFee = cellaFee.getValue();
    var isForzata = (bgFee === "#fce4ec");

    if (!isForzata) {
      var fornitoreName = (rowData[C_FORNITORE - 1] || "").toString().trim();
      var feeCalcolata = 0;

      if (fornitoreName) {
        var foglioForn = ss.getSheetByName("Fornitori");
        if (foglioForn && foglioForn.getLastRow() > 1) {
          var fornData = foglioForn.getDataRange().getValues();
          var fornH = fornData[0].map(function(h) { return h.toString().trim().toLowerCase(); });
          var fColNome = cercaCol_(fornH, ["nome fornitore", "nome", "fornitore"]);
          var fColTipo = cercaCol_(fornH, ["tipo fee", "tipo"]);
          var fColPers = cercaCol_(fornH, ["fee/persona", "fee persona", "per persona"]);
          var fColEscl = cercaCol_(fornH, ["fee/esclusiva", "fee esclusiva", "esclusiva"]);
          var fColPerc = cercaCol_(fornH, ["%", "percentuale", "perc"]);
          if (fColNome < 0) fColNome = 0;

          for (var rf = 1; rf < fornData.length; rf++) {
            if ((fornData[rf][fColNome] || "").toString().trim() === fornitoreName) {
              var tipoFee = fColTipo >= 0 ? (fornData[rf][fColTipo] || "").toString().trim().toLowerCase() : "";
              var feePersona = fColPers >= 0 ? (parseFloat(fornData[rf][fColPers]) || 0) : 0;
              var feeEsclusiva = fColEscl >= 0 ? (parseFloat(fornData[rf][fColEscl]) || 0) : 0;
              var perc = fColPerc >= 0 ? (parseFloat(fornData[rf][fColPerc]) || 0) : 0;
              if (perc > 0 && perc <= 1) perc = perc * 100;

              var totaleRiga = C_TOTALE > 0 ? (parseFloat(rowData[C_TOTALE - 1]) || 0) : 0;

              if (tipoFee === "fissa") {
                feeCalcolata = isPrivato ? feeEsclusiva : (feePersona * paxCorrente);
              } else if (tipoFee === "percentuale") {
                feeCalcolata = totaleRiga * (perc / 100);
              } else if (tipoFee === "mista") {
                var feeBase = isPrivato ? feeEsclusiva : (feePersona * paxCorrente);
                feeCalcolata = feeBase + (totaleRiga * (perc / 100));
              }
              break;
            }
          }
        }
      }

      feeCalcolata = Math.round(feeCalcolata * 100) / 100;
      cellaFee.setValue(feeCalcolata).setNumberFormat("€#,##0.00").setBackground(null);
    }
  }

  try { SpreadsheetApp.flush(); } catch(e) {}
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS — Scrittura e formattazione celle
// ══════════════════════════════════════════════════════════════════════════
function _scrivi_(foglio, riga, colonna, valore) {
  try { foglio.getRange(riga, colonna).setValue(valore); } catch(e) {}
}

function _correggiTelefono_(v) {
  var pulito = v.toString().replace(/[^\d]/g, "");
  return (pulito !== v.toString()) ? pulito : null;
}

function _generaIdUnivoco_() {
  var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var id = "";
  for (var i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

function _impostaDropdown_(foglio, riga, colonna, opzioni) {
  try {
    var cella = foglio.getRange(riga, colonna);
    cella.setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(opzioni, true)
        .setAllowInvalid(false)
        .build()
    );
  } catch(e) {
    Logger.log("_impostaDropdown_ R" + riga + "C" + colonna + ": " + e.message);
  }
}

function _coloraDisponibili_(foglio, riga, colonna, disponibili, soldOut) {
  try {
    var cella = foglio.getRange(riga, colonna);
    cella.setHorizontalAlignment("center");
    if (soldOut || disponibili === 0) {
      cella.setBackground("#EF9A9A").setFontColor("#B71C1C").setFontWeight("bold").setFontSize(8);
    } else if (disponibili <= 3) {
      cella.setBackground("#FFF9C4").setFontColor("#F57F17").setFontWeight("bold").setFontSize(10);
    } else {
      cella.setBackground("#C8E6C9").setFontColor("#2E7D32").setFontWeight("normal").setFontSize(10);
    }
  } catch(e) {}
}

function _coloraTipologia_(foglio, riga, colonna, tipologia) {
  try {
    var cella = foglio.getRange(riga, colonna);
    if (tipologia.indexOf("privat") >= 0) {
      cella.setBackground("#E1BEE7").setFontColor("#6A1B9A").setFontWeight("bold");
    } else if (tipologia.indexOf("grupp") >= 0) {
      cella.setBackground("#BBDEFB").setFontColor("#1565C0").setFontWeight("bold");
    } else {
      cella.setBackground(null).setFontColor(null).setFontWeight("normal");
    }
  } catch(e) {}
}

function cercaCol_(headers, ricerche) {
  for (var c = 0; c < headers.length; c++) {
    for (var r = 0; r < ricerche.length; r++) {
      if (headers[c].indexOf(ricerche[r]) >= 0) return c;
    }
  }
  return -1;
}

function oraToMin_(s) {
  if (!s) return -1;
  var str = s.toString().trim().split(":");
  if (str.length < 2) return -1;
  return (parseInt(str[0]) || 0) * 60 + (parseInt(str[1]) || 0);
}

function minToOra_(m) {
  var h = Math.floor(m / 60);
  var min = m % 60;
  return h.toString().padStart(2,"0") + ":" + min.toString().padStart(2,"0");
}

function formatOra_(val) {
  if (!val) return "";
  if (val instanceof Date) return Utilities.formatDate(val, Session.getScriptTimeZone(), "HH:mm");
  var s = val.toString().trim();
  if (/^\d{1,2}:\d{2}/.test(s)) return s.substring(0,5);
  return s;
}

function _parseDataFlessibile_(str) {
  if (!str) return null;
  str = str.toString().trim();
  var match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (match) {
    var d = new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
    d.setHours(0,0,0,0);
    return d;
  }
  match = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (match) {
    var d2 = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
    d2.setHours(0,0,0,0);
    return d2;
  }
  var parsed = new Date(str);
  if (!isNaN(parsed.getTime())) { parsed.setHours(0,0,0,0); return parsed; }
  return null;
}

function _contaBarche_(ss) {
  var f = ss.getSheetByName("Flotta");
  if (f && f.getLastRow() > 1) return f.getLastRow() - 1;
  return 2;
}

function _leggiDataDashboard_(sheet) {
  var raw = sheet.getRange("B2").getValue();
  if (raw instanceof Date) return new Date(raw.getFullYear(), raw.getMonth(), raw.getDate());
  var d = new Date(); d.setHours(0,0,0,0); return d;
}

// ══════════════════════════════════════════════════════════════════════════
// SETUP DASHBOARD
// ══════════════════════════════════════════════════════════════════════════
function setupDashboardGestionale() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existing = ss.getSheetByName("Dashboard");
  if (existing) {
    var temp = ss.insertSheet("_temp_dash");
    ss.deleteSheet(existing);
    var dash = ss.insertSheet("Dashboard");
    ss.deleteSheet(temp);
  } else {
    var dash = ss.insertSheet("Dashboard");
  }
  ss.setActiveSheet(dash);
  ss.moveActiveSheet(1);

  dash.getRange(1, 1, 1, N_COLS_DASH).merge()
    .setValue("DASHBOARD — Disponibilità Giornaliera")
    .setFontSize(14).setFontWeight("bold")
    .setFontColor("white").setBackground("#1565C0")
    .setHorizontalAlignment("left").setVerticalAlignment("middle");
  dash.setRowHeight(1, 36);

  dash.getRange("A2").setValue("Seleziona Data:").setFontWeight("bold").setFontColor("#333333");
  dash.getRange("B2").setValue(new Date()).setNumberFormat("dd/MM/yyyy")
    .setBackground("#FFFDE7").setHorizontalAlignment("center");
  dash.getRange(2, 3, 1, N_COLS_DASH - 2).merge().setValue("");

  dash.getRange(3, 1, 1, N_COLS_DASH).merge()
    .setValue("Usa menu Gestionale > Aggiorna Dashboard per aggiornare.")
    .setFontColor("#777777").setFontSize(10).setFontStyle("italic");

  var headers = ["Barca", "Cap."].concat(SLOTS_GESTIONALE);
  dash.getRange(4, 1, 1, N_COLS_DASH).setValues([headers])
    .setFontWeight("bold").setBackground("#3949AB")
    .setFontColor("white").setHorizontalAlignment("center");
  dash.setFrozenRows(4);

  dash.setColumnWidth(1, 100);
  dash.setColumnWidth(2, 50);
  for (var c = 3; c <= N_COLS_DASH; c++) dash.setColumnWidth(c, 52);

  aggiornaDashboard();

  SpreadsheetApp.getActiveSpreadsheet().toast(
    "Dashboard configurata!", "✅ Dashboard pronta", 6
  );
}

// ══════════════════════════════════════════════════════════════════════════
// AGGIORNA DASHBOARD — Disponibilità + Porti
// ══════════════════════════════════════════════════════════════════════════
function aggiornaDashboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dash = ss.getSheetByName("Dashboard");
  if (!dash) { ss.toast("Dashboard non trovata.", "⚠️", 4); return; }

  var dataFiltroNorm = _leggiDataDashboard_(dash);
  var dd = dataFiltroNorm.getDate().toString().padStart(2,"0");
  var mm = (dataFiltroNorm.getMonth()+1).toString().padStart(2,"0");
  var dataStr = dd + "/" + mm + "/" + dataFiltroNorm.getFullYear();

  var barche = _leggiBarche_(ss);
  var prenotazioni = _leggiPrenotazioniGiorno_(ss, dataFiltroNorm);

  dash.getRange(3, 1, 1, N_COLS_DASH).merge()
    .setValue("Aggiornato: " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss"))
    .setFontColor("#555555").setFontSize(10).setFontStyle("italic");

  var nBarcheDisp = Math.min(barche.length, MAX_BARCHE);
  var righeDisp = Math.max(nBarcheDisp, 1);
  dash.getRange(5, 1, righeDisp, N_COLS_DASH).clearContent().clearFormat();

  if (barche.length === 0) {
    dash.getRange(5, 1, 1, N_COLS_DASH).merge()
      .setValue("Nessuna barca nel foglio Flotta.")
      .setFontColor("#888").setFontStyle("italic").setHorizontalAlignment("center");
    return;
  }

  for (var i = 0; i < Math.min(barche.length, MAX_BARCHE); i++) {
    var barca = barche[i];
    var row = 5 + i;
    dash.getRange(row, 1).setValue(barca.nome)
      .setFontWeight("bold").setBackground("#FFFFFF").setHorizontalAlignment("left");
    dash.getRange(row, 2).setValue(barca.capacita)
      .setHorizontalAlignment("center").setBackground("#F5F5F5").setFontColor("#555555");

    for (var s = 0; s < SLOTS_GESTIONALE.length; s++) {
      var slotMin = oraToMin_(SLOTS_GESTIONALE[s]);
      var paxOccupati = 0;
      var slotPrivato = false;
      var slotGruppo = false;
      for (var p = 0; p < prenotazioni.length; p++) {
        var pr = prenotazioni[p];
        if (pr.barca !== barca.nome) continue;
        var iMin = oraToMin_(pr.oraInizio);
        var fMin = oraToMin_(pr.oraFine);
        if (iMin >= 0 && fMin > iMin && iMin <= slotMin && slotMin < fMin) {
          paxOccupati += pr.pax;
          if (pr.privato) slotPrivato = true;
          if (pr.gruppo) slotGruppo = true;
        }
      }
      // V4.4: dashboard scala anche con Privato (capienza - pax effettivi).
      // Privato 9 su Ayros 10 → mostra 1, non più 10.
      var disp = Math.max(0, barca.capacita - paxOccupati);
      var cell = dash.getRange(row, 3 + s);
      cell.setHorizontalAlignment("center").setFontWeight("normal").setFontSize(10);
      if (disp === 0) {
        cell.setValue("SOLD OUT").setBackground("#EF9A9A").setFontColor("#B71C1C").setFontWeight("bold").setFontSize(7);
      } else if (paxOccupati > 0 && slotPrivato) {
        cell.setValue(disp).setBackground("#E1BEE7").setFontColor("#6A1B9A").setFontWeight("bold");
      } else if (paxOccupati > 0 && slotGruppo) {
        cell.setValue(disp).setBackground("#BBDEFB").setFontColor("#1565C0").setFontWeight("bold");
      } else {
        cell.setValue(disp).setBackground("#C8E6C9").setFontColor("#2E7D32");
      }
    }
  }

  var portoTitleRow = 5 + barche.length;
  _aggiornaPortiDashboard_(dataFiltroNorm, dataStr, portoTitleRow);

  // V4.4: push verso template strutture (no-op se scheda Strutture vuota)
  try { _pushDashboardATemplates_(ss); } catch(e) { Logger.log("pushTemplates: " + e.message); }
}

function _leggiBarche_(ss) {
  var barche = [];
  var f = ss.getSheetByName("Flotta");
  if (f && f.getLastRow() > 1) {
    var data = f.getDataRange().getValues();
    var h = data[0].map(function(x) { return x.toString().trim().toLowerCase(); });
    var cN = cercaCol_(h, ["nome barca","barca","nome","imbarcazione"]);
    var cC = cercaCol_(h, ["capienza max","capienza","capacita","posti","pax"]);
    if (cN < 0) cN = 0;
    for (var r = 1; r < data.length; r++) {
      var nome = (data[r][cN] || "").toString().trim();
      if (nome) barche.push({ nome: nome, capacita: cC >= 0 ? (parseInt(data[r][cC]) || 10) : 10 });
    }
  }
  if (barche.length === 0) barche = [{ nome: "Gozzo", capacita: 8 }, { nome: "Ayros", capacita: 10 }];
  return barche;
}

function _leggiPrenotazioniGiorno_(ss, dataFiltroNorm) {
  var lista = [];
  var f = ss.getSheetByName("Prenotazioni");
  if (!f || f.getLastRow() <= 1) return lista;

  var data = f.getDataRange().getValues();
  var h = data[0].map(function(x) { return x.toString().trim().toLowerCase(); });
  var cData   = cercaCol_(h, ["data"]);
  var cBarca  = cercaCol_(h, ["barca","imbarcazione"]);
  var cInizio = cercaCol_(h, ["ora inizio","inizio"]);
  var cFine   = cercaCol_(h, ["ora fine","fine"]);
  var cPax    = cercaCol_(h, ["n. pax","pax","npax","passeggeri"]);
  var cStato  = cercaCol_(h, ["stato"]);
  var cTipo   = cercaCol_(h, ["tipologia"]);
  if (cTipo < 0) cTipo = cercaCol_(h, ["tipo"]);
  if (cData < 0) cData = 1;
  if (cBarca < 0) cBarca = 3;
  if (cInizio < 0) cInizio = 2;
  if (cFine < 0) cFine = 6;
  if (cPax < 0) cPax = 8;
  if (cStato < 0) cStato = 0;
  if (cTipo < 0) cTipo = 6;

  for (var r = 1; r < data.length; r++) {
    var stato = (data[r][cStato] || "").toString().toLowerCase();
    if (stato.indexOf("annull") >= 0 || stato.indexOf("cancel") >= 0) continue;
    var dataRiga = data[r][cData];
    if (!dataRiga) continue;
    var dataNorm = null;
    if (dataRiga instanceof Date) {
      dataNorm = new Date(dataRiga.getFullYear(), dataRiga.getMonth(), dataRiga.getDate());
    } else {
      dataNorm = _parseDataFlessibile_(dataRiga.toString());
    }
    if (!dataNorm || dataNorm.getTime() !== dataFiltroNorm.getTime()) continue;
    var barca = (data[r][cBarca] || "").toString().trim();
    if (!barca) continue;
    var oraI = formatOra_(data[r][cInizio]);
    var oraF = formatOra_(data[r][cFine]);
    if (!oraI) continue;
    if (!oraF) { var m = oraToMin_(oraI); oraF = minToOra_(m + 120); }
    var pax = parseInt(data[r][cPax]) || 0;
    var tipo = (data[r][cTipo] || "").toString().trim().toLowerCase();
    if (!tipo) continue;
    lista.push({
      barca: barca, oraInizio: oraI, oraFine: oraF, pax: pax,
      privato: (tipo.indexOf("privat") >= 0),
      gruppo: (tipo.indexOf("grupp") >= 0),
      tipologia: tipo
    });
  }
  return lista;
}

// ══════════════════════════════════════════════════════════════════════════
// PORTI — Gestione sezione porto nella Dashboard
// ══════════════════════════════════════════════════════════════════════════
function _salvaPortiInFoglio_(ss, dataFiltro, barcaNome, portiArray) {
  var foglio = ss.getSheetByName("Porti");
  if (!foglio) return;
  var nuovaRiga = [dataFiltro, barcaNome];
  for (var i = 0; i < portiArray.length; i++) nuovaRiga.push(portiArray[i] || "");
  var targetRow = foglio.getLastRow() + 1;
  foglio.getRange(targetRow, 1, 1, nuovaRiga.length).setValues([nuovaRiga]);
}

function setupPortoSection() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dash = ss.getSheetByName("Dashboard");
  if (!dash) { SpreadsheetApp.getUi().alert("Dashboard non trovata."); return; }
  _aggiornaPortiDashboard_();
  ss.toast("Sezione porto aggiornata!", "⚓ Porto ✅", 6);
}

function _aggiornaPortiDashboard_(dataFiltroNorm, dataStr, portoTitleRow) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dash = ss.getSheetByName("Dashboard");
  if (!dash) return;

  if (!portoTitleRow) {
    portoTitleRow = 5 + Math.max(_contaBarche_(ss), 1);
  }
  if (!dataFiltroNorm) {
    dataFiltroNorm = _leggiDataDashboard_(dash);
  }

  var barche = [];
  var foglioFlotta = ss.getSheetByName("Flotta");
  if (foglioFlotta && foglioFlotta.getLastRow() > 1) {
    var fData = foglioFlotta.getDataRange().getValues();
    var fH = fData[0].map(function(h) { return h.toString().trim().toLowerCase(); });
    var colNome = cercaCol_(fH, ["nome barca","barca","nome","imbarcazione"]);
    if (colNome < 0) colNome = 0;
    for (var r = 1; r < fData.length; r++) {
      var n = (fData[r][colNome] || "").toString().trim();
      if (n) barche.push(n);
    }
  }
  if (barche.length === 0) barche = ["Gozzo", "Ayros"];

  var portiMap = {};
  for (var b = 0; b < barche.length; b++) portiMap[barche[b]] = { "default": null };

  var foglioPorti = ss.getSheetByName("Porti");
  if (foglioPorti && foglioPorti.getLastRow() > 1) {
    var portiData = foglioPorti.getDataRange().getValues();
    var headerRowIdx = 0;
    for (var h = 0; h < Math.min(portiData.length, 5); h++) {
      if ((portiData[h][0] || "").toString().trim().toLowerCase() === "data") { headerRowIdx = h; break; }
    }
    var slotColMap = {};
    for (var col = 2; col < portiData[headerRowIdx].length; col++) {
      var hVal = (portiData[headerRowIdx][col] || "").toString().trim();
      if (/^\d{1,2}:\d{2}$/.test(hVal)) slotColMap[col] = hVal;
    }
    for (var rr = headerRowIdx + 1; rr < portiData.length; rr++) {
      var rowData = portiData[rr];
      var barcaNome = (rowData[1] || "").toString().trim();
      if (!barcaNome) continue;
      if (!portiMap[barcaNome]) portiMap[barcaNome] = { "default": null };
      var dataCell = rowData[0];
      var isDefault = (!dataCell || dataCell === "" || dataCell === "Default");
      var isMatch = false;
      if (!isDefault) {
        var dn = (dataCell instanceof Date) ? new Date(dataCell.getFullYear(), dataCell.getMonth(), dataCell.getDate()) : _parseDataFlessibile_(dataCell.toString());
        if (dn && dataFiltroNorm && dn.getTime() === dataFiltroNorm.getTime()) isMatch = true;
      }
      if (!isDefault && !isMatch) continue;
      var portiSlots = [];
      for (var s = 0; s < SLOTS_GESTIONALE.length; s++) {
        var porto = PORTO_DEFAULT;
        for (var colIdx in slotColMap) {
          if (slotColMap[colIdx] === SLOTS_GESTIONALE[s]) {
            var val = (rowData[parseInt(colIdx)] || "").toString().trim();
            if (val) porto = val;
            break;
          }
        }
        portiSlots.push(porto);
      }
      if (isDefault) portiMap[barcaNome]["default"] = portiSlots;
      if (isMatch) portiMap[barcaNome]["override"] = portiSlots;
    }
  }

  var listaPorti = _raccogliListaPorti_(ss);

  dash.getRange(portoTitleRow, 1, 1, N_COLS_DASH).merge()
    .setValue("⚓ PORTO DI PARTENZA")
    .setFontSize(10).setFontWeight("bold").setFontColor("white")
    .setBackground("#0277BD").setHorizontalAlignment("left");
  dash.setRowHeight(portoTitleRow, 24);

  var portoDataStart = portoTitleRow + 1;
  var dropdownRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(listaPorti, true).setAllowInvalid(true).build();

  var portoValues = [];
  var portoBgs = [];
  var portoColors = [];
  var portoWeights = [];
  var portoAligns = [];

  for (var i = 0; i < barche.length; i++) {
    var nomeBarca = barche[i];
    var bp = portiMap[nomeBarca] || {};
    var portiEffettivi = bp["override"] || bp["default"] || null;
    var predefinito = PORTO_DEFAULT;
    if (bp["default"] && bp["default"].length > 0) predefinito = bp["default"][0] || PORTO_DEFAULT;

    var rowVals = [nomeBarca, predefinito];
    var rowBgs = ["#E1F5FE", "#81D4FA"];
    var rowColors = ["#01579B", "#01579B"];
    var rowWeights = ["bold", "bold"];
    var rowAligns = ["left", "center"];

    for (var s = 0; s < SLOTS_GESTIONALE.length; s++) {
      var portoVal = (portiEffettivi && portiEffettivi[s]) ? portiEffettivi[s] : predefinito;
      rowVals.push(portoVal);
      if (portoVal !== predefinito) {
        rowBgs.push("#A5D6A7"); rowColors.push("#1B5E20"); rowWeights.push("bold");
      } else {
        rowBgs.push("#E1F5FE"); rowColors.push("#01579B"); rowWeights.push("normal");
      }
      rowAligns.push("center");
    }
    portoValues.push(rowVals);
    portoBgs.push(rowBgs);
    portoColors.push(rowColors);
    portoWeights.push(rowWeights);
    portoAligns.push(rowAligns);
  }

  if (barche.length > 0) {
    var portoRange = dash.getRange(portoDataStart, 1, barche.length, N_COLS_DASH);
    portoRange.setValues(portoValues);
    portoRange.setBackgrounds(portoBgs);
    portoRange.setFontColors(portoColors);
    portoRange.setFontWeights(portoWeights);
    portoRange.setHorizontalAlignments(portoAligns);
    portoRange.setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    dash.getRange(portoDataStart, 2, barche.length, 1).setDataValidation(dropdownRule);
    dash.getRange(portoDataStart, 3, barche.length, SLOTS_GESTIONALE.length).setDataValidation(dropdownRule);
  }
}

function _raccogliListaPorti_(ss) {
  var porti = {};
  porti[PORTO_DEFAULT] = true;
  var foglio = ss.getSheetByName("Porti");
  if (foglio && foglio.getLastRow() > 1) {
    var data = foglio.getDataRange().getValues();
    var headerRow = 0;
    for (var h = 0; h < Math.min(data.length, 5); h++) {
      if ((data[h][0] || "").toString().trim().toLowerCase() === "data") { headerRow = h; break; }
    }
    for (var r = headerRow + 1; r < data.length; r++) {
      for (var c = 2; c < data[r].length; c++) {
        var val = (data[r][c] || "").toString().trim();
        if (val && val.length > 1) porti[val] = true;
      }
    }
  }
  return Object.keys(porti).sort();
}

// ══════════════════════════════════════════════════════════════════════════
// SUB APPALTATORI — invariato rispetto a V4.3
// ══════════════════════════════════════════════════════════════════════════
function setupSubAppaltatori() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existing = ss.getSheetByName("Sub Appaltatori");
  if (existing) {
    ss.toast("Il foglio Sub Appaltatori esiste già.", "⚠️ Info", 4);
    ss.setActiveSheet(existing);
    return;
  }
  var foglio = ss.insertSheet("Sub Appaltatori");

  var headers = ["Sub Appaltatore", "Mese", "Data", "Barca", "Tipo Tour", "Totale", "Costo Sub", "Modalità Pagamento", "Dovuto", "Saldo", "Rif. Prenotazione"];
  foglio.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight("bold").setBackground("#FF8F00").setFontColor("white")
    .setHorizontalAlignment("center");
  foglio.setFrozenRows(1);

  foglio.setColumnWidth(1, 180);
  foglio.setColumnWidth(2, 140);
  foglio.setColumnWidth(3, 110);
  foglio.setColumnWidth(4, 120);
  foglio.setColumnWidth(5, 140);
  foglio.setColumnWidth(6, 110);
  foglio.setColumnWidth(7, 110);
  foglio.setColumnWidth(8, 160);
  foglio.setColumnWidth(9, 110);
  foglio.setColumnWidth(10, 110);
  foglio.setColumnWidth(11, 130);

  foglio.getRange("C2:C500").setNumberFormat("dd/MM/yyyy");
  foglio.getRange("F2:F500").setNumberFormat("€#,##0.00");
  foglio.getRange("G2:G500").setNumberFormat("€#,##0.00");
  foglio.getRange("I2:I500").setNumberFormat("€#,##0.00");
  foglio.getRange("J2:J500").setNumberFormat("€#,##0.00");

  var rangeSaldo = foglio.getRange("J2:J500");
  var rules = foglio.getConditionalFormatRules();
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenNumberEqualTo(0)
    .setBackground("#E8F5E9").setFontColor("#2E7D32")
    .setRanges([rangeSaldo]).build());
  foglio.setConditionalFormatRules(rules);

  var modOptions = ["Fattura", "Sconto in fattura", "Link", "Carta", "Contanti", "Bonifico"];
  var modRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(modOptions, true).setAllowInvalid(true).build();
  foglio.getRange(2, 8, 498, 1).setDataValidation(modRule);

  _aggiungiColonneSubPrenotazioni_(ss);

  ss.toast("Foglio Sub Appaltatori creato!", "✅ Setup completo", 6);
}

function _aggiungiColonneSubPrenotazioni_(ss) {
  var prenot = ss.getSheetByName("Prenotazioni");
  if (!prenot) return;

  var hPrenot = prenot.getRange(1, 1, 1, prenot.getLastColumn()).getValues()[0];
  var hasId = false, hasModPag = false, hasSubA = false, hasFeeManuale = false;
  for (var i = 0; i < hPrenot.length; i++) {
    var h = hPrenot[i].toString().trim().toLowerCase();
    if (h === "id") hasId = true;
    if (h === "modalità pagamento" || h === "modalita pagamento") hasModPag = true;
    if (h === "sub appaltato a") hasSubA = true;
    if (h === "fee manuale") hasFeeManuale = true;
  }

  var nextCol = prenot.getLastColumn() + 1;

  if (!hasId) {
    prenot.getRange(1, nextCol).setValue("ID").setFontWeight("bold").setBackground("#37474F").setFontColor("white");
    prenot.setColumnWidth(nextCol, 90);
    nextCol++;
  }
  if (!hasModPag) {
    prenot.getRange(1, nextCol).setValue("Modalità Pagamento").setFontWeight("bold").setBackground("#5C6BC0").setFontColor("white");
    prenot.setColumnWidth(nextCol, 150);
    var modPagOptions = ["Fattura", "Sconto in fattura", "Incassare", "Link", "Carta", "Contanti"];
    prenot.getRange(2, nextCol, prenot.getMaxRows() - 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(modPagOptions, true).setAllowInvalid(false).build()
    );
    nextCol++;
  }
  if (!hasSubA) {
    prenot.getRange(1, nextCol).setValue("Sub Appaltato a").setFontWeight("bold").setBackground("#FF8F00").setFontColor("white");
    prenot.setColumnWidth(nextCol, 150);
    nextCol++;
    prenot.getRange(1, nextCol).setValue("Costo Sub Appalto").setFontWeight("bold").setBackground("#FF8F00").setFontColor("white");
    prenot.setColumnWidth(nextCol, 130);
    prenot.getRange(2, nextCol, prenot.getMaxRows() - 1, 1).setNumberFormat("€#,##0.00");
    nextCol++;
    prenot.getRange(1, nextCol).setValue("Netto").setFontWeight("bold").setBackground("#2E7D32").setFontColor("white");
    prenot.setColumnWidth(nextCol, 100);
    prenot.getRange(2, nextCol, prenot.getMaxRows() - 1, 1).setNumberFormat("€#,##0.00");
    nextCol++;
  }
  if (!hasFeeManuale) {
    prenot.getRange(1, nextCol).setValue("Fee Manuale").setFontWeight("bold").setBackground("#AD1457").setFontColor("white");
    prenot.setColumnWidth(nextCol, 110);
    prenot.getRange(2, nextCol, prenot.getMaxRows() - 1, 1).setNumberFormat("€#,##0.00");
  }
}

function aggiornaSubAppaltRiepilogo() {
  return; // DISATTIVATA_V5 - ora gestita da formule nel foglio

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglio = ss.getSheetByName("Sub Appaltatori");
  if (!foglio) return;

  var mesiNomi = ["gennaio","febbraio","marzo","aprile","maggio","giugno",
                  "luglio","agosto","settembre","ottobre","novembre","dicembre"];

  var foglioPren = ss.getSheetByName("Prenotazioni");
  if (!foglioPren || foglioPren.getLastRow() <= 1) return;

  var prenData = foglioPren.getDataRange().getValues();
  var prenH = prenData[0].map(function(h) { return h.toString().trim().toLowerCase(); });
  var pColStato   = cercaCol_(prenH, ["stato"]);
  var pColData    = cercaCol_(prenH, ["data"]);
  var pColBarca   = cercaCol_(prenH, ["barca", "imbarcazione"]);
  var pColTour    = cercaCol_(prenH, ["tipo tour", "tour"]);
  var pColSubA    = cercaCol_(prenH, ["sub appaltato a"]);
  var pColCostoS  = cercaCol_(prenH, ["costo sub appalto"]);
  var pColModPag  = cercaCol_(prenH, ["modalità pagamento", "modalita pagamento"]);
  var pColTotale  = cercaCol_(prenH, ["totale"]);
  var pColId      = cercaCol_(prenH, ["id"]);

  if (pColSubA < 0 || pColCostoS < 0) return;

  var righeNuove = [];

  for (var rp = 1; rp < prenData.length; rp++) {
    var stato = pColStato >= 0 ? (prenData[rp][pColStato] || "").toString().toLowerCase() : "";
    if (stato.indexOf("annull") >= 0 || stato.indexOf("cancel") >= 0) continue;

    var subNome = (prenData[rp][pColSubA] || "").toString().trim();
    if (!subNome) continue;

    var costoSub = parseFloat(prenData[rp][pColCostoS]) || 0;
    if (costoSub <= 0) continue;

    var dataVal = prenData[rp][pColData >= 0 ? pColData : 1];
    var dataObj = null;
    if (dataVal instanceof Date) {
      dataObj = dataVal;
    } else if (dataVal) {
      dataObj = _parseDataFlessibile_(dataVal.toString());
    }

    var meseKey = dataObj ? (mesiNomi[dataObj.getMonth()] + " " + dataObj.getFullYear()) : "senza data";
    var barca = pColBarca >= 0 ? (prenData[rp][pColBarca] || "").toString().trim() : "";
    var tour = pColTour >= 0 ? (prenData[rp][pColTour] || "").toString().trim() : "";
    var modalita = pColModPag >= 0 ? (prenData[rp][pColModPag] || "").toString().trim() : "";
    var totale = pColTotale >= 0 ? (parseFloat(prenData[rp][pColTotale]) || 0) : 0;
    var idPren = pColId >= 0 ? (prenData[rp][pColId] || "").toString().trim() : ("R" + (rp + 1));

    var isIncassare = modalita.toLowerCase() === "incassare";
    var importoDovuto = isIncassare ? (totale - costoSub) : -costoSub;

    var chiave = subNome + "|" + (dataObj ? Utilities.formatDate(dataObj, Session.getScriptTimeZone(), "yyyyMMdd") : "nd") + "|" + idPren;

    righeNuove.push({
      chiave: chiave, sub: subNome, mese: meseKey, data: dataObj,
      barca: barca, tour: tour, costo: costoSub, totale: totale,
      modalita: modalita, isIncassare: isIncassare,
      importoDovuto: importoDovuto, rif: idPren
    });
  }

  var esistenti = {};
  var lastRow = foglio.getLastRow();
  if (lastRow > 1) {
    var subData = foglio.getRange(2, 1, lastRow - 1, 11).getValues();
    var subBgs = foglio.getRange(2, 1, lastRow - 1, 1).getBackgrounds();
    for (var rs = 0; rs < subData.length; rs++) {
      var rifEsist = (subData[rs][10] || "").toString().trim();
      var subEsist = (subData[rs][0] || "").toString().trim();
      if (!subEsist && !rifEsist) continue;

      var dataEsist = subData[rs][2];
      var dataKey = "";
      if (dataEsist instanceof Date && !isNaN(dataEsist.getTime())) {
        dataKey = Utilities.formatDate(dataEsist, Session.getScriptTimeZone(), "yyyyMMdd");
      }
      var chiaveEsist = subEsist + "|" + (dataKey || "nd") + "|" + rifEsist;
      var isCristallizzata = (subBgs[rs][0] === "#e8f5e9");
      esistenti[chiaveEsist] = { riga: rs + 2, cristallizzata: isCristallizzata };
    }
  }

  var nextRow = lastRow > 1 ? lastRow + 1 : 2;

  for (var k = 0; k < righeNuove.length; k++) {
    var riga = righeNuove[k];
    var es = esistenti[riga.chiave];

    if (es && es.cristallizzata) continue;

    var targetRow = es ? es.riga : nextRow++;

    foglio.getRange(targetRow, 1).setValue(riga.sub);
    foglio.getRange(targetRow, 2).setValue(riga.mese);
    if (riga.data) foglio.getRange(targetRow, 3).setValue(riga.data).setNumberFormat("dd/MM/yyyy");
    foglio.getRange(targetRow, 4).setValue(riga.barca);
    foglio.getRange(targetRow, 5).setValue(riga.tour);
    foglio.getRange(targetRow, 6).setValue(riga.totale).setNumberFormat("€#,##0.00");
    foglio.getRange(targetRow, 7).setValue(riga.costo).setNumberFormat("€#,##0.00");

    var cellaDovuto = foglio.getRange(targetRow, 9);
    cellaDovuto.setValue(riga.importoDovuto).setNumberFormat("€#,##0.00");

    var modalitaPag = (foglio.getRange(targetRow, 8).getValue() || "").toString().trim();
    var saldo = modalitaPag ? 0 : riga.importoDovuto;
    var cellaSaldo = foglio.getRange(targetRow, 10);
    cellaSaldo.setValue(Math.round(saldo * 100) / 100).setNumberFormat("€#,##0.00");

    var coloreDovuto = (riga.importoDovuto >= 0) ? "#2E7D32" : "#C62828";
    cellaDovuto.setFontColor(coloreDovuto);
    if (saldo !== 0) cellaSaldo.setFontColor((saldo >= 0) ? "#2E7D32" : "#C62828");

    foglio.getRange(targetRow, 11).setValue(riga.rif);
  }
}

function _onEditSubAppaltatori_(e, sheet) {
  var row = e.range.getRow();
  var col = e.range.getColumn();
  if (row <= 1) return;
  if (col !== 8) return;

  var subNome = (sheet.getRange(row, 1).getValue() || "").toString().trim();
  if (!subNome) return;

  var modalitaVal = (e.range.getValue() || "").toString().trim();

  if (modalitaVal) {
    sheet.getRange(row, 10).setValue(0).setNumberFormat("€#,##0.00");
    sheet.getRange(row, 1, 1, 11).setBackground("#E8F5E9").setFontColor("#2E7D32");
    SpreadsheetApp.getActiveSpreadsheet().toast(
      subNome + " — riga " + row + " saldata e cristallizzata.",
      "✅ Sub Appalto saldato", 5
    );
  } else {
    var dovuto = parseFloat(sheet.getRange(row, 9).getValue()) || 0;
    sheet.getRange(row, 10).setValue(dovuto).setNumberFormat("€#,##0.00");
    var colore = (dovuto >= 0) ? "#2E7D32" : "#C62828";
    sheet.getRange(row, 1, 1, 11).setBackground(null);
    sheet.getRange(row, 9).setFontColor(colore);
    sheet.getRange(row, 10).setFontColor(colore);
  }
}

function _aggiornaDropdownSubAppaltatori_(ss, foglio, riga, colonna) {
  var subFoglio = ss.getSheetByName("Sub Appaltatori");
  if (!subFoglio || subFoglio.getLastRow() <= 1) return;
  var seen = {};
  var nomi = [];
  var data = subFoglio.getRange(2, 1, subFoglio.getLastRow() - 1, 1).getValues();
  for (var r = 0; r < data.length; r++) {
    var nome = (data[r][0] || "").toString().trim();
    if (nome && !seen[nome]) {
      seen[nome] = true;
      nomi.push(nome);
    }
  }
  if (nomi.length > 0) {
    nomi.sort();
    nomi.unshift("");
    try {
      foglio.getRange(riga, colonna).setDataValidation(
        SpreadsheetApp.newDataValidation()
          .requireValueInList(nomi, true)
          .setAllowInvalid(true)
          .build()
      );
    } catch(e) {}
  }
}

// ══════════════════════════════════════════════════════════════════════════
// FEE RIEPILOGO — invariato rispetto a V4.3
// ══════════════════════════════════════════════════════════════════════════
function _onEditFeeRiepilogo_(e, sheet) {
  if (e.range.getRow() <= 1) return;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colMap = {};
  for (var i = 0; i < headers.length; i++) {
    colMap[headers[i].toString().trim().toLowerCase()] = i + 1;
  }

  var C_MODPAG = colMap["modalità pagamento"] || colMap["modalita pagamento"] || 0;
  if (!C_MODPAG) return;
  if (e.range.getColumn() !== C_MODPAG) return;

  var riga = e.range.getRow();
  var modalitaVal = (e.range.getValue() || "").toString().trim();

  if (modalitaVal) {
    var colonneDaCristallizzare = ["n. prenotazioni", "totale fee"];
    for (var c = 0; c < colonneDaCristallizzare.length; c++) {
      var nomeCol = colonneDaCristallizzare[c];
      var colIdx = colMap[nomeCol] || 0;
      if (colIdx > 0) {
        var cella = sheet.getRange(riga, colIdx);
        var formula = cella.getFormula();
        if (formula) {
          var valore = cella.getValue();
          cella.setValue(valore);
        }
      }
    }
    var lastCol = sheet.getLastColumn();
    sheet.getRange(riga, 1, 1, lastCol).setBackground("#E8F5E9").setFontColor("#2E7D32");
    SpreadsheetApp.getActiveSpreadsheet().toast("Riga " + riga + " cristallizzata: fee saldata.", "✅ Fee saldata", 5);
  } else {
    var lastCol = sheet.getLastColumn();
    sheet.getRange(riga, 1, 1, lastCol).setBackground(null).setFontColor(null);
    SpreadsheetApp.getActiveSpreadsheet().toast("Riga " + riga + " sbloccata.", "🔓 Fee sbloccata", 5);
  }
}

function aggiornaFeeRiepilogo() {
  return; // DISATTIVATA_V5 - ora gestita da formule nel foglio

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var foglioForn = ss.getSheetByName("Fornitori");
  if (!foglioForn || foglioForn.getLastRow() <= 1) {
    ss.toast("Foglio Fornitori non trovato o vuoto.", "⚠️", 4);
    return;
  }
  var fornData = foglioForn.getDataRange().getValues();
  var fornH = fornData[0].map(function(h) { return h.toString().trim().toLowerCase(); });
  var fColNome = cercaCol_(fornH, ["nome fornitore", "nome", "fornitore"]);
  var fColTipo = cercaCol_(fornH, ["tipo fee", "tipo"]);
  var fColPers = cercaCol_(fornH, ["fee/persona", "fee persona", "per persona"]);
  var fColEscl = cercaCol_(fornH, ["fee/esclusiva", "fee esclusiva", "esclusiva"]);
  var fColPerc = cercaCol_(fornH, ["%", "percentuale", "perc"]);
  if (fColNome < 0) fColNome = 0;

  var fornitoriMap = {};
  for (var rf = 1; rf < fornData.length; rf++) {
    var nf = (fornData[rf][fColNome] || "").toString().trim();
    if (!nf) continue;
    fornitoriMap[nf] = {
      tipo: fColTipo >= 0 ? (fornData[rf][fColTipo] || "").toString().trim().toLowerCase() : "",
      feePersona: fColPers >= 0 ? (parseFloat(fornData[rf][fColPers]) || 0) : 0,
      feeEsclusiva: fColEscl >= 0 ? (parseFloat(fornData[rf][fColEscl]) || 0) : 0,
      percentuale: fColPerc >= 0 ? (parseFloat(fornData[rf][fColPerc]) || 0) : 0
    };
  }

  var foglioPren = ss.getSheetByName("Prenotazioni");
  if (!foglioPren || foglioPren.getLastRow() <= 1) {
    ss.toast("Nessuna prenotazione trovata.", "⚠️", 4);
    return;
  }
  var prenData = foglioPren.getDataRange().getValues();
  var prenH = prenData[0].map(function(h) { return h.toString().trim().toLowerCase(); });
  var pColStato = cercaCol_(prenH, ["stato"]);
  var pColData = cercaCol_(prenH, ["data"]);
  var pColTipologia = cercaCol_(prenH, ["tipologia"]);
  var pColPax = cercaCol_(prenH, ["n. pax", "pax"]);
  var pColFornitore = cercaCol_(prenH, ["fornitore"]);
  var pColTotale = cercaCol_(prenH, ["totale"]);
  var pColFeeManuale = cercaCol_(prenH, ["fee manuale"]);
  if (pColData < 0) pColData = 1;
  if (pColFornitore < 0) { ss.toast("Colonna Fornitore non trovata.", "⚠️", 4); return; }

  var mesiNomi = ["gennaio","febbraio","marzo","aprile","maggio","giugno",
                  "luglio","agosto","settembre","ottobre","novembre","dicembre"];
  var aggregato = {};

  for (var rp = 1; rp < prenData.length; rp++) {
    var stato = pColStato >= 0 ? (prenData[rp][pColStato] || "").toString().toLowerCase() : "";
    if (stato.indexOf("annull") >= 0 || stato.indexOf("cancel") >= 0) continue;

    var fornitore = (prenData[rp][pColFornitore] || "").toString().trim();
    if (!fornitore) continue;

    var dataVal = prenData[rp][pColData];
    var dataObj = null;
    if (dataVal instanceof Date) {
      dataObj = dataVal;
    } else if (dataVal) {
      dataObj = _parseDataFlessibile_(dataVal.toString());
    }
    if (!dataObj) continue;
    var meseKey = mesiNomi[dataObj.getMonth()] + " " + dataObj.getFullYear();

    var tipologia = pColTipologia >= 0 ? (prenData[rp][pColTipologia] || "").toString().toLowerCase() : "";
    var pax = pColPax >= 0 ? (parseInt(prenData[rp][pColPax]) || 0) : 0;
    var totale = pColTotale >= 0 ? (parseFloat(prenData[rp][pColTotale]) || 0) : 0;
    var isPrivato = tipologia.indexOf("privat") >= 0;

    var fee = 0;
    if (pColFeeManuale >= 0) {
      fee = parseFloat(prenData[rp][pColFeeManuale]) || 0;
    } else {
      var forn = fornitoriMap[fornitore];
      if (forn) {
        var tipo = forn.tipo;
        var perc = forn.percentuale;
        if (perc > 0 && perc <= 1) perc = perc * 100;
        if (tipo === "fissa") {
          fee = isPrivato ? forn.feeEsclusiva : (forn.feePersona * pax);
        } else if (tipo === "percentuale") {
          fee = totale * (perc / 100);
        } else if (tipo === "mista") {
          var feeBase = isPrivato ? forn.feeEsclusiva : (forn.feePersona * pax);
          fee = feeBase + (totale * (perc / 100));
        }
      }
    }

    var chiave = fornitore + "|" + meseKey;
    if (!aggregato[chiave]) {
      aggregato[chiave] = { fornitore: fornitore, mese: meseKey, nPren: 0, totaleFee: 0 };
    }
    aggregato[chiave].nPren++;
    aggregato[chiave].totaleFee += fee;
  }

  var foglioFee = ss.getSheetByName("Fee Riepilogo");
  if (!foglioFee) {
    foglioFee = ss.insertSheet("Fee Riepilogo");
  }

  var feeH = foglioFee.getRange(1, 1, 1, foglioFee.getLastColumn() || 5).getValues()[0];
  var feeColMap = {};
  for (var i = 0; i < feeH.length; i++) {
    feeColMap[feeH[i].toString().trim().toLowerCase()] = i + 1;
  }
  var FC_FORN = feeColMap["fornitore"] || 1;
  var FC_MESE = feeColMap["mese"] || 2;
  var FC_NPREN = feeColMap["n. prenotazioni"] || 3;
  var FC_TOTFEE = feeColMap["totale fee"] || 4;
  var FC_MODPAG = feeColMap["modalità pagamento"] || feeColMap["modalita pagamento"] || 5;

  if (!feeColMap["modalità pagamento"] && !feeColMap["modalita pagamento"]) {
    var newHeaders = ["Fornitore", "Mese", "N. Prenotazioni", "Totale Fee", "Modalità Pagamento"];
    foglioFee.getRange(1, 1, 1, newHeaders.length).setValues([newHeaders])
      .setFontWeight("bold").setBackground("#1565C0").setFontColor("white");
    foglioFee.setColumnWidth(5, 160);
    var modPagRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(["Fattura", "Sconto in fattura", "Incassare", "Link", "Carta", "Contanti"], true)
      .setAllowInvalid(false).build();
    foglioFee.getRange(2, 5, foglioFee.getMaxRows() - 1, 1).setDataValidation(modPagRule);
    FC_MODPAG = 5;
  }

  var esistenti = {};
  var lastRowFee = foglioFee.getLastRow();
  if (lastRowFee > 1) {
    var feeData = foglioFee.getRange(2, 1, lastRowFee - 1, Math.max(foglioFee.getLastColumn(), 5)).getValues();
    var feeBgs = foglioFee.getRange(2, 1, lastRowFee - 1, 1).getBackgrounds();
    for (var rf2 = 0; rf2 < feeData.length; rf2++) {
      var forn2 = (feeData[rf2][FC_FORN - 1] || "").toString().trim();
      var mese2 = (feeData[rf2][FC_MESE - 1] || "").toString().trim();
      if (forn2 && mese2) {
        var chiave2 = forn2 + "|" + mese2;
        var isCristallizzata = (feeBgs[rf2][0] === "#e8f5e9");
        esistenti[chiave2] = { riga: rf2 + 2, cristallizzata: isCristallizzata };
      }
    }
  }

  var nextRow = lastRowFee + 1;
  var chiavi = Object.keys(aggregato).sort();
  for (var k = 0; k < chiavi.length; k++) {
    var agg = aggregato[chiavi[k]];
    var es = esistenti[chiavi[k]];

    if (es && es.cristallizzata) continue;

    var targetRow = es ? es.riga : nextRow++;
    foglioFee.getRange(targetRow, FC_FORN).setValue(agg.fornitore);
    foglioFee.getRange(targetRow, FC_MESE).setValue(agg.mese);
    foglioFee.getRange(targetRow, FC_NPREN).setValue(agg.nPren);
    foglioFee.getRange(targetRow, FC_TOTFEE).setValue(Math.round(agg.totaleFee * 100) / 100).setNumberFormat("€#,##0.00");
  }

  ss.toast("Fee Riepilogo aggiornato con " + chiavi.length + " voci.", "✅ Fee aggiornate", 5);
}

// ══════════════════════════════════════════════════════════════════════════
// AUTO-AGGIORNAMENTO UNIVERSALE
// ══════════════════════════════════════════════════════════════════════════
function aggiornaAutoTutto() {
  try { aggiornaDashboard(); } catch(e) { Logger.log("aggiornaAutoTutto > Dashboard: " + e.message); }
  try { aggiornaFeeRiepilogo(); } catch(e) { Logger.log("aggiornaAutoTutto > Fee: " + e.message); }
  try { aggiornaSubAppaltRiepilogo(); } catch(e) { Logger.log("aggiornaAutoTutto > SubAppalti: " + e.message); }
  try { _pushDashboardATemplates_(SpreadsheetApp.getActiveSpreadsheet()); } catch(e) { Logger.log("aggiornaAutoTutto > pushTemplates: " + e.message); }
}

// ══════════════════════════════════════════════════════════════════════════
// TRIGGER
// ══════════════════════════════════════════════════════════════════════════
function installaTriggerOnEdit() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "onEdit" &&
        triggers[i].getEventType() === ScriptApp.EventType.ON_EDIT) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger("onEdit")
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();
  SpreadsheetApp.getActiveSpreadsheet().toast(
    "Trigger onEdit installato! Ora il webhook Transfer funzionerà.",
    "🔗 Transfer ✅", 5
  );
}

function installaTriggerdashboard() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var fn = triggers[i].getHandlerFunction();
    if (fn === "aggiornaDashboard" || fn === "aggiornaAutoTutto") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger("aggiornaAutoTutto").timeBased().everyMinutes(1).create();
  SpreadsheetApp.getActiveSpreadsheet().toast(
    "Auto-aggiornamento attivato: Dashboard + Fee + Sub Appaltatori ogni minuto.",
    "▶ Trigger ✅", 4
  );
}

function rimuoviTriggerDashboard() {
  var triggers = ScriptApp.getProjectTriggers();
  var n = 0;
  for (var i = 0; i < triggers.length; i++) {
    var fn = triggers[i].getHandlerFunction();
    if (fn === "aggiornaDashboard" || fn === "aggiornaAutoTutto") {
      ScriptApp.deleteTrigger(triggers[i]);
      n++;
    }
  }
  SpreadsheetApp.getActiveSpreadsheet().toast(
    n > 0 ? "Auto-aggiornamento disattivato." : "Nessun trigger attivo.", "⏹", 3
  );
}

// ══════════════════════════════════════════════════════════════════════════
// WEB API — doGet: invariato rispetto a V4.3
// ══════════════════════════════════════════════════════════════════════════
function doGet(e) {
  var params = e ? e.parameter : {};
  var dataParam = params.data || "";
  var barcaFilter = params.barca || "";

  var dataFiltroNorm = dataParam ? _parseDataFlessibile_(dataParam) : null;
  if (!dataFiltroNorm) { dataFiltroNorm = new Date(); dataFiltroNorm.setHours(0,0,0,0); }
  var dd = dataFiltroNorm.getDate().toString().padStart(2,"0");
  var mm = (dataFiltroNorm.getMonth()+1).toString().padStart(2,"0");
  var dataStr = dd + "/" + mm + "/" + dataFiltroNorm.getFullYear();

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var barche = _leggiBarche_(ss);
  if (barcaFilter) barche = barche.filter(function(b) { return b.nome === barcaFilter; });

  var tipiTour = [];
  var ft = ss.getSheetByName("Tipi Tour") || ss.getSheetByName("Tour");
  if (ft && ft.getLastRow() > 1) {
    var tData = ft.getDataRange().getValues();
    var tH = tData[0].map(function(x) { return x.toString().trim().toLowerCase(); });
    var tCN = cercaCol_(tH, ["nome","tipo","tour"]);
    var tCD = cercaCol_(tH, ["durata","minuti"]);
    var tCPG = cercaCol_(tH, ["prezzo gruppo","gruppo","prezzo/pax"]);
    var tCPP = cercaCol_(tH, ["prezzo privato","privato","prezzo esclusivo"]);
    if (tCN < 0) tCN = 0;
    for (var r = 1; r < tData.length; r++) {
      var tn = (tData[r][tCN] || "").toString().trim();
      if (tn) tipiTour.push({
        nome: tn,
        durata: tCD >= 0 ? (parseInt(tData[r][tCD]) || 90) : 90,
        prezzoGruppo: tCPG >= 0 ? (parseFloat(tData[r][tCPG]) || 0) : 0,
        prezzoPrivato: tCPP >= 0 ? (parseFloat(tData[r][tCPP]) || 0) : 0
      });
    }
  }
  if (tipiTour.length === 0) {
    tipiTour = [
      { nome: "Giro Classico", durata: 90, prezzoGruppo: 35, prezzoPrivato: 350 },
      { nome: "Giro Lungo", durata: 180, prezzoGruppo: 70, prezzoPrivato: 550 },
      { nome: "Full Day", durata: 300, prezzoGruppo: 0, prezzoPrivato: 990 }
    ];
  }

  var prenotazioni = _leggiPrenotazioniGiorno_(ss, dataFiltroNorm);
  if (barcaFilter) prenotazioni = prenotazioni.filter(function(p) { return p.barca === barcaFilter; });

  var slots = {};
  for (var ib = 0; ib < barche.length; ib++) {
    var barca = barche[ib];
    var bSlots = {};
    for (var is = 0; is < SLOTS_GESTIONALE.length; is++) {
      var slotMin = oraToMin_(SLOTS_GESTIONALE[is]);
      var paxOcc = 0;
      for (var ip = 0; ip < prenotazioni.length; ip++) {
        var pr = prenotazioni[ip];
        if (pr.barca !== barca.nome) continue;
        var iMin = oraToMin_(pr.oraInizio);
        var fMin = oraToMin_(pr.oraFine);
        if (iMin >= 0 && fMin > iMin && iMin <= slotMin && slotMin < fMin) {
          paxOcc += pr.pax;
        }
      }
      // V4.4: anche qui scaliamo coerentemente con Privato
      bSlots[SLOTS_GESTIONALE[is]] = Math.max(0, barca.capacita - paxOcc);
    }
    slots[barca.nome] = bSlots;
  }

  var porti = {};
  var foglioPorti = ss.getSheetByName("Porti");
  if (foglioPorti && foglioPorti.getLastRow() > 1) {
    var portiData = foglioPorti.getDataRange().getValues();
    var headerRowIdx = 0;
    for (var ph = 0; ph < Math.min(portiData.length, 5); ph++) {
      if ((portiData[ph][0] || "").toString().trim().toLowerCase() === "data") { headerRowIdx = ph; break; }
    }
    var slotColMap = {};
    for (var pc = 2; pc < portiData[headerRowIdx].length; pc++) {
      var hv = (portiData[headerRowIdx][pc] || "").toString().trim();
      if (/^\d{1,2}:\d{2}$/.test(hv)) slotColMap[pc] = hv;
    }
    var portiTemp = {};
    for (var rpt = headerRowIdx + 1; rpt < portiData.length; rpt++) {
      var row = portiData[rpt];
      var bn = (row[1] || "").toString().trim();
      if (!bn) continue;
      if (!portiTemp[bn]) portiTemp[bn] = { def: null, ovr: null };
      var dc = row[0];
      var isDef = (!dc || dc === "" || dc === "Default");
      var isMatch = false;
      if (!isDef) {
        var dn = (dc instanceof Date) ? new Date(dc.getFullYear(), dc.getMonth(), dc.getDate()) : _parseDataFlessibile_(dc.toString());
        if (dn && dn.getTime() === dataFiltroNorm.getTime()) isMatch = true;
      }
      if (!isDef && !isMatch) continue;
      var ps = {};
      for (var sci in slotColMap) {
        var v = (row[parseInt(sci)] || "").toString().trim();
        if (v) ps[slotColMap[sci]] = v;
      }
      if (isDef && !portiTemp[bn].def) portiTemp[bn].def = ps;
      if (isMatch) portiTemp[bn].ovr = ps;
    }
    for (var pbn in portiTemp) {
      var pt = portiTemp[pbn];
      var defP = pt.def || {};
      var ovrP = pt.ovr || {};
      var pred = "";
      for (var sk in defP) { if (defP[sk]) { pred = defP[sk]; break; } }
      var result = { predefinito: pred || PORTO_DEFAULT };
      for (var si = 0; si < SLOTS_GESTIONALE.length; si++) {
        var sl = SLOTS_GESTIONALE[si];
        result[sl] = ovrP[sl] || defP[sl] || pred || PORTO_DEFAULT;
      }
      porti[pbn] = result;
    }
  }
  for (var ib2 = 0; ib2 < barche.length; ib2++) {
    if (!porti[barche[ib2].nome]) {
      var fp = { predefinito: PORTO_DEFAULT };
      for (var si2 = 0; si2 < SLOTS_GESTIONALE.length; si2++) fp[SLOTS_GESTIONALE[si2]] = PORTO_DEFAULT;
      porti[barche[ib2].nome] = fp;
    }
  }

  return ContentService.createTextOutput(JSON.stringify({
    data: dataStr,
    barche: barche,
    tipiTour: tipiTour,
    slots: slots,
    porti: porti,
    aggiornato: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm:ss")
  })).setMimeType(ContentService.MimeType.JSON);
}

// ══════════════════════════════════════════════════════════════════════════
// V4.4: TRANSFER — Webhook semplificato a checkbox booleano
// azione ∈ { "nuovo", "modifica", "cancella" }
// id transfer = id prenotazione (niente più suffissi -A/-R)
// ══════════════════════════════════════════════════════════════════════════
var TRANSFER_WEBHOOK_URL = "https://transfer.app.n8n.cloud/webhook/transfer/approve/request";

function _inviaTransferWebhook_(ss, sheet, riga, colMap, azione) {

  var C_TRANSFER   = colMap["transfer"] || 0;
  var C_DATA       = colMap["data"] || 2;
  var C_ORA_INIZIO = colMap["ora inizio"] || 3;
  var C_BARCA      = colMap["barca"] || 4;
  var C_TIPO_TOUR  = colMap["tipo tour"] || 5;
  var C_ORA_FINE   = colMap["ora fine"] || 6;
  var C_PAX        = colMap["n. pax"] || colMap["pax"] || 8;
  var C_NOME       = colMap["nome cliente"] || colMap["nome"] || colMap["cliente"] || 0;
  var C_CELL       = colMap["cellulare"] || colMap["telefono"] || 0;
  var C_FORNITORE  = colMap["fornitore"] || 0;
  var C_NOTE       = colMap["note"] || 0;
  var C_ID         = colMap["id"] || 0;

  var rowData = sheet.getRange(riga, 1, 1, sheet.getLastColumn()).getValues()[0];

  var dataVal    = rowData[C_DATA - 1] || "";
  var oraInizio  = rowData[C_ORA_INIZIO - 1] || "";
  var oraFine    = rowData[C_ORA_FINE - 1] || "";
  var barca      = (rowData[C_BARCA - 1] || "").toString().trim();
  var tipoTour   = (rowData[C_TIPO_TOUR - 1] || "").toString().trim();
  var pax        = (rowData[C_PAX - 1] || "").toString().trim();
  var nome       = C_NOME > 0 ? (rowData[C_NOME - 1] || "").toString().trim() : "";
  var cellulare  = C_CELL > 0 ? (rowData[C_CELL - 1] || "").toString().trim() : "";
  var fornitore  = C_FORNITORE > 0 ? (rowData[C_FORNITORE - 1] || "").toString().trim() : "";
  var note       = C_NOTE > 0 ? (rowData[C_NOTE - 1] || "").toString().trim() : "";
  var idPren     = C_ID > 0 ? (rowData[C_ID - 1] || "").toString().trim() : "";

  // Data formattata DD/MM/YYYY
  var dataStr = "";
  if (dataVal instanceof Date) {
    dataStr = Utilities.formatDate(dataVal, Session.getScriptTimeZone(), "dd/MM/yyyy");
  } else {
    dataStr = dataVal.toString().trim();
  }

  // Ora pickup: Ora Inizio - 20 minuti
  var oraPickup = _sottraiMinuti_(oraInizio, 20);

  // Mese
  var meseStr = "";
  if (dataVal instanceof Date) {
    var mesi = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
                "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
    meseStr = mesi[dataVal.getMonth()];
  }

  // Stato in base all'azione
  var stato;
  if (azione === "modifica") stato = "Modificato";
  else if (azione === "cancella") stato = "Cancellato";
  else stato = "Pronto";

  // Note arricchite
  var noteCompleta = "";
  if (tipoTour) noteCompleta += "Tour: " + tipoTour;
  if (barca)    noteCompleta += (noteCompleta ? " | " : "") + "Barca: " + barca;
  if (note)     noteCompleta += (noteCompleta ? " | " : "") + note;

  // Singolo payload (niente più 1 vs 2 chiamate)
  var payload = {
    spreadsheetId:   ss.getId(),
    fileName:        ss.getName(),
    sheetName:       sheet.getName(),
    riga:            riga,
    colTransfer:     C_TRANSFER,
    azione:          azione, // nuovo | modifica | cancella
    data: {
      mese:              meseStr,
      note:              noteCompleta,
      data:              dataStr,
      ora:               oraPickup,
      ora_fine:          _formatTimeStr_(oraFine),
      trs_da:            fornitore || "",
      trs_per:           "Porto di Polignano",
      pax:               pax,
      nome:              nome,
      fornitore:         fornitore,
      volo:              "",
      cell:              cellulare,
      autista:           "",
      veicolo:           "",
      h_extra_ritardi:   "",
      tariffa_a_noi:     "",
      tariffa:           "",
      fee:               "",
      modalita:          "",
      tipologia_incasso: "",
      n_pratica:         "",
      addebitato:        "",
      stato:             stato,
      eseguito:          "",
      id:                idPren
    }
  };

  var options = {
    method:      "post",
    contentType: "application/json",
    payload:     JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(TRANSFER_WEBHOOK_URL, options);
  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    Logger.log("Transfer webhook HTTP " + code + " (" + azione + ", riga " + riga + "): " + response.getContentText());
  } else {
    Logger.log("Transfer webhook OK riga " + riga + " (" + azione + ")");
  }
      try { var dataRit = Object.assign({}, payload.data); dataRit.ora = payload.data.ora_fine; dataRit.trs_da = payload.data.trs_per; dataRit.trs_per = payload.data.trs_da; dataRit.id = payload.data.id + "-R"; var payloadRit = Object.assign({}, payload, {data: dataRit}); var optionsRit = {method:"post", contentType:"application/json", payload: JSON.stringify(payloadRit), muteHttpExceptions: true}; UrlFetchApp.fetch(TRANSFER_WEBHOOK_URL, optionsRit); Logger.log("Transfer RITORNO riga " + riga + " id=" + dataRit.id + " ora=" + dataRit.ora); } catch(eRit) { Logger.log("Errore invio RITORNO: " + eRit); }
}

/**
 * Converte la colonna Transfer del foglio Prenotazioni in checkbox booleano.
 * Esegui UNA volta dal menu (Gestionale → Converti colonna Transfer in checkbox).
 * Migra eventuali valori esistenti: "a", "r", "a/r" → TRUE; vuoto/null → FALSE.
 */
function convertiTransferInCheckbox() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var foglio = ss.getSheetByName("Prenotazioni");
  if (!foglio) { ss.toast("Foglio Prenotazioni non trovato.", "⚠️", 4); return; }

  var headers = foglio.getRange(1, 1, 1, foglio.getLastColumn()).getValues()[0];
  var colTransfer = -1;
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].toString().trim().toLowerCase() === "transfer") {
      colTransfer = i + 1;
      break;
    }
  }
  if (colTransfer < 0) { ss.toast("Colonna 'Transfer' non trovata.", "⚠️", 4); return; }

  var lastRow = Math.max(foglio.getLastRow(), 2);
  var range = foglio.getRange(2, colTransfer, lastRow - 1, 1);

  // Migra valori esistenti
  var valori = range.getValues();
  var nuoviValori = [];
  for (var r = 0; r < valori.length; r++) {
    var raw = (valori[r][0] || "").toString().toLowerCase().trim();
    var attivo = (raw === "a" || raw === "r" || raw === "a/r" || raw === "true" || raw === "vero");
    nuoviValori.push([attivo]);
  }

  // Imposta validation a checkbox e scrive i valori migrati
  var rule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  range.setDataValidation(rule);
  range.setValues(nuoviValori);

  ss.toast("Colonna Transfer convertita in checkbox. Migrate " + valori.length + " righe.", "☑ Transfer ✅", 6);
}

// ══════════════════════════════════════════════════════════════════════════
// V4.4: SCAFFOLDING SYNC TEMPLATE STRUTTURE (Opzione A)
//
// Il foglio "Strutture" elenca i fogli template clonati per ogni partner.
// Quando una riga è "Attiva", il push automatico aggiorna la sua dashboard.
// Se la scheda è vuota o tutte le righe sono inattive → no-op silenzioso.
//
// Colonne: Nome Struttura | Spreadsheet ID | Telegram | Stato | Ultimo Sync
// ══════════════════════════════════════════════════════════════════════════

function setupSchedaStrutture() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existing = ss.getSheetByName("Strutture");
  if (existing) {
    ss.toast("Il foglio Strutture esiste già.", "⚠️ Info", 4);
    ss.setActiveSheet(existing);
    return;
  }
  var foglio = ss.insertSheet("Strutture");

  var headers = ["Nome Struttura", "Spreadsheet ID", "Telegram", "Stato", "Ultimo Sync", "Note"];
  foglio.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight("bold").setBackground("#1565C0").setFontColor("white")
    .setHorizontalAlignment("center");
  foglio.setFrozenRows(1);

  foglio.setColumnWidth(1, 200);   // Nome
  foglio.setColumnWidth(2, 320);   // Spreadsheet ID
  foglio.setColumnWidth(3, 160);   // Telegram
  foglio.setColumnWidth(4, 110);   // Stato
  foglio.setColumnWidth(5, 160);   // Ultimo Sync
  foglio.setColumnWidth(6, 240);   // Note

  // Dropdown Stato
  var statoRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Attiva", "Disattivata", "Test"], true)
    .setAllowInvalid(false).build();
  foglio.getRange(2, 4, foglio.getMaxRows() - 1, 1).setDataValidation(statoRule);

  ss.toast(
    "Foglio Strutture creato. Aggiungi una riga per ogni clone con Spreadsheet ID e Stato='Attiva'.",
    "🏨 Strutture ✅", 8
  );
}

/**
 * Push della Dashboard verso tutti i template strutture attivi.
 * Chiamata da _onEditPrenotazioni_ e da aggiornaDashboard.
 *
 * Comportamento:
 *  - Se il foglio "Strutture" non esiste → no-op silenzioso
 *  - Se non ci sono righe con Stato="Attiva" → no-op silenzioso
 *  - Per ogni struttura attiva: apre via openById e scrive un timestamp di
 *    refresh in cella nominata _ForcedRefresh (oppure A1 di un foglio _Sync).
 *    Sul template, un installable trigger reagisce e fa pull immediato.
 *  - Errori per struttura sono try/catch isolati: se una fallisce le altre
 *    procedono comunque.
 *
 * Nota: la modifica vera della dashboard del template rimane responsabilità
 * dello script del template stesso (che fa il pull via doGet del gestionale).
 * Qui inviamo solo il "trigger".
 */
function _pushDashboardATemplates_(ss) {
  var foglio = ss.getSheetByName("Strutture");
  if (!foglio) return; // scaffolding non ancora inizializzato
  var lastRow = foglio.getLastRow();
  if (lastRow <= 1) return; // scheda vuota

  var data = foglio.getRange(2, 1, lastRow - 1, 6).getValues();
  var ora = new Date();
  var oraStr = Utilities.formatDate(ora, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");

  for (var r = 0; r < data.length; r++) {
    var nome = (data[r][0] || "").toString().trim();
    var idTemplate = (data[r][1] || "").toString().trim();
    var stato = (data[r][3] || "").toString().trim().toLowerCase();
    if (!idTemplate || stato !== "attiva") continue;

    try {
      var ssTemplate = SpreadsheetApp.openById(idTemplate);
      // Cerca/crea foglio nascosto _Sync per scrivere il timestamp di refresh
      var syncSheet = ssTemplate.getSheetByName("_Sync");
      if (!syncSheet) {
        syncSheet = ssTemplate.insertSheet("_Sync");
        syncSheet.getRange("A1").setValue("LastForcedRefresh");
        syncSheet.getRange("A2").setValue(oraStr);
        syncSheet.hideSheet();
      } else {
        syncSheet.getRange("A2").setValue(oraStr);
      }
      // Aggiorna ultimo sync nel gestionale
      foglio.getRange(r + 2, 5).setValue(oraStr);
      Logger.log("Push template OK: " + nome);
    } catch (errPush) {
      Logger.log("Push template KO (" + nome + "): " + errPush.message);
      foglio.getRange(r + 2, 5).setValue("ERROR: " + errPush.message);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS — Tempo
// ══════════════════════════════════════════════════════════════════════════
function _sottraiMinuti_(oraVal, minuti) {
  var h = 0, m = 0;

  if (oraVal instanceof Date) {
    h = oraVal.getHours();
    m = oraVal.getMinutes();
  } else {
    var match = oraVal.toString().match(/(\d{1,2})[.:h](\d{2})/);
    if (match) {
      h = parseInt(match[1], 10);
      m = parseInt(match[2], 10);
    } else {
      return oraVal.toString().trim();
    }
  }

  var totalMin = h * 60 + m - minuti;
  if (totalMin < 0) totalMin += 1440;
  var hh = Math.floor(totalMin / 60);
  var mm = totalMin % 60;
  return (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm;
}

function _formatTimeStr_(oraVal) {
  if (!oraVal) return "";
  if (oraVal instanceof Date) {
    var h = oraVal.getHours();
    var m = oraVal.getMinutes();
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }
  var match = oraVal.toString().match(/(\d{1,2})[.:h](\d{2})/);
  if (match) {
    var hh = parseInt(match[1], 10);
    var mm = parseInt(match[2], 10);
    return (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm;
  }
  return oraVal.toString().trim();
}

// ══════════════════════════════════════════════════════════════════════════
// V4.5 (19/07/2026): RETRIBUZIONI SKIPPER/GUIDE + SETUP COLONNE
// ══════════════════════════════════════════════════════════════════════════
function aggiornaRetribuzioni() {
  return; // DISATTIVATA_V5 - ora gestita da formule nel foglio

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pren = ss.getSheetByName("Prenotazioni");
  if (!pren || pren.getLastRow() < 2) return;
  var data = pren.getDataRange().getValues();
  var H = data[0].map(function(h){ return h.toString().trim().toLowerCase(); });
  var cData = H.indexOf("data"), cSk = H.indexOf("skipper"), cGu = H.indexOf("guida");
  var cCSk = H.indexOf("costo skipper"), cCGu = H.indexOf("costo guida");
  if (cSk < 0 && cGu < 0) return;
  var MESI = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
  var agg = {};
  function add(nome, ruolo, dt, costo) {
    nome = (nome || "").toString().trim();
    if (!nome) return;
    var mese = "—";
    if (dt instanceof Date) { mese = MESI[dt.getMonth()] + " " + dt.getFullYear(); }
    else if (dt) { var p = _parseDataFlessibile_(dt.toString()); if (p) mese = MESI[p.getMonth()] + " " + p.getFullYear(); }
    var k = nome + "|" + ruolo + "|" + mese;
    if (!agg[k]) agg[k] = { nome: nome, ruolo: ruolo, mese: mese, n: 0, tot: 0 };
    agg[k].n++;
    agg[k].tot += (parseFloat(costo) || 0);
  }
  for (var r = 1; r < data.length; r++) {
    var dt = cData >= 0 ? data[r][cData] : "";
    if (cSk >= 0) add(data[r][cSk], "Skipper", dt, cCSk >= 0 ? data[r][cCSk] : 0);
    if (cGu >= 0) add(data[r][cGu], "Guida", dt, cCGu >= 0 ? data[r][cCGu] : 0);
  }
  var sh = ss.getSheetByName("Retribuzioni");
  if (!sh) sh = ss.insertSheet("Retribuzioni");
  sh.clearContents();
  var rows = [["Persona","Ruolo","Mese","N. Uscite","Totale"]];
  Object.keys(agg).sort().forEach(function(k){ var a = agg[k]; rows.push([a.nome, a.ruolo, a.mese, a.n, a.tot]); });
  sh.getRange(1, 1, rows.length, 5).setValues(rows);
  sh.getRange(1, 1, 1, 5).setFontWeight("bold");
  if (rows.length > 1) sh.getRange(2, 5, rows.length - 1, 1).setNumberFormat("€#,##0.00");
}

function setupV45() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pren = ss.getSheetByName("Prenotazioni");
  if (!pren) return;
  var H = pren.getRange(1, 1, 1, pren.getLastColumn()).getValues()[0].map(function(h){ return h.toString().trim().toLowerCase(); });
  ["Durata (min)","Costo Skipper","Costo Guida"].forEach(function(nome){
    if (H.indexOf(nome.toLowerCase()) < 0) {
      var c = pren.getLastColumn() + 1;
      pren.getRange(1, c).setValue(nome).setFontWeight("bold");
      H.push(nome.toLowerCase());
    }
  });
  aggiornaRetribuzioni();
}
