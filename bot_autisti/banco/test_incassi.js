const fs = require('fs'), I = require('./incassi.js');
const rows = JSON.parse(fs.readFileSync('dati/gest_claudio.json')).rows;
for (const [d, iso] of [['lun 12 ottobre 2026', '2026-10-12'], ['lun 5 ottobre 2026', '2026-10-05']]) {
  const sv = rows.filter(r => r.Data === d && !String(r.Allert).includes('ancell'));
  const su = JSON.parse(fs.readFileSync(`dati/sumup_${iso}.json`))[0].items;
  const R = I.riepilogo(sv, su, iso, d.includes('12') ? 50 : 0, d.includes('12') ? 3 : 0);
  console.log('==', d); console.log(I.testoRiepilogo(R));
  R.righe.forEach(x => console.log(' ', x.ora, x.modalita, x.importo, x.esito, x.motivo || x.sumup || ''));
}
