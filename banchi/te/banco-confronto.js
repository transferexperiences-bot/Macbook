// Banco offline per il controllo incrociato Strutture ↔ Gestionale.
// Rigioca i dati veri del 17/08 (MULLINS KRISTINA spostata all'01:00 del 18)
// e le trappole che possono generare falsi allarmi.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'n8n', 'controllo-incrociato', 'confronto.js'), 'utf8');

const PURE = SRC.split('// ===== corpo del nodo n8n =====')[0];
const puro = {};
new Function('exports', PURE + `
exports.teConfronta_ = teConfronta_;
exports.teRapporto_  = teRapporto_;
exports.teData_      = teData_;
exports.teAncoraDaFare_ = teAncoraDaFare_;
exports.teOra_       = teOra_;
`)(puro);
const { teConfronta_, teRapporto_, teData_, teOra_, teAncoraDaFare_ } = puro;

let ko = 0;
function prova(nome, atteso, effettivo) {
  const a = JSON.stringify(atteso), e = JSON.stringify(effettivo);
  const ok = a === e;
  if (!ok) ko++;
  console.log(`${ok ? '  ok  ' : '  KO  '} ${nome}`);
  if (!ok) console.log(`        atteso:   ${a}\n        ottenuto: ${e}`);
}

console.log('== Banco: controllo incrociato Strutture ↔ Gestionale ==\n');

// --- lettura delle date nei due dialetti ---
prova('data struttura 17/08/2026', '17/08/2026', teData_('17/08/2026', '08:00'));
prova('data gestionale a parole', '18/08/2026', teData_('mar 18 agosto 2026'));
prova('data gestionale con giorno abbreviato', '01/09/2026', teData_('mar 1 settembre 2026'));
prova('data ISO', '17/08/2026', teData_('2026-08-17'));
prova('data illeggibile non inventa', '', teData_('domani'));
prova('ora con virgola', '21:15', teOra_('21,15'));
prova('ora con punto', '10:30', teOra_('10.30'));
prova('ora sola', '17:00', teOra_('17'));

// =====================================================================
// IL CASO VERO — MULLINS KRISTINA, 17/08
// =====================================================================
const ID = 'TR-20260817-c5e86a34-5443-4f51-881e-889ee79d94f5';
const STR = {
  Id: ID, Data: '17/08/2026', Time: '17:30',
  'TRS> DA': 'Auraterrae', 'TRS <PER': 'Polignano a mare',
  PAX: '3', Nome: 'MULLINS KRISTINA', Fornitore: 'Auraterrae',
  'Tariffa a noi': '35', Stato: 'Pronto', Eseguito: 'Da svolgere',
};
const GES = {
  Id: ID, Data: 'mar 18 agosto 2026', Time: '01:00',
  'Transfer > Da': 'Auraterrae', 'Transfer < Per': 'Polignano a mare',
  Pax: '3', Nome: 'MULLINS KRISTINA', Fornitori: 'Auraterrae',
  Tariffa: '35,00€',
};
{
  const r = teConfronta_([STR], [GES], '17/08/2026', '08:00');
  prova('MULLINS — una discordanza trovata', 1, r.discordanti.length);
  prova('MULLINS — è grave (non solo tariffa)', true, r.discordanti[0].grave);
  const campi = r.discordanti[0].differenze.map((d) => d.campo).sort();
  prova('MULLINS — data e ora, e nient\'altro', ['Data', 'Ora'], campi);
  const data = r.discordanti[0].differenze.find((d) => d.campo === 'Data');
  prova('MULLINS — dice i due valori', ['17/08/2026', 'mar 18 agosto 2026'],
    [data.strutture, data.gestionale]);
  prova('MULLINS — niente mancanti', 0, r.mancanti.length);
  prova('MULLINS — niente doppioni', 0, r.doppioni.length);
  prova('MULLINS — non dice che è tutto a posto', false, r.tutto_a_posto);

  const m = teRapporto_(r, '17/08/2026', '08:00');
  prova('rapporto — nomina il cliente', true, m.includes('MULLINS KRISTINA'));
  prova('rapporto — porta l\'Id per ritrovarla', true, m.includes(ID));
  prova('rapporto — mostra struttura contro gestionale', true,
    m.includes('17:30') && m.includes('01:00'));
}

// --- Riga identica: silenzio ---
{
  const gOk = { ...GES, Data: '17/08/2026', Time: '17:30' };
  const r = teConfronta_([STR], [gOk], '17/08/2026', '08:00');
  prova('riga identica — nessuna discordanza', 0, r.discordanti.length);
  prova('riga identica — tutto a posto', true, r.tutto_a_posto);
  prova('riga identica — messaggio di quiete', true,
    teRapporto_(r, '17/08/2026', '08:00').startsWith('✅'));
  prova('riga identica — l\'ha comunque guardata', 1, r.guardate);
}
{
  // Date scritte nei due dialetti ma stesso giorno: NON è una discordanza.
  const gOk = { ...GES, Data: 'lun 17 agosto 2026', Time: '17:30' };
  const r = teConfronta_([STR], [gOk], '17/08/2026', '08:00');
  prova('date in dialetti diversi, stesso giorno — silenzio', 0, r.discordanti.length);
}
{
  // Ora con virgola sulla struttura: stessa ora.
  const r = teConfronta_([{ ...STR, Time: '17,30' }],
    [{ ...GES, Data: '17/08/2026', Time: '17:30' }], '17/08/2026', '08:00');
  prova('ora con virgola contro 17:30 — silenzio', 0, r.discordanti.length);
}

// --- Mancante e doppione ---
{
  const r = teConfronta_([STR], [], '17/08/2026', '08:00');
  prova('assente dal gestionale — finisce nei mancanti', 1, r.mancanti.length);
  prova('assente — porta l\'Id', ID, r.mancanti[0].Id);
  prova('assente — non è una discordanza', 0, r.discordanti.length);
  prova('rapporto — avvisa che può essere legittimo', true,
    teRapporto_(r, '17/08/2026', '08:00').includes('mai confermato'));
}
{
  const r = teConfronta_([STR], [GES, { ...GES }], '17/08/2026', '08:00');
  prova('due righe stesso Id — doppione', 1, r.doppioni.length);
  prova('doppione — dice quante', 2, r.doppioni[0].quante);
  prova('doppione — non lo conta anche come discordanza', 0, r.discordanti.length);
}

// --- Quello che NON deve svegliare nessuno ---
{
  const r = teConfronta_([{ ...STR, Eseguito: 'Svolto' }], [], '17/08/2026', '08:00');
  prova('già svolto — non si controlla', 0, r.mancanti.length + r.guardate);
}
{
  const r = teConfronta_([{ ...STR, Stato: 'Cancellato' }], [], '17/08/2026', '08:00');
  prova('cancellato — non si controlla', 0, r.mancanti.length + r.guardate);
}
{
  const r = teConfronta_([{ ...STR, Data: '11/07/2026' }], [], '17/08/2026', '08:00');
  prova('transfer di luglio — il passato non si tocca', 0, r.guardate);
}
{
  const r = teConfronta_([{ ...STR, Id: '' }], [], '17/08/2026', '08:00');
  prova('riga senza Id — mai partita, non è un guasto', 0, r.guardate);
}
{
  // Riga sul gestionale che non viene dalle strutture (inserita da Orca):
  // non deve risultare un errore.
  const r = teConfronta_([], [{ Id: 'TR/17082026/ABC', Data: '17/08/2026' }], '17/08/2026', '08:00');
  prova('riga solo sul gestionale — non si segnala', true, r.tutto_a_posto);
}
{
  // Campo vuoto da una parte: non si grida, si tace.
  const r = teConfronta_(
    [{ ...STR, Nome: '' }],
    [{ ...GES, Data: '17/08/2026', Time: '17:30' }], '17/08/2026', '08:00');
  prova('nome vuoto sulla struttura — non è una discordanza', 0, r.discordanti.length);
}
{
  // Solo la tariffa diversa: si segnala, ma non è grave (le formule del
  // gestionale possono calcolare un valore diverso dalla tariffa a noi).
  const r = teConfronta_(
    [{ ...STR, 'Tariffa a noi': '40' }],
    [{ ...GES, Data: '17/08/2026', Time: '17:30' }], '17/08/2026', '08:00');
  prova('solo tariffa diversa — segnalata', 1, r.discordanti.length);
  prova('solo tariffa diversa — non grave', false, r.discordanti[0].grave);
}
{
  // Tariffa scritta 35 contro "35,00€": stesso valore.
  const r = teConfronta_([STR], [{ ...GES, Data: '17/08/2026', Time: '17:30' }], '17/08/2026', '08:00');
  prova('35 contro 35,00€ — stesso valore', 0, r.discordanti.length);
}
{
  // Pax "3" contro 3 numerico.
  const r = teConfronta_([STR], [{ ...GES, Data: '17/08/2026', Time: '17:30', Pax: 3 }], '17/08/2026', '08:00');
  prova('pax testo contro numero — silenzio', 0, r.discordanti.length);
}
{
  // Accenti e maiuscole nei luoghi.
  const r = teConfronta_(
    [{ ...STR, 'TRS <PER': 'POLIGNANO A MARE' }],
    [{ ...GES, Data: '17/08/2026', Time: '17:30' }], '17/08/2026', '08:00');
  prova('maiuscole nei luoghi — silenzio', 0, r.discordanti.length);
}

// =====================================================================
// L'ORA: i servizi già passati non si guardano (regola di Agostino, 17/08)
// =====================================================================
prova('domani — da fare', true,  teAncoraDaFare_('18/08/2026', '09:00', '17/08/2026', '18:00'));
prova('ieri — passato', false, teAncoraDaFare_('16/08/2026', '23:00', '17/08/2026', '08:00'));
prova('oggi alle 11, ora sono le 18 — passato', false,
  teAncoraDaFare_('17/08/2026', '11:00', '17/08/2026', '18:00'));
prova('oggi alle 19, ora sono le 18 — da fare', true,
  teAncoraDaFare_('17/08/2026', '19:00', '17/08/2026', '18:00'));
prova('oggi alla stessa ora esatta — considerato passato', false,
  teAncoraDaFare_('17/08/2026', '18:00', '17/08/2026', '18:00'));
prova('oggi senza ora — si tiene tutto il giorno', true,
  teAncoraDaFare_('17/08/2026', '', '17/08/2026', '18:00'));
prova('oggi con ora illeggibile — si tiene', true,
  teAncoraDaFare_('17/08/2026', 'da concordare', '17/08/2026', '18:00'));
prova('oggi a mezzanotte e mezza, sono le 00:10 — da fare', true,
  teAncoraDaFare_('17/08/2026', '00:30', '17/08/2026', '00:10'));
prova('senza data — non è un servizio da fare', false,
  teAncoraDaFare_('', '10:00', '17/08/2026', '08:00'));
{
  // Il caso vero: alle 18 non deve più vedere il transfer delle 11.
  const s = { ...STR, Data: '17/08/2026', Time: '11:00' };
  prova('alle 18 il transfer delle 11 sparisce dal controllo', 0,
    teConfronta_([s], [], '17/08/2026', '18:00').guardate);
  prova('alle 10 lo stesso transfer c\'è ancora', 1,
    teConfronta_([s], [], '17/08/2026', '10:00').guardate);
  prova('alle 18 non finisce fra i mancanti', 0,
    teConfronta_([s], [], '17/08/2026', '18:00').mancanti.length);
  prova('alle 10 finisce fra i mancanti', 1,
    teConfronta_([s], [], '17/08/2026', '10:00').mancanti.length);
}
{
  // Una discordanza su un servizio già passato non si segnala più.
  const s = { ...STR, Data: '17/08/2026', Time: '09:00' };
  const g = { ...GES, Data: '17/08/2026', Time: '10:00' };
  prova('discordanza su servizio passato — silenzio', 0,
    teConfronta_([s], [g], '17/08/2026', '18:00').discordanti.length);
  prova('la stessa alle 08 — si segnala', 1,
    teConfronta_([s], [g], '17/08/2026', '08:00').discordanti.length);
}


// =====================================================================
// I campi aggiunti il 20/08 — «tutti, assolutamente» (Agostino)
// Le regole qui sotto non sono gusti: ognuna toglie un falso allarme che
// sulle righe VERE si contava a decine. I numeri sono nei commenti.
// =====================================================================
console.log('\n-- i campi nuovi --');
function conf(campiStr, campiGes) {
  const s = { ...STR, ...campiStr };
  const g = { ...GES, Data: '17/08/2026', Time: '17:30', ...campiGes };  // resto uguale
  const r = teConfronta_([s], [g], '17/08/2026', '08:00');
  return r.discordanti.length ? r.discordanti[0].differenze.map((d) => d.campo) : [];
}

// La nota è il motivo per cui Agostino ha chiesto tutti i campi.
prova('nota della struttura che sul gestionale non c\'è → si segnala',
  ['Note'], conf({ Note: 'bambino 2 anni, seggiolino' }, { Note: '' }));
prova('nota già presente, con altro intorno → silenzio',
  [], conf({ Note: 'seggiolino' }, { Note: 'cliente abituale · seggiolino · pagato' }));
prova('nota solo sul gestionale → silenzio (non è la struttura a chiedere)',
  [], conf({ Note: '' }, { Note: 'chiamato il cliente' }));

// Fee: sul gestionale è negativa. Erano 76 falsi allarmi su 161 servizi.
prova('fee 24 contro −24 → silenzio', [], conf({ Fee: '24' }, { Fee: '-24.0' }));
prova('fee 0 da una parte → silenzio (vuol dire «non calcolata»)',
  [], conf({ Fee: '0' }, { Fee: '-3.15' }));
prova('fee davvero diversa → si segnala', ['Fee'], conf({ Fee: '24' }, { Fee: '-30' }));

// Telefoni salvati come numero: tornano in notazione scientifica. Erano 18.
prova('telefono in notazione scientifica → silenzio',
  [], conf({ 'cell.': '41782609962' }, { 'Cell.': '4.1782609962E10' }));
prova('telefono con prefisso scritto diverso → silenzio',
  [], conf({ 'cell.': '+39 080 4240108' }, { 'Cell.': '00390804240108' }));
prova('telefono di un\'altra persona → si segnala',
  ['Telefono'], conf({ 'cell.': '3331112223' }, { 'Cell.': '3339998887' }));

// Il gestionale è più preciso: non è una discordanza.
prova('veicolo «Sprinter» contro «Sprinter GZ204TT» → silenzio',
  [], conf({ Veicolo: 'Sprinter' }, { Veicolo: 'Sprinter GZ204TT' }));
prova('autista diverso → si segnala (arancione)',
  ['Autista'], conf({ Autista: 'Giuseppe Fanelli' }, { Autista: 'Claudio Moccia' }));
prova('volo diverso → si segnala', ['Volo'], conf({ Volo: 'FR7838' }, { Volo: 'W64321' }));

// Il colore: i sette campi che mandano un autista nel posto sbagliato restano rossi,
// tutto il resto è arancione.
{
  const s = { ...STR, Autista: 'Tizio', Note: 'seggiolino' };
  const g = { ...GES, Data: '17/08/2026', Time: '17:30', Autista: 'Caio', Note: '' };
  const r = teConfronta_([s], [g], '17/08/2026', '08:00');
  prova('due differenze, nessuna grave → arancione', false, r.discordanti[0].grave);
}
{
  const s = { ...STR, Note: 'seggiolino' };
  const g = { ...GES, Note: '' };                    // GES ha data e ora diverse
  const r = teConfronta_([s], [g], '17/08/2026', '08:00');
  prova('con anche l\'ora sbagliata → rosso', true, r.discordanti[0].grave);
}

console.log(`\n${ko === 0 ? 'Tutte le prove passano.' : ko + ' prove FALLITE.'}`);
process.exit(ko === 0 ? 0 : 1);
