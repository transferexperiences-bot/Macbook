---
name: messaggi-whatsapp
description: "Il check WhatsApp e il giro orario del back office: si parte dalla tabella del workflow, poi la scheda del contatto (ctx-read), triage per priorita', ogni informazione ha un fine, incrocio col gestionale, allegati sempre aperti, orari riconfermati, e la forma del recap. Trigger: check wa, controlla whatsapp, fammi il recap, giro, giro orario, rispondi a, scrivi a, manda il recap a, cosa manca, chi aspetta."
---

# Il check WhatsApp

La domanda non e' *"cosa hanno scritto"*, e' **"chi aspetta una risposta e cosa non e' finito nel gestionale"**.

Gira ogni ora. Ogni giro deve costare poco e finire con un recap che Agostino legge in trenta secondi dal telefono.

Le quattro regole che governano tutte le altre:

1. **Si parte dalla tabella del workflow, non dai messaggi** (sezione 0).
2. **I tre canali - WhatsApp, posta, gestionale - devono convergere; vince il piu' recente** (sezione 0-bis).
3. **Prima di ogni risposta e di ogni scrittura si legge la scheda del contatto** (`ctx-read`, `contesto-contatti`): **non si chiede mai un dato gia' dato** (sezione 8).
4. **Ogni informazione estratta deve avere un fine** - una scrittura, un messaggio, una voce del registro o uno scarto motivato: mai solo un riassunto (sezione 4).

Il check gira **a cinque agenti in parallelo** (`giro-a-due-agenti`): lo **Scrittore WA** e lo **Scrittore Mail** - che per ogni contatto aggiornano la scheda come **passo 0** e poi agiscono - l'agente **Allegati** che apre tutto, l'agente **Orari** che riverifica i servizi imminenti, e il **Supervisore** che verifica sui dati veri. Il recap si scrive solo dopo il verde.

WhatsApp si legge dai **ponti n8n sul VPS**, non dal browser: da qualunque sessione - chat, Cowork, task orario. I vocali si trascrivono da soli, i PDF e le immagini si scaricano e si leggono da soli, e le risposte partono dal ponte.

> I casi veri da cui nascono queste regole - Curry, Tivis/Serena, Giuseppe Mancini, Gianfranco
> Mancini, Meeks, Terramossa, Ambrogio - stanno in **`storia.md`**, accanto a questa skill.
> Si aprono quando serve capire *perche'* una regola esiste o quando una regola sembra sbagliata.
> Per lavorare basta questa pagina.

---

## 0. Da dove si parte: la tabella del workflow, non i messaggi

**Il check parte dalla tabella scritta dal workflow.** Ogni messaggio in arrivo viene gia' classificato da `SMISTAMENTO - WhatsApp VPS` (`1VETqPn6pXGt3nyI`) e scritto nel tab **`Log WhatsApp`** del gestionale (colonne A:M: `Ricevuto`, `Chat`, `Mittente`, `Nome`, `Testo`, `Categoria`, `Urgenza`, `Match gestionale`, `Riassunto`, `Dati servizio`, `Bozza risposta`, `Reasoning`, `Message ID`). Data table grezza: `Messaggi WhatsApp VPS` (`AFcGklrBoUMG0emo`).

Le due cose lavorano **in coppia**: il workflow e' l'orecchio, la skill e' la testa. L'ordine del check:

1. **La tabella** (`Log WhatsApp`, via `api-fogli-google`: `read(SID, "'Log WhatsApp'!A:M")`). Si tengono richieste, conferme, modifiche, pagamenti e operativo autista; si scartano le `IGNORA`. Il `Match gestionale` dice se il servizio e' gia' registrato (evita doppioni); la `Bozza risposta` e' un punto di partenza, **mai spedita al buio**.
2. **La scheda del contatto** (`ctx-read`, `contesto-contatti`): cosa ha gia' detto, quali righe ha, cosa manca, cosa gli abbiamo gia' chiesto. La scheda si aggiorna **come passo 0, prima di agire su quel contatto** - dentro il giro la fa lo Scrittore del canale, fuori dal giro la si fa da soli.
3. **I messaggi come double-check** (`wa-chats` + `wa-msg`): il classificatore puo' sbagliare categoria, perdere un vocale o non vedere l'ultimo messaggio. **La chat resta la fonte**: la tabella orienta, non sostituisce. Si legge **tutto lo storico delle ultime 24 ore** di ogni conversazione, non l'ultimo messaggio.
4. **E anche le mail** (`mail-transfer-experience`).

**La tabella NON vede dentro gli allegati.** Un PDF o una foto entrano come segnaposto (`[documento ricevuto: ...]`), quindi il classificatore li giudica su un testo vuoto e quasi sempre li manda in `IGNORA`. **Un allegato non e' mai rumore finche' non e' stato aperto**: vale la sezione 5, non la categoria della tabella. La guardia `GUARDIA - Allegati WhatsApp` (`rLab1EEoj2RdO4LC`) gira ogni 10 minuti e riscrive il segnaposto col contenuto vero.

**Se la tabella e' vuota o non risponde**, non si conclude che non e' arrivato niente: si scende su `wa-chats`/`wa-msg` (il double-check diventa lettura primaria) e nel recap si segnala che il classificatore non ha scritto.

---

## 0-bis. I tre canali devono convergere

WhatsApp, la posta e il gestionale raccontano **lo stesso servizio**. Quando raccontano cose diverse, non e' un dettaglio: e' un van che parte all'ora sbagliata.

**Vince sempre il piu' recente, in qualunque canale sia arrivato.** Non conta se e' mail o chat: conta l'orario del messaggio.

**Ogni allineamento va riportato ad Agostino subito, dentro la risposta di quel momento** - non a fine giornata - dicendo da dove veniva l'informazione: *"spostato alle 18:00 su indicazione della chat delle 17:41, in mail era 17:00"*.

---

## 1. Il canale

**PRIMA n8n, Make solo come fallback.** Ogni lettura, invio, download allegati e scrittura a gestionale passa dai **webhook n8n**, chiamati **in diretta** (`curl` dal container verso `https://transfer.app.n8n.cloud/webhook/...`): e' molto piu' veloce e leggero del tool Make. **Make non e' un'alternativa comoda**: si usa **solo quando n8n non e' disponibile** - istanza giu', webhook in errore, uscita diretta bloccata (403). Appena n8n torna, si torna su n8n. **Un ponte lento non e' un ponte giu'**: si aspetta e si riprova. Quando si scende su Make, **va scritto nel verbale/recap**: *"fallback Make perche' <motivo>"*.

VPS Hetzner `2.28.29.159`, Evolution API v2.3.7, istanza **`Transfer`**. Webhook POST su `https://transfer.app.n8n.cloud/webhook/`:

| endpoint | body | cosa torna |
|---|---|---|
| `wa-chats` | `{"ore": 24}` | chat toccate: chat, nome, aggiornata, gruppo, ultimo_tipo, ultimo_da_me, ultimo_testo |
| `wa-msg` | `{"chat": "<jid>", "limit": 40}` | messaggi: quando, da_me, mittente, nome, tipo, testo, file, message_id |
| `wa-audio` | `{"chat": "<jid>", "message_id": "..."}` | trascrizione di un vocale (message_id OBBLIGATORIO, senza torna vuoto) |
| `wa-doc` | `{"chat": "<jid>", "message_id": "..."}` | scarica PDF/immagine: base64, filename, mimetype, mediatype |
| `wa-vedi` | `{"chat": "<jid>", "message_id": "...", "domanda": "..."}` | legge il contenuto (vision per le immagini, testo per i PDF) |
| `wa-send` | `{"chat": "<jid completo>", "testo": "..."}` | invia e registra l'invio; risponde `{"ok":true,"chi":"<nome rubrica>"}` |
| `wa-read` | `{"q": "", "ore": 24}` | solo i messaggi arrivati dopo il collegamento |
| `ctx-read` / `ctx-write` | vedi `contesto-contatti` | la scheda viva del contatto (data table `Contesto contatti TE`) |

**Oltre i ~60 messaggi `wa-msg` torna vuoto** (non vuol dire chat vuota). Per leggere una chat intera si interroga Evolution **dal Mac** (il container non raggiunge il VPS): `POST http://2.28.29.159:8080/chat/findMessages/Transfer`, header `apikey: <APIKEY-EVOLUTION — la trovi nella versione attuale della skill, va rimessa prima di caricare>`, body `{"where":{"key":{"remoteJid":"<jid>"}},"page":1,"offset":500}` -> `messages.total` e `messages.records`. Stesso header su `chat/findChats/Transfer` per l'elenco completo delle chat. **L'archivio del VPS parte dal 02/09/2026**: per il prima non si puo' concludere "non me l'ha mai mandato", e un `wa-msg` con `totale_in_archivio: 0` **non** significa che la chat non esista.

**Se `wa-chats` torna vuoto o va in errore**, l'istanza si e' scollegata: scrivilo nel recap (non "non e' successo niente") e riscansiona il QR da `http://2.28.29.159:8080/manager`.

### Quando il ponte e' lento
I webhook n8n possono impiegare **oltre un minuto** quando l'istanza sta lavorando (per esempio mentre gira la `GUARDIA - Allegati`):
- una chiamata per volta, con `-m 150` e il timeout del comando alzato di conseguenza; l'output va **su file**, non a schermo;
- **mai scrivere file nella cartella montata** solo per appoggio (`Permission denied`): si usa `/tmp` o `$HOME` sul Mac;
- `wa-chats` con `{"ore": 720}` e' la chiamata piu' pesante: per trovare **una** chat conviene `chat/findChats/Transfer` diretto e filtrare in locale;
- se una chiamata va in timeout, **non la si ripete alla cieca** se poteva avere effetti (un `wa-send`): prima si rilegge la chat;
- **`gest-read` puo' rispondere 524 (Cloudflare) a freddo**: non e' rotto. Si "scalda" il ponte con una chiamata leggera (`autisti-read`, `forn-read`) e si ripete; poi torna ~1,9 MB / quasi 3.000 righe, quindi si scarica **su file** e si filtra in locale.

### Cose da sapere per non leggere male
- **`Voce`** / **`Voce^`** nel campo nome = **messaggio scritto da Agostino**. Non e' un contatto.
- I **`@lid`** sono id interni, non numeri. Il numero vero sta in `remoteJidAlt` o nel campo `mittente` dei messaggi.
- I **`@g.us`** sono gruppi: il mittente e' `mittente`, non `chat`.
- Finestra 24h; nel check chiesto da Agostino si va a `{"ore": 48}`.
- Un messaggio puo' risultare `da_me: false` pur essendo nostro (inviato da un'altra sessione): si guarda il contenuto, non solo il flag.
- **`wa-vedi` puo' rifiutare un'immagine** dicendo che non trascrive dati personali: non e' un errore del ponte. Il dato si ricava dal testo della chat e nel recap si dichiara che l'immagine non e' stata trascritta.

---

## 2. Prima di giudicare un messaggio, risolvi il numero

`39330725840` e' **Giuseppe Fanelli**, autista. La mappa si costruisce a ogni giro da `autisti-read`, `forn-read` e dai clienti in gestionale (colonna `Cell.`), normalizzando il numero. **Se non risolve**, `chi-e-chi`; se ancora no, nel recap *"numero sconosciuto 3XX..."*, mai un nome ipotizzato.

**Gli alias non entrano nel gestionale.** *Pinuccio NCC* e' Giuseppe Fanelli, *Gianvito* e' Giovanni Vito Antonio. Si riconosce il soprannome quando si legge, si scrive il nome dell'anagrafica quando si salva.

**Numeri e targhe si leggono da `autisti-read`, mai a memoria**, e si rileggono **il giorno stesso**: un autista cambiato dopo che hai letto la riga significa un cliente che aspetta la persona sbagliata.

**Un numero che Agostino incolla in chat senza dire altro** e' una richiesta di guardare quella conversazione: si cerca il numero fra le chat (anche dentro il campo `mittente` degli `@lid`, non solo nel jid) e si porta il punto di quella chat.

---

## 3. Priorita': in che ordine si guardano le chat

**Prima le strutture; poi i CLIENTI CHE DEVONO PAGARCI (servizi svolti e non pagati / recupero crediti); poi i preventivi e le richieste transfer.** E' cosi' che si mappa anche la `Categoria` del workflow.

1. **STRUTTURE e partner** - hotel e agenzie che ci mandano lavoro o aspettano una conferma operativa: **Cala Ponte, Sparano, Il Melograno, seistellemama (6 Stelle Mama), Bayit, Puglia Concierge, Tedi Tour, Antico Mondo, Auraterrae**. Una loro richiesta viene **prima di tutto**: e' lavoro in entrata, e aspettano una risposta pronta - spesso autista/veicolo/targa, un prezzo, o una conferma da girare all'ospite.
2. **CLIENTI CHE DEVONO PAGARCI** - servizi svolti non pagati, incassi mancati, acconti, prezzi da confermare, solleciti, fatture. **PRIMA dei preventivi.**
3. **RICHIESTE TRANSFER e PREVENTIVI** - la pipeline di vendita: a ogni giro se ne ricontrolla lo stato riaprendo la chat. Qui stanno anche i **programmi completi** appena registrati, coi buchi da decidere.
4. **IL RESTO** - contabilita', coordinamento autisti, personali. In fondo.
5. **Rumore** - fuori dal recap.

Dentro ogni tier si evidenzia **cosa serve** (risposta pronta / prezzo da decidere / autista da assegnare) e **cosa e' urgente oggi o stasera** (campo `Urgenza` del workflow). L'unica cosa che scavalca tutto e' **un servizio che parte nelle prossime ore e sta rompendo qualcosa adesso**: il segnale non e' il tono, e' la distanza dall'orario del servizio.

---

## 4. Ogni informazione ha un fine: cosa se ne fa di ogni messaggio

Riassumere un messaggio nel recap **non e' un fine**. Ogni informazione che esce da una chat, da un vocale, da una mail o dal gruppo autisti deve chiudersi in **una** di queste uscite: una scrittura a gestionale con prova, un messaggio (partito o in bozza), una voce numerata del registro, o uno scarto motivato. Il Supervisore ferma tutto quello che non ci arriva.

La catena: **chi -> scheda -> quale transfer -> quali tratte -> azione -> prova -> scheda aggiornata**. Il transfer si identifica dai `transfer_ids` della scheda, poi con `gest-read` per nome cliente **su tutte le date**, o per autista + data quando il messaggio non fa nomi; se non si identifica, si chiede a chi ha scritto (per gli autisti la domanda parte da sola) - mai un'ipotesi, e mai una domanda su un dato che sta gia' in scheda o nello storico. **Ogni dato dichiarato finisce in `fatti` della scheda** (`ctx-write`), anche quando l'azione e' uno scarto.

| informazione | come si riconosce | dove porta e con che prova |
|---|---|---|
| **Conferma di servizio nostro** | data, ora, tratta, pax, si' esplicito | riga nuova subito: `gest-write`, una riga per tratta; rilettura con `gest-read`; voce chiusa; `transfer_ids` in scheda |
| **Programma completo** | piu' giorni/tratte con date e orari, in chat, vocale, PDF o mail | **righe a gestionale subito, una per tratta**, con tutto quello che c'e' scritto; `Tariffa` vuota se senza fonte; nota "programma da <canale> del GG/MM"; ogni tratta in `fatti`; voce a registro `<NOME> PROGRAMMA` coi buchi; risposta che ripete il programma e chiede solo cio' che manca. Dettaglio in `contesto-contatti` 5 |
| **Preventivo / richiesta prezzo** | chiedono dispo o prezzo, non confermato | **non a gestionale**: voce aperta a registro col riferimento a chat/thread e cosa e' stato quotato; si ricontrolla **ogni giro** riaprendo la chat, con lo **stato di adesso**, mai ricopiato dal giro prima |
| **Modifica** (orario, data, pax, tratta) | riguarda un servizio esistente | si trova la riga (`transfer_ids`, poi `gest-read`) e si corregge **il solo campo**, nota integrata in coda, **autista assegnato avvisato**. Mai una riga nuova |
| **Punto di ritiro dettato in chat** | "va ripreso dalla farmacia Gentile" | in `Note`, in coda; autista avvisato se gia' assegnato |
| **Orario di rientro concordato sul posto** | lo riferisce l'autista o il cliente | campo `Time` della riga del **ritorno**; se la riga del ritorno non esiste, si crea (se e' nostra) |
| **Il cliente ha pagato tutto in una tratta** | lo dice l'autista | importo pieno su una riga, **0** sull'altra, modalita' allineata, nota senza cifre. 100 totali si scrive 100 e 0, mai 50 e 50 inventati |
| **Il cliente NON ha pagato** | lo dice l'autista | procedura in 4-bis: andata a 0 con nota, incasso sul ritorno, autista del ritorno avvisato, `Show` non si tocca |
| **Autista non puo' fare un servizio / conflitto** | operativo | **voce per Agostino** con le alternative libere; nessuna decisione al suo posto |
| **Struttura chiede targa / autista / conferma** | operativo in entrata | eccezioni (a) e (c) della sezione 9 se i dati ci sono; altrimenti voce |
| **Domanda di un cliente senza risposta** | anche vecchia di settimane | risposta se dentro l'autonomia, altrimenti bozza nel recap **col contesto** |
| **Dato che manca per quotare** | buco nella richiesta | **prima `ctx-read` + storico**: se il dato c'e' si usa; se manca davvero, **una sola domanda** con tutte le mancanze (eccezione (b)) **ripetendo cio' che abbiamo gia'**; voce a registro; `manca` e `chiesto` in scheda |
| **Allegato** | PDF, foto, vocale | **sezione 5: si apre SEMPRE e si confronta col gestionale** |
| **Ritardo / reclamo / disservizio** | | bozza nel recap, **mai inviata da sola** |
| **Amministrazione** | fatture, bonifici, solleciti | una riga a parte in fondo al recap, con chi deve muoversi |
| **Rumore** | newsletter, gruppi personali, auguri, spam | scarto **con motivo nel verbale**, fuori dal recap. Anche i contatti informali che reagiscono male al tono "bot" e i **messaggi personali** (appuntamenti, carrozzeria, familiari) si lasciano ad Agostino: non si risponde a suo nome |

**Per ogni transfer prenotato o richiesto nelle ultime 24 ore** si accertano **due cose**: che il cliente abbia avuto una risposta (tre controlli, sezione 6-bis) e che il servizio sia salvato a gestionale (o sia un preventivo a registro). Una delle due che manca e' un buco che il Supervisore segna rosso.

### Non si triagia dall'ultimo messaggio: ogni prenotazione delle 24h e' una voce
**L'ultimo messaggio di una chat NON dice cosa contiene la chat.** Una conversazione che finisce con *"ok"*, *"grazie"*, *"domani"*, un'emoji o un reaction puo' contenere, poche righe sopra, una **prenotazione, una conferma o una modifica** delle ultime 24 ore (caso Gianfranco Mancini, `storia.md`).
Regola: **non si decide se aprire una chat dal suo ultimo messaggio.** Di ogni conversazione toccata nelle 24h si legge **tutto lo storico** e si estrae **ogni** servizio. **Ogni servizio estratto diventa una voce numerata del recap** con nome e stato.

### Un dato dichiarato non si richiede
Prima di ogni domanda a un contatto si controlla che il dato non stia **in scheda** (`ctx-read`), **a gestionale** (`gest-read`) o **nello storico 24h** della chat. Se c'e', si usa. Se manca davvero, si chiede **ripetendo prima quello che abbiamo gia'** (*"Ho segnato 16/09 h11:30, Tuccino > Aeroporto Bari, 6 pax: mi manca solo il volo"*). Il Supervisore segna ROSSO ogni domanda su un dato gia' dato, anche se il messaggio e' partito. Ogni dato dichiarato che leggi va in `fatti` della scheda nello stesso turno.

### Un transfer confermato si SALVA subito, non si chiede conferma della registrazione
Quando un servizio e' **confermato**, **lo si registra subito a gestionale senza chiedere ad Agostino conferma della registrazione**. Se e' identificabile (data, tratta, pax, prezzo gia' quotato) **si salva e basta**, poi lo si segnala nel recap come *"registrato: riga X, Id Y"*. La **registrazione e' sempre dovuta**; e' solo l'**invio al cliente** che aspetta un "invia/manda". Registrare e' reversibile (`Allert: Cancellato`); perdere un servizio no.

### Doppioni fra canali: prima di registrare, controlla l'altro canale
Lo stesso servizio arriva spesso **due volte**: dal cliente/ospite E dalla struttura, o da WhatsApp E da mail. **Prima di creare una riga si cerca a gestionale se quella data/ora/tratta/struttura esiste gia'** (anche senza nome, righe nascoste, Allert, PL). Se esiste, si **arricchisce** la riga esistente; il doppione si cancella (`Allert: Cancellato` + `Hide: True`).

### Un transfer che non c'e': prima chiediti chi lo fa
La domanda non e' *esiste?* ma **chi lo esegue?** Il segnale che decide e' **chi ha detto si'**.
- **Se il si' l'abbiamo dato noi** - c'e' una nostra mail o un nostro messaggio che lo promette al cliente - **si crea subito**, coi dati che il messaggio contiene, lasciando vuoto quello che manca e segnalandolo. E' nostro, l'abbiamo venduto, e fuori dal gestionale nessun autista lo vede.
- **Se compare un tour operator o un partner** (Puglia Mare, Tedi Tour, Auraterrae) -> probabilmente lo coprono loro: si riporta ad Agostino, **il gestionale non si tocca** (caso Terramossa, `storia.md`).
- **Le strutture ricettive** (Cala Ponte, Melograno) funzionano al contrario dei tour operator: ci **mandano** il lavoro, non lo eseguono. Si crea.
- **Le strutture che si registrano da sole** (`conferma-gestionale`: Musae Relais, Auraterrae, Melograno, Covo, Pietra Blu, 6 Stelle MAMA, ecc.) -> si risponde e si quota, ma **la riga NON la creiamo noi**.

Nel dubbio si chiede. **Al cliente non si dice mai che ce n'eravamo dimenticati**: quello che serve si chiede come una normale conferma (*"a che ora vuoi essere ripreso?"*).

### 4-bis. I messaggi degli autisti sono dati, e ogni dato finisce su una riga
Si legge **anche il gruppo autisti e le chat singole**, per intero nelle 24 ore. Per ogni cosa che dicono: **chi -> quale transfer -> quali tratte -> azione -> prova**. Pagamenti, punti di ritiro e orari di rientro: vedi la tabella sopra.

**Un rientro chiesto dagli ospiti e riferito dall'autista e' una prenotazione**: se la riga di ritorno non esiste si CREA (tratta inversa, stessa struttura, tariffa allineata all'andata), non si lascia un appunto nel recap.

Un autista che **coordina un orario o segnala un conflitto** (non puo' fare una partenza, arriva a una certa ora) e' operativo di tier 4: si **riporta ad Agostino**, non si decide a suo nome ne' si risponde all'autista sulle scelte che spettano a lui. Un **cambio orario chiaro dettato dal cliente o dalla struttura** invece si aggiorna subito a gestionale (e si avvisa l'autista assegnato).

#### Il caso "il cliente non ha pagato"
Identifica il servizio e l'importo **dal gestionale**; cerca il ritorno: se e' nostro, andata a **0** con nota (senza cifre), sul ritorno `Tariffa` = andata+ritorno, modalita' allineata, e l'autista del ritorno avvisato di *"incassare andata + ritorno"*. `Fee`/`Netto`/`%` non si mandano; `Show` non si tocca.

### 4-ter. Quando giri un servizio all'autista: la modalita' di pagamento
`Incassare` -> quanto incassare (Tariffa esatta; residuo se c'e' acconto). `Fattura`/`Sconto in fattura` -> non incassare nulla. Modalita' vuota -> rileggi da `Fornitori e strutture` e riempila subito. L'importo dal gestionale, mai inventato; all'autista niente fee/margini.

### 4-quater. Sub-appalti: nella colonna T ci va anche il costo
Quando un servizio viene **girato a un sub-appaltatore** (World Transfer, Rent All, Bruno Trans, Michele NCC...), nella colonna **`T` (Sub-appalti)** si scrive il nome **e il costo concordato con lui**: `Rent All 250`. Cosi' il margine si vede dalla riga senza rincorrere le chat. Il costo del sub-appalto **non entra mai** nel messaggio al sub-appaltatore ne' nella `Tariffa` (che resta quella del cliente).

---

## 5. ALLEGATI: zero allegati muti

**Nessun allegato resta chiuso. Mai.** Nemmeno quando sembra il doppione di cose gia' note, nemmeno quando il messaggio che lo accompagna dice "te l'avevo mandato", nemmeno se il mittente manda foto in continuazione. **Un allegato non aperto non e' uno scarto motivato: e' un buco.** (Caso Curry, `storia.md`: un cambio di orario dentro un PDT mai aperto, clienti atterrati due ore prima senza nessuno ad aspettarli.)

### Il protocollo, in quest'ordine
1. **Inventario.** Di ogni chat della finestra si elencano TUTTI gli allegati: `documentMessage`, `imageMessage`, `audioMessage` da `wa-msg`, piu' le righe della data table che iniziano con `[documento ricevuto` / `[immagine ricevuta` / `[vocale ricevuto`. **Trovati e letti devono coincidere**, e si scrivono nel verbale: *"allegati: 4 trovati, 4 letti"*.
2. **Lettura.** `wa-vedi` (immagini e PDF) o `wa-audio` (vocali), sempre col `message_id` giusto. Per un PDF con tabelle: `wa-doc` -> `pdftotext -layout` **dal Mac**.
3. **Diff col gestionale, voce per voce.** Se l'allegato contiene un programma (schedule, riepilogo, elenco servizi, biglietto, conferma), **ogni voce si confronta con la riga corrispondente**: data, orario, volo/treno, tratta, pax, prezzo. Una riga per voce, `uguale` oppure `DIVERSO: gestionale X / allegato Y`.
4. **Azione su ogni differenza.** Si corregge la riga (`gest-write`), si rilegge per prova, si avvisa l'autista se assegnato, e la differenza diventa una voce numerata del recap.
5. **Fonte.** Nella nota della riga si scrive da dove viene il dato nuovo e con che data (*"orario da PDF Toni_60th del 14/09"*).
6. **Su Drive, dentro la registrazione.** Gli allegati utili all'autista (cartelli, biglietti, documenti) si caricano su Google Drive resi condivisibili e il **link finisce sulla riga del servizio**, cosi' l'autista apre il cartello dalla riga. E' un passo della registrazione, non una scansione periodica.
7. **Un PDF di programma che cambia il totale va segnalato ad Agostino**: se la nuova versione toglie o aggiunge servizi, la differenza si dichiara nel recap **prima** di qualunque conferma scritta.

### Chi vince quando due fonti dicono cose diverse
Il documento **piu' recente** della struttura/agenzia batte quello che abbiamo in riga, anche se la riga era "confermata". Un orario preso 2-3 settimane prima **non e' piu' un dato confermato: e' un dato vecchio**. Se le due fonti sono dello stesso giorno e non si capisce quale valga, si chiede - ma **entro l'ora**.

---

## 5-bis. Il giorno del servizio: gli orari si riconfermano PRIMA di muovere l'autista

Prima di assegnare e prima di mandare autista/targa alla struttura, per ogni servizio delle prossime 24 ore che dipende da un **volo o da un treno**:

1. Si rilegge l'ultima comunicazione della struttura/cliente su quel servizio (chat intera + allegati + mail).
2. Si verifica il numero di volo/treno contro l'orario in riga.
3. **Il `Time` della riga e' l'ora di RITIRO, non l'ora di atterraggio** (caso Meeks): aeroporto = arrivo + 20 minuti, stazione = arrivo + 10.
4. Sui gruppi lunghi si chiede una **riconferma scritta degli orari a 48 ore dall'arrivo**, voce per voce.

Un servizio di oggi con orario non riverificato **non e' pronto**, anche se l'autista e' assegnato.

---

## 6. Incrociare col gestionale

**Si cerca per nome del cliente, su tutte le date. Mai filtrando su un giorno solo.** Un rientro puo' stare sul giorno dopo, un servizio notturno puo' essere datato oltre la mezzanotte. Restringere a una data e' il modo piu' rapido per dichiarare mancante una riga che esiste e crearne una seconda.

```python
call("gest-read", {"q": "<cognome cliente>"})
```

`gest-read` filtra con `JSON.stringify(row).includes(q)`: cerca `'27 agosto 2026'`, non `'27/08/2026'`, e seleziona per **Id esatto**, mai per posizione.

Se scrivi:

- **Forma della scrittura**: `{"rows":[{"Id": "...", "<Colonna>": "<valore>"}]}` - un array `rows`, **non i campi al primo livello**. Coi campi piatti il ponte risponde `No item to return was found` e **non scrive niente**. Il match e' sull'`Id`; **un Id che non esiste crea una riga nuova in fondo**, quindi lo stesso endpoint serve per creare e per correggere. Una batch echeggia solo la prima riga ma le applica tutte.
- **La data si manda sempre come `28/08/2026`**, mai `"ven 28 agosto 2026"`.
- **Un valore che comincia con `+` diventa una formula** e la cella va in `#ERROR!`: si scrive `'+39 331 739 7155`, con l'apostrofo. Controlla tutti i campi.
- **Togli `row_number` e togli `Netto`, `Fee` e `%`**: sono formule, e rimandarle indietro le uccide.
- **L'Id dev'essere univoco e nel formato di casa**: `TR/GGMMAAAA/HHMM/CODICE6`. Un Id ripetuto non da' errore: **sovrascrive**.
- **`Show` non e' "pagato"**: e' la spunta personale di Agostino per sapere se l'autista gli ha **consegnato** l'incasso in contanti. **Non si tocca mai dal giro.** Come si e' davvero incassato un servizio si legge dal file `Check list`, scheda `Fogli di viaggio` (Tariffa + Modalita'), non dalla mail JotForm.
- Una riga = **un mezzo che parte**.
- **Non si cancella mai davvero**: `Allert: "Cancellato"`, `Hide: True`. E dopo aver cancellato, **controlla che la riga buona non sia rimasta nascosta**.
- Un orario **oltre la mezzanotte cambia giorno**: 00:01 e' il giorno dopo.
- Ogni scrittura ha la sua **copia sul foglio Strutture**.
- **Dopo ogni scrittura si rilegge la riga** con `gest-read` e i valori nuovi vanno nel verbale come prova.
- **Si rilegge la riga anche un attimo PRIMA di scriverla** quando piu' agenti lavorano in parallelo: si cambia **solo il campo che serve** e la `Note` si integra in coda a quella appena riletta (`giro-a-due-agenti`).

### Le note si integrano, non si sostituiscono
Prima di riscrivere la colonna `Note`, **si legge quella che c'e'**: contiene quasi sempre roba che non e' scritta da nessun'altra parte - il numero di volo, da dove veniva la richiesta, come paga il cliente. Sostituirla e' una perdita secca e silenziosa. Si aggiunge in coda. Dentro le note **non vanno mai gli importi**: le leggono gli autisti.

### Lo zero in Tariffa
Lo zero resta zero, e **la nota spiega l'accordo di pagamento** - *"salda a fine soggiorno"*, *"paga tutto al ritorno"*, *"free"* - senza cifre.
La somma che **l'autista deve incassare** lui puo' vederla, e va messa **in Tariffa sull'ultima tratta**, quella dove avviene l'incasso. Dentro una **disposizione** vale il contrario: la tariffa sta sulla **prima** tratta del van e le altre a zero. **Prima di azzerare una riga guarda sempre se e' la prima del suo mezzo.**

### Capienze e commissioni
Fino a 7 passeggeri un mezzo; da 8 a 9 si chiede ad Agostino; oltre 9 due mezzi. Con i bagagli da volo un 9 posti ne porta 7, un 8 posti 6-7, un 7 posti 6.

Commissioni - **la fonte e' `forn-read`**. Valori letti il 30/08/2026: Auraterrae 26% · Antico Mondo 20% · Mancini Rent 20% · Puglia Concierge 20% · Talea/Peschiera 9% · Cala Ponte 0% · Sparano 0% · Longo -10%.

**Melograno funziona diversamente:** il loro listino e' il **netto nostro**, la struttura ci mette sopra il **30%** verso il cliente, e dal netto **noi giriamo il 7% a Mancini**. Quel 7% in colonna `% fee` non e' una commissione al Melograno.

Le cifre che arrivano dalle strutture: **Melograno, Auraterrae e Antico Mondo scrivono in lordo**; **Cala Ponte e' indifferente** (fee 0); tutte le altre, finche' non sono mappate, si leggono come **netto**.

Prezzi noti verificati (09/09/2026), usabili senza inventare: **Sparano APT<->Palace = 45**, **Tuo Hotel Polignano -> APT Bari = 120**, **Cala Ponte <-> APT Bari = 95**. Resta la regola: **MAI inventare una tariffa** - se il servizio si scosta dal caso standard si lascia `Tariffa` vuota e si chiede. Ogni prezzo scritto cita la sua fonte nel verbale.

---

## 6-bis. Prima di dire che qualcuno e' fermo

Tre controlli: la **posta inviata** (`to:indirizzo in:anywhere` / `in:sent`, thread INTERO con `get_thread`), la **chat** con `wa-msg` sulla chat intera, e le **note della riga di gestionale**, dove finiscono le conferme arrivate per telefono. **Se anche uno solo dei tre dice che abbiamo risposto, non e' fermo.**

Inoltre, per ogni transfer prenotato o richiesto nelle 24 ore: il cliente ha avuto risposta, il servizio e' salvato **con la `Modalita'` compilata (mai vuota)**, e **compare come voce del recap**.

---

## 7. Il recap

**Prosa, non elenchi puntati. Frasi intere.** Il formato e' **cosa · quanto · cosa decidi**. Si scrive **solo dopo il verde del Supervisore**, e porta una riga sull'esito della supervisione.

**Ogni voce ha un numero e un nome**, sempre citati insieme: *"(195) OZZY 3 SETT — Sam aspetta da ieri..."*. Il numero e' progressivo sul registro `Board pending TE`; il nome e' due o tre parole che dicono il soggetto vero - `OZZY 3 SETT`, non `RICHIESTA CLIENTE` - e **non cambia mai**, nemmeno quando la voce si chiude o si riapre. Un contatto una voce. Regole complete in `niente-in-sospeso`.

L'ordine:

1. **Strutture che aspettano** - ciascuna con **cosa serve** (autista/veicolo/targa, prezzo, conferma per l'ospite) e **cosa e' urgente oggi/stasera**.
2. **Clienti che devono pagarci** - servizi svolti e non pagati, con chi deve muoversi e la cifra dal gestionale.
3. **Preventivi e richieste transfer** - con lo stato **ricontrollato a questo giro** riaprendo la chat, e i programmi completi appena registrati coi buchi da decidere.
4. **Quello che scotta adesso** - uno o due, non dieci. Un servizio che parte tra poche ore e sta rompendo qualcosa puo' stare anche sopra i tier 1-2.
5. **Quello che ho sistemato da solo** - righe scritte e correzioni fatte, con l'**Id** e **da quale canale** veniva l'informazione.
6. **Fornitore per fornitore.**
7. **Allegati** - trovati/letti e cosa hanno cambiato.
8. **Ferme da giorni** - un paragrafo solo.
9. **Amministrazione** - una riga.
10. **Cosa devi decidere tu** - mai piu' di sei voci, una riga ciascuna. Qui finiscono anche i buchi che il Supervisore ha lasciato rossi (prefisso `SUPERVISIONE`).

Se non e' successo niente, **il recap e' una frase sola**. Il recap esce anche come **cruscotto HTML** (`cruscotto-html`): una tendina per voce con sintesi, proposta e chat.

---

## 8. Rispondere

**Prima la scheda, poi la risposta.** Prima di comporre qualunque messaggio: `ctx-read` sul contatto, `gest-read` per nome, storico 24h della chat. **Una domanda al cliente e' ammessa solo se il dato non sta in nessuno dei tre posti**; se serve chiedere, si ripete prima quello che abbiamo segnato. Subito prima di ogni `wa-send` si rifa' `ctx-read` e `wa-msg`: se e' comparso del nuovo, la risposta si riscrive. **Dopo l'invio** `ctx-write` `appendi` con la riga in `chiesto` e `ultimo_da: noi`: un invio senza scheda aggiornata e' un invio a meta'. Vale anche quando la richiesta arriva da Agostino in una riga (*"rispondi a Giuseppe"*).

**Il contesto si mostra sempre**: ad Agostino arriva **cosa ha scritto il cliente e cosa gli e' stato risposto**. Senza la richiesta a fianco non puo' giudicare la risposta.

**Cosa parte da solo e cosa aspetta.** Dentro l'autonomia: **gli autisti** per intero - programma, spostamenti gia' scritti a gestionale, richieste di disponibilita', acconti e pagamenti loro, la domanda per identificare un transfer di cui parlano - e **i prezzi fino a 150 euro che esistono gia'**, a listino o come stessa tratta gia' fatta a quel cliente. **Le assegnazioni degli autisti le fa Agostino**: io preparo la plancia con le catene calcolate e dico chi e' libero, sulla riga non ci metto nessuno. Fuori dall'autonomia: **prezzi nuovi, tutto sopra i 150 euro, e ogni messaggio che spiega un ritardo o un disservizio** o che racconta al cliente cosa sta facendo un autista.

**Confermare un prezzo non e' mandarlo**: si registra a gestionale, ma al cliente non parte niente finche' Agostino non dice "invia/manda" (o preme "Invia al cliente" nel cruscotto).

**Gli orari non si deducono.** Prima il **GPS**, poi la **voce dell'autista**, e solo con tutti e due esce una tempistica, sotto forma di **finestra** - "verso le 20:00-20:15" - mai di minuto secco. Finche' mancano le due fonti si scrive solo *"sto verificando con l'autista, ti aggiorno a momenti"*. **Non si racconta mai a un cliente che il suo servizio viene dopo un altro.**

**Nel messaggio non ci vanno MAI i nostri ragionamenti interni.** Il cliente riceve **il prezzo e cosa comprende**: non i km dal garage, non il rientro a vuoto, non quale autista e' libero, non il margine, non la fee.
Sbagliato: *"Tariffa 70 euro, e' sopra i 66 delle volte precedenti perche' a quell'ora il mezzo esce dal garage alle 03:00."* Giusto: *"Tariffa 70 euro, tariffa notturna, tutto incluso."*

**Un link non si rimanda se e' gia' in chat.**

**Si verifica SEMPRE il destinatario prima di premere invio.** La chat si aggancia al **numero** dell'anagrafica (`Cell.` del gestionale, `forn-read`, `autisti-read`; per gli `@lid` il numero vero e' in `remoteJidAlt`), **NON al nome** della lista WhatsApp. **Mai comporre un testo con un valore mancante** (link `None`, importo o nome vuoto).

**La chat e' la fonte, anche quando la cosa la dice Agostino a voce.**

**Quando un servizio salta** (maltempo, cancellazione del cliente, mezzo rotto) il messaggio dice tre cose: nessun problema per la cancellazione, non c'e' niente da pagare, e **restiamo a disposizione** per qualunque altra cosa durante il soggiorno. Mai far pesare la disdetta.

### Come si invia

```
POST https://transfer.app.n8n.cloud/webhook/wa-send  {"chat": "<cifre>@s.whatsapp.net", "testo": "..."}
```

**Il `chat` e' sempre il jid COMPLETO** (caso Ambrogio): con le sole cifre il ponte risponde **HTTP 400** e non manda niente. Il jid si compone dal numero dell'anagrafica togliendo spazi e `+`; i gruppi finiscono in `@g.us`. Testo non vuoto e <=3000 caratteri; ogni invio finisce in `Invii WhatsApp VPS`, e la risposta `{"ok":true,"chi":"<nome>"}` e' anche la **prova del destinatario**: se `chi` non e' la persona giusta, si e' sbagliato numero (un `chi` vuoto su una chat `@lid` e' normale). **Se il ponte risponde `numero nuovo mai visto`, e' davvero nuovo**: non si forza, si consegna ad Agostino il pulsante `wa.me` - e **se il servizio e' nelle prossime ore si dice esplicitamente di CHIAMARE** (gli autisti stanno su Telegram: in emergenza il canale e' la telefonata). Dopo ogni invio si rilegge la chat e il `message_id` va nel verbale.

Quando non si invia dal ponte: prima il testo in chiaro come citazione, poi `[**📲 Manda a <nome>**](https://wa.me/<numero>?text=<testo urlencoded>)`. Senza numero, `https://wa.me/?text=...` apre comunque il selettore contatti.

Dal browser: **l'Invio manda**, per andare a capo **shift+Invio**; si verifica con uno screenshot che l'intestazione sia il destinatario giusto.

Altre regole d'invio: sotto un messaggio in lingua straniera va sempre **la traduzione italiana**; il link recensione `https://g.page/r/CSZur2xwSkJFEBE/review` va **solo ai clienti**; per le mail **mai testo semplice e mai i tool Gmail**, solo `POST /webhook/mail-send` - se la stringa non contiene `TRANSFER &#10022; EXPERIENCE`, non e' una nostra mail.

---

## 8-bis. Un ordine breve si esegue intero

Quando Agostino dice **"veloce, manda il recap a World Transfer"**, *"manda il servizio a Bruno Trans"*, *"gira questo a Tonio"* - una riga, nessun dettaglio - **non si torna indietro a chiedere quale servizio, quale numero, quale giorno**. Sue parole: *"e' veloce: contatti anagrafica, recap, che servizio c'ha; leggo il gestionale, vedo il servizio, lo mando"*.

La catena, tutta dentro lo stesso turno:

1. **Contatto dall'anagrafica.** `forn-read` (fornitori e sub-appaltatori), poi `autisti-read`, poi la colonna `Cell.` del gestionale, poi la rubrica delle chat. Si prende il **numero**, non il nome della lista WhatsApp.
1-bis. **Scheda del contatto** (`ctx-read` sul numero): cosa gli abbiamo gia' mandato e cosa ha gia' detto, cosi' il recap non ripete ne' chiede niente di gia' noto.
2. **Servizio dal gestionale.** `gest-read` col nome del fornitore/sub-appaltatore, dell'autista o del cliente di cui si stava parlando. Si prende **il servizio che gli compete piu' vicino nel tempo**: quello di oggi, o il primo futuro. Se ne ha piu' d'uno imminente, **si mandano tutti, numerati** - non si chiede quale.
3. **Controlli minimi prima di comporre**: `Modalita'` compilata (se vuota si riempie, 4-ter), orario riverificato se dipende da volo/treno (5-bis), nota di pick-up presente.
4. **Recap completo** nel formato qui sotto, nella lingua del destinatario, senza fee/margini a un sub-appaltatore.
5. **Invio** con `wa-send`, dopo aver riletto la chat.
6. **Rendiconto ad Agostino in due righe**: a chi e' andato, quale servizio, `message_id`. E `ctx-write` `appendi` sulla scheda del destinatario.

Quando Agostino risponde a un recap con una **lista secca di numeri e cifre** (*"1 quota 90, 2 70, 3 450 auto, 7 ringrazia"*), quella lista e' un **ordine di esecuzione sulle voci numerate di quel recap**: si eseguono tutte nello stesso turno, nell'ordine dato, e si rendiconta voce per voce. Se un numero non torna con la voce, **si guarda quale voce del recap combacia davvero col contenuto** e si dice quale si e' eseguita.

Si chiede **una cosa sola e solo se e' davvero indecidibile**: quando il nome non e' in nessuna anagrafica e non ha una chat, oppure quando a gestionale non c'e' nessun servizio suo. In quel caso si dice esattamente cosa manca (*"World Transfer non e' in anagrafica: dammi il numero"*) e si prepara il testo pronto, cosi' basta un copia-incolla.

### Il formato del recap di un servizio (formato di casa)
Quando si gira un servizio a un **autista**, a un **collaboratore**, a un **sub-appaltatore** o a **chiunque Agostino dica di mandarlo**, il messaggio va **sempre completo**, mai ridotto a due righe, e **in questo formato a emoji** (una riga per ogni campo che ha un valore in riga; i vuoti si omettono):

```
📅 OGGI — lun 14/9
🕐 16:35
📍 Aeroporto di Bari (BRI) → Berlind farm, Fasano - <link Maps>
👤 Sam Lehman · 1 pax
💰 Da incassare: 120€
✈️ AF1288
📱 +16512497654 · https://wa.me/16512497654
🚐 Vito FJ154PR
👨‍✈️ Katiuscia Secondo
📝 Cliente diretto da WhatsApp. Saldo al driver a bordo (nessun acconto).
```

Regole del formato:
- **📅** prima riga: `OGGI` / `DOMANI` / la data, sempre col giorno breve (`lun 14/9`).
- **🕐** e' il `Time` della riga, cioe' l'ora di **ritiro** (mai l'ora del volo).
- **📍** tratta `Da → Per`, col link Maps se c'e' in riga.
- **💰** dalla `Modalita'`: `Incassare` -> *"Da incassare: <Tariffa>€"* (residuo se c'e' acconto); `Fattura` / `Sconto in fattura` / `Dalla struttura` / `Carta` -> *"Nulla da incassare a bordo"*.
- **📱** numero del cliente **e** link `wa.me` con le sole cifre.
- **👨‍✈️** l'autista assegnato (si omette se il destinatario e' l'autista stesso solo quando e' ovvio).
- **📝** e' **obbligatoria**: almeno il punto di ritiro.
- A un **sub-appaltatore** non si mandano MAI fee, margini, la nostra tariffa o il costo del sub-appalto: al posto del veicolo si scrive *"vostro mezzo"*.
- Piu' servizi = piu' blocchi, separati e numerati.

### Quando non si sa
Se manca un pezzo **che non si puo' ricavare** si chiede, **una domanda sola**, dopo aver controllato che non stia gia' in scheda o nello storico. Riempire il buco con l'ipotesi piu' probabile e' l'errore che si ripete; chiedere quello che il cliente ha gia' scritto e' l'errore opposto, **e costa uguale**.

---

## 9. Quando gira da solo

Giro orario automatico e ogni sessione senza Agostino. Gira **a cinque agenti** (`giro-a-due-agenti`): l'orchestratore legge i feed, poi Scrittore WA, Scrittore Mail, Allegati e Orari partono **tutti in parallelo** (ognuno aggiorna da se' la scheda dei suoi contatti, passo 0), e il Supervisore chiude.

- **Non fare domande ad Agostino**: se una cosa e' ambigua, **scrivila come ambigua nel recap** (agli autisti la domanda per identificare un servizio si fa).
- **Registra da solo** le conferme che sono nostre **e i programmi completi** (sezione 4); porta a termine ogni informazione autisti (4-bis); **apri e confronta ogni allegato** (5); **riverifica gli orari dei servizi delle prossime 24 ore** (5-bis); **aggiorna la scheda di ogni contatto toccato**.
- **Ricontrolla lo stato dei preventivi e delle richieste transfer aperti** riaprendo la loro chat: aprono il recap anche quando gira da solo.
- **Riporta e gestisci per priorita'** (sezione 3).
- Se `wa-chats` non risponde, l'istanza Evolution si e' scollegata: il recap e' **una riga che lo dice**, non un "non e' successo niente".

**Niente infrastruttura di propria iniziativa**: non si creano workflow n8n attivi, task schedulate o guardie ricorrenti senza il via di Agostino - una guardia ogni 10 minuti gli ha messo 416 esecuzioni in coda e bloccato i ponti. L'autonomia riguarda le AZIONI di back office dentro le regole, non la creazione di automatismi.

### Le cose che partono da sole (lista chiusa)
**Non mandare mai un messaggio di tua iniziativa a un cliente**; la bozza si scrive nel recap. Eccezioni:
- **(a)** targa e autista alle strutture (servizi di oggi entro 3h, mai al cliente, niente prezzi).
- **(b)** la domanda sui dati che mancano per quotare.
- **(c)** la conferma a una struttura/partner di un servizio GIA' a gestionale. Ci rientra anche la risposta interlocutoria a una struttura che aspetta (*"ricevuto, sto cercando l'incastro, ti confermo a breve"*), purche' non contenga prezzi nuovi.
- **(d)** i messaggi agli autisti/collaboratori/sub-appaltatori che chiudono un dato di 4-bis (formato completo, niente fee).
- **(e)** la domanda di chiarimento su una **differenza di orario** fra un allegato e il gestionale su un servizio delle prossime 48 ore: si chiede subito.
- **(f)** l'invio che Agostino ha gia' ordinato in chat (8-bis): quello **parte senza ulteriore conferma**, e' lui che l'ha chiesto.
- **(g)** **le richieste di TOUR IN BARCA si rispondono SEMPRE in automatico.** Chi scrive *"vorrei noleggiare una barca / un tour privato"* riceve subito la presentazione di **Oceania Charter** (tour privati sulla costa di Polignano: grotte marine, soste bagno, aperitivo a bordo, skipper incluso) e le **tre domande** che servono a quotare: che giorno, quante persone, mattina o pomeriggio. **Il prezzo NON si manda in questa prima risposta**: si quota dopo, sul `Gestionale Boat Tour` e sui listini barche (`reference_sumup_links_barche` per il deposito).
- **(h)** **anche le richieste di NOLEGGIO AUTO si rispondono in automatico**: si conferma che facciamo sia NCC con autista sia noleggio auto, e si chiedono tipo di auto, date e luogo di ritiro. **La cifra si legge sempre dal foglio `Listini Rent`**, mai a memoria (`noleggio-prezzi-listino`).

---

## 10. La skill si aggiorna da sola, sempre

Quando un giro insegna qualcosa, la skill si aggiorna nello stesso turno, con la data. **Si sostituisce, non si accumula.** La regola nuova va qui; il caso che l'ha generata va in `storia.md`. Ogni buco che il Supervisore trova **piu' di una volta** e' una regola che manca.

---

## 11. Riferimenti

Webhook n8n, base `https://transfer.app.n8n.cloud/webhook/`, tutti in POST, **chiamati in diretta con `curl`** (Make solo come fallback dichiarato), retry x3 con pausa:

| endpoint | uso |
|---|---|
| `wa-chats` / `wa-msg` / `wa-audio` / `wa-doc` / `wa-vedi` / `wa-send` / `wa-read` | WhatsApp dal VPS (sezione 1) |
| `gest-read` | `{"q":"..."}` cerca nel gestionale |
| `gest-write` | `{"rows":[{...}]}` appendOrUpdate sull'Id |
| `str-read` | listini struttura - **espone solo i NETTI**, il lordo sta su Drive |
| `forn-read` | anagrafica fornitori e commissioni |
| `autisti-read` / `autisti-write` | anagrafica autisti: cellulari e stato |
| `boat-read` | tariffe barche |
| `oceania-read` | posta della casella Oceania (barche) |
| `gs-read` / `gs-write` | fogli generici (`docId`, `range`) |
| `excel-read` / `excel-write` | Book 1.xlsx su OneDrive |
| `mail-send` | invio mail col template brand |
| `mail-attach` | estrae un allegato Gmail e lo mette su Drive |
| `ctx-read` / `ctx-write` | scheda viva del contatto - vedi `contesto-contatti` |

Data table: `Messaggi WhatsApp VPS` (`AFcGklrBoUMG0emo`), `Invii WhatsApp VPS` (`qUHAyOTYBErgDz6u`), `Board pending TE` (`OBqLGPmZ2LdSZaB7`), `Contesto contatti TE` (`kyuE6bw4uh3qfnuh`). Progetto n8n `QBb49wu2rmLX0wgk`.
Workflow: `SMISTAMENTO - WhatsApp VPS` (`1VETqPn6pXGt3nyI`), `PONTE - WhatsApp invio` (`tbZY5JAkSddsS0no`), `PONTE - WhatsApp storico` (`oHeoPBeCvtBEBsaB`), `PONTE - WhatsApp VPS` (`oFkUDdsIsXeVhtdj`), `GUARDIA - Allegati WhatsApp` (`rLab1EEoj2RdO4LC`), `PONTE - Contesto contatti` (`MYi1pvoM3f1LEagQ`). `SMISTAMENTO` appende da solo ogni messaggio classificato alla scheda del mittente.

Gestionale: `1nqmt8_4Oy8paHlPU8LTBLEvl-quW0DYgTtmB73nBxPw`, foglio `Prenotazioni NCC 3.0`.
Backup strutture: `1wWn3ZGZR1biuHVevIer5QP3GKZvuDkBf9poUGsZmkyg`, `Foglio1`, Id in colonna X.

Colonne: A Allert · B Hide · C Note · D Data · E Time · F Transfer > Da · G Transfer < Per · H Pax · I Nome · J Fornitori · K Volo · L Autista · M Veicolo · N h extra · O Tariffa · P Acconto · Q % · R Fee · S Stato % · T Sub-appalti · U Netto · V Modalita' · W Show · X Cell. · Y Id · Z WhatsApp · AA Conto.

Skill collegate: `contesto-contatti` (la scheda), `giro-a-due-agenti` (chi fa cosa), `niente-in-sospeso` (il registro numerato), `conferma-gestionale` e `regole-di-casa` (come si scrive), `mail-transfer-experience` (la posta), `cruscotto-html` (il recap HTML), `chi-e-chi` (la rubrica).
