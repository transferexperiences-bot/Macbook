// === BOTTONE ANNULLA DOPO UN SALVATAGGIO PARTITO DA SOLO — 20/08/2026 ===
// Nodo: «Bottone Annulla» in Prenotazioni Transfer 6.0, fra «Format Telegram Output (intent)»
// e «TG - Send Dynamic».
//
// Va a coppia con la regola «salva e mostra» che sta dentro «Code in JavaScript»: quando una
// scheda completa viene salvata senza chiedere conferma, il messaggio che arriva ad Agostino
// deve portarsi dietro il modo di disfare, altrimenti gli si toglie una domanda e gli si
// toglie anche il controllo.
// L'annullo passa dalla cancellazione morbida di sempre: Allert = Cancellato, mai delete.
//
// Se il salvataggio invece l'ha confermato lui, qui non si tocca niente: il bottone
// comparirebbe su ogni conferma e diventerebbe rumore.
//
// Banco: banchi/te/banco-bottone-annulla.js
const items = $input.all();

let diretto = false;
try { diretto = !!$('Code in JavaScript').first().json.salvataggio_diretto; } catch (e) { diretto = false; }
if (!diretto || !items.length) return items;

// Gli Id da annullare sono quelli che il gestionale dice di aver scritto davvero,
// non quelli che il testo promette.
const ids = [];
try {
  for (const it of $('Salva via Parse transfer (intent)').all()) {
    const rows = it.json && it.json.rows;
    if (!rows) continue;
    const arr = typeof rows === 'string' ? JSON.parse(rows) : rows;
    for (const r of (Array.isArray(arr) ? arr : [arr])) {
      const id = String((r && (r.Id || r.id)) || '').replace(/<\/?code>/g, '').trim();
      if (id && ids.indexOf(id) === -1) ids.push(id);
    }
  }
} catch (e) {}
if (!ids.length) return items;

// callback_data: massimo 64 byte (limite Telegram).
//
// ⚠️ La parola conta. In questo bot «annulla» vuol dire «scarta la bozza, non salvarla» —
// è quello che fa il bottone ❌ Annulla accanto a Conferma. Ma qui la riga sul gestionale
// c'è GIÀ: se il comando dicesse «annulla», l'agente potrebbe limitarsi a buttare la bozza
// e lasciare la riga scritta. Il comando dice quindi «cancella», che è la strada della
// cancellazione morbida di sempre: Allert = Cancellato + nota ⛔, mai delete.
// Quello che Agostino LEGGE resta «Annulla»: è la parola sua.
const _byte = (s) => Buffer.byteLength(String(s), 'utf8');
const righe = [];

if (ids.length === 1) {
  const cb = 'cancella ' + ids[0];
  righe.push([{ text: '🗑️ Annulla — non era giusto',
                callback_data: _byte(cb) <= 64 ? cb : 'cancella l\'ultimo transfer salvato' }]);
} else if (ids.length <= 3) {
  // due o tre schede: un bottone per ognuna, con il suo Id preciso. Meglio tre bottoni
  // esatti di un comando solo che l'agente deve interpretare.
  ids.forEach((id, i) => {
    const cb = 'cancella ' + id;
    if (_byte(cb) <= 64) righe.push([{ text: '🗑️ Annulla il ' + (i + 1) + '°', callback_data: cb }]);
  });
  if (!righe.length) righe.push([{ text: '🗑️ Annulla tutti e ' + ids.length,
                                   callback_data: 'cancella gli ultimi ' + ids.length + ' transfer salvati' }]);
} else {
  righe.push([{ text: '🗑️ Annulla tutti e ' + ids.length,
                callback_data: 'cancella gli ultimi ' + ids.length + ' transfer salvati' }]);
}

items[0].json = Object.assign({}, items[0].json, {
  replyMarkupJson: JSON.stringify({ inline_keyboard: righe })
});
return items;
