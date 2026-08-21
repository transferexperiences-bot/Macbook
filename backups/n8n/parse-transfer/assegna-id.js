// ASSEGNA Id — 21/08/2026
// Nodo: fra «Code in JavaScript» e le due scritture su Google Sheets, workflow
// «Parse transfer» (IkFB29XmJJXQx1a9).
//
// ============================================================================
// IL GUASTO
// ============================================================================
// «Code in JavaScript», riga 244:
//
//     if (s(src.Id)) out['Id'] = s(src.Id);
//
// Se la scheda non porta un Id, la chiave «Id» non finisce nemmeno nell'oggetto in
// uscita. Ma «Google Sheets1» è in appendOrUpdate con match sulla colonna Id: senza Id
// non trova niente e APPENDE una riga con la cella Id VUOTA.
//
// Quella riga esiste sul gestionale, ma è invisibile a chiunque:
//   · «Get row(s) in sheet» cerca per Id e, quando l'Id manca, salta apposta la ricerca
//     (lookupValue diventa '___SKIP_LOOKUP___'). Quindi la ricevuta torna `rows: []`;
//   · il bot legge quella ricevuta vuota e non sa di aver scritto: dice «Conferma
//     transfer» senza data, senza tratta e senza codice, oppure crede di non aver
//     salvato niente;
//   · cerca_servizi non la trova, non si può modificare, non si può cancellare.
//
// È il caso di TUTTI I RIENTRI, che per costruzione non portano mai un Id — e
// giustamente: un Id dell'andata dentro il testo faceva SOVRASCRIVERE l'andata
// (esecuzione 758399 del 18/08, una prenotazione vera persa). La regola «nel testo l'Id
// non ci va» è giusta. Quello che mancava è che l'Id lo mettesse il CODICE, qui, un
// attimo prima di scrivere.
//
// Visto sull'esecuzione 777942 del 21/08 alle 07:52: rientro 21/08 14:15 Cala Ponte
// Marina → Masseria Tarsia Morisco, 50€, scritto sul foglio con Id vuoto.
//
// ============================================================================
// LA CORREZIONE
// ============================================================================
// Nessuna riga esce da qui senza un Id. Se c'è, non si tocca (è un aggiornamento di una
// riga esistente e il match deve continuare a funzionare). Se non c'è, lo genera questo
// codice: TR/DDMMYYYY/ + 16 caratteri casuali, lo stesso formato delle 177 righe già sul
// gestionale.
//
// Perché è sicuro: un Id nuovo e casuale non può combaciare con una riga esistente,
// quindi appendOrUpdate APPENDE — non sovrascrive mai niente. È esattamente il contrario
// del guasto del 18/08, dove l'Id riusato faceva l'update.
//
// Banco: banchi/te/banco-assegna-id.js
const items = $input.all();

function idNuovo() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
  const giorno = String(d.getDate()).padStart(2, '0')
    + String(d.getMonth() + 1).padStart(2, '0')
    + d.getFullYear();
  const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let coda = '';
  for (let i = 0; i < 16; i++) {
    coda += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  }
  return 'TR/' + giorno + '/' + coda;
}

// Un Id vale solo se è un Id vero. «da generare», «vuoto», «-» e i tag HTML rimasti
// attaccati dal recap di Telegram non sono Id: lì si genera.
const FINTI = /^(da\s*generare|vuoto|null|undefined|nessuno|-|—)$/i;
function idBuono(v) {
  const t = String(v === undefined || v === null ? '' : v).replace(/<[^>]+>/g, '').trim();
  if (!t || FINTI.test(t)) return '';
  return t;
}

const usati = new Set();
return items.map((it) => {
  const j = Object.assign({}, it.json || {});
  let id = idBuono(j.Id);
  if (!id) {
    // nello stesso lotto due schede non possono ricevere lo stesso Id
    do { id = idNuovo(); } while (usati.has(id));
    j._id_generato = true;
  }
  usati.add(id);
  j.Id = id;
  return { json: j };
});
