// =====================================================================
// Banco offline — la rete di sicurezza che ripesca le righe rimaste indietro
// =====================================================================
//
// Prova `apps-script/transferlib-recupero.gs` contro `apps-script/TransferLib.gs`,
// cioè la versione nuova contro quella che gira adesso. Stessi casi, due
// verdetti: si vede in chiaro cosa cambia e cosa no.
//
// IL CASO CHE CONTA è il primo del blocco «cosa cambia»: riga con «Pronto»,
// stesso «Pronto» in Foglio1, scheda mai partita. Oggi la rete la salta per
// sempre — è la riga che Agostino guarda e dice «ma c'è scritto Pronto, perché
// non arriva?». Con la versione nuova riparte.
//
//   node banchi/te/banco-recupero.js

const fs = require('fs');
const path = require('path');

// --- carica le due versioni ------------------------------------------
// Del vecchio serve solo la regola di scarto, che è tre righe dentro il ciclo:
// la riscrivo qui identica invece di far girare tutta la funzione, che vuole
// SpreadsheetApp e LockService. È l'unico punto di questo banco che non è
// codice di produzione, ed è copiato riga per riga da `TransferLib.gs`.
const VALID_STATES = ["Pronto", "Modificato", "Cancellato"];

function vecchiaRegola(riga, storia, f1Stato) {
  const stato = (riga.stato || '').trim();
  const id = (riga.id || '').trim();
  if (!VALID_STATES.includes(stato)) return 'salta';
  if (!id) return 'salta';                          // buco 1
  if (storia.aperte > 0) return 'salta';
  if (f1Stato === stato) return 'salta';            // buco 2
  return 'manda';
}

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'apps-script', 'transferlib-recupero.gs'), 'utf8');
const N = {};
new Function('exports', 'VALID_STATES', SRC + `
exports.teDecidiRecupero_ = teDecidiRecupero_;
exports.teStoriaCoda_     = teStoriaCoda_;
exports.TE_RECUPERO_MAX   = TE_RECUPERO_MAX;
exports.TE_RECUPERO_ATTESA_MS = TE_RECUPERO_ATTESA_MS;
`)(N, VALID_STATES);

let ko = 0;
function prova(nome, atteso, effettivo) {
  const a = JSON.stringify(atteso), e = JSON.stringify(effettivo);
  const ok = a === e;
  if (!ok) ko++;
  console.log(`${ok ? '  ok  ' : '  KO  '} ${nome}`);
  if (!ok) console.log(`        atteso:   ${a}\n        ottenuto: ${e}`);
}

const ADESSO = 1787000000000;                 // istante fisso: niente orologio
const MAI = { aperte: 0, totali: 0, ultimaMs: null };
const nuova = (riga, storia) => N.teDecidiRecupero_(riga, storia || MAI, ADESSO).azione;

console.log('== Banco: recupero delle righe rimaste indietro ==\n');

// ---------------------------------------------------------------------
console.log('-- COSA CAMBIA (oggi si perde, domani no) --');

// IL caso. Pronto di qua, Pronto anche in Foglio1, scheda mai partita.
const rimasta = { stato: 'Pronto', id: 'TR-20260818-aaa' };
prova('Pronto mai partito, ma «in sync» con Foglio1 → oggi SALTA',
  'salta', vecchiaRegola(rimasta, MAI, 'Pronto'));
prova('   … con la versione nuova → MANDA',
  'manda', nuova(rimasta));

// Riga con lo Stato messo e la cella Id vuota: onEdit è saltato.
const senzaId = { stato: 'Pronto', id: '' };
prova('Pronto senza Id → oggi SALTA (per sempre)',
  'salta', vecchiaRegola(senzaId, MAI, ''));
prova('   … con la versione nuova → MANDA, e genera l\'Id',
  'manda', nuova(senzaId));
prova('   … e lo dichiara: generaId',
  true, N.teDecidiRecupero_(senzaId, MAI, ADESSO).generaId);

// Cancellazione mai propagata: stesso buco, conseguenza peggiore.
prova('Cancellato mai partito, «in sync» → oggi SALTA',
  'salta', vecchiaRegola({ stato: 'Cancellato', id: 'TR-x' }, MAI, 'Cancellato'));
prova('   … con la versione nuova → MANDA',
  'manda', nuova({ stato: 'Cancellato', id: 'TR-x' }));

// ---------------------------------------------------------------------
console.log('\n-- COSA NON CAMBIA: quello che va lasciato stare --');

prova('«Pronto: Pending» — n8n ce l\'ha in mano',
  'salta', nuova({ stato: 'Pronto: Pending', id: 'TR-b' }));
prova('«Confermato» — chiusa (è la riga 255 di Pietra Blu di stamattina)',
  'salta', nuova({ stato: 'Confermato', id: 'TR-20260818-79c69fc8' }));
prova('cella vuota — è la riga 69 di 6 Stelle Mama, non una richiesta',
  'salta', nuova({ stato: '', id: 'TR-c' }));
prova('«In attesa approvazione»',
  'salta', nuova({ stato: 'In attesa approvazione', id: 'TR-d' }));
prova('già PENDING in coda — non si accoda due volte',
  'salta', nuova({ stato: 'Pronto', id: 'TR-e' }, { aperte: 1, totali: 1, ultimaMs: null }));
prova('già SENT in coda — sta aspettando l\'ack',
  'salta', nuova({ stato: 'Pronto', id: 'TR-f' }, { aperte: 1, totali: 3, ultimaMs: ADESSO - 60000 }));

// ---------------------------------------------------------------------
console.log('\n-- LE FRENATE: rimandare sempre sarebbe una valanga --');

prova('scartata 30 secondi fa → aspetto',
  'salta', nuova({ stato: 'Pronto', id: 'TR-g' }, { aperte: 0, totali: 1, ultimaMs: ADESSO - 30000 }));
prova('scartata 10 minuti fa → riprovo',
  'manda', nuova({ stato: 'Pronto', id: 'TR-h' }, { aperte: 0, totali: 1, ultimaMs: ADESSO - 600000 }));
prova('al quinto tentativo a vuoto → GRIDA, non ritenta all\'infinito',
  'grida', nuova({ stato: 'Pronto', id: 'TR-i' }, { aperte: 0, totali: 5, ultimaMs: ADESSO - 600000 }));
prova('   e il motivo dice quanti tentativi',
  true, N.teDecidiRecupero_({ stato: 'Pronto', id: 'TR-i' },
    { aperte: 0, totali: 5, ultimaMs: ADESSO - 600000 }, ADESSO).motivo.indexOf('5 tentativi') !== -1);
prova('quattro tentativi: ci prova ancora',
  'manda', nuova({ stato: 'Pronto', id: 'TR-l' }, { aperte: 0, totali: 4, ultimaMs: ADESSO - 600000 }));

// ---------------------------------------------------------------------
console.log('\n-- il riassunto della coda, sui dati veri di ieri --');

// Righe copiate dal dump della Queue: riga 253 di Pietra Blu, due tentativi,
// uno ERROR alle 18:45 e uno IGNORATO alle 22:27.
const T1 = new Date('2026-08-17T18:45:40').getTime();
const T2 = new Date('2026-08-17T22:27:32').getTime();
const st = N.teStoriaCoda_([
  ['FileName', 'SpreadsheetId', 'Status', 'LastUpdate', 'Attempts', 'Error', 'TransferId', 'RowNumber', 'Fornitore'],
  ['Pietra Blu', 'x', 'ERROR',    new Date(T1), 0, 'Id non trovato', 'TR-20260817-f79f6c63', 253, 'Pietra Blu'],
  ['Pietra Blu', 'x', 'IGNORATO', new Date(T2), '', 'Confermato',    'TR-20260817-120660ed', 253, 'Pietra Blu'],
  ['Pietra Blu', 'x', 'PENDING',  new Date(T2), 0, '',               'TR-20260817-aperta',   254, 'Pietra Blu'],
  ['Pietra Blu', 'x', '',         '',           '', '',              '',                     255, 'Pietra Blu'],
]);
prova('conta i tentativi per Id', 1, st['TR-20260817-f79f6c63'].totali);
prova('nessuna riga aperta per un ERROR', 0, st['TR-20260817-f79f6c63'].aperte);
prova('una PENDING conta come aperta', 1, st['TR-20260817-aperta'].aperte);
prova('tiene l\'orario dell\'ultimo tentativo', T1, st['TR-20260817-f79f6c63'].ultimaMs);
prova('le righe di coda senza Id non entrano nel riassunto', undefined, st['']);

console.log(`
─────────────────────────────────────────────────────────────────────
Frenate impostate: aspetta ${N.TE_RECUPERO_ATTESA_MS / 60000} minuti fra un tentativo e l'altro,
e dopo ${N.TE_RECUPERO_MAX} tentativi a vuoto grida invece di ritentare.

🔴 TransferLib gira a Head: appena salvi è viva su tutti e diciotto i fogli.
Verde qui non vuol dire pubblicata.
─────────────────────────────────────────────────────────────────────`);

console.log(`\n${ko} prove rosse.`);
process.exit(ko > 0 ? 1 : 0);
