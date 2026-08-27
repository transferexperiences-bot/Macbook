# Catene: cosa si rompe se sposto questo servizio

Risposta all'handoff *«Plancia: catene e tempi quando sposti un servizio»*.

---

## Prima: le due copie sono state riunite

L'handoff parlava della scheda 🎛 Plancia, che nella copia di partenza **non esisteva** (lo zip
aveva un commit solo, nessuna traccia di `.pllane` o `plDurata()`). Erano due rami paralleli
dello stesso file, destinati a scontrarsi su `test/app.test.js`.

Agostino ha mandato il `src/Index.html` vero di Apps Script e la Plancia è stata **innestata**
nella copia collaudata. Ora c'è **un file solo** con tutte e sei le schede, e le sezioni dei
test non si pestano più i piedi:

| sezione | cosa copre |
|---|---|
| 8 · 8bis | scheda Assegna, desktop e 390px |
| 9 · 9bis | Plancia e catene, desktop e 390px |

Durante l'innesto è saltata fuori una cosa: `renderPlancia` scriveva la barra dei salvataggi
in sospeso come `<div class="pend">`, una classe che nel CSS non esiste — la barra era senza
stile. Ora usa `barraPend()`, la stessa di Servizi e Assegna.

---

## Il motore

`catenaIpotesi(S, chiave, valore, salta)` — con `chiave` `'veicolo'` o `'autista'` — è l'unica
funzione che risponde. Scorciatoie: `plCatena(S, veicolo)` e `plCatenaAutista(S, autista)`.

```js
{
  arrivo:    635,            // minuti: quando il mezzo è materialmente sul pick-up
  daDove:    {…servizio…},   // il precedente su quella catena, o la stringa 'garage'
  trasf: 35, buffer: 15,     // da trf(): stesso luogo ⇒ 0 e 0
  margine:   10,             // arrivo → inizio, col segno
  k:         'stretto',      // ok · stretto · finestra · rotto · libero
  stima:     false,          // true = trf() non aveva la coppia, ha usato i 30' di default
  finestra:  0,              // tolleranza bagagli su QUESTO servizio
  sovrapposti: [ …servizi… ],
  aValle:    [ {id, srv, era, diventa, margine, ritardo, stima} ],
  liberati:  [ {id, srv, era, diventa, guadagno} ],
  rientro:       {prima, dopo},   // garage della catena di destinazione
  rientroOrigine:{prima, dopo}
}
```

Tre scelte che valgono più del codice:

- **Dal garage non si inventa un'ora.** Senza servizio precedente `arrivo` e `margine` restano
  `null`: base → pick-up non sta in `_CacheTratte` e da lì non si chiama Maps. La piazzola è
  verde e scrive «dal garage».
- **`aValle` è il solo servizio successivo.** Gli orari sono appuntamenti fissi: infilando un
  servizio in mezzo, l'unico a cui cambia qualcosa è quello subito dopo, perché gli cambia chi
  lo precede. Se un giorno i servizi diventassero spostabili, questa è la riga da rivedere.
- **Sulla catena del mezzo i servizi dello stesso autista non contano.** Viaggiano insieme: è
  la stessa esenzione che c'è in `plScontro()` e nel menù del dettaglio, passata come `salta`.

### La regola degli arrivi

`finestraInizio(s)`: un servizio con **volo** che parte da un **aeroporto** può cominciare fino
a **20 minuti** dopo l'ora scritta — il cliente è al nastro. L'aeroporto si riconosce con
`normLuogoUI()`, che porta «Aeroporto di Bari», «Apt Bari», «Aeroporto di Bari - Arrivi» e
perfino «aereoporto» a `apt`: nessun elenco di nomi da tenere aggiornato.

**Questa regola sta dentro `conflict()`**, non dentro la Plancia, come chiede l'handoff §6: così
Servizi, Assegna, Flotta, Timeline e Plancia danno la stessa risposta sullo stesso servizio.

| margine | senza volo | con volo dall'aeroporto |
|---|---|---|
| ≥ 20 min | 🟢 `ok` | 🟢 `ok` |
| 0 … 19 | 🟡 `stretto` | 🟡 `stretto` |
| −1 … −20 | 🔴 `rotto` | 🟡 `finestra` — arriva mentre ritira i bagagli |
| oltre −20 | 🔴 `rotto` | 🔴 `rotto` |

### Ore dell'autista

`oreAutista(nome, extra)` → `{inizio, fine, minuti, garage, oltre}`, dalla prima partenza
all'ultimo rientro in garage. `oltre: true` sopra le **12 ore**. Non è un divieto: è un numero
che oggi si scopre solo a fine giornata. Passando il servizio che si sta per assegnare si vede
la giornata **come sarebbe dopo la mossa**.

---

## Cosa si vede adesso in Plancia

`plVerifica(s, veic, conCatena)`. Con `conCatena` il verdetto lo dà la catena: **lo stesso sì/no
di prima** — stessa regola, stesse tratte — ma con il motivo giusto.

1. **Le piazzole dicono l'ora e il margine**: `✓ 10:35 · +45m` verde, `⏱ 10:35 · +10m` ambra
   sotto i 20 minuti, `✕` rossa. Lo stesso testo è nel badge della colonna del mezzo, che resta
   visibile anche scorrendo la giornata. Il tooltip racconta la catena per esteso: *«Finisce
   alle 10:00 a Monopoli · 35m di strada · sul pick-up alle 10:35 · parte alle 11:00 → +10m di
   margine»*, con «(stima)» quando il tempo non viene da Maps.
2. **L'effetto a valle si vede prima di assegnare**, in una riga sotto la corsia:
   *«⚠️ dopo questo, Cliente C delle 14:00 non ci arriva per 35m»*. Prima quel caso c'era già —
   `conflict()` lo vedeva — ma veniva raccontato come «occupato: si libera alle 15:45»,
   indicando un servizio che non c'entrava.
3. **Quello che si libera** compare sulla riga da cui il servizio se ne va:
   *«🅿️ si libera: Cliente C delle 14:00 +3h 20m e torna raggiungibile»*. È il motivo per cui
   si sposta un servizio, e prima non si vedeva da nessuna parte.
4. **Il rientro in garage** quando la mossa allunga la giornata del mezzo («rientro 22:40
   invece di 21:15»), nel tooltip della piazzola e nella miniatura.
5. **La miniatura** aggiunge due righe compatte: da dove arriva col margine, e — solo se
   esistono davvero — l'effetto a valle e la giornata dell'autista oltre le 12 ore.

Niente di tutto questo scrive: si accumula in `PEND` e si salva dalla barra gialla, come
sempre. La piazzola verde resta il bersaglio da toccare, senza passaggi in mezzo.

---

## Test

`test/motore.test.js` (86) — finestra dei voli e i cinque casi di `giudizioMargine`; `plCatena`
(da dove arriva, margine, `stima`); effetto a valle; mezzo libero che parte dal garage senza
inventare orari; sovrapposizione; cosa si libera; rientro prima e dopo; ore dell'autista;
catena autista; stesso luogo ⇒ 0 e 0; e che la finestra dei bagagli valga in `conflict()`,
cioè per tutta la app.

`test/app.test.js` sezione 9 (74 in tutto) — su una giornata costruita apposta: la piazzola
mostra ora e margine, 10 minuti diventano ambra, il servizio che rompe quello dopo è rosso col
motivo vero, l'avviso a valle compare, il tempo liberato compare, il volo dall'aeroporto resta
ambra e senza volo diventa rosso, due servizi dello stesso autista restano compatibili, stesso
luogo ⇒ 0 e 0, e `PEND` resta vuoto finché non si assegna. Sezione 9bis: a 390px la miniatura
sta dentro lo schermo e non copre le piazzole.

---

## Cosa resta fuori

- La Plancia lavora sul **giorno mostrato**: la vista «2 giorni» esiste solo in Servizi.
- `aValle` guarda un passo avanti (vedi sopra il perché).
- Base → pick-up non è in cache: un mezzo fermo in garage non ha un'ora d'arrivo. Se servisse,
  va precalcolata come le altre tratte, non chiesta a Maps dal frontend.
