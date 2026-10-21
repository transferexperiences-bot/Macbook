# Progetti aperti — regia unica

Aggiornato 21/10/2026 pomeriggio. Questa sessione segue tutte le altre: si parla solo qui, le
istruzioni vengono girate alla sessione giusta. Le regole di `CLAUDE.md` valgono per tutte.

Fonti: sessioni cloud di Claude Code, rami git, pagine pubblicate dalle chat di Claude.
Le chat dell'app e di Cowork non si leggono da qui: si portano incollando un loro riassunto.

## 🚨 Operativo (dal Cruscotto TE, giro 21/10 13:18)
- 145 voci aperte, 134 aspettano Agostino (48 «oggi», 7 «stasera», 20 «domani").
- Melograno 22/10 05:30 → Bari **senza autista**. Master Italy 22/10 20:20 autista da assegnare.
- Bari → Auraterrae 19:55 di stasera da riassegnare. Sparano 23/10 04:00 aspetta ok.
- Puglia Concierge chiede chiamata urgente. Best Things contesta 14.798 e il 20%.
- Pagina: https://claude.ai/artifact/JuphigSXEXkYE8mXyCBZZc

## 1. Bot autisti — fogli di viaggio e rendicontazione
- **Fogli di viaggio autisti** (`session_017Eaxw1uQzbvNx67emN7iXr`, ramo `claude/new-session-ukn5n3`):
  ferma su «Parto?» per fasi 0-1. Colonna `Calcolo ore` già creata (commit 21/10 11:56).
  Fase 2: serve il bot nuovo (@BotFather + credenziale Telegram in n8n). Decisioni in
  `bot_autisti/decisioni.md`.
- **Bot di prova responsabile autisti** (`session_01K6eg8TBCrpBDHJbHokqC3U`, workflow
  `E1RapyXw9bjAit9G`): v8g (spesa «⚠️ senza scontrino», servizi prossimi 3 giorni).
  Da fare: verificare sul server `versionId = activeVersionId` (messaggi contraddittori);
  prova di Agostino `/prova Claudio Moccia 12/10` con foto; poi decidere il passaggio in produzione.
- Scheda Autista bozze https://claude.ai/artifact/KNNzA4Yin4RPJkGokKR1Tr: due versioni segnate
  «scelta», va indicata quella definitiva.

## 2. Plancia / TE Planner
- **Terminale e miglioramenti plancia** (`session_012CtqAxKqJFka9b8YESJHTp`).
  Richiesta aperta (21/10 09:13): **la modifica Bayit (tariffa 120 → 96) in attesa su Telegram
  non compare in Plancia**, e Agostino voleva confermarla da lì. Interrotta mentre scaricava il
  codice vivo di «TE Planner».
- Il codice vero della Plancia sta solo sul Mac (`te-planner-rev`); su GitHub c'è una copia del
  28/08, più vecchia. Il ramo `plancia-mac` non è mai stato creato → va spinto dal Mac.

## 3. Gestionale Excel e App Conti
- **Excel** (`session_01FncEiS4TgNxCKfRqVTHdrb`): riordino in 4 gruppi via Claude in Excel
  (`excel/PROMPT_claude_in_excel.md`). Solo il Gruppo A (Calessino) approvato, esecuzione non
  confermata. Restano B (Ore), C (Best Things 14.588 vs 14.798, Your Driver 10 €, Michele,
  Pastoressa n.18), D (Da incassare / Da fatturare, fermi al 09/10). Prima: backup manuale.
- **Progetto Transfer 2026 – Gestionale** https://claude.ai/artifact/EQczYPcdJQbZFR3F1i4hH5:
  5 passi dopo la verifica del file (pagamenti autisti solo nel nuovo file, «Servizi notte»
  06:30 smette di scrivere su Book 1, regole fatturazione, Dare/Avere colleghi, una sola regola
  della mezzanotte).
- **App Conti** (`session_01Ue8H6jkfpsrytUkkQ7dQor`): finita, da controllare.
  https://claude.ai/artifact/KKGZGn7WP5LQeUr4Y37CtE

## 4. Crediti
- Cruscotto crediti (dati fissi del 20/10) https://claude.ai/artifact/8QunXrxUuaPXUhvxuh4zfe
- ~70.369 € da incassare, 26.262 € oltre 30 giorni; ottobre 1-20 da fatturare ~38.198 €.
- Melograno da sollecitare (18.008), Tedi da verificare (n.70 contestata), De Napoli proforma.

## 5. Scadenze e sicurezza
- Archivio Narracci https://claude.ai/artifact/8XYqWGwrNiMv65Kt7WwYcx: **~12 contratti autisti
  scadono il 31/10**; revisioni scadute (Renault EC349RJ, Iveco GJ141DD, BMW FC098CW, Ape
  Calessino); MAV Cassa Edile 7.078,92 € (06/10); rata Allianz FM300TR 2.044 € (15/10);
  autovelox GZ441BF entro 10/11.
- Organigramma Sicurezza https://claude.ai/artifact/BWEAcsNVGE6YRQK8xAe3WF: Transfer 77 mancanti
  (68 personale), 7 scaduti; Edilelettroscavi 32 mancanti, 8 scaduti; buste paga ago-set da caricare.

## 6. Amore (trattoria, Monopoli)
- Brief logo https://claude.ai/artifact/WRv7vsFHVY98vxov13ZafS: scegliere la direzione (la 1 piaceva).
- Menù https://claude.ai/artifact/WcBZJa27MB9UvGXcsJCWcT: mancano telefono, sito, giorno di
  chiusura, Instagram; aperitivo 14 € (Vini) contro formule 30/40 € (Stuzzicheria).

## 7. Affidabilità n8n — vecchie code (agosto-settembre)
- Da verificare sul server: **guardia rientro in `Parse transfer`** «pronta ma non pubblicata» (22/08).
- Aperti in `ERRORI.md` (ramo `claude/da-fare-md-review-uvwaqe`): conferma che non torna sul foglio
  della struttura (🔴, aspetta ok), varianti dello script struttura, tre risolutori di colonne.
- **Script riscrive data** (`session_0172eYgwrX1sVW9FtgpCKPW3`, 11/09): `onChange` continua a girare;
  decidere se spegnere `onChangeDate` o loggare `e.changeType`. Forse ancora attuale.
- Superate: CONSEGNA righe 1359/1360 (servizi di agosto), Watchdog (18/08), DA-FARE review
  (domanda su Fanelli), Accesso a n8n.

## Chiusi / archivio
Ibiza, Auraterrae, Programma Jill, contabilità e fatture di agosto, cruscotti di settembre.
