// ============================================================================
// BANCO — BOZZE v8  ·  22/08/2026 pomeriggio
// Quattro guasti veri del 22/08, tutti riprodotti sul codice in produzione:
//   A) Inietta Storage passa all'agente anche le schede gia salvate (regressione v7)
//   B) 788007 — schede scritte su una riga sola: invisibili al codice, salvataggio a meta
//   C) 787808 — richiesta di Davide descritta ma senza scheda: nessuna traccia
//   D) il promemoria scrive solo la destinazione: su un A/R non si capisce quale sia
// ============================================================================
const { runNode } = require('./harness.js');
const fs = require('fs');
const fx = (n) => JSON.parse(fs.readFileSync(__dirname + '/fx-' + n + '.json', 'utf8'));

let falliti = 0;
const check = (nome, atteso, avuto) => {
  const ok = JSON.stringify(atteso) === JSON.stringify(avuto);
  if (!ok) falliti++;
  console.log((ok ? '  ok   ' : '  FALLITO ') + nome +
    (ok ? '' : '\n         atteso: ' + JSON.stringify(atteso) + '\n         avuto : ' + JSON.stringify(avuto)));
};

const VECCHIO_A = './node-aggiorna-bozze.new.js', NUOVO_A = './srv-agg.js';
const VECCHIO_C = './node-componi-payload.new.js',  NUOVO_C = './srv-com.js';
const VECCHIO_I = './node-inietta.orig.js', NUOVO_I = './srv-ini.js';
const VECCHIO_Q = './node-chiedi.orig.js',  NUOVO_Q = './srv-chi.js';

const ctxAgg = (d, extra) => Object.assign({
  json: {},
  nodes: {
    'Normalizer (kind/text/file_id)': d.norm,
    'Code in JavaScript': d.code,
    'Leggi Bozze': d.leggiBozze,
    'Salva via Parse transfer (intent)': {},
    'Componi Payload Salvataggio': { payload_schede: [] },
  },
}, extra || {});
const ctxCom = (d) => ({ json: d.code, nodes: {
  'Normalizer (kind/text/file_id)': d.norm, 'AI Agent2': { output: d.aiOut }, 'Leggi Bozze': d.leggiBozze } });

// ---------------------------------------------------------------- A
console.log('\n=== A · Inietta Storage passava anche le schede salvate ===');
{
  const SCH = (id) => '🚐 TRANSFER\n📅 Data: 22/08/2026\n📍 Da: A\n🎯 Per: B\n🆔 Id: ' + id;
  const registro = {
    'TR/22082026/AAAAAAAAAAAAAAAA': { b: SCH('TR/22082026/AAAAAAAAAAAAAAAA'), ts: Date.now(), st: 'salvata' },
    'TR/22082026/BBBBBBBBBBBBBBBB': { b: SCH('TR/22082026/BBBBBBBBBBBBBBBB'), ts: Date.now() },
  };
  const ctx = (f) => runNode(f, { json: {}, nodes: {
    'Leggi Storage': [{}], 'Leggi Bozze': { Dati: JSON.stringify(registro) }, '📋 System Prompt v6.36': { systemPrompt: '', original_text: '', clean_text: '', kind: 'text' },
  }, input: [{}] })[0].json.bozze_dati;
  check('produzione: all\'agente arrivano tutte e due (anche la salvata)', 2, (ctx(VECCHIO_I).match(/🆔/g) || []).length);
  check('nuovo: arriva solo la bozza aperta', 1, (ctx(NUOVO_I).match(/🆔/g) || []).length);
  check('nuovo: ed e proprio quella aperta', true, ctx(NUOVO_I).indexOf('BBBBBBBBBBBBBBBB') > -1);
}

// ---------------------------------------------------------------- B
console.log('\n=== B · 788007 · schede su una riga sola ===');
{
  const d = fx('788007');
  check('produzione: ne spedisce 1 su 2 (il guasto)', 1, runNode(VECCHIO_C, ctxCom(d))[0].json.payload_schede.length);
  const o = runNode(NUOVO_C, ctxCom(d))[0].json;
  check('nuovo: le spedisce tutte e due', 2, o.payload_schede.length);
  check('nuovo: c\'e anche l\'andata rimasta fuori', true, o.payload_schede.indexOf('TR/22082026/P4RII6CXR7K72UVO') > -1);
  check('nuovo: il payload porta le schede riaperte', true, /Da:\s*Polignano a Mare/.test(o.payload_salvataggio));
  check('nuovo: e la destinazione giusta, senza la freccia', true, /Per:\s*Cala Ponte Marina/.test(o.payload_salvataggio));
}

// ---------------------------------------------------------------- C
console.log('\n=== C · 787808 · la richiesta di Davide ===');
{
  const d = fx('787808');
  check('produzione: nessuna traccia (il guasto)', 0, runNode(VECCHIO_A, ctxAgg(d))[0].json.n);
  const o = runNode(NUOVO_A, ctxAgg(d))[0].json;
  check('nuovo: la richiesta viene trattenuta', 1, o.n);
  check('nuovo: marcata come richiesta, non come bozza', 'richiesta', o.bozze[0].tipo);
  const b = o.bozze[0].scheda;
  check('nuovo: tiene la data', true, /07\/09\/2026/.test(b));
  check('nuovo: tiene il volo', true, /AF1288/.test(b));
  check('nuovo: tiene la struttura', true, /Dimora Brando/.test(b));
  check('nuovo: non si spedisce mai da sola al gestionale', [],
    runNode(NUOVO_C, { json: { intent: 'conferma' }, nodes: {
      'Normalizer (kind/text/file_id)': { chat_id: '1', text: 'conferma', originalMessageText: '' },
      'AI Agent2': { output: 'Salvataggio in corso...' },
      'Leggi Bozze': { Dati: o.dati_json } } })[0].json.payload_schede);

  // quando arriva la scheda vera, la richiesta sparisce da sola
  const scheda = '🚐 TRANSFER\n📅 Data: 07/09/2026\n🕐 Ora: 10:00\n📍 Da: Dimora Brando\n🎯 Per: Arco Marchesale\n✈️ Volo: AF1288\n💰 Tariffa: 90\n🆔 Id: TR/22082026/CCCCCCCCCCCCCCCC';
  const dopo = runNode(NUOVO_A, { json: {}, nodes: {
    'Normalizer (kind/text/file_id)': { chat_id: '522233722', text: 'ok', originalMessageText: '' },
    'Code in JavaScript': { agent_output_clean: scheda, intent: 'chat' },
    'Leggi Bozze': { Dati: o.dati_json },
    'Salva via Parse transfer (intent)': {}, 'Componi Payload Salvataggio': { payload_schede: [] } } })[0].json;
  check('nuovo: la scheda vera la sostituisce (non restano due voci)', 1, dopo.n);
  check('nuovo: e quel che resta e la scheda, non la richiesta', 'bozza', dopo.bozze[0].tipo);
}

// ---------------------------------------------------------------- D
console.log('\n=== D · il promemoria ===');
{
  const bozza = (id, ora, da, per, extra) => Object.assign({ id: id, tipo: 'bozza', da_verificare: false,
    scheda: `🚐 TRANSFER\n📅 Data: 23/08/2026 (domenica)\n🕐 Ora: ${ora}\n📍 Da: ${da}\n🎯 Per: ${per}\n💰 Tariffa: DA DEFINIRE\n🆔 Id: ${id}` }, extra || {});
  const src = { salvando: true, chat_id: '1', bozze: [bozza('TR/22082026/P4RII6CXR7K72UVO', '15:30', 'Polignano a Mare', 'Cala Ponte Marina')] };
  const vecchio = runNode(VECCHIO_Q, { nodes: { 'Aggiorna Bozze': src } })[0].json.telegram.text;
  check('produzione: scrive solo l\'arrivo', false, /Polignano a Mare/.test(vecchio));
  const nuovo = runNode(NUOVO_Q, { nodes: { 'Aggiorna Bozze': src } })[0].json.telegram.text;
  check('nuovo: scrive la tratta intera', true, /Polignano a Mare → Cala Ponte Marina/.test(nuovo));

  // spedita ma non confermata: non si dice «sul gestionale non c'e»
  const srcV = { salvando: true, chat_id: '1', bozze: [bozza('TR/1', '15:30', 'A', 'B', { da_verificare: true })] };
  const nv = runNode(NUOVO_Q, { nodes: { 'Aggiorna Bozze': srcV } })[0].json.telegram.text;
  check('nuovo: la spedita-non-confermata non e dichiarata assente', false, /sul gestionale non c/.test(nv));
  check('nuovo: e lo dice com\'e', true, /non me l'ha confermata/.test(nv));

  // una richiesta non offre «Salva»
  const srcR = { salvando: true, chat_id: '1', bozze: [Object.assign(bozza('REQ|07092026|af1288', '', 'Dimora Brando', 'Arco'), { tipo: 'richiesta' })] };
  const nr = runNode(NUOVO_Q, { nodes: { 'Aggiorna Bozze': srcR } })[0].json;
  check('nuovo: la richiesta ha «Riprendi», non «Salva»', true, /Riprendi/.test(nr.replyMarkupJson) && !/"text":"1️⃣ Salva/.test(nr.replyMarkupJson));
  check('nuovo: callback entro i 64 byte di Telegram', true,
    JSON.parse(nr.replyMarkupJson).inline_keyboard.every((r) => r.every((b2) => Buffer.byteLength(b2.callback_data, 'utf8') <= 64)));
}

console.log(falliti ? '\n>>> ' + falliti + ' PROVE FALLITE' : '\n>>> tutte le prove passate');
process.exit(falliti ? 1 : 0);
