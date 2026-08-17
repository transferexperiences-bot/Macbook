// Banco offline per "Esito verifica gestionale" (n8n/transfer-webhook/verifica-gestionale.js).
// Riproduce l'ambiente n8n ($input, $runIndex, $(...)) e rigioca il caso vero
// di Christine, esecuzione 747606 del 17/08.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'n8n', 'transfer-webhook', 'verifica-gestionale.js'), 'utf8');

// Le funzioni pure si estraggono per provarle da sole.
const PURE = SRC.split('// ===== corpo del nodo n8n =====')[0];
const puro = {};
new Function('exports', PURE + `
exports.teValutaVerifica_   = teValutaVerifica_;
exports.teMessaggioAllarme_ = teMessaggioAllarme_;
exports.TE_MAX_TENTATIVI    = TE_MAX_TENTATIVI;
`)(puro);
const { teValutaVerifica_, teMessaggioAllarme_ } = puro;

// Il nodo intero, con l'ambiente n8n simulato.
function nodo(attesoJson, righeLette, runIndex) {
  const $ = (name) => {
    if (name === 'Prepara dati gestionale') return { item: { json: attesoJson } };
    throw new Error('nodo non previsto dal banco: ' + name);
  };
  const $input = { all: () => righeLette.map((j) => ({ json: j })) };
  return new Function('$', '$input', '$runIndex', SRC)($, $input, runIndex)[0].json;
}

// --- Dati veri: Christine, esecuzione 747606 del 17/08 ---
const ID = 'TR-20260817-74b44b81-5b0b-4868-941b-af13f9447cdc';
const ATTESO = {
  Data: '17/08/2026', Time: '10:30',
  'TRS> DA': 'Covo dei Saraceni', 'TRS <PER': 'Cozze',
  Nome: 'Christine', PAX: 9, Fornitore: 'Covo Dei Saraceni',
  Autista: 'Giovanni Vito Antonio', Id: ID,
};
const RIGA_TROVATA = { row_number: 1045, Nome: 'Christine', Id: ID };

let ko = 0;
function prova(nome, atteso, effettivo) {
  const a = JSON.stringify(atteso), e = JSON.stringify(effettivo);
  const ok = a === e;
  if (!ok) ko++;
  console.log(`${ok ? '  ok  ' : '  KO  '} ${nome}`);
  if (!ok) console.log(`        atteso:   ${a}\n        ottenuto: ${e}`);
}

console.log('== Banco: verifica scrittura sul gestionale ==\n');

// --- IL CASO VERO: la riga non c'è ---
// 747606: gestionale ha detto success, la riga 1045 è rimasta vuota.
{
  const r = nodo(ATTESO, [{}], 0);          // item vuoto = "non trovato"
  prova('747606 — riga assente: riprova', true, r.vaRiprovato);
  prova('747606 — non urla al primo giro', false, r.vaGridato);
  prova('747606 — primo tentativo', 1, r.verifica.tentativo);
}
{
  const r = nodo(ATTESO, [], 0);            // nessun item
  prova('nessun item — riprova', true, r.vaRiprovato);
}
{
  // Riga con Id diverso: non è la nostra.
  const r = nodo(ATTESO, [{ row_number: 1046, Id: 'TR-20260817-altro' }], 0);
  prova('Id diverso — non conta come trovata', true, r.vaRiprovato);
}

// --- La riga c'è: si va avanti ---
{
  const r = nodo(ATTESO, [RIGA_TROVATA], 0);
  prova('riga presente — non riprova', false, r.vaRiprovato);
  prova('riga presente — non urla', false, r.vaGridato);
  prova('riga presente — esito ok', 'ok', r.verifica.esito);
  prova('riga presente — nessun messaggio d\'allarme', '', r.messaggioAllarme);
}
{
  // Id con spazi intorno sul foglio: vale lo stesso.
  const r = nodo(ATTESO, [{ ...RIGA_TROVATA, Id: '  ' + ID + '  ' }], 0);
  prova('Id con spazi — trovata lo stesso', 'ok', r.verifica.esito);
}

// --- Doppione: la cosa peggiore di una riga persa ---
{
  const r = nodo(ATTESO, [RIGA_TROVATA, { ...RIGA_TROVATA, row_number: 1046 }], 0);
  prova('due righe stesso Id — non riprova', false, r.vaRiprovato);
  prova('due righe stesso Id — urla', true, r.vaGridato);
  prova('due righe stesso Id — esito doppione', 'doppione', r.verifica.esito);
  prova('due righe stesso Id — dice quante', 2, r.verifica.trovate);
}

// --- Fine tentativi: si urla, non si insiste all'infinito ---
{
  const r = nodo(ATTESO, [{}], 3);          // $runIndex 3 -> tentativo 4
  prova('quarto tentativo a vuoto — urla', true, r.vaGridato);
  prova('quarto tentativo — non riprova più', false, r.vaRiprovato);
  prova('quarto tentativo — esito grida', 'grida', r.verifica.esito);
}
{
  const r = nodo(ATTESO, [{}], 2);          // tentativo 3: ancora una chance
  prova('terzo tentativo — riprova ancora', true, r.vaRiprovato);
}

// --- Il messaggio d'allarme deve bastare a rimediare a mano ---
{
  const r = nodo(ATTESO, [{}], 3);
  const m = r.messaggioAllarme;
  ['Christine', 'Covo dei Saraceni', 'Cozze', '10:30', '17/08/2026',
   'Giovanni Vito Antonio', ID, 'Va messa a mano'].forEach((pezzo) => {
    prova(`allarme contiene "${pezzo.length > 24 ? pezzo.slice(0, 21) + '…' : pezzo}"`,
      true, m.includes(pezzo));
  });
}

// --- Id vuoto: non si finge di aver verificato ---
{
  const r = nodo({ ...ATTESO, Id: '' }, [{}], 0);
  prova('Id vuoto — urla subito', true, r.vaGridato);
  prova('Id vuoto — non riprova alla cieca', false, r.vaRiprovato);
}

// --- I dati di partenza non si perdono per strada ---
{
  const r = nodo(ATTESO, [{}], 0);
  prova('i dati del transfer restano', 'Christine', r.Nome);
  prova('l\'autista resta', 'Giovanni Vito Antonio', r.Autista);
}

// --- La funzione pura, da sola ---
prova('pura — trovata una', 'ok', teValutaVerifica_(ID, [{ Id: ID }], 1, 4).esito);
prova('pura — nessuna, primo giro', 'riprova', teValutaVerifica_(ID, [], 1, 4).esito);
prova('pura — nessuna, ultimo giro', 'grida', teValutaVerifica_(ID, [], 4, 4).esito);
prova('pura — tre uguali', 'doppione', teValutaVerifica_(ID, [{ Id: ID }, { Id: ID }, { Id: ID }], 1, 4).trovate === 3 ? 'doppione' : 'no');

console.log(`\n${ko === 0 ? 'Tutte le prove passano.' : ko + ' prove FALLITE.'}`);
process.exit(ko === 0 ? 0 : 1);
