#!/usr/bin/env node
// Banco del nodo «Leggi la vCard» di Orca.
//   node banchi/te/banco-vcard.js
// Nasce dall'esecuzione 772535 del 20/08: Agostino manda «Ivan Deluxe Nemeth.vcf» e Orca
// risponde «vedo solo VERSION:3.0, niente nome/telefono/email». Il nome e il numero erano
// dentro il file: al posto del lettore c'era un «Extract From File» senza operazione, che
// ripiega sul CSV e legge solo la seconda riga.
const fs = require('fs');
const path = require('path');
const CODICE = fs.readFileSync(path.join(__dirname, '../../backups/n8n/orca/leggi-la-vcard.js'), 'utf8');

// Gira il nodo con un file finto: il binario arriva come base64 dentro l'item, che è la
// terza delle tre strade e l'unica riproducibile fuori da n8n.
async function gira(contenutoVcf) {
  const item = { json: {}, binary: { data: { data: Buffer.from(contenutoVcf, 'utf8').toString('base64') } } };
  const $input = { all: () => [item] };
  const f = new Function('$input', 'return (async () => {' + CODICE + '})()');
  return await f.call({ helpers: null }, $input);
}

let ok = 0, ko = 0;
function t(nome, condizione, dettaglio) {
  if (condizione) { ok++; console.log('  ok   ' + nome); }
  else { ko++; console.log('  KO   ' + nome + (dettaglio ? '\n       ' + dettaglio : '')); }
}

(async () => {
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nil contatto normale');
const SEMPLICE = ['BEGIN:VCARD', 'VERSION:3.0', 'N:Nemeth;Ivan;;;', 'FN:Ivan Deluxe Nemeth',
  'TEL;TYPE=CELL:+39 333 1234567', 'EMAIL:ivan@example.com', 'END:VCARD'].join('\r\n');
const r1 = (await gira(SEMPLICE))[0].json;
t('il nome esce', /Nome: Ivan Deluxe Nemeth/.test(r1.text), r1.text);
t('il telefono esce', /Telefono: \+39 333 1234567/.test(r1.text), r1.text);
t('la mail esce', /Email: ivan@example\.com/.test(r1.text), r1.text);
t('e non dice più «VERSION:3.0»', !/VERSION/.test(r1.text));
t('i campi utili restano anche a parte', r1.vcard_nome === 'Ivan Deluxe Nemeth'
  && r1.vcard_telefoni[0] === '+39 333 1234567', JSON.stringify(r1.vcard_telefoni));

console.log('\ncome lo manda iPhone');
const IOS = ['BEGIN:VCARD', 'VERSION:3.0', 'N:Rossi;Maria;;;', 'FN:Maria Rossi',
  'item1.TEL;type=pref:+39 340 9998877', 'item2.EMAIL;type=INTERNET:maria@example.it',
  'ORG:Hotel Le Palme;', 'TITLE:Front Office', 'END:VCARD'].join('\r\n');
const r2 = (await gira(IOS))[0].json;
t('il prefisso «item1.» non nasconde il telefono', /Telefono: \+39 340 9998877/.test(r2.text), r2.text);
t('né «item2.» la mail', /Email: maria@example\.it/.test(r2.text), r2.text);
t('l\'azienda esce', /Azienda: Hotel Le Palme/.test(r2.text), r2.text);
t('e il ruolo pure', /Ruolo: Front Office/.test(r2.text));

console.log('\nrighe piegate e accenti');
const PIEGATA = ['BEGIN:VCARD', 'VERSION:2.1',
  'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Nicol=C3=B2 D=C3=ACAmbrosio',
  'TEL;CELL:+39 320 1112223',
  // riga piegata secondo lo standard: lo spazio in testa è il segno della piega e sparisce,
  // quindi lo spazio vero fra le parole va messo PRIMA della piega.
  'NOTE:Cliente abituale, chiede sempre ', ' lo Sprinter da nove', 'END:VCARD'].join('\r\n');
const r3 = (await gira(PIEGATA))[0].json;
t('gli accenti tornano al loro posto', /Nicolò D[ìi]Ambrosio/.test(r3.text), r3.text);
t('la riga spezzata si ricompone', /chiede sempre lo Sprinter da nove/.test(r3.text), r3.text);

console.log('\npiù numeri, più contatti');
const DUE_TEL = ['BEGIN:VCARD', 'FN:Franco Bianchi', 'TEL;TYPE=CELL:+39 111', 'TEL;TYPE=WORK:+39 222', 'END:VCARD'].join('\r\n');
const r4 = (await gira(DUE_TEL))[0].json;
t('li mette tutti e due, col tipo', /Telefono: \+39 111 \(CELL\), \+39 222 \(WORK\)/.test(r4.text), r4.text);

const DUE_SCHEDE = [DUE_TEL, ['BEGIN:VCARD', 'FN:Anna Verdi', 'TEL:+39 333', 'END:VCARD'].join('\r\n')].join('\r\n');
const r5 = await gira(DUE_SCHEDE);
t('due contatti in un file diventano due schede', r5.length === 2
  && /Franco Bianchi/.test(r5[0].json.text) && /Anna Verdi/.test(r5[1].json.text), String(r5.length));

console.log('\nquando non si può leggere, lo dice');
const r6 = (await gira('questo non è un contatto'))[0].json;
t('non inventa niente', /non sono riuscito a leggerlo/i.test(r6.text) && r6.vcard_errore === 'non-e-una-vcard', r6.text);
const SOLO_VERSION = ['BEGIN:VCARD', 'VERSION:3.0', 'END:VCARD'].join('\r\n');
const r7 = (await gira(SOLO_VERSION))[0].json;
t('una vCard davvero vuota lo dice chiaro', /non c'era nome né numero/.test(r7.text), r7.text);

console.log('\n' + ok + ' ok, ' + ko + ' KO\n');
process.exit(ko ? 1 : 0);
})();
