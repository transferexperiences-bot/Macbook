# Scheda Assegna e consiglio autista — 18/08/2026

Due cose, nate dalla stessa richiesta: *«vorrei vedere da una parte i servizi ordinati per
autista e dall'altra quelli ancora da assegnare, in ordine di ora, così capisco a chi darli.
E il codice che cerca l'autista più compatibile non va bene, perché molto spesso mi propone
autisti che non stanno lavorando.»*

---

## 1. Il consiglio proponeva chi non stava lavorando

### Com'era

```js
var fisso = (a.categoria||'').toLowerCase()==='fisso';
var score = (fisso?0:300) + (wait===null?200:wait);
```

Il punteggio più basso vinceva. Quindi:

| autista | situazione | punteggio |
|---|---|---|
| Extra, già fuori, arriva 30 min prima del ritiro | **è la risposta giusta** | 300 + 30 = **330** |
| Fisso, oggi nessun servizio, a casa | non sta lavorando | 0 + 200 = **200** |

Vinceva il secondo. La categoria pesava 300, «oggi non ha nessun servizio» solo 200: bastava
non essere «Fisso» per essere scavalcato da chiunque fosse fermo. Ed era il caso normale, non
un caso limite: gli autisti *Extra* sono proprio quelli che si mandano fuori a giornata.

Secondo difetto, più silenzioso: nel menù del dettaglio chi non lavorava finiva dentro
**✅ Disponibili**, indistinguibile da chi era già in strada.

### Com'è

Un solo punto di verità, `valutaAutista(S, nome)`, che per ogni autista dice **dove si
aggancia** il servizio nel suo giro:

- `prev` — l'ultimo servizio che chiude prima di questo, e `attesaPrima` = quanto resta fermo
  dopo esserci arrivato (al netto del trasferimento);
- `next` — il primo che riparte dopo, e `margineDopo`;
- `k` — il giudizio: `ok` · `stretto` · `fermo` · `libero` · `no` · `off`.

`punteggioAutista(a, v)` traduce il giudizio in un numero, e l'ordine diventa:

1. **si incastra nel giro** (`ok` / `stretto`) — punteggio = minuti di tempo morto *prima* del
   servizio, +150 se il margine dall'altro lato è sotto i 20 minuti;
2. **è in servizio oggi ma lontano** (`fermo`, vuoto oltre 4 ore) — 1000 e passa;
3. **oggi non lavora** (`libero`) — 4000 e passa, **e la riga lo dice**.

Categoria e carico della giornata restano come spareggio (25 punti per chi non è in organico,
3 per ogni servizio già assegnato), non come fattore principale.

Perché il **tempo morto prima** e non il lato più stretto: ordinando per il lato più stretto
si premiavano i giri fragili — 5 minuti di margine sul servizio successivo sembravano meglio
di mezz'ora di attesa comoda. Il test *«A parità, vince chi aspetta meno prima del servizio»*
copre esattamente questo.

Dove si vede:

- **Servizi**, riga scoperta: il pulsante del candidato è del colore dell'autista se sta
  lavorando, **grigio con ⚠️** se oggi non ha servizi;
- **Dettaglio**: gruppo `✅ Disponibili — già in servizio oggi` separato da
  `💤 Oggi non lavorano`;
- **Assegna**: i blocchi sono ordinati con lo stesso punteggio delle proposte, così le due
  colonne non danno mai due classifiche diverse per lo stesso servizio.

---

## 2. La scheda 🧩 Assegna

```
┌─ Giri degli autisti ──────────────┐  ┌─ Da assegnare, in ordine di ora ─┐
│ Marco Rossi   3 srv · 05:30→19:45 │  │ 10:30→12:00  Polignano → Matera  │
│  05:30→06:25  Polignano → Apt Bari│  │  ➕ Marco  ➕ Luca  ➕ Giovanni   │
│  🕳 2h 10m liberi · trasf. 25m    │  │  arriva da Polignano, attesa 45m │
│  09:00→09:45  Monopoli → Polignano│  ├──────────────────────────────────┤
│  ┆ 20:00→20:55 Apt Bari → Ostuni ┆│  │ 20:00→20:55  Apt Bari → Ostuni   │← scelto
│  ┆ ⏱ 15m dopo Aeroporto di Bari  ┆│  │  ✓ a sinistra vedi dove si       │
└───────────────────────────────────┘  │    incastra                      │
                                       └──────────────────────────────────┘
```

- **Sinistra**: un blocco per autista, i suoi servizi in ordine di ora e, fra l'uno e l'altro,
  quanto vuoto c'è (`🕳 liberi`, `⏱ stretto`, `⛔ non ci arriva`, `📍 stesso posto`). Sopra:
  quanti servizi, da che ora a che ora, quanto guida.
- **Destra**: i servizi ancora senza autista, in ordine di ora, con i tre consigliati
  assegnabili con un tocco. Sotto, in un blocco a parte, quelli che hanno l'autista ma non il
  mezzo. Un servizio la cui ora è già passata resta in coda ma lo dice.
- **Toccando un servizio a destra**: ogni blocco a sinistra prende il colore del giudizio e
  scrive se ci arriva; il servizio compare **dentro il giro**, tratteggiato, al posto d'orario
  che avrebbe, con attesa prima e margine dopo. Un tocco su `➕ Assegna` lo mette in sospeso.
- `👥 Solo chi lavora` (ricordato in `localStorage`, `te_ass_solo`) tiene fuori chi oggi non ha
  servizi; in fondo resta il conto di quanti sono nascosti, per riaprirli.
- Chi ha un conflitto vero non ha `➕ Assegna` ma `⚡ Forza`, e la riga dice a che ora si
  libera e dove.

Le assegnazioni **non** scrivono sul foglio da sole: finiscono in `PEND` come in Servizi, e si
salvano dalla barra gialla in alto (`💾 Salva tutto`).

### Sul telefono

Due colonne affiancate a 390px non si leggono, e impilate la coda finisce sotto i giri: non
si vede più. Quindi sotto i 980px si vede **una colonna per volta**, scelta con due bottoni
in cima (`🕐 Da assegnare 3` · `🚹 Giri autisti`) — nessun JS che misura la larghezza, sono
due media query su `body[data-ass]`.

Il giro è quello vero del lavoro:

1. si apre sulla **coda** (è lì che si guarda «cosa manca»);
2. si tocca un servizio → si passa da soli ai **giri**, con una striscia gialla in cima che
   ricorda quale servizio si sta piazzando (`✕ togli` per lasciar perdere);
3. si tocca `➕ Assegna` sull'autista → **si torna alla coda**, pronta per il prossimo.

`◀ Coda` nell'intestazione dei giri torna indietro in qualsiasi momento. Da 980px in su i due
bottoni spariscono, le colonne tornano affiancate e la coda resta ferma mentre si scorrono i
giri.

### Limiti dichiarati

- La scheda lavora sul **giorno mostrato**: la vista «2 giorni» esiste solo in Servizi.
- «Sta lavorando oggi» è dedotto dai servizi già assegnati sul foglio. Se un autista è in
  turno ma non ha ancora niente, per la app è fermo: comparirà in fondo, non escluso. Se sul
  foglio `Autisti` ci fosse una colonna con il turno vero, il consiglio potrebbe usarla —
  è la cosa da fare se il problema si ripresenta al contrario.

### Test che le coprono

`test/motore.test.js` — consiglio con autista già in servizio contro autista fermo, valutazione
servizio per servizio (`ok`/`libero`/`off`), stacco lungo, conflitto, incastro dentro un buco,
attesa prima contro lato più stretto.

`test/app.test.js` sezione 8 (desktop) e 8bis (390px: si apre sulla coda, il tocco porta ai
giri, l'assegnazione riporta alla coda, `◀ Coda`, nessuno scroll orizzontale) — le due colonne, l'ordine per ora, la riga tratteggiata dentro il
giro, il tocco che assegna, la coerenza dell'ordine fra sinistra e destra, i gruppi del menù
del dettaglio, e un nome con l'apostrofo (`Nicola D'Amico`) che non deve rompere la scheda.
