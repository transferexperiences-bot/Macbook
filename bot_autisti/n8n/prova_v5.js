const B = require('./banco_n8n.js');
const AG = 522233722; let mid = 100;
const testo = t => ({ message: { message_id: ++mid, from: { id: AG }, chat: { id: AG }, text: t } });
const voce = () => ({ message: { message_id: ++mid, from: { id: AG }, chat: { id: AG }, voice: { file_id: 'V' + mid, file_unique_id: 'v' + mid, mime_type: 'audio/ogg', duration: 3 } } });
const sticker = () => ({ message: { message_id: ++mid, from: { id: AG }, chat: { id: AG }, sticker: { file_id: 'S' } } });
const tap = d => ({ callback_query: { id: 'Q' + (++mid), from: { id: AG }, data: d, message: { message_id: 1, chat: { id: AG }, text: '', reply_markup: { inline_keyboard: [] } } } });
function giro(lab, u, vis) {
  console.log('\n👤 ' + lab); const r = B.evento(u, vis || {});
  for (const m of r.msg) { const bt = []; for (let i = 1; i <= 8; i++) if (m['t' + i] && m['t' + i] !== '·') bt.push(`[${m['t' + i]}]`); console.log('🤖 ' + m.testo.replace(/<\/?[bi]>/g, '').replace(/\n/g, '\n   ') + (bt.length ? '\n   ' + bt.join(' ') : '')); }
}
giro('/prova', testo('/prova Claudio Moccia 12/10'));
giro('[tap ho finito]', tap('RA|riep|ok'));
giro('[tap correggo]', tap('RA|ore|cor'));
giro('🎙️ vocale «ho finito alle 22 e 30»', voce(), { vocale: 'ho finito alle 22 e 30', intento: { intento: 'risposta', fine: '22:30' } });
giro('[sticker]', sticker());
giro('🎙️ vocale muto', voce(), { vocale: '' });
