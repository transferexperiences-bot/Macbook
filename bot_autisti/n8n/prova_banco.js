const B = require('./banco_n8n.js');
const AG = 522233722; let mid = 100;
const testo = t => ({ update_id: 1, message: { message_id: ++mid, from: { id: AG, first_name: 'Agostino' }, chat: { id: AG }, text: t } });
const foto = (uid, cap) => ({ update_id: 1, message: { message_id: ++mid, from: { id: AG, first_name: 'Agostino' }, chat: { id: AG }, photo: [{ file_id: 'F' + uid, file_unique_id: uid, width: 1000 }], caption: cap } });
let ultimo = null;
const tap = d => ({ update_id: 1, callback_query: { id: 'Q' + (++mid), from: { id: AG, first_name: 'Agostino' }, data: d, message: { message_id: ultimo ? ultimo.mid : 1, chat: { id: AG }, text: ultimo ? ultimo.testo : '', reply_markup: { inline_keyboard: ultimo ? ultimo.kb : [] } } } });
function giro(u, vis) {
  const lab = u.callback_query ? `[tap ${u.callback_query.data}]` : u.message.photo ? `[foto ${JSON.stringify(vis)}]` : u.message.text;
  console.log('\n👤 ' + lab);
  const r = B.evento(u, vis);
  for (const m of r.msg) {
    const bt = []; for (let i = 1; i <= 8; i++) if (m['t' + i]) bt.push(`[${m['t' + i]}]`);
    console.log(`🤖 ${m.chat == AG ? '' : '(chat ' + m.chat + ') '}${m.testo.replace(/<\/?[bi]>/g, '').replace(/\n/g, '\n   ')}${bt.length ? '\n   ' + m.forma + ' ' + bt.join(' ') : ''}`);
    if (bt.length) { const kb = []; for (let i = 1; i <= 8; i++) if (m['d' + i]) kb.push({ text: m['t' + i], callback_data: m['d' + i] }); ultimo = { mid: mid, testo: m.testo, kb: [kb] }; }
  }
  if (r.M.avviso_tap) console.log('   (notifica tap: ' + r.M.avviso_tap + ')');
  r.conf.forEach(c => console.log('🤖 ' + c.testo.replace(/<\/?[bi]>/g, '')));
  r.prove.forEach(p => console.log('   💾 prova:', p.dove, p.rif));
  r.ev.forEach(e => console.log('   🚐 evento:', e.tipo, e.mezzo, e.km || '', e.testo));
}
giro(testo('ciao'));
giro(testo('/prova Claudio Moccia 12/10')); giro(testo('/chiusura'));
giro(tap('RA|riep|ok'));
giro(tap('RA|ore|ok'));
giro(foto('S1'), { scontrino: { totale: 78.4, litri: 45.32, esercente: 'Q8 Polignano', data: '2026-10-12', categoria: 'carburante' } });
giro(tap('RS|menu|rif')); giro(tap('RS|mezzo|ok')); giro(tap('RS|pagato|inc')); giro(tap('RS|conferma|ok'));
giro(tap('RA|spese|ok'));
giro(tap('RA|carb|3')); giro(tap('RA|prob|si')); giro(testo('spia gomme accesa'));
giro(foto('K1'), { cruscotto: { km: 186655, spie: [] } });
giro(tap('RA|fine|ok')); giro(tap('RA|fine|ok'));
giro(tap('AG|ore|ok|522233722|2026-10-12'));
console.log('\n--- apertura del giorno dopo (stesso mezzo: ritrova il problema)');
giro(testo('/prova Claudio Moccia 13/10')); giro(testo('/apertura')); giro(tap('RP|mezzo|ok')); giro(tap('RP|prob|si')); giro(foto('K2'), { cruscotto: { km: 186900, spie: ['pressione pneumatici'] } }); giro(tap('RP|carb|4')); giro(tap('RP|pul|ok')); giro(tap('RP|danni|no'));
