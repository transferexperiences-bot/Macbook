// === APPLICA LISTINO IMPARATO — 20/08/2026 ===
// Nodo: «Applica listino imparato», dopo «Calcola Tariffa» e «Leggi listino imparato»
// (tabella dati «Listino imparato», X0sGTo1c1U5aHjjo).
//
// PERCHÉ. Il listino «Generico» ha 62 destinazioni. I transfer veri vanno in centinaia di
// posti che lì dentro non ci sono: hotel, trulli, ristoranti, link di Maps. Quando il nome
// non c'è, il motore NON dice «non lo so»: ripiega su un confronto morbido fra nomi e poi
// sui chilometri.
// I prezzi giusti però ci sono già: sono le righe che Agostino ha accettato. Raggruppate
// per fornitore + tratta (senza verso) + fascia pax, e riportate a giorno il supplemento
// notturno, 142 tratte hanno sempre lo stesso prezzo. Provate con leave-one-out
// rispondono sul 33% delle corse e danno il numero identico nel 93% dei casi.
// Rigiocate su tutte le 1.132 righe vere: rispondono su metà e confermano il prezzo già
// scritto nel 98% dei casi.
//
// COSA FA. Due cose, in quest'ordine.
//
//   1. Se la tratta sta nel listino imparato, quel prezzo VINCE su quello calcolato.
//
//   2. Altrimenti guarda COME il motore è arrivato al prezzo, e se ci è arrivato
//      indovinando lo ferma. Perché col listino GIUSTO il motore è preciso — misurato
//      sulle righe vere: Melograno 95% di numeri identici su 66 righe, Auraterrae 96% su
//      113 — e sbaglia solo quando il nome della destinazione nel listino non c'è e
//      ripiega sulla somiglianza o sui chilometri. Lì nascono i disastri:
//        · esecuzione 760644: link di Maps non risolto → geocodifica «, Italia» → il
//          comune diventa «Roma» → somiglia a «Roma APT» → trenta chilometri a 1.080 €
//        · «stazione» somiglia a «Stazione di Bari»: 10 € prezzati 120
//      Tre domande, e se una risponde male non esce un prezzo ma un «warning», che è la
//      strada che il sistema già conosce (route 'zero' → Parcheggia Tariffa0 → si chiede
//      ad Agostino). Meglio una domanda che un numero inventato.
//      Sulle 1.132 righe vere la guardia ne fermerebbe 7, e sono tutte e sette la
//      «stazione» prezzata come «Stazione di Bari».
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

// ── LA GUARDIA ──────────────────────────────────────────────────────────────
// Quanto lontano può stare una corsa prima di essere un errore e non un viaggio.
// 300 km da Polignano è già oltre Napoli: le corse vere che superano questa soglia si
// fanno a prezzo concordato, e infatti stanno nei listini per nome (Amalfi, Positano,
// Roma APT) — quelle passano dal ramo «esatto» e non arrivano mai qui.
const LIMITE_KM = 300;

// Parolette di collegamento: non aggiungono un posto, aggiungono solo grammatica.
// Tutto il resto sì: se la riga del listino dice qualcosa in più del comune — «APT»,
// «di Bari», «Porto» — allora è UN ALTRO POSTO, e il suo prezzo non è quello del comune.
const RIEMPITIVI = new Set(['di', 'del', 'dello', 'della', 'dei', 'degli', 'delle',
  'a', 'ad', 'al', 'allo', 'alla', 'ai', 'agli', 'alle',
  'il', 'lo', 'la', 'i', 'gli', 'le', 'in', 'da', 'dal', 'e', 'd']);

// Com'è stato risolto ciascuno dei due luoghi: lo dice «Prepara Ricerche».
function comeRisolti() {
  const out = { da: null, per: null };
  try {
    for (const it of $('Prepara Ricerche').all()) {
      const j = it.json || {};
      if (j._type === 'da' || j._type === 'per') out[j._type] = j;
    }
  } catch (e) {}
  return out;
}

// Un campo che conteneva SOLO un link di Maps e che non ha prodotto coordinate è
// irrisolto, per quanto la geocodifica di ripiego poi restituisca qualcosa.
function luogoRisolto(prep) {
  if (!prep) return true;
  // «_addr» è l'indirizzo ripulito dal link: se è vuoto, nel campo c'era SOLO il link.
  const eraSoloLink = !String(prep._addr || '').trim() && !!prep._mapUrl;
  if (!eraSoloLink) return true;
  return /nominatim|coords/.test(String(prep._resolvedVia || ''));
}

function perchéNonPrezzare(e) {
  const det = e.dettaglio || {};
  const prep = comeRisolti();
  if (!luogoRisolto(prep.da)) return 'partenza-non-risolta';
  if (!luogoRisolto(prep.per)) return 'destinazione-non-risolta';

  const km = [det.kmGaragePickup, det.kmCorsa, det.kmRientro].map(Number).filter((n) => !isNaN(n));
  if (km.some((n) => n > LIMITE_KM)) return 'distanza-fuori-scala';

  // Un comune non può prendere il prezzo di un posto particolare dentro quel comune:
  // «Roma» non è «Roma APT», «Bari» non è «Bari Airport». Il contrario invece va bene:
  // il comune «Polignano a Mare» può prendere la riga «Polignano».
  if (e.matchEsatto !== true) {
    let comuni = { da: '', per: '' };
    try {
      const c = $('Estrai Comuni').first().json || {};
      comuni = { da: String(c.comuneDa || ''), per: String(c.comunePer || '') };
    } catch (err) {}
    for (const lato of ['da', 'per']) {
      const d = det[lato];
      if (!d || d.mode !== 'comune+raggio') continue;
      const com = strip(comuni[lato]);
      const riga = strip(d.dest);
      if (!com || !riga || com === riga) continue;
      if (com.indexOf(riga) >= 0) continue;                       // listino più corto: ok
      if (riga.indexOf(com) >= 0) {
        // la riga contiene il comune e ci aggiunge qualcosa: cosa?
        const avanzo = riga.replace(com, ' ').split(' ')
          .map((w) => w.trim()).filter((w) => w && !RIEMPITIVI.has(w));
        if (avanzo.length) return 'listino-di-un-altro-posto';
      }
    }
  }
  return null;
}
// ────────────────────────────────────────────────────────────────────────────

const f = fascia(esito.pax, esito.veicolo);
let trovata = tabella.get(chiave(esito.fornitore, esito.da, esito.per, f));
// Una fascia sconosciuta («?») non deve pescare da una fascia qualsiasi: si prova solo la
// fascia esatta, e per le righe vecchie senza fascia si prova anche «?».
if (!trovata && f !== '?') trovata = tabella.get(chiave(esito.fornitore, esito.da, esito.per, '?'));
if (!trovata) {
  const motivo = perchéNonPrezzare(esito);
  if (!motivo) return [{ json: Object.assign({}, esito, { listino_imparato: 'non-trovata' }) }];
  // Non si dà un prezzo indovinato. Si dice che non si sa, e il resto del sistema chiede.
  return [{ json: Object.assign({}, esito, {
    status: 'warning',
    tariffa: 0,
    prezzoBase: 0,
    matchEsatto: false,
    motivo: motivo,
    listino_imparato: 'non-trovata',
    guardia_luogo: motivo,
    tariffa_calcolata_prima: esito.tariffa,
    modo_prima: esito.modo
  }) }];
}

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
