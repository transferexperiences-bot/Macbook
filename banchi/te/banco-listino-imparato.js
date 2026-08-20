#!/usr/bin/env node
// Il listino imparato messo alla prova ONESTAMENTE.
//   node banchi/te/banco-listino-imparato.js <gestionale.json>
// Regola della prova: per giudicare una riga, il listino viene ricostruito SENZA quella
// riga (e senza le sue gemelle dello stesso giorno). Altrimenti si starebbe misurando la
// memoria, non la capacità di indovinare un prezzo mai visto prima.
// Il confronto è con la tariffa che sta davvero sulla riga: quella che Agostino ha
// accettato o corretto a mano.
const fs = require('fs');
const righe = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

const strip = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
function fascia(pax, veicolo) {
  let p = parseInt(pax, 10);
  if (isNaN(p)) {
    const v = strip(veicolo);
    const m = v.match(/(\d{1,2}) (?:posti|pax)/);
    p = m ? parseInt(m[1], 10) : (/sprinter|minibus/.test(v) ? 9 : (/vito|minivan/.test(v) ? 7 : 0));
  }
  if (!p) return '?';
  return p <= 2 ? '≤2' : (p <= 7 ? '≤7' : '≤9');
}
const chiave = (r) => {
  const da = strip(r['Transfer > Da']), per = strip(r['Transfer < Per']);
  if (!da || !per) return null;
  return (strip(r.Fornitori) || 'generico') + ' | ' + [da, per].sort().join('  ↔  ') + ' | ' + fascia(r.Pax, r.Veicolo);
};

const valide = righe.filter((r) => Number(r.Tariffa) > 0 && chiave(r));

// il listino imparato si costruisce sui prezzi RIPORTATI A GIORNO: una corsa delle 5 del
// mattino sta nel gestionale col supplemento già dentro, e mescolarla con le altre
// sporcherebbe la riga di listino.
function impara(insieme) {
  const g = new Map();
  for (const r of insieme) {
    const k = chiave(r);
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(Math.round(Number(r.Tariffa) / notturno(r)));
  }
  const out = new Map();
  for (const [k, prezzi] of g) {
    if (prezzi.length < 2) continue;
    const conta = {};
    prezzi.forEach((p) => { conta[p] = (conta[p] || 0) + 1; });
    const [top, n] = Object.entries(conta).sort((a, b) => b[1] - a[1])[0];
    if (n / prezzi.length >= 0.75) out.set(k, Number(top));
  }
  return out;
}

// Il supplemento notturno che il motore già applica: prima delle 7 il prezzo si moltiplica
// per 1,2. Senza tenerne conto, gli «errori» del listino imparato sono quasi tutti quello.
const notturno = (r) => {
  const h = parseInt(String(r.Time || '').slice(0, 2), 10);
  return (!isNaN(h) && h < 7) ? 1.2 : 1;
};
let risponde = 0, giuste = 0, vicine = 0, sbagliate = 0, tace = 0;
const errori = [];
for (const r of valide) {
  const k = chiave(r);
  // fuori dall'insieme di apprendimento: questa riga e tutte quelle scritte lo stesso
  // giorno (una prenotazione andata/ritorno arriva insieme: sarebbe un aiutino)
  const senzaDiLei = valide.filter((x) => !(chiave(x) === k && x.Data === r.Data));
  const listino = impara(senzaDiLei);
  if (!listino.has(k)) { tace++; continue; }
  risponde++;
  const p = Math.round(listino.get(k) * notturno(r)), vero = Number(r.Tariffa);
  if (p === vero) giuste++;
  else if (Math.abs(p - vero) / vero <= 0.15) vicine++;
  else {
    sbagliate++;
    if (errori.length < 10) errori.push(String(vero).padStart(5) + ' vs ' + String(p).padStart(5) + '   ' + k);
  }
}

const tot = valide.length;
const pct = (n, d) => (d ? Math.round(n * 100 / d) + '%' : '—');
console.log('\nRighe con un prezzo: ' + tot);
console.log('  il listino imparato risponde:  ' + risponde + '  (' + pct(risponde, tot) + ')');
console.log('  non risponde (tratta mai vista): ' + tace + '  (' + pct(tace, tot) + ')');
console.log('\nQuando risponde:');
console.log('  stesso identico prezzo:   ' + giuste + '  (' + pct(giuste, risponde) + ')');
console.log('  entro il 15%:             ' + vicine + '  (' + pct(vicine, risponde) + ')');
console.log('  sbagliato:                ' + sbagliate + '  (' + pct(sbagliate, risponde) + ')');
if (errori.length) { console.log('\nDove sbaglia (vero vs imparato):'); errori.forEach((e) => console.log('  ' + e)); }
console.log('');
