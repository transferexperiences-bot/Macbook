// =====================================================================
// SV · Controllo Strutture ↔ Gestionale — nodo "Prepara richieste"
// =====================================================================
//
// PERCHÉ ESISTE (Agostino, 17/08 sera).
//
// «Il messaggio arriva come se fosse un transfer della struttura, con la sola
//  possibilità di confermare o rifiutare la modifica. Lo stesso anche con
//  doppioni e righe da aggiungere, specificando di cosa si tratta: così
//  avremmo un approccio unico per tutti che passa dalla mia conferma.»
//
// Quindi: niente più scritture di testa nostra. Ogni cosa che il controllo
// trova diventa **una scheda su Telegram con due bottoni**, uguale nella forma
// a quelle dei transfer che arrivano dalle strutture. Si scrive sul gestionale
// solo dopo il ✅.
//
// TRE TIPI, UNA SOLA FORMA.
//
//   🔧 CORREZIONE  il gestionale dice una cosa diversa dalla struttura
//   👯 DOPPIONE    lo stesso Id su più righe del gestionale
//   ➕ MANCANTE    la riga c'è sulla struttura e non sul gestionale
//
// SI CHIEDE UNA VOLTA SOLA.
//
// Il controllo gira ogni ora: senza memoria, ogni giro rimanderebbe le stesse
// schede. La coda `Controllo risposte` tiene una riga per ogni cosa già
// chiesta, e qui si saltano quelle che ci sono già.
//
// La chiave della memoria è `tipo|Id|impronta`, dove l'impronta descrive **il
// problema di adesso**. Se domani la struttura cambia di nuovo quella riga,
// l'impronta cambia e la scheda riparte: un ❌ vale per quel problema lì, non
// per sempre su quel transfer.
//
// LA TARIFFA NON ENTRA MAI in una correzione: sul gestionale è una formula.
// Se l'unica differenza è la tariffa non si chiede niente — resta nel rapporto.
//
// Banco: banchi/te/banco-richieste.js.

var TE_MAX_SCHEDE = 12;   // per non svegliarsi con quaranta messaggi

// Gli stessi campi scrivibili del riallineamento: la tariffa non c'è.
var TE_SCRIVIBILI = {
  'Data': 'Data', 'Ora': 'Time', 'Partenza': 'Transfer > Da',
  'Arrivo': 'Transfer < Per', 'Pax': 'Pax', 'Nome': 'Nome', 'Fornitore': 'Fornitori'
};

function teS_(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }

/** Impronta corta e stabile del problema: se cambia, si richiede. */
function teImpronta_(testo) {
  var h = 5381;
  var s = String(testo || '');
  for (var i = 0; i < s.length; i++) { h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; }
  return h.toString(36);
}

/**
 * Da quello che ha trovato `Confronta` produce le schede da mandare.
 * Funzione pura: si prova offline.
 *
 * @param {Object} confronto        uscita del nodo Confronta
 * @param {Array<Object>} strutture righe complete di Strutture › Foglio1
 * @param {Array<Object>} risposte  righe della coda `Controllo risposte`
 * @param {number} max
 */
function tePreparaRichieste_(confronto, strutture, risposte, max) {
  var maxS = max || TE_MAX_SCHEDE;

  var perId = {};
  (strutture || []).forEach(function (s) {
    var id = teS_(s && s.Id).replace(/<[^>]*>/g, '').trim();
    if (id && !perId[id]) perId[id] = s;
  });

  var giaChiesto = {};
  (risposte || []).forEach(function (r) {
    var k = teS_(r && r.chiave);
    if (k) giaChiesto[k] = teS_(r.risposta) || 'in attesa';
  });

  var schede = [], saltate = 0;

  function aggiungi(tipo, id, impronta, testo, dettaglio) {
    var chiave = tipo + '|' + id + '|' + impronta;
    if (giaChiesto[chiave]) { saltate++; return; }
    schede.push({
      chiave: chiave, tipo: tipo, idtransfer: id,
      testo: testo, dettaglio: dettaglio
    });
  }

  function intestazione(s, id) {
    var r = s || {};
    return '📅 ' + (teS_(r.Data) || '—') + '  ⏰ ' + (teS_(r.Time) || '—') + '\n' +
      '📍 ' + (teS_(r['TRS> DA']) || '—') + ' → ' + (teS_(r['TRS <PER']) || '—') + '\n' +
      '👤 ' + (teS_(r.Nome) || '—') + ' (' + (teS_(r.PAX) || '—') + ')\n' +
      '🏨 ' + (teS_(r.Fornitore) || '—') + '\n' +
      '🔑 ' + id;
  }

  // ---------- 🔧 CORREZIONI ----------
  (confronto.discordanti || []).forEach(function (d) {
    var scrivibili = (d.differenze || []).filter(function (x) {
      return Object.prototype.hasOwnProperty.call(TE_SCRIVIBILI, x.campo);
    });
    if (!scrivibili.length) return;              // solo tariffa: non si chiede

    var righe = scrivibili.map(function (x) {
      return '❗️ ' + x.campo + ': gestionale «' + (x.gestionale || '—') +
        '» → struttura «' + (x.strutture || '—') + '»';
    });
    var s = perId[d.Id];
    var testo = '🔧 *CORREZIONE DA APPROVARE*\n\n' +
      intestazione(s, d.Id) + '\n\n' +
      'Il gestionale non combacia con il foglio struttura:\n' + righe.join('\n') +
      '\n\nComanda la struttura. Correggo?';
    aggiungi('C', d.Id, teImpronta_(righe.join('|')), testo, righe);
  });

  // ---------- 👯 DOPPIONI ----------
  (confronto.doppioni || []).forEach(function (p) {
    var s = perId[p.Id];
    var testo = '👯 *DOPPIONE SUL GESTIONALE*\n\n' +
      intestazione(s, p.Id) + '\n\n' +
      'Ci sono ' + p.quante + ' righe con questo stesso Id.\n' +
      'Metto un avviso nella nota così le ritrovi? *Non cancello niente.*';
    aggiungi('D', p.Id, teImpronta_('doppioni' + p.quante), testo, ['righe: ' + p.quante]);
  });

  // ---------- ➕ MANCANTI ----------
  (confronto.mancanti || []).forEach(function (m) {
    var s = perId[m.Id];
    if (!s) return;                              // senza l'originale non si inventa
    var testo = '➕ *RIGA MANCANTE SUL GESTIONALE*\n\n' +
      intestazione(s, m.Id) + '\n\n' +
      'C\'è sul foglio struttura e non sul gestionale.\n' +
      'La aggiungo? Entra con *Allert = Non Inviare* e *senza tariffa* ' +
      '(sulla struttura: ' + (teS_(s['Tariffa a noi']) || '—') + '), da mettere a mano.';
    aggiungi('M', m.Id, teImpronta_('mancante'), testo, []);
  });

  var troppe = schede.length > maxS;

  return {
    schede: troppe ? [] : schede,
    quante: schede.length,
    saltate: saltate,
    troppe: troppe
  };
}

// ===== corpo del nodo n8n =====
var confronto = $('Confronta').first().json;
var strutture = $('Leggi Strutture').all().map(function (i) { return i.json; });

var risposte = [];
try { risposte = $('Leggi risposte').all().map(function (i) { return i.json; }); } catch (e) { risposte = []; }

var adesso = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' })).toISOString();
var esito = tePreparaRichieste_(confronto, strutture, risposte, TE_MAX_SCHEDE);

// Una scheda per item. Se non c'è niente da chiedere non esce nessun item e i
// nodi dopo non partono: è il comportamento giusto.
return esito.schede.map(function (x) {
  return { json: {
    chiave: x.chiave, tipo: x.tipo, idtransfer: x.idtransfer,
    risposta: 'in attesa', quando: adesso, messageid: 0,
    testo: x.testo
  } };
});
