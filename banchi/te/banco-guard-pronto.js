// =====================================================================
// Banco offline — GUARD PRONTO
// =====================================================================
//
// Prova `apps-script/struttura-guard-pronto.gs`: la guardia di Suite 10
// portata sugli altri fogli, con l'avviso che non si perde più.
//
// Il caso che deve PASSARE è vero, non inventato: è la riga 255 di Pietra Blu
// di stamattina, presa dal `rowValues` dell'esecuzione n8n 754716 — Costa
// Maria, 18/08 08:25, Pietra Blu → Polignano. Quella riga è arrivata davvero
// su Telegram e Agostino l'ha confermata alle 07:56, quindi la guardia NON
// deve toccarla. Se un giorno questo banco la blocca, la guardia è diventata
// troppo severa e stiamo per perdere transfer buoni.
//
//   node banchi/te/banco-guard-pronto.js

const fs = require('fs');
const path = require('path');

// --- finto SpreadsheetApp, il minimo che serve ------------------------
function FintoFoglio() {
  const celle = new Map(), note = new Map(), sfondi = new Map();
  const k = (r, c) => r + ',' + c;
  const api = {
    _note: note, _sfondi: sfondi,
    getRange: (r, c) => ({
      getValue: () => celle.get(k(r, c)) || '',
      setValue(v) { celle.set(k(r, c), v); return this; },
      getValues: () => [[celle.get(k(r, c)) || '']],
      getNote: () => note.get(k(r, c)) || null,
      setNote(v) { if (v === null) note.delete(k(r, c)); else note.set(k(r, c), v); return this; },
      setBackground(v) { if (v === null) sfondi.delete(k(r, c)); else sfondi.set(k(r, c), v); return this; },
    }),
    leggi: (r, c) => celle.get(k(r, c)) || '',
    scrivi: (r, c, v) => celle.set(k(r, c), v),
  };
  return api;
}
const toasts = [];
const FintoSpreadsheetApp = {
  flush: () => {},
  getActive: () => ({ toast: (m, t, s) => toasts.push({ m, t, s }) }),
  // In un trigger senza interfaccia `getUi()` lancia: è il caso che nella
  // versione di Suite 10 faceva sparire l'avviso. Qui deve NON fare danno.
  getUi: () => { throw new Error('nessuna UI in questo trigger'); },
};

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'apps-script', 'struttura-guard-pronto.gs'), 'utf8');
const G = {};
new Function('exports', 'SpreadsheetApp', SRC + `
exports.teMotiviBlocco_        = teMotiviBlocco_;
exports.teApplicaGuardPronto_  = teApplicaGuardPronto_;
exports.tePuliscoAvvisoPronto_ = tePuliscoAvvisoPronto_;
`)(G, FintoSpreadsheetApp);

let ko = 0;
function prova(nome, atteso, effettivo) {
  const a = JSON.stringify(atteso), e = JSON.stringify(effettivo);
  const ok = a === e;
  if (!ok) ko++;
  console.log(`${ok ? '  ok  ' : '  KO  '} ${nome}`);
  if (!ok) console.log(`        atteso:   ${a}\n        ottenuto: ${e}`);
}

/** Costruisce una riga 1..24 partendo da quella vera e cambiando qualcosa. */
function riga(modifiche) {
  // Pietra Blu riga 255, dal rowValues dell'esecuzione 754716.
  const base = [
    'mar 18 agosto 2026', 'PAlla stazione di polignano', 'mar 18 agosto 2026', '08:25',
    'Pietra Blu', 'Polignano a Mare', 2, 'Costa Maria', 'Pietra Blu', '',
    '41792398885', '', '', '', 30, 30, 0,
    'Incassare', 'Incassa PREZZO PIENO (commissione: alla struttura)', '',
    false, 'Pronto', 'Da svolgere', 'TR-20260818-79c69fc8',
  ];
  const r = base.slice();
  Object.keys(modifiche || {}).forEach(function (i) { r[i] = modifiche[i]; });
  return r;
}
const I_NOTE = 1, I_FORNITORE = 8, I_TARIFFA = 15, I_MODALITA = 17, I_TIPOLOGIA = 18;

console.log('== Banco: GUARD PRONTO ==\n');

console.log('-- il caso vero che NON si tocca --');
prova('Pietra Blu 255 (Costa Maria): passa', [], G.teMotiviBlocco_(riga()).problemi);

console.log('\n-- cosa blocca, e perché --');
prova('senza Fornitore', ['Fornitore'],
  G.teMotiviBlocco_(riga({ [I_FORNITORE]: '' })).problemi);
prova('senza Modalità', ['Modalita/Pagamento'],
  G.teMotiviBlocco_(riga({ [I_MODALITA]: '', [I_TIPOLOGIA]: '' })).problemi);
prova('tariffa a 0', ['Tariffa a 0'],
  G.teMotiviBlocco_(riga({ [I_TARIFFA]: 0 })).problemi);
prova('tariffa vuota', ['Tariffa a 0'],
  G.teMotiviBlocco_(riga({ [I_TARIFFA]: '' })).problemi);
prova('tutti e tre insieme', ['Fornitore', 'Modalita/Pagamento', 'Tariffa a 0'],
  G.teMotiviBlocco_(riga({ [I_FORNITORE]: '', [I_MODALITA]: '', [I_TIPOLOGIA]: '', [I_TARIFFA]: 0 })).problemi);

console.log('\n-- locale italiano: la virgola non deve far sballare niente --');
prova('«30,00 €» vale 30', [], G.teMotiviBlocco_(riga({ [I_TARIFFA]: '30,00 €' })).problemi);
prova('«0,00» è zero', ['Tariffa a 0'], G.teMotiviBlocco_(riga({ [I_TARIFFA]: '0,00' })).problemi);
prova('«1.234,50» non è zero', [], G.teMotiviBlocco_(riga({ [I_TARIFFA]: '1.234,50' })).problemi);

console.log('\n-- i transfer di cortesia passano con tariffa 0 --');
[['nelle Note', I_NOTE, 'Complimentary shuttle per il cliente'],
 ['nella Tipologia', I_TIPOLOGIA, 'Omaggio struttura'],
 ['nella Modalità', I_MODALITA, 'Free shuttle'],
 ['«navetta gratuita»', I_NOTE, 'navetta gratuita concordata']]
.forEach(function (c) {
  prova('cortesia ' + c[0], [],
    G.teMotiviBlocco_(riga({ [I_TARIFFA]: 0, [c[1]]: c[2] })).problemi);
});

console.log('\n-- l\'avviso non si perde, anche senza interfaccia --');
const foglio = FintoFoglio();
toasts.length = 0;
const bloccato = G.teApplicaGuardPronto_(foglio, 70, 22, ['Fornitore', 'Tariffa a 0']);
prova('ha bloccato', true, bloccato);
prova('lo Stato è stato svuotato', '', foglio.leggi(70, 22));
prova('la NOTA è rimasta sulla cella (questo è il canale che non fallisce)',
  true, (foglio._note.get('70,22') || '').indexOf('manca Fornitore, Tariffa a 0') !== -1);
prova('la cella è colorata di rosso', '#f4cccc', foglio._sfondi.get('70,22'));
prova('il toast è partito lo stesso', 10, toasts.length ? toasts[0].s : null);
prova('`getUi()` che lancia NON ha fatto saltare la funzione', true, bloccato);

G.tePuliscoAvvisoPronto_(foglio, 70, 22);
prova('sistemata la riga, la nota sparisce', undefined, foglio._note.get('70,22'));
prova('e il rosso pure', undefined, foglio._sfondi.get('70,22'));

prova('riga a posto: non blocca e non scrive niente',
  false, G.teApplicaGuardPronto_(FintoFoglio(), 70, 22, []));

console.log(`
─────────────────────────────────────────────────────────────────────
DA DECIDERE, non l'ho cambiato di mia iniziativa.

Nell'elenco delle parole di cortesia c'è \`free\` da solo, quindi la regola
riconosce anche "Freedom", "Freeway", "Free Wi-Fi". Su una riga con tariffa 0
e "Freedom Hotel" nelle Note, la guardia lascia passare un transfer che invece
andrebbe fermato.

È così anche su Suite 10 oggi: non l'ho toccato perché è una regola sui soldi
e la cambi tu, non io. Se vuoi, basta togliere \`free\` e tenere le altre
(\`free shuttle\` e \`free tour\` restano coperte da \`free shuttle\`/\`gratuit\`).
─────────────────────────────────────────────────────────────────────`);

// La prova del problema qui sopra, scritta perché resti visibile.
const falsoPositivo = G.teMotiviBlocco_(riga({ [I_TARIFFA]: 0, [I_NOTE]: 'Cliente al Freedom Hotel' }));
console.log(`\n  (verifica: "Freedom Hotel" + tariffa 0 → ` +
  (falsoPositivo.problemi.length ? 'bloccato' : 'PASSA, come descritto sopra') + ')');

console.log(`\n${ko} prove rosse.`);
process.exit(ko > 0 ? 1 : 0);
