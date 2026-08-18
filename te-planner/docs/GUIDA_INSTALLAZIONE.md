# TE Planner — Guida installazione (5 minuti)

## 1. Crea il progetto Apps Script
1. Apri il foglio **Programma Autisti 2.0** su Google Sheets.
2. Menu **Estensioni → Apps Script** (così lo script nasce già collegato al tuo account).
3. Cancella il contenuto di `Codice.gs` e incolla tutto il contenuto di **Code.gs**.
4. Menu **File → Nuovo → File HTML**, chiamalo esattamente `Index` e incolla il contenuto di **Index.html**.
5. In alto: ⚙️ **Impostazioni progetto → Fuso orario** → verifica che sia **Europe/Rome**.

## 2. Deploy come web app
1. In alto a destra: **Esegui il deployment → Nuovo deployment**.
2. Tipo: **App web**.
3. Esegui come: **Me** · Chi ha accesso: **Solo io** (o "Chiunque abbia l'account Google" se vorrai darla ai collaboratori).
4. **Esegui il deployment** → autorizza i permessi richiesti (Sheets, Maps, connessione esterna per il webhook n8n).
5. Copia l'**URL della web app** e aprilo dal cellulare → **Condividi → Aggiungi a schermata Home**: avrai l'icona come una vera app.

## 3. Cosa fa
- **📋 Servizi**: filtro per data (frecce ‹ › e tasto Oggi), card per ogni transfer; in rosso quelli senza autista o mezzo.
- Tocca una card → menù a tendina **Autista** e **Veicolo** divisi in sezioni:
  - ✅ **Disponibili** — nessun conflitto.
  - ⏳ **Occupati (forzabile)** — con orario stimato in cui si liberano; selezionabili con avviso di forzatura.
  - 🚫 **Non disponibili / Fuori servizio** — OFF, riposo fisso, indisponibilità in data.
  - ⚠️ **Capienza insufficiente** — posti < pax del servizio.
- **⏳ Flotta ora**: per ogni autista e mezzo, clessidra col countdown "si libera tra X (alle HH:MM)" e barra di avanzamento del servizio in corso. Si aggiorna da sola ogni minuto.
- **Salva**: scrive Autista/Veicolo sulla riga giusta (match per Id) e chiama il webhook n8n `autista-onchange` per propagare ai gestionali delle strutture.

## 4. Logica di disponibilità (replica del tuo Turni v6)
- Durata servizio = tempo Google Maps Da→Per **× 1,3** + `h extra` × 60.
- Un autista/mezzo è in conflitto se non riesce a concatenare i due servizi: fine servizio + trasferimento verso il pickup + **buffer 15 min** (0 se stesso luogo, 10 se < 5 km) supera l'orario di partenza.
- Autista escluso se: Stato **OFF**, **Indisponibilità** contiene la data (gg/mm), **Riposo fisso** = giorno della settimana.
- Veicolo escluso se Stato = FUORI SERVIZIO / OFF.

## 5. Note tecniche
- Le tratte calcolate vengono salvate nel tab nascosto **`_CacheTratte`** del foglio: la prima apertura di una giornata nuova può metterci qualche secondo in più, poi è veloce.
- Tutte le costanti (buffer, fattore 1,3, webhook on/off) sono in cima a `Code.gs` nella sezione `CONFIG`.
- Se rinomini tab o colonne del foglio, la app li ritrova per nome (non per posizione), ma i nomi in `CONFIG` devono restare allineati.
