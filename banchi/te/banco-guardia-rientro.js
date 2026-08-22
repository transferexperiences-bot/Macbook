// ============================================================================
// BANCO — GUARDIA RIENTRO  ·  22/08/2026
// Riproduce il guasto 758399 del 18/08: l'andata delle 16:45 Pietra Blu -> Citta di Bari
// di LADANOV IGOR sovrascritta dal proprio rientro, perche il rientro portava l'Id
// dell'andata e appendOrUpdate faceva match.
// ============================================================================
const { runNode } = require('./harness.js');
const ORIG = __dirname + '/node-assegna-id.orig.js';
const NEW  = __dirname + '/node-assegna-id.new.js';

let falliti = 0;
const check = (nome, atteso, avuto) => {
  const ok = JSON.stringify(atteso) === JSON.stringify(avuto);
  if (!ok) falliti++;
  console.log((ok ? '  ok   ' : '  FALLITO ') + nome +
    (ok ? '' : '\n         atteso: ' + JSON.stringify(atteso) + '\n         avuto : ' + JSON.stringify(avuto)));
};

const ID_ANDATA = 'TR/18082026/47A6FD0F1234ABCD';

// la riga come sta sul gestionale: l'ANDATA
const ANDATA = {
  Id: ID_ANDATA, Data: '18 agosto 2026', Time: '16:45',
  'Transfer > Da': 'Pietra Blu', 'Transfer < Per': 'Citta di Bari',
  Nome: 'LADANOV IGOR', Autista: 'Giuseppe Fanelli', Note: '',
};
// quello che Parse transfer sta per scrivere: il RIENTRO, con l'Id dell'andata addosso
const RIENTRO = {
  Id: ID_ANDATA, Data: '18 agosto 2026', Time: '21:30',
  'Transfer > Da': 'Citta di Bari', 'Transfer < Per': 'Pietra Blu',
  Nome: 'LADANOV IGOR', Autista: '',
  Note: "Rientro dell'andata delle 16:45 di LADANOV IGOR",
};

function giro(codice, opts) {
  opts = opts || {};
  return runNode(codice, {
    nodes: {
      'Code in JavaScript': opts.items || [RIENTRO],
      'Leggi Riga Id (guardia rientro)': opts.letti !== undefined ? opts.letti : [ANDATA],
    },
    input: opts.items || [RIENTRO],
  }).map((r) => r.json);
}

console.log('\n=== 1. IL GUASTO, sul codice in produzione ===');
{
  const out = giro(ORIG);
  check('758399 · produzione: il rientro tiene l\'Id dell\'andata (SOVRASCRIVE)', ID_ANDATA, out[0].Id);
}

console.log('\n=== 2. CODICE NUOVO ===');
{
  const out = giro(NEW)[0];
  check('758399 · nuovo: l\'Id dell\'andata NON passa', false, out.Id === ID_ANDATA);
  check('758399 · nuovo: ne riceve uno nuovo valido', true, /^TR\/\d{8}\/[A-Z0-9]{16}$/.test(out.Id));
  check('758399 · nuovo: dice quale Id ha scartato', ID_ANDATA, out._id_andata_scartato);
  check('758399 · nuovo: e dice perche', true, /percorso opposto/.test(out._id_rigenerato_rientro || ''));
}

// una MODIFICA vera deve continuare a funzionare: stesso verso, cambia l'orario
{
  const modifica = Object.assign({}, ANDATA, { Time: '17:15' });
  const out = giro(NEW, { items: [modifica] })[0];
  check('modifica · stesso verso, orario cambiato → Id tenuto', ID_ANDATA, out.Id);
  check('modifica · nessuna guardia scattata', undefined, out._id_rigenerato_rientro);
}

// correggere la DESTINAZIONE non e un rovesciamento: Id tenuto
{
  const corr = Object.assign({}, ANDATA, { 'Transfer < Per': 'Bari Airport' });
  const out = giro(NEW, { items: [corr] })[0];
  check('modifica · destinazione corretta → Id tenuto', ID_ANDATA, out.Id);
}

// modificare un RIENTRO gia salvato: la riga sul foglio e gia un rientro, Id tenuto
{
  const rientroSalvato = Object.assign({}, RIENTRO, { Id: 'TR/18082026/BBBBBBBBBBBBBBBB' });
  const modificaRientro = Object.assign({}, rientroSalvato, { Time: '22:00' });
  const out = runNode(NEW, {
    nodes: { 'Code in JavaScript': [modificaRientro], 'Leggi Riga Id (guardia rientro)': [rientroSalvato] },
    input: [modificaRientro],
  })[0].json;
  check('modifica · di un rientro gia salvato → Id tenuto', 'TR/18082026/BBBBBBBBBBBBBBBB', out.Id);
}

// Id che sul gestionale non esiste: appendOrUpdate appende comunque, si tiene
{
  const nuovo = Object.assign({}, RIENTRO, { Id: 'TR/22082026/ZZZZZZZZZZZZZZZZ' });
  const out = giro(NEW, { items: [nuovo], letti: [{}] })[0];
  check('Id sconosciuto · lettura ok, nessun match → Id tenuto', 'TR/22082026/ZZZZZZZZZZZZZZZZ', out.Id);
}

// foglio muto + scheda di rientro con un Id addosso: si butta lo stesso
{
  const out = giro(NEW, { letti: [{ error: 'timeout' }] })[0];
  check('foglio muto · rientro con Id → Id nuovo', false, out.Id === ID_ANDATA);
  check('foglio muto · dice che il gestionale non risponde', true, /non risponde/.test(out._id_rigenerato_rientro || ''));
}

// foglio muto ma scheda NORMALE (nessun marcatore): l'Id si tiene, le modifiche vivono
{
  const senzaMarca = Object.assign({}, ANDATA, { Time: '17:15' });
  const out = giro(NEW, { items: [senzaMarca], letti: [{ error: 'timeout' }] })[0];
  check('foglio muto · modifica normale → Id tenuto', ID_ANDATA, out.Id);
}

// il comportamento della v1 resta: senza Id se ne genera uno (guasto 777942)
{
  const senzaId = Object.assign({}, RIENTRO); delete senzaId.Id;
  const out = giro(NEW, { items: [senzaId], letti: [{}] })[0];
  check('777942 · nessun Id → generato', true, /^TR\/\d{8}\/[A-Z0-9]{16}$/.test(out.Id));
  check('777942 · marcato come generato', true, out._id_generato === true);
}

// due schede nello stesso lotto non ricevono lo stesso Id
{
  const a = Object.assign({}, RIENTRO); delete a.Id;
  const b = Object.assign({}, RIENTRO, { Time: '22:30' }); delete b.Id;
  const out = giro(NEW, { items: [a, b], letti: [{}] });
  check('lotto · due Id diversi', true, out[0].Id !== out[1].Id);
}

console.log(falliti ? '\n>>> ' + falliti + ' PROVE FALLITE' : '\n>>> tutte le prove passate');
process.exit(falliti ? 1 : 0);
