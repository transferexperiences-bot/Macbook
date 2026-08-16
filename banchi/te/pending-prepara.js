// === Pending Transfer — scrittura per NUMERO DI RIGA (non per Id) ===
// Perché: su una riga NUOVA l'Id non è ancora sul foglio struttura, quindi
// l'update per Id non trovava nulla e non scriveva niente. La struttura
// rimandava tutto e nascevano i doppioni.
// Prova: esecuzioni 742784 (16:47) e 742805 (16:50) del 16/08, stesso Id
// TR-20260815-260bb7e5-e32a-4869-9f43-7b9a49348b4d, riga 134 Suite 10/Giovì.
// La riga vera arriva da Apps Script come body.riga -> rowIndex (intestazione
// compresa): stesso numero che usa Smart Write Struttura
// (prova: rowIndex 243 = targetRow 243, esecuzioni 729824/729828).

const src = $('Code - Build ID + Telegram1').item.json;
const sheetId = src.spreadsheetId;
const sheetName = src.sheetName;
const rowIndex = Number(src.rowIndex);
const stato = `${(src.transfer || {}).stato || ''}: Pending`;
const id = ((src.transfer || {}).id || '').toString().trim();

function fail(reason) {
  return [{ json: { skip: true, reason, sheetId, sheetName, rowIndex, data: [] } }];
}

const headerRow = ($json && $json.values && $json.values[0]) || null;
if (!Array.isArray(headerRow) || !headerRow.length) return fail('Intestazioni del foglio struttura non leggibili');
if (!sheetId || !sheetName) return fail('sheetId o sheetName mancante');
if (!Number.isInteger(rowIndex) || rowIndex < 2) return fail(`riga non valida: ${src.rowIndex}`);
if (!id) return fail('Id mancante');

// 1 -> A, 26 -> Z, 27 -> AA (fogli struttura oltre le 26 colonne esistono)
function colLetter(n) {
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

const norm = (h) => (h === null || h === undefined ? '' : h).toString().trim().toLowerCase();
function findCol(name) {
  const i = headerRow.findIndex((h) => norm(h) === norm(name));
  return i === -1 ? null : colLetter(i + 1);
}

const colStato = findCol('Stato');
const colId = findCol('Id');
if (!colStato || !colId) {
  const mancanti = [!colStato ? 'Stato' : null, !colId ? 'Id' : null].filter(Boolean).join(', ');
  return fail(`colonne mancanti sul foglio struttura: ${mancanti}`);
}

// A1 con nome foglio sempre quotato: i fogli struttura hanno nomi con spazi.
const q = `'${sheetName.replace(/'/g, "''")}'`;

const data = [
  { range: `${q}!${colStato}${rowIndex}`, values: [[stato]] },
  { range: `${q}!${colId}${rowIndex}`, values: [[id]] },
];

return [{ json: { skip: false, sheetId, sheetName, rowIndex, colStato, colId, stato, id, data } }];
