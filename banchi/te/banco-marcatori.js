#!/usr/bin/env node
// Banco del nodo «Normalizza i marcatori» di Orca.
//   node banchi/te/banco-marcatori.js
// Il caso vero è l'esecuzione 772543 del 20/08 alle 09:54: il modello ha scritto
// <WA_MSG>…</WA_MSG> e <WA_TEL></WA_TEL> invece delle doppie quadre che «Code Parser
// Intent» cerca. Risultato: nessun link WhatsApp, e i tag in chiaro dentro la chat.
const fs = require('fs');
const path = require('path');
const CODICE = fs.readFileSync(path.join(__dirname, '../../backups/n8n/orca/normalizza-i-marcatori.js'), 'utf8');

const gira = (output) => new Function('$input', CODICE)({ all: () => [{ json: { output } }] })[0].json;

let ok = 0, ko = 0;
function t(nome, condizione, dettaglio) {
  if (condizione) { ok++; console.log('  ok   ' + nome); }
  else { ko++; console.log('  KO   ' + nome + (dettaglio ? '\n       ' + dettaglio : '')); }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n772543 — il caso vero');
const VERO = [
  'Ok, tour in barca HD 3 ore, domani venerdì 21/08.',
  '',
  '<WA_MSG>',
  'Gentile Cliente,',
  'le confermiamo il tour in barca di domani.',
  'Transfer Experience',
  '</WA_MSG>',
  '',
  '<WA_TEL></WA_TEL>',
  '',
  'Serve: nome, numero, struttura.'
].join('\n');
const r = gira(VERO);
t('l\'apertura diventa quella che il parser cerca', r.output.indexOf('[[WA_MSG]]') !== -1, r.output);
t('e la chiusura pure', r.output.indexOf('[[/WA_MSG]]') !== -1);
t('il numero vuoto diventa [[WA_TEL:]]', r.output.indexOf('[[WA_TEL:]]') !== -1, r.output);
t('in chat non resta nessun tag angolare', !/<\/?WA_/i.test(r.output), r.output);
t('il testo del messaggio non si tocca', /Gentile Cliente,\nle confermiamo il tour in barca di domani\./.test(r.output));
t('e si sa che è servito', r.marcatori_raddrizzati === true);

console.log('\nle altre parentesi che il modello inventa');
for (const [scritto, atteso] of [
  ['[WA_MSG]ciao[/WA_MSG]', '[[WA_MSG]]ciao[[/WA_MSG]]'],
  ['{{WA_MSG}}ciao{{/WA_MSG}}', '[[WA_MSG]]ciao[[/WA_MSG]]'],
  ['((WA_MSG))ciao((/WA_MSG))', '[[WA_MSG]]ciao[[/WA_MSG]]'],
  ['[[WA_MSG]]ciao[[/WA_MSG]]', '[[WA_MSG]]ciao[[/WA_MSG]]'],
]) t('«' + scritto.slice(0, 12) + '…» → forma giusta', gira(scritto).output === atteso, gira(scritto).output);

console.log('\nil numero di telefono, in tutti i modi');
for (const scritto of ['<WA_TEL>393335551234</WA_TEL>', '[WA_TEL: 393335551234]',
                       '[[WA_TEL:393335551234]]', '<WA_TEL:393335551234>']) {
  t('«' + scritto + '»', gira(scritto).output === '[[WA_TEL:393335551234]]', gira(scritto).output);
}

console.log('\ngli altri marcatori');
t('l\'acconto SumUp scritto con le angolari', gira('<SUMUP:50>').output === '[[SUMUP:50]]', gira('<SUMUP:50>').output);
t('l\'intent resta a quadra singola, come lo vuole il parser',
  gira('<INTENT: action_transfer>').output === '[INTENT: action_transfer]', gira('<INTENT: action_transfer>').output);
t('e i bottoni pure',
  gira('<BUTTONS: Conferma | Annulla>').output === '[BUTTONS: Conferma | Annulla]', gira('<BUTTONS: Conferma | Annulla>').output);
t('un elenco di bottoni vuoto sparisce', gira('testo\n[BUTTONS: ]').output.trim() === 'testo', JSON.stringify(gira('testo\n[BUTTONS: ]').output));

console.log('\nquello che NON deve toccare');
const HTML = 'Ecco il <b>preventivo</b>: <a href="https://wa.me/39333?text=ciao">Invia su WhatsApp</a>\nE poi <i>nota</i>.';
t('i tag HTML veri restano intatti', gira(HTML).output === HTML, gira(HTML).output);
t('e infatti dice che non ha raddrizzato niente', gira(HTML).marcatori_raddrizzati === false);
const NORMALE = 'Domani alle 10:00 da Polignano a Bari Airport, 2 pax. Va bene?';
t('un messaggio normale passa identico', gira(NORMALE).output === NORMALE);
t('il minore-maggiore in un prezzo non diventa un marcatore',
  gira('costo < 100 e > 50').output === 'costo < 100 e > 50', gira('costo < 100 e > 50').output);

console.log('\n' + ok + ' ok, ' + ko + ' KO\n');
process.exit(ko ? 1 : 0);
