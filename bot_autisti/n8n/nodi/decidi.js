// cosa serve per questo evento: la lettura della foto? la giornata (dati del gestionale, Moox, SumUp)?
const ev = $('Leggi evento').first().json;
const righe = $('Leggi sessione').all().map(i => i.json).filter(r => r && r.chat);
let st = {}; try { st = righe.length ? JSON.parse(righe[0].stato || '{}') : {}; } catch (e) { st = {}; }
const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const c = st.chiusura, a = st.apertura, s = st.spesa;
// quale foto ci si aspetta (decide il prompt della lettura, mai il contenuto)
let tipo_foto = 'scontrino';
if (s && /^foto/.test(s.passo || '') && s.dati && s.dati.cisterna) tipo_foto = 'contatore';
else if (s) tipo_foto = 'scontrino';
else if (c && c.passo === 'km') tipo_foto = 'cruscotto';
else if (c && c.passo === 'prob_testo') tipo_foto = 'danno';
else if (a && a.passo === 'km') tipo_foto = 'cruscotto';
else if (a && a.passo === 'danni_foto') tipo_foto = 'danno';
// testo libero che nessun passo sta aspettando: lo fa capire al modello (intento + cifre dette), poi decide il codice
const aspetta = x => x && ['ore_testo', 'ore_motivo', 'pos', 'prob_testo', 'km', 'litri', 'importo', 'danni_foto', 'correzione', 'conferma', 'foto', 'foto2'].includes(x.passo);
const serve_testo = ev.tipo === 'testo' || ev.tipo === 'vocale';            // ogni testo lo legge il modello (capire), il codice decide (fare)
const flussi = { spesa: s, chiusura: c && c.passo !== 'chiusa' ? c : null, apertura: a && a.passo !== 'fatto' ? a : null };
const aperta = [st.ultimo_flusso, 'chiusura', 'apertura', 'spesa'].map(k => flussi[k]).find(Boolean);
const domanda = aperta && aperta.ultimo ? String(aperta.ultimo.testo || '').replace(/<[^>]+>/g, '').slice(0, 400) + ((aperta.ultimo.bottoni || []).length ? '\nBOTTONI: ' + aperta.ultimo.bottoni.flat().map(b => `[${b.text}]`).join(' ') : '') : (aperta && aperta.passo === 'ore_testo' ? 'a che ora hai iniziato e finito' : '');
const x = st.ctx || {};
// incasso di ogni servizio come l'ha deciso il codice (gestionale + SumUp): il modello lo riferisce, non lo indovina
const ESITO = { salta: m => `niente da incassare (${m || 'fattura'})`, carta_ok: () => 'pagato con carta/link, verificato su SumUp', contanti: () => 'contanti da incassare', consegnato: () => 'contanti già consegnati',
  chiedi: m => `incasso da verificare con Agostino (${m || ''})`, modalita: m => `modalità di pagamento da segnare (${m || ''})` };
const hm = v => typeof v === 'number' ? `${String(Math.floor(v / 60) % 24).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}` : (v || '?');
const inc = r => { const e = ((x.incassi && x.incassi.righe) || []).find(y => y.ora === String(r.Time) && y.cliente === String(r.Nome)); return e ? (ESITO[e.esito] || (() => e.esito))(e.motivo) + (e.importo > 0 && ['contanti', 'chiedi', 'carta_ok'].includes(e.esito) ? ` ${String(e.importo).replace('.', ',')} €` : '') : ''; };
const riassunto = x.autista ? [`Autista: ${x.autista}. Giorno: ${x.giorno}.`, 'Servizi:\n' + (x.servizi || []).map(r => `- ${r.Time} ${r['Transfer > Da']} → ${r['Transfer < Per']} (${r.Nome}, ${r['Modalità'] || ''}; ${inc(r) || 'incasso non calcolato'})`).join('\n'),
  x.prossimi ? (x.prossimi.length ? 'Prossimi giorni (dal gestionale, può ancora cambiare):\n' + x.prossimi.map(r => `- ${r.Data} ${r.Time} ${r['Transfer > Da']} → ${r['Transfer < Per']} (${r.Nome})`).join('\n') : 'Prossimi 3 giorni: ancora nessun servizio assegnato nel gestionale.') : '',
  x.mezzo ? `Mezzo: ${x.mezzo.nome}.` : '', x.incassi ? `Contanti di oggi ${x.incassi.contanti_oggi} €, da consegnare dai giorni prima ${x.incassi.contanti_prima} €${(x.incassi.giorni_prima || []).length ? ' (' + x.incassi.giorni_prima.join(', ') + ')' : ''}.` : '', x.ore ? `Ore calcolate dal sistema da Moox e gestionale (${x.ore.calcolo || ''}): dalle ${hm(x.ore.inizio)} alle ${hm(x.ore.fine)}.` : ''].filter(Boolean).join('\n') : 'Nessuna giornata caricata.';
// chi scrive, cosa ricorda il bot (note di Agostino) e la conversazione recente: servono al modello per conversare davvero
const AGOSTINO = '522233722';
const chi_scrive = ev.da_id === AGOSTINO ? `Agostino Narracci, il titolare${x.prova ? ` (in prova fa l'autista ${x.autista})` : ''}` : (x.autista || ev.nome_tg || 'autista');
let memoria = []; try { memoria = $('Leggi memoria').all().map(i => i.json).filter(r => r && r.nota && r.attiva !== false).map(r => '- ' + String(r.nota).slice(0, 300)); } catch (e) { memoria = []; }
const conversazione = (st.storia || []).slice(-14).map(m => (m.u ? 'Autista: ' : 'Bot: ') + String(m.u || m.b).replace(/<[^>]+>/g, '').slice(0, 300)).join('\n');
const flusso = flussi.chiusura ? `chiusura della giornata in corso (passo: ${flussi.chiusura.passo})` : flussi.apertura ? `apertura della giornata in corso (passo: ${flussi.apertura.passo})` : flussi.spesa ? `registrazione di una spesa in corso (${(flussi.spesa.dati && flussi.spesa.dati.tipologia) || 'tipo da scegliere'}, passo: ${flussi.spesa.passo})` : 'nessuna attività in corso';
const comandoGiornata = ev.tipo === 'comando' && ['chiusura', 'apertura', 'prova', 'spesa'].includes(ev.comando);
const ctxVecchio = !st.ctx || st.ctx.giorno_reale !== oggi;
const ctx_prova = st.ctx && st.ctx.prova ? { autista: st.ctx.autista, giorno: st.ctx.giorno } : null;
return [{ json: { ...ev, tipo_foto, ctx_prova, serve_testo, riassunto, domanda, chi_scrive, memoria: memoria.slice(-40).join('\n') || 'nessuna nota', conversazione: conversazione || '(inizio della conversazione)', flusso, serve_foto: ev.tipo === 'foto', serve_vocale: ev.tipo === 'vocale', serve_giornata: comandoGiornata || (ctxVecchio && ev.tipo !== 'tap'), oggi, ha_sessione: righe.length > 0, row_id: righe.length ? righe[0].id : null } }];
