// === BOTTONE ANNULLA DOPO UN SALVATAGGIO PARTITO DA SOLO — 20/08/2026 ===
// Nodo: «Bottone Annulla» in Prenotazioni Transfer 6.0, fra «Format Telegram Output (intent)»
// e «TG - Send Dynamic».
//
// Va a coppia con il nodo «Salva e mostra»: quando una scheda completa viene salvata senza
// chiedere conferma, il messaggio che arriva ad Agostino deve portarsi dietro il modo di
// disfare, altrimenti gli si toglie una domanda e gli si toglie anche il controllo.
// L'annullo passa dalla cancellazione morbida di sempre: Allert = Cancellato, mai delete.
//
// Se il salvataggio invece l'ha confermato lui, qui non si tocca niente.
const items = $input.all();

let diretto = false;
try { diretto = !!$('Salva e mostra').first().json.salvataggio_diretto; } catch (e) { diretto = false; }
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

// callback_data: massimo 64 byte (limite Telegram). Con un Id solo ci sta il comando
// preciso; con più Id si manda un comando che l'agente risolve sul messaggio, dove gli Id
// sono tutti scritti — meglio che troncarne uno a metà.
let testo, cb;
if (ids.length === 1) {
  testo = '🗑️ Annulla — non era giusto';
  cb = 'annulla ' + ids[0];
  if (cb.length > 64) cb = 'annulla l\'ultimo salvataggio';
} else {
  testo = '🗑️ Annulla tutti e ' + ids.length;
  cb = 'annulla gli ultimi ' + ids.length + ' transfer salvati';
}

items[0].json = Object.assign({}, items[0].json, {
  replyMarkupJson: JSON.stringify({ inline_keyboard: [[{ text: testo, callback_data: cb }]] })
});
return items;
