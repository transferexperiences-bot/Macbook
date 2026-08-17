// Banco offline per "Trova Rientro" (n8n/tool-rientro/trova-rientro.js).
// Riproduce l'ambiente n8n ($('Trigger Rientro'), $('Leggi Prenotazioni NCC 3.0'))
// e rigioca i casi veri del 16/08: 741981 (destinazione ignorata) e 742264
// (rientro diventato modifica dell'andata).
//
// Il giorno "oggi" lo decide il codice con oggiRoma(): il banco fissa la data
// passandola come input `data`, così le prove non scadono domani.
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'n8n', 'tool-rientro', 'trova-rientro.js'), 'utf8');

function nodo(trigger, righe) {
  const $ = (name) => {
    if (name === 'Trigger Rientro') return { first: () => ({ json: trigger }) };
    if (name === 'Leggi Prenotazioni NCC 3.0') return { all: () => righe.map((j) => ({ json: j })) };
    throw new Error('nodo non previsto dal banco: ' + name);
  };
  return new Function('$', SRC)($)[0].json;
}

// --- Dati veri, esecuzione 741981 del 16/08 12:32 ---
// query: "aggiungo rientro da Sabbiadoro per il Serafini alle 18.30"
const ID_ANDATA = 'TR/07082026/SSD1XU4R9NS80YGD';
const ANDATA = {
  Allert: '', Data: 'dom 16 agosto 2026', Time: '11:50',
  'Transfer > Da': 'Bari Airport', 'Transfer < Per': 'Sabbiadoro',
  Pax: '7', Nome: '', Fornitori: 'Serafini', 'Cell.': '',
  Modalità: 'Sconto in fattura', Tariffa: '140,00€',
  Note: 'riporatre v<ligie a polignano',
  Autista: 'Giovanni Vito Antonio', Veicolo: 'Minivan',
  Id: ID_ANDATA,
};
const TRIG_741981 = {
  luogo: 'Sabbiadoro', ora: '18:30', data: '16/08/2026', id: '',
  query: 'aggiungo rientro da Sabbiadoro per il Serafini alle 18.30',
};

let ko = 0;
function prova(nome, atteso, effettivo) {
  const a = JSON.stringify(atteso), e = JSON.stringify(effettivo);
  const ok = a === e;
  if (!ok) ko++;
  console.log(`${ok ? '  ok  ' : '  KO  '} ${nome}`);
  if (!ok) console.log(`        atteso:   ${a}\n        ottenuto: ${e}`);
}
function campoRecap(recap, etichetta) {
  const p = recap.split(' | ').find((x) => x.indexOf(etichetta + ': ') === 0);
  return p === undefined ? null : p.slice(etichetta.length + 2);
}

console.log('== Banco: Tool - Rientro, nodo "Trova Rientro" ==\n');

// =====================================================================
// REGOLA 3 — la destinazione detta da Agostino vince
// =====================================================================
{
  // IL CASO DEL GUASTO: prima usciva Per = "Bari Airport", ignorando «per il Serafini».
  const r = nodo(TRIG_741981, [ANDATA]);
  prova('741981 — legge la destinazione dalla frase', 'Serafini', r.destinazione_detta);
  prova('741981 — la destinazione detta vince', 'Serafini', r.rientro.Per);
  prova('741981 — nel recap ci va quella detta', 'Serafini', campoRecap(r.recap_da_salvare, 'Per'));
  prova('741981 — dice da dove viene la meta', 'detta_da_agostino', r.destinazione_da);
  prova('741981 — parte da dove si trova', 'Sabbiadoro', r.rientro.Da);
  prova('741981 — avvisa che vince sulla dedotta', true,
    r.avvisi.some((a) => a.includes('vince su quella dedotta') && a.includes('Bari Airport')));
  prova('741981 — segnala che «Serafini» è anche il fornitore', true,
    r.avvisi.some((a) => a.includes('è anche il nome del fornitore')));
}
{
  // Input esplicito: batte sia la frase sia la deduzione.
  const r = nodo({ ...TRIG_741981, destinazione: 'Polignano a Mare' }, [ANDATA]);
  prova('destinazione esplicita — vince sull\'estrazione', 'Polignano a Mare', r.rientro.Per);
}
{
  // Nessuna destinazione detta: si gira l'andata, come prima.
  const r = nodo({ ...TRIG_741981, query: 'rientro da Sabbiadoro alle 18.30' }, [ANDATA]);
  prova('niente destinazione — si deduce girando l\'andata', 'Bari Airport', r.rientro.Per);
  prova('niente destinazione — lo dichiara', 'dedotta_dall_andata', r.destinazione_da);
  prova('niente destinazione — avvisa che non l\'ha detta lui', true,
    r.avvisi.some((a) => a.includes('dedotta girando l\'andata')));
}

// --- I falsi positivi: "per" non introduce sempre un luogo ---
[
  ['rientro da Sabbiadoro per le 18.30', 'per le 18.30 è un orario'],
  ['rientro da Sabbiadoro per favore', 'per favore non è un posto'],
  ['rientro da Sabbiadoro per ora alle 18', 'per ora non è un posto'],
  ['rientro da Sabbiadoro per il 20 alle 18', 'per il 20 è un giorno'],
].forEach(([q, perche]) => {
  const r = nodo({ ...TRIG_741981, query: q }, [ANDATA]);
  prova(`falso positivo evitato — ${perche}`, '', r.destinazione_detta);
  prova(`  e resta la meta dedotta (${perche})`, 'Bari Airport', r.rientro.Per);
});
{
  const r = nodo({ ...TRIG_741981, query: 'rientro da Sabbiadoro verso Monopoli alle 18' }, [ANDATA]);
  prova('«verso Monopoli» — letto', 'Monopoli', r.rientro.Per);
}
{
  const r = nodo({ ...TRIG_741981, query: 'rientro da Sabbiadoro, riportalo a Alberobello alle 18' }, [ANDATA]);
  prova('«riportalo a Alberobello» — letto', 'Alberobello', r.rientro.Per);
}

// =====================================================================
// REGOLA 2 — autista e veicolo non si ereditano mai
// =====================================================================
{
  // L'andata ha autista Giovanni Vito Antonio e veicolo Minivan: NON devono passare.
  const r = nodo(TRIG_741981, [ANDATA]);
  prova('autista non ereditato', '', r.rientro.Autista);
  prova('veicolo non ereditato', '', r.rientro.Veicolo);
  prova('autista non finisce nel recap', null, campoRecap(r.recap_da_salvare, 'Autista'));
  prova('veicolo non finisce nel recap', null, campoRecap(r.recap_da_salvare, 'Veicolo'));
  prova('la scheda dice che non è ereditato', true, r.scheda.includes('non ereditato'));
  prova('l\'andata resta consultabile', 'Giovanni Vito Antonio', r.andata.Autista);
  prova('avvisa che restano vuoti e cita l\'andata', true,
    r.avvisi.some((a) => a.includes('restano VUOTI') && a.includes('Giovanni Vito Antonio')));
}
{
  // Detto adesso da Agostino: allora sì, e solo allora.
  const r = nodo({ ...TRIG_741981, autista: 'Nico', veicolo: 'Berlina' }, [ANDATA]);
  prova('autista detto adesso — passa', 'Nico', r.rientro.Autista);
  prova('autista detto adesso — entra nel recap', 'Nico', campoRecap(r.recap_da_salvare, 'Autista'));
  prova('veicolo detto adesso — entra nel recap', 'Berlina', campoRecap(r.recap_da_salvare, 'Veicolo'));
  prova('avvisa che l\'hai detto tu', true,
    r.avvisi.some((a) => a.includes('l\'hai detto tu adesso')));
}

// =====================================================================
// REGOLA 1 — sempre riga nuova, mai modifica dell'andata
// =====================================================================
{
  const r = nodo(TRIG_741981, [ANDATA]);
  prova('742264 — dichiara intent nuovo', 'nuovo', r.intent);
  prova('742264 — il recap comincia con «Nuovo transfer»', true,
    r.recap_da_salvare.startsWith('Nuovo transfer'));
  prova('742264 — l\'Id dell\'andata non è un campo Id', undefined, r.recap_da_salvare.match(/(^| \| )Id: /) || undefined);
  prova('742264 — l\'Id dell\'andata è marcato come riferimento', ID_ANDATA, r.id_andata_solo_riferimento);
  prova('742264 — l\'Id sta solo nelle Note', true,
    campoRecap(r.recap_da_salvare, 'Note').startsWith('Rientro di ' + ID_ANDATA));
  prova('742264 — le istruzioni vietano intent modifica', true,
    r.istruzioni.includes('NON produrre [INTENT: modifica]'));
  prova('742264 — le istruzioni vietano cerca_servizi', true,
    r.istruzioni.includes('cerca_servizi'));
  prova('742264 — le istruzioni citano l\'Id da NON riusare', true,
    r.istruzioni.includes(ID_ANDATA));
}
// La regola 1 esce da OGNI ramo, anche quando non c'è niente da preparare.
{
  const r = nodo({ luogo: '', ora: '', data: '16/08/2026', id: '', query: 'metti un rientro' }, [ANDATA]);
  prova('ramo dati_mancanti — esito', 'dati_mancanti', r.esito);
  prova('ramo dati_mancanti — porta la regola 1', true, r.istruzioni.includes('REGOLA 1'));
}
{
  const r = nodo({ ...TRIG_741981, luogo: 'Gallipoli' }, [ANDATA]);
  prova('ramo nessuno — esito', 'nessuno', r.esito);
  prova('ramo nessuno — porta la regola 1', true, r.istruzioni.includes('REGOLA 1'));
  prova('ramo nessuno — non inventa niente', undefined, r.rientro);
}
{
  const seconda = { ...ANDATA, Time: '15:00', Nome: 'Rossi', Id: 'TR/07082026/ALTRO' };
  const r = nodo(TRIG_741981, [ANDATA, seconda]);
  prova('due andate — chiede di scegliere', 'scegli', r.esito);
  prova('due andate — quante', 2, r.quanti);
  prova('due andate — porta la regola 1', true, r.istruzioni.includes('REGOLA 1'));
  prova('due andate — non prepara niente', undefined, r.recap_da_salvare);
}
{
  const seconda = { ...ANDATA, Time: '15:00', Nome: 'Rossi', Id: 'TR/07082026/ALTRO' };
  const r = nodo({ ...TRIG_741981, id: 'TR/07082026/ALTRO' }, [ANDATA, seconda]);
  prova('Id scelto — prepara quella giusta', 'TR/07082026/ALTRO', r.id_andata_solo_riferimento);
  prova('Id scelto — ed è pronto', 'pronto', r.esito);
}

// =====================================================================
// Quello che c'era prima e deve restare
// =====================================================================
{
  const r = nodo(TRIG_741981, [ANDATA]);
  prova('modalità: sconto in fattura si copia', 'Sconto in fattura', r.rientro.Modalita);
  prova('tariffa copiata e segnalata', '140,00€', r.rientro.Tariffa);
  prova('tariffa: avviso di conferma', true, r.avvisi.some((a) => a.includes('confermala o correggila')));
  prova('pax dall\'andata', '7', r.rientro.Pax);
  prova('fornitore dall\'andata', 'Serafini', r.rientro.Fornitori);
  prova('data del rientro = giorno chiesto', '16/08/2026', r.rientro.Data);
  prova('non blocca', 'pronto', r.esito);
}
{
  // Contanti all'andata -> «Incassare» sul rientro (regola del 12/08).
  const r = nodo(TRIG_741981, [{ ...ANDATA, Modalità: 'Contanti' }]);
  prova('contanti all\'andata — sul rientro si incassa', 'Incassare', r.rientro.Modalita);
}
{
  // Senza ora: bloccante, e non si salva niente.
  const r = nodo({ ...TRIG_741981, ora: '', query: 'rientro da Sabbiadoro' }, [ANDATA]);
  prova('senza ora — da completare', 'da_completare', r.esito);
  prova('senza ora — istruzioni di non salvare', true, r.istruzioni.includes('NON salvare'));
}
{
  // Doppione: il rientro esiste già.
  const gia = {
    Allert: '', Data: 'dom 16 agosto 2026', Time: '18:30',
    'Transfer > Da': 'Sabbiadoro', 'Transfer < Per': 'Serafini',
    Pax: '7', Nome: '', Fornitori: 'Serafini', Id: 'TR/16082026/GIAFATTO',
  };
  const r = nodo(TRIG_741981, [ANDATA, gia]);
  prova('doppione — bloccante', 'da_completare', r.esito);
  prova('doppione — lo dice con l\'Id', true,
    r.avvisi.some((a) => a.includes('esiste GIÀ') && a.includes('TR/16082026/GIAFATTO')));
}
{
  // Riga cancellata: non è un'andata valida.
  const r = nodo(TRIG_741981, [{ ...ANDATA, Allert: 'Cancellato' }]);
  prova('andata cancellata — non la propone', 'nessuno', r.esito);
}

console.log(`\n${ko === 0 ? 'Tutte le prove passano.' : ko + ' prove FALLITE.'}`);
process.exit(ko === 0 ? 0 : 1);
