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

// TUTTI i campi che esistono su tutti e due i fogli (Agostino, 20/08: «tutti,
// assolutamente»). Prima erano otto: si guardavano data, ora, luoghi, pax, nome,
// fornitore e tariffa, e tutto il resto poteva cambiare senza che nessuno lo
// sapesse — comprese le note, dove le strutture scrivono le cose che contano
// («bambino 2 anni, seggiolino»).
//
// `grave: true` = rosso, è un errore e basta: manda un autista nel posto
// sbagliato, all'ora sbagliata, a prendere la persona sbagliata.
// Tutto il resto è arancione: va guardato, ma non è detto che sia un guasto.
//
// I campi che stanno su un foglio solo non si possono confrontare, e infatti non
// sono qui: Mese, Tipologia incasso, n. pratica, Addebitato, Stato, Eseguito,
// Cell. driver, Assigned Car (strutture); Allert, Hide, Acconto, %, Stato %,
// Sub-appalti, Netto, Show, WhatsApp, Conto (gestionale).
var TE_CAMPI = [
  { nome: 'Data',      str: 'Data',            ges: 'Data',           tipo: 'data',  grave: true },
  { nome: 'Ora',       str: 'Time',            ges: 'Time',           tipo: 'ora',   grave: true },
  { nome: 'Partenza',  str: 'TRS> DA',         ges: 'Transfer > Da',  tipo: 'testo', grave: true },
  { nome: 'Arrivo',    str: 'TRS <PER',        ges: 'Transfer < Per', tipo: 'testo', grave: true },
  { nome: 'Pax',       str: 'PAX',             ges: 'Pax',            tipo: 'numero',grave: true },
  { nome: 'Nome',      str: 'Nome',            ges: 'Nome',           tipo: 'testo', grave: true },
  { nome: 'Fornitore', str: 'Fornitore',       ges: 'Fornitori',      tipo: 'testo', grave: true },
  { nome: 'Tariffa',   str: 'Tariffa a noi',   ges: 'Tariffa',        tipo: 'soldi' },
  // --- aggiunti il 20/08 ---
  { nome: 'Note',      str: 'Note',            ges: 'Note',           tipo: 'nota' },
  { nome: 'Volo',      str: 'Volo',            ges: 'Volo',           tipo: 'testo' },
  { nome: 'Telefono',  str: 'cell.',           ges: 'Cell.',          tipo: 'telefono' },
  // ⛔ Autista e Veicolo NON si confrontano (Agostino, 20/08: «sui fogli struttura
  // non vengono mai compilati, non ti puoi basare su quelli»). Sulle righe vere sono
  // compilati sul 16% e sul 24%, e quando ci sono li ha scritti n8n: un disallineamento
  // lì dice che è cambiato l'autista dopo, non che c'è un errore.
  // Riaccenderli costa due righe, e oggi non produrrebbero nemmeno una segnalazione.
  // { nome: 'Autista',   str: 'Autista',         ges: 'Autista',        tipo: 'testo' },
  // { nome: 'Veicolo',   str: 'Veicolo',         ges: 'Veicolo',        tipo: 'testo' },
  { nome: 'Ore extra', str: 'h extra/ritardi', ges: 'h extra',        tipo: 'testo' },
  // Sul gestionale la fee è scritta col meno davanti (−24), sulle strutture no (24):
  // è la stessa cifra vista da due parti. Si confronta il valore assoluto, altrimenti
  // ogni riga con una commissione risulterebbe discordante — sulle righe vere erano 76.
  { nome: 'Fee',       str: 'Fee',             ges: 'Fee',            tipo: 'soldi-assoluto',
    zeroVuoto: true },
  { nome: 'Modalità',  str: 'Modalità',        ges: 'Modalità',       tipo: 'testo' }
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

// I telefoni si scrivono in dieci modi: +39, 0039, con gli spazi, senza. Conta
// il numero, non come è scritto: si confrontano le ultime nove cifre.
function teTel_(v) {
  var t = teS_(v);
  // I telefoni salvati come numero tornano in notazione scientifica («4.178E10»):
  // vanno riportati in cifre, altrimenti sono tutti diversi da tutto.
  if (/e\+?\d+$/i.test(t.replace(/\s/g, ''))) {
    var n = Number(t.replace(/\s/g, ''));
    if (!isNaN(n)) t = n.toFixed(0);
  }
  var d = t.replace(/\D/g, '');
  if (d.length < 6) return '';
  return d.slice(-9);
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
      else if (c.tipo === 'telefono') { va = teTel_(a); vb = teTel_(b); }
      else if (c.tipo === 'nota')   {
        // Le note sono testo libero: confrontarle parola per parola vorrebbe dire
        // una segnalazione ogni volta che si aggiusta una virgola, e in due giorni
        // non le leggerebbe più nessuno. Si segnala una cosa sola, ma quella conta:
        // sulla struttura c'è scritto qualcosa che sul gestionale non c'è.
        var na2 = teNorm_(a);
        if (!na2) return;                                  // la struttura non ha scritto niente
        if (teNorm_(b).indexOf(na2) !== -1) return;        // c'è già, magari con altro intorno
        diffe.push({ campo: c.nome, strutture: teS_(a), gestionale: teS_(b) || '(vuota)',
                     avviso: true });
        return;
      }
      else if (c.tipo === 'numero' || c.tipo === 'soldi' || c.tipo === 'soldi-assoluto') {
        var na = teNum_(a), nb = teNum_(b);
        if (na === null || nb === null) return;            // non confrontabile
        if (c.tipo === 'soldi-assoluto') { na = Math.abs(na); nb = Math.abs(nb); }
        // Sulla Fee lo zero vuol dire «non calcolata», non «zero euro»: su un foglio
        // c'è e sull'altro no, e non è una discordanza. Sulle righe vere erano 32.
        if (c.zeroVuoto && (na === 0 || nb === 0)) return;
        va = String(na); vb = String(nb);
      } else { va = teNorm_(a); vb = teNorm_(b); }

      // Sui campi aggiunti il 20/08, uno che contiene l'altro non è una discordanza:
      // il gestionale scrive «Sprinter GZ204TT» dove la struttura scrive «Sprinter»,
      // ed è la stessa cosa detta con più precisione. Sui sette campi rossi invece il
      // confronto resta stretto com'era: lì una parola in più può essere un errore.
      if (!c.grave && va && vb && (va.indexOf(vb) !== -1 || vb.indexOf(va) !== -1)) return;
      // se uno dei due non si è lasciato leggere non si grida: si tace
      if (!va || !vb) return;
      if (va !== vb) {
        diffe.push({ campo: c.nome, strutture: teS_(a), gestionale: teS_(b), avviso: !c.grave });
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

// =====================================================================
// SOLO LE COSE NUOVE  (21/08/2026)
// =====================================================================
//
// PERCHÉ. Agostino: «non voglio che mandi più questo». Il rapporto usciva ogni
// ora uguale a sé stesso — le stesse note, gli stessi doppioni, le stesse righe
// di prova — e Telegram lo tagliava pure a metà. Un avviso che si ripete uguale
// non è un avviso: è rumore, e dopo due giorni non lo legge più nessuno.
//
// COSA CAMBIA. Si manda solo quello che non era già stato detto, e nel corpo
// vanno solo le 🔴. Le arancioni (note, tariffe) diventano un conteggio in fondo.
// Se non c'è niente di nuovo, non si manda niente.
//
// LA MEMORIA. `$getWorkflowStaticData('global')` di n8n: sopravvive fra
// un'esecuzione e l'altra. Chiave = Id + campo + i due valori: se il valore
// cambia, è una cosa nuova e si torna a dirla.
//
// UNA COSA ROSSA CHE RESTA SBAGLIATA SI RIPETE UNA VOLTA AL GIORNO. Tacere per
// sempre su un orario sbagliato sarebbe peggio del rumore.

var TE_RICORDA_MS      = 7 * 24 * 3600 * 1000;   // dopo una settimana si dimentica
var TE_RIPETI_GRAVE_MS = 24 * 3600 * 1000;       // le rosse tornano una volta al giorno

function teChiaveDiff_(id, d) {
  return 'D|' + id + '|' + d.campo + '|' + teNorm_(d.strutture) + '|' + teNorm_(d.gestionale);
}

/**
 * Toglie quello che era già stato detto e mette le arancioni da parte.
 * Funzione pura: la memoria entra ed esce come parametro, così si prova offline.
 *
 * @param {Object} esito    quello che torna da teConfronta_
 * @param {Object} memoria  { chiave: quando } — viene aggiornata
 * @param {number} adesso   Date.now()
 */
function teSoloNuove_(esito, memoria, adesso) {
  memoria = memoria || {};
  adesso = adesso || Date.now();

  function giaDetta(chiave, scadenza) {
    var quando = memoria[chiave];
    if (quando && (adesso - quando) < scadenza) return true;
    memoria[chiave] = adesso;
    return false;
  }

  var discordanti = [], minori = 0;
  (esito.discordanti || []).forEach(function (r) {
    var gravi = [];
    (r.differenze || []).forEach(function (d) {
      var chiave = teChiaveDiff_(r.Id, d);
      if (d.avviso) {
        // arancione: si conta una volta sola, poi silenzio per una settimana
        if (!giaDetta(chiave, TE_RICORDA_MS)) minori++;
        return;
      }
      if (!giaDetta(chiave, TE_RIPETI_GRAVE_MS)) gravi.push(d);
    });
    if (gravi.length) {
      var copia = {};
      for (var k in r) copia[k] = r[k];
      copia.differenze = gravi;
      copia.grave = true;
      discordanti.push(copia);
    }
  });

  var visti = {};
  var doppioni = (esito.doppioni || []).filter(function (d) {
    if (visti[d.Id]) return false;                 // lo stesso Id su due righe struttura
    visti[d.Id] = true;
    return !giaDetta('X|' + d.Id + '|' + d.quante, TE_RIPETI_GRAVE_MS);
  });

  var mancanti = (esito.mancanti || []).filter(function (m) {
    return !giaDetta('M|' + m.Id, TE_RICORDA_MS);
  });

  // Pulizia: quello che non si rivede da una settimana esce di memoria.
  for (var c in memoria) {
    if ((adesso - memoria[c]) > TE_RICORDA_MS) delete memoria[c];
  }

  var niente = !discordanti.length && !doppioni.length && !mancanti.length;
  return {
    guardate: esito.guardate,
    senzaData: esito.senzaData,
    discordanti: discordanti,
    doppioni: doppioni,
    mancanti: mancanti,
    minori: minori,
    tutto_a_posto: niente,
    // Le minori da sole non fanno partire un messaggio: si contano e basta.
    daAvvisare: !niente
  };
}

/** Le note lunghe non devono mangiarsi il messaggio. */
function teCorto_(v, max) {
  var t = teS_(v);
  if (t.length <= max) return t;
  return t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
}

/** Il messaggio. Deve bastare a correggere a mano, senza aprire n8n. */
function teRapporto_(esito, oggi) {
  if (esito.tutto_a_posto) {
    return '✅ Niente di nuovo — ' + esito.guardate + ' servizi ancora da svolgere controllati.';
  }
  var quante = esito.discordanti.length + esito.doppioni.length + esito.mancanti.length;
  var r = ['🔎 CONTROLLO — ' + quante + (quante === 1 ? ' cosa nuova' : ' cose nuove'), ''];

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
      r.push('• ' + (d.Nome || '—') + ' · ' + (d.Fornitore || '—') + ' · ' +
        teCorto_(d.Da, 28) + ' → ' + teCorto_(d.Per, 28));
      d.differenze.forEach(function (x) {
        r.push('   ❗️ ' + x.campo + ': struttura «' + teCorto_(x.strutture, 60) +
          '» · gestionale «' + teCorto_(x.gestionale, 60) + '»');
      });
      r.push('  ' + d.Id);
    });
    r.push('');
  }

  if (esito.mancanti.length) {
    r.push('🟠 NON TROVATI SUL GESTIONALE (' + esito.mancanti.length + ')');
    r.push('Può essere normale: transfer mai confermato o annullato.');
    esito.mancanti.forEach(function (m) {
      r.push('• ' + m.Data + ' ' + m.Ora + ' · ' + (m.Nome || '—') + ' · ' +
        teCorto_(m.Da, 24) + ' → ' + teCorto_(m.Per, 24) + ' · ' + (m.Fornitore || '—'));
      r.push('  ' + m.Id);
    });
    r.push('');
  }

  if (esito.minori) {
    r.push('+ ' + esito.minori + (esito.minori === 1 ? ' differenza minore' : ' differenze minori') +
      ' (note, tariffe): non le elenco.');
  }

  return r.join('\n').replace(/\n+$/, '');
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

var tutto = teConfronta_(strutture, gestionale, oggi, oraAdesso);

// La memoria di quello che è già stato detto. Vive dentro n8n e sopravvive fra
// un'esecuzione e l'altra: senza, il rapporto tornerebbe a ripetersi ogni ora.
var statica = $getWorkflowStaticData('global');
if (!statica.viste) statica.viste = {};
var esito = teSoloNuove_(tutto, statica.viste, Date.now());

return [{
  json: {
    oggi: oggi,
    oraAdesso: oraAdesso,
    ...esito,
    guardateInTutto: tutto.guardate,
    discordantiInTutto: tutto.discordanti.length,
    rapporto: teTaglia_(teRapporto_(esito, oggi), 3900)
  }
}];
