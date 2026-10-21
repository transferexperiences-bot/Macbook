// trascrizione del vocale -> testo; da qui in poi il vocale è trattato come un messaggio scritto
const r = $input.first().json || {};
const t = String(r.text || r.transcription || (r.data && r.data.text) || '').trim();
return [{ json: { testo: t.slice(0, 1000) } }];
