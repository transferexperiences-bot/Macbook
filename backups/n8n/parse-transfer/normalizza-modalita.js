// NORMALIZZA MODALITÀ — 21/08/2026
// Nodo: dopo «Assegna Id», prima delle due scritture su Google Sheets.
// Workflow «Parse transfer» (IkFB29XmJJXQx1a9).
//
// ============================================================================
// PERCHÉ
// ============================================================================
// La modalità di pagamento decide come si fattura: sbagliarla costa soldi veri.
// Oggi la regola vive SOLO nel prompt — §4.10 e §4.22, 2.481 caratteri fra i quattro
// valori validi e una mappa di una trentina di sinonimi. È una tabella di traduzione:
// il modello deve ricordarsela tutta, a ogni turno, insieme alle altre 145 regole.
// Una tabella di traduzione non si ricorda: si applica.
//
// I quattro valori sul gestionale sono esattamente questi, e nessun altro:
//   Incassare · Fattura · Sconto in fattura · Dalla struttura
//
// ============================================================================
// COSA FA
// ============================================================================
// · Se il valore è già uno dei quattro (anche scritto storto, con accenti o maiuscole
//   diverse) lo riporta alla forma esatta del foglio.
// · Se è un sinonimo noto lo traduce.
// · Se NON lo riconosce non inventa niente: lascia il valore com'è e alza la bandiera
//   `_modalita_fuori_lista`, così a valle si può dire ad Agostino invece di scrivere
//   in silenzio una modalità che non esiste. In dubbio si tiene, non si indovina.
// · Se è vuoto lo lascia vuoto e alza `_modalita_mancante`: il vuoto è un buco da
//   riempire, non un errore da mascherare con un default.
//
// La riga con «Contanti» o «Carta» diventa «Incassare» — non perché sia un dettaglio
// estetico, ma perché sul gestionale quelle due voci non esistono e le formule di Fee e
// Netto ci sbattono contro.
//
// Banco: banchi/te/banco-normalizza-modalita.js
const items = $input.all();

const VALIDE = ['Incassare', 'Fattura', 'Sconto in fattura', 'Dalla struttura'];

// come si scrive una modalità per confrontarla: senza accenti, minuscola, spazi singoli
function chiave(v) {
  return String(v === undefined || v === null ? '' : v)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// La mappa dei sinonimi, presa parola per parola dalla §4.22 del prompt.
const SINONIMI = {
  // → Incassare
  'incassare': 'Incassare', 'incasso': 'Incassare', 'incassi tu': 'Incassare',
  'incassa direttamente': 'Incassare', 'contanti': 'Incassare', 'cash': 'Incassare',
  'carta': 'Incassare', 'carta di credito': 'Incassare', 'bancomat': 'Incassare',
  'pos': 'Incassare', 'paga in macchina': 'Incassare', 'in macchina': 'Incassare',
  'paga a bordo': 'Incassare', 'a bordo': 'Incassare', 'ti pagano': 'Incassare',
  'fatti pagare': 'Incassare', 'pagano a te': 'Incassare', 'ti danno i soldi': 'Incassare',
  'paga il cliente': 'Incassare', 'da incassare': 'Incassare',
  // → Fattura
  'fattura': 'Fattura', 'fatturiamo al cliente': 'Fattura', 'fattura al cliente': 'Fattura',
  'fattura singola': 'Fattura', 'fatturiamo direttamente al cliente': 'Fattura',
  'da fatturare': 'Fattura', 'fatturato': 'Fattura',
  // → Sconto in fattura
  'sconto in fattura': 'Sconto in fattura', 'in fattura al fornitore': 'Sconto in fattura',
  'in fattura alla struttura': 'Sconto in fattura', 'scontiamo in fattura': 'Sconto in fattura',
  'scontato in fattura': 'Sconto in fattura',
  // → Dalla struttura
  'dalla struttura': 'Dalla struttura', 'paga la struttura': 'Dalla struttura',
  'lo paga l hotel': 'Dalla struttura', 'paga l hotel': 'Dalla struttura',
  'lo paga il fornitore': 'Dalla struttura', 'paga il fornitore': 'Dalla struttura',
  'paga al rientro': 'Dalla struttura', 'al ritorno': 'Dalla struttura',
  'paga dopo il rientro': 'Dalla struttura', 'lo paghiamo dopo': 'Dalla struttura',
  'lo gestiamo noi': 'Dalla struttura',
};

// i quattro valori validi si riconoscono anche da soli
for (const v of VALIDE) SINONIMI[chiave(v)] = v;

function normalizza(valore) {
  const k = chiave(valore);
  if (!k) return { valore: '', mancante: true };
  if (SINONIMI[k]) return { valore: SINONIMI[k] };
  return { valore: String(valore).trim(), fuoriLista: true };
}

return items.map((it) => {
  const j = Object.assign({}, it.json || {});
  const chiaveCampo = ['Modalità', 'Modalita', 'modalità', 'modalita']
    .find((c) => Object.prototype.hasOwnProperty.call(j, c));
  const esito = normalizza(chiaveCampo ? j[chiaveCampo] : '');

  if (chiaveCampo) j[chiaveCampo] = esito.valore;
  else j['Modalità'] = esito.valore;

  if (esito.mancante) j._modalita_mancante = true;
  if (esito.fuoriLista) j._modalita_fuori_lista = esito.valore;
  return { json: j };
});
