// Copia VERBATIM del nodo «Trova Listino» di `Calcola Tariffa Prenotazioni`
// (n8n APv3ZqEizY1HnPia), letta il 19/08/2026.
// TROVA LISTINO v9 (2026-05-26) — synthetic Generico fallback — adattato per foglio "Programma Autisti 2.0"
// Struttura "Fornitori e strutture":
//   col Fornitori | Listino auto/minivan | Listini Tuk-tuk | €/min | % fee | Modalità | ...
// 1 fornitore = 1 listino auto/minivan + 1 listino Tuk-tuk (no più colonne per comune)
// sheetName = nome del listino (es. "Auraterrae", "Cala Ponte Hotel"), senza suffisso comune.

const ctx = $('Estrai Comuni').first().json;
const fornitori = $('Leggi Fornitori').all().map(i => i.json);

const _da = String(ctx.da || '').trim();
const _per = String(ctx.per || '').trim();
if (!_da || !_per) {
  return [{ json: { error: 'Da/Per mancanti: passa entrambi i luoghi per calcolare il prezzo.' } }];
}

let fornitore = (ctx.fornitore || '').trim().toLowerCase();
if (!fornitore) fornitore = 'generico';

// Trova colonne chiave (case-insensitive)
const keys = Object.keys(fornitori[0] || {});
const fornitoreCol  = keys.find(k => /^fornitor/i.test(k));
const listinoAutoCol = keys.find(k => /listino.*auto.*minivan|auto.*minivan/i.test(k));
const listinoTukCol  = keys.find(k => /listino.*tuk/i.test(k));
const feeCol        = keys.find(k => /%\s*fee|fee\s*orar|extra\s*fee/i.test(k));

if (!fornitoreCol)   return [{ json: { error: 'Colonna Fornitori non trovata' } }];
if (!listinoAutoCol) return [{ json: { error: 'Colonna Listino auto/minivan non trovata' } }];

// Cerca riga fornitore (match esatto, poi includes)
let matchedRow = null;
for (const row of fornitori) {
  const nome = String(row[fornitoreCol] || '').trim();
  if (nome.toLowerCase() === fornitore) { matchedRow = row; break; }
}
if (!matchedRow) {
  for (const row of fornitori) {
    const nome = String(row[fornitoreCol] || '').trim().toLowerCase();
    if (nome && (nome.includes(fornitore) || fornitore.includes(nome))) { matchedRow = row; break; }
  }
}

// Se fornitore non trovato → usa riga Generico
let fallbackUsato = false;
if (!matchedRow) {
  matchedRow = fornitori.find(r => String(r[fornitoreCol] || '').trim().toLowerCase() === 'generico');
  fallbackUsato = true;
}
if (!matchedRow) {
  // Synthetic Generico row: se non trovato nel foglio, costruiscine uno al volo
  // (evita di bloccare i preventivi quando "Fornitori e strutture" non ha la riga Generico)
  matchedRow = {};
  matchedRow[fornitoreCol] = 'Generico';
  matchedRow[listinoAutoCol] = 'Generico';
  if (listinoTukCol) matchedRow[listinoTukCol] = 'Generico Tuk-tuk';
  if (feeCol) matchedRow[feeCol] = '0';
  fallbackUsato = true;
}

const fornitoreNome = String(matchedRow[fornitoreCol] || '').trim();
const extraFeeOraria = feeCol ? (parseFloat(String(matchedRow[feeCol] || '0').replace(',','.')) || 0) : 0;
const euroMinCol = keys.find(k => /€\s*\/?\s*min|euro.*min/i.test(k));
const euroMin = euroMinCol ? (parseFloat(String(matchedRow[euroMinCol] || '0').replace(',','.')) || 0) : 0;

const veicolo = (ctx.veicolo || '').toLowerCase();
const isTukTuk = /tuk[\s\-]*tuk|ape|calessino/i.test(veicolo);

// Scegli listino in base al veicolo
let listinoName = '';
if (isTukTuk) {
  listinoName = listinoTukCol ? String(matchedRow[listinoTukCol] || '').trim() : '';
  if (!listinoName) listinoName = 'Generico Tuk-tuk';
} else {
  listinoName = String(matchedRow[listinoAutoCol] || '').trim();
  if (!listinoName) listinoName = 'Generico';
}

const items = [];
items.push({ json: {
  ...ctx,
  listino: listinoName,
  sheetName: listinoName,
  comuneMatch: '',  // legacy, non più rilevante
  extraFeeOraria,
  fornitoreOriginale: fornitoreNome,
  fallbackListinoUsato: fallbackUsato ? ('Fornitore ' + ctx.fornitore + ' non in lista → uso Generico') : null
} });

// Fallback Generico aggiuntivo: se listino primario != Generico → aggiungi Generico come 2° tentativo
// così Calcola Tariffa, se non trova la destinazione nel listino primario, può ripescare da Generico.
if (listinoName.toLowerCase() !== 'generico' && !isTukTuk) {
  items.push({ json: {
    ...ctx,
    listino: 'Generico',
    sheetName: 'Generico',
    comuneMatch: '',
    extraFeeOraria: 0,
    euroMin: 0,
    isGenericFallback: true,
    fornitoreOriginale: fornitoreNome
  } });
}

return items;
