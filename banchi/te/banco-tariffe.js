#!/usr/bin/env node
// Banco dei nodi «Schede senza tariffa» e «Rimetti le tariffe» (Prenotazioni Transfer 6.0).
//   node banchi/te/banco-tariffe.js
// Casi veri, presi dalle esecuzioni:
//   760628 (18/08 21:20) — tre transfer di Tedi: il primo con 380, gli altri due senza
//                          nessuna riga Tariffa e intent «conferma»: salvati a prezzo vuoto.
//   769329 (19/08 23:31) — scheda già completa con Tariffa 60: non si deve toccare niente.
//   769098 (19/08 23:14) — destinazione «DA DEFINIRE»: il listino non può dire niente.
const fs = require('fs');
const path = require('path');
const R = (f) => fs.readFileSync(path.join(__dirname, '../../backups/n8n/prenotazioni/', f), 'utf8');
const CERCA = R('schede-senza-tariffa.js');
const RIMETTI = R('rimetti-le-tariffe.js');

// Gira il primo nodo: riceve l'uscita di «Guardia Data», restituisce le righe di lavoro.
function cerca(base) {
  const $input = { first: () => ({ json: base }) };
  return new Function('$input', '$json', CERCA)($input, base).map((i) => i.json);
}
// Gira il terzo nodo: `prezzi` è quello che il workflow del listino avrebbe risposto,
// una risposta per riga di lavoro, nello stesso ordine.
function rimetti(base, lavori, prezzi) {
  const $ = (nome) => {
    if (nome === 'Guardia Data') return { first: () => ({ json: base }) };
    if (nome === 'Schede senza tariffa') return { all: () => lavori.map((j) => ({ json: j })) };
    throw new Error('nodo non previsto: ' + nome);
  };
  const $input = { all: () => prezzi.map((j) => ({ json: j })) };
  return new Function('$', '$input', RIMETTI)($, $input)[0].json;
}

let ok = 0, ko = 0;
function t(nome, condizione, dettaglio) {
  if (condizione) { ok++; console.log('  ok   ' + nome); }
  else { ko++; console.log('  KO   ' + nome + (dettaglio ? '\n       ' + dettaglio : '')); }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) Tedi, esecuzione 760628: tre schede, solo la prima col prezzo.
const TEDI = [
  '🚐 TRANSFER 1', '📅 Data: 19/08/2026 (mercoledì)', '🕐 Ora: 09:15',
  '📍 Da: https://goo.gl/maps/ZmtwevrCXVFfxF279',
  '🎯 Per: https://maps.app.goo.gl/W1NMNfwxU9hQnwhk6',
  '🏢 Fornitori: Tedi tour operator', '💳 Modalità: Fattura', '🚗 Veicolo: Sprinter 9 posti',
  '💰 Tariffa: 380', '🆔 Id: TR/18082026/G5HWU5BMPTIVTWY1', '', ' |||', '',
  '🚐 TRANSFER 2', '📅 Data: 19/08/2026 (mercoledì)', '🕐 Ora: 17:00',
  '📍 Da: https://maps.app.goo.gl/W1NMNfwxU9hQnwhk6', '🎯 Per: Polignano a Mare',
  '🏢 Fornitori: Tedi tour operator', '💳 Modalità: Fattura', '🚗 Veicolo: Sprinter 9 posti',
  '🆔 Id: TR/18082026/RT03SZHEGW3YORCP', '', ' |||', '',
  '🚐 TRANSFER 3', '📅 Data: 19/08/2026 (mercoledì)', '🕐 Ora: 22:00',
  '📍 Da: Polignano a Mare', '🎯 Per: Trullo Ermes',
  '🏢 Fornitori: Tedi tour operator', '💳 Modalità: Fattura', '🚗 Veicolo: Sprinter 9 posti',
  '🆔 Id: TR/18082026/MC9T0W28N9AYZG9O',
].join('\n');
// Come arriva davvero da «Guardia Data»: il testo mostrato, quello che Telegram manda e
// — diverso dai primi due — quello che finisce sul gestionale.
const baseTedi = { agent_output_clean: TEDI, telegram: { text: TEDI, parse_mode: 'HTML' },
  recap_verificato: TEDI + '\n\n[INTENT: conferma]',
  intent: 'conferma', chiave: [],
  replyMarkupJson: '{"inline_keyboard":[[{"text":"💾 Salva subito","callback_data":"Salva subito"}]]}' };

console.log('\nTedi 760628 — tre schede, due senza prezzo');
const lavTedi = cerca(baseTedi);
t('trova esattamente le due schede senza prezzo', lavTedi.length === 2, JSON.stringify(lavTedi.map((l) => l.__titolo)));
t('salta la scheda che il prezzo ce l\'ha', !lavTedi.some((l) => l.__titolo === 'TRANSFER 1'));
t('passa al listino i campi che gli servono',
  lavTedi[0] && lavTedi[0].per === 'Polignano a Mare' && lavTedi[0].fornitore === 'Tedi tour operator'
  && lavTedi[0].veicolo === 'Sprinter 9 posti' && lavTedi[0].orario === '17:00',
  JSON.stringify(lavTedi[0]));
t('la partenza col link di Maps arriva intera',
  lavTedi[0] && lavTedi[0].da === 'https://maps.app.goo.gl/W1NMNfwxU9hQnwhk6');

const fuoriTedi = rimetti(baseTedi, lavTedi, [
  { status: 'ok', tariffa: 90, listino: 'Generico', modo: 'listino-MAX' },
  { status: 'ok', tariffa: 45, listino: 'Generico', modo: 'listino-MAX' },
]);
t('i prezzi finiscono nelle schede giuste',
  /TRANSFER 2[\s\S]*?💰 Tariffa: 90€/.test(fuoriTedi.agent_output_clean)
  && /TRANSFER 3[\s\S]*?💰 Tariffa: 45€/.test(fuoriTedi.agent_output_clean),
  fuoriTedi.agent_output_clean);
t('la tariffa sta prima dell\'Id, non dopo',
  fuoriTedi.agent_output_clean.split('|||')[1].indexOf('Tariffa: 90€')
    < fuoriTedi.agent_output_clean.split('|||')[1].indexOf('🆔 Id:'));
t('la tariffa già scritta resta com\'era', /💰 Tariffa: 380\b/.test(fuoriTedi.agent_output_clean));
t('il salvataggio va avanti', fuoriTedi.intent === 'conferma' && !fuoriTedi.tariffe_mancanti.length);
t('dice a voce che i prezzi vengono dal listino',
  /💰 Prezzo dal listino: T2 90€ · T3 45€/.test(fuoriTedi.agent_output_clean));
t('tiene il conto di quello che ha messo', fuoriTedi.tariffe_calcolate.length === 2);

// 1-bis) stesso caso, ma il listino non copre la seconda tratta.
const fuoriMezzo = rimetti(baseTedi, lavTedi, [
  { status: 'ok', tariffa: 90, listino: 'Generico', modo: 'listino-MAX' },
  { status: 'warning', tariffa: 0, motivo: 'nessun-match' },
]);
t('il salvataggio si ferma se un prezzo manca ancora', fuoriMezzo.intent === 'chat');
t('non salva di nascosto', fuoriMezzo.salvataggio_diretto === false);
t('toglie il bottone che salverebbe', fuoriMezzo.replyMarkupJson === null);
t('chiede solo la scheda che manca',
  /⛔ Manca il prezzo/.test(fuoriMezzo.agent_output_clean)
  && /· TRANSFER 3 — Polignano a Mare → Trullo Ermes/.test(fuoriMezzo.agent_output_clean)
  && !/TRANSFER 2 —/.test(fuoriMezzo.agent_output_clean),
  fuoriMezzo.agent_output_clean);
t('il prezzo che sapeva lo scrive lo stesso', /TRANSFER 2[\s\S]*?💰 Tariffa: 90€/.test(fuoriMezzo.agent_output_clean));

// ─────────────────────────────────────────────────────────────────────────────
// 2) 769329 — scheda completa: non si tocca niente.
console.log('\n769329 — scheda già col prezzo');
const COMPLETA = [
  '🚐 TRANSFER 1', '📅 Data: 19/08/2026 (mercoledì)', '🕐 Ora: 23:31',
  '📍 Da: Bar Rotolo — Via Roma, Monopoli', '🎯 Per: Cala Ponte Hotel', '👥 Pax: 6',
  '🧑 Nome: Dempsey', '🏢 Fornitori: Transfer Experience', '💳 Modalità: Incassare',
  '💰 Tariffa: 60', '📝 Note: Rif. camera 306', '🆔 Id: TR/19082026/H85RFAZYWWABP4MP',
].join('\n');
const baseCompleta = { agent_output_clean: COMPLETA, intent: 'conferma', replyMarkupJson: null };
const lavCompleta = cerca(baseCompleta);
t('non chiama il listino per niente', lavCompleta.length === 1 && lavCompleta[0].__niente === true);
const fuoriCompleta = rimetti(baseCompleta, lavCompleta, []);
t('il testo esce identico', fuoriCompleta.agent_output_clean === COMPLETA);
t('il salvataggio va avanti', fuoriCompleta.intent === 'conferma');

// ─────────────────────────────────────────────────────────────────────────────
// 3) 769098 — destinazione da definire: il listino non c'entra, ma non si salva.
console.log('\n769098 — destinazione da definire');
const MONCA = [
  'Nuova richiesta dallo screenshot.', '',
  '🚐 TRANSFER 1', '📅 Data: 19/08/2026 (mercoledì)', '🕐 Ora: 23:14',
  '📍 Da: Da Tuccino', '🎯 Per: DA DEFINIRE (hotel non specificato)',
  '🏢 Fornitori: Transfer Experience', '💳 Modalità: —',
  '🆔 Id: TR/19082026/27S7JO8EYC5VIJ3B',
].join('\n');
const baseMonca = { agent_output_clean: MONCA, intent: 'chat', replyMarkupJson: '{"x":1}' };
const lavMonca = cerca(baseMonca);
t('non manda al listino una tratta senza destinazione', lavMonca.length === 1 && lavMonca[0].__niente === true);
const fuoriMonca = rimetti(baseMonca, lavMonca, []);
t('in chat non blocca niente e non aggiunge rumore',
  fuoriMonca.intent === 'chat' && fuoriMonca.agent_output_clean === MONCA
  && fuoriMonca.replyMarkupJson === '{"x":1}');
t('ma se ne ricorda', fuoriMonca.tariffe_mancanti.length === 1);

const baseMoncaSalva = Object.assign({}, baseMonca, { intent: 'conferma' });
const fuoriMoncaSalva = rimetti(baseMoncaSalva, cerca(baseMoncaSalva), []);
t('se invece stava salvando, si ferma', fuoriMoncaSalva.intent === 'chat');

// ─────────────────────────────────────────────────────────────────────────────
// 2-bis) MOSTRATO = SALVATO. Il testo che Agostino legge e la riga che finisce sul
// gestionale sono due testi diversi: il prezzo deve entrare in tutti e due, altrimenti
// glielo si fa vedere e non lo si salva.
console.log('\nmostrato = salvato');
t('il prezzo entra anche nel testo che si salva',
  /TRANSFER 2[\s\S]*?💰 Tariffa: 90€/.test(fuoriTedi.recap_verificato)
  && /TRANSFER 3[\s\S]*?💰 Tariffa: 45€/.test(fuoriTedi.recap_verificato),
  fuoriTedi.recap_verificato);
t('e anche nel testo che Telegram manda',
  /TRANSFER 2[\s\S]*?💰 Tariffa: 90€/.test(fuoriTedi.telegram.text));
t('il nodo dichiara di averlo messo nel salvataggio',
  fuoriTedi.tariffe_calcolate.every((m) => m.anche_nel_salvataggio === true),
  JSON.stringify(fuoriTedi.tariffe_calcolate));
t('la coda «Prezzo dal listino» NON sporca il testo che si salva',
  !/Prezzo dal listino/.test(fuoriTedi.recap_verificato));

// il caso vero: recap_verificato non è uguale al messaggio, ci sta attaccato altro testo.
const baseDiverso = {
  agent_output_clean: TEDI,
  telegram: { text: TEDI, parse_mode: 'HTML' },
  recap_verificato: 'Riepilogo verificato del turno\n\n' + TEDI + '\n\nmessaggio originale di Agostino: i tre di Tedi\n\n[INTENT: conferma]',
  intent: 'conferma', replyMarkupJson: null
};
const lavDiverso = cerca(baseDiverso);
const fuoriDiverso = rimetti(baseDiverso, lavDiverso, [
  { status: 'ok', tariffa: 90 }, { status: 'ok', tariffa: 45 }]);
t('anche quando i due testi non coincidono, il prezzo entra in tutti e due',
  /TRANSFER 3[\s\S]*?💰 Tariffa: 45€/.test(fuoriDiverso.recap_verificato)
  && /TRANSFER 3[\s\S]*?💰 Tariffa: 45€/.test(fuoriDiverso.agent_output_clean),
  fuoriDiverso.recap_verificato);
t('e il salvataggio va avanti', fuoriDiverso.intent === 'conferma' && !fuoriDiverso.tariffe_mancanti.length);
t('la prosa in mezzo non viene inghiottita',
  /messaggio originale di Agostino/.test(fuoriDiverso.recap_verificato)
  && /Riepilogo verificato del turno/.test(fuoriDiverso.recap_verificato));

// ─────────────────────────────────────────────────────────────────────────────
// 3-bis) 768734 — il rientro: è una scheda anche se l'Id non ce l'ha ancora.
console.log('\n768734 — il rientro senza Id');
const RIENTRO = [
  'Il rientro è pronto, ma manca l\'ora:', '',
  '🔄 RIENTRO da preparare', '📅 Data: 19/08/2026', '🕐 Ora: 21:00',
  '📍 Da: Cala Ponte Hotel', '🎯 Per: Monopoli (dedotta dall\'andata)',
  '💳 Modalità: Fattura', '🏢 Fornitori: Cala Ponte Hotel',
  '↩️ Andata: 00:10 del 18/08/2026 · Monopoli → Cala Ponte Hotel',
].join('\n');
const baseRientro = { agent_output_clean: RIENTRO, intent: 'conferma', replyMarkupJson: null };
const lavRientro = cerca(baseRientro);
t('il rientro senza Id viene prezzato lo stesso', lavRientro.length === 1 && !lavRientro[0].__niente,
  JSON.stringify(lavRientro));
t('al listino arriva il fornitore del rientro',
  lavRientro[0] && lavRientro[0].fornitore === 'Cala Ponte Hotel' && lavRientro[0].da === 'Cala Ponte Hotel');
const fuoriRientro = rimetti(baseRientro, lavRientro, [{ status: 'ok', tariffa: 54, listino: 'Cala Ponte Hotel' }]);
t('il prezzo entra nel rientro', /💰 Tariffa: 54€/.test(fuoriRientro.agent_output_clean));
t('e il salvataggio va avanti', fuoriRientro.intent === 'conferma');

// stessa scheda ma col prezzo già dentro: non si tocca.
const rientroConPrezzo = RIENTRO.replace('💳 Modalità: Fattura', '💰 Tariffa: 54,00€\n💳 Modalità: Fattura');
const lavRcp = cerca({ agent_output_clean: rientroConPrezzo, intent: 'conferma' });
t('il rientro che il prezzo ce l\'ha non va al listino', lavRcp.length === 1 && lavRcp[0].__niente === true);

// ─────────────────────────────────────────────────────────────────────────────
// 3-ter) due rientri sulla stessa tratta, ore diverse: il prezzo non si scambia.
console.log('\ndue schede uguali, ore diverse');
const DUE_RIENTRI = [
  '🔄 RIENTRO 1', '📅 Data: 20/08/2026', '🕐 Ora: 09:00',
  '📍 Da: Cala Ponte Hotel', '🎯 Per: Monopoli', '🏢 Fornitori: Cala Ponte Hotel',
  '', ' |||', '',
  '🔄 RIENTRO 2', '📅 Data: 20/08/2026', '🕐 Ora: 21:00',
  '📍 Da: Cala Ponte Hotel', '🎯 Per: Monopoli', '🏢 Fornitori: Cala Ponte Hotel',
].join('\n');
const baseDue = { agent_output_clean: DUE_RIENTRI, telegram: { text: DUE_RIENTRI },
  recap_verificato: DUE_RIENTRI, intent: 'conferma', replyMarkupJson: null };
const lavDue = cerca(baseDue);
t('vede due schede da prezzare', lavDue.length === 2, JSON.stringify(lavDue.map((l) => l.__ora)));
const fuoriDue = rimetti(baseDue, lavDue, [{ status: 'ok', tariffa: 30 }, { status: 'ok', tariffa: 60 }]);
const p1 = fuoriDue.recap_verificato.split('|||')[0], p2 = fuoriDue.recap_verificato.split('|||')[1];
t('il prezzo delle 09:00 sta nella scheda delle 09:00', /Ora: 09:00/.test(p1) && /Tariffa: 30€/.test(p1), p1);
t('il prezzo delle 21:00 sta nella scheda delle 21:00', /Ora: 21:00/.test(p2) && /Tariffa: 60€/.test(p2), p2);
t('nessuna scheda resta senza', fuoriDue.tariffe_mancanti.length === 0);

// ─────────────────────────────────────────────────────────────────────────────
// 4) i modi in cui un prezzo può essere finto.
console.log('\nprezzi che prezzi non sono');
for (const [riga, atteso] of [
  ['💰 Tariffa: 0', true], ['💰 Tariffa: 0€', true], ['💰 Tariffa:', true],
  ['💰 Tariffa: DA DEFINIRE', true], ['💰 Tariffa: —', true],
  ['💰 Tariffa: 45,00€', false], ['💰 Tariffa: €45', false], ['💰 Tariffa: 1.250', false],
]) {
  const testo = ['🚐 TRANSFER 1', '📅 Data: 20/08/2026', '🕐 Ora: 10:00',
    '📍 Da: Polignano', '🎯 Per: Monopoli', riga, '🆔 Id: TR/19082026/AAAABBBBCCCCDDDD'].join('\n');
  const lav = cerca({ agent_output_clean: testo, intent: 'conferma' });
  const chiama = !(lav.length === 1 && lav[0].__niente);
  t('«' + riga + '» ' + (atteso ? 'va calcolata' : 'va lasciata stare'), chiama === atteso);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5) luoghi che luoghi non sono (presi dalle chat vere: 14 casi in 5.000 messaggi).
console.log('\nluoghi che luoghi non sono');
for (const [luogo, chiede] of [
  ['—', false], ['-', false], ['?', false], ['manca luogo di partenza specifico', false],
  ['(da confermare)', false], ['da definire', false], ['non specificato', false],
  ['Polignano a Mare', true], ['Da Tuccino', true], ['Bari Airport', true],
]) {
  const testo = ['🚐 TRANSFER 1', '📅 Data: 20/08/2026', '🕐 Ora: 10:00',
    '📍 Da: ' + luogo, '🎯 Per: Monopoli', '🆔 Id: TR/19082026/AAAABBBBCCCCDDDD'].join('\n');
  const lav = cerca({ agent_output_clean: testo, intent: 'conferma' });
  const chiama = !(lav.length === 1 && lav[0].__niente);
  t('partenza «' + luogo + '» ' + (chiede ? 'si può prezzare' : 'non si manda al listino'), chiama === chiede);
}

console.log('\n' + ok + ' ok, ' + ko + ' KO\n');
process.exit(ko ? 1 : 0);
