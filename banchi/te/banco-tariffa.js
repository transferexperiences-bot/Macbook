// =====================================================================
// Banco offline — Calcola Tariffa Prenotazioni
// =====================================================================
//
// Qui gira il CODICE VERO dei due nodi n8n (`n8n/calcola-tariffa/*.js`,
// copiati verbatim il 19/08) sui LISTINI VERI del gestionale
// (`banchi/te/dati/tariffa.json`) e su CORSE VERE prese dal foglio Strutture,
// ognuna con la tariffa che hai incassato davvero.
//
// Non è una simulazione delle regole: è il codice di produzione, fuori
// produzione. Nessun foglio viene toccato, nessuna riga scritta.
//
//   node banchi/te/banco-tariffa.js
//   node banchi/te/banco-tariffa.js --dettaglio

const fs = require('fs');
const path = require('path');

const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'dati', 'tariffa.json'), 'utf8'));
const SRC_TROVA = fs.readFileSync(
  path.join(__dirname, '..', '..', 'n8n', 'calcola-tariffa', 'trova-listino.js'), 'utf8');
const SRC_CALC = (f) => fs.readFileSync(
  path.join(__dirname, '..', '..', 'n8n', 'calcola-tariffa', f), 'utf8');

/** Il minimo di n8n che serve ai due nodi: `$('Nodo')` e `$input`. */
function nodo(codice, nodi, inputItems) {
  const items = (a) => a.map((j) => ({ json: j }));
  const $ = (nome) => ({
    first: () => ({ json: nodi[nome][0] }),
    all: () => items(nodi[nome]),
    item: { json: nodi[nome][0] },
  });
  const $input = { all: () => items(inputItems || []), first: () => ({ json: (inputItems || [])[0] }) };
  return new Function('$', '$input', codice)($, $input);
}

/** Il giro completo: Trova Listino → Leggi Listino (una volta per item) → Calcola Tariffa. */
function calcola(caso, fileCalcolo) {
  const trigger = [{ row: 1, da: caso.da, per: caso.per, pax: caso.pax, veicolo: caso.veicolo,
                     fornitore: caso.fornitore, orario: caso.orario, hextra: caso.hextra || '' }];
  const trovati = nodo(SRC_TROVA, { 'Estrai Comuni': [caso], 'Leggi Fornitori': D.fornitori })
    .map((i) => i.json);

  if (trovati.length === 1 && trovati[0].error) {
    return { status: 'error', motivo: trovati[0].error, tariffa: 0, _nessunaRisposta: true };
  }

  // «Leggi Listino» legge il foglio col nome `sheetName`. Se non c'è, il nodo è
  // su continueRegularOutput: esce un item con l'errore, non una riga di listino.
  let righe = [];
  for (const t of trovati) {
    const rows = D.listini[t.sheetName];
    righe = righe.concat(rows ? rows : [{ error: 'foglio «' + t.sheetName + '» non trovato' }]);
  }

  return nodo(SRC_CALC(fileCalcolo),
    { 'Trova Listino': trovati, 'Execute Workflow Trigger': trigger }, righe)[0].json;
}

const dettaglio = process.argv.indexOf('--dettaglio') !== -1;
const euro = (n) => (n || n === 0 ? String(Math.round(n)) + ' €' : '—');

console.log('== Banco: Calcola Tariffa — codice vero, listini veri, corse vere ==\n');
console.log('  incassato = quello che c\'è scritto nella colonna Tariffa del foglio');
console.log('  oggi      = quello che risponde il calcolatore adesso');
console.log('  nuovo     = v3: \u20ac/km dalla commissione, notturno dalle 22, tuk-tuk senza km\n');

const R = [];
for (const c of D.casi) {
  const a = calcola(c, 'calcola-tariffa.js');
  const b = calcola(c, 'calcola-tariffa-v3.js');
  R.push({ c, a, b });
  const nota = a.status === 'ok' ? a.modo : (a.motivo || a.status);
  const segno = (x) => (x.status === 'ok' ? euro(x.tariffa) : '⛔ 0 €');
  console.log(
    `  ${c.nome.padEnd(34)} ${String(c.pax + ' pax').padStart(6)}  ` +
    `incassato ${euro(c.incassato).padStart(6)}   oggi ${segno(a).padStart(7)}   ` +
    `nuovo ${segno(b).padStart(7)}   ${nota}`);
  if (dettaglio) console.log('        ', JSON.stringify(a.dettaglio || a));
}

// ---------------------------------------------------------------------
// Le prove vere e proprie
// ---------------------------------------------------------------------
let ko = 0;
function prova(nome, atteso, effettivo) {
  const a = JSON.stringify(atteso), e = JSON.stringify(effettivo);
  const ok = a === e;
  if (!ok) ko++;
  console.log(`${ok ? '  ok  ' : '  KO  '} ${nome}`);
  if (!ok) console.log(`        atteso:   ${a}\n        ottenuto: ${e}`);
}

const trova = (n) => R.find((x) => x.c.nome === n);

console.log('\n-- 1) Pietra Blu, dopo la rinomina delle colonne (19/08 sera) --');
{
  // Le colonne del listino Pietra Blu erano «≤ 2 pax» e «> 3 pax»: il codice non
  // le riconosceva e rispondeva 0 su ogni corsa. Ora sono «2» e «7» (la seconda
  // l'ho scritta io da n8n, esecuzione 769083: leggi C1 → era 3 → scrivi 7).
  const due = trova('Pietra Blu → Alberobello');
  const quattro = trova('Pietra Blu → Alberobello (4 pax)');
  prova('2 pax: un prezzo c\'è', 'ok', due.a.status);
  prova('4 pax: un prezzo c\'è (prima era pax-oltre-listino)', 'ok', quattro.a.status);

  // Ma il listino ha 11 destinazioni: Alberobello non c'è, e si ripiega sul
  // prezzo del comune (Polignano). Da qui lo scarto col davvero incassato.
  prova('   e viene dal comune, non dalla destinazione', 'comune+raggio', quattro.a.dettaglio.da.mode);
}

console.log('\n-- 2) il ripescaggio su Generico: oggi il foglio si legge e si butta --');
{
  // Corsa vera, Puglia Mare. «Polignano a Mare» NON c'è nel listino Puglia Mare,
  // c'è nel Generico a 30 €. Il Generico viene letto anche oggi — ma le tratte
  // si costruiscono solo dal listino primario, quindi resta lì.
  const x = trova('Grotte di Castellana → Polignano');
  prova('oggi: il capo «Polignano» non si risolve', null, x.a.dettaglio.per);
  prova('corretto: si risolve, ripescato dal Generico', 30, x.b.dettaglio.per.prezzo);
  prova('   e lo dichiara', 'Generico', x.b.ripescatoDa);
  // Qui il prezzo finale non cambia, perché l'altro capo è più alto e vince il MAX.
  prova('   il prezzo finale non cambia (vince l\'altro capo)', x.a.tariffa, x.b.tariffa);
}

console.log('\n-- 3) le corse che oggi funzionano non cambiano... --');
{
  const uguali = R.filter((x) => x.a.status === 'ok' && x.a.modo === 'listino-MAX' &&
    !x.b.ripescatoDa && !x.b.dettaglio.notturno && !x.c.hextra);
  uguali.forEach((x) => prova('   ' + x.c.nome + ': stessa tariffa', x.a.tariffa, x.b.tariffa));
}

console.log('\n   ...tranne quelle che il ripescaggio rimette a posto:');
{
  const cambiate = R.filter((x) => x.b.ripescatoDa && x.a.tariffa !== x.b.tariffa);
  cambiate.forEach((x) => console.log(
    `        ${x.c.nome}: oggi ${euro(x.a.tariffa)} → corretto ${euro(x.b.tariffa)} ` +
    `(incassato ${euro(x.c.incassato)}, ripescato da ${x.b.ripescatoDa})`));
  // Pietra Blu ha 11 destinazioni in listino: quasi tutto il resto oggi cade sul
  // prezzo del comune (Polignano, 30 €) invece che sulla destinazione vera.
  prova('almeno una corsa rimessa a posto dal ripescaggio', true, cambiate.length > 0);
}

console.log('\n-- 4) il notturno resta com\'è --');
{
  const x = trova('Monopoli → Melograno');            // 23:30 → non è notturno
  prova('23:30 non è notturno (la regola guarda < 07:00)', 1, x.a.moltiplicatoreNotturno);
}

console.log('\n-- 5) le ore extra: oggi sono sempre zero --');
{
  const conEuroMin = R.filter((x) => x.a.status === 'ok' && x.a.euroMin > 0);
  prova('nessun caso ha €/min diverso da 0', 0, conEuroMin.length);
  prova('e l\'extra è sempre 0', 0, R.filter((x) => x.a.extra > 0).length);
}

console.log('\n-- 6) v3: il \u20ac/km segue la commissione --');
{
  const km = R.filter((x) => x.b.modo === 'km-garage');
  km.forEach((x) => console.log(
    `        ${x.c.nome}: ${x.c.fornitore} \u2192 ${x.b.dettaglio.euroKm} \u20ac/km, ` +
    `${x.a.tariffa} \u20ac \u2192 ${x.b.tariffa} \u20ac`));
  prova('un prezzo a km \u00e8 multiplo di 5', true, km.every((x) => x.b.tariffa % 5 === 0));
}

console.log('\n-- 7) v3: il notturno parte dalle 22 --');
{
  const x = trova('Monopoli \u2192 Melograno');       // 23:30
  prova('prima: nessun supplemento', 1, x.a.moltiplicatoreNotturno);
  prova('ora: +20%', 1.2, x.b.moltiplicatoreNotturno);
  prova('   30 \u20ac \u2192 36 \u20ac (incassati 35)', 36, x.b.tariffa);
  const g = trova('Auraterrae \u2192 Ostuni');        // 12:00, in pieno giorno
  prova('a mezzogiorno resta 1', 1, g.b.moltiplicatoreNotturno);
}

console.log('\n-- 8) v3: il tuk-tuk non si quota a km --');
{
  const x = trova('Tuk-tuk \u2192 Matera');
  prova('nessun prezzo inventato', 'warning', x.b.status);
  prova('   e dice perch\u00e9', 'tuk-tuk-fuori-listino', x.b.motivo);
}

console.log('\n-- 9) v3: le ore extra arrivano al calcolo --');
{
  const x = trova('Auraterrae \u2192 Ostuni con 1h di attesa');
  prova('prima: extra 0', 0, x.a.extra);
  prova('ora: 60 min \u00d7 1,30 = 78 \u20ac', 78, x.b.extra);
}

console.log([
  '',
  '\u2500'.repeat(69),
  'Cosa cambia con la v3, in una riga:',
  '  \u2022 \u20ac/km e \u20ac/min = 1,00 + la commissione, ai 10 centesimi',
  '    (Auraterrae 26% \u2192 1,30 | Pietra Blu 20% \u2192 1,20 | nessuna fee \u2192 1,00);',
  '  \u2022 un prezzo fatto a km si arrotonda ai 5 \u20ac, minimo 30;',
  '  \u2022 il tuk-tuk non si quota a km: o \u00e8 nel suo listino, o si dice;',
  '  \u2022 notturno 22:00-07:00, non pi\u00f9 solo prima delle 07:00;',
  '  \u2022 le ore extra arrivano al calcolo (prima si perdevano per strada).',
  '',
  'Restano decisioni di Agostino, non toccate:',
  '  \u2022 il supplemento dal centro vale solo per i 18 comuni scritti nel codice;',
  '  \u2022 il listino Pietra Blu ha 11 destinazioni: il ripescaggio \u00e8 un cerotto;',
  '  \u2022 la colonna \u00ab\u20ac/min\u00bb contiene un moltiplicatore (1,0 \u00b7 1,3): sembra un \u20ac/km',
  '    rimasto indietro, e non c\'entra con i minuti.',
  '\u2500'.repeat(69),
].join('\n'));

console.log(`\n${ko} prove rosse.`);
process.exit(ko > 0 ? 1 : 0);
