// =====================================================================
// Banco offline — `enqueueFromEdit`, la parte che accoda spostata in libreria
// =====================================================================
//
// Fa girare il codice VERO di `apps-script/TransferLib.gs` +
// `apps-script/transferlib-accoda.gs` contro un finto Google, e verifica che
// i quattro guasti di questi due giorni siano chiusi:
//
//   1. la corsa sull'Id fra esecuzioni concorrenti
//   2. il trigger triplo (qui: che si legga dentro il lock, non prima)
//   3. il `catch` che ingoia i guasti
//   4. le colonne per numero fisso
//
// Il caso di controllo è vero: Pietra Blu riga 255 di stamattina, Costa Maria,
// dal `rowValues` dell'esecuzione n8n 754716. Deve passare.
//
//   node banchi/te/banco-accoda.js

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------
// Finto Google
// ---------------------------------------------------------------------
const diario = [];
let contatoreUuid = 0;

function FintoFoglio(intestazioni, righe) {
  const celle = new Map();          // "r,c" -> valore
  const note = new Map();
  const sfondi = new Map();
  const k = (r, c) => r + ',' + c;

  intestazioni.forEach((h, i) => celle.set(k(1, i + 1), h));
  Object.keys(righe || {}).forEach(function (r) {
    righe[r].forEach((v, i) => { if (v !== undefined) celle.set(k(+r, i + 1), v); });
  });

  const api = {
    _celle: celle, _note: note, _sfondi: sfondi,
    getName: () => 'Prenotazioni',
    getLastRow: () => 400,
    getLastColumn: () => intestazioni.length,
    getRange(r, c, nr, nc) {
      nr = nr === undefined ? 1 : nr; nc = nc === undefined ? 1 : nc;
      return {
        getRow: () => r, getColumn: () => c,
        getNumRows: () => nr, getNumColumns: () => nc,
        getSheet: () => api,
        getValue: () => celle.get(k(r, c)) || '',
        setValue(v) { diario.push('SCRIVE r' + r + 'c' + c + ' = ' + v); celle.set(k(r, c), v); return this; },
        getValues() {
          diario.push('LEGGE r' + r + '-' + (r + nr - 1) + ' c' + c + '-' + (c + nc - 1));
          const out = [];
          for (let i = 0; i < nr; i++) {
            const riga = [];
            for (let j = 0; j < nc; j++) riga.push(celle.has(k(r + i, c + j)) ? celle.get(k(r + i, c + j)) : '');
            out.push(riga);
          }
          return out;
        },
        getNote: () => note.get(k(r, c)) || null,
        setNote(v) { if (v === null) note.delete(k(r, c)); else note.set(k(r, c), v); return this; },
        setBackground(v) { if (v === null) sfondi.delete(k(r, c)); else sfondi.set(k(r, c), v); return this; },
      };
    },
  };
  return api;
}

function ambiente(foglio, coda) {
  const Queue = {
    appendRow(r) { diario.push('ACCODA ' + r[6] + ' riga ' + r[7]); coda.push(r); },
    getDataRange: () => ({
      getValues: () => [['FileName', 'SpreadsheetId', 'Status', 'LastUpdate', 'Attempts', 'Error', 'TransferId', 'RowNumber', 'Fornitore']].concat(coda),
    }),
  };
  return {
    SpreadsheetApp: {
      openById: () => ({ getSheetByName: () => Queue }),
      getActiveSpreadsheet: () => foglio,
      flush: () => {},
    },
    LockService: { getScriptLock: () => ({
      waitLock() { diario.push('LOCK preso'); },
      tryLock() { diario.push('LOCK preso'); return true; },
      releaseLock() { diario.push('lock rilasciato'); },
    }) },
    Utilities: { getUuid: () => 'uuid' + (++contatoreUuid) },
    Logger: { log: (t) => diario.push('log: ' + String(t).slice(0, 60)) },
  };
}

// ---------------------------------------------------------------------
// Carica il codice vero: libreria + pezzo nuovo
// ---------------------------------------------------------------------
const SRC_LIB = fs.readFileSync(path.join(__dirname, '..', '..', 'apps-script', 'TransferLib.gs'), 'utf8');
const SRC_NEW = fs.readFileSync(path.join(__dirname, '..', '..', 'apps-script', 'transferlib-accoda.gs'), 'utf8');

function carica(amb) {
  const box = {};
  new Function('exports', 'SpreadsheetApp', 'LockService', 'Utilities', 'Logger',
    SRC_LIB + '\n' + SRC_NEW + `
exports.enqueueFromEdit = enqueueFromEdit;
exports.motiviBlocco    = motiviBlocco;
exports.buildColMap     = buildColMap;
`)(box, amb.SpreadsheetApp, amb.LockService, amb.Utilities, amb.Logger);
  return box;
}

let ko = 0;
function prova(nome, atteso, effettivo) {
  const a = JSON.stringify(atteso), e = JSON.stringify(effettivo);
  const ok = a === e;
  if (!ok) ko++;
  console.log(`${ok ? '  ok  ' : '  KO  '} ${nome}`);
  if (!ok) console.log(`        atteso:   ${a}\n        ottenuto: ${e}`);
}

// Intestazioni vere di Pietra Blu (da Smart Write Struttura, esec. 729828).
const H = ['Mese', 'Note', 'Data', 'Time', 'TRS> DA', 'TRS <PER', 'PAX', 'Nome', 'Fornitore',
  'Volo', 'cell.', 'Autista', 'Veicolo', 'h extra/ritardi', 'Tariffa a noi', 'Tariffa ',
  'Fee', 'Modalità', 'Tipologia incasso', 'n. pratica', 'Addebitato', 'Stato', 'Eseguito', 'Id'];

// Riga 255 vera: Costa Maria, 18/08 08:25, Pietra Blu → Polignano.
function riga255(cambi) {
  const r = ['mar 18 agosto 2026', 'PAlla stazione di polignano', '18/08/2026', '08:25',
    'Pietra Blu', 'Polignano a Mare', 2, 'Costa Maria', 'Pietra Blu', '', '41792398885',
    '', '', '', 30, 30, 0, 'Incassare',
    'Incassa PREZZO PIENO (commissione: alla struttura)', '', false, 'Pronto', 'Da svolgere', ''];
  Object.keys(cambi || {}).forEach(i => { r[i] = cambi[i]; });
  return r;
}
const modifica = (foglio, r) => ({
  range: foglio.getRange(r, 22, 1, 1),
  source: { getId: () => 'sheet-pietrablu', getName: () => 'Pietra Blu' },
});

console.log('== Banco: enqueueFromEdit ==\n');

// ---------------------------------------------------------------------
console.log('-- (1) si legge DENTRO il lock: la corsa sull\'Id è chiusa --');

let foglio = FintoFoglio(H, { 255: riga255() });
let coda = [];
diario.length = 0;
let lib = carica(ambiente(foglio, coda));
lib.enqueueFromEdit(modifica(foglio, 255));

const iLock = diario.indexOf('LOCK preso');
const iLetturaRiga = diario.findIndex(x => x.indexOf('LEGGE r255-255') !== -1);
prova('il lock viene preso PRIMA di leggere la riga', true, iLock !== -1 && iLetturaRiga > iLock);
prova('la riga è stata accodata', 1, coda.length);
const idPrimo = coda[0] && coda[0][6];
prova('l\'Id coniato è finito nella cella', idPrimo, foglio._celle.get('255,24'));

// Seconda esecuzione sulla stessa riga, com'era ieri con i tre trigger.
diario.length = 0;
carica(ambiente(foglio, coda)).enqueueFromEdit(modifica(foglio, 255));
prova('la seconda esecuzione NON conia un secondo Id', idPrimo, foglio._celle.get('255,24'));
prova('e non accoda un doppione: l\'Id è già aperto in coda', 1, coda.length);

// ---------------------------------------------------------------------
console.log('\n-- (2) le colonne si risolvono per NOME, non per numero --');

// Una struttura infila una colonna in mezzo: tutto slitta di uno.
const Hspostate = H.slice(0, 3).concat(['Colonna nuova'], H.slice(3));
const rigaSpostata = riga255().slice(0, 3).concat([''], riga255().slice(3));
const foglioS = FintoFoglio(Hspostate, { 10: rigaSpostata });
const codaS = [];
const libS = carica(ambiente(foglioS, codaS));
const mS = libS.buildColMap(Hspostate);
prova('Stato trovato alla 23 (era la 22)', 23, mS.col.stato);
prova('Id trovato alla 25 (era la 24)', 25, mS.col.id);
libS.enqueueFromEdit({
  range: foglioS.getRange(10, 23, 1, 1),
  source: { getId: () => 'x', getName: () => 'Struttura spostata' },
});
prova('accoda lo stesso, senza leggere la cella sbagliata', 1, codaS.length);

// ---------------------------------------------------------------------
console.log('\n-- (3) GUARD PRONTO: blocca, ma lasciando detto perché --');

const casi = [
  ['senza Fornitore',  { 8: '' },                        ['Fornitore']],
  ['senza Modalità',   { 17: '', 18: '' },               ['Modalita/Pagamento']],
  ['tariffa a 0',      { 15: 0 },                        ['Tariffa a 0']],
  ['tariffa 0 ma di cortesia', { 15: 0, 1: 'Complimentary shuttle' }, []],
];
casi.forEach(function (c) {
  const f = FintoFoglio(H, { 30: riga255(c[1]) });
  const q = [];
  const l = carica(ambiente(f, q));
  prova('motivi — ' + c[0], c[2], l.motiviBlocco(riga255(c[1]), l.buildColMap(H).col));
  l.enqueueFromEdit(modifica(f, 30));
  if (c[2].length) {
    prova('   → non accodata', 0, q.length);
    prova('   → Stato svuotato', '', f._celle.get('30,22'));
    prova('   → nota sulla cella', true, (f._note.get('30,22') || '').indexOf('manca') !== -1);
  } else {
    prova('   → accodata', 1, q.length);
  }
});

// ---------------------------------------------------------------------
console.log('\n-- (4) tipologia incasso mancante: SEGNALA, non blocca --');
// Era la guardia che su Pietra Blu cancellava lo Stato e faceva sparire i transfer.

const fT = FintoFoglio(H, { 40: riga255({ 18: '' }) });   // Incassare, tipologia vuota
const qT = [];
carica(ambiente(fT, qT)).enqueueFromEdit(modifica(fT, 40));
prova('lo Stato NON viene cancellato', 'Pronto', fT._celle.get('40,22'));
prova('il transfer parte lo stesso', 1, qT.length);
prova('ma la nota lo dice', true, (fT._note.get('40,22') || '').indexOf('Tipologia incasso') !== -1);

// ---------------------------------------------------------------------
console.log('\n-- (5) i guasti non si ingoiano più --');

const fE = FintoFoglio(H, { 50: riga255() });
const ambRotto = ambiente(fE, []);
ambRotto.SpreadsheetApp.openById = () => { throw new Error('Strutture irraggiungibile'); };
carica(ambRotto).enqueueFromEdit(modifica(fE, 50));
prova('resta scritto sulla cella, non solo nel log',
  true, (fE._note.get('50,22') || '').indexOf('non è riuscito') !== -1);

// ---------------------------------------------------------------------
console.log('\n-- (6) quello che va lasciato stare --');

[['Confermato', 22], ['Pronto: Pending', 22], ['', 22]].forEach(function (c) {
  const f = FintoFoglio(H, { 60: riga255({ 21: c[0] }) });
  const q = [];
  carica(ambiente(f, q)).enqueueFromEdit(modifica(f, 60));
  prova('«' + c[0] + '» non si accoda', 0, q.length);
});

console.log(`\n${ko} prove rosse.`);
process.exit(ko > 0 ? 1 : 0);
