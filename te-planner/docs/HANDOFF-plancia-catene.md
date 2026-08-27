# Handoff — Plancia: catene e tempi quando sposti un servizio

Documento per chi lavora al codice (Claude Code). Riguarda **solo la scheda 🎛 Plancia**
di TE Planner. Tutto il resto della app non si tocca.

---

## 1. Dove si lavora

```
repo            te-planner-repo/
codice          src/Index.html          ← tutta la Plancia sta qui (HTML+CSS+JS, un file solo)
backend         src/Code.gs             ← si tocca SOLO se serve un dato nuovo dal foglio
test            test/app.test.js        ← sezione 8 (desktop) e 9 (telefono, 390px)
comandi         ./run-tests.sh          ← sintassi + backend + motore + end-to-end (148 controlli)
preview         python3 tools/build-preview.py && open preview.html
```

Il codice gira su **Google Apps Script**, quindi:

- **ES5 obbligatorio**: niente `let`, `const`, arrow function, template literal, `Math.hypot`.
- **Un file solo** per l'interfaccia: niente build, niente librerie.
- **Mobile first**: ogni modifica va guardata a **390px** e a **1440px**.
- **La app non scrive mai da sola**: ogni modifica finisce in `PEND` e si salva dalla barra
  gialla `salvaTutto()`. Vale anche per tutto quello che aggiungi.

---

## 2. Cosa fa oggi la Plancia

Una riga per mezzo, il tempo sull'asse X, i servizi come blocchi colorati per autista.
Sotto, il vassoio dei servizi senza mezzo.

Funziona già:

- **Assegnazione in tre modi**: trascini il blocco sulla riga, oppure lo tocchi (si «arma» e
  compare una piazzola su ogni mezzo: verde *ci sta*, rossa col motivo), oppure apri la scheda.
- **Miniatura**: toccando un blocco esce una scheda ridotta col servizio (ora di partenza,
  durata stimata, cliente, tratta, pax, mezzo, autista, volo, tariffa, fornitore, nota).
- **Forzatura**: il rilascio assegna **sempre**, anche su mezzo occupato o fermo; la app avvisa
  (messaggio sotto il dito, toast «forzato», blocco cerchiato di rosso) ma non blocca.
- **Attese**: fra due servizi la barra è divisa in **viaggio** (tratteggiata) e **attesa vera**
  (liscia), con «sul posto alle hh:mm».
- **Sovrapposizioni**: fascia rossa + sotto-righe impilate, i blocchi non si nascondono mai.
- **Zoom**: − / adatta / + più la pinza a due dita, ricordato in `localStorage` (`te_plz`).
- I mezzi fermi, a noleggio o fuori flotta stanno in fondo, sotto una riga di stacco.

---

## 3. Cosa manca — il lavoro da fare

Oggi il verdetto guarda **una coppia di servizi alla volta**: «questo mezzo è libero in questa
fascia, sì o no». Quando sposti un servizio, però, non stai toccando una casella: stai
**rompendo o ricucendo una catena**. Quello che manca è farlo vedere prima che il dito si stacchi.

### 3.1 La catena del mezzo e quella dell'autista

Ogni servizio assegnato appartiene a due catene: quella del **mezzo** e quella dell'**autista**.
Spostare un blocco può spezzare l'una, l'altra o tutte e due, e l'effetto non è solo sul
servizio che stai spostando: è **a valle**, su tutti quelli che vengono dopo.

Serve una funzione unica che, dato un servizio e una destinazione ipotetica, risponda:

```
plCatena(servizio, veicoloIpotetico)  →  {
  arrivo:        minuti in cui il mezzo è materialmente sul pick-up
  daDove:        servizio precedente su quella catena (o "garage")
  margine:       arrivo → inizio del servizio (negativo = non ci arriva)
  aValle: [      cosa succede ai servizi successivi della stessa catena
    { id, era: 'ok'|'stretto'|'rotto', diventa: 'ok'|'stretto'|'rotto', ritardo: minuti }
  ]
  liberati: [    cosa si libera sulla catena di partenza
    { id, guadagno: minuti }
  ]
  rientro:       ora di rientro in garage a fine giornata, prima e dopo la mossa
}
```

Il motore c'è già e **non va riscritto**:

- `trf(idA, idB)` → `{min, buffer}` con `stessoLuogoUI()` già applicato (stesso posto = 0 e 0).
- `availability(lista, keyFn, S)` → chi è occupato e quando si libera.
- `conflict(A, S)` → la regola madre: `fine A + trasferimento + buffer ≤ inizio B`.
- `s.rientroMin` → minuti dal drop-off al garage, già calcolati dal backend.
- `plDurata(s)` / `plFine(s)` → durata = Maps × 1,3 + `h extra` × 60, minimo 15 minuti.

Buffer: **15 minuti**, **10** se i due punti sono vicini, **0** se è lo stesso posto.

### 3.2 Cosa deve vedere chi guarda

Mentre il servizio è armato (o mentre lo trascini), su ogni riga di mezzo:

1. **Da dove arriva quel mezzo** e **a che ora è sul posto**: non «libero alle 15:35», ma
   «finisce a Monopoli alle 15:10, 20 minuti di strada, sul pick-up alle 15:30, parte alle 15:45».
2. **Il margine reale**, col segno: `+15m` verde, `+3m` ambra, `−12m` rosso.
3. **L'effetto a valle**: se accettando questa mossa il servizio delle 19:00 di quel mezzo non
   regge più, va detto **adesso**, non dopo il salvataggio. Basta una riga:
   «⚠️ dopo questo, Jillian delle 19:00 non ci arriva per 12 minuti».
4. **Quello che si libera**: togliendo il servizio dal mezzo di prima, cosa guadagna quella
   catena. È il motivo per cui si sposta un servizio, e oggi non si vede.
5. **Il rientro in garage**: se la mossa allunga la giornata del mezzo, dirlo
   («rientro 22:40 invece di 21:15»).

### 3.3 La regola degli arrivi che manca

Un servizio che parte da un aeroporto **non comincia all'ora scritta**: comincia
all'atterraggio più il tempo dei bagagli. In azienda la regola è **atterraggio + 20 minuti**.
Oggi la Plancia tratta l'orario come rigido e segnala «non ci arriva» anche quando il cliente
è ancora al nastro bagagli. Serve che, quando il servizio ha un **volo** e parte da un
aeroporto, la finestra di inizio sia **[ora, ora + 20 min]** e il verdetto usi quella:
verde se ci arriva entro la finestra, ambra se ci arriva dentro la tolleranza, rosso solo se
è oltre.

### 3.4 Ore dell'autista

Ogni catena autista ha una **prima partenza** e un **ultimo rientro**. Quando una mossa porta
un autista oltre le **12 ore** dalla prima partenza, va detto sulla riga: non è un divieto,
è un'informazione che oggi manca e che si scopre solo a fine giornata.

---

## 4. Come si presenta (senza rompere quello che c'è)

- La piazzola verde/rossa resta **il bersaglio da toccare**: non aggiungere click intermedi.
- Il dettaglio della catena va nella **miniatura** (`#plcard`), che è già aperta quando il
  servizio è armato, e in una **riga sotto la piazzola** quando c'è un effetto a valle.
- Sul telefono lo spazio non c'è: in miniatura vanno **due righe**, arrivo e margine; il
  resto solo se l'effetto a valle esiste davvero.
- Colori: **verde = ci sta**, **ambra = ci sta ma stretto**, **rosso = non ci arriva**. Non
  usare verde e rosso per altro (la palette autisti non li contiene: non rimetterceli).
- Niente numeri inventati: se `DATA.transfers` non ha la coppia, `trf()` torna il default
  30 minuti — in quel caso scrivilo («stima»), non spacciarlo per un tempo Maps.

---

## 5. Criteri di accettazione

Da coprire con test in `test/app.test.js` (sezione 8 desktop, sezione 9 a 390px):

1. Armando un servizio, ogni piazzola verde mostra **ora di arrivo del mezzo** e **margine**.
2. Su un mezzo con un servizio successivo che salterebbe, compare l'avviso **a valle** con
   l'id del servizio coinvolto e i minuti mancanti.
3. Spostando un servizio, sulla riga di provenienza si vede **quanto tempo si libera**.
4. Un servizio con volo che parte da un aeroporto è **verde** anche se il mezzo arriva entro
   20 minuti dall'orario scritto, e **rosso** oltre.
5. Due servizi con lo **stesso autista** restano compatibili (esenzione già esistente: non
   deve regredire).
6. Stesso luogo → trasferimento 0 e buffer 0 anche nel nuovo calcolo.
7. La catena si ricalcola **senza chiamare il backend** e senza scrivere: `PEND` invariato
   finché non si assegna.
8. A 390px la miniatura resta dentro lo schermo e non copre le piazzole verdi.
9. `./run-tests.sh` verde: i 148 controlli esistenti non devono regredire.

---

## 6. Cose da non fare

- Non chiamare Google Maps dal frontend né dentro `getPlanData`: i tempi arrivano da
  `_CacheTratte`, precalcolati. Se manca una tratta, si usa la stima e lo si dichiara.
- Non scrivere sul foglio all'assegnazione: si accumula in `PEND`, si salva dalla barra gialla.
- Non introdurre un secondo motore di fattibilità: se serve una regola nuova, va dentro
  `conflict()` / `trf()`, così Servizi, Flotta, Timeline e Plancia restano d'accordo fra loro.
- Non spostare la colonna dei mezzi né cambiare `.pllane{overflow:hidden}`: serve a far
  funzionare «adatta» (vedi CLAUDE.md, trappole 11-13).

---

## 7. Contesto operativo, per capire perché serve

Transfer Experience lavora con **7 mezzi utili** e giornate da 40 servizi. La domanda vera,
alle nove di mattina, non è «questo mezzo è libero alle 15:00»: è **«se sposto questo qui,
cosa mi si rompe alle 19:00?»**. Oggi quella risposta si ottiene contando a mano su due
timeline. La Plancia serve a darla in un colpo d'occhio, mentre il dito è ancora sul blocco.
