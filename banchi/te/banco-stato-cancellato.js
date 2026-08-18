// =====================================================================
// Banco offline — lo Stato cancellato sotto il naso
// =====================================================================
//
// PERCHÉ ESISTE.
//
// 17/08/2026, 6 Stelle Mama riga 69. Agostino mette «Pronto». La riga entra in
// coda regolarmente. Otto secondi dopo lo sweeper la riprende, rilegge la
// colonna Stato e ci trova **il vuoto**:
//
//     6 Stelle Mama | IGNORATO | 17/08 17.48.43
//     Stato ora è "": n8n la scarta, non è più da mandare
//
// Nessuno ha toccato quella cella. L'ha svuotata `incassare_`, dentro
// `onEdit_completo`, che gira sulla stessa modifica:
//
//     const tipologiaNonScelta = (modalita === "incassare") && (!tipoVal || tipoVal === PLACEHOLDER);
//     if (tipologiaNonScelta && !editToccaS) {
//       e.range.clearContent();        // <-- qui
//       ...toast 4 secondi, "Bloccato"
//     }
//
// La guardia serve: senza tipologia scelta la tariffa esce sbagliata. Ma è
// scritta per proteggere **i soldi** e finisce per mangiare **il salvataggio**,
// perché non distingue la colonna V da tutte le altre. E il solo avviso è un
// toast di quattro secondi in un angolo del foglio.
//
// COSA PROVA QUESTO BANCO.
//
// Fa girare il codice VERO di `apps-script/struttura-onedit.gs` contro un finto
// SpreadsheetApp, e il codice VERO di `apps-script/transfer-queue-processor.gs`
// per la decisione dello sweeper. Niente parafrasi: le regole si provano su
// quello che gira in produzione.
//
//   BLOCCO 1 — com'è adesso, su `struttura-onedit.gs`. Riproduce il guasto.
//              Deve passare: se smette, il guasto è cambiato e va riletto tutto.
//   BLOCCO 2 — con `struttura-incassare-corretto.gs` incollato in coda, cioè
//              esattamente quello che succede quando Agostino sostituisce la
//              funzione sul foglio. Scritto rosso PRIMA della correzione, oggi
//              verde. Verde qui non vuol dire pubblicata.
//
//   node banchi/te/banco-stato-cancellato.js
//
// La riga 255 di Pietra Blu (18/08, Costa Maria) NON è morta così: lì la
// tipologia era scelta, la guardia non è scattata, la scheda è arrivata e tu
// l'hai confermata alle 07:56. È il caso di controllo del blocco 1.

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------
// Finto SpreadsheetApp: il minimo perché il codice vero giri senza saperlo.
// ---------------------------------------------------------------------

const COL = { D_ORA: 4, I_FORNITORE: 9, K_TEL: 11, R_MODALITA: 18, S_TIPO: 19, V_STATO: 22, X_ID: 24 };

function FintoFoglio(nome, righe) {
  const celle = new Map();                       // "riga,colonna" -> valore
  const note = new Map();                        // "riga,colonna" -> nota appiccicata
  const diario = [];                             // cosa è stato scritto, e da dove
  const chiave = (r, c) => r + ',' + c;

  const api = {
    _celle: celle,
    _note: note,
    _diario: diario,
    getName: () => nome,
    getLastRow: () => righe,
    getRange(r, c, nr, nc) {
      return FintoIntervallo(api, r, c, nr === undefined ? 1 : nr, nc === undefined ? 1 : nc);
    },
    leggi: (r, c) => (celle.has(chiave(r, c)) ? celle.get(chiave(r, c)) : ''),
    scrivi: (r, c, v, chi) => { celle.set(chiave(r, c), v); diario.push({ r, c, v, chi }); },
  };
  return api;
}

function FintoIntervallo(foglio, riga, colonna, numRighe, numColonne) {
  const note = foglio._note;
  return {
    getRow: () => riga,
    getColumn: () => colonna,
    getNumRows: () => numRighe,
    getNumColumns: () => numColonne,
    getValue: () => foglio.leggi(riga, colonna),
    setValue(v) { foglio.scrivi(riga, colonna, v, 'setValue'); return this; },
    getValues() {
      const out = [];
      for (let i = 0; i < numRighe; i++) {
        const r = [];
        for (let j = 0; j < numColonne; j++) r.push(foglio.leggi(riga + i, colonna + j));
        out.push(r);
      }
      return out;
    },
    setValues(vals) {
      for (let i = 0; i < vals.length; i++)
        for (let j = 0; j < vals[i].length; j++)
          foglio.scrivi(riga + i, colonna + j, vals[i][j], 'setValues');
      return this;
    },
    clearContent() {
      for (let i = 0; i < numRighe; i++)
        for (let j = 0; j < numColonne; j++)
          foglio.scrivi(riga + i, colonna + j, '', 'clearContent');
      return this;
    },
    setNumberFormat() { return this; },
    setBackground() { return this; },
    setNote(v) { note.set(riga + ',' + colonna, v); return this; },
    getDataValidation: () => null,
    clearDataValidations() { return this; },
    setDataValidation() { return this; },
    getSheet: () => foglio,
  };
}

const toasts = [];
const FintoSpreadsheetApp = {
  getActive: () => ({ toast: (msg, titolo, sec) => toasts.push({ msg, titolo, sec }) }),
  // Un trigger installabile non ha sempre una UI: se la chiamata parte, in
  // produzione può lanciare. Qui lo rendiamo esplicito invece di nasconderlo.
  getUi: () => { throw new Error('getUi() non disponibile in un trigger installabile'); },
  newDataValidation: () => {
    const b = {
      requireValueInList: () => b, setAllowInvalid: () => b, build: () => ({}),
    };
    return b;
  },
  flush: () => {},
};

// ---------------------------------------------------------------------
// Carica il codice vero
// ---------------------------------------------------------------------

const SRC_STRUTTURA = fs.readFileSync(
  path.join(__dirname, '..', '..', 'apps-script', 'struttura-onedit.gs'), 'utf8');

const struttura = {};
new Function('exports', 'SpreadsheetApp', 'console', SRC_STRUTTURA + `
exports.onEdit_completo = onEdit_completo;
exports.incassare_      = incassare_;
`)(struttura, FintoSpreadsheetApp, console);

// La versione CORRETTA: stesso file, con `incassare_` sostituita in coda.
// In JavaScript vince l'ultima dichiarazione, quindi è esattamente quello che
// succederà sul foglio quando Agostino incollerà la funzione al posto di quella vecchia.
const SRC_CORRETTO = fs.readFileSync(
  path.join(__dirname, '..', '..', 'apps-script', 'struttura-incassare-corretto.gs'), 'utf8');

const corretto = {};
new Function('exports', 'SpreadsheetApp', 'console', SRC_STRUTTURA + '\n' + SRC_CORRETTO + `
exports.onEdit_completo = onEdit_completo;
`)(corretto, FintoSpreadsheetApp, console);

// Lo sweeper: la funzione vera che decide se n8n accetterebbe la riga.
const SRC_CODA = fs.readFileSync(
  path.join(__dirname, '..', '..', 'apps-script', 'transfer-queue-processor.gs'), 'utf8');
const coda = {};
new Function('exports', SRC_CODA.split('// TIMER')[0] + `
exports.teN8nAccetta_ = teN8nAccetta_;
`)(coda);

// ---------------------------------------------------------------------
// Impalcatura di prova
// ---------------------------------------------------------------------

let ko = 0, koAttesi = 0;
function prova(nome, atteso, effettivo, deveFallireAdesso) {
  const a = JSON.stringify(atteso), e = JSON.stringify(effettivo);
  const ok = a === e;
  if (!ok) { ko++; if (deveFallireAdesso) koAttesi++; }
  console.log(`${ok ? '  ok  ' : (deveFallireAdesso ? '  KO  ' : '  KO! ')} ${nome}`);
  if (!ok) console.log(`        atteso:   ${a}\n        ottenuto: ${e}`);
}

/**
 * Rigioca una modifica vera: scrivi `valore` nella colonna `colonna` della
 * riga, poi fai girare `onEdit_completo` esattamente come fa il trigger.
 * Restituisce cosa è rimasto nella cella dello Stato e cosa deciderebbe lo sweeper.
 */
function rigioca({ modalita, tipologia, colonna, valore, riga = 69, versione = struttura }) {
  const foglio = FintoFoglio('Prenotazioni', 400);
  foglio.scrivi(riga, COL.R_MODALITA, modalita, 'setup');
  foglio.scrivi(riga, COL.S_TIPO, tipologia, 'setup');
  foglio.scrivi(riga, COL.V_STATO, valore, 'utente');   // la cella che hai appena scritto
  toasts.length = 0;

  const e = { range: FintoIntervallo(foglio, riga, colonna, 1, 1), value: valore, oldValue: '' };
  versione.onEdit_completo(e);

  const statoDopo = foglio.leggi(riga, COL.V_STATO);
  return {
    statoDopo,
    cancellata: foglio._diario.some(d => d.chi === 'clearContent' && d.c === COL.V_STATO),
    sweeperManda: coda.teN8nAccetta_(statoDopo),
    toast: toasts.length ? toasts[0] : null,
    notaSuS: foglio._note.get(riga + ',' + COL.S_TIPO) || null,
  };
}

const TIPO_SCELTA = 'Incassa PREZZO PIENO (commissione: alla struttura)';
const PLACEHOLDER = '⬇️ Scegli tipologia';

console.log('== Banco: lo Stato cancellato sotto il naso ==\n');

// =====================================================================
// BLOCCO 1 — com'è adesso. Deve passare: descrive il guasto vero.
// =====================================================================
console.log('-- BLOCCO 1: com\'è adesso (deve passare) --');

// 6 Stelle Mama riga 69, 17/08 17:48. Incassare, tipologia mai scelta.
const guasto = rigioca({ modalita: 'Incassare', tipologia: '', colonna: COL.V_STATO, valore: 'Pronto' });
prova('«Pronto» viene cancellato dalla guardia incasso', true, guasto.cancellata);
prova('nello Stato resta il vuoto', '', guasto.statoDopo);
prova('lo sweeper non manda niente (è l\'IGNORATO delle 17.48.43)', false, guasto.sweeperManda);
prova('l\'unico avviso è un toast di 4 secondi', 4, guasto.toast && guasto.toast.sec);

// Stesso guasto con il placeholder ancora nella colonna S.
const guastoPh = rigioca({ modalita: 'Incassare', tipologia: PLACEHOLDER, colonna: COL.V_STATO, valore: 'Pronto' });
prova('col placeholder in S il risultato è identico', '', guastoPh.statoDopo);

// Controllo: Pietra Blu riga 255 di stamattina. Tipologia scelta, tutto fila.
const ok255 = rigioca({ modalita: 'Incassare', tipologia: TIPO_SCELTA, colonna: COL.V_STATO, valore: 'Pronto', riga: 255 });
prova('riga 255 (tipologia scelta): «Pronto» sopravvive', 'Pronto', ok255.statoDopo);
prova('riga 255: lo sweeper manda', true, ok255.sweeperManda);

// La guardia non scatta se stai proprio scegliendo la tipologia.
const suS = rigioca({ modalita: 'Incassare', tipologia: '', colonna: COL.S_TIPO, valore: TIPO_SCELTA });
prova('modifica sulla colonna S: niente cancellazione', false, suS.cancellata);

// Senza «Incassare» la guardia dorme.
const senza = rigioca({ modalita: 'Da incassare in struttura', tipologia: '', colonna: COL.V_STATO, valore: 'Pronto' });
prova('senza «Incassare» lo Stato resta', 'Pronto', senza.statoDopo);

// Il danno non è solo sullo Stato: la guardia mangia qualunque colonna.
const nome = (() => {
  const foglio = FintoFoglio('Prenotazioni', 400);
  foglio.scrivi(70, COL.R_MODALITA, 'Incassare', 'setup');
  foglio.scrivi(70, COL.S_TIPO, '', 'setup');
  foglio.scrivi(70, 8, 'Costa Maria', 'utente');
  struttura.onEdit_completo({ range: FintoIntervallo(foglio, 70, 8, 1, 1), value: 'Costa Maria', oldValue: '' });
  return foglio.leggi(70, 8);
})();
prova('anche il nome del cliente viene cancellato', '', nome);

// =====================================================================
// BLOCCO 2 — come deve diventare. Adesso fallisce. È il metro.
// =====================================================================
console.log('\n-- BLOCCO 2: con la correzione (deve passare) --');

// Stessa identica scena della riga 69, ma col codice corretto.
const curato = rigioca({ modalita: 'Incassare', tipologia: '', colonna: COL.V_STATO, valore: 'Pronto', versione: corretto });
prova('lo Stato non si cancella MAI: «Pronto» resta', 'Pronto', curato.statoDopo);
prova('niente clearContent sulla colonna V', false, curato.cancellata);
prova('la riga parte lo stesso — in dubbio si tiene', true, curato.sweeperManda);
prova('la tipologia mancante lascia una NOTA sulla colonna S',
  true, !!(curato.notaSuS && curato.notaSuS.indexOf('Tipologia incasso da scegliere') !== -1));
prova('il toast dura 10 secondi, non 4', 10, curato.toast && curato.toast.sec);

// L'Id è protetto quanto lo Stato: senza, la coda non ritrova più la riga.
const idProtetto = (() => {
  const f = FintoFoglio('Prenotazioni', 400);
  f.scrivi(69, COL.R_MODALITA, 'Incassare', 'setup');
  f.scrivi(69, COL.S_TIPO, '', 'setup');
  f.scrivi(69, COL.X_ID, 'TR-20260818-abc', 'utente');
  corretto.onEdit_completo({ range: FintoIntervallo(f, 69, COL.X_ID, 1, 1), value: 'TR-20260818-abc', oldValue: '' });
  return f.leggi(69, COL.X_ID);
})();
prova('anche l\'Id sopravvive', 'TR-20260818-abc', idProtetto);

// Un incollaggio largo che comprende lo Stato non deve cancellare NIENTE.
const incollaggio = (() => {
  const f = FintoFoglio('Prenotazioni', 400);
  f.scrivi(69, COL.R_MODALITA, 'Incassare', 'setup');
  f.scrivi(69, COL.S_TIPO, '', 'setup');
  f.scrivi(69, 21, 'Addebitato', 'utente');
  f.scrivi(69, COL.V_STATO, 'Pronto', 'utente');
  corretto.onEdit_completo({ range: FintoIntervallo(f, 69, 21, 1, 2), value: 'Pronto', oldValue: '' });
  return [f.leggi(69, 21), f.leggi(69, COL.V_STATO)];
})();
prova('incollaggio largo che tocca V: non si cancella niente', ['Addebitato', 'Pronto'], incollaggio);

// E la guardia vecchia resta dov'era per le colonne non protette.
const nomeAncoraBloccato = (() => {
  const f = FintoFoglio('Prenotazioni', 400);
  f.scrivi(70, COL.R_MODALITA, 'Incassare', 'setup');
  f.scrivi(70, COL.S_TIPO, '', 'setup');
  f.scrivi(70, 8, 'Costa Maria', 'utente');
  corretto.onEdit_completo({ range: FintoIntervallo(f, 70, 8, 1, 1), value: 'Costa Maria', oldValue: '' });
  return f.leggi(70, 8);
})();
prova('il blocco resta sulle altre colonne (allargabile con TE_COL_PROTETTE)', '', nomeAncoraBloccato);

// Scelta la tipologia, la nota se ne va.
const notaVia = (() => {
  const f = FintoFoglio('Prenotazioni', 400);
  f.scrivi(69, COL.R_MODALITA, 'Incassare', 'setup');
  f.scrivi(69, COL.S_TIPO, TIPO_SCELTA, 'setup');
  f._note.set('69,' + COL.S_TIPO, 'vecchia nota');
  corretto.onEdit_completo({ range: FintoIntervallo(f, 69, COL.S_TIPO, 1, 1), value: TIPO_SCELTA, oldValue: '' });
  return f._note.get('69,' + COL.S_TIPO);
})();
prova('scelta la tipologia, la nota sparisce', null, notaVia);

console.log([
  '',
  "Il blocco 1 gira su apps-script/struttura-onedit.gs (com'è oggi sul foglio).",
  'Il blocco 2 gira sullo stesso file con apps-script/struttura-incassare-corretto.gs',
  'incollato in coda — cioè esattamente quello che succederà quando Agostino',
  'sostituirà la funzione.',
  '',
  '🔴 Tocca il salvataggio: verde qui non vuol dire pubblicata. Si incolla solo dopo un sì.',
  '',
].join('\n'));

console.log(`${ko} prove rosse.`);
process.exit(ko > 0 ? 1 : 0);
