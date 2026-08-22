// ============================================================================
// BANCO — REGISTRO BOZZE CON STATO  ·  22/08/2026
// Dati veri delle esecuzioni 785749 (conferma a vuoto) e 785719 (recap che riapre
// le schede gia salvate). Prima si riproduce il guasto sul codice IN PRODUZIONE,
// poi si verifica che il codice nuovo lo chiuda.
// ============================================================================
const { runNode } = require('./harness.js');
const fs = require('fs');
const fx = (n) => JSON.parse(fs.readFileSync(__dirname + '/fx-' + n + '.json', 'utf8'));

let falliti = 0;
function check(nome, atteso, avuto) {
  const ok = JSON.stringify(atteso) === JSON.stringify(avuto);
  if (!ok) falliti++;
  console.log((ok ? '  ok   ' : '  FALLITO ') + nome +
    (ok ? '' : '\n         atteso: ' + JSON.stringify(atteso) + '\n         avuto : ' + JSON.stringify(avuto)));
}

// ---------- contesto di Componi Payload Salvataggio ----------
function ctxPayload(f, nodoPayload) {
  const d = fx(f);
  return {
    json: d.code,
    nodes: {
      'Normalizer (kind/text/file_id)': d.norm,
      'AI Agent2': { output: d.aiOut },
      'Leggi Bozze': d.leggiBozze,
    },
  };
}

// ---------- contesto di Aggiorna Bozze ----------
function ctxBozze(f, opts) {
  const d = fx(f);
  opts = opts || {};
  return {
    json: {},
    nodes: {
      'Normalizer (kind/text/file_id)': d.norm,
      'Code in JavaScript': d.code,
      'Leggi Bozze': d.leggiBozze,
      'Salva via Parse transfer (intent)': opts.ricevuta || {},
      'Componi Payload Salvataggio': opts.payload || { payload_schede: [] },
    },
  };
}

const ORIG_P = __dirname + '/node-componi-payload.orig.js';
const ORIG_B = __dirname + '/node-aggiorna-bozze.orig.js';
const NEW_P  = __dirname + '/node-componi-payload.v8.js';
const NEW_B  = __dirname + '/node-aggiorna-bozze.v8.js';
const esiste = (p) => fs.existsSync(p);

console.log('\n=== 1. GUASTO RIPRODOTTO — codice in produzione ===');

// 785749: "Conferma tutti", il modello risponde solo "Salvataggio in corso..."
{
  const out = runNode(ORIG_P, ctxPayload('785749'))[0].json;
  check('785749 · produzione: nessuna scheda spedita (il guasto)', [], out.payload_schede);
  const reg = Object.keys(JSON.parse(fx('785749').leggiBozze.Dati));
  check('785749 · il registro pero ne teneva 7', 7, reg.length);
}

// 785719: turno di chat, l'agente ristampa il recap -> rientrano anche le salvate
{
  const out = runNode(ORIG_B, ctxBozze('785719'))[0].json;
  check('785719 · produzione: 7 bozze aperte dopo un recap', 7, out.n);
  check('785719 · non era un turno di salvataggio', false, out.salvando);
}

if (!esiste(NEW_P) || !esiste(NEW_B)) {
  console.log('\n(codice nuovo non ancora scritto)');
  process.exit(falliti ? 1 : 0);
}

console.log('\n=== 2. CODICE NUOVO ===');

// (a) la conferma parte anche se il modello non ristampa le schede
{
  const out = runNode(NEW_P, ctxPayload('785749'))[0].json;
  check('785749 · nuovo: spedisce tutte e 7 le bozze aperte', 7, out.payload_schede.length);
  check('785749 · nuovo: origine = registro', 'registro', out.payload_origine);
  const ok = /🆔 Id: TR\/21082026\/YO2CGXFL0VC8P9RV/.test(out.payload_salvataggio);
  check('785749 · nuovo: il payload porta le schede intere', true, ok);
}

// (b) una scheda gia salvata non rientra da sola quando l'agente la ristampa
{
  const d = fx('785614');
  const ric = d.ricevuta;
  // turno di salvataggio: le 5 confermate dalla ricevuta diventano "salvate"
  const dopoSalvataggio = runNode(NEW_B, ctxBozze('785614', {
    ricevuta: ric,
    payload: { payload_schede: d.payload.payload_schede },
  }))[0].json;
  check('785614 · nuovo: nessuna bozza aperta resta', 0, dopoSalvataggio.n);
  check('785614 · nuovo: 5 marcate salvate', 5, dopoSalvataggio.salvate);

  // ora arriva il recap di 785719 con il registro appena scritto
  const d19 = fx('785719');
  const ctx = {
    json: {},
    nodes: {
      'Normalizer (kind/text/file_id)': d19.norm,
      'Code in JavaScript': d19.code,
      'Leggi Bozze': { chatd: dopoSalvataggio.chatd, Dati: dopoSalvataggio.dati_json },
      'Salva via Parse transfer (intent)': {},
      'Componi Payload Salvataggio': { payload_schede: [] },
    },
  };
  const out = runNode(NEW_B, ctx)[0].json;
  const riaperte = out.bozze.map((b) => b.id).filter((id) => d.payload.payload_schede.includes(id));
  check('785719 · nuovo: nessuna delle 5 salvate torna fra le aperte', [], riaperte);
  check('785719 · nuovo: restano aperte solo le 2 nuove', 2, out.n);
}

console.log(falliti ? '\n>>> ' + falliti + ' PROVE FALLITE' : '\n>>> tutte le prove passate');
process.exit(falliti ? 1 : 0);
