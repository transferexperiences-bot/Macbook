# Catene: cosa si rompe se sposto questo servizio

Risposta all'handoff *«Plancia: catene e tempi quando sposti un servizio»*.

---

## ⚠️ Prima di tutto: due copie diverse della app

L'handoff parla della scheda **🎛 Plancia** (`#plcard`, `.pllane`, `plDurata()`, `plFine()`,
zoom `te_plz`, 148 controlli, trappole 11-13 di `CLAUDE.md`).

**In questo repo la Plancia non esiste.** La copia da cui si è partiti — lo zip
`te-planner-repo.zip` — ha un solo commit, nessuna traccia di Plancia in tutta la storia, e
partiva da 97 controlli. Qui sopra ci si è aggiunta la scheda **🧩 Assegna** (vedi
[ASSEGNA.md](ASSEGNA.md)) arrivando a 151, e ora il motore delle catene: **184**.

Sono due rami paralleli della stessa app. Si sovrappongono in un punto solo, ed è un punto
delicato: **`test/app.test.js` sezione 8**, che di là è la Plancia desktop e di qua è la
scheda Assegna.

Quindi: **prima di scrivere l'interfaccia della Plancia serve il `src/Index.html` vero**,
quello che gira su Apps Script. Riscriverla da zero qui significherebbe buttare via il lavoro
già fatto di là.

Quello che si poteva fare senza quel file è **il motore**, che non dipende dal disegno.

---

## Cosa è pronto

`docs/blocco-catene.js` — 125 righe da incollare dentro `src/Index.html`, nel `<script>`,
subito prima di `/* ---------- viste ---------- */`. Dipende solo da funzioni che esistono
già in tutte e due le copie: `trf()`, `conflict()`, `stessoLuogoUI()`, `normLuogoUI()`,
`isCanc()`, `garageInfo()`, `STRETTO`.

### `plCatena(servizio, veicoloIpotetico)`

Firma e campi come chiesti dall'handoff, più due cose emerse scrivendolo:

```js
{
  arrivo:    635,            // minuti: quando il mezzo è materialmente sul pick-up
  daDove:    {…servizio…},   // il servizio precedente su quella catena, o la stringa 'garage'
  trasf: 35, buffer: 15,     // da trf(): stesso luogo ⇒ 0 e 0
  margine:   10,             // arrivo → inizio, col segno. negativo = non ci arriva
  k:         'stretto',      // ok · stretto · finestra · rotto · libero
  stima:     false,          // true = trf() non aveva la coppia e ha usato i 30' di default
  finestra:  0,              // minuti di tolleranza bagagli su QUESTO servizio
  sovrapposti: [ …servizi… ],// se si accavalla: forzabile, ma rosso
  aValle:    [ {id, srv, era, diventa, margine, ritardo, stima} ],
  liberati:  [ {id, srv, era, diventa, guadagno} ],
  rientro:       {prima: 560,  dopo: 1330},   // catena di destinazione
  rientroOrigine:{prima: null, dopo: null}    // catena da cui il servizio se ne va
}
```

- **`daDove: 'garage'`** — se sul mezzo scelto non c'è nessun servizio prima, `arrivo` e
  `margine` restano **`null`**. Base → pick-up non sta in `_CacheTratte` e non si chiama Maps
  dal frontend: la piazzola resta verde e scrive «parte dal garage», non un'ora inventata.
- **`stima: true`** — `trf()` senza la coppia in `DATA.transfers` torna 30 minuti di default.
  Va scritto «(stima)» accanto al numero, come chiede l'handoff §4.
- **`aValle`** contiene solo ciò che **cambia davvero**. Gli orari degli altri servizi sono
  appuntamenti fissi: infilando un servizio in mezzo, l'unico a cui cambia qualcosa è il
  **primo successivo**, perché gli cambia chi lo precede. Da lì in poi la catena è identica.
  Se un giorno i servizi diventassero spostabili, questa è la riga da rivedere.
- **`liberati`** è la stessa cosa vista dalla catena di partenza: il successivo di lì
  riprende fiato, e `guadagno` sono i minuti di margine che ci guadagna.

`plCatenaAutista(servizio, autistaIpotetico)` è la stessa funzione sull'altra catena — è
`catenaIpotesi(S, chiave, valore)` con `chiave` `'veicolo'` o `'autista'`. Un motore solo,
come chiede l'handoff §6.

### `finestraInizio(servizio)` — la regola degli arrivi

Un servizio con un **volo** che parte da un **aeroporto** può cominciare fino a **20 minuti**
dopo l'ora scritta: il cliente è al nastro bagagli. Fuori da quel caso, zero.

L'aeroporto si riconosce con `normLuogoUI()`, che porta «Aeroporto di Bari», «Apt Bari»,
«Aeroporto di Bari - Arrivi» e perfino «aereoporto» tutti a `apt`: nessun elenco di nomi
scritto a mano da tenere aggiornato.

`giudizioMargine(margine, finestra)` traduce in colore:

| margine | senza volo | con volo dall'aeroporto |
|---|---|---|
| ≥ 20 min | 🟢 `ok` | 🟢 `ok` |
| 0 … 19 | 🟡 `stretto` | 🟡 `stretto` |
| −1 … −20 | 🔴 `rotto` | 🟡 `finestra` (arriva mentre ritira i bagagli) |
| oltre −20 | 🔴 `rotto` | 🔴 `rotto` |

### `oreAutista(nome, servizioDaAggiungere)`

`{inizio, fine, minuti, garage, oltre}` — dalla prima partenza all'ultimo rientro in garage.
`oltre: true` sopra le **12 ore** (`ORE_AUTISTA_MAX`). Non è un divieto: è un numero che oggi
si scopre solo a fine giornata. Passando il servizio che si sta per assegnare si vede la
giornata **come sarebbe dopo la mossa**.

---

## Cosa manca (serve il file vero)

Tutto il lato interfaccia dei criteri di accettazione dell'handoff:

1. le piazzole verdi che scrivono ora di arrivo e margine;
2. l'avviso a valle sotto la piazzola;
3. il tempo che si libera sulla riga di provenienza;
4. il verde/rosso dei voli **in Plancia** (la regola c'è ed è testata, va solo letta lì);
5. la miniatura `#plcard` a 390px che non copre le piazzole.

I dati per scriverli ci sono già tutti nell'oggetto qui sopra: è lavoro di resa, non di
calcolo.

---

## Test — `test/motore.test.js`, 33 controlli nuovi

- **Finestra dei voli**: aeroporto + volo = 20 minuti; aeroporto senza volo = 0; volo con
  partenza in città = 0; «Apt Bari - Arrivi» riconosciuto; i cinque casi di
  `giudizioMargine`.
- **`plCatena`**: da dove arriva, ora sul pick-up, margine col segno, `stima` falsa quando la
  tratta è vera.
- **Effetto a valle**: il servizio successivo passa da `ok` a `rotto` e dice di quanti minuti.
- **Mezzo libero**: `daDove: 'garage'`, `arrivo` e `margine` `null`, piazzola verde.
- **Sovrapposizione**: elencata e rossa (forzabile, non bloccata).
- **Cosa si libera**: il successivo sulla catena di partenza passa da `rotto` a `ok`, con i
  minuti guadagnati.
- **Rientro in garage** prima e dopo la mossa.
- **Ore autista**: 12h 40m ⇒ `oltre: true`; nessun servizio ⇒ `null`, niente numeri inventati.
- **Catena autista** identica a quella mezzo; **stesso luogo** ⇒ trasferimento 0 e buffer 0
  anche qui (trappola 4, non deve regredire).
