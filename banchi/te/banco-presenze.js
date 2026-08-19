// =====================================================================
// Banco offline — il censimento «Presenze»
// =====================================================================
//
// Due cose devono restare vere:
//   1. il censimento dice il vero (una riga per foglio, aggiornata, con la
//      versione della libreria);
//   2. il censimento NON può far fallire un salvataggio. Se Strutture è
//      irraggiungibile, se il foglio «Presenze» non c'è, se la cache non
//      risponde — il transfer parte lo stesso. È un accessorio.
//
//   node banchi/te/banco-presenze.js

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'apps-script', 'TransferLib-COMPLETO.gs'), 'utf8');

function ambiente(opts) {
  opts = opts || {};
  const righe = opts.righe || [];
  const scritture = [];
  let creato = null;
  const cache = { _m: {}, get(k) { return this._m[k] || null; },
                  put(k, v) { this._m[k] = v; } };

  const foglio = {
    getLastRow: () => righe.length + 1,
    getRange(r, c, nr, nc) {
      return {
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i++) out.push((righe[r - 2 + i] || []).slice(c - 1, c - 1 + nc));
          return out;
        },
        setValue(v) { scritture.push([r, c, v]); righe[r - 2][c - 1] = v; return this; },
      };
    },
    appendRow(r) { righe.push(r); scritture.push(['append', r]); },
    setFrozenRows() {},
  };

  const strutture = {
    getSheetByName: (n) => (opts.senzaPresenze ? null : foglio),
    insertSheet: (n) => { creato = n; return foglio; },
  };

  return {
    _righe: righe, _scritture: scritture, _creato: () => creato, _cache: cache,
    SpreadsheetApp: {
      openById(id) {
        if (opts.struttureRotto) throw new Error('non ho i permessi su Strutture');
        return strutture;
      },
      flush() {},
    },
    CacheService: { getScriptCache: () => (opts.senzaCache ? (() => { throw new Error('no cache'); })() : cache) },
    Logger: { log() {} },
  };
}

function carica(amb) {
  const box = {};
  new Function('exports', 'SpreadsheetApp', 'CacheService', 'Logger', 'LockService', 'Utilities',
    SRC + `
exports.teSegnalaPresenza = teSegnalaPresenza;
exports.TE_VERSIONE       = TE_VERSIONE;
`)(box, amb.SpreadsheetApp, amb.CacheService, amb.Logger, {}, {});
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

console.log('== Banco: il censimento «Presenze» ==\n');

console.log('-- un foglio mai visto: si aggiunge la sua riga --');
{
  const amb = ambiente({ righe: [] });
  const L = carica(amb);
  L.teSegnalaPresenza('ID-PIETRABLU', 'Pietra Blu', 'sweep');
  prova('una riga sola', 1, amb._righe.length);
  prova('   nome', 'Pietra Blu', amb._righe[0][0]);
  prova('   id', 'ID-PIETRABLU', amb._righe[0][1]);
  prova('   «ultimo giro» è una data', true, amb._righe[0][2] instanceof Date);
  prova('   «ultima modifica» ancora vuota', '', amb._righe[0][3]);
  prova('   versione della libreria', L.TE_VERSIONE, amb._righe[0][4]);
}

console.log('\n-- lo stesso foglio non si duplica: si aggiorna la sua riga --');
{
  const amb = ambiente({ righe: [['Pietra Blu', 'ID-PIETRABLU', new Date(2026, 7, 1), '', 'vecchia']] });
  const L = carica(amb);
  L.teSegnalaPresenza('ID-PIETRABLU', 'Pietra Blu', 'sweep');
  prova('sempre una riga', 1, amb._righe.length);
  prova('   la data è nuova', true, amb._righe[0][2].getFullYear() >= 2026 &&
        amb._righe[0][2].getTime() > new Date(2026, 7, 1).getTime());
  prova('   la versione si aggiorna', L.TE_VERSIONE, amb._righe[0][4]);
}

console.log('\n-- la chiave è l\'id, non il nome: se rinomini il foglio non si sdoppia --');
{
  const amb = ambiente({ righe: [['Pietra Blu', 'ID-PIETRABLU', new Date(2026, 7, 1), '', 'x']] });
  const L = carica(amb);
  L.teSegnalaPresenza('ID-PIETRABLU', 'Pietra Blu Resort', 'sweep');
  prova('sempre una riga', 1, amb._righe.length);
  prova('   e il nome nuovo', 'Pietra Blu Resort', amb._righe[0][0]);
}

console.log('\n-- sweep e modifica sono due colonne diverse --');
{
  const amb = ambiente({ righe: [['X', 'ID-X', '', '', '']] });
  const L = carica(amb);
  L.teSegnalaPresenza('ID-X', 'X', 'sweep');
  L.teSegnalaPresenza('ID-X', 'X', 'onEdit');
  prova('«ultimo giro» scritto', true, amb._righe[0][2] instanceof Date);
  prova('«ultima modifica» scritta', true, amb._righe[0][3] instanceof Date);
}

console.log('\n-- il freno dei 5 minuti: due giri di fila, una scrittura sola --');
{
  const amb = ambiente({ righe: [['X', 'ID-X', '', '', '']] });
  const L = carica(amb);
  L.teSegnalaPresenza('ID-X', 'X', 'sweep');
  const dopoUno = amb._scritture.length;
  L.teSegnalaPresenza('ID-X', 'X', 'sweep');
  L.teSegnalaPresenza('ID-X', 'X', 'sweep');
  prova('il secondo e il terzo giro non scrivono', dopoUno, amb._scritture.length);
  prova('   ma una modifica passa lo stesso', true, (() => {
    L.teSegnalaPresenza('ID-X', 'X', 'onEdit');
    return amb._scritture.length > dopoUno;
  })());
}

console.log('\n-- il foglio «Presenze» non c\'è: si crea da solo --');
{
  const amb = ambiente({ righe: [], senzaPresenze: true });
  const L = carica(amb);
  L.teSegnalaPresenza('ID-X', 'X', 'sweep');
  prova('creato', 'Presenze', amb._creato());
  prova('   con le intestazioni', 'Foglio', amb._righe[0][0]);
  prova('   e la riga del foglio', 'X', amb._righe[1][0]);
}

console.log('\n-- se si rompe, si rompe da solo: NON deve lanciare --');
{
  const amb = ambiente({ righe: [], struttureRotto: true });
  const L = carica(amb);
  let lanciato = false;
  try { L.teSegnalaPresenza('ID-X', 'X', 'sweep'); } catch (e) { lanciato = true; }
  prova('Strutture irraggiungibile → nessun errore verso l\'alto', false, lanciato);
}
{
  const amb = ambiente({ righe: [], senzaCache: true });
  const L = carica(amb);
  let lanciato = false;
  try { L.teSegnalaPresenza('ID-X', 'X', 'sweep'); } catch (e) { lanciato = true; }
  prova('cache non disponibile → si scrive lo stesso, senza errori', false, lanciato);
  prova('   e la riga c\'è', 'X', amb._righe[0][0]);
}

console.log([
  '',
  '─────────────────────────────────────────────────────────────────────',
  'Un salvataggio non può fallire per colpa di un censimento: per questo',
  '`teSegnalaPresenza` non restituisce niente e si mangia i suoi errori.',
  'È l\'unico posto della libreria dove ingoiare un errore è la cosa giusta.',
  '─────────────────────────────────────────────────────────────────────',
].join('\n'));

console.log(`\n${ko} prove rosse.`);
process.exit(ko > 0 ? 1 : 0);
