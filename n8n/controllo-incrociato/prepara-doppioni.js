// =====================================================================
// SV · Controllo Strutture ↔ Gestionale — nodo "Prepara doppioni"
// =====================================================================
//
// PERCHÉ ESISTE (Agostino, 17/08): «basta che scrivi nelle note che c'è un
// doppione». Niente cancellazione: si segnala e basta, la scelta di quale
// riga tenere resta sua.
//
// COSA FA.
//
// Prende gli Id che sul gestionale compaiono su più di una riga e riscrive la
// colonna `Note` mettendoci davanti un avviso. **La nota vecchia non si perde**:
// l'avviso va in testa e il resto rimane. Se l'avviso c'è già non lo raddoppia,
// altrimenti dopo qualche giro la nota sarebbe illeggibile.
//
// Non tocca nient'altro: né Allert, né le date, né i soldi.
//
// DUE RETI, perché dal 17/08 questo gira da solo ogni ora.
//
//   1. Se il gestionale torna corto (sotto TE_MIN_GESTIONALE righe) non si
//      scrive niente: una lettura andata storta non deve far riscrivere note
//      su righe vere.
//   2. Più di TE_MAX_NOTE doppioni in un colpo e ci si ferma. Il gestionale ne
//      ha una manciata: un numero alto vuol dire che la lettura è sballata,
//      non che sono comparsi cinquanta doppioni in un'ora.
//
// UN LIMITE ONESTO.
//
// La scrittura aggancia per `Id`, e due righe doppie hanno lo stesso Id: il
// nodo Google Sheets aggiorna quella che trova per prima. Marcarle tutte e due
// vorrebbe dire puntarle per numero di riga, e sul numero di riga non ci si
// basa mai (regola di Agostino: se l'ordine cambia è la fine). Perciò la nota
// dice quante righe ci sono, così una sola nota basta a trovarle entrambe.
//
// Banco: banchi/te/banco-mancanti-doppioni.js.

var TE_MARCHIO = '⚠️ DOPPIONE';
var TE_MAX_NOTE = 20;
var TE_MIN_GESTIONALE = 500;

function teS_(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
function teId_(v) { return teS_(v).replace(/<[^>]*>/g, '').trim(); }

/**
 * Da righe di gestionale produce le note da riscrivere.
 * Funzione pura: si prova offline.
 *
 * @param {Array<Object>} gestionale righe del gestionale
 */
function tePreparaDoppioni_(gestionale) {
  var quante = (gestionale || []).length;
  if (quante < TE_MIN_GESTIONALE) {
    return { righe: [], quante: 0, gia: [], letturaCorta: true, righeGestionale: quante };
  }

  var perId = {};
  (gestionale || []).forEach(function (g) {
    var id = teId_(g && g.Id);
    if (!id) return;
    if (!perId[id]) perId[id] = [];
    perId[id].push(g);
  });

  var righe = [], gia = [];

  Object.keys(perId).forEach(function (id) {
    var copie = perId[id];
    if (copie.length < 2) return;

    var primo = copie[0];
    var notaVecchia = teS_(primo.Note);

    if (notaVecchia.indexOf(TE_MARCHIO) === 0) {
      gia.push({ Id: id, quante: copie.length, Nome: teS_(primo.Nome) });
      return;                                  // già segnalato: non si riscrive
    }

    righe.push({
      riga: {
        Id: id,
        Note: TE_MARCHIO + ' (' + copie.length + ' righe con questo stesso Id sul gestionale: ' +
          'controlla e tieni quella giusta) · ' + (notaVecchia || '—')
      },
      Nome: teS_(primo.Nome),
      Data: teS_(primo.Data),
      quante: copie.length
    });
  });

  if (righe.length > TE_MAX_NOTE) {
    return { righe: [], quante: righe.length, gia: gia, troppi: true, letturaCorta: false, righeGestionale: quante };
  }

  return { righe: righe, quante: righe.length, gia: gia, troppi: false, letturaCorta: false, righeGestionale: quante };
}

// ===== corpo del nodo n8n =====
var gestionale = $('Leggi Gestionale').all().map(function (i) { return i.json; });
var esito = tePreparaDoppioni_(gestionale);

return esito.righe.map(function (x) { return { json: x.riga }; });
