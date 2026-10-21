# Responsabile Autisti — proposta v1 (20/10/2026)

Un solo bot per gli autisti (il bot **Rendicontazione**) che fa il lavoro di un responsabile autisti:
apre e chiude la giornata, segue spese e rifornimenti, controlla incassi e contanti, tiene lo stato dei mezzi,
risponde alle domande 24 ore su 24 e passa ad Agostino solo quello che serve una decisione.
Sostituisce: Rendicontazione + sotto-workflow Fine Servizio + Agent per stato mezzi + Recap flotta.

Basi: `mappa_rendicontazione.md`, `mappa_stato_mezzi.md`, `copione_v3.md`.

## 1. Come è fatto — tre pezzi, ognuno col suo mestiere

| Pezzo | Fa | Non fa mai |
|---|---|---|
| **Agente** (Claude) | Parla con l'autista in modo naturale, capisce testo e vocali, legge le foto (scontrini, contatore cisterna, cruscotto km, danni), risponde alle domande, decide il prossimo passo del copione | Scrivere sui fogli; inventare un numero; dire «salvato» |
| **Codice** | Calcola ore, litri, totali, incassi; controlla (doppioni, soglie, km che tornano indietro); salva con un Id vero; rilegge il foglio e solo allora dice «salvato» | Interpretare il testo libero |
| **Sessione** (tabella dati) | Ricorda dove si è arrivati: giornata aperta, mezzo, prima foto del contatore, spesa in attesa di conferma | — |

Oggi la sessione vive nella memoria del modello (2-10 messaggi): per questo si perdono spese a metà e prime foto della cisterna. Nel nuovo sistema sta in una tabella e sopravvive a riavvii e conversazioni lunghe.

**Regola d'oro:** ogni cifra torna all'autista con un bottone [✅ Giusto] [✏️ Correggo]; si salva solo dopo il tap, una volta sola (Id univoco = niente doppioni anche se tocca due volte).

## 2. La giornata dell'autista

### Apertura (al primo servizio o all'accensione del mezzo da Moox)
- «Buongiorno Claudio, oggi 5 servizi, il primo alle 08:10 a Bari Aeroporto. Prendi il Maybach GZ441BF?» [✅] [Altro mezzo]
- Foto del cruscotto → km e spie lette dalla foto, confermate con bottone.
- Carburante [¼ ½ ¾ Pieno], pulizia [ok / da fare], danni nuovi [No / Sì → foto].
- Se il mezzo ha un problema aperto lasciato da un altro autista: «Ieri Paolo ha segnalato la spia gomme: è ancora accesa?»
- Una sola apertura per mezzo e giorno (oggi le accensioni Moox ne creano più d'una).

### Durante la giornata (quando vuole)
- **Spese e rifornimenti**: foto scontrino → dati proposti → conferma. Cisterna con 2 foto obbligatorie, litri dal contatore (999 → 0). Pagato con [Contanti incasso] [Soldi miei].
- **Pasti**: tetto e numero al giorno controllati dal codice, non dal prompt.
- **Segnalazioni**: ritardo, no-show, guasto, incidente, problema con il cliente → subito ad Agostino.
- **Domande**: prossimo servizio, indirizzo, cliente, volo e ritardo, cosa ha ancora da incassare, procedure.
- **Promemoria intelligenti**: «Hai fatto rifornimento alle 14:00 ma non mi hai mandato la seconda foto del contatore.»

### Chiusura (20' dopo la fine dell'ultimo servizio)
1. Riepilogo servizi del giorno.
2. **Ore** secondo «Calcolo ore» di Anag autisti (continuative / effettive; tuk-tuk: base del giorno). Oltre 15% e 45' da Moox → motivo → Agostino approva.
3. **Incassi in un solo riepilogo**: salta fattura e già pagati; carta riscontrata su SumUp; chiede solo i dubbi.
4. **Contanti**: incassati − spese pagate con l'incasso + residuo dei giorni prima → «Li hai lasciati a Eusto?»
5. **Spese del giorno**: riepilogo di quelle registrate, «manca qualcosa?».
6. **Mezzo**: foto cruscotto (km finali), carburante, pulizia, anomalie, tessera APT.
7. Riepilogo finale → [✅ Tutto giusto] → salvataggio → rilettura → «Giornata chiusa e salvata».

Senza risposta: promemoria dopo 1 ora e alle 22:00; alle 10:00 del giorno dopo ore nostre (Moox) e lista dei sospesi ad Agostino.

## 3. Agostino

Su Telegram, con bottoni, solo:
- ore oltre soglia [Approva] [Rifiuta: ore Moox];
- incasso non trovato su SumUp, non incassato, contanti che non tornano;
- danni, spie, mezzo non marciabile (subito);
- cisterna con letture che non tornano;
- ogni sera un riepilogo breve: giornate chiuse, sospesi, mezzi con problemi.

## 4. Scheda stato mezzi (artefatto nuovo)

Una pagina con una scheda per mezzo, aggiornata da quello che raccoglie il bot:

| Sezione | Dati |
|---|---|
| Oggi | autista, marciabile sì/no, ultimo aggiornamento |
| Km | km attuali (foto cruscotto), km nel mese, prossimo tagliando tra X km |
| Carburante | livello a fine giornata, rifornimenti (litri, €, distributore/cisterna), consumo l/100 km |
| Pulizia | interno / esterno, ultimo lavaggio |
| Danni e spie | segnalazioni aperte con foto e data, chi le ha viste, chiuse |
| Scadenze | revisione, assicurazione, bollo, tagliando, gomme (rosso / giallo / verde) |
| Storico | ultime 10 giornate: autista, km, carburante, note |

Fonte unica della flotta: oggi i mezzi sono scritti in 4 posti diversi (e «Vito HD438SD» non è in nessuno). Ne va scelto uno solo.

## 5. Cosa si salva e dove (nessun salvataggio di oggi si perde)

| Oggi | Domani |
|---|---|
| Recap (spese, rifornimenti, foto) | Recap, stesse colonne, con Id univoco e numeri dal codice |
| Check list › Fogli di viaggio (Modalità, Registrato) | Stessi campi, solo sulle righe di quell'autista e quel giorno |
| Check list › Riepilogo servizi (ore, incasso, note) | Stessi campi + km e totale, numeri con la virgola |
| Allert › Fine servizio (promemoria) | Sostituito dalla sessione; niente più cancellazioni vere |
| Schede mezzo / dashboard / LOG_EVENTI (stato mezzi) | Tabella «Stato mezzi» + storico eventi, solo aggiunte; i fogli di oggi restano aggiornati finché servono |
| Drive (foto) | Stessa cartella, condivisione in sola lettura |
| Giornate (Excel) | Ore con fonte CONFERMATE |

## 6. Come ci si arriva

1. **Banco offline** del motore con giornate vere copiate (nessun messaggio, nessuna scrittura).
2. **Bot di prova**, Agostino fa l'autista; scrive solo nelle tabelle di prova.
3. **Cambio** sul bot Rendicontazione con l'ok di Agostino; i workflow vecchi restano salvati e si riattivano in un minuto.
4. **Bot stato mezzi**: gli autisti passano al bot unico; il vecchio si spegne con l'ok di Agostino.
5. **Scheda stato mezzi** pubblicata appena ci sono i primi dati veri.
