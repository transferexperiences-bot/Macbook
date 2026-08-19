// === RIMETTI LE TARIFFE — 20/08/2026 ===
// Nodo: «Rimetti le tariffe» in Prenotazioni Transfer 6.0, fra «Calcola tariffa mancante»
// e «Switch (intent)». Terzo dei tre nodi che chiudono il buco della tariffa (il perché e
// la prova stanno in «Schede senza tariffa»).
//
// COSA FA. Prende i prezzi che «Calcola Tariffa Prenotazioni» ha appena calcolato e li
// scrive dentro le schede, al posto giusto: subito prima delle Note o dell'Id. Il numero
// viene dal listino, non dal modello — è la regola di CLAUDE.md: quello che conta lo
// produce il codice.
//
// IN TUTTI E TRE I TESTI. Il messaggio che Agostino legge (`agent_output_clean`, `telegram`)
// e la riga che finisce sul gestionale (`recap_verificato`) sono due testi diversi. Scrivere
// il prezzo solo nel primo vorrebbe dire mostrarlo e non salvarlo: mostrato ≠ salvato è la
// forma che questi guasti prendono sempre. Quindi la scheda si ritrova in ognuno dei tre —
// per Id, e se l'Id non c'è (il rientro) per tratta e ora — e il prezzo si scrive in tutti.
//
// E QUANDO IL LISTINO NON SA RISPONDERE. La scheda resta senza prezzo, e allora il
// salvataggio si ferma: si chiede il prezzo di QUELLA scheda e basta, non si richiede la
// conferma di tutto. Una riga salvata a prezzo vuoto è un guasto vero (760628 del 18/08:
// due transfer Tedi salvati senza tariffa); una domanda sola non lo è.
//
// Banco: banchi/te/banco-tariffe.js
const base = $('Guardia Data').first().json;

let lavori = [];
try { lavori = $('Schede senza tariffa').all().map((i) => i.json); } catch (e) { lavori = []; }
const risultati = $input.all().map((i) => i.json);

const RX_ID = /TR[\/-]\d{8}[\/-][A-Za-z0-9-]{4,}|TR-\d{8}-[0-9a-f-]{8,}/;
const RX_CAMPO = /^[^\p{L}\n]*(?:Data|Date|Ora|Orario|Time|Da|From|Per|To|Pax|Nome|Name|Email|Cell\.?|Telefono|Phone|Volo|Flight|Fornitor\w*|Modalit[àa]|Tariffa|Fare|Acconto|Note|Notes|Autista|Driver|Veicolo|Vehicle|h\s*extra|Fee|Id|Andata)[ \t]*:/iu;
const RX_TITOLO = /^[^\p{L}\n]*(?:TRANSFER|RIENTRO|ANDATA|RITORNO)\b/iu;

function campo(scheda, nomi) {
  const m = String(scheda).match(
    new RegExp('(?:^|\\n)[^\\p{L}\\n]*(?:' + nomi + ')[ \\t]*:[ \\t]*([^\\n]*)', 'iu'));
  return m ? String(m[1]).trim() : '';
}
function prezzoUtile(v) {
  const s = String(v || '').trim();
  if (!s) return 0;
  if (/da\s*definire|^[—\-–]$|^n\/?a$/i.test(s)) return 0;
  const m = s.replace(/\./g, '').match(/(\d+(?:,\d+)?)/);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(',', '.'));
  return isNaN(n) || n <= 0 ? 0 : n;
}
// Locale italiano: i decimali vogliono la virgola.
function scrivi(n) {
  const t = Math.round(n * 100) / 100;
  return (t % 1 === 0 ? String(t) : t.toFixed(2).replace('.', ',')) + '€';
}
function èScheda(s) {
  if (RX_ID.test(s)) return true;
  return !!(campo(s, 'Data|Date') && campo(s, 'Da|From') && campo(s, 'Per|To'));
}

// Dove comincia e dove finisce la scheda che contiene la riga `ancora`: si allarga finché
// le righe sono campi o titolo della scheda, e ci si ferma su una riga vuota, su un «|||»
// o sul titolo (che però fa parte della scheda).
function blocco(righe, ancora) {
  let a = ancora, b = ancora;
  while (a > 0) {
    const r = righe[a - 1];
    if (!r.trim() || /\|\|\|/.test(r)) break;
    a--;
    if (RX_TITOLO.test(r)) break;
    if (!RX_CAMPO.test(r)) break;
  }
  while (b < righe.length - 1) {
    const r = righe[b + 1];
    if (!r.trim() || /\|\|\|/.test(r)) break;
    if (!RX_CAMPO.test(r) && !RX_TITOLO.test(r)) break;
    b++;
  }
  return [a, b];
}

// La riga da cui riconosco la scheda dentro un testo qualunque: l'Id se c'è, altrimenti
// la partenza — verificata dalla destinazione e dall'ora lì vicino, così due schede della
// stessa tratta in giorni diversi non si scambiano il prezzo.
function ancoraDi(righe, L) {
  if (L.__id) {
    for (let i = 0; i < righe.length; i++) if (righe[i].indexOf(L.__id) !== -1) return i;
    return -1;
  }
  for (let i = 0; i < righe.length; i++) {
    if (campo(righe[i], 'Da|From') !== L.da) continue;
    const [a, b] = blocco(righe, i);
    const s = righe.slice(a, b + 1).join('\n');
    if (campo(s, 'Per|To') === L.per && (!L.__ora || campo(s, 'Ora|Orario|Time') === L.__ora)) return i;
  }
  return -1;
}

// Scrive il prezzo dentro la scheda, dove Agostino se lo aspetta: prima delle Note, e
// comunque prima dell'Id, che chiude sempre la scheda.
function mettiPrezzo(testo, L, tariffa) {
  const t = String(testo || '');
  if (!t) return { testo: t, messo: false };
  const righe = t.split('\n');
  const anc = ancoraDi(righe, L);
  if (anc < 0) return { testo: t, messo: false };
  const [a, b] = blocco(righe, anc);
  const dentro = righe.slice(a, b + 1);
  if (prezzoUtile(campo(dentro.join('\n'), 'Tariffa|Fare'))) return { testo: t, messo: false };

  let dove = dentro.findIndex((r) => /^[^\p{L}\n]*(?:Note|Notes)[ \t]*:/iu.test(r));
  if (dove < 0) dove = dentro.findIndex((r) => /^[^\p{L}\n]*Id[ \t]*:/iu.test(r));
  if (dove < 0) dove = dentro.length;
  righe.splice(a + dove, 0, '💰 Tariffa: ' + scrivi(tariffa));
  return { testo: righe.join('\n'), messo: true };
}

// I tre testi: quello che si mostra, quello che Telegram manda, quello che si salva.
let mostrato = String(base.agent_output_clean || '');
let telegram = String((base.telegram && base.telegram.text) || '');
let salvato = String(base.recap_verificato || '');
const messi = [];

// I risultati arrivano nello stesso ordine dei lavori: «Calcola tariffa mancante» gira in
// modalità «each», un'esecuzione per riga di lavoro.
for (let k = 0; k < lavori.length; k++) {
  const L = lavori[k];
  if (!L || L.__niente) continue;
  const r = risultati[k] || {};
  const tariffa = (r.status === 'ok') ? prezzoUtile(r.tariffa) : 0;
  if (!tariffa) continue;

  const m1 = mettiPrezzo(mostrato, L, tariffa); mostrato = m1.testo;
  const m2 = mettiPrezzo(telegram, L, tariffa); telegram = m2.testo;
  const m3 = mettiPrezzo(salvato, L, tariffa); salvato = m3.testo;
  if (m1.messo || m2.messo || m3.messo) {
    messi.push({ titolo: L.__titolo, tariffa: tariffa, listino: r.listino || '',
                 modo: r.modo || '', da: L.da, per: L.per, anche_nel_salvataggio: m3.messo });
  }
}

let intent = String(base.intent || 'chat');
const staSalvando = (intent === 'conferma' || intent === 'save_pending' || intent === 'modifica');

// Chi è rimasto senza prezzo, dopo aver messo tutto quello che il listino sapeva dire.
// Si guarda il testo che conta: quello che si salva, se si sta salvando.
const senza = [];
for (const scheda of String((staSalvando && salvato) || mostrato).split(/\|\|\|/)) {
  if (!èScheda(scheda)) continue;
  if (prezzoUtile(campo(scheda, 'Tariffa|Fare'))) continue;
  senza.push({
    titolo: (scheda.match(/TRANSFER\s*\d+|RIENTRO/i) || ['questa scheda'])[0],
    da: campo(scheda, 'Da|From'), per: campo(scheda, 'Per|To')
  });
}

if (messi.length) {
  const coda = '\n\n💰 Prezzo dal listino: '
    + messi.map((m) => m.titolo.replace(/TRANSFER\s*/i, 'T') + ' ' + scrivi(m.tariffa)).join(' · ');
  mostrato += coda;
  if (telegram) telegram += coda;
}

let replyMarkupJson = base.replyMarkupJson || null;
let salvataggioDiretto = !!base.salvataggio_diretto;
if (senza.length && staSalvando) {
  // Non si salva una riga a prezzo vuoto. Si chiede solo il prezzo che manca.
  intent = 'chat';
  salvataggioDiretto = false;
  replyMarkupJson = null;
  const domanda = '\n\n⛔ Manca il prezzo, il listino non lo copre:\n'
    + senza.map((s) => '· ' + s.titolo + ' — ' + (s.da || '?') + ' → ' + (s.per || '?')).join('\n')
    + '\n\nDimmi quanto e salvo tutto.';
  mostrato += domanda;
  if (telegram) telegram += domanda;
}

const fuori = Object.assign({}, base, {
  agent_output_clean: mostrato,
  intent: intent,
  replyMarkupJson: replyMarkupJson,
  salvataggio_diretto: salvataggioDiretto,
  tariffe_calcolate: messi,
  tariffe_mancanti: senza
});
if (base.telegram) fuori.telegram = Object.assign({}, base.telegram, { text: telegram });
if (base.recap_verificato) fuori.recap_verificato = salvato;
return [{ json: fuori }];
