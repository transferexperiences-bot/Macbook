// =====================================================================
// Banco offline — la colonna Data: o è una data, o si cancella
// =====================================================================
//
// «Se io scrivo un testo, tu lo cancelli, finché non la scrive in formato data.»
// Una regola sola, nessuna conversione.
//
// Gira sul file COMPLETO, quello che finisce dentro TransferLib.
//
//   node banchi/te/banco-data.js

const fs = require('fs');
const path = require('path');

function FintoFoglio() {
  const celle = new Map(), note = new Map(), sfondi = new Map();
  const k = (r, c) => r + ',' + c;
  return {
    _note: note, _sfondi: sfondi,
    getRange: (r, c) => ({
      getValue: () => (celle.has(k(r, c)) ? celle.get(k(r, c)) : ''),
      setValue(v) { celle.set(k(r, c), v); return this; },
      clearContent() { celle.set(k(r, c), ''); return this; },
      getNote: () => note.get(k(r, c)) || null,
      setNote(v) { if (v === null) note.delete(k(r, c)); else note.set(k(r, c), v); return this; },
      setBackground(v) { if (v === null) sfondi.delete(k(r, c)); else sfondi.set(k(r, c), v); return this; },
      setNumberFormat() { return this; },
    }),
    scrivi(r, c, v) { celle.set(k(r, c), v); },
    leggi(r, c) { return celle.has(k(r, c)) ? celle.get(k(r, c)) : ''; },
  };
}

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'apps-script', 'TransferLib-COMPLETO.gs'), 'utf8');
const L = {};
new Function('exports', 'SpreadsheetApp', 'Logger', SRC + `
exports.controllaData = controllaData;
`)(L, { flush: () => {} }, { log: () => {} });

let ko = 0;
function prova(nome, atteso, effettivo) {
  const a = JSON.stringify(atteso), e = JSON.stringify(effettivo);
  const ok = a === e;
  if (!ok) ko++;
  console.log(`${ok ? '  ok  ' : '  KO  '} ${nome}`);
  if (!ok) console.log(`        atteso:   ${a}\n        ottenuto: ${e}`);
}

const col = { data: 3 };

/** Mette `v` nella cella Data, fa girare il controllo, dice com'è finita. */
function giocata(v) {
  const f = FintoFoglio();
  if (v !== undefined) f.scrivi(20, 3, v);
  const esito = L.controllaData(f, 20, col);
  return { esito: esito, resta: f.leggi(20, 3), nota: f._note.get('20,3') || null,
           sfondo: f._sfondi.get('20,3') };
}

console.log('== Banco: la colonna Data ==\n');

console.log('-- il testo si cancella, sempre --');
[['«mercoledi 3 settem» — il caso vero di stasera', 'mercoledi 3 settem'],
 ['«3 settembre»', '3 settembre'],
 ['«mercoledì 3 settembre 2026»', 'mercoledì 3 settembre 2026'],
 ['«domani»', 'domani'],
 ['«la prossima settimana»', 'la prossima settimana'],
 ['«asdfgh»', 'asdfgh'],
 ['«3/9/2026» scritto COME TESTO', '3/9/2026'],
 ['un numero', 45000]].forEach(function (c) {
  const g = giocata(c[1]);
  prova(c[0] + ' → svuotata', 'svuotata', g.esito);
  prova('   la cella resta vuota', '', g.resta);
});

console.log('\n-- e lo dice, invece di sparire in silenzio --');
const g1 = giocata('domani');
prova('nota che spiega cosa scrivere', true, (g1.nota || '').indexOf('3/9/2026') !== -1);
prova('sfondo rosso', '#f4cccc', g1.sfondo);

console.log('\n-- una data vera non si tocca --');
const dataVera = new Date(2026, 8, 3);
const f2 = FintoFoglio();
f2.scrivi(20, 3, dataVera);
prova('Google l\'ha capita come data → niente', 'niente', L.controllaData(f2, 20, col));
prova('   ed è ancora lì', dataVera.getTime(), f2.leggi(20, 3).getTime());
prova('   senza note', undefined, f2._note.get('20,3'));

console.log('\n-- la cella vuota non è un errore --');
const g3 = giocata(undefined);
prova('vuota → niente', 'niente', g3.esito);
prova('   nessuna nota', null, g3.nota);

console.log('\n-- sistemata la data, l\'avviso se ne va da solo --');
const f4 = FintoFoglio();
f4.scrivi(20, 3, 'domani');
L.controllaData(f4, 20, col);                 // svuota e segnala
prova('prima: la nota c\'è', true, !!f4._note.get('20,3'));
f4.scrivi(20, 3, new Date(2026, 8, 3));       // ora scrive una data vera
L.controllaData(f4, 20, col);
prova('dopo: la nota sparisce', undefined, f4._note.get('20,3'));
prova('   e il rosso pure', undefined, f4._sfondi.get('20,3'));

console.log([
  '',
  '─────────────────────────────────────────────────────────────────────',
  'Come si riconosce una data: quando quello che scrivi È una data, Google',
  'nella cella non ci mette il testo — ci mette un valore data, e getValue()',
  'restituisce un oggetto Date. Se torna una stringa, dentro c\'è testo.',
  'Non serve altro per decidere, e non c\'è niente da indovinare.',
  '',
  '⚠️ Non funziona finché sulla colonna resta il «tipo di colonna» di Google:',
  'quello blocca prima. Va tolto — Dati → Tipo di colonna → Nessuno.',
  '─────────────────────────────────────────────────────────────────────',
].join('\n'));

console.log(`\n${ko} prove rosse.`);
process.exit(ko > 0 ? 1 : 0);
