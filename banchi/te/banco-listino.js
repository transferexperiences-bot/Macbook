#!/usr/bin/env node
// Banco del LISTINO sulle righe vere del gestionale.
//   node banchi/te/banco-listino.js <gestionale.json> <listino-generico.json>
// Non prova il codice: prova il RISULTATO. Ricalcola il prezzo con le stesse regole del
// nodo «Calcola Tariffa» e lo confronta con la tariffa che sta davvero sulla riga — quella
// che Agostino ha accettato o corretto a mano. Il numero che ne esce dice quanto ci si può
// fidare del calcolo automatico, fornitore per fornitore.
//
// Il listino «Generico» è una tabella DA POLIGNANO: una riga per destinazione, tre colonne
// di prezzo (fino a 2 pax, fino a 7, fino a 9). Quindi per una tratta il prezzo è quello
// dell'estremo che non è Polignano.
const fs = require('fs');
const righe = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const listino = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));

const strip = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

// le tre colonne, come le legge il nodo vero
const COLONNE = [{ k: '2', soglia: 2 }, { k: '7', soglia: 7 }, { k: '9', soglia: 9 }];
function colonna(pax) {
  if (pax <= COLONNE[0].soglia) return COLONNE[0].k;
  if (pax <= COLONNE[1].soglia) return COLONNE[1].k;
  return COLONNE[2].k;
}

// Quanti posti dice il veicolo. Il listino ragiona a fasce di passeggeri; quando il campo
// Pax è vuoto (11% delle righe di agosto) il nodo vero usa 1, e prende la colonna più
// economica anche per un Sprinter da 9.
function paxDalVeicolo(v) {
  const s = strip(v);
  if (!s) return null;
  const m = s.match(/(\d{1,2})\s*(?:posti|pax|p\b)/);
  if (m) return parseInt(m[1], 10);
  if (/sprinter|minibus|van\b|9\s*posti/.test(s)) return 9;
  if (/vito|caddy|minivan|multivan|touran/.test(s)) return 7;
  if (/berlina|classe e|passat|talisman|auto\b|e-?class/.test(s)) return 3;
  return null;
}

const perNome = new Map();
for (const r of listino) perNome.set(strip(r.d), r);
function cerca(nome) {
  const n = strip(nome);
  if (!n) return null;
  if (perNome.has(n)) return { r: perNome.get(n), modo: 'esatto' };
  // confronto morbido, come nel nodo vero
  for (const [k, r] of perNome) if (n.indexOf(k) >= 0 || k.indexOf(n) >= 0) return { r: r, modo: 'morbido' };
  return null;
}

const CASA = /polignano/;
function prezzo(da, per, pax) {
  const col = colonna(pax);
  const A = cerca(da), B = cerca(per);
  // il prezzo è quello dell'estremo lontano da casa
  const vale = (x, nome) => (x && !CASA.test(strip(nome))) ? x.r.p[col] : null;
  const pA = vale(A, da), pB = vale(B, per);
  const scelto = Math.max(pA || 0, pB || 0);
  if (!scelto) return null;
  return { prezzo: scelto, modo: (pA ? A.modo : B.modo), col: col };
}

const agosto = righe.filter((r) => /^TR[-\/]/.test(String(r.Id || '')) && Number(r.Tariffa) > 0
  && String(r['Transfer > Da'] || '').trim() && String(r['Transfer < Per'] || '').trim());

// Il numero che decide tutto: quanto vale un prezzo preso col confronto ESATTO (il nome
// della tratta sta nel listino) e quanto vale uno preso col confronto MORBIDO (il nome
// somiglia a una riga del listino). È il confronto morbido che ha trasformato «roma» in
// «Roma APT» e «stazione» in «Stazione di Bari».
const modo = { esatto: { n: 0, ok: 0, entro15: 0 }, morbido: { n: 0, ok: 0, entro15: 0 } };
let esatte = 0, vicine = 0, lontane = 0, senzaRisposta = 0;
const perFornitore = new Map();
const peggiori = [];
let cambiaColonna = 0;

for (const r of agosto) {
  const paxScritto = parseInt(r.Pax, 10);
  const paxNodo = isNaN(paxScritto) ? 1 : paxScritto;                    // come fa oggi
  const paxVero = isNaN(paxScritto) ? (paxDalVeicolo(r.Veicolo) || 1) : paxScritto;  // col veicolo
  if (colonna(paxNodo) !== colonna(paxVero)) cambiaColonna++;

  const vero = Number(r.Tariffa);
  const calc = prezzo(r['Transfer > Da'], r['Transfer < Per'], paxNodo);
  const f = String(r.Fornitori || '(senza fornitore)').trim();
  if (!perFornitore.has(f)) perFornitore.set(f, { n: 0, esatte: 0 });
  const st = perFornitore.get(f); st.n++;

  if (!calc) { senzaRisposta++; continue; }
  const scarto = Math.abs(calc.prezzo - vero) / vero;
  const M = modo[calc.modo]; M.n++;
  if (calc.prezzo === vero) M.ok++;
  if (scarto <= 0.15) M.entro15++;
  if (calc.prezzo === vero) { esatte++; st.esatte++; }
  else if (scarto <= 0.15) vicine++;
  else {
    lontane++;
    if (peggiori.length < 12 && scarto > 0.5) peggiori.push(
      String(vero).padStart(5) + ' vs ' + String(calc.prezzo).padStart(5) + ' (' + calc.modo + ', col ' + calc.col + ')  '
      + String(r['Transfer > Da']).slice(0, 30) + ' → ' + String(r['Transfer < Per']).slice(0, 30) + '  [' + f + ']');
  }
}

const pct = (n) => Math.round(n * 100 / agosto.length) + '%';
console.log('\nRighe con tariffa, partenza e destinazione: ' + agosto.length);
console.log('  il listino Generico dà lo stesso numero:      ' + esatte + '  (' + pct(esatte) + ')');
console.log('  dà un numero vicino (entro il 15%):           ' + vicine + '  (' + pct(vicine) + ')');
console.log('  dà un numero lontano:                         ' + lontane + '  (' + pct(lontane) + ')');
console.log('  non sa rispondere (tratta fuori listino):     ' + senzaRisposta + '  (' + pct(senzaRisposta) + ')');
console.log('\nRighe dove il Pax vuoto fa sbagliare colonna (il veicolo lo direbbe): ' + cambiaColonna
  + '  (' + pct(cambiaColonna) + ')');

console.log('\nEsatto contro morbido — il cuore della faccenda:');
for (const k of ['esatto', 'morbido']) {
  const M = modo[k];
  if (!M.n) continue;
  console.log('  confronto ' + k.padEnd(8) + ' ' + String(M.n).padStart(4) + ' righe   '
    + 'stesso numero ' + String(Math.round(M.ok * 100 / M.n)).padStart(3) + '%   '
    + 'entro il 15% ' + String(Math.round(M.entro15 * 100 / M.n)).padStart(3) + '%');
}

console.log('\nFornitori che il listino Generico azzecca (almeno 8 righe):');
[...perFornitore.entries()].filter(([, s]) => s.n >= 8)
  .sort((a, b) => (b[1].esatte / b[1].n) - (a[1].esatte / a[1].n))
  .forEach(([f, s]) => console.log('  ' + String(Math.round(s.esatte * 100 / s.n)).padStart(3) + '%  '
    + String(s.esatte + '/' + s.n).padStart(8) + '  ' + f));

if (peggiori.length) {
  console.log('\nDove sbaglia di più (vero vs calcolato):');
  peggiori.forEach((p) => console.log('  ' + p));
}
console.log('');
