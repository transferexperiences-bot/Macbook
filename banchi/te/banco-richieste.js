// Banco offline per "Prepara richieste" (n8n/controllo-incrociato/prepara-richieste.js).
// Dati veri del 17/08.
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'n8n', 'controllo-incrociato', 'prepara-richieste.js'), 'utf8');
const PURE = SRC.split('// ===== corpo del nodo n8n =====')[0];
const p = {};
new Function('exports', PURE + 'exports.tePreparaRichieste_=tePreparaRichieste_;exports.teImpronta_=teImpronta_;')(p);
const { tePreparaRichieste_, teImpronta_ } = p;

let ko = 0;
function prova(nome, atteso, effettivo) {
  const a = JSON.stringify(atteso), e = JSON.stringify(effettivo);
  const ok = a === e; if (!ok) ko++;
  console.log(`${ok ? '  ok  ' : '  KO  '} ${nome}`);
  if (!ok) console.log(`        atteso:   ${a}\n        ottenuto: ${e}`);
}

console.log('== Banco: schede da approvare ==\n');

const ID = 'TR-20260817-c5e86a34-5443-4f51-881e-889ee79d94f5';
const STRUTT = [{
  Id: ID, Data: '17/08/2026', Time: '17:30', 'TRS> DA': 'Auraterrae',
  'TRS <PER': 'Polignano a mare', PAX: '3', Nome: 'MULLINS KRISTINA',
  Fornitore: 'Auraterrae', 'Tariffa a noi': '35',
}];
const CONFR = {
  discordanti: [{ Id: ID, Nome: 'MULLINS KRISTINA', Fornitore: 'Auraterrae',
    differenze: [{ campo: 'Ora', strutture: '17:30', gestionale: '01:00', avviso: false }] }],
  doppioni: [], mancanti: [],
};

{
  const r = tePreparaRichieste_(CONFR, STRUTT, [], 12);
  prova('una correzione, una scheda', 1, r.quante);
  const s = r.schede[0];
  prova('tipo C', 'C', s.tipo);
  prova('porta l\'Id', ID, s.idtransfer);
  prova('la scheda si presenta', true, s.testo.startsWith('🔧 *CORREZIONE DA APPROVARE*'));
  prova('mostra il prima e il dopo', true, s.testo.includes('gestionale «01:00» → struttura «17:30»'));
  prova('sembra un transfer di struttura', true,
    s.testo.includes('MULLINS KRISTINA') && s.testo.includes('Auraterrae → Polignano a mare'));
  prova('chiude con la domanda', true, s.testo.endsWith('Correggo?'));
  prova('la chiave comincia col tipo e l\'Id', true, s.chiave.startsWith('C|' + ID + '|'));
}

// --- LA COSA PIÙ IMPORTANTE: non si richiede quello già chiesto ---
{
  const primo = tePreparaRichieste_(CONFR, STRUTT, [], 12);
  const memoria = [{ chiave: primo.schede[0].chiave, risposta: 'in attesa' }];
  const secondo = tePreparaRichieste_(CONFR, STRUTT, memoria, 12);
  prova('secondo giro — non richiede', 0, secondo.quante);
  prova('secondo giro — dice quante ne ha saltate', 1, secondo.saltate);

  const rifiutato = [{ chiave: primo.schede[0].chiave, risposta: 'no' }];
  prova('dopo un ❌ — non richiede più', 0, tePreparaRichieste_(CONFR, STRUTT, rifiutato, 12).quante);
  const accettato = [{ chiave: primo.schede[0].chiave, risposta: 'ok' }];
  prova('dopo un ✅ — non richiede più', 0, tePreparaRichieste_(CONFR, STRUTT, accettato, 12).quante);
}
{
  // Ma se il problema cambia, si richiede: l'impronta è diversa.
  const primo = tePreparaRichieste_(CONFR, STRUTT, [], 12);
  const memoria = [{ chiave: primo.schede[0].chiave, risposta: 'no' }];
  const nuovo = { ...CONFR, discordanti: [{ ...CONFR.discordanti[0],
    differenze: [{ campo: 'Ora', strutture: '19:00', gestionale: '01:00', avviso: false }] }] };
  prova('problema cambiato — si richiede', 1, tePreparaRichieste_(nuovo, STRUTT, memoria, 12).quante);
}

// --- La tariffa non diventa mai una correzione ---
{
  const soloTariffa = { ...CONFR, discordanti: [{ Id: ID, Nome: 'X', Fornitore: 'Y',
    differenze: [{ campo: 'Tariffa', strutture: '196', gestionale: '240,00€', avviso: true }] }] };
  prova('solo tariffa — nessuna scheda', 0, tePreparaRichieste_(soloTariffa, STRUTT, [], 12).quante);
}
{
  const mista = { ...CONFR, discordanti: [{ Id: ID, Nome: 'X', Fornitore: 'Y',
    differenze: [
      { campo: 'Ora', strutture: '17:30', gestionale: '01:00', avviso: false },
      { campo: 'Tariffa', strutture: '196', gestionale: '240,00€', avviso: true }] }] };
  const r = tePreparaRichieste_(mista, STRUTT, [], 12);
  prova('ora + tariffa — una scheda', 1, r.quante);
  prova('ora + tariffa — la tariffa non compare', false, r.schede[0].testo.includes('Tariffa'));
}

// --- Doppioni ---
{
  const c = { discordanti: [], doppioni: [{ Id: ID, quante: 2, Nome: 'MULLINS KRISTINA' }], mancanti: [] };
  const r = tePreparaRichieste_(c, STRUTT, [], 12);
  prova('doppione — una scheda', 1, r.quante);
  prova('doppione — tipo D', 'D', r.schede[0].tipo);
  prova('doppione — dice quante righe', true, r.schede[0].testo.includes('2 righe'));
  prova('doppione — promette di non cancellare', true, r.schede[0].testo.includes('Non cancello niente'));
}

// --- Mancanti ---
{
  const c = { discordanti: [], doppioni: [], mancanti: [{ Id: ID }] };
  const r = tePreparaRichieste_(c, STRUTT, [], 12);
  prova('mancante — una scheda', 1, r.quante);
  prova('mancante — tipo M', 'M', r.schede[0].tipo);
  prova('mancante — avvisa Non Inviare', true, r.schede[0].testo.includes('Non Inviare'));
  prova('mancante — avvisa che la tariffa manca', true, r.schede[0].testo.includes('senza tariffa'));
  prova('mancante — dice quanto vale sulla struttura', true, r.schede[0].testo.includes('35'));
}
{
  // Mancante senza riga sulla struttura: non si inventa niente.
  const c = { discordanti: [], doppioni: [], mancanti: [{ Id: 'TR/SCONOSCIUTO' }] };
  prova('mancante senza origine — nessuna scheda', 0, tePreparaRichieste_(c, STRUTT, [], 12).quante);
}

// =====================================================================
// LE RIGHE DI PROVA — il buco trovato il 17/08 sera
// =====================================================================
// Melograno tiene sul foglio struttura righe «prova 1» / «prova 2»: una è
// arrivata su Telegram come scheda ➕ MANCANTE (message_id 5423, risposta ❌).
// Il filtro esisteva in prepara-mancanti.js e qui no.
{
  const PROVA = [{ Id: 'TR-PROVA', Data: '20/08/2026', Time: '10:00',
    'TRS> DA': 'prova 2', 'TRS <PER': '', PAX: '', Nome: '',
    Fornitore: 'Il Melograno', 'Tariffa a noi': '0' }];
  const c = { discordanti: [], doppioni: [], mancanti: [{ Id: 'TR-PROVA' }] };
  const r = tePreparaRichieste_(c, PROVA, [], 12);
  prova('riga di prova — nessuna scheda', 0, r.quante);
  prova('riga di prova — la conta come finta', 1, r.finte);
}
{
  // Un solo indizio non basta: «Prova d'Orlando» è un posto vero.
  const VERO = [{ Id: 'TR-VERO', Data: '20/08/2026', Time: '10:00',
    'TRS> DA': 'Prova d\'Orlando', 'TRS <PER': 'Bari aeroporto', PAX: '2',
    Nome: 'ROSSI MARIO', Fornitore: 'Il Melograno', 'Tariffa a noi': '60' }];
  const c = { discordanti: [], doppioni: [], mancanti: [{ Id: 'TR-VERO' }] };
  const r = tePreparaRichieste_(c, VERO, [], 12);
  prova('un solo indizio — la scheda parte lo stesso', 1, r.quante);
  prova('un solo indizio — non è finta', 0, r.finte);
}
{
  // Se la riga sul gestionale c'è già, qualcuno l'ha confermata: si corregge
  // anche se sulla struttura sembra una prova.
  const PROVA = [{ Id: ID, Data: '17/08/2026', Time: '17:30', 'TRS> DA': 'prova',
    'TRS <PER': '', PAX: '', Nome: '', Fornitore: 'X', 'Tariffa a noi': '0' }];
  prova('correzione su riga che sembra prova — si chiede lo stesso', 1,
    tePreparaRichieste_(CONFR, PROVA, [], 12).quante);
  const d = { discordanti: [], doppioni: [{ Id: ID, quante: 2, Nome: 'X' }], mancanti: [] };
  prova('doppione su riga che sembra prova — si chiede lo stesso', 1,
    tePreparaRichieste_(d, PROVA, [], 12).quante);
}

// --- Il freno: non si sveglia nessuno con quaranta messaggi ---
{
  const tanti = { discordanti: [], doppioni: [], mancanti: [] };
  const str = [];
  for (let i = 0; i < 13; i++) {
    tanti.mancanti.push({ Id: 'T' + i });
    str.push({ Id: 'T' + i, Data: '20/08/2026', Time: '10:00', 'TRS> DA': 'A', 'TRS <PER': 'B',
      Nome: 'X', PAX: '2', Fornitore: 'F', 'Tariffa a noi': '50' });
  }
  const r = tePreparaRichieste_(tanti, str, [], 12);
  prova('13 schede — non ne manda nessuna', 0, r.schede.length);
  prova('13 schede — si ferma', true, r.troppe);
  prova('12 schede — al limite, si mandano', 12,
    tePreparaRichieste_({ ...tanti, mancanti: tanti.mancanti.slice(0, 12) }, str, [], 12).quante);
}

// --- Tutto a posto ---
{
  const r = tePreparaRichieste_({ discordanti: [], doppioni: [], mancanti: [] }, STRUTT, [], 12);
  prova('niente da chiedere — nessuna scheda', 0, r.quante);
}

// =====================================================================
// L'AZIONE: quello che si scrive e' deciso ADESSO, non al click
// =====================================================================
{
  const r = tePreparaRichieste_(CONFR, STRUTT, [], 12);
  const a = r.schede[0].azione;
  prova('correzione — porta la riga da scrivere', ID, a.Id);
  prova('correzione — scrive l\'ora della struttura', '17:30', a.Time);
  prova('correzione — solo Id e Time', ['Id', 'Time'], Object.keys(a).sort());
  prova('correzione — nessuna colonna di soldi', true,
    !('Tariffa' in a) && !('Fee' in a) && !('Netto' in a));
}
{
  const c = { discordanti: [], doppioni: [{ Id: ID, quante: 2, Nome: 'X', Note: 'porta il seggiolino' }], mancanti: [] };
  const a = tePreparaRichieste_(c, STRUTT, [], 12).schede[0].azione;
  prova('doppione — scrive solo Id e Note', ['Id', 'Note'], Object.keys(a).sort());
  prova('doppione — la nota vecchia non si perde', true, a.Note.includes('porta il seggiolino'));
  prova('doppione — l\'avviso va in testa', true, a.Note.startsWith('⚠️ DOPPIONE'));
}
{
  const c = { discordanti: [], doppioni: [], mancanti: [{ Id: ID }] };
  const a = tePreparaRichieste_(c, STRUTT, [], 12).schede[0].azione;
  prova('mancante — Allert Non Inviare', 'Non Inviare', a.Allert);
  prova('mancante — nessuna colonna di soldi', true,
    !('Tariffa' in a) && !('Fee' in a) && !('Netto' in a) && !('Acconto' in a));
  prova('mancante — niente autista ne veicolo', true, !('Autista' in a) && !('Veicolo' in a));
  prova('mancante — la nota grida la tariffa', true, a.Note.includes('TARIFFA DA METTERE'));
  prova('mancante — copia la tratta', ['Auraterrae', 'Polignano a mare'],
    [a['Transfer > Da'], a['Transfer < Per']]);
}

// --- L'impronta ---
prova('impronta — stessa cosa, stessa impronta', teImpronta_('a|b'), teImpronta_('a|b'));
prova('impronta — cosa diversa, impronta diversa', true, teImpronta_('a|b') !== teImpronta_('a|c'));
prova('impronta — corta', true, teImpronta_('qualcosa di abbastanza lungo').length <= 8);

console.log(`\n${ko === 0 ? 'Tutte le prove passano.' : ko + ' prove FALLITE.'}`);
process.exit(ko === 0 ? 0 : 1);
