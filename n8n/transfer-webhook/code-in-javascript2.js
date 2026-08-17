// =====================================================================
// Transfer webhook (MJHTq5MksSeUhKgX) — nodo "Code in JavaScript2"
// =====================================================================
//
// COSA CAMBIA, E PERCHÉ.
//
// 1) Il confronto non dipende più da cosa ha scritto la struttura.
//    Prima:  if (tipologia !== 'MODIFICA' || !oldData) { niente confronto }
//    `tipologia` nasce dalla colonna Stato del foglio struttura:
//      stato "Pronto" -> NUOVO, "Modificato" -> MODIFICA, "Cancellato" -> CANCELLAZIONE
//    Quindi bastava che una struttura modificasse una riga lasciando "Pronto"
//    e il confronto veniva saltato del tutto: usciva una scheda
//    "🟢 NUOVO TRANSFER" senza un accenno a cosa fosse cambiato.
//    Prova: esecuzione 742784 del 16/08. La riga 4375 del gestionale esisteva
//    già con Time vuoto, arrivava ora "17:15", ma stato "Pronto" -> tipologia
//    NUOVO -> changes: [], hasChanges: false. Il cambio d'orario di un
//    transfer dello stesso giorno è passato invisibile.
//    Ora comanda il dato: se la riga esiste sul gestionale, si confronta
//    sempre. Le cancellazioni restano fuori, lì non c'è niente da diffare.
//
// 2) Riga non trovata = riga non trovata.
//    Il nodo Google Sheets può restituire un item VUOTO {} quando la ricerca
//    non trova niente. `{}` è truthy: senza controllo, un transfer davvero
//    nuovo verrebbe confrontato con il nulla e risulterebbe "modificato in
//    tutto". Prima il guasto era coperto dal test su `tipologia`; togliendo
//    quello va reso esplicito. Si considera vecchia una riga solo se porta
//    davvero un Id.

// ===== INPUT =====
const baseJson = $('Code - Build ID + Telegram1').item.json;
const newTransfer = baseJson.transfer;
const tipologia = baseJson.tipologia;
const id = baseJson.id;

const oldDataItems = $('Get original transfer1').all();
const oldRaw = oldDataItems.length > 0 ? oldDataItems[0].json : null;

// ===== HELPERS =====
function s(v) { return (v ?? '').toString().trim(); }

function escTg(v) {
  return s(v).replace(/([_*`\[])/g, '\\$1');
}

function normalize(v) {
  return s(v).toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const str = s(dateStr);

  const match1 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match1) return new Date(match1[3], match1[2] - 1, match1[1]);

  const match2 = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match2) return new Date(match2[1], match2[2] - 1, match2[3]);

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed;
  return null;
}

function isSameDate(date1Str, date2Str) {
  const d1 = parseDate(date1Str);
  const d2 = parseDate(date2Str);
  if (!d1 || !d2) return normalize(date1Str) === normalize(date2Str);
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

function formatDate(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return s(dateStr);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

// (2) vecchia riga solo se porta davvero un Id
const oldData = (oldRaw && s(oldRaw.Id)) ? oldRaw : null;

// ===== 4 BOTTONI FISSI =====
function buildReplyMarkup() {
  return {
    inline_keyboard: [
      [
        { text: '✅ Conferma', callback_data: `YES|${id}` },
        { text: '❌ Annulla', callback_data: `NO|${id}` }
      ],
      [
        { text: '✅ Eseguito', callback_data: `ESEGUITO|${id}` },
        { text: '🚐 Assegna', callback_data: `ASSEGNA|${id}` }
      ]
    ]
  };
}

// ===== QUANDO NON C'È NIENTE DA CONFRONTARE =====
// (1) non si guarda più `tipologia` per decidere SE confrontare: si guarda se
// la riga esiste. Le cancellazioni restano fuori.
if (!oldData || tipologia === 'CANCELLAZIONE') {
  return [{
    json: {
      ...baseJson,
      changes: [],
      hasChanges: false,
      isNewTransfer: !oldData,
      replyMarkup: buildReplyMarkup(),
      replyMarkupJson: JSON.stringify(buildReplyMarkup())
    }
  }];
}

// ===== CAMPI DA CONFRONTARE =====
const fieldsToCompare = [
  { key: 'data', label: '📅 Data', old: oldData?.Data, new: newTransfer.data, isDate: true },
  { key: 'ora', label: '⏰ Ora', old: oldData?.Time, new: newTransfer.ora },
  { key: 'trs_da', label: '📍 Partenza', old: oldData?.['TRS> DA'], new: newTransfer.trs_da },
  { key: 'trs_per', label: '📍 Destinazione', old: oldData?.['TRS <PER'], new: newTransfer.trs_per },
  { key: 'nome', label: '👤 Nome', old: oldData?.Nome, new: newTransfer.nome },
  { key: 'pax', label: '👥 PAX', old: oldData?.PAX, new: newTransfer.pax },
  { key: 'volo', label: '✈️ Volo', old: oldData?.Volo, new: newTransfer.volo },
  { key: 'cell', label: '📞 Telefono', old: oldData?.['cell.'], new: newTransfer.cell },
  { key: 'fornitore', label: '🏨 Fornitore', old: oldData?.Fornitore, new: newTransfer.fornitore },
  { key: 'veicolo', label: '🚐 Veicolo', old: oldData?.Veicolo, new: newTransfer.veicolo },
  { key: 'tariffa', label: '💶 Tariffa', old: oldData?.Tariffa, new: newTransfer.tariffa },
  { key: 'modalita', label: '💳 Modalità', old: oldData?.['Modalità'], new: newTransfer.modalita },
  { key: 'note', label: '📝 Note', old: oldData?.Note, new: newTransfer.note }
];

const changes = [];
fieldsToCompare.forEach(field => {
  const oldVal = s(field.old);
  const newVal = s(field.new);
  let isDifferent = field.isDate ? !isSameDate(oldVal, newVal) : normalize(oldVal) !== normalize(newVal);
  if (isDifferent) {
    changes.push({
      label: field.label,
      key: field.key,
      old: field.isDate ? formatDate(oldVal) : (oldVal || '—'),
      new: field.isDate ? formatDate(newVal) : (newVal || '—')
    });
  }
});

if (changes.length === 0) {
  return [{
    json: {
      ...baseJson,
      changes: [],
      hasChanges: false,
      isNewTransfer: false,
      replyMarkup: buildReplyMarkup(),
      replyMarkupJson: JSON.stringify(buildReplyMarkup())
    }
  }];
}

// ===== COSTRUISCI MESSAGGIO CON MODIFICHE =====
const changesText = changes.map(c => {
  if (c.key === 'note') {
    const oldF = c.old.split('\n').filter(l => l.trim()).map(l => `     ${escTg(l)}`).join('\n');
    const newF = c.new.split('\n').filter(l => l.trim()).map(l => `     ${escTg(l)}`).join('\n');
    return `${c.label}\n   ❌ Era:\n${oldF}\n   ✅ Ora:\n${newF}`;
  }
  return `${c.label}\n   ❌ Era: ${escTg(c.old)}\n   ✅ Ora: ${escTg(c.new)}`;
}).join('\n\n');

const incassoLine = (newTransfer.modalita === 'Incassare' || newTransfer.tipologia_incasso)
  ? `\n💳 ${escTg(newTransfer.modalita || '-')}${newTransfer.tipologia_incasso ? ` — ${escTg(newTransfer.tipologia_incasso)}` : ''}`
  : '';

const modifiedText = `🟡 MODIFICA TRANSFER
📄 *${escTg(baseJson.fileName || '-')}*

⚠️ *MODIFICHE RILEVATE:*

${changesText}

---

*RIEPILOGO COMPLETO:*

📅 ${escTg(formatDate(newTransfer.data) || '-')} ⏰ ${escTg(newTransfer.ora || '-')}
🚐 ${escTg(newTransfer.trs_da || '-')} → ${escTg(newTransfer.trs_per || '-')}
👤 ${escTg(newTransfer.nome || '-')} (${escTg(newTransfer.pax || '-')})
📞 ${escTg(newTransfer.cell || '-')}
🏨 ${escTg(newTransfer.fornitore || '-')}
💶 ${escTg(newTransfer.tariffa || '-')}${newTransfer.modalita ? ` — ${escTg(newTransfer.modalita)}` : ''}${incassoLine}${newTransfer.note ? `\n\n📝 ${escTg(newTransfer.note)}` : ''}`;

return [{
  json: {
    ...baseJson,
    telegram: { text: modifiedText, parse_mode: "Markdown" },
    changes,
    hasChanges: changes.length > 0,
    isNewTransfer: false,
    replyMarkup: buildReplyMarkup(),
    replyMarkupJson: JSON.stringify(buildReplyMarkup())
  }
}];
