// Banco offline per il buffer di Orca (n8n/orca/buffer-sono-lultimo.js).
// Rigioca il caso vero del 16/08 ore 19:10: sette messaggi di Agostino uno
// dopo l'altro, a cui Orca ha risposto sette volte, ogni volta chiedendo il
// contesto delle altre sei.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'n8n', 'orca', 'buffer-sono-lultimo.js'), 'utf8');
const SRC_PULIZIA = fs.readFileSync(
  path.join(__dirname, '..', '..', 'n8n', 'orca', 'buffer-righe-da-ripulire.js'), 'utf8');

// Il nodo, con l'ambiente n8n simulato.
// `mio`   = l'update che ha svegliato questa esecuzione
// `coda`  = le righe lette da "Buffer - Rileggi coda"
function nodo(mio, coda) {
  const $ = (name) => {
    if (name === 'Telegram Trigger1') return { first: () => ({ json: mio }) };
    throw new Error('nodo non previsto dal banco: ' + name);
  };
  const $input = { all: () => coda.map((j) => ({ json: j })) };
  return new Function('$', '$input', SRC)($, $input);
}
function pulizia(uscita) {
  const $ = (name) => {
    if (name === "Buffer - Sono l'ultimo?") return { first: () => ({ json: uscita }) };
    throw new Error('nodo non previsto dal banco: ' + name);
  };
  return new Function('$', SRC_PULIZIA)($).map((i) => i.json.id);
}

const CHAT = '522233722';
// --- I sette messaggi veri delle 19:10 del 16/08 ---
const TESTI = [
  'Sisi considera 250€ da 1h e 30, altrimenti 480€ da 3h',
  "Compreso l'aperitivo",
  'Ok',
  'Allora domenica  alle 12:00',
  'Domenica 23 alle 12;00',
  '1h e 30',
  'sisi',
];
const UPD = TESTI.map((_, i) => 900000 + i);
const rigaCoda = (i) => ({
  id: 100 + i, chatid: CHAT, updateid: UPD[i], messageid: 15000 + i,
  testo: TESTI[i], genere: 'testo',
});
const update = (i) => ({
  update_id: UPD[i],
  message: { message_id: 15000 + i, chat: { id: 522233722, type: 'private' }, text: TESTI[i] },
});

let ko = 0;
function prova(nome, atteso, effettivo) {
  const a = JSON.stringify(atteso), e = JSON.stringify(effettivo);
  const ok = a === e;
  if (!ok) ko++;
  console.log(`${ok ? '  ok  ' : '  KO  '} ${nome}`);
  if (!ok) console.log(`        atteso:   ${a}\n        ottenuto: ${e}`);
}

console.log('== Banco: buffer di Orca ==\n');

// =====================================================================
// IL CASO DEL GUASTO: 16/08 19:10, sette messaggi -> deve parlare UNO SOLO
// =====================================================================
// Tutti e sette arrivano entro la finestra: quando ognuno si sveglia trova in
// coda tutti e sette.
{
  const coda = TESTI.map((_, i) => rigaCoda(i));
  const uscite = TESTI.map((_, i) => nodo(update(i), coda));
  const parlanti = uscite.filter((u) => u.length > 0);
  prova('19:10 — parla una volta sola, non sette', 1, parlanti.length);

  const chi = uscite.findIndex((u) => u.length > 0);
  prova('19:10 — parla l\'ULTIMO arrivato', 6, chi);

  const out = parlanti[0][0].json;
  prova('19:10 — unisce tutti e sette', 7, out._buffer_uniti);
  prova('19:10 — il testo è il discorso intero, in ordine',
    TESTI.join('\n'), out.message.text);
  prova('19:10 — «aperitivo» e «1h e 30» sono nello stesso turno', true,
    out.message.text.includes("Compreso l'aperitivo") && out.message.text.includes('1h e 30'));
  prova('19:10 — non è un allegato', false, out._buffer_allegato);
  prova('19:10 — ripulisce tutte e sette le righe',
    [100, 101, 102, 103, 104, 105, 106], pulizia(out));
  prova('19:10 — la chat resta quella giusta', 522233722, out.message.chat.id);
}

// --- Chi non è l'ultimo tace davvero ---
{
  const coda = TESTI.map((_, i) => rigaCoda(i));
  [0, 1, 2, 3, 4, 5].forEach((i) => {
    prova(`messaggio #${i + 1} non è l'ultimo: tace`, 0, nodo(update(i), coda).length);
  });
}

// --- Messaggio isolato: passa subito, non si perde ---
{
  const coda = [rigaCoda(0)];
  const u = nodo(update(0), coda);
  prova('messaggio da solo — passa', 1, u.length);
  prova('messaggio da solo — testo intatto', TESTI[0], u[0].json.message.text);
  prova('messaggio da solo — uniti = 1', 1, u[0].json._buffer_uniti);
}

// --- Coda vuota (riga persa o già ripulita): NON si perde il messaggio ---
{
  const u = nodo(update(3), []);
  prova('coda vuota — parla lo stesso', 1, u.length);
  prova('coda vuota — rete di sicurezza sul testo', TESTI[3], u[0].json.message.text);
}

// =====================================================================
// Allegati: la regola del 15/08 che ha fatto nascere la v2
// =====================================================================
const foto = (upd, caption) => ({
  update_id: upd,
  message: { message_id: 20000, chat: { id: 522233722, type: 'private' },
    photo: [{ file_id: 'AgACx' }], caption: caption || '' },
});
{
  // Una foto e due testi insieme: la foto si prende i testi come didascalia.
  const coda = [
    { id: 200, chatid: CHAT, updateid: 900100, messageid: 20000, testo: '', genere: 'media' },
    rigaCoda(0), rigaCoda(1),
  ];
  const u = nodo(foto(900100), coda);
  prova('foto — passa', 1, u.length);
  prova('foto — è un allegato', true, u[0].json._buffer_allegato);
  prova('foto — si prende i testi come didascalia',
    TESTI[0] + '\n' + TESTI[1], u[0].json.message.caption);
  prova('foto — ripulisce i testi e sé stessa', [100, 101, 200], pulizia(u[0].json));

  // I testi, svegliandosi, devono tacere: ci pensa la foto.
  prova('testo con foto in coda — tace', 0, nodo(update(0), coda).length);
  prova('testo con foto in coda — tace anche l\'ultimo', 0, nodo(update(1), coda).length);
}
{
  // Due foto: solo la prima si prende i testi, la seconda no.
  const coda = [
    { id: 200, chatid: CHAT, updateid: 900100, messageid: 20000, testo: '', genere: 'media' },
    { id: 201, chatid: CHAT, updateid: 900101, messageid: 20001, testo: '', genere: 'media' },
    rigaCoda(0),
  ];
  const prima = nodo(foto(900100), coda)[0].json;
  const seconda = nodo(foto(900101), coda)[0].json;
  prova('due foto — la prima si prende il testo', TESTI[0], prima.message.caption);
  prova('due foto — la seconda no', '', seconda.message.caption || '');
  prova('due foto — la prima non cancella la riga della seconda', false,
    pulizia(prima).includes(201));
  prova('due foto — la seconda cancella solo la sua', [201], pulizia(seconda));
}
{
  // Foto con didascalia sua: la didascalia resta in testa.
  const coda = [
    { id: 200, chatid: CHAT, updateid: 900100, messageid: 20000, testo: '', genere: 'media' },
    rigaCoda(2),
  ];
  const u = nodo(foto(900100, 'guarda qui'), coda)[0].json;
  prova('foto con didascalia — la sua resta prima', 'guarda qui\n' + TESTI[2], u.message.caption);
}
{
  // L'allegato è già passato (riga sparita): il testo NON si ferma.
  const coda = [rigaCoda(0)];
  prova('allegato gia passato — il testo va avanti da solo', 1, nodo(update(0), coda).length);
}

console.log(`\n${ko === 0 ? 'Tutte le prove passano.' : ko + ' prove FALLITE.'}`);
process.exit(ko === 0 ? 0 : 1);
