# App Conti — come è fatta

App da telefono per vedere e modificare i conti dell'Excel `Transfer 2026 - Gestionale.xlsx`.
Nata il 21/10/2026. **Ora lavora solo sulla COPIA DI PROVA del file.**

- App (artefatto privato): https://claude.ai/artifact/KKGZGn7WP5LQeUr4Y37CtE — sorgente `conti.html`
- Ponte dell'app, n8n `WAb5AAGFwrTD6skZ` *APP Conti - ponte (copia di prova)* — codice `ponte_n8n.js`
- Ponte Excel con sessione, n8n `ynwmPcujvOKLqoOZ` *EXCEL bridge con sessione - APP Conti*
- Copia di prova: OneDrive `Documents/PROVA APP - Transfer 2026 - Gestionale.xlsx`, item `431F991EEA4CCA44!s7b084d070ccb4adea1939a8c6870091b`
- File vero: item `431F991EEA4CCA44!sd03fc90a7644425dbf9f2066b7f0f02a` (non ancora abilitato nel ponte)

## Come gira

```
App (telefono) --connettore n8n: execute_workflow + get_workflow_execution--> APP Conti - ponte
   APP Conti - ponte (Code) --HTTP--> gx-sessione (una sessione Excel per chiamata) --> Microsoft Graph
```

- **Leggi**: una chiamata, ~10-20 s. Riepilogo, `tblSituazione`, `tblPartite`, `tblFatture`, Paghe mese,
  `tblAutisti`, nomi di `tblClienti`. I numeri sono quelli delle formule: l'app non rifà conti.
- **Scrivi**: le modifiche restano in **bozza** (database dell'artefatto, collezione `bozze`) finché non si
  preme «Salva tutto». Il ponte accetta solo:

| op | Dove scrive |
|---|---|
| `movimento` | `tblMovimenti`, riga nuova (Pagamento autista, Busta paga, Fee pagata, Incasso collega, Sub-appalto pagato), formule ricopiate dalla riga 5, competenza obbligatoria per gli autisti |
| `incasso_fattura` | `Fatture` col. P `Incassato €` (+ importo) e nota in U |
| `partita` | `Partite` riga di `tblPartite`: Prezzo (T), Stato (X), nota in coda (Z) |
| `cliente` | `Situazione clienti` colonne gialle J-L |
| `subappalto` | foglio nuovo `Sub-appalti` (`tblSubappalti`, solo sulla copia): una riga per servizio o pezzo di tour, chiave Id servizio, aggiornata in posto |

- Ogni bozza ha un id; il ponte lo scrive nella nota (`[app <id>]`) e **non scrive due volte** la stessa bozza.
- Prima di scrivere controlla che la riga sia quella giusta (numero fattura + cliente, collega + data, nome cliente).
- File aperto in Excel → esito `bloccato`, la bozza resta. Oltre 35 s di lavoro → `rimandato`, l'app rimanda.
- Mai cancellazioni, mai colonne formula.

- **Servizi** (`azione: "servizi"`, ~11-14 s, letta dopo i dati principali): per cliente e mese lavoro (`Da fatturare €`),
  fatturato con quella competenza (`tblFatture` col. I, × Conta), incassato, residuo; elenco dei servizi «Dato a collega»; righe di `tblSubappalti`.

## Regole di Agostino (21/10)

- **Da fatturare di un mese = lavoro di quel mese − fatture con quel mese di competenza.** Il fatturato in più di altri
  mesi non scala. Esempio Auraterrae: ottobre 8.217,74 da fatturare, non 4.173 (differenza dei totali).
- **Sub-appalti** (servizi «Dato a collega»): chi ha incassato si legge dal pagamento — carta (in cassa), link, bonifico,
  fattura, sconto in fattura = **noi**; contanti, incassare, al ritorno = **il driver del collega**.
  - Noi incassiamo → gli dobbiamo: 80% dell'importo, oppure il totale (la commissione la mettiamo sopra noi), oppure un
    **prezzo preventivo fisso per ogni pezzo** del tour spezzettato. Si sceglie servizio per servizio.
  - Incassa il loro driver → ci devono: lo decide Agostino ogni volta; l'app propone la fee della struttura.
- Perché un foglio nuovo e non la colonna `Sub-appalto €` di Servizi: quella colonna la riscrive il giro notturno dal gestionale.

## Trappole trovate nel collaudo (21/10)

- Il nodo Code di n8n si ferma a **60 secondi**: per questo il tetto di 35 s e i lotti da 6 bozze.
- **Senza sessione Excel la rilettura subito dopo una scrittura può dare il valore vecchio** (visto su
  Fatture riga 25). Con il ponte `gx-sessione` letture e scritture sono allineate e ~1 s a chiamata.
- `rows/add` restituisce `index`: la riga vera è `prima riga della tabella + 1 + index`.

## Prima di passare al file vero (zona rossa: chiedere ad Agostino)

1. Agostino prova l'app sulla copia e dice cosa cambiare.
2. Aggiungere `vero` a `FILES` in `ponte_n8n.js` e il bottone/scelta nell'app; pubblicare e rileggere il nodo.
3. Creare il foglio `Sub-appalti` anche nel file vero (oggi c'è solo sulla copia) e decidere se il saldo dei sub-appalti entra in `Partite`.
4. Le righe di prova sulla copia (Movimenti 575 «PROVA APP», Fatture 25, Partite 16, Situazione 6) restano lì: la copia si può
   rifare da zero copiando di nuovo il file vero.

## Migliorie dell'Excel ancora aperte (dalle note «Aperto» di Guida e Claude Log)

1. `Anag autisti`: colonna nuova **Calcolo ore** (tutti Effettive, Claudio Moccia Continuative, vuota tuk-tuk e sub-appalto).
2. `Paghe mese`: il TOTALE riga 56 somma anche le righe filtrate (passare a SUBTOTAL).
3. `gx_sync.py`: scrive Ore = 0 in Giornate; verificare che regga la colonna Mese in più di Ore giorno.
4. `Scheda autisti`: dettaglio giorno per giorno su un solo autista/mese.
5. `Situazione clienti`: «Dalla struttura» non dice se i soldi sono stati girati.
6. Ore a 0 a inizio ottobre per Olivieri, Moccia, Corbascio, Novelli, Giuseppe Ardito (manca in Anag autisti) — servono dati.
7. Decidere: tenere o togliere `Calessino dettaglio`.
8. `Partite`: Tedi e calessini (Stefano/Paolo) fuori; prezzi mancanti; Davide Franco senza listino (42 corse).
9. Credito Antonio Leggiero 2.787 €: capire se i 2.400 del 14/06 coprivano mesi precedenti.
10. Fatture fuori SdI (Anthropic, Make, Starlink, SumUp, voli): caricarle o no.
11. `Sospesi 2025` era sparito ed è stato ricreato: chiedere se l'aveva cancellato Agostino.
