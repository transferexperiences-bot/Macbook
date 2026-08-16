// Banco offline per apps-script/TransferLib.gs.
// Il file, a livello alto, ha solo costanti e dichiarazioni di funzione:
// SpreadsheetApp è toccato solo dentro i corpi, quindi si carica tutto.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'apps-script', 'TransferLib.gs'), 'utf8');

const sandbox = {};
new Function('exports', SRC + `
exports.buildColMap        = buildColMap;
exports.normHeader         = normHeader;
exports.normalizeOra       = normalizeOra;
exports.normalizeTelefono  = normalizeTelefono;
exports.LEGACY_COL         = LEGACY_COL;
exports.VALID_STATES       = VALID_STATES;
`)(sandbox);

const { buildColMap, normalizeOra, normalizeTelefono } = sandbox;

const H_SUITE10 = [
  'Mese', 'Note', 'Data', 'Time', 'TRS> DA', 'TRS <PER', 'PAX', 'Nome', 'Fornitore',
  'Volo', 'cell.', 'Autista', 'Veicolo', 'h extra/ritardi', 'Tariffa a noi', 'Tariffa ',
  'Fee', 'Modalità', 'Tipologia incasso', 'mail', 'Addebitato', 'Stato', 'Eseguito',
  'Id', 'Cell. driver', 'Assigned Car',
];

let ko = 0;
function prova(nome, atteso, effettivo) {
  const a = JSON.stringify(atteso), e = JSON.stringify(effettivo);
  const ok = a === e;
  if (!ok) ko++;
  console.log(`${ok ? '  ok  ' : '  KO  '} ${nome}`);
  if (!ok) console.log(`        atteso:   ${a}\n        ottenuto: ${e}`);
}

console.log('== Banco: TransferLib v2 ==\n');

// --- colonne per nome ---
{
  const { col, warnings } = buildColMap(H_SUITE10);
  prova('Suite 10 — ora (Time) = 4', 4, col.ora);
  prova('Suite 10 — telefono (cell.) = 11', 11, col.telefono);
  prova('Suite 10 — fornitore = 9', 9, col.fornitore);
  prova('Suite 10 — stato = 22', 22, col.stato);
  prova('Suite 10 — id = 24', 24, col.id);
  prova('Suite 10 — nessun avviso', [], warnings);
}
{
  // I numeri della v1 tornano su questo file: la v2 non cambia comportamento qui.
  const { col } = buildColMap(H_SUITE10);
  prova('v2 identica alla v1 sui file di oggi', sandbox.LEGACY_COL, col);
}
{
  // Il caso che la v1 sbaglierebbe in silenzio.
  const h = H_SUITE10.slice();
  h.splice(2, 0, 'Colonna nuova');
  const { col, warnings } = buildColMap(h);
  prova('colonna inserita — stato segue a 23', 23, col.stato);
  prova('colonna inserita — id segue a 25', 25, col.id);
  prova('colonna inserita — telefono segue a 12', 12, col.telefono);
  prova('colonna inserita — nessun avviso', [], warnings);
}
{
  const h = H_SUITE10.slice();
  h[23] = 'Codice';   // Id rinominato
  const { col, warnings } = buildColMap(h);
  prova('Id rinominato — ripiega sul 24 della v1', 24, col.id);
  prova('Id rinominato — lo dice', ['id'], warnings);
}
{
  const { col } = buildColMap(['ID ', ' STATO', 'ora']);
  prova('intestazioni sporche — id = 1', 1, col.id);
  prova('intestazioni sporche — stato = 2', 2, col.stato);
  prova('intestazioni sporche — ora = 3', 3, col.ora);
}

// --- normalizzazione Ora (comportamento invariato: nessuna regressione) ---
prova('ora "9" → 09:00', '09:00', normalizeOra('9'));
prova('ora "21" → 21:00', '21:00', normalizeOra('21'));
prova('ora "830" → 08:30', '08:30', normalizeOra('830'));
prova('ora "1430" → 14:30', '14:30', normalizeOra('1430'));
prova('ora "9.30" → 09:30', '09:30', normalizeOra('9.30'));
prova('ora "21,15" → 21:15', '21:15', normalizeOra('21,15'));
prova('ora "21:00" già giusta → null', null, normalizeOra('21:00'));
prova('ora "" → null', null, normalizeOra(''));
prova('ora "abc" → null', null, normalizeOra('abc'));
prova('ora "25" fuori scala → null', null, normalizeOra('25'));
prova('ora "9:5" → 09:05', '09:05', normalizeOra('9:5'));
// Difetto della v1 trovato da questo banco: il controllo "già giusto" girava
// sulla stringa dopo la sostituzione, quindi la virgola non veniva mai corretta.
prova('ora "10.30" → 10:30 (v1 lasciava 10.30)', '10:30', normalizeOra('10.30'));
prova('ora "18,45" → 18:45 (v1 lasciava 18,45)', '18:45', normalizeOra('18,45'));
prova('ora "07:20" già giusta → null', null, normalizeOra('07:20'));

// --- normalizzazione Telefono ---
prova('tel "39 346 5389493"', '393465389493', normalizeTelefono('39 346 5389493'));
prova('tel "+39 346 5389493"', '+393465389493', normalizeTelefono('+39 346 5389493'));
prova('tel "(346) 538-9493"', '3465389493', normalizeTelefono('(346) 538-9493'));
prova('tel già pulito → null', null, normalizeTelefono('393465389493'));
prova('tel "abc" → null', null, normalizeTelefono('abc'));
prova('tel troppo corto → null', null, normalizeTelefono('12345'));

// --- stati che fanno scattare la coda ---
prova('stati validi invariati', ['Pronto', 'Modificato', 'Cancellato'], sandbox.VALID_STATES);

console.log(`\n${ko === 0 ? 'Tutte le prove passano.' : ko + ' prove FALLITE.'}`);
process.exit(ko === 0 ? 0 : 1);
