// update Telegram (passato tale e quale da Rendicontazione) -> evento normalizzato
// ingresso: update Telegram da Rendicontazione, oppure (solo prove sul campo di Claude) il webhook «Prova da Claude»,
// che accetta SOLO chat finte 9000000xx: i messaggi verso quelle chat falliscono e restano solo nell'esecuzione
const j0 = $input.first().json;
const daProva = !!(j0.body && (j0.body.message || j0.body.callback_query));
const u = daProva ? j0.body : (j0.update || j0);
if (daProva) { const id = String(((u.message || (u.callback_query && u.callback_query.message) || {}).chat || {}).id || ''); if (!/^9000000\d\d$/.test(id)) return []; }
const cq = u.callback_query, m = u.message || u.edited_message || (cq && cq.message) || {};
const da = (cq ? cq.from : m.from) || {};
const ev = { chat: String((m.chat && m.chat.id) || da.id || ''), da_id: String(da.id || ''), nome_tg: [da.first_name, da.last_name].filter(Boolean).join(' '),
  tipo: 'nulla', data: '', testo: '', file_id: '', file_uid: '', query_id: '', msg_id: m.message_id || 0, msg_testo: '', etichetta: '', comando: '', argomenti: [] };
if (cq) {
  ev.tipo = 'tap'; ev.data = String(cq.data || ''); ev.query_id = String(cq.id || ''); ev.msg_testo = String(m.text || '').slice(0, 3500);
  const kb = (m.reply_markup && m.reply_markup.inline_keyboard) || [];
  for (const r of kb) for (const b of r) if (b.callback_data === cq.data) ev.etichetta = b.text;
} else if (m.photo && m.photo.length) {
  const f = m.photo[m.photo.length - 1]; ev.tipo = 'foto'; ev.file_id = f.file_id; ev.file_uid = f.file_unique_id; ev.testo = String(m.caption || '').slice(0, 500);
} else if (m.document && /^image\//.test(m.document.mime_type || '')) {
  ev.tipo = 'foto'; ev.file_id = m.document.file_id; ev.file_uid = m.document.file_unique_id; ev.testo = String(m.caption || '').slice(0, 500);
} else if (m.voice || m.audio) {
  const f = m.voice || m.audio; ev.tipo = 'vocale'; ev.file_id = f.file_id; ev.file_uid = f.file_unique_id; ev.mime = f.mime_type || 'audio/ogg';
} else if (typeof m.text === 'string') {
  const t = m.text.trim();
  if (t.startsWith('/')) { const p = t.split(/\s+/); ev.tipo = 'comando'; ev.comando = p[0].slice(1).toLowerCase().replace(/@.*/, ''); ev.argomenti = p.slice(1); }
  else { ev.tipo = 'testo'; ev.testo = t.slice(0, 1000); }
}
return [{ json: ev }];
