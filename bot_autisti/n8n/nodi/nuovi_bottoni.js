// messaggi appena mandati che hanno i bottoni: li ricordo, così al prossimo giro i loro bottoni si tolgono (Agostino 21/10)
const chat = String($('Motore').first().json.chat);
const nuovi = $input.all().map(i => i.json && i.json.result).filter(r => r && r.message_id && r.reply_markup && String(r.chat && r.chat.id) === chat)
  .map(r => ({ id: r.message_id, testo: String(r.text || '').slice(0, 3500) }));
return [{ json: { chat, nuovi } }];
