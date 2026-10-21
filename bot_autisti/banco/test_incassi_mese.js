const fs = require('fs'), I = require('./incassi.js'), O = require('./ore.js');
const rows = JSON.parse(fs.readFileSync('dati/gest_ottobre.json')).rows.filter(r => r.Autista);
const ST = JSON.parse(fs.readFileSync('dati/sumup_storico.json'))[0].items;
const gruppi = { 'Giuseppe Fanelli': '-1002879416229', 'Katiuscia Secondo': '-5199574759', 'Angelo Olivieri': '-5557344991', 'Giovanni Ruggiero': '-5424793048', 'Claudio Moccia': '-1002580530773' };
const serv = rows.map(r => ({ r, iso: O.pd(r.Data) !== null ? O.iso(O.pd(r.Data)) : '' })).filter(x => x.iso && x.iso <= '2026-10-19');
const { esito } = I.riconcilia(serv, ST, { gruppi });
const cnt = {}; for (const e of Object.values(esito)) { const k = e.esito + (e.come ? ':' + e.come : '') + (e.indizio ? ':' + e.indizio : ''); cnt[k] = (cnt[k] || 0) + 1; }
console.log('riconciliazione carta/link ottobre (senza Show):', cnt);
const giaShow = serv.filter(({ r }) => ['Carta', 'Link'].includes(String(r['Modalità']).trim()) && /^(si|sì|true)$/i.test(String(r.Show).trim()) && !I.cancellata(r)).length;
console.log('carta/link già con Show:', giaShow);
// giornata tipo
for (const [a, iso] of [['Claudio Moccia', '2026-10-12'], ['Claudio Moccia', '2026-10-05'], ['Katiuscia Secondo', '2026-10-13']]) {
  const oggi = serv.filter(x => x.iso === iso && O.nm(x.r.Autista) === a).map(x => x.r);
  const prima = serv.filter(x => x.iso < iso && O.nm(x.r.Autista) === a).map(x => x.r);
  const R = I.riepilogo(oggi, esito, prima);
  console.log('\n==', a, iso); console.log(I.testoRiepilogo(R));
  R.righe.forEach(x => console.log('  ', x.ora, x.modalita, x.importo, x.esito, x.come || x.motivo || ''));
  if (R.da_chiedere.length) console.log(I.testoVerificaPOS(a, R.da_chiedere));
}
