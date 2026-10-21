// Ponte dell'app Conti: {azione:"leggi"}, {azione:"servizi"} oppure {azione:"scrivi", ops:[...]}.
// Passa dal ponte gx-sessione: una sessione Excel per chiamata, cosi' letture e scritture sono allineate.
// Per ora solo la COPIA DI PROVA del file.
const body = $input.first().json.body || {};
const FILES = {
  prova: "431F991EEA4CCA44!s7b084d070ccb4adea1939a8c6870091b",
};
const fileKey = body.file || "prova";
const item = FILES[fileKey];
if (item === undefined) return [{ json: { ok: false, errore: "File non abilitato: " + fileKey } }];

let SID = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gxRaw = async (metodo, percorso, corpo) =>
  this.helpers.httpRequest({
    method: "POST",
    url: "https://transfer.app.n8n.cloud/webhook/gx-sessione-p4m8",
    body: { item, sessione: SID, metodo, percorso, corpo: corpo || {} },
    json: true,
    timeout: 50000,
  });
const gxGet = async (percorso) => {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await gxRaw("GET", percorso);
      if (r && r.ok) return r.risposta;
      last = r && r.error;
    } catch (e) { last = String(e.message || e); }
    await sleep(2000);
  }
  throw new Error("Lettura fallita (" + percorso + "): " + JSON.stringify(last));
};
const isLock = (t) => /resourceLocked|EditModeCannotAcquireLock|locked/i.test(t);
const gxWrite = async (metodo, percorso, corpo) => {
  const r = await gxRaw(metodo, percorso, corpo);
  if (r && r.ok) return r.risposta;
  const err = JSON.stringify((r && r.error) || r);
  const e = new Error(err);
  e.bloccato = isLock(err);
  throw e;
};
const apriSessione = async (persist) => {
  const r = await gxRaw("POST", "createSession", { persistChanges: persist });
  if (!(r && r.ok && r.risposta && r.risposta.id)) {
    const err = JSON.stringify((r && r.error) || r);
    const e = new Error("Sessione non aperta: " + err);
    e.bloccato = isLock(err);
    throw e;
  }
  SID = r.risposta.id;
};
const vals = async (sheet, addr) =>
  (await gxGet(`worksheets('${sheet}')/range(address='${addr}')?$select=values`)).values;
const tableAddr = async (t) => (await gxGet(`tables('${t}')/range?$select=address`)).address;
const lastRow = (addr) => Number(addr.split(":")[1].replace(/[^0-9]/g, ""));
const firstRowOf = (addr) => Number(addr.split("!")[1].split(":")[0].replace(/[^0-9]/g, ""));

// ---------------- LEGGI ----------------
const leggi = async () => {
  const [riep, sit, sitAddr, part, partAddr, fatt, fattAddr, paghe, aut, log, cli] = await Promise.all([
    vals("Riepilogo", "A1:F70"),
    gxGet(`tables('tblSituazione')/range?$select=values`).then((r) => r.values),
    tableAddr("tblSituazione"),
    gxGet(`tables('tblPartite')/range?$select=values`).then((r) => r.values),
    tableAddr("tblPartite"),
    gxGet(`tables('tblFatture')/range?$select=values`).then((r) => r.values),
    tableAddr("tblFatture"),
    vals("Paghe mese", "A1:O90"),
    gxGet(`tables('tblAutisti')/range?$select=values`).then((r) => r.values),
    vals("Log e legenda", "B6:C6"),
    gxGet(`tables('tblClienti')/columns/itemAt(index=0)/range?$select=values`).then((r) => r.values),
  ]);
  return [{
    json: {
      ok: true,
      file: fileKey,
      letto: new Date().toISOString(),
      datiAl: log[0][1],
      riepilogo: riep,
      situazione: { primaRiga: firstRowOf(sitAddr), righe: sit },
      partite: { primaRiga: firstRowOf(partAddr), righe: part },
      fatture: { primaRiga: firstRowOf(fattAddr), righe: fatt },
      paghe,
      autisti: aut.slice(1).map((r) => ({ nome: r[0], categoria: r[1], tipo: r[2], stato: r[8] })).filter((a) => a.nome),
      clienti: cli.slice(1).map((r) => r[0]).filter(Boolean),
    },
  }];
};


// ---------------- SERVIZI: mese per mese e sub-appalti ----------------
const r2 = (x) => Math.round(x * 100) / 100;
const nn = (x) => (typeof x === "number" && isFinite(x) ? x : Number(x) || 0);
const servizi = async () => {
  const addr = await tableAddr("tblServizi");
  const first = firstRowOf(addr) + 1, last = lastRow(addr);
  const blocchi = [];
  for (let a = first; a <= last; a += 1500) blocchi.push([a, Math.min(a + 1499, last)]);
  const [parti, fatt] = await Promise.all([
    Promise.all(blocchi.map(([a, b]) => vals("Servizi", `A${a}:AS${b}`))),
    gxGet(`tables('tblFatture')/range?$select=values`).then((r) => r.values),
  ]);
  // letta dopo, da sola: in parallelo con i blocchi grandi a volte non risponde
  let sub = [[]], subAddr = "x!A4:A4";
  try { const t = await gxGet(`tables('tblSubappalti')/range?$select=values,address`); sub = t.values; subAddr = t.address; }
  catch (e) { if (!/ItemNotFound|not found/i.test(String(e.message))) throw e; }
  const righe = [].concat(...parti);
  const mesi = {};
  for (const r of righe) {
    const cli = r[12], m = Number(r[4]);
    if (!cli || !(m >= 1 && m <= 12) || r[37] === "Cancellato") continue;
    const c = (mesi[cli] = mesi[cli] || {});
    const o = (c[m] = c[m] || { lavoro: 0, senzaFatt: 0, incassato: 0, residuo: 0, corse: 0, fatturato: 0 });
    o.lavoro += nn(r[35]); if (!r[36]) o.senzaFatt += nn(r[35]);
    o.incassato += nn(r[29]); o.residuo += nn(r[33]); o.corse++;
  }
  for (const r of fatt.slice(1)) {
    const cli = r[6], m = Number(r[8]);
    if (!cli || !(m >= 1 && m <= 12)) continue;
    const conta = r[14] === "" || r[14] == null ? 1 : Number(r[14]);
    const c = (mesi[cli] = mesi[cli] || {});
    const o = (c[m] = c[m] || { lavoro: 0, senzaFatt: 0, incassato: 0, residuo: 0, corse: 0, fatturato: 0 });
    o.fatturato += nn(r[10]) * conta;
  }
  for (const c of Object.values(mesi)) for (const o of Object.values(c)) for (const k of Object.keys(o)) o[k] = r2(o[k]);
  const dati = righe.filter((r) => r[16] === "Dato a collega" && r[37] !== "Cancellato").map((r) => ({
    id: String(r[41] || ""), data: r[0], ora: r[1], tipo: r[5], da: r[6], per: r[7], nome: r[9], cliente: r[12], collega: r[14],
    tariffa: nn(r[17]), fee: nn(r[21]), sub: nn(r[22]), netto: nn(r[23]), modalita: r[28], incassato: nn(r[29]), stato: r[37],
    note: String(r[44] || "").slice(0, 160),
  }));
  const subFirst = firstRowOf(subAddr) + 1;
  const subRighe = (sub || []).slice(1).map((r, i) => ({ riga: subFirst + i, id: String(r[0] || ""), chi: r[8], criterio: r[9], valore: r[10], dobbiamo: nn(r[11]), cidevono: nn(r[12]), stato: r[13], note: r[14], pezzo: r[5] })).filter((x) => x.id);
  return [{ json: { ok: true, file: fileKey, letto: new Date().toISOString(), mesi, dati, sub: subRighe } }];
};

// ---------------- SCRIVI ----------------
const ops = Array.isArray(body.ops) ? body.ops.slice(0, 20) : [];
const esiti = [];
const tag = (id) => `[app ${id}]`;
const num = (x) => {
  const n = typeof x === "number" ? x : Number(String(x).replace(/\./g, "").replace(",", "."));
  if (!isFinite(n)) throw new Error("Importo non valido: " + x);
  return Math.round(n * 100) / 100;
};
const oggiSeriale = () => {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Rome" }));
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000);
};
const oggiTesto = () => new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit" });
const same = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
const shiftRow = (f, r) => f.replace(/(?<![A-Za-z0-9_$'])(\$?[A-Z]{1,3})5(?![0-9])/g, `$1${r}`);

const TIPI_MOV = ["Pagamento autista", "Busta paga", "Fee pagata", "Incasso collega", "Sub-appalto pagato"];
const STATI_PARTITA = ["Concordato", "Manca il prezzo", "Chiuso", "Chiuso / incluso", "Solo nostro gestionale", "Deciso solo da loro"];

let autistiNomi = null;
const nomiAutisti = async () => {
  if (!autistiNomi) autistiNomi = (await gxGet(`tables('tblAutisti')/columns/itemAt(index=0)/range?$select=values`)).values.slice(1).map((r) => r[0]);
  return autistiNomi;
};

const fai = {
  // Movimenti: riga nuova (pagamento autista, busta paga, fee, incasso collega, sub-appalto)
  async movimento(op) {
    if (!TIPI_MOV.includes(op.tipo)) throw new Error("Tipo non ammesso: " + op.tipo);
    if (!op.chi) throw new Error("Manca Chi");
    if (["Pagamento autista", "Busta paga", "Sub-appalto pagato"].includes(op.tipo)) {
      const nomi = await nomiAutisti();
      if (!nomi.includes(op.chi)) throw new Error("Autista non in Anag autisti: " + op.chi);
    }
    const imp = num(op.importo);
    if (imp <= 0) throw new Error("Importo deve essere positivo");
    const comp = Number(op.competenza);
    if (["Pagamento autista", "Busta paga"].includes(op.tipo) && !(comp >= 1 && comp <= 12)) throw new Error("Competenza obbligatoria (1-12)");
    const addr0 = await tableAddr("tblMovimenti");
    const r0 = lastRow(addr0);
    const coda = await vals("Movimenti", `O${Math.max(5, r0 - 300)}:O${r0}`);
    if (coda.some((x) => String(x[0]).includes(tag(op.id)))) return { esito: "gia_scritto", dove: "Movimenti", dettaglio: "Già presente" };
    const data = Number(op.data) || oggiSeriale();
    const nota = `${op.nota ? op.nota + " · " : ""}Registrato dall'app Conti il ${oggiTesto()} ${tag(op.id)}`;
    const riga = [data, comp || "", null, op.tipo, op.chi, "", imp, null, null, "", op.modalita || "Contanti", "App Conti", "", "", nota];
    const add = await gxWrite("POST", `tables('tblMovimenti')/rows/add`, { index: null, values: [riga] });
    const r1 = firstRowOf(addr0) + 1 + Number(add && add.index);
    if (!(r1 > r0)) throw new Error("Riga aggiunta ma posizione non letta: controllare Movimenti in fondo");
    const f5 = (await gxGet(`worksheets('Movimenti')/range(address='A5:O5')?$select=formulas`)).formulas[0];
    const fr = f5.map((f) => (typeof f === "string" && f.startsWith("=") ? shiftRow(f, r1) : null));
    await gxWrite("PATCH", `worksheets('Movimenti')/range(address='A${r1}:O${r1}')`, { formulas: [fr] });
    const back = (await vals("Movimenti", `A${r1}:O${r1}`))[0];
    if (!String(back[14]).includes(tag(op.id)) || num(back[6]) !== imp) throw new Error("Riletta diversa da quella scritta");
    return { esito: "scritto", dove: `Movimenti riga ${r1}`, dettaglio: `${op.tipo} · ${op.chi} · ${imp} € · mese ${back[2]}` };
  },

  // Fatture: aggiunge un incasso a Incassato € (colonna P) e la nota
  async incasso_fattura(op) {
    const r = Number(op.riga);
    if (!(r > 4)) throw new Error("Riga fattura non valida");
    const row = (await vals("Fatture", `A${r}:U${r}`))[0];
    if (!same(row[0], op.numero) || !same(row[6], op.cliente)) throw new Error(`Riga ${r} non corrisponde (trovata n.${row[0]} ${row[6]})`);
    if (String(row[20]).includes(tag(op.id))) return { esito: "gia_scritto", dove: `Fatture riga ${r}`, dettaglio: "Già presente" };
    const imp = num(op.importo);
    const nuovo = Math.round((Number(row[15] || 0) + imp) * 100) / 100;
    const nota = `${row[20] ? row[20] + " | " : ""}Incasso ${imp} € ${op.modalita || ""} ${op.nota || ""} registrato dall'app il ${oggiTesto()} ${tag(op.id)}`.replace(/\s+/g, " ");
    const v = new Array(21).fill(null); v[15] = nuovo; v[20] = nota;
    await gxWrite("PATCH", `worksheets('Fatture')/range(address='A${r}:U${r}')`, { values: [v] });
    const back = (await vals("Fatture", `A${r}:U${r}`))[0];
    if (num(back[15]) !== nuovo) throw new Error("Riletta diversa da quella scritta");
    return { esito: "scritto", dove: `Fatture riga ${r}`, dettaglio: `n.${back[0]} incassato ${back[15]} €, residuo ${back[16]} €` };
  },

  // Partite: prezzo, stato, nota di una riga
  async partita(op) {
    const r = Number(op.riga);
    if (!(r > 15)) throw new Error("Riga partita non valida");
    const row = (await vals("Partite", `O${r}:Z${r}`))[0];
    if (!same(row[0], op.collega) || Number(row[2]) !== Number(op.dataRiga)) throw new Error(`Riga ${r} non corrisponde (trovato ${row[0]} ${row[2]})`);
    const v = new Array(12).fill(null);
    if (op.prezzo !== undefined && op.prezzo !== "") { v[5] = num(op.prezzo); v[8] = `Agostino app ${oggiTesto()}`; }
    if (op.stato) { if (!STATI_PARTITA.includes(op.stato)) throw new Error("Stato non ammesso: " + op.stato); v[9] = op.stato; }
    if (op.nota && !String(row[11]).includes(tag(op.id))) v[11] = `${row[11] ? row[11] + " | " : ""}${op.nota} (app ${oggiTesto()}) ${tag(op.id)}`;
    await gxWrite("PATCH", `worksheets('Partite')/range(address='O${r}:Z${r}')`, { values: [v] });
    const back = (await vals("Partite", `O${r}:Z${r}`))[0];
    return { esito: "scritto", dove: `Partite riga ${r}`, dettaglio: `${back[0]} · ${back[3]} · prezzo ${back[5]} · ${back[9]}` };
  },


  // Sub-appalti: una riga per servizio (o pezzo di tour), chiave Id servizio; si aggiorna in posto
  async subappalto(op) {
    const id = String(op.idServizio || "").trim();
    if (!id) throw new Error("Manca l'Id del servizio");
    if (!["Noi", "Loro"].includes(op.chi)) throw new Error("Chi incassa deve essere Noi o Loro");
    if (!["% importo", "Totale", "Prezzo fisso", "Deciso da Agostino"].includes(op.criterio)) throw new Error("Criterio non ammesso: " + op.criterio);
    const dob = op.chi === "Noi" ? num(op.dobbiamo) : 0;
    const dev = op.chi === "Loro" ? num(op.cidevono) : 0;
    if (dob < 0 || dev < 0) throw new Error("Gli importi non possono essere negativi");
    const addr = await tableAddr("tblSubappalti");
    const first = firstRowOf(addr) + 1, last = lastRow(addr);
    const ids = await vals("Sub-appalti", `A${first}:A${last}`);
    const i = ids.findIndex((x) => String(x[0]) === id);
    const nota = `${op.nota ? op.nota + " · " : ""}app ${oggiTesto()}`;
    const riga = [id, Number(op.data) || "", op.collega || "", op.cliente || "", op.servizio || "", op.pezzo || "", num(op.tariffa || 0), num(op.fee || 0),
      op.chi, op.criterio, op.valore === "" || op.valore == null ? "" : num(op.valore), dob, dev, op.stato || "Da saldare", nota];
    let r;
    if (i >= 0) r = first + i;
    else if (ids.length === 1 && !ids[0][0]) r = first;
    if (r) await gxWrite("PATCH", `worksheets('Sub-appalti')/range(address='A${r}:O${r}')`, { values: [riga] });
    else {
      const add = await gxWrite("POST", `tables('tblSubappalti')/rows/add`, { index: null, values: [riga] });
      r = firstRowOf(addr) + 1 + Number(add && add.index);
    }
    const back = (await vals("Sub-appalti", `A${r}:O${r}`))[0];
    if (String(back[0]) !== id || num(back[11]) !== dob || num(back[12]) !== dev) throw new Error("Riletta diversa da quella scritta");
    return { esito: "scritto", dove: `Sub-appalti riga ${r}`, dettaglio: `${back[2]} · ${back[4]} · ${op.chi === "Noi" ? "gli dobbiamo " + dob : "ci devono " + dev} €` };
  },

  // Situazione clienti: Stato, Prossima azione, Note (colonne gialle)
  async cliente(op) {
    const r = Number(op.riga);
    if (!(r > 5)) throw new Error("Riga cliente non valida");
    const row = (await vals("Situazione clienti", `A${r}:L${r}`))[0];
    if (!same(row[0], op.cliente)) throw new Error(`Riga ${r} non corrisponde (trovato ${row[0]})`);
    const v = new Array(12).fill(null);
    if (op.stato !== undefined) v[9] = op.stato;
    if (op.azione !== undefined) v[10] = op.azione;
    if (op.nota !== undefined) v[11] = op.nota;
    await gxWrite("PATCH", `worksheets('Situazione clienti')/range(address='A${r}:L${r}')`, { values: [v] });
    const back = (await vals("Situazione clienti", `A${r}:L${r}`))[0];
    return { esito: "scritto", dove: `Situazione clienti riga ${r}`, dettaglio: `${back[0]} · ${back[9]} · ${back[10]}` };
  },
};

const scrivi = async () => {
// n8n ferma il codice a 60 s: oltre i 35 s le bozze restanti tornano indietro e l'app le rimanda.
const t0 = Date.now();
let bloccato = false;
for (const op of ops) {
  const info = { id: op.id, tipo: op.op };
  if (bloccato) { esiti.push({ ...info, esito: "bloccato", dettaglio: "File aperto: riprova" }); continue; }
  if (Date.now() - t0 > 35000) { esiti.push({ ...info, esito: "rimandato", dettaglio: "Non fatto in questo giro: si rimanda" }); continue; }
  try {
    if (!op.id || !fai[op.op]) throw new Error("Operazione non ammessa: " + op.op);
    esiti.push({ ...info, ...(await fai[op.op](op)) });
  } catch (e) {
    if (e.bloccato) { bloccato = true; esiti.push({ ...info, esito: "bloccato", dettaglio: "File aperto in Excel: chiudilo e riprova" }); }
    else esiti.push({ ...info, esito: "errore", dettaglio: String(e.message || e).slice(0, 300) });
  }
}
  return [{ json: { ok: true, file: fileKey, esiti } }];
};

const azione = body.azione || "leggi";
let out;
try {
  await apriSessione(azione === "scrivi");
  out = azione === "scrivi" ? await scrivi() : azione === "servizi" ? await servizi() : await leggi();
} catch (e) {
  out = [{ json: { ok: false, bloccato: !!e.bloccato, errore: String(e.message || e).slice(0, 300) } }];
} finally {
  if (SID) { try { await gxRaw("POST", "closeSession"); } catch (e) {} }
}
return out;
