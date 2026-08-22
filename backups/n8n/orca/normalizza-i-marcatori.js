// === NORMALIZZA I MARCATORI — 20/08/2026 ===
// Nodo: «Normalizza i marcatori» in Agente Orchestratore (UAz4R93BWh9VuLiR),
// fra «Risposta vuota?» (uscita 1) e «Code Parser Intent».
//
// ─────────────────────────────────────────────────────────────────────────────
// IL GUASTO, CON LA PROVA
// Agostino, 20/08: «non crea neanche messaggi per parlare con il cliente, è proprio
// pessimo». Ha ragione, e la causa è di una riga.
//
// Il prompt chiede al modello di racchiudere il messaggio cliente fra [[WA_MSG]] e
// [[/WA_MSG]], seguiti da [[WA_TEL:numero]]. «Code Parser Intent» cerca esattamente
// quelle doppie quadre, e quando le trova costruisce il link «💬 Invia su WhatsApp».
// Nell'esecuzione 772543 delle 09:54 il modello ha invece scritto:
//     <WA_MSG> … </WA_MSG>   <WA_TEL></WA_TEL>
// Le quadre non ci sono, il parser non riconosce niente, e succedono due cose:
//   1. il link WhatsApp NON viene creato — cioè la cosa per cui Orca esiste;
//   2. i tag restano nel testo e Agostino se li vede in chat, in mezzo al messaggio.
//
// PERCHÉ NON SI RISOLVE NEL PROMPT. Perché è già scritto nel prompt, e il modello lo
// ha disatteso lo stesso. È la regola di CLAUDE.md: quello che conta lo produce il
// codice, non le parole. Qui il codice non può produrre il testo del messaggio — quello
// è lavoro del modello — ma può smettere di essere schizzinoso su COME lo incarta.
//
// COSA FA. Prende i marcatori che il modello può scrivere in cinque modi diversi e li
// riscrive tutti nell'unica forma che «Code Parser Intent» capisce. Solo i nomi noti:
// il resto del testo, tag HTML compresi (<b>, <a href>), non si tocca.
//
// Banco: banchi/te/banco-marcatori.js
// ─────────────────────────────────────────────────────────────────────────────
const items = $input.all();
const fuori = [];

// I marcatori che contano. Per ognuno: come si chiama, e se porta un valore dopo i due punti.
const APERTURA = ['WA_MSG'];
const CHIUSURA = ['WA_MSG'];
const CON_VALORE = ['WA_TEL', 'SUMUP', 'INTENT', 'BUTTONS'];

// Le parentesi che il modello usa quando si dimentica quelle giuste.
// `<…>` incluso: è la forma in cui ha sbagliato il 20/08.
const A = '(?:\\[\\[|\\[|<|\\{\\{|\\(\\()';
const C = '(?:\\]\\]|\\]|>|\\}\\}|\\)\\))';

function normalizza(testo) {
  let t = String(testo == null ? '' : testo);

  // 1) chiusure prima delle aperture, altrimenti «</WA_MSG>» verrebbe letto come apertura
  for (const nome of CHIUSURA) {
    t = t.replace(new RegExp(A + '\\s*/\\s*' + nome + '\\s*' + C, 'gi'), '[[/' + nome + ']]');
  }
  // 2) aperture semplici
  for (const nome of APERTURA) {
    t = t.replace(new RegExp(A + '\\s*' + nome + '\\s*' + C, 'gi'), '[[' + nome + ']]');
  }
  // 3) marcatori col valore: «WA_TEL:393331234567», «SUMUP: 50», «INTENT: action_transfer»
  for (const nome of CON_VALORE) {
    // forma con i due punti dentro le parentesi
    t = t.replace(new RegExp(A + '\\s*' + nome + '\\s*[:=]\\s*([^\\]\\}\\)>]*?)\\s*' + C, 'gi'),
      (_, v) => '[[' + nome + ':' + String(v).trim() + ']]');
    // forma a coppia: <WA_TEL>393331234567</WA_TEL>, anche vuota
    t = t.replace(new RegExp(A + '\\s*' + nome + '\\s*' + C + '([\\s\\S]{0,80}?)' + A + '\\s*/\\s*' + nome + '\\s*' + C, 'gi'),
      (_, v) => '[[' + nome + ':' + String(v).trim() + ']]');
    // forma nuda senza valore: «[[WA_TEL]]» → vale come «numero non lo so»
    t = t.replace(new RegExp(A + '\\s*' + nome + '\\s*' + C, 'gi'), '[[' + nome + ':]]');
  }

  // INTENT e BUTTONS il parser li vuole a quadra singola: si riportano indietro.
  t = t.replace(/\[\[INTENT:\s*([^\]]*?)\s*\]\]/gi, (_, v) => '[INTENT: ' + String(v).trim() + ']');
  t = t.replace(/\[\[BUTTONS:\s*([^\]]*?)\s*\]\]/gi, (_, v) => '[BUTTONS: ' + String(v).trim() + ']');
  // un BUTTONS senza scelte non è un elenco di bottoni: è rumore, e il parser lo prenderebbe
  t = t.replace(/\[BUTTONS:\s*\]\s*/gi, '');
  return t;
}

// ── LA SPIA: domande fatte alla persona sbagliata ────────────────────────────
// Agostino, 20/08: «non mi piace faccia domande che dovrebbe fare direttamente al
// cliente, inutile chiedere a me». La regola sta nel prompt (nodo «Regola: chiedilo al
// cliente»), e una regola scritta o funziona o non funziona: questo la misura.
// Qui NON si corregge niente — riscrivere la prosa del modello è peggio del male. Si
// segna e basta: se `domande_da_cliente` resta pieno turno dopo turno, la regola non ha
// preso e va cambiata strada.
const DATI_DEL_CLIENTE = [
  ['nome del cliente', /\bnome\b(?!\s+(?:della|del)\s+(?:struttura|hotel|fornitore))/i],
  ['numero del cliente', /\b(numero|cellulare|telefono|contatto)\b/i],
  ['punto di ritiro', /\b(punto di ritiro|dove.{0,12}prendiamo|da quale struttura|indirizzo di ritiro|pick.?up)\b/i],
  ['orario', /\b(a che ora|che ora preferisce|orario di partenza)\b/i],
  ['quante persone', /\b(quanti sono|quante persone|quanti pax|numero di passeggeri)\b/i],
  ['volo', /\b(numero di volo|che volo)\b/i],
  ['lingua', /\b(italiano o inglese|in che lingua|conferm\w+ (?:la )?lingua)\b/i]
];
const CHIEDE = /(mi serv|serve\b|mi manca|mancano|dimmi|mi dici|puoi darmi|mi passi|conferm\w+\?)/i;

function domandeFuoriPosto(testo) {
  // si guarda SOLO quello che Agostino legge: il messaggio per il cliente è giusto che
  // le domande le contenga.
  const soloPerAgostino = String(testo).replace(/\[\[WA_MSG\]\][\s\S]*?\[\[\/WA_MSG\]\]/gi, ' ');
  if (!CHIEDE.test(soloPerAgostino)) return [];
  return DATI_DEL_CLIENTE.filter(([, rx]) => rx.test(soloPerAgostino)).map(([nome]) => nome);
}

for (const it of items) {
  const j = it.json || {};
  const grezzo = (j.output !== undefined && j.output !== null) ? j.output : j.text;
  const pulito = normalizza(grezzo);
  fuori.push({ json: Object.assign({}, j, {
    output: pulito,
    // si tiene traccia solo quando è servito davvero: così si vede se il modello continua
    // a sbagliare le parentesi anche dopo aver sistemato il prompt.
    marcatori_raddrizzati: pulito !== String(grezzo == null ? '' : grezzo),
    domande_da_cliente: domandeFuoriPosto(pulito)
  }) });
}
return fuori;
