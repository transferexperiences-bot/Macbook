# Mappa del workflow "Rendicontazione" (`bbeiU9HP74s2dl8E`)

Fonte: `get_workflow_details` (lettura sola). Attivo: **sì**. `versionId = activeVersionId = 2b9c00fc…` (quello che si legge è quello che gira). Ultima modifica 01/09/2026. 79 nodi, 2 trigger. Tag "TE · Tocca il foglio".
Bot Telegram: credenziale **"Rendicontazione"** (`8XavsCi1ZXYlemkn`). I token nelle URL HTTP sono qui scritti come `<TOKEN>`.

---

## 1. Ingressi

### 1.1 Trigger
| Trigger | Configurazione | Chi lo chiama |
|---|---|---|
| **Telegram Trigger1** | updates: `message`, `*` (tutti), `edited_message` | Gli autisti che scrivono al bot |
| **Webhook** | `POST /webhook/3328cf63-084d-4571-b2b9-7741739eddf0`, risponde subito "Workflow got started.", nessuna autenticazione | Uno **script esterno** (non in questo workflow): dalle note sui nodi è un ciclo che ogni ~5 minuti ripropone le righe *Pending* del foglio `Allert › Fine servizio`. Body atteso: `chat_id`, `message_id` (promemoria precedente da cancellare), `stato` |

### 1.2 Catena del messaggio Telegram
`Telegram Trigger1` → **Get Rubrica Autisti** (legge tutta la scheda Telegram) → **Normalizer** (Code) → in parallelo:
- **Switch (kind)** → ramo per tipo (sotto)
- **Get row(s) in sheet2** (Allert › Fine servizio, per `chat_id`) → **Delete a chat message1** (⚠️ rotto, vedi §7)

**Normalizer v2** produce: `kind`, `text`, `file_id`, `mime`, `chat_id`, `message_id`, `callback_data`, `Autista`, `AutistaRaw`, `MatchType`, `ChatId`.
- Legge solo `root.message` e `root.callback_query`: un `edited_message` diventa `kind=unknown` e lo Switch non lo instrada (viene ignorato).
- Ordine: callback → text → photo (la più grande) → voice → audio → document → unknown. La didascalia (caption) finisce in `text`.

**Normalizzazione per tipo (Switch (kind) → Merge a 6 ingressi → AI Agent2):**
| kind | Percorso | Cosa arriva all'agente |
|---|---|---|
| `text` | Set text (direct text) | il testo |
| `callback` | **Delete Message (callback only)** (cancella il messaggio col bottone, onError continua) → Set text (callback) | `text = callback_query.data` |
| `image` | Telegram Download → **Upload file** (Drive) → **Share file** → **OpenAI Vision (image)** gpt-4o su `webContentLink` → Set text (Image Vision) | `text` = JSON vision, `foto_link` = `webViewLink`. ⚠️ la didascalia si perde (il Set tiene solo text/kind/foto_link) |
| `voice` / `audio` | Telegram Download → **Fix formato audio** (rinomina binario `audio.ogg/mp3/…`) → **OpenAI Transcribe** (retry 2, onError → uscita errore) → Set text (Transcript) | trascrizione. In errore → messaggio "🎙️ Non sono riuscito ad ascoltare il vocale…" (nodo Telegram attivo) |
| `document` vCard (`mime = text/x-vcard`) | Download → Extract vCard (extractFromFile, parametri default) → Set text (vCard) `$json["BEGIN:VCARD"]` | testo vCard grezzo (scopo non chiaro nella rendicontazione) |
| `document` altro (PDF, ma anche JPG inviato come file) | Download → **CloudConvert** → JPG → **OpenAI Vision (PDF images)** gpt-4o base64 → Set text (PDF Vision) | JSON vision. ⚠️ **nessun upload su Drive → nessun `foto_link`** |

Il prompt dell'agente è: `{{$json.text}}` + `\n\nFOTO_LINK: <link>` se presente.

### 1.3 Anti doppio tap
Nodo **Anti Doppio Tap** (Code, 22/07/2026), solo sul ramo callback `Fine servizio`: debounce **60 s per chat** con `$getWorkflowStaticData('global').fineTap`; pulizia chiavi più vecchie di 24 h. Il secondo tap entro 60 s restituisce `[]`. Non protegge il ramo che passa dall'agente (vedi §7) né la `conferma` delle spese.

### 1.4 Controllo chat-id
- **Chat-Id valido?** (IF) esiste **solo sul webhook**: `String(body.chat_id).trim()` non vuoto.
- Sul ramo Telegram **non c'è nessuna lista bianca**: chiunque scriva al bot viene elaborato.

### 1.5 Identificazione autista
- Rubrica: doc `1nqmt8_4Oy8paHlPU8LTBLEvl-quW0DYgTtmB73nBxPw` (nome in cache "Programma Autisti 2.0" — è lo stesso Id del gestionale *Prenotazioni NCC 3.0*), scheda **Telegram** (gid `1844093658`). Colonne usate: `Autisti`, `chat id`, `gruppo id`, `mail`.
- Il riconoscimento avviene **per nome Telegram** (`first_name last_name`), **non per chat id**: 1) uguaglianza normalizzata (senza accenti/punteggiatura), 2) nome/cognome invertiti, 3) inclusione unica, 4) fuzzy Levenshtein (0,7·cognome + 0,3·nome; soglie ≥0,90, cognome ≥0,92, distacco ≥0,03), 5) **fallback: nome Telegram grezzo** (`MatchType=fallback_raw`).
- `ChatId` = `from.id` (in chat privata coincide con `chat.id`). Il `chat id` della rubrica viene letto ma **non usato**.

---

## 2. Funzioni per l'autista (come le conduce il bot)

Tutta la conversazione è governata da **AI Agent2** ("ORCHESTRATORE RENDICONTAZIONE v6.5"). Il modello deve rispondere con **un solo JSON** `{text, buttons, Foto1, Foto2}`; il nodo **Code in JavaScript1** estrae `text` e `buttons` e costruisce `inline_keyboard` (callback_data = `callback_data` o, se manca, il testo del bottone).

Callback canonici dichiarati nel prompt:
> Menu principale: `reg_pasto | reg_lavaggio | reg_rifornimento | reg_spesa | riepilogo | chiusura` · Conferma: `conferma | annulla` · Mezzo: `"<Modello> <Targa>"` · Spesa: `spesa_<tipo>` · Rifornimento: `rif_gasolio | rif_adblue` · Fine giornata: `ore_ok | ore_correggi`

Nessuno di questi è gestito da codice: ogni callback torna all'agente come testo.

### 2.1 Mezzo (GetMezzo / SetMezzo)
1. Prima di ogni registrazione l'agente chiama **GetMezzo** (data table `Mezzo`, chiave `chatid = ChatId + dd/MM/yyyy`).
2. Se vuoto: salva "in memoria" `INPUT_PENDENTE` e `FOTO_LINK_PENDENTE`, chiama **Leggi Veicoli** e risponde "🚗 Prima di registrare, seleziona il mezzo:" con un bottone per mezzo (`callback_data = "<Modello> <Targa>"`).
3. Al tap: **SetMezzo** `{mezzo}` (valore deciso dal modello) e riprende l'input pendente.
4. "cambia mezzo" → mostra i bottoni mezzi.
Il prompt contiene anche una **mappa fissa 1→10** (Maybach GZ441BF, Classe V FN751MD, Classe V FM300TR, Maserati GR941TP, Porsche ES031YK, Sprinter GZ204TT, Vito FJ154PR, Ape Calessino DD63585, BMW FC098CW, Tuk-tuk FT61049) che può divergere dal foglio Veicoli.

### 2.2 Pasto (Tool_pasti v11)
1. Autista manda foto scontrino → Vision → JSON.
2. Orchestratore: `get_rows` e conta `Tipologia="Pasto"`; se ≥2 → "⚠️ Limite raggiunto: hai già registrato 2 pasti oggi."
3. Tool_pasti valida: scontrino con articoli alimentari, data = oggi, totale > 0. **Tetto 10,00 €**: se il totale è più alto registra "10,00" e scrive in Descrizione "Scontrino €X,XX → registrati €10,00".
4. Riepilogo "📋 RIEPILOGO PASTO … Scrivi 'conferma' per registrare." + bottoni conferma/annulla.
5. `conferma` → **Append row** (Recap). `annulla` → "❌ Annullato".
Row: `Tipologia "Pasto"`, `Litri ""`, `€ "X,XX"`, `Descrizione "Pasto - [Esercente] - [Località] - €X,XX"`, `Foto1 = foto_link`, `Foto2 ""`.

### 2.3 Lavaggio (Tool Lavaggio v12)
- **Mancini convenzionato**: testo "mancini/spazzole/convenzionato" o vision `MEZZO_AL_LAVAGGIO` → `€ "0,00"`, `Tipologia "Lavaggio convenzionato Mancini"`, Descrizione "Lavaggio Mancini - Gratuito convenzionato", foto facoltativa.
- **Non convenzionato**: scontrino `LAVAGGIO`, data oggi, totale >0 e ≤100,00 → `Tipologia "Lavaggio non convenzionato"`, `€` = totale.
- Tipo non chiaro → messaggio guida. Poi conferma → Append row.

### 2.4 Rifornimento (tool_Rifornimento v12)
- **Cisterna interna** (contatore K33 0-999): 1ª foto → "✅ Prima foto acquisita: XXX L 📸 Ora invia la foto DOPO." (lettura e link tenuti **solo nella memoria del modello**); 2ª foto → litri = seconda − prima, oppure con azzeramento `(999 − prima) + seconda + 1`. >200 L → chiede "conferma litri"; ≤0 → chiede correzione. Correzioni a parole: "la prima è…", "la seconda è…", "sono N litri", "reset". Row: `Tipologia "Rifornimento da cisterna interna"`, `€ "0,00"`, `Litri`, Foto1 + Foto2.
- **Stazione di servizio**: scontrino `RIFORNIMENTO`, carburante ≠ ADBLUE, data oggi, totale e litri → `Tipologia "Rifornimento da stazione di servizio"`.
- **AdBlue**: frase ("ho fatto 10 litri di adblue") o scontrino ADBLUE → `Tipologia "AdBlue"`, `Descrizione "AdBlue - X,XX L"`. Con la sola frase l'importo non ha fonte.
- Bottoni `rif_gasolio | rif_adblue` previsti dal prompt.

### 2.5 Spese varie (Tool_speseVarie v1.2)
Parcheggio, Tessera/Abbonamento, Parcheggio Aeroporto, Manutenzione (Gommista/Meccanico/Carrozzeria), Materiale Pulizia, Spesa Generica (classificate per parole chiave dal modello). Accetta anche dichiarazione testuale senza foto ("ho speso X€ per…"). Mancano importo/descrizione → chiede ("💶 Qual è l'importo della spesa?"). Row: `Tipologia "Spesa Varia"`, `Descrizione "[Tipo] - [Dettaglio]"`. Bottoni `spesa_<tipo>`.

### 2.6 Riepilogo
`get_rows` (Recap, Data = oggi, Autista) → il **modello** conta e somma: 🍽️ pasti, 🧼 lavaggi, ⛽ rifornimenti (L), 💧 AdBlue (L), 🧾 spese varie, 💰 totale.

### 2.7 Chiusura / fine giornata — due percorsi paralleli
**A) Bottone promemoria (codice).**
1. Script esterno → Webhook → Chat-Id valido? → **Delete a chat message2** (cancella il promemoria precedente `body.message_id`) → messaggio "⏰ Hai terminato i servizi?" con bottoni **✅ Confermo** (`Fine servizio`) / **❌ Non ancora** (`ignora`) → **Append or update row in sheet1** (stato di consegna nel foglio Allert).
2. Tap su uno dei due → **Filter1** → Get row(s) in sheet1 (Allert per ChatId) → **Delete rows** (cancellazione fisica della riga del promemoria).
3. Solo `Fine servizio` → **Filter** → Anti Doppio Tap → Get row(s) in sheet3 (riga di oggi in Riepilogo servizi) → Get row(s) in sheet (Fogli di viaggio non registrati dell'autista) → in ordine: **Update row in sheet** (`Registrato = Si`) e poi Aggregate → **Code in JavaScript** (compatta i servizi) → Get Spese Oggi → **Aggiungi Spese** → **Append or update row in sheet** (Riepilogo servizi).
**B) Agente.** Lo stesso callback `Fine servizio` (e anche `ignora`) entra **anche** nel ramo agente (Delete Message → Set text (callback) → AI Agent2). Con "fine servizio / chiusura / chiudi" l'agente chiama il tool **Fine Servizio** = sotto-workflow `OkGFUfSlxs2VQRl1gt34A` (input `message`, `chatid`, `idunivoco`, `autista`), che conduce il dialogo su ore, incasso e contanti. Regole del prompt:
> Se l'output contiene "confermi?" o "Sono CORRETTE?" → chiave=["✅ Confermo","❌ Sono diverse"] · se chiede l'incasso ("incassato"/"contanti") → nessun bottone · "Indicami il numero ESATTO" → input libero · "Conferma" → passa "sì", "Annulla"/"Sono diverse" → passa "no".

`ore_ok | ore_correggi` sono dichiarati ma i salvataggi di ore, incasso e contanti avvengono **nel sotto-workflow**, che va mappato a parte.

---

## 3. Salvataggi (ogni nodo che scrive)

### S1 — Append row (tool dell'agente) ⭐ spese della giornata
- Doc **Recap** `1nrdVXL4REiuXvzGw7nOwnDAtk9t4-cKYDOlccCZ-Kds`, scheda **Foglio1** (gid 0). Operazione **append**, nessuna chiave. **Senza onError.**
| Colonna | Valore |
|---|---|
| Data | `$now.toFormat('dd/MM/yyyy')` (codice) |
| Autista | `Normalizer.Autista` (codice, anche fallback grezzo) |
| Mezzo | `$fromAI('Mezzo','nome del veicolo')` — **LLM**, senza default |
| Tipologia | `$fromAI('Tipologia','Descrizione')` — **LLM** (descrizione del campo sbagliata) |
| Litri | `$fromAI('Litri','litri erogati')` — **LLM** |
| € | `$fromAI('_','Importo presente in scontrino o da registrare')` — **LLM**, chiave `_` |
| Descrizione | `$fromAI('Descrizione','Riepilogo dati')` — **LLM** |
| Foto1 / Foto2 | `$fromAI(...)` — **LLM** ricopia il link Drive |
🚩 Importi, litri e mezzo scritti dal modello · nessun Id/chiave → una seconda `conferma` duplica la riga · `$fromAI` senza 4° argomento (campo obbligatorio).

### S2 — SetMezzo (tool) — data table **Mezzo** `vScSmX7skqUt74lZ`
- **upsert**, filtro `chatid = ChatId + dd/MM/yyyy`; colonne `mezzo` = `$fromAI('mezzo')` (**LLM**, nessuna verifica col foglio Veicoli), `chatid` = la chiave. `matchingColumns: [mezzo]` è un residuo incoerente col filtro.

### S3 — Upsert row(s) — data table **Bottoni rendicontazione** `VezPojBP247T6fAl`
- Dopo ogni invio di Send Telegram Rendicontazione: upsert, filtro `Chatid = result.chat.id`; colonne `Chatid`, `messageid = result.message_id`. Serve a ricordare l'ultimo messaggio del bot; **in questo workflow nessuno lo rilegge** (vedi §7).

### S4 — Update row in sheet — **Check list › Fogli di viaggio**
- Doc `1z77zMyUch9s9Hx5yH7NoomHDYkZqTo_yPhpGAW34MrI`, gid `1477457448`. **update**, chiave `row_number`; scrive solo `Registrato = "Si"` su **tutte** le righe restituite da Get row(s) in sheet (autista + Registrato vuoto). Retry 4, senza onError.
🚩 Viene eseguito **prima** del salvataggio del riepilogo e marca anche le righe che il codice scarta (orari mancanti o non validi) → quei servizi spariscono dai riepiloghi futuri.

### S5 — Append or update row in sheet — **Check list › Riepilogo servizi** ⭐ chiusura giornata
- Stesso doc, gid `1170514979`. **appendOrUpdate**, chiave **`Id`**. Retry 4, senza onError.
| Colonna | Valore (tutto da codice) |
|---|---|
| Id | `IdChiusura` = Id della riga di oggi se esiste, altrimenti `CH-yyyyMMdd-HHmmss-XXXXXX` |
| Data | Data del primo servizio nuovo (dal foglio di viaggio) |
| Mezzo | veicoli unici uniti con " / " (con merge sulla riga esistente) |
| Autista | autisti dei servizi uniti con " / " |
| n. servizi | esistente + nuovi |
| Riepilogo servizi | `Da→Per (Inizio–Fine[ ⚠️])` uniti con " \| " (accodati a quelli esistenti) |
| Durata totale / Durata effettiva | ore con virgola, durate che tengono conto della mezzanotte, tetto 24 h, orari sospetti = 0 + ⚠️; sommate alla riga esistente |
| Spese | stringa da Aggiungi Spese: `⛽ Rifornimento N L €X \| 🍽 Pasti €X \| 🧼 Lavaggi €X \| 💶 … — Tot €X` (somma dei valori € che il modello ha scritto in Recap) |
🚩 appendOrUpdate su `Id`: se la riga di oggi esiste ma ha `Id` vuoto, viene creato un Id nuovo → **APPENDE un doppione** · `KmTotali` viene calcolato ma **non scritto** · Incasso / Ore comunicate / Totale / Annotazioni / Paste sono nello schema ma non scritti qui (probabilmente dal sotto-workflow) · la riga esistente si cerca per `$now` (oggi) mentre `Data` arriva dal foglio di viaggio: servizi di ieri non registrati finiscono nella riga di oggi.

### S6 — Append or update row in sheet1 — **Allert › Fine servizio**
- Doc **Allert** `1ORv26Kq-HV1otxF0da7NZKmIhOfZzgj8Swa_zIMe44Q`, gid `441970287`. **appendOrUpdate**, chiave **`Chat-Id`**. Retry 4.
| Colonna | Valore |
|---|---|
| Stato | `body.stato` se Telegram ha restituito `message_id`, altrimenti `'⛔ Non risponde'` |
| TR-Id | `""` (vuoto) |
| Chat-Id | `body.chat_id` |
| Message-Id | `result.message_id` o `""` |
🚩 Se la riga di quel Chat-Id è già stata cancellata (S7) → **append** di una riga nuova (comportamento voluto dallo script, ma è appendOrUpdate su chiave che può mancare).

### S7 — Delete rows or columns from sheet — **Allert › Fine servizio** 🔴
- **delete** fisico, `startIndex = row_number` di Get row(s) in sheet1 (righe con Chat-Id = autista). onError: continua.
🚩 È una **cancellazione vera**, contraria alla regola della cancellazione morbida. Se le righe trovate sono più di una, le cancellazioni in sequenza spostano gli indici e possono **cancellare la riga sbagliata**. Scatta anche su "❌ Non ancora".

### S8 — Drive: Upload file + Share file
- Cartella **Rendicontazione** `1Uzf_ky7LAdc8DJMrHd-_6PZXvo6miUd_` (My Drive, credenziale "Transfer"); nome file = `result.file_id` di Telegram (senza estensione né data/autista).
- Share: `type = anyone`, **`role = writer`** 🚩 chiunque abbia il link può modificare o cancellare lo scontrino. Basterebbe `reader`.
- Solo per le foto; PDF e documenti **non vengono caricati**.

### Sotto-workflow (non in questo file)
- **Fine Servizio** `OkGFUfSlxs2VQRl1gt34A`: ore comunicate, incasso, annotazioni, modalità di pagamento. Mappato in fondo, nella sezione "Sotto-workflow Fine Servizio".

---

## 4. Letture (contesto)
| Nodo | Sorgente | Filtro / uso |
|---|---|---|
| Get Rubrica Autisti | `1nqmt8_…` › Telegram | tutta la scheda, identificazione autista |
| Leggi Veicoli (tool) | `1nqmt8_…` › Veicoli (gid 329641120) | elenco mezzi per i bottoni |
| get_rows (tool) | Recap › Foglio1 | Data = oggi AND Autista → riepilogo, conteggio pasti |
| GetMezzo (tool) | DT Mezzo | `chatid = ChatId+data` |
| Get row(s) in sheet2 | Allert › Fine servizio | `Chat-Id = $json.chat_id` (a ogni messaggio) |
| Get row(s) in sheet1 | Allert › Fine servizio | `Chat-Id = ChatId` (prima della cancellazione) |
| Get row(s) in sheet3 | Check list › Riepilogo servizi | Data = oggi AND Autista (alwaysOutputData) |
| Get row(s) in sheet | Check list › Fogli di viaggio | `Registrato` (valore vuoto) AND Autista; executeOnce |
| Get Spese Oggi | Recap › Foglio1 | Autista (tutte le date, filtra il codice) |

---

## 5. Modelli e memoria
| Nodo | Modello |
|---|---|
| AI Agent2 (orchestratore) | OpenAI **gpt-5.2** (OpenAI Chat Model4), retryOnFail, onError continua |
| Tool_pasti / Tool Lavaggio / tool_Rifornimento / Tool_speseVarie | OpenAI **gpt-5.2** (un modello per tool) |
| OpenAI Vision (image), OpenAI Vision (PDF images) | **gpt-4o**, stesso prompt "VISION AGENT v5" (contatori K33) |
| OpenAI Transcribe | trascrizione audio OpenAI (modello di default) |
| Calculator | tool dell'orchestratore |
| Structured Output Parser | presente ma **non collegato** |

Memorie (Window Buffer, in memoria del processo n8n), tutte con **sessionKey = `ChatId`** (nessuna data):
| Memoria | Agente | Finestra |
|---|---|---|
| Window Buffer Memory | orchestratore | 10 |
| …Memory2 | Tool_pasti | 3 |
| …Memory3 | Tool Lavaggio | 3 |
| …Memory4 | tool_Rifornimento | 4 |
| …Memory5 | Tool_speseVarie | 2 |
🚩 La riga da confermare, `INPUT_PENDENTE`, la prima lettura della cisterna e il relativo link vivono **solo qui**. Finestre corte, chiave condivisa tra agenti diversi, nessun legame col giorno: dopo pochi messaggi o un riavvio di n8n la conferma salva una riga ricostruita dal modello (o non salva nulla).

---

## 6. Messaggi in uscita
| Nodo | Stato | Destinatario / contenuto |
|---|---|---|
| **Send Telegram Rendicontazione (dynamic)** | ✅ attivo, HTTP `POST https://api.telegram.org/bot<TOKEN>/sendMessage` | `chat_id = Normalizer.ChatId`, `text = agent_output_clean`, `reply_markup` dai bottoni dell'agente. Unica risposta all'autista. Senza onError e senza parse_mode |
| Vocale non leggibile | ✅ attivo | `Normalizer.chat_id`: "🎙️ Non sono riuscito ad ascoltare il vocale…" |
| Telegram - Bottone Visionato (set credentials)2 | ✅ attivo, onError continua | `body.chat_id`: "⏰ Hai terminato i servizi?" [✅ Confermo=`Fine servizio`] [❌ Non ancora=`ignora`] |
| Delete Message (callback only) | ✅ | cancella il messaggio col bottone premuto |
| Delete a chat message2 | ✅ | cancella il promemoria precedente (`body.message_id`) |
| Delete a chat message1 | ✅ ma rotto | vedi §7 |
| Send Telegram Mezzi (dynamic) | ⛔ disattivato | HTTP `…/bot<TOKEN>/sendMessage` con `output.mezzi` |
| Send a text message / message1 / message2 / message4 | ⛔ disattivati | vecchi invii (conferma, errore, mezzi 10 righe) |
| Switch | ⛔ disattivato | vecchio smistamento mezzi/chiave |
Nessun messaggio va a clienti o fornitori: solo agli autisti.

---

## 7. Punti deboli

### Decisi dal testo del modello (non dal codice)
1. **Importi €**: letti dalla vision (gpt-4o), passati dall'orchestratore al tool e ricopiati in `$fromAI('_')`. Tetto pasti 10 €, limite di 2 pasti al giorno e tetto lavaggio 100 € stanno **solo nei prompt**.
2. **Litri cisterna**: la differenza tra le letture e l'azzeramento li calcola il modello. La vision è istruita a inventare una lettura: *"Devi SEMPRE fornire un valore per contatore_litri, MAI null"*, *"Nel dubbio → 3"*, illeggibile → `"000"`. La prima lettura sta solo in memoria.
3. **Mezzo**: lo sceglie il modello (SetMezzo `$fromAI`, `callback_data` = testo inventato dal modello); la mappa fissa 1-10 nel prompt può contraddire il foglio Veicoli.
4. **Data dello scontrino = oggi**: controllo fatto dal modello.
5. **Riepilogo giornata**: conteggi e totali fatti dal modello.
6. **Ore / incasso / contanti**: tutto nel sotto-workflow guidato dal modello; `idunivoco` = `$fromAI('idunivoco','')` **senza descrizione né default** (campo obbligatorio: se il modello lo omette, la chiamata fallisce).

### Validazioni mancanti
- Nessuna lista bianca sul ramo Telegram; un autista non riconosciuto viene salvato col nome Telegram grezzo.
- Nessun Id e nessun controllo doppioni su Recap: due `conferma` = due righe.
- `callback_data` dal modello senza limite di 64 byte e senza controllo snake_case.
- Formato decimali (virgola) affidato al modello.
- PDF e documenti senza link foto; PDF di più pagine → più item verso l'agente.
- Didascalia della foto persa.
- Se l'agente va in errore (onError continua) il testo diventa `' '`, Telegram lo rifiuta e l'autista non riceve risposta.

### Rotto, morto o incoerente
- **tool_Rifornimento**: il prompt di sistema **comincia a metà** ("Esempi: - 980 → 015 …"): mancano intestazione, formato di input e sezione A cisterna (formula normale e richiesta della 1ª foto). Probabile modifica finita male.
- **Tool_speseVarie**: la `toolDescription` è **copiata dal rifornimento** ("Chiamare quando l'input contiene … gasolio, rifornimento, cisterna") e può confondere l'orchestratore.
- Prompt dell'orchestratore incoerente: lo schema dichiara `{text, buttons, Foto1, Foto2}` ma il flusso e gli esempi usano il vecchio `{text, chiave, mezzi}`. Code in JavaScript1 legge solo `buttons`: se il modello segue gli esempi, **i bottoni non arrivano**.
- **Delete a chat message1**: legge `$json.Chatid`/`$json.messageid` dalle righe del **foglio Allert** (colonne `Chat-Id`/`Message-Id`) → sempre undefined, fallisce in silenzio a ogni messaggio. La data table `Bottoni rendicontazione` (S3) viene scritta ma mai letta.
- Il callback `Fine servizio` entra **sia** nel ramo codice (S4/S5) **sia** nell'agente, che può avviare il sotto-workflow Fine Servizio: due chiusure in parallelo, possibile corsa su Riepilogo servizi. Anche `ignora` arriva all'agente.
- S4 marca `Registrato=Si` prima di S5 e anche sulle righe scartate (vedi §3).
- S7: cancellazione fisica con indici che slittano.
- Drive condiviso `anyone/writer`.
- Nodi orfani o disattivati: Structured Output Parser (non collegato), Edit Image (disattivato, senza ingresso), Send a text message1 (senza ingresso), Switch + 4 Send a text message + Send Telegram Mezzi (disattivati).
- vCard: Extract from File con parametri di default e lettura `$json["BEGIN:VCARD"]`; scopo poco chiaro.
- `generateId()` usa l'ora del server (`new Date()`), mentre il resto usa `$now` del fuso del workflow.

---

## 8. Cosa deve continuare a esistere nel motore nuovo

| # | Destinazione | Operazione oggi | Campi da preservare | Note per il nuovo motore |
|---|---|---|---|---|
| 1 | **Recap** `1nrdVXL4…Kds` › Foglio1 | append | Data, Autista, Mezzo, Tipologia (`Pasto` · `Lavaggio convenzionato Mancini` · `Lavaggio non convenzionato` · `Rifornimento da cisterna interna` · `Rifornimento da stazione di servizio` · `AdBlue` · `Spesa Varia`), Litri, €, Descrizione, Foto1, Foto2 | Valori da codice e bottoni, Id unico contro i doppioni, onError, stessi valori di Tipologia (li legge Aggiungi Spese) |
| 2 | **Drive** cartella Rendicontazione `1Uzf_ky7…iUd_` | upload + share | file foto (+ PDF), link `webViewLink` in Foto1/Foto2 | Condivisione in sola lettura, nome file parlante |
| 3 | DT **Mezzo** `vScSmX7skqUt74lZ` | upsert | `chatid` (=ChatId+dd/MM/yyyy), `mezzo` | Mezzo da bottone con valore preso dal foglio Veicoli |
| 4 | **Check list** `1z77zMyU…MrI` › Fogli di viaggio | update `row_number` | `Registrato = Si` | Solo sulle righe davvero entrate nel riepilogo, dopo il salvataggio riuscito |
| 5 | **Check list** › Riepilogo servizi | appendOrUpdate `Id` | Id (`CH-…`), Data, Mezzo, Autista, n. servizi, Riepilogo servizi, Durata totale, Durata effettiva, Spese (+ Km totali, oggi perso) | Chiave che esiste sempre; logica ore attuale (mezzanotte, ⚠️, tetto 24 h) da tenere |
| 6 | **Check list › Riepilogo servizi** (sotto-workflow Fine Servizio) | appendOrUpdate `Id` | Id, **Ore comunicate** (numero 0-24, punto decimale), **Incasso** (contanti 0-5000), **Annotazioni** (max 200 caratteri: motivo delle ore diverse, scarto incasso, servizi non incassati) | Id preso solo dal codice (mai `$fromAI`), conferma con bottone, scrittura con onError e "salvata" detto solo se la scrittura è riuscita, decimali coerenti col foglio |
| 6b | **Check list › Fogli di viaggio** (sotto-workflow) | update `row_number` | **Modalità** (`Contanti` · `Carta` · `Fattura` · `Dalla Struttura` · `Pagato link`) dei servizi "da incassare / quota" | row_number preso dal codice e modalità da bottone, mai dal modello |
| 6c | Verifiche della chiusura (sotto-workflow) | solo prompt | ore 0-24, scarto >2 h, ore maggiori della Durata effettiva → motivo obbligatorio, incasso >1000 €, contanti attesi (somma Tariffa dei servizi Contanti ±5 €) | Da riscrivere come codice, conservando le stesse soglie |
| 7 | **Allert** `1ORv26Kq…e44Q` › Fine servizio | appendOrUpdate `Chat-Id` | Stato (`body.stato` / `⛔ Non risponde`), TR-Id, Chat-Id, Message-Id | Lo script esterno dipende da questo foglio: stessa semantica |
| 8 | **Allert** › Fine servizio | delete | (rimozione della riga del promemoria al tap) | Sostituire con un cambio di stato (cancellazione morbida), concordandolo con lo script esterno |
| 9 | DT **Bottoni rendicontazione** `VezPojBP247T6fAl` | upsert `Chatid` | Chatid, messageid | Verificare se altri workflow lo leggono; se serve, usarlo per cancellare il messaggio precedente |
| 10 | Webhook `3328cf63-…` | ingresso | body `chat_id`, `message_id`, `stato` | Stesso path/contratto, o aggiornare lo script esterno |

---

# Sotto-workflow Fine Servizio (`OkGFUfSlxs2VQRl1gt34A`)

Attivo, `versionId = activeVersionId = b54593fa…` (bozza uguale alla produzione), ultima modifica 30/07/2026, 11 nodi. Nessun token e nessun invio Telegram: il testo torna all'orchestratore di Rendicontazione, che lo manda all'autista.

## F1. Ingressi
- **When Executed by Another Workflow**: input `message`, `chatid`, `idunivoco`, `autista`, passati dal tool "Fine Servizio" di Rendicontazione (`message` e `idunivoco` decisi dal modello; `chatid` e `autista` dal Normalizer).
- **Trova Chiusure** (lettura, onError continua, alwaysOutputData): Check list › Riepilogo servizi, `Autista = autista`, tutte le righe di tutte le date.
- **Prepara Input** (Code, 22/07/2026): cerca l'Id **vero** = riga con `Data` uguale a oggi **o ieri** e `row_number` più alto; `idunivoco = realId || idunivoco passato dal modello`.
- **AI Agent** ("AGENTE FINE SERVIZIO v3.4"), testo = `message`; modello **gpt-5.2**; memoria **Simple Memory** con `sessionKey = chatid`, finestra di default (5).
- **Edit Fields** → restituisce `{ok: true, result: output}` all'orchestratore.

## F2. Il dialogo (tutto guidato dal prompt)
1. **STEP 1** — `get_riepilogo`; se ci sono più righe usa quella con row_number più alto. Mostra 📋 RIEPILOGO GIORNATA (Id, Data, Mezzo, Autista, servizi, ⏱️ ORE = Durata effettiva) e l'avviso:
   > "🚨 ATTENZIONE: questa azione è IRREVERSIBILE. Le ore che comunichi qui sono ESATTAMENTE quelle che ti verranno PAGATE … Sono CORRETTE?"
2. **STEP 2** — "sì" → `ore_finali = Durata effettiva`; "no" → "Indicami il numero ESATTO di ore corrette e il motivo…". Ore solo 0-24; scarto >2 h → chiede conferma; ore **maggiori** della Durata effettiva → **motivo obbligatorio** (regola 24/07), che va nelle Annotazioni.
3. **STEP 3** — modalità pendenti: `get_servizi_oggi` (oggi, poi ieri). Per ogni servizio con Modalità che contiene "incassare" o "quota", uno alla volta: "contanti / carta / fattura / struttura / link / non incassato" → `aggiorna_modalita_servizio` (Contanti · Carta · Fattura · Dalla Struttura · Pagato link). "non incassato" → nessun aggiornamento, nota in ore_nota.
4. **STEP 4** — "💵 … quanto hai incassato in CONTANTI oggi?" (solo 0-5000; sopra 1000 € chiede conferma).
5. **STEP 5** — verifica incasso: somma delle `Tariffa` dei servizi con Modalità "Contanti"; se lo scarto è >5 € chiede conferma, e se l'autista conferma la sua cifra la differenza finisce nelle Annotazioni. Servizi in contanti senza tariffa → nota "verifica non completa".
6. **STEP 6** — "📝 RIEPILOGO FINALE … rispondi sì per salvare (IRREVERSIBILE)"; al sì chiama `salva_chiusura_giornata` e scrive esattamente "✅ Chiusura salvata. Buona giornata, grazie 1000!".
Regole: una domanda per messaggio, **mai chiedere i km**, mai salvare senza il sì finale.

## F3. Salvataggi
### FS1 — salva_chiusura_giornata2 (tool) — Check list `1z77zMyU…MrI` › **Riepilogo servizi** (gid 1170514979)
**appendOrUpdate**, chiave **`Id`**. Senza onError.
| Colonna | Valore |
|---|---|
| Id | `Prepara Input.idunivoco` **‖** `$fromAI('Id', …)` (se il codice non lo trova, l'Id lo dà il modello) |
| Ore comunicate | `$fromAI('Ore_comunicate')` → il codice tiene solo cifre e punto; se il numero è tra 0 e 24 lo arrotonda a 2 decimali, **altrimenti scrive `''`** |
| Incasso | `$fromAI('Incasso')` → stesso filtro, 0-5000, altrimenti `''` |
| Annotazioni | `$fromAI('Annotazioni')` trim, max 200 caratteri |
Non scrive: Totale, Data, Mezzo, Durata (restano quelli del codice di Rendicontazione), km.

### FS2 — aggiorna_modalita_servizio (tool) — Check list › **Fogli di viaggio** (gid 1477457448)
**update**, chiave **`row_number`**.
| Colonna | Valore |
|---|---|
| row_number | `$fromAI('row_number', …, 'number')` — **dal modello** |
| Modalità | `$fromAI('Modalita')` — dal modello. Valori dichiarati: Contanti, Carta, Fattura, Dalla Struttura, Pagato link, Incassare (nessun controllo nel codice) |

## F4. Letture
| Nodo | Sorgente | Filtro |
|---|---|---|
| Trova Chiusure | Riepilogo servizi | Autista (tutte le date) |
| get_riepilogo (tool) | Riepilogo servizi | **solo Autista**, tutte le date: "oggi" lo sceglie il modello |
| get_servizi_oggi (tool) | Fogli di viaggio | Autista + `Data = $fromAI('Data')` (data decisa dal modello) |

## F5. Punti deboli
- 🚩 **Modalità su una riga scelta dal modello**: `row_number` arriva da `$fromAI`. Un numero sbagliato cambia la modalità di pagamento di **un altro servizio**, anche di un altro autista. Nessun controllo che la riga sia dell'autista o del giorno.
- 🚩 **Id della chiusura**: se Prepara Input non trova la riga (codice di Rendicontazione ancora in corsa sul ramo parallelo, Data diversa, riga senza Id), vale `idunivoco` del modello o `$fromAI('Id')`. Con un Id inesistente, appendOrUpdate **APPENDE** una riga con solo Id/Ore/Incasso/Annotazioni (riga orfana). Prendendo "oggi o ieri", se la riga di oggi non esiste ancora ore e incasso possono finire sulla **riga di ieri**.
- 🚩 **"Chiusura salvata" non verificata**: il prompt impone la frase dopo la chiamata al tool, che non ha onError; se ore/incasso non sono validi il codice scrive `''` e il bot dice comunque salvato. È il caso "mai dichiarare un salvataggio che non è avvenuto".
- 🚩 **Irreversibile solo a parole**: un nuovo "fine servizio" sovrascrive Ore comunicate e Incasso sulla stessa riga; nessun blocco né storico.
- Numeri scritti col **punto** (`8.5`), mentre Durata totale/effettiva hanno la virgola: con il locale italiano rischio di testo o date. Da verificare sul foglio.
- Controlli (0-24, scarto 2 h, motivo obbligatorio, >1000 €, verifica contanti ±5 €, somma delle Tariffa) **tutti nel prompt**; nel codice solo i limiti 0-24 e 0-5000.
- `$fromAI` senza default su Annotazioni, Ore, Incasso, Data, row_number, Modalità: se il modello ne omette uno, la chiamata salta.
- Memoria di 5 messaggi per un dialogo di 6 step più N servizi pendenti: ore_finali, ore_nota e l'elenco dei servizi possono uscire dalla finestra prima del salvataggio. `sessionKey = chatid` senza data.
- `get_riepilogo` e Trova Chiusure leggono tutto lo storico dell'autista (sempre più lento; il modello può mostrare un giorno sbagliato).
- `Totale` e km non vengono mai scritti da nessuno dei due workflow.
- Doppio percorso (da Rendicontazione): il tap su "Fine servizio" fa partire insieme il riepilogo da codice (S5) e questo dialogo: corsa sulla riga di Riepilogo servizi.
