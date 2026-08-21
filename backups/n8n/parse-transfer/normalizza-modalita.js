// ⛔⛔ NON METTERE QUESTO NODO IN PRODUZIONE COSÌ COM'È. ⛔⛔
// Pubblicato il 21/08/2026 alle 09:31 e RITIRATO dieci minuti dopo (Parse transfer
// riportato alla versione 85b571fe). Il motivo sta qui sotto, ed è un errore mio.
//
// Ho costruito la mappa dei sinonimi leggendo la §4.22 del prompt e NON ho letto la
// riga 31, che è una regola di Agostino del 05/08/2026 e dice l'opposto:
//
//   «sul gestionale sono in uso Incassare, Fattura, Contanti, Carta, Sconto in fattura,
//    Dalla struttura, Link. Sono tutti valori VALIDI: «Carta» e «Contanti» NON sono
//    errori da correggere. ⛔ VIETATO trasformare Carta→Incassare, Contanti→Incassare
//    o qualsiasi altra "normalizzazione": cambieresti in silenzio un dato di Agostino.»
//
// Questo nodo faceva esattamente la conversione vietata, su OGNI riga salvata.
//
// Il prompt si contraddice da solo: la §4.10 e la §4.22 dicono quattro valori, la riga 31
// ne elenca sette. Non è una svista da sanare a tavolino — sono due regole scritte in due
// momenti diversi per due situazioni diverse:
//   · §4.22 serve a INTERPRETARE le parole di Agostino su un transfer NUOVO
//     («paga in macchina» → Incassare);
//   · riga 31 vieta di TOCCARE la modalità di un transfer che esiste già, soprattutto
//     quando la si copia su un rientro;
//   · riga 557 dice che sul RIENTRO la conversione Contanti/Carta → Incassare è giusta,
//     ma la decide tool_rientro, non chi scrive la riga.
//
// Un nodo piazzato un attimo prima della scrittura non sa in quale dei tre casi si trova:
// vede solo un valore. Per questo qui non ci va.
//
// COME SI FA DAVVERO, quando si riprende:
//   · la traduzione dei sinonimi va DOVE si interpreta il linguaggio, cioè a monte, sul
//     transfer nuovo — non sulla riga pronta;
//   · sulla riga pronta si può solo VALIDARE: se la modalità non è fra le sette valide,
//     si segnala e non si scrive in silenzio. Mai convertire.
//   · e prima di tutto va chiesto ad Agostino quali sono le voci buone oggi, perché il
//     prompt ne dichiara quattro in un punto e sette in un altro.
//
// Il codice sotto resta come traccia del lavoro fatto e del banco (43 prove verdi:
// il banco era giusto, era sbagliata la regola che gli avevo dato).
//
// ---------------------------------------------------------------------------
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
