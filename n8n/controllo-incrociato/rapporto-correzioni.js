// =====================================================================
// SV · Controllo Strutture ↔ Gestionale — nodo "Rapporto correzioni"
// =====================================================================
//
// Racconta cosa è stato scritto davvero. Non si fida di quello che il nodo
// precedente *voleva* scrivere: conta le righe che Google Sheets ha
// effettivamente restituito. Regola di CLAUDE.md: mai dichiarare un
// salvataggio che non è avvenuto.
var scritte = [];
try { scritte = $('Aggiorna gestionale').all().map(function (i) { return i.json; }); } catch (e) { scritte = []; }

var confronto = $('Confronta').first().json;
var discordanti = confronto.discordanti || [];

// Quali Id sono passati per la scrittura
var idScritti = {};
scritte.forEach(function (r) { if (r && r.Id) idScritti[String(r.Id).trim()] = true; });

var r = [];
if (!scritte.length) {
  r.push('✅ Niente da correggere sul gestionale.');
} else {
  r.push('✍️ GESTIONALE RIALLINEATO ALLE STRUTTURE — ' + scritte.length + ' righe scritte');
  r.push('');
  discordanti.forEach(function (d) {
    if (!idScritti[String(d.Id).trim()]) return;
    r.push('• ' + (d.Nome || '—') + ' · ' + (d.Fornitore || '—'));
    (d.differenze || []).forEach(function (x) {
      if (x.campo === 'Tariffa') return;
      r.push('   ' + x.campo + ': «' + (x.gestionale || '—') + '» → «' + (x.strutture || '—') + '»');
    });
    r.push('  ' + d.Id);
  });
}

// Quello che non è stato toccato, e perché.
var saltate = [];
discordanti.forEach(function (d) {
  (d.differenze || []).forEach(function (x) {
    if (x.campo !== 'Tariffa') return;
    saltate.push('• ' + (d.Nome || '—') + ' · Tariffa: struttura «' + (x.strutture || '—') +
      '» · gestionale «' + (x.gestionale || '—') + '»\n   non l\'ho toccata: sul gestionale è una formula, e i prezzi si toccano a mano\n  ' + d.Id);
  });
});
if (saltate.length) {
  r.push('');
  r.push('⚠️ NON TOCCATI (' + saltate.length + ')');
  r.push(saltate.join('\n'));
}

var testo = r.join('\n');
if (testo.length > 3900) testo = testo.slice(0, 3900) + '\n\n… elenco tagliato.';

return [{ json: { scritte: scritte.length, rapporto: testo } }];
