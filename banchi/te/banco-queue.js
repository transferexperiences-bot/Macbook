// Banco offline per le funzioni pure di apps-script/transfer-queue-processor.gs.
// Niente SpreadsheetApp: si caricano le funzioni e si rigiocano dati veri.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'apps-script', 'transfer-queue-processor.gs'), 'utf8');

// Carica solo la parte dichiarativa + le funzioni pure (tutto prima dei TIMER).
const PURE = SRC.split('// TIMER')[0];
const sandbox = {};
new Function('exports', PURE + `
exports.teNormHeader_   = teNormHeader_;
exports.teBuildColMap_  = teBuildColMap_;
exports.teFindRowById_  = teFindRowById_;
exports.teBuildPayload_ = teBuildPayload_;
exports.teIsAck_        = teIsAck_;
exports.TE_MAX_VERIFY_MS = TE_MAX_VERIFY_MS;
`)(sandbox);

const { teBuildColMap_, teFindRowById_, teBuildPayload_, teIsAck_ } = sandbox;

// --- Intestazioni vere ---
// Suite 10/Giovì, lette dal foglio il 16/08. Nota "Tariffa " con lo spazio,
// e "mail" dove Pietra Blu ha "n. pratica".
const H_SUITE10 = [
  'Mese', 'Note', 'Data', 'Time', 'TRS> DA', 'TRS <PER', 'PAX', 'Nome', 'Fornitore',
  'Volo', 'cell.', 'Autista', 'Veicolo', 'h extra/ritardi', 'Tariffa a noi', 'Tariffa ',
  'Fee', 'Modalità', 'Tipologia incasso', 'mail', 'Addebitato', 'Stato', 'Eseguito',
  'Id', 'Cell. driver', 'Assigned Car',
];
// Pietra Blu, da Smart Write Struttura esecuzione 729828.
const H_PIETRABLU = H_SUITE10.slice();
H_PIETRABLU[19] = 'n. pratica';

let ko = 0;
function prova(nome, atteso, effettivo) {
  const a = JSON.stringify(atteso), e = JSON.stringify(effettivo);
  const ok = a === e;
  if (!ok) ko++;
  console.log(`${ok ? '  ok  ' : '  KO  '} ${nome}`);
  if (!ok) console.log(`        atteso:   ${a}\n        ottenuto: ${e}`);
}

console.log('== Banco: Transfer Queue Processor v3 ==\n');

// --- (1) la finestra di attesa ---
prova('finestra ack a 30 s (era 6, causa dei doppioni)', 30000, sandbox.TE_MAX_VERIFY_MS);
prova('ack riconosciuto', true, teIsAck_('Pronto: Pending'));
prova('ack: "Cancellato: Pending" vale', true, teIsAck_('Cancellato: Pending'));
prova('ack: "Pronto" secco non vale', false, teIsAck_('Pronto'));
prova('ack: cella vuota non vale', false, teIsAck_(''));

// --- (2) colonne per nome ---
{
  const { col, warnings } = teBuildColMap_(H_SUITE10);
  prova('Suite 10 — Stato = 22', 22, col.stato);
  prova('Suite 10 — Id = 24', 24, col.id);
  prova('Suite 10 — "Tariffa " con spazio in coda = 16', 16, col.tariffa);
  prova('Suite 10 — "mail" vale come n. pratica = 20', 20, col.n_pratica);
  prova('Suite 10 — nessun avviso', [], warnings);
}
{
  const { col, warnings } = teBuildColMap_(H_PIETRABLU);
  prova('Pietra Blu — "n. pratica" = 20', 20, col.n_pratica);
  prova('Pietra Blu — nessun avviso', [], warnings);
}

// Il caso che oggi romperebbe tutto: una struttura inserisce una colonna.
{
  const h = H_SUITE10.slice();
  h.splice(1, 0, 'Colonna nuova della struttura');
  const { col, warnings } = teBuildColMap_(h);
  prova('colonna inserita — Stato segue a 23', 23, col.stato);
  prova('colonna inserita — Id segue a 25', 25, col.id);
  prova('colonna inserita — nessun avviso', [], warnings);
}

// Intestazione mancante: si ripiega sul numero vecchio E si segnala.
{
  const h = H_SUITE10.slice();
  h[21] = '';
  const { col, warnings } = teBuildColMap_(h);
  prova('Stato senza intestazione — ripiega su 22', 22, col.stato);
  prova('Stato senza intestazione — lo dice', 1,
    warnings.filter((w) => w.startsWith('stato ')).length);
}

// --- I SOLDI: "Tariffa" non deve MAI rubare la colonna di "Tariffa a noi" ---
{
  const { col, warnings } = teBuildColMap_(H_SUITE10);
  prova('tariffa a noi = 15', 15, col.tariffa_a_noi);
  prova('tariffa = 16 (non ruba la 15)', 16, col.tariffa);
  prova('fee = 17', 17, col.fee);
  prova('nessun avviso sui soldi', [], warnings);
}
{
  // Se "Tariffa a noi" sparisce, "Tariffa" NON deve prendersela lo stesso.
  const h = H_SUITE10.slice();
  h[14] = 'Colonna 15';
  const { col } = teBuildColMap_(h);
  prova('senza "Tariffa a noi" — tariffa resta la 16', 16, col.tariffa);
  prova('senza "Tariffa a noi" — ripiega sulla 15, non ruba', 15, col.tariffa_a_noi);
}
{
  // E al contrario: se sparisce "Tariffa", "Tariffa a noi" resta al suo posto.
  const h = H_SUITE10.slice();
  h[15] = 'Colonna 16';
  const { col } = teBuildColMap_(h);
  prova('senza "Tariffa" — tariffa a noi resta la 15', 15, col.tariffa_a_noi);
  prova('senza "Tariffa" — tariffa ripiega sulla 16', 16, col.tariffa);
}

// --- FLESSIBILITÀ: grafie diverse dello stesso nome ---
{
  const h = H_SUITE10.slice();
  h[3] = 'Orario'; h[10] = 'Telefono'; h[7] = 'Cliente';
  h[17] = 'Modalita'; h[21] = 'Status'; h[19] = 'email';
  const { col, warnings } = teBuildColMap_(h);
  prova('alias — Orario', 4, col.ora);
  prova('alias — Telefono', 11, col.cell);
  prova('alias — Cliente', 8, col.nome);
  prova('alias — Modalita senza accento', 18, col.modalita);
  prova('alias — Status', 22, col.stato);
  prova('alias — email vale n. pratica', 20, col.n_pratica);
  prova('alias — nessun avviso', [], warnings);
}
{
  // Punteggiatura e spazi scritti a caso.
  const h = H_SUITE10.slice();
  h[4] = 'TRS  >  DA'; h[5] = 'trs<per'; h[10] = 'Cell'; h[19] = 'N. Pratica';
  const { col, warnings } = teBuildColMap_(h);
  prova('punteggiatura — TRS> DA', 5, col.trs_da);
  prova('punteggiatura — TRS <PER', 6, col.trs_per);
  prova('punteggiatura — Cell', 11, col.cell);
  prova('punteggiatura — N. Pratica', 20, col.n_pratica);
  prova('punteggiatura — nessun avviso', [], warnings);
}
{
  // Stato o Id irriconoscibili: il chiamante deve poterlo vedere.
  const h = new Array(30).fill('Colonna x');
  const { col } = teBuildColMap_(h);
  prova('tutto generico — stato ripiega sulla 22', 22, col.stato);
  prova('tutto generico — id ripiega sulla 24', 24, col.id);
}
{
  // Foglio cortissimo: niente posizione libera per Id -> null, e il codice
  // di processQueue si ferma invece di indovinare.
  const { col } = teBuildColMap_(['Stato']);
  prova('foglio di una colonna — stato = 1', 1, col.stato);
  prova('foglio di una colonna — id ripiega sulla 24', 24, col.id);
}

// --- (3) la riga si conferma per Id ---
const ID = 'TR-20260815-260bb7e5-e32a-4869-9f43-7b9a49348b4d';
{
  // 133 righe dati (riga 2..134): l'Id sta all'ultima, cioè la 134.
  const ids = new Array(133).fill('');
  ids[132] = ID;
  prova('742784 — riga 134, suggerimento giusto', 134, teFindRowById_(ids, ID, 134, 2));
  prova('742784 — suggerimento sbagliato, ritrova per Id', 134, teFindRowById_(ids, ID, 9, 2));
  prova('742784 — senza suggerimento, ritrova per Id', 134, teFindRowById_(ids, ID, 0, 2));
}
{
  // Qualcuno inserisce una riga sopra: il transfer scivola da 134 a 135.
  const ids = new Array(134).fill('');
  ids[133] = ID;
  prova('riga inserita sopra — segue l\'Id, non il numero', 135, teFindRowById_(ids, ID, 134, 2));
}
{
  // Il caso pericoloso della v2: al numero suggerito c\'è il transfer di un altro.
  const ids = new Array(133).fill('');
  ids[132] = 'TR-20260101-altro-cliente';
  prova('Id assente — non manda niente (-1)', -1, teFindRowById_(ids, ID, 134, 2));
  prova('Id vuoto — non manda niente (-1)', -1, teFindRowById_([''], '', 2, 2));
}
{
  const ids = ['  ' + ID + '  '];
  prova('Id con spazi intorno — trovato lo stesso', 2, teFindRowById_(ids, ID, 2, 2));
}

// --- payload costruito per nome ---
{
  const { col } = teBuildColMap_(H_SUITE10);
  const sourceRow = [
    '08 agosto', 'Ritorno da Lido Bambu ', new Date('2026-08-16'), '17:15',
    'Monopoli Capitolo', 'Suite 10', 1, 'Zacche', 'Suite 10', '', '', '', '', '',
    60, 60, 12, 'Incassare', 'Incassa PREZZO PIENO (commissione: alla struttura)',
    '', false, 'Pronto', 'Da svolgere', ID, '', '',
  ];
  const p = teBuildPayload_(sourceRow, col, {
    spreadsheetId: 'SID', spreadsheetUrl: 'URL', fileName: 'Suite 10/Giovì',
    sheetName: 'Prenotazioni', riga: 134, dataFormattata: '16/08/2026',
  });
  prova('payload — id', ID, p.data.id);
  prova('payload — stato', 'Pronto', p.data.stato);
  prova('payload — ora', '17:15', p.data.ora);
  prova('payload — tariffa (intestazione con spazio)', 60, p.data.tariffa);
  prova('payload — riga', 134, p.riga);
  prova('payload — data già formattata', '16/08/2026', p.data.data);
}
{
  // Con una colonna inserita il payload resta corretto: prima no.
  const h = H_SUITE10.slice();
  h.splice(1, 0, 'Extra');
  const { col } = teBuildColMap_(h);
  const sourceRow = ['08 agosto', 'XXX', 'Ritorno', new Date(), '17:15',
    'Monopoli Capitolo', 'Suite 10', 1, 'Zacche', 'Suite 10', '', '', '', '', '',
    60, 60, 12, 'Incassare', 'tip', '', false, 'Pronto', 'Da svolgere', ID, '', ''];
  const p = teBuildPayload_(sourceRow, col, { riga: 1, dataFormattata: '' });
  prova('colonna inserita — payload prende comunque l\'Id giusto', ID, p.data.id);
  prova('colonna inserita — e lo Stato giusto', 'Pronto', p.data.stato);
}

console.log(`\n${ko === 0 ? 'Tutte le prove passano.' : ko + ' prove FALLITE.'}`);
process.exit(ko === 0 ? 0 : 1);
