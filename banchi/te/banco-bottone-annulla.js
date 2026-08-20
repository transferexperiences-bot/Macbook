#!/usr/bin/env node
// Banco del nodo «Bottone Annulla» (Prenotazioni Transfer 6.0).
//   node banchi/te/banco-bottone-annulla.js
// Va a coppia con «salva e mostra»: se una scheda completa si salva da sola, il messaggio
// che arriva ad Agostino deve portarsi dietro il modo di disfare. Se invece la conferma
// l'ha data lui, il bottone non ci va: comparirebbe ogni volta e diventerebbe rumore.
const fs = require('fs');
const path = require('path');
const CODICE = fs.readFileSync(path.join(__dirname, '../../backups/n8n/prenotazioni/bottone-annulla.js'), 'utf8');

// `salvati` è quello che il gestionale ha risposto: gli Id che ha scritto DAVVERO.
function gira(diretto, salvati, itemIn) {
  const $ = (nome) => {
    if (nome === 'Code in JavaScript') return { first: () => ({ json: { salvataggio_diretto: diretto } }) };
    if (nome === 'Salva via Parse transfer (intent)') return { all: () => (salvati || []).map((j) => ({ json: j })) };
    throw new Error('nodo non previsto: ' + nome);
  };
  const $input = { all: () => [JSON.parse(JSON.stringify(itemIn || { json: { text: 'ok' } }))] };
  return new Function('$', '$input', CODICE)($, $input);
}

let ok = 0, ko = 0;
function t(nome, condizione, dettaglio) {
  if (condizione) { ok++; console.log('  ok   ' + nome); }
  else { ko++; console.log('  KO   ' + nome + (dettaglio ? '\n       ' + dettaglio : '')); }
}

const UNA_RIGA = [{ rows: JSON.stringify([{ Id: 'TR/20082026/ABCD1234EFGH5678' }]) }];
const TRE_RIGHE = [{ rows: JSON.stringify([
  { Id: 'TR/20082026/AAAA1111' }, { Id: 'TR/20082026/BBBB2222' }, { Id: 'TR/20082026/CCCC3333' }]) }];

console.log('\nquando il salvataggio è partito da solo');
const r1 = gira(true, UNA_RIGA)[0].json;
const kb1 = JSON.parse(r1.replyMarkupJson);
t('il bottone c\'è', !!r1.replyMarkupJson, JSON.stringify(r1));
t('dice cosa fa, in italiano', /Annulla — non era giusto/.test(kb1.inline_keyboard[0][0].text), kb1.inline_keyboard[0][0].text);
t('e porta con sé l\'Id vero che il gestionale ha scritto',
  kb1.inline_keyboard[0][0].callback_data === 'cancella TR/20082026/ABCD1234EFGH5678', kb1.inline_keyboard[0][0].callback_data);
t('il comando dice «cancella», non «annulla»: la riga c\'è già e va cancellata davvero',
  /^cancella /.test(kb1.inline_keyboard[0][0].callback_data));
t('il callback sta nei 64 byte di Telegram',
  Buffer.byteLength(kb1.inline_keyboard[0][0].callback_data, 'utf8') <= 64,
  String(Buffer.byteLength(kb1.inline_keyboard[0][0].callback_data, 'utf8')));

console.log('\nquando le schede sono più d\'una');
const r2 = gira(true, TRE_RIGHE)[0].json;
const kb2 = JSON.parse(r2.replyMarkupJson);
t('tre schede, tre bottoni: uno per ognuna', kb2.inline_keyboard.length === 3, JSON.stringify(kb2.inline_keyboard.length));
t('ognuno col suo Id preciso, niente da interpretare',
  kb2.inline_keyboard.every((r, i) => r[0].callback_data === 'cancella ' + ['TR/20082026/AAAA1111','TR/20082026/BBBB2222','TR/20082026/CCCC3333'][i]),
  JSON.stringify(kb2.inline_keyboard.map((r) => r[0].callback_data)));
t('e stanno tutti nei 64 byte',
  kb2.inline_keyboard.every((r) => Buffer.byteLength(r[0].callback_data, 'utf8') <= 64));

const QUATTRO = [{ rows: JSON.stringify([{ Id: 'TR/20082026/A1' }, { Id: 'TR/20082026/B2' },
                                         { Id: 'TR/20082026/C3' }, { Id: 'TR/20082026/D4' }]) }];
const kb2b = JSON.parse(gira(true, QUATTRO)[0].json.replyMarkupJson);
t('da quattro in su un bottone solo, altrimenti è una tastiera',
  kb2b.inline_keyboard.length === 1 && /Annulla tutti e 4/.test(kb2b.inline_keyboard[0][0].text),
  JSON.stringify(kb2b.inline_keyboard));

console.log('\nquando NON deve comparire');
t('se la conferma l\'ha data Agostino, niente bottone',
  gira(false, UNA_RIGA)[0].json.replyMarkupJson === undefined);
t('se il gestionale non ha scritto niente, niente bottone',
  gira(true, [])[0].json.replyMarkupJson === undefined, JSON.stringify(gira(true, [])[0].json));
t('se il gestionale risponde senza Id, niente bottone',
  gira(true, [{ rows: JSON.stringify([{ Data: '20/08/2026' }]) }])[0].json.replyMarkupJson === undefined);

console.log('\nquello che c\'era prima non si perde');
const conTesto = { json: { text: 'Salvato.', telegram: { text: 'Salvato.' }, intent: 'conferma' } };
const r3 = gira(true, UNA_RIGA, conTesto)[0].json;
t('il messaggio resta quello', r3.text === 'Salvato.' && r3.intent === 'conferma', JSON.stringify(r3));

console.log('\nun Id lunghissimo non fa saltare il limite di Telegram');
const LUNGO = [{ rows: JSON.stringify([{ Id: 'TR-20260820-' + 'a'.repeat(80) }]) }];
const kb4 = JSON.parse(gira(true, LUNGO)[0].json.replyMarkupJson);
t('il comando resta valido e corto, e ripiega su una frase invece di troncare un Id a metà',
  Buffer.byteLength(kb4.inline_keyboard[0][0].callback_data, 'utf8') <= 64
  && /^cancella /.test(kb4.inline_keyboard[0][0].callback_data)
  && kb4.inline_keyboard[0][0].callback_data.indexOf('aaaa') === -1,
  kb4.inline_keyboard[0][0].callback_data);

console.log('\n' + ok + ' ok, ' + ko + ' KO\n');
process.exit(ko ? 1 : 0);
