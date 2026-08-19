# Come lavora Agostino — analisi delle chat vere
Fonte: export Telegram del bot Prenotazioni, 5.000 messaggi dal 12/01/2026 al 09/05/2026
(2.164 suoi, 1.561 con testo; 2.836 del bot). Analisi fatta il 19/08/2026 contando, non a occhio.
Il file delle chat NON sta nel repo: contiene dati di clienti veri. Qui restano solo i numeri.

## 1. Scrive corto. Cortissimo.

| | mediana | media |
|---|---|---|
| lunghezza dei suoi messaggi | **4 parole** (23 caratteri) | 16 parole |
| lunghezza dei messaggi del bot | 317 caratteri | 454 caratteri |

**Il bot scrive 4,2 volte più lungo di lui.** Il 47% dei suoi messaggi sta in 3 parole, il 24% in
una sola, il 74% in otto. Quando scrive lungo (9% dei casi) di solito **non sta ordinando: sta
incollando un cliente** — 49 dei 133 messaggi lunghi sono conversazioni WhatsApp inoltrate.

→ Un messaggio lungo va trattato come materiale da leggere, non come un comando.
→ Le risposte devono stare nella stessa misura: se lui scrive 4 parole, 450 caratteri di risposta
   sono un peso, non un servizio.

## 2. Lavora a raffica, e a tutte le ore

- **40% dei suoi messaggi arriva entro 60 secondi dal precedente.**
- **111 volte** ha mandato lo stesso identico messaggio due volte di fila.
- Scrive dalle 7 alle 23 (picchi 10-11 e 16-17), con **49 messaggi fra mezzanotte e le 3**.

→ Il buffer dei messaggi non è un lusso: è il modo in cui lavora. Su Prenotazioni c'è, su Orca no.
→ Niente logiche che diano per scontato «oggi» a cavallo della mezzanotte.

## 3. La cosa che il bot fa di più è chiedergli il permesso

Su 2.836 messaggi del bot, **919 finiscono con una domanda (32%)**. E di quelle domande:

| domanda | volte |
|---|---|
| «⚠️ Confermi l'inserimento?» (nelle due grafie) | **471** |
| «Confermi?» | 126 |
| «Confermi la cancellazione / la modifica / il tour…» | ~40 |

Cioè **circa 600 domande su 919 sono la stessa domanda**. E lui risponde in 1-2 parole nel 41% dei
casi: «sì», «conferma», «vai», «confermo» — 8 forme diverse per dire la stessa cosa.

→ La conferma non protegge: è un pedaggio pagato 600 volte. Va tenuta dove c'è un rischio vero
   (soldi, cancellazioni, sovrascritture) e sostituita altrove da **salva-e-mostra con «annulla»**:
   l'annullo costa un tap *quando serve*, la conferma ne costa uno *sempre*.

## 4. Il recap con i campi vuoti non è di stanotte: va avanti da gennaio

Messaggi del bot con almeno un campo vuoto nel recap (`Data:` / `Ora:` / `Da:` / `Per:` / `Nome:`
seguiti dal nulla):

| gen | feb | mar | apr | mag |
|---|---|---|---|---|
| 71 | 80 | **129** | 120 | 1 |

**401 volte in quattro mesi.** Il guasto di ieri sera (transfer di Alena salvato senza data, ora,
tratta e nome) è l'ultimo di una serie lunghissima, non un incidente.

→ La regola messa il 19/08 (se manca Data o Da/Per non si ritaglia e non si salva) andava messa a
   gennaio. E va estesa: **una scheda con campi vuoti non si mostra neanche** — si chiede il dato.

## 5. «?» e «riprova» sono il suo modo di dire che il sistema è fermo

- **33 volte** ha scritto solo «?».
- **33 volte** ha aperto con «riprova / rifai / ritenta».
- **29 messaggi** contestano o correggono («no», «ti ho detto», «non va», «sbagliato»).

Cosa c'era prima di quei messaggi: errori tecnici dichiarati (77 in tutto, 2,7% dei messaggi del
bot), «Trovati 0 transfer», recap con i campi vuoti, e silenzi.

→ Quando ci mette tempo deve dire cosa sta facendo. Uno «0 risultati» deve sempre dire **cosa ha
   cercato e dove** (fatto sul rientro il 19/08).

## 6. Per ogni lavoro usa mezza dozzina di parole diverse

| cosa vuole | come lo dice (volte) |
|---|---|
| creare | nuovo transfer (59) · aggiungi (35) · inserisci (27) · segna (19) · crea (16) · metti (13) |
| confermare | conferma (37) · sì/si (47) · vai (15) · confermo (15) · ok (6) · confermaaaaa (6) |
| cercare | recap (83) · cerca (47) · mostra (24) · controlla (22) |
| annullare | cancella (23) · annulla (20) · togli (7) · elimina (2) |
| modificare | modifica (49) · cambia (15) · aggiorna (7) |
| il ritorno | **ritorno (83)** · rientro (27) · A/R (21) · andata e ritorno (17) |

Nota: dice **«ritorno» tre volte più spesso di «rientro»**, e «A/R» 21 volte.

→ Il riconoscimento va tenuto nel codice con i sinonimi, non affidato a un elenco nel prompt.

## Le regole che ne discendono

1. **Chiedi solo dove fa male sbagliare.** Soldi, cancellazioni, sovrascritture: conferma.
   Tutto il resto: fai e mostra, con «annulla» a portata di mano.
2. **Mai mostrare né salvare una scheda con buchi.** Manca la data? Chiedi la data, non far vedere
   un recap con `Data:` vuoto.
3. **Rispondi corto.** La sua unità di misura è quattro parole.
4. **Un messaggio lungo è materiale, non un ordine.**
5. **Sinonimi nel codice.** «ritorno» vale «rientro», «segna» vale «inserisci», «recap» vale «cerca».
6. **Se ci metti tempo, dillo. Se non trovi niente, di' cosa hai cercato.**
7. **Non fargli ripetere.** 111 ripetizioni identiche sono 111 fallimenti del sistema, non suoi.
