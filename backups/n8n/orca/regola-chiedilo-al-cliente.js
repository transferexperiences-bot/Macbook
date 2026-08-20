// === REGOLA: CHIEDILO AL CLIENTE — 20/08/2026 ===
// Nodo: «Regola: chiedilo al cliente» in Agente Orchestratore (UAz4R93BWh9VuLiR),
// fra «Unisci memoria» e «AI Agent Orca».
//
// DA DOVE NASCE. Agostino, 20/08: «non mi piace faccia domande che dovrebbe fare
// direttamente al cliente, inutile chiedere a me».
// Esecuzione 772543 delle 09:54, un caso da manuale. Orca prepara il messaggio per il
// cliente e poi chiude con:
//     «Serve: nome, numero, struttura/punto di ritiro. E confermi italiano o inglese?»
// Il punto di ritiro lo sa il cliente, non Agostino. La lingua si deduce dal numero e da
// come scrive il cliente — la regola è già nel prompt, sotto STILE E TONO. Agostino si
// ritrova a fare da centralino fra il bot e il cliente per dati che non ha.
//
// PERCHÉ STA IN UN NODO A PARTE. Il prompt vive dentro «Unisci memoria», 80 KB di codice.
// Una regola nuova infilata là dentro non si rilegge e non si prova. Qui si vede, si
// versiona e si toglie in un secondo se non funziona.
//
// COSA NON PUÒ FARE IL CODICE. Decidere cosa scrivere in un messaggio è lavoro del
// modello: qui non c'è un Id o un prezzo da produrre, c'è del testo da comporre. Quindi
// questa volta la regola è davvero una regola scritta. Ma è misurabile: il nodo
// «Normalizza i marcatori», in uscita, segna quando Orca chiede ad Agostino un dato che
// solo il cliente può avere. Se il conto non scende, la regola non ha funzionato e si
// cambia strada.
const REGOLA = [
  '',
  '═══ CHI SA COSA — CHIEDILO A CHI LO SA (regola di Agostino, 20/08/2026) ═══',
  '',
  'Agostino non è il centralino fra te e il cliente. Prima di fare una domanda, chiediti',
  'CHI ha quella risposta.',
  '',
  'AGOSTINO sa e decide soltanto queste cose:',
  '  · se il servizio si fa o non si fa',
  '  · il prezzo, lo sconto, l\'acconto',
  '  · quale mezzo e quale autista',
  '  · se c\'è disponibilità in quel giorno e a quell\'ora',
  '  · le eccezioni e gli accordi con quella struttura',
  '',
  'IL CLIENTE sa tutto il resto: come si chiama, dove alloggia, da dove vuole essere',
  'preso, a che ora, quanti sono, quante valigie, il numero del volo, dove va, se torna.',
  '',
  'Quindi:',
  '1. Se il dato manca e lo sa il CLIENTE → NON chiederlo ad Agostino. Mettilo come',
  '   domanda DENTRO il messaggio per il cliente, quello fra [[WA_MSG]] e [[/WA_MSG]].',
  '   Il messaggio si scrive lo stesso, con la domanda dentro: non si aspetta.',
  '2. Se il dato manca e lo sa AGOSTINO → chiedilo a lui, in una riga sola.',
  '3. Non chiedere mai ad Agostino la lingua del cliente: la deduci tu (numero +39 o',
  '   scrive in italiano → italiano, altrimenti inglese). La regola ce l\'hai già.',
  '4. Non chiedere mai ad Agostino il nome o il numero del cliente per fare il link: se',
  '   il numero non c\'è, il link WhatsApp si fa lo stesso e lui sceglie il contatto.',
  '5. Nel messaggio al cliente le domande sono al massimo due, in fondo, in una frase',
  '   sola. Tre domande in fila a un cliente sono un modulo, non un messaggio.',
  '',
  'Esempio, dal vero. Manca il punto di ritiro per un tour in barca.',
  '  SBAGLIATO → ad Agostino: «da quale struttura li prendiamo?»',
  '  GIUSTO    → dentro il messaggio al cliente: «Da quale struttura la passiamo a',
  '              prendere, e a che ora preferisce partire?»',
  ''
].join('\n');

return $input.all().map((it) => {
  const j = it.json || {};
  const prompt = String(j.prompt_sistema || '');
  // se per qualunque motivo il prompt non è arrivato, non si inventa niente:
  // meglio il turno senza la regola nuova che un turno senza prompt.
  if (!prompt) return { json: j };
  const nuovo = prompt + '\n' + REGOLA;
  return { json: Object.assign({}, j, {
    prompt_sistema: nuovo,
    prompt_lunghezza: nuovo.length
  }) };
});
