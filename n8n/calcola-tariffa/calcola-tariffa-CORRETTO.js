// =====================================================================
// «Calcola Tariffa» — versione con le tre correzioni. NON ANCORA IN n8n.
// =====================================================================
//
// Rispetto al nodo di produzione (`calcola-tariffa.js`) cambiano tre cose, e
// nient'altro. Tutte e tre sono guasti, non scelte di prezzo: le scelte di
// prezzo (supplemento dal centro, % fee, €/min) sono di Agostino e restano
// dove sono.
//
//   1. COLONNE DI PREZZO — oggi valgono solo le intestazioni che sono un
//      numero secco (`/^\d+$/`). Il listino **Pietra Blu** ha «≤ 2 pax» e
//      «> 3 pax»: nessuna colonna riconosciuta → `no-colonne-prezzo` →
//      **tariffa 0 su ogni corsa Pietra Blu**. Ora il numero si legge dentro
//      l'intestazione, e un'intestazione aperta (`>`, `+`, `oltre`) vale come
//      «da lì in su».
//
//   2. RIPESCAGGIO SU GENERICO — `Trova Listino` prepara il secondo tentativo
//      e il foglio Generico viene letto davvero, ma poi le tratte si
//      costruivano **solo** dal listino primario: le righe del Generico
//      restavano lì inutilizzate. Ora, se la destinazione non c'è nel listino
//      del fornitore, si guarda nel Generico prima di passare ai km.
//
//   3. PAX OLTRE LA SOGLIA — con un listino 2/7/9 e 12 pax, oggi si prende
//      zitti la colonna più cara. Ora si risponde `pax-oltre-listino`, che è
//      il vero stato delle cose. (Se l'ultima colonna è aperta — «> 3 pax» —
//      resta valida per qualunque numero, com'è giusto.)
//
// Banco: banchi/te/banco-tariffa.js

var ctx = $('Trova Listino').first().json;
var trovati = $('Trova Listino').all().map(function(i){ return i.json; });
var rawRows = $input.all().map(function(i){ return i.json; });
var allRows = rawRows.filter(function(r){ return !r.error && r.Destinazione; });
function warn(m,e){ var o={status:'warning',tariffa:0,prezzoBase:0,motivo:m,da:ctx.da,per:ctx.per,fornitore:ctx.fornitore,comuneDa:ctx.comuneDa,comunePer:ctx.comunePer}; if(e)for(var k in e)o[k]=e[k]; return [{json:o}]; }
if(!allRows.length) return warn('no-listino');

var RATE=2.0,ROAD=1.3,SOG=5,MINIMO=30,EURO_KM=1;
var C={'bari':{lat:41.1171,lng:16.8719},'bari airport':{lat:41.1389,lng:16.7606},'brindisi':{lat:40.6288,lng:17.9418},'brindisi airport':{lat:40.6576,lng:17.9470},'conversano':{lat:40.9688,lng:17.1158},'monopoli':{lat:40.9537,lng:17.3036},'polignano a mare':{lat:40.9942,lng:17.2217},'polignano':{lat:40.9942,lng:17.2217},'alberobello':{lat:40.7850,lng:17.2375},'ostuni':{lat:40.7290,lng:17.5776},'fasano':{lat:40.8341,lng:17.3642},'castellana grotte':{lat:40.8875,lng:17.1681},'cozze':{lat:40.9800,lng:17.0900},'mola di bari':{lat:41.0583,lng:17.0892},'martina franca':{lat:40.7050,lng:17.3381},'locorotondo':{lat:40.7558,lng:17.3261},'cisternino':{lat:40.7422,lng:17.4256},'lecce':{lat:40.3516,lng:18.1750}};
function hav(a,b,c,d){var R=6371,x=(c-a)*Math.PI/180,y=(d-b)*Math.PI/180;var q=Math.sin(x/2)*Math.sin(x/2)+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(y/2)*Math.sin(y/2);return R*2*Math.atan2(Math.sqrt(q),Math.sqrt(1-q));}
function fc(n){if(!n)return null;var l=(''+n).toLowerCase().trim();if(C[l])return C[l];for(var k in C){if(l.includes(k)||k.includes(l))return C[k];}return null;}
function sup(lat,lng,com){if(!lat||!lng||!com)return{km:0,supplemento:0};var c=fc(com);if(!c)return{km:0,supplemento:0};var km=hav(lat,lng,c.lat,c.lng);if(km<=SOG)return{km:Math.round(km*10)/10,supplemento:0};return{km:Math.round(km*10)/10,supplemento:Math.round((km-SOG)*ROAD*RATE)};}

// ── CORREZIONE 1+3: le colonne di prezzo ──────────────────────────────
// "2" → soglia 2 chiusa | "≤ 2 pax" → soglia 2 chiusa | "> 3 pax" → soglia 3 APERTA
function colonnePrezzo(keys, colDest){
  var out=[];
  for(var i=0;i<keys.length;i++){
    var k=keys[i];
    if(k==='row_number'||k===colDest) continue;
    var m=(''+k).match(/\d+/);
    if(!m) continue;
    if(!/^\s*[\d≤<=+>~ ]*\d/.test(''+k) && !/pax|pers|posti/i.test(''+k)) continue;
    out.push({key:k, soglia:parseInt(m[0],10), aperta:/[>+]|oltre|piu|più/i.test(''+k)});
  }
  out.sort(function(a,b){return a.soglia-b.soglia;});
  return out;
}
function scegliColonna(cols, pax){
  for(var i=0;i<cols.length;i++){
    if(cols[i].aperta) return cols[i].key;          // «> 3 pax»: da lì in su va bene
    if(pax<=cols[i].soglia) return cols[i].key;
  }
  return null;                                       // oltre l'ultima soglia chiusa
}

// ── CORREZIONE 2: i due listini, separati e tutti e due utilizzabili ──
// Le righe dei due fogli arrivano attaccate: il secondo si riconosce perché il
// `row_number` riparte da capo.
var blocchi=[[]], last=Infinity;
for(var ri=0;ri<allRows.length;ri++){
  var rn=allRows[ri].row_number||0;
  if(rn<=last && blocchi[blocchi.length-1].length>0) blocchi.push([]);
  blocchi[blocchi.length-1].push(allRows[ri]);
  last=rn;
}
function preparaListino(righe, pax){
  if(!righe || !righe.length) return null;
  var keys=Object.keys(righe[0]);
  var colDest=keys.find(function(k){return /destinazione/i.test(k);});
  if(!colDest) return null;
  var cols=colonnePrezzo(keys, colDest);
  if(!cols.length) return {errore:'no-colonne-prezzo'};
  var pk=scegliColonna(cols, pax);
  if(!pk) return {errore:'pax-oltre-listino', sogliaMax:cols[cols.length-1].soglia};
  var tratte=new Map();
  for(var i=0;i<righe.length;i++){
    var dd=(''+(righe[i][colDest]||'')).trim();
    var pp=parseFloat(righe[i][pk])||0;
    if(dd&&pp>0){var kk=dd.toLowerCase(); if(!tratte.has(kk)) tratte.set(kk,{nome:dd,prezzo:pp});}
  }
  return {tratte:tratte, priceColKey:pk, colDest:colDest};
}

var pax=parseInt(ctx.pax)||1;
var L0=preparaListino(blocchi[0], pax);
var L1=blocchi.length>1?preparaListino(blocchi[1], pax):null;
if(!L0) return warn('no-colonna-destinazione');
if(L0.errore && !(L1&&L1.tratte)) return warn(L0.errore, L0.sogliaMax?{pax:pax,sogliaMax:L0.sogliaMax}:null);

var listinoNome=(trovati[0]&&(trovati[0].listino||trovati[0].sheetName))||'';
var nomeFallback=(trovati[1]&&(trovati[1].listino||trovati[1].sheetName))||'';
var ripescato=null;

function cerca(L, raw, m, com, lat, lng){
  if(!L||!L.tratte) return null;
  var tratte=L.tratte;
  function ex(n){if(!n)return null;var k=(''+n).toLowerCase().trim();return tratte.has(k)?tratte.get(k):null;}
  function cm(c){if(!c)return null;var l=(''+c).toLowerCase().trim();if(tratte.has(l))return tratte.get(l);var it=tratte.entries(),e;while(!(e=it.next()).done){var key=e.value[0];if(l.includes(key)||key.includes(l))return e.value[1];}return null;}
  var e=ex(raw)||ex(m);
  if(e) return {prezzo:e.prezzo,mode:'esatto',dest:e.nome};
  var c=cm(com)||cm(m);
  if(c){var s=sup(lat,lng,com);return {prezzo:c.prezzo+s.supplemento,mode:'comune+raggio',dest:c.nome,supplemento:s.supplemento,kmCentro:s.km};}
  return null;
}
function resolve(raw,m,com,lat,lng){
  var r=cerca(L0,raw,m,com,lat,lng);
  if(r) return r;
  var f=cerca(L1,raw,m,com,lat,lng);         // ← il ripescaggio che oggi non avviene
  if(f){ ripescato=nomeFallback||'Generico'; f.daFallback=true; return f; }
  return null;
}

var rDa=resolve(ctx.da,ctx.matchDa,ctx.comuneDa,ctx.latDa,ctx.lngDa);
var rPer=resolve(ctx.per,ctx.matchPer,ctx.comunePer,ctx.latPer,ctx.lngPer);
var det={da:rDa,per:rPer,listino:listinoNome,ripescatoDa:ripescato};
var pDa=rDa?rDa.prezzo:0,pPer=rPer?rPer.prezzo:0;
var baseListino=(pDa>0||pPer>0)?Math.max(pDa,pPer):0;

var baseKm=0;
if(ctx.latDa&&ctx.lngDa&&ctx.latPer&&ctx.lngPer){
  var G={lat:40.9942,lng:17.2217};
  var kP=hav(G.lat,G.lng,ctx.latDa,ctx.lngDa)*ROAD;
  var kC=hav(ctx.latDa,ctx.lngDa,ctx.latPer,ctx.lngPer)*ROAD;
  var kR=hav(ctx.latPer,ctx.lngPer,G.lat,G.lng)*ROAD;
  var kmTot=kP+kC+kR;
  baseKm=Math.max(Math.round(kmTot*EURO_KM),MINIMO);
  det.kmGaragePickup=Math.round(kP*10)/10;det.kmCorsa=Math.round(kC*10)/10;det.kmRientro=Math.round(kR*10)/10;det.kmTot=Math.round(kmTot*10)/10;
}

var winner=(pDa>=pPer)?rDa:rPer;
var matchEsatto=(baseListino>0 && winner && winner.mode==='esatto');
var mol=1,ora=(''+(ctx.orario||'')).trim();var hh=parseInt(ora.slice(0,2));if(ora&&!isNaN(hh)&&hh<7)mol=1.2;
var em=parseFloat((''+((trovati[0]&&trovati[0].euroMin!=null)?trovati[0].euroMin:0)).replace(',','.'))||0;
var minu=0,hx=(''+(ctx.hextra||'')).trim();if(hx){var mH=hx.match(/(\d+)\s*h/i),mM=hx.match(/(\d+)\s*min/i);minu=(mH?parseInt(mH[1])*60:0)+(mM?parseInt(mM[1]):0);if(!minu){var nn=parseFloat(hx.replace(',','.'));if(!isNaN(nn))minu=nn*60;}}
var extra=em*minu;
function fin(b){return b>0?Math.round(b*mol+extra):0;}
var tariffaListino=fin(baseListino);
var tariffaKm=fin(baseKm);
var base=baseListino>0?baseListino:baseKm;
var modo=baseListino>0?'listino-MAX':(baseKm>0?'km-garage':'nessun-match');
if(base<=0) return warn(L0.errore||'nessun-match');
var tar=baseListino>0?tariffaListino:tariffaKm;
return [{json:{status:'ok',tariffa:tar,matchEsatto:matchEsatto,prezzoBase:tar,prezzoListino:tariffaListino,tariffaListino:tariffaListino,tariffaKm:tariffaKm,moltiplicatoreNotturno:mol,extra:extra,euroMin:em,minutiExtra:minu,modo:modo,listino:listinoNome,ripescatoDa:ripescato,priceCol:(L0.priceColKey||(L1&&L1.priceColKey)),da:ctx.da,per:ctx.per,pax:pax,veicolo:ctx.veicolo,fornitore:ctx.fornitore,dettaglio:det}}];
