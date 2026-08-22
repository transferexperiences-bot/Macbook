// === SCHEDE SENZA TARIFFA — 20/08/2026 ===
// Nodo: «Schede senza tariffa» in Prenotazioni Transfer 6.0, fra «Guardia Data» e
// «Switch (intent)». Primo dei tre nodi che chiudono il buco della tariffa:
//   Guardia Data → Schede senza tariffa → IF ci sono tariffe da calcolare?
//        ├─ sì → Calcola tariffa mancante (Calcola Tariffa Prenotazioni) → Rimetti le tariffe
//        └─ no ────────────────────────────────────────────────────────→ Rimetti le tariffe
//   Rimetti le tariffe → Switch (intent)
//
// PERCHÉ QUI E NON PRIMA. È «Guardia Data» a produrre `recap_verificato`, cioè il testo che
// finisce davvero sul gestionale. Mettere il prezzo prima vorrebbe dire scriverlo solo nel
// messaggio che Agostino legge e non nella riga che si salva: mostrato ≠ salvato, che è
// esattamente il modo in cui questi guasti nascono.
//
// PERCHÉ DEL TUTTO. L'obbligo di calcolare il prezzo oggi vive nella descrizione del tool
// calcola_tariffa: «Chiamalo SEMPRE prima di mostrare la scheda». Sono parole, e le parole
// il modello le salta. Prova vera, esecuzione 760628 del 18/08 alle 21:20 (Tedi tour
// operator, tre transfer in un colpo): TRANSFER 1 con «Tariffa: 380», TRANSFER 2 e
// TRANSFER 3 senza nessuna riga Tariffa, intent «conferma» — cioè salvati a prezzo vuoto.
// In quell'esecuzione calcola_tariffa non è mai stato chiamato. È lo stesso guasto che
// CLAUDE.md elenca fra quelli verificati («schede salvate senza tariffa», 730883): quando
// le schede sono più d'una, il modello prezza la prima e si dimentica le altre.
//
// COSA FA. Legge le schede dal testo che sta per essere salvato e tira fuori una riga di
// lavoro per ognuna che ha partenza e destinazione ma non ha un prezzo utilizzabile. Ogni
// riga porta i campi che «Calcola Tariffa Prenotazioni» (APv3ZqEizY1HnPia) si aspetta:
// da, per, pax, veicolo, fornitore, orario. Il prezzo non lo decide questo nodo: lo decide
// il listino, che è codice e foglio, non parole del modello.
//
// Se non manca niente esce comunque un item solo, con __niente = true, così la catena a
// valle non si spezza (in n8n un nodo senza item in ingresso non parte).
//
// Banco: banchi/te/banco-tariffe.js
const j = (typeof $input !== 'undefined' && $input.first && $input.first().json)
  ? $input.first().json
  : (typeof $json !== 'undefined' ? $json : {});

// Si guarda il testo che si SALVA. Quando non c'è (non si sta salvando) si guarda quello
// che si mostra: il prezzo va messo lì comunque, prima che Agostino approvi una scheda muta.
const testo = String(j.recap_verificato || j.agent_output_clean || '');

// Le etichette arrivano precedute da un'emoji («💰 Tariffa: 60»): davanti ai due punti si
// accetta qualunque cosa non sia una lettera. Dopo i due punti si guarda solo la RIGA:
// \s comprende il newline, e con \s* un campo vuoto sembrerebbe pieno perché il controllo
// salterebbe alla riga dopo.
function campo(scheda, nomi) {
  const m = String(scheda).match(
    new RegExp('(?:^|\\n)[^\\p{L}\\n]*(?:' + nomi + ')[ \\t]*:[ \\t]*([^\\n]*)', 'iu'));
  return m ? String(m[1]).trim() : '';
}

// Un prezzo c'è davvero solo se è un numero maggiore di zero. «DA DEFINIRE», «—», «0»
// e la riga vuota valgono tutti come prezzo mancante.
function prezzoUtile(v) {
  const s = String(v || '').trim();
  if (!s) return 0;
  if (/da\s*definire|^[—\-–]$|^n\/?a$/i.test(s)) return 0;
  const m = s.replace(/\./g, '').match(/(\d+(?:,\d+)?)/);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(',', '.'));
  return isNaN(n) || n <= 0 ? 0 : n;
}

// Una scheda è un pezzo di testo fra due «|||» con dentro un Id transfer, oppure — ed è il
// caso del rientro, che l'Id non ce l'ha ancora — con dentro Data, Da e Per.
// Esecuzione 768734 del 19/08: «🔄 RIENTRO da preparare», nessun Id, ma è una scheda a
// tutti gli effetti e finirà sul gestionale.
const RX_ID = /TR[\/-]\d{8}[\/-][A-Za-z0-9-]{4,}|TR-\d{8}-[0-9a-f-]{8,}/;
function èScheda(s) {
  if (RX_ID.test(s)) return true;
  return !!(campo(s, 'Data|Date') && campo(s, 'Da|From') && campo(s, 'Per|To'));
}

// Un luogo è un luogo solo se è un posto. Nelle chat vere capita che al suo posto ci sia
// un trattino o una frase che dice che il posto non c'è («manca luogo di partenza
// specifico», «(da confermare)»): mandarla al listino vuol dire farsi rispondere un
// prezzo su niente.
function luogoUtile(v) {
  const s = String(v || '').trim();
  if (s.length < 2) return false;
  if (/^[^\p{L}\p{N}]+$/u.test(s)) return false;
  if (/da\s*definire|da\s*confermare|manca\b|non\s+(?:specificat|indicat|nota)|sconosciut|precisare|\bTBD\b|\?\?/i.test(s)) return false;
  return true;
}

const lavori = [];
const pezzi = testo.split(/\|\|\|/);
for (let i = 0; i < pezzi.length; i++) {
  const scheda = pezzi[i];
  if (!èScheda(scheda)) continue;
  if (prezzoUtile(campo(scheda, 'Tariffa|Fare'))) continue;

  const da = campo(scheda, 'Da|From');
  const per = campo(scheda, 'Per|To');
  // Senza i due luoghi il listino non può dire niente: la scheda resta senza prezzo e se
  // ne occupa «Rimetti le tariffe», che la tiene ferma e fa una domanda sola.
  if (!luogoUtile(da) || !luogoUtile(per)) continue;

  lavori.push({ json: {
    // Come ritrovare QUESTA scheda dentro gli altri testi (quello mostrato e quello
    // salvato non sono lo stesso testo): prima per Id, e se non ce l'ha per tratta e ora.
    __id: (scheda.match(RX_ID) || [''])[0],
    __titolo: (scheda.match(/TRANSFER\s*\d+|RIENTRO/i) || ['la scheda'])[0],
    __ora: campo(scheda, 'Ora|Orario|Time'),
    da: da,
    per: per,
    pax: campo(scheda, 'Pax|Passeggeri') || '1',
    veicolo: campo(scheda, 'Veicolo|Auto'),
    fornitore: campo(scheda, 'Fornitori|Fornitore'),
    orario: campo(scheda, 'Ora|Orario|Time'),
    hextra: campo(scheda, 'h extra|ore extra')
  } });
}

if (!lavori.length) return [{ json: { __niente: true } }];
return lavori;
