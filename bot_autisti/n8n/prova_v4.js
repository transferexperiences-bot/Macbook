// la prova di Agostino delle 08:43-09:20: spesa lasciata a metà, poi chiusura, poi «22,30»
const B = require('./banco_n8n.js');
const AG = 522233722; let mid = 100;
const testo = t => ({ message: { message_id: ++mid, from: { id: AG, first_name: 'Agostino' }, chat: { id: AG }, text: t } });
const foto = uid => ({ message: { message_id: ++mid, from: { id: AG, first_name: 'Agostino' }, chat: { id: AG }, photo: [{ file_id: 'F' + uid, file_unique_id: uid }] } });
const tap = d => ({ callback_query: { id: 'Q' + (++mid), from: { id: AG }, data: d, message: { message_id: 1, chat: { id: AG }, text: '', reply_markup: { inline_keyboard: [] } } } });
function giro(u, vis) {
  console.log('\n👤 ' + (u.callback_query ? `[tap ${u.callback_query.data}]` : u.message.photo ? `[foto ${JSON.stringify(vis.foto)}]` : u.message.text));
  const r = B.evento(u, vis || {});
  for (const m of r.msg) { const bt = []; for (let i = 1; i <= 8; i++) if (m['t' + i] && m['t' + i] !== '·') bt.push(`[${m['t' + i]}]`); console.log('🤖 ' + m.testo.replace(/<\/?[bi]>/g, '').replace(/\n/g, '\n   ') + (bt.length ? '\n   ' + bt.join(' ') : '')); }
  r.conf.forEach(c => console.log('🤖 ' + c.testo.replace(/<\/?[bi]>/g, '')));
}
giro(testo('/prova Claudio Moccia 12/10'));
giro(foto('W0'), { foto: { tipo: 'mezzo', targa: 'GZ204TT', descrizione: 'Van Mercedes nero in un piazzale' } });
giro(tap('RS|menu|lav'));
console.log('\n--- (spesa lasciata a metà: chiede quanto) poi la chiusura');
giro(testo('/chiusura'));
giro(tap('RA|riep|ok'));
giro(tap('RA|ore|cor'));
giro(testo('22,30'), { intento: { intento: 'risposta', fine: '22:30', risposta: '' } });
giro(tap('RA|ore|ok2'));
giro(testo('ho aspettato i clienti in ritardo'), { intento: { intento: 'risposta', risposta: '' } });
