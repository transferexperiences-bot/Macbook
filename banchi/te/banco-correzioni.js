// Banco offline per "Prepara correzioni" (n8n/controllo-incrociato/prepara-correzioni.js).
// Rigioca le discordanze vere trovate il 17/08 dall'esecuzione 751571.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'n8n', 'controllo-incrociato', 'prepara-correzioni.js'), 'utf8');
const PURE = SRC.split('// ===== corpo del nodo n8n =====')[0];
const puro = {};
new Function('exports', PURE + `
exports.tePreparaCorrezioni_    = tePreparaCorrezioni_;
exports.teRapportoCorrezioni_   = teRapportoCorrezioni_;
`)(puro);
const { tePreparaCorrezioni_, teRapportoCorrezioni_ } = puro;

let ko = 0;
function prova(nome, atteso, effettivo) {
  const a = JSON.stringify(atteso), e = JSON.stringify(effettivo);
  const ok = a === e;
  if (!ok) ko++;
  console.log(`${ok ? '  ok  ' : '  KO  '} ${nome}`);
  if (!ok) console.log(`        atteso:   ${a}\n        ottenuto: ${e}`);
}

console.log('== Banco: prepara correzioni sul gestionale ==\n');

const d = (Id, Nome, Fornitore, differenze) => ({ Id, Nome, Fornitore, differenze });
const diff = (campo, strutture, gestionale, avviso) => ({ campo, strutture, gestionale, avviso: !!avviso });

// --- Dati veri, esecuzione 751571 del 17/08 ---
const VERI = [
  d('TR/04072026/JGKM9G658KS53QY0', 'Sarah Shaw', 'TransferExperience',
    [diff('Ora', '15:00', '10:00')]),
  d('TR/04082026/BD9P9AQ8OJ4NTI1W', 'Stephanie Santangelo', 'Generico',
    [diff('Ora', '11:30', '12:00'), diff('Pax', '2', '1'),
     diff('Nome', 'Stephanie Santangelo', 'Barbara Freedenberg (Santangelo Travels)')]),
  d('TR/07082026/U0E2X72HNE2OW1PN', '', 'Serafini',
    [diff('Partenza', 'Polignano a Mare', 'Grotta palazzese')]),
  d('TR/15082026/4BVTOFX7VOOB08AI', 'Conor Stanley', 'Transfer Experience',
    [diff('Ora', '16:30', '15:00'),
     diff('Partenza', 'Fasano', 'https://maps.app.goo.gl/3kkxqWcYAtwfsn2TA?g_st=iw')]),
  d('TR-20260817-1e8bb4a7-aa3e-4814-b676-d34c82893328', 'Di Francesco Lucrezia', 'Pietra Blu',
    [diff('Tariffa', '196', '240,00€', true)]),
];

{
  const r = tePreparaCorrezioni_(VERI, 30);
  prova('751571 — quattro righe da scrivere (la quinta è solo tariffa)', 4, r.quante);
  prova('751571 — non si ferma', false, r.troppe);

  const perId = Object.fromEntries(r.righe.map((x) => [x.riga.Id, x.riga]));

  // Sarah Shaw: solo l'ora, e nient'altro.
  prova('Sarah Shaw — scrive Time', '15:00', perId['TR/04072026/JGKM9G658KS53QY0'].Time);
  prova('Sarah Shaw — scrive SOLO Id e Time', ['Id', 'Time'],
    Object.keys(perId['TR/04072026/JGKM9G658KS53QY0']).sort());

  // Stephanie: tre campi insieme, con i nomi di colonna del gestionale.
  const st = perId['TR/04082026/BD9P9AQ8OJ4NTI1W'];
  prova('Stephanie — Time', '11:30', st.Time);
  prova('Stephanie — Pax', '2', st.Pax);
  prova('Stephanie — Nome', 'Stephanie Santangelo', st.Nome);

  // Serafini: la partenza usa il nome di colonna vero del gestionale.
  prova('Serafini — colonna «Transfer > Da»', 'Polignano a Mare',
    perId['TR/07082026/U0E2X72HNE2OW1PN']['Transfer > Da']);

  // Conor: ora + partenza.
  const co = perId['TR/15082026/4BVTOFX7VOOB08AI'];
  prova('Conor — Time', '16:30', co.Time);
  prova('Conor — partenza torna «Fasano»', 'Fasano', co['Transfer > Da']);
}

// =====================================================================
// LA COSA PIÙ IMPORTANTE: la Tariffa non si scrive MAI
// =====================================================================
{
  const r = tePreparaCorrezioni_(VERI, 30);
  const tocca = r.righe.map((x) => x.riga.Id);
  prova('tariffa — la riga con la sola tariffa non viene scritta', false,
    tocca.includes('TR-20260817-1e8bb4a7-aa3e-4814-b676-d34c82893328'));
  prova('tariffa — nessuna riga contiene la colonna Tariffa', true,
    r.righe.every((x) => !('Tariffa' in x.riga)));
  prova('tariffa — finisce fra le saltate', 1, r.saltate.length);
  prova('tariffa — con la spiegazione', true,
    r.saltate[0].motivo.includes('formula'));
  prova('tariffa — il rapporto la nomina', true,
    teRapportoCorrezioni_(r).includes('NON TOCCATI'));
}
{
  // Riga con ora sbagliata E tariffa diversa: si scrive l'ora, la tariffa no.
  const mista = [d('TR/X', 'Tizio', 'F', [diff('Ora', '09:00', '10:00'), diff('Tariffa', '50', '60', true)])];
  const r = tePreparaCorrezioni_(mista, 30);
  prova('riga mista — si scrive', 1, r.quante);
  prova('riga mista — solo Id e Time', ['Id', 'Time'], Object.keys(r.righe[0].riga).sort());
  prova('riga mista — la tariffa resta segnalata', 1, r.saltate.length);
}

// --- Il freno a mano ---
{
  const tante = [];
  for (let i = 0; i < 31; i++) tante.push(d('TR/' + i, 'X', 'F', [diff('Ora', '09:00', '10:00')]));
  const r = tePreparaCorrezioni_(tante, 30);
  prova('31 righe — non scrive niente', 0, r.righe.length);
  prova('31 righe — dice che si è fermato', true, r.troppe);
  prova('31 righe — il rapporto lo grida', true,
    teRapportoCorrezioni_(r).startsWith('⛔ CORREZIONE FERMATA'));
}
{
  const trenta = [];
  for (let i = 0; i < 30; i++) trenta.push(d('TR/' + i, 'X', 'F', [diff('Ora', '09:00', '10:00')]));
  const r = tePreparaCorrezioni_(trenta, 30);
  prova('30 righe — al limite, scrive', 30, r.righe.length);
}

// --- Niente da fare ---
{
  const r = tePreparaCorrezioni_([], 30);
  prova('nessuna discordanza — nessuna riga', 0, r.quante);
  prova('nessuna discordanza — lo dice', true,
    teRapportoCorrezioni_(r).startsWith('✅ Niente da correggere'));
}

// --- Il rapporto deve dire cosa è cambiato, non solo che è cambiato ---
{
  const r = tePreparaCorrezioni_(VERI, 30);
  const m = teRapportoCorrezioni_(r);
  prova('rapporto — mostra il prima e il dopo', true, m.includes('«10:00» → «15:00»'));
  prova('rapporto — porta gli Id', true, m.includes('TR/04072026/JGKM9G658KS53QY0'));
  prova('rapporto — conta le righe', true, m.includes('(4 righe)'));
}

console.log(`\n${ko === 0 ? 'Tutte le prove passano.' : ko + ' prove FALLITE.'}`);
process.exit(ko === 0 ? 0 : 1);
