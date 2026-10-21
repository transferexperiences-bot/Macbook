// cisterna.js — litri presi dalla cisterna. Regola Agostino 20/10/2026:
// 2 foto obbligatorie del contatore (prima e dopo); il contatore è progressivo e ricomincia da 0 dopo 999.
// Le letture le dà la vision, ma il codice le controlla: tre cifre, e la «prima» deve coincidere con l'ultima «dopo».
function lettura(v) {
  const m = String(v ?? '').match(/^\s*(\d{1,3})\s*$/);
  return m ? +m[1] : null;                          // illeggibile -> null: si richiede la foto, mai un numero inventato
}
function litri(prima, dopo) {
  const a = lettura(prima), b = lettura(dopo);
  if (a === null || b === null) return { ok: false, motivo: 'lettura illeggibile' };
  return { ok: true, prima: a, dopo: b, litri: (b - a + 1000) % 1000, giro: b < a };
}
// ultimaDopo: ultima lettura «dopo» registrata (di qualunque autista); dichiarati: litri detti dall'autista (facoltativo)
function controlla(prima, dopo, ultimaDopo, dichiarati) {
  const r = litri(prima, dopo); if (!r.ok) return { ...r, avvisi: [] };
  const avvisi = [];
  const u = lettura(ultimaDopo);
  if (u !== null && u !== r.prima) avvisi.push({ tipo: 'buco', testo: `il contatore era a ${u} dopo l'ultimo rifornimento registrato, ora parte da ${r.prima}: ${(r.prima - u + 1000) % 1000} l non registrati` });
  if (r.litri === 0) avvisi.push({ tipo: 'zero', testo: 'prima e dopo uguali: 0 litri' });
  if (r.litri > 100) avvisi.push({ tipo: 'troppi', testo: `${r.litri} l in un solo rifornimento` });
  if (dichiarati != null && Math.abs(Number(dichiarati) - r.litri) > 2) avvisi.push({ tipo: 'diversi', testo: `contatore ${r.litri} l, l'autista dice ${dichiarati} l` });
  return { ...r, avvisi };
}
if (typeof module !== 'undefined') module.exports = { lettura, litri, controlla };
