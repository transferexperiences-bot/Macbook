const B = require('./banco_n8n.js');
const AG = 522233722; let mid = 100;
const testo = t => ({ message: { message_id: ++mid, from: { id: AG }, chat: { id: AG }, text: t } });
const tap = d => ({ callback_query: { id: 'Q' + (++mid), from: { id: AG }, data: d, message: { message_id: 1, chat: { id: AG }, text: '', reply_markup: { inline_keyboard: [] } } } });
function giro(lab, u, it) {
  console.log('\n👤 ' + lab); const r = B.evento(u, it ? { intento: it } : {});
  for (const m of r.msg) { const bt = []; for (let i = 1; i <= 8; i++) if (m['t' + i] && m['t' + i] !== '·') bt.push(`[${m['t' + i]}]`); console.log('🤖 ' + m.testo.replace(/<\/?[bi]>/g, '').replace(/\n/g, '\n   ') + (bt.length ? '\n   ' + bt.join(' ') : '')); }
  r.conf.forEach(c => console.log('🤖 ' + c.testo));
}
giro('ciao', testo('ciao'), { azione: 'chiacchiera', risposta: 'Ciao Agostino! Sono l\'assistente degli autisti. Posso: chiudere o aprire la giornata, registrare spese e rifornimenti dalla foto, dirti i servizi di oggi, passare problemi ad Agostino. Cosa ti serve?' });
giro('/prova Claudio Moccia 12/10', testo('/prova Claudio Moccia 12/10'));
giro('[tap ho finito]', tap('RA|riep|ok'));
giro('ma come le calcoli le ore?', testo('ma come le calcoli le ore?'), { azione: 'chiacchiera', risposta: 'Le ore le prendo da Moox: dall\'uscita per il primo servizio al rientro, tolte le soste in sede.' });
giro('ok ho finito alle dieci e mezza', testo('ok ho finito alle dieci e mezza'), { azione: 'risposta', fine: '22:30' });
giro('ricordati che claudio va sempre a ore continuative', testo('ricordati che claudio va sempre a ore continuative'), { azione: 'impara', nota: 'Claudio Moccia: ore sempre continuative', risposta: 'Ok, me lo segno.' });
console.log('\nMEMORIA:', JSON.stringify(B.tabella.memoria));
giro('che memoria hai?', testo('che memoria hai?'), { azione: 'chiacchiera', risposta: '(risposta)' });
