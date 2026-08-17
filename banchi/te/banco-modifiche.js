// Banco offline per il nodo "Code in JavaScript2" di Transfer webhook.
// Riproduce l'ambiente n8n ($(...)) e rigioca i dati veri dell'esecuzione 742784.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'n8n', 'transfer-webhook', 'code-in-javascript2.js'), 'utf8');

function run(buildIdJson, originalRows) {
  const $ = (name) => {
    if (name === 'Code - Build ID + Telegram1') return { item: { json: buildIdJson } };
    if (name === 'Get original transfer1') return { all: () => originalRows.map((j) => ({ json: j })) };
    throw new Error('nodo non previsto dal banco: ' + name);
  };
  return new Function('$', SRC)($)[0].json;
}

// --- Dati veri, esecuzione 742784 del 16/08 ---
const ID = 'TR-20260815-260bb7e5-e32a-4869-9f43-7b9a49348b4d';

const BUILD = {
  fileName: 'Suite 10/Giovì',
  id: ID,
  tipologia: 'NUOVO',            // la struttura aveva lasciato Stato = "Pronto"
  transfer: {
    data: '16/08/2026', ora: '17:15',
    trs_da: 'Monopoli Capitolo', trs_per: 'Suite 10',
    nome: 'Zacche', pax: '1', volo: '', cell: '',
    fornitore: 'Suite 10', veicolo: '', tariffa: '60',
    modalita: 'Incassare', note: 'Ritorno da Lido Bambu',
    tipologia_incasso: 'Incassa PREZZO PIENO (commissione: alla struttura)',
  },
  // La scheda normale che Build ID ha già preparato: quando non ci sono
  // modifiche deve restare questa, non essere sostituita da quella gialla.
  telegram: { text: '🟢 NUOVO TRANSFER\n📁 *Suite 10/Giovì*', parse_mode: 'Markdown' },
};

// Riga 4375 del gestionale come stava PRIMA: senza orario, con la nota vecchia.
const OLD = {
  row_number: 4375,
  Mese: '08 agosto',
  Note: 'Ritorno da Lido Bambu - orario da concordare',
  Data: '16/08/2026', Time: '',
  'TRS> DA': 'Monopoli Capitolo', 'TRS <PER': 'Suite 10',
  PAX: 1, Nome: 'Zacche', Fornitore: 'Suite 10',
  Volo: '', 'cell.': '', Veicolo: '', Tariffa: 60,
  'Modalità': 'Incassare', Id: ID,
};

let ko = 0;
function prova(nome, atteso, effettivo) {
  const a = JSON.stringify(atteso), e = JSON.stringify(effettivo);
  const ok = a === e;
  if (!ok) ko++;
  console.log(`${ok ? '  ok  ' : '  KO  '} ${nome}`);
  if (!ok) console.log(`        atteso:   ${a}\n        ottenuto: ${e}`);
}

console.log('== Banco: rilevatore di modifiche (Code in JavaScript2) ==\n');

// --- IL CASO DEL GUASTO ---
// La struttura ha cambiato l'orario ma ha lasciato Stato = "Pronto".
// Prima usciva "🟢 NUOVO TRANSFER" con changes: [].
{
  const r = run(BUILD, [OLD]);
  prova('742784 — le modifiche vengono viste', true, r.hasChanges);
  prova('742784 — non è un transfer nuovo', false, r.isNewTransfer);
  prova('742784 — trova il cambio d\'orario', true, r.changes.some((c) => c.key === 'ora'));
  const ora = r.changes.find((c) => c.key === 'ora');
  prova('742784 — orario: da vuoto a 17:15', ['—', '17:15'], [ora.old, ora.new]);
  prova('742784 — vede anche la nota cambiata', true, r.changes.some((c) => c.key === 'note'));
  prova('742784 — la scheda diventa MODIFICA', true, r.telegram.text.startsWith('🟡 MODIFICA TRANSFER'));
  prova('742784 — niente falsi cambi sul resto', ['ora', 'note'], r.changes.map((c) => c.key).sort().reverse());
}

// --- LA TRAPPOLA: transfer davvero nuovo ---
// Il nodo Sheets può restituire un item vuoto quando non trova la riga.
// Senza il controllo sull'Id risulterebbe "modificato in tutto".
{
  const r = run(BUILD, [{}]);
  prova('riga non trovata (item vuoto) — è nuovo', true, r.isNewTransfer);
  prova('riga non trovata — nessuna modifica inventata', false, r.hasChanges);
  prova('riga non trovata — nessun changes', [], r.changes);
  prova('riga non trovata — resta la scheda verde',
    '🟢 NUOVO TRANSFER\n📁 *Suite 10/Giovì*', r.telegram.text);
}
{
  const r = run(BUILD, []);
  prova('nessun item — è nuovo', true, r.isNewTransfer);
  prova('nessun item — nessuna modifica', false, r.hasChanges);
}
{
  // Item presente ma con Id vuoto: vale come "non trovata".
  const r = run(BUILD, [{ ...OLD, Id: '' }]);
  prova('vecchia riga senza Id — trattata come nuova', true, r.isNewTransfer);
  prova('vecchia riga senza Id — nessuna modifica', false, r.hasChanges);
}

// --- Rinvio identico: la riga c'è ma non è cambiato niente ---
{
  const uguale = { ...OLD, Time: '17:15', Note: 'Ritorno da Lido Bambu' };
  const r = run(BUILD, [uguale]);
  prova('rinvio identico — nessuna modifica', false, r.hasChanges);
  prova('rinvio identico — non è nuovo', false, r.isNewTransfer);
  prova('rinvio identico — resta la scheda verde di Build ID',
    '🟢 NUOVO TRANSFER\n📁 *Suite 10/Giovì*', r.telegram.text);
}

// --- Le cancellazioni restano fuori dal confronto ---
{
  const r = run({ ...BUILD, tipologia: 'CANCELLAZIONE' }, [OLD]);
  prova('cancellazione — non si diffa', false, r.hasChanges);
  prova('cancellazione — nessun changes', [], r.changes);
}

// --- Una modifica dichiarata continua a funzionare come prima ---
{
  const r = run({ ...BUILD, tipologia: 'MODIFICA' }, [OLD]);
  prova('MODIFICA dichiarata — vede i cambi', true, r.hasChanges);
  prova('MODIFICA dichiarata — scheda gialla', true, r.telegram.text.startsWith('🟡 MODIFICA TRANSFER'));
}

// --- La data si confronta per valore, non per stringa ---
{
  const r = run(
    { ...BUILD, transfer: { ...BUILD.transfer, ora: '', note: 'Ritorno da Lido Bambu - orario da concordare' } },
    [{ ...OLD, Data: '2026-08-16' }]
  );
  prova('date scritte in modi diversi — non è un cambio', false, r.hasChanges);
}

// --- I bottoni restano quelli, con l'Id giusto ---
{
  const r = run(BUILD, [OLD]);
  prova('bottoni — Conferma porta l\'Id', `YES|${ID}`,
    r.replyMarkup.inline_keyboard[0][0].callback_data);
  prova('bottoni — sempre quattro', 4,
    r.replyMarkup.inline_keyboard.flat().length);
  prova('bottoni — callback_data sotto i 64 byte', true,
    r.replyMarkup.inline_keyboard.flat()
      .every((b) => Buffer.byteLength(b.callback_data, 'utf8') <= 64));
}

console.log(`\n${ko === 0 ? 'Tutte le prove passano.' : ko + ' prove FALLITE.'}`);
process.exit(ko === 0 ? 0 : 1);
