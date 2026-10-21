// stato e problemi dei mezzi -> tabella RA Eventi mezzi (solo aggiunte, mai modifiche: è lo storico della scheda mezzi)
const M = $('Motore').first().json, q = new Date().toISOString(), out = [];
if (/^9000000\d\d$/.test(String(M.chat))) return [];          // chat finte del campo di prova: non sporcano lo storico dei mezzi
for (const w of M.scritture || []) {
  if (w.dove === 'stato_mezzo') out.push({ json: { quando: q, mezzo: String(w.mezzo || ''), tipo: w.momento || 'chiusura', testo: [w.campi.spie ? 'spie: ' + w.campi.spie : '', w.campi.pulizia ? 'pulizia: ' + w.campi.pulizia : '', w.campi.danni ? 'danni: ' + w.campi.danni : '', w.campi.problemi ? 'problemi: ' + w.campi.problemi : ''].filter(Boolean).join(' · '), km: Number(w.campi.km) || 0, carburante: String(w.campi.carburante || ''), autista: w.autista, giorno: w.giorno, foto: String(w.campi.foto_km || ''), stato: '', prova: !!w.prova } });
  if (w.dove === 'evento_mezzo') out.push({ json: { quando: q, mezzo: String(w.mezzo || ''), tipo: w.tipo || '', testo: String(w.testo || w.rif || ''), km: 0, carburante: '', autista: w.autista, giorno: w.giorno, foto: '', stato: w.stato || (w.tipo === 'problema risolto' ? 'chiuso' : ''), prova: !!w.prova } });
}
return out;
