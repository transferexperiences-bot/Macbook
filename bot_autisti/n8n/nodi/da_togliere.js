// i bottoni dei messaggi vecchi si tolgono appena il bot ha scritto un messaggio nuovo: resta attivo solo l'ultimo
const N = $('Nuovi bottoni').first().json;
let vecchi = []; try { const r = $('Leggi bottoni').all().map(i => i.json).find(x => x && x.chat === N.chat); vecchi = r ? JSON.parse(r.lista || '[]') : []; } catch (e) { vecchi = []; }
const tenere = new Set(N.nuovi.map(x => x.id));
return vecchi.filter(x => x && x.id && !tenere.has(x.id)).map(x => ({ json: { chat: N.chat, message_id: x.id, testo: x.testo || '·' } }));
