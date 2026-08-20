#!/usr/bin/env node
// Banco del nodo «Applica listino imparato».
//   node banchi/te/banco-applica-imparato.js
// Il caso che l'ha fatto nascere ha un numero: esecuzione 760644 del 18/08, Savelletri →
// Polignano a Mare prezzato 1.080 € perché il link di Maps non si è risolto e il listino ha
// risposto col prezzo dell'aeroporto di Roma. Nel listino imparato quella tratta, per quel
// fornitore, non c'è — quindi il nodo NON la corregge: serve la guardia luogo. Ma le tratte
// che ci sono devono vincere sempre, e nessun'altra deve essere toccata.
const fs = require('fs');
const path = require('path');
const CODICE = fs.readFileSync(path.join(__dirname, '../../backups/n8n/calcola-tariffa/applica-listino-imparato.js'), 'utf8');
const IMPARATO = require('../../backups/n8n/calcola-tariffa/listino-imparato.json');

function gira(esito, tabella) {
  const righe = (tabella || IMPARATO).map((r) => ({ json: r }));
  const $ = (nome) => {
    if (nome === 'Calcola Tariffa') return { first: () => ({ json: esito }) };
    throw new Error('nodo non previsto: ' + nome);
  };
  const $input = { all: () => righe };
  return new Function('$', '$input', CODICE)($, $input)[0].json;
}

let ok = 0, ko = 0;
function t(nome, condizione, dettaglio) {
  if (condizione) { ok++; console.log('  ok   ' + nome); }
  else { ko++; console.log('  KO   ' + nome + (dettaglio ? '\n       ' + dettaglio : '')); }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nle tratte imparate vincono');
const arco = gira({ status: 'ok', tariffa: 120, matchEsatto: false, modo: 'comune+raggio',
  da: 'Arco', per: 'stazione Polignano', pax: 2, fornitore: 'Transfer Experience', orario: '10:00' });
t('«Arco → stazione Polignano» torna 10 €, non 120', arco.tariffa === 10, JSON.stringify(arco.tariffa));
t('e lo dice: modo «storico»', arco.modo === 'storico' && arco.listino_imparato === 'trovata');
t('tiene da parte quello che avrebbe detto prima', arco.tariffa_calcolata_prima === 120 && arco.modo_prima === 'comune+raggio');
t('e da lì in poi vale come match esatto', arco.matchEsatto === true);

const alContrario = gira({ status: 'ok', tariffa: 120, da: 'Stazione Polignano', per: 'ARCO',
  pax: 1, fornitore: 'transfer experience', orario: '10:00' });
t('la tratta vale nei due versi', alContrario.tariffa === 10);

console.log('\nle fasce di passeggeri');
const due = gira({ status: 'ok', tariffa: 0, da: 'Melograno', per: 'Monopoli', pax: 2,
  fornitore: 'Melograno', orario: '12:00' });
const sette = gira({ status: 'ok', tariffa: 0, da: 'Melograno', per: 'Monopoli', pax: 6,
  fornitore: 'Melograno', orario: '12:00' });
const nove = gira({ status: 'ok', tariffa: 0, da: 'Melograno', per: 'Monopoli', pax: 9,
  fornitore: 'Melograno', orario: '12:00' });
t('Melograno ↔ Monopoli, 2 pax → 30 €', due.tariffa === 30, String(due.tariffa));
t('Melograno ↔ Monopoli, 6 pax → 40 €', sette.tariffa === 40, String(sette.tariffa));
t('Melograno ↔ Monopoli, 9 pax → 50 €', nove.tariffa === 50, String(nove.tariffa));

const senzaPax = gira({ status: 'ok', tariffa: 0, da: 'Melograno', per: 'Monopoli', pax: '',
  veicolo: 'Sprinter 9 posti', fornitore: 'Melograno', orario: '12:00' });
t('Pax vuoto ma Sprinter: prende la fascia da 9, non quella da 2', senzaPax.tariffa === 50, String(senzaPax.tariffa));
const senzaNiente = gira({ status: 'ok', tariffa: 77, da: 'Melograno', per: 'Monopoli', pax: '',
  veicolo: '', fornitore: 'Melograno', orario: '12:00' });
t('Pax vuoto e veicolo vuoto: non inventa la fascia, lascia stare',
  senzaNiente.tariffa === 77 && senzaNiente.listino_imparato === 'non-trovata', String(senzaNiente.tariffa));

console.log('\nil supplemento notturno');
const alba = gira({ status: 'ok', tariffa: 0, da: 'APT di Bari', per: 'Melograno', pax: 2,
  fornitore: 'Melograno', orario: '05:30' });
t('prima delle 7 il prezzo imparato si moltiplica per 1,2 (115 → 138)', alba.tariffa === 138, String(alba.tariffa));
const giorno = gira({ status: 'ok', tariffa: 0, da: 'APT di Bari', per: 'Melograno', pax: 2,
  fornitore: 'Melograno', orario: '09:00' });
t('di giorno resta 115', giorno.tariffa === 115, String(giorno.tariffa));

console.log('\nquello che NON deve toccare');
const roma = gira({ status: 'ok', tariffa: 1080, matchEsatto: false, modo: 'listino-MAX',
  da: 'https://maps.app.goo.gl/W1NMNfwxU9hQnwhk6', per: 'Polignano a Mare', pax: 1,
  veicolo: 'Sprinter 9 posti', fornitore: 'Tedi tour operator', orario: '17:00' });
t('la tratta di Tedi non è nel listino imparato: non la corregge (ci pensa la guardia luogo)',
  roma.tariffa === 1080 && roma.listino_imparato === 'non-trovata');

const altroFornitore = gira({ status: 'ok', tariffa: 99, da: 'Arco', per: 'stazione Polignano',
  pax: 2, fornitore: 'Un Fornitore Nuovo', orario: '10:00' });
t('la stessa tratta con un altro fornitore non prende il prezzo di Transfer Experience',
  altroFornitore.tariffa === 99 && altroFornitore.listino_imparato === 'non-trovata');

const vuoto = gira({ status: 'ok', tariffa: 60, da: 'Bar Rotolo', per: 'Cala Ponte Hotel',
  pax: 6, fornitore: 'Transfer Experience', orario: '23:31' }, []);
t('se la tabella non risponde, l\'esito passa intatto', vuoto.tariffa === 60);

const warning = gira({ status: 'warning', tariffa: 0, motivo: 'nessun-match',
  da: 'Arco', per: 'stazione Polignano', pax: 2, fornitore: 'Transfer Experience', orario: '10:00' });
t('anche una tratta che il motore non sapeva prezzare, se è imparata, ora ha un prezzo',
  warning.tariffa === 10 && warning.status === 'ok');

console.log('\nnomi scritti come capita');
for (const [da, per, forn, atteso] of [
  ['ARCO', 'Stazione  Polignano', 'Transfer Experience', 10],
  ['arco.', 'stazione-polignano', 'transfer experience', 10],
  ['Auraterrae', 'Polignano a Mare', 'Auraterrae', 35],
  ['Pietra Blu', 'Polignano a Mare', 'Pietra Blu', 30],
]) {
  const r = gira({ status: 'ok', tariffa: 0, da, per, pax: 2, fornitore: forn, orario: '12:00' });
  t('«' + da + ' → ' + per + '» (' + forn + ') → ' + atteso + ' €', r.tariffa === atteso, String(r.tariffa));
}

// ─────────────────────────────────────────────────────────────────────────────
// Regola numero uno: se questo nodo inciampa, il prezzo di prima deve passare intatto.
// Sta in mezzo alla strada che porta una riga sul gestionale.
console.log('\nse inciampa, non porta giù il salvataggio');
function giraRotto(esito) {
  const $ = () => ({ first: () => ({ json: esito }) });
  const $input = { all: () => { throw new Error('tabella non raggiungibile'); } };
  return new Function('$', '$input', CODICE)($, $input)[0].json;
}
const rotto = giraRotto({ status: 'ok', tariffa: 60, da: 'Arco', per: 'stazione Polignano',
  pax: 2, fornitore: 'Transfer Experience', orario: '10:00' });
t('la tabella irraggiungibile non fa saltare niente', rotto.tariffa === 60 && rotto.status === 'ok');

function giraEsplosivo(esito) {
  const $ = () => ({ first: () => ({ json: esito }) });
  const veleno = { get da() { throw new Error('riga malata'); }, per: 'x', prezzo: 1 };
  const $input = { all: () => [{ json: veleno }] };
  return new Function('$', '$input', CODICE)($, $input)[0].json;
}
const esploso = giraEsplosivo({ status: 'ok', tariffa: 75, da: 'Arco', per: 'stazione Polignano',
  pax: 2, fornitore: 'Transfer Experience', orario: '10:00' });
t('una riga malata nella tabella non fa saltare niente',
  esploso.tariffa === 75 && esploso.status === 'ok', JSON.stringify(esploso));

console.log('\n' + ok + ' ok, ' + ko + ' KO\n');
process.exit(ko ? 1 : 0);
