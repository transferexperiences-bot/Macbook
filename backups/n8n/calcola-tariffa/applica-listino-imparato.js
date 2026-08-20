// === APPLICA LISTINO IMPARATO — 20/08/2026 ===
// Nodo: «Applica listino imparato», dopo «Calcola Tariffa» e «Leggi listino imparato»
// (tabella dati «Listino imparato», X0sGTo1c1U5aHjjo).
//
// PERCHÉ. Il listino «Generico» ha 62 destinazioni. I transfer veri vanno in centinaia di
// posti che lì dentro non ci sono: hotel, trulli, ristoranti, link di Maps. Quando il nome
// non c'è, il motore NON dice «non lo so»: ripiega su un confronto morbido fra nomi e poi
// sui chilometri. Misurato sulle 1.101 righe vere del gestionale con un prezzo:
//   · prezzo preso col nome esatto  → azzecca il numero nel 20% dei casi
//   · prezzo preso per somiglianza  → 4%
//   · un terzo delle tratte il listino non le copre proprio
// E quando sbaglia sbaglia in grande: «stazione» somiglia a «Stazione di Bari» (10 €
// prezzati 120), «roma» somiglia a «Roma APT» (esecuzione 760644: trenta chilometri
// prezzati 1.080 €).
//
// I prezzi giusti però ci sono già: sono le righe che Agostino ha accettato. Raggruppate
// per fornitore + tratta (senza verso) + fascia pax, e riportate a giorno il supplemento
// notturno, 142 tratte hanno sempre lo stesso prezzo. Provate con leave-one-out
// rispondono sul 33% delle corse e danno il numero identico nel 93% dei casi.
// Rigiocate su tutte le 1.132 righe vere: rispondono su metà e confermano il prezzo già
// scritto nel 98% dei casi.
//
// COSA FA. Se la tratta sta nel listino imparato, quel prezzo VINCE su quello calcolato.
// Non tocca nient'altro: tutto il resto del motore resta com'è.
//
// ⛔ REGOLA NUMERO UNO: non si perde MAI un salvataggio. Questo nodo sta in mezzo alla
// strada che porta una riga sul gestionale: se inciampa, deve inciampare in silenzio e
// lasciar passare il prezzo di prima. Per questo tutto sta dentro un try, e il catch
// restituisce l'esito intatto.
//
// Banco: banchi/te/banco-applica-imparato.js
const esito = $('Calcola Tariffa').first().json;
try {

let imparate = [];
try { imparate = $input.all().map((i) => i.json).filter((r) => r && r.da && r.per); } catch (e) { imparate = []; }
if (!imparate.length) return [{ json: esito }];

// La stessa normalizzazione con cui la tabella è stata costruita. Se cambia qui e non là,
// il listino smette di rispondere: è l'unico punto delicato di tutto il nodo.
const strip = (s) => String(s == null ? '' : s)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/https?:\/\/\S+/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// Il listino ragiona a fasce di passeggeri. Quando il campo Pax è vuoto il motore usa 1 e
// prende la colonna più economica anche per uno Sprinter da nove: qui il numero di posti si
// legge dal veicolo, che è un dato, non un'ipotesi.
function fascia(pax, veicolo) {
  let p = parseInt(pax, 10);
  if (isNaN(p) || p <= 0) {
    const v = strip(veicolo);
    const m = v.match(/(\d{1,2}) (?:posti|pax)/);
    p = m ? parseInt(m[1], 10) : (/sprinter|minibus/.test(v) ? 9 : (/vito|minivan/.test(v) ? 7 : 0));
  }
  if (!p) return '?';
  return p <= 2 ? '≤2' : (p <= 7 ? '≤7' : '≤9');
}

const chiave = (forn, da, per, f) =>
  (strip(forn) || 'generico') + ' | ' + [strip(da), strip(per)].sort().join('  ↔  ') + ' | ' + f;

const tabella = new Map();
for (const r of imparate) {
  const p = parseFloat(String(r.prezzo).replace(',', '.'));
  if (!(p > 0)) continue;
  tabella.set(chiave(r.fornitore, r.da, r.per, String(r.fascia || '?')), { prezzo: p, volte: Number(r.volte) || 0 });
}

const f = fascia(esito.pax, esito.veicolo);
let trovata = tabella.get(chiave(esito.fornitore, esito.da, esito.per, f));
// Una fascia sconosciuta («?») non deve pescare da una fascia qualsiasi: si prova solo la
// fascia esatta, e per le righe vecchie senza fascia si prova anche «?».
if (!trovata && f !== '?') trovata = tabella.get(chiave(esito.fornitore, esito.da, esito.per, '?'));
if (!trovata) return [{ json: Object.assign({}, esito, { listino_imparato: 'non-trovata' }) }];

// Il prezzo imparato è un prezzo di giorno: il supplemento notturno si riapplica qui, come
// fa il motore (prima delle 7, ×1,2).
const ora = String(esito.orario || '').trim();
const hh = parseInt(ora.slice(0, 2), 10);
const mol = (ora && !isNaN(hh) && hh < 7) ? 1.2 : 1;
const tariffa = Math.round(trovata.prezzo * mol + (Number(esito.extra) || 0));

return [{ json: Object.assign({}, esito, {
  status: 'ok',
  tariffa: tariffa,
  prezzoBase: tariffa,
  matchEsatto: true,
  modo: 'storico',
  moltiplicatoreNotturno: mol,
  listino_imparato: 'trovata',
  listino_imparato_volte: trovata.volte,
  listino_imparato_prezzo_giorno: trovata.prezzo,
  // quello che il vecchio calcolo avrebbe detto, per poterlo confrontare senza indovinare
  tariffa_calcolata_prima: esito.tariffa,
  modo_prima: esito.modo
}) }];

} catch (err) {
  // Il prezzo di prima vale più di un errore: passa intatto, con la traccia di cosa è andato storto.
  return [{ json: Object.assign({}, esito, { listino_imparato: 'errore', listino_imparato_errore: String(err && err.message || err) }) }];
}
