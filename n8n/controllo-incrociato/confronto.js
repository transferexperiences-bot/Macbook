// =====================================================================
// SV · Controllo incrociato Strutture ↔ Gestionale — nodo "Confronta"
// =====================================================================
//
// PERCHÉ ESISTE (regola di Agostino, 17/08/2026).
//
// «La verità assoluta è il foglio strutture, perché sul gestionale ci scrivo
// sopra io e può capitare di fare una modifica per sbaglio.»
//
// Prova che lo rende necessario: MULLINS KRISTINA, Id
// TR-20260817-c5e86a34-5443-4f51-881e-889ee79d94f5.
//   Strutture, riga 4413:  17/08/2026 · 17:30
//   Gestionale:            18/08/2026 · 01:00
// n8n l'aveva scritta giusta (esecuzione 747608 delle 08:08 UTC: il nodo
// `gestionale` ha mandato Data 17/08/2026, Time 17:30). Qualcosa l'ha spostata
// dopo. Nessuno se n'era accorto: il transfer risultava «non c'è», e invece
// c'era, parcheggiato all'una di notte del giorno dopo.
//
// COSA FA.
//
// Confronta per **Id** — mai per riga, mai per nome — le prenotazioni delle
// strutture (Strutture › Foglio1, l'aggregato di tutti e 18 i fogli) con quelle
// del gestionale, e produce tre elenchi:
//
//   🔴 DISCORDANTI  Id presente in tutti e due, ma con dati diversi.
//                   È il caso di MULLINS. Zero falsi allarmi possibili:
//                   se i due fogli dicono cose diverse, è un errore e basta.
//   🔴 DOPPIONI     stesso Id su più righe del gestionale.
//   🟠 MANCANTI     Id nelle strutture ma non sul gestionale. Attenzione:
//                   può essere legittimo (transfer mai confermato, o annullato),
//                   perciò è arancione e non rosso.
//
// Guarda solo i servizi **ancora da svolgere e non ancora passati**: conta la
// data E l'ora, confrontate con adesso (regola di Agostino, 17/08). Un transfer
// delle 11:00 alle sei di sera non serve piu' a nessuno, e segnalarlo o —
// peggio — inserirlo sul gestionale e' solo rumore su un servizio finito.
// Le righe senza ora si tengono per tutto il loro giorno: in dubbio si tiene.
//
// NON SCRIVE NIENTE. Legge e racconta. La correzione resta a mano: toccare il
// gestionale è zona rossa.
//
// Banco: banchi/te/banco-confronto.js (dati veri del 17/08).

var TE_CAMPI = [
  { nome: 'Data',      str: 'Data',           ges: 'Data',              tipo: 'data' },
  { nome: 'Ora',       str: 'Time',           ges: 'Time',              tipo: 'ora' },
  { nome: 'Partenza',  str: 'TRS> DA',        ges: 'Transfer > Da',     tipo: 'testo' },
  { nome: 'Arrivo',    str: 'TRS <PER',       ges: 'Transfer < Per',    tipo: 'testo' },
  { nome: 'Pax',       str: 'PAX',            ges: 'Pax',               tipo: 'numero' },
  { nome: 'Nome',      str: 'Nome',           ges: 'Nome',              tipo: 'testo' },
  { nome: 'Fornitore', str: 'Fornitore',      ges: 'Fornitori',         tipo: 'testo' },
  { nome: 'Tariffa',   str: 'Tariffa a noi',  ges: 'Tariffa',           tipo: 'soldi', avviso: true }
];

function teS_(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }

// Sui fogli capita di trovare Id incollati dentro tag HTML
// («<code>TR/07062026/…</code>»): è lo stesso Id, va ricondotto a sé stesso,
// altrimenti la riga risulta assente dal gestionale e si grida per niente.
function teId_(v) {
  return teS_(v).replace(/<[^>]*>/g, '').trim();
}

// Il confronto dei testi ignora spazi, accenti, maiuscole e punteggiatura:
// «TransferExperience» e «Transfer Experience» sono lo stesso fornitore, e
// segnalarli ogni ora sarebbe solo rumore che copre i guasti veri.
function teNorm_(v) {
  return teS_(v).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Sul gestionale la data è scritta a parole («mar 18 agosto 2026»), sulle
// strutture in numeri («17/08/2026»). Vanno ridotte alla stessa forma.
var TE_MESI = { gennaio:1,febbraio:2,marzo:3,aprile:4,maggio:5,giugno:6,luglio:7,agosto:8,
  settembre:9,ottobre:10,novembre:11,dicembre:12,gen:1,feb:2,mar:3,apr:4,mag:5,giu:6,
  lug:7,ago:8,set:9,ott:10,nov:11,dic:12 };

function teData_(v) {
  var s = teS_(v).toLowerCase();
  if (!s) return '';
  var m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) return teDue_(m[1]) + '/' + teDue_(m[2]) + '/' + m[3];
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return teDue_(m[3]) + '/' + teDue_(m[2]) + '/' + m[1];
  m = s.match(/(\d{1,2})\s+([a-zà-ÿ]+)\s+(\d{4})/);
  if (m && TE_MESI[m[2]]) return teDue_(m[1]) + '/' + teDue_(TE_MESI[m[2]]) + '/' + m[3];
  return '';
}
function teDue_(n) { return ('0' + String(n)).slice(-2); }

// Confrontabile solo se tutte e due le date si sono lasciate leggere: una data
// che non si capisce non è una discordanza, è un dato da guardare a mano.
function teOra_(v) {
  var s = teS_(v).replace(/[.,;]/g, ':').replace(/\s/g, '');
  var m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (m) { var h = Number(m[1]); if (h >= 0 && h <= 23) return teDue_(h) + ':' + m[2]; }
  m = /^(\d{1,2})$/.exec(s);
  if (m) { var h2 = Number(m[1]); if (h2 >= 0 && h2 <= 23) return teDue_(h2) + ':00'; }
  return '';
}

function teNum_(v) {
  var s = teS_(v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  if (!s) return null;
  var n = Number(s);
  return isNaN(n) ? null : n;
}

/** gg/mm/aaaa -> aaaammgg, per confrontare due giorni come stringhe. */
function teGiorno_(dataStr) {
  var a = (dataStr || '').split('/');
  return a.length === 3 ? (a[2] + a[1] + a[0]) : '';
}

/**
 * Il servizio deve ancora avvenire?
 * Si guarda data E ora contro adesso. Senza ora si dà per buono tutto il
 * giorno (23:59): meglio segnalare un servizio già passato che perderne uno.
 */
function teAncoraDaFare_(dataStr, oraStr, oggiStr, adessoStr) {
  var g = teGiorno_(dataStr), o = teGiorno_(oggiStr);
  if (!g || !o) return false;              // senza data non è un servizio da fare
  if (g > o) return true;                  // giorni futuri: sempre
  if (g < o) return false;                 // giorni passati: mai
  var ora = teOra_(oraStr) || '23:59';     // oggi: decide l'ora
  return ora > (adessoStr || '00:00');
}

/**
 * Il confronto. Funzione pura: si prova offline.
 *
 * @param {Array<Object>} strutture  righe di Strutture › Foglio1
 * @param {Array<Object>} gestionale righe del gestionale
 * @param {string} oggi              gg/mm/aaaa
 * @param {string} adesso            hh:mm dell'ora italiana
 */
function teConfronta_(strutture, gestionale, oggi, adesso) {
  var perId = {};
  var senzaData = 0;
  (gestionale || []).forEach(function (g) {
    var id = teId_(g && g.Id);
    if (!id) return;
    if (!perId[id]) perId[id] = [];
    perId[id].push(g);
  });

  var discordanti = [], doppioni = [], mancanti = [];
  var guardate = 0;

  (strutture || []).forEach(function (s) {
    if (!s) return;
    var id = teId_(s.Id);
    if (!id) return;                                       // mai partita: non è un guasto
    if (teNorm_(s.Eseguito) === 'svolto') return;          // già fatto, non ci interessa
    if (teNorm_(s.Stato) === 'cancellato') return;         // cancellato: non deve esserci
    var dataStr = teData_(s.Data);
    if (!dataStr) { senzaData++; return; }                 // data illeggibile: si conta, non si grida
    if (!teAncoraDaFare_(dataStr, s.Time, oggi, adesso)) return;   // già passato: non si tocca
    guardate++;

    var righe = perId[id] || [];

    if (righe.length === 0) {
      mancanti.push({
        Id: id, Data: dataStr, Ora: teOra_(s.Time),
        Da: teS_(s['TRS> DA']), Per: teS_(s['TRS <PER']),
        Nome: teS_(s.Nome), Pax: teS_(s.PAX), Fornitore: teS_(s.Fornitore),
        Stato: teS_(s.Stato)
      });
      return;
    }

    if (righe.length > 1) {
      doppioni.push({ Id: id, quante: righe.length, Nome: teS_(s.Nome), Data: dataStr });
      return;                                              // prima si toglie il doppione
    }

    var g = righe[0];
    var diffe = [];
    TE_CAMPI.forEach(function (c) {
      var a = s[c.str], b = g[c.ges];
      var va, vb;
      if (c.tipo === 'data')        { va = teData_(a); vb = teData_(b); }
      else if (c.tipo === 'ora')    { va = teOra_(a);  vb = teOra_(b); }
      else if (c.tipo === 'numero' || c.tipo === 'soldi') {
        var na = teNum_(a), nb = teNum_(b);
        if (na === null || nb === null) return;            // non confrontabile
        va = String(na); vb = String(nb);
      } else { va = teNorm_(a); vb = teNorm_(b); }
      // se uno dei due non si è lasciato leggere non si grida: si tace
      if (!va || !vb) return;
      if (va !== vb) {
        diffe.push({ campo: c.nome, strutture: teS_(a), gestionale: teS_(b), avviso: !!c.avviso });
      }
    });

    if (diffe.length) {
      discordanti.push({
        Id: id, Nome: teS_(s.Nome), Data: dataStr, Ora: teOra_(s.Time),
        Da: teS_(s['TRS> DA']), Per: teS_(s['TRS <PER']),
        Fornitore: teS_(s.Fornitore), differenze: diffe,
        // rosso solo se a cambiare è qualcosa che manda un autista nel posto sbagliato
        grave: diffe.some(function (d) { return !d.avviso; })
      });
    }
  });

  return {
    guardate: guardate,
    senzaData: senzaData,
    discordanti: discordanti,
    doppioni: doppioni,
    mancanti: mancanti,
    tutto_a_posto: !discordanti.length && !doppioni.length && !mancanti.length
  };
}

/** Il messaggio. Deve bastare a correggere a mano, senza aprire n8n. */
function teRapporto_(esito, oggi) {
  if (esito.tutto_a_posto) {
    return '✅ Strutture e gestionale coincidono — ' + esito.guardate + ' servizi ancora da svolgere controllati.';
  }
  var r = ['🔎 CONTROLLO STRUTTURE ↔ GESTIONALE',
    esito.guardate + ' servizi ancora da svolgere (dal ' + oggi + ' in poi, ora passata esclusa).', ''];

  if (esito.doppioni.length) {
    r.push('🔴 DOPPIONI SUL GESTIONALE (' + esito.doppioni.length + ')');
    esito.doppioni.forEach(function (d) {
      r.push('• ' + (d.Nome || '—') + ' · ' + d.Data + ' — ' + d.quante + ' righe con lo stesso Id');
      r.push('  ' + d.Id);
    });
    r.push('');
  }

  if (esito.discordanti.length) {
    r.push('🔴 DATI DIVERSI (' + esito.discordanti.length + ') — comanda la struttura');
    esito.discordanti.forEach(function (d) {
      r.push('• ' + (d.Nome || '—') + ' · ' + (d.Fornitore || '—') + ' · ' + d.Da + ' → ' + d.Per);
      d.differenze.forEach(function (x) {
        r.push('   ' + (x.avviso ? '⚠️' : '❗️') + ' ' + x.campo +
          ': struttura «' + (x.strutture || '—') + '» · gestionale «' + (x.gestionale || '—') + '»');
      });
      r.push('  ' + d.Id);
    });
    r.push('');
  }

  if (esito.mancanti.length) {
    r.push('🟠 NON TROVATI SUL GESTIONALE (' + esito.mancanti.length + ')');
    r.push('Può essere normale: transfer mai confermato o annullato.');
    esito.mancanti.forEach(function (m) {
      r.push('• ' + m.Data + ' ' + m.Ora + ' · ' + (m.Nome || '—') + ' · ' + m.Da + ' → ' + m.Per +
        ' · ' + (m.Fornitore || '—') + ' (' + (m.Stato || '—') + ')');
      r.push('  ' + m.Id);
    });
  }

  return r.join('\n');
}

/** Telegram si ferma a 4096 caratteri: meglio un rapporto tagliato che nessuno. */
function teTaglia_(testo, max) {
  if (testo.length <= max) return testo;
  return testo.slice(0, max) + '\n\n… elenco tagliato: apri il gestionale per il resto.';
}

// ===== corpo del nodo n8n =====
// Il nodo riceve le righe delle strutture; quelle del gestionale le prende dal
// nodo di lettura. Si confronta SEMPRE per Id.
var strutture = $('Leggi Strutture').all().map(function (i) { return i.json; });
var gestionale = $('Leggi Gestionale').all().map(function (i) { return i.json; });

var adesso = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
var oggi = teDue_(adesso.getDate()) + '/' + teDue_(adesso.getMonth() + 1) + '/' + adesso.getFullYear();
var oraAdesso = teDue_(adesso.getHours()) + ':' + teDue_(adesso.getMinutes());

var esito = teConfronta_(strutture, gestionale, oggi, oraAdesso);

return [{
  json: {
    oggi: oggi,
    oraAdesso: oraAdesso,
    ...esito,
    daAvvisare: !esito.tutto_a_posto,
    rapporto: teTaglia_(teRapporto_(esito, oggi), 3900)
  }
}];
