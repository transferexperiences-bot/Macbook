# Consegna — Transfer Experience

Per chi riprende il lavoro in una sessione nuova, o per chi lo prende in mano la prima volta.
Non ripete `CLAUDE.md` né `DA-FARE.md`: dice **in che ordine si leggono**, **cos'è vero oggi**
e **cosa si controlla prima di toccare qualcosa**.

Ultimo stato verificato con le prove: **22/08/2026, mattina**. Tutto ciò che riguarda n8n va
riletto dal server all'inizio della sessione: da qui non si vede.

## Ordine di lettura

1. **`CLAUDE.md`** — la regola che spiega i guasti, le zone 🟢🟡🔴, le trappole n8n, la tabella
   degli Id. È il documento che comanda: se questo file lo contraddice, vince `CLAUDE.md`.
2. **`DA-FARE.md`** — la coda di lavoro, già in ordine di priorità. Ogni voce porta la prova
   (esecuzione, nodo, riga): si riparte da lì, non da zero.
3. Questo file — i primi passi e i confini.

## Cos'è questo repository

Non contiene i workflow: contiene **le regole, la memoria e i backup**. I workflow vivono su
n8n Cloud (`transfer.app.n8n.cloud`), il gestionale su Google Sheets.

| File | A cosa serve |
|---|---|
| `CLAUDE.md` | Regole di lavoro, autonomia, trappole, dove sono le cose |
| `DA-FARE.md` | Coda di lavoro con le prove |
| `CONSEGNA.md` | Questo: come si riprende |
| `.claude/settings.json` | Permessi: cosa si fa senza chiedere, cosa è vietato |
| `backups/n8n/` | Backup dei workflow **con i token sempre redatti** |

Storia finora (tre commit): backup di `Transfer webhook` prima della patch doppioni, regole e
permessi, coda di lavoro.

## Stato al 22/08/2026

**22/08 — registro delle bozze (zona rossa, autorizzata).** Il registro non sapeva dire
«questa è già salvata»: le schede confermate rientravano in coda al primo recap, e una
«Conferma tutti» non spediva niente se il modello non ristampava le schede. Corretto e
**pubblicato** (`activeVersionId 627718d7-4a16-42bb-9191-48458d0ddfd1`): `Aggiorna Bozze` v7
marca `st:'salvata'` sulla ricevuta invece di cancellare, e `Componi Payload Salvataggio`
costruisce il payload dal registro quando il modello non ristampa nulla. Prove e banco in
`DA-FARE.md` e `banchi/te/`. **Da verificare in campo:** il primo «Conferma tutti» vero e il
trigger Telegram dopo la pubblicazione.

**Fatto e in repo:**
- Backup di `Transfer webhook` (`MJHTq5MksSeUhKgX`) prima di qualsiasi patch:
  `backups/n8n/TW_pre_dedup_20260814.json` — token verificati redatti (`TOKEN_REDATTO`).
- Regole di lavoro e permessi scritti (`CLAUDE.md`, `.claude/settings.json`).
- Coda di lavoro con le prove (`DA-FARE.md`).
- Banco offline in `banchi/te/`: `harness.js` riproduce il contesto n8n (`$`, `$json`,
  `$input`) attorno al codice di un nodo; `banco-registro.js` e `banco-regressioni.js`
  girano su dati veri di esecuzione. Si lanciano con `node banchi/te/banco-registro.js`.
- Backup pre-patch di Prenotazioni 6.0 (`backups/n8n/Prenotazioni_6.0_pre_registro_20260822.json`).

**Fatto su n8n, ma non basta:** le regole del rientro sono state riscritte **solo nella
descrizione** di `tool_rientro` dentro `Prenotazioni`. Vanno portate nel codice (`DA-FARE` §2):
finché stanno in una descrizione, passano dalle parole del modello — cioè dalla causa di quasi
tutti i guasti.

**Non ancora fatto:** doppioni dalle strutture (§1), riparazione dati sul gestionale (§3),
buffer di Orca (§4), finestra più lunga per i messaggi inoltrati (§5), guardia sui trigger muti
(§6), i blocchi di analisi B/C/D (§7).

**Nessuna di queste voci risulta pubblicata.** Prima di darle per aperte o per chiuse, verificale
sul server: da qui lo stato di n8n non è osservabile.

## I primi cinque minuti di una sessione nuova

1. **Rete.** Verifica se `transfer.app.n8n.cloud` è tra i domini consentiti dell'ambiente. Se non
   lo è, il ponte non è chiamabile e ogni scrittura sul gestionale deve passare dai bot: cambia
   il modo di lavorare della sessione intera, quindi si sa subito.
2. **Rileggi dal server** i workflow che intendi toccare. Per ognuno: `versionId` =
   `activeVersionId`? Se no, **gira ancora la versione vecchia** e quello che vedi non è ciò che
   è in produzione.
3. **Trigger Telegram vivi?** Il 16/08 una ripubblicazione ha staccato un webhook e una foto è
   andata persa **senza lasciare esecuzione**. Dopo ogni pubblicazione si ricontrolla il trigger.
4. **Banco offline prima di tutto.** Nessuna prova su fogli o chat vive: si riproduce
   l'esecuzione reale in `scratchpad/te` e si prova lì.
5. **Backup prima della patch**, in `backups/n8n/`, con i token sostituiti. I token dei bot
   stanno in chiaro dentro gli URL dei nodi HTTP: un backup committato così è un token pubblicato.

## Il giro completo di una modifica

backup → banco offline → `update_workflow` → **`publish_workflow`** → rilettura del nodo dal
server → **diff** con quello provato → verifica del trigger → si racconta ad Agostino.

Saltare `publish_workflow` significa non aver cambiato niente. Saltare il diff significa non
sapere se il cambiamento è quello che si è provato.

## Confini

**Zona rossa, si chiede sempre** (dettaglio in `CLAUDE.md`): prezzi su righe vere, scritture sul
gestionale e sui fogli struttura, qualsiasi cosa esca verso clienti/autisti/fornitori, spegnere
un workflow attivo o cambiare un salvataggio.

**Rosso già autorizzato il 16/08** — `DA-FARE` §3, riparazione dati, **in quest'ordine**:
prima `TR/07082026/SSD1XU4R9NS80YGD` → `Transfer_Per` torna **Bari Airport**; poi il rientro come
riga nuova (Sabbiadoro → Serafini, Id nuovo, autista e veicolo vuoti). Il rientro non si crea
prima del ripristino, e **manca ancora l'orario**: senza quello, si chiede.

**Serve un gesto di Agostino, non aggirabile da dentro la sessione:** l'apertura di rete al
punto 1 e l'orario del rientro.

**Deciso, non si riapre:** token del ponte lasciato al valore di default (rischio già spiegato);
righe 934/935 a 55 € e acconto −50 sulla riga 931, in attesa di una sua decisione.

## Segreti

Non finiscono mai in un commit: i token dei bot Telegram (negli URL dei nodi HTTP) e
l'`x-auth-token` del ponte (nodo `Auth Check` del workflow `0DVJEFcjGb8eTUmj`).
Prima di committare un backup si controlla che siano sostituiti.

## Come si consegna la prossima volta

Alla fine della sessione si aggiornano **`DA-FARE.md`** (cosa è caduto, cosa è nato, sempre con
la prova) e, se cambia il modo di lavorare, **`CLAUDE.md`**. Questo file si tocca solo quando
cambiano lo stato generale o i confini. Una consegna che non si può verificare non è una
consegna: ogni riga qui deve poter essere ricontrollata da un'esecuzione, un nodo o una riga.
