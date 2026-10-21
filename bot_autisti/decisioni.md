# Fogli di viaggio — decisioni di Agostino (20-21/10/2026)

Progetto: bot Telegram nuovo per gli autisti (senza toccare il bot Allert), scheda per
servizio con ▶️ Inizio / ⏹️ Fine. Regole generali in `CLAUDE.md`.

## Deciso
- **Chat privata** autista ↔ bot, stile Uber: una scheda viva (Prossimo → In corso → Concluso).
- **Sostituisce Jotform** (`BITnO4B4HtdyeIOC9bAiS`). Jotform resta acceso fino a collaudo finito.
  Il bot nuovo scrive con le **stesse colonne** del tab `Fogli di viaggio` della Check list
  (`1z77zMyUch9s9Hx5yH7NoomHDYkZqTo_yPhpGAW34MrI`, gid 1477457448), e rifà anche:
  riga a gestionale tuk-tuk/Calessino, «Confermi di aver terminato?» (bot Rendicontazione),
  check-out Stato mezzi.
- **Chiusura giornata resta sul bot Rendicontazione**, che usa le ore dei fogli di viaggio.
  Modifiche a Rendicontazione / Fine Servizio prima su una copia di prova.
- **Km per mezzo** (ultima Fine di quella targa, chiunque guidasse).
  Inizio proposto = km ultima Fine + km Moox da allora; Fine = km Inizio + km Moox del tragitto;
  l'autista conferma ✅ / corregge ✏️ / 📷. Mezzo senza Moox (GZ441BF): numero o foto.
- **Aggancio giornaliero**: foto o numero del cruscotto al primo Inizio della giornata.
- **Soglia giustificazione**: oltre il 15% **e** oltre 45 minuti rispetto a Moox (entrambe).
  Poi Agostino approva/rifiuta con bottoni.
- **Default alle 10:00 del giorno dopo** senza conferma: ore Moox; se Moox non ha ore → ore del gestionale.
- **Conferma ore sempre** chiesta all'autista (anche se foglio = Moox), con bottoni.
- **Nuovo servizio da Telegram**: tutti gli autisti, senza approvazione di Agostino (facile per loro).
  Restano: controllo «È questo?» contro i doppioni (±60' su mezzo/autista) e allarme tariffa mancante.
  In prova solo data table.
- **Calcolo ore** (colonna nuova in `tblAutisti`, Excel `Transfer 2026 - Gestionale.xlsx`):
  tutti **Effettive**, tranne **Claudio Moccia = Continuative**. Vuota per tuk-tuk e sub-appalto.

- **Pagamento** chiesto solo alla Fine del foglio di viaggio (💵 / 💳 / Fattura / Già pagato).
  "Come hai incassato" (`PM|<Id>|…` in Promemoria Autisti 4, bot Allert) **si toglie**, ma solo
  dopo la prova e con ok esplicito al momento (cambia un salvataggio attivo: zona rossa).

## Ancora aperto
- Copione Assistente Autisti v3 (`bot_autisti/copione_v3.md`) da incollare.
- Bot nuovo (@BotFather + credenziale n8n) e gruppo di prova: li crea Agostino.
- Promemoria (default se non detto): Inizio +10', Fine = durata stimata +30', max 2 solleciti poi avviso ad Agostino.
