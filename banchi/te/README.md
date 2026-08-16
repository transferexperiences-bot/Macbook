# Banco offline — punto 1 (doppioni dalle strutture)

Il container di lavoro è usa e getta: i banchi stanno qui, non solo nello scratchpad.

```
node banchi/te/banco-pending.js
```

Rigioca dati veri di esecuzione, non inventati:

- `Code - Build ID + Telegram1` dell'esecuzione **742784** (16/08, Suite 10/Giovì, riga 134);
- intestazioni del foglio struttura ricavate da `Smart Write Struttura`, esecuzione **729828**
  (26 colonne A:Z → `Stato` = **V**, `Id` = **X**).

## Cosa cambia nel workflow `Transfer webhook` (`MJHTq5MksSeUhKgX`)

Oggi `Pending Transfer1` è un Google Sheets `update` con `matchingColumns: ["Id"]` sul foglio
**della struttura**. Su una riga nuova l'Id non c'è ancora: nessuna corrispondenza, nessuna
scrittura, la riga resta senza marcatura e Apps Script rimanda tutto da capo.

Al suo posto, tre nodi che scrivono **per numero di riga**:

| Nodo | Tipo | Cosa fa |
|---|---|---|
| `Pending - Intestazioni struttura` | HTTP GET | `…/values/{sheetName}!1:1`, credenziale `googleSheetsOAuth2Api` |
| `Pending - Prepara scrittura` | Code | `pending-prepara.js`: trova le colonne `Stato` e `Id`, costruisce i range su `rowIndex` |
| `Pending - Scrivi riga` | HTTP POST | `…/values:batchUpdate`, `valueInputOption: USER_ENTERED` |

`rowIndex` arriva da Apps Script (`body.riga`) ed è il numero di riga vero, intestazione
compresa: stesso numero che usa `Smart Write Struttura` (prova: `rowIndex 243` = `targetRow 243`,
esecuzioni `729824`/`729828`).

## Perché non basta cambiare `matchingColumns`

`appendOrUpdate` su una chiave inesistente **appende**. Restare su `update` per Id lascia il
guasto. L'unica strada che scrive sempre e non duplica mai è il numero di riga.

## Quando il banco dice «salta»

Se le intestazioni non si leggono, se manca la colonna `Stato` o `Id`, se la riga è 1 o non è
un numero, se l'Id è vuoto: **non si scrive**, e il motivo resta nel campo `reason`. Meglio non
marcare che marcare la riga sbagliata — la scheda Telegram è già partita comunque.

## Da fare prima di pubblicare

Zona rossa (scrittura su foglio struttura + come funziona un salvataggio): serve il via di
Agostino. Dopo `update_workflow` serve `publish_workflow`, poi rilettura del nodo dal server e
diff con quanto provato qui.
