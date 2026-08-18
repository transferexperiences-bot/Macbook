// =====================================================================
// Banco offline — la colonna Data
// =====================================================================
//
// «Devi fare in modo che lo script cancelli la cella se l'input è testuale.»
// Con un'aggiunta: se il testo è una data che si CAPISCE, si converte invece di
// buttarla. Si butta solo quello che è davvero illeggibile, e con scritto perché.
//
// Gira sul file COMPLETO, quello che finisce dentro TransferLib.
//
//   node banchi/te/banco-data.js

const fs = require('fs');
const path = require('path');

// --- finto Google, il minimo ------------------------------------------
function FintoFoglio() {
  const celle = new Map(), note = new Map(), sfondi = new Map(), formati = new Map();
  const k = (r, c) => r + ',' + c;
  return {
    _celle: celle, _note: note, _sfondi: sfondi, _formati: formati,
    getRange: (r, c) => ({
      getValue: () => (celle.has(k(r, c)) ? celle.get(k(r, c)) : ''),
      setValue(v) { celle.set(k(r, c), v); return this; },
      clearContent() { celle.set(k(r, c), ''); return this; },
      getNote: () => note.get(k(r, c)) || null,
      setNote(v) { if (v === null) note.delete(k(r, c)); else note.set(k(r, c), v); return this; },
      setBackground(v) { if (v === null) sfondi.delete(k(r, c)); else sfondi.set(k(r, c), v); return this; },
      setNumberFormat(v) { formati.set(k(r, c), v); return this; },
    }),
    scrivi(r, c, v) { celle.set(k(r, c), v); },
    leggi(r, c) { return celle.has(k(r, c)) ? celle.get(k(r, c)) : ''; },
  };
}

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'apps-script', 'TransferLib-COMPLETO.gs'), 'utf8');
const L = {};
new Function('exports', 'SpreadsheetApp', 'Logger', SRC + `
exports.normalizzaData   = normalizzaData;
exports.controllaData    = controllaData;
exports.teMeseDaParola_  = teMeseDaParola_;
`)(L, { flush: () => {} }, { log: () => {} });

let ko = 0;
function prova(nome, atteso, effettivo) {
  const a = JSON.stringify(atteso), e = JSON.stringify(effettivo);
  const ok = a === e;
  if (!ok) ko++;
  console.log(`${ok ? '  ok  ' : '  KO  '} ${nome}`);
  if (!ok) console.log(`        atteso:   ${a}\n        ottenuto: ${e}`);
}

// Istante fisso: il banco non deve dipendere da che giorno è oggi.
const OGGI = new Date(2026, 7, 18);          // 18 agosto 2026
const gg = (d) => (d instanceof Date)
  ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  : d;
const conv = (v) => gg(L.normalizzaData(v, OGGI));

console.log('== Banco: la colonna Data ==\n');

console.log('-- quello che si capisce si converte --');
prova('«3/9/2026»',                    '03/09/2026', conv('3/9/2026'));
prova('«03-09-2026»',                  '03/09/2026', conv('03-09-2026'));
prova('«3.9.2026»',                    '03/09/2026', conv('3.9.2026'));
prova('«3/9/26» — anno a due cifre',   '03/09/2026', conv('3/9/26'));
prova('«2026-09-03» — alla rovescia',  '03/09/2026', conv('2026-09-03'));
prova('«3 settembre»',                 '03/09/2026', conv('3 settembre'));
prova('«3 settembre 2026»',            '03/09/2026', conv('3 settembre 2026'));
prova('«mercoledì 3 settembre 2026»',  '03/09/2026', conv('mercoledì 3 settembre 2026'));
prova('«mercoledi 3 settem» — il caso vero di stasera', '03/09/2026', conv('mercoledi 3 settem'));
prova('«MERCOLEDÌ 3 SETTEMBRE»',       '03/09/2026', conv('MERCOLEDÌ 3 SETTEMBRE'));
prova('«3 set»',                       '03/09/2026', conv('3 set'));
prova('«mar 3 mar» — mar davanti è il giorno, mar dopo è marzo', '03/03/2027', conv('mar 3 mar'));

console.log('\n-- l\'anno quando non lo scrivi --');
prova('«3 settembre» a agosto → quest\'anno',  '03/09/2026', conv('3 settembre'));
prova('«3 gennaio» a agosto → l\'anno dopo',   '03/01/2027', conv('3 gennaio'));
prova('«1 agosto» (17 giorni fa) → quest\'anno, è un inserimento in ritardo',
  '01/08/2026', conv('1 agosto'));

console.log('\n-- quello che NON si capisce si butta --');
[['«domani»', 'domani'],
 ['«la prossima settimana»', 'la prossima settimana'],
 ['«asdfgh»', 'asdfgh'],
 ['«3 pippo»', '3 pippo'],
 ['«settembre» senza giorno', 'settembre'],
 ['«31 febbraio» — non esiste', '31 febbraio'],
 ['«45/9/2026»', '45/9/2026'],
 ['«3/13/2026» — mese 13', '3/13/2026']].forEach(function (c) {
  prova(c[0] + ' → si butta', false, L.normalizzaData(c[1], OGGI));
});

console.log('\n-- quello che non si tocca --');
prova('una data vera di Google: si lascia stare', null, L.normalizzaData(new Date(2026, 8, 3), OGGI));
prova('cella vuota: non è un errore', null, L.normalizzaData('', OGGI));
prova('spazi soltanto', null, L.normalizzaData('   ', OGGI));

console.log('\n-- sulla cella, per davvero --');
const col = { data: 3 };

const f1 = FintoFoglio();
f1.scrivi(10, 3, 'mercoledi 3 settem');
prova('testo capito → corretta', 'corretta', L.controllaData(f1, 10, col, OGGI));
prova('   nella cella c\'è una data vera', '03/09/2026', gg(f1.leggi(10, 3)));
prova('   e il formato è dd/MM/yyyy', 'dd/MM/yyyy', f1._formati.get('10,3'));

const f2 = FintoFoglio();
f2.scrivi(11, 3, 'la prossima settimana');
prova('testo illeggibile → svuotata', 'svuotata', L.controllaData(f2, 11, col, OGGI));
prova('   la cella è vuota', '', f2.leggi(11, 3));
prova('   con la nota che dice come scriverla',
  true, (f2._note.get('11,3') || '').indexOf('3/9/2026') !== -1);
prova('   e il rosso', '#f4cccc', f2._sfondi.get('11,3'));

// Sistemata la data, l'avviso se ne va da solo.
f2.scrivi(11, 3, '3/9/2026');
L.controllaData(f2, 11, col, OGGI);
prova('sistemata: la nota sparisce', undefined, f2._note.get('11,3'));
prova('   e il rosso pure', undefined, f2._sfondi.get('11,3'));

const f3 = FintoFoglio();
prova('cella vuota: non si tocca e non si segnala', 'niente', L.controllaData(f3, 12, col, OGGI));

console.log([
  '',
  '─────────────────────────────────────────────────────────────────────',
  "⚠️ NON FUNZIONA finché sulla colonna Data resta il «tipo di colonna» di",
  'Google: quello blocca il testo prima, e questo codice non viene chiamato.',
  'Va tolto dal foglio — Dati → Tipo di colonna → Nessuno.',
  '─────────────────────────────────────────────────────────────────────',
].join('\n'));

console.log(`\n${ko} prove rosse.`);
process.exit(ko > 0 ? 1 : 0);
