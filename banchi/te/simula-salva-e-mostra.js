#!/usr/bin/env node
// Rigioca le CHAT VERE dentro la regola «salva e mostra» e conta cosa sarebbe successo.
//   node banchi/te/simula-salva-e-mostra.js /percorso/chat.json
// Per ogni messaggio in cui il bot ha chiesto conferma, guarda cosa avrebbe fatto la
// regola nuova e cosa Agostino ha risposto davvero. Il numero che conta è l'ultimo:
// le volte in cui avrebbe salvato da solo una cosa che lui NON voleva.
const fs = require('fs'), path = require('path');
const CODICE = fs.readFileSync(path.join(__dirname, '../../backups/n8n/prenotazioni/salva-e-mostra.js'), 'utf8');
const chat = JSON.parse(fs.readFileSync(process.argv[2] || '/tmp/chat.json', 'utf8'));

function regola(testo, bottoniFinti) {
  const j = { agent_output_clean: testo, chiave: bottoniFinti, intent: 'chat', replyMarkupJson: '{}' };
  return new Function('$json', CODICE)(j)[0].json;
}

const SI = /^\s*(s[iì]+|ok(ay)?|va bene|conferm\w*|vai|procedi|salva|perfetto|esatto|giusto|👍|✅|d'accordo|certo)\b/i;
const NO = /^\s*(no|nn|non|aspett\w*|annull\w*|cancell\w*|ferma|stop|sbagli\w*|modific\w*|cambia|manca|corregg\w*|rifai|riprova|attento|scusa)\b/i;

const msgs = chat.filter(x => x.testo);
let proposte = 0, avrebbeSalvato = 0, avrebbeChiesto = 0;
let okVeri = 0, falsiPositivi = 0, senzaRisposta = 0, altro = 0;
const esempiFalsi = [], esempiOk = [];

for (let i = 0; i < msgs.length; i++) {
  const m = msgs[i];
  if (m.chi === 'Agostino Narracci') continue;
  const t = m.testo;
  // il bot sta proponendo un salvataggio: c'è una scheda e chiede conferma
  if (!/confermi/i.test(t)) continue;
  if (!/TR[\/-]\d{8}[\/-][A-Za-z0-9-]{4,}/.test(t)) continue;
  proposte++;
  const out = regola(t, ['Conferma', 'Annulla']);
  const salva = out.salvataggio_diretto === true;
  if (salva) avrebbeSalvato++; else avrebbeChiesto++;
  // cosa ha risposto lui subito dopo
  let risposta = null;
  for (let k = i + 1; k < msgs.length; k++) {
    if (msgs[k].chi === 'Agostino Narracci') { risposta = msgs[k].testo.trim(); break; }
  }
  if (!salva) continue;
  if (risposta === null) { senzaRisposta++; continue; }
  if (SI.test(risposta)) { okVeri++; if (esempiOk.length < 3) esempiOk.push(risposta.slice(0, 60)); }
  else if (NO.test(risposta)) {
    falsiPositivi++;
    if (esempiFalsi.length < 12) esempiFalsi.push({ quando: m.quando.slice(0, 10), risposta: risposta.replace(/\n/g, ' ').slice(0, 90) });
  } else { altro++; }
}

console.log('\n=== SIMULAZIONE SU CHAT VERE (' + msgs.length + ' messaggi) ===');
console.log('proposte di salvataggio con scheda e «confermi?»: ' + proposte);
console.log('  · la regola nuova avrebbe SALVATO da sola: ' + avrebbeSalvato + '  (%d%%)'.replace('%d', Math.round(100*avrebbeSalvato/Math.max(proposte,1))));
console.log('  · avrebbe continuato a CHIEDERE:            ' + avrebbeChiesto + '  (%d%%)'.replace('%d', Math.round(100*avrebbeChiesto/Math.max(proposte,1))));
console.log('\nDelle volte in cui avrebbe salvato da solo, Agostino aveva risposto:');
console.log('  ✅ sì/conferma/vai      ' + okVeri + '   → tap risparmiati');
console.log('  ⛔ no/annulla/aspetta   ' + falsiPositivi + '   → avrebbe salvato una cosa non voluta');
console.log('  · altro (dettagli, nuove richieste) ' + altro);
console.log('  · nessuna risposta               ' + senzaRisposta);
const denom = okVeri + falsiPositivi;
if (denom) console.log('\nsu ' + denom + ' casi decidibili: giusto il ' + Math.round(100*okVeri/denom) + '%, sbagliato il ' + Math.round(100*falsiPositivi/denom) + '%');
if (esempiFalsi.length) {
  console.log('\nI casi in cui avrebbe sbagliato (da guardare uno per uno):');
  for (const e of esempiFalsi) console.log('  ' + e.quando + '  «' + e.risposta + '»');
}
