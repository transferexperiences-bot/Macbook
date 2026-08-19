// === GUARDIA LUOGO — 20/08/2026 ===
// Da innestare in «Calcola Tariffa Prenotazioni» (APv3ZqEizY1HnPia), nel nodo
// «Calcola Tariffa», subito prima del `return` che manda fuori il prezzo.
//
// ─────────────────────────────────────────────────────────────────────────────
// IL GUASTO, CON LE PROVE
// Esecuzione 760628 del 18/08 21:20 → 760632 (Parse transfer) → 760644 (listino).
// Transfer TR/18082026/RT03SZHEGW3YORCP: Savelletri → Polignano a Mare, un salto di
// una trentina di chilometri. Sul gestionale è finito a 1.080 €.
// Il calcolo che l'ha prodotto, parola per parola:
//     dettaglio.da = { prezzo: 1080, mode: 'comune+raggio', dest: 'Roma APT' }
//     kmGaragePickup: 520.1   kmCorsa: 519.8   kmTot: 1040.1   matchEsatto: false
// La partenza era scritta come link corto di Google Maps
// (https://maps.app.goo.gl/…). Il link non si è risolto, e da lì in poi:
//   1. «Prepara Ricerche», quando il link fallisce, ripiega su una ricerca fatta con
//      l'indirizzo ripulito — che di un link è la stringa VUOTA — più «, Italia».
//      Si geocodifica l'Italia, e il punto di partenza diventa il centro del Paese.
//   2. Il comune che ne esce viene cercato nel listino con un confronto morbido
//      (`l.includes(key) || key.includes(l)`): «roma» entra dentro «roma apt», e il
//      listino risponde col prezzo dell'AEROPORTO DI ROMA.
//   3. Il prezzo, 1.080 €, torna con matchEsatto: false. «Applica Tariffa» lo scrive
//      lo stesso sulla riga (_route: 'conferma' serve solo a mandare un messaggio
//      DOPO), e la riga sul gestionale nasce con un prezzo che non ha scelto nessuno.
//
// Non è un caso di tariffa mancante: è peggio. Una tariffa mancante si vede. Una
// tariffa inventata a quattro cifre sembra una tariffa.
//
// ─────────────────────────────────────────────────────────────────────────────
// COSA FA QUESTA GUARDIA
// Tre domande, in ordine. Se una risponde male, non esce un prezzo: esce un
// «warning», che è la strada che il sistema già conosce (route 'zero' → Parcheggia
// Tariffa0 → si chiede ad Agostino). Meglio una domanda che un numero inventato.
//
//   1. Il luogo si è risolto davvero? Un campo che era solo un link e che è finito
//      a geocodificare «, Italia» non è un luogo: è una resa.
//   2. La corsa sta nel mondo in cui lavoriamo? Transfer Experience parte da
//      Polignano; una tratta con 300 km fra garage e presa in carico, o 300 km di
//      corsa, non è un transfer di Polignano — è un errore di coordinate.
//   3. Il listino ha risposto per la tratta giusta? Un comune non può prendere il
//      prezzo di un posto PARTICOLARE dentro quel comune: «Roma» non è «Roma APT»,
//      «Bari» non è «Bari Airport». Il contrario invece va bene: il comune
//      «Polignano a Mare» può prendere il prezzo della riga «Polignano».
//
// Banco: banchi/te/banco-guardia-luogo.js
// ─────────────────────────────────────────────────────────────────────────────

// Quanto lontano può stare una corsa prima di essere un errore e non un viaggio.
// 300 km da Polignano è già oltre Napoli: i transfer veri che superano questa soglia
// si fanno a prezzo concordato, non a listino.
const LIMITE_KM = 300;

// Parole che, attaccate al nome di un comune, indicano un posto PARTICOLARE dentro
// quel comune — e quindi un prezzo diverso da quello del comune.
const POSTO_PARTICOLARE = /\b(apt|aeroporto|airport|stazione|station|porto|marina|molo|hotel|resort|masseria|trullo|villa|b&b|agriturismo|lido|spiaggia|centro|outlet|ospedale|fiera)\b/i;

// (1) Il luogo si è risolto?
// `resolvedVia` arriva da «Prepara Ricerche». Un campo che conteneva SOLO un link e
// che non ha prodotto coordinate è irrisolto, per quanto la geocodifica poi
// restituisca qualcosa.
function luogoRisolto(campo) {
  const c = campo || {};
  const testo = String(c.testo || '').trim();
  const soloLink = /^https?:\/\/\S+$/i.test(testo);
  if (!soloLink) return true;
  if (c.lat && c.lng && /nominatim|coords/.test(String(c.resolvedVia || ''))) return true;
  return false;
}

// (2) La corsa sta nel mondo in cui lavoriamo?
function distanzaPlausibile(dettaglio) {
  const d = dettaglio || {};
  const km = [d.kmGaragePickup, d.kmCorsa, d.kmRientro].map(Number).filter((n) => !isNaN(n));
  return !km.some((n) => n > LIMITE_KM);
}

// (3) Il listino ha risposto per la tratta giusta?
// Vale solo per i prezzi presi col confronto morbido («comune+raggio»): quelli
// esatti hanno già il nome giusto.
function prezzoDellaTrattaGiusta(comune, righeListino) {
  const c = String(comune || '').trim().toLowerCase();
  if (!c) return true;
  for (const r of (righeListino || [])) {
    const nome = String((r && (r.dest || r.nome)) || '').trim().toLowerCase();
    if (!nome || nome === c) continue;
    // il listino è più corto del comune («polignano» dentro «polignano a mare»): ok
    if (c.indexOf(nome) >= 0) continue;
    // il listino è più lungo: passa solo se quello che aggiunge non è un posto
    // particolare dentro il comune
    if (nome.indexOf(c) >= 0 && POSTO_PARTICOLARE.test(nome.replace(c, ' '))) return false;
  }
  return true;
}

// Il verdetto. `esito` è quello che «Calcola Tariffa» stava per restituire.
// Torna null se va tutto bene, oppure il motivo per cui il prezzo non si dà.
function perchéNonPrezzare(esito, luoghi) {
  const e = esito || {};
  const det = e.dettaglio || {};
  if (!luogoRisolto(luoghi && luoghi.da)) return 'partenza-non-risolta';
  if (!luogoRisolto(luoghi && luoghi.per)) return 'destinazione-non-risolta';
  if (!distanzaPlausibile(det)) return 'distanza-fuori-scala';
  if (e.matchEsatto !== true) {
    // solo le righe pescate col confronto morbido possono aver preso il posto sbagliato
    const morbido = (x) => x && x.mode === 'comune+raggio' ? [x] : [];
    if (!prezzoDellaTrattaGiusta(luoghi && luoghi.da && luoghi.da.comune, morbido(det.da))
     || !prezzoDellaTrattaGiusta(luoghi && luoghi.per && luoghi.per.comune, morbido(det.per))) {
      return 'listino-di-un-altro-posto';
    }
  }
  return null;
}

module.exports = { LIMITE_KM, luogoRisolto, distanzaPlausibile, prezzoDellaTrattaGiusta, perchéNonPrezzare };
