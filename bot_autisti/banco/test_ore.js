const fs = require('fs'), O = require('./ore.js');
const rows = JSON.parse(fs.readFileSync('dati/gest_ottobre.json')).rows;
const ref = JSON.parse(fs.readFileSync('ref_ore.json'));
const raw = O.eventi(rows).filter(e => O.iso(e[1]).startsWith('2026-10'));
const S = O.assegna(raw);
const cache = {};
const moox = (tg, d) => { const f = `mx/mx_${tg}_${O.iso(d)}.json`; if (!(f in cache)) cache[f] = fs.existsSync(f) ? O.tratte(JSON.parse(fs.readFileSync(f)), d) : []; return cache[f]; };
let ok = 0, ko = [];
for (const [k, v] of Object.entries(ref)) {
  const [A, ds] = k.split('|'); const [y, m, g] = ds.split('-').map(Number); const d = Math.round(Date.UTC(y, m - 1, g) / 864e5);
  const j = O.regola(S, A, d, moox);
  if (j !== null && Math.abs(j - v) < 0.001) ok++; else ko.push([k, v, j]);
}
console.log('uguali', ok, 'diversi', ko.length); ko.slice(0, 10).forEach(x => console.log(x));
const c = O.oreAutista(S, 'Claudio Moccia', Math.round(Date.UTC(2026, 9, 12) / 864e5), moox, 'Continuative');
console.log('Claudio 12/10', c);
