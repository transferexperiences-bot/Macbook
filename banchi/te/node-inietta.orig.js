const base = $('📋 System Prompt v6.36').first().json;
let rows = [];
try { rows = $('Leggi Storage').all().map(i => i.json); } catch (e) {}
const dati = rows
  .map(r => String((r && (r.Dati ?? r.dati)) || '').trim())
  .filter(s => s.length > 0)
  .join('\n---\n');
// BOZZE LEDGER v1: inietta i transfer in bozza persistenti
let bozze = '';
try {
  for (const r of $('Leggi Bozze').all()) {
    const d = r.json.Dati ?? r.json.dati;
    if (!d) continue;
    const map = JSON.parse(String(d));
    bozze = Object.values(map).map(v => String((v && v.b) || '')).filter(Boolean).join('\n\n');
  }
} catch (e) {}
// === PROMPT A MODULI (13/08/2026) ===
// 14:50 — «conferma» (§4.13) e «bozze» (§4.42) NON sono più condizionali: alle 13:24, su
// «30€ salva subito», mancando §4.42 l'agente ha risposto solo «Salvataggio in corso...»
// senza il blocco del transfer, e il salvataggio è partito a vuoto (Tariffa DA DEFINIRE).
// Regola: quello che governa il salvataggio sta sempre nel prompt, costi 4.000 caratteri.
// 62.646 caratteri a ogni messaggio erano la ragione degli 85 secondi di stanotte. Il nucleo
// resta sempre; le famiglie di regole qui sotto si caricano solo se il messaggio le riguarda.
// Il taglio è ancorato ai titoli veri: titolo non trovato = niente taglio (si resta al sicuro).
const __MODULI = [{"nome": "lingua", "inizio": "4.15 🌐 Lingua output (recap, messaggi, risposte):", "fine": "4.16 🔴 NOMI DI POSTI — MAI scartare parole sconosciute prima/dopo il comune:", "rx": "(messagg|scriv\\w*\\s+al\\s+cliente|manda|inglese|english|traduc|wa\\.me|whatsapp|mail)"}, {"nome": "batch", "inizio": "4.19 ⚡ BATCH MODE — tanti transfer:", "fine": "4.20 🔴 NIENTE TEMPLATE n8n / ESPRESSIONI NON RISOLTE NELL'OUTPUT:", "rx": "(batch|\\|\\|\\||\\btanti\\b|multipl|\\b\\d+\\s*transfer\\b|;\\s*\\d{1,2}[:.]\\d{2})"}, {"nome": "link", "inizio": "4.28 🔗 PATTERN \"Nome (link)\" / \"Nome [link]\" — ESTRAZIONE:", "fine": "4.29 🕔 DISAMBIGUAZIONE AM/PM via CONTESTO VOLO (obbligatoria):", "rx": "(https?://|maps\\.app|goo\\.gl|\\(link\\)|\\[link\\])"}, {"nome": "volo", "inizio": "4.29 🕔 DISAMBIGUAZIONE AM/PM via CONTESTO VOLO (obbligatoria):", "fine": "4.30 📇 VCARD → OSPITE DEL TRANSFER (linking multi-turno):", "rx": "(volo|flight|\\bam\\b|\\bpm\\b|atterr|decoll|landing|arriv|aeroport|airport)"}, {"nome": "vcard", "inizio": "4.30 📇 VCARD → OSPITE DEL TRANSFER (linking multi-turno):", "fine": "4.31 ✅ RECAP COMPLETO DOPO MODIFICA (obbligatorio):", "rx": "(vcard|contatto|BEGIN:VCARD|tel:)"}, {"nome": "date", "inizio": "4.32 ⚠️ MISMATCH GIORNO ↔ DATA — verifica e chiedi conferma:", "fine": "4.33 ℹ️ POLICY CANCELLAZIONE / RITARDO (ufficiale 22/05/2026) — serve SOLO se A", "rx": "(\\d{1,2}[/\\-]\\d{1,2}|luned|marted|mercoled|gioved|venerd|sabato|domenica|domani|oggi|dopodomani|stasera|stamattina)"}, {"nome": "deposito", "inizio": "4.38 ✅ DEPOSITO AL SALVATAGGIO (03/07/2026 sera):", "fine": "4.39 🛟 MAI PERDERE UNA BOZZA IN SOSPESO (03/07/2026):", "rx": "(deposit|acconto|sumup|20\\s?%|caparr)"}, {"nome": "ricerca", "inizio": "9. FLUSSO RICERCA / DOMANDE", "fine": "9.1 🔴 FILTRO ORA per \"ancora da svolgere\"/\"rimanenti oggi\":", "rx": "(cerc\\w+|trov\\w+|quali|quanti|elenco|lista|recap|storico|che transfer|che servizi|riepilog)"}, {"nome": "modalita", "inizio": "4.22 💸 PATTERN MODALITÀ DI PAGAMENTO (linguaggio naturale):", "fine": "4.23 🕐 PARSING ORARI ITALIANI — RIGIDO:", "rx": "(contant|carta|\\blink\\b|fattura|incassar|sconto|pag\\w+|bonifico)"}, {"nome": "modifica", "inizio": "4.18 🔄 RILEVAMENTO MODIFICA AUTOMATICO (solo flussi incerti, NON in batch):", "fine": "4.18b 🔴 RECAP COMPLETO MULTI-TRANSFER (prima di salvare):", "rx": "(modific\\w*|cambia\\w*|sposta\\w*|corregg\\w*|aggiorn\\w*|invece|annull\\w*)"}];
const __spia = [String(base.original_text || ''), String(base.clean_text || ''),
                String(dati || ''), String(bozze || ''), String(base.kind || '')].join(' \n ');
let __prompt = String(base.systemPrompt || '');
const __tolti = [], __tenuti = [];
for (const m of __MODULI) {
  let serve = true;
  try { serve = new RegExp(m.rx, 'i').test(__spia); } catch (e) { serve = true; }
  if (serve) { __tenuti.push(m.nome); continue; }
  const i = __prompt.indexOf(m.inizio);
  if (i < 0) continue;                                  // titolo cambiato: non tocco niente
  const j = m.fine ? __prompt.indexOf(m.fine, i + m.inizio.length) : __prompt.length;
  if (j < 0 || j <= i) continue;                         // fine non trovata: non tocco niente
  __prompt = __prompt.slice(0, i) + __prompt.slice(j);
  __tolti.push(m.nome);
}

return [{ json: { ...base, storage_dati: dati, bozze_dati: bozze,
  prompt_sistema: __prompt, moduli_tolti: __tolti.join(','), moduli_tenuti: __tenuti.join(','),
  prompt_lunghezza: __prompt.length } }];

