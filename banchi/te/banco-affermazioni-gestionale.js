#!/usr/bin/env node
// Banco della guardia «non si parla del gestionale senza averlo aperto».
//   node banchi/te/banco-affermazioni-gestionale.js
//
// Materiale: i due turni veri del 21/08/2026 sera, presi dalle esecuzioni.
//   · 781061 (19:06) — «ho due luoghi simili nel gestionale» + «"Otella" non lo trovo
//     tra le destinazioni». Tool sul gestionale chiamati in quel turno: ZERO.
//   · 781122 (19:09) — «non la trovo nel gestionale». Idem, zero.
//
// La prova che conta di più è la CONTROPROVA: quando il bot ha davvero guardato, il
// messaggio deve uscire identico carattere per carattere. Una guardia che riscrive anche
// le frasi vere è peggio del guasto che chiude.
const fs = require('fs');
const path = require('path');
const CODICE = fs.readFileSync(
  path.join(__dirname, '../../backups/n8n/prenotazioni/code-in-javascript.js'), 'utf8');

let ok = 0, ko = 0;
function prova(nome, cond, extra) {
  if (cond) { ok++; console.log('  ✅ ' + nome); }
  else { ko++; console.log('  ❌ ' + nome + (extra ? '\n       → ' + extra : '')); }
}

// `visti` = i nodi-tool che in questo turno hanno prodotto qualcosa.
function esegui(output, visti) {
  const set = new Set(visti || []);
  const $input = { first: () => ({ json: { output } }), all: () => [{ json: { output } }] };
  const $ = (nome) => {
    if (!set.has(nome)) throw new Error('nodo non eseguito: ' + nome);
    return { first: () => ({ json: {} }), all: () => [{ json: {} }] };
  };
  const r = new Function('$input', '$', CODICE)($input, $);
  return Array.isArray(r) ? r[0].json : r;
}

// ---------------------------------------------------------------- 781061
const T_781061 = [
  'Ok, ti preparo il transfer delle 19:45 di oggi (21/08/2026), modalità Fattura. Prima due chiarimenti veloci:',
  '',
  '1) "Calaponti" — ho due luoghi simili nel gestionale: quale intendo?',
  '',
  '2) "Otella" non lo trovo tra le destinazioni. Intendi un hotel o un altro posto? E confermi il senso: partenza da Calaponti e arrivo a Otella (zona Polignano)?',
].join('\n');

// ---------------------------------------------------------------- 781122
const T_781122 = [
  'Ti mostro tutto quello che ho finora.',
  '',
  'Prima di salvare mi servono 2 cose: l\'ora dell\'andata da Masseria Tarsia Morisco, e la conferma di "Otella" come destinazione del primo transfer — non la trovo nel gestionale, dimmi il nome esatto.',
].join('\n');

console.log('\n781061 — «due luoghi simili nel gestionale» senza aver aperto il gestionale');
{
  const o = esegui(T_781061, []);
  const t = o.agent_output_clean;
  prova('non dice più di avere due luoghi simili', !/ho due luoghi simili/i.test(t), t);
  prova('lo dice al condizionale, com\'è giusto', /potrebbero esserci più posti/i.test(t), t);
  prova('«non lo trovo tra le destinazioni» diventa «non l\'ho ancora cercato»',
    !/non lo trovo tra le destinazioni/i.test(t) && /non l'ho ancora cercato fra le destinazioni/i.test(t), t);
  prova('le domande restano in piedi', /quale intendo\?/i.test(t) && /Intendi un hotel/i.test(t), t);
  prova('e resta la nota che non ha guardato', /non ho ancora aperto il gestionale/i.test(t), t);
  prova('lo espone a valle', JSON.stringify(o.afferma_senza_prova) === JSON.stringify(['i luoghi']),
    JSON.stringify(o.afferma_senza_prova));
}

console.log('\n781122 — «non la trovo nel gestionale» senza aver aperto il gestionale');
{
  const o = esegui(T_781122, []);
  const t = o.agent_output_clean;
  prova('la frase cambia', !/non la trovo nel gestionale/i.test(t), t);
  prova('e dice la verità', /non l'ho ancora cercato nel gestionale/i.test(t), t);
  prova('la richiesta del nome esatto resta', /dimmi il nome esatto/i.test(t), t);
  prova('l\'ora dell\'andata, che non c\'entra col gestionale, non è toccata',
    /l'ora dell'andata da Masseria Tarsia Morisco/i.test(t), t);
}

console.log('\nCONTROPROVA — se il gestionale l\'ha aperto, non si tocca niente');
{
  const senza = esegui(T_781061, []);
  const con = esegui(T_781061, ['get_destination']);
  prova('con get_destination il messaggio esce identico',
    con.agent_output_clean === new Function('return ' + JSON.stringify(T_781061))(),
    con.agent_output_clean);
  prova('nessuna bandiera alzata', JSON.stringify(con.afferma_senza_prova) === '[]');
  prova('e senza il tool invece cambia davvero', senza.agent_output_clean !== con.agent_output_clean);
}
{
  const con = esegui(T_781122, ['cerca_servizi']);
  prova('«non la trovo nel gestionale» resta se ha cercato i servizi',
    /non la trovo nel gestionale/i.test(con.agent_output_clean), con.agent_output_clean);
}
{
  // basta un tool qualsiasi del gestionale per la frase generica
  const con = esegui(T_781122, ['get_fornitore']);
  prova('vale anche get_fornitore', /non la trovo nel gestionale/i.test(con.agent_output_clean));
}

console.log('\nfamiglie separate: il tool giusto prova la frase giusta');
{
  const FORN = 'Il fornitore "Martello viaggi" non lo trovo fra i fornitori. Come si chiama davvero?';
  prova('senza get_fornitore la frase cambia',
    /non l'ho ancora cercato fra i fornitori/i.test(esegui(FORN, []).agent_output_clean));
  prova('con get_fornitore resta',
    /non lo trovo fra i fornitori/i.test(esegui(FORN, ['get_fornitore']).agent_output_clean));
  prova('get_destination NON basta a provare una frase sui fornitori',
    /non l'ho ancora cercato fra i fornitori/i.test(esegui(FORN, ['get_destination']).agent_output_clean));
}
{
  const AUT = 'Nicola non lo trovo fra gli autisti, lo metto come nome?';
  prova('senza get_autista cambia',
    /non l'ho ancora cercato fra gli autisti/i.test(esegui(AUT, []).agent_output_clean));
  prova('con get_autista resta',
    /non lo trovo fra gli autisti/i.test(esegui(AUT, ['get_autista']).agent_output_clean));
}

console.log('\nregressione 10/08 — «è già salvato» detto senza cercare');
{
  const S = 'Questo è un transfer già salvato sul gestionale, Id TR/10082026/ABCDEFGHILMNOPQR.';
  const senza = esegui(S, []).agent_output_clean;
  prova('la frase diventa «ancora da verificare»', /ancora da verificare sul gestionale/i.test(senza), senza);
  prova('e nomina l\'Id da controllare', /TR\/10082026\/ABCDEFGHILMNOPQR/.test(senza), senza);
  const con = esegui(S, ['cerca_servizi']).agent_output_clean;
  prova('con cerca_servizi resta com\'era', /già salvato sul gestionale/i.test(con), con);
}

console.log('\nun messaggio che del gestionale non parla non viene toccato');
{
  const N = 'Ciao! Ti ho preparato il transfer. Confermi?';
  prova('identico', esegui(N, []).agent_output_clean === N);
  prova('e nessuna bandiera', JSON.stringify(esegui(N, []).afferma_senza_prova) === '[]');
}

console.log('\n=============================');
console.log('  ' + ok + ' passate, ' + ko + ' fallite');
console.log('=============================');
process.exit(ko ? 1 : 0);
