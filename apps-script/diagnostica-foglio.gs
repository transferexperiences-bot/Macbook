/**
 * ========================================================================
 * DIAGNOSTICA FOGLIO STRUTTURA — sola lettura
 * ========================================================================
 *
 * PERCHÉ. Agostino: «penso che sia su determinati fogli — ho rimesso io Pronto
 * ed è arrivato». Ha ragione a sospettarlo, ma i fogli hanno script diversi
 * (Pietra Blu ha `incassare_`, Suite 10 ha la GUARD PRONTO, gli altri non si
 * sa) e finché non si guarda dentro si tira a indovinare.
 *
 * Questa funzione risponde a quattro domande, per il foglio su cui gira:
 *
 *   1. quali trigger sono DAVVERO installati (non quali dovrebbero esserci)
 *   2. quali funzioni esistono nel progetto — cioè quale variante è
 *   3. dove cadono le colonne Stato e Id, e se si risolvono per nome
 *   4. quante righe hanno uno Stato aperto in questo momento
 *
 * COME SI USA. Nel foglio: Estensioni → Apps Script → incolla questo file in
 * fondo → dal menu a tendina in alto scegli `diagnosticaFoglio` → ▶ Esegui →
 * apri «Registro esecuzioni» e incolla qui il testo.
 *
 * Un foglio alla volta, dieci secondi l'uno.
 *
 * NON SCRIVE NIENTE. Nessun setValue, nessuna riga in coda, nessuna chiamata
 * verso l'esterno. Si può lanciare anche in piena giornata.
 */
function diagnosticaFoglio() {
  var righe = [];
  function dì(t) { righe.push(t); }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  dì('════════════════════════════════════════════');
  dì('FOGLIO: ' + ss.getName());
  dì('id: ' + ss.getId());

  // ---- 1. i trigger davvero installati -------------------------------
  dì('');
  dì('── TRIGGER INSTALLATI ──');
  try {
    var trigger = ScriptApp.getProjectTriggers();
    if (!trigger.length) {
      dì('  NESSUNO. ⚠️ Questo foglio non ha trigger: niente parte da qui.');
    }
    for (var i = 0; i < trigger.length; i++) {
      var t = trigger[i];
      var tipo;
      try { tipo = t.getEventType().toString(); } catch (e) { tipo = '?'; }
      dì('  ' + t.getHandlerFunction() + '  —  ' + tipo);
    }
  } catch (e) {
    dì('  non leggibili: ' + e);
  }

  // ---- 2. quale variante di script c'è dentro ------------------------
  dì('');
  dì('── FUNZIONI PRESENTI (dice quale variante è) ──');
  var attese = [
    'onEdit',              // variante Pietra Blu: accoda
    'enqueueTransfer',     // variante Suite 10: accoda
    'onEdit_completo',     // correzioni ora/telefono + logica incasso
    'incassare_',          // la guardia che cancella lo Stato
    'teMotiviBlocco_',     // GUARD PRONTO nella versione nuova
    'onChangeHandler',     // shim TransferLib
    'sweepCheck',          // rete di sicurezza ogni minuto
    'testProcessNow'
  ];
  for (var k = 0; k < attese.length; k++) {
    var nome = attese[k];
    var c = false;
    try { c = (typeof this[nome] === 'function'); } catch (e) {}
    if (!c) { try { c = (typeof eval(nome) === 'function'); } catch (e) {} }
    dì('  ' + (c ? '✓' : '·') + ' ' + nome);
  }

  var lib = 'no';
  try { if (typeof TransferLib !== 'undefined') lib = 'sì'; } catch (e) {}
  dì('  libreria TransferLib importata: ' + lib);

  // ---- 3. le colonne -------------------------------------------------
  dì('');
  dì('── COLONNE ──');
  var sh = ss.getSheetByName('Prenotazioni');
  if (!sh) {
    dì('  ⚠️ tab «Prenotazioni» NON TROVATA — qui non funziona niente.');
  } else {
    var lastCol = Math.max(24, sh.getLastColumn());
    var intest = sh.getRange(1, 1, 1, lastCol).getValues()[0];

    function trova(nomi) {
      for (var a = 0; a < nomi.length; a++) {
        for (var c = 0; c < intest.length; c++) {
          var v = (intest[c] === null || intest[c] === undefined ? '' : intest[c])
            .toString().toLowerCase().replace(/[^a-z0-9]+/g, '');
          if (v === nomi[a].toLowerCase().replace(/[^a-z0-9]+/g, '')) return c + 1;
        }
      }
      return 0;
    }

    var mappa = [
      ['Stato',     ['Stato', 'Status'],                        22],
      ['Id',        ['Id', 'Id transfer'],                      24],
      ['Fornitore', ['Fornitore', 'Struttura'],                  9],
      ['Modalità',  ['Modalità', 'Modalita'],                   18],
      ['Tipologia', ['Tipologia incasso'],                      19],
      ['Tariffa',   ['Tariffa', 'Prezzo'],                      16]
    ];
    for (var m = 0; m < mappa.length; m++) {
      var trovata = trova(mappa[m][1]);
      var attesa = mappa[m][2];
      var nota = !trovata ? '  ⚠️ NON TROVATA per nome → si userebbe la ' + attesa + ' a occhi chiusi'
               : (trovata !== attesa ? '  ⚠️ per nome è la ' + trovata + ', il codice vecchio usa la ' + attesa : '');
      dì('  ' + mappa[m][0] + ': ' + (trovata || '—') + nota);
    }

    // ---- 4. righe con uno stato aperto adesso ------------------------
    dì('');
    dì('── RIGHE CON STATO APERTO ADESSO ──');
    var colStato = trova(['Stato', 'Status']) || 22;
    var colId = trova(['Id', 'Id transfer']) || 24;
    var ultima = sh.getLastRow();
    var aperti = 0, senzaId = 0, esempi = [];
    if (ultima >= 2) {
      var vals = sh.getRange(2, 1, ultima - 1, Math.max(colStato, colId)).getValues();
      for (var r = 0; r < vals.length; r++) {
        var stato = (vals[r][colStato - 1] || '').toString().trim();
        if (['Pronto', 'Modificato', 'Cancellato'].indexOf(stato) === -1) continue;
        aperti++;
        var id = (vals[r][colId - 1] || '').toString().trim();
        if (!id) senzaId++;
        if (esempi.length < 10) {
          esempi.push('    riga ' + (r + 2) + ': «' + stato + '»' + (id ? '' : '  ⚠️ SENZA Id'));
        }
      }
    }
    dì('  ' + aperti + ' righe con Stato aperto, di cui ' + senzaId + ' senza Id');
    if (senzaId) dì('  ⚠️ quelle senza Id la rete di sicurezza NON le ripesca (buco noto)');
    for (var q = 0; q < esempi.length; q++) dì(esempi[q]);
    if (aperti > esempi.length) dì('    … e altre ' + (aperti - esempi.length));
  }

  dì('════════════════════════════════════════════');
  Logger.log(righe.join('\n'));
  return righe.join('\n');
}
