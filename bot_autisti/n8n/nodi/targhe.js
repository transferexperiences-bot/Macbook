// un elemento per ogni mezzo usato dall'autista quel giorno (per chiedere a Moox i viaggi)
const q = $('Chi e quando').first().json;
const nm = s => String(s ?? '').trim().toLowerCase();
const righe = ($('Gestionale autista').first().json.rows || []);
const MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const [y, m, g] = q.giorno.split('-').map(Number);
const chiave = ` ${g} ${MESI[m - 1]} ${y}`;
const tg = new Set();
for (const r of righe) if ((' ' + String(r.Data)).includes(chiave) && r.Veicolo) tg.add(String(r.Veicolo).trim().split(/\s+/).pop());
const out = [...tg].map(t => ({ json: { targa: t, giorno: q.giorno } }));
return out.length ? out : [{ json: { targa: '', giorno: q.giorno } }];
