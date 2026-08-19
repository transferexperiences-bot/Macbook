#!/usr/bin/env node
// Banco della regola «salva e mostra» nel nodo "Code in JavaScript" (Prenotazioni).
//   node banchi/te/banco-salva-e-mostra.js
// La domanda a cui deve rispondere: QUANDO il bot salva da solo, e quando invece chiede.
const fs = require('fs'), path = require('path');
const CODICE = fs.readFileSync(path.join(__dirname, '../../backups/n8n/prenotazioni/salva-e-mostra.js'), 'utf8');

// «Code in JavaScript» resta com'e': qui si prova SOLO la regola nuova, che gira subito
// dopo e riceve gia' il testo pulito, i bottoni e l'intent. Questo parse riproduce quello
// che quel nodo consegna.
function parse(output) {
  const intentRx = /\[INTENT:\s*(conferma|modifica|chat|cancella)\s*\]/ig;
  const ii = Array.from(String(output).matchAll(intentRx));
  const intent = ii.length ? ii[ii.length - 1][1].toLowerCase() : 'chat';
  let t = String(output).replace(intentRx, '').trim();
  const bm = t.match(/\n?[ \t]*\[BUTTONS:\s*([^\]\n]+?)\s*\][ \t]*\s*$/i);
  let chiave = [];
  if (bm) { chiave = bm[1].split('|').map((x) => x.trim()).filter(Boolean); t = t.replace(bm[0], '').trim(); }
  return { agent_output_clean: t, chiave: chiave, intent: intent, replyMarkupJson: chiave.length ? '{}' : null };
}
function esegui(output) {
  return new Function('$json', CODICE)(parse(output))[0].json;
}

const SCHEDA = (extra) => [
  '🚐 TRANSFER 1',
  '📅 Data: 20/08/2026 (giovedì)',
  '🕐 Ora: 10:00',
  '📍 Da: Trulli d\'amore, Monopoli',
  '🎯 Per: Gianfranco Fino Wine Resort, Manduria',
  '🧑 Nome: Alena Curry',
  '📧 Email: curryalena@gmail.com',
  '📞 Cell: +1 914 714 2561',
  '🏢 Fornitori: Transfer Experience',
  '💳 Modalità: Incassare',
  '💰 Tariffa: ' + (extra && extra.tariffa !== undefined ? extra.tariffa : '260'),
  '🆔 Id: TR/19082026/KZOUEPWDX2ZT2I8Y',
  (extra && extra.coda) || '',
  '',
  '⚠️ Confermi l\'inserimento?',
  '',
  '[BUTTONS: Conferma | Annulla]',
].join('\n');

let ok = 0, ko = 0;
const prova = (n, c, d) => { if (c) { ok++; console.log('  ✅ ' + n); } else { ko++; console.log('  ❌ ' + n + (d ? '  → ' + d : '')); } };

console.log('\nSALVA DA SOLO quando è tutto a posto');
{
  const o = esegui(SCHEDA());
  prova('scheda completa con tariffa → salva subito', o.intent === 'conferma' && o.salvataggio_diretto === true,
    'intent=' + o.intent);
  prova('niente bottoni di conferma appesi', o.replyMarkupJson === null);
}
{
  const due = SCHEDA() .replace('[BUTTONS: Conferma | Annulla]', '') + '\n\n |||\n\n' + SCHEDA().replace('KZOUEPWDX2ZT2I8Y','MC9T0W28N9AYZG9O');
  const o = esegui(due);
  prova('due schede complete → salva tutte e due', o.intent === 'conferma' && o.salvataggio_diretto === true, 'intent=' + o.intent);
}

console.log('\nCHIEDE ANCORA dove sbagliare fa male');
const chiede = (nome, testo) => {
  const o = esegui(testo);
  prova(nome, o.intent === 'chat' && !o.salvataggio_diretto, 'intent=' + o.intent + ' diretto=' + o.salvataggio_diretto);
};
chiede('tariffa DA DEFINIRE', SCHEDA({ tariffa: 'DA DEFINIRE' }));
chiede('tariffa a zero', SCHEDA({ tariffa: '0' }));
chiede('c\'è un acconto in ballo', SCHEDA({ coda: '💶 Acconto: 50€ — https://pay.sumup.com/b2c/Q03FRTJB' }));
chiede('è un preventivo', SCHEDA({ coda: 'Collegato a PREV-2026-0600.' }));
chiede('c\'è un ⛔ nel testo', SCHEDA({ coda: '⛔ Attenzione: potrebbe essere un doppione.' }));
chiede('manca l\'ora', SCHEDA().replace('🕐 Ora: 10:00', '🕐 Ora:'));
chiede('manca la data', SCHEDA().replace('📅 Data: 20/08/2026 (giovedì)', '📅 Data:'));
chiede('manca la destinazione', SCHEDA().replace('🎯 Per: Gianfranco Fino Wine Resort, Manduria', '🎯 Per:'));
chiede('è una cancellazione', SCHEDA({ coda: '' }).replace('[BUTTONS: Conferma | Annulla]', '[BUTTONS: Conferma cancellazione | Annulla]'));
chiede('elenco letto dal foglio', SCHEDA({ coda: 'Booking 2 of 5' }));
{
  const o = esegui(SCHEDA().replace('⚠️ Confermi l\'inserimento?', 'Ti serve altro?').replace('[BUTTONS: Conferma | Annulla]', '[BUTTONS: Ok]'));
  prova('senza bottone di conferma non è una proposta di salvataggio', o.intent === 'chat' && !o.salvataggio_diretto,
    'intent=' + o.intent);
}
{
  const o = esegui('Ecco i servizi di domani:\n\n1) TR/19082026/AAAAAAAA Monopoli → Bari\n2) TR/19082026/BBBBBBBB Bari → Ostuni\n\n3 risultati');
  prova('un recap di sola lettura non salva niente', o.intent === 'chat' && !o.salvataggio_diretto, 'intent=' + o.intent);
}

console.log('\n=============================');
console.log('  ' + ok + ' passate, ' + ko + ' fallite');
console.log('=============================');
process.exit(ko ? 1 : 0);
