# Progetti Apps Script — inventario 18/08/2026

Letti da Drive con `download_file_content` + `exportMimeType:
application/vnd.google-apps.script+json`. Non incollati a mano.

⚠️ **La ricerca Drive pagina male.** `search_files` con `mimeType =
'application/vnd.google-apps.script'` restituisce **cinque progetti alla volta** e il
`nextPageToken` torna sempre una pagina vuota. Per averli tutti si scende a finestre di
`modifiedTime`, partendo dal più vecchio visto al giro prima:

```
mimeType = 'application/vnd.google-apps.script' and modifiedTime < '<il più vecchio finora>'
```

Con questo metodo escono **11 progetti**, non 5.

| Progetto | Creato | Modificato | Cos'è |
|---|---|---|---|
| `1vo74eNOp7bRgiU-…` | 04/05/26 | 17/08/26 | **TransferLib** — libreria condivisa, letta |
| `1JPUJQRac9_W78r5…` | 22/02/26 | 17/08/26 | **Queue Processor v3** — legato a Strutture, letto |
| `1oi4bFxeTxZOGBXe…` | 10/07/25 | 06/08/26 | Invio Notifiche Telegram — non letto |
| `1rF0UF5s0AHafDeB…` | 24/03/26 | 05/08/26 | **Gestionale Barche V4.4** — letto, istantanea nel repo |
| `11Nv50CcOAmGoXs3…` | 12/07/26 | 02/08/26 | TE Planner — non letto |
| `1n2mzULjmCVgDhwL…` | 11/01/26 | 07/06/26 | **alertScheduler30s v2** — legato al gestionale, letto |
| `1XF9LNlsUa7z0pve…` | 06/03/26 | 06/03/26 | non letto |
| `1l8EVB-LDdEJ-kBs…` | 20/01/26 | 20/01/26 | non letto |
| `1qyzLC71IsJZPdeD…` | 27/07/25 | 01/11/25 | non letto |
| `1kC1BNmjxKJyQMfe…` | 19/07/25 | 31/10/25 | non letto |
| `1V1l5Mr_bPz-xj4I…` | 26/08/25 | 26/08/25 | non letto |

## Gli script dei fogli struttura NON sono in questo elenco

E si dimostra con le date, senza doverli aprire tutti.

Il foglio **Pietra Blu** è stato creato il **21/04/2026**. Uno script legato a un foglio nasce
insieme al foglio o dopo, mai prima. Dei progetti qui sopra, **nessuno è stato creato dopo il
21/04/2026** tranne `TransferLib` (04/05) e `TE Planner` (12/07), che sono altra cosa.

Quindi il progetto che contiene `Logica incasso.gs` e `Webhook.gs` — quello che Agostino ha
aperto e incollato il 18/08 — **esiste ma Drive non lo restituisce**. Stessa storia per gli
altri diciassette fogli struttura. Non è la paginazione: è proprio assente.

Non lo tira fuori nemmeno `parentId = '<id del foglio>'`, né `parentId` della cartella
strutture `1al3lTmtWjc7COEWRj7vyjC_q2ZCl4BJB` (quella contiene i fogli, non gli script:
uno script legato vive **dentro** il foglio, non accanto).

## Come leggerli comunque

Serve l'id del progetto, che sta nell'indirizzo dell'editor:

> foglio → **Estensioni** → **Apps Script** → copiare l'URL

```
https://script.google.com/…/projects/<QUESTO PEZZO È L'ID>/edit
```

Con l'id, l'export di Drive funziona come per tutti gli altri. Un URL per struttura, niente
codice da incollare.
