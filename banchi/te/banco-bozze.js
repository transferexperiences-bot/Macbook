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
  // ⚠️ REGOLA CAMBIATA il 21/08/2026 (v6). Fino alla v5 qui si pretendeva `n === 0`:
  // «spedito» valeva quanto «ricevuto», e tutte e tre uscivano dal registro. Il 21/08
  // (esecuzione 781233) quella regola ha fatto sparire due transfer veri: spediti in tre,
  // ricevuta di uno, registro svuotato di tutti e tre.
  // Dalla v6 lo scarto fra spediti e ricevuti RESTA in registro, marcato `da_verificare`.
  // Il doppione che la v4 temeva oggi non è più possibile: «Assegna Id» garantisce l'Id su
  // ogni riga e Google Sheets scrive in appendOrUpdate su quell'Id — rimandare la stessa
  // scheda aggiorna la stessa riga. Tenere costa un promemoria, buttare costa un transfer.
  prova('la v6 tiene il terzo, ma marcato «da verificare» — non come bozza mai partita',
    v5.n === 1 && v5.bozze[0].id === 'TR/18082026/G5HWU5BMPTIVTWY1' && v5.bozze[0].da_verificare === true,
    JSON.stringify(v5.bozze));
  prova('e lo dice anche a valle, in chiaro',
    v5.prove && v5.prove.da_ricevuta === 2 && v5.prove.spediti === 3 &&
    v5.prove.da_verificare.length === 1 && v5.da_verificare.length === 1,
    JSON.stringify(v5.prove));
  prova('i due confermati dalla ricevuta escono davvero',
    !v5.bozze.map(b => b.id).includes('TR/18082026/RT03SZHEGW3YORCP'),
    JSON.stringify(v5.bozze.map(b => b.id)));
}

console.log('\n1-bis) 781233 — «salva tutte le bozze»: 3 spediti, la ricevuta ne porta 1');
{
  // Il guasto vero del 21/08 sera. Cala Ponte Hotel → Otella torna nella ricevuta (riga
  // 1289); i due Masseria Tarsia Morisco ↔ Monopoli no. Con la v5 sparivano tutti e tre.
  const I1 = 'TR/21082026/WCHHH6H8G4A5FJDW';
  const I2 = 'TR/21082026/FFOPQU5EARO5XFRH';
  const I3 = 'TR/21082026/H0IQMZ09HP0RZ21Y';
  const reg = {};
  for (const [id, tratta] of [[I1, 'Cala Ponte Hotel → Otella'],
                              [I2, 'Masseria Tarsia Morisco → Monopoli'],
                              [I3, 'Monopoli → Masseria Tarsia Morisco']]) {
    reg[id] = { b: '🚐 TRANSFER\n📅 Data: 21/08/2026\n📍 ' + tratta + '\n🆔 Id: ' + id, ts: 1787332255653 };
  }
  const ctx = {
    'Normalizer (kind/text/file_id)': [{ chat_id: '522233722', kind: 'callback',
      text: 'salva tutte le bozze in sospeso', originalMessageText: '⏳ Restano 3 bozze aperte' }],
    'Code in JavaScript': [{ agent_output_clean: '🚐 TRANSFER 1\n🆔 Id: ' + I1, intent: 'conferma' }],
    'Leggi Bozze': [{ chatd: 'BOZZE|522233722', Dati: JSON.stringify(reg) }],
    'Salva via Parse transfer (intent)': [{ rows: JSON.stringify([{ row_number: 1289, Id: I1 }]) }],
    'Componi Payload Salvataggio': [{ payload_schede: [I1, I2, I3] }],
  };
  const r = esegui(V5, ctx);
  const ids = r.bozze.map(b => b.id).sort();
  prova('quello confermato dalla ricevuta esce', !ids.includes(I1), JSON.stringify(ids));
  prova('i due NON confermati restano — non spariscono più',
    ids.includes(I2) && ids.includes(I3), JSON.stringify(ids));
  prova('e sono marcati «da verificare», non «bozza mai salvata»',
    r.bozze.every(b => b.da_verificare === true && b.spedito_volte === 1),
    JSON.stringify(r.bozze.map(b => ({ id: b.id, v: b.da_verificare, s: b.spedito_volte }))));
  prova('la diagnostica dice esattamente cosa è successo',
    r.prove.spediti === 3 && r.prove.da_ricevuta === 1 && r.prove.da_verificare.length === 2,
    JSON.stringify(r.prove));
  // rimandarli non crea doppioni: stesso Id, appendOrUpdate aggiorna la stessa riga
  const ctx2 = JSON.parse(JSON.stringify(ctx));
  ctx2['Leggi Bozze'] = [{ chatd: 'BOZZE|522233722', Dati: r.dati_json }];
  ctx2['Salva via Parse transfer (intent)'] = [{ rows: JSON.stringify([{ row_number: 1290, Id: I2 }, { row_number: 1291, Id: I3 }]) }];
  ctx2['Componi Payload Salvataggio'] = [{ payload_schede: [I2, I3] }];
  const r2 = esegui(V5, ctx2);
  prova('al secondo giro, confermati, il registro si svuota', r2.n === 0, JSON.stringify(r2.bozze));
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

// ============================================================================
// 4) 20/08/2026 — «perché le bozze mi vengono ripresentate anche quando le ho scartate»
// Prima usciva dal registro solo lo scarto scritto esattamente «annulla…». Ogni altro
// modo di dire di no lasciava la bozza dentro, e il promemoria gliela rimetteva davanti.
// Qui si prova il gesto in tutte le sue forme, e — cosa che conta uguale — si prova che
// una CORREZIONE non fa sparire la bozza.
// ============================================================================
console.log('\n4) lo scarto vale comunque sia detto, la correzione non è uno scarto');
{
  const ID = 'TR/20082026/SX8AF1YRPT2R6RUM';
  const SCHEDA = [
    '🚐 TRANSFER 1',
    '📅 Data: 20/08/2026 (giovedì)',
    '🕐 Ora: 12:00',
    '📍 Da: Covo Dei Saraceni',
    '🎯 Per: Ospedale di Monopoli/Fasano',
    '🏢 Fornitori: Covo Dei Saraceni',
    '💳 Modalità: Incassare',
    '🚖 Autista: Claudio Moccia',
    '💰 Tariffa: 50',
    '🆔 Id: ' + ID,
  ].join('\n');
  // il promemoria vero di «Bozze - Chiedi cosa salvare»: riga compatta, SENZA Id
  const PROMEMORIA = [
    "⏳ Resta 1 bozza aperta — sul gestionale non c'è.",
    '',
    '1️⃣ 20/08/2026 · 12:00 · Ospedale di Monopoli/Fasano · 50€',
    '',
    'Che faccio?',
  ].join('\n');
  const REG = JSON.stringify({ [ID]: { b: SCHEDA, ts: Date.now() } });

  const giro = (userTxt, omTxt, risposta) => esegui(V5, {
    'Normalizer (kind/text/file_id)': [{ chat_id: '522233722', text: userTxt, originalMessageText: omTxt }],
    'Code in JavaScript': [{ agent_output_clean: risposta, intent: 'chat' }],
    'Leggi Bozze': [{ chatd: 'BOZZE|522233722', Dati: REG }],
    'Salva via Parse transfer (intent)': [{}],
    'Componi Payload Salvataggio': [{ payload_schede: [] }],
  });
  const esce = (nome, userTxt, omTxt, risposta) =>
    prova(nome, giro(userTxt, omTxt, risposta || 'Fatto.').n === 0);
  const resta = (nome, userTxt, omTxt, risposta) =>
    prova(nome, giro(userTxt, omTxt, risposta || 'Ok.').n === 1);

  esce('tap «Annulla» sulla scheda', 'Annulla', SCHEDA);
  esce('tap «Scarta»', 'Scarta', SCHEDA);
  esce('tap «No»', 'No', SCHEDA, 'Va bene, non la salvo.');
  esce('scrive «scartala»', 'scartala', SCHEDA);
  esce('scrive «lascia perdere»', 'lascia perdere', SCHEDA);
  esce('scrive «no lascia perdere»', 'no lascia perdere', SCHEDA);
  esce('tap «🗑️ Scarta tutte» dal promemoria', 'annulla tutte le bozze', PROMEMORIA);
  esce('tap «Annulla» sul promemoria, che gli Id non li stampa', 'Annulla', PROMEMORIA);
  esce('bottone Annulla nuovo: il comando porta l\'Id', 'cancella ' + ID, SCHEDA);

  resta('«no, il volo è alle 9» è una correzione, non uno scarto', 'no il volo è alle 9', SCHEDA);
  resta('«no il nome è Angela» è una correzione', 'no il nome è Angela', SCHEDA);
  resta('«non è quello» non è uno scarto', 'non è quello', SCHEDA);
  resta('«cambia l\'ora» non è uno scarto', "cambia l'ora", SCHEDA);
  resta('«sì» non è uno scarto', 'sì', SCHEDA);

  // indicarne UNA fra tante non vuol dire scartarle tutte
  const ID2 = 'TR/20082026/WO3PYJZOJTPBDDON';
  const SCHEDA2 = SCHEDA.replace(ID, ID2).replace('🕐 Ora: 12:00', '🕐 Ora: 18:30');
  const DUE = SCHEDA + '\n\n|||\n\n' + SCHEDA2;
  const v = esegui(V5, {
    'Normalizer (kind/text/file_id)': [{ chat_id: '522233722', text: 'scarta la seconda', originalMessageText: DUE }],
    'Code in JavaScript': [{ agent_output_clean: 'Quale delle due?', intent: 'chat' }],
    'Leggi Bozze': [{ chatd: 'BOZZE|522233722', Dati: JSON.stringify({
      [ID]: { b: SCHEDA, ts: Date.now() }, [ID2]: { b: SCHEDA2, ts: Date.now() } }) }],
    'Salva via Parse transfer (intent)': [{}],
    'Componi Payload Salvataggio': [{ payload_schede: [] }],
  });
  prova('«scarta la seconda» non porta via tutte e due le bozze', v.n === 2, 'n=' + v.n);
}

console.log('\n=============================');
console.log('  ' + ok + ' passate, ' + ko + ' fallite');
console.log('=============================');
process.exit(ko ? 1 : 0);
