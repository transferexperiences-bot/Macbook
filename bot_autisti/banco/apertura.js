// apertura.js — apertura della giornata (check-in del mezzo). Funzione pura come copione.js:
//   passo(ap, evento, ctx) -> { ap, messaggi, scritture, avvisi }
// Parte una volta sola per autista e giorno (30' prima del primo servizio, o alla prima accensione Moox del mezzo assegnato).
// ctx.mezzo = { nome, km, problemi_aperti: [{id, testo, da, giorno}] } dalla tabella Stato mezzi.
const B = (p, ...xs) => xs.map(r => r.map(([t, v]) => ({ text: t, callback_data: `RP|${p}|${v}`.slice(0, 64) })));
const CARB = { 1: '¼', 2: '½', 3: '¾', 4: 'Pieno' };

function apri(ctx) {
  const sv = ctx.servizi.slice().sort((a, b) => String(a.Time).localeCompare(String(b.Time)));
  const primo = sv[0];
  return { passo: 'mezzo', dati: { mezzo: null, km: null, spie: [], carburante: null, pulizia: null, danni: null, problemi: {} },
    msg: { testo: `Buongiorno ${ctx.nome}! Oggi ${sv.length} servizi, il primo alle ${primo.Time}: ${primo['Transfer > Da']} → ${primo['Transfer < Per']}.\nPrendi il <b>${ctx.mezzo ? ctx.mezzo.nome : '?'}</b>?`,
      bottoni: B('mezzo', [['✅ Sì', 'ok'], ['🔁 Un altro', 'alt']]) } };
}
function prossimo(ap, ctx, out) {
  const d = ap.dati, aperti = (ctx.mezzo && ctx.mezzo.problemi_aperti) || [];
  const p = aperti.find(x => !(x.id in d.problemi));
  if (p) { ap.passo = 'prob'; ap.prob = p.id; out.push({ testo: `Il ${p.giorno} ${p.da === ctx.autista ? 'hai segnalato' : p.da + ' ha segnalato'}: «${p.testo}». È ancora così?`, bottoni: B('prob', [['⚠️ Sì, ancora', 'si'], ['✅ Risolto', 'no']]) }); return; }
  if (d.km == null) { ap.passo = 'km'; out.push({ testo: '📸 Foto del cruscotto acceso: leggo km e spie.' }); return; }
  if (d.carburante == null) { ap.passo = 'carb'; out.push({ testo: 'Carburante?', bottoni: B('carb', [['¼', '1'], ['½', '2'], ['¾', '3'], ['Pieno', '4']]) }); return; }
  if (d.pulizia == null) { ap.passo = 'pul'; out.push({ testo: 'Il mezzo è pulito?', bottoni: B('pul', [['✅ Pulito', 'ok'], ['🧽 Interno da pulire', 'int'], ['🚿 Esterno da lavare', 'est']]) }); return; }
  if (d.danni == null) { ap.passo = 'danni'; out.push({ testo: 'Danni nuovi (graffi, ammaccature, vetri)?', bottoni: B('danni', [['✅ Nessuno', 'no'], ['📸 Sì, mando la foto', 'si']]) }); return; }
  ap.passo = 'fatto';
  out.push({ testo: `✅ Check-in fatto: ${d.mezzo}, ${d.km.toLocaleString('it-IT')} km, carburante ${CARB[d.carburante]}${d.spie.length ? ', spie: ' + d.spie.join(', ') : ''}. Buon lavoro!` });
}
function passo(ap, ev, ctx) {
  const out = [], scritture = [], avvisi = [];
  const res = () => ({ ap, messaggi: out, scritture, avvisi });
  if (ev.tipo === 'avvio') { if (ap && ap.giorno === ctx.giorno) return res(); const a = apri(ctx); ap = { giorno: ctx.giorno, passo: a.passo, dati: a.dati, ultimo: a.msg }; out.push(a.msg); return res(); }
  if (!ap || ap.passo === 'fatto') return res();
  const [pre, p, v] = ev.tipo === 'tap' ? String(ev.data).split('|') : [];
  if (ev.tipo === 'tap' && (pre !== 'RP' || p !== ap.passo.replace(/_.*/, ''))) { out.push({ avviso_tap: 'Già registrato ✅' }); return res(); }
  const d = ap.dati;
  switch (ap.passo) {
    case 'mezzo':
      if (ev.tipo === 'foto') {                         // foto del mezzo o del cruscotto: se si legge la targa, si prende quella
        const L = ev.lettura || {}, t = String(L.targa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const m = t.length >= 5 ? (ctx.flotta || []).find(x => x.toUpperCase().replace(/[^A-Z0-9]/g, '').endsWith(t)) : null;
        if (!m) { out.push({ testo: 'Non leggo la targa: tocca il bottone qui sopra.' }); break; }
        d.mezzo = m;
        if (ctx.mezzo && m !== ctx.mezzo.nome) avvisi.push({ tipo: 'mezzo', testo: `🚐 ${ctx.nome} prende il ${m} invece del ${ctx.mezzo.nome} assegnato.` });
        if (L.km) { const k = parseInt(String(L.km).replace(/\D/g, '')); if (k) { d.km = k; d.spie = L.spie || []; d.foto_km = ev.link; } }
        ap.mezzo_ctx = (ctx.altri_mezzi || {})[m] || { nome: m };
        out.push({ testo: `🚐 ${m}, ok.` }); prossimo(ap, { ...ctx, mezzo: ap.mezzo_ctx }, out); break;
      }
      if (v === 'ok') { d.mezzo = ctx.mezzo.nome; prossimo(ap, ctx, out); }
      else if (v === 'alt') { ap.passo = 'mezzo_alt'; out.push({ testo: 'Quale?', bottoni: B('mezzo', ...(ctx.flotta || []).map((m, i) => [[m, 'm' + i]])) }); }
      break;
    case 'mezzo_alt': { const i = /^m(\d+)$/.exec(v || ''); if (!i || !ctx.flotta[+i[1]]) break; d.mezzo = ctx.flotta[+i[1]];
      if (ctx.mezzo && d.mezzo !== ctx.mezzo.nome) avvisi.push({ tipo: 'mezzo', testo: `🚐 ${ctx.nome} prende il ${d.mezzo} invece del ${ctx.mezzo.nome} assegnato.` });
      ctx = { ...ctx, mezzo: (ctx.altri_mezzi || {})[d.mezzo] || { nome: d.mezzo } }; ap.mezzo_ctx = ctx.mezzo; prossimo(ap, ctx, out); break; }
    case 'prob':
      if (v !== 'si' && v !== 'no') break;
      d.problemi[ap.prob] = v === 'si' ? 'ancora' : 'risolto';
      scritture.push({ dove: 'evento_mezzo', mezzo: d.mezzo, tipo: v === 'si' ? 'problema confermato' : 'problema risolto', rif: ap.prob, autista: ctx.autista, giorno: ctx.giorno });
      prossimo(ap, { ...ctx, mezzo: ap.mezzo_ctx || ctx.mezzo }, out); break;
    case 'km': {
      if (ev.tipo !== 'foto') { out.push({ testo: '📸 Mi serve la foto del cruscotto.' }); break; }
      const L = ev.lettura || {}, k = parseInt(String(L.km ?? '').replace(/\D/g, '')), ult = (ap.mezzo_ctx || ctx.mezzo || {}).km;
      if (!k) { out.push({ testo: 'Non leggo i km: rifai la foto con il quadro acceso.' }); break; }
      if (ult && (k < ult || k - ult > 1500)) { ap.passo = 'km_conf'; d.km_letti = k; d.spie_lette = L.spie || []; out.push({ testo: `Leggo ${k.toLocaleString('it-IT')} km ma gli ultimi registrati sono ${ult.toLocaleString('it-IT')}. È giusto?`, bottoni: B('km', [['✅ Sì', 'ok'], ['📸 Rifaccio la foto', 'cor']]) }); break; }
      d.km = k; d.foto_km = ev.link; d.spie = L.spie || [];
      if (d.spie.length) avvisi.push({ tipo: 'mezzo', urgente: true, testo: `⚠️ ${ctx.nome}, ${d.mezzo}: spie accese al check-in: ${d.spie.join(', ')}.` });
      prossimo(ap, { ...ctx, mezzo: ap.mezzo_ctx || ctx.mezzo }, out); break;
    }
    case 'km_conf':
      if (v === 'cor') { ap.passo = 'km'; out.push({ testo: '📸 Rifai la foto del cruscotto.' }); break; }
      if (v !== 'ok') break;
      d.km = d.km_letti; d.spie = d.spie_lette; avvisi.push({ tipo: 'mezzo', testo: `🛣 ${ctx.nome}, ${d.mezzo}: ${d.km} km al check-in, ultimi registrati ${(ap.mezzo_ctx || ctx.mezzo).km}.` });
      prossimo(ap, { ...ctx, mezzo: ap.mezzo_ctx || ctx.mezzo }, out); break;
    case 'carb': if (!CARB[v]) break; d.carburante = +v; prossimo(ap, { ...ctx, mezzo: ap.mezzo_ctx || ctx.mezzo }, out); break;
    case 'pul': if (!['ok', 'int', 'est'].includes(v)) break; d.pulizia = v; prossimo(ap, { ...ctx, mezzo: ap.mezzo_ctx || ctx.mezzo }, out); break;
    case 'danni':
      if (v === 'no') { d.danni = ''; prossimo(ap, { ...ctx, mezzo: ap.mezzo_ctx || ctx.mezzo }, out); }
      else if (v === 'si') { ap.passo = 'danni_foto'; out.push({ testo: '📸 Mandami la foto del danno e scrivimi dove si trova.' }); }
      break;
    case 'danni_foto':
      if (ev.tipo !== 'foto' && ev.tipo !== 'testo') break;
      d.danni = String(ev.testo || (ev.lettura && ev.lettura.descrizione) || 'vedi foto').slice(0, 300); d.foto_danno = ev.link || d.foto_danno;
      avvisi.push({ tipo: 'mezzo', urgente: true, testo: `🔧 ${ctx.nome}, ${d.mezzo}: danno nuovo al check-in: ${d.danni}.` });
      prossimo(ap, { ...ctx, mezzo: ap.mezzo_ctx || ctx.mezzo }, out); break;
  }
  if (ap.passo === 'fatto') scritture.push({ dove: 'stato_mezzo', mezzo: d.mezzo, momento: 'check-in', campi: { km: d.km, carburante: CARB[d.carburante], spie: d.spie.join(', '), pulizia: d.pulizia, danni: d.danni, autista: ctx.autista, giorno: ctx.giorno, foto_km: d.foto_km || '', foto_danno: d.foto_danno || '' } });
  const ult = [...out].reverse().find(m => m.bottoni || (m.testo && !m.chat)); if (ap && ult) ap.ultimo = ult;
  return res();
}
if (typeof module !== 'undefined') module.exports = { passo };
