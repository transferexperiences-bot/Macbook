# Responsabile autisti — bot Telegram (prova)

Workflow n8n `E1RapyXw9bjAit9G` «TE · Responsabile autisti (motore, prova)». Ci arrivano solo i messaggi di Agostino,
passati dal workflow Rendicontazione `bbeiU9HP74s2dl8E`; per tornare indietro si ripubblica la versione `2b9c00fc` di Rendicontazione.
In prova si scrive solo nelle tabelle RA (Sessioni, Prove scritture, Eventi mezzi, Memoria, Bottoni), mai sul gestionale.

- `banco/` moduli puri: `copione.js` (chiusura), `apertura.js`, `spese.js`, `incassi.js`, `ore.js`, `cisterna.js` + test.
- `n8n/nodi/` il codice dei nodi Code. Il nodo Motore = `bundle_min.js` + `prepara_fn.js` + `motore.js`.
- `n8n/prompt_capisci_testo.json` i parametri del nodo «Capisci testo» (prompt di sistema).
- `n8n/banco_n8n.js` e `prova_*.js` banco offline: ha bisogno di `banco/dati/` (dati veri, non nel repo).
- `campo/` prove sul campo: `manda.sh <chat 9000000xx> testo|tap "..."` contro il webhook di prova.

Pubblicato il 21/10: v8g (`4b054c87`). La versione v8 ha portato: /prova senza chiusura automatica, risposte brevi
con la domanda in sospeso ripetuta, risposte a parole al posto dei bottoni, incassi servizio per servizio, glossario,
spesa senza scontrino (segnata, con avviso ad Agostino) e i servizi dei prossimi 3 giorni.
