#!/usr/bin/env node
// Cosa succederebbe davvero se il listino imparato fosse acceso.
//   node banchi/te/simula-imparato.js <gestionale.json>
// Rigioca OGNI riga vera del gestionale dentro il nodo «Applica listino imparato» e conta:
// quante righe tocca, e se le tocca per avvicinarle o per allontanarle dal prezzo che sta
// scritto sulla riga — quello che Agostino ha accettato.
// Non è una prova a specchio: il prezzo calcolato «prima» qui è la tariffa vera, quindi
// ogni cambiamento è per definizione un allontanamento. Il numero che conta è quante volte
// il listino imparato dà ESATTAMENTE quel prezzo (allora è sicuro) e quante volte no.
const fs = require('fs');
const path = require('path');
const CODICE = fs.readFileSync(path.join(__dirname, '../../backups/n8n/calcola-tariffa/applica-listino-imparato.js'), 'utf8');
const IMPARATO = require('../../backups/n8n/calcola-tariffa/listino-imparato.json');
const righe = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

const tabella = IMPARATO.map((r) => ({ json: r }));
function gira(esito) {
  const $ = (nome) => ({ first: () => ({ json: esito }) });
  const $input = { all: () => tabella };
  return new Function('$', '$input', CODICE)($, $input)[0].json;
}

let toccate = 0, uguali = 0, diverse = 0, nonTrovate = 0;
const scarti = [];
const brutte = [];
const valide = righe.filter((r) => Number(r.Tariffa) > 0
  && String(r['Transfer > Da'] || '').trim() && String(r['Transfer < Per'] || '').trim());

for (const r of valide) {
  const vero = Number(r.Tariffa);
  const out = gira({
    status: 'ok', tariffa: vero, matchEsatto: false, modo: 'listino-MAX',
    da: r['Transfer > Da'], per: r['Transfer < Per'], pax: r.Pax, veicolo: r.Veicolo,
    fornitore: r.Fornitori, orario: r.Time
  });
  if (out.listino_imparato !== 'trovata') { nonTrovate++; continue; }
  toccate++;
  if (out.tariffa === vero) uguali++;
  else {
    diverse++;
    const scarto = out.tariffa - vero;
    scarti.push(Math.abs(scarto));
    if (brutte.length < 12 && Math.abs(scarto) / vero > 0.3) brutte.push(
      String(vero).padStart(5) + ' → ' + String(out.tariffa).padStart(5) + '   '
      + String(r.Fornitori).slice(0, 22).padEnd(22) + ' '
      + String(r['Transfer > Da']).slice(0, 26) + ' → ' + String(r['Transfer < Per']).slice(0, 26));
  }
}

const pct = (n, d) => (d ? Math.round(n * 100 / d) + '%' : '—');
scarti.sort((a, b) => a - b);
console.log('\nRighe vere con un prezzo: ' + valide.length);
console.log('  il listino imparato NON risponde (resta tutto com\'è): ' + nonTrovate + '  (' + pct(nonTrovate, valide.length) + ')');
console.log('  risponde:                                             ' + toccate + '  (' + pct(toccate, valide.length) + ')');
console.log('\nQuando risponde:');
console.log('  conferma il prezzo che c\'è sulla riga:  ' + uguali + '  (' + pct(uguali, toccate) + ')');
console.log('  lo cambierebbe:                         ' + diverse + '  (' + pct(diverse, toccate) + ')');
if (scarti.length) console.log('  di quanto, quando cambia: mediana ' + scarti[Math.floor(scarti.length / 2)]
  + ' €, peggiore ' + scarti[scarti.length - 1] + ' €');
if (brutte.length) { console.log('\nI cambiamenti più grossi (vero → imparato):'); brutte.forEach((b) => console.log('  ' + b)); }
console.log('');
