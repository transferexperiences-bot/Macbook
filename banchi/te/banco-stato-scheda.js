#!/usr/bin/env node
// Banco dello STATO della scheda (bozza · spedita · salvata) e delle MODIFICHE.
//   node banchi/te/banco-stato-scheda.js
//
// Risponde a due domande di Agostino del 21/08:
//   «com'è possibile che per ogni nuovo transfer salvato mi rimanda anche i vecchi»
//   e la correzione di stamattina («tariffa fai 60€») che sul gestionale non è mai arrivata.
//
// Gira i tre nodi veri, in fila, sullo stesso registro:
//   Code in JavaScript → Componi Payload Salvataggio → Aggiorna Bozze
const fs = require('fs');
const path = require('path');
const B = (f) => fs.readFileSync(path.join(__dirname, '../../backups/n8n/prenotazioni/' + f), 'utf8');
const CODE = B('code-in-javascript.js');
const PAYLOAD = B('componi-payload-salvataggio.js');
const BOZZE = B('aggiorna-bozze.js');

let ok = 0, ko = 0;
const prova = (n, c, d) => { if (c) { ok++; console.log('  ✅ ' + n); } else { ko++; console.log('  ❌ ' + n + (d ? '\n       → ' + d : '')); } };

function ctxFn(ctx) {
  return (nome) => {
    if (!(nome in ctx)) throw new Error('nodo non eseguito: ' + nome);
    const items = ctx[nome].map((j) => ({ json: j }));
    return { first: () => items[0], all: () => items };
  };
}
function runCode(output, ctx) {
  const $input = { first: () => ({ json: { output } }), all: () => [{ json: { output } }] };
  const r = new Function('$input', '$', CODE)($input, ctxFn(ctx));
  return Array.isArray(r) ? r[0].json : r;
}
function runPayload($json, ctx) {
  return new Function('$', '$json', PAYLOAD)(ctxFn(ctx), $json)[0].json;
}
function runBozze(ctx) {
  return new Function('$', BOZZE)(ctxFn(ctx))[0].json;
}

// ---------------------------------------------------------------- le tre schede del 21/08
const I1 = 'TR/21082026/WCHHH6H8G4A5FJDW';
const I2 = 'TR/21082026/FFOPQU5EARO5XFRH';
const I3 = 'TR/21082026/H0IQMZ09HP0RZ21Y';
const scheda = (o) => [
  '🚐 TRANSFER',
  '📅 Data: 21/08/2026 (venerdì)',
  '🕐 Ora: ' + (o.ora || '19:45'),
  '📍 Da: ' + o.da,
  '🎯 Per: ' + o.per,
  '👥 Pax: ' + (o.pax || '2'),
  '🏢 Fornitori: ' + (o.forn || 'Cala Ponte Hotel'),
  '💳 Modalità: Fattura',
  '💰 Tariffa: ' + (o.tar || '55'),
  '🆔 Id: ' + o.id,
].join('\n');
const S1 = scheda({ id: I1, da: 'Cala Ponte Hotel', per: 'Otella', tar: '120' });
const S2 = scheda({ id: I2, da: 'Masseria Tarsia Morisco', per: 'Monopoli', ora: '20:00' });
const S3 = scheda({ id: I3, da: 'Monopoli', per: 'Masseria Tarsia Morisco', ora: '23:30' });
const recap = (...ss) => ss.join('\n\n ||| \n\n');
const NORM = (extra) => Object.assign({ chat_id: '522233722', kind: 'text', text: '', originalMessageText: '' }, extra || {});

console.log('\n1) 781233 — tre spedite, la ricevuta ne porta una');
let registro;
{
  const testo = recap(S1, S2, S3);
  const ctx = {
    'Normalizer (kind/text/file_id)': [NORM({ kind: 'callback', text: 'salva tutte le bozze in sospeso' })],
    'Code in JavaScript': [{ agent_output_clean: testo, intent: 'conferma' }],
    'Leggi Bozze': [{ chatd: 'BOZZE|522233722', Dati: '{}' }],
    'Salva via Parse transfer (intent)': [{ rows: JSON.stringify([{ row_number: 1289, Id: I1 }]) }],
    'Componi Payload Salvataggio': [{ payload_schede: [I1, I2, I3] }],
  };
  const r = runBozze(ctx);
  registro = JSON.parse(r.dati_json);
  prova('la confermata è «salvata»', registro[I1] && registro[I1].st === 'salvata', JSON.stringify(registro[I1]));
  prova('le due non confermate sono «spedita»',
    registro[I2].st === 'spedita' && registro[I3].st === 'spedita');
  prova('nessuna è sparita', Object.keys(registro).length === 3);
  prova('il promemoria elenca solo le due aperte', r.n === 2 && !r.bozze.some((b) => b.id === I1),
    JSON.stringify(r.bozze.map((b) => b.id)));
  prova('e la salvata è tracciata a parte', JSON.stringify(r.salvate) === JSON.stringify([I1]));
}

console.log('\n2) il turno dopo l\'agente ristampa TUTTE E TRE — la domanda di Agostino');
{
  const testo = recap(S1, S2, S3) + '\n\n[BUTTONS: Conferma | Annulla]';
  const ctx = {
    'Normalizer (kind/text/file_id)': [NORM({ text: 'conferma' })],
    'AI Agent2': [{ output: testo }],
    'Leggi Bozze': [{ chatd: 'BOZZE|522233722', Dati: JSON.stringify(registro) }],
  };
  const p = runPayload({ intent: 'conferma' }, ctx);
  prova('nel payload vanno SOLO le due non confermate',
    JSON.stringify(p.payload_schede.slice().sort()) === JSON.stringify([I2, I3].sort()),
    JSON.stringify(p.payload_schede));
  prova('la ristampa identica è scartata ed è scritto quale', JSON.stringify(p.payload_ristampe) === JSON.stringify([I1]));
  prova('il testo mandato al gestionale non contiene la vecchia', p.payload_salvataggio.indexOf(I1) === -1);
}

console.log('\n3) 780488 — «tariffa fai 60€» su una riga GIÀ scritta');
{
  const corretta = scheda({ id: I1, da: 'Cala Ponte Hotel', per: 'Otella', tar: '60' });
  const ctx = {
    'Leggi Bozze': [{ chatd: 'BOZZE|522233722', Dati: JSON.stringify(registro) }],
  };
  const o = runCode('Ok, corretta la tariffa.\n\n' + corretta + '\n\n[BUTTONS: Conferma | Annulla]', ctx);
  prova('il codice alza intent = modifica', o.intent === 'modifica', 'intent=' + o.intent);
  prova('e dice quale scheda', JSON.stringify(o.schede_modificate) === JSON.stringify([I1]));
  // «modifica» è già cablato allo stesso ramo di «conferma» in Switch (intent)
  const p = runPayload({ intent: 'modifica' }, {
    'Normalizer (kind/text/file_id)': [NORM({ text: 'tariffa fai 60' })],
    'AI Agent2': [{ output: corretta }],
    'Leggi Bozze': ctx['Leggi Bozze'],
  });
  prova('e la correzione entra nel payload: arriva sul gestionale',
    p.payload_schede.indexOf(I1) !== -1, JSON.stringify(p.payload_schede));
  prova('col valore nuovo', /Tariffa: 60/.test(p.payload_salvataggio));
}

console.log('\n4) la stessa scheda ristampata IDENTICA non fa niente');
{
  const ctx = { 'Leggi Bozze': [{ chatd: 'BOZZE|522233722', Dati: JSON.stringify(registro) }] };
  const o = runCode('Eccolo.\n\n' + S1 + '\n\n[BUTTONS: Conferma | Annulla]', ctx);
  prova('intent resta chat', o.intent === 'chat', 'intent=' + o.intent);
  prova('nessuna modifica dichiarata', o.schede_modificate.length === 0);
}

console.log('\n5) «tolgo il secondo»: non cancella da solo, mette il bottone');
{
  // la 2ª è salvata e in questo recap non compare più
  const reg2 = JSON.parse(JSON.stringify(registro));
  reg2[I2].st = 'salvata';
  const ctx = { 'Leggi Bozze': [{ chatd: 'BOZZE|522233722', Dati: JSON.stringify(reg2) }] };
  const o = runCode('Ok, tolgo il secondo. Resta solo questo.\n\n' + S1, ctx);
  prova('non cancella niente da solo', o.intent !== 'cancella', 'intent=' + o.intent);
  prova('segnala la riga da togliere', JSON.stringify(o.righe_da_cancellare) === JSON.stringify([I2]),
    JSON.stringify(o.righe_da_cancellare));
  const kb = JSON.parse(o.replyMarkupJson || '{}').inline_keyboard || [];
  const btn = kb.flat().find((b) => /Cancella/.test(b.text));
  prova('col bottone che porta l\'Id vero', btn && btn.callback_data === 'cancella ' + I2,
    JSON.stringify(kb));
  prova('e l\'etichetta dice quale', btn && /20:00/.test(btn.text), btn && btn.text);
  prova('lo scrive anche nel messaggio', /già sul gestionale/.test(o.agent_output_clean));
  prova('il callback sta nei 64 byte di Telegram', Buffer.byteLength(btn.callback_data, 'utf8') <= 64);
}

console.log('\n6) ricevuta completa: tutte salvate, il promemoria tace');
{
  const ctx = {
    'Normalizer (kind/text/file_id)': [NORM({ kind: 'callback', text: 'conferma' })],
    'Code in JavaScript': [{ agent_output_clean: recap(S2, S3), intent: 'conferma' }],
    'Leggi Bozze': [{ chatd: 'BOZZE|522233722', Dati: JSON.stringify(registro) }],
    'Salva via Parse transfer (intent)': [{ rows: JSON.stringify([{ Id: I2 }, { Id: I3 }]) }],
    'Componi Payload Salvataggio': [{ payload_schede: [I2, I3] }],
  };
  const r = runBozze(ctx);
  const reg = JSON.parse(r.dati_json);
  prova('tre schede, tutte salvate',
    ['st'] && reg[I1].st === 'salvata' && reg[I2].st === 'salvata' && reg[I3].st === 'salvata');
  prova('nessuna bozza aperta: niente promemoria', r.n === 0, JSON.stringify(r.bozze));
}

console.log('\n7) le due firme devono restare identiche nei due nodi');
{
  const f = (codice) => {
    const m = codice.match(/function firmaScheda\(scheda\) \{[\s\S]*?\n\}/);
    return m ? m[0] : null;
  };
  const a = f(CODE), b = f(PAYLOAD);
  prova('firmaScheda presente in tutti e due', !!a && !!b);
  // i due file scrivono la funzione con escape diversi (uno finisce dentro una stringa
  // JSON, l'altro no): si confronta il comportamento, non i caratteri.
  const fa = new Function('scheda', a.replace(/^function firmaScheda\(scheda\) \{/, '').replace(/\}$/, ''));
  const fb = new Function('scheda', b.replace(/^function firmaScheda\(scheda\) \{/, '').replace(/\}$/, ''));
  prova('e producono la stessa firma sulla stessa scheda',
    fa(S1) === fb(S1) && fa(S2) === fb(S2) && fa(S3) === fb(S3));
  prova('e distinguono due schede diverse', fa(S1) !== fa(S2));
  const S1b = S1.replace('Tariffa: 120', 'Tariffa: 60');
  prova('e vedono la differenza di una tariffa', fa(S1) !== fa(S1b) && fb(S1) !== fb(S1b));
}

console.log('\n=============================');
console.log('  ' + ok + ' passate, ' + ko + ' fallite');
console.log('=============================');
process.exit(ko ? 1 : 0);
