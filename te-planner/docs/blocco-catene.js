/* ============================================================================
   BLOCCO DA INCOLLARE dentro src/Index.html, nel <script>, subito prima di
   `/* ---------- viste ---------- *\/`.

   Motore delle catene per la Plancia: dato un servizio e una destinazione
   ipotetica (mezzo o autista) dice da dove arriva, con che margine, cosa si
   rompe a valle, cosa si libera sulla catena di partenza e come cambia il
   rientro in garage. Più la finestra dei voli (atterraggio + 20') e le ore
   dell'autista.

   Dipende solo da roba che c'è già: trf(), conflict(), stessoLuogoUI(),
   normLuogoUI(), isCanc(), garageInfo(), STRETTO. Non chiama il backend, non
   scrive niente, non introduce un secondo motore di fattibilità.

   Copiato da te-planner/src/Index.html — 84 controlli in test/motore.test.js.
   ============================================================================ */

/* ---------- catene: cosa si rompe (o si libera) se sposto questo servizio ----------
   Ogni servizio assegnato sta su due catene, quella del mezzo e quella dell'autista.
   Qui c'è una funzione sola: cambia la chiave e cambia la catena. NON è un secondo
   motore di fattibilità: arrivi, buffer e verdetti escono da trf() e dalla stessa
   regola di conflict() — fine + trasferimento + buffer ≤ inizio.  */
var TOLL_VOLO=20;         // atterraggio + bagagli: un arrivo non comincia all'ora scritta
var ORE_AUTISTA_MAX=720;  // 12 ore dalla prima partenza all'ultimo rientro

/* Un servizio che parte da un aeroporto e ha un volo può cominciare fino a 20 minuti dopo
   l'ora scritta: il cliente è ancora al nastro bagagli. Fuori da quel caso, finestra zero.
   Il riconoscimento dell'aeroporto passa da normLuogoUI(), che porta "Aeroporto di Bari",
   "Apt Bari" e "aereoporto" tutti a 'apt': niente elenco di nomi scritto a mano. */
function finestraInizio(s){
  if(!s||!String(s.volo||'').trim())return 0;
  return /\bapt\b/.test(normLuogoUI(s.da))?TOLL_VOLO:0;
}
/* verde ci sta · ambra ci sta ma stretto · finestra = ci arriva entro i bagagli · rosso no */
function giudizioMargine(margine,finestra){
  if(margine>=STRETTO)return 'ok';
  if(margine>=0)return 'stretto';
  if(margine>=-finestra)return 'finestra';
  return 'rotto';
}
/* Tutti i servizi di una catena (mezzo o autista) nella giornata mostrata, in ordine. */
function catenaDi(chiave,valore,escludiId){
  var v=String(valore||'');
  if(!v||!DATA||!DATA.services)return [];
  return DATA.services.filter(function(sv){
    return String(sv[chiave]||'')===v&&sv.id!==escludiId&&!isCanc(sv)&&sv.startMin>=0;
  }).sort(function(a,b){return a.startMin-b.startMin;});
}
/* Il collegamento fra due servizi consecutivi della stessa catena: quando il mezzo è
   materialmente sul pick-up del secondo, e quanto margine resta. */
function trattaFra(A,B){
  if(!A||!B||A.endMin<0||B.startMin<0)return null;
  var t=trf(A.id,B.id);
  var arrivo=A.endMin+t.min;
  var fin=finestraInizio(B);
  // trf() quando non ha la coppia in DATA.transfers torna 30 minuti di default: è una
  // stima, e va detto invece di spacciarla per un tempo Maps
  var noto=!!(DATA.transfers&&DATA.transfers[A.id+'->'+B.id])||stessoLuogoUI(A.per,B.da);
  return {da:A,a:B,arrivo:arrivo,trasf:t.min,buffer:t.buffer,stima:!noto,
          margine:B.startMin-arrivo-t.buffer,finestra:fin,
          k:giudizioMargine(B.startMin-arrivo-t.buffer,fin)};
}
/* Rientro in garage di una catena: riusa garageInfo(), che tace se rientroMin non c'è. */
function rientroCatena(giro){var g=garageInfo(giro);return g?g.at:null;}

/* IL CUORE. Dato un servizio e una destinazione ipotetica (mezzo o autista), dice:
   dove il mezzo/autista è adesso e a che ora è sul pick-up · il margine col segno ·
   cosa succede al servizio successivo di quella catena · cosa si libera su quella di
   partenza · come cambia il rientro in garage. Non tocca niente: sola lettura. */
function catenaIpotesi(S,chiave,valore){
  var out={chiave:chiave,da:String(S[chiave]||''),a:String(valore||''),
           arrivo:null,daDove:null,trasf:0,buffer:0,margine:null,stima:false,
           finestra:finestraInizio(S),k:'libero',sovrapposti:[],aValle:[],liberati:[],
           rientro:{prima:null,dopo:null},rientroOrigine:{prima:null,dopo:null}};
  if(!S||S.startMin<0)return out;
  var giro=catenaDi(chiave,out.a,S.id);
  var prev=null,next=null,i;
  for(i=0;i<giro.length;i++){
    var P=giro[i];
    if(P.startMin<S.endMin&&P.endMin>S.startMin){out.sovrapposti.push(P);continue;}
    if(P.endMin<=S.startMin&&(!prev||P.endMin>prev.endMin))prev=P;
    if(P.startMin>=S.endMin&&(!next||P.startMin<next.startMin))next=P;
  }
  // 1. da dove arriva e a che ora è sul posto
  if(prev){
    var t=trattaFra(prev,S);
    out.daDove=prev; out.arrivo=t.arrivo; out.trasf=t.trasf; out.buffer=t.buffer;
    out.margine=t.margine; out.stima=t.stima; out.k=t.k;
  } else if(out.a){
    out.daDove='garage';           // base → pick-up non è in cache: non si inventa un'ora
    out.k=out.sovrapposti.length?'rotto':'ok';
  }
  if(out.sovrapposti.length)out.k='rotto';
  // 2. effetto a valle: al servizio dopo cambia chi lo precede
  if(next){
    var era=prev?trattaFra(prev,next):null;
    var ora=trattaFra(S,next);
    if(!era||era.k!==ora.k||era.margine!==ora.margine){
      out.aValle.push({id:next.id,srv:next,
        era:era?era.k:'libero',diventa:ora.k,
        margine:ora.margine,ritardo:ora.margine<0?-ora.margine:0,
        stima:ora.stima});
    }
  }
  // 3. cosa si libera sulla catena di partenza
  if(out.da&&out.da!==out.a){
    var vecchio=catenaDi(chiave,out.da,S.id),pO=null,nO=null;
    vecchio.forEach(function(P){
      if(P.endMin<=S.startMin&&(!pO||P.endMin>pO.endMin))pO=P;
      if(P.startMin>=S.endMin&&(!nO||P.startMin<nO.startMin))nO=P;
    });
    if(nO){
      var prima=trattaFra(S,nO),dopo=pO?trattaFra(pO,nO):null;
      out.liberati.push({id:nO.id,srv:nO,
        guadagno:dopo?(dopo.margine-prima.margine):null,
        era:prima.k,diventa:dopo?dopo.k:'libero'});
    }
    out.rientroOrigine.prima=rientroCatena(catenaDi(chiave,out.da,null));
    out.rientroOrigine.dopo=rientroCatena(vecchio);
  }
  // 4. rientro in garage della catena di destinazione, prima e dopo
  out.rientro.prima=rientroCatena(giro);
  out.rientro.dopo=rientroCatena(giro.concat([S]));
  return out;
}
function plCatena(S,veicoloIpotetico){return catenaIpotesi(S,'veicolo',veicoloIpotetico);}
function plCatenaAutista(S,autistaIpotetico){return catenaIpotesi(S,'autista',autistaIpotetico);}

/* Ore dell'autista: dalla prima partenza all'ultimo rientro in garage. Non è un divieto,
   è un numero che oggi si scopre solo a fine giornata. `extra` = servizio che si sta per
   aggiungere, per vedere la giornata come sarebbe dopo la mossa. */
function oreAutista(nome,extra){
  var giro=catenaDi('autista',nome,extra?extra.id:null);
  if(extra)giro=giro.concat([extra]).sort(function(a,b){return a.startMin-b.startMin;});
  if(!giro.length)return null;
  var g=garageInfo(giro);
  var fine=g?g.at:null;
  giro.forEach(function(s){if(fine===null||s.endMin>fine)fine=s.endMin;});
  var inizio=giro[0].startMin;
  return {inizio:inizio,fine:fine,minuti:fine-inizio,garage:!!g,
          oltre:(fine-inizio)>ORE_AUTISTA_MAX};
}
