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
// 22/08/2026 — la TRATTA INTERA, non solo l'arrivo.
// Il 22/08 alle 16:40 (esecuzione 788007) restava aperta l'andata di un andata/ritorno in
// tuk-tuk e qui c'era scritto «15:30 · Cala Ponte Marina»: solo la destinazione. Su un
// andata/ritorno le due tratte hanno gli stessi due posti scambiati, quindi la riga
// somigliava al transfer appena salvato e Agostino non capiva quale fosse la bozza.
// Da qui in poi si scrive «Da → Per», che le distingue sempre.
mostrate.forEach((b, i) => {
  const data = campo(b.scheda, 'Data|Date').replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  const ora  = campo(b.scheda, 'Ora|Time');
  const da   = campo(b.scheda, 'Da|From|Transfer\\s*>\\s*Da');
  const per  = campo(b.scheda, 'Per|To|Transfer\\s*<\\s*Per');
  const nome = campo(b.scheda, 'Nome|Name');
  const tar  = campo(b.scheda, 'Tariffa|Fare');
  const tratta = [da, per].filter(Boolean).join(' → ');
  const pezzi = [data, ora, tratta, nome, tar ? tar.replace(/\s*€?$/, '') + '€' : ''].filter(Boolean);
  // etichetta del bottone: ora + tratta, quel che basta a riconoscerla
  const etichetta = taglia([ora, tratta || nome].filter(Boolean).join(' ') || 'questa', 34);
  if (b.tipo === 'richiesta') {
    // Descritta ma senza scheda (22/08, richiesta di Davide): non si puo salvare com'e,
    // mancano dei dati. Il bottone la rimette in mano all'agente, non al gestionale.
    righe.push(`${NUM[i]} 📌 ${pezzi.join(' · ')} — richiesta, manca ancora qualcosa`);
    tastiera.push([{ text: `${NUM[i]} Riprendi ${etichetta}`, callback_data: ('riprendi ' + b.id).slice(0, 64) }]);
    return;
  }
  righe.push(`${NUM[i]} ${pezzi.join(' · ')}` + (b.da_verificare ? '  ❓ spedita, non confermata' : ''));
  // callback_data: massimo 64 byte (limite Telegram)
  const cb = ('salva ' + b.id).slice(0, 64);
  tastiera.push([{ text: `${NUM[i]} Salva ${etichetta}`, callback_data: cb }]);
});

if (bozze.length > mostrate.length) {
  righe.push(`… e altre ${bozze.length - mostrate.length}`);
}
// «Salva tutte» conta solo quelle davvero salvabili: una richiesta senza scheda non lo e.
const salvabili = bozze.filter((b) => b.tipo !== 'richiesta').length;
if (salvabili > 1) {
  tastiera.push([{ text: `💾 Salva tutte e ${salvabili}`, callback_data: 'salva tutte le bozze in sospeso' }]);
}
tastiera.push([{ text: '🗑️ Scarta tutte', callback_data: 'annulla tutte le bozze' }]);

// 22/08/2026 — non si dichiara «sul gestionale non c'è» per una bozza che al gestionale
// c'e stata spedita davvero e che lui non ha confermato: li non si sa, e va detto cosi.
// E il rovescio della regola «mai dichiarare un salvataggio che non e avvenuto».
const nVerifica = mostrate.filter((b) => b.da_verificare).length;
const intestazione = bozze.length === 1
  ? (bozze[0].da_verificare
      ? '⏳ <b>Resta 1 bozza da verificare</b> — l\'ho spedita al gestionale, che non me l\'ha confermata.'
      : '⏳ <b>Resta 1 bozza aperta</b> — sul gestionale non c\'è.')
  : (nVerifica
      ? `⏳ <b>Restano ${bozze.length} bozze</b> — ${nVerifica} spedite al gestionale senza conferma, le altre sul gestionale non ci sono.`
      : `⏳ <b>Restano ${bozze.length} bozze aperte</b> — sul gestionale non ci sono.`);

const testo = [
  intestazione,
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
