// ============================================================================
// BANCO — RIGHE MONCHE  ·  22/08/2026 sera
// Riproduce le due righe scritte male alle 17:15 (esecuzione 788297):
//   1359  Sabbiadoro -> (destinazione VUOTA)
//   1360  (data VUOTA), Polignano a Mare -> Cala Ponte Marina
// e verifica che una MODIFICA continui a passare: il parser non manda i campi che non
// stai cambiando, quindi bloccare anche quelle romperebbe ogni correzione.
// ============================================================================
const { runNode } = require('./harness.js');
const ORIG = './node-assegna-id.orig.js';
const NUOVO = './srv-assegna.js';

let falliti = 0;
const check = (nome, atteso, avuto) => {
  const ok = JSON.stringify(atteso) === JSON.stringify(avuto);
  if (!ok) falliti++;
  console.log((ok ? '  ok   ' : '  FALLITO ') + nome +
    (ok ? '' : '\n         atteso: ' + JSON.stringify(atteso) + '\n         avuto : ' + JSON.stringify(avuto)));
};
const go = (f, items) => runNode(f, { input: items, nodes: {} }).map((r) => r.json);

// riga 1359: nuova, senza destinazione
const SENZA_PER = { Data: 'sab 22 agosto 2026', Time: '17:45',
  'Transfer > Da': 'Sabbiadoro', 'Transfer < Per': '', Pax: 2, Tariffa: 60 };
// riga 1360: nuova, senza data
const SENZA_DATA = { Data: '', Time: '15:30',
  'Transfer > Da': 'Polignano a Mare', 'Transfer < Per': 'Cala Ponte Marina', Tariffa: 30 };
// una riga nuova completa
const COMPLETA = { Data: 'dom 23 agosto 2026', Time: '10:00',
  'Transfer > Da': 'Bari Airport', 'Transfer < Per': 'Polignano a Mare', Tariffa: 50 };
// una MODIFICA: porta l'Id e solo il campo che cambia
const MODIFICA = { Id: 'TR/22082026/AAAAAAAAAAAAAAAA', Tariffa: 70 };

console.log('\n=== 1. IL GUASTO, sul codice in produzione ===');
{
  const out = go(ORIG, [SENZA_PER, SENZA_DATA]);
  check('788297 · produzione: scrive tutte e due le righe monche', 2, out.length);
  check('788297 · produzione: una senza destinazione', '', out[0]['Transfer < Per']);
  check('788297 · produzione: una senza data', '', out[1]['Data']);
}

console.log('\n=== 2. CODICE NUOVO ===');
{
  const out = go(NUOVO, [SENZA_PER, SENZA_DATA]);
  check('nuovo: nessuna delle due viene scritta', 0, out.length);
}
{
  const out = go(NUOVO, [COMPLETA, SENZA_PER]);
  check('nuovo: la completa passa, la monca no', 1, out.length);
  check('nuovo: ed e proprio la completa', 'Bari Airport', out[0]['Transfer > Da']);
  check('nuovo: con un Id generato', true, /^TR\/\d{8}\/[A-Z0-9]{16}$/.test(out[0].Id));
}
{
  // la rete piu importante: una modifica NON deve mai essere bloccata
  const out = go(NUOVO, [MODIFICA]);
  check('modifica · passa anche senza Data/Da/Per', 1, out.length);
  check('modifica · e tiene il suo Id', 'TR/22082026/AAAAAAAAAAAAAAAA', out[0].Id);
}
{
  // anche una cancellazione morbida e una modifica: porta l'Id e poco altro
  const out = go(NUOVO, [{ Id: 'TR/22082026/BBBBBBBBBBBBBBBB', Allert: 'Cancellato', Note: '⛔' }]);
  check('cancellazione morbida · passa', 1, out.length);
}
{
  // il comportamento v1 resta: senza Id se ne genera uno (guasto 777942)
  const out = go(NUOVO, [COMPLETA]);
  check('777942 · nessun Id -> generato', true, out[0]._id_generato === true);
}
{
  // due righe nuove complete nello stesso lotto: Id diversi
  const out = go(NUOVO, [COMPLETA, Object.assign({}, COMPLETA, { Time: '11:00' })]);
  check('lotto · due Id diversi', true, out[0].Id !== out[1].Id);
}

console.log(falliti ? '\n>>> ' + falliti + ' PROVE FALLITE' : '\n>>> tutte le prove passate');
process.exit(falliti ? 1 : 0);
