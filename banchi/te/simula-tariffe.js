#!/usr/bin/env node
// Rigioca le CHAT VERE dentro i nodi «Schede senza tariffa» / «Rimetti le tariffe» e conta
// quanto costa oggi il prezzo che manca.
//   node banchi/te/simula-tariffe.js /percorso/chat.json
// Non inventa prezzi: il listino qui non gira. Conta due cose vere:
//   · quante schede sarebbero andate al listino invece di restare vuote;
//   · quante volte la stessa scheda (stesso Id) è tornata più tardi col prezzo, e quanti
//     messaggi sono passati nel frattempo. Quei messaggi sono il pedaggio di adesso.
const fs = require('fs'), path = require('path');
const CERCA = fs.readFileSync(path.join(__dirname, '../../backups/n8n/prenotazioni/schede-senza-tariffa.js'), 'utf8');
const chat = JSON.parse(fs.readFileSync(process.argv[2] || '/tmp/chat.json', 'utf8'));

function cerca(testo) {
  const base = { agent_output_clean: testo, intent: 'chat' };
  const $input = { first: () => ({ json: base }) };
  return new Function('$input', '$json', CERCA)($input, base).map((i) => i.json).filter((l) => !l.__niente);
}

const RX_ID = /TR[\/-]\d{8}[\/-][A-Za-z0-9-]{4,}|TR-\d{8}-[0-9a-f-]{8,}/;
function campo(s, n) {
  const m = String(s).match(new RegExp('(?:^|\\n)[^\\p{L}\\n]*(?:' + n + ')[ \\t]*:[ \\t]*([^\\n]*)', 'iu'));
  return m ? m[1].trim() : '';
}
function prezzo(v) {
  const s = String(v || '').trim();
  if (!s || /da\s*definire|^[—\-–]$/i.test(s)) return 0;
  const m = s.replace(/\./g, '').match(/(\d+(?:,\d+)?)/);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(',', '.'));
  return isNaN(n) || n <= 0 ? 0 : n;
}

// ATTENZIONE AI NUMERI. L'export delle chat finisce il 09/05/2026, e la scheda a emoji di
// oggi (🚐 TRANSFER n, 📍 Da, 🎯 Per) è arrivata dopo: qui dentro le uniche righe a emoji
// sono le notifiche di conferma, non le schede. Quindi i conti sotto raccontano il vecchio
// formato — utili per capire quanto è vecchio il buco, non per misurare oggi. La misura di
// oggi si fa sulle esecuzioni n8n (760628 del 18/08 è la prova che il buco c'è ancora).
const FORMATO_OGGI = /🚐\s*TRANSFER\s*\d|(?:^|\n)\s*📅\s*Data\s*:/;
let schede = 0, senzaPrezzo = 0, alListino = 0, restaFerma = 0;
let schedeOggi = 0, senzaOggi = 0, listinoOggi = 0, fermaOggi = 0;
const primaVoltaSenza = new Map();   // Id → indice del messaggio
const risolte = [];                  // messaggi passati prima che il prezzo arrivasse
const maiRisolte = new Set();

for (let i = 0; i < chat.length; i++) {
  const m = chat[i];
  if (m.chi === 'Agostino Narracci') continue;
  const t = String(m.testo || '');
  if (!RX_ID.test(t)) continue;

  const pezzi = t.split(/\|\|\|/).filter((p) => RX_ID.test(p));
  if (!pezzi.length) continue;
  const oggi = FORMATO_OGGI.test(t);
  const lavori = cerca(t);
  const daListino = new Set(lavori.map((l) => l.__pezzo));
  const tuttiPezzi = t.split(/\|\|\|/);

  for (let k = 0; k < tuttiPezzi.length; k++) {
    const p = tuttiPezzi[k];
    if (!RX_ID.test(p)) continue;
    schede++;
    if (oggi) schedeOggi++;
    const id = (p.match(RX_ID) || [''])[0];
    if (prezzo(campo(p, 'Tariffa|Fare'))) {
      if (primaVoltaSenza.has(id)) {
        risolte.push(i - primaVoltaSenza.get(id));
        primaVoltaSenza.delete(id);
      }
      continue;
    }
    senzaPrezzo++;
    if (oggi) senzaOggi++;
    if (daListino.has(k)) { alListino++; if (oggi) listinoOggi++; }
    else { restaFerma++; if (oggi) fermaOggi++; }
    if (!primaVoltaSenza.has(id)) primaVoltaSenza.set(id, i);
  }
}
for (const id of primaVoltaSenza.keys()) maiRisolte.add(id);

const pct = (a, b) => b ? Math.round(a * 100 / b) + '%' : '—';
const media = risolte.length ? (risolte.reduce((a, b) => a + b, 0) / risolte.length) : 0;
risolte.sort((a, b) => a - b);
const mediana = risolte.length ? risolte[Math.floor(risolte.length / 2)] : 0;

console.log('\nSchede mostrate dal bot: ' + schede);
console.log('  senza prezzo:              ' + senzaPrezzo + '  (' + pct(senzaPrezzo, schede) + ')');
console.log('    il listino le può prezzare: ' + alListino + '  (' + pct(alListino, schede) + ' di tutte)');
console.log('    non ha i luoghi, resta ferma e si chiede: ' + restaFerma + '  (' + pct(restaFerma, schede) + ')');
console.log('\nSolo le schede nel formato di oggi (quelle a emoji): ' + schedeOggi);
console.log('  senza prezzo:              ' + senzaOggi + '  (' + pct(senzaOggi, schedeOggi) + ')');
console.log('    il listino le può prezzare: ' + listinoOggi + '  (' + pct(listinoOggi, schedeOggi) + ' di quelle)');
console.log('    resta ferma e si chiede:    ' + fermaOggi + '  (' + pct(fermaOggi, schedeOggi) + ')');
console.log('\nQuanto costa adesso quel buco:');
console.log('  schede tornate più tardi col prezzo: ' + risolte.length);
console.log('  messaggi passati nel frattempo: media ' + media.toFixed(1) + ', mediana ' + mediana + ', peggiore ' + (risolte[risolte.length - 1] || 0));
console.log('  schede mai più viste col prezzo: ' + maiRisolte.size + '\n');
