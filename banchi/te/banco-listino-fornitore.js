#!/usr/bin/env node
// Quanto azzecca il listino DEDICATO di un fornitore, sulle righe vere di quel fornitore.
//   node banchi/te/banco-listino-fornitore.js <gestionale.json> <listino.json> "<nome fornitore>" "<casa>"
// Il listino di una struttura è una tabella DA quella struttura: una riga per destinazione,
// tre colonne (fino a 2 / 7 / 9 pax). Quindi per una tratta il prezzo è quello dell'estremo
// che non è la struttura stessa.
// Si confronta col prezzo che sta davvero sulla riga — quello che Agostino ha accettato.
const fs = require('fs');
const righe = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const listino = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const FORNITORE = process.argv[4];
const CASA = new RegExp(process.argv[5], 'i');

const strip = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
// Alcuni listini hanno solo due colonne (Auraterrae: 7 e 9, niente 2). La chiave
// «__colonne» dice quali soglie ci sono davvero, così la fascia si sceglie come la sceglie
// il motore: la prima soglia che copre i pax, e se nessuna copre, l'ultima colonna.
const SOGLIE = listino.__colonne || [2, 7, 9];
const perNome = new Map();
for (const k of Object.keys(listino)) if (k !== '__colonne') perNome.set(strip(k), listino[k]);

function colonna(pax, veicolo) {
  let p = parseInt(pax, 10);
  if (isNaN(p) || p <= 0) {
    const v = strip(veicolo);
    const m = v.match(/(\d{1,2}) (?:posti|pax)/);
    p = m ? parseInt(m[1], 10) : (/sprinter|minibus/.test(v) ? 9 : (/vito|minivan/.test(v) ? 7 : 0));
  }
  if (!p) return null;
  for (let i = 0; i < SOGLIE.length; i++) if (p <= SOGLIE[i]) return i;
  return SOGLIE.length - 1;
}
const notturno = (r) => { const h = parseInt(String(r.Time || '').slice(0, 2), 10); return (!isNaN(h) && h < 7) ? 1.2 : 1; };

// esatto = il nome della destinazione sta nel listino così com'è
function cercaEsatto(nome) { const n = strip(nome); return n && perNome.has(n) ? perNome.get(n) : null; }
// morbido = come fa il motore oggi: uno dei due nomi contiene l'altro
function cercaMorbido(nome) {
  const n = strip(nome);
  if (!n) return null;
  for (const [k, v] of perNome) if (n.indexOf(k) >= 0 || k.indexOf(n) >= 0) return v;
  return null;
}

const mie = righe.filter((r) => strip(r.Fornitori) === strip(FORNITORE) && Number(r.Tariffa) > 0
  && String(r['Transfer > Da'] || '').trim() && String(r['Transfer < Per'] || '').trim());

const conta = { esatto: { n: 0, ok: 0, vicino: 0 }, morbido: { n: 0, ok: 0, vicino: 0 }, muto: 0 };
const sbagli = [];
for (const r of mie) {
  const col = colonna(r.Pax, r.Veicolo);
  if (col === null) { conta.muto++; continue; }
  const da = r['Transfer > Da'], per = r['Transfer < Per'];
  // l'estremo lontano da casa
  const lontani = [da, per].filter((x) => !CASA.test(strip(x)));
  let modo = 'esatto', prezzi = null;
  for (const x of lontani) { prezzi = cercaEsatto(x); if (prezzi) break; }
  if (!prezzi) { modo = 'morbido'; for (const x of lontani) { prezzi = cercaMorbido(x); if (prezzi) break; } }
  if (!prezzi) { conta.muto++; continue; }

  const atteso = Math.round(prezzi[col] * notturno(r));
  const vero = Number(r.Tariffa);
  const C = conta[modo]; C.n++;
  if (atteso === vero) C.ok++;
  else {
    if (Math.abs(atteso - vero) / vero <= 0.15) C.vicino++;
    if (sbagli.length < 10 && Math.abs(atteso - vero) / vero > 0.3)
      sbagli.push(String(vero).padStart(5) + ' vs ' + String(atteso).padStart(5) + ' (' + modo + ')  '
        + String(da).slice(0, 28) + ' → ' + String(per).slice(0, 28));
  }
}

const pct = (n, d) => (d ? Math.round(n * 100 / d) + '%' : '—');
console.log('\n' + FORNITORE + ' — righe con un prezzo: ' + mie.length);
console.log('  il listino non risponde: ' + conta.muto + '  (' + pct(conta.muto, mie.length) + ')');
for (const k of ['esatto', 'morbido']) {
  const C = conta[k];
  if (!C.n) continue;
  console.log('  nome ' + k.padEnd(8) + String(C.n).padStart(4) + ' righe   stesso numero '
    + String(pct(C.ok, C.n)).padStart(4) + '   entro il 15% ' + String(pct(C.ok + C.vicino, C.n)).padStart(4));
}
if (sbagli.length) { console.log('\n  dove sbaglia (vero vs listino):'); sbagli.forEach((s) => console.log('    ' + s)); }
console.log('');
