// prova alla cieca: tolgo Show alle carte/link già chiuse dalla guardia e vedo quante il motore ritrova da solo
const fs = require('fs'), I = require('./incassi.js'), O = require('./ore.js');
const rows = JSON.parse(fs.readFileSync('dati/gest_ottobre.json')).rows.filter(r => r.Autista);
const ST = JSON.parse(fs.readFileSync('dati/sumup_storico.json'))[0].items;
const gruppi = { 'Giuseppe Fanelli': '-1002879416229', 'Katiuscia Secondo': '-5199574759', 'Angelo Olivieri': '-5557344991', 'Giovanni Ruggiero': '-5424793048', 'Claudio Moccia': '-1002580530773' };
const serv = rows.map(r => ({ r: { ...r, Show: '' }, iso: O.pd(r.Data) !== null ? O.iso(O.pd(r.Data)) : '', show: r.Show })).filter(x => x.iso && x.iso <= '2026-10-19');
const { esito } = I.riconcilia(serv, ST, { gruppi });
let tot = 0, ritrovate = 0, perse = [], nuove = 0; const come = {};
for (const x of serv) {
  const e = esito[String(x.r.Id)]; if (!e) continue;
  const g = /^(si|sì|true)$/i.test(String(x.show).trim());
  if (g) { tot++; if (e.esito === 'carta_ok') { ritrovate++; come[e.come] = (come[e.come] || 0) + 1; } else perse.push([x.iso, x.r.Time, x.r.Autista, x.r['Modalità'], I.importo(x.r), x.r.Nome]); }
  else if (e.esito === 'carta_ok') nuove++;
}
console.log(`chiuse dalla guardia ${tot}: il motore ne ritrova ${ritrovate}`, come, `| non chiuse dalla guardia ma trovate dal motore: ${nuove}`);
perse.forEach(p => console.log('  persa', ...p));
