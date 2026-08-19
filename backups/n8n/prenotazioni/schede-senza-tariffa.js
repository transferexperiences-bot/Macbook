// === SCHEDE SENZA TARIFFA — 20/08/2026 ===
// Nodo: «Schede senza tariffa» in Prenotazioni Transfer 6.0, subito dopo «Code in JavaScript».
// Primo dei tre nodi che chiudono il buco della tariffa:
//   Schede senza tariffa  →  IF ce n'è almeno una  →  Calcola tariffa mancante  →  Rimetti le tariffe
//
// PERCHÉ. L'obbligo di calcolare il prezzo oggi vive nella descrizione del tool
// calcola_tariffa: «Chiamalo SEMPRE prima di mostrare la scheda». Sono parole, e le parole
// il modello le salta. Prova vera, esecuzione 760628 del 18/08 alle 21:20 (Tedi tour
// operator, tre transfer in un colpo): TRANSFER 1 con «Tariffa: 380», TRANSFER 2 e
// TRANSFER 3 senza nessuna riga Tariffa, intent «conferma» — cioè salvati a prezzo vuoto.
// In quell'esecuzione calcola_tariffa non è mai stato chiamato. È lo stesso guasto che
// CLAUDE.md elenca fra quelli verificati («schede salvate senza tariffa», 730883): quando
// le schede sono più d'una, il modello prezza la prima e si dimentica le altre.
//
// COSA FA. Legge le schede dal testo che il bot sta per mandare e tira fuori una riga di
// lavoro per ognuna che ha partenza e destinazione ma non ha un prezzo utilizzabile.
// Ogni riga porta i campi che «Calcola Tariffa Prenotazioni» (APv3ZqEizY1HnPia) si aspetta:
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
const testo = String(j.agent_output_clean || '');

// Una scheda è un pezzo di testo fra due «|||» che contiene un Id transfer.
const RX_ID = /TR[\/-]\d{8}[\/-][A-Za-z0-9-]{4,}|TR-\d{8}-[0-9a-f-]{8,}/;
const pezzi = testo.split(/\|\|\|/);

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

const lavori = [];
for (let i = 0; i < pezzi.length; i++) {
  const scheda = pezzi[i];
  if (!RX_ID.test(scheda)) continue;
  if (prezzoUtile(campo(scheda, 'Tariffa|Fare'))) continue;

  const da = campo(scheda, 'Da|From');
  const per = campo(scheda, 'Per|To');
  // Senza i due luoghi il listino non può dire niente: la scheda resta senza prezzo e se
  // ne occupa «Rimetti le tariffe», che la tiene ferma e fa una domanda sola.
  if (!da || !per || /da\s*definire/i.test(da) || /da\s*definire/i.test(per)) continue;

  lavori.push({ json: {
    __pezzo: i,
    __titolo: (scheda.match(/TRANSFER\s*\d+/i) || ['TRANSFER'])[0],
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
