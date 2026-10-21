// riproduce la prova vera di Agostino del 21/10 (esecuzioni 1658405-1658437) con il motore nuovo
const B = require('./banco_n8n.js');
const AG = 522233722; let mid = 100;
const testo = t => ({ message: { message_id: ++mid, from: { id: AG, first_name: 'Agostino' }, chat: { id: AG }, text: t } });
const foto = uid => ({ message: { message_id: ++mid, from: { id: AG, first_name: 'Agostino' }, chat: { id: AG }, photo: [{ file_id: 'F' + uid, file_unique_id: uid }] } });
const tap = d => ({ callback_query: { id: 'Q' + (++mid), from: { id: AG }, data: d, message: { message_id: 1, chat: { id: AG }, text: '', reply_markup: { inline_keyboard: [] } } } });
function giro(u, vis) {
  console.log('\n👤 ' + (u.callback_query ? `[tap ${u.callback_query.data}]` : u.message.photo ? `[foto ${JSON.stringify(vis.foto)}]` : u.message.text));
  const r = B.evento(u, vis || {});
  for (const m of r.msg) { const bt = []; for (let i = 1; i <= 8; i++) if (m['t' + i] && m['t' + i] !== '·') bt.push(`[${m['t' + i]}]`); console.log('🤖 ' + m.testo.replace(/<\/?[bi]>/g, '').replace(/\n/g, '\n   ') + (bt.length ? '\n   ' + bt.join(' ') : '')); }
  if (r.M.avviso_tap) console.log('   (tap: ' + r.M.avviso_tap + ')');
  r.conf.forEach(c => console.log('🤖 ' + c.testo.replace(/<\/?[bi]>/g, '').split('\n')[0]));
  r.prove.filter(p => p.dove === 'recap').forEach(p => { const c = JSON.parse(p.dati).campi; console.log('   💾', c.Tipologia, '|', c.Mezzo, '|', c['€'], '|', c.Descrizione); });
}
giro(testo('/prova Claudio Moccia 12/10')); giro(testo('/chiusura'));
giro(tap('RA|riep|ok'));
giro(tap('RA|ore|cor'));
giro(testo('ho finioto alle 19,4'), { intento: { intento: 'altro', inizio: null, fine: '19:40', risposta: '' } });
giro(testo('?'), { intento: { intento: 'domanda', risposta: 'Ti ho proposto le ore con la fine alle 19:40: se va bene tocca Giusto.' } });
giro(testo('ho finoto alle 19:40'), { intento: { intento: 'chiusura', fine: '19:40', risposta: 'ok' } });
giro(tap('RA|ore|ok2'));
giro(foto('W1'), { foto: { tipo: 'lavaggio', targa: 'GZ204TT', descrizione: 'Van Mercedes nero dentro un autolavaggio a portale mentre viene lavato' } });
giro(tap('RS|conferma|ok'));
giro(testo('a che ora devo consegnare i contanti?'), { intento: { intento: 'domanda', risposta: 'Questo lo decide Agostino: glielo chiedo io.' } });
