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
// ============================================================================
// 21/08/2026 — NON SI RIMANDA QUELLO CHE E' GIA' SCRITTO, IDENTICO.
// Agostino: «com'e' possibile che per ogni nuovo transfer salvato mi rimanda anche i
// vecchi». Perche' il payload e' TUTTO quello che l'agente ha stampato, e l'agente
// ristampa le schede vecchie. Sul foglio non fanno danno (stesso Id, appendOrUpdate) ma
// la conferma che arriva a lui rielenca roba di ieri, e il sistema sembra senza memoria.
//
// ⚠️ QUESTA NON E' LA REGOLA TOLTA IL 07/08. Quella escludeva gli Id che il MODELLO
// dichiarava «gia' salvati» a parole: si fidava di una frase, e per questo perdeva
// salvataggi veri. Questa si fida della RICEVUTA del gestionale — lo stato `salvata` nel
// registro bozze lo scrive solo il codice, leggendo le righe che il gestionale dice di
// aver scritto — e per di piu' esclude SOLO se la scheda e' rimasta identica.
// Se e' cambiata anche di un campo e' una correzione, e passa: stesso Id, appendOrUpdate,
// la riga si aggiorna. Chi legge fra un mese: non togliere questo blocco pensando di
// riparare il guasto del 07/08. E' il caso opposto.
//
// Il confronto e' sui CAMPI, non sul testo grezzo: «Aggiorna Bozze» e questo nodo
// ritagliano le schede con due funzioni diverse, e un ritaglio piu' lungo di una riga
// avrebbe fatto sembrare «diversa» una scheda identica.
function firmaScheda(scheda) {
  const CAMPI = ['Data|Date', 'Ora|Time', 'Da|From', 'Per|To', 'Pax', 'Nome|Name',
    'Fornitor\\w*|Supplier\\w*', 'Modalit[\u00e0a]|Mode', 'Tariffa|Fare', 'Acconto|Deposit',
    'Volo|Flight', 'Autista|Driver', 'Veicolo|Vehicle', 'Cell\\.?|Phone|Telefono', 'Note|Notes'];
  const out = [];
  for (const nomi of CAMPI) {
    const m = String(scheda || '').match(
      new RegExp('^[^\\p{L}\\n]*[ \\t]*(?:' + nomi + ')[ \\t]*:[ \\t]*(.*)$', 'imu'));
    let v = m ? String(m[1]) : '';
    v = v.replace(/\s*\ud83d\uddfa\ufe0f\s*Maps\s*/gu, ' ')     // la coda «🗺️ Maps»
         .replace(/<\/?[a-z][^>]*>/gi, '')                   // eventuale HTML
         .replace(/[\s\u00a0]+/g, ' ')
         .replace(/[\u2014\u2013-]\s*$/, '')
         .trim().toLowerCase();
    out.push(nomi.split('|')[0] + '=' + v);
  }
  return out.join('|');
}

// il registro com'era all'INIZIO del turno: quello che il gestionale aveva gia' confermato
const _salvate = {};
try {
  for (const r of $('Leggi Bozze').all()) {
    const d = r.json && (r.json.Dati ?? r.json.dati);
    if (!d) continue;
    const reg = JSON.parse(String(d)) || {};
    for (const id of Object.keys(reg)) {
      if (reg[id] && reg[id].st === 'salvata') _salvate[id] = String(reg[id].b || '');
    }
  }
} catch (e) {}

const chiusi = new Set();
const scelte = [];
const visti = new Set();
const ristampe = [];
for (const c of nelTurno.concat(nelMessaggio)) {
  if (visti.has(c.id) || chiusi.has(c.id)) continue;
  visti.add(c.id);
  if (Object.prototype.hasOwnProperty.call(_salvate, c.id)
      && firmaScheda(_salvate[c.id]) === firmaScheda(c.scheda)) {
    ristampe.push(c.id);   // gia' sul gestionale e identica: e' una ristampa, non si rimanda
    continue;
  }
  scelte.push(c);
}

const monche = scelte.filter((c) => !schedaCompleta(c.scheda));

let payload;
if (scelte.length && !monche.length) {
  payload = scelte.map((c) => c.scheda).join('\n\n ||| \n\n') + '\n\n[INTENT: ' + (intent || 'conferma') + ']';
} else {
  // Nessuna scheda riconosciuta, oppure una scheda esce monca: NON si manda il ritaglio.
  // Si manda tutto il testo, che i dati ce li ha. Il 19/08 il ritaglio monco ha scritto
  // due volte una riga senza data, ora, tratta e nome (esecuzioni 769028 e 769065).
  payload = [daModello, om, String(norm.text || '')].filter((s) => s && s.trim()).join('\n\n');
}

return [{ json: Object.assign({}, $json, {
  payload_salvataggio: payload,
  payload_schede: scelte.map((c) => c.id),
  payload_origine: (nelTurno.length ? 'turno' : '') + (nelMessaggio.length ? (nelTurno.length ? '+messaggio' : 'messaggio') : ''),
  payload_esclusi: [...chiusi],
  payload_monche: monche.map((c) => c.id),
  payload_ristampe: ristampe,
  payload_ritagliato: !!(scelte.length && !monche.length)
}) }];

