// Banco offline per il nodo "Pending - Prepara scrittura".
// Riproduce l'ambiente n8n ($json, $('nodo')) e rigioca dati veri di esecuzione.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, 'pending-prepara.js'), 'utf8');

function run({ headerRow, buildIdJson }) {
  const $json = headerRow === undefined ? {} : { range: 'x', majorDimension: 'ROWS', values: [headerRow] };
  const $ = (name) => {
    if (name === 'Code - Build ID + Telegram1') return { item: { json: buildIdJson } };
    throw new Error('nodo non previsto dal banco: ' + name);
  };
  const fn = new Function('$json', '$', SRC);
  return fn($json, $);
}

// --- Intestazioni vere del foglio struttura (ricavate da Smart Write Struttura,
// esecuzione 729828: 26 colonne A:Z, Stato = V, Id = X) ---
const HEADER_REALE = [
  'Mese', 'Note', 'Data', 'Time', 'TRS> DA', 'TRS <PER', 'PAX', 'Nome', 'Fornitore',
  'Volo', 'cell.', 'Autista', 'Veicolo', 'h extra/ritardi', 'Tariffa a noi', 'Tariffa',
  'Fee', 'Modalità', 'Tipologia incasso', 'n. pratica', 'Addebitato', 'Stato',
  'Eseguito', 'Id', 'mail', 'col_transfer',
];

// --- Dati veri di Code - Build ID + Telegram1, esecuzione 742784 del 16/08 ---
const BUILD_742784 = {
  spreadsheetId: '1Rv-tlt3m-8YdRA574aBJYY_QZnIlgJgxEEVtK24wXkY',
  sheetName: 'Prenotazioni',
  rowIndex: 134,
  transfer: { stato: 'Pronto', id: 'TR-20260815-260bb7e5-e32a-4869-9f43-7b9a49348b4d' },
};

let ko = 0;
function prova(nome, atteso, effettivo) {
  const a = JSON.stringify(atteso);
  const e = JSON.stringify(effettivo);
  const ok = a === e;
  if (!ok) ko++;
  console.log(`${ok ? '  ok  ' : '  KO  '} ${nome}`);
  if (!ok) console.log(`        atteso:    ${a}\n        ottenuto:  ${e}`);
}

console.log('== Banco: Pending - Prepara scrittura ==\n');

// 1. Caso vero del guasto: riga 134, foglio Suite 10/Giovì
{
  const [{ json }] = run({ headerRow: HEADER_REALE, buildIdJson: BUILD_742784 });
  prova('742784 — non salta', false, json.skip);
  prova('742784 — colonna Stato = V', 'V', json.colStato);
  prova('742784 — colonna Id = X', 'X', json.colId);
  prova('742784 — punta alla riga 134, non cerca per Id', [
    { range: "'Prenotazioni'!V134", values: [['Pronto: Pending']] },
    { range: "'Prenotazioni'!X134", values: [['TR-20260815-260bb7e5-e32a-4869-9f43-7b9a49348b4d']] },
  ], json.data);
}

// 2. Riga NUOVA senza Id sul foglio: è il caso che prima non scriveva nulla.
//    Ora la riga è individuata dal numero, quindi si scrive lo stesso.
{
  const [{ json }] = run({ headerRow: HEADER_REALE, buildIdJson: { ...BUILD_742784, rowIndex: 300 } });
  prova('riga nuova senza Id sul foglio — scrive comunque', false, json.skip);
  prova('riga nuova — riga 300', "'Prenotazioni'!V300", json.data[0].range);
}

// 3. Prova di corrispondenza con Smart Write Struttura (rowIndex 243 = targetRow 243)
{
  const [{ json }] = run({ headerRow: HEADER_REALE, buildIdJson: { ...BUILD_742784, rowIndex: 243 } });
  prova('729824/729828 — riga 243 come Smart Write Struttura', "'Prenotazioni'!X243", json.data[1].range);
}

// 4. Oltre le 26 colonne: Stato/Id in AA/AB
{
  const header = [...Array(26).fill('x'), 'Stato', 'Id'];
  const [{ json }] = run({ headerRow: header, buildIdJson: BUILD_742784 });
  prova('oltre la Z — colonna AA', 'AA', json.colStato);
  prova('oltre la Z — colonna AB', 'AB', json.colId);
}

// 5. Intestazioni con spazi o maiuscole diverse
{
  const header = ['Mese', ' stato ', 'ID '];
  const [{ json }] = run({ headerRow: header, buildIdJson: BUILD_742784 });
  prova('intestazioni sporche — Stato = B', 'B', json.colStato);
  prova('intestazioni sporche — Id = C', 'C', json.colId);
}

// 6. Nome foglio con apostrofo e spazi
{
  const [{ json }] = run({
    headerRow: HEADER_REALE,
    buildIdJson: { ...BUILD_742784, sheetName: "Prenotazioni d'agosto" },
  });
  prova('nome foglio con apostrofo — quotato bene', "'Prenotazioni d''agosto'!V134", json.data[0].range);
}

// --- Casi in cui NON si deve scrivere: meglio non scrivere che scrivere storto ---

// 7. Intestazioni non leggibili (GET fallito)
{
  const [{ json }] = run({ headerRow: undefined, buildIdJson: BUILD_742784 });
  prova('GET intestazioni fallito — salta', true, json.skip);
  prova('GET intestazioni fallito — niente da scrivere', [], json.data);
}

// 8. Colonna Stato assente
{
  const [{ json }] = run({ headerRow: ['Mese', 'Id'], buildIdJson: BUILD_742784 });
  prova('manca Stato — salta', true, json.skip);
  prova('manca Stato — dice quale', 'colonne mancanti sul foglio struttura: Stato', json.reason);
}

// 9. riga mancante o non numerica
{
  const [{ json }] = run({ headerRow: HEADER_REALE, buildIdJson: { ...BUILD_742784, rowIndex: undefined } });
  prova('riga mancante — salta', true, json.skip);
}
{
  const [{ json }] = run({ headerRow: HEADER_REALE, buildIdJson: { ...BUILD_742784, rowIndex: 1 } });
  prova('riga 1 (intestazione) — salta, non sovrascrive le intestazioni', true, json.skip);
}

// 10. Id vuoto
{
  const [{ json }] = run({
    headerRow: HEADER_REALE,
    buildIdJson: { ...BUILD_742784, transfer: { stato: 'Pronto', id: '' } },
  });
  prova('Id vuoto — salta', true, json.skip);
}

console.log(`\n${ko === 0 ? 'Tutte le prove passano.' : ko + ' prove FALLITE.'}`);
process.exit(ko === 0 ? 0 : 1);
