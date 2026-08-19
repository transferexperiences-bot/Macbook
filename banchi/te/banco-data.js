// =====================================================================
// Banco offline — la colonna Data
// =====================================================================
//
// Agostino, 19/08: «abbiamo la parte dello script che si occupa delle
// correzioni... applichiamo anche la data: se non corrisponde a numero ma a
// testo, viene cancellata o convertita in numero.»
//
// Qui si prova esattamente quello, sul file che finisce dentro TransferLib —
// non su una copia. Le due cose che devono restare vere anche fra sei mesi:
//   1. una cella che Google ha già capito come data non si tocca (né valore né
//      formato): è lì che vive il «tipo di colonna», e col tipo di colonna non
//      si litiga;
//   2. non si indovina mai. Se non si legge, si cancella e si dice perché.
//
//   node banchi/te/banco-data.js

const fs = require('fs');
const path = require('path');

// Oggi finto: 19 agosto 2026. Le date senza anno si contano da qui.
const OGGI = new Date(2026, 7, 19, 21, 0, 0);

function FintaCella(valore, formato) {
  return {
    _v: valore, _nota: null, _sfondo: null, _formato: formato || null, _flush: 0,
    getValue() { return this._v === undefined ? '' : this._v; },
    setValue(v) { this._v = v; return this; },
    clearContent() { this._v = ''; return this; },
    getNote() { return this._nota; },
    setNote(v) { this._nota = v; return this; },
    setBackground(v) { this._sfondo = v; return this; },
    setNumberFormat(v) { this._formato = v; return this; },
  };
}

const SRC_LIB = fs.readFileSync(
  path.join(__dirname, '..', '..', 'apps-script', 'TransferLib-COMPLETO.gs'), 'utf8');

const L = {};
new Function('exports', 'SpreadsheetApp', 'LockService', 'Utilities', 'Logger', SRC_LIB + `
exports.canonicalData        = canonicalData;
exports.correggiCellaData    = correggiCellaData;
exports.correggiCellaToccata = correggiCellaToccata;
exports.buildColMap          = buildColMap;
exports.TE_FORMATO_DATA      = TE_FORMATO_DATA;
`)(L, { flush() {} }, {}, {}, { log() {} });

let ko = 0;
function prova(nome, atteso, effettivo) {
  const a = JSON.stringify(atteso), e = JSON.stringify(effettivo);
  const ok = a === e;
  if (!ok) ko++;
  console.log(`${ok ? '  ok  ' : '  KO  '} ${nome}`);
  if (!ok) console.log(`        atteso:   ${a}\n        ottenuto: ${e}`);
}

const gg = (d) => (d === null ? null : [d.getFullYear(), d.getMonth() + 1, d.getDate()]);

console.log('== Banco: la colonna Data ==\n');

console.log('-- il testo che si legge diventa una data vera --');
[['«7/8» → 7 agosto 2026', '7/8', [2026, 8, 7]],
 ['«07/08» con lo zero', '07/08', [2026, 8, 7]],
 ['«7-8» col trattino', '7-8', [2026, 8, 7]],
 ['«7.8» col punto', '7.8', [2026, 8, 7]],
 ['« 7 / 8 » con gli spazi', ' 7 / 8 ', [2026, 8, 7]],
 ['«7/8/2026» per esteso', '7/8/2026', [2026, 8, 7]],
 ['«7/8/26» a due cifre', '7/8/26', [2026, 8, 7]],
 ['«31/12» fine anno', '31/12', [2026, 12, 31]],
 ['«29/2/2028» bisestile vero', '29/2/2028', [2028, 2, 29]],
].forEach(c => prova(c[0], c[2], gg(L.canonicalData(c[1], OGGI))));

console.log('\n-- l\'anno quando non c\'è: quello di oggi, o il prossimo --');
prova('«20/8» domani → 2026', [2026, 8, 20], gg(L.canonicalData('20/8', OGGI)));
prova('«1/8» tre settimane fa → 2026 (non si sposta per poco)',
  [2026, 8, 1], gg(L.canonicalData('1/8', OGGI)));
prova('«3/1» già passato da un pezzo → 2027', [2027, 1, 3], gg(L.canonicalData('3/1', OGGI)));

console.log('\n-- il testo che non si legge non diventa niente --');
[['«merc 8» — il caso di stasera', 'merc 8'],
 ['«merc 8 agosto»', 'merc 8 agosto'],
 ['«mercoledi 3 settem»', 'mercoledi 3 settem'],
 ['«3 settembre»', '3 settembre'],
 ['«domani»', 'domani'],
 ['«asdfgh»', 'asdfgh'],
 ['un numero secco: 45000', 45000],
 ['«31/2» non esiste → non si sposta al 3 marzo', '31/2'],
 ['«32/8» giorno impossibile', '32/8'],
 ['«7/13» mese impossibile', '7/13'],
 ['«7/8/2026 alle 9» con roba in coda', '7/8/2026 alle 9'],
].forEach(c => prova(c[0] + ' → null', null, L.canonicalData(c[1], OGGI)));

console.log('\n-- sulla cella: convertita --');
{
  const c = FintaCella('7/8');
  prova('esito', 'convertita', L.correggiCellaData(c, OGGI));
  prova('   dentro c\'è una data vera', [2026, 8, 7], gg(c._v));
  prova('   e si vede come le altre righe', 'ddd d MMMM yyyy', c._formato);
  prova('   nessun avviso', null, c._nota);
}
{
  // Cella rimasta formattata come testo dopo un incolla: il formato va messo
  // PRIMA del valore, altrimenti la data ridiventa stringa.
  const c = FintaCella('7/8', '@');
  L.correggiCellaData(c, OGGI);
  prova('cella formattata «@» → formato rimesso', 'ddd d MMMM yyyy', c._formato);
}

console.log('\n-- sulla cella: svuotata, e lo dice --');
{
  const c = FintaCella('merc 8');
  prova('esito', 'svuotata', L.correggiCellaData(c, OGGI));
  prova('   la cella resta vuota', '', c._v);
  prova('   la nota spiega come si scrive', true, (c._nota || '').indexOf('7/8') !== -1);
  prova('   sfondo rosso', '#f4cccc', c._sfondo);
}

console.log('\n-- la cella che Google ha già capito NON si tocca --');
{
  // È il caso in cui sulla colonna c'è il «tipo di colonna»: valore e formato
  // sono roba di Google, e noi non ci mettiamo le mani.
  const c = FintaCella(new Date(2026, 8, 3), 'dd/MM/yyyy');
  prova('esito', 'niente', L.correggiCellaData(c, OGGI));
  prova('   il valore è ancora lì', [2026, 9, 3], gg(c._v));
  prova('   il formato è ancora il suo', 'dd/MM/yyyy', c._formato);
}

console.log('\n-- la cella vuota non è un errore --');
{
  const c = FintaCella('');
  prova('esito', 'niente', L.correggiCellaData(c, OGGI));
  prova('   nessuna nota', null, c._nota);
}

console.log('\n-- sistemata la data, l\'avviso se ne va da solo --');
{
  const c = FintaCella('domani');
  L.correggiCellaData(c, OGGI);
  prova('prima: la nota c\'è', true, !!c._nota);
  c._v = '7/8';
  L.correggiCellaData(c, OGGI);
  prova('dopo: la nota sparisce', null, c._nota);
  prova('   e il rosso pure', null, c._sfondo);
}
{
  const c = FintaCella('domani');
  L.correggiCellaData(c, OGGI);
  c._v = new Date(2026, 7, 7);          // corretta a mano col calendario
  L.correggiCellaData(c, OGGI);
  prova('corretta col calendario: la nota sparisce lo stesso', null, c._nota);
}

console.log('\n-- la colonna Data si trova per nome, come le altre --');
{
  const H = ['Mese', 'Note', 'Data', 'Time', 'TRS> DA', 'TRS <PER', 'PAX', 'Nome', 'Fornitore',
    'Volo', 'cell.', 'Autista', 'Veicolo', 'h extra/ritardi', 'Tariffa a noi', 'Tariffa ',
    'Fee', 'Modalità', 'Tipologia incasso', 'n. pratica', 'Addebitato', 'Stato', 'Eseguito', 'Id'];
  const { col } = L.buildColMap(H);
  prova('Pietra Blu — Data = 3', 3, col.data);
  const spostata = ['Mese', 'Note', 'Reparto', 'Data', 'Time'].concat(H.slice(4));
  prova('colonna inserita davanti — Data = 4', 4, L.buildColMap(spostata).col.data);
}

console.log('\n-- il punto d\'ingresso: la modifica su Data passa di qui --');
{
  const cella = FintaCella('merc 8');
  const e = { range: Object.assign({
    getNumRows: () => 1, getNumColumns: () => 1, getColumn: () => 3,
  }, cella) };
  L.correggiCellaToccata(e, { data: 3, ora: 4, telefono: 11 });
  prova('Data toccata → svuotata', '', e.range.getValue());
  prova('   con la nota', true, !!e.range.getNote());
}
{
  // Ora e Telefono devono continuare a funzionare come prima.
  let scritto = null;
  const e = { range: {
    getNumRows: () => 1, getNumColumns: () => 1, getColumn: () => 4,
    getValue: () => '830', setValue(v) { scritto = v; return this; },
    setNumberFormat() { return this; },
  } };
  L.correggiCellaToccata(e, { data: 3, ora: 4, telefono: 11 });
  prova('Ora toccata → «08:30», come prima', '08:30', scritto);
}

console.log([
  '',
  '─────────────────────────────────────────────────────────────────────',
  'Il ramo che scrive parte SOLO quando nella cella c\'è del testo — cioè',
  'solo dove il «tipo di colonna» di Google non stava guardando. Dove c\'è,',
  'il testo non entra proprio e questo codice non arriva nemmeno a girare:',
  'il calendario col doppio clic resta intatto.',
  '─────────────────────────────────────────────────────────────────────',
].join('\n'));

console.log(`\n${ko} prove rosse.`);
process.exit(ko > 0 ? 1 : 0);
