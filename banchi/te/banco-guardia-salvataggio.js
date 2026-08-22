#!/usr/bin/env node
// Banco di prova offline del nodo «Guardia Salvataggio» (Prenotazioni Transfer 6.0).
//   node banchi/te/banco-guardia-salvataggio.js
// Dati veri:
//   · 777940 (21/08 07:51:59) — «Salva subito» su un rientro: Parse transfer legge il
//     transfer ma con Id vuoto, il gestionale risponde rows: [] e il bot manda lo stesso
//     «✅ Conferma transfer — Tariffa: ⚠️ DA DEFINIRE». Il transfer non esisteva.
//   · 777827 (21/08 07:36:55) — l'andata delle 11:05: ricevuta con row_number 1250.
//     Lì la guardia non deve toccare NIENTE.
const fs = require('fs');
const path = require('path');
const CODICE = fs.readFileSync(
  path.join(__dirname, '../../backups/n8n/prenotazioni/guardia-salvataggio.js'), 'utf8');

let ok = 0, ko = 0;
function prova(nome, cond, extra) {
  if (cond) { ok++; console.log('  ✅ ' + nome); }
  else { ko++; console.log('  ❌ ' + nome + (extra ? '  →  ' + extra : '')); }
}

function esegui(ctx, inputItems) {
  const $ = (nome) => {
    if (!(nome in ctx)) throw new Error('nodo non previsto: ' + nome);
    const items = ctx[nome].map((j) => ({ json: j }));
    return { first: () => items[0], all: () => items };
  };
  const $input = { all: () => inputItems.map((j) => ({ json: j })) };
  return new Function('$', '$input', CODICE)($, $input);
}

// ---------------------------------------------------------------- 777940
// la scheda su cui ha premuto, com'è arrivata davvero (con le code «🗺️ Maps»)
const SCHEDA_777940 = [
  '🔄 RIENTRO da preparare',
  '📅 Data: 21/08/2026',
  '🕐 Ora: 14:15',
  '📍 Da: Cala Ponte Marina  🗺️ Maps',
  '🎯 Per: Masseria Tarsia Morisco (dedotta dall\'andata)  🗺️ Maps',
  '👥 Pax: —',
  '👤 Nome: —',
  '📞 Cell: —',
  '💳 Modalità: Incassare',
  '🏢 Fornitori: Masseria Tarsia Morisco',
  '💰 Tariffa: 50,00€',
  '🚐 Autista: — (non ereditato dall\'andata)',
  '🚗 Veicolo: — (non ereditato dall\'andata)',
].join('\n');

// quello che il bot gli aveva mandato: la bugia da fermare
const USCITA_SBAGLIATA = {
  telegram: { text: '✅ <b>Conferma transfer</b>\n\n💶 Tariffa: ⚠️ DA DEFINIRE', parse_mode: 'HTML' },
  replyMarkupJson: null,
  _meta: { useEN: false, chunkIndex: 0, totalChunks: 1 },
};

const CTX_777940 = {
  'Normalizer (kind/text/file_id)': [{ chat_id: '522233722', text: 'Salva subito',
    originalMessageText: SCHEDA_777940 }],
  'Salva via Parse transfer (intent)': [{ rows: '[]' }],
};

console.log('\n1) 777940 — il gestionale non ha scritto: non si dice «Conferma»');
{
  const out = esegui(CTX_777940, [USCITA_SBAGLIATA]);
  const t = out[0].json.telegram.text;
  prova('non dice piu «Conferma transfer»', !/Conferma transfer/i.test(t), t.slice(0, 60));
  prova('lo dice chiaro: NON SALVATO', /NON SALVATO/.test(t));
  prova('marca il giro come andato a vuoto', out[0].json.salvataggio_a_vuoto === true);
  prova('un solo messaggio, non due', out.length === 1, 'n=' + out.length);

  console.log('\n   la tariffa che spariva:');
  prova('la tariffa 50,00€ c\'è', /💶 Tariffa: 50,00€/.test(t), t);
  prova('non dice piu «DA DEFINIRE»', !/DA DEFINIRE/.test(t));
  prova('la data c\'è', /21\/08\/2026/.test(t));
  prova('l\'ora c\'è', /14:15/.test(t));
  prova('la tratta c\'è', /Cala Ponte Marina/.test(t) && /Masseria Tarsia Morisco/.test(t));
  prova('la coda «🗺️ Maps» non finisce nel messaggio', !/Maps/.test(t), t);
  prova('dice perché: manca l\'Id', /nessun Id/.test(t));
}

// ---------------------------------------------------------------- 777827
console.log('\n2) 777827 — il gestionale ha scritto la riga 1250: non si tocca niente');
{
  const RICEVUTA = JSON.stringify([{ row_number: 1250, Data: 'ven 21 agosto 2026', Time: '11:05',
    'Transfer > Da': 'Brindisi Airport', 'Transfer < Per': 'Masseria le Torri', Tariffa: 140,
    Id: 'TR/21082026/FFF77OVFNDBGSEGX' }]);
  const buona = { telegram: { text: '✅ <b>Conferma transfer</b>\n\n📅 ven 21 agosto 2026 ore 11:05\n💶 Tariffa: 140€', parse_mode: 'HTML' }, replyMarkupJson: null };
  const out = esegui({
    'Normalizer (kind/text/file_id)': [{ chat_id: '522233722', originalMessageText: '⏳ Resta 1 bozza aperta' }],
    'Salva via Parse transfer (intent)': [{ rows: RICEVUTA }],
  }, [buona]);
  prova('il messaggio di conferma passa intatto', out[0].json.telegram.text === buona.telegram.text);
  prova('non marca niente', out[0].json.salvataggio_a_vuoto === undefined);
}

console.log('\n3) quando non si sa, non si tocca');
{
  const passante = { telegram: { text: 'un messaggio qualunque', parse_mode: 'HTML' } };
  // (a) il nodo del salvataggio non ha girato in questo giro
  const a = esegui({ 'Normalizer (kind/text/file_id)': [{ originalMessageText: '' }] }, [passante]);
  prova('nodo del salvataggio assente → passa tutto', a[0].json.telegram.text === 'un messaggio qualunque');
  // (b) ricevuta illeggibile
  const b = esegui({
    'Normalizer (kind/text/file_id)': [{ originalMessageText: '' }],
    'Salva via Parse transfer (intent)': [{ rows: '{rotto' }],
  }, [passante]);
  prova('ricevuta illeggibile → passa tutto', b[0].json.telegram.text === 'un messaggio qualunque');
  // (c) nessun campo rows (giro che non salva)
  const c = esegui({
    'Normalizer (kind/text/file_id)': [{ originalMessageText: '' }],
    'Salva via Parse transfer (intent)': [{ skipped: true }],
  }, [passante]);
  prova('ricevuta assente → si comporta come zero righe', /NON SALVATO/.test(c[0].json.telegram.text));
  // (d) piu messaggi in ingresso, ricevuta piena
  const d = esegui({
    'Normalizer (kind/text/file_id)': [{ originalMessageText: '' }],
    'Salva via Parse transfer (intent)': [{ rows: '[{"row_number":1}]' }],
  }, [passante, passante]);
  prova('ricevuta piena e due pezzi → passano tutti e due', d.length === 2);
}

console.log('\n4) la tariffa non si inventa mai');
{
  const senzaTariffa = SCHEDA_777940.replace('💰 Tariffa: 50,00€', '💰 Tariffa: DA DEFINIRE');
  const out = esegui({
    'Normalizer (kind/text/file_id)': [{ originalMessageText: senzaTariffa }],
    'Salva via Parse transfer (intent)': [{ rows: '[]' }],
  }, [USCITA_SBAGLIATA]);
  prova('se nella scheda la tariffa non c\'era, lo riporta com\'è',
    /💶 Tariffa: DA DEFINIRE/.test(out[0].json.telegram.text), out[0].json.telegram.text);

  const vuota = SCHEDA_777940.replace('💰 Tariffa: 50,00€', '💰 Tariffa:');
  const out2 = esegui({
    'Normalizer (kind/text/file_id)': [{ originalMessageText: vuota }],
    'Salva via Parse transfer (intent)': [{ rows: '[]' }],
  }, [USCITA_SBAGLIATA]);
  prova('campo vuoto → lo dice, non inventa un numero',
    /non c'era nemmeno nella scheda/.test(out2[0].json.telegram.text), out2[0].json.telegram.text);
}

// ============================================================================
// 5) 779301 — la riga finisce sul gestionale senza data e senza ora
// Vocale «Segna il transfer ORA da Auraterrae…» trascritto «Segnal transfer URA…».
// La riga 1271 e stata scritta con Data "" e Time "", e ad Agostino e arrivato
// «Conferma transfer» senza un accenno.
// ============================================================================
console.log('\n5) 779301 — salvato senza data e ora: adesso lo dice');
{
  const RIGA_MONCA = JSON.stringify([{ row_number: 1271, Data: '', Time: '',
    'Transfer > Da': 'Auraterrae', 'Transfer < Per': 'Cala Ponte Hotel',
    Nome: 'URA', Tariffa: 35, Id: 'TR/21082026/LJJEH8ABQN6WO8AW' }]);
  const conferma = { telegram: { text: '\u2705 <b>Conferma transfer</b>\n\n\ud83d\udcb6 Tariffa: 35\u20ac', parse_mode: 'HTML' }, replyMarkupJson: null };
  const out = esegui({
    'Normalizer (kind/text/file_id)': [{ originalMessageText: '' }],
    'Salva via Parse transfer (intent)': [{ rows: RIGA_MONCA }],
  }, [conferma]);
  const t = out[0].json.telegram.text;
  prova('avvisa che manca data e ora', /Salvato senza data e ora/.test(t), t.slice(0, 80));
  prova('dice che non comparira nelle liste', /nessuna lista del giorno/.test(t));
  prova('mostra la tratta', /Auraterrae → Cala Ponte Hotel/.test(t), t);
  prova('mostra l\'Id da correggere', /TR\/21082026\/LJJEH8ABQN6WO8AW/.test(t));
  prova('offre la strada corta', /Scrivi «ora»/.test(t));
  prova('e il recap di conferma resta sotto', /Conferma transfer/.test(t), t);
  prova('marcato salvataggio_monco', Array.isArray(out[0].json.salvataggio_monco) &&
    out[0].json.salvataggio_monco[0] === 'TR/21082026/LJJEH8ABQN6WO8AW');
}

console.log('\n6) manca una sola delle due');
{
  const conferma = { telegram: { text: 'ok', parse_mode: 'HTML' } };
  const solo = (Data, Time) => esegui({
    'Normalizer (kind/text/file_id)': [{ originalMessageText: '' }],
    'Salva via Parse transfer (intent)': [{ rows: JSON.stringify([{ row_number: 9,
      Data: Data, Time: Time, 'Transfer > Da': 'A', 'Transfer < Per': 'B', Id: 'TR/21082026/XXXXXXXXXXXXXXXX' }]) }],
  }, [conferma])[0].json.telegram.text;
  prova('manca solo la data', /Salvato senza la data/.test(solo('', '10:00')), solo('', '10:00').slice(0, 60));
  prova('manca solo l\'ora', /Salvato senza l'ora/.test(solo('21/08/2026', '')), solo('21/08/2026', '').slice(0, 60));
}

console.log('\n7) riga completa: non si tocca NIENTE');
{
  const RIGA_1250 = JSON.stringify([{ row_number: 1250, Data: 'ven 21 agosto 2026', Time: '11:05',
    'Transfer > Da': 'Brindisi Airport', 'Transfer < Per': 'Masseria le Torri',
    Tariffa: 140, Id: 'TR/21082026/FFF77OVFNDBGSEGX' }]);
  const buona = { telegram: { text: '\u2705 <b>Conferma transfer</b>\n\n\ud83d\udcc5 ven 21 agosto 2026 ore 11:05', parse_mode: 'HTML' }, replyMarkupJson: null };
  const out = esegui({
    'Normalizer (kind/text/file_id)': [{ originalMessageText: '' }],
    'Salva via Parse transfer (intent)': [{ rows: RIGA_1250 }],
  }, [buona]);
  prova('il messaggio passa identico', out[0].json.telegram.text === buona.telegram.text);
  prova('nessun marcatore', out[0].json.salvataggio_monco === undefined);
  prova('nessun avviso', !/Salvato senza/.test(out[0].json.telegram.text));
}

console.log('\n8) piu righe, solo una monca');
{
  const DUE = JSON.stringify([
    { row_number: 1269, Data: 'ven 21 agosto 2026', Time: '19:10', 'Transfer > Da': 'Bari Airport', 'Transfer < Per': 'Tre vigne', Id: 'TR/21082026/3C6AYQLRTQ0LID9X' },
    { row_number: 1271, Data: '', Time: '', 'Transfer > Da': 'Auraterrae', 'Transfer < Per': 'Cala Ponte Hotel', Id: 'TR/21082026/LJJEH8ABQN6WO8AW' },
  ]);
  const out = esegui({
    'Normalizer (kind/text/file_id)': [{ originalMessageText: '' }],
    'Salva via Parse transfer (intent)': [{ rows: DUE }],
  }, [{ telegram: { text: 'recap', parse_mode: 'HTML' } }]);
  const t = out[0].json.telegram.text;
  prova('avvisa solo per quella monca', (t.match(/Salvato senza/g) || []).length === 1, t);
  prova('e nomina la sua tratta', /Auraterrae/.test(t) && !/Bari Airport/.test(t), t);
  prova('un Id solo marcato', out[0].json.salvataggio_monco.length === 1);
}

console.log('\n781233 — «salva tutte le bozze»: 3 spedite, la ricevuta ne porta 1');
{
  const I1 = 'TR/21082026/WCHHH6H8G4A5FJDW';
  const I2 = 'TR/21082026/FFOPQU5EARO5XFRH';
  const I3 = 'TR/21082026/H0IQMZ09HP0RZ21Y';
  const reg = {};
  reg[I1] = { b: '🚐 TRANSFER 1\n📅 Data: 21/08/2026\n🕐 Ora: 19:45\n📍 Da: Cala Ponte Hotel\n🎯 Per: Otella\n🆔 Id: ' + I1, ts: 1 };
  reg[I2] = { b: '🚐 TRANSFER 2\n📅 Data: 21/08/2026\n🕐 Ora: da definire\n📍 Da: Masseria Tarsia Morisco\n🎯 Per: Monopoli\n🆔 Id: ' + I2, ts: 1 };
  reg[I3] = { b: '🚐 TRANSFER 3\n📅 Data: 21/08/2026\n🕐 Ora: da concordare\n📍 Da: Monopoli\n🎯 Per: Masseria Tarsia Morisco\n🆔 Id: ' + I3, ts: 1 };
  const ctx = {
    'Salva via Parse transfer (intent)': [{ rows: JSON.stringify([
      { row_number: 1289, Data: 'ven 21 agosto 2026', Time: '19:45', Id: I1,
        'Transfer > Da': 'Cala Ponte Hotel', 'Transfer < Per': 'Otella' }]) }],
    'Componi Payload Salvataggio': [{ payload_schede: [I1, I2, I3] }],
    'Leggi Bozze': [{ chatd: 'BOZZE|522233722', Dati: JSON.stringify(reg) }],
    'Normalizer (kind/text/file_id)': [{ originalMessageText: '' }],
  };
  const out = esegui(ctx, [{ telegram: { text: '✅ <b>Conferma transfer</b>\n\nCala Ponte Hotel → Otella', parse_mode: 'HTML' } }]);
  const t = out[0].json.telegram.text;
  prova('non passa più zitto', /non confermate dal gestionale/.test(t), t.slice(0, 160));
  prova('dice quante ne ha mandate e quante ne torna', /mandate 3/.test(t) && /riporta 1/.test(t), t.slice(0, 300));
  prova('nomina le due che mancano, per tratta', /Masseria Tarsia Morisco → Monopoli/.test(t) && /Monopoli → Masseria Tarsia Morisco/.test(t), t);
  prova('e i loro Id', t.indexOf(I2) !== -1 && t.indexOf(I3) !== -1);
  prova('NON nomina quella confermata', t.indexOf(I1) === -1, t);
  prova('non dichiara che non sono salvate: dice che non lo sa', /Non so se sono state scritte/.test(t));
  prova('spiega che rimandarle non fa doppioni', /non si creano doppioni/.test(t));
  prova('il messaggio di prima resta sotto, non si perde', /Conferma transfer/.test(t));
  prova('lo espone anche a valle', JSON.stringify(out[0].json.salvataggio_non_confermato) === JSON.stringify([I2, I3]));
}

console.log('\nquando invece torna tutto, la guardia sta zitta');
{
  const I1 = 'TR/21082026/AAAAAAAAAAAAAAAA', I2 = 'TR/21082026/BBBBBBBBBBBBBBBB';
  const ctx = {
    'Salva via Parse transfer (intent)': [{ rows: JSON.stringify([
      { row_number: 1, Data: 'ven 21 agosto 2026', Time: '10:00', Id: I1 },
      { row_number: 2, Data: 'ven 21 agosto 2026', Time: '11:00', Id: I2 }]) }],
    'Componi Payload Salvataggio': [{ payload_schede: [I1, I2] }],
    'Leggi Bozze': [{ chatd: 'BOZZE|522233722', Dati: '{}' }],
    'Normalizer (kind/text/file_id)': [{ originalMessageText: '' }],
  };
  const dentro = [{ telegram: { text: '✅ Conferma transfer', parse_mode: 'HTML' } }];
  const out = esegui(ctx, dentro);
  prova('messaggio identico, nessun avviso', out[0].json.telegram.text === '✅ Conferma transfer', out[0].json.telegram.text);
}

console.log('\nse non si sa cosa è stato spedito, non si inventa un avviso');
{
  const I1 = 'TR/21082026/AAAAAAAAAAAAAAAA';
  const ctx = {
    'Salva via Parse transfer (intent)': [{ rows: JSON.stringify([{ row_number: 1, Data: 'ven 21 agosto 2026', Time: '10:00', Id: I1 }]) }],
    'Componi Payload Salvataggio': [{}],
    'Leggi Bozze': [{ chatd: 'BOZZE|522233722', Dati: '{}' }],
    'Normalizer (kind/text/file_id)': [{ originalMessageText: '' }],
  };
  const out = esegui(ctx, [{ telegram: { text: '✅ Conferma transfer', parse_mode: 'HTML' } }]);
  prova('nessun payload = nessun avviso', out[0].json.telegram.text === '✅ Conferma transfer', out[0].json.telegram.text);
}

console.log('\n=============================');
console.log('  ' + ok + ' passate, ' + ko + ' fallite');
console.log('=============================');
process.exit(ko ? 1 : 0);
