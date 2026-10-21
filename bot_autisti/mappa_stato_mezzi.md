# Mappa completa — Bot "stato mezzi" e Recap Flotta

Analisi in sola lettura del 20/10/2026 (n8n Cloud `transfer.app.n8n.cloud`). Nessuna modifica, nessuna esecuzione, nessun messaggio inviato.
I token dei bot sono sostituiti con `<TOKEN>`. Le prove di esecuzione citate sono `1651635` (check-out reale, Giuseppe Giannuzzi) e `1650234` (check-in da GPS, Katiuscia Secondo).

---

## 0. Inventario

| Workflow | Id | Stato | Versione pubblicata = bozza? | Nodi | Ultima modifica |
|---|---|---|---|---|---|
| Agent per stato mezzi | `1nYLxSv2CBp2CH91N_5e8` | **attivo** | sì (`bbbadeda…`) | 57 | 01/08/2026 |
| RECAP FLOTTA — 1 MESSAGGIO PER MEZZO (COMPATTO) | `kli_MnGmT939Yu9wzeV1_` | **attivo** | sì (`82f3ded5…`) | 13 | 08/05/2026 |
| GESTIONE (sub-workflow, è lui che scrive) | `L-cka8OWvRKyIGeMm2uB3` | attivo | sì (`776513cd…`) | 51 | 04/07/2026 |
| LOGS (sub-workflow, discrepanze al check-in) | `3t4aZNqWPC948Lh30BY2Q` | attivo | sì | 7 | 08/05/2026 |
| [Autisti v7] MASTER Bot Stato Mezzi | `NtZR7DEcuJ977qWA` | inattivo, mai pubblicato | — | 27 | 10/05/2026 |
| [Autisti v7] SUB Check-in Mezzo | `1OX0GGMMyxf53iya` | inattivo, mai pubblicato | — | 8 | 10/05/2026 |

GESTIONE e LOGS non erano nella richiesta, ma li ho letti: senza di loro la sezione «salvataggi» sarebbe vuota. L'agente infatti scrive solo nella data table; tutto lo stato dei mezzi viene scritto da GESTIONE.

### Esecuzioni dal 01/10/2026

n8n conserva le esecuzioni solo per pochi giorni: la più vecchia visibile è del **18/10 alle 11:57 UTC**. I conteggi coprono quindi circa 2,5 giorni, non tutto il mese.

| Workflow | Esecuzioni visibili | Dettaglio |
|---|---|---|
| Agent per stato mezzi | **373** (372 riuscite, 1 errore) | **17** sono messaggi Telegram degli autisti (modalità `webhook`: 10 il 18/10, 7 il 20/10). **356** sono letture Gmail del tracker GPS (modalità `trigger`, una al minuto quando arriva una mail Moox). Di queste la maggior parte finisce in 0,05 s (mail scartata) o in circa 2 s (nessun autista o check-in già fatto). Quelle da 8–15 s hanno fatto parlare l'agente con l'autista. L'unico errore (`1650234`, 20/10 10:58) è un *task runner timeout* del nodo Code: il record del check-in era già stato creato, ma il messaggio all'autista non è partito. |
| RECAP FLOTTA | **3** (tutte riuscite) | 18, 19 e 20/10 alle 19:00 UTC, cioè le 21:00 ora italiana. Una al giorno, come previsto. |

### Documenti e tabelle coinvolti

| Nome | Id | Fogli / colonne usati |
|---|---|---|
| **Template_Controllo_Flotta** (chiamato anche «Controllo Flotta») | `1HP5USWqhYEnbbdyrZNuhHpHZpu6dnq2uQwlSJr7Hr0g` | Un foglio **per mezzo**, con il nome «Modello Targa» (es. `Maserati GR941TP`) e colonne `Sezione / Parametro / Valore / Note`. Poi `MEZZI_DASH` (gid 1141260862) e `LOG_EVENTI` (gid 577799347). |
| **Scadenziario** | `1cnIIOEFLeZWASBS6xPwAgU6vp2-kPgzWGlBWi44TzhI` | `Revisioni` (gid 1288183938): Targa, Azienda, Mezzo, Pagato, Scaduto, Scadenza, Data pagamento |
| **Programma Autisti 2.0** = stesso file del gestionale `Prenotazioni NCC 3.0` | `1nqmt8_4Oy8paHlPU8LTBLEvl-quW0DYgTtmB73nBxPw` | `Veicoli` (gid 329641120), `Telegram` (gid 1844093658, rubrica), `Prenotazioni NCC 3.0` (gid 40389397). Nei workflow attivi è **solo letto**. |
| **Check list** | `1z77zMyUch9s9Hx5yH7NoomHDYkZqTo_yPhpGAW34MrI` | `Fogli di viaggio` (gid 1477457448): Veicolo, Data, Autista, **Km fine** |
| Data table **«Stato mezzi»** | `OlwHKvNVJmnY8B7p` (progetto `QBb49wu2rmLX0wgk`) | id, Chatid, Autista, Mezzo, Checkin (SI/NO), Checkout (SI/NO), Data (yyyy-MM-dd), createdAt, updatedAt |
| Google Drive | 60 cartelle, una per mezzo × categoria (id fissi nel codice, nodo «Code in JavaScript5» di GESTIONE) | La cartella di riserva è `1hQLFT4GHOM18lQFZHrTT6mPgqENxz4X5` |
| Recap spese (solo v7, inattivo) | `1nrdVXL4REiuXvzGw7nOwnDAtk9t4-cKYDOlccCZ-Kds` | `Foglio1` |

---

## A. «Agent per stato mezzi» (`1nYLxSv2CBp2CH91N_5e8`)

### A1. Trigger e chi lo usa

1. **Telegram Trigger1**: riceve `message` e `callback_query` dal bot **@statomezzi_bot** (credenziale «stato mezzi», id `lwC3mQxR60dU7xkI`). Non c'è filtro sulle chat: chiunque scriva al bot entra. Lo usano gli autisti; nelle prove compaiono Giuseppe Giannuzzi (chat 8265769488) e Katiuscia Secondo (490075541).
2. **Gmail Trigger (GPS Tracker)**: legge la casella «Transfer» ogni minuto e prende solo le mail da `noreply@moox.it`. Il nodo «Estrai mezzo da email» cerca la frase `Notifica <Mezzo> ACCENSIONE INSERITA` e scarta le altre (anche DISINSERITA).
   - «Cerca autista oggi» legge `Prenotazioni NCC 3.0`, filtrando `Data` = oggi nel formato `"mar 20 ottobre 2026"`.
   - «Code in JavaScript1» sceglie la riga con quel `Veicolo`. Se le righe sono più di una, prende quella con l'orario `Time` più vicino all'ora della mail.
   - «Leggi rubrica Telegram» e «Recupera chat_id» trovano il `chat id` (o il `gruppo id`) dell'autista nella rubrica.
   - «Get row(s)» legge la data table con chiave `Data` = oggi + `Chatid` + `Mezzo`. «If» lascia passare solo se `Checkin ≠ "SI"`.
   - «Costruisci payload Telegram» crea un **finto messaggio Telegram** con il testo `"Prendo il <Veicolo>"`. Il messaggio rientra nel Normalizer, quindi l'agente apre il check-in di sua iniziativa nella chat dell'autista.
   - Se manca il chat_id, parte «Alert chat_id mancante», un messaggio Telegram a 522233722.

### A2. Cosa riceve e come va il dialogo

**Pre-elaborazione dei messaggi** (dal Normalizer allo Switch):

| Tipo di messaggio | Cosa succede |
|---|---|
| testo | Cancella il messaggio con `message_id − 1` (cioè il messaggio precedente del bot), poi il testo passa all'agente |
| bottone (callback) | Cancella il messaggio che aveva i bottoni; il `callback_data` diventa il testo |
| foto | Download, «Edit Image (optional)» (`composite` senza parametri), poi **GPT-4o Vision**. Il prompt riconosce 5 casi: pneumatici, carrozzeria, carburante (conteggio tacchette), pulizia, meccanica/spie. Il `file_id` della foto passa all'agente come `Immage_id`. |
| vocale / audio | Download e trascrizione OpenAI (senza lingua impostata) |
| documento | vCard: estrazione testo. PDF: CloudConvert in JPG, poi GPT-4o Vision |
| contatto | Testo «Nome contatto / Telefono» |
| altro (`unknown`) | Lo Switch non ha un'uscita, il messaggio si perde |

Il nome dell'autista si ricava da `first_name + last_name` di Telegram e si confronta con un elenco fisso di 24 nomi più alcuni alias. Se il nome non è nell'elenco, si usa così com'è.

**Dialogo**: tutto il flusso sta nel prompt di sistema «ASSISTENTE STATO MEZZI v7». Il codice non impone nessun passaggio.

- **A. Saluto**: risponde con il menu «prendo mezzo / segnalo / fine servizio».
- **B. Check-in («prendo X»)**:
  1. Se manca il mezzo, chiama *Match mezzi* (foglio `Veicoli`) e mostra un bottone per mezzo, con `callback_data = mezzo_<TARGA>`.
  2. Legge la scheda con *Leggi Stato Mezzo* e mostra il recap: 🚗💥 Carrozzeria, 🛞 Pneumatici, 🧼 Pulizia interno ed esterno, ⛽ Carburante, 🎫 Tessera APT, ⚠️ Spie attive.
  3. Mostra i bottoni `checkin_confermo` / `checkin_annulla`.
  4. Il record nella data table lo crea e aggiorna il modello con *Cerca* e *Aggiorna*: prima con `Checkin=NO`, poi `SI` dopo la conferma.
- **C. Segnalazione durante il turno**: l'agente cerca categoria + mezzo + dato, chiede una cosa alla volta e poi chiama GESTIONE una volta.
- **D. Check-out («fine servizio»)**: cinque domande, una per messaggio:
  - 🔧 Meccanico/carrozziere oggi? (`meccanico_si/no`)
  - ⚠️ Anomalie? (`anomalie_si/no`, poi `cat_carrozzeria|cat_meccanica|cat_pneumatici`)
  - ⛽ Carburante (`carb_4_4 | carb_3_4 | carb_2_4 | carb_1_4`)
  - 🧹 Pulizia: in un punto il prompt chiede «Pulito | Sporco | Molto sporco». La sezione «2 SLOT» invece chiede interno ed esterno su 4 livelli (`pul_int_* / pul_ext_*`: pulito, normale, sporco, molto_sporco).
  - 🎫 Tessera APT (`tess_50plus | tess_20_50 | tess_10_20 | tess_lt10 | tess_vuota`)

  Alla fine chiama GESTIONE una volta per categoria (Carburante, Pulizia e Tessera sempre; Meccanica e anomalia solo se l'autista ha risposto sì).
- **Cosa NON si raccoglie**: i **km** (regola 1: «NON chiedere MAI i km», vengono dai fogli di viaggio Jotform), le gomme come domanda fissa, i documenti di bordo, le foto obbligatorie.
- **Revisione**: con i tool *Cerca revisione* e *Aggiorna revisione* l'autista può dire quando ha fatto o pagato la revisione.
- **Bottoni**: li **scrive il modello** in JSON `{text, buttons}`. «Code in JavaScript» li converte in `inline_keyboard`. Il limite di 64 byte del `callback_data` non viene controllato. I 5 nodi con bottoni fissi (`Send btn meccanico/anomalie/carburante/pulizia/tessera`) e il loro Switch sono **disattivati**.

### A3. Salvataggi fatti direttamente dall'agente

| Nodo | Dove | Operazione | Chiave | Colonne scritte |
|---|---|---|---|---|
| **Aggiorna** (tool) | data table «Stato mezzi» | `upsert` | `Id_number` = `$fromAI` (se vuoto, crea un record nuovo) | `Autista` = nome normalizzato da Telegram, `Chatid` = chat_id, `Mezzo` = `$fromAI('Id_Mezzo')`, `Checkin` = `$fromAI('Stato_Checkin')`, `Checkout` = `$fromAI('Stato_Checkout')`, `Data` = oggi |
| **Aggiorna revisione** (tool) | Scadenziario › Revisioni | **`appendOrUpdate`** | `Mezzo` | `Mezzo` = `$fromAI('Id_Mezzo')`, **`Pagato`** = data «normalizzata al 1° del mese» scritta dal modello, `Data pagamento` = data effettiva scritta dal modello |

Problemi da segnalare:
- **Aggiorna**: tutti i `$fromAI` sono senza default, quindi obbligatori. Il record viene creato a ogni accensione GPS: nella prova `1650234` ci sono **due record** (id 2009 e 2013) per lo stesso autista, mezzo e giorno. L'Id da aggiornare lo trascrive il modello.
- **Aggiorna revisione**: è un `appendOrUpdate` su `Mezzo` con un valore scritto dal modello. Se il nome non coincide esattamente con la riga esistente, **viene aggiunta una riga nuova**. La data va nella colonna `Pagato`, mentre `Scaduto` (che il Recap legge) **non viene mai scritta**. Tutte le date sono prodotte dal modello.

### A4. Letture

| Nodo | Documento / foglio | Filtro |
|---|---|---|
| Match mezzi (tool) | Programma Autisti 2.0 › Veicoli | nessuno (tutta la flotta) |
| Leggi Stato Mezzo (tool) | Template_Controllo_Flotta › foglio `$fromAI('Id_Mezzo')` | nessuno: il nome del foglio lo sceglie il modello |
| Cerca (tool) | data table Stato mezzi | `Data` = oggi, `Autista` = nome Telegram normalizzato |
| Cerca revisione (tool) | Scadenziario › Revisioni | `Mezzo` = `$fromAI` |
| Cerca autista oggi | gestionale › Prenotazioni NCC 3.0 | `Data` = oggi (stringa italiana) |
| Leggi rubrica Telegram | gestionale › Telegram | tutto il foglio |
| Get row(s) | data table Stato mezzi | Data + Chatid + Mezzo |

### A5. Modelli e memoria

- Agente principale: **OpenAI gpt-5.2** («OpenAI Chat Model4»).
- Strumenti: Calculator, Match mezzi, Leggi Stato Mezzo, Cerca, Aggiorna, Cerca/Aggiorna revisione, GESTIONE, Logs.
- Memoria: **Simple Memory** (finestra in RAM), con chiave di sessione `chat_id`. Si azzera a ogni riavvio dell'istanza. È anche l'unico posto dove si tengono le risposte del check-out fra un messaggio e l'altro.
- Vision foto e PDF: GPT-4o. Trascrizione vocali: OpenAI audio.

### A6. Messaggi in uscita

| Nodo | A chi | Contenuto |
|---|---|---|
| Send Telegram (dynamic) — HTTP `POST https://api.telegram.org/bot<TOKEN>/sendMessage` | l'autista (`ChatId`) | testo dell'agente + `reply_markup`. L'uscita di errore porta al nodo successivo. |
| Avvisa Agostino (autista non raggiungibile) — HTTP `…/bot<TOKEN>/sendMessage` | 522233722 | «⚠️ CHECK-IN MEZZO NON CONSEGNATO … deve aprire @statomezzi_bot e premere Avvia» |
| Alert chat_id mancante (nodo Telegram) | 522233722 | «ATTENZIONE chat_id mancante … Aggiungi il chat_id nella rubrica Telegram» |
| Delete prev bot / Delete Message | chat dell'autista | cancellazione di messaggi del bot |
| Send a text message + 5× Send btn | — | **disattivati** |

Il token del bot è scritto **in chiaro** negli URL dei due nodi HTTP (qui redatto).

---

## B. GESTIONE (`L-cka8OWvRKyIGeMm2uB3`): tutti i salvataggi dello stato

### B1. Come lavora

- **Ingresso**: un JSON passato dall'agente (sono 25 campi `$fromAI`, **tutti senza default**, quindi tutti obbligatori), oppure da LOGS.
- **Parse Input** normalizza la `Categoria`. Una categoria non riconosciuta **diventa `PNEUMATICI`**. Il prompt dell'agente parla di «TesseraAPT», che non è valida; la descrizione del tool dice invece «TESSERA_APT». Nella prova reale il modello ha usato quella giusta.
- **Get Km Attuali**: legge Check list › Fogli di viaggio con filtro `Veicolo` = Id_Mezzo. «Trova Km» prende il `Km fine` della data più recente. **I km del mezzo vengono solo da qui.**
- **Switch Categoria** apre uno di 5 sotto-agenti **gpt-4.1** (Pneumatici, Carrozzeria, Meccanica, Pulizia, Carburante). Ognuno ha il tool `get_scheda`, che legge il foglio del mezzo. La Tessera passa invece da un nodo Code.
- Ogni ramo ha poi un Code che normalizza il risultato.
- **Leggi Scheda Mezzo**, poi **Normalizza Spie (AI)** (gpt-4o), poi **Ricalcola percentuali** (codice). Quest'ultimo calcola tutte le percentuali di gomme, tagliando e pastiglie dai km, e la lista spie con stati `[ATTIVA]` / `[VERIFICA]`.
- **Parse Agent Output**, poi in parallelo:
  - Prepara Righe Scheda → **Update Scheda Mezzo** → Leggi Scheda Mezzo1 → Prepara Dashboard1 → **Update Dashboard2**
  - If Ha Immagine → Get File Telegram → **Upload Google Drive** → Calcola Punteggio → **Append LOG_EVENTI** → Get Rows LOG oggi → **Message a model** (gpt-4o, deduplicatore) → **Delete rows** → **Append row**
- In GESTIONE non c'è nessun `onError`, tranne sul Delete.

### B2. Salvataggi

**1) Update Scheda Mezzo**

- Dove: Template_Controllo_Flotta › foglio `<Id_Mezzo>`.
- Operazione: **`appendOrUpdate`**, chiave **`Parametro`**. Colonne: `Sezione`, `Parametro`, `Valore`, `Note`.
- Se un Parametro manca nel foglio, la riga viene **aggiunta**. Se il nome del foglio (scritto dal modello) è sbagliato, il nodo va in errore.

Righe scritte per categoria (il Valore in corsivo è prodotto da LLM o derivato da LLM):

| Categoria | Sezione | Parametro → Valore (Note) |
|---|---|---|
| sempre | Anagrafica | `Km attuali` → km arrotondati (dai fogli di viaggio); `Ultimo autista` → nome («gg/mm/aaaa — N km») |
| PNEUMATICI | PNEUMATICI | `Data ultimo aggiornamento PNEUMATICI` → oggi (firma autista o testo discrepanza) · `Vita stimata gomme ANT (km)` *(letto dall'LLM, default 35000)* · `Vita stimata gomme POST (km)` *(50000)* · `Km max tra inversioni gomme` *(12000)* · `Ant. Km cambio gomme (auto)` / `Post. Km cambio gomme (auto)` → **km letti o estratti dall'LLM** («Cambio gg/mm») · `Ant./Post. Km percorsi da cambio` · `Ant DX`, `Ant SX`, `Post DX`, `Post SX` → «xx,x%» (nota sul danno) · `% MEDIA 4 gomme (per dashboard)` · `Km ultima inversione gomme` *(LLM)* · `Km percorsi da inversione` · `Inversione consigliata` → «🔄 SI» / «✅ NO»; più, se cambiano, `MANUTENZIONE › Spie/Diagnosi` |
| CARROZZERIA | CARROZZERIA | `Data ultimo aggiornamento CARROZZERIA` · `Anteriore`, `Posteriore`, `Lato DX`, `Lato SX`, `Tetto` → *stato scelto dall'LLM* (OK / Graffio / Ammaccatura / Rottura …) con note. L'LLM riscrive **tutte e 5** le zone. |
| MECCANICA | MANUTENZIONE | `Data ultimo aggiornamento MANUTENZIONE` · `Km ultimo tagliando` *(LLM)* · `Km max tra tagliandi` (15000) · `Km percorsi da tagliando` · `% residua tagliando` · `Km ultimo cambio pastiglie ANT/POST` *(LLM)* · `Km max tra cambi pastiglie ANT/POST` (30000 / 50000) · `Km percorsi da cambio pastiglie ANT/POST` · `% residua pastiglie ANT/POST` · **`Spie/Diagnosi`** → es. «🔴 Olio motore [ATTIVA] \| 🟡 AdBlue [VERIFICA]» *(da LLM)* · `Riepilogo manutenzione` → «✅ OK» / «⚠️ …» / «🚫 FERMO - …» |
| PULIZIA | PULIZIA | `Data ultimo aggiornamento PULIZIA` · `Interni`, `Esterni` → *OK / Sporco / Molto sporco (LLM)* |
| CARBURANTE | CARBURANTE | Solo `Data ultimo aggiornamento CARBURANTE` → oggi. **Il livello finisce nella colonna Note** («🟢 Pieno - Giuseppe Giannuzzi»). Non esiste una riga «Livello». |
| TESSERA_APT | TESSERA APT | `TESSERA APT` → «€» + valore della scelta (es. «€50plus», «€vuota»); nota «Aggiornato da … - gg/mm» |
| tutte le categorie tranne PNEUMATICI / MECCANICA | — | Ricalcolo: Pneumatici (km percorsi, **Ant DX = Ant SX = % dell'asse**, Post idem, media, inversione) e Meccanica (km, %, riepilogo, spie) |

**2) Update Dashboard2**

- Dove: Template_Controllo_Flotta › `MEZZI_DASH`.
- Operazione: **`appendOrUpdate`**, chiave **`Mezzo_Nome`**, modalità auto-map.
- Colonne:
  - `Mezzo_Nome` = Id_Mezzo
  - `Ultimo check` = «gg/mm/aaaa hh:mm» (ora di Roma)
  - `Km attuali`
  - `Pneumatici ` (con spazio finale nel nome) = «🟢 85,3%» (+ «\| 🔄»)
  - `Carrozzeria` = «✅ OK» / «⚠️ Ant: Graffio, …»
  - `Meccanica` = «🟢 Tag:..% \| P.Ant:..% \| P.Post:..%» oppure il riepilogo
  - `Pulizia` = «✅ OK» / «⚠️ Int: Sporco / Est: …»
  - `Carburante` = «🟢 Pieno / 🟡 1/2 / 🟠 1/4 / 🔴 Riserva»
  - `Tessera APT` = «🟢 €50» … oppure il testo
  - `Spie`
  - `Note` = elenco dei problemi o «✅ OK»
- Se un mezzo nuovo non ha ancora la riga, viene aggiunta.

**3) Upload Google Drive** (solo se c'è una foto)

- Il file arriva da Telegram tramite `Immageid`, un `$fromAI`: **il file_id lo ricopia il modello**.
- Nome del file: `<Modello>_<CATEGORIA>_yyyyMMdd_HHmmss`.
- Cartella: una delle 60 cartelle fisse. Il link `webViewLink` va in `Link_Risorse`.

**4) Append LOG_EVENTI**

- Dove: Template_Controllo_Flotta › `LOG_EVENTI`.
- Operazione: **`append`**.
- Colonne:
  - `DataOra` = gg/mm/aaaa hh:mm
  - `Autista`
  - `Mezzo` = Id_Mezzo
  - `Tipo_Evento` = «Segnalazione pneumatici/carrozzeria/meccanica», «Stato pulizia», «Rifornimento» o «Tessera APT»
  - `Esito` = Recap
  - `Dettagli` = Note_Intervento / Descrizione
  - `Link_Risorse`
  - `Punteggio` = 0 oppure −5 / −10 / −15 (−5 in più se il mezzo non è marciabile)
  - `Motivo_Punteggio`

**5) Delete rows (cancellazione vera!)**

- Dove: `LOG_EVENTI`.
- Operazione: **`delete`**, `startIndex` = numeri di riga **scelti da gpt-4o** («Message a model» confronta tutte le righe di oggi e decide quali sono «duplicati semantici»). Il nodo ha `onError: continue`.

**6) Append row in sheet1**

- Dove: `LOG_EVENTI`.
- Operazione: **`append`** della «riga consolidata» **scritta da gpt-4o**: DataOra, Autista, Mezzo, Tipo_Evento, Esito, Dettagli (concatenati), Link_Risorse, Punteggio («il più negativo»), Motivo_Punteggio.

### B3. Letture di GESTIONE

- Check list › Fogli di viaggio (Veicolo).
- Foglio del mezzo, tre volte: i tool degli agenti, Leggi Scheda Mezzo, Leggi Scheda Mezzo1.
- `LOG_EVENTI` intero (per il deduplicatore).
- Il file della foto da Telegram.

---

## C. LOGS (`3t4aZNqWPC948Lh30BY2Q`)

- **Chiamato dal tool «Logs»** dell'agente. L'unico input è `$fromAI('query', '', 'string')`, senza default. Il prompt di sistema dell'agente **non cita mai** questo tool.
- Cosa fa: legge Fogli di viaggio e trova come «Last Driver» il primo autista diverso da quello attuale. Poi chiama GESTIONE (che scrive scheda, dashboard e log come sopra) e calcola una penalità per il guidatore precedente: −5 lieve, −10 moderata, −15 grave, −5 in più se il mezzo è fermo.
- Salvataggio: **Append LOG_EVENTI** (Template_Controllo_Flotta). Colonne: DataOra, Autista = **autista precedente**, Mezzo = Modello, Tipo_Evento = «Discrepanza <CAT> (check-in)», Esito = «Punteggio negativo», Dettagli, Link_Risorse vuoto, Punteggio, Motivo_Punteggio.
- Risultato: ogni discrepanza genera **due righe** di log (una di GESTIONE, una di LOGS), che poi il deduplicatore può cancellare.

---

## D. RECAP FLOTTA (`kli_MnGmT939Yu9wzeV1_`)

### D1. Trigger, destinatari, frequenza

- Trigger attivo: **«Ogni giorno alle »**, cron `0 21 * * *`, ora di Roma (in esecuzione risulta 19:00 UTC).
- Destinatario: **un solo messaggio** Telegram dal bot «stato mezzi» alla chat **522233722**, senza `parse_mode`. Gli `**` del ramo spento comparirebbero come testo.
- Il nome «1 messaggio per mezzo» è falso: il ramo attivo manda **un messaggio unico**, tagliato a 4096 caratteri.
- Il ramo «Ogni giorno alle 1», con 10 mezzi scritti nel codice e un ciclo che legge le schede, è **disattivato**: è codice morto.

### D2. Cosa calcola per ogni mezzo (ramo attivo)

- Letture:
  - `Leggi Revisione1`: Scadenziario › Revisioni, tutto il foglio, `alwaysOutputData` + `onError` continue.
  - `Leggi Scheda1`: Template_Controllo_Flotta › **MEZZI_DASH**, eseguito una volta, senza `onError`.
- Una riga di MEZZI_DASH = un mezzo, con:
  - **km** = `Km attuali`
  - **Revisione**: la targa viene estratta da `Mezzo_Nome` con un'espressione regolare e confrontata con `Targa` (senza spazi). Il campo `Scaduto` («febbraio 2027») è letto come **data di scadenza**, cioè fine di quel mese. Esiti: < 0 giorni 🔴 SCADUTA, ≤ 30 🟠 URGENTE, ≤ 90 🟡 Prossima, altrimenti ✅ OK.
  - **Pneumatici / Carrozzeria / Pulizia / Carburante / Manutenzione**: prende l'emoji dalla colonna corrispondente di MEZZI_DASH. Se `Ultimo check` è vuoto, scrive «⚠️ Da controllare». Manutenzione 🔴 se compare 🚫, FERMO, ⚠️ o SCADUTE.
  - **Tessera APT**: mostrata se diversa da «⚪ N/D».
- Fondo del messaggio: totale mezzi, Urgenti, Attenzione, OK, Da controllare.

### D3. Punti deboli del Recap

- **Il colore del mezzo è quasi sempre sbagliato.** `stati.includes('🔴')` cerca un elemento **uguale** a «🔴», ma lo stato della revisione è «🔴 SCADUTA». Una revisione scaduta quindi non rende rosso il mezzo. Inoltre «✅ OK» non è uguale a «✅», quindi nessun mezzo con revisione in regola diventa mai ✅. Quasi tutti risultano ⚠️ e vengono contati come «Attenzione».
- La colonna `Scaduto` ha due significati. Il tool «Cerca revisione» la descrive come «data dell'**ultima** revisione», il Recap la usa come **scadenza**. Se contiene una data gg/mm/aaaa invece di «mese anno», il Recap mostra «✅ OK» senza fare nessun calcolo.
- Pulizia e carburante non pesano sul colore del mezzo.
- Non legge il foglio dei singoli mezzi: si fida di MEZZI_DASH, che a sua volta viene riscritto da GESTIONE con i problemi descritti sotto.

---

## E. Versione v7 (inattiva, solo come riferimento)

**MASTER `NtZR7DEcuJ977qWA`**:
- Trigger Telegram con la **stessa credenziale «stato mezzi»** ma limitato alla chat 522233722 (era una prova).
- Foto → **Claude Sonnet 4.5** Vision; vocali → Whisper (it).
- Conferma con parole («si», «ok», «salva», «no», «rifai»), non con bottoni. La pratica in sospeso sta nel gestionale, foglio `Conversazione_Stato` (`pending_id`, status, area, `dati_json`, autista, mezzo, targa).
- Con la conferma:
  - area `anomalia`: GESTIONE con `Categoria = macro`. Attenzione: non `TESSERA_APT` e simili, quindi rischio di finire nel default PNEUMATICI.
  - area `rendicontazione`: **append** nel Recap `1nrdVXL4…` › Foglio1 (Data, Autista, Mezzo, Tipologia, **Litri**, Descrizione, **€**, Foto1, Foto2, Paste = TRUE), con valori presi da `dati_json` generato dall'LLM.
  - area `check_out`: **append** in LOG_EVENTI.
  - poi `update` su Conversazione_Stato (chiave `pending_id`).
- Il resto va al «SUB Router» `tXtV48TcEbh3L42F` (non letto) e legge `Check_In_Sessione`.
- **Se venisse attivato toglierebbe il webhook al bot attivo**: Telegram ammette un solo webhook per bot.

**SUB Check-in `1OX0GGMMyxf53iya`**:
- Legge il Recap › Foglio1, ultime 5 annotazioni del mezzo, e costruisce il testo di recap.
- **Append** in gestionale › `Check_In_Sessione`: chat_id, autista, data, mezzo, targa, aperto_at, stato = «aperta», più colonne vuote (rifornimento_finale, pulizia_esterna_finale, pulizia_interna_finale, ore_jotform, ore_dichiarate, ore_discrepanza, ore_nota, contanti_dichiarati, recap_id, note).
- Ha un'idea buona da riprendere: la **sessione check-in come riga con campi finali** (rifornimento, pulizia interna ed esterna).

---

## F. Punti deboli e parti morte

### Salvataggi che si perdono o risultano falsi

1. **Il check-out viene dichiarato prima dei salvataggi.** Nella prova `1651635` il tool *Aggiorna* mette `Checkout = SI` all'inizio. Dopo partono 3 GESTIONE **in parallelo** (carburante, pulizia, tessera), ciascuno di circa 85 s. Se uno fallisce, il check-out resta comunque «fatto». La risposta «✅ Check-out completato» la scrive il modello.
2. **Scritture in parallelo sullo stesso foglio e sulla stessa riga di MEZZI_DASH.** Ogni ramo legge la scheda prima che gli altri abbiano scritto e riscrive la dashboard intera: vince l'ultimo. Nella prova, carburante ha restituito «🟢 Pieno», mentre pulizia e tessera hanno restituito «🟢 3/4» (il valore vecchio).
3. **Il saldo della Tessera APT si perde.** Il bottone manda `vuota` / `50plus` / `20_50`… mentre il codice si aspetta un numero. Nella scheda finisce «€vuota» o «€50plus»; nella prova la dashboard mostra «€». Nel LOG il Recap della tessera è sempre «🔴 Critico» (`"50plus" >= 50` è falso).
4. **La pulizia su 4 livelli interno/esterno si perde.** Il sotto-agente Pulizia riceve solo `Stato_Pulizia` (deprecato, vuoto) e conosce 3 stati (OK / Sporco / Molto sporco): il livello «normale» non esiste.
5. **I litri e l'importo non arrivano mai.** Il prompt dice «passa i Litri esatti», ma GESTIONE non ha campi Litri, Importo o Tipo_Carburante (Parse Input non li inoltra). Il livello carburante viene salvato **solo nelle Note** della riga data.
6. **Le penalità non partono mai da GESTIONE.** L'agente passa `Imputabile` come stringa «false» / «true», ma Parse Input controlla `=== true` (booleano), quindi il punteggio è sempre 0. In più `Gravita` = «media» (valore dell'agente) non esiste in GESTIONE e LOGS, che usano «moderata»: diventa «leggera».
7. **Una categoria scritta male diventa PNEUMATICI.** In quel caso il sotto-agente gomme può riscrivere i km di cambio gomme.

### Cancellazioni e numeri prodotti dal modello

8. **Cancellazione vera in LOG_EVENTI decisa da gpt-4o**: numeri di riga scelti dal modello, poi un append della riga «consolidata» scritta dal modello. Viola la regola della cancellazione morbida. Se i numeri di riga sono sbagliati, si perdono righe di altri mezzi.
9. **`appendOrUpdate` su chiavi che possono non esistere:**
   - Revisioni su `Mezzo` (valore scritto dal modello)
   - schede mezzo su `Parametro`
   - MEZZI_DASH su `Mezzo_Nome`

   Se il nome non coincide, si creano righe doppie o nuove.
10. **Numeri prodotti da LLM che finiscono nei fogli:**
    - km di cambio gomme, inversione, tagliando e pastiglie (letti o «estratti dalla descrizione» dal modello)
    - date della revisione
    - stato delle 5 zone di carrozzeria (l'LLM riscrive anche quelle non segnalate)
    - lista spie (gpt-4o «Normalizza Spie» rilegge e riscrive tutta la lista). Nella prova un *graffio al paraurti* è finito in `Spie` e in `Meccanica` come spia gialla.

    Se il normalizzatore fallisce nel ramo MECCANICA, `Spie/Diagnosi` può tornare «✅ OK».
11. **I danni delle singole gomme vengono cancellati.** Per tutte le categorie diverse da PNEUMATICI, il ricalcolo scrive Ant DX = Ant SX = % dell'asse (stessa cosa per il posteriore), quindi un danno su una sola gomma sparisce.
12. **Id copiati dal modello:**
    - `Id_number` della data table
    - `Id_Mezzo`, che decide il **nome del foglio** da leggere e scrivere
    - `Immageid` (file_id Telegram)
13. **Km poco affidabili.** Vengono dall'ultimo `Km fine` dei fogli di viaggio con `Veicolo` uguale esattamente all'Id_Mezzo. Nella prova la Maserati risulta a **946.095 km**, quasi certamente un refuso del foglio, e tutte le percentuali di usura derivano da lì.

### Trappole n8n (da CLAUDE.md)

14. Tutti i `$fromAI` di GESTIONE (25), di Aggiorna (4), di Logs e di Leggi Stato Mezzo sono **senza default**: se il modello ne omette uno, salta l'intero turno.
15. In GESTIONE e LOGS non c'è nessun `onError` sui nodi che scrivono.
16. Il token del bot è in chiaro in 2 nodi HTTP.

### Comportamenti strani

17. **Il messaggio GPS si ripete a ogni accensione** finché il check-in non è confermato, e ogni volta crea un record nuovo nella data table (doppioni 2009 e 2013).
18. **Un autista può avere due identità.** Dal percorso GPS il nome viene dalla rubrica («Katiuscia Secondo»), dal percorso Telegram dal profilo Telegram (elenco fisso di 24 nomi, dove mancano Katiuscia Secondo, Linda Novelli, Giuseppe Ardito, Giovanni Vito Antonio…). Il tool *Cerca* filtra per `Autista`, quindi può non trovare il record aperto dall'altro percorso.
19. **La flotta è scritta in 4 posti diversi:**
    - prompt dell'agente
    - `Lista Mezzi` del Recap (ramo spento)
    - mappa delle cartelle Drive
    - foglio `Veicoli`

    Nelle prenotazioni compare già «Vito HD438SD», che non c'è in nessuna delle liste fisse.
20. «Delete prev bot (text)» cancella il messaggio `message_id − 1` a ogni testo dell'autista: può cancellare il recap o la domanda appena fatta. Con il finto messaggio GPS fallisce in silenzio.
21. Simple Memory è in RAM: se l'istanza si riavvia a metà check-out, le risposte già date si perdono.

### Parti morte

- Agente: «Send a text message», «Switch btn_type» e i 5 «Send btn …» sono disattivati. L'uscita `unknown` dello Switch non è collegata. I tool «Logs» e «Calculator» non sono citati nel prompt.
- GESTIONE: «Ricalcola percentuali» legge `$('Leggi Dashboard')`, un nodo che non esiste (finisce sempre nel try/catch). Così i problemi di carrozzeria, pulizia e carburante non arrivano mai alle Note globali.
- Recap: tutto il ramo «Ogni giorno alle 1» (6 nodi) è disattivato.
- v7: MASTER e SUB non sono mai stati pubblicati.

---

## G. Dati sullo stato dei mezzi che il nuovo responsabile autisti deve raccogliere

Legenda «dove sta oggi»:
- **TCF** = Template_Controllo_Flotta (`1HP5USWq…`)
- **scheda** = foglio del mezzo dentro TCF
- **DASH** = MEZZI_DASH
- **LOG** = LOG_EVENTI
- **DT** = data table «Stato mezzi»
- **SCAD** = Scadenziario › Revisioni
- **FV** = Check list › Fogli di viaggio
- **VEI** = gestionale › Veicoli

| # | Campo | Tipo | Dove sta oggi | Chi lo produce oggi / note |
|---|---|---|---|---|
| 1 | Mezzo (Modello + Targa) | testo, chiave | VEI; nome del foglio scheda; DASH `Mezzo_Nome`; DT `Mezzo` | lista fissa in 4 posti; serve **un'unica anagrafica** con id |
| 2 | Targa | testo | VEI; SCAD `Targa` | — |
| 3 | Km attuali | intero | scheda `Anagrafica › Km attuali`; DASH `Km attuali` | ultimo `Km fine` in FV (Jotform). Il bot non li chiede mai. |
| 4 | Ultimo autista + data + km | testo | scheda `Anagrafica › Ultimo autista` (Valore + Note) | GESTIONE |
| 5 | Check-in fatto (SI/NO) | booleano | DT `Checkin` | modello (tool Aggiorna) |
| 6 | Check-out fatto (SI/NO) | booleano | DT `Checkout` | modello; viene messo prima dei salvataggi |
| 7 | Data sessione, autista, chat_id | data / testo / numero | DT `Data`, `Autista`, `Chatid` | — |
| 8 | Data / ora ultimo controllo | data e ora | DASH `Ultimo check`; scheda «Data ultimo aggiornamento <SEZ>» (una per sezione) | — |
| 9 | Carburante: livello | elenco (pieno, 3/4, 1/2, 1/4, riserva, vuoto). I bottoni hanno solo 4/4, 3/4, 2/4, 1/4. | **solo nelle Note** di scheda `CARBURANTE › Data ultimo aggiornamento CARBURANTE`; DASH `Carburante` (testo con emoji) | sotto-agente gpt-4.1 o Vision. Manca una colonna vera. |
| 10 | Carburante: litri / importo rifornimento | numero (virgola decimale) | **da nessuna parte** (v7: Recap › Foglio1 `Litri`, `€`) | si perde |
| 11 | Pulizia interni | elenco (pulito, normale, sporco, molto sporco) | scheda `PULIZIA › Interni` (solo OK, Sporco, Molto sporco) | «normale» si perde |
| 12 | Pulizia esterni | elenco come sopra | scheda `PULIZIA › Esterni` | come sopra |
| 13 | Pulizia (sintesi) | testo con emoji | DASH `Pulizia` | derivato |
| 14 | Tessera APT: saldo | numero € o fascia (≥50, 20–50, 10–20, <10, vuota/scaduta) | scheda `TESSERA APT › TESSERA APT` («€50plus»); DASH `Tessera APT` | oggi rovinato: «€», «€vuota» |
| 15 | Carrozzeria: Anteriore | stato (OK, Graffio, Ammaccatura, Rottura…) + note | scheda `CARROZZERIA › Anteriore` | LLM |
| 16 | Carrozzeria: Posteriore | come sopra | scheda `CARROZZERIA › Posteriore` | LLM |
| 17 | Carrozzeria: Lato DX | come sopra | scheda `CARROZZERIA › Lato DX` | LLM |
| 18 | Carrozzeria: Lato SX | come sopra | scheda `CARROZZERIA › Lato SX` | LLM |
| 19 | Carrozzeria: Tetto | come sopra | scheda `CARROZZERIA › Tetto` | LLM |
| 20 | Carrozzeria: parte / tipo danno / gravità | elenco | solo in ingresso a GESTIONE (`Parte`, `Tipo_Danno`, `Gravita`) e nel testo di LOG | non salvati come campi |
| 21 | Carrozzeria (sintesi) | testo | DASH `Carrozzeria` | derivato |
| 22 | Pneumatici: % Ant DX, Ant SX, Post DX, Post SX | % (virgola) + nota del danno | scheda `PNEUMATICI › Ant DX…Post SX` | calcolato dai km; il danno sulla singola gomma viene sovrascritto |
| 23 | Pneumatici: % media 4 gomme | % | scheda `% MEDIA 4 gomme (per dashboard)`; DASH `Pneumatici ` (con spazio finale) | calcolato |
| 24 | Km all'ultimo cambio gomme ANT / POST | intero | scheda `Ant. / Post. Km cambio gomme (auto)` | LLM o km attuali |
| 25 | Km percorsi dal cambio ANT / POST | intero | scheda `Ant. / Post. Km percorsi da cambio` | calcolato |
| 26 | Vita stimata gomme ANT / POST | intero (km) | scheda `Vita stimata gomme ANT/POST (km)` (default 35000 / 50000) | parametro del mezzo |
| 27 | Km ultima inversione / km da inversione / inversione consigliata | intero / intero / SI-NO | scheda `Km ultima inversione gomme`, `Km percorsi da inversione`, `Inversione consigliata`; `Km max tra inversioni gomme` (12000) | — |
| 28 | Tipo gomme (invernali, estive, all season) | elenco | **non salvato** (solo in ingresso a GESTIONE) | — |
| 29 | Spie accese | elenco di {nome canonico, colore rosso/giallo/verde, stato ATTIVA/VERIFICA} | scheda `MANUTENZIONE › Spie/Diagnosi` (stringa «🔴 X [ATTIVA] \| …»); DASH `Spie` | gpt-4o; oggi ci finiscono anche danni di carrozzeria |
| 30 | Guasto meccanico (descrizione, gravità, mezzo fermo, risolto) | testo / elenco / booleano / booleano | solo dentro `Riepilogo manutenzione` («🚫 FERMO - …») | LLM |
| 31 | Marciabile (sì / no) | booleano | solo in ingresso a GESTIONE e nel punteggio LOG | non salvato come campo |
| 32 | Tagliando: km ultimo, km max, km percorsi, % residua | intero / intero / intero / % | scheda `MANUTENZIONE › Km ultimo tagliando`, `Km max tra tagliandi`, `Km percorsi da tagliando`, `% residua tagliando` | km ultimo dall'LLM |
| 33 | Pastiglie ANT: km ultimo cambio, km max, km percorsi, % residua | come sopra | scheda `MANUTENZIONE › … pastiglie ANT` | come sopra |
| 34 | Pastiglie POST: come sopra | come sopra | scheda `MANUTENZIONE › … pastiglie POST` | come sopra |
| 35 | Riepilogo manutenzione | testo (✅ / ⚠️ / 🚫 FERMO) | scheda `MANUTENZIONE › Riepilogo manutenzione`; DASH `Meccanica` | derivato |
| 36 | Revisione: data ultima / scadenza / pagata / data pagamento | data / data / SI-NO / data | SCAD `Scaduto`, `Scadenza` (formula), `Pagato`, `Data pagamento` | il bot scrive la data in `Pagato`; `Scaduto` ha due significati |
| 37 | Note globali del mezzo | testo | DASH `Note` | derivato |
| 38 | Foto per categoria | link | Drive (60 cartelle); `LOG › Link_Risorse` | file_id copiato dal modello |
| 39 | Storico eventi (chi, quando, cosa, esito, punteggio) | riga di log | LOG: DataOra, Autista, Mezzo, Tipo_Evento, Esito, Dettagli, Link_Risorse, Punteggio, Motivo_Punteggio | append, poi delete e append decisi da gpt-4o |
| 40 | Imputabilità del danno + motivo | booleano + testo | **non salvati** (oggi sempre «Non imputabile» per il bug true/«true») | — |
| 41 | Discrepanza al check-in (autista precedente responsabile) | testo + punteggio | LOG (riga di LOGS); Note «⚠️ X segnala discrepanza…» nella scheda | — |
| 42 | Stato del mezzo al check-in confermato dall'autista | istantanea | **non salvata** (solo il messaggio del modello e Checkin = SI) | serve per i confronti successivi |
| 43 | Meccanico / carrozziere visitato oggi | sì-no + testo | **non salvato** come campo (passa da GESTIONE MECCANICA come testo) | — |
| 44 | Documenti di bordo (libretto, assicurazione, ZTL/APT…) | — | **non raccolti** da nessuna parte | da decidere |
