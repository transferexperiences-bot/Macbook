// =====================================================================
// SV · Controllo Strutture ↔ Gestionale — nodo "Prepara mancanti"
// =====================================================================
//
// PERCHÉ ESISTE (regola di Agostino, 17/08/2026).
//
// «Se nel gestionale ci sono transfer in più va bene, ma in meno no.»
// Le righe in più vengono da Orca e sono legittime. Le righe che stanno sul
// foglio struttura e non sul gestionale, no: quelle sono servizi che nessuno
// vedrà.
//
// COSA INSERISCE.
//
// Data, Time, Transfer > Da, Transfer < Per, Pax, Nome, Fornitori, Volo,
// Cell., Modalità, Note, Id. La scrittura è un appendOrUpdate sulla chiave
// Id: siccome quell'Id sul gestionale non c'è, la riga viene aggiunta.
//
// COSA NON INSERISCE, E PERCHÉ.
//
//   • Nessuna colonna di soldi: Tariffa, Fee, %, Netto, Acconto. Sul
//     gestionale sono formule, e comporle da qui vorrebbe dire inventare un
//     prezzo su una prenotazione vera. Restano da completare a mano, e la
//     nota della riga lo dice.
//   • Niente Autista e Veicolo: non si ereditano mai.
//
// QUATTRO RETI DI SICUREZZA.
//
//   1. `Allert` = «Non Inviare». Una riga appena comparsa non deve far
//      partire niente verso clienti, autisti o fornitori finché Agostino non
//      l'ha guardata. È lui a rimetterla su «Invia» quando è a posto.
//   2. Le righe di prova non entrano. Sui fogli struttura restano prenotazioni
//      finte («prova 1», «prova 2», tariffa 0, senza nome): inserirle
//      significherebbe sporcare il gestionale con servizi che non esistono.
//   3. Se il gestionale torna corto non si inserisce NIENTE. Dal 17/08 questo
//      ramo gira da solo ogni ora: se una lettura di Google restituisse una
//      manciata di righe invece di tutte, ogni transfer sembrerebbe mancante e
//      ne entrerebbero a valanga. Sotto TE_MIN_GESTIONALE righe ci si ferma e
//      basta: al giro dopo la lettura sarà di nuovo buona.
//   4. Il freno a mano sotto: più di TE_MAX_INSERIMENTI righe e non si scrive.
//
// RIPETERLO NON FA DANNO. La scrittura è un appendOrUpdate sulla chiave Id:
// appena la riga è entrata, quell'Id esiste, e al giro dopo non risulta più
// mancante. Nessun doppione anche se gira mille volte.
//
// Banco: banchi/te/banco-mancanti-doppioni.js.

var TE_MAX_INSERIMENTI = 15;

// Il gestionale ha più di mille righe. Se ne tornano meno di così, la lettura
// è andata storta: non è che mancano davvero.
var TE_MIN_GESTIONALE = 500;

function teS_(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
function teNorm_(v) {
  return teS_(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Una riga è finta? Si riconosce dal fatto che parla di sé: «prova», «test»,
 * nessun nome, tariffa zero. Serve che ne combacino due, non una sola:
 * «Prova d'Orlando» potrebbe essere un posto vero.
 */
function teEunaProva_(r) {
  var indizi = 0;
  var testo = teNorm_(r['TRS> DA']) + ' ' + teNorm_(r['TRS <PER']) + ' ' + teNorm_(r.Nome);
  if (/\b(prova|test)\b/.test(testo)) indizi++;
  if (!teS_(r.Nome)) indizi++;
  var t = teS_(r['Tariffa a noi']) || teS_(r.Tariffa);
  if (t === '0' || t === '0,00' || t === '') indizi++;
  if (!teS_(r['TRS <PER'])) indizi++;      // un transfer senza destinazione non esiste
  return indizi >= 2;
}

/**
 * Prepara le righe da aggiungere al gestionale.
 * Funzione pura: si prova offline.
 *
 * @param {Array<Object>} mancanti  come li produce il nodo Confronta
 * @param {Array<Object>} strutture righe complete di Strutture › Foglio1
 * @param {number} max
 * @param {number} righeGestionale quante righe ha restituito la lettura
 */
function tePreparaMancanti_(mancanti, strutture, max, righeGestionale) {
  var maxI = max || TE_MAX_INSERIMENTI;

  // (3) lettura corta: ci si ferma prima di guardare qualunque cosa
  if (typeof righeGestionale === 'number' && righeGestionale < TE_MIN_GESTIONALE) {
    return {
      righe: [], quante: 0, scartate: [], senzaOrigine: [], troppe: false,
      letturaCorta: true, righeGestionale: righeGestionale
    };
  }

  var perId = {};
  (strutture || []).forEach(function (s) {
    var id = teS_(s && s.Id).replace(/<[^>]*>/g, '').trim();
    if (id && !perId[id]) perId[id] = s;
  });

  var righe = [], scartate = [], senzaOrigine = [];

  (mancanti || []).forEach(function (m) {
    var s = perId[m.Id];
    if (!s) { senzaOrigine.push(m); return; }

    if (teEunaProva_(s)) {
      scartate.push({
        Id: m.Id, Data: m.Data, Da: teS_(s['TRS> DA']), Fornitore: teS_(s.Fornitore),
        motivo: 'riga di prova sul foglio struttura'
      });
      return;
    }

    var noteOrig = teS_(s.Note);
    righe.push({
      riga: {
        Id: m.Id,
        Data: teS_(s.Data),
        Time: teS_(s.Time),
        'Transfer > Da': teS_(s['TRS> DA']),
        'Transfer < Per': teS_(s['TRS <PER']),
        Pax: teS_(s.PAX),
        Nome: teS_(s.Nome),
        Fornitori: teS_(s.Fornitore),
        Volo: teS_(s.Volo),
        'Cell.': teS_(s['cell.']),
        'Modalità': teS_(s['Modalità']),
        // (1) niente esce da questa riga finché Agostino non la guarda
        Allert: 'Non Inviare',
        Note: '⚠️ Aggiunta dal controllo strutture: mancava sul gestionale. ' +
          'TARIFFA DA METTERE (sulla struttura: ' + (teS_(s['Tariffa a noi']) || '—') + ').' +
          (noteOrig ? ' · ' + noteOrig : '')
      },
      Nome: teS_(s.Nome), Fornitore: teS_(s.Fornitore),
      Data: teS_(s.Data), Ora: teS_(s.Time),
      Da: teS_(s['TRS> DA']), Per: teS_(s['TRS <PER']),
      Pax: teS_(s.PAX), tariffa: teS_(s['Tariffa a noi'])
    });
  });

  var troppe = righe.length > maxI;
  return {
    righe: troppe ? [] : righe,
    quante: righe.length,
    scartate: scartate,
    senzaOrigine: senzaOrigine,
    troppe: troppe,
    letturaCorta: false,
    righeGestionale: righeGestionale
  };
}

// ===== corpo del nodo n8n =====
var confronto = $('Confronta').first().json;
var strutture = $('Leggi Strutture').all().map(function (i) { return i.json; });
var quanteGestionale = $('Leggi Gestionale').all().length;

var esito = tePreparaMancanti_(confronto.mancanti, strutture, TE_MAX_INSERIMENTI, quanteGestionale);

// Una riga in uscita per ogni riga da aggiungere, e nient'altro dentro.
return esito.righe.map(function (x) { return { json: x.riga }; });
