// ============================================================================
// BANCO — NON REGRESSIONE  ·  22/08/2026
// Le reti di sicurezza già pagate a caro prezzo devono reggere anche con lo stato nuovo.
// ============================================================================
const { runNode } = require('./harness.js');
const fs = require('fs');
const NEW_B = __dirname + '/srv-agg.js';
const NEW_P = __dirname + '/srv-com.js';
const fx = (n) => JSON.parse(fs.readFileSync(__dirname + '/fx-' + n + '.json', 'utf8'));

let falliti = 0;
const check = (nome, atteso, avuto) => {
  const ok = JSON.stringify(atteso) === JSON.stringify(avuto);
  if (!ok) falliti++;
  console.log((ok ? '  ok   ' : '  FALLITO ') + nome +
    (ok ? '' : '\n         atteso: ' + JSON.stringify(atteso) + '\n         avuto : ' + JSON.stringify(avuto)));
};

const SCHEDA = (id, ora) => [
  '🚐 TRANSFER', '📅 Data: 22/08/2026 (sabato)', '🕐 Ora: ' + ora,
  '📍 Da: Masseria le Torri', '🎯 Per: Bari Airport', '🏢 Fornitori: Masseria le Torri',
  '💳 Modalità: Incassare', '💰 Tariffa: 120', '🆔 Id: ' + id].join('\n');

const A = 'TR/22082026/AAAAAAAAAAAAAAAA';
const B = 'TR/22082026/BBBBBBBBBBBBBBBB';

function giro(opts) {
  return runNode(NEW_B, {
    json: {},
    nodes: {
      'Normalizer (kind/text/file_id)': { chat_id: '522233722', text: opts.testo || '', originalMessageText: opts.om || '' },
      'Code in JavaScript': { agent_output_clean: opts.out || '', intent: opts.intent || 'chat' },
      'Leggi Bozze': { chatd: 'BOZZE|522233722', Dati: JSON.stringify(opts.registro || {}) },
      'Salva via Parse transfer (intent)': opts.ricevuta !== undefined ? opts.ricevuta : {},
      'Componi Payload Salvataggio': { payload_schede: opts.spediti || [] },
    },
  })[0].json;
}
const reg = (r) => JSON.parse(r.dati_json);

console.log('\n=== NON REGRESSIONE ===');

// 1) 730335 (14/08): la sola CITAZIONE di un Id non è mai una prova di salvataggio.
{
  const r0 = giro({ out: SCHEDA(A, '10:00') });
  const r1 = giro({
    registro: reg(r0), intent: 'conferma',
    out: 'Ok, procedo con ' + A + ' — dimmi tu.',
    ricevuta: {}, spediti: [],
  });
  check('730335 · una citazione non fa sparire la bozza', 1, r1.n);
}

// 2) La ricevuta è l'unica prova: marca salvata, e la scheda non torna al recap dopo.
{
  const r0 = giro({ out: SCHEDA(A, '10:00') });
  const r1 = giro({
    registro: reg(r0), intent: 'conferma', out: SCHEDA(A, '10:00'),
    ricevuta: { rows: [{ Id: A }] }, spediti: [A],
  });
  check('ricevuta · 0 aperte, 1 salvata', [0, 1], [r1.n, r1.salvate]);
  const r2 = giro({ registro: reg(r1), out: 'Recap:\n' + SCHEDA(A, '10:00') });
  check('ricevuta · la ristampa NON la riapre', 0, r2.n);
}

// 3) Se il contenuto cambia davvero, è una modifica: la scheda torna aperta.
{
  const r0 = giro({ out: SCHEDA(A, '10:00') });
  const r1 = giro({ registro: reg(r0), intent: 'conferma', out: SCHEDA(A, '10:00'), ricevuta: { rows: [{ Id: A }] }, spediti: [A] });
  const r2 = giro({ registro: reg(r1), out: SCHEDA(A, '18:45') });
  check('modifica · orario cambiato → torna aperta', 1, r2.n);
}

// 4) v6 (781233): spedito ma non confermato dalla ricevuta resta APERTO.
{
  const r0 = giro({ out: SCHEDA(A, '10:00') + '\n\n ||| \n\n' + SCHEDA(B, '16:30') });
  const r1 = giro({
    registro: reg(r0), intent: 'conferma',
    out: SCHEDA(A, '10:00') + '\n\n ||| \n\n' + SCHEDA(B, '16:30'),
    ricevuta: { rows: [{ Id: A }] }, spediti: [A, B],
  });
  check('781233 · lo spedito non confermato resta aperto', [B], r1.bozze.map((b) => b.id));
  check('781233 · marcato da_verificare', true, r1.bozze[0].da_verificare);
  check('781233 · e A risulta salvato', 1, r1.salvate);
}

// 5) 20/08: lo scarto deciso da Agostino svuota comunque il registro.
{
  const r0 = giro({ out: SCHEDA(A, '10:00') + '\n\n ||| \n\n' + SCHEDA(B, '16:30') });
  const r1 = giro({ registro: reg(r0), testo: 'annulla tutte le bozze' });
  check('scarto · «annulla tutte le bozze» svuota', 0, r1.n);
}

// 6) Il fallback dal registro NON tocca le salvate e NON scatta su «cancella».
{
  const registro = {};
  registro[A] = { b: SCHEDA(A, '10:00'), ts: Date.now(), st: 'salvata', sv: Date.now() };
  registro[B] = { b: SCHEDA(B, '16:30'), ts: Date.now() };
  const ctx = (intent) => ({
    json: { intent: intent, recap_verificato: '' },
    nodes: {
      'Normalizer (kind/text/file_id)': { chat_id: '1', text: 'conferma', originalMessageText: '' },
      'AI Agent2': { output: 'Salvataggio in corso...' },
      'Leggi Bozze': { chatd: 'BOZZE|1', Dati: JSON.stringify(registro) },
    },
  });
  check('fallback · spedisce solo la bozza aperta', [B], runNode(NEW_P, ctx('conferma'))[0].json.payload_schede);
  check('fallback · su «cancella» non scatta', [], runNode(NEW_P, ctx('cancella'))[0].json.payload_schede);
  check('fallback · su «modifica» non scatta', [], runNode(NEW_P, ctx('modifica'))[0].json.payload_schede);
}

// 7) Registro vecchio (voci senza `st`): vanno lette come aperte.
{
  const vecchio = {}; vecchio[A] = { b: SCHEDA(A, '10:00'), ts: Date.now() };
  const r = giro({ registro: vecchio });
  check('compatibilità · una voce vecchia resta aperta', 1, r.n);
}

console.log(falliti ? '\n>>> ' + falliti + ' PROVE FALLITE' : '\n>>> tutte le prove passate');
process.exit(falliti ? 1 : 0);
