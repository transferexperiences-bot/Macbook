#!/usr/bin/env node
// Banco di prova offline del nodo «Normalizza Modalità» (Parse transfer).
//   node banchi/te/banco-normalizza-modalita.js
// La modalità decide come si fattura: sbagliarla costa soldi. Fino a oggi la tabella
// dei sinonimi viveva solo nel prompt (§4.10 e §4.22, 2.481 caratteri) e il modello
// doveva ricordarsela a ogni turno.
const fs = require('fs');
const path = require('path');
const CODICE = fs.readFileSync(
  path.join(__dirname, '../../backups/n8n/parse-transfer/normalizza-modalita.js'), 'utf8');

let ok = 0, ko = 0;
function prova(nome, cond, extra) {
  if (cond) { ok++; console.log('  ✅ ' + nome); }
  else { ko++; console.log('  ❌ ' + nome + (extra ? '  →  ' + extra : '')); }
}
function esegui(righe) {
  const $input = { all: () => righe.map((j) => ({ json: j })) };
  return new Function('$input', CODICE)($input).map((r) => r.json);
}
const riga = (m) => ({ Data: '21/08/2026', Time: '14:15', 'Modalità': m, Tariffa: '50' });
const mod = (m) => esegui([riga(m)])[0]['Modalità'];
const out = (m) => esegui([riga(m)])[0];

console.log('\n1) i quattro valori validi tornano nella forma esatta del foglio');
{
  for (const v of ['Incassare', 'Fattura', 'Sconto in fattura', 'Dalla struttura']) {
    prova(v, mod(v) === v, mod(v));
  }
  prova('«INCASSARE» maiuscolo', mod('INCASSARE') === 'Incassare', mod('INCASSARE'));
  prova('«sconto in Fattura» misto', mod('sconto in Fattura') === 'Sconto in fattura', mod('sconto in Fattura'));
  prova('«Modalita» senza accento', mod('dalla struttura') === 'Dalla struttura', mod('dalla struttura'));
  prova('spazi di troppo', mod('  Fattura  ') === 'Fattura', JSON.stringify(mod('  Fattura  ')));
}

console.log('\n2) i sinonimi che oggi il modello deve ricordare a memoria');
{
  const casi = [
    ['contanti', 'Incassare'], ['carta', 'Incassare'], ['carta di credito', 'Incassare'],
    ['paga in macchina', 'Incassare'], ['in macchina', 'Incassare'], ['ti pagano', 'Incassare'],
    ['fatti pagare', 'Incassare'], ['pagano a te', 'Incassare'], ['incassi tu', 'Incassare'],
    ['bancomat', 'Incassare'], ['paga a bordo', 'Incassare'],
    ['fattura al cliente', 'Fattura'], ['fatturiamo al cliente', 'Fattura'],
    ['da fatturare', 'Fattura'],
    ['in fattura alla struttura', 'Sconto in fattura'],
    ['scontiamo in fattura', 'Sconto in fattura'],
    ['paga la struttura', 'Dalla struttura'], ['lo paga il fornitore', 'Dalla struttura'],
    ['paga al rientro', 'Dalla struttura'], ['al ritorno', 'Dalla struttura'],
    ['lo paghiamo dopo', 'Dalla struttura'],
  ];
  for (const [dentro, atteso] of casi) {
    prova('«' + dentro + '» → ' + atteso, mod(dentro) === atteso, mod(dentro));
  }
}

console.log('\n3) quello che NON riconosce non lo inventa');
{
  // il prompt dice di mappare «Bonifico» a uno dei quattro, ma quale? Nessuno lo sa.
  // Meglio lasciarlo e dirlo, che scriverne uno a caso sul gestionale.
  for (const strano of ['Bonifico', 'PayPal', 'Da concordare', 'boh']) {
    const r = out(strano);
    prova('«' + strano + '» resta com\'è ed è segnalato',
      r['Modalità'] === strano && r._modalita_fuori_lista === strano, JSON.stringify(r['Modalità']));
  }
  const v = out('');
  prova('vuoto resta vuoto ed è segnalato',
    v['Modalità'] === '' && v._modalita_mancante === true, JSON.stringify(v['Modalità']));
  const s = out('   ');
  prova('solo spazi = vuoto', s['Modalità'] === '' && s._modalita_mancante === true);
}

console.log('\n4) non tocca nient\'altro della riga');
{
  const r = esegui([{ Id: 'TR/21082026/AAAAAAAAAAAAAAAA', Data: '21/08/2026', Time: '14:15',
    'Transfer > Da': 'Cala Ponte Marina', 'Transfer < Per': 'Masseria Tarsia Morisco',
    Tariffa: '50', 'Modalità': 'contanti', Fornitori: 'Masseria Tarsia Morisco' }])[0];
  prova('Id, data, ora, tratta, tariffa e fornitore intatti',
    r.Id === 'TR/21082026/AAAAAAAAAAAAAAAA' && r.Data === '21/08/2026' && r.Time === '14:15' &&
    r['Transfer > Da'] === 'Cala Ponte Marina' && r.Tariffa === '50' &&
    r.Fornitori === 'Masseria Tarsia Morisco');
  prova('e la modalità è tradotta', r['Modalità'] === 'Incassare', r['Modalità']);
}

console.log('\n5) piu righe nello stesso lotto, ognuna per conto suo');
{
  const tre = esegui([riga('contanti'), riga('Bonifico'), riga('')]);
  prova('la prima tradotta', tre[0]['Modalità'] === 'Incassare');
  prova('la seconda segnalata fuori lista', tre[1]._modalita_fuori_lista === 'Bonifico');
  prova('la terza segnalata mancante', tre[2]._modalita_mancante === true);
  prova('e nessuna ha contagiato le altre',
    tre[0]._modalita_fuori_lista === undefined && tre[0]._modalita_mancante === undefined);
}

console.log('\n6) il campo puo\' arrivare scritto in modi diversi');
{
  const senzaAccento = esegui([{ Data: '21/08/2026', 'Modalita': 'carta' }])[0];
  prova('chiave «Modalita» senza accento', senzaAccento['Modalita'] === 'Incassare', JSON.stringify(senzaAccento));
  const assente = esegui([{ Data: '21/08/2026' }])[0];
  prova('campo del tutto assente → creato vuoto e segnalato',
    assente['Modalità'] === '' && assente._modalita_mancante === true, JSON.stringify(assente));
}

console.log('\n=============================');
console.log('  ' + ok + ' passate, ' + ko + ' fallite');
console.log('=============================');
process.exit(ko ? 1 : 0);
