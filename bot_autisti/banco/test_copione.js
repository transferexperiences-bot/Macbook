const fs = require('fs'), O = require('./ore.js'), I = require('./incassi.js'), C = require('./copione.js');
const rows = JSON.parse(fs.readFileSync('dati/gest_ottobre.json')).rows.filter(r => r.Autista);
const ST = JSON.parse(fs.readFileSync('dati/sumup_storico.json'))[0].items;
const A = 'Claudio Moccia', iso = '2026-10-12', d = O.pd('lun 12 ottobre 2026');
const serv = rows.map(r => ({ r, iso: O.pd(r.Data) !== null ? O.iso(O.pd(r.Data)) : '' })).filter(x => x.iso && x.iso <= iso);
const oggi = serv.filter(x => x.iso === iso && O.nm(x.r.Autista) === A && !I.cancellata(x.r)).map(x => x.r);
const prima = serv.filter(x => x.iso < iso && O.nm(x.r.Autista) === A).map(x => x.r);
const { esito } = I.riconcilia(serv, ST, {});
const S = O.assegna(O.eventi(rows.filter(r => O.iso(O.pd(r.Data) ?? 0).startsWith('2026-10'))));
const moox = (tg, g) => { const f = `mx/mx_${tg}_${O.iso(g)}.json`; return fs.existsSync(f) ? O.tratte(JSON.parse(fs.readFileSync(f)), g) : []; };
const oa = O.oreAutista(S, A, d, moox, 'Continuative'), ev = S[A + '|' + d];
const ctx = { chat: 111, autista: A, nome: 'Claudio', giorno: iso, giornoTxt: 'lun 12/10', oraTxt: '12/10 22:05', servizi: oggi,
  ore: { ...oa, moox: oa.effettive },
  incassi: I.riepilogo(oggi, esito, prima), spese: [{ tipo: 'Parcheggio', importo: 3, pagato: 'incasso' }], mezzo: { nome: 'Classe V FN751MD', km: 186420 } };
function gira(titolo, eventi) {
  console.log(`\n================ ${titolo}`); let s = null;
  for (const e of eventi) {
    if (e.tipo !== 'avvio') console.log(`\n  👤 ${e.tipo === 'tap' ? '[tap ' + e.data + ']' : e.tipo === 'foto' ? '[foto km ' + e.lettura.km + ']' : e.testo}`);
    const r = C.passo(s, e, ctx); s = r.sessione;
    r.messaggi.forEach(m => console.log((m.testo ? '  🤖 ' + m.testo.replace(/<\/?[bi]>/g, '').replace(/\n/g, '\n     ') : '  🤖 (avviso tap) ' + m.avviso_tap) + (m.bottoni ? '\n     ' + m.bottoni[0].map(b => `[${b.text}]`).join(' ') : '')));
    r.avvisi.forEach(a => console.log('  📣 AGOSTINO: ' + a.testo.replace(/<\/?b>/g, '').replace(/\n/g, ' | ') + (a.bottoni ? ' ' + a.bottoni[0].map(b => `[${b.text}]`).join(' ') : '')));
    r.scritture.forEach(w => console.log('  💾 ' + JSON.stringify(w)));
  }
  console.log('  -> passo finale:', s.passo);
}
gira('Claudio 12/10, tutto liscio', [{ tipo: 'avvio' }, { tipo: 'tap', data: 'RA|riep|ok' }, { tipo: 'tap', data: 'RA|ore|ok' }, { tipo: 'tap', data: 'RA|ore|ok' },
  { tipo: 'tap', data: 'RA|spese|ok' }, { tipo: 'tap', data: 'RA|carb|3' }, { tipo: 'tap', data: 'RA|prob|no' }, { tipo: 'foto', lettura: { km: 186655 } }, { tipo: 'tap', data: 'RA|fine|ok' }]);
gira('Ore corrette oltre soglia, problema al mezzo, km strani', [{ tipo: 'avvio' }, { tipo: 'avvio' }, { tipo: 'tap', data: 'RA|riep|ok' }, { tipo: 'tap', data: 'RA|ore|cor' }, { tipo: 'testo', testo: 'boh' },
  { tipo: 'testo', testo: 'dalle 7.30 alle 22' }, { tipo: 'tap', data: 'RA|ore|ok2' }, { tipo: 'testo', testo: 'ho aspettato il volo in aeroporto' },
  { tipo: 'tap', data: 'RA|spese|ok' }, { tipo: 'tap', data: 'RA|carb|1' }, { tipo: 'tap', data: 'RA|prob|si' }, { tipo: 'testo', testo: 'spia pressione gomme accesa' },
  { tipo: 'foto', lettura: { km: 18665 } }, { tipo: 'tap', data: 'RA|km|cor' }, { tipo: 'testo', testo: '186.655' }, { tipo: 'tap', data: 'RA|fine|ok' }]);
