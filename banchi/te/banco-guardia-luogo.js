#!/usr/bin/env node
// Banco della «Guardia Luogo» — il pezzo che impedisce a una tariffa inventata di
// finire su una riga vera del gestionale.
//   node banchi/te/banco-guardia-luogo.js
// Il caso che l'ha fatta nascere è vero e ha un numero: esecuzione 760644 del 18/08,
// Savelletri → Polignano a Mare prezzato 1.080 € perché il link di Maps della partenza
// non si è risolto e il listino ha risposto col prezzo dell'aeroporto di Roma.
const G = require('../../backups/n8n/calcola-tariffa/guardia-luogo.js');

let ok = 0, ko = 0;
function t(nome, condizione, dettaglio) {
  if (condizione) { ok++; console.log('  ok   ' + nome); }
  else { ko++; console.log('  KO   ' + nome + (dettaglio ? '\n       ' + dettaglio : '')); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Il caso vero, copiato dall'esecuzione 760644.
console.log('\n760644 — Savelletri → Polignano prezzato 1.080 €');
const ESITO_1080 = {
  status: 'ok', tariffa: 1080, matchEsatto: false, modo: 'listino-MAX', listino: 'Generico',
  da: 'https://maps.app.goo.gl/W1NMNfwxU9hQnwhk6', per: 'Polignano a Mare',
  dettaglio: {
    da: { prezzo: 1080, mode: 'comune+raggio', dest: 'Roma APT', supplemento: 0, kmCentro: 0 },
    per: { prezzo: 30, mode: 'esatto', dest: 'Polignano a Mare' },
    listino: 'Generico', kmGaragePickup: 520.1, kmCorsa: 519.8, kmRientro: 0.3, kmTot: 1040.1
  }
};
const LUOGHI_1080 = {
  da: { testo: 'https://maps.app.goo.gl/W1NMNfwxU9hQnwhk6', lat: 41.8003, lng: 12.2389,
        resolvedVia: 'geocode-nome', comune: 'Roma' },
  per: { testo: 'Polignano a Mare', lat: 40.9942, lng: 17.2217, resolvedVia: 'direct', comune: 'Polignano a Mare' }
};
t('la partenza è un link che non si è risolto', G.luogoRisolto(LUOGHI_1080.da) === false);
t('520 km di trasferimento non sono un transfer di Polignano', G.distanzaPlausibile(ESITO_1080.dettaglio) === false);
t('«Roma» non può prendere il prezzo di «Roma APT»',
  G.prezzoDellaTrattaGiusta('Roma', [ESITO_1080.dettaglio.da]) === false);
t('il prezzo NON si dà, e si dice perché',
  G.perchéNonPrezzare(ESITO_1080, LUOGHI_1080) === 'partenza-non-risolta',
  String(G.perchéNonPrezzare(ESITO_1080, LUOGHI_1080)));

// se anche il link si fosse risolto, la distanza da sola basterebbe a fermarlo
const luoghiRisolti = JSON.parse(JSON.stringify(LUOGHI_1080));
luoghiRisolti.da.resolvedVia = 'maps-url-nominatim';
t('e se il link si fosse pure risolto, ci pensa la distanza',
  G.perchéNonPrezzare(ESITO_1080, luoghiRisolti) === 'distanza-fuori-scala');

// e se anche la distanza fosse normale, resta il listino di un altro posto
const vicino = JSON.parse(JSON.stringify(ESITO_1080));
vicino.dettaglio.kmGaragePickup = 12; vicino.dettaglio.kmCorsa = 30; vicino.dettaglio.kmTot = 45;
t('e se anche la distanza tornasse, resta il listino di un altro posto',
  G.perchéNonPrezzare(vicino, luoghiRisolti) === 'listino-di-un-altro-posto');

// ─────────────────────────────────────────────────────────────────────────────
// I casi buoni non devono muoversi di un centesimo.
console.log('\ni prezzi giusti restano giusti');
const BUONO = {
  status: 'ok', tariffa: 60, matchEsatto: true, modo: 'listino-MAX', listino: 'Generico',
  dettaglio: { da: { prezzo: 60, mode: 'esatto', dest: 'Bar Rotolo' },
               per: { prezzo: 60, mode: 'esatto', dest: 'Cala Ponte Hotel' },
               kmGaragePickup: 8.2, kmCorsa: 6.4, kmRientro: 5.1, kmTot: 19.7 }
};
const LUOGHI_BUONI = {
  da: { testo: 'Bar Rotolo — Via Roma, Monopoli', lat: 40.95, lng: 17.30, resolvedVia: 'geocode', comune: 'Monopoli' },
  per: { testo: 'Cala Ponte Hotel', lat: 40.99, lng: 17.24, resolvedVia: 'geocode', comune: 'Polignano a Mare' }
};
t('769330, Bar Rotolo → Cala Ponte a 60 €: passa', G.perchéNonPrezzare(BUONO, LUOGHI_BUONI) === null);

// il comune più lungo del nome nel listino: «Polignano a Mare» prende «Polignano». Va bene.
t('«Polignano a Mare» può prendere il prezzo della riga «Polignano»',
  G.prezzoDellaTrattaGiusta('Polignano a Mare', [{ mode: 'comune+raggio', dest: 'Polignano' }]) === true);
t('«Monopoli» non può prendere il prezzo di «Monopoli Porto»',
  G.prezzoDellaTrattaGiusta('Monopoli', [{ mode: 'comune+raggio', dest: 'Monopoli Porto' }]) === false);
t('«Bari» non può prendere il prezzo di «Bari Airport»',
  G.prezzoDellaTrattaGiusta('Bari', [{ mode: 'comune+raggio', dest: 'Bari Airport' }]) === false);
t('«Fasano» può prendere il prezzo della riga «Fasano»',
  G.prezzoDellaTrattaGiusta('Fasano', [{ mode: 'comune+raggio', dest: 'Fasano' }]) === true);

// un link che si è risolto davvero (il caso normale) non deve dare fastidio
t('un link di Maps risolto con le coordinate è un luogo a tutti gli effetti',
  G.luogoRisolto({ testo: 'https://maps.app.goo.gl/abc', lat: 40.9, lng: 17.2,
                   resolvedVia: 'maps-url-nominatim', comune: 'Monopoli' }) === true);
t('un indirizzo scritto a mano non passa nemmeno dal controllo del link',
  G.luogoRisolto({ testo: 'Contrada Tortorella 271, Monopoli', resolvedVia: 'geocode' }) === true);
t('un link con del testo intorno non è «solo un link»',
  G.luogoRisolto({ testo: 'Trulli d\'amore https://maps.app.goo.gl/abc', resolvedVia: 'geocode' }) === true);

// una gita lunga, ma vera: 250 km restano dentro
console.log('\nle corse lunghe vere');
const AMALFI = {
  status: 'ok', tariffa: 800, matchEsatto: true,
  dettaglio: { da: { prezzo: 800, mode: 'esatto', dest: 'Amalfi' }, per: { prezzo: 800, mode: 'esatto', dest: 'Amalfi' },
               kmGaragePickup: 15, kmCorsa: 280, kmRientro: 295, kmTot: 590 }
};
t('Polignano → Amalfi a 800 €, prezzo esatto di listino: NON si tocca',
  G.perchéNonPrezzare(AMALFI, { da: { testo: 'Dimora Favalle Polignano', comune: 'Polignano a Mare' },
                                per: { testo: 'Amalfi', comune: 'Amalfi' } }) === null,
  String(G.perchéNonPrezzare(AMALFI, { da: { testo: 'x' }, per: { testo: 'y' } })));

console.log('\n' + ok + ' ok, ' + ko + ' KO\n');
process.exit(ko ? 1 : 0);
