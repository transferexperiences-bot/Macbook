// ASSEGNA Id — v2, 22/08/2026 (v1: 21/08)
//
// ============================================================================
// v2 — UN RIENTRO NON PUÒ MAI SOVRASCRIVERE LA SUA ANDATA
// ============================================================================
// Agostino, 22/08: «nel costruire i transfer di ritorno voglio la certezza che non
// vengono mai più sovrascritte le andate, cioè sempre Id nuovi».
//
// La v1 diceva: «se l'Id c'è, non si tocca». È giusto per una modifica vera, ma è
// proprio il buco da cui sono passati i due guasti:
//   · 16/08 esecuzione 742264 — il modello chiama `cerca_servizi` invece di
//     `tool_rientro`, riusa l'Id dell'andata con intent modifica e la richiesta di
//     rientro diventa la MODIFICA dell'andata;
//   · 18/08 esecuzione 758399 — l'Id dell'andata finisce nel testo, appendOrUpdate fa
//     match e l'andata delle 16:45 Pietra Blu → Città di Bari di LADANOV IGOR viene
//     SOVRASCRITTA dal suo rientro.
// In tutti e due i casi le regole c'erano, scritte a parole, e non sono bastate: chi
// salva non legge le regole, legge il testo. Quindi la garanzia la mette il codice, qui,
// nell'ultimo punto prima della scrittura.
//
// LA PROVA CHE SI USA — nessuna parola, solo dati.
// Prima di lasciar passare un Id in arrivo si legge la riga che quell'Id ha davvero sul
// gestionale (nodo «Leggi Riga Id (guardia rientro)»). Se quello che sto per scrivere è
// il percorso INVERSO di quella riga (parte da dove l'altra arrivava e arriva da dove
// l'altra partiva), non è una modifica: è un rientro che indossa l'Id della sua andata.
// Lì l'Id si butta e se ne genera uno nuovo, così appendOrUpdate APPENDE.
// Una modifica vera non rovescia tutti e due i capi del viaggio: correggere una
// destinazione, un orario o una tariffa continua ad aggiornare la stessa riga.
//
// SECONDA PROVA — il marcatore. `Tool - Rientro` scrive nelle Note «Rientro dell'andata
// delle …». Se la riga in arrivo ha quel marcatore e la riga già salvata con quell'Id NON
// ce l'ha, l'Id è dell'andata: si genera lo stesso.
//
// SE IL FOGLIO NON RISPONDE. Senza lettura resta solo il marcatore, e vale da solo: un
// rientro appena costruito che porta un Id può portare solo quello della sua andata.
// Costo accettato: durante un disservizio di Google, modificare un rientro già salvato
// crea una riga in più invece di aggiornarla. Un doppione si cancella (cancellazione
// morbida), un'andata sovrascritta è una prenotazione persa.
//
// Banco: banchi/te/banco-guardia-rientro.js (il guasto 758399 riprodotto).
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
// Gli item veri arrivano dal parser: in mezzo c'è la lettura di guardia, che in uscita
// porta le righe del gestionale, non i transfer da scrivere.
const items = $('Code in JavaScript').all();

// ---- le righe che quegli Id hanno GIÀ sul gestionale, lette per Id ----
// Si indicizza per Id: così non conta l'ordine né quanti item ha restituito la lettura.
const salvate = Object.create(null);
let letturaRotta = false;
try {
  const letti = $('Leggi Riga Id (guardia rientro)').all();
  for (const it of letti) {
    const r = (it && it.json) || {};
    if (r.error !== undefined || r.__error !== undefined) { letturaRotta = true; continue; }
    const rid = String(r.Id === undefined || r.Id === null ? '' : r.Id).trim().toUpperCase();
    if (rid) salvate[rid] = r;
  }
} catch (e) { letturaRotta = true; }

const norm = (v) => String(v === undefined || v === null ? '' : v)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Due nomi indicano lo stesso posto se coincidono o se uno comincia con l'altro
// («Bari Airport» / «Bari Airport T1»). Niente confronti dentro la parola: la «a» di
// «Polignano a Mare» non deve combaciare con niente.
function stessoPosto(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.length >= 4 && y.indexOf(x) === 0) return true;
  if (y.length >= 4 && x.indexOf(y) === 0) return true;
  return false;
}

// Il percorso è rovesciato: parte da dove l'altra arrivava e arriva da dove partiva.
function eInverso(prec, nuovo) {
  const pDa = prec['Transfer > Da'], pPer = prec['Transfer < Per'];
  const nDa = nuovo['Transfer > Da'], nPer = nuovo['Transfer < Per'];
  if (!norm(pDa) || !norm(pPer) || !norm(nDa) || !norm(nPer)) return false;
  if (stessoPosto(pDa, pPer)) return false;   // riga già malata: non ci decido sopra
  return stessoPosto(pPer, nDa) && stessoPosto(pDa, nPer);
}

// Il marcatore che «Tool - Rientro» scrive nelle Note. Lo produce il codice, non il modello.
const MARCA_RIENTRO = /rientro\s+dell['\u2019]?\s*andata\s+delle/i;
const haMarca = (v) => MARCA_RIENTRO.test(String(v === undefined || v === null ? '' : v));

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

  // ---- guardia rientro: un Id in arrivo vale solo se non sta per sovrascrivere l'andata
  if (id) {
    const prec = salvate[id.toUpperCase()];
    let motivo = '';
    if (prec) {
      if (eInverso(prec, j)) {
        motivo = 'l\'Id ' + id + ' e di un transfer che fa il percorso opposto (' +
          String(prec['Transfer > Da'] || '—') + ' -> ' + String(prec['Transfer < Per'] || '—') +
          '): questo e il suo rientro, non una sua modifica';
      } else if (haMarca(j['Note']) && !haMarca(prec['Note'])) {
        motivo = 'l\'Id ' + id + ' e di una riga che non e un rientro, mentre questa lo e: ' +
          'l\'Id e quello dell\'andata';
      }
    } else if (letturaRotta && haMarca(j['Note'])) {
      // Senza lettura non so cosa c'e sotto quell'Id. Un rientro appena costruito che
      // porta un Id puo portare solo quello della sua andata: si butta.
      motivo = 'il gestionale non risponde e questa e una scheda di rientro con un Id ' +
        'addosso: l\'unico Id che puo avere e quello dell\'andata';
    }
    if (motivo) {
      j._id_andata_scartato = id;
      j._id_rigenerato_rientro = motivo;
      id = '';
    }
  }

  if (!id) {
    // nello stesso lotto due schede non possono ricevere lo stesso Id
    do { id = idNuovo(); } while (usati.has(id));
    j._id_generato = true;
  }
  usati.add(id);
  j.Id = id;
  return { json: j };
});

