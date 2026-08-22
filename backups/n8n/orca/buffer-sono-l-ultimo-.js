// ============================================================================
// Agente Orchestratore (UAz4R93BWh9VuLiR) — nodo "Buffer - Sono l'ultimo?"
// ============================================================================
//
// PERCHÉ ESISTE.
//
// Orca non aveva NESSUN buffer: zero nodi di attesa o coda fra il trigger e
// l'agente. Ogni messaggio faceva partire la sua esecuzione e la sua risposta,
// senza sapere delle altre.
// Prova 1: 16/08 ore 17:10:21-22, CINQUE esecuzioni nello stesso secondo
//   (743895, 743896, 743897, 743898, 743899).
// Prova 2: 16/08 ore 19:10, sette messaggi di fila di Agostino («Sisi considera
//   250€ da 1h e 30…», «Compreso l'aperitivo», «Ok», «Allora domenica alle
//   12:00», «Domenica 23 alle 12;00», «1h e 30», «sisi») e sette risposte
//   separate, ognuna che chiedeva il contesto delle altre: «A cosa ti riferisci
//   con "sisi"?», «non ho contesto su questo "aperitivo"», «"1h e 30" durata di
//   cosa?». Il discorso era uno solo, spezzato in sette.
//
// COSA FA.
//
// È il buffer già in produzione su Prenotazioni Transfer 6.0 dal 15/08,
// copiato senza cambiarne la logica. Cambia solo la coda: tabella dati
// «Buffer Orca» (XzcR2xkW96NvCA7B) invece di «Buffer Prenotazioni». Devono
// restare separate: la chat di Agostino ha lo stesso id su tutti e due i bot,
// e una coda condivisa mescolerebbe i messaggi dei due.
//
// Le regole, in chiaro:
//   • UN ALLEGATO VA SEMPRE AVANTI. Non si ferma mai, non si butta mai: il suo
//     contenuto lo sa leggere solo il ramo che lo scarica.
//   • IL PRIMO ALLEGATO DEL GRUPPO SI PRENDE IL TESTO. I messaggi di testo
//     arrivati insieme diventano la sua didascalia, così l'agente vede la foto
//     e la frase nello stesso turno.
//   • UN TESTO SI FERMA solo se in coda c'è un allegato che se lo prenderà.
//     Se l'allegato è già passato (riga sparita), il testo va avanti da solo:
//     meglio una risposta in più che una frase lasciata cadere.
//   • FRA SOLI TESTI parla l'ultimo, con tutto unito.
//   • I click sui bottoni non passano di qui: devono restare immediati.
//
// Banco: banchi/te/banco-buffer-orca.js (i sette messaggi veri delle 19:10).
// ============================================================================
const mio = $('Telegram Trigger1').first().json;
const mioUpdate = Number(mio.update_id || 0);
const mioMsg = mio.message || {};
const sonoTesto = !!(mioMsg.text && String(mioMsg.text).trim());

const righe = $input.all()
  .map((i) => i.json)
  .filter((r) => r && r.updateid != null);

const testi = righe.filter((r) => r.genere === 'testo');
const media = righe.filter((r) => r.genere === 'media');

// ---------- caso 1: io sono un ALLEGATO ----------
if (!sonoTesto) {
  // solo il PRIMO allegato del gruppo si prende il testo: gli altri restano
  // allegati semplici, altrimenti la stessa frase finirebbe su ogni foto.
  const primoMedia = media.reduce(
    (m, r) => (m === null || Number(r.updateid) < Number(m) ? Number(r.updateid) : m), null);
  const sonoIlPrimo = (primoMedia === null || primoMedia === mioUpdate);

  const presi = sonoIlPrimo ? testi.slice().sort((a, b) => a.updateid - b.updateid) : [];
  const didascalia = [String(mioMsg.caption || '').trim()]
    .concat(presi.map((r) => String(r.testo || '').trim()))
    .filter(Boolean).join('\n');

  const messaggio = Object.assign({}, mioMsg);
  if (didascalia) messaggio.caption = didascalia;

  // si ripuliscono la mia riga e i testi che mi sono preso. MAI le righe degli
  // altri allegati: devono trovarle loro quando si svegliano.
  const daCancellare = presi.map((r) => r.id).concat(righe.filter((r) => Number(r.updateid) === mioUpdate).map((r) => r.id));

  return [{ json: {
    update_id: mioUpdate,
    message: messaggio,
    _buffer_uniti: presi.length + 1,
    _buffer_allegato: true,
    _da_cancellare: daCancellare.filter((x) => x != null)
  } }];
}

// ---------- caso 2: io sono TESTO ----------
// c'è un allegato in coda? allora se lo prende lui, io mi fermo in silenzio
if (media.length) return [];

// c'è un testo più recente del mio? parla lui
const piuRecente = testi.reduce((m, r) => Math.max(m, Number(r.updateid || 0)), 0);
if (piuRecente > mioUpdate) return [];

// sono l'ultimo: unisco i testi in ordine di arrivo
const ordinati = testi.slice().sort((a, b) => Number(a.updateid) - Number(b.updateid));
let testo = ordinati.map((r) => String(r.testo || '').trim()).filter(Boolean).join('\n');
if (!testo) testo = String(mioMsg.text || '').trim();   // rete di sicurezza

const messaggio = Object.assign({}, mioMsg, { text: testo });
return [{ json: {
  update_id: mioUpdate,
  message: messaggio,
  _buffer_uniti: ordinati.length || 1,
  _buffer_allegato: false,
  _da_cancellare: ordinati.map((r) => r.id).filter((x) => x != null)
} }];
