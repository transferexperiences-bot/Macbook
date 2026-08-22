// ============================================================================
// BOZZE — CHIEDI COSA SALVARE  ·  14/08/2026
// Nasce dal 14/08 sera: l'agente ha salvato 1 transfer su 3 e ha scritto gli altri
// due in una riga di prosa («⏳ In sospeso: …»). Quella riga si legge e si dimentica.
// Da qui in poi, se dopo un salvataggio restano bozze aperte, arriva un messaggio a
// parte con i BOTTONI: quale salvare, tutte, o scartare. Niente prosa da interpretare.
// Il messaggio è volutamente COMPATTO (una riga per bozza, nessuna riga «Campo:»):
// così non viene scambiato per una scheda né da Aggiorna Bozze né da Componi Payload
// Salvataggio. Le schede vere le rimette l'agente quando premi un bottone.
// ============================================================================
const src = $('Aggiorna Bozze').first().json;
const bozze = Array.isArray(src.bozze) ? src.bozze : [];

// si parla solo dopo un turno di salvataggio, e solo se è rimasto qualcosa fuori
if (!src.salvando || bozze.length === 0) return [];

function campo(scheda, nomi) {
  const re = new RegExp('^[^\\p{L}\\n]*\\s*(?:' + nomi + ')\\s*:\\s*(.+)$', 'iu');
  for (const riga of String(scheda || '').split('\n')) {
    const m = riga.match(re);
    if (m && m[1].trim()) return m[1].trim();
  }
  return '';
}
function taglia(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

const NUM = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
const MAX = 10;                       // oltre 10 bottoni la tastiera diventa illeggibile
const mostrate = bozze.slice(0, MAX);

const righe = [];
const tastiera = [];
mostrate.forEach((b, i) => {
  const data = campo(b.scheda, 'Data|Date').replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  const ora  = campo(b.scheda, 'Ora|Time');
  const per  = campo(b.scheda, 'Per|To|Transfer\\s*<\\s*Per');
  const nome = campo(b.scheda, 'Nome|Name');
  const tar  = campo(b.scheda, 'Tariffa|Fare');
  const pezzi = [data, ora, per, nome, tar ? tar.replace(/\s*€?$/, '') + '€' : ''].filter(Boolean);
  righe.push(`${NUM[i]} ${pezzi.join(' · ')}`);
  // etichetta del bottone: ora + destinazione, quel che basta a riconoscerla
  const etichetta = taglia([ora, per || nome].filter(Boolean).join(' ') || 'questa', 26);
  // callback_data: massimo 64 byte (limite Telegram)
  const cb = ('salva ' + b.id).slice(0, 64);
  tastiera.push([{ text: `${NUM[i]} Salva ${etichetta}`, callback_data: cb }]);
});

if (bozze.length > mostrate.length) {
  righe.push(`… e altre ${bozze.length - mostrate.length}`);
}
if (bozze.length > 1) {
  tastiera.push([{ text: `💾 Salva tutte e ${bozze.length}`, callback_data: 'salva tutte le bozze in sospeso' }]);
}
tastiera.push([{ text: '🗑️ Scarta tutte', callback_data: 'annulla tutte le bozze' }]);

const testo = [
  bozze.length === 1
    ? '⏳ <b>Resta 1 bozza aperta</b> — sul gestionale non c\'è.'
    : `⏳ <b>Restano ${bozze.length} bozze aperte</b> — sul gestionale non ci sono.`,
  '',
  righe.join('\n'),
  '',
  'Che faccio?'
].join('\n');

return [{ json: {
  chat_id: src.chat_id,
  telegram: { text: testo, parse_mode: 'HTML' },
  replyMarkupJson: JSON.stringify({ inline_keyboard: tastiera }),
  n_bozze: bozze.length
} }];
