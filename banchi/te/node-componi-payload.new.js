// ============================================================================
// PAYLOAD SALVATAGGIO — 07/08/2026
// Regola di Agostino: «Conferma» salva SOLO i transfer mostrati in QUEL recap.
// ⚠️ «Quel messaggio» NON può essere solo il messaggio cliccato: Telegram spezza i recap
// lunghi in più messaggi e i bottoni restano attaccati all'ULTIMO pezzo. Il 05/08 alle 12:58
// (esecuzione 671661) il recap aveva 8 transfer e il pezzo coi bottoni ne mostrava 1 solo:
// prendere solo quello avrebbe salvato 1 transfer su 8.
// Quindi il recap = le schede del turno corrente UNITE a quelle del pezzo cliccato, senza
// prosa e senza gli Id che il testo dichiara GIÀ salvati. Se un Id compare in entrambi,
// vince la versione del turno corrente (è la più aggiornata).
//
// 19/08/2026 — DUE RIGHE VUOTE SUL GESTIONALE, DI FILA.
// Esecuzione 769027 (22:47) e poi 769061 (22:52, la «correzione»): il transfer di
// Alena Curry è finito sul gestionale con Data, Ora, Da, Per e Nome VUOTI, due volte.
// Il ritaglio partiva dalla riga «🆔 Id» e risaliva finché riconosceva i campi. Nella
// scheda c'era «📧 Email: curryalena@gmail.com», e «Email» non è nella lista CAMPO:
// la risalita si fermava lì e buttava via tutto quello che stava sopra — cioè la testa
// della scheda. In silenzio.
// Ora il ritaglio NON risale a tentoni: parte dal TITOLO della scheda (🚐 TRANSFER,
// 🔄 RIENTRO…) e arriva alla riga dell'Id. Un campo che il codice non conosce sta in
// mezzo e non fa danni. E se anche una sola scheda esce senza Data o senza Da/Per, il
// ritaglio si butta e si manda il TESTO INTERO: meglio dare al parser tutto quanto che
// un pezzo tagliato. Un pezzo tagliato è una riga vuota sul gestionale.
// ============================================================================
const norm = $('Normalizer (kind/text/file_id)').first().json;
const intent = String($json.intent || '').toLowerCase();
const om = String(norm.originalMessageText || '');
const daModello = String($json.recap_verificato || '') ||
  (() => { try { return String($('AI Agent2').first().json.output || ''); } catch (e) { return ''; } })();

const ID1 = /TR\/\d{8}\/[A-Z0-9]{6,20}/;
const CAMPO = /^[^\p{L}\n]*\s*(Data|Date|Ora|Time|Da|From|Per|To|Pax|Nome|Name|Fornitor\w*|Supplier\w*|Modalit[àa]|Mode|Payment|Tariffa|Fare|Cell\.?|Phone|Telefono|Volo|Flight|Autista|Driver|Veicolo|Vehicle|Note|Notes|Acconto|Deposit|h\s*extra|Fee|Netto|Conto|Allert|Sub-?appalti|%|Id)\s*:/iu;
const TITOLO = /^[^\p{L}\n]*\s*(TRANSFER|RIENTRO|ANDATA|RITORNO|OUTBOUND|RETURN)\b(?!\s+(?:annullat|cancellat|salvat|scartat))/iu;
const RIGA_ID = /(?:🆔|(?:^|[^\p{L}])Id\s*:)/u;

function estraiSchede(testo) {
  const righe = String(testo || '').split('\n');
  const SEP = /\|\|\|/;
  const carte = [];
  let dopoLaPrecedente = 0;
  for (let i = 0; i < righe.length; i++) {
    const m = righe[i].match(ID1);
    if (!m || !RIGA_ID.test(righe[i])) continue;
    // il blocco di questa scheda comincia dopo la scheda precedente, o dopo un separatore |||
    let da = dopoLaPrecedente;
    for (let k = i - 1; k >= dopoLaPrecedente; k--) if (SEP.test(righe[k])) { da = k + 1; break; }
    // dentro il blocco: se c'è il titolo della scheda si parte da lì (sopra c'è prosa),
    // altrimenti dal primo campo. Mai a ritroso campo per campo: un campo sconosciuto
    // («📧 Email:») decapitava la scheda.
    let titolo = -1;
    for (let k = da; k < i; k++) if (TITOLO.test(righe[k])) titolo = k;
    let inizio = titolo;
    if (inizio < 0) { for (let k = da; k < i; k++) if (CAMPO.test(righe[k])) { inizio = k; break; } }
    if (inizio < 0) inizio = i;
    const corpo = righe.slice(inizio, i + 1);
    dopoLaPrecedente = i + 1;
    if (corpo.filter((l) => CAMPO.test(l)).length < 3) continue;
    const scheda = corpo.join('\n').replace(/<\/?code>/g, '').trim();
    if (!carte.some((c) => c.id === m[0])) carte.push({ id: m[0], scheda: scheda });
  }
  return carte;
}

// Una scheda senza Data o senza tratta non è un transfer: è una riga vuota che aspetta
// di essere scritta. Se ne trovo una, non mi fido del ritaglio.
function schedaCompleta(scheda) {
  const s = String(scheda || '');
  // \s comprende il newline: con \s*\S un campo vuoto («Data:» e a capo) risultava pieno
  // perché il controllo saltava alla riga successiva. Dopo i due punti si guarda solo la RIGA.
  const c = (nomi) => new RegExp('(^|\\n)[^\\p{L}\\n]*[ \\t]*(?:' + nomi + ')[ \\t]*:[ \\t]*\\S', 'iu').test(s);
  return c('Data|Date') && c('Da|From') && c('Per|To');
}

const nelMessaggio = estraiSchede(om);
const nelTurno = estraiSchede(daModello);
// ⛔ 07/08/2026 — REGOLA NUMERO UNO: non si perde MAI un salvataggio.
// Qui prima si escludevano gli Id che il testo dichiarava «già salvati»: se il modello
// scriveva «✅ TR/... salvato» e nello stesso messaggio riproponeva la scheda, quella
// scheda non veniva salvata. Rischio inaccettabile. Ora NON si esclude niente: un
// eventuale doppione lo risolve Parse transfer, che deduplica per Id.
const chiusi = new Set();
const scelte = [];
const visti = new Set();
for (const c of nelTurno.concat(nelMessaggio)) {
  if (visti.has(c.id) || chiusi.has(c.id)) continue;
  visti.add(c.id);
  scelte.push(c);
}

const monche = scelte.filter((c) => !schedaCompleta(c.scheda));

// ============================================================================
// 22/08/2026 — LA CONFERMA NON PUÒ DIPENDERE DA QUEL CHE IL MODELLO RISTAMPA.
// Esecuzione 785749, ore 09:27. Agostino scrive «Conferma tutti». Nel registro ci sono
// SETTE bozze aperte con le schede intere. L'agente però risponde tre parole —
// «Salvataggio in corso...» — e non ristampa niente: qui `scelte` resta vuoto, a Parse
// transfer arriva della prosa e il gestionale scrive ZERO righe. Alle 09:30 lui preme il
// bottone, l'agente ristampa le stesse sette schede e si salvano tutte e sette (785765).
// Stessi transfer, stesso intent: cambiava solo se il modello aveva ristampato o no.
//
// Quando il modello non ha ristampato NULLA e l'intento è una conferma, le schede si
// prendono dal REGISTRO, che le tiene per intero ed è scritto dal codice.
// Solo `conferma`: una `modifica` senza scheda a schermo non si sa a cosa si riferisca,
// e una `cancella` non deve mai diventare un salvataggio di massa.
// Solo le bozze APERTE: le `st:'salvata'` sono già sul gestionale.
// Banco: banchi/te/banco-registro.js (dati veri di 785749, 785719, 785614).
let daRegistro = [];
if (!scelte.length && intent === 'conferma') {
  try {
    const grezzo = $('Leggi Bozze').first().json;
    const mappa = JSON.parse(String((grezzo && (grezzo.Dati ?? grezzo.dati)) || '{}'));
    for (const id of Object.keys(mappa)) {
      const v = mappa[id] || {};
      if (v.st === 'salvata') continue;
      const scheda = String(v.b || '').trim();
      if (!scheda || !ID1.test(scheda)) continue;
      if (!schedaCompleta(scheda)) continue;   // una scheda monca non si spedisce mai
      daRegistro.push({ id: id, scheda: scheda });
    }
  } catch (e) { daRegistro = []; }
}

let payload;
if (!scelte.length && daRegistro.length) {
  payload = daRegistro.map((c) => c.scheda).join('\n\n ||| \n\n') + '\n\n[INTENT: conferma]';
} else if (scelte.length && !monche.length) {
  payload = scelte.map((c) => c.scheda).join('\n\n ||| \n\n') + '\n\n[INTENT: ' + (intent || 'conferma') + ']';
} else {
  // Nessuna scheda riconosciuta, oppure una scheda esce monca: NON si manda il ritaglio.
  // Si manda tutto il testo, che i dati ce li ha. Il 19/08 il ritaglio monco ha scritto
  // due volte una riga senza data, ora, tratta e nome (esecuzioni 769028 e 769065).
  payload = [daModello, om, String(norm.text || '')].filter((s) => s && s.trim()).join('\n\n');
}

return [{ json: Object.assign({}, $json, {
  payload_salvataggio: payload,
  payload_schede: (!scelte.length && daRegistro.length ? daRegistro : scelte).map((c) => c.id),
  payload_origine: (!scelte.length && daRegistro.length)
    ? 'registro'
    : (nelTurno.length ? 'turno' : '') + (nelMessaggio.length ? (nelTurno.length ? '+messaggio' : 'messaggio') : ''),
  payload_esclusi: [...chiusi],
  payload_monche: monche.map((c) => c.id),
  payload_ritagliato: !!((scelte.length && !monche.length) || (!scelte.length && daRegistro.length))
}) }];
