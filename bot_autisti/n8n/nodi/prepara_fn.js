// Prepara giornata (solo quando sono stati letti gestionale, Moox, SumUp...): calcola la giornata con il codice del banco
function preparaGiornata() {
const q = $('Chi e quando').first().json;
const rows = j => (j && (j.rows || j.values)) || [];
const gGiorno = rows($('Gestionale giorno').first().json), gAut = rows($('Gestionale autista').first().json);
const anagV = (($('Anag autisti').first().json.risposta || {}).values) || [];
const su = []; for (const it of $('SumUp').all()) { const j = it.json; if (Array.isArray(j.items)) su.push(...j.items); else if (Array.isArray(j)) for (const b of j) if (b && Array.isArray(b.items)) su.push(...b.items); }
const veic = (($('Veicoli').first().json.values) || []).slice(1).filter(r => r[0] && String(r[3]).toUpperCase() !== 'OFF');
const eventi = $('Eventi mezzi').all().map(i => i.json).filter(e => e && e.mezzo !== undefined && !(e.id === 1 && e.quando === '2026-10-21T08:13:37.683Z'));   // riga 1: scritta da una chat finta del campo di prova
const mooxJ = {}; for (const it of $('Moox giro').all()) { const t = it.json.targa_richiesta || ''; if (t) mooxJ[t] = it.json; }
$('Targhe').all().forEach((it, i) => { const j = ($('Moox giro').all()[i] || {}).json; if (it.json.targa && j) mooxJ[it.json.targa] = j; });

const AUT = O.nm(q.autista);
const d = O.pd(q.giorno.split('-').reverse().join('/'));
const iso = q.giorno;
const tutte = [...new Map([...gGiorno, ...gAut].map(r => [String(r.Id) + '|' + r.Data + '|' + r.Time, r])).values()];
const delGiorno = r => { const x = O.pd(r.Data); return x !== null && O.iso(x) === iso; };
const servizi = gAut.filter(r => delGiorno(r) && O.nm(r.Autista) === AUT && !I.cancellata(r)).sort((a, b) => String(a.Time).localeCompare(String(b.Time)));
// anagrafica: Calcolo ore (colonna nuova di Agostino, se c'è), Categoria
const h = anagV[0] || [], riga = anagV.find(r => O.nm(r[h.indexOf("Autista")]) === AUT) || [];
const col = n => { const i = h.findIndex(x => String(x).trim().toLowerCase() === n.toLowerCase()); return i >= 0 ? riga[i] : ''; };
const calcolo = col('Calcolo ore'), categoria = String(col('Categoria') || '');
// ore: stessa regola della task delle 07:12 (148/148 sul banco)
const ev = O.eventi(tutte.filter(r => !I.cancellata(r)));
const S = O.assegna(ev);
const moox = (tg, g) => (g === d && mooxJ[tg]) ? O.tratte(mooxJ[tg], g) : [];
let ore = null;
if (/tuk/i.test(categoria)) ore = { tipo: 'tuktuk', base: 0 };
else { const o = O.oreAutista(S, AUT, d, moox, calcolo); if (o) ore = { ...o, moox: o.effettive, tipo: 'ore' }; }
// incassi: riconciliazione su tutti gli autisti del giorno (SumUp è un conto unico) + contanti ancora da consegnare
const gruppi = {}; for (const r of (($('Rubrica autisti').first().json.rows) || [])) if (r['gruppo id']) gruppi[O.nm(r.Autisti)] = String(r['gruppo id']);
const conIso = tutte.map(r => ({ r, iso: O.pd(r.Data) !== null ? O.iso(O.pd(r.Data)) : '' })).filter(x => x.iso && x.iso <= iso && x.iso >= q.dal);
const { esito } = I.riconcilia(conIso, su, { gruppi });
const lim = O.iso(d - 30);
const prima = gAut.filter(r => { const x = O.pd(r.Data); return x !== null && O.iso(x) < iso && O.iso(x) >= lim && O.nm(r.Autista) === AUT; });
const incassi = I.riepilogo(servizi, esito, prima);
// mezzo: il più usato oggi; km e problemi aperti dagli eventi registrati dal bot
const conta = {}; servizi.forEach(r => { const v = String(r.Veicolo || '').trim(); if (v) conta[v] = (conta[v] || 0) + 1; });
const nomeMezzo = Object.keys(conta).sort((a, b) => conta[b] - conta[a])[0] || '';
const evM = eventi.filter(e => e.mezzo === nomeMezzo).sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
const km = (evM.find(e => Number(e.km) > 0) || {}).km || null;
const aperti = evM.filter(e => e.tipo === 'problema' && e.stato === 'aperto').map(e => ({ id: String(e.id), testo: e.testo, da: e.autista, giorno: String(e.giorno || '').split('-').reverse().slice(0, 2).join('/') }));
const statoDi = nome => { const e = eventi.filter(x => x.mezzo === nome).sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
  return { nome, km: Number((e.find(x => Number(x.km) > 0) || {}).km) || null, problemi_aperti: e.filter(x => x.tipo === 'problema' && x.stato === 'aperto').map(x => ({ id: String(x.id), testo: x.testo, da: x.autista, giorno: String(x.giorno || '').split('-').reverse().slice(0, 2).join('/') })) }; };
const cis = eventi.filter(e => e.tipo === 'cisterna').sort((a, b) => String(b.quando).localeCompare(String(a.quando)))[0];
// prossimi 3 giorni dello stesso autista (per «domani a che ora?»): solo quello che c'è già nel gestionale, che può ancora cambiare
const prossimi = gAut.filter(r => { const x = O.pd(r.Data); return x !== null && x > d && x <= d + 3 && O.nm(r.Autista) === AUT && !I.cancellata(r); })
  .sort((a, b) => (O.pd(a.Data) - O.pd(b.Data)) || String(a.Time).localeCompare(String(b.Time))).slice(0, 15)
  .map(r => ({ Data: r.Data, Time: r.Time, 'Transfer > Da': r['Transfer > Da'], 'Transfer < Per': r['Transfer < Per'], Nome: r.Nome }));
const pick = r => ({ Id: r.Id, Data: r.Data, Time: r.Time, 'Transfer > Da': r['Transfer > Da'], 'Transfer < Per': r['Transfer < Per'], Nome: r.Nome, Veicolo: r.Veicolo, 'Modalità': r['Modalità'] });
const nome = String(q.autista).split(' ')[0];
return { ctx: {
  giorno_reale: $('Decidi').first().json.oggi, prova: !!q.prova, chat: $("Decidi").first().json.chat, autista: AUT, nome, giorno: iso,
  giornoTxt: new Date(Date.UTC(...iso.split('-').map((x, i) => i === 1 ? +x - 1 : +x))).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' }),
  dataTxt: iso.split('-').reverse().join('/'), servizi: servizi.map(pick), prossimi, ore, incassi, calcolo_vuoto: !calcolo,
  mezzo: nomeMezzo ? { nome: nomeMezzo, km: km ? Number(km) : null, problemi_aperti: aperti } : null,
  altri_mezzi: Object.fromEntries(veic.map(r => [String(r[0]), statoDi(String(r[0]))])),
  flotta: veic.filter(r => /tuk/i.test(categoria) ? /tuk/i.test(r[1]) : !/tuk/i.test(r[1])).map(r => String(r[0])).slice(0, 8),
  cisterna_ultima_dopo: cis ? (String(cis.testo).match(/dopo=(\d{1,3})/) || [])[1] || null : null,
  avvisi_dati: [!servizi.length ? 'nessun servizio a gestionale per questo giorno' : '', ore && ore.tipo === 'ore' && !Object.keys(mooxJ).length ? 'Moox senza dati: ore dal gestionale' : '', !calcolo ? 'Calcolo ore vuoto in Anag autisti: uso Effettive' : ''].filter(Boolean)
} };
}
