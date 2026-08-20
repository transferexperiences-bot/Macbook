# Calcola Tariffa Prenotazioni — le regole, come sono davvero

Workflow n8n `APv3ZqEizY1HnPia`, attivo, 10 nodi. Sotto-workflow: lo si chiama, non parte da solo.
Riceve `da`, `per`, `pax`, `veicolo`, `fornitore`, `orario`, `row`.

Questo documento è **letto dal codice vivo il 19/08/2026**, nodo per nodo. Non è un ricordo: le
regole del prezzo non erano scritte da nessuna parte in questo repo, e quindi esistevano solo
dentro il codice. Adesso stanno anche qui.

Le costanti, tutte in `Calcola Tariffa`:

```
RATE     = 2,00 €     ROAD  = 1,3 (fattore strada su distanza in linea d'aria)
SOGLIA   = 5 km       MINIMO = 30 €      EURO_KM = 1,00 €/km
garage   = Polignano a Mare (40.9942, 17.2217)
```

## 1. I due luoghi → un comune

`Prepara Ricerche` risolve **Da** e **Per**, in quest'ordine di priorità:

1. **coordinate scritte nel testo** (`40.952,17.296`) — accettate solo se cadono in Italia
2. **link Google Maps** → segue il redirect, estrae le coordinate, e fra tutte quelle plausibili
   sceglie **la più vicina alla Puglia** (40.8, 17.2)
3. **match diretto** su una tabella fissa: aeroporti Bari, Brindisi, Roma, Napoli; stazioni Bari,
   Lecce, Brindisi, Polignano
4. **geocodifica per nome** (sotto-workflow `Risolvi Luogo`, `B1jaBroC20KIiibN`)

Poi Nominatim (reverse) trasforma le coordinate nel **comune**. Restano in mano quattro cose per
capo: nome scritto, nome risolto, comune, coordinate.

## 2. Quale listino

`Leggi Fornitori` → foglio **`Fornitori e strutture`** del gestionale
(`1nqmt8_4Oy8paHlPU8LTBLEvl-quW0DYgTtmB73nBxPw`).

- riga del fornitore: prima match **esatto**, poi `includes` **nei due sensi**
- veicolo tuk-tuk / ape / calessino → colonna **Listini Tuk-tuk**, altrimenti **Listino auto/minivan**
- fornitore non trovato → riga **Generico**; se manca pure quella, se ne costruisce una al volo
- dalla riga si prendono anche **% fee** e **€/min**

## 3. Quale colonna di prezzo

Le colonne del listino con intestazione **numerica** sono le soglie pax (es. `3`, `6`, `8`).

- pax ≤ prima soglia → prima colonna
- pax ≤ seconda soglia → seconda colonna
- altrimenti → **terza colonna**, se c'è; se non c'è → `warning: pax-oltre-listino`

## 4. Il prezzo: la cascata

Per **ognuno** dei due capi (Da e Per):

1. **Esatto** — il nome scritto (o quello risolto) è una riga `Destinazione` del listino → si
   prende quel prezzo.
2. **Comune + raggio** — non c'è la riga esatta, ma c'è il **comune**: si prende il prezzo del
   comune e ci si aggiunge il supplemento per quanto il punto è lontano **dal centro** di quel
   comune:

   ```
   km ≤ 5      → supplemento 0
   km > 5      → supplemento = arrotonda( (km − 5) × 1,3 × 2,00 € )
   ```

   È la regola del «luogo specifico»: la masseria fuori paese costa il paese più la strada in più.

**prezzoBase = il PIÙ ALTO dei due capi** (`MAX(Da, Per)`), non la somma.

3. **Nessuno dei due capi è nel listino** → si passa ai **km dal garage**, ma solo se ci sono
   tutte e quattro le coordinate:

   ```
   km = (garage → Da) + (Da → Per) + (Per → garage), ognuno × 1,3
   base = MAX( arrotonda(km × 1,00 €) , 30 € )
   ```

4. Niente listino e niente coordinate → `warning: nessun-match`, tariffa **0**.

## 5. Gli aggiustamenti finali

```
notturno: orario prima delle 07:00 → × 1,2
ore extra: €/min × minuti
tariffa = arrotonda( base × notturno + extra )
```

In uscita ci sono sia `tariffaListino` sia `tariffaKm`, più `matchEsatto`, il listino usato e il
dettaglio: da dove viene il numero si può sempre vedere.

---

# Cosa NON funziona come dice di funzionare

Letto il 19/08. Sono tutte cose sui **soldi**: 🔴 rossa, quindi qui sono solo scritte. Nessuna è
stata toccata.

### 1. Il ripescaggio su «Generico» non avviene

`Trova Listino` prepara di proposito un secondo tentativo:

> *«se listino primario != Generico → aggiungi Generico come 2° tentativo, così Calcola Tariffa,
> se non trova la destinazione nel listino primario, può ripescare da Generico»*

Il foglio Generico **viene letto davvero**, ma `Calcola Tariffa` costruisce l'elenco delle tratte
**solo dal listino primario** (la variabile `prim`, che si ferma appena il `row_number` riparte da
capo). Le righe del Generico finiscono in memoria e non le guarda nessuno.

**Effetto:** destinazione assente dal listino del fornitore → non si ripesca niente, si va dritti
ai km dal garage. Che è una tariffa diversa, e più bassa quasi sempre.

### 2. Le ore extra non si pagano mai — due volte

- `Prepara Ricerche` costruisce il pacchetto con `row, da, per, pax, veicolo, fornitore, orario`:
  **`hextra` non c'è**. `Calcola Tariffa` legge `ctx.hextra`, che è sempre vuoto → minuti = 0.
- E anche se ci fosse: `Trova Listino` **calcola** `euroMin` dalla riga del fornitore ma **non lo
  mette** nell'oggetto che passa avanti (lo mette solo, a zero, nella riga Generico). Quindi
  `€/min` letto da `Calcola Tariffa` è sempre 0.

**Effetto:** `extra` è sempre 0. La colonna €/min del foglio Fornitori, oggi, non serve a niente.

### 3. La `% fee` si legge e si butta

`extraFeeOraria` viene estratta dalla riga del fornitore e passata avanti. In `Calcola Tariffa`
non compare in nessun conto.

### 4. Il supplemento dal centro vale solo per 18 comuni

La tabella dei centri è **fissa dentro il codice**: Bari, Bari Airport, Brindisi, Brindisi
Airport, Conversano, Monopoli, Polignano, Alberobello, Ostuni, Fasano, Castellana Grotte, Cozze,
Mola di Bari, Martina Franca, Locorotondo, Cisternino, Lecce.

Un comune fuori da questa lista (Savelletri, Torre Canne, Carovigno, Putignano, Noci…) → la
funzione torna **supplemento 0**, in silenzio. La masseria fuori paese costa come il paese.

### 5. Se il calcolo va in errore, non risponde nessuno

Il nodo `IF Errore`: quando l'errore c'è, il ramo «vero» **non è collegato a niente**. Errori
possibili: `Da/Per mancanti`, `Colonna Fornitori non trovata`, `Colonna Listino non trovata`.

**Effetto:** in quei casi il workflow non restituisce né un prezzo né un messaggio. Chi ha
chiamato riceve il vuoto — che è esattamente il tipo di silenzio che qui non si vuole.

### 6. Il fornitore si cerca anche «per somiglianza»

Match esatto, poi `includes` nei due sensi: `«Musae»` aggancia il primo fra «Musae al Mare» e
«Musae Relais & SPA» che capita nell'ordine del foglio. Sui listini, prendere quello dell'altra
struttura è un errore che non si vede.

### 7. Pietra Blu: tariffa 0 su ogni corsa — ✅ **RISOLTO IN PARTE il 19/08 sera**

Le colonne erano `≤ 2 pax` e `> 3 pax`. Agostino le ha rinominate `2` e `3`; poi la seconda è
diventata `7` — quella l'ho scritta io da n8n su sua richiesta («usa il bridge n8n»), con un
workflow una tantum che **prima legge** la cella e scrive solo se ci trova `3`
(esecuzione `769083`: letto `3` → scritto `7` → riletto `7`, una cella aggiornata). Il workflow
è stato archiviato subito dopo. Ora il listino Pietra Blu ha colonne `2` e `7`, e **un prezzo
c'è per qualunque numero di passeggeri fino a 7**.

Resta vero che con 11 sole destinazioni in listino quasi tutto cade sul prezzo del comune
(Polignano, 30 €): `Pietra Blu → Alberobello` oggi dà **30 €** contro i **100 €** incassati.
Col ripescaggio sul Generico darebbe **95 €**. È il punto 1, e su Pietra Blu morde eccome.

<details><summary>com'era prima della rinomina</summary>


Il più grosso, e si vede solo mettendo insieme codice e dati. Le colonne di prezzo vengono
riconosciute solo se l'intestazione è **un numero secco** (`/^\d+$/`). Le intestazioni vere:

| listino | intestazioni | il codice le vede? |
|---|---|---|
| Generico, Melograno, Cala Ponte, Puglia Mare, La Peschiera, Antico Mondo… | `2` `7` `9` | sì |
| Auraterrae | `7` `9` | sì (un 1 pax paga la colonna 7) |
| Tuo Hotel, Longo, Sparano, De Napoli | `2` `7` | sì |
| Viator | `8` | sì |
| **Pietra Blu** | **`≤ 2 pax`  `> 3 pax`** | **NO → `no-colonne-prezzo` → tariffa 0** |

Provato sul banco con le corse vere di Pietra Blu: `status: warning`, `tariffa: 0`, sempre.
Si sistema in due modi — o si rinominano le due colonne del listino in `2` e `3`, oppure il
codice impara a leggere il numero dentro l'intestazione (è la correzione provata in
`calcola-tariffa-CORRETTO.js`, che tiene anche il senso di «>»: da lì in su).
</details>

### 8. e 9. — ⚠️ CORRETTE il 20/08: avevo letto male il foglio

Il 19/08 avevo scritto che la colonna «Listini Tuk-tuk» conteneva dei numeri e che «€/min» era
vuota per tutti. **Era sbagliato, ed era un errore mio**: il lettore di fogli che uso qui
sbagliava a gestire le celle vuote e faceva scivolare i valori di una colonna. Riletto con il
lettore corretto, la verità è l'opposto:

| colonna | cosa contiene davvero |
|---|---|
| C · «Listini Tuk-tuk» | **vuota per tutti**, tranne Puglia Mare: «Puglia Mare Tuk-tuk» |
| D · «€/min» | **1,0** per quasi tutti, **1,3** per Auraterrae, 0,8 e 0,59 per due |

Quel «1,3» di Auraterrae è esattamente il **€/km** che la regola di Transfer Experience assegna
ad Auraterrae. Quindi la colonna intitolata «€/min» in realtà contiene il **€/km**, ed è rimasta
a 1,0 per tutti gli altri, commissione o no. È il motivo per cui il 19/08 Agostino ha deciso:
il €/km si calcola dalla percentuale, non si legge da lì.

**Cosa cambia per il codice pubblicato: niente.** La v3 calcola €/km e €/min dalla `% fee`
(colonna E), che ho letto giusta in tutti e due i casi. E la correzione a `Trova Listino` resta
valida e anzi più utile di quanto pensassi: la colonna del listino tuk-tuk **esiste davvero** e
non veniva mai trovata per via del plurale.

<details><summary>com'era scritto qui prima della correzione</summary>

#### (versione sbagliata) La colonna «Listini Tuk-tuk» non contiene listini

Su 1028 righe di `Fornitori e strutture`, la colonna C contiene **numeri** (1.0, 1.3, 0.8, 0.59)
per 98 fornitori, ed è vuota per 916. **Un solo fornitore ha un nome di listino: Puglia Mare**
(«Puglia Mare Tuk-tuk»). Il codice usa quel valore **come nome di foglio**: per chiunque altro
chieda un tuk-tuk cercherebbe un foglio chiamato «1.3» → non lo trova → nessun listino.

Stessa cosa per due righe (Ave Italia Tours, Gtours) che come **listino auto/minivan** hanno il
numero `1291`.

### 9. La colonna «€/min» è vuota per tutti

Vuota su 992 righe, `0` su 35, e vale `1.0` solo per Puglia Mare. Quindi anche riparando la
tubatura del punto 2, le ore extra resterebbero a zero finché la colonna non si riempie.


</details>

### 10. Il nome del file in `CLAUDE.md` era sbagliato — corretto

Il file `1nqmt8_…` si chiama davvero **«Programma Autisti 2.0»** (verificato su Drive il 19/08);
`Prenotazioni NCC 3.0` è il nome della **scheda** dentro. n8n aveva ragione, `CLAUDE.md` no:
l'ho corretto lì.


---

# Il banco: cosa dice il calcolatore sulle corse vere

`node banchi/te/banco-tariffa.js` — gira il **codice vero** dei due nodi
(`calcola-tariffa.js`, `trova-listino.js`, copiati verbatim) sui **listini veri** del gestionale
e su **corse vere** prese dal foglio Strutture, ognuna con la tariffa incassata davvero.

| corsa | pax | incassato | calcolatore oggi |
|---|---|---|---|
| Auraterrae → Ostuni | 2 | 120 € | 120 € |
| Monopoli → Melograno | 2 | 35 € | 30 € |
| Auraterrae → Monopoli | 4 | 60 € | 60 € |
| **Pietra Blu → Alberobello** | 2 | 100 € | **0 € — non risponde** |
| Polignano → APT di Bari | 2 | 110 € | 120 € |
| Melograno → Polignano | 7 | 70 € | 55 € |
| Auraterrae → APT di Bari (07:00) | 1 | 130 € | 130 € |
| Grotte di Castellana → Polignano | 2 | 60 € | 60 € |
| Polignano → Sabbiadoro | 4 | 50 € | 65 € |
| Stazione di Bari → Melograno | 2 | 150 € | 115 € |
| Peschiera → Monopoli | 1 | 50 € | 40 € |
| Auraterrae → San Vito | 2 | 40 € | 40 € |
| **Pietra Blu → San Vito** | 2 | 0 € | **0 € — non risponde** |

Le differenze fra «incassato» e «calcolatore» non sono tutte errori del calcolatore: molte sono
prezzi decisi a mano, sconti, accordi. Ma **cinque casi su tredici** hanno uno scarto, e su due
il calcolatore non risponde affatto: è il conto che vale la pena guardare riga per riga insieme.

**Il ripescaggio (punto 1), dopo la rinomina:** su Pietra Blu cambia eccome, perché il suo
listino ha 11 destinazioni e tutto il resto cade sul prezzo del comune.

| corsa | oggi | col ripescaggio | incassato |
|---|---|---|---|
| Pietra Blu → Alberobello, 2 pax | 30 € | 95 € | 100 € |
| Pietra Blu → Alberobello, 4 pax | 40 € | 110 € | 125 € |

Sulle altre strutture, che hanno listini pieni, non cambia niente.

---

# ✅ PUBBLICATO — 19/08/2026, 22:40

Workflow `Calcola Tariffa Prenotazioni` (`APv3ZqEizY1HnPia`), nodo **Calcola Tariffa**.

| | |
|---|---|
| versione nuova (attiva) | `758a42f6-3e13-4041-b442-4e75855c7e37` — «Ripescaggio sul listino Generico» |
| versione precedente (per tornare indietro) | `6524bc93-0d76-4b8c-9053-499eb12142ae` |
| copia verbatim di com'era | `n8n/calcola-tariffa/calcola-tariffa.js` |
| codice pubblicato | `n8n/calcola-tariffa/calcola-tariffa-NUOVO.js` |

**Cosa cambia**
1. **Ripescaggio sul Generico** — se una destinazione non è nel listino della struttura, si cerca
   nel Generico (che veniva già letto e poi buttato via). Quando succede lo dichiara:
   `ripescatoDa`.
2. **Colonne di prezzo** — il numero si legge anche dentro un'intestazione tipo `≤ 2 pax`, così
   un listino scritto in un altro modo non azzera più le tariffe.

**Cosa NON cambia, di proposito:** la scelta della colonna in base ai pax resta identica, anche
dove è discutibile (listino 2/7/9 con 12 pax → colonna 9). Cambiarla avrebbe trasformato dei
prezzi in zeri, e uno zero blocca un transfer: in dubbio si tiene.

**Verifiche fatte, in ordine**
- banco offline sui listini veri e su 14 corse vere: `banchi/te/banco-tariffa.js`, verde;
- riletto il nodo dal server dopo la pubblicazione;
- provato dentro n8n con dati appuntati, esecuzione **769636**:
  `Pietra Blu → Alberobello, 2 pax` → **95 €**, `ripescatoDa: "Generico"`,
  capo «per» risolto `{prezzo: 95, mode: "esatto", dest: "Alberobello", daFallback: true}`.
  Prima della modifica la stessa corsa dava 30 € (prezzo del comune Polignano).

**Se qualcosa non torna:** si ripristina la versione precedente dallo storico del workflow
(`restore_workflow_version` con l'id qui sopra), oppure si reincolla `calcola-tariffa.js`.


---

# ✅ PUBBLICATO — 20/08/2026, 10:18 (v3)

Versione attiva `b499ab29-41fb-42a5-87b1-e90f88aeb7ec`, nodi **Calcola Tariffa** e
**Trova Listino**. Codice: `calcola-tariffa-v3.js` e `trova-listino.js`.

**Deciso da Agostino, e messo in pratica**

1. **€/km e €/min = 1,00 € + la percentuale della struttura**, arrotondato ai 10 centesimi.
   La commissione la paga il chilometro, non il margine.

   | % fee | €/km e €/min |
   |---|---|
   | 0% | 1,00 |
   | 7% (Melograno, La Peschiera) | 1,10 |
   | 10% (De Napoli) | 1,10 |
   | 20% (Pietra Blu, Antico Mondo, 6 Stelle) | 1,20 |
   | 26% (Auraterrae) | 1,30 |
   | 30% | 1,30 |

2. **Un prezzo fatto a km si arrotonda ai 5 €** (minimo 30). I listini sono tutti multipli di
   5: un prezzo inventato deve somigliare a un prezzo vero.
3. **Il tuk-tuk non si quota mai a km.** Raggio corto, prezzi bassi: o la tratta è nel suo
   listino, o si risponde `tuk-tuk-fuori-listino`. Prima, con i km, un tuk-tuk per Matera
   veniva quotato **165 €**.
4. **Notturno 22:00–07:00** (+20%), com'è scritto nelle regole di Transfer Experience. Il
   codice guardava solo `ora < 07:00` e si perdeva le due ore prima di mezzanotte.
5. **Le ore extra arrivano al calcolo.** `hextra` non passava da «Prepara Ricerche»: ora si
   legge anche dall'input del trigger, senza toccare gli altri nodi.

**Un guasto trovato lungo la strada.** In `Trova Listino` la colonna del listino tuk-tuk si
cercava con `/listino.*tuk/`, ma la colonna si chiama **«Listini Tuk-tuk»**, al plurale:
non è mai stata trovata. Quindi **nessuna corsa in tuk-tuk ha mai avuto un listino** — nemmeno
Puglia Mare, l'unico che ce l'ha. Corretto. In più, in quella colonna per quasi tutti c'è un
**numero** (1,0 · 1,3 · 0,8): è il vecchio €/km, e un numero non è il nome di un foglio, quindi
ora viene ignorato.

**Verifiche**: banco `banchi/te/banco-tariffa.js` verde su listini e corse vere; riletto il
nodo dal server; provato dentro n8n con dati appuntati, esecuzione **772611** —
`Monopoli → Melograno, 23:30` → **36 €** con `moltiplicatoreNotturno 1.2` e `euroKm 1.1`
(Melograno, 7%). Prima: 30 €. Incassati davvero: 35 €.

## ⚠️ Da allineare: il notturno nel nodo «Applica listino imparato»

La notte fra il 19 e il 20 un'altra sessione ha aggiunto due nodi **dopo** Calcola Tariffa
(«Leggi listino imparato» e «Applica listino imparato», versioni `b72c7973`, `30e823b8`,
`9d37d07d`). Il mio aggiornamento si è innestato **sopra** il loro: nessuno dei due nodi nuovi
è stato toccato, e l'esecuzione 772611 lo attraversa intatto.

Ma quel nodo **riapplica il notturno per conto suo**, con la regola vecchia:

```js
const mol = (ora && !isNaN(hh) && hh < 7) ? 1.2 : 1;
```

Quindi quando risponde il listino imparato, una corsa alle 23:30 **non** prende il +20%.
È una riga sola da cambiare in `(hh >= 22 || hh < 7)`, ma quel nodo ha il suo banco
(`banchi/te/banco-applica-imparato.js`) che **non è su questo ramo**: si sistema da lì, non
alla cieca.
