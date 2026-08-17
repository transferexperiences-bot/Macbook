// Banco offline per "Prepara mancanti" e "Prepara doppioni".
// Dati veri del 17/08 (esecuzione 751702).
const fs = require('fs'), path = require('path');
function carica(file, esporta) {
  const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'n8n', 'controllo-incrociato', file), 'utf8');
  const PURE = SRC.split('// ===== corpo del nodo n8n =====')[0];
  const o = {};
  new Function('exports', PURE + esporta)(o);
  return o;
}
const M = carica('prepara-mancanti.js',
  'exports.tePreparaMancanti_=tePreparaMancanti_;exports.teEunaProva_=teEunaProva_;');
const D = carica('prepara-doppioni.js',
  'exports.tePreparaDoppioni_=tePreparaDoppioni_;');

let ko = 0;
function prova(nome, atteso, effettivo) {
  const a = JSON.stringify(atteso), e = JSON.stringify(effettivo);
  const ok = a === e; if (!ok) ko++;
  console.log(`${ok ? '  ok  ' : '  KO  '} ${nome}`);
  if (!ok) console.log(`        atteso:   ${a}\n        ottenuto: ${e}`);
}

console.log('== Banco: mancanti e doppioni ==\n');

// --- Righe vere del foglio strutture, 17/08 ---
const STR = [
  { Id: 'TR-20260312-8438180e', Data: '12/12/2026', Time: '08:01', 'TRS> DA': 'prova 1',
    'TRS <PER': '', PAX: '1', Nome: '', Fornitore: 'Melograno', 'Tariffa a noi': '0', Modalità: 'Fattura' },
  { Id: 'TR-20260312-a798db7c', Data: '13/12/2026', Time: '08:02', 'TRS> DA': 'prova 2',
    'TRS <PER': '', PAX: '2', Nome: '', Fornitore: 'Melograno', 'Tariffa a noi': '0', Modalità: 'Fattura' },
  { Id: 'TR-20260623-5855c414', Data: '23/08/2026', Time: '12:30', 'TRS> DA': 'Auraterrae',
    'TRS <PER': 'Alberobello', PAX: '2', Nome: 'KUN WENG', Fornitore: 'Auraterrae',
    'Tariffa a noi': '100', Modalità: 'Sconto in fattura', Note: "rientro da concordare un'ora prima" },
  { Id: 'TR-20260817-c47ecbf7', Data: '17/08/2026', Time: '11:00', 'TRS> DA': 'Pietra Blu',
    'TRS <PER': 'Polignano a Mare', PAX: '2', Nome: 'Geiring Nina', Fornitore: 'Pietra Blu',
    'cell.': '491749519019', 'Tariffa a noi': '30', Modalità: 'Incassare',
    Note: "L'ospite richiede il seggiolino per un bambino di 3 anni" },
  { Id: 'TR/17082026/DKYYOIXDUSRRKNQS', Data: '17/08/2026', Time: '19:00', 'TRS> DA': 'Monopoli',
    'TRS <PER': 'Polignano a Mare', PAX: '19', Nome: '', Fornitore: 'Transfer Experience',
    'Tariffa a noi': '75' },
];
const MANC = STR.map((s) => ({ Id: s.Id, Data: s.Data, Nome: s.Nome, Fornitore: s.Fornitore }));

// =====================================================================
// MANCANTI
// =====================================================================
{
  const r = M.tePreparaMancanti_(MANC, STR, 15, 1078);
  prova('le due righe di prova non entrano', 2, r.scartate.length);
  prova('entrano solo le vere', 3, r.quante);
  const ids = r.righe.map((x) => x.riga.Id);
  prova('prova 1 fuori', false, ids.includes('TR-20260312-8438180e'));
  prova('KUN WENG dentro', true, ids.includes('TR-20260623-5855c414'));

  const kun = r.righe.find((x) => x.riga.Id === 'TR-20260623-5855c414').riga;
  prova('KUN — data', '23/08/2026', kun.Data);
  prova('KUN — ora', '12:30', kun.Time);
  prova('KUN — tratta', ['Auraterrae', 'Alberobello'], [kun['Transfer > Da'], kun['Transfer < Per']]);
  prova('KUN — pax', '2', kun.Pax);
  prova('KUN — fornitore', 'Auraterrae', kun.Fornitori);

  // Le due reti di sicurezza
  prova('KUN — non parte niente verso nessuno', 'Non Inviare', kun.Allert);
  prova('KUN — la nota avvisa che manca la tariffa', true, kun.Note.includes('TARIFFA DA METTERE'));
  prova('KUN — la nota vecchia non si perde', true, kun.Note.includes("rientro da concordare un'ora prima"));
  prova('KUN — la nota dice quanto valeva sulla struttura', true, kun.Note.includes('100'));

  // Niente soldi, niente autista
  ['Tariffa', 'Fee', '%', 'Netto', 'Acconto', 'Autista', 'Veicolo'].forEach((c) => {
    prova(`nessuna riga scrive «${c}»`, true, r.righe.every((x) => !(c in x.riga)));
  });

  // Il cellulare e la modalità sì
  const nina = r.righe.find((x) => x.riga.Id === 'TR-20260817-c47ecbf7').riga;
  prova('Nina — cellulare copiato', '491749519019', nina['Cell.']);
  prova('Nina — modalità copiata', 'Incassare', nina['Modalità']);
  prova('Nina — il seggiolino resta nella nota', true, nina.Note.includes('seggiolino'));
}
{
  // Riga senza origine sul foglio struttura: non si inventa.
  const r = M.tePreparaMancanti_([{ Id: 'TR/SCONOSCIUTO', Data: '20/08/2026' }], STR, 15, 1078);
  prova('Id non ritrovato — non si inserisce', 0, r.quante);
  prova('Id non ritrovato — lo dice', 1, r.senzaOrigine.length);
}
{
  // Un nome vero non è una prova, anche se la tariffa è zero.
  prova('«Prova d\'Orlando» con nome e destinazione — non è una prova', false,
    M.teEunaProva_({ 'TRS> DA': "Prova d'Orlando", 'TRS <PER': 'Bari', Nome: 'Rossi', 'Tariffa a noi': '80' }));
  prova('prova 1 senza nome né destinazione — è una prova', true,
    M.teEunaProva_({ 'TRS> DA': 'prova 1', 'TRS <PER': '', Nome: '', 'Tariffa a noi': '0' }));
}
{
  const tante = [];
  for (let i = 0; i < 16; i++) tante.push({ Id: 'T' + i, Data: '20/08/2026' });
  const str = tante.map((t) => ({ Id: t.Id, Data: '20/08/2026', Time: '10:00', 'TRS> DA': 'A',
    'TRS <PER': 'B', Nome: 'X', Fornitore: 'F', 'Tariffa a noi': '50' }));
  const r = M.tePreparaMancanti_(tante, str, 15, 1078);
  prova('16 righe — si ferma', true, r.troppe);
  prova('16 righe — non inserisce niente', 0, r.righe.length);
}

// --- La rete nuova: se il gestionale torna corto non si inserisce niente ---
{
  const r = M.tePreparaMancanti_(MANC, STR, 15, 12);
  prova('gestionale letto corto — non inserisce niente', 0, r.quante);
  prova('gestionale letto corto — lo dichiara', true, r.letturaCorta);
  prova('gestionale letto corto — dice quante righe ha visto', 12, r.righeGestionale);
}
{
  const r = M.tePreparaMancanti_(MANC, STR, 15, 499);
  prova('499 righe — ancora troppo poche, si ferma', true, r.letturaCorta);
}
{
  const r = M.tePreparaMancanti_(MANC, STR, 15, 500);
  prova('500 righe — al limite, si procede', false, r.letturaCorta);
  prova('500 righe — inserisce le tre vere', 3, r.quante);
}
{
  const r = M.tePreparaMancanti_(MANC, STR, 15);
  prova('conteggio non passato — non blocca (uso a mano)', 3, r.quante);
}

// =====================================================================
// DOPPIONI
// =====================================================================
const GES = [
  { Id: 'TR/A', Nome: 'Gloria', Data: 'lun 21 settembre 2026', Note: 'porta il seggiolino' },
  { Id: 'TR/A', Nome: 'Gloria', Data: 'lun 21 settembre 2026', Note: 'porta il seggiolino' },
  { Id: 'TR/B', Nome: 'Solo', Data: 'mar 1 settembre 2026', Note: 'niente' },
];
{
  const r = D.tePreparaDoppioni_(GES);
  prova('un solo Id doppio trovato', 1, r.quante);
  prova('la riga singola non si tocca', 'TR/A', r.righe[0].riga.Id);
  prova('la nota comincia con l\'avviso', true, r.righe[0].riga.Note.startsWith('⚠️ DOPPIONE'));
  prova('la nota dice quante righe', true, r.righe[0].riga.Note.includes('(2 righe'));
  prova('LA NOTA VECCHIA NON SI PERDE', true, r.righe[0].riga.Note.includes('porta il seggiolino'));
  prova('non tocca nient\'altro', ['Id', 'Note'], Object.keys(r.righe[0].riga).sort());
}
{
  // Secondo giro: non si raddoppia l'avviso.
  const gia = [
    { Id: 'TR/A', Nome: 'Gloria', Note: '⚠️ DOPPIONE (2 righe con questo stesso Id sul gestionale: controlla e tieni quella giusta) · porta il seggiolino' },
    { Id: 'TR/A', Nome: 'Gloria', Note: 'porta il seggiolino' },
  ];
  const r = D.tePreparaDoppioni_(gia);
  prova('già segnalato — non si riscrive', 0, r.quante);
  prova('già segnalato — lo dice', 1, r.gia.length);
}
{
  const r = D.tePreparaDoppioni_([{ Id: 'TR/X', Note: 'a' }]);
  prova('nessun doppione — niente da scrivere', 0, r.quante);
}
{
  // Tre copie: la nota lo dice.
  const tre = [{ Id: 'T', Note: 'x' }, { Id: 'T', Note: 'x' }, { Id: 'T', Note: 'x' }];
  const r = D.tePreparaDoppioni_(tre);
  prova('tre copie — la nota dice tre', true, r.righe[0].riga.Note.includes('(3 righe'));
}

console.log(`\n${ko === 0 ? 'Tutte le prove passano.' : ko + ' prove FALLITE.'}`);
process.exit(ko === 0 ? 0 : 1);
