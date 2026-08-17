// =====================================================================
// Transfer webhook (MJHTq5MksSeUhKgX) — nodo "Esito verifica gestionale"
// =====================================================================
//
// PERCHÉ ESISTE.
//
// Il nodo `gestionale` (appendOrUpdate, chiave Id) può dire `success`, durare
// più di un secondo, restituire la riga mappata — e non scrivere niente.
// Prova: 17/08, Christine (Covo dei Saraceni → Cozze, 9 pax, 10:30,
// TR-20260817-74b44b81-…). Esecuzione 747606, nodo `gestionale` alle
// 08:08:31.397, 1166 ms, `executionStatus: success`. Sul gestionale la riga
// non c'è. Al suo posto, la **1045 è vuota**: creata e mai riempita, fra la
// 1044 (scritta prima) e MULLINS KRISTINA alla 1046 (scritta 7 secondi dopo,
// e atterrata regolarmente).
// Due scritture ravvicinate che si pestano i piedi: la prima perde i valori,
// la seconda prende la riga successiva.
//
// COSA FA.
//
// Dopo la scrittura si rilegge il gestionale per Id e si decide:
//   'ok'       -> una riga sola con quell'Id: fatto.
//   'riprova'  -> nessuna riga: si riscrive e si riverifica.
//   'doppione' -> più righe con lo stesso Id: NON si tocca niente, si urla.
//                 Vorrebbe dire che un tentativo precedente era atterrato.
//   'grida'    -> finiti i tentativi e la riga ancora non c'è: si urla.
//
// Riprovare è innocuo perché la scrittura è appendOrUpdate sulla chiave Id:
// al secondo giro trova la riga e aggiorna invece di aggiungerne un'altra.
// Ma il caso 'doppione' resta come rete, perché quella è l'unica cosa peggiore
// di una riga persa.
//
// REGOLA: non si dichiara mai un salvataggio che non è avvenuto.

var TE_MAX_TENTATIVI = 4;

/**
 * Decide l'esito. Funzione pura: nessun accesso a n8n, si prova offline
 * (banco: banchi/te/banco-verifica.js).
 *
 * @param {string} idAtteso
 * @param {Array<Object>} righeLette  righe restituite dalla rilettura per Id
 * @param {number} tentativo          1 = primo giro
 * @param {number} max
 * @return {{esito: string, trovate: number, tentativo: number, motivo: string}}
 */
function teValutaVerifica_(idAtteso, righeLette, tentativo, max) {
  var id = (idAtteso === null || idAtteso === undefined ? '' : idAtteso).toString().trim();
  var maxT = max || TE_MAX_TENTATIVI;

  if (!id) {
    return {
      esito: 'grida', trovate: 0, tentativo: tentativo,
      motivo: 'Id vuoto: non posso verificare niente'
    };
  }

  // Il nodo Sheets con filtro può restituire un item vuoto {} quando non trova:
  // non è una riga, è un "non trovato".
  var trovate = (righeLette || []).filter(function (r) {
    return r && (r.Id === null || r.Id === undefined ? '' : r.Id).toString().trim() === id;
  }).length;

  if (trovate === 1) {
    return {
      esito: 'ok', trovate: 1, tentativo: tentativo,
      motivo: 'riga presente sul gestionale'
    };
  }

  if (trovate > 1) {
    return {
      esito: 'doppione', trovate: trovate, tentativo: tentativo,
      motivo: trovate + ' righe con lo stesso Id ' + id + ' — non tocco niente'
    };
  }

  if (tentativo >= maxT) {
    return {
      esito: 'grida', trovate: 0, tentativo: tentativo,
      motivo: 'riga ancora assente dopo ' + tentativo + ' tentativi'
    };
  }

  return {
    esito: 'riprova', trovate: 0, tentativo: tentativo,
    motivo: 'riga assente, riprovo (tentativo ' + tentativo + ' di ' + maxT + ')'
  };
}

/** Il messaggio da mandare quando si urla: deve bastare a rimediare a mano. */
function teMessaggioAllarme_(dati, esito) {
  var r = dati || {};
  return '🚨 *RIGA NON SCRITTA SUL GESTIONALE*\n\n' +
    (esito.esito === 'doppione' ? '⚠️ ' + esito.motivo : esito.motivo) + '\n\n' +
    '📅 ' + (r.Data || '-') + ' ⏰ ' + (r.Time || '-') + '\n' +
    '📍 ' + (r['TRS> DA'] || '-') + ' → ' + (r['TRS <PER'] || '-') + '\n' +
    '👤 ' + (r.Nome || '-') + ' (' + (r.PAX || '-') + ')\n' +
    '🏨 ' + (r.Fornitore || '-') + '\n' +
    '🚐 ' + (r.Autista || '—') + '\n' +
    '🔑 ' + (r.Id || '-') + '\n\n' +
    'Va messa a mano.';
}

// ===== corpo del nodo n8n =====
var atteso = $('Prepara dati gestionale').item.json;
var righe = $input.all().map(function (i) { return i.json; });
var tentativo = $runIndex + 1;

var esito = teValutaVerifica_(atteso.Id, righe, tentativo, TE_MAX_TENTATIVI);

return [{
  json: {
    ...atteso,
    verifica: esito,
    vaRiprovato: esito.esito === 'riprova',
    vaGridato: esito.esito === 'grida' || esito.esito === 'doppione',
    messaggioAllarme: (esito.esito === 'grida' || esito.esito === 'doppione')
      ? teMessaggioAllarme_(atteso, esito)
      : ''
  }
}];
