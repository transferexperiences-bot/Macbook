#!/usr/bin/env node
// Banco di prova offline del nodo "Trova Rientro" (workflow Tool - Rientro f3Y46avI5O8dEnYn).
// Niente foglio vero, niente chat vive: si carica il codice del nodo e gli si danno
// in pasto le righe e gli input delle esecuzioni vere.
//   node banchi/te/banco-rientro.js
// Casi presi dalle esecuzioni: 755902, 755905, 755914, 758295, 758387 (18/08/2026)
// e 741981 (16/08/2026).

const fs = require('fs');
const path = require('path');
const CODICE = fs.readFileSync(path.join(__dirname, '../../backups/n8n/tool-rientro/trova-rientro.js'), 'utf8');

// --- date: le righe del gestionale hanno la Data a parole ("mar 18 agosto 2026")
const MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto',
  'settembre','ottobre','novembre','dicembre'];
const GIORNI = ['dom','lun','mar','mer','gio','ven','sab'];
function oggi() {
  const s = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
  const p = s.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}
function piu(n) { const d = oggi(); d.setDate(d.getDate() + n); return d; }
function dataFoglio(n) { const d = piu(n); return GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()] + ' ' + d.getFullYear(); }
function dataIT(n) { const d = piu(n); const z = (x) => String(x).padStart(2, '0'); return z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + d.getFullYear(); }

function riga(o) {
  return Object.assign({
    Allert: 'Invia', Data: dataFoglio(0), Time: '', 'Transfer > Da': '', 'Transfer < Per': '',
    Pax: '', Nome: '', 'Cell.': '', Fornitori: '', Volo: '', Autista: '', Veicolo: '',
    Tariffa: '', Modalità: '', Note: '', Id: ''
  }, o);
}

function esegui(trigger, righe) {
  const ctx = (nome) => {
    if (nome === 'Trigger Rientro') return { first: () => ({ json: trigger }) };
    if (nome === 'Leggi Prenotazioni NCC 3.0') return { all: () => righe.map(r => ({ json: r })) };
    throw new Error('nodo sconosciuto: ' + nome);
  };
  const fn = new Function('$', CODICE);
  return fn(ctx)[0].json;
}

// ---------------------------------------------------------------- righe vere
// Il giorno di oggi come lo aveva il gestionale il 18/08/2026 (esecuzioni 755902 e 758295).
const OGGI = [
  riga({ Time: '08:00', 'Transfer > Da': 'Auraterrae', 'Transfer < Per': 'APT di Bari', Pax: '2',
    Nome: 'SAMBOL HERB', Fornitori: 'Auraterrae', Tariffa: '130,00€', Modalità: 'Fattura',
    Id: 'TR-20260624-28741b00-278f-465a-a4a0-5728bbc0e45b' }),
  riga({ Time: '08:00', 'Transfer > Da': 'Monopoli Capitolo', 'Transfer < Per': 'Bari Airport', Pax: '2',
    Nome: 'Alena', Fornitori: 'Dorino Gite in barca', Tariffa: '120,00€', Modalità: 'Contanti',
    Id: 'TR-20260817-9462f562-a315-4f76-bb9c-a1cafb943f7b' }),
  riga({ Time: '08:25', 'Transfer > Da': 'Pietra Blu', 'Transfer < Per': 'Polignano a Mare', Pax: '2',
    Nome: 'Costa Maria', Fornitori: 'Pietra Blu', Tariffa: '30,00€', Modalità: 'Incassare',
    Id: 'TR-20260818-79c69fc8-c5db-4b90-b333-337ea96ee5b2' }),
  riga({ Time: '09:00', 'Transfer > Da': 'Polignano a Mare', 'Transfer < Per': 'APT di Bari', Pax: '6',
    Nome: 'gosia', Fornitori: 'Antico Mondo', Tariffa: '110,00€', Modalità: 'Carta',
    Id: 'TR-20260817-57b47dde-c661-4836-bb6b-8cc0334624f7' }),
  riga({ Time: '09:30', 'Transfer > Da': 'Auraterrae', 'Transfer < Per': 'Polignano a mare', Pax: '5',
    Nome: 'DASHKA POTNIS', Fornitori: 'Auraterrae', Tariffa: '35,00€', Modalità: 'Sconto in fattura',
    Autista: 'Giuseppe Fanelli', Note: 'vogliono andare a Lama Monachile - rientro da definire 1 h prima',
    Id: 'TR-20260818-aadbc645-a38b-4b2e-91fb-01638ab77590' }),
  riga({ Time: '16:45', 'Transfer > Da': 'Pietra Blu', 'Transfer < Per': 'Città di Bari', Pax: '3',
    Nome: 'LADANOV IGOR', 'Cell.': '17189092369', Fornitori: 'Pietra Blu', Tariffa: '125,00€',
    Modalità: 'Incassare', Autista: 'Claudio Moccia', Note: "L'ospite deve recarsi alla cattedrale",
    Id: 'TR-20260818-47a6fd0f-9819-4bde-acf3-9e2ef23a78bd' }),
  riga({ Time: '17:00', 'Transfer > Da': 'Tre Vigne', 'Transfer < Per': 'Bari Airport', Pax: '1',
    Nome: 'Cheska', Fornitori: 'Jonny De Napoli', Tariffa: '100,00€', Modalità: 'Fattura',
    Id: 'TR/21072026/I08NHC1BWYFUENWV' }),
  riga({ Time: '18:00', 'Transfer > Da': 'Auraterrae', 'Transfer < Per': 'Polignano a mare', Pax: '2',
    Nome: 'MELOGRANO SOFIA', Fornitori: 'Auraterrae', Tariffa: '35,00€', Modalità: 'Sconto in fattura',
    Id: 'TR-20260818-34e3e55e-7a78-4156-859c-810d702f651e' }),
  riga({ Time: '18:15', 'Transfer > Da': 'Pietra Blu', 'Transfer < Per': 'Aeroporto di Bari', Pax: '4',
    Nome: 'Fabien Gourdin', Fornitori: 'Pietra Blu', Tariffa: '125,00€', Modalità: 'Incassare',
    Id: 'TR-20260817-120660ed-1b84-4771-ad90-a701e751f3d0' }),
  riga({ Time: '19:15', 'Transfer > Da': 'Bari Airport', 'Transfer < Per': 'Polignano a Mare', Pax: '4',
    Nome: 'Mario Sinopoli', Fornitori: 'Transfer Experience', Tariffa: '100,00€', Modalità: 'Incassare',
    Id: 'TR/23072026/2KJP67HIYN4F9ODM' }),
];

// ---------------------------------------------------------------- prove
let ok = 0, ko = 0;
function prova(nome, cond, dettaglio) {
  if (cond) { ok++; console.log('  ✅ ' + nome); }
  else { ko++; console.log('  ❌ ' + nome + (dettaglio ? '\n       → ' + dettaglio : '')); }
}
function titolo(t) { console.log('\n' + t); }

// --- 1. esecuzione 755902: 4 candidati dove ce n'era uno solo giusto
titolo('1) 755902 — «alle dodici un parto e rientro per avratere di Dashka Potanis»');
{
  const out = esegui({ luogo: 'Polignano a mare', ora: '12', data: '', id: '',
    query: 'Manca da aggiungere alle dodici un parto e rientro per avratere di Dashka Potanis',
    destinazione: 'Auraterrae', autista: '', veicolo: '' }, OGGI);
  prova('non chiede più di scegliere fra 4 (esito=' + out.esito + ')', out.esito === 'pronto');
  prova('ha preso l\'andata di DASHKA POTNIS delle 09:30',
    out.andata && out.andata.Nome === 'DASHKA POTNIS' && out.andata.Ora === '09:30', JSON.stringify(out.andata));
  prova('dice come ha scelto', (out.come_ho_scelto || []).length > 0, JSON.stringify(out.come_ho_scelto));
  prova('lo scrive anche negli avvisi', (out.avvisi || []).some(a => a.indexOf('🔎') === 0));
  prova('rientro Polignano → Auraterrae',
    out.rientro.Da === 'Polignano a mare' && out.rientro.Per === 'Auraterrae', JSON.stringify(out.rientro));
  prova('autista non ereditato', out.rientro.Autista === '' && out.rientro.Veicolo === '');
  prova('scartata l\'andata delle 19:15 (dopo l\'ora del rientro)',
    !(out.scartati || []).length || (out.scartati || []).some(s => s.Ora === '19:15'));
}

// --- 2. esecuzione 755905: la destinazione storpiata NON deve entrare nel recap
titolo('2) 755905 — destinazione presa dalla frase storpiata («avratere di Dashka Potanis»)');
{
  const out = esegui({ luogo: 'Polignano a mare', ora: '12:00', data: '',
    id: 'TR-20260818-aadbc645-a38b-4b2e-91fb-01638ab77590',
    query: 'Manca da aggiungere alle dodici un parto e rientro per avratere di Dashka Potanis.',
    destinazione: '', autista: '', veicolo: '' }, OGGI);
  prova('esito pronto', out.esito === 'pronto');
  prova('NON scrive «avratere» nel recap', out.recap_da_salvare.indexOf('avratere') === -1, out.recap_da_salvare);
  prova('destinazione = Auraterrae (dedotta girando l\'andata)', out.rientro.Per === 'Auraterrae', out.rientro.Per);
  prova('dice che ha buttato quello che aveva capito', !!out.destinazione_scartata, out.destinazione_scartata);
}

// --- 3. esecuzione 758295: 6 candidati per «rientro da Bari per Pietrablu»
titolo('3) 758295 — «rientro da Bari per Pietrablu tra un\'ora»');
{
  const out = esegui({ luogo: 'Bari', ora: '18:32', data: '', id: '',
    query: "Aggiungi transfer di rientro da Bari per Pietrablu tra un'ora, a partire da adesso.",
    destinazione: 'Pietra Blu', autista: '', veicolo: '' }, OGGI);
  prova('candidati ridotti da 6 a 2 (sono ' + out.quanti + ')', out.esito === 'scegli' && out.quanti === 2,
    (out.candidati || []).map(c => c.Ora + ' ' + c.Da).join(' | '));
  prova('restano solo le andate partite da Pietra Blu',
    (out.candidati || []).every(c => /pietra ?blu/i.test(c.Da)));
  prova('dice cosa ha tolto', (out.come_ho_scelto || []).length > 0, JSON.stringify(out.come_ho_scelto));
}

// --- 4. esecuzione 758387/758399: l'Id dell'andata NON deve uscire in nessun testo
titolo('4) 758399 — l\'Id dell\'andata non deve finire nel testo da salvare');
{
  const out = esegui({ luogo: 'Bari', ora: '18:32', data: dataIT(0),
    id: 'TR-20260818-47a6fd0f-9819-4bde-acf3-9e2ef23a78bd',
    query: "Aggiungi transfer di rientro da Bari per Pietrablu tra un'ora, a partire da adesso.",
    destinazione: 'Pietra Blu', autista: '', veicolo: '' }, OGGI);
  const ID = 'TR-20260818-47a6fd0f-9819-4bde-acf3-9e2ef23a78bd';
  prova('esito pronto', out.esito === 'pronto');
  prova('l\'Id NON è nel recap_da_salvare', out.recap_da_salvare.indexOf(ID) === -1, out.recap_da_salvare);
  prova('l\'Id NON è nella scheda mostrata', out.scheda.indexOf(ID) === -1, out.scheda);
  prova('l\'Id NON è negli avvisi', !(out.avvisi || []).some(a => a.indexOf(ID) !== -1));
  prova('l\'Id NON è nelle istruzioni', out.istruzioni.indexOf(ID) === -1);
  prova('l\'Id resta nel campo dati di riferimento', out.id_andata_solo_riferimento === ID);
  prova('nelle Note c\'è il riferimento all\'andata senza Id',
    /Note: Rientro dell'andata delle 16:45 di LADANOV IGOR/.test(out.recap_da_salvare), out.recap_da_salvare);
  prova('le istruzioni vietano di scrivere un Id nel salvataggio',
    /NON scrivere MAI un Id/.test(out.istruzioni));
  prova('autista dell\'andata (Claudio Moccia) non ereditato', out.rientro.Autista === '');
}

// --- 5. 741981: la destinazione detta vince su quella dedotta
titolo('5) 741981 — «rientro da Sabbiadoro per il Serafini alle 18.30»');
{
  const righe = OGGI.concat([
    riga({ Time: '10:00', 'Transfer > Da': 'Bari Airport', 'Transfer < Per': 'Sabbiadoro', Pax: '7',
      Nome: 'Serafini Marco', Fornitori: 'Transfer Experience', Tariffa: '140,00€',
      Modalità: 'Sconto in fattura', Id: 'TR/07082026/SSD1XU4R9NS80YGD' }),
    riga({ Time: '07:00', 'Transfer > Da': 'Serafini', 'Transfer < Per': 'Monopoli', Pax: '2',
      Nome: 'altro cliente', Fornitori: 'Serafini', Tariffa: '40,00€', Id: 'TR/01082026/XXXXX' }),
  ]);
  const out = esegui({ luogo: 'Sabbiadoro', ora: '18:30', data: '', id: '',
    query: 'aggiungo rientro da Sabbiadoro per il Serafini alle 18.30',
    destinazione: '', autista: '', veicolo: '' }, righe);
  prova('esito pronto', out.esito === 'pronto', out.esito + ' ' + (out.istruzioni || '').slice(0, 120));
  prova('destinazione = Serafini (detta da Agostino), non Bari Airport',
    out.rientro.Per === 'Serafini', out.rientro.Per);
  prova('la destinazione è segnata come letta dalla frase',
    out.destinazione_da === 'letta_dalla_frase', out.destinazione_da);
}

// --- 6. il filtro sull'ora non deve scattare quando l'andata è del giorno prima
titolo('6) andata di ieri, rientro di oggi: il filtro sull\'ora non si applica');
{
  const righe = [
    riga({ Data: dataFoglio(-1), Time: '08:00', 'Transfer > Da': 'Bari Airport', 'Transfer < Per': 'Masseria X',
      Pax: '2', Nome: 'Tizio', Fornitori: 'X', Tariffa: '90,00€', Id: 'TR/AAA' }),
    riga({ Data: dataFoglio(-1), Time: '18:00', 'Transfer > Da': 'Stazione Bari', 'Transfer < Per': 'Masseria X',
      Pax: '3', Nome: 'Caio', Fornitori: 'X', Tariffa: '80,00€', Id: 'TR/BBB' }),
  ];
  const out = esegui({ luogo: 'Masseria X', ora: '09:00', data: '', id: '',
    query: 'rientro da Masseria X alle 9', destinazione: '', autista: '', veicolo: '' }, righe);
  prova('tiene tutte e due le andate di ieri', out.esito === 'scegli' && out.quanti === 2,
    out.esito + ' quanti=' + out.quanti);
  prova('segnala che ha allargato a ieri', out.allargato_a_ieri === true);
}

// --- 7. destinazione spazzatura passata nell'input esplicito
titolo('7) destinazione spazzatura nell\'input: si butta, non si salva');
{
  const out = esegui({ luogo: 'Polignano a mare', ora: '12:00', data: '',
    id: 'TR-20260818-aadbc645-a38b-4b2e-91fb-01638ab77590', query: 'rientro alle 12',
    destinazione: 'avratere di Dashka Potanis', autista: '', veicolo: '' }, OGGI);
  prova('non finisce nel recap', out.recap_da_salvare.indexOf('avratere') === -1, out.recap_da_salvare);
  prova('destinazione = Auraterrae', out.rientro.Per === 'Auraterrae', out.rientro.Per);
  prova('lo dice negli avvisi', (out.avvisi || []).some(a => /avratere/.test(a)));
}

// --- 8. quello che già funzionava deve continuare a funzionare
titolo('8) regressioni: modalità, tariffa, doppione, dati mancanti');
{
  const a = esegui({ luogo: 'Polignano a Mare', ora: '11:00', data: '', id: 'TR-20260817-57b47dde-c661-4836-bb6b-8cc0334624f7',
    query: 'rientro da Polignano alle 11', destinazione: '', autista: '', veicolo: '' }, OGGI);
  prova('Carta sull\'andata → Incassare sul rientro', a.rientro.Modalita === 'Incassare', a.rientro.Modalita);
  const b = esegui({ luogo: 'Polignano a mare', ora: '12:00', data: '', id: 'TR-20260818-aadbc645-a38b-4b2e-91fb-01638ab77590',
    query: 'rientro alle 12', destinazione: '', autista: '', veicolo: '' }, OGGI);
  prova('Sconto in fattura resta Sconto in fattura', b.rientro.Modalita === 'Sconto in fattura', b.rientro.Modalita);
  prova('tariffa copiata e segnalata', b.rientro.Tariffa === '35,00€' && b.avvisi.some(x => /Tariffa 35,00€ copiata/.test(x)));
  prova('intent sempre nuovo', b.intent === 'nuovo');
  const c = esegui({ luogo: '', ora: '12:00', data: '', id: '', query: 'rientro alle 12',
    destinazione: '', autista: '', veicolo: '' }, OGGI);
  prova('senza luogo → dati_mancanti', c.esito === 'dati_mancanti');
  const d = esegui({ luogo: 'Posto che non esiste', ora: '12:00', data: '', id: '',
    query: 'rientro da Posto che non esiste alle 12', destinazione: '', autista: '', veicolo: '' }, OGGI);
  prova('luogo sconosciuto → nessuno, senza inventare', d.esito === 'nessuno');
  const e = esegui({ luogo: 'Polignano a mare', ora: '', data: '', id: 'TR-20260818-aadbc645-a38b-4b2e-91fb-01638ab77590',
    query: 'rientro', destinazione: '', autista: '', veicolo: '' }, OGGI);
  prova('senza ora → da_completare e non si salva', e.esito === 'da_completare');
  const f = esegui({ luogo: 'Polignano a mare', ora: '12:00', data: '', id: 'TR-20260818-aadbc645-a38b-4b2e-91fb-01638ab77590',
    query: 'rientro alle 12', destinazione: '', autista: 'Giuseppe Fanelli', veicolo: 'Mercedes' }, OGGI);
  prova('autista detto adesso viene scritto', f.rientro.Autista === 'Giuseppe Fanelli' &&
    /Autista: Giuseppe Fanelli/.test(f.recap_da_salvare));
}

console.log('\n=============================');
console.log('  ' + ok + ' passate, ' + ko + ' fallite');
console.log('=============================');
process.exit(ko ? 1 : 0);
