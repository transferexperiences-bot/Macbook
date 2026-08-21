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

console.log('\n=============================');
console.log('  ' + ok + ' passate, ' + ko + ' fallite');
console.log('=============================');
process.exit(ko ? 1 : 0);
