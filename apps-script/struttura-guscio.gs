/**
 * ========================================================================
 * GUSCIO — l'unica cosa che resta su ogni foglio struttura
 * ========================================================================
 *
 * Da qui in avanti sul foglio non c'è più logica: solo queste quattro
 * funzioncine, che chiamano `TransferLib`. Ogni correzione futura si fa nella
 * libreria, in un posto solo, e vale su tutti e diciotto i fogli nell'istante
 * in cui la salvi. Questo file non lo tocchi mai più.
 *
 * ---------------------------------------------------------------------
 * PERCHÉ SI CHIAMA `teOnEdit` E NON `onEdit`
 * ---------------------------------------------------------------------
 *
 * `onEdit` è un nome magico: Google fa partire da solo un «trigger semplice»
 * per qualunque funzione che si chiami così, **in più** a quelli installati.
 * È il motivo per cui su Pietra Blu ogni modifica faceva partire TRE
 * esecuzioni — e quella del trigger semplice non ha nemmeno i permessi per
 * aprire il foglio Strutture, quindi moriva ogni volta in silenzio dopo aver
 * però già coniato un Id. Da lì la corsa sull'Id e i transfer persi.
 *
 * Con un nome non magico parte una esecuzione sola.
 *
 * ⚠️ Per questo `teSetup()` si arrabbia se nel progetto è rimasta una funzione
 * chiamata `onEdit`: finché c'è, il trigger semplice continua a girare col
 * codice vecchio, qualunque cosa facciamo qui.
 *
 * ---------------------------------------------------------------------
 * COME SI INSTALLA (una volta per foglio, poi mai più)
 * ---------------------------------------------------------------------
 *
 *   1. Estensioni → Apps Script
 *   2. colonna di sinistra, «Librerie» → `+` → incolla l'id di TransferLib:
 *        1vo74eNOp7bRgiU-ioVRTRCfb2k9rmDVlV5lmW_DoFKTTKZM_or7K0o96
 *      versione: **Head (sviluppo)** — identificativo: **TransferLib**
 *   3. File → `+` → Script → nome «Guscio» → incolla questo file
 *   4. rinomina la vecchia funzione `onEdit` in `onEdit_VECCHIO`
 *      (basta cambiare il nome: non si cancella niente, si può tornare indietro)
 *   5. scegli `teSetup` dal menu a tendina → ▶ Esegui
 *   6. leggi il Registro esecuzioni: dice cosa ha tolto e cosa ha messo
 */


/** Una modifica sul foglio. Unico punto d'ingresso. */
function teOnEdit(e) {
  TransferLib.enqueueFromEdit(e);
}


/** Rete di sicurezza, ogni minuto: ripesca quello che non è partito. */
function teSweep() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  TransferLib.processFile(ss.getId(), ss.getName());
}


/**
 * Installa i due trigger e toglie tutti i vecchi. Si può rilanciare quante
 * volte si vuole: prima pulisce, poi installa.
 */
function teSetup() {
  var righe = [];
  function dì(t) { righe.push(t); }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  dì('FOGLIO: ' + ss.getName());

  // --- la libreria c'è? senza, non parte niente ---
  try {
    if (typeof TransferLib === 'undefined' || typeof TransferLib.enqueueFromEdit !== 'function') {
      dì('❌ FERMO QUI: la libreria TransferLib non è importata, o è a una versione');
      dì('   vecchia che non ha `enqueueFromEdit`. Aggiungila (punto 2 delle');
      dì('   istruzioni in cima) e rilancia. Non ho installato niente.');
      Logger.log(righe.join('\n'));
      return righe.join('\n');
    }
  } catch (e) {
    dì('❌ FERMO QUI: TransferLib non raggiungibile — ' + e);
    Logger.log(righe.join('\n'));
    return righe.join('\n');
  }
  dì('✓ TransferLib presente');

  // --- via i vecchi ---
  var vecchi = ScriptApp.getProjectTriggers();
  dì('');
  dì('── tolti ──');
  if (!vecchi.length) dì('  (non ce n\'erano)');
  for (var i = 0; i < vecchi.length; i++) {
    dì('  ' + vecchi[i].getHandlerFunction());
    ScriptApp.deleteTrigger(vecchi[i]);
  }

  // --- i due nuovi ---
  ScriptApp.newTrigger('teOnEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('teSweep').timeBased().everyMinutes(1).create();
  dì('');
  dì('── messi ──');
  dì('  teOnEdit  — a ogni modifica');
  dì('  teSweep   — ogni minuto');

  // --- il nome magico è ancora in giro? ---
  dì('');
  var magico = false;
  try { magico = (typeof onEdit === 'function'); } catch (e) {}
  if (magico) {
    dì('⚠️⚠️  ATTENZIONE: nel progetto c\'è ancora una funzione chiamata `onEdit`.');
    dì('   Google le fa partire un trigger semplice da sola, quindi il codice');
    dì('   vecchio continua a girare in parallelo a questo — ed è esattamente');
    dì('   il guasto che stiamo togliendo.');
    dì('   RINOMINALA in `onEdit_VECCHIO` e rilancia `teSetup`.');
  } else {
    dì('✓ nessuna funzione `onEdit`: niente trigger semplice, una esecuzione sola');
  }

  Logger.log(righe.join('\n'));
  return righe.join('\n');
}


/** Come sta questo foglio adesso. Sola lettura. */
function teStato() {
  var righe = [];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  righe.push('FOGLIO: ' + ss.getName());

  var t = ScriptApp.getProjectTriggers();
  righe.push('trigger: ' + (t.length ? t.map(function (x) {
    return x.getHandlerFunction();
  }).join(', ') : 'NESSUNO'));

  var magico = false;
  try { magico = (typeof onEdit === 'function'); } catch (e) {}
  righe.push('funzione `onEdit` ancora presente: ' + (magico ? 'SÌ ⚠️' : 'no'));

  var lib = 'no';
  try { if (typeof TransferLib !== 'undefined') lib = 'sì'; } catch (e) {}
  righe.push('TransferLib: ' + lib);

  Logger.log(righe.join('\n'));
  return righe.join('\n');
}
