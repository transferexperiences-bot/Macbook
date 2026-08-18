/**
 * TRANSFER EXPERIENCE — Planner Transfer (Web App) — v5
 * Backend Apps Script. Legge "Programma Autisti 2.0", calcola disponibilità
 * autisti/mezzi con la stessa logica di Turni v6 e scrive le assegnazioni.
 */

var CONFIG = {
  SPREADSHEET_ID: '1nqmt8_4Oy8paHlPU8LTBLEvl-quW0DYgTtmB73nBxPw',
  TAB_PREN: 'Prenotazioni NCC 3.0',
  TAB_AUTISTI: 'Autisti',
  TAB_VEICOLI: 'Veicoli',
  TAB_LUOGHI: 'Luoghi',
  TAB_RENT: 'Rent',
  TAB_CACHE: '_CacheTratte',
  TZ: 'Europe/Rome',
  FATTORE_TEMPO: 1.3,
  BUFFER_DEFAULT: 15,
  BUFFER_VICINI: 10,
  DURATA_FALLBACK: 50,
  BIAS_REGIONE: 'Puglia, Italia',
  BASE: 'Polignano a Mare, BA, Italia', // garage/base unica per i rientri
  GIORNI_SCOPERTI: 7,
  TAB_PRECALCOLO: '_Precalcolo', // scritto dal workflow n8n all'inserimento: Id, durata, coord, rientro
  BUDGET_MAPS_MS: 8000,   // usato solo dal trigger notturno
  BUDGET_MAPS_BATCH: 200,
  WEBHOOK_ONCHANGE: 'https://transfer.app.n8n.cloud/webhook/autista-onchange',
  CHIAMA_WEBHOOK: true,
  WEBHOOK_PROMEMORIA: 'https://transfer.app.n8n.cloud/webhook/8493d199-fcc6-425d-bce5-bf8c0a6c7292',
  TAB_LOG: '_Log'
};

function doGet() {
  // incorpora i dati di oggi SOLO se già pronti in cache (istantaneo);
  // se il server è freddo la pagina parte subito e i dati arrivano in sottofondo
  var t = HtmlService.createTemplateFromFile('Index');
  var boot = 'null';
  try {
    var today = Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd');
    var hit = CacheService.getScriptCache().get('plan_' + today + '_' + cacheVer_());
    if (hit) boot = hit.replace(/<\//g, '<\\/');
  } catch (e) { }
  t.boot = boot;
  return t.evaluate()
    .setTitle('TE Planner')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1');
}

/* ---------------- utilità ---------------- */

var MESI = {gennaio:0,febbraio:1,marzo:2,aprile:3,maggio:4,giugno:5,luglio:6,agosto:7,settembre:8,ottobre:9,novembre:10,dicembre:11};
var MESI_NOMI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
var GIORNI = ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'];
var GIORNI_ABBR = ['dom','lun','mar','mer','gio','ven','sab'];

function normDate(v) {
  if (v instanceof Date) return Utilities.formatDate(v, CONFIG.TZ, 'yyyy-MM-dd');
  var s = String(v || '').trim().toLowerCase();
  if (!s) return '';
  var m = s.match(/(\d{1,2})\s+([a-zà]+)\s+(\d{4})/);
  if (m && MESI[m[2]] !== undefined) {
    return m[3] + '-' + pad(MESI[m[2]] + 1) + '-' + pad(+m[1]);
  }
  m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return m[3] + '-' + pad(+m[2]) + '-' + pad(+m[1]);
  return '';
}
function pad(n) { return (n < 10 ? '0' : '') + n; }

// "2026-07-15" → "mer 15 luglio 2026" (formato del foglio)
function isoToItalian(iso) {
  var d = new Date(iso + 'T12:00:00');
  return GIORNI_ABBR[d.getDay()] + ' ' + d.getDate() + ' ' + MESI_NOMI[d.getMonth()] + ' ' + d.getFullYear();
}
function addDaysISO(iso, n) {
  var d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return Utilities.formatDate(d, CONFIG.TZ, 'yyyy-MM-dd');
}

function toMin(v) {
  if (v instanceof Date) return v.getHours() * 60 + v.getMinutes();
  var m = String(v || '').trim().match(/^(\d{1,2})[:.](\d{2})/);
  return m ? (+m[1]) * 60 + (+m[2]) : -1;
}

/* Converte un importo scritto in qualsiasi formato in numero.
   Riconosce il separatore decimale invece di eliminare sempre i punti:
   "150,50" → 150.5 · "150.50" → 150.5 · "1.234,50" → 1234.5 · "1,234.50" → 1234.5
   (la vecchia versione trasformava "150.5" in 1505: tariffe ×10) */
function parseEuro_(v) {
  if (typeof v === 'number') return isNaN(v) ? null : v;
  var s = String(v == null ? '' : v).trim();
  if (!s) return null;
  s = s.replace(/[^\d.,\-]/g, '');
  if (!s || s === '-') return null;
  var lastC = s.lastIndexOf(','), lastP = s.lastIndexOf('.');
  var dec = lastC > lastP ? ',' : (lastP > lastC ? '.' : '');
  if (dec) {
    var coda = s.length - s.lastIndexOf(dec) - 1;
    // 3 cifre dopo l'ultimo separatore e nessun altro separatore → è un separatore di migliaia
    if (coda === 3 && lastC !== lastP) dec = '';
    else if (coda === 3 && s.split(dec).length === 2) dec = '';
  }
  if (dec === ',') s = s.replace(/\./g, '').replace(',', '.');
  else if (dec === '.') s = s.replace(/,/g, '');
  else s = s.replace(/[.,]/g, '');
  var n = parseFloat(s);
  return isNaN(n) ? null : n;
}

var SS_ = null;
function ss_() {
  if (!SS_) SS_ = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  return SS_;
}
function sheet(name) {
  return ss_().getSheetByName(name);
}

/* cache dati giornata (30s) con invalidazione immediata a ogni scrittura */
function cacheVer_() {
  var c = CacheService.getScriptCache();
  var v = c.get('plan_ver');
  if (!v) { v = String(Date.now()); c.put('plan_ver', v, 21600); }
  return v;
}
function bumpVer_() {
  try {
    var c = CacheService.getScriptCache();
    c.put('plan_ver', String(Date.now()), 21600);
    // marca la scrittura come "fatta dalla app": serve a onNuovoTransfer per non
    // ricalcolare le catene a ogni assegnazione (il trigger Al cambio scatta anche
    // sulle scritture dello script stesso, e un salvataggio a lotti ne genera una per riga)
    c.put('app_write', String(Date.now()), 600);
  } catch (e) { }
}

function headerIndex(headers) {
  var idx = {};
  headers.forEach(function (h, i) { idx[String(h).trim().toLowerCase()] = i; });
  return idx;
}
function col(idx, names) {
  for (var i = 0; i < names.length; i++) {
    var k = names[i].toLowerCase();
    if (idx[k] !== undefined) return idx[k];
  }
  return -1;
}

function prenCols_(pi) {
  return {
    data: col(pi, ['data']), time: col(pi, ['time', 'ora', 'time/ora']),
    da: col(pi, ['transfer > da', 'trs> da', 'da']), per: col(pi, ['transfer < per', 'trs <per', 'per']),
    pax: col(pi, ['pax']), nome: col(pi, ['nome', 'nome/cliente', 'cliente']),
    forn: col(pi, ['fornitori', 'fornitore']), volo: col(pi, ['volo']),
    autista: col(pi, ['autista']), veicolo: col(pi, ['veicolo']),
    hextra: col(pi, ['h extra', 'h extra/ritardi']), note: col(pi, ['note']),
    id: col(pi, ['id']), stato: col(pi, ['stato']), tariffa: col(pi, ['tariffa']),
    allert: col(pi, ['allert']), cell: col(pi, ['cell.', 'cell', 'cellulare']),
    wa: col(pi, ['whatsapp']), modalita: col(pi, ['modalità', 'modalita']),
    acconto: col(pi, ['acconto'])
  };
}

/* ---------------- cache tratte ---------------- */

function cacheSheet_() {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sh = ss.getSheetByName(CONFIG.TAB_CACHE);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.TAB_CACHE);
    sh.appendRow(['chiave', 'minuti', 'km', 'aggiornato']);
    sh.hideSheet();
  }
  return sh;
}
function loadCache_() {
  var vals = cacheSheet_().getDataRange().getValues();
  var map = {};
  for (var i = 1; i < vals.length; i++) map[vals[i][0]] = { min: +vals[i][1], km: +vals[i][2] };
  return map;
}

/* tab _Precalcolo (riempito dal workflow n8n all'inserimento di un transfer):
   colonne attese — Id, durata_min, lat_da, lng_da, lat_per, lng_per, rientro_min */
function loadPrecalc_(luoghi) {
  var map = {};
  try {
    var sh = ss_().getSheetByName(CONFIG.TAB_PRECALCOLO);
    if (!sh) return map;
    var vals = sh.getDataRange().getValues();
    if (vals.length < 2) return map;
    var idx = headerIndex(vals[0]);
    var cId = col(idx, ['id']);
    var cDur = col(idx, ['durata_min', 'durata']);
    var cLatDa = col(idx, ['lat_da']); var cLngDa = col(idx, ['lng_da']);
    var cLatPe = col(idx, ['lat_per']); var cLngPe = col(idx, ['lng_per']);
    var cRi = col(idx, ['rientro_min', 'rientro']);
    for (var i = 1; i < vals.length; i++) {
      var id = String(vals[i][cId] || '').trim();
      if (!id) continue;
      var o = { durata: cDur >= 0 ? (+vals[i][cDur] || 0) : 0, rientro: cRi >= 0 ? (+vals[i][cRi] || 0) : 0 };
      if (cLatDa >= 0 && cLngDa >= 0 && !isNaN(+vals[i][cLatDa]) && +vals[i][cLatDa]) o.coordDa = [+vals[i][cLatDa], +vals[i][cLngDa]];
      if (cLatPe >= 0 && cLngPe >= 0 && !isNaN(+vals[i][cLatPe]) && +vals[i][cLatPe]) o.coordPer = [+vals[i][cLatPe], +vals[i][cLngPe]];
      map[id] = o;
    }
  } catch (e) { }
  return map;
}
function tratteKey_(a, b) {
  return ('v2|' + String(a).trim() + '|||' + String(b).trim()).toLowerCase();
}

var T_START = 0;        // inizio richiesta, per il budget Maps
var MAPS_CALLS = 0;     // chiamate fatte in questa richiesta
var ALLOW_MAPS = false; // Maps consentito SOLO al trigger notturno; a runtime mai (apertura veloce)

/* "Aeroporto di Bari" · "AEROPORTO BARI" · "Apt Bari - Arrivi" · "Aeroporto di Bari, Italia"
   sono lo STESSO posto. Il confronto era una uguaglianza esatta di stringhe, quindi un
   drop-off e un pickup nello stesso aeroporto scritti in modo diverso venivano trattati
   come due luoghi distinti e la app inventava un trasferimento.
   ATTENZIONE: qui la città NON va tolta, altrimenti Bari e Brindisi collassano. */
function normLuogo_(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/[.,;:'"()\/\-]/g, ' ')
    .replace(/\b(aeroporto( di)?|airport|apt|aereoporto)\b/g, 'apt')
    .replace(/\b(arrivi|partenze|arrivals|departures|terminal|gate|t1|t2)\b/g, ' ')
    .replace(/\b(italia|italy|ba|br|bt|le|ta|fg)\b/g, ' ')
    .replace(/[^a-z0-9à-ù ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function stessoLuogo_(a, b) {
  var na = normLuogo_(a), nb = normLuogo_(b);
  return !!na && na === nb;
}

function driveTime_(a, b, cache, luoghi, newRows) {
  a = String(a || '').trim(); b = String(b || '').trim();
  if (!a || !b) return { min: CONFIG.DURATA_FALLBACK, km: 30, src: 'fallback' };
  if (stessoLuogo_(a, b)) return { min: 0, km: 0, src: 'same' };
  var k = tratteKey_(a, b);
  if (cache[k]) return { min: cache[k].min, km: cache[k].km, src: 'cache' };

  var ca = lookupCoords_(a, luoghi), cb = lookupCoords_(b, luoghi);
  // stesse coordinate (o a meno di 300 m): è lo stesso punto, l'autista è già lì
  if (ca && cb && haversine_(ca, cb) < 0.3) return { min: 0, km: 0, src: 'same-coord' };
  var stimaKm = (ca && cb) ? haversine_(ca, cb) * 1.3 : null;

  // a runtime (chiamata dalla app) NON si chiama mai Google Maps: solo cache o stima istantanea.
  // le tratte precise le calcola il trigger notturno (ALLOW_MAPS=true).
  var scaduto = !ALLOW_MAPS || (T_START && (Date.now() - T_START > CONFIG.BUDGET_MAPS_MS)) || MAPS_CALLS >= CONFIG.BUDGET_MAPS_BATCH;
  if (scaduto) {
    if (stimaKm !== null) return { min: stimaMin_(stimaKm), km: Math.round(stimaKm * 10) / 10, src: 'stima-veloce' };
    return { min: CONFIG.DURATA_FALLBACK, km: 30, src: 'fallback' };
  }

  var orig = ca ? (ca[0] + ',' + ca[1]) : (a + ', ' + CONFIG.BIAS_REGIONE);
  var dest = cb ? (cb[0] + ',' + cb[1]) : (b + ', ' + CONFIG.BIAS_REGIONE);
  MAPS_CALLS++;

  try {
    var dir = Maps.newDirectionFinder()
      .setOrigin(orig).setDestination(dest)
      .setMode(Maps.DirectionFinder.Mode.DRIVING).getDirections();
    if (dir.routes && dir.routes.length) {
      var leg = dir.routes[0].legs[0];
      var r = { min: Math.round(leg.duration.value / 60), km: Math.round(leg.distance.value / 100) / 10 };
      if (stimaKm !== null && r.km > stimaKm * 3 + 25) {
        r = { min: stimaMin_(stimaKm), km: Math.round(stimaKm * 10) / 10 };
      }
      cache[k] = r; newRows.push([k, r.min, r.km, new Date()]);
      return { min: r.min, km: r.km, src: 'maps' };
    }
  } catch (e) { }

  if (stimaKm !== null) {
    var r2 = { min: stimaMin_(stimaKm), km: Math.round(stimaKm * 10) / 10 };
    cache[k] = r2; newRows.push([k, r2.min, r2.km, new Date()]);
    return { min: r2.min, km: r2.km, src: 'stima' };
  }
  return { min: CONFIG.DURATA_FALLBACK, km: 30, src: 'fallback' };
}

/* "Indisponibilità": accetta celle Data native, elenchi di date separati da virgole o spazi,
   e i formati 15/07 · 15-07 · 15/7/2026 · "15 luglio".
   La vecchia versione faceva indexOf('gg/mm') sulla stringa: se la cella conteneva una Data
   vera (String(Date) = "Wed Jul 15 2026…") l'autista risultava disponibile. */
function indisponibileIn_(cella, dateISO) {
  if (cella === '' || cella === null || cella === undefined) return false;
  if (cella instanceof Date) return Utilities.formatDate(cella, CONFIG.TZ, 'yyyy-MM-dd') === dateISO;
  var s = String(cella);
  var gg = +dateISO.slice(8, 10), mm = +dateISO.slice(5, 7), aaaa = dateISO.slice(0, 4);
  var re = /(\d{1,2})\s*[\/\-.]\s*(\d{1,2})(?:\s*[\/\-.]\s*(\d{2,4}))?/g, m;
  while ((m = re.exec(s)) !== null) {
    if (+m[1] !== gg || +m[2] !== mm) continue;
    if (!m[3]) return true;
    var y = m[3].length === 2 ? '20' + m[3] : m[3];
    if (y === aaaa) return true;
  }
  var mn = MESI_NOMI[mm - 1];
  if (mn && new RegExp('\\b' + gg + '\\s+' + mn + '\\b').test(s.toLowerCase())) return true;
  return false;
}

/* "Riposo fisso": accetta "dom", "domenica", "sab e dom", "sabato, domenica".
   La vecchia versione faceva weekday.indexOf(cella): una singola lettera nella cella
   escludeva l'autista per sbaglio, e un elenco di due giorni non veniva mai riconosciuto. */
function riposoIn_(cella, weekday) {
  var s = String(cella == null ? '' : cella).toLowerCase().trim();
  if (!s) return false;
  var parti = s.split(/[^a-zàèéìòù]+/);
  for (var i = 0; i < parti.length; i++) {
    var p = parti[i];
    if (p.length < 3) continue;
    if (weekday.indexOf(p) === 0) return true;
  }
  return false;
}

/* Minuti stimati da una distanza: il minimo fisso di 10 minuti faceva risultare
   irraggiungibili due servizi a poche centinaia di metri l'uno dall'altro. */
function stimaMin_(km) {
  if (!(km > 0)) return 0;
  var m = Math.round(km * 1.2);
  if (km < 1) return Math.max(2, m);
  if (km < 3) return Math.max(5, m);
  return Math.max(10, m);
}

function lookupCoords_(name, luoghi) {
  var n = name.toLowerCase();
  for (var i = 0; i < luoghi.length; i++) {
    var l = luoghi[i];
    if (n === l.nome || n.indexOf(l.nome) >= 0 || l.nome.indexOf(n) >= 0) return l.coords;
  }
  return null;
}
function haversine_(a, b) {
  var R = 6371, dLat = (b[0] - a[0]) * Math.PI / 180, dLon = (b[1] - a[1]) * Math.PI / 180;
  var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

/* ---------------- API: dati del giorno ---------------- */

function getPlanData(dateISO) {
  var tz = CONFIG.TZ;
  if (!T_START) T_START = Date.now();
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  if (!dateISO) dateISO = today;

  // cache 30s: i ricaricamenti dopo un salvataggio la saltano perché ogni scrittura fa bumpVer_()
  var cacheKey = 'plan_' + dateISO + '_' + cacheVer_();
  try {
    var hit = CacheService.getScriptCache().get(cacheKey);
    if (hit) {
      var cachedRes = JSON.parse(hit);
      cachedRes.nowMin = (dateISO === today) ? toMin(Utilities.formatDate(new Date(), tz, 'HH:mm')) : -1;
      return cachedRes;
    }
  } catch (e) { }

  var luoghi = [], luoghiNomi = [];
  try {
    var lv = sheet(CONFIG.TAB_LUOGHI).getDataRange().getValues();
    var li = headerIndex(lv[0]);
    var cNome = col(li, ['luoghi', 'luogo', 'nome']);
    var cCoord = col(li, ['lat,lon', 'coords', 'coordinate', 'lat,lng']);
    for (var i = 1; i < lv.length; i++) {
      var orig = String(lv[i][cNome] || '').trim();
      var nome = orig.toLowerCase();
      if (orig) luoghiNomi.push(orig);
      var cc = String(cCoord >= 0 ? lv[i][cCoord] : '').split(',');
      if (nome && cc.length === 2 && !isNaN(+cc[0]) && !isNaN(+cc[1]))
        luoghi.push({ nome: nome, coords: [+cc[0], +cc[1]] });
    }
  } catch (e) { }

  var fornitori = [];
  try {
    var fv = sheet('Fornitori e strutture').getDataRange().getValues();
    var fi = headerIndex(fv[0]);
    var cForn = col(fi, ['fornitori', 'fornitore', 'nome']);
    for (var f = 1; f < fv.length; f++) {
      var nf = String(fv[f][cForn] || '').trim();
      if (nf) fornitori.push(nf);
    }
  } catch (e) { }

  // tab di appoggio precalcolato dal workflow n8n: Id → {durata, coordDa, coordPer, rientro}
  var precalc = loadPrecalc_(luoghi);

  var pv = sheet(CONFIG.TAB_PREN).getDataRange().getValues();
  var pi = headerIndex(pv[0]);
  var C = prenCols_(pi);

  var cache = loadCache_(), newRows = [];
  var services = [];
  var limScoperti = addDaysISO(today, CONFIG.GIORNI_SCOPERTI);
  var scopertiMap = {};
  // coordinate della base: servono per stimare il rientro quando la tratta non è ancora in cache
  var baseCoords = lookupCoords_(CONFIG.BASE, luoghi);

  /* Minuti dal drop-off alla base (Polignano). precalcolaCatene() li salva già in
     _CacheTratte, ma finora non uscivano da getPlanData: la app non sapeva quando
     un mezzo torna davvero in garage. */
  function rientroDa_(per, pc) {
    if (!per) return 0;
    if (per.toLowerCase() === CONFIG.BASE.toLowerCase()) return 0;
    if (pc && pc.rientro > 0) return Math.round(pc.rientro);
    if (pc && pc.coordPer && baseCoords) {
      return Math.max(5, Math.round(haversine_(pc.coordPer, baseCoords) * 1.3 * 1.2));
    }
    return driveTime_(per, CONFIG.BASE, cache, luoghi, newRows).min;
  }

  for (var r = 1; r < pv.length; r++) {
    var row = pv[r];
    var dRow = normDate(row[C.data]);
    // conteggio giorni scoperti (da domani a +N)
    if (dRow && dRow > today && dRow <= limScoperti) {
      if (!scopertiMap[dRow]) scopertiMap[dRow] = { tot: 0, senzaAutista: 0, senzaMezzo: 0 };
      scopertiMap[dRow].tot++;
      if (!String(row[C.autista] || '').trim()) scopertiMap[dRow].senzaAutista++;
      if (!String(row[C.veicolo] || '').trim()) scopertiMap[dRow].senzaMezzo++;
    }
    if (dRow !== dateISO) continue;
    var idRow = String(row[C.id] || '').trim();
    var startMin = toMin(row[C.time]);
    var da = String(row[C.da] || '').trim(), per = String(row[C.per] || '').trim();
    var hExtra = parseFloat(String(row[C.hextra] || '').replace(',', '.')) || 0;
    // durata: prima dal tab _Precalcolo (scritto da n8n), poi cache/stima
    var pc = precalc[idRow];
    var durMin, durSrc;
    if (pc && pc.durata > 0) {
      durMin = Math.round(pc.durata) + Math.round(hExtra * 60);
      durSrc = 'precalc';
    } else {
      var t = driveTime_(da, per, cache, luoghi, newRows);
      durMin = Math.round(t.min * CONFIG.FATTORE_TEMPO) + Math.round(hExtra * 60);
      durSrc = t.src;
    }
    if (durMin < 15) durMin = 15;
    services.push({
      rowNum: r + 1,
      id: String(row[C.id] || ''),
      time: startMin >= 0 ? pad(Math.floor(startMin / 60)) + ':' + pad(startMin % 60) : String(row[C.time] || ''),
      startMin: startMin,
      da: da, per: per,
      pax: +row[C.pax] || 0,
      nome: String(row[C.nome] || ''),
      fornitore: String(row[C.forn] || ''),
      volo: String(row[C.volo] || ''),
      autista: String(row[C.autista] || '').trim(),
      veicolo: String(row[C.veicolo] || '').trim(),
      note: String(row[C.note] || ''),
      stato: String(C.stato >= 0 ? row[C.stato] : ''),
      allert: String(C.allert >= 0 ? row[C.allert] : ''),
      tariffa: String(C.tariffa >= 0 ? row[C.tariffa] : ''),
      cell: String(C.cell >= 0 ? row[C.cell] : '').trim(),
      wa: String(C.wa >= 0 ? row[C.wa] : '').trim(),
      hextra: String(C.hextra >= 0 ? row[C.hextra] : ''),
      modalita: String(C.modalita >= 0 ? row[C.modalita] : ''),
      acconto: String(C.acconto >= 0 ? row[C.acconto] : ''),
      durMin: durMin,
      endMin: startMin >= 0 ? startMin + durMin : -1,
      durSrc: durSrc,
      rientroMin: rientroDa_(per, pc)
    });
  }
  services.sort(function (a, b) { return a.startMin - b.startMin; });

  var transfers = {};
  for (var x = 0; x < services.length; x++) {
    for (var y = 0; y < services.length; y++) {
      if (x === y) continue;
      var A = services[x], B = services[y];
      if (A.endMin < 0 || B.startMin < 0 || A.endMin > B.startMin + 240) continue;
      var kk = A.id + '->' + B.id;
      var tt;
      // se ho le coordinate precalcolate (Per di A e Da di B), calcolo istantaneo in linea d'aria
      var cpA = precalc[A.id], cpB = precalc[B.id];
      if (cpA && cpA.coordPer && cpB && cpB.coordDa) {
        var kmAria = haversine_(cpA.coordPer, cpB.coordDa);
        var km = kmAria * 1.3;
        tt = (kmAria < 0.3)
          ? { min: 0, km: 0, src: 'precalc-same' }
          : { min: stimaMin_(km), km: Math.round(km * 10) / 10, src: 'precalc' };
      } else {
        tt = driveTime_(A.per, B.da, cache, luoghi, newRows);
      }
      var buffer = CONFIG.BUFFER_DEFAULT;
      if (stessoLuogo_(A.per, B.da) || tt.min === 0) buffer = 0;
      else if (tt.km < 5 || tt.min < 10) buffer = CONFIG.BUFFER_VICINI;
      transfers[kk] = { min: tt.min, buffer: buffer };
    }
  }

  if (newRows.length) {
    var cs = cacheSheet_();
    cs.getRange(cs.getLastRow() + 1, 1, newRows.length, 4).setValues(newRows);
  }

  // Autisti
  var av = sheet(CONFIG.TAB_AUTISTI).getDataRange().getValues();
  var ai = headerIndex(av[0]);
  var AC = {
    nome: col(ai, ['autisti', 'autista', 'nome']), cat: col(ai, ['categoria']),
    stato: col(ai, ['stato']), riposo: col(ai, ['riposo fisso']),
    indisp: col(ai, ['indisponibilità', 'indisponibilita']),
    pref: col(ai, ['preferenza']), cell: col(ai, ['cell', 'cell.', 'cellulare'])
  };
  var dObj = new Date(dateISO + 'T12:00:00');
  var weekday = GIORNI[dObj.getDay()];
  var ddmm = dateISO.slice(8, 10) + '/' + dateISO.slice(5, 7);
  var autisti = [];
  for (var j = 1; j < av.length; j++) {
    var nomeA = String(av[j][AC.nome] || '').trim();
    var catA = String(av[j][AC.cat] || '').trim();
    if (!nomeA || nomeA.toLowerCase().indexOf('categoria:') === 0) continue;
    var statoA = String(av[j][AC.stato] || '').trim();
    var riposo = AC.riposo >= 0 ? av[j][AC.riposo] : '';
    var indisp = AC.indisp >= 0 ? av[j][AC.indisp] : '';
    var motivo = '';
    if (statoA.toUpperCase() === 'OFF') motivo = 'Stato OFF';
    else if (indisponibileIn_(indisp, dateISO)) motivo = 'Indisponibile il ' + ddmm;
    else if (riposoIn_(riposo, weekday)) motivo = 'Riposo fisso (' + weekday + ')';
    autisti.push({
      nome: nomeA, categoria: catA, stato: statoA,
      pref: String(AC.pref >= 0 ? av[j][AC.pref] : ''),
      cell: String(AC.cell >= 0 ? av[j][AC.cell] : '').trim(),
      esclusoMotivo: motivo
    });
  }

  // Rent attivi nella data
  var rents = [];
  try {
    var rv = sheet(CONFIG.TAB_RENT).getDataRange().getValues();
    var ri = headerIndex(rv[0]);
    var RC = {
      data: col(ri, ['data']), nome: col(ri, ['nome']), veicolo: col(ri, ['veicolo']),
      forn: col(ri, ['fornitore']), prezzo: col(ri, ['€/giorno', 'euro/giorno', 'prezzo']),
      durata: col(ri, ['durata']), extra: col(ri, ['extra']), totale: col(ri, ['totale'])
    };
    for (var q1 = 1; q1 < rv.length; q1++) {
      var start = normDate(rv[q1][RC.data]);
      if (!start) continue;
      var dur = parseInt(rv[q1][RC.durata], 10) || 1;
      var end = addDaysISO(start, dur);
      if (start <= dateISO && dateISO < end) {
        rents.push({
          nome: String(rv[q1][RC.nome] || ''),
          veicolo: String(rv[q1][RC.veicolo] || '').trim(),
          fornitore: String(RC.forn >= 0 ? rv[q1][RC.forn] : ''),
          prezzo: String(RC.prezzo >= 0 ? rv[q1][RC.prezzo] : ''),
          durata: dur, inizio: start, fine: end,
          totale: String(RC.totale >= 0 ? rv[q1][RC.totale] : '')
        });
      }
    }
  } catch (e) { }

  // Veicoli
  var vv = sheet(CONFIG.TAB_VEICOLI).getDataRange().getValues();
  var vi = headerIndex(vv[0]);
  var VC = { nome: col(vi, ['veicoli', 'veicolo']), tipo: col(vi, ['mezzo', 'tipo']), pax: col(vi, ['pax', 'posti']), stato: col(vi, ['stato']) };
  var veicoli = [];
  for (var q = 1; q < vv.length; q++) {
    var nomeV = String(vv[q][VC.nome] || '').trim();
    if (!nomeV) continue;
    var statoV = String(vv[q][VC.stato] || '').trim().toUpperCase();
    veicoli.push({
      nome: nomeV, tipo: String(vv[q][VC.tipo] || ''),
      pax: +vv[q][VC.pax] || 0,
      fuoriServizio: (statoV === 'FUORI SERVIZIO' || statoV === 'OFF'),
      inRent: false,
      stato: statoV
    });
  }
  // Abbinamento noleggio → mezzo: prima corrispondenza esatta, poi contenimento
  // ma SOLO se univoco. Il vecchio indexOf incrociato marcava a noleggio anche
  // "Vito 2" quando era a noleggio "Vito" (e viceversa).
  function normMezzo_(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  rents.forEach(function (rr) {
    var target = normMezzo_(rr.veicolo);
    if (!target) return;
    var esatti = veicoli.filter(function (v) { return normMezzo_(v.nome) === target; });
    if (esatti.length) { esatti.forEach(function (v) { v.inRent = true; }); return; }
    var parziali = veicoli.filter(function (v) {
      var n = normMezzo_(v.nome);
      return n && (n.indexOf(target) >= 0 || target.indexOf(n) >= 0);
    });
    if (parziali.length === 1) parziali[0].inRent = true;
  });

  // giorni scoperti ordinati
  var prossimi = [];
  for (var dd = 1; dd <= CONFIG.GIORNI_SCOPERTI; dd++) {
    var dISO = addDaysISO(today, dd);
    var sc = scopertiMap[dISO];
    if (sc) prossimi.push({ date: dISO, tot: sc.tot, senzaAutista: sc.senzaAutista, senzaMezzo: sc.senzaMezzo });
  }

  var now = new Date();
  var risultato = {
    date: dateISO, today: today, weekday: weekday,
    nowMin: (dateISO === today) ? toMin(Utilities.formatDate(now, tz, 'HH:mm')) : -1,
    services: services, transfers: transfers, autisti: autisti, veicoli: veicoli,
    rents: rents, prossimi: prossimi,
    luoghiNomi: luoghiNomi, fornitori: fornitori,
    bufferDefault: CONFIG.BUFFER_DEFAULT,
    base: CONFIG.BASE
  };
  try {
    var json = JSON.stringify(risultato);
    if (json.length < 95000) CacheService.getScriptCache().put(cacheKey, json, 30);
  } catch (e) { }
  return risultato;
}

/* ---------------- log modifiche (tab nascosto _Log) ---------------- */

function log_(azione, id, dettaglio) {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sh = ss.getSheetByName(CONFIG.TAB_LOG);
    if (!sh) {
      sh = ss.insertSheet(CONFIG.TAB_LOG);
      sh.appendRow(['quando', 'azione', 'id servizio', 'dettaglio']);
      sh.hideSheet();
    }
    sh.appendRow([new Date(), azione, id, dettaglio]);
  } catch (e) { /* il log non deve mai bloccare l'operazione */ }
}

/* ---------------- API: ricerca ---------------- */

function searchServices(query) {
  var q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  var pv = sheet(CONFIG.TAB_PREN).getDataRange().getValues();
  var pi = headerIndex(pv[0]);
  var C = prenCols_(pi);
  var out = [];
  for (var r = 1; r < pv.length; r++) {
    var row = pv[r];
    var hay = [row[C.id], row[C.nome], row[C.da], row[C.per], row[C.forn], row[C.volo], row[C.cell], row[C.autista]]
      .map(function (v) { return String(v || '').toLowerCase(); }).join(' | ');
    if (hay.indexOf(q) < 0) continue;
    var dISO = normDate(row[C.data]);
    out.push({
      id: String(row[C.id] || ''), dateISO: dISO, dataTxt: String(row[C.data] || ''),
      time: String(row[C.time] || ''), da: String(row[C.da] || ''), per: String(row[C.per] || ''),
      nome: String(row[C.nome] || ''), fornitore: String(row[C.forn] || ''),
      autista: String(row[C.autista] || ''), veicolo: String(row[C.veicolo] || ''),
      pax: +row[C.pax] || 0
    });
  }
  // prima si raccoglie tutto e poi si ordina: tagliando a 25 durante la scansione
  // si restituivano le prime 25 righe del foglio, non le 25 più utili.
  var oggi = Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd');
  out.sort(function (a, b) {
    var da = a.dateISO || '', db = b.dateISO || '';
    var fa = (da && da >= oggi) ? 0 : 1, fb = (db && db >= oggi) ? 0 : 1;
    if (fa !== fb) return fa - fb;                    // prima i servizi da oggi in poi
    if (fa === 0) return da < db ? -1 : (da > db ? 1 : 0);  // futuri: dal più vicino
    return da > db ? -1 : (da < db ? 1 : 0);          // passati: dal più recente
  });
  return out.slice(0, 30);
}

/* ---------------- API: assegnazione (con anti-conflitto) ---------------- */

function assignService(id, autista, veicolo, prev, force) {
  if (!id) throw new Error('Id mancante');
  var sh = sheet(CONFIG.TAB_PREN);
  var pv = sh.getDataRange().getValues();
  var pi = headerIndex(pv[0]);
  var C = prenCols_(pi);
  for (var r = 1; r < pv.length; r++) {
    if (String(pv[r][C.id]).trim() === String(id).trim()) {
      var curAut = String(pv[r][C.autista] || '').trim();
      var curVei = String(pv[r][C.veicolo] || '').trim();
      // anti-conflitto: la riga è cambiata rispetto a quello che vedevi?
      if (!force && prev && (curAut !== String(prev.autista || '').trim() || curVei !== String(prev.veicolo || '').trim())) {
        return { conflict: true, autista: curAut, veicolo: curVei };
      }
      // valori effettivamente in riga dopo la scrittura (se un campo non è stato passato resta quello attuale)
      var newAut = (autista !== null && autista !== undefined) ? String(autista) : curAut;
      var newVei = (veicolo !== null && veicolo !== undefined) ? String(veicolo) : curVei;
      if (autista !== null && autista !== undefined) sh.getRange(r + 1, C.autista + 1).setValue(autista);
      if (veicolo !== null && veicolo !== undefined) sh.getRange(r + 1, C.veicolo + 1).setValue(veicolo);
      SpreadsheetApp.flush();
      bumpVer_();
      log_('assegnazione', id, 'autista: "' + curAut + '" → "' + (autista || '') + '" · veicolo: "' + curVei + '" → "' + (veicolo || '') + '"');
      var webhookEsito = 'non chiamato';
      if (CONFIG.CHIAMA_WEBHOOK) {
        try {
          var resp = UrlFetchApp.fetch(CONFIG.WEBHOOK_ONCHANGE, {
            method: 'post', contentType: 'application/json', muteHttpExceptions: true,
            payload: JSON.stringify({
              fornitore: String(pv[r][C.forn] || ''), id: String(id),
              veicolo: newVei, autista: newAut
            })
          });
          webhookEsito = 'HTTP ' + resp.getResponseCode();
        } catch (e) { webhookEsito = 'errore: ' + e.message; }
      }
      return { ok: true, row: r + 1, webhook: webhookEsito };
    }
  }
  throw new Error('Prenotazione con Id ' + id + ' non trovata');
}

/* ---------------- API: salvataggio batch (dashboard) ---------------- */

// mosse: [{id, autista, veicolo}]; allertVal opzionale (es. 'Recap') scritto su ogni riga toccata
function assignBatch(mosse, allertVal) {
  if (!mosse || !mosse.length) return { ok: true, n: 0 };
  var sh = sheet(CONFIG.TAB_PREN);
  var pv = sh.getDataRange().getValues();
  var pi = headerIndex(pv[0]);
  var C = prenCols_(pi);
  var byId = {};
  mosse.forEach(function (m) { byId[String(m.id).trim()] = m; });
  var fatte = 0, webhooks = [];
  for (var r = 1; r < pv.length; r++) {
    var id = String(pv[r][C.id] || '').trim();
    var m = byId[id];
    if (!m) continue;
    var curAut = String(pv[r][C.autista] || '').trim();
    var curVei = String(pv[r][C.veicolo] || '').trim();
    var nAut = (m.autista !== undefined && m.autista !== null) ? String(m.autista) : curAut;
    var nVei = (m.veicolo !== undefined && m.veicolo !== null) ? String(m.veicolo) : curVei;
    if (m.autista !== undefined && m.autista !== null) sh.getRange(r + 1, C.autista + 1).setValue(m.autista);
    if (m.veicolo !== undefined && m.veicolo !== null) sh.getRange(r + 1, C.veicolo + 1).setValue(m.veicolo);
    if (allertVal && C.allert >= 0) sh.getRange(r + 1, C.allert + 1).setValue(allertVal);
    log_('assegnazione batch', id, 'autista: "' + curAut + '" → "' + nAut + '" · veicolo: "' + curVei + '" → "' + nVei + '"' + (allertVal ? ' · allert → ' + allertVal : ''));
    webhooks.push({ fornitore: String(pv[r][C.forn] || ''), id: id, veicolo: nVei, autista: nAut });
    fatte++;
  }
  SpreadsheetApp.flush();
  bumpVer_();
  if (CONFIG.CHIAMA_WEBHOOK) {
    webhooks.forEach(function (p) {
      try {
        UrlFetchApp.fetch(CONFIG.WEBHOOK_ONCHANGE, { method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify(p) });
      } catch (e) { }
    });
  }
  return { ok: true, n: fatte };
}

/* ---------------- API: notifica immediata via webhook Promemoria ----------------
   tipo: 'Invia' | 'Modificato' | 'Cancellato' | 'Recap'
   Chiama direttamente il flusso "Promemoria Autisti 4" con delay 0: notifica istantanea.
   Per 'Cancellato' replica il soft delete ufficiale: Allert='Cancellato' + timestamp in Note. */

function notificaOra(id, tipo) {
  if (!id) throw new Error('Id mancante');
  var ammessi = ['Invia', 'Modificato', 'Cancellato', 'Recap'];
  if (ammessi.indexOf(tipo) < 0) throw new Error('Tipo notifica non valido: ' + tipo);
  var sh = sheet(CONFIG.TAB_PREN);
  var pv = sh.getDataRange().getValues();
  var pi = headerIndex(pv[0]);
  var C = prenCols_(pi);
  var r = -1;
  for (var i = 1; i < pv.length; i++) {
    if (String(pv[i][C.id]).trim() === String(id).trim()) { r = i; break; }
  }
  if (r < 0) throw new Error('Prenotazione con Id ' + id + ' non trovata');
  var row = pv[r];

  // soft delete: identico al ramo Telegram (Update Cancella)
  if (tipo === 'Cancellato') {
    if (C.allert >= 0) sh.getRange(r + 1, C.allert + 1).setValue('Cancellato');
    if (C.note >= 0) {
      var oldNote = String(row[C.note] || '').trim();
      var ts = Utilities.formatDate(new Date(), CONFIG.TZ, 'dd/MM/yyyy HH:mm');
      sh.getRange(r + 1, C.note + 1).setValue((oldNote ? oldNote + ' | ' : '') + 'Cancellazione ' + ts);
    }
    SpreadsheetApp.flush();
    bumpVer_();
  }

  var dv = row[C.data];
  var dataTxt = (dv instanceof Date) ? isoToItalian(normDate(dv)) : String(dv || '');
  var oraV = row[C.time];
  var oraTxt = (oraV instanceof Date) ? Utilities.formatDate(oraV, CONFIG.TZ, 'HH:mm') : String(oraV || '');

  var payload = {
    delay_seconds: 0,
    riga: r + 1,
    data: {
      id: String(row[C.id] || ''),
      allert: tipo,
      force: true, // azione manuale dalla app: scavalca il Gate Hide del flusso Promemoria
      data: dataTxt,
      ora: oraTxt,
      trs_da: String(row[C.da] || ''),
      trs_per: String(row[C.per] || ''),
      pax: row[C.pax] || '',
      nome: String(row[C.nome] || ''),
      fornitore: String(row[C.forn] || ''),
      volo: String(row[C.volo] || ''),
      cellulare: String(C.cell >= 0 ? row[C.cell] : ''),
      whatsapp: String(C.wa >= 0 ? row[C.wa] : ''),
      autista: String(row[C.autista] || ''),
      veicolo: String(row[C.veicolo] || ''),
      tariffa: String(C.tariffa >= 0 ? row[C.tariffa] : ''),
      modalita: String(C.modalita >= 0 ? row[C.modalita] : ''),
      note: String(row[C.note] || ''),
      svolto: false,
      ricalcola_celle: false
    }
  };
  var resp = UrlFetchApp.fetch(CONFIG.WEBHOOK_PROMEMORIA, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  var http = resp.getResponseCode();
  log_('notifica ' + tipo, id, 'webhook promemoria HTTP ' + http);
  return { ok: http < 300, http: http, tipo: tipo };
}

/* ---------------- API: allert / stato / modifica ---------------- */

function setAllert(id, valore) {
  if (!id) throw new Error('Id mancante');
  var ammessi = ['Invia', 'Modifica', 'Recap', 'Non Inviare'];
  if (ammessi.indexOf(valore) < 0) throw new Error('Valore allert non valido: ' + valore);
  return setCell_(id, ['allert'], valore, 'allert');
}

function setStato(id, valore) {
  if (!id) throw new Error('Id mancante');
  var ammessi = ['Eseguito', ''];
  if (ammessi.indexOf(valore) < 0) throw new Error('Valore stato non valido: ' + valore);
  return setCell_(id, ['stato'], valore, 'stato');
}

function setCell_(id, colNames, valore, label) {
  var sh = sheet(CONFIG.TAB_PREN);
  var pv = sh.getDataRange().getValues();
  var pi = headerIndex(pv[0]);
  var cId = col(pi, ['id']), cTgt = col(pi, colNames);
  if (cTgt < 0) throw new Error('Colonna ' + label + ' non trovata');
  for (var r = 1; r < pv.length; r++) {
    if (String(pv[r][cId]).trim() === String(id).trim()) {
      sh.getRange(r + 1, cTgt + 1).setValue(valore);
      SpreadsheetApp.flush();
      bumpVer_();
      log_(label, id, '→ "' + valore + '"');
      var out = { ok: true, row: r + 1 };
      out[label] = valore;
      return out;
    }
  }
  throw new Error('Prenotazione con Id ' + id + ' non trovata');
}

/**
 * Pre-riscalda la cache tratte per oggi e domani.
 * Da agganciare a un trigger notturno (icona orologio → Aggiungi trigger →
 * precalcolaDomani → basato sull'orario → giornaliero 04:00-05:00).
 */
/* ============================================================
   PRECALCOLO CATENE — trigger ORARIO (e notturno)
   Calcola con Google Maps, una volta sola e in modo definitivo:
   1) la DURATA di ogni servizio (Da→Per ×1,3)  → tempi di fine precisi
   2) le TRATTE drop-off→pickup tra i servizi dello stesso giorno → catene precise
   Tutto finisce nella cache _CacheTratte, che la app legge senza mai chiamare Maps.
   È idempotente: salta ciò che è già in cache, quindi può girare ogni ora.
   ============================================================ */
function precalcolaCatene() {
  ALLOW_MAPS = true;
  CONFIG.BUDGET_MAPS_MS = 280000; // ~4,5 min di lavoro per run
  T_START = Date.now(); MAPS_CALLS = 0;

  var luoghi = luoghiCoords_();
  var cache = loadCache_();
  var newRows = [];

  var pv = sheet(CONFIG.TAB_PREN).getDataRange().getValues();
  var pi = headerIndex(pv[0]);
  var C = prenCols_(pi);
  var oggi = Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd');
  var fine = addDaysISO(oggi, 4); // oggi + 4 giorni

  // raccogli i servizi della finestra, giorno per giorno
  var perGiorno = {};
  for (var r = 1; r < pv.length; r++) {
    var d = normDate(pv[r][C.data]);
    if (!d || d < oggi || d > fine) continue;
    var al = String(C.allert >= 0 ? pv[r][C.allert] : '');
    if (al.indexOf('Cancellato') >= 0) continue; // i cancellati non entrano nelle catene
    var da = String(pv[r][C.da] || '').trim(), per = String(pv[r][C.per] || '').trim();
    if (!da || !per) continue;
    if (!perGiorno[d]) perGiorno[d] = [];
    perGiorno[d].push({ da: da, per: per, startMin: toMin(pv[r][C.time]) });
  }

  var fatte = 0, saltate = 0;
  var giorni = Object.keys(perGiorno).sort();

  // 1) DURATE dei servizi (priorità assoluta: determinano i tempi di fine)
  giorni.forEach(function (g) {
    perGiorno[g].forEach(function (s) {
      var k = tratteKey_(s.da, s.per);
      if (cache[k]) { saltate++; return; }
      driveTime_(s.da, s.per, cache, luoghi, newRows);
      fatte++;
    });
  });

  // 2) TRATTE tra servizi (drop-off di A → pickup di B) per le coppie plausibili
  giorni.forEach(function (g) {
    var arr = perGiorno[g];
    for (var i = 0; i < arr.length; i++) {
      for (var j = 0; j < arr.length; j++) {
        if (i === j) continue;
        var A = arr[i], B = arr[j];
        if (A.startMin < 0 || B.startMin < 0) continue;
        if (B.startMin < A.startMin) continue;               // solo in avanti nel tempo
        if (B.startMin - A.startMin > 300) continue;          // oltre 5h non è una catena
        if (stessoLuogo_(A.per, B.da)) continue; // stesso luogo: 0 min
        var k2 = tratteKey_(A.per, B.da);
        if (cache[k2]) { saltate++; continue; }
        driveTime_(A.per, B.da, cache, luoghi, newRows);
        fatte++;
      }
    }
    // 3) rientri alla base (per sapere quando il mezzo è davvero libero a fine giornata)
    arr.forEach(function (s) {
      var kb = tratteKey_(s.per, CONFIG.BASE);
      if (!cache[kb]) { driveTime_(s.per, CONFIG.BASE, cache, luoghi, newRows); fatte++; }
    });
  });

  if (newRows.length) {
    var cs = cacheSheet_();
    cs.getRange(cs.getLastRow() + 1, 1, newRows.length, 4).setValues(newRows);
  }
  bumpVer_();
  ALLOW_MAPS = false;
  var msg = 'precalcolo: ' + fatte + ' tratte nuove, ' + saltate + ' già in cache, ' + MAPS_CALLS + ' chiamate Maps';
  log_('precalcolo catene', '-', msg);
  return msg;
}

// compatibilità col trigger già impostato
function precalcolaDomani() {
  return precalcolaCatene();
}

/* ============================================================
   CALCOLO IMMEDIATO ALL'INSERIMENTO
   Trigger installabile "Al cambio" (onChange) sul foglio Programma Autisti 2.0:
   appena entra o cambia un transfer, calcola SUBITO (pochi secondi) la sua durata,
   le tratte con gli altri servizi dello stesso giorno e il rientro alla base.
   Così i tempi sono precisi al minuto già al primo sguardo.
   ============================================================ */
function onNuovoTransfer(e) {
  // se la modifica arriva dalla app (assegnazione, allert, dettagli) non c'è nulla di nuovo
  // da calcolare: si evita di rileggere il foglio a ogni riga di un salvataggio a lotti
  try {
    var lastApp = CacheService.getScriptCache().get('app_write');
    if (lastApp && (Date.now() - (+lastApp)) < 20000) return;
  } catch (e2) { }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return; // un'altra istanza sta già lavorando
  try {
    ALLOW_MAPS = true;
    CONFIG.BUDGET_MAPS_MS = 100000; // fino a ~1,5 min: basta per un servizio e le sue coppie
    T_START = Date.now(); MAPS_CALLS = 0;

    var luoghi = luoghiCoords_();
    var cache = loadCache_();
    var newRows = [];

    var pv = sheet(CONFIG.TAB_PREN).getDataRange().getValues();
    var pi = headerIndex(pv[0]);
    var C = prenCols_(pi);
    var oggi = Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd');
    var fine = addDaysISO(oggi, 10);

    // servizi validi nella finestra, raggruppati per giorno
    var perGiorno = {};
    for (var r = 1; r < pv.length; r++) {
      var d = normDate(pv[r][C.data]);
      if (!d || d < oggi || d > fine) continue;
      if (String(C.allert >= 0 ? pv[r][C.allert] : '').indexOf('Cancellato') >= 0) continue;
      var da = String(pv[r][C.da] || '').trim(), per = String(pv[r][C.per] || '').trim();
      if (!da || !per) continue;
      if (!perGiorno[d]) perGiorno[d] = [];
      perGiorno[d].push({ da: da, per: per, startMin: toMin(pv[r][C.time]) });
    }

    // calcola SOLO ciò che manca, priorità alle durate
    var fatte = 0;
    Object.keys(perGiorno).forEach(function (g) {
      perGiorno[g].forEach(function (s) {
        if (!cache[tratteKey_(s.da, s.per)]) { driveTime_(s.da, s.per, cache, luoghi, newRows); fatte++; }
      });
    });
    Object.keys(perGiorno).forEach(function (g) {
      var arr = perGiorno[g];
      for (var i = 0; i < arr.length; i++) {
        for (var j = 0; j < arr.length; j++) {
          if (i === j) continue;
          var A = arr[i], B = arr[j];
          if (A.startMin < 0 || B.startMin < 0) continue;
          if (B.startMin < A.startMin || B.startMin - A.startMin > 300) continue;
          if (stessoLuogo_(A.per, B.da)) continue;
          if (!cache[tratteKey_(A.per, B.da)]) { driveTime_(A.per, B.da, cache, luoghi, newRows); fatte++; }
        }
      }
      arr.forEach(function (s) {
        if (!cache[tratteKey_(s.per, CONFIG.BASE)]) { driveTime_(s.per, CONFIG.BASE, cache, luoghi, newRows); fatte++; }
      });
    });

    if (newRows.length) {
      var cs = cacheSheet_();
      cs.getRange(cs.getLastRow() + 1, 1, newRows.length, 4).setValues(newRows);
    }
    bumpVer_();
    if (fatte) log_('precalcolo onChange', '-', fatte + ' tratte nuove, ' + MAPS_CALLS + ' chiamate Maps');
  } catch (err) {
    log_('errore precalcolo onChange', '-', String(err));
  } finally {
    ALLOW_MAPS = false;
    lock.releaseLock();
  }
}

/* ============================================================
   PULIZIA TAB LUOGHI — deduplica e normalizza (esegui a mano)
   Meno duplicati = Risolvi Luogo trova sempre in cache = non chiama più le Places API.
   Tiene la riga migliore per ogni luogo (quella con coordinate) e sposta i doppioni
   in un foglio di backup _LuoghiDuplicati prima di rimuoverli.
   ============================================================ */
function pulisciLuoghi() {
  var sh = sheet(CONFIG.TAB_LUOGHI);
  var vals = sh.getDataRange().getValues();
  if (vals.length < 2) return 'tab Luoghi vuoto';
  var head = vals[0];
  var idx = headerIndex(head);
  var cNome = col(idx, ['luoghi', 'luogo', 'nome']);
  var cCoord = col(idx, ['lat,lon', 'coords', 'coordinate', 'lat,lng']);
  if (cNome < 0) return 'colonna nome non trovata';

  // ATTENZIONE: la versione precedente cancellava il nome della città e il tipo di via.
  // "Aeroporto di Bari" e "Aeroporto di Brindisi" diventavano entrambi "apt" e uno dei due
  // veniva rimosso come duplicato, portandosi via le coordinate. Qui la città resta.
  function norm(s) {
    return String(s || '').toLowerCase().trim()
      .replace(/[.,;:'"]/g, ' ')
      .replace(/\b(aeroporto( di)?|airport|apt)\b/g, 'apt')
      .replace(/\bp\s*zza\b/g, 'piazza')
      .replace(/\bc\s*da\b/g, 'contrada')
      .replace(/\blocalita\b/g, 'località')
      .replace(/[^a-z0-9à-ù ]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function coordDi(row) {
    if (cCoord < 0) return null;
    var cc = String(row[cCoord] || '').split(',');
    if (cc.length !== 2 || isNaN(+cc[0]) || isNaN(+cc[1]) || +cc[0] === 0) return null;
    return [+cc[0], +cc[1]];
  }
  function haCoord(row) { return coordDi(row) !== null; }
  // due righe con lo stesso nome normalizzato ma coordinate lontane sono luoghi diversi
  function stessoPosto(a, b) {
    var ca = coordDi(a), cb = coordDi(b);
    if (!ca || !cb) return true;
    return haversine_(ca, cb) <= 0.5;
  }

  var best = {}, dupRows = [], keepRows = [];
  for (var i = 1; i < vals.length; i++) {
    var row = vals[i];
    var nome = String(row[cNome] || '').trim();
    if (!nome) { dupRows.push(row); continue; }
    var k = norm(nome);
    if (!k) { dupRows.push(row); continue; }
    // se il nome coincide ma le coordinate sono lontane, sono due luoghi diversi: tienili entrambi
    var sfx = 0;
    while (best[k] && !stessoPosto(best[k], row)) { sfx++; k = norm(nome) + ' #' + sfx; }
    if (!best[k]) { best[k] = row; continue; }
    // tiene la migliore: con coordinate, e a parità il nome più informativo
    var cur = best[k];
    var curOk = haCoord(cur), newOk = haCoord(row);
    var sostituisci = (!curOk && newOk) || (curOk === newOk && String(row[cNome]).length > String(cur[cNome]).length);
    if (sostituisci) { dupRows.push(cur); best[k] = row; }
    else dupRows.push(row);
  }
  Object.keys(best).forEach(function (k) { keepRows.push(best[k]); });
  keepRows.sort(function (a, b) { return String(a[cNome]).localeCompare(String(b[cNome])); });

  if (!dupRows.length) return 'nessun duplicato: ' + keepRows.length + ' luoghi';

  // backup dei doppioni
  var ss = ss_();
  var bk = ss.getSheetByName('_LuoghiDuplicati');
  if (!bk) { bk = ss.insertSheet('_LuoghiDuplicati'); bk.appendRow(head); bk.hideSheet(); }
  bk.getRange(bk.getLastRow() + 1, 1, dupRows.length, head.length).setValues(dupRows);

  // riscrive il tab pulito
  if (sh.getMaxRows() < keepRows.length + 1) sh.insertRowsAfter(sh.getMaxRows(), keepRows.length + 1 - sh.getMaxRows());
  if (sh.getMaxRows() > 1) sh.getRange(2, 1, sh.getMaxRows() - 1, head.length).clearContent();
  sh.getRange(2, 1, keepRows.length, head.length).setValues(keepRows);
  SpreadsheetApp.flush();
  bumpVer_();
  var msg = 'Luoghi puliti: ' + keepRows.length + ' tenuti, ' + dupRows.length + ' duplicati spostati in _LuoghiDuplicati';
  log_('pulizia luoghi', '-', msg);
  return msg;
}

// estrae le coordinate dal tab Luoghi (usata dal precalcolo)
function luoghiCoords_() {
  var out = [];
  try {
    var lv = sheet(CONFIG.TAB_LUOGHI).getDataRange().getValues();
    var li = headerIndex(lv[0]);
    var cNome = col(li, ['luoghi', 'luogo', 'nome']);
    var cCoord = col(li, ['lat,lon', 'coords', 'coordinate', 'lat,lng']);
    for (var i = 1; i < lv.length; i++) {
      var nome = String(lv[i][cNome] || '').trim().toLowerCase();
      var cc = String(cCoord >= 0 ? lv[i][cCoord] : '').split(',');
      if (nome && cc.length === 2 && !isNaN(+cc[0]) && !isNaN(+cc[1]))
        out.push({ nome: nome, coords: [+cc[0], +cc[1]] });
    }
  } catch (e) { }
  return out;
}

// mod = {dateISO, time, pax, note, da, per, volo, nome, fornitore, tariffa, cell} — solo i campi presenti vengono scritti
function updateService(id, mod) {
  if (!id) throw new Error('Id mancante');
  var sh = sheet(CONFIG.TAB_PREN);
  var pv = sh.getDataRange().getValues();
  var pi = headerIndex(pv[0]);
  var C = prenCols_(pi);
  function set(cIdx, val) { if (cIdx >= 0) sh.getRange(rTrovata + 1, cIdx + 1).setValue(val); }
  var rTrovata = -1;
  for (var r = 1; r < pv.length; r++) {
    if (String(pv[r][C.id]).trim() === String(id).trim()) { rTrovata = r; break; }
  }
  if (rTrovata < 0) throw new Error('Prenotazione con Id ' + id + ' non trovata');
  var rowNow = pv[rTrovata];
  // Data e Ora si riscrivono SOLO se cambiate davvero: la app rimanda sempre tutti i campi
  // e riscriverli a ogni salvataggio convertiva le celle Data/Ora native in testo.
  if (mod.dateISO && normDate(rowNow[C.data]) !== mod.dateISO) set(C.data, isoToItalian(mod.dateISO));
  if (mod.time && toMin(rowNow[C.time]) !== toMin(mod.time)) set(C.time, String(mod.time));
  if (mod.pax !== undefined && mod.pax !== null && mod.pax !== '') set(C.pax, +mod.pax);
  if (mod.note !== undefined && mod.note !== null) set(C.note, String(mod.note));
  if (mod.da !== undefined && mod.da !== null && mod.da !== '') set(C.da, String(mod.da));
  if (mod.per !== undefined && mod.per !== null && mod.per !== '') set(C.per, String(mod.per));
  if (mod.volo !== undefined && mod.volo !== null) set(C.volo, String(mod.volo));
  if (mod.nome !== undefined && mod.nome !== null) set(C.nome, String(mod.nome));
  if (mod.fornitore !== undefined && mod.fornitore !== null) set(C.forn, String(mod.fornitore));
  if (mod.cell !== undefined && mod.cell !== null) set(C.cell, String(mod.cell));
  if (mod.modalita !== undefined && mod.modalita !== null) set(C.modalita, String(mod.modalita));
  if (mod.hextra !== undefined && mod.hextra !== null) set(C.hextra, String(mod.hextra));
  if (mod.tariffa !== undefined && mod.tariffa !== null && String(mod.tariffa).trim() !== '') {
    var n = parseEuro_(mod.tariffa);
    if (n !== null && n !== parseEuro_(rowNow[C.tariffa])) set(C.tariffa, n);
  }
  if (mod.acconto !== undefined && mod.acconto !== null && String(mod.acconto).trim() !== '') {
    var na = parseEuro_(mod.acconto);
    if (na !== null && na !== parseEuro_(rowNow[C.acconto])) set(C.acconto, na);
  }
  SpreadsheetApp.flush();
  bumpVer_();
  log_('modifica dettagli', id, JSON.stringify(mod));
  return { ok: true, row: rTrovata + 1 };
}
