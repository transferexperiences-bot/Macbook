// GUARDIA SALVATAGGIO — 21/08/2026
// Nodo: fra «Format Telegram Output (intent)» e «TG - Send Dynamic», workflow
// Prenotazioni Transfer 6.0.
//
// Nasce dall'esecuzione 777940 del 21/08 alle 07:51:59. Agostino preme «💾 Salva subito»
// su un rientro. Parse transfer legge bene il transfer (21/08, 14:15, Cala Ponte Marina →
// Masseria Tarsia Morisco, 50, Incassare) ma con Id vuoto, e il gestionale risponde
// `rows: []`: NON HA SCRITTO NIENTE. Il bot gli manda lo stesso:
//     «✅ Conferma transfer — 💶 Tariffa: ⚠️ DA DEFINIRE»
// senza data, senza tratta, senza codice. Il transfer delle 14:15 di quel giorno non
// esisteva da nessuna parte, e lui credeva di averlo salvato.
//
// Due guasti in uno, e questo nodo li chiude tutti e due.
//
// (1) «Mai dichiarare un salvataggio che non è avvenuto». Se la ricevuta del gestionale
//     dice zero righe, la parola «Conferma» non si può usare.
//
// (2) La tariffa sparita. Quando la ricevuta è vuota, «Format Telegram Output (intent)»
//     ripiega su un parser che legge i campi dalla scheda con la regex `^\s*Tariffa\s*:`.
//     Le schede però cominciano con un'emoji («💰 Tariffa: 50,00€») e `\s` l'emoji non la
//     mangia: nessun campo combacia, e la tariffa — che era lì, scritta — esce
//     «⚠️ DA DEFINIRE». Stessa sorte per Data, Ora, Da, Per, Id. Qui i campi si leggono
//     con `[^\p{L}\n]*`, che è la forma già usata in tutto il resto del workflow.
//
// La guardia interviene SOLO quando sa per certo che le righe scritte sono zero. Se la
// ricevuta non si riesce a leggere, o il nodo del salvataggio non ha girato in questo
// giro, non tocca niente: meglio lasciare passare il messaggio di prima che inventarne
// uno sbagliato.
//
// Banco: banchi/te/banco-guardia-salvataggio.js (dati veri di 777940 e 777827).
const items = $input.all();

// ---- quante righe dice di aver scritto il gestionale ----
// -1 = non lo so. In quel caso non si tocca niente.
let righeScritte = -1;
try {
  let n = 0;
  for (const it of $('Salva via Parse transfer (intent)').all()) {
    const raw = it.json && it.json.rows;
    if (raw === undefined || raw === null) continue;
    const arr = typeof raw === 'string' ? (raw.trim() ? JSON.parse(raw) : []) : raw;
    if (Array.isArray(arr)) n += arr.length;
    else n += 1;
  }
  righeScritte = n;
} catch (e) { righeScritte = -1; }

// ---- caso 1: ha scritto, ma la riga è monca ------------------------------------
// 21/08/2026, esecuzione 779301. Agostino manda un vocale: «Segna il transfer ORA da
// Auraterrae…». La trascrizione consegna «Segnal transfer URA da Auratier…» — la parola
// «ora» è finita dentro «transfer URA». L'agente scrive Nome: URA e lascia Data e Ora
// VUOTE, poi salva: riga 1271 sul gestionale con Data "" e Time "".
// A lui arriva «✅ Conferma transfer», senza un accenno.
// Una riga senza data non compare in NESSUNA lista del giorno: nessun autista la vede.
//
// Il sistema lo sapeva già in due punti e ha scritto lo stesso:
//   · «Componi Payload Salvataggio» aveva calcolato payload_monche con dentro quell'Id;
//   · «Validate Fields» in Parse transfer aveva _missingFields: ["Data","Ora"].
// Nessuno dei due valori viene letto da qualcuno.
//
// Qui NON si blocca il salvataggio: in «Validate Fields» c'è una decisione esplicita del
// 02/05/2026 — «NON scartare mai: meglio salvare un transfer incompleto e correggerlo a
// mano che droppare silenziosamente e perdere dati». Quella decisione però dà per scontato
// che Agostino SAPPIA che è incompleto. Quello che mancava non era il blocco: era dirlo.
// E non si riempie Data/Ora da soli: sarebbe indovinare su un dato suo.
if (righeScritte > 0) {
  const monche = [];
  try {
    for (const it of $('Salva via Parse transfer (intent)').all()) {
      const raw = it.json && it.json.rows;
      if (!raw) continue;
      const arr = typeof raw === 'string' ? (raw.trim() ? JSON.parse(raw) : []) : raw;
      for (const r of (Array.isArray(arr) ? arr : [arr])) {
        if (!r) continue;
        const data = String(r.Data || r.data || '').trim();
        const ora = String(r.Time || r.Ora || r.ora || '').trim();
        if (data && ora) continue;
        monche.push({
          id: String(r.Id || r.id || '').trim(),
          manca: (!data && !ora) ? 'data e ora' : (!data ? 'la data' : 'l\'ora'),
          da: String(r['Transfer > Da'] || r.Transfer_Da || '').trim(),
          per: String(r['Transfer < Per'] || r.Transfer_Per || '').trim(),
        });
      }
    }
  } catch (e) { return items; }

  if (!monche.length) return items;

  const avviso = monche.map((m) => {
    const tratta = [m.da, m.per].filter(Boolean).join(' → ');
    return '⚠️ <b>Salvato senza ' + m.manca + '</b>'
      + (tratta ? ' — ' + tratta : '')
      + '\nNon comparirà in nessuna lista del giorno.'
      + (m.id ? '\n<code>' + m.id + '</code>' : '');
  }).join('\n\n');

  const coda = '\n\nScrivi «ora» per mettere adesso, oppure dimmi giorno e ora.';
  const primo = (items[0] && items[0].json) || {};
  const testoPrima = (primo.telegram && primo.telegram.text) || '';

  return items.map((it, i) => {
    if (i !== 0) return it;
    const j = Object.assign({}, it.json || {});
    j.telegram = Object.assign({}, j.telegram, {
      text: avviso + coda + (testoPrima ? '\n\n' + testoPrima : ''),
      parse_mode: (j.telegram && j.telegram.parse_mode) || 'HTML',
    });
    j.salvataggio_monco = monche.map((m) => m.id).filter(Boolean);
    return { json: j };
  });
}

if (righeScritte !== 0) return items;

// ---- da qui in giù: il gestionale non ha scritto niente ----
const norm = $('Normalizer (kind/text/file_id)').first().json || {};
const scheda = String(norm.originalMessageText || '');

// I campi si leggono tollerando l'emoji davanti: è questo il punto che mangiava la tariffa.
// In coda alle righe dei luoghi il workflow appiccica «  🗺️ Maps»: quello si toglie.
function campo(nomi) {
  const re = new RegExp('^[^\\p{L}\\n]*[ \\t]*(?:' + nomi + ')[ \\t]*:[ \\t]*(.+?)[ \\t]*$', 'imu');
  const m = scheda.match(re);
  if (!m) return '';
  return String(m[1]).replace(/\s*🗺️\s*Maps\s*$/u, '').trim();
}

const data = campo('Data|Date');
const ora = campo('Ora|Time');
const da = campo('Da|From');
const per = campo('Per|To');
const tariffa = campo('Tariffa|Fare');
const nome = campo('Nome|Name');
const fornitore = campo('Fornitor\\w*|Supplier\\w*');
const id = campo('Id');

const righe = ['⚠️ <b>NON SALVATO</b> — il gestionale non ha scritto nessuna riga.', ''];
if (data) righe.push('📅 ' + data + (ora ? ' alle ' + ora : ''));
if (da) righe.push('📍 Da: ' + da);
if (per) righe.push('🎯 A: ' + per);
if (nome) righe.push('👤 ' + nome);
if (fornitore) righe.push('🏢 ' + fornitore);
// la tariffa si scrive SOLO se c'era davvero: se manca si dice che manca, non si inventa
if (tariffa) righe.push('💶 Tariffa: ' + tariffa);
else righe.push('💶 Tariffa: — (non c\'era nemmeno nella scheda)');
if (id) righe.push('', '<i>Id della scheda:</i> <code>' + id + '</code>');

righe.push('');
righe.push(id
  ? 'Il salvataggio è tornato indietro a mani vuote. Dimmi «riprova» e lo rifaccio.'
  : 'La scheda non porta nessun Id e il salvataggio non ne ha generato uno: senza Id il '
    + 'gestionale non scrive la riga. Dimmi «riprova» e lo rifaccio, ma controlla a mano '
    + 'prima di darlo per fatto.');

const testo = righe.join('\n');
const base = (items[0] && items[0].json) || {};
return [{ json: Object.assign({}, base, {
  telegram: { text: testo, parse_mode: 'HTML' },
  replyMarkupJson: null,
  salvataggio_a_vuoto: true,
}) }];
