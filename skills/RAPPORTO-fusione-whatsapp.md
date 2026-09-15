# Fusione `messaggi-whatsapp` + `whatsapp-recap` — cosa ho fatto e cosa devi rimettere

Data: 15/09/2026. Leve 1 e 2 dell'analisi: **una sola skill invece di due gemelle**, e **la
cronaca dei casi fuori dal corpo**.

> ⚠️ **Queste skill non stanno in questo repo.** Sono plugin sincronizzati dall'account
> dentro una cartella del container, che sparisce con la sessione. **Non c'e' modo di
> scriverle direttamente sull'account da qui**: non esiste un'API. Sono quindi impacchettate
> in file `.skill` **installabili con un clic** dal tasto *Save skill* sulla card del file.
> Finche' non li installi, in produzione gira la versione vecchia: stessa trappola del
> `publish_workflow` su n8n.

## I file

| file | cosa e' |
|---|---|
| `skills/messaggi-whatsapp/SKILL.md` | la skill fusa — **sostituisce** `messaggi-whatsapp` |
| `skills/messaggi-whatsapp/storia.md` | i casi, fuori dal percorso caldo — **file nuovo** |
| — | `whatsapp-recap` **si elimina**: tutto il suo contenuto e' dentro la fusa |

## I numeri

|  | prima | dopo |
|---|---|---|
| file che si aprono a un «check wa» | 2 (33,4 KB + 29,6 KB) | 1 (47,5 KB) |
| token letti da ogni agente | ~17.000 | ~12.800 |
| storia dei casi | dentro, sempre letta | 8,5 KB fuori, letta a richiesta |

**−24% per agente**, cioe' **~25.000 token in meno** su un giro a sei agenti. E soprattutto:
una fonte sola, quindi non puo' piu' succedere che due skill dicano cose diverse sulla stessa
cosa.

## La prova che non si e' perso niente

127 controlli automatici, uno per ogni regola normativa delle due skill originali, cercati
dentro la fusa + `storia.md`: **127 superati**. I due che il test ha segnalato
(«prima tratta del van», l'id del backup strutture) erano falsi allarmi — grassetto in mezzo
alla frase e un mio refuso nella stringa di test; entrambe le regole sono al loro posto.

## Cosa ho tolto, e perche'

**Niente regole.** Ho tolto solo queste tre cose:

1. **Le ripetizioni fra le due skill.** Dicevano le stesse cose due volte, a volte con parole
   diverse: la priorita' (strutture → chi deve pagarci → preventivi), il triage delle categorie,
   l'incrocio col gestionale, «prima di dire che qualcuno e' fermo», «gli autisti sono dati»,
   «cosa parte da solo», la forma del recap, «quando non si sa», il giro automatico. Dove le due
   versioni non erano identiche ho tenuto **l'unione**, mai la piu' corta: per esempio la tabella
   *informazione → azione* ora ha 16 righe (8 venivano da una, 8 dall'altra).
2. **Il racconto dei casi**, spostato in `storia.md`. Nel corpo resta la regola e il nome del
   caso fra parentesi; il racconto si apre solo quando serve capire perche' una regola esiste.
3. **La sezione «Leggere: la skill messaggi-whatsapp»** di `whatsapp-recap`, che serviva solo a
   rimandare all'altra skill e a dire che il vecchio metodo col browser era superato. Con una
   skill sola non ha piu' oggetto.

## Cosa NON ho cambiato

La **numerazione delle sezioni di `messaggi-whatsapp` e' intatta** (2, 4-bis, 5, 5-bis, 7, 9),
apposta: sono le ancore che le altre skill citano. Verificate una per una, tutte valide.

## Le sei righe da correggere nelle altre skill

Citano `whatsapp-recap`, che non esistera' piu':

| skill | riga | da | a |
|---|---|---|---|
| `contesto-contatti` | 68 | `whatsapp-recap` sezione 3 | `messaggi-whatsapp` sezione 6 |
| `contesto-contatti` | 79 | `whatsapp-recap` sezione 0 | `messaggi-whatsapp` sezione 0-bis |
| `giro-a-due-agenti` | 19 | ...`messaggi-whatsapp` (...), `whatsapp-recap`, `niente-in-sospeso`... | togliere `whatsapp-recap` dall'elenco |
| `giro-a-due-agenti` | 44 | `whatsapp-recap` sezione 0-ter | `messaggi-whatsapp` sezione 4 |
| `giro-a-due-agenti` | 136 | forma in `whatsapp-recap` sezione 4 | forma in `messaggi-whatsapp` sezione 7 |
| `giro-a-due-agenti` | 276 | ...`messaggi-whatsapp`, `whatsapp-recap`, `conferma-gestionale`... | togliere `whatsapp-recap` dall'elenco |

`niente-in-sospeso` riga 44 cita solo `messaggi-whatsapp`: va bene com'e'.

## L'apikey: due copie diverse, apposta

Nella riga della sezione 1 che interroga Evolution dal Mac:
- **la copia in questo repo** ha un **segnaposto** — la regola di casa dice di non committare
  mai un token in chiaro;
- **il pacchetto `.skill`** ha la **chiave vera**, cosi' si installa e funziona senza toccare
  niente.

## L'ordine giusto per installarle

Tre `.skill` gia' pronti — le sei righe qui sopra sono **gia' corrette dentro i pacchetti**:

1. `messaggi-whatsapp.skill` — la fusione, con `storia.md` dentro.
2. `contesto-contatti.skill` — due rimandi corretti.
3. `giro-a-due-agenti.skill` — quattro rimandi corretti, **partendo dalla v3 pubblicata alle
   15:30**, non dalla versione letta a inizio sessione.
4. **Solo alla fine, a mano:** elimina `whatsapp-recap`. E' l'unico passo non impacchettabile —
   cancellare una skill non si fa con un file. Per ultimo, cosi' non resta mai un rimando nel
   vuoto.

## Una cosa e' cambiata mentre lavoravo

Alle 15:30 e' stata pubblicata la **v3 del giro**: il Contesto non e' piu' un agente a se'
(bloccava tutto per 10-15 minuti), e' il **passo 0 di ogni Scrittore**; cinque agenti in
parallelo; da ~45 minuti a ~20. La fusione, scritta mezz'ora prima, diceva ancora «sei agenti,
il Contesto per primo».

**Riallineata**: tre punti in `SKILL.md` (intestazione, passo 2 della sezione 0, sezione 9) e
l'evoluzione aggiunta a `storia.md`. E' esattamente il caso che la fusione doveva prevenire —
due testi che dicono cose diverse sulla stessa cosa — quindi valeva rileggere prima di
impacchettare, come vuole la regola «si rilegge la riga un attimo prima di scriverla».

## Cosa resta sul tavolo (leve 3 e 4)

- **Leva 3** — i sei agenti rileggono tutti le stesse skill; Allegati e Orari leggono le stesse
  fonti e potrebbero essere un agente solo. Cambia come gira il check: va decisa, non fatta.
- **Leva 4** — `docx`, `pptx`, `xlsx`, `learn`: 3.900 caratteri di description a ogni turno per
  skill che non useresti mai da qui.
