# Banco offline — punto 1

⚠️ **La correzione che questo banco provava è stata abbandonata.** Scriveva sul foglio
struttura puntando la riga **per numero**: regola violata (sempre e solo Id univoco — se
l'ordine delle righe cambia si scrive nella riga di un altro cliente). Non va pubblicata.

Il banco resta perché rigioca **dati veri di esecuzione** ed è utile come impalcatura:

```
node banchi/te/banco-pending.js
```

- `Code - Build ID + Telegram1` dell'esecuzione **742784** (16/08, Suite 10/Giovì, riga 134);
- intestazioni del foglio struttura da `Smart Write Struttura`, esecuzione **729828**.

## La causa vera del doppione (vedi DA-FARE punto 1)

Non è in n8n. È in `processQueue()` dell'Apps Script *Transfer Queue Processor v2*: dopo il POST
aspetta l'ack `": Pending"` sulla riga struttura per soli `MAX_VERIFY_MS = 6000` ms, mentre n8n
quel valore lo scrive al secondo ~13 (`Pending Transfer1` parte a 5,19 s e dura 8,18 s).
Scaduta la finestra segna `SENT` e dopo `RESEND_AFTER_MS = 90000` rimanda.

Regressione dell'8 giugno 2026: la versione precedente, ancora nel file come
`processQueue_BACKUP()`, aspettava `MAX_WAIT_SECONDS = 30`.
