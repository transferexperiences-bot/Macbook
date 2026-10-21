# Assistente Autisti — copione v1 (bozza da approvare)

Incollato da Agostino il 21/10/2026 (il file `copione_v3.md` della sessione precedente non è
nel repo: questo è il testo ricevuto). Le differenze con `decisioni.md` sono elencate in fondo.

Canale: Telegram, bot nuovo dedicato, nel gruppo di ogni autista (Agostino vede tutto).
Regola di casa: ogni numero (ore, importi, totali) lo calcola il codice; il modello legge solo
il testo libero e ogni cifra torna all'autista da confermare con un bottone.

## A. Chiusura giornata — parte da sola 20' dopo l'ultimo servizio
Il codice legge gestionale + Moox e prepara la giornata dell'autista.

1. **Riepilogo** «Ciao Claudio, giornata finita? Oggi risultano 5 servizi: 08:10 Bari Aeroporto
   → Polignano (Rossi) · Pagato 10:30 Polignano → Monopoli (Bianchi) · Incassare 80 € …»
   [✅ Sì, ho finito] [🚗 Ho ancora servizi]
2. **Ore** — secondo le condizioni dell'autista (lette da Anag autisti)
   - Regola per autista: colonna Calcolo ore di Anag autisti, la compila Agostino
     (Continuative / Effettive). Vuota → Effettive + avviso ad Agostino.
   - Continuative (oggi: Claudio): dal primo servizio alla fine dell'ultimo, con il minimo giornata se c'è.
   - Effettive (gli altri): somma dei tempi dei servizi, da Moox.
   - Tuk-tuk (Giornata + %): niente ore, riepilogo della base del giorno.
     «Oggi: 08:10 → 18:40, 10,5 ore continuative. Confermi?» [✅ Confermo] [✏️ Correggo]
   - Correggo → scrive gli orari → il codice ricalcola → [✅ Confermo].
   - Differenza con Moox oltre 15% e oltre 45' → «Mi dici il motivo?» → va ad Agostino con
     [✅ Approva] [❌ Rifiuta: ore Moox] [✏️ Altro].
3. **Incassi** — un solo riepilogo, chiede solo quello che non torna. Il codice divide i servizi del giorno:
   - Da fatturare / pagati dalla struttura / già pagati → non li chiede, compaiono solo nel conteggio.
   - Carta → riscontro automatico su SumUp: trovata = ✅, non la chiede.
   - Contanti → vanno nel recap cash.
   - Da chiarire → Incassare senza modalità, carta non trovata su SumUp: solo questi uno per uno.
     «Oggi 6 servizi: 2 a fattura, 1 pagato, 2 carta ✅ SumUp (80 + 120 €), 1 contanti 90 €.
     Contanti incassati oggi: 90 € (+ 50 € rimasti da ieri = 140 €).» [✅ Giusto] [✏️ Non torna]
   - Da chiarire, per ognuno: [💵 Contanti] [💳 Carta/POS] [❌ Non incassato].
   - Non torna → indica il servizio → stessi bottoni.
   - Carta non trovata / non incassato → avviso ad Agostino.
4. **Contanti da lasciare** «Hai lasciato i 140 €?» [✅ Lasciati a Eusto] [⏳ Li lascio domani] [✏️ Importo diverso]
   - Il residuo resta aperto e glielo richiede il giorno dopo.
5. **Spese e rifornimenti del giorno** — riepilogo di quello già registrato (vedi B)
   «Oggi hai registrato: ⛽ 45 l · 78 € (soldi miei) · 🅿️ parcheggio 3 € (contanti incasso).
   Manca qualcosa?» [✅ È tutto] [➕ Aggiungo]
   - Le spese pagate con i contanti dell'incasso tolgono dal totale da lasciare (punto 4).
6. **Mezzo** «Carburante a fine giornata?» [¼] [½] [¾] [Pieno] «Problemi col mezzo?» [✅ Nessuno] [⚠️ Sì]
   - Sì → descrizione + foto → avviso subito ad Agostino.
   - (facoltativo) km a fine giornata, pulizia interna/esterna.
7. **Fine** Riepilogo finale scritto dal codice → [✅ Tutto giusto] → «Grazie, buona serata».

Se non risponde: promemoria dopo 1 ora e alle 22:00. Alle 10:00 del giorno dopo: ore = le
nostre (Moox), incassi rimasti aperti → lista ad Agostino.

## B. Spese e rifornimenti — in qualsiasi momento
L'autista manda la foto dello scontrino (o scrive «ho fatto benzina»). Il bot legge la foto e il
codice propone i dati, l'autista conferma con i bottoni.

**Rifornimento** «⛽ Rifornimento: 45,2 l · 78,40 € · 1,73 €/l · Distributore Q8 Polignano ·
mezzo GZ441BF. Giusto?»
- Dove: [⛽ Distributore] [🛢️ Cisterna]
- Pagato con: [💵 Contanti incasso] [👤 Soldi miei (rimborso)] — niente carta aziendale (Agostino 20/10)
- Km del mezzo (foto del cruscotto o numero).
- [✅ Giusto] [✏️ Correggo]

**Spesa**
- Tipo: [🛣️ Pedaggio] [🅿️ Parcheggio] [🧽 Lavaggio] [🔧 Manutenzione] [Altro]
- Importo, foto, pagato con (stessi bottoni).

**Controlli automatici del codice**
- Stesso scontrino già mandato → «Questo l'ho già registrato» (niente doppioni).
- Prezzo al litro fuori dal normale, litri oltre il serbatoio, km che tornano indietro → chiede
  conferma e avvisa Agostino.
- Cisterna: 2 foto obbligatorie del contatore, prima e dopo (Agostino 20/10). Senza tutte e due il
  rifornimento resta aperto e il bot lo richiede. Il contatore è progressivo e ricomincia da 0 dopo
  999: litri = dopo − prima, e se negativo + 1000. Controllo: la foto «prima» deve coincidere con
  l'ultima foto «dopo» registrata (di qualunque autista). Se non coincide → c'è un rifornimento non
  registrato → avviso ad Agostino con le due letture. Si registrano i litri presi; niente avviso di livello.
- Soldi miei → rimborso aggiunto al compenso del mese. Contanti incasso → nessun rimborso, scala
  dai contanti da lasciare (Agostino 20/10).
- Mezzo proposto = quello assegnato quel giorno nel gestionale.

**Dove va**
- Foglio Recap del gestionale (Data, Autista, Mezzo, Tipologia, Litri, Descrizione, €, Foto), come
  oggi per le spese da WhatsApp; il giro della notte le porta in Movimenti e Mezzi e cisterna.
- Prima fase (prova): solo nella tabella del bot, niente sul Recap.

## C. Assistente 24 ore su 24 — l'autista scrive quando vuole
Può chiedere (sola lettura):
- i suoi servizi di oggi e domani: orario, indirizzo, cliente, volo, numero passeggeri, note;
- il prossimo servizio e il ritardo del volo (plancia voli);
- cosa ha ancora da incassare / da lasciare;
- come si fa una cosa (procedure: foglio di viaggio, POS, link di pagamento).

Può segnalare (va subito ad Agostino):
- ritardo, cliente che non si presenta, incidente, guasto, problemi col cliente.

Non può (risponde «lo chiedo ad Agostino»):
- cambiare prezzi, servizi, assegnazioni; cancellare; scrivere ai clienti;
- sapere compensi o dati di altri autisti.

**Cosa scrive e dove**
- Prima fase (prova): scrive solo nella sua tabella e manda messaggi ad Agostino. Niente sul gestionale.
- Dopo l'ok di Agostino: Modalità / Note / Show sul gestionale (come il sollecito incassi), ore in
  Giornate con fonte CONFERMATE, spese e rifornimenti nel foglio Recap.

**Come è fatto**
- Il copione con i bottoni: workflow n8n (codice, sempre uguale).
- Le domande libere: agente con strumenti in sola lettura (gestionale, Moox, plancia voli).
- Bot nuovo: il bot Allert non si tocca (riceve già i promemoria e i solleciti).
