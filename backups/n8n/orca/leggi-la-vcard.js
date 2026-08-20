// === LEGGI LA VCARD — 20/08/2026 ===
// Nodo: «Leggi la vCard» in Agente Orchestratore (UAz4R93BWh9VuLiR), fra
// «Switch (document mime)» uscita vcard e «Set text (vCard)».
//
// IL GUASTO, CON LA PROVA. Esecuzione 772535 del 20/08 alle 09:54: Agostino manda il
// contatto «Ivan Deluxe Nemeth.vcf» e Orca risponde:
//   «mi è arrivata solo la vcard ma senza dati leggibili (vedo solo "VERSION:3.0",
//    niente nome/telefono/email)»
// Il nome e il numero erano dentro il file. Al posto di questo nodo c'era un
// «Extract From File» senza operazione impostata: n8n ripiega sul CSV, legge la prima
// riga del .vcf («BEGIN:VCARD») come intestazione di colonna e la seconda
// («VERSION:3.0») come unico dato. Tutto il resto del contatto veniva buttato.
// Prenotazioni Transfer 6.0 il lettore giusto ce l'ha dal 07/08; Orca no. Questo è quello.
//
// COSA FA. Prende il file come testo e legge la vCard per davvero: nome, telefoni,
// email, azienda, ruolo, note. Regge le tre cose che nella pratica rompono i parser:
//   · le righe piegate (una riga lunga spezzata e continuata con uno spazio davanti);
//   · quoted-printable e base64, che iOS e Android usano per gli accenti;
//   · il prefisso «itemN.» di iOS (item1.TEL, item2.EMAIL).
// E prende il binario in tre modi diversi, perché in n8n quale funzioni dipende da come
// gira il nodo: se uno non risponde si prova il successivo.
//
// Se non riesce a leggerlo NON inventa: lo dice, e allega le prime righe del file così
// si capisce perché. Meglio «non l'ho letto» che un contatto mezzo vuoto.
//
// Banco: banchi/te/banco-vcard.js
const items = $input.all();
const out = [];

const daQuotedPrintable = (s) => s
  .replace(/=\r?\n/g, '')
  .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

function decodifica(valore, encoding, charset) {
  if (!valore) return '';
  if (encoding && /quoted-printable/i.test(encoding)) {
    const grezzo = daQuotedPrintable(valore);
    // quoted-printable con charset utf-8: i byte vanno ricomposti, altrimenti «à» esce rotta
    if (!charset || /utf-?8/i.test(charset)) {
      try { return Buffer.from(grezzo, 'binary').toString('utf8'); } catch (e) { return grezzo; }
    }
    return grezzo;
  }
  if (encoding && /base64/i.test(encoding)) {
    try { return Buffer.from(valore, 'base64').toString('utf8'); } catch (e) { return valore; }
  }
  return valore;
}

function leggiRiga(riga) {
  const i = riga.indexOf(':');
  if (i === -1) return null;
  const testa = riga.slice(0, i);
  const valore = riga.slice(i + 1);
  const pezzi = testa.split(';');
  // iOS mette «item1.» davanti: item1.TEL è un TEL.
  const proprieta = pezzi[0].toUpperCase().replace(/^ITEM\d+\./, '');
  const param = {};
  for (let k = 1; k < pezzi.length; k++) {
    const p = pezzi[k];
    if (p.indexOf('=') !== -1) { const kv = p.split('='); param[kv[0].toUpperCase()] = kv[1]; }
    else param.TYPE = (param.TYPE ? param.TYPE + ',' : '') + p;
  }
  return { proprieta: proprieta, param: param, valore: valore };
}

function leggiVCard(testo) {
  const righe = String(testo).replace(/\r\n/g, '\n').split('\n');
  // una riga che comincia con spazio o tab è la continuazione della precedente
  const unite = [];
  for (const r of righe) {
    if ((r.charAt(0) === ' ' || r.charAt(0) === '\t') && unite.length) unite[unite.length - 1] += r.slice(1);
    else unite.push(r);
  }
  const schede = [];
  let corrente = null;
  for (const r of unite) {
    if (!r.trim()) continue;
    const su = r.toUpperCase();
    if (su.indexOf('BEGIN:VCARD') === 0) { corrente = { tel: [], email: [] }; continue; }
    if (su.indexOf('END:VCARD') === 0) { if (corrente) schede.push(corrente); corrente = null; continue; }
    if (!corrente) continue;
    const p = leggiRiga(r);
    if (!p) continue;
    const v = decodifica(p.valore, p.param.ENCODING, p.param.CHARSET);
    if (p.proprieta === 'FN') corrente.fn = v;
    else if (p.proprieta === 'N') {
      const parti = v.split(';');
      corrente.n = { cognome: parti[0] || '', nome: parti[1] || '', secondo: parti[2] || '',
                     titolo: parti[3] || '', suffisso: parti[4] || '' };
    }
    else if (p.proprieta === 'TEL') corrente.tel.push({ numero: v, tipo: p.param.TYPE || '' });
    else if (p.proprieta === 'EMAIL') corrente.email.push(v);
    else if (p.proprieta === 'ORG') corrente.org = v.replace(/;/g, ' ').trim();
    else if (p.proprieta === 'TITLE') corrente.ruolo = v;
    else if (p.proprieta === 'NOTE') corrente.note = v;
  }
  return schede;
}

function nomeLeggibile(c) {
  if (c.fn && c.fn.trim()) return c.fn.trim();
  if (c.n) {
    const p = [c.n.titolo, c.n.nome, c.n.secondo, c.n.cognome, c.n.suffisso]
      .filter((x) => x && x.trim()).join(' ').trim();
    if (p) return p;
  }
  return '';
}

function inItaliano(c) {
  const righe = [];
  const nome = nomeLeggibile(c);
  if (nome) righe.push('Nome: ' + nome);
  if (c.tel.length) righe.push('Telefono: ' + c.tel.map((t) => t.tipo ? t.numero + ' (' + t.tipo + ')' : t.numero).join(', '));
  if (c.email.length) righe.push('Email: ' + c.email.join(', '));
  if (c.org) righe.push('Azienda: ' + c.org);
  if (c.ruolo) righe.push('Ruolo: ' + c.ruolo);
  if (c.note) righe.push('Note: ' + c.note);
  return righe.join('\n');
}

// Il binario, nei tre modi in cui n8n lo lascia prendere.
async function testoDelFile(item, i) {
  try {
    if (typeof $getBinaryDataBuffer === 'function') {
      const b = await $getBinaryDataBuffer(i, 'data');
      if (b && b.length) return { testo: b.toString('utf8'), come: 'buffer' };
    }
  } catch (e) {}
  try {
    const h = (typeof this !== 'undefined' && this) ? this.helpers : null;
    if (h && typeof h.getBinaryDataBuffer === 'function') {
      const b = await h.getBinaryDataBuffer(i, 'data');
      if (b && b.length) return { testo: b.toString('utf8'), come: 'helpers' };
    }
  } catch (e) {}
  try {
    // ultima strada: il binario inline. Niente soglie di lunghezza e nessun controllo sul
    // contenuto: una vCard vuota è corta, e a dire se è una vCard ci pensa il lettore.
    const bin = item.binary && item.binary.data;
    if (bin && typeof bin.data === 'string' && bin.data.length) {
      const d = Buffer.from(bin.data, 'base64').toString('utf8');
      if (d.trim()) return { testo: d, come: 'base64' };
    }
  } catch (e) {}
  return { testo: '', come: 'niente' };
}

for (let i = 0; i < items.length; i++) {
  const item = items[i];
  const preso = await testoDelFile.call(this, item, i);
  if (!preso.testo) {
    out.push({ json: { text: '📇 Contatto ricevuto ma non sono riuscito ad aprirlo. Riscrivimi nome e numero.',
                       kind: 'vcard', vcard_errore: 'file-vuoto' } });
    continue;
  }
  const schede = leggiVCard(preso.testo);
  if (!schede.length) {
    out.push({ json: { text: '📇 Contatto ricevuto ma non sono riuscito a leggerlo. Riscrivimi nome e numero.',
                       kind: 'vcard', vcard_errore: 'non-e-una-vcard',
                       vcard_inizio: preso.testo.slice(0, 200) } });
    continue;
  }
  for (const c of schede) {
    const testo = inItaliano(c);
    out.push({ json: {
      text: testo || '📇 Contatto ricevuto ma dentro non c\'era nome né numero.',
      kind: 'vcard',
      vcard_come: preso.come,
      vcard_nome: nomeLeggibile(c),
      vcard_telefoni: c.tel.map((t) => t.numero),
      vcard_email: c.email,
      vcard_azienda: c.org || ''
    } });
  }
}
return out;
