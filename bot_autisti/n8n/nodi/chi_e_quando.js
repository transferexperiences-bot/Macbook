// chi è l'autista e quale giornata: in prova Agostino può dire «/prova Claudio Moccia 12/10»
const ev = $('Decidi').first().json;
const rub = ($('Rubrica autisti').first().json.rows || $('Rubrica autisti').first().json || []);
const MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const io = (Array.isArray(rub) ? rub : []).find(r => String(r['chat id']) === ev.da_id) || {};
let autista = io.Autisti || '', giorno = ev.oggi, prova = false;
const args = (ev.argomenti || []).slice();
const dArg = args.findIndex(a => /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(a));
if (dArg >= 0) { const [g, m, y] = args[dArg].split('/'); giorno = `${y ? (y.length === 2 ? '20' + y : y) : ev.oggi.slice(0, 4)}-${m.padStart(2, '0')}-${g.padStart(2, '0')}`; args.splice(dArg, 1); }
if (ev.comando === 'prova' && args.length) { autista = args.join(' '); prova = true; }
else if (ev.ctx_prova && dArg < 0) { autista = ev.ctx_prova.autista; giorno = ev.ctx_prova.giorno; prova = true; }   // in prova /apertura e /chiusura restano sulla giornata scelta
const [y, m, g] = giorno.split('-').map(Number);
const sposta = n => new Date(Date.UTC(y, m - 1, g + n)).toISOString().slice(0, 10);
return [{ json: { autista, chat_autista: io['chat id'] || ev.da_id, gruppo_id: io['gruppo id'] || '', giorno, giornoTxt: `${g} ${MESI[m - 1]} ${y}`, dal: sposta(-8), al: sposta(1), prova: prova || ev.comando === 'prova' } }];
