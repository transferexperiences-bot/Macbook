const B = require('./banco_n8n.js');
const AG = 522233722; let mid = 100; let ultimo = null;
const testo = t => ({ message: { message_id: ++mid, from: { id: AG, first_name: 'Agostino' }, chat: { id: AG }, text: t } });
const foto = uid => ({ message: { message_id: ++mid, from: { id: AG, first_name: 'Agostino' }, chat: { id: AG }, photo: [{ file_id: 'F' + uid, file_unique_id: uid }] } });
const tap = d => ({ callback_query: { id: 'Q' + (++mid), from: { id: AG }, data: d, message: { message_id: 1, chat: { id: AG }, text: '', reply_markup: { inline_keyboard: [] } } } });
function giro(u, vis) {
  console.log('\n👤 ' + (u.callback_query ? `[tap ${u.callback_query.data}]` : u.message.photo ? `[foto ${JSON.stringify(vis.foto)}]` : u.message.text));
  const r = B.evento(u, vis);
  for (const m of r.msg) { const bt = []; for (let i = 1; i <= 8; i++) if (m['t' + i] && m['t' + i] !== '·') bt.push(`[${m['t' + i]}]`); console.log('🤖 ' + m.testo.replace(/<\/?[bi]>/g, '').replace(/\n/g, '\n   ') + (bt.length ? '\n   ' + bt.join(' ') : '')); }
  if (r.M.avviso_tap) console.log('   (tap: ' + r.M.avviso_tap + ')');
  r.conf.forEach(c => console.log('🤖 ' + c.testo.replace(/<\/?[bi]>/g, '').split('\n')[0]));
  r.prove.filter(p => p.dove === 'recap').forEach(p => console.log('   💾', JSON.parse(p.dati).campi.Tipologia, '|', JSON.parse(p.dati).campi.Mezzo, '|', JSON.parse(p.dati).campi['€'], '|', JSON.parse(p.dati).campi.Litri, '|', JSON.parse(p.dati).campi.Descrizione));
}
giro(testo('/prova Claudio Moccia 12/10'));
console.log('\n=== 1. scontrino gasolio con targa: un tap e basta');
giro(foto('S1'), { foto: { tipo: 'scontrino', categoria: 'carburante', totale: 78.4, litri: 45.32, carburante: 'gasolio', esercente: 'Q8 Polignano', data: '2026-10-12', targa: 'GZ441BF' } });
giro(tap('RS|conferma|mie'));
console.log('\n=== 2. stesso scontrino rimandato');
giro(foto('S1'), { foto: { tipo: 'scontrino', categoria: 'carburante', totale: 78.4, litri: 45.32 } });
console.log('\n=== 3. pasto da 14,50, correzione a parole');
giro(foto('P1'), { foto: { tipo: 'scontrino', categoria: 'pasto', totale: 14.5, esercente: 'Bar Centrale' } });
giro(tap('RS|conferma|cor')); giro(testo('erano 9 euro')); giro(tap('RS|conferma|inc'));
console.log('\n=== 4. contatore cisterna, senza dire niente');
giro(foto('C1'), { foto: { tipo: 'contatore', contatore: '970' } });
giro(foto('C2'), { foto: { tipo: 'contatore', contatore: '035' } });
giro(tap('RS|conferma|ok'));
console.log('\n=== 5. testo libero');
giro(testo('ho fatto 50 euro di gasolio alla esso'), { intento: { intento: 'rifornimento', importo: 50, litri: null, risposta: '' } });
giro(foto('S2'), { foto: { tipo: 'scontrino', categoria: 'carburante', totale: 50, litri: 29.1, esercente: 'Esso Monopoli' } });
giro(tap('RS|conferma|inc'));
giro(testo('a che ora ho il prossimo?'), { intento: { intento: 'domanda', risposta: 'Il prossimo è alle 16:35 da APT di Bari a Melograno.' } });
giro(testo('il cliente delle 19:15 non si presenta'), { intento: { intento: 'segnalazione', risposta: 'Ok, aspetta ancora 10 minuti.' } });
console.log('\n=== 6. foto di un danno a caso');
giro(foto('D1'), { foto: { tipo: 'danno', descrizione: 'graffio sulla portiera posteriore sinistra' } });
console.log('\n=== 7. apertura con la foto del mezzo');
giro(testo('/prova Claudio Moccia 13/10')); giro(testo('/apertura'));
giro(foto('M1'), { foto: { tipo: 'mezzo', targa: 'GZ441BF' } });
