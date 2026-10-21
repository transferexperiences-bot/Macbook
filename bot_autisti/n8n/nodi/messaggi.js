// un elemento per messaggio, nell'ordine; tastiera ridotta a una delle forme fisse dei nodi Telegram
const M = $('Motore').first().json;
const out = [];
for (const m of M.messaggi || []) {
  if (!m.testo) continue;
  const righe = (m.bottoni || []).filter(r => r && r.length);
  let b = righe.flat().map(x => ({ t: String(x.text).slice(0, 40), d: String(x.callback_data).slice(0, 64) }));
  let forma = '0';
  if (b.length && righe.length === 1 && b.length <= 4) forma = '1x' + b.length;
  else if (b.length) { if (b.length % 2) b.push({ t: '·', d: 'NOOP' }); b = b.slice(0, 8); forma = (b.length / 2) + 'x2'; }
  if (forma === '1x1') { b.push({ t: '·', d: 'NOOP' }); forma = '1x2'; }
  const j = { chat: String(m.chat), testo: String(m.testo).slice(0, 4000), forma };
  b.forEach((x, i) => { j['t' + (i + 1)] = x.t; j['d' + (i + 1)] = x.d; });
  out.push({ json: j });
}
return out;
