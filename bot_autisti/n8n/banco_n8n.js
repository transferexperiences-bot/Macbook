// Banco offline del workflow n8n: esegue i nodi Code veri, nello stesso ordine del workflow, con i dati veri salvati.
// Le chiamate ai ponti (gestionale, Moox, SumUp, ...) e le tabelle sono simulate con i file in banco/dati e in memoria.
const fs = require('fs'), path = require('path');
const N = f => fs.readFileSync(path.join(__dirname, 'nodi', f), 'utf8');
const BUNDLE = fs.readFileSync(path.join(__dirname, 'bundle.js'), 'utf8');
const D = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'banco', 'dati', f)));
const MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const gestTutto = D('gest_ottobre.json').rows;

function run(code, nodes, input) {
  const $ = name => { if (!(name in nodes)) throw new Error(`Node '${name}' hasn't been executed`); const items = nodes[name]; return { first: () => items[0], all: () => items, item: items[0] }; };
  const $input = { first: () => input[0], all: () => input };
  return new Function('$', '$input', code)($, $input);
}
const tabella = { sessioni: [], prove: [], eventi: [], memoria: [] }; let seq = 1;
const ponte = {
  rubrica: () => [{ json: D('rubrica.json') }],
  gestGiorno: q => [{ json: { rows: gestTutto.filter(r => (' ' + r.Data).includes(' ' + q)) } }],
  gestAutista: q => [{ json: { rows: gestTutto.filter(r => String(r.Autista).trim() === q) } }],
  anag: () => [{ json: D('anag.json') }],
  sumup: () => [{ json: D('sumup_storico.json') }],
  veicoli: () => [{ json: D('veicoli.json') }],
  moox: (t, g) => { const f = path.join(__dirname, '..', 'banco', 'mx', `mx_${t}_${g}.json`); return { json: fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : {} }; },
  vision: tipo => ({ json: { content: JSON.stringify(VISION.foto || VISION[tipo] || {}) } }),
  capisci: () => ({ json: { content: VISION.grezzo ? [{ type: 'text', text: VISION.grezzo }] : JSON.stringify(VISION.intento || { intento: 'altro', risposta: '(risposta del modello)' }) } })
};
let VISION = {};
function evento(update, visione) {
  VISION = visione || {};
  const nodes = {};
  nodes['Leggi evento'] = run(N('leggi_evento.js'), nodes, [{ json: update }]);
  const chat = nodes['Leggi evento'][0].json.chat;
  nodes['Leggi sessione'] = tabella.sessioni.filter(r => r.chat === chat).map(r => ({ json: r }));
  if (!nodes['Leggi sessione'].length) nodes['Leggi sessione'] = [{ json: {} }];          // alwaysOutputData
  nodes['Leggi memoria'] = tabella.memoria.map(r => ({ json: r })); if (!nodes['Leggi memoria'].length) nodes['Leggi memoria'] = [{ json: {} }];
  nodes['Decidi'] = run(N('decidi.js'), nodes, nodes['Leggi memoria']);
  const dec = nodes['Decidi'][0].json;
  if (dec.serve_foto) { nodes['Leggi foto'] = [{ json: {} }]; nodes['Vision'] = [ponte.vision(dec.tipo_foto)]; nodes['Lettura foto'] = run(N('lettura_foto.js'), nodes, nodes['Vision']); }
  if (dec.serve_vocale) nodes['Testo dal vocale'] = [{ json: { testo: VISION.vocale || '' } }];
  if (dec.serve_testo) nodes['Capisci testo'] = [ponte.capisci()];
  if (dec.serve_giornata) {
    nodes['Rubrica autisti'] = ponte.rubrica();
    nodes['Chi e quando'] = run(N('chi_e_quando.js'), nodes, nodes['Rubrica autisti']);
    const q = nodes['Chi e quando'][0].json;
    nodes['Gestionale giorno'] = ponte.gestGiorno(q.giornoTxt);
    nodes['Gestionale autista'] = ponte.gestAutista(q.autista);
    nodes['Anag autisti'] = ponte.anag(); nodes['SumUp'] = ponte.sumup(); nodes['Veicoli'] = ponte.veicoli();
    nodes['Eventi mezzi'] = tabella.eventi.map(e => ({ json: e }));
    nodes['Targhe'] = run(N('targhe.js'), nodes, nodes['Eventi mezzi']);
    nodes['Moox giro'] = nodes['Targhe'].map(t => ponte.moox(t.json.targa, t.json.giorno));
  }
  nodes['Motore'] = run(fs.readFileSync(path.join(__dirname, 'bundle_min.js'), 'utf8') + '\n' + N('prepara_fn.js') + N('motore.js'), nodes, [{ json: {} }]);
  const M = nodes['Motore'][0].json;
  // salva sessione (upsert per chat)
  const i = tabella.sessioni.findIndex(r => r.chat === M.chat);
  const riga = { id: i >= 0 ? tabella.sessioni[i].id : seq++, chat: M.chat, autista: M.autista, giorno: M.giorno, stato: M.stato, aggiornato: new Date().toISOString() };
  if (i >= 0) tabella.sessioni[i] = riga; else tabella.sessioni.push(riga);
  const msg = run(N('messaggi.js'), nodes, [{ json: M }]).map(x => x.json);
  const prove = run(N('righe_prova.js'), nodes, [{ json: M }]).map(x => ({ ...x.json, id: seq++, createdAt: 'x' }));
  tabella.prove.push(...prove);
  const ev = run(N('righe_eventi.js'), nodes, [{ json: M }]).map(x => ({ ...x.json, id: seq++ }));
  tabella.eventi.push(...ev);
  tabella.memoria.push(...run(N('righe_memoria.js'), nodes, [{ json: M }]).map(x => x.json));
  const conf = run(N('conferma.js'), nodes, prove.map(p => ({ json: p }))).map(x => x.json);
  return { M, msg, conf, prove, ev };
}
module.exports = { evento, tabella };
