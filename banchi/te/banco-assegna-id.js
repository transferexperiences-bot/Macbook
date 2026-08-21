#!/usr/bin/env node
// Banco di prova offline del nodo «Assegna Id» (Parse transfer, IkFB29XmJJXQx1a9).
//   node banchi/te/banco-assegna-id.js
// Dati veri: esecuzione 777942 del 21/08 07:52 — il rientro delle 14:15 scritto sul
// gestionale con Id vuoto, e quindi invisibile a tutto il resto del sistema.
const fs = require('fs');
const path = require('path');
const CODICE = fs.readFileSync(
  path.join(__dirname, '../../backups/n8n/parse-transfer/assegna-id.js'), 'utf8');

let ok = 0, ko = 0;
function prova(nome, cond, extra) {
  if (cond) { ok++; console.log('  ✅ ' + nome); }
  else { ko++; console.log('  ❌ ' + nome + (extra ? '  →  ' + extra : '')); }
}

function esegui(righe) {
  const $input = { all: () => righe.map((j) => ({ json: j })) };
  return new Function('$input', CODICE)($input).map((r) => r.json);
}

// la riga vera uscita da «Code in JavaScript» il 21/08: nessuna chiave Id
const RIENTRO_777942 = {
  Allert: 'Invia', Hide: false,
  Note: "Destinazione «Masseria Tarsia Morisco» dedotta girando l'andata: non l'hai detta tu.",
  Tariffa: '50', Acconto: '', 'Modalità': 'Incassare', 'Stato %': '',
  Data: '21/08/2026', Time: '14:15',
  'Transfer > Da': 'Cala Ponte Marina', 'Transfer < Per': 'Masseria Tarsia Morisco',
  Pax: '', Nome: '', Fornitori: 'Masseria Tarsia Morisco', Volo: '',
  Autista: '', Veicolo: '', 'h extra': '', 'Cell.': '',
};

const FORMATO = /^TR\/\d{8}\/[A-Z0-9]{16}$/;

console.log('\n1) 777942 — il rientro che finiva sul foglio senza Id');
{
  const [r] = esegui([RIENTRO_777942]);
  prova('adesso un Id ce l\'ha', !!r.Id, JSON.stringify(r.Id));
  prova('nel formato del gestionale (TR/DDMMYYYY/16)', FORMATO.test(r.Id), r.Id);
  prova('marcato come generato dal codice', r._id_generato === true);
  prova('non tocca nient\'altro della riga',
    r.Tariffa === '50' && r.Data === '21/08/2026' && r.Time === '14:15' &&
    r['Transfer < Per'] === 'Masseria Tarsia Morisco');
}

console.log('\n2) un Id vero non si tocca MAI — è quello che evita di sovrascrivere');
{
  const ID = 'TR/21082026/FFF77OVFNDBGSEGX';
  const [r] = esegui([Object.assign({}, RIENTRO_777942, { Id: ID })]);
  prova('l\'Id resta identico', r.Id === ID, r.Id);
  prova('non lo marca come generato', r._id_generato === undefined);

  // anche il vecchio formato con i trattini
  const VECCHIO = 'TR-20260818-47a6fd0f-1234-5678';
  const [r2] = esegui([Object.assign({}, RIENTRO_777942, { Id: VECCHIO })]);
  prova('regge anche il formato vecchio TR-AAAAMMGG-…', r2.Id === VECCHIO, r2.Id);

  // l'Id arrivato col tag <code> dal recap Telegram
  const [r3] = esegui([Object.assign({}, RIENTRO_777942, { Id: '<code>' + ID + '</code>' })]);
  prova('ripulisce i tag HTML invece di generarne uno nuovo', r3.Id === ID, r3.Id);
}

console.log('\n3) i finti Id non sono Id: lì si genera');
{
  for (const finto of ['', '   ', 'da generare', 'DA GENERARE', 'vuoto', 'null', '-', '—']) {
    const [r] = esegui([Object.assign({}, RIENTRO_777942, { Id: finto })]);
    prova('«' + finto + '» → Id nuovo', FORMATO.test(r.Id) && r._id_generato === true, r.Id);
  }
}

console.log('\n4) piu schede nello stesso lotto');
{
  const tre = esegui([
    Object.assign({}, RIENTRO_777942, { Time: '09:00' }),
    Object.assign({}, RIENTRO_777942, { Time: '12:00' }),
    Object.assign({}, RIENTRO_777942, { Time: '18:00' }),
  ]);
  const ids = tre.map((r) => r.Id);
  prova('tre schede, tre Id', ids.every((x) => FORMATO.test(x)), JSON.stringify(ids));
  prova('e sono tutti diversi fra loro', new Set(ids).size === 3, JSON.stringify(ids));
  prova('gli orari restano quelli giusti',
    tre[0].Time === '09:00' && tre[1].Time === '12:00' && tre[2].Time === '18:00');

  // misto: una con Id, due senza
  const misto = esegui([
    Object.assign({}, RIENTRO_777942, { Id: 'TR/21082026/FFF77OVFNDBGSEGX' }),
    Object.assign({}, RIENTRO_777942, {}),
  ]);
  prova('quella con l\'Id lo tiene, l\'altra ne riceve uno nuovo',
    misto[0].Id === 'TR/21082026/FFF77OVFNDBGSEGX' && FORMATO.test(misto[1].Id) &&
    misto[0].Id !== misto[1].Id);
}

console.log('\n5) l\'Id generato non puo\' pescare una riga che esiste gia');
{
  // 2.000 Id generati: nessun doppione fra loro, e nessuno uguale a quelli veri del foglio
  const veri = new Set(['TR/21082026/FFF77OVFNDBGSEGX', 'TR/20082026/WO3PYJZOJTPBDDON',
    'TR/20082026/SX8AF1YRPT2R6RUM', 'TR/20082026/BJHXG52HBVP79RXI',
    'TR/18082026/G5HWU5BMPTIVTWY1', 'TR/18082026/RT03SZHEGW3YORCP']);
  const visti = new Set();
  let collisioni = 0;
  for (let i = 0; i < 2000; i++) {
    const [r] = esegui([Object.assign({}, RIENTRO_777942)]);
    if (visti.has(r.Id) || veri.has(r.Id)) collisioni++;
    visti.add(r.Id);
  }
  prova('2.000 Id generati, zero collisioni', collisioni === 0, 'collisioni=' + collisioni);
  prova('tutti nel formato giusto', [...visti].every((x) => FORMATO.test(x)));
}

console.log('\n=============================');
console.log('  ' + ok + ' passate, ' + ko + ' fallite');
console.log('=============================');
process.exit(ko ? 1 : 0);
