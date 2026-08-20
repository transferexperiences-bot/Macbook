// Banco per backups/n8n/orca/tap-verso-prenotazioni.js
// Riproduce i turni veri di Orca: messaggio scritto, vocale, tap sul bottone, risposta
// spezzata in più pezzi. Niente chat vive, niente fogli.

const {
  corpoCancella, scegliBot, urlInvio, ORCA, PRENOTAZIONI,
} = require('../../backups/n8n/orca/tap-verso-prenotazioni.js');

let ok = 0;
let ko = 0;
function prova(nome, fn) {
  try {
    fn();
    ok++;
    console.log('  ok   ' + nome);
  } catch (e) {
    ko++;
    console.log('  KO   ' + nome + '\n       ' + e.message);
  }
}
function uguale(a, b, che) {
  const A = JSON.stringify(a);
  const B = JSON.stringify(b);
  if (A !== B) throw new Error((che || '') + '  atteso ' + B + ', trovato ' + A);
}

const CHAT = 522233722;
const testo = (over) => Object.assign({ kind: 'text', chat_id: CHAT, message_id: 15716 }, over || {});
const tap = (over) => Object.assign({ kind: 'callback', chat_id: CHAT, message_id: 15712,
  callback_data: 'salva TR/20082026/SX8AF1YRPT2R6RUM' }, over || {});

const senzaBottoni = [{ hasButtons: false, replyMarkupJson: null }];
const conBottoni = [{ hasButtons: true, replyMarkupJson: '{"inline_keyboard":[[]]}' }];
const spezzataUltimoConBottoni = [
  { hasButtons: false }, { hasButtons: false }, { hasButtons: true },
];
const spezzataSenzaBottoni = [{ hasButtons: false }, { hasButtons: false }, { hasButtons: false }];

console.log('\nDove finisce la risposta\n');

prova('un messaggio scritto: la risposta resta su Orca', () => {
  uguale(scegliBot(testo(), senzaBottoni), ORCA);
});

prova('un messaggio scritto con bottoni: resta su Orca', () => {
  uguale(scegliBot(testo(), conBottoni), ORCA);
});

prova('un tap, risposta senza bottoni: va su Prenotazioni', () => {
  uguale(scegliBot(tap(), senzaBottoni), PRENOTAZIONI);
});

prova('un tap, ma Orca sta ancora chiedendo (bottoni): resta su Orca', () => {
  uguale(scegliBot(tap(), conBottoni), ORCA);
});

prova('un tap, risposta spezzata con i bottoni solo sull\'ultimo pezzo: tutti restano su Orca', () => {
  uguale(scegliBot(tap(), spezzataUltimoConBottoni), ORCA,
    'i primi pezzi non devono finire di là e l\'ultimo di qua');
});

prova('un tap, risposta spezzata e nessun bottone: tutti vanno su Prenotazioni', () => {
  uguale(scegliBot(tap(), spezzataSenzaBottoni), PRENOTAZIONI);
});

prova('un vocale (kind voice) non è un tap: resta su Orca', () => {
  uguale(scegliBot(testo({ kind: 'voice' }), senzaBottoni), ORCA);
});

prova('kind mancante non fa saltare niente: resta su Orca', () => {
  uguale(scegliBot({ chat_id: CHAT }, senzaBottoni), ORCA);
});

prova('nessun pezzo di risposta: resta il comportamento prudente del tap', () => {
  uguale(scegliBot(tap(), []), PRENOTAZIONI);
});

prova('l\'URL è quello di sendMessage, sul bot giusto', () => {
  uguale(urlInvio(tap(), senzaBottoni), 'https://api.telegram.org/' + PRENOTAZIONI + '/sendMessage');
  uguale(urlInvio(testo(), senzaBottoni), 'https://api.telegram.org/' + ORCA + '/sendMessage');
});

console.log('\nQuale messaggio si cancella\n');

prova('sul tap si cancella il messaggio premuto', () => {
  uguale(corpoCancella(tap()), { chat_id: CHAT, message_id: 15712 });
});

prova('su un messaggio scritto non si cancella niente (message_id 0)', () => {
  uguale(corpoCancella(testo()), { chat_id: CHAT, message_id: 0 });
});

prova('message_id assente sul tap: 0, non NaN', () => {
  uguale(corpoCancella({ kind: 'callback', chat_id: CHAT }), { chat_id: CHAT, message_id: 0 });
});

prova('message_id come stringa: diventa numero', () => {
  uguale(corpoCancella({ kind: 'callback', chat_id: CHAT, message_id: '15712' }),
    { chat_id: CHAT, message_id: 15712 });
});

prova('la chat non cambia mai: è sempre la sua', () => {
  uguale(corpoCancella(tap()).chat_id, CHAT);
  uguale(corpoCancella(testo()).chat_id, CHAT);
});

console.log('\n' + ok + ' ok, ' + ko + ' KO\n');
process.exit(ko ? 1 : 0);
