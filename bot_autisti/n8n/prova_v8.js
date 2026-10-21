// v8: risposte a parole a domande con bottoni
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
giro(testo('ho finito'), { intento: { azione: 'avvia_chiusura', risposta: '' } });
giro(testo('sì ho finito'), { intento: { azione: 'risposta', bottone: '✅ Sì, ho finito', risposta: '' } });
giro(testo('va bene'), { intento: { azione: 'risposta', bottone: 'Confermo', risposta: '' } });
giro(testo('niente spese'), { intento: { azione: 'risposta', bottone: '✅ È tutto', risposta: '' } });
giro(testo('diesel'), { intento: { azione: 'chiacchiera', bottone: 'Diesel', risposta: 'Intendi quanto carburante c\'è?' } });
giro(testo('mezzo serbatoio'), { intento: { azione: 'risposta', bottone: '½', risposta: '' } });
console.log('\nSTATO', B.tabella.sessioni[0].stato.slice(0, 300));
