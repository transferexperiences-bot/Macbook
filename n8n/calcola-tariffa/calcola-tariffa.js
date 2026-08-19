// Copia VERBATIM del nodo «Calcola Tariffa» di `Calcola Tariffa Prenotazioni`
// (n8n APv3ZqEizY1HnPia), letta il 19/08/2026. Serve al banco offline: se qui
// cambia una virgola, il banco non prova più il codice vero.
// CALCOLA TARIFFA PRENOTAZIONI v1 — replica regole formula foglio
// Cascata per endpoint nel listino del FORNITORE: 1) esatto 2) comune+raggio centro
// prezzoBase = MAX(da,per); se nessuno -> 3) GPS distanza Da<->Per
// poi x notturno (ora<7 -> 1.2) + €/min x minuti h-extra
var ctx = $('Trova Listino').first().json;
var trovati = $('Trova Listino').all().map(function(i){ return i.json; });
var rawRows = $input.all().map(function(i){ return i.json; });
var allRows = rawRows.filter(function(r){ return !r.error && r.Destinazione; });
function warn(m,e){ var o={status:'warning',tariffa:0,prezzoBase:0,motivo:m,da:ctx.da,per:ctx.per,fornitore:ctx.fornitore,comuneDa:ctx.comuneDa,comunePer:ctx.comunePer}; if(e)for(var k in e)o[k]=e[k]; return [{json:o}]; }
if(!allRows.length) return warn('no-listino');
var keys=Object.keys(allRows[0]);
var colDest=keys.find(function(k){return /destinazione/i.test(k);});
if(!colDest) return warn('no-colonna-destinazione');
var paxCols=keys.filter(function(k){if(k==='row_number'||k===colDest)return false;return /^\d+$/.test(k.trim());}).sort(function(a,b){return parseInt(a)-parseInt(b);});
if(!paxCols.length) return warn('no-colonne-prezzo');
var soglie=paxCols.map(function(k){return parseInt(k);});
var pax=parseInt(ctx.pax)||1;
var priceColKey=null;
if(pax<=soglie[0])priceColKey=paxCols[0];
else if(soglie.length>=2&&pax<=soglie[1])priceColKey=paxCols[1];
else priceColKey=paxCols[2]||null;
if(!priceColKey) return warn('pax-oltre-listino',{pax:pax,sogliaMax:soglie[soglie.length-1]});
var RATE=2.0,ROAD=1.3,SOG=5,MINIMO=30,EURO_KM=1;
var C={'bari':{lat:41.1171,lng:16.8719},'bari airport':{lat:41.1389,lng:16.7606},'brindisi':{lat:40.6288,lng:17.9418},'brindisi airport':{lat:40.6576,lng:17.9470},'conversano':{lat:40.9688,lng:17.1158},'monopoli':{lat:40.9537,lng:17.3036},'polignano a mare':{lat:40.9942,lng:17.2217},'polignano':{lat:40.9942,lng:17.2217},'alberobello':{lat:40.7850,lng:17.2375},'ostuni':{lat:40.7290,lng:17.5776},'fasano':{lat:40.8341,lng:17.3642},'castellana grotte':{lat:40.8875,lng:17.1681},'cozze':{lat:40.9800,lng:17.0900},'mola di bari':{lat:41.0583,lng:17.0892},'martina franca':{lat:40.7050,lng:17.3381},'locorotondo':{lat:40.7558,lng:17.3261},'cisternino':{lat:40.7422,lng:17.4256},'lecce':{lat:40.3516,lng:18.1750}};
function hav(a,b,c,d){var R=6371,x=(c-a)*Math.PI/180,y=(d-b)*Math.PI/180;var q=Math.sin(x/2)*Math.sin(x/2)+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(y/2)*Math.sin(y/2);return R*2*Math.atan2(Math.sqrt(q),Math.sqrt(1-q));}
function fc(n){if(!n)return null;var l=(''+n).toLowerCase().trim();if(C[l])return C[l];for(var k in C){if(l.includes(k)||k.includes(l))return C[k];}return null;}
function sup(lat,lng,com){if(!lat||!lng||!com)return{km:0,supplemento:0};var c=fc(com);if(!c)return{km:0,supplemento:0};var km=hav(lat,lng,c.lat,c.lng);if(km<=SOG)return{km:Math.round(km*10)/10,supplemento:0};return{km:Math.round(km*10)/10,supplemento:Math.round((km-SOG)*ROAD*RATE)};}
var prim=[],last=Infinity;
for(var ri=0;ri<allRows.length;ri++){var rn=allRows[ri].row_number||0;if(rn<=last&&prim.length>0)break;prim.push(allRows[ri]);last=rn;}
var tratte=new Map();
for(var pi=0;pi<prim.length;pi++){var dd=(''+(prim[pi][colDest]||'')).trim();var pp=parseFloat(prim[pi][priceColKey])||0;if(dd&&pp>0){var kk=dd.toLowerCase();if(!tratte.has(kk))tratte.set(kk,{nome:dd,prezzo:pp});}}
var listinoNome=(trovati[0]&&(trovati[0].listino||trovati[0].sheetName))||'';
function ex(n){if(!n)return null;var k=(''+n).toLowerCase().trim();return tratte.has(k)?tratte.get(k):null;}
function cm(c){if(!c)return null;var l=(''+c).toLowerCase().trim();if(tratte.has(l))return tratte.get(l);var it=tratte.entries(),e;while(!(e=it.next()).done){var key=e.value[0];if(l.includes(key)||key.includes(l))return e.value[1];}return null;}
function resolve(raw,m,com,lat,lng){var e=ex(raw)||ex(m);if(e)return{prezzo:e.prezzo,mode:'esatto',dest:e.nome};var c=cm(com)||cm(m);if(c){var s=sup(lat,lng,com);return{prezzo:c.prezzo+s.supplemento,mode:'comune+raggio',dest:c.nome,supplemento:s.supplemento,kmCentro:s.km};}return null;}
var rDa=resolve(ctx.da,ctx.matchDa,ctx.comuneDa,ctx.latDa,ctx.lngDa);
var rPer=resolve(ctx.per,ctx.matchPer,ctx.comunePer,ctx.latPer,ctx.lngPer);
var det={da:rDa,per:rPer,listino:listinoNome};
var pDa=rDa?rDa.prezzo:0,pPer=rPer?rPer.prezzo:0;
// prezzo LISTINO (MAX dei due endpoint) se c'è almeno un match
var baseListino=(pDa>0||pPer>0)?Math.max(pDa,pPer):0;
// prezzo KM-GARAGE (giro dal garage di Polignano) se ci sono le coordinate
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
// match esatto: il prezzo listino viene da un endpoint esatto
var winner=(pDa>=pPer)?rDa:rPer;
var matchEsatto=(baseListino>0 && winner && winner.mode==='esatto');
// moltiplicatore notturno + extra (applicati a entrambi i prezzi)
var mol=1,ora=(''+(ctx.orario||'')).trim();var hh=parseInt(ora.slice(0,2));if(ora&&!isNaN(hh)&&hh<7)mol=1.2;
var em=parseFloat((''+((trovati[0]&&trovati[0].euroMin!=null)?trovati[0].euroMin:0)).replace(',','.'))||0;
var minu=0,hx=(''+(ctx.hextra||'')).trim();if(hx){var mH=hx.match(/(\d+)\s*h/i),mM=hx.match(/(\d+)\s*min/i);minu=(mH?parseInt(mH[1])*60:0)+(mM?parseInt(mM[1]):0);if(!minu){var nn=parseFloat(hx.replace(',','.'));if(!isNaN(nn))minu=nn*60;}}
var extra=em*minu;
function fin(b){return b>0?Math.round(b*mol+extra):0;}
var tariffaListino=fin(baseListino);
var tariffaKm=fin(baseKm);
var base=baseListino>0?baseListino:baseKm;
var modo=baseListino>0?'listino-MAX':(baseKm>0?'km-garage':'nessun-match');
if(base<=0) return warn('nessun-match');
var tar=baseListino>0?tariffaListino:tariffaKm;
return [{json:{status:'ok',tariffa:tar,matchEsatto:matchEsatto,prezzoBase:tar,prezzoListino:tariffaListino,tariffaListino:tariffaListino,tariffaKm:tariffaKm,moltiplicatoreNotturno:mol,extra:extra,euroMin:em,minutiExtra:minu,modo:modo,listino:listinoNome,priceCol:priceColKey,da:ctx.da,per:ctx.per,pax:pax,veicolo:ctx.veicolo,fornitore:ctx.fornitore,dettaglio:det}}];
