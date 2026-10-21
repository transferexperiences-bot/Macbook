// ogni scrittura preparata dal motore -> una riga nella tabella di prova (in prova niente fogli veri)
const M = $('Motore').first().json, q = new Date().toISOString();
return (M.scritture || []).map(w => ({ json: { quando: q, chat: String(w.chat || ''), dove: String(w.dove || ''), rif: String(w.rif || w.chiave || w.Id || ''), dati: JSON.stringify(w).slice(0, 8000) } }));
