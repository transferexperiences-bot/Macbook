# TE Planner — revisione v4 → v5

Revisione di `Code.gs` e `Index.html` fatta **prima** di incollarli nel progetto
(punto 1 della lista aperta dell'handoff). Sotto: cosa era rotto, cosa ho cambiato,
cosa devi ancora fare tu.

---

## 🔴 Da sapere subito

### 1. Le tariffe con decimali venivano moltiplicate per 10
Il parser degli importi eliminava **sempre** i punti prima di convertire:

```js
parseFloat('150.5'.replace(/\./g,'').replace(',','.'))  // → 1505
```

Il foglio restituisce le tariffe come numero, quindi `150,50 €` arrivava alla app
come la stringa `"150.5"`. Conseguenze:

- **Incasso totale della giornata sbagliato** (gonfiato di 10× su ogni servizio con decimali).
- Molto peggio: aprendo un servizio e premendo **💾 Salva dettagli**, il campo Tariffa
  era precompilato con `150.5`, veniva riletto con lo stesso parser e **riscritto sul
  gestionale come 1505**. Bastava un salvataggio per corrompere il prezzo. Idem per l'Acconto.

**Corretto** con `parseEuro_()` (backend) e `eur()` (frontend), che riconoscono il
separatore decimale invece di indovinare. Verificato su: `150.5` · `150,50` · `1.234,50` ·
`1,234.50` · `1.234` · `€ 62,50` → tutti corretti.

In più il backend ora **riscrive tariffa e acconto solo se sono davvero cambiati**.

### 2. `pulisciLuoghi()` avrebbe cancellato uno dei due aeroporti
È nella tua lista delle cose da eseguire una tantum. La normalizzazione dei nomi
cancellava il nome della città e il tipo di via, quindi:

| Luogo | chiave vecchia | chiave nuova |
|---|---|---|
| Aeroporto di Bari | `apt` | `apt bari` |
| Aeroporto di Brindisi | `apt` ⛔ | `apt brindisi` |
| Via Roma, Bari | `roma` | `via roma bari` |
| Piazza Roma, Brindisi | `roma` ⛔ | `piazza roma brindisi` |
| Contrada Roma | `roma` ⛔ | `contrada roma` |

I due aeroporti diventavano lo stesso record: uno finiva in `_LuoghiDuplicati`
**portandosi via le sue coordinate**, e da lì in poi tutte le tratte da/per quell'aeroporto
sarebbero state calcolate sulle coordinate sbagliate.

**Corretto**: la città e il tipo di via restano nella chiave, e ho aggiunto una rete di
sicurezza — due righe con lo stesso nome ma **coordinate distanti più di 500 m** non
vengono mai unite. Le fusioni utili continuano a funzionare
(*Aeroporto di Bari* + *Aeroporto Bari* → una riga sola).

### 3. Gli autisti con l'apostrofo rompevano la riga
Il pulsante «➕ candidato consigliato» costruiva l'HTML così:

```js
onclick="assegnaRapido(3,'" + esc(bf.nome) + "')"
```

`esc()` non gestisce l'apice, quindi con **D'Amico** o **Dell'Aquila** l'attributo si
chiudeva a metà: pulsante morto e riga sballata. Stesso problema nei risultati di ricerca.

**Corretto**: ora si passa solo l'indice numerico, la stringa non entra più nel codice JS.

---

## 🟠 Correzioni importanti

### 4. Ogni salvataggio dettagli convertiva Data e Ora in testo
La app rimanda sempre **tutti** i campi, e `updateService` riscriveva sempre:

```js
if (mod.dateISO) set(C.data, isoToItalian(mod.dateISO));   // → "mer 15 luglio 2026" (stringa)
if (mod.time)    set(C.time, String(mod.time));            // → "09:30" (stringa)
```

Bastava toccare una nota per trasformare la cella Data nativa in testo. La app se la cava
(`normDate` legge entrambi), ma **Turni v6 e i workflow n8n che leggono la stessa colonna no**.

**Corretto**: Data e Ora si riscrivono solo se il valore è realmente cambiato.

### 5. «Indisponibilità» ignorata se la cella conteneva una data vera
Il controllo era `String(cella).indexOf('15/07')`. Se la cella è una Data di Google Sheets,
`String()` produce `"Wed Jul 15 2026 00:00:00 GMT+0200…"` → nessuna corrispondenza →
**l'autista risultava disponibile in un giorno in cui non lo era**.

**Corretto**: ora riconosce celle Data native, elenchi (`14/07, 15/07`), `15/7`, `15-07`,
`15/07/2026` e `"15 luglio"`.

### 6. «Riposo fisso» con logica invertita
Era `weekday.indexOf(cella)`, cioè cercava il contenuto della cella dentro il nome del giorno:

- una cella con `"sab e dom"` **non escludeva mai** l'autista (nessun giorno contiene quella stringa);
- una cella con una singola lettera (`"e"`, `"a"`) escludeva l'autista per sbaglio
  (`"mercoledì".indexOf("e") === 1`).

**Corretto**: la cella viene spezzata in parole e ogni parola confrontata come prefisso del
giorno. `dom` · `domenica` · `sab e dom` · `sabato, domenica` funzionano tutti.

### 7. Il webhook n8n riceveva il valore vecchio quando svuotavi un campo
```js
autista: autista || curAut   // togliendo l'autista ('' || 'Marco') → 'Marco'
```
Rimuovendo un'assegnazione, ai gestionali delle strutture continuava ad arrivare l'autista
precedente. **Corretto** in `assignService` e `assignBatch` (e anche nel `_Log`, che
scriveva la stessa cosa sbagliata).

### 8. Dopo le 22:00 la app si apriva sul giorno sbagliato
La data iniziale usava `new Date().toISOString()`, che è **UTC**. Con l'ora legale, dalle
22:00 in poi mostrava il giorno prima — proprio quando si guardano i transfer dell'indomani
mattina. **Corretto** con una data locale.

### 9. Mezzi marcati «a noleggio» per sbaglio
L'abbinamento noleggio → mezzo era un `indexOf` incrociato: con **Vito** a noleggio
veniva bloccato anche **Vito 2** (e viceversa). **Corretto**: prima la corrispondenza esatta,
il contenimento solo se resta univoco.

### 10. La ricerca restituiva le prime 25 righe del foglio, non le più utili
Il taglio a 25 avveniva **durante** la scansione, l'ordinamento dopo. Cercando un cliente con
molti transfer si vedevano i più vecchi. **Corretto**: si raccoglie tutto, si ordina
(prima i servizi da oggi in poi, dal più vicino), poi si taglia a 30.

### 11. Il trigger `onNuovoTransfer` si sarebbe auto-innescato
È il trigger che devi ancora creare. Il tipo «Al cambio» scatta **anche sulle scritture
dello script stesso**: ogni assegnazione, allert o salvataggio dettagli lo avrebbe fatto
partire, e un **💾 Salva tutto** su 10 righe l'avrebbe lanciato 10 volte, ognuna con una
rilettura completa del foglio su una finestra di 10 giorni.

**Corretto**: le scritture della app lasciano un marcatore in cache e il trigger le ignora
per 20 secondi. Gli inserimenti veri (n8n, Telegram, a mano) passano normalmente.

### 12. La lista autisti in Flotta seguiva una condizione ambigua
```js
a.categoria && CAT.indexOf(a.categoria.toLowerCase()) >= 0 || a.esclusoMotivo === ''
```
`&&` ha precedenza su `||`, quindi bastava non avere motivi di esclusione per entrare in
lista, mentre un autista **escluso** con categoria non riconosciuta spariva. **Corretto**
con una funzione `isOperativo()` unica, usata sia da Flotta che da Timeline.

---

## 🔴 13. Le catene non venivano calcolate fra due servizi nello stesso posto

**Il caso che mi hai segnalato**: consegna in aeroporto e ritiro nello stesso aeroporto, con
l'autista già sul posto, e la app diceva *«non riesce ad arrivare in tempo»*.

Tre cause sovrapposte, tutte nel calcolo dei tempi:

1. **Il confronto «è lo stesso posto?» era un'uguaglianza esatta di stringhe.**
   `"Aeroporto di Bari"` e `"Apt Bari"` (o `"Aeroporto di Bari - Arrivi"`) risultavano due
   luoghi diversi, quindi partiva il calcolo di un trasferimento che non esiste.
2. **La stima aveva un minimo fisso di 10 minuti.** Anche con distanza zero:
   `Math.max(10, Math.round(km * 1.2))` → **10 minuti** inventati.
3. **Il ramo con le coordinate precalcolate aveva un minimo di 5 minuti**, stesso difetto.

A questi si sommava il **buffer di 15 minuti**, che veniva azzerato solo in caso di
uguaglianza esatta del nome. Totale: fino a **25 minuti di trasferimento fantasma** fra due
servizi che partono e finiscono nello stesso punto — abbastanza per far risultare
impossibile un incastro perfettamente fattibile.

**Corretto in tre punti**:

- nuova `stessoLuogo_()` che riconosce `Aeroporto di Bari` = `AEROPORTO BARI` = `Apt Bari` =
  `Aeroporto di Bari - Arrivi` = `Aeroporto di Bari, Italia`, **senza** far collassare Bari
  con Brindisi (la città resta nella chiave);
- se le coordinate dei due punti distano **meno di 300 m**, il trasferimento è **0 minuti**
  e il buffer **0**;
- `stimaMin_()` sostituisce il minimo fisso: 0 km → 0 min, sotto 1 km → 2 min, sotto 3 km →
  5 min, oltre → come prima.

La stessa regola è ripetuta **anche nella app**, non solo nel backend: così il calcolo è
giusto da subito, anche prima che `precalcolaCatene()` riscriva `_CacheTratte`, dove per
quella coppia può essere rimasto il valore vecchio.

Verificato con 30 test: i cinque modi di scrivere lo stesso aeroporto danno 0 minuti e
nessun conflitto; Bari → Brindisi resta una tratta vera da 90 minuti e il conflitto viene
ancora segnalato.

---

## 🚗 Nuovo: la Flotta si legge a colpo d'occhio

Avevi ragione: **tutti i mezzi avevano lo stesso bordo grigio**
(`border-left: 4px solid #dde3ea`, fisso per ogni veicolo), quindi occupato e libero si
somigliavano. E da nessuna parte si vedeva *chi* stesse usando un mezzo.

Ora lo stato comanda tutto:

| Stato | Come si presenta |
|---|---|
| 🔴 **OCCUPATO** | bordo e sfondo rossi, barra di avanzamento del servizio in corso, la tratta, **chi lo sta guidando**, e `si libera alle 15:20 a Monopoli · fra 30m` |
| 🟢 **LIBERO** | bordo e sfondo verdi, `libero per 1h 10m`, poi il prossimo impegno con orario, tratta e autista |
| 🔑 **A NOLEGGIO** / 🚫 **FUORI SERVIZIO** | bordo ambra o grigio, niente programma |

In più:

- I mezzi e gli autisti sono **raggruppati per stato** — *Impegnati ora*, *Liberi ora*,
  *Non disponibili* — con il numero accanto a ogni gruppo.
- In cima ci sono i **contatori cliccabili**: tocchi «🔴 Impegnati ora» e resti solo con quelli.
- Nel programma di ogni mezzo ora compare **l'autista di ogni servizio** (e viceversa: sul
  giro di un autista compare il mezzo), con `⚠️ senza autista` in rosso dove manca.
- Due servizi consecutivi nello stesso posto mostrano `📍 stesso posto, 6h 15m di attesa`
  invece di un trasferimento inventato.

---

## 🚗 Nuovo: ordinare i servizi per mezzo

Accanto a «🚹 Autista» c'è **«🚗 Mezzo»**. Raggruppa la giornata per veicolo, con lo stesso
trattamento del giro autista: intestazione colorata per mezzo, collegamenti fra un servizio
e l'altro, e — con **2 giorni** attivo — oggi e domani in un elenco solo sotto lo stesso
mezzo, stacco notturno compreso.

---

## ⚡ Nuovo: il mezzo consigliato, un tocco

Come già succedeva per l'autista: su ogni servizio **che ha l'autista ma non il mezzo**
compare un pulsante col veicolo giusto già scelto. Un tocco e va in sospeso.

La scelta applica gli stessi controlli del menù a tendina — niente mezzi fuori servizio, a
noleggio, in conflitto o troppo piccoli per i pax — più due preferenze:

1. **il mezzo che quell'autista sta già usando in giornata** (non lo si fa cambiare furgone
   per niente);
2. a parità, **il più piccolo che basta**, per non bruciare il van grande su due passeggeri.

Se non c'è niente di adatto lo dice: `🚗 nessun mezzo libero`.

---

## 🧪 Come è stato verificato

Non solo a occhio. Tre batterie di test automatici, tutte verdi:

| Batteria | Cosa copre | Esito |
|---|---|---|
| `parseEuro_`, date, riposi | importi in 9 formati, indisponibilità in 8 formati, riposo fisso in 8 varianti | **26 ok** |
| `stessoLuogo_`, `driveTime_`, `stimaMin_` | il bug delle catene, con le controprove che Bari e Brindisi restano distinti | **17 ok** |
| motore lato app | trasferimenti, conflitti, candidato autista e candidato mezzo (capienza, fuori servizio, conflitti) | **13 ok** |
| app renderizzata in Chromium | stati flotta, filtri autisti e mezzi (singoli e combinati), ordinamenti, due giorni, assegnazione col tocco, modale — su **5 larghezze × 10 combinazioni** | **31 ok** |

L'ultima batteria ha trovato un difetto vero durante il lavoro: il pulsante del mezzo
consigliato non veniva inserito nella riga. Senza quel test sarebbe arrivato a te.

---

## 🏠 Nuovo: quando il mezzo torna in garage

**Perché non lo vedevi.** Il rientro alla base **era già calcolato** — `precalcolaCatene()`
salva in `_CacheTratte` la tratta `drop-off → Polignano` per ogni servizio (punto 3 della
funzione). Ma `getPlanData` non lo metteva nella risposta: la mappa `transfers` conteneva
solo le coppie servizio→servizio. Il dato esisteva sul foglio e non arrivava mai alla app.

Così la Flotta diceva *«si libera alle 15:30»* usando la fine del servizio — cioè l'ora in cui
il mezzo **stacca a Monopoli**, non quella in cui è di nuovo in sede.

**Cosa ho fatto.** Il backend ora manda `rientroMin` su ogni servizio e la app lo usa in
quattro punti:

| Dove | Cosa vedi ora |
|---|---|
| **Chip Flotta** | `⏳ stacca tra 40m (alle 15:30 a Monopoli)` `🏠 in garage 15:55` — il luogo dello stacco è esplicito, e se dopo non ha altri servizi compare l'ora di rientro |
| **Riga Flotta** | riga dedicata: `🏠 In garage alle 15:55 · tra 1h 05m` con sotto `ultimo stacco 15:30 a Monopoli + 25m di rientro` |
| **Timeline** | una barra tratteggiata dopo l'ultimo servizio = il viaggio di rientro; la scala oraria si allunga fino a comprenderla |
| **Dettaglio servizio** | nel sottotitolo: `🏠 in garage 15:55 (+25m)` |

**La regola resta quella dell'handoff**: fra un servizio e l'altro l'autista va **diretto**
(nessun passaggio dal garage); il rientro si conta solo dopo l'**ultimo** servizio della
giornata. Se l'ultimo servizio termina già a Polignano, il rientro è 0 e la riga lo dice.

⚠️ **Serve la cache piena.** I minuti di rientro vengono da `_CacheTratte`. Finché non lanci
`precalcolaCatene()` la app usa una stima in linea d'aria (distanza × 1,3 × 1,2) invece del
tempo Maps reale: gli orari ci sono comunque, ma sono approssimativi. È il motivo in più per
spuntare quella voce della lista.

Se il deployment non è aggiornato e il backend non manda `rientroMin`, la app **non mostra
nulla** invece di inventarsi che il mezzo è già in sede.

---

## 🖥️ Nuovo: layout da computer

La app era scritta solo per il telefono: su un monitor il contenuto si stirava per tutta la
larghezza, le righe diventavano lunghissime da leggere e la barra dei tab restava incollata
in fondo allo schermo. Ho aggiunto un layer responsive — **su telefono non cambia nulla**.

Da 820 px in su:

- il contenuto è centrato su una colonna leggibile (max 1120 px, 1320 px oltre i 1400 px);
- i **tab diventano una barra flottante** arrotondata al centro in basso, invece di una
  striscia larga quanto lo schermo;
- la **modale è una finestra centrata** e i campi dei Dettagli sono su **due colonne**:
  prima serviva scorrere per tre schermate, ora ci sta tutto in una;
- nella lista servizi compaiono **volo, fornitore e tariffa**, che riempiono lo spazio
  vuoto in mezzo alla riga;
- puntatore a manina e ombra al passaggio del mouse sugli elementi cliccabili.

Da 1080 px in su, **Flotta** e **Rent** si dispongono su **due colonne**.
(I due giorni della vista qui sotto restano invece sempre impilati: affiancati si leggevano male.)

Verificato con screenshot a 1920 · 1440 · 1024 · 768 · 390 px: nessun errore JavaScript e
nessuna barra di scorrimento orizzontale.

---

## 🗓 Nuovo: due giorni uno sotto l'altro

Nella barra dei filtri c'è il pulsante **🗓 2 giorni**. Attivandolo vedi la giornata scelta e
quella successiva **impilate**, ognuna con la sua fascia blu col nome del giorno e il suo
riepilogo — servizi, scoperti, incasso. Funziona su qualsiasi schermo, telefono compreso.

Dettagli utili:

- **è già istantaneo**: `load()` scaricava di nascosto il giorno prima e quello dopo, quindi
  la seconda giornata è quasi sempre già in memoria. Se manca, la carica e nel frattempo
  mostra la rotella;
- filtri, ordinamento e vista righe/card valgono per **entrambe** le giornate;
- toccando un servizio della seconda giornata, la app **si sposta su quel giorno** e apre lì
  il dettaglio: salvataggi e assegnazioni lavorano sempre sulla giornata giusta, senza
  stati ambigui;
- anche il pulsante **➕ candidato consigliato** della seconda giornata calcola l'autista
  sulle catene di quel giorno, non di quello ancorato;
- la scelta resta memorizzata sul dispositivo.

---

## 🔗 Nuovo: il giro di un autista su due giorni, di seguito

Con **2 giorni** attivo, scegliendo **Ordina → 🚹 Autista** le due giornate non restano più
separate: diventano **un elenco solo**, e sotto il nome di ogni autista trovi di fila i suoi
servizi di oggi e quelli di domani, in ordine di orario. Ogni riga porta la targhetta del
giorno (`gio 30/7`, `ven 31/7`).

Fra un servizio e il successivo dello stesso autista compare il **collegamento**, che è la
parte che serve davvero a capire se il giro regge:

| Cosa vedi | Significa |
|---|---|
| 🕳 `2h 10m liberi (trasf. 25m da Aeroporto di Bari a Monopoli)` | c'è margine: quanto tempo resta davvero libero, tolto il trasferimento |
| ⏱ `stretto: 15m di margine (trasf. 25m)` | ci arriva, ma senza respiro |
| ⛔ `non ci arriva: mancano 20m (trasf. 0m)` | **incastro impossibile**: i due servizi si accavallano |
| 🌙 `stacco notturno 10h 15m — chiude 19:45 a Aeroporto di Bari, riprende 06:00 da Polignano a Mare` | il salto fra le due giornate, con dove finisce e dove ricomincia |

I collegamenti compaiono anche ordinando per autista su **una giornata sola**.

Tornando a **Ordina → Orario** (o a fornitore / scoperti) si riprende la vista con le due
giornate impilate e separate, come prima.

---

## 🚹🚗 Nuovo: togliere autisti — e mezzi — dalla vista

Sotto la riga «Ordina» ci sono **due file di chip**: una per gli **autisti**, una per i
**mezzi**, con lo stesso identico funzionamento. Ogni chip porta il colore e il numero di
servizi di quella persona o di quel veicolo nei giorni visibili.

- **Un tocco lo toglie** dall'elenco: il chip diventa grigio barrato e i suoi servizi
  spariscono. Ritoccalo e torna. Puoi nasconderne quanti vuoi, su entrambe le file.
- **Tutti** rimette tutto. **Nessuno** toglie tutto: da lì un tocco su chi ti interessa e
  vedi **solo il suo giro** (due tocchi in tutto).
- Ci sono anche **⚠️ Senza autista** e **⚠️ Senza mezzo**, per isolare in un colpo quello che
  è ancora scoperto — o al contrario per nasconderlo mentre controlli il resto.
- A destra di ogni fila un contatore dice quanti ne stai vedendo (`3 di 4`).
- **I due filtri si combinano**: puoi togliere Marco Rossi *e* il Vito 1 nello stesso momento.
- In vista 2 giorni i conteggi sono sulla **somma delle due giornate** e i filtri le tagliano
  tutte e due.
- Internamente si memorizza chi è **nascosto**, non chi è mostrato: così se cambi giornata e
  compare un autista o un mezzo nuovo, resta visibile invece di sparire.
- I nomi non finiscono mai dentro il codice dei pulsanti: si passa un indice, così gli
  autisti con l'apostrofo non rompono la pagina (stesso accorgimento del punto 3).

---

## ✅ Come verificare dopo il deploy

1. Apri un servizio con una tariffa con i centesimi → il **totale incasso** in cima deve
   corrispondere alla somma reale.
2. Su quello stesso servizio premi **💾 Salva dettagli** senza cambiare nulla → sul foglio
   tariffa, data e ora devono restare **identiche** (prima la tariffa si moltiplicava per 10).
3. Esegui `pulisciLuoghi()` e controlla che nel tab `Luoghi` ci siano **ancora entrambi**
   gli aeroporti con le loro coordinate.
4. Metti una data in «Indisponibilità» di un autista e verifica che compaia sotto
   *🚫 Non disponibili* nel menù del giorno giusto.
5. Togli l'autista da un servizio e salva → il payload al webhook deve avere `autista: ""`.
6. **Flotta** → un mezzo il cui ultimo servizio finisce lontano da Polignano deve mostrare
   `🏠 In garage alle …` con un'ora **successiva** allo stacco. Se le due ore coincidono
   sempre, la cache tratte è vuota: lancia `precalcolaCatene()`.
7. **🗓 2 giorni** → devono comparire due fasce blu, una sotto l'altra, con i due giorni.
8. **Filtri autisti e mezzi** → tocca un autista e un mezzo: le loro righe spariscono e i
   chip si barrano; ritoccali e tornano. «Nessuno» + una voce deve lasciare solo quel giro.
9. **2 giorni + Ordina per Autista (o Mezzo)** → sotto ogni nome devono comparire i servizi
   di entrambe le giornate, con il 🌙 stacco notturno in mezzo e i collegamenti colorati.
10. **Il caso dell'aeroporto** → apri un servizio che consegna in aeroporto e uno che ritira
    dallo stesso aeroporto subito dopo: nella Flotta e in Ordina→Autista deve comparire
    `📍 stesso posto`, **non** un incastro impossibile.
11. **Flotta** → i mezzi occupati devono essere rossi con la barra di avanzamento e il nome
    di chi li guida; i contatori in cima devono filtrare.

---

## 📋 Lista aperta aggiornata

- [ ] Incollare **Codice.gs** e **Index** aggiornati, salvare, → **Nuova versione** del deployment
- [ ] Creare il trigger `onNuovoTransfer` (Da foglio di lavoro → Al cambio)
- [ ] Portare `precalcolaDomani` da giornaliero a **ogni ora**
- [ ] Eseguire `pulisciLuoghi()` — ora è sicuro — e controllare il tab Luoghi
- [ ] Eseguire `precalcolaCatene()` per riempire la cache
- [ ] Archiviare il workflow n8n «Planner - Proposta Incastri»
- [ ] **Revocare la chiave API n8n** condivisa in chat

### Cose che ho lasciato come sono (per scelta, non per dimenticanza)
- `assignBatch` non ha il controllo anti-conflitto che ha `assignService`: se due persone
  salvano lotti contemporaneamente, l'ultimo vince in silenzio. Con un solo utente non è
  un problema; si può aggiungere se dai l'accesso ai collaboratori.
- `_CacheTratte` non scade mai. È voluto (tempi senza traffico), ma se cambia la viabilità
  di una tratta va cancellata la riga a mano.
- I servizi che finiscono dopo mezzanotte vengono considerati chiusi a fine giornata
  (in Timeline la barra si ferma alle 24:00). Era già una scelta dichiarata.
