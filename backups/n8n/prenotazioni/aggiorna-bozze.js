// BOZZE LEDGER v7 — 21/08/2026 (v6: stessa sera, v5: 18/08, v4: 14/08, v3: 07/08)
// Perché v7: Agostino, 21/08 — «com'è possibile che per ogni nuovo transfer salvato mi
// rimanda anche i vecchi». Perché una scheda salvata SPARIVA dal registro, e con lei la
// memoria che era già sul gestionale: l'agente la ristampava e il payload la rimandava.
// Ora ogni scheda ha uno stato — bozza · spedita · salvata — scritto solo dal codice, e le
// salvate restano dentro il TTL. Vedi la sezione 1 e la sezione 3.
//
// Perché v6: il 21/08 alle 19:14 (esecuzione 781233) tre transfer sono stati spediti a
// Parse transfer e la ricevuta ne ha riportato UNO. La v5 li ha tolti dal registro tutti
// e tre — «spedito» valeva quanto «ricevuto» — e due transfer di quella sera sono rimasti
// fuori da tutte e due le parti. Vedi la sezione 3, punto 2b.
//
// Perché v5: il 18/08 alle 23:21 (esecuzione 760661) Agostino ha confermato TRE transfer
// del 19/08 per Tedi tour operator. Parse transfer li ha scritti TUTTI E TRE
// (righe 1135, 1136, 1137 del gestionale, verificate). Subito dopo il promemoria ha
// scritto: «⏳ Resta 1 bozza aperta — sul gestionale non c'è», e ha rimesso il bottone
// «Salva» su TR/18082026/G5HWU5BMPTIVTWY1, che era già salvato.
//
// La causa sta qui sotto, nella sezione 3. La ricevuta di Parse transfer
// (il campo `rows`) conteneva solo DUE righe su tre: mancava proprio quella che aveva
// già la tariffa (380). Il codice diceva: «se ho la ricevuta uso SOLO quella»
// (`if (!provati.size)` prima di leggere payload_schede). Ricevuta non vuota ma
// incompleta → il terzo non usciva dal registro → ricomparso come bozza da confermare.
//
// v5: `provati` è l'UNIONE della ricevuta e degli Id davvero spediti a Parse transfer
// (`payload_schede`, prodotto dal codice di Componi Payload Salvataggio, non dal modello).
// Le due fonti sono tutte e due prove di questo turno; nessuna delle due esclude l'altra.
// Resta invariata la rete di sicurezza del 14/08: le SCHEDE COMPLETE valgono solo se non
// c'è né ricevuta né payload, e una semplice CITAZIONE di un Id non basta mai (guasto
// 730335 del 14/08, due transfer spariti da tutte e due le parti).
//
// Banco: banchi/te/banco-bozze.js (dati veri di 760661 e 730335).
const norm = $('Normalizer (kind/text/file_id)').first().json;
const chat = String(norm.chat_id || '');
let out = '', intent = '';
try {
  const cj = $('Code in JavaScript').first().json;
  out = String(cj.agent_output_clean || '');
  intent = String(cj.intent || '').toLowerCase();
} catch (e) {}

// due formati di Id: TR/DDMMYYYY/XXXX (nuovo) e TR-AAAAMMGG-uuid (vecchio)
const ID_TXT = 'TR\\/\\d{8}\\/[A-Za-z0-9]{4,24}|TR-\\d{8}-[A-Za-z0-9-]{8,40}';
const idRe = new RegExp(ID_TXT, 'g');
const ID1 = new RegExp(ID_TXT);

// ---- che cosa è una riga di scheda ----
const CAMPO = /^[^\p{L}\n]*\s*(Data|Date|Ora|Time|Da|From|Per|To|Pax|Nome|Name|Fornitor\w*|Supplier\w*|Modalit[àa]|Mode|Payment|Tariffa|Fare|Cell\.?|Phone|Telefono|Volo|Flight|Autista|Driver|Veicolo|Vehicle|Note|Notes|Acconto|Deposit|h\s*extra|Fee|Netto|Conto|Id)\s*:/iu;
const TITOLO = /^[^\p{L}\n]*\s*(TRANSFER|RIENTRO|ANDATA|RITORNO|OUTBOUND|RETURN)\b(?!\s+(?:annullat|cancellat|salvat|scartat))/iu;
const RIGA_ID = /(?:🆔|(?:^|[^\p{L}])Id\s*:)/u;

// ---- affermazioni «è già fatto» ----
const FATTO = /\bsalvat[oaie]\b|\bannullat[oaie]\b|\bcancellat[oaie]\b|\bscartat[oaie]\b|\beliminat[oaie]\b|\brimoss[oaie]\b/i;
const IN_CORSO = /salvataggio in corso/i;
const NEGATO = /\bnon\s+(?:\S+\s+){0,2}(?:salvat|annullat|cancellat|scartat|eliminat|rimoss)/i;
const IPOTETICO = /\?|\b(potrebb\w*|dovrebb\w*|dovr[àa]\w*|vorrest\w*|vuoi|volevi|posso|devo|dobbiamo|dimmi|fammi\s+sapere|conferm\w*|intend\w*|oppure|se\s+vuoi|va\s+bene|proced\w*)\b/i;
const afferma = (riga) => FATTO.test(riga) && !NEGATO.test(riga) && !IPOTETICO.test(riga);
const CTX_ANNULLO = /🗑️|\bcancellazion\w*|\bannullament\w*/i;
const DAL_FOGLIO = /(?:^|[^\p{L}])(?:Booking\s+\d+\s+of\s+\d+|Prenotazione\s+\d+\s+di\s+\d+)/iu;

const SAVED_INTENT = (intent === 'conferma' || intent === 'modifica' || intent === 'cancella');
const SALVANDO = SAVED_INTENT || IN_CORSO.test(out);

// ---- registro precedente ----
let map = {};
try {
  for (const r of $('Leggi Bozze').all()) {
    const d = r.json.Dati ?? r.json.dati;
    if (d) Object.assign(map, JSON.parse(String(d)));
  }
} catch (e) {}
const now = Date.now(), TTL = 48 * 3600 * 1000;
for (const k of Object.keys(map)) {
  if (!map[k] || !map[k].ts || now - map[k].ts > TTL) delete map[k];
}

// ---- 1) trova le SCHEDE nel testo, qualunque emoji le apra ----
function estraiCarte(testo) {
  const rr = String(testo || '').split('\n');
  const cc = [];
  for (let i = 0; i < rr.length; i++) {
    const m = rr[i].match(ID1);
    if (!m || !RIGA_ID.test(rr[i])) continue;      // deve essere la riga «🆔 Id: TR/…»
    let a = i;
    while (a - 1 >= 0) {
      const p = rr[a - 1];
      if (ID1.test(p)) break;                       // mai attraversare la scheda precedente
      if (CAMPO.test(p) || TITOLO.test(p)) { a--; continue; }
      if (!p.trim() && a - 2 >= 0 && !ID1.test(rr[a - 2]) && TITOLO.test(rr[a - 2])) { a -= 2; continue; }
      break;
    }
    const corpo = rr.slice(a, i + 1);
    if (corpo.filter(l => CAMPO.test(l)).length < 3) continue;   // non è una scheda
    cc.push({ id: m[0], inizio: a, fine: i, scheda: corpo.join('\n').trim() });
  }
  return cc;
}
const righe = out.split('\n');
const carte = estraiCarte(out);

for (let k = 0; k < carte.length; k++) {
  const c = carte[k];
  // v7 21/08/2026 — lo STATO della scheda. `st` lo scrive solo il codice:
  //   bozza    proposta, mai partita
  //   spedita  mandata al gestionale, non confermata (v6)
  //   salvata  CONFERMATA da una ricevuta del gestionale
  // Una scheda `salvata` non esce piu' dal registro: ci resta col suo stato, dentro il
  // TTL di 48h. E' quella memoria che mancava, e che faceva ristampare — e rimandare —
  // i transfer gia' scritti a ogni salvataggio nuovo.
  const _pre = map[c.id];
  const _giaSalvata = !!(_pre && _pre.st === 'salvata');
  if (SALVANDO) { map[c.id] = { b: c.scheda.slice(0, 1200), ts: now, st: (_pre && _pre.st) || 'bozza' }; continue; }
  const SEP = /\|\|\|/;
  let limiteSopra = k > 0 ? carte[k - 1].fine + 1 : 0;
  for (let i = c.inizio - 1; i >= limiteSopra; i--) if (SEP.test(righe[i])) { limiteSopra = i + 1; break; }
  const testa = [];
  for (let i = c.inizio - 1; i >= limiteSopra && testa.length < 3; i--) {
    if (righe[i].trim()) testa.push(righe[i]);
  }
  let limiteSotto = k + 1 < carte.length ? carte[k + 1].inizio : righe.length;
  for (let i = c.fine + 1; i < limiteSotto; i++) if (SEP.test(righe[i])) { limiteSotto = i; break; }
  const coda = righe.slice(c.fine + 1, limiteSotto);
  if (DAL_FOGLIO.test(testa.join('\n')) || DAL_FOGLIO.test(c.scheda)) {
    delete map[c.id];
    continue;
  }
  if (CTX_ANNULLO.test(testa.join('\n')) || CTX_ANNULLO.test(c.scheda.split('\n').filter(l => !CAMPO.test(l)).join('\n'))) {
    delete map[c.id];
    continue;
  }
  const suDiLei = (r) => {
    const altri = (r.match(idRe) || []).filter(x => x !== c.id);
    return altri.length === 0;
  };
  const dichiarataFatta =
    c.scheda.split('\n').filter(l => !CAMPO.test(l)).some(afferma) ||
    coda.filter(suDiLei).some(afferma);
  if (dichiarataFatta) { delete map[c.id]; continue; }
  // Su una scheda gia' confermata NON si sovrascrive il testo: `b` deve restare quello che
  // il gestionale ha davvero scritto. Se l'agente la ristampa cambiata, la differenza e' la
  // prova della correzione — e la legge «Code in JavaScript», che alza intent = modifica.
  if (_giaSalvata) { map[c.id].ts = now; continue; }
  map[c.id] = { b: c.scheda.slice(0, 1200), ts: now, st: 'bozza' };
}

// ---- 2) righe sciolte «✅ … salvato: TR/…» / «annullato TR/…» → rimuovi ----
for (const riga of righe) {
  if (!afferma(riga)) continue;
  for (const id of riga.match(idRe) || []) delete map[id];
}

// ---- 2-bis) scarto deciso da Agostino (23/07/2026, riscritto il 20/08/2026) ----
// 20/08 (Agostino: «perché le bozze mi vengono ripresentate anche quando le ho scartate»).
// Misurato sul banco, sul codice in produzione: dal registro usciva SOLO lo scarto scritto
// esattamente «annulla…». «Scarta», «scartala», «No», «no lascia perdere» e il tap sul
// promemoria — che di proposito non stampa gli Id — lasciavano la bozza dentro, e il
// promemoria del turno dopo gliela rimetteva davanti.
// Ora conta il GESTO, non la parola che ha scelto.
{
  const _userTxt = String(norm.text || '');
  const _omTxt = String(norm.originalMessageText || '');
  const _s = _userTxt.trim().toLowerCase().replace(/[.!,;]+$/, '');
  const _parole = _s.split(/\s+/).filter(Boolean).length;
  const _KILL = /annull|cancell|scarta|scartare|elimin|butta|lascia perdere/i;

  // Un Id scritto per esteso è sempre una prova: vale a qualunque lunghezza.
  if (_KILL.test(_userTxt)) {
    for (const id of (_userTxt.match(idRe) || [])) delete map[id];
  }

  // Un «no» SECCO è uno scarto. Un «no» seguito da altro no: può essere una correzione
  // («no, il volo è alle 9») e lì la bozza si tiene. Una bozza di troppo è rumore, una
  // bozza persa è un transfer che sparisce. Per lo stesso motivo una frase che porta dei
  // numeri non è mai uno scarto: sta correggendo qualcosa.
  const _SOLO_NO = /^[^\p{L}]*n[oò][\s.!]*$/iu;
  const _VERBO = /^[^\p{L}]*\s*(?:(?:no|ok|e)[,\s]+)?(?:annull\w*|scart\w*|cancell\w*|elimin\w*|butt\w*|lascia\s+(?:stare|perdere)|niente|nulla|nada)\b/iu;
  const _diceBozze = /bozz/i.test(_s);
  const _scarto = _SOLO_NO.test(_s) ||
    (_VERBO.test(_s) && (_diceBozze || (_parole <= 4 && !/\d/.test(_s))));

  if (_scarto) {
    const _idsSuoi = _userTxt.match(idRe) || [];
    const _idsOm = _omTxt.match(idRe) || [];
    for (const id of _idsSuoi) delete map[id];
    // «scarta la seconda» su un messaggio con tre schede non vuol dire scartarle tutte:
    // quando indica UNA fra tante, dal registro non esce niente qui — lo dirà la risposta
    // dell'agente, letta dalle sezioni 1 e 2. Meglio una bozza di troppo che due perse.
    const _ORDINALE = /(?:^|\s)(?:l[ao]\s+|il\s+|i\s+|le\s+|gli\s+)?(?:prim\w|second\w|terz\w|quart\w|quint\w|ultim\w|#\s*\d)/i;
    const _indicaUna = _idsOm.length > 1 && _ORDINALE.test(_s) && !/tutt/i.test(_s);
    if (!_indicaUna) for (const id of _idsOm) delete map[id];

    // «scarta tutte le bozze»: l'ha detto lui, si svuota tutto.
    if (/(annull|cancell|scart|elimin|butt)\w*\s+(pure\s+|anche\s+)?(le\s+|tutte\s+le\s+)?bozz|bozz\w*\s+(puoi\s+|le\s+)?(annullar|cancellar|scartar|eliminar|buttar)/i.test(_userTxt)) {
      for (const k of Object.keys(map)) delete map[k];
    } else if (!_idsSuoi.length && !_idsOm.length && /bozz[ae]\s+apert[ae]/i.test(_omTxt)) {
      // Ha premuto sul PROMEMORIA, che elenca le bozze in riga compatta e senza Id
      // (è fatto così apposta, se no verrebbe scambiato per una scheda). Escono solo
      // quelle davvero ELENCATE lì dentro, riconosciute da ora + destinazione: se nel
      // registro ne è entrata un'altra dopo, quella non l'ha vista e resta.
      const _campoDi = (scheda, nomi) => {
        const re = new RegExp('^[^\\p{L}\\n]*\\s*(?:' + nomi + ')\\s*:\\s*(.+)$', 'iu');
        for (const riga of String(scheda || '').split('\n')) {
          const m = riga.match(re);
          if (m && m[1].trim()) return m[1].trim();
        }
        return '';
      };
      const _righeOm = _omTxt.split('\n');
      for (const k of Object.keys(map)) {
        const b = (map[k] || {}).b || '';
        const ora = _campoDi(b, 'Ora|Time');
        const rif = _campoDi(b, 'Per|To') || _campoDi(b, 'Nome|Name');
        if (!ora) continue;
        if (_righeOm.some((r) => r.indexOf(ora) >= 0 && (!rif || r.indexOf(rif) >= 0))) delete map[k];
      }
    }
  }
  // ---- 08/08/2026: «quando io faccio nulla quella bozza la deve cancellare» ----
  {
    const _s = _userTxt.trim().toLowerCase().replace(/[.!,;]+$/, '');
    const _NIENTE = /^(?:e\s+)?(?:niente|nulla|nada|lascia\s+stare|lascia\s+perdere|non\s+importa|non\s+serve|niente\s+piu|basta\s+cosi|fa\s+niente|nulla\s+di\s+che)$/i;
    if (_NIENTE.test(_s) && _s.split(/\s+/).length <= 3) {
      const _oggi = new Set(carte.map((c) => c.id));
      for (const k of Object.keys(map)) if (!_oggi.has(k)) delete map[k];
    }
  }
}

// ---- 3) chi esce dal registro — v5 18/08/2026 ----
// Una bozza esce solo dietro PROVA. Le prove di questo turno sono DUE, e si sommano:
//   1) la ricevuta di Parse transfer (le righe che dice di aver scritto sul gestionale);
//   2) gli Id davvero spediti a Parse transfer (payload_schede).
// v4 usava la (2) solo se la (1) era vuota: il 18/08 la ricevuta è arrivata incompleta
// (2 righe su 3 spedite e salvate) e il terzo transfer è rimasto in bozza da confermare
// pur essendo sul gestionale (esecuzione 760661, righe 1135/1136/1137).
// La (3) — le schede complete a schermo — resta l'ultima rete, solo se non c'è nient'altro:
// una CITAZIONE di un Id non è mai una prova (guasto 730335 del 14/08).
if (SALVANDO) {
  // 1) la ricevuta del gestionale: le righe che dice di aver scritto DAVVERO.
  const daRicevuta = new Set();
  try {
    for (const it of $('Salva via Parse transfer (intent)').all()) {
      const rows = it.json && it.json.rows;
      if (!rows) continue;
      const arr = typeof rows === 'string' ? JSON.parse(rows) : rows;
      for (const r of (Array.isArray(arr) ? arr : [arr])) {
        const id = r && (r.Id || r.id);
        if (id && ID1.test(String(id))) daRicevuta.add(String(id).trim());
      }
    }
  } catch (e) {}

  // 2) gli Id davvero spediti a Parse transfer (prodotti dal codice, non dal modello).
  const spediti = new Set();
  try {
    for (const id of ($('Componi Payload Salvataggio').first().json.payload_schede || [])) {
      if (id) spediti.add(String(id).trim());
    }
  } catch (e) {}

  const provati = new Set(daRicevuta);

  // 2b) SPEDITO MA NON CONFERMATO — v6, 21/08/2026, esecuzione 781233.
  // Agostino preme «salva tutte le bozze in sospeso»: a Parse transfer arrivano TRE
  // transfer, la ricevuta ne riporta UNO (riga 1289). La v5 li toglieva tutti e tre dal
  // registro, perché considerava «spedito» una prova quanto «ricevuto». I due transfer
  // Masseria Tarsia Morisco ↔ Monopoli sono rimasti fuori da tutte e due le parti: né
  // sul gestionale né in bozza. Spariti, e senza una parola.
  //
  // Spedito NON è salvato. È un terzo stato: non lo so. Qui non esce dal registro, si
  // marca `v` (da verificare) e si conta quante volte è stato spedito.
  //
  // La paura della v4 — «se resta in registro me lo ripropone e faccio un doppione» —
  // oggi non regge più: da stamattina «Assegna Id» garantisce che OGNI riga abbia il suo
  // Id, e Google Sheets scrive in appendOrUpdate su quell'Id. Rimandare la stessa scheda
  // aggiorna la stessa riga, non ne crea una seconda. Quindi tenere costa un promemoria
  // di troppo, buttare costa un transfer. In dubbio si tiene.
  const daVerificare = [];
  for (const id of spediti) {
    if (daRicevuta.has(id)) continue;
    daVerificare.push(id);
    if (map[id]) {
      map[id].v = Date.now();
      map[id].sped = (map[id].sped || 0) + 1;
      map[id].st = 'spedita';
    }
  }

  // 3) ultima rete: le schede complete a schermo. Vale SOLO se non c'è né ricevuta né
  // payload — cioè non si sa niente di questo turno. Una CITAZIONE di un Id non è mai
  // una prova (guasto 730335 del 14/08).
  if (!daRicevuta.size && !spediti.size) {
    for (const c of carte) provati.add(c.id);
    for (const c of estraiCarte(String(norm.originalMessageText || ''))) provati.add(c.id);
  }

  // v7: quello che la RICEVUTA conferma non si cancella piu' — si marca `salvata` e resta.
  // Cancellare era buttare via l'unica memoria di cosa e' gia' sul gestionale: senza,
  // l'agente ristampa le vecchie schede e il payload le rimanda, e ad Agostino arriva la
  // conferma di roba fatta ieri. (Domanda sua, 21/08: «com'e' possibile che per ogni nuovo
  // transfer salvato mi rimanda anche i vecchi».)
  for (const id of daRicevuta) {
    if (!map[id]) map[id] = { b: '', ts: now };
    map[id].st = 'salvata';
    map[id].ts = now;
    delete map[id].v;
    delete map[id].sped;
  }
  // L'ultima rete (schede complete a schermo, nessuna ricevuta e nessun payload) NON e' una
  // conferma del gestionale: li' si cancella come prima, non si dichiara `salvata`.
  for (const id of provati) if (!daRicevuta.has(id)) delete map[id];
  var _diagnostica = {
    provati: provati.size,
    da_ricevuta: daRicevuta.size,
    spediti: spediti.size,
    da_verificare: daVerificare
  };
  var _daVerificare = daVerificare;
}

// cap di sicurezza: i 20 più recenti
const keys = Object.keys(map).sort((a, b2) => (map[b2].ts || 0) - (map[a].ts || 0));
for (const k of keys.slice(20)) delete map[k];

const tutte = Object.keys(map).sort((a, b2) => (map[b2].ts || 0) - (map[a].ts || 0));
// Aperte = quelle su cui c'e' ancora qualcosa da fare. Una `salvata` resta nel registro ma
// non e' una bozza: non va nel promemoria e non va ripresentata.
const rimaste = tutte.filter((id) => (map[id].st || 'bozza') !== 'salvata');
return [{ json: {
  chatd: 'BOZZE|' + chat,
  dati_json: JSON.stringify(map),
  n: rimaste.length,
  chat_id: chat,
  salvando: SALVANDO,
  prove: (typeof _diagnostica !== 'undefined' ? _diagnostica : null),
  da_verificare: (typeof _daVerificare !== 'undefined' ? _daVerificare : []),
  salvate: tutte.filter((id) => map[id].st === 'salvata'),
  bozze: rimaste.map((id) => ({
    id: id,
    scheda: map[id].b || '',
    // true = spedito al gestionale che non l'ha confermato. NON è «non salvato»:
    // è «non si sa». Va detto con parole diverse da una bozza mai partita.
    da_verificare: !!map[id].v,
    spedito_volte: map[id].sped || 0
  }))
} }];
