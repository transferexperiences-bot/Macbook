#!/usr/bin/env node
// Banco di prova offline del nodo "Aggiorna Bozze" (Prenotazioni Transfer 6.0).
//   node banchi/te/banco-bozze.js
// Confronta la v4 (in produzione fino al 18/08) con la v5, sugli stessi dati veri:
//   · 760661 (18/08 23:21) — 3 transfer confermati e salvati, ricevuta incompleta
//   · 730335 (14/08 19:18) — due Id solo CITATI in prosa: non devono uscire dal registro
const fs = require('fs');
const path = require('path');
const V5 = fs.readFileSync(path.join(__dirname, '../../backups/n8n/prenotazioni/aggiorna-bozze.js'), 'utf8');
const V4 = fs.readFileSync(path.join(__dirname, '../../backups/n8n/prenotazioni/aggiorna-bozze.v4.js'), 'utf8');

function esegui(codice, ctx) {
  const $ = (nome) => {
    if (!(nome in ctx)) throw new Error('nodo non previsto: ' + nome);
    const items = ctx[nome].map(j => ({ json: j }));
    return { first: () => items[0], all: () => items };
  };
  return new Function('$', codice)($)[0].json;
}

// ---------------------------------------------------------------- 760661
const SCHEDE_760661 = [
  '🚐 TRANSFER 1',
  '📅 Data: 19/08/2026 (mercoledì)',
  '🕐 Ora: 09:15',
  '📍 Da: https://goo.gl/maps/ZmtwevrCXVFfxF279',
  '🎯 Per: Porto di Savelletri (https://maps.app.goo.gl/W1NMNfwxU9hQnwhk6)',
  '🏢 Fornitori: Tedi tour operator',
  '💳 Modalità: Fattura',
  '🚗 Veicolo: Sprinter 9 posti',
  '💰 Tariffa: 380',
  '🆔 Id: TR/18082026/G5HWU5BMPTIVTWY1',
  '',
  ' |||',
  '',
  '🚐 TRANSFER 2',
  '📅 Data: 19/08/2026 (mercoledì)',
  '🕐 Ora: 17:00',
  '📍 Da: Porto di Savelletri (https://maps.app.goo.gl/W1NMNfwxU9hQnwhk6)',
  '🎯 Per: Polignano a Mare',
  '🏢 Fornitori: Tedi tour operator',
  '💳 Modalità: Fattura',
  '🚗 Veicolo: Sprinter 9 posti',
  '🆔 Id: TR/18082026/RT03SZHEGW3YORCP',
  '',
  ' |||',
  '',
  '🚐 TRANSFER 3',
  '📅 Data: 19/08/2026 (mercoledì)',
  '🕐 Ora: 22:00',
  '📍 Da: Polignano a Mare',
  '🎯 Per: Trullo Ermes',
  '🏢 Fornitori: Tedi tour operator',
  '💳 Modalità: Fattura',
  '🚗 Veicolo: Sprinter 9 posti',
  '🆔 Id: TR/18082026/MC9T0W28N9AYZG9O',
].join('\n');

// la ricevuta vera di quel turno: DUE righe su tre (manca quella con la tariffa 380)
const RICEVUTA_760661 = JSON.stringify([
  { row_number: 1136, Data: 'mer 19 agosto 2026', Time: '17:00', Tariffa: 82, Id: 'TR/18082026/RT03SZHEGW3YORCP' },
  { row_number: 1137, Data: 'mer 19 agosto 2026', Time: '22:00', Tariffa: 132, Id: 'TR/18082026/MC9T0W28N9AYZG9O' },
]);

const CTX_760661 = {
  'Normalizer (kind/text/file_id)': [{ chat_id: '522233722', text: 'Salva subito', originalMessageText: SCHEDE_760661 }],
  'Code in JavaScript': [{ agent_output_clean: SCHEDE_760661, intent: 'conferma' }],
  'Leggi Bozze': [{ chatd: 'BOZZE|522233722', Dati: '' }],
  'Salva via Parse transfer (intent)': [{ rows: RICEVUTA_760661 }],
  'Componi Payload Salvataggio': [{ payload_schede: [
    'TR/18082026/G5HWU5BMPTIVTWY1', 'TR/18082026/RT03SZHEGW3YORCP', 'TR/18082026/MC9T0W28N9AYZG9O'] }],
};

// ---------------------------------------------------------------- 730335
// Il 14/08 il messaggio salvava UNA scheda e CITAVA gli altri due Id in una riga di prosa.
// Quei due erano già in registro e devono RESTARCI: citarli non è salvarli.
const ID_A = 'TR/14082026/TN5VRL41P24ICIVQ';
const ID_B = 'TR/14082026/XQD6MY54YI9848DJ';
const ID_C = 'TR/14082026/ZZ11AA22BB33CC44';
const SCHEDA_C = [
  '🚐 TRANSFER 1',
  '📅 Data: 14/08/2026',
  '🕐 Ora: 20:00',
  '📍 Da: Bari Airport',
  '🎯 Per: Monopoli',
  '🏢 Fornitori: Transfer Experience',
  '🆔 Id: ' + ID_C,
  '',
  '⏳ In sospeso: ' + ID_A + ' e ' + ID_B,
].join('\n');
const REGISTRO_PRIMA = JSON.stringify({
  [ID_A]: { b: '🚐 TRANSFER\n📅 Data: 14/08/2026\n🕐 Ora: 21:00\n🎯 Per: Fasano\n🆔 Id: ' + ID_A, ts: Date.now() },
  [ID_B]: { b: '🚐 TRANSFER\n📅 Data: 14/08/2026\n🕐 Ora: 22:00\n🎯 Per: Ostuni\n🆔 Id: ' + ID_B, ts: Date.now() },
});
const CTX_730335 = {
  'Normalizer (kind/text/file_id)': [{ chat_id: '522233722', text: 'Salva subito', originalMessageText: SCHEDA_C }],
  'Code in JavaScript': [{ agent_output_clean: SCHEDA_C, intent: 'conferma' }],
  'Leggi Bozze': [{ chatd: 'BOZZE|522233722', Dati: REGISTRO_PRIMA }],
  'Salva via Parse transfer (intent)': [{ rows: JSON.stringify([{ row_number: 900, Id: ID_C }]) }],
  'Componi Payload Salvataggio': [{ payload_schede: [ID_C] }],
};

let ok = 0, ko = 0;
function prova(nome, cond, dett) {
  if (cond) { ok++; console.log('  ✅ ' + nome); }
  else { ko++; console.log('  ❌ ' + nome + (dett ? '\n       → ' + dett : '')); }
}

console.log('\n1) 760661 — tre transfer confermati, tutti e tre sul gestionale');
{
  const v4 = esegui(V4, CTX_760661);
  const v5 = esegui(V5, CTX_760661);
  console.log('   v4 (quella che girava): ' + v4.n + ' bozza/e rimaste → ' + v4.bozze.map(b => b.id).join(', '));
  console.log('   v5 (nuova):             ' + v5.n + ' bozza/e rimaste');
  prova('la v4 riproduce il guasto (lasciava aperto il transfer già salvato)',
    v4.n === 1 && v4.bozze[0].id === 'TR/18082026/G5HWU5BMPTIVTWY1');
  prova('la v5 non lascia bozze aperte: niente promemoria, niente bottone doppio', v5.n === 0,
    JSON.stringify(v5.bozze));
  prova('la v5 conta le prove di tutte e due le fonti', v5.prove && v5.prove.provati === 3 && v5.prove.da_ricevuta === 2,
    JSON.stringify(v5.prove));
}

console.log('\n2) 730335 — un Id CITATO in prosa non è un Id salvato');
{
  const v5 = esegui(V5, CTX_730335);
  const ids = v5.bozze.map(b => b.id).sort();
  prova('i due transfer solo citati restano in bozza', ids.length === 2 && ids.includes(ID_A) && ids.includes(ID_B),
    JSON.stringify(ids));
  prova('quello davvero salvato esce dal registro', !ids.includes(ID_C));
}

console.log('\n3) regressioni: il resto del registro si comporta come prima');
{
  // niente salvataggio in corso: la scheda proposta entra in bozza
  const ctx = JSON.parse(JSON.stringify(CTX_760661));
  ctx['Code in JavaScript'] = [{ agent_output_clean: SCHEDE_760661, intent: 'chat' }];
  ctx['Salva via Parse transfer (intent)'] = [{}];
  ctx['Componi Payload Salvataggio'] = [{ payload_schede: [] }];
  const v5 = esegui(V5, ctx);
  prova('una proposta non confermata resta in bozza (3 schede)', v5.n === 3, 'n=' + v5.n);
  prova('salvando = false', v5.salvando === false);

  // «annulla tutte le bozze»
  const ctx2 = JSON.parse(JSON.stringify(ctx));
  ctx2['Normalizer (kind/text/file_id)'] = [{ chat_id: '522233722', text: 'annulla tutte le bozze', originalMessageText: SCHEDE_760661 }];
  prova('«annulla tutte le bozze» svuota il registro', esegui(V5, ctx2).n === 0);

  // «niente» secco: le schede di questo turno restano, il resto va via
  const ctx3 = JSON.parse(JSON.stringify(ctx));
  ctx3['Leggi Bozze'] = [{ chatd: 'BOZZE|522233722', Dati: REGISTRO_PRIMA }];
  ctx3['Normalizer (kind/text/file_id)'] = [{ chat_id: '522233722', text: 'niente', originalMessageText: '' }];
  const v53 = esegui(V5, ctx3);
  prova('«niente» tiene solo le schede di questo turno', v53.n === 3, JSON.stringify(v53.bozze.map(b => b.id)));
}

console.log('\n=============================');
console.log('  ' + ok + ' passate, ' + ko + ' fallite');
console.log('=============================');
process.exit(ko ? 1 : 0);
