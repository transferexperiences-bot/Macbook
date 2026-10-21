// solo dopo che le righe sono state scritte: conferma all'autista (mai prima, mai a parole del modello)
const M = $('Motore').first().json;
const scritte = $input.all().filter(i => i.json && (i.json.id || i.json.createdAt)).length;
const attese = (M.scritture || []).length;
if (!attese) return [];
const recap = (M.scritture || []).filter(w => w.dove === 'recap').length;
const testo = scritte < attese ? `⚠️ Non sono riuscito a salvare tutto (${scritte} su ${attese}). Avviso Agostino, non rifare niente.`
  : M.chiusa ? '✅ Giornata chiusa e salvata.' + (M.scritture[0].prova ? '\n<i>Prova: scritto solo nella tabella RA Prove scritture.</i>' : '')
  : recap ? '✅ Registrato.' + (M.scritture[0].prova ? '\n<i>Prova: scritto solo nella tabella RA Prove scritture.</i>' : '') : '';
return testo ? [{ json: { chat: M.chat, testo: testo + (M.dopo && scritte >= attese ? '\n' + M.dopo : '') } }] : [];
