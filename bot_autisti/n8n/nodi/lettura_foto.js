// risposta della vision -> campi grezzi (la foto può essere qualunque cosa: la vision dice cos'è, il codice controlla i numeri)
const atteso = $('Decidi').first().json.tipo_foto;
const r = $input.first().json;
const testiDi = o => typeof o === 'string' ? [o] : Array.isArray(o) ? o.flatMap(testiDi) : (o && typeof o === 'object') ? Object.values(o).flatMap(testiDi) : [];   // tutto il testo della risposta, qualunque forma abbia
const testo = testiDi(r).find(t => /\{[\s\S]*\}/.test(t)) || testiDi(r).join(' ');
let j = {}; const m = testo.match(/\{[\s\S]*\}/);
try { j = m ? JSON.parse(m[0]) : {}; } catch (e) { j = {}; }
const nOk = v => (v === null || v === undefined || v === '' || isNaN(Number(String(v).replace(',', '.')))) ? null : Number(String(v).replace(',', '.'));
const L = { atteso, tipo: ['scontrino', 'contatore', 'cruscotto', 'danno', 'mezzo', 'lavaggio', 'altro'].includes(j.tipo) ? j.tipo : 'altro', grezzo: testo.slice(0, 400),
  categoria: String(j.categoria || '').toLowerCase(), totale: nOk(j.totale), litri: nOk(j.litri), carburante: String(j.carburante || ''), esercente: String(j.esercente || '').slice(0, 40),
  data: /^\d{4}-\d{2}-\d{2}$/.test(j.data || '') ? j.data : '',
  contatore: /^\d{1,3}$/.test(String(j.contatore ?? '')) ? String(j.contatore) : null,
  km: /^\d{1,7}$/.test(String(j.km ?? '').replace(/\D/g, '')) && String(j.km ?? '').replace(/\D/g, '') !== '' ? String(j.km).replace(/\D/g, '') : null,
  spie: Array.isArray(j.spie) ? j.spie.slice(0, 6).map(String) : [],
  targa: /^[A-Z]{2}\s?\d{3}\s?[A-Z]{2}$|^[A-Z]{2}\d{5}$/i.test(String(j.targa || '').trim()) ? String(j.targa).toUpperCase().replace(/\s/g, '') : '',
  descrizione: String(j.descrizione || '').slice(0, 200) };
return [{ json: L }];
