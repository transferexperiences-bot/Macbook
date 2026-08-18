// BOZZE LEDGER v5 — 18/08/2026 (v4: 14/08, v3: 07/08)
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
  if (SALVANDO) { map[c.id] = { b: c.scheda.slice(0, 1200), ts: now }; continue; }
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
  map[c.id] = { b: c.scheda.slice(0, 1200), ts: now };
}

// ---- 2) righe sciolte «✅ … salvato: TR/…» / «annullato TR/…» → rimuovi ----
for (const riga of righe) {
  if (!afferma(riga)) continue;
  for (const id of riga.match(idRe) || []) delete map[id];
}

// ---- 2-bis) scarto deciso dal testo di Agostino (23/07/2026) ----
{
  const _userTxt = String(norm.text || '');
  const _omTxt = String(norm.originalMessageText || '');
  const _KILL = /annull|cancell|scarta|scartare|elimin|butta|lascia perdere/i;
  if (_KILL.test(_userTxt)) {
    for (const id of (_userTxt.match(idRe) || [])) delete map[id];
    if (/^\s*(❌\s*)?annulla\b/i.test(_userTxt.trim())) {
      for (const id of (_omTxt.match(idRe) || [])) delete map[id];
    }
    if (/(annull|cancell|scart|elimin|butt)\w*\s+(pure\s+|anche\s+)?(le\s+|tutte\s+le\s+)?bozz|bozz\w*\s+(puoi\s+|le\s+)?(annullar|cancellar|scartar|eliminar|buttar)/i.test(_userTxt)) {
      for (const k of Object.keys(map)) delete map[k];
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
  const provati = new Set();

  // 1) ricevuta dal gestionale
  try {
    for (const it of $('Salva via Parse transfer (intent)').all()) {
      const rows = it.json && it.json.rows;
      if (!rows) continue;
      const arr = typeof rows === 'string' ? JSON.parse(rows) : rows;
      for (const r of (Array.isArray(arr) ? arr : [arr])) {
        const id = r && (r.Id || r.id);
        if (id && ID1.test(String(id))) provati.add(String(id).trim());
      }
    }
  } catch (e) {}
  const daRicevuta = provati.size;

  // 2) gli Id davvero spediti: si SOMMANO alla ricevuta, non la sostituiscono
  try {
    for (const id of ($('Componi Payload Salvataggio').first().json.payload_schede || [])) {
      if (id) provati.add(String(id).trim());
    }
  } catch (e) {}

  // 3) ultima rete: le schede complete a schermo. MAI le citazioni.
  if (!provati.size) {
    for (const c of carte) provati.add(c.id);
    for (const c of estraiCarte(String(norm.originalMessageText || ''))) provati.add(c.id);
  }

  for (const id of provati) delete map[id];
  // lo scarto fra spediti e ricevuti resta scritto: se ricompare, si sa dove guardare
  var _diagnostica = { provati: provati.size, da_ricevuta: daRicevuta };
}

// cap di sicurezza: i 20 più recenti
const keys = Object.keys(map).sort((a, b2) => (map[b2].ts || 0) - (map[a].ts || 0));
for (const k of keys.slice(20)) delete map[k];

const rimaste = Object.keys(map).sort((a, b2) => (map[b2].ts || 0) - (map[a].ts || 0));
return [{ json: {
  chatd: 'BOZZE|' + chat,
  dati_json: JSON.stringify(map),
  n: rimaste.length,
  chat_id: chat,
  salvando: SALVANDO,
  prove: (typeof _diagnostica !== 'undefined' ? _diagnostica : null),
  bozze: rimaste.map((id) => ({ id: id, scheda: map[id].b || '' }))
} }];
