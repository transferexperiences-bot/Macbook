# Transfer Experience — come si lavora

Documento di regole per chi lavora su questi workflow (n8n Cloud `transfer.app.n8n.cloud`).
Nasce da due giorni di guasti veri, 14-16/08/2026.

## La regola che spiega quasi tutti i guasti

**Ogni cosa che conta — Id, prezzi, date, quali schede salvare — deve essere prodotta da
codice e scelta con un bottone. Quando passa dalle parole del modello, prima o poi si
rompe.** Casi verificati: due transfer persi (`730335`), cliente sbagliato confermato
(`730664`), schede salvate senza tariffa (`730883`), domanda sulla data ribaltata (`739952`).

## Zone di autonomia

**🟢 Verde — si fa e si racconta, senza chiedere.**
Correzioni di guasti diagnosticati con le prove (esecuzione, nodo, riga). Default sui
`$fromAI`, `onError` sui nodi che scrivono, sostituzione di testo scritto dal modello con
testo generato dal codice, bottoni al posto di frasi, backup, pubblicazione, banchi di
prova offline, analisi.

**🟡 Giallo — si fa e si dice subito; resta la versione da ripristinare.**
Comportamenti nuovi ma reversibili: un bottone in più, una finestra di attesa più lunga,
una sintesi in un messaggio.

**🔴 Rosso — si chiede sempre, anche con l'autonomia attiva.**
1. Prezzi e tariffe su righe vere del gestionale.
2. Scrivere, modificare o cancellare righe del gestionale o dei fogli struttura.
3. Tutto ciò che esce verso clienti, autisti, fornitori (WhatsApp, mail, messaggi driver).
4. Spegnere un workflow attivo o cambiare come funziona un salvataggio.

## Regole operative, non negoziabili

- **Mai perdere un salvataggio. Mai dichiarare un salvataggio che non è avvenuto.**
- **Niente prove su fogli o chat vive.** Ogni pezzo di codice si prova prima su un banco
  offline che riproduce l'esecuzione reale (vedi gli esempi in `/tmp/.../scratchpad/te`).
- **Cancellazione morbida**, mai `delete`: si marca `Allert = Cancellato` + nota ⛔.
- **In dubbio si risponde / si tiene.** Una bozza di troppo è rumore, una bozza persa è un
  transfer che sparisce.
- Risposte brevi, in italiano.

## n8n — trappole imparate a caro prezzo

- **Una modifica non pubblicata NON è in produzione.** Dopo `update_workflow` serve
  `publish_workflow`: se `versionId ≠ activeVersionId`, gira ancora la versione vecchia.
- Dopo la pubblicazione si rilegge il nodo dal server e si fa il **diff** con quello provato.
- `$fromAI(key, desc, type)` **senza il quarto argomento** rende il campo obbligatorio: se il
  modello lo omette, salta l'intero turno dell'agente. Mettere sempre un default.
- Google Sheets `appendOrUpdate` su una chiave inesistente **APPENDE**: è la causa di quasi
  tutti i doppioni.
- `setNodeParameter` con un JSON Pointer **non scende dentro gli array**: per quelli si usa
  `updateNodeParameters` con `replace: true`.
- Telegram: `callback_data` massimo 64 byte.
- Locale italiano: i decimali vogliono la virgola.
- I token dei bot stanno **in chiaro** dentro gli URL dei nodi HTTP: mai committare un
  backup di workflow senza averli sostituiti.

## Dove sono le cose

| Cosa | Id |
|---|---|
| Prenotazioni Transfer 6.0 | `NT4lxIxyBAl5lHpN` |
| Agente Orchestratore (Orca) | `UAz4R93BWh9VuLiR` |
| Transfer webhook (strutture) | `MJHTq5MksSeUhKgX` |
| Parse transfer (scrive sul gestionale) | `IkFB29XmJJXQx1a9` |
| Back Officer Email | `yDXJP68pNVVgCFXx` |
| Calcola Tariffa Prenotazioni | `APv3ZqEizY1HnPia` |
| Gestionale `Prenotazioni NCC 3.0` | `1nqmt8_4Oy8paHlPU8LTBLEvl-quW0DYgTtmB73nBxPw` |

Backup dei workflow: `backups/n8n/` (token sempre redatti).

La web app **TE Planner** (Apps Script, scheda Servizi / Assegna / Flotta / Timeline / Rent)
sta in `te-planner/`: ha regole sue, in `te-planner/CLAUDE.md`. Anche lì vale la regola di
sopra — il codice vero gira su script.google.com, quella cartella è la copia di lavoro.
