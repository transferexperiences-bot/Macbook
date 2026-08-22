// BOZZE LEDGER v7 — 22/08/2026 (v6: 21/08, v5: 18/08, v4: 14/08, v3: 07/08)
// Perché v7: il registro non sapeva dire «questa è già salvata». Sapeva solo «è aperta»
// oppure «non c'è più». Chi usciva veniva CANCELLATO, e da lì in poi il registro non
// aveva più memoria di lui: bastava che l'agente ristampasse un recap perché la scheda
// rientrasse fra le bozze da confermare, già scritta sul gestionale.
// Prova, 22/08: alle 09:07 (esecuzione 785614) cinque transfer vengono salvati e la
// ricevuta li conferma tutti e cinque. Alle 09:16 (785719) Agostino manda un transfer
// nuovo, l'agente risponde col recap di tutti quanti, e il registro torna a SETTE bozze
// aperte — le 5 già sul gestionale più le 2 nuove. Alle 09:27 lui scrive «Conferma
// tutti» e gliele ripropone ancora.
// Da qui il terzo stato: una scheda confermata dalla RICEVUTA di Parse transfer resta
// in registro marcata `st:'salvata'` e non viene più riproposta. Rientra fra le aperte
// solo se il contenuto cambia davvero (firma dei campi che contano): quella è una
// modifica, non una ristampa.
// La marcatura la dà SOLO la ricevuta. Il testo del modello che dice «salvato» continua
// a far dimenticare la scheda, non a dichiararla salva: senza prova del codice non si
// scrive uno stato (guasto 730335 del 14/08).
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
// Banco: banchi/te/banco-bozze.js (dati veri di 760661 e 730335), banco-registro.js e
// banco-regressioni.js (dati veri di 785614, 785719, 785749).
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

// ---- firma di una scheda: i campi che, se cambiano, fanno di una ristampa una modifica.
// Serve a distinguere «l'agente ha ristampato il recap» da «Agostino ha cambiato l'orario».
const CHIAVI_FIRMA = 'Data|Date|Ora|Time|Da|From|Per|To|Pax|Nome|Name|Tariffa|Fare|Volo|Flight|Autista|Driver|Veicolo|Vehicle|Fornitor\\w*|Supplier\\w*|Modalit[àa]|Mode|Payment|Acconto|Deposit|Note|Notes';
function firma(scheda) {
  const re = new RegExp('^[^\\p{L}\\n]*\\s*(' + CHIAVI_FIRMA + ')\\s*:\\s*(.*)$', 'iu');
  const campi = [];
  for (const riga of String(scheda || '').split('\n')) {
    const m = riga.match(re);
    if (!m) continue;
    // il nome del campo si normalizza (Data/Date -> data) e il valore si ripulisce degli
    // spazi doppi: una ristampa che cambia solo la spaziatura non è una modifica.
    campi.push(m[1].toLowerCase().slice(0, 4) + '=' + m[2].trim().replace(/\s+/g, ' ').toLowerCase());
  }
  return campi.sort().join('|');
}

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

// ---- 22/08/2026: SCHEDE SCRITTE SU UNA RIGA SOLA ----------------------------
// Esecuzione 788007, ore 16:40. Agostino preme «Salva subito» su un andata/ritorno in
// tuk-tuk e ne parte UNO solo. L'agente aveva scritto le due schede cosi:
//   📅 23/08/2026 · 🕐 15:30 · 📍 Polignano a Mare → 🎯 Cala Ponte Marina · … · 🆔 TR/…
// tutto su una riga, senza nessun «Campo:». Il ritaglio pero riconosce una scheda solo se
// trova almeno tre righe «Campo: valore»: li ce n'erano ZERO, e tutte e due le schede
// erano invisibili al codice. Il ritorno si e salvato solo perche stava anche nel
// messaggio cliccato, che era in formato esteso.
// Qui la riga compatta viene RIAPERTA in righe «Campo: valore» prima di ogni lettura: da
// li in poi tutto il resto del codice funziona come sempre.
// Il promemoria delle bozze resta al sicuro: e compatto ma NON porta Id, e senza Id qui
// non si tocca niente.
const EMOJI_CAMPO = { '📅': 'Data', '🗓️': 'Data', '🗓': 'Data', '⏰': 'Ora',
  '🕐': 'Ora', '🕑': 'Ora', '🕒': 'Ora', '🕓': 'Ora', '🕔': 'Ora', '🕕': 'Ora', '🕖': 'Ora',
  '🕗': 'Ora', '🕘': 'Ora', '🕙': 'Ora', '🕚': 'Ora', '🕛': 'Ora',
  '📍': 'Da', '🎯': 'Per', '👥': 'Pax', '👤': 'Nome', '📞': 'Cell.', '☎️': 'Cell.',
  '✈️': 'Volo', '🏢': 'Fornitori', '💳': 'Modalità', '💰': 'Tariffa', '💶': 'Tariffa',
  '🚗': 'Veicolo', '🚖': 'Autista', '📝': 'Note', '🆔': 'Id' };
const EMOJI_RE = new RegExp('(' + Object.keys(EMOJI_CAMPO)
  .sort((a, b) => b.length - a.length)
  .map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'g');
function espandiCompatte(testo) {
  const fuori = [];
  for (const riga of String(testo || '').split('\n')) {
    const pezzi = [];
    let m, ultimo = null;
    EMOJI_RE.lastIndex = 0;
    while ((m = EMOJI_RE.exec(riga)) !== null) {
      if (ultimo) ultimo.fine = m.index;
      ultimo = { emoji: m[0], campo: EMOJI_CAMPO[m[0]], inizio: m.index + m[0].length, fine: riga.length };
      pezzi.push(ultimo);
    }
    // serve un Id e almeno altri tre campi: sotto questa soglia non e una scheda schiacciata
    if (pezzi.length < 4 || !pezzi.some((p) => p.campo === 'Id')) { fuori.push(riga); continue; }
    for (const p of pezzi) {
      const v = riga.slice(p.inizio, p.fine)
        .replace(/^[\s:·•|>→⇒-]+/, '').replace(/[\s·•|>→⇒]+$/, '').trim()
        .replace(/^[A-Za-zÀ-ÿ.'\s]{2,12}:\s*/, '');   // «Data: 23/08» -> «23/08»
      fuori.push(p.emoji + ' ' + p.campo + ': ' + v);
    }
  }
  return fuori.join('\n');
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
out = espandiCompatte(out);
const righe = out.split('\n');
const carte = estraiCarte(out);

for (let k = 0; k < carte.length; k++) {
  const c = carte[k];
  const f = firma(c.scheda);
  const prec = map[c.id];
  // Già salvata e ristampata identica: resta salvata, non torna in coda. Se invece la
  // firma è cambiata, è una modifica vera e la scheda torna aperta.
  if (prec && prec.st === 'salvata' && prec.f === f) {
    map[c.id] = Object.assign({}, prec, { b: c.scheda.slice(0, 1200), ts: now });
    continue;
  }
  if (SALVANDO) { map[c.id] = { b: c.scheda.slice(0, 1200), ts: now, f: f }; continue; }
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
  map[c.id] = { b: c.scheda.slice(0, 1200), ts: now, f: f };
}

// ---- 1-bis) RICHIESTE SENZA SCHEDA — 22/08/2026 ----------------------------
// Esecuzione 787808, 22/08 ore 16:08. Arriva da Davide una richiesta vera per il
// 7 settembre: data, volo AF1288, cellulare del cliente, struttura Dimora Brando.
// L'agente legge tutto bene e fa le domande giuste (verso del percorso, ora, pax,
// tariffa) — ma NON stampa nessuna scheda, quindi nessun Id, quindi nessuna bozza.
// Registro prima: {} . Registro dopo: {} . Di quella richiesta non resta traccia da
// nessuna parte: ne in bozza, ne sul gestionale, ne nel promemoria. Vive solo nella
// chat, e quando scorri via sparisce.
// Confronto: alle 16:34 il tuk-tuk, a cui mancava la tariffa, e diventato bozza perche
// li l'agente la scheda l'aveva stampata. Stessa situazione, esiti opposti: decideva
// l'impaginazione del modello.
// Qui la decide il codice: un blocco di almeno tre righe «Campo: valore» SENZA Id e una
// richiesta aperta, e si trattiene. Non e una scheda e non si salva mai da sola —
// serve a non perderla e a rimetterla davanti ad Agostino.
// Regola sua, CLAUDE.md: «una bozza di troppo e rumore, una bozza persa e un transfer
// che sparisce».
const CAMPO_LARGO = /^[^\p{L}\n]*\s*[\p{L}][\p{L}.'’ ]{1,20}\s*:\s*\S/u;
function campoDaTesto(testo, nomi) {
  const re = new RegExp('^[^\\p{L}\\n]*\\s*(?:' + nomi + ')\\s*:\\s*(.+)$', 'iu');
  for (const r of String(testo || '').split('\n')) {
    const m = r.match(re);
    if (m && m[1].trim()) return m[1].trim();
  }
  return '';
}
// La firma tiene insieme la richiesta e la scheda che ne nascera: stessa data e stesso
// riferimento (volo, cellulare, nome o struttura). Serve a non trattenerla due volte e a
// farla sparire da sola quando la scheda vera arriva.
function firmaRichiesta(testo) {
  // via quello fra parentesi prima di confrontare: «07/09/2026 (lunedì)» e «07/09/2026»
  // sono la stessa data, e senza questo la scheda vera non ritrovava la sua richiesta.
  const g = (n) => campoDaTesto(testo, n).replace(/\([^)]*\)/g, ' ')
    .toLowerCase().replace(/[^a-z0-9]+/g, '');
  const data = g('Data|Date');
  const chi = g('Volo|Flight') || g('Cell\\.?|Phone|Telefono') ||
              g('Nome|Name') || g('Struttura|Fornitor\\w*|Supplier\\w*');
  if (!data || !chi) return '';
  return 'REQ|' + data + '|' + chi;
}

// una scheda vera cancella la richiesta da cui e nata
for (const c of carte) { const f = firmaRichiesta(c.scheda); if (f && map[f]) delete map[f]; }

if (!SALVANDO && !carte.length) {
  let i = 0;
  while (i < righe.length) {
    if (!CAMPO_LARGO.test(righe[i])) { i++; continue; }
    let j = i;
    while (j + 1 < righe.length && (CAMPO_LARGO.test(righe[j + 1]) ||
      (!righe[j + 1].trim() && CAMPO_LARGO.test(righe[j + 2] || '')))) j++;
    const blocco = righe.slice(i, j + 1);
    i = j + 1;
    if (blocco.filter((l) => CAMPO.test(l)).length < 3) continue;   // troppo poco per essere un transfer
    if (blocco.some((l) => ID1.test(l))) continue;                  // ha un Id: e una scheda, non una richiesta
    const testoBlocco = blocco.join('\n').trim();
    const f = firmaRichiesta(testoBlocco);
    if (!f) continue;               // senza data e senza un riferimento non e trattenibile
    const prec = map[f];
    map[f] = {
      b: ('📌 RICHIESTA APERTA — non e ancora una scheda\n' + testoBlocco).slice(0, 1200),
      ts: now,
      tipo: 'richiesta',
      da_quando: (prec && prec.da_quando) || now
    };
  }
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
    }
  }

  // 3) ultima rete: le schede complete a schermo. Vale SOLO se non c'è né ricevuta né
  // payload — cioè non si sa niente di questo turno. Una CITAZIONE di un Id non è mai
  // una prova (guasto 730335 del 14/08).
  if (!daRicevuta.size && !spediti.size) {
    for (const c of carte) provati.add(c.id);
    for (const c of estraiCarte(espandiCompatte(String(norm.originalMessageText || '')))) provati.add(c.id);
  }

  // v7 — 22/08/2026: la ricevuta non CANCELLA più, MARCA.
  // Cancellare voleva dire perdere la memoria del salvataggio: al recap successivo la
  // scheda rientrava fra le bozze da confermare (esecuzioni 785614 → 785719 del 22/08).
  // Chi è confermato dalla ricevuta resta in registro con `st:'salvata'` e non viene più
  // riproposto. Chi è «provato» senza ricevuta — l'ultima rete qui sopra — si dimentica
  // come prima: senza prova del codice non si scrive uno stato.
  for (const id of provati) {
    if (!daRicevuta.has(id)) { delete map[id]; continue; }
    const prec = map[id] || {};
    map[id] = {
      b: prec.b || '',
      f: prec.f || firma(prec.b || ''),
      ts: now,
      st: 'salvata',
      sv: now
    };
  }
  var _diagnostica = {
    provati: provati.size,
    da_ricevuta: daRicevuta.size,
    spediti: spediti.size,
    da_verificare: daVerificare
  };
  var _daVerificare = daVerificare;
}

// cap di sicurezza, contato SEPARATAMENTE: le salvate sono lapidi e non devono mai
// spingere fuori dal registro una bozza ancora aperta.
const perTs = (a, b2) => (map[b2].ts || 0) - (map[a].ts || 0);
const aperteK = Object.keys(map).filter((k) => map[k].st !== 'salvata').sort(perTs);
const salvateK = Object.keys(map).filter((k) => map[k].st === 'salvata').sort(perTs);
for (const k of aperteK.slice(20)) delete map[k];
for (const k of salvateK.slice(30)) delete map[k];

const rimaste = aperteK.slice(0, 20);
return [{ json: {
  chatd: 'BOZZE|' + chat,
  dati_json: JSON.stringify(map),
  n: rimaste.length,
  salvate: Math.min(salvateK.length, 30),
  chat_id: chat,
  salvando: SALVANDO,
  prove: (typeof _diagnostica !== 'undefined' ? _diagnostica : null),
  da_verificare: (typeof _daVerificare !== 'undefined' ? _daVerificare : []),
  bozze: rimaste.map((id) => ({
    id: id,
    // 'richiesta' = descritta ma senza scheda: non si salva da sola, si riprende
    tipo: map[id].tipo || 'bozza',
    scheda: map[id].b || '',
    // true = spedito al gestionale che non l'ha confermato. NON è «non salvato»:
    // è «non si sa». Va detto con parole diverse da una bozza mai partita.
    da_verificare: !!map[id].v,
    spedito_volte: map[id].sped || 0
  }))
} }];
