// Telegram consegna il vocale senza estensione: Whisper vuole il formato nel nome del file (stessa correzione di Rendicontazione)
const OK = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'];
const MIME = { ogg: 'audio/ogg', oga: 'audio/ogg', mp3: 'audio/mpeg', mpga: 'audio/mpeg', mpeg: 'audio/mpeg', m4a: 'audio/m4a', mp4: 'audio/mp4', wav: 'audio/wav', webm: 'audio/webm', flac: 'audio/flac' };
const items = $input.all();
for (const item of items) {
  const bin = item.binary && item.binary.data; if (!bin) continue;
  let ext = (String(item.json?.result?.file_path || '').split('.').pop() || '').toLowerCase();
  if (!OK.includes(ext)) { const mime = String($('Decidi').first().json.mime || '').toLowerCase(); ext = mime.includes('mpeg') || mime.includes('mp3') ? 'mp3' : mime.includes('mp4') || mime.includes('m4a') ? 'm4a' : mime.includes('wav') ? 'wav' : 'ogg'; }
  bin.fileName = 'audio.' + ext; bin.fileExtension = ext; bin.mimeType = MIME[ext] || 'audio/ogg';
}
return items;
