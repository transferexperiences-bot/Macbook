#!/usr/bin/env node
// Quanto del listino è GIÀ scritto dentro il gestionale.
//   node banchi/te/impara-listino.js <gestionale.json>
// Il listino «Generico» ha 62 destinazioni. I transfer veri vanno in centinaia di posti che
// lì dentro non ci sono, e per quelli il calcolo tira a indovinare. Ma i prezzi giusti
// esistono già: sono sulle righe che Agostino ha accettato. Questo conta quante tratte si
// ripetono con lo stesso prezzo — quelle sono righe di listino pronte, che non ha mai
// scritto nessuno.
const fs = require('fs');
const righe = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

const strip = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const fascia = (pax, veicolo) => {
  let p = parseInt(pax, 10);
  if (isNaN(p)) {
    const v = strip(veicolo);
    const m = v.match(/(\d{1,2}) (?:posti|pax)/);
    p = m ? parseInt(m[1], 10) : (/sprinter|minibus/.test(v) ? 9 : (/vito|minivan/.test(v) ? 7 : 0));
  }
  if (!p) return '?';
  return p <= 2 ? '≤2' : (p <= 7 ? '≤7' : '≤9');
};

// Prima delle 7 il motore moltiplica per 1,2: nel gestionale quel supplemento è già dentro
// il numero. Le righe di listino si imparano riportate a giorno, altrimenti una corsa
// all'alba sporca la tratta per tutte le altre.
const notturno = (r) => {
  const h = parseInt(String(r.Time || '').slice(0, 2), 10);
  return (!isNaN(h) && h < 7) ? 1.2 : 1;
};

const gruppi = new Map();
for (const r of righe) {
  const t = Number(r.Tariffa);
  if (!(t > 0)) continue;
  const da = strip(r['Transfer > Da']), per = strip(r['Transfer < Per']);
  if (!da || !per) continue;
  const forn = strip(r.Fornitori) || 'generico';
  // andata e ritorno sono la stessa tratta: la tratta è la coppia, senza verso
  const tratta = [da, per].sort().join('  ↔  ');
  const k = forn + ' | ' + tratta + ' | ' + fascia(r.Pax, r.Veicolo);
  if (!gruppi.has(k)) gruppi.set(k, []);
  gruppi.get(k).push(Math.round(t / notturno(r)));
}

let ripetute = 0, stabili = 0, ballerine = 0, righeCoperte = 0;
const pronte = [];
for (const [k, prezzi] of gruppi) {
  if (prezzi.length < 2) continue;
  ripetute++;
  const uniq = [...new Set(prezzi)];
  if (uniq.length === 1) {
    stabili++; righeCoperte += prezzi.length;
    pronte.push({ k, prezzo: uniq[0], volte: prezzi.length });
  } else {
    // stabile «quasi»: la stessa cifra almeno nei tre quarti dei casi
    const conta = {};
    prezzi.forEach((p) => { conta[p] = (conta[p] || 0) + 1; });
    const [top, n] = Object.entries(conta).sort((a, b) => b[1] - a[1])[0];
    if (n / prezzi.length >= 0.75) {
      stabili++; righeCoperte += prezzi.length;
      pronte.push({ k, prezzo: Number(top), volte: prezzi.length, incerte: prezzi.length - n });
    } else ballerine++;
  }
}

const totRighe = [...gruppi.values()].reduce((a, b) => a + b.length, 0);
console.log('\nRighe con un prezzo: ' + totRighe + '  in ' + gruppi.size + ' tratte diverse');
console.log('  tratte fatte almeno due volte:        ' + ripetute);
console.log('    con SEMPRE lo stesso prezzo:        ' + stabili + '   → righe di listino pronte');
console.log('    con prezzi che ballano:             ' + ballerine);
console.log('  righe coperte da quelle tratte:       ' + righeCoperte
  + '  (' + Math.round(righeCoperte * 100 / totRighe) + '% di tutte)');

// Il listino imparato, in chiaro, così si può guardare riga per riga prima di fidarsene.
if (process.argv[3]) {
  const fuori = pronte.map((p) => {
    const [forn, tratta, fasciaP] = p.k.split(' | ');
    const [a, b] = tratta.split('  ↔  ');
    return { fornitore: forn, da: a, per: b, fascia: fasciaP, prezzo: p.prezzo,
             volte: p.volte, diverse: p.incerte || 0 };
  }).sort((x, y) => y.volte - x.volte);
  fs.writeFileSync(process.argv[3], JSON.stringify(fuori, null, 1));
  console.log('\nScritto in ' + process.argv[3] + ': ' + fuori.length + ' righe di listino imparate.');
}

pronte.sort((a, b) => b.volte - a.volte);
console.log('\nLe venti più ricorrenti (fornitore | tratta | fascia → prezzo, quante volte):');
pronte.slice(0, 20).forEach((p) => console.log('  ' + String(p.prezzo).padStart(5) + '€ ×'
  + String(p.volte).padStart(3) + (p.incerte ? ' (' + p.incerte + ' diverse)' : '') + '   ' + p.k));
console.log('');
