// =====================================================================
// Banco offline — la corsa sull'Id fra i tre onEdit
// =====================================================================
//
// DA DOVE VIENE. La diagnosi di Pietra Blu, 18/08 16:35:
//
//     ── TRIGGER INSTALLATI ──
//       onEdit_completo  —  ON_EDIT
//       onEdit           —  ON_EDIT
//     libreria TransferLib importata: no
//
// Due trigger installabili, più il trigger semplice `onEdit` che Google fa
// partire da solo perché la funzione si chiama così: **tre esecuzioni per ogni
// modifica**, come si vedeva nella pagina Esecuzioni del 17/08 (24 esecuzioni
// in 37 secondi).
//
// IL DIFETTO CHE QUESTO BANCO DIMOSTRA.
//
// `onEdit` legge la riga — Stato e Id compresi — **prima** di prendere il lock:
//
//     const rangeData = sheet.getRange(...).getValues();   // <-- legge qui
//     ...
//     const queueLock = LockService.getScriptLock();
//     queueLock.waitLock(10000);                           // <-- si sincronizza qui
//
// Il lock quindi non protegge niente: quando la seconda esecuzione entra, ha
// già in mano una fotografia vecchia della riga. Se la cella Id era vuota in
// quella fotografia, si conia un Id nuovo e **si sovrascrive quello appena
// scritto dall'altra**. Risultato: l'Id che è finito in coda non esiste più
// nella colonna Id del foglio, e un minuto dopo lo sweeper dice
//
//     Id TR-… non trovato nella colonna Id di Pietra Blu — non mando niente
//
// che è l'errore più frequente di tutta la coda. Il transfer non parte, e
// nessuno lo sa.
//
// E COMBACIA CON QUELLO CHE VEDE AGOSTINO. La prima volta — riga nuova, cella
// Id vuota — le tre esecuzioni si accavallano e si rubano l'Id. La seconda
// volta, quando rimette `Pronto` a mano, l'Id nella cella **c'è già**: nessuno
// lo conia, nessuna corsa, il transfer parte. «Lo rimetto io e arriva.»
//
//   node banchi/te/banco-corsa-id.js

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------
// Finto ambiente, con il diario di TUTTO quello che succede e in che ordine.
// L'ordine è il punto: è lì che si vede il difetto.
// ---------------------------------------------------------------------
const diario = [];
let idProgressivo = 0;

function Ambiente(foglioCondiviso, coda, etichetta) {
  const nota = (t) => diario.push(etichetta + ': ' + t);

  const Intervallo = (r, c, nr, nc) => ({
    getValues() {
      nota('legge righe ' + r + '-' + (r + (nr || 1) - 1) + ' colonne ' + c + '-' + (c + (nc || 1) - 1));
      const out = [];
      for (let i = 0; i < (nr || 1); i++) {
        const riga = [];
        for (let j = 0; j < (nc || 1); j++) riga.push(foglioCondiviso.get((r + i) + ',' + (c + j)) || '');
        out.push(riga);
      }
      return out;
    },
    setValue(v) {
      nota('SCRIVE in colonna ' + c + ': ' + v);
      foglioCondiviso.set(r + ',' + c, v);
      return this;
    },
    getSheet: () => Foglio,
    // Senza questi quattro `onEdit` muore alla prima riga e il suo `catch`
    // se lo mangia in silenzio — che è poi lo stesso motivo per cui in
    // produzione i guasti non si vedono.
    getRow: () => r,
    getColumn: () => c,
    getNumRows: () => (nr || 1),
    getNumColumns: () => (nc || 1),
  });

  const Foglio = {
    getName: () => 'Prenotazioni',
    getLastRow: () => 400,
    getRange: (r, c, nr, nc) => Intervallo(r, c, nr, nc),
    getColumn: () => 22,
  };

  const Queue = {
    getSheetByName: () => ({
      appendRow(r) { nota('ACCODA Id ' + r[6] + ' per riga ' + r[7]); coda.push(r); },
      getDataRange: () => ({ getValues: () => [['h']].concat(coda) }),
    }),
  };

  return {
    SpreadsheetApp: {
      openById: () => Queue,
      flush: () => {},
    },
    LockService: {
      getScriptLock: () => ({
        waitLock() { nota('prende il LOCK'); },
        releaseLock() { nota('rilascia il lock'); },
      }),
    },
    Utilities: { getUuid: () => 'uuid-' + (++idProgressivo) },
    Logger: { log: () => {} },
    Foglio: Foglio,
  };
}

// ---------------------------------------------------------------------
// Carica il codice VERO di `onEdit`
// ---------------------------------------------------------------------
const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'apps-script', 'struttura-onedit.gs'), 'utf8');

function caricaOnEdit(amb) {
  const box = {};
  new Function('exports', 'SpreadsheetApp', 'LockService', 'Utilities', 'Logger', 'console',
    SRC + '\nexports.onEdit = onEdit;')(
    box, amb.SpreadsheetApp, amb.LockService, amb.Utilities, amb.Logger,
    { error: () => {} });
  return box.onEdit;
}

let ko = 0;
function prova(nome, atteso, effettivo) {
  const a = JSON.stringify(atteso), e = JSON.stringify(effettivo);
  const ok = a === e;
  if (!ok) ko++;
  console.log(`${ok ? '  ok  ' : '  KO  '} ${nome}`);
  if (!ok) console.log(`        atteso:   ${a}\n        ottenuto: ${e}`);
}

console.log('== Banco: la corsa sull\'Id fra i tre onEdit ==\n');

// ---------------------------------------------------------------------
// (1) Il difetto strutturale: si legge PRIMA di prendere il lock.
// ---------------------------------------------------------------------
console.log('-- il lock non protegge la lettura --');

const foglio = new Map();
foglio.set('255,22', 'Pronto');      // V — Stato
foglio.set('255,24', '');            // X — Id, vuoto: riga nuova
foglio.set('255,9', 'Pietra Blu');   // I — Fornitore
const coda = [];

diario.length = 0;
const ambA = Ambiente(foglio, coda, 'A');
caricaOnEdit(ambA)({
  range: ambA.Foglio.getRange(255, 22, 1, 1),
  source: { getId: () => 'sheet-pietrablu', getName: () => 'Pietra Blu' },
});

const iLettura = diario.findIndex(r => r.indexOf('legge righe 255-255 colonne 22') !== -1);
const iLock = diario.findIndex(r => r.indexOf('prende il LOCK') !== -1);
prova('la riga viene letta prima del lock', true, iLettura !== -1 && iLock !== -1 && iLettura < iLock);
console.log('        ordine reale: ' + diario.slice(0, 4).join('  →  '));

// ---------------------------------------------------------------------
// (2) Due esecuzioni sulla stessa riga nuova: la seconda ruba l'Id.
// ---------------------------------------------------------------------
console.log('\n-- due esecuzioni sulla stessa riga nuova (Id vuoto) --');

const foglio2 = new Map();
foglio2.set('255,22', 'Pronto');
foglio2.set('255,24', '');
foglio2.set('255,9', 'Pietra Blu');
const coda2 = [];
idProgressivo = 0;

// Le due esecuzioni partono insieme, quindi fotografano la riga tutte e due
// quando l'Id è ancora vuoto. Si riproduce chiamandole una dopo l'altra su un
// foglio in cui la prima ha già scritto: se il codice rileggesse dentro il
// lock, la seconda vedrebbe l'Id e non ne conierebbe un altro.
const ambB = Ambiente(foglio2, coda2, 'B');
const ambC = Ambiente(foglio2, coda2, 'C');
const evento = (amb) => ({
  range: amb.Foglio.getRange(255, 22, 1, 1),
  source: { getId: () => 'sheet-pietrablu', getName: () => 'Pietra Blu' },
});

caricaOnEdit(ambB)(evento(ambB));
const idDopoB = foglio2.get('255,24');
const idInCodaB = coda2[0] && coda2[0][6];

// C parte con la stessa fotografia di B — Id vuoto — perché l'ha letta prima
// che B scrivesse. Lo si riproduce rimettendo la cella com'era in quel momento.
foglio2.set('255,24', '');
caricaOnEdit(ambC)(evento(ambC));
const idDopoC = foglio2.get('255,24');
const idInCodaC = coda2[1] && coda2[1][6];

prova('B e C hanno coniato due Id DIVERSI', true, idInCodaB !== idInCodaC);
prova('nella cella è rimasto solo quello di C', idDopoC, foglio2.get('255,24'));
prova('l\'Id che B ha messo in coda NON è più nel foglio', false, idInCodaB === foglio2.get('255,24'));
console.log('        B ha accodato: ' + idInCodaB);
console.log('        C ha accodato: ' + idInCodaC + '   ← e solo questo è nella cella');

// Ed ecco l'errore che ne esce, quello vero della coda.
const idColonna = [foglio2.get('255,24')];
const trovato = idColonna.indexOf(idInCodaB) !== -1;
prova('lo sweeper cercherà l\'Id di B e non lo troverà', false, trovato);
console.log('        → «Id ' + idInCodaB + ' non trovato nella colonna Id di Pietra Blu»');

// ---------------------------------------------------------------------
// (3) La seconda volta, a mano, funziona. Ed è quello che vede Agostino.
// ---------------------------------------------------------------------
console.log('\n-- la seconda volta, con l\'Id già nella cella --');

const foglio3 = new Map();
foglio3.set('255,22', 'Pronto');
foglio3.set('255,24', 'TR-20260818-esistente');   // l'Id c'è già
foglio3.set('255,9', 'Pietra Blu');
const coda3 = [];

const ambD = Ambiente(foglio3, coda3, 'D');
const ambE = Ambiente(foglio3, coda3, 'E');
caricaOnEdit(ambD)(evento(ambD));
caricaOnEdit(ambE)(evento(ambE));

prova('nessuno conia un Id nuovo', 'TR-20260818-esistente', foglio3.get('255,24'));
prova('tutte le righe di coda portano l\'Id giusto', true,
  coda3.every(r => r[6] === 'TR-20260818-esistente'));
console.log('        → il transfer parte. «Lo rimetto io e arriva.»');

console.log([
  '',
  '─────────────────────────────────────────────────────────────────────',
  'LA CORREZIONE, quando si decide di farla: rileggere Stato e Id DENTRO il',
  'lock, non prima. Tre righe spostate. Più togliere il trigger doppio, così',
  'le esecuzioni per modifica tornano da tre a una.',
  '',
  'Su Pietra Blu non c\'è nessuna rete di sicurezza a rimediare: la diagnosi',
  'dice che sweepCheck non è installato e TransferLib non è importata.',
  '─────────────────────────────────────────────────────────────────────',
].join('\n'));

console.log(`\n${ko} prove rosse.`);
process.exit(ko > 0 ? 1 : 0);
