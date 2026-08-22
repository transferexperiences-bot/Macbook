#!/usr/bin/env node
// Banco del nodo "Componi Payload Salvataggio" (Prenotazioni Transfer 6.0).
//   node banchi/te/banco-payload.js
// Casi veri: 769027 e 769061 (Alena Curry, due righe vuote sul gestionale),
// 760661 (i tre transfer di Tedi, il ritaglio che funzionava e deve continuare a farlo).
const fs = require('fs');
const path = require('path');
const CODICE = fs.readFileSync(path.join(__dirname, '../../backups/n8n/prenotazioni/componi-payload-salvataggio.js'), 'utf8');

function esegui(json, norm) {
  const $ = Object.assign(
    (nome) => {
      if (nome === 'Normalizer (kind/text/file_id)') return { first: () => ({ json: norm }) };
      if (nome === 'AI Agent2') return { first: () => ({ json: { output: json.recap_verificato || '' } }) };
      throw new Error(nome);
    },
    {}
  );
  return new Function('$', '$json', CODICE)($, json)[0].json;
}

const SCHEDA_ALENA = [
  'Ok, salvo solo il transfer di Alena Curry. Scartata la bozza del Melograno (Id TR-20260819-c13b3361-e55b-47a8-833d-049116172dd0).',
  '',
  '🚐 TRANSFER 1',
  '📅 Data: 20/08/2026 (giovedì)',
  '🕐 Ora: 10:00',
  '📍 Da: Trulli d\'amore — Contrada Tortorella 271, Monopoli',
  '🎯 Per: Gianfranco Fino Wine Resort — Contrada Lella, Manduria',
  '🧑 Nome: Alena Curry',
  '📧 Email: curryalena@gmail.com',
  '📞 Cell: +1 914 714 2561',
  '🏢 Fornitori: Transfer Experience',
  '💳 Modalità: Incassare',
  '💰 Tariffa: 260',
  '📝 Note: Dorino gite in barca',
  '🆔 Id: <code>TR/19082026/KZOUEPWDX2ZT2I8Y</code>',
  '',
  '[INTENT: conferma]',
].join('\n');

const TRE_TEDI = [
  '🚐 TRANSFER 1', '📅 Data: 19/08/2026 (mercoledì)', '🕐 Ora: 09:15',
  '📍 Da: https://goo.gl/maps/ZmtwevrCXVFfxF279', '🎯 Per: Porto di Savelletri',
  '🏢 Fornitori: Tedi tour operator', '💳 Modalità: Fattura', '💰 Tariffa: 380',
  '🆔 Id: TR/18082026/G5HWU5BMPTIVTWY1', '', ' |||', '',
  '🚐 TRANSFER 2', '📅 Data: 19/08/2026 (mercoledì)', '🕐 Ora: 17:00',
  '📍 Da: Porto di Savelletri', '🎯 Per: Polignano a Mare',
  '🏢 Fornitori: Tedi tour operator', '💳 Modalità: Fattura',
  '🆔 Id: TR/18082026/RT03SZHEGW3YORCP', '', ' |||', '',
  '🚐 TRANSFER 3', '📅 Data: 19/08/2026 (mercoledì)', '🕐 Ora: 22:00',
  '📍 Da: Polignano a Mare', '🎯 Per: Trullo Ermes',
  '🏢 Fornitori: Tedi tour operator', '💳 Modalità: Fattura',
  '🆔 Id: TR/18082026/MC9T0W28N9AYZG9O',
].join('\n');

let ok = 0, ko = 0;
const prova = (n, c, d) => { if (c) { ok++; console.log('  ✅ ' + n); } else { ko++; console.log('  ❌ ' + n + (d ? '\n       → ' + d : '')); } };

console.log('\n1) 769027 — Alena Curry: la scheda ha 📧 Email in mezzo');
{
  const out = esegui({ intent: 'conferma', recap_verificato: SCHEDA_ALENA },
    { originalMessageText: '', text: 'salva solo alena' });
  const p = out.payload_salvataggio;
  prova('la Data entra nel payload', /Data: 20\/08\/2026/.test(p), p.slice(0, 200));
  prova('l\'ora entra', /Ora: 10:00/.test(p));
  prova('la tratta entra', /Da: Trulli/.test(p) && /Per: Gianfranco/.test(p));
  prova('il nome entra', /Nome: Alena Curry/.test(p));
  prova('la prosa del Melograno NON entra', !/Melograno/.test(p), p.slice(0, 200));
  prova('l\'Id del Melograno NON entra', !/c13b3361/.test(p));
  prova('ha ritagliato (non ha dovuto ripiegare sul testo intero)', out.payload_ritagliato === true);
  prova('nessuna scheda monca', (out.payload_monche || []).length === 0);
}

console.log('\n2) 769061 — la «correzione»: stessa scheda, stesso taglio');
{
  const testo = SCHEDA_ALENA.replace('[INTENT: conferma]', '[INTENT: modifica]')
    .replace('Ok, salvo solo il transfer di Alena Curry.', 'Hai ragione: il salvataggio è andato ma sono finiti solo Fornitore, Tariffa, Modalità e Note. Correggo subito:');
  const out = esegui({ intent: 'modifica', recap_verificato: testo }, { originalMessageText: '', text: 'mancano tutte le altre info' });
  prova('stavolta la correzione porta i dati veri',
    /Data: 20\/08\/2026/.test(out.payload_salvataggio) && /Nome: Alena Curry/.test(out.payload_salvataggio));
  prova('intent modifica conservato', /\[INTENT: modifica\]/.test(out.payload_salvataggio));
}

console.log('\n3) 760661 — tre transfer col separatore: continua a funzionare');
{
  const out = esegui({ intent: 'conferma', recap_verificato: TRE_TEDI }, { originalMessageText: '', text: 'Salva subito' });
  prova('trova tutte e tre le schede', out.payload_schede.length === 3, JSON.stringify(out.payload_schede));
  prova('ognuna con la sua data e tratta',
    (out.payload_salvataggio.match(/Data: 19\/08\/2026/g) || []).length === 3);
  prova('nessuna monca', (out.payload_monche || []).length === 0);
}

console.log('\n4) la rete: scheda senza data → non si ritaglia, si manda tutto');
{
  const monca = ['🚐 TRANSFER 1', '📍 Da: Monopoli', '🎯 Per: Bari', '💰 Tariffa: 50',
    '🆔 Id: TR/19082026/XXXXXXXXXXXX'].join('\n');
  const out = esegui({ intent: 'conferma', recap_verificato: 'Contesto a parole con la data vera 21/08.\n\n' + monca },
    { originalMessageText: '', text: 'salva' });
  prova('se ne accorge', (out.payload_monche || []).length === 1, JSON.stringify(out.payload_monche));
  prova('non ritaglia', out.payload_ritagliato === false);
  prova('manda il testo intero, così i dati non si perdono', /Contesto a parole con la data vera/.test(out.payload_salvataggio));
}

console.log('\n=============================');
console.log('  ' + ok + ' passate, ' + ko + ' fallite');
console.log('=============================');
process.exit(ko ? 1 : 0);
