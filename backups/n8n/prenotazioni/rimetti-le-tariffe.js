// === RIMETTI LE TARIFFE — 20/08/2026 ===
// Nodo: «Rimetti le tariffe» in Prenotazioni Transfer 6.0, terzo dei tre nodi che chiudono
// il buco della tariffa (vedi «Schede senza tariffa» per il perché e per la prova).
//
// COSA FA. Prende i prezzi che «Calcola Tariffa Prenotazioni» ha appena calcolato e li
// scrive dentro le schede, al posto giusto: subito prima delle Note o dell'Id. Il numero
// viene dal listino, non dal modello — è la regola di CLAUDE.md: quello che conta lo
// produce il codice.
//
// E QUANDO IL LISTINO NON SA RISPONDERE. La scheda resta senza prezzo, e allora il
// salvataggio si ferma: si chiede il prezzo di QUELLA scheda e basta, non si richiede la
// conferma di tutto. Una riga salvata a prezzo vuoto è un guasto vero (760628 del 18/08:
// due transfer Tedi salvati senza tariffa); una domanda sola non lo è.
//
// Banco: banchi/te/banco-tariffe.js
const base = $('Code in JavaScript').first().json;
const testo0 = String(base.agent_output_clean || '');

let lavori = [];
try { lavori = $('Schede senza tariffa').all().map((i) => i.json); } catch (e) { lavori = []; }
const risultati = $input.all().map((i) => i.json);

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

const RX_ID = /TR[\/-]\d{8}[\/-][A-Za-z0-9-]{4,}|TR-\d{8}-[0-9a-f-]{8,}/;
const pezzi = testo0.split(/\|\|\|/);
const messi = [];

// I risultati arrivano nello stesso ordine dei lavori: il nodo «Calcola tariffa mancante»
// gira in modalità «each», un'esecuzione per riga di lavoro.
for (let k = 0; k < lavori.length; k++) {
  const L = lavori[k];
  if (!L || L.__niente) continue;
  const r = risultati[k] || {};
  const tariffa = (r.status === 'ok') ? prezzoUtile(r.tariffa) : 0;
  if (!tariffa) continue;

  const i = L.__pezzo;
  if (typeof pezzi[i] !== 'string') continue;
  const righe = pezzi[i].split('\n');
  // Il posto della tariffa è dove Agostino se l'aspetta: prima delle Note, e comunque
  // prima dell'Id, che chiude sempre la scheda.
  let dove = righe.findIndex((r2) => /^[^\p{L}\n]*(?:Note|Notes)[ \t]*:/iu.test(r2));
  if (dove < 0) dove = righe.findIndex((r2) => /^[^\p{L}\n]*Id[ \t]*:/iu.test(r2));
  if (dove < 0) dove = righe.length;
  righe.splice(dove, 0, '💰 Tariffa: ' + scrivi(tariffa));
  pezzi[i] = righe.join('\n');
  messi.push({
    titolo: L.__titolo, tariffa: tariffa,
    listino: r.listino || '', modo: r.modo || '', da: L.da, per: L.per
  });
}

let testo = pezzi.join('|||');

// Chi è rimasto senza prezzo, dopo aver messo tutto quello che il listino sapeva dire.
const senza = [];
for (const scheda of testo.split(/\|\|\|/)) {
  if (!RX_ID.test(scheda)) continue;
  if (prezzoUtile(campo(scheda, 'Tariffa|Fare'))) continue;
  senza.push({
    titolo: (scheda.match(/TRANSFER\s*\d+/i) || ['questa scheda'])[0],
    da: campo(scheda, 'Da|From'), per: campo(scheda, 'Per|To')
  });
}

if (messi.length) {
  testo += '\n\n💰 Prezzo dal listino: '
    + messi.map((m) => m.titolo.replace(/TRANSFER\s*/i, 'T') + ' ' + scrivi(m.tariffa)).join(' · ');
}

let intent = String(base.intent || 'chat');
let replyMarkupJson = base.replyMarkupJson || null;
let salvataggioDiretto = !!base.salvataggio_diretto;

const staSalvando = (intent === 'conferma' || intent === 'save_pending');
if (senza.length && staSalvando) {
  // Non si salva una riga a prezzo vuoto. Si chiede solo il prezzo che manca.
  intent = 'chat';
  salvataggioDiretto = false;
  replyMarkupJson = null;
  testo += '\n\n⛔ Manca il prezzo, il listino non lo copre:\n'
    + senza.map((s) => '· ' + s.titolo + ' — ' + (s.da || '?') + ' → ' + (s.per || '?')).join('\n')
    + '\n\nDimmi quanto e salvo tutto.';
}

return [{ json: Object.assign({}, base, {
  agent_output_clean: testo,
  telegram: { text: testo, parse_mode: 'HTML' },
  intent: intent,
  replyMarkupJson: replyMarkupJson,
  salvataggio_diretto: salvataggioDiretto,
  tariffe_calcolate: messi,
  tariffe_mancanti: senza
}) }];
