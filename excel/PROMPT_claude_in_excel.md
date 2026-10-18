# Prompt per Claude in Excel — riordino di "Transfer 2026 - Gestionale.xlsx"

Copia tutto da qui in giù e incollalo nella chat di Claude dentro Excel.

---

Sei dentro il file **"Transfer 2026 - Gestionale.xlsx"** di Transfer Experience (Agostino Narracci, transfer e NCC a Polignano a Mare). Rispondi sempre **in italiano**, frasi brevi.

Il file oggi ha 38 fogli e troppi fanno la stessa cosa. Voglio un file **semplice, con tendine dove si sceglie qualcosa e colori automatici**, che funzioni bene ogni giorno. Lavoriamo **un gruppo alla volta**: per ogni gruppo prima mi dici cosa farai (in poche righe), io dico ok, poi lo fai e mi mostri il risultato.

## 0. Prima di tutto

1. **Fai una copia di sicurezza** del file (File › Salva una copia, nome "Transfer 2026 - Gestionale BACKUP 18-10"). Se non puoi farla tu, dimmelo e la faccio io.
2. **Non lavorare tra le 06:15 e le 08:45**: a quell'ora girano le task notturne che scrivono nel file (06:30 chiusura notte, 07:12 ore autisti, 07:30 aggiornamento, 08:22 supervisore).

## 1. Regole che NON si toccano (altrimenti le task notturne si rompono)

Ogni notte degli script scrivono nel file **per nome di foglio, nome di tabella e posizione delle colonne**. Quindi:

- **Non rinominare, non spostare, non cancellare** questi fogli: `Servizi`, `Clienti`, `Listini`, `Mezzi e cisterna`, `Fatture`, `Movimenti`, `Anag autisti`, `Giornate`, `Corse calessino`, `Ore giorno`, `Ore autisti`, `Log e legenda`.
- **Non rinominare queste tabelle e non aggiungere, togliere o riordinare le loro colonne**: `tblServizi` (A:AS, intestazioni identiche), `tblClienti`, `tblListini`, `tblPrezziTipici`, `tblMezzi`, `tblFatture` (A:U), `tblMovimenti` (A:O), `tblCisterna` (A:I), `tblAutisti`, `tblGiornate` (A:L), `tblCorseCalessino` (A:P), `tblLog`, `tblOreConfronto` (A:J), `tblOreGiorno` (A:L, 12 colonne).
- `tblCorseCalessino` deve restare nel foglio `Corse calessino` **con l'intestazione in riga 8, colonne A:P** (le righe nuove usano formule con `$A$9`).
- `tblOreGiorno` deve restare nel foglio `Ore giorno`, colonne A:L. Sopra (righe 3-26) c'è un riepilogo per autista fatto di formule: puoi rifarlo meglio, ma non spostare la tabella in alto o a sinistra.
- `'Log e legenda'!C6` = data dell'ultimo giro notturno: non toccarla.
- **Mai cancellare righe di dati.** Una riga sbagliata si corregge e si scrive in Note «corretta il 18/10: era ...».
- **Non cambiare valori di soldi** (tariffe, pagamenti, fatture, ore in Giornate) senza chiedermelo. In questo lavoro si cambiano **struttura, viste, tendine, colori e formule dei riepiloghi**, non i dati.
- I nomi di autisti e clienti devono essere **identici** a quelli di `Anag autisti` / `tblAutisti` e `Clienti` / `tblClienti`.

Se una cosa che ti chiedo va contro queste regole, **fermati e dimmelo** prima di farla.

## 2. Il controllo iniziale (solo lettura)

Prima di cambiare qualsiasi cosa:
1. Elenca tutti i fogli, con le tabelle che contengono, le tendine (convalida dati) e le regole di formattazione condizionale presenti.
2. Dimmi **dove mancano tendine** che servirebbero (celle gialle di selezione: mese, autista, cliente, collega; colonne come Paga da, Tipo, Modalità, Chi, Autista, Cliente, Mezzo).
3. Dimmi quali fogli secondo te sono doppioni.

Poi aspetta il mio ok.

## 3. Come voglio il file alla fine (da 38 a circa 20 fogli)

### Gruppo A — Calessino (oggi: `Corse calessino` + `Calessino`)
- **Un solo foglio: `Corse calessino`.** Il foglio `Calessino` va eliminato quando tutto il suo contenuto è stato riportato qui.
- In alto (righe 1-7, sopra la tabella che resta in riga 8):
  - **tendina Autista** (solo autisti tuk-tuk/calessino di `tblAutisti`, Categoria "Tuk-tuk": oggi Linda Novelli ed Eustachio Corbascio) e **tendina Mese** (1-12);
  - riepilogo del mese per l'autista scelto: giorni lavorati, corse calessino, corse auto, incasso calessino, incasso auto, **incasso totale**, **media incasso al giorno**, fee strutture, **paga del mese**, **media paga al giorno**, **% paga sull'incasso**, **quanto resta a noi (€ e %)**, pagato (da `tblMovimenti`, Tipo "Pagamento autista" e "Busta paga"), residuo.
  - Le formule giuste di paga sono già in tabella: Base = Strada → tariffa − fee; Da noi → tariffa × 0,6; Paga giorno = 30 + 30% × (base del giorno − 30), una volta per giorno.
- Il dettaglio giorno per giorno e l'elenco delle corse del mese: mettili dove non vengono nascosti dai filtri della tabella (es. colonne da R in poi, oppure con FILTER sopra la tabella). Se non c'è modo pulito, propostami tu la soluzione.
- `Giornate` legge la paga calessino da `tblCorseCalessino[Paga giorno]`: non cambiarla.

### Gruppo B — Ore e paghe autisti
Oggi: `Giornate` (nascosto), `Ore giorno`, `Ore autisti` (nascosto), `Scheda autisti`, `Autisti`, `Paghe mese` (nascosto), `Anag autisti`.
- Restano **visibili 3 fogli**:
  1. **`Ore giorno`**: si sceglie da dove pagare ogni giorno.
     - **Tendina su "Paga da"**: Fogli · Moox · Dichiarato. Vuoto = da scegliere.
     - Riepilogo in alto con **tendine Autista e Mese** (con «Tutti»): giorni, ore totali, media ore al giorno, giorno più lungo, giorni ≤10 h, 10-15 h, >15 h, media Fogli, media Moox.
     - **Colori automatici** (formattazione condizionale) su "Ore scelte" e sulla media: **verde fino a 10 h, arancione da 10 a 15 h, rosso oltre 15 h**. Togli i riempimenti fissi verde/arancio/rosso che ho messo a mano nella colonna H: vanno sostituiti dalle regole automatiche.
     - **Evidenzia in giallo le righe con "⚠ da scegliere" nelle Note.** Sono 210 giorni di settembre-ottobre in cui le ore pagate in Giornate non coincidono con la fonte proposta: li decido io.
  2. **`Scheda autisti`**: un autista e un periodo (tendine) → ore, dovuto, pagato, residuo mese per mese, e giorno per giorno.
  3. **`Anag autisti`**: anagrafica e paghe.
- `Giornate`, `Ore autisti`, `Paghe mese` restano **nascosti** (sono il motore). Il foglio `Autisti`: se tutto quello che mostra c'è già in `Scheda autisti`, nascondilo; altrimenti dimmi cosa ha in più.

### Gruppo C — Partite con i colleghi
Oggi: `Colleghi` + 8 fogli `Partita ...` (Your Driver, Pastoressa, Best Things, CarloMenz, Michele NCC, Move In Puglia, Puglia Concierge, Tedi), ognuno fatto a mano con blocchi diversi.
- Voglio **un solo foglio `Partite`** con la **tendina del collega** in alto e uno schema sempre uguale, chiaro anche per chi non è contabile:
  1. **Ci devono** (servizi fatti da noi per loro, non incassati da noi);
  2. **Gli dobbiamo** (servizi fatti da loro per noi + commissioni a loro);
  3. **Riporti 2025 e fatture già pagate**;
  4. **Fatturato da noi a loro**, **incassato**, **da incassare** (letti da `tblFatture`, Cliente = nome del collega);
  5. **SALDO** in grande, con una frase: «ci devono X €» / «gli dobbiamo X €», e **«ancora da fatturare»**.
- Per farlo, porta le righe scritte a mano degli 8 fogli in **una tabella nuova `tblPartite`** (Collega · Sezione · Data · Tratta · Ospite · Prezzo · % fee · Valore · Fonte del prezzo · Stato · Tuo OK · Note), **senza perdere neanche una riga né un prezzo**. Fammi vedere il confronto dei saldi prima/dopo collega per collega: devono essere identici (Your Driver 1.315,50 · Pastoressa 840 · Best Things 14.798 · CarloMenz 7.370 · Michele NCC 885 · Move In Puglia 1.360 · Puglia Concierge 18,80 · Tedi: vedi il suo foglio). Solo quando tornano tutti, nascondi i vecchi fogli Partita (non cancellarli finché non ti dico ok).
- **Colori**: Concordato verde · Deciso solo da loro giallo · Solo nostro gestionale azzurro · Manca il prezzo rosso · Chiuso/incluso grigio (come la legenda di oggi), in automatico sulla colonna Stato.
- Da sistemare nelle partite:
  - **Your Driver**: la fattura n.148 del 14/10 (1.305,50) copriva l'estratto conto del 09/10. Oggi il saldo è 1.315,50: trova **quale riga è cambiata o è stata aggiunta dopo il 09/10** (i 10 € di differenza) e dimmelo.
  - **Michele NCC**: c'è la corsa del **27/09, Torre Cintola → Aeroporto di Brindisi** (cliente Tedi, Tedi ci paga 85 €) fatta da Michele per noi, ma **senza prezzo**. Chiedimi quanto gli dobbiamo e mettilo.
  - **Pastoressa**: la fattura n.18 del 12/02 (1.380,01) **non è mai stata emessa**: in `Fatture` ha già Totale 0 e la nota. La rimanenza 2025 di 1.380 resta da fatturare.

### Gruppo D — Clienti e fatture
Oggi: `Strutture`, `Estratto conto`, `Da fatturare per mese`, `Da incassare`, `Fattura Puglia Mare`, `Fatture`.
- Restano: **`Fatture`** (tutte le fatture) + **un foglio `Cliente`** con **tendina del cliente** (da `tblClienti`): servizi svolti da fatturare, fatturato, incassato, da incassare, e **l'elenco delle corse non ancora coperte da fattura** (con data, tratta, ospite, tariffa, modalità) + **un foglio `Da fatturare`** con tutti i clienti in una tabella (quanto manca da fatturare e da incassare per cliente, mese per mese), ordinato dal più grande.
- `Fattura Puglia Mare`: se è un caso singolo già chiuso, nascondilo.
- **Serafini** (struttura «Dei Serafini», Polignano a Mare): voglio la sua situazione completa nel foglio `Cliente`. Le corse sono **anche prima di agosto**: cercale in tutto `tblServizi` (Cliente «Serafini» e anche nelle tratte/note «Serafini», «Dei Serafini», «Via Garofalo 44»), da gennaio. Ai Serafini abbiamo fatto **una sola fattura**, a metà: trovala in `Fatture` e dimmi quali corse copre e quali no. Le corse a 0 € (21/08 porto di Polignano andata e ritorno, 31/08 Arco → San Vito) segnalamele.
- **Obiettivo: chiudere tutte le fatture da fare.** Alla fine voglio l'elenco completo, cliente per cliente, di **cosa va ancora fatturato** (importo e corse), così le emetto tutte. Non emettere fatture tu: preparami solo l'elenco.

### Gruppo E — Cruscotto
`Riepilogo`, `Grafici`, `Giorni` restano.
- **Tendina** sul mese del Riepilogo (0 = tutto l'anno, 1-12).
- Correggi le scritte «Dati al 05/10/2026» (Guida e Riepilogo): usa la data di `'Log e legenda'!C6`.
- «Oneri personale» è a 0: lascialo, ma metti accanto «da registrare: contributi e F24».

### Gruppo F — Dati e servizio
- `Servizi`, `Movimenti`, `Clienti`, `Mezzi e cisterna`, `Listini`, `Rent`, `Contestazioni` restano. Aggiungi le **tendine** che mancano sulle colonne dato:
  - `Movimenti`: Tipo (dall'elenco di `Log e legenda`), Chi (autisti + clienti), Modalità (Contanti, Bonifico, Carta, Sconto in fattura, Fattura), Rimborso autista (Sì/vuoto);
  - `Servizi`: «Prezzo ok» (Sì/No);
  - `Fatture`: Tipo, Profilo, Stato SdI, Numerazione.
- `Claude Log`, `Log e legenda`, `Alias`: **nascosti**.
- **`Guida`** aggiornata alla fine con i fogli nuovi: per ognuno a cosa serve e cosa si sceglie con le tendine.

## 4. Stile
Lo stile che mi piace è quello di `Corse calessino`: titolo in alto, celle gialle per le scelte, riepilogo con le intestazioni azzurre, tabella blu a righe alterne (TableStyleMedium2). Usa lo stesso stile in tutti i fogli visibili. Euro col formato `#.##0,00 €`, percentuali `0,0%`, ore `0,0`.

## 5. Alla fine
1. Rileggi i numeri principali e confrontali con quelli di prima: **Riepilogo** (ricavi, margine, manca da fatturare, credito aperto), **saldi di tutte le partite**, **paga del mese di Linda ed Eustachio**. Devono essere identici: se uno cambia, dimmi perché.
2. Dammi l'elenco di quello che hai fatto, foglio per foglio, e di quello che resta da decidere a me.
