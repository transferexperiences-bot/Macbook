# I casi da cui nascono le regole del check WhatsApp

Questo file **non si legge per lavorare**: per lavorare basta `SKILL.md`. Si apre quando serve
capire *perche'* una regola esiste, quando una regola sembra sbagliata o inutile, o quando si
deve decidere se una regola nuova ne sostituisce una vecchia.

Ogni voce dice: **la data, cosa e' successo, cosa e' costato, quale regola ne e' nata.**

---

## 02/09/2026 — Meeks: il `Time` non e' l'ora del volo
Un servizio e' stato programmato sull'**ora di atterraggio** invece che sull'ora di ritiro.
→ Regola: **`Time` = ora di RITIRO**. Aeroporto = arrivo + 20 minuti, stazione = arrivo + 10
(`SKILL.md` 5-bis).

Stesso giorno: WhatsApp passa dal browser ai **ponti n8n sul VPS**. **L'archivio del VPS parte
da qui**: per il prima non si puo' concludere "non me l'ha mai mandato" (`SKILL.md` 1).

## 04/09/2026 — la chat e' la fonte anche quando lo dice Agostino a voce
→ Regola: quello che conta e' scritto nella chat, non quello che si ricorda di aver sentito.

## 05/09/2026 — si parte dalla tabella, non dai messaggi
Ordine di Agostino: il workflow `SMISTAMENTO` classifica tutto e scrive in `Log WhatsApp`;
quella tabella e' la **prima lettura**, i messaggi sono il double-check (`SKILL.md` 0).

## 08-09/09/2026 — la priorita'
08/09: **preventivi e richieste transfer aprono il recap** e si ricontrollano a ogni giro: sono
la pipeline di vendita. 09/09: **prima le strutture**, che mandano lavoro e aspettano una
risposta operativa. Il 14/09 si infila fra le due i **clienti che devono pagarci**
(`SKILL.md` 3).

## 12/09/2026 — si legge tutto lo storico delle 24 ore
Non l'ultimo messaggio: **tutta** la conversazione toccata nella finestra. E per ogni transfer
prenotato o richiesto nelle 24h si accertano due cose - risposta data, servizio salvato.

## 13/09/2026 — il check non lo fa piu' una testa sola
Nasce il giro a piu' agenti (`giro-a-due-agenti`) e la regola che lo governa: *"tutte le
informazioni devono essere estratte e devono avere un fine"*. Un riassunto nel recap **non e'
un fine** (`SKILL.md` 4).

---

## 14/09/2026 — Coniugi Curry: il PDF mai aperto (costo: clienti a terra)
Gruppo Teixeira, Puglia Concierge. A gestionale il volo **AZ1647 alle 17:30**. Il cliente aveva
anticipato a **15:30**, e il dato viaggiava dentro un PDF (`Toni_60th_Transfer_Schedule.pdf`) e
dentro la foto di una mail. **Il PDF non e' stato aperto ne' confrontato.** L'autista era
programmato per le 17:30: i clienti sono atterrati alle 15:30 **senza nessuno ad aspettarli**.

Perche' era successo: la tabella del workflow **non vede dentro gli allegati** - entrano come
segnaposto `[documento ricevuto: ...]`, il classificatore li giudica su un testo vuoto e li manda
in `IGNORA`.

→ Regole: **zero allegati muti**, col protocollo inventario → lettura → diff voce per voce →
azione → fonte in nota (`SKILL.md` 5). **Gli orari dei servizi delle prossime 24 ore si
riconfermano prima di muovere l'autista** (5-bis). E nasce l'agente **Allegati**.

## 14/09/2026 — Gianfranco Mancini: il recap perso dietro a un "Ok domani"
Prenotazione vera (mer 16/09 h11:30, Le 3 di Tuccino → Aeroporto di Bari, 6 pax, 140 euro)
**persa nel recap** perche' l'ultimo messaggio della chat era *"Ok domani"* e la chat non e'
stata aperta.
→ Regola: **non si triagia dall'ultimo messaggio**. Di ogni chat toccata nelle 24h si legge
tutto lo storico e **ogni servizio estratto diventa una voce numerata** (`SKILL.md` 4).

## 14/09/2026 — Ambrogio: il jid incompleto (HTTP 400)
Un `wa-send` chiamato con le sole cifre invece del jid completo: il ponte risponde **400** e
**non manda niente** - in silenzio, se non si legge la risposta.
→ Regola: `chat` sempre col jid **completo**, e la risposta `{"ok":true,"chi":"<nome>"}` e' la
**prova del destinatario** (`SKILL.md` 8).

## 14/09/2026 — la guardia che ha bloccato i ponti
Una guardia creata di propria iniziativa, ogni 10 minuti, ha messo **416 esecuzioni in coda** e
bloccato i ponti n8n.
→ Regola: **niente infrastruttura di propria iniziativa** - nessun workflow attivo, task
schedulata o guardia ricorrente senza il via di Agostino. L'autonomia riguarda le **azioni**,
non gli automatismi (`SKILL.md` 9).

## 14/09/2026 — l'ordine breve e il formato di casa
Parole di Agostino: *"e' veloce: contatti anagrafica, recap, che servizio c'ha; leggo il
gestionale, vedo il servizio, lo mando"*. Chiedere conferma di dati ricavabili da soli e' tempo
perso.
→ Regole: **un ordine breve si esegue intero**, dentro lo stesso turno (`SKILL.md` 8-bis), e il
**formato a emoji** del recap di un servizio, che da quel giorno non si riduce mai a due righe.

Stesso giorno: **un link non si rimanda se e' gia' in chat**; **si verifica sempre il
destinatario prima di premere invio**; gli allegati utili all'autista vanno **su Drive col link
sulla riga**, dentro la registrazione.

---

## 15/09/2026 — Tivis/Serena: il programma completo rimasto in chat
Un **programma intero** (piu' giorni, piu' tratte, date e orari) mai riassunto e mai registrato:
e' rimasto solo nella conversazione.
→ Regola: **programma completo = righe a gestionale subito, una per tratta**, `Tariffa` vuota se
senza fonte, nota con la provenienza, ogni tratta in `fatti`, voce a registro `<NOME> PROGRAMMA`
coi buchi (`SKILL.md` 4, `contesto-contatti` 5).

## 15/09/2026 — Giuseppe Mancini: gli e' stato richiesto quello che aveva gia' scritto
Aveva scritto in chat **tutti** i dettagli del suo transfer. Gli sono stati richiesti.
→ Regole: nasce l'agente **Contesto** e la **scheda del contatto** (`contesto-contatti`). **Un
dato dichiarato non si richiede**: prima di ogni domanda si controlla scheda, gestionale e
storico 24h; se serve chiedere, **si ripete prima quello che abbiamo gia'**. Il Supervisore segna
**rosso** ogni domanda su un dato gia' dato, anche se il messaggio e' partito (`SKILL.md` 4, 8).

## 15/09/2026 — Puglia Concierge: il PDF nuovo che cambiava il totale
Una nuova versione del programma faceva sparire l'Otranto del 20/10: **totale da 4.000 a 3.400**.
→ Regola: un PDF di programma che cambia il totale **si segnala ad Agostino nel recap prima di
qualunque conferma scritta** (`SKILL.md` 5).

## 15/09/2026 — Tracie e PC8_DAY1: due agenti sulla stessa riga
Due `gest-write` dello Scrittore hanno **sostituito la `Note`** e perso i link Drive appena messi
dall'agente Allegati: chi scrive da uno snapshot letto mezz'ora prima cancella il lavoro
dell'altro.
→ Regola: **la riga si rilegge un attimo prima di scriverla**, si cambia **solo il campo che
serve**, la `Note` si integra in coda a quella appena riletta (`SKILL.md` 6).

## 15/09/2026 — prima n8n, Make solo come fallback
I webhook n8n chiamati in diretta con `curl` sono molto piu' veloci e leggeri del tool Make.
→ Regola: Make **solo** quando n8n non e' disponibile, e sempre dichiarato nel verbale. Un ponte
lento **non** e' un ponte giu' (`SKILL.md` 1).

Stesso giorno: **barche e noleggio auto si rispondono in automatico** (eccezioni (g) e (h)); nella
colonna **`T` ci va anche il costo** del sub-appalto; quando un servizio salta, il messaggio dice
**tre cose** e non fa mai pesare la disdetta.

---

## Senza data — i casi che restano utili

**Terramossa: il rientro creato e cancellato.** Un rientro comunicato da un autista in chat,
creato subito, e cancellato mezz'ora dopo perche' lo eseguiva **Puglia Mare**.
→ Regola: davanti a un servizio che non c'e', la domanda non e' *esiste?* ma **chi lo esegue?**
Il segnale e' **chi ha detto si'** (`SKILL.md` 4).

**I due falsi allarmi di una mattina.** Un cliente dichiarato in attesa da due giorni mentre la
sua conferma era scritta **nelle note della riga**; degli orari segnalati tre volte come mancanti
quando erano **gia' partiti per mail**.
→ Regola: prima di dire che qualcuno e' fermo, **tre controlli** - posta inviata, chat intera,
note della riga. Se anche uno solo dice che abbiamo risposto, non e' fermo (`SKILL.md` 6-bis).

**Le commissioni lette il 30/08/2026.** Auraterrae 26% · Antico Mondo 20% · Mancini Rent 20% ·
Puglia Concierge 20% · Talea/Peschiera 9% · Cala Ponte 0% · Sparano 0% · Longo -10%. Restano
valori **letti**, non memorizzati: la fonte e' sempre `forn-read`.

**I prezzi verificati il 09/09/2026.** Sparano APT↔Palace = 45 · Tuo Hotel Polignano → APT Bari =
120 · Cala Ponte ↔ APT Bari = 95. Usabili senza inventare; tutto il resto si chiede.
