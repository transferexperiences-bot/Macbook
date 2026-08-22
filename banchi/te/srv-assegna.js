// ASSEGNA Id — v2, 22/08/2026 sera (v1: 21/08)
//
// ============================================================================
// v2 — UNA RIGA SENZA DATA O SENZA TRATTA NON ENTRA IN SILENZIO
// ============================================================================
// 22/08 ore 17:15, esecuzione 788297. Sul gestionale finiscono due righe monche:
//   riga 1359 — Sabbiadoro → (destinazione VUOTA), 17:45, 2 pax, 60€
//   riga 1360 — (data VUOTA), 15:30, Polignano a Mare → Cala Ponte Marina
// Nella scheda che l'agente aveva stampato la riga «🎯 Per:» non c'era proprio: il dato
// non era mai stato raccolto. «Componi Payload Salvataggio» se n'era accorto (la scheda
// risultava monca) e aveva fatto la cosa giusta, spedire il testo intero invece del
// ritaglio. Ma qui in fondo si scriveva lo stesso.
//
// «Validate Fields» vede che mancano e lo ANNOTA soltanto: la sua regola, giusta, è
// «non scartare mai» (v3, 02/05/2026). Il punto è che non scartare non vuol dire
// scrivere monco: una riga senza data non si trova con cerca_servizi, non si può
// modificare e non si può cancellare. È sul gestionale e non esiste per nessuno.
//
// Qui una riga NUOVA senza Data, senza Da o senza Per non viene scritta. Non è persa:
// Prenotazioni l'ha spedita, la ricevuta non la conferma, e il registro delle bozze la
// tiene come «spedita, non confermata» (v6 del 21/08) — quindi torna davanti ad Agostino
// invece di sparire dentro una riga vuota.
//
// ⚠️ Vale SOLO per le righe nuove. Una MODIFICA porta l'Id e, per costruzione del
// parser, NON porta i campi che non stai cambiando: bloccarla vorrebbe dire rompere
// ogni correzione di tariffa, autista o orario.
//
// Banco: banchi/te/banco-monche.js (dati veri delle righe 1359 e 1360).
//
// ============================================================================
// v1 — 21/08/2026
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

// Un campo c'e solo se ha davvero qualcosa dentro.
const pieno = (v) => String(v === undefined || v === null ? '' : v).trim() !== '';

const usati = new Set();
const buone = [];
const scartate = [];
for (const it of items) {
  const j = Object.assign({}, it.json || {});
  let id = idBuono(j.Id);
  const nuova = !id;
  if (!id) {
    // nello stesso lotto due schede non possono ricevere lo stesso Id
    do { id = idNuovo(); } while (usati.has(id));
    j._id_generato = true;
  }
  usati.add(id);
  j.Id = id;

  // v2: solo le righe NUOVE. Una modifica non porta i campi che non stai cambiando.
  if (nuova) {
    const mancano = [];
    if (!pieno(j['Data'])) mancano.push('Data');
    if (!pieno(j['Transfer > Da'])) mancano.push('Da');
    if (!pieno(j['Transfer < Per'])) mancano.push('Per');
    if (mancano.length) {
      j._non_scritta = 'riga nuova senza ' + mancano.join(', ') + ': non la scrivo monca';
      scartate.push(j);
      continue;
    }
  }
  buone.push({ json: j });
}

// Le scartate restano fuori dalla scrittura. Non si perde niente: non finiscono nella
// ricevuta, quindi il registro di Prenotazioni le tiene come «spedite, non confermate»
// (v6 del 21/08) e te le rimette davanti. Il perche di ognuna sta nel campo
// `_non_scritta`, leggibile nei dati dell'esecuzione.
// Niente item di sola diagnostica in uscita: qui sotto c'e Google Sheets, e tutto quello
// che esce da questo nodo e una riga da scrivere.
return buone;
