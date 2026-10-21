// le regole che Agostino chiede di ricordare: una riga per nota nella tabella RA Memoria (le legge il modello a ogni messaggio)
const M = $('Motore').first().json, q = new Date().toISOString();
return (M.scritture || []).filter(w => w.dove === 'memoria').map(w => ({ json: { quando: q, chi: String(w.chi || ''), nota: String(w.nota || ''), attiva: true } }));
