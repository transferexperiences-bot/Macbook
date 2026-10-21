const fs = require('fs'), A = require('./apertura.js'), O = require('./ore.js');
const rows = JSON.parse(fs.readFileSync('dati/gest_claudio.json')).rows.filter(r => r.Data === 'lun 12 ottobre 2026' && !/ancell/.test(r.Allert));
const ctx = { autista: 'Claudio Moccia', nome: 'Claudio', giorno: '2026-10-12', servizi: rows, flotta: ['Classe V FN751MD', 'Maybach GZ441BF'],
  mezzo: { nome: 'Classe V FN751MD', km: 186200, problemi_aperti: [{ id: 'EV-17', testo: 'spia pressione gomme accesa', da: 'Paolo', giorno: '11/10' }] } };
let ap = null;
for (const e of [{ tipo: 'avvio' }, { tipo: 'avvio' }, { tipo: 'tap', data: 'RP|mezzo|ok' }, { tipo: 'tap', data: 'RP|prob|no' }, { tipo: 'testo', testo: 'ok' },
  { tipo: 'foto', link: 'K', lettura: { km: '186.420', spie: [] } }, { tipo: 'tap', data: 'RP|carb|4' }, { tipo: 'tap', data: 'RP|carb|4' }, { tipo: 'tap', data: 'RP|pul|int' },
  { tipo: 'tap', data: 'RP|danni|si' }, { tipo: 'foto', link: 'D', testo: 'graffio paraurti posteriore destro' }]) {
  console.log('  👤', e.tipo === 'tap' ? `[${e.data}]` : e.tipo === 'foto' ? '[foto]' + (e.testo ? ' ' + e.testo : '') : e.testo || e.tipo);
  const r = A.passo(ap, e, ctx); ap = r.ap;
  r.messaggi.forEach(m => console.log('  🤖', (m.testo || '(tap) ' + m.avviso_tap).replace(/<\/?b>/g, '').replace(/\n/g, ' | '), m.bottoni ? m.bottoni.flat().map(b => `[${b.text}]`).join('') : ''));
  r.avvisi.forEach(a => console.log('  📣', a.testo)); r.scritture.forEach(w => console.log('  💾', JSON.stringify(w)));
}
