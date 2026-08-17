// =====================================================================
// SV · Correggi Gestionale da Strutture — nodo "Prepara correzioni"
// =====================================================================
//
// PERCHÉ ESISTE.
//
// Agostino, 17/08: «la verità assoluta è il foglio strutture». Il nodo
// `Confronta` trova le righe discordanti; questo prepara la scrittura che le
// riallinea, e SOLO quella.
//
// COSA SCRIVE, E COSA NON SCRIVE.
//
// Scrive: Data, Time, Transfer > Da, Transfer < Per, Pax, Nome, Fornitori.
// Solo i campi che risultano davvero diversi, e solo su quelle righe.
// L'aggancio è `Id`: la scrittura è un appendOrUpdate sulla chiave Id, mai per
// numero di riga.
//
// NON scrive MAI la Tariffa. Sul gestionale quella colonna è una formula
//   =SE(INDIRETTO("J"&RIF.RIGA())="";"";LET(r;RIF.RIGA();prezzoBase;…))
// e scriverci sopra un numero la distrugge per sempre. In più è un prezzo su
// una riga vera: zona rossa a parte. Le differenze di tariffa restano nel
// rapporto, da guardare a mano.
//
// NON tocca `Allert`, `Hide`, `Modalità`, `Autista`, `Veicolo`, le note, né
// nessun'altra colonna: quello che non è discordante non si tocca.
//
// FRENO A MANO.
//
// Se le righe da correggere superano TE_MAX_CORREZIONI il nodo non prepara
// niente e lo dice. Vuol dire che è cambiato qualcosa in grande — una colonna
// rinominata, un foglio letto storto — e in quel caso riallineare alla cieca
// farebbe più danno del guasto.
//
// Banco: banchi/te/banco-correzioni.js.

var TE_MAX_CORREZIONI = 30;

// I campi scrivibili, con il nome della colonna sul gestionale.
// «Tariffa» non è in questo elenco, ed è voluto.
var TE_SCRIVIBILI = {
  'Data': 'Data',
  'Ora': 'Time',
  'Partenza': 'Transfer > Da',
  'Arrivo': 'Transfer < Per',
  'Pax': 'Pax',
  'Nome': 'Nome',
  'Fornitore': 'Fornitori'
};

/**
 * Da un elenco di discordanze produce le righe da scrivere.
 * Funzione pura: si prova offline.
 *
 * @param {Array<Object>} discordanti  come li produce il nodo Confronta
 * @param {number} max
 */
function tePreparaCorrezioni_(discordanti, max) {
  var maxC = max || TE_MAX_CORREZIONI;
  var righe = [];
  var saltate = [];

  (discordanti || []).forEach(function (d) {
    var scrivibili = (d.differenze || []).filter(function (x) {
      return Object.prototype.hasOwnProperty.call(TE_SCRIVIBILI, x.campo);
    });
    var nonScrivibili = (d.differenze || []).filter(function (x) {
      return !Object.prototype.hasOwnProperty.call(TE_SCRIVIBILI, x.campo);
    });

    nonScrivibili.forEach(function (x) {
      saltate.push({
        Id: d.Id, Nome: d.Nome, campo: x.campo,
        strutture: x.strutture, gestionale: x.gestionale,
        motivo: x.campo === 'Tariffa'
          ? 'la Tariffa sul gestionale è una formula, e i prezzi si toccano a mano'
          : 'campo non scrivibile'
      });
    });

    if (!scrivibili.length) return;

    // La riga da scrivere porta l'Id (la chiave) e SOLO i campi da correggere.
    var riga = { Id: d.Id };
    scrivibili.forEach(function (x) {
      riga[TE_SCRIVIBILI[x.campo]] = x.strutture;
    });

    righe.push({
      riga: riga,
      Nome: d.Nome,
      Fornitore: d.Fornitore,
      campi: scrivibili.map(function (x) { return x.campo; }),
      dettaglio: scrivibili.map(function (x) {
        return x.campo + ': «' + (x.gestionale || '—') + '» → «' + (x.strutture || '—') + '»';
      })
    });
  });

  var troppe = righe.length > maxC;

  return {
    righe: troppe ? [] : righe,
    quante: righe.length,
    saltate: saltate,
    troppe: troppe,
    motivoStop: troppe
      ? 'Da correggere ' + righe.length + ' righe, oltre il limite di ' + maxC +
        '. Non scrivo niente: un numero così alto vuol dire che è cambiato qualcosa in grande, non che ci sono tanti errori.'
      : ''
  };
}

/** Il rapporto di quello che è stato scritto. */
function teRapportoCorrezioni_(esito) {
  if (esito.troppe) {
    return '⛔ CORREZIONE FERMATA\n' + esito.motivoStop;
  }
  var r = [];
  if (!esito.quante) {
    r.push('✅ Niente da correggere sul gestionale.');
  } else {
    r.push('✍️ GESTIONALE RIALLINEATO ALLE STRUTTURE (' + esito.quante + ' righe)');
    r.push('');
    esito.righe.forEach(function (x) {
      r.push('• ' + (x.Nome || '—') + ' · ' + (x.Fornitore || '—'));
      x.dettaglio.forEach(function (d) { r.push('   ' + d); });
      r.push('  ' + x.riga.Id);
    });
  }
  if (esito.saltate.length) {
    r.push('');
    r.push('⚠️ NON TOCCATI (' + esito.saltate.length + ') — da guardare a mano');
    esito.saltate.forEach(function (s) {
      r.push('• ' + (s.Nome || '—') + ' · ' + s.campo +
        ': struttura «' + (s.strutture || '—') + '» · gestionale «' + (s.gestionale || '—') + '»');
      r.push('   ' + s.motivo);
      r.push('  ' + s.Id);
    });
  }
  return r.join('\n');
}

// ===== corpo del nodo n8n =====
var esitoConfronto = $('Confronta').first().json;
var esito = tePreparaCorrezioni_(esitoConfronto.discordanti, TE_MAX_CORREZIONI);

// Una riga in uscita per ogni riga da scrivere: il nodo Sheets che segue
// aggiorna per Id, una alla volta. Se non c'è niente da scrivere non esce
// nessun item e il nodo Sheets non parte: è il comportamento giusto.
return esito.righe.map(function (x) {
  return {
    json: {
      ...x.riga,
      _nome: x.Nome,
      _campi: x.campi,
      _dettaglio: x.dettaglio,
      _rapporto: teRapportoCorrezioni_(esito),
      _quante: esito.quante,
      _saltate: esito.saltate,
      _troppe: esito.troppe
    }
  };
});
