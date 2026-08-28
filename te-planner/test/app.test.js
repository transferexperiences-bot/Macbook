/* Test end-to-end: apre davvero la web app in Chromium (preview.html con dati finti)
   e verifica flotta, filtri, ordinamenti, due giorni, assegnazioni e layout. */
/* Test end-to-end sulla app renderizzata davvero in Chromium. */
const {apriBrowser,PREVIEW,t,bilancio}=require('./_lib');
const SEED=`(function(){
  var P=JSON.parse(JSON.stringify(DATA));P.date='2026-07-31';P.weekday='venerdì';P.nowMin=-1;
  var base=[[360,50,'Polignano a Mare','Aeroporto di Bari','Marco Rossi','Vito 1',45],
            [570,60,'Aeroporto di Bari','Ostuni','Marco Rossi','Vito 1',70],
            [610,40,'Ostuni','Monopoli','Marco Rossi','Vito 1',30],
            [480,70,'Alberobello','Matera','Luca Verdi','Vito 2',85],
            [900,45,'Monopoli','Polignano a Mare','','',0]];
  P.services=base.map(function(b,i){var s=JSON.parse(JSON.stringify(DATA.services[0]));
    s.id='TX'+i;s.startMin=b[0];s.time=('0'+Math.floor(b[0]/60)).slice(-2)+':'+('0'+(b[0]%60)).slice(-2);
    s.durMin=b[1];s.endMin=b[0]+b[1];s.da=b[2];s.per=b[3];s.autista=b[4];s.veicolo=b[5];s.rientroMin=b[6];
    s.nome='Cliente '+(i+1);s.tariffa=''+(60+i*10);s.stato='';s.allert='';return s;});
  P.transfers={};P.services.forEach(function(a){P.services.forEach(function(z){if(a!==z)P.transfers[a.id+'->'+z.id]={min:a.per===z.da?0:35,buffer:15};});});
  PLANS['2026-07-31']=P;})()`;

(async()=>{
  const b=await apriBrowser();
  const errs=[];
  const nuova=async(w,h)=>{const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:1});
    p.on('pageerror',e=>errs.push(`[${w}px] ${e.message}`));
    p.on('console',m=>{if(m.type()==='error')errs.push(`[${w}px] console: ${m.text()}`);});
    await p.goto(PREVIEW);await p.waitForTimeout(350);return p;};

  console.log('\n=== 1. FLOTTA: lo stato del mezzo si capisce ===');
  let p=await nuova(1440,1200);
  await p.evaluate(()=>setTab('flotta'));await p.waitForTimeout(200);
  let f=await p.evaluate(()=>{
    var st={},sez=[];
    document.querySelectorAll('.sez').forEach(x=>sez.push(x.textContent.trim()));
    DATA.veicoli.forEach(function(v){
      var mine=DATA.services.filter(s=>!isCanc(s)&&s.veicolo===v.nome&&s.startMin>=0).sort((a,c)=>a.startMin-c.startMin);
      var cur=null,next=null;mine.forEach(s=>{if(s.startMin<=DATA.nowMin&&DATA.nowMin<s.endMin&&!cur)cur=s;if(s.startMin>DATA.nowMin&&!next)next=s;});
      st[v.nome]=statoDi({item:v,cur:cur,next:next,n:mine.length,mine:mine},false).k;});
    return {stati:st,sezioni:sez,txt:document.getElementById('main').textContent};});
  t('Mercedes V (in servizio ora) = occupato', f.stati['Mercedes V']==='occ', f.stati['Mercedes V']);
  t('Vito 1 (fra due servizi) = libero',       f.stati['Vito 1']==='lib', f.stati['Vito 1']);
  t('Sprinter (fuori servizio) = non disp.',   f.stati['Sprinter']==='off', f.stati['Sprinter']);
  t('Tuk-Tuk (a noleggio) = non disp.',        f.stati['Tuk-Tuk']==='off', f.stati['Tuk-Tuk']);
  t('sezioni per stato presenti',              f.sezioni.filter(x=>/Impegnati|Liberi|Non disponibili/.test(x)).length>=4, f.sezioni.length);
  t('dice CHI guida il mezzo occupato',        /Giovanni Leo/.test(f.txt));
  t('dice QUANDO si libera e dove',            /si libera alle 15:20 a Monopoli/.test(f.txt));
  t('segnala i servizi senza autista',         /senza autista/.test(f.txt));

  console.log('\n=== 2. FLOTTA: i filtri per stato ===');
  await p.evaluate(()=>setFFilt('occ'));await p.waitForTimeout(200);
  let g=await p.evaluate(()=>({n:document.querySelectorAll('.fl').length,txt:document.getElementById('main').textContent}));
  t('filtro "impegnati" lascia solo gli occupati', g.n===2&&!/LIBERO/.test(g.txt), g.n);
  await p.evaluate(()=>setFFilt('off'));await p.waitForTimeout(200);
  let g2=await p.evaluate(()=>document.querySelectorAll('.fl').length);
  t('filtro "non disponibili"', g2===3, g2);
  await p.evaluate(()=>setFFilt('off'));await p.waitForTimeout(200);
  let g3=await p.evaluate(()=>document.querySelectorAll('.fl').length);
  t('ritocco = mostra tutti', g3===11, g3);

  console.log('\n=== 3. SERVIZI: ordinamento per mezzo ===');
  await p.evaluate(()=>{setTab('servizi');setOrd('mezzo');});await p.waitForTimeout(250);
  let o=await p.evaluate(()=>{
    var teste=[];document.querySelectorAll('#main div').forEach(function(d){
      if(d.children.length===0&&/^(Vito 1|Vito 2|Mercedes V|⚠️ SENZA MEZZO)$/.test(d.textContent.trim()))teste.push(d.textContent.trim());});
    return {teste:teste,txt:document.getElementById('main').textContent};});
  t('raggruppa per mezzo', o.teste.length>=3, o.teste);
  t('gruppo "senza mezzo" presente', o.teste.indexOf('⚠️ SENZA MEZZO')>=0);
  t('mostra i collegamenti fra i servizi dello stesso mezzo', /(🕳|⏱ stretto|⛔ non ci arriva|📍)/.test(o.txt));

  console.log('\n=== 4. SERVIZI: mezzo consigliato con un tocco ===');
  await p.evaluate(()=>setOrd('orario'));await p.waitForTimeout(200);
  // serve un servizio ANCORA DA FARE con autista e senza mezzo (su uno già svolto il
  // pulsante non compare, ed è giusto così)
  const v0=await p.evaluate(()=>{
    var s=DATA.services.find(x=>x.autista&&!isDone(x));
    if(!s)return null;
    s.veicolo='';render();
    var b=bestVeicoloFor(s);
    return {id:s.id,pax:s.pax,svolto:isDone(s),best:b?b.nome:null};});
  t('propone un mezzo per il servizio scoperto', !!v0.best, v0);
  const nBtn=await p.evaluate(()=>document.querySelectorAll('[onclick*="assegnaVeicoloRapido"]').length);
  t('il pulsante 🚗 compare in riga', nBtn>0, nBtn);
  await p.evaluate(()=>{var el=document.querySelector('[onclick*="assegnaVeicoloRapido"]');if(el)el.click();});
  await p.waitForTimeout(250);
  const dopo=await p.evaluate(()=>({pend:Object.keys(PEND).length,
    assegnato:DATA.services.filter(x=>x.id===Object.keys(PEND)[0])[0].veicolo}));
  t('il tocco assegna il mezzo e lo mette in sospeso', dopo.pend===1&&!!dopo.assegnato, dopo);

  console.log('\n=== 5. Catene: stesso posto = nessun conflitto (bug segnalato) ===');
  const cat=await p.evaluate(()=>{
    var A=DATA.services[0],B=DATA.services[1];
    A.per='Aeroporto di Bari';B.da='Apt Bari';B.startMin=A.endMin;B.time='x';
    DATA.transfers[A.id+'->'+B.id]={min:10,buffer:10};_BYID_SRC=null;
    return {trasf:trf(A.id,B.id),conflitto:conflict(A,B)};});
  t('trasferimento azzerato', cat.trasf.min===0&&cat.trasf.buffer===0, cat.trasf);
  t('nessun conflitto', cat.conflitto===null);

  console.log('\n=== 6. Due giorni + per mezzo/autista, filtri autista ===');
  await p.close();p=await nuova(1440,1200);
  await p.evaluate(SEED);
  for(const ord of ['autista','mezzo']){
    await p.evaluate(o=>{setDue(true);setOrd(o);},ord);await p.waitForTimeout(300);
    const r=await p.evaluate(()=>{var t=document.getElementById('main').textContent;
      return {notte:(t.match(/stacco notturno/g)||[]).length,righe:document.querySelectorAll('[onclick^="openModal"],[onclick^="apriGiorno2"]').length};});
    t('ordine per '+ord+': i due giorni sono uniti', r.notte>0&&r.righe>9, r);
  }
  await p.evaluate(()=>setOrd('orario'));await p.waitForTimeout(250);
  const sez=await p.evaluate(()=>document.querySelectorAll('.duecol > section').length);
  t('tornando a Orario le due giornate si separano', sez===2, sez);
  const k=await p.evaluate(()=>AUT_FILTRI.indexOf('Marco Rossi'));
  await p.evaluate(i=>setAutIdx(i),k);await p.waitForTimeout(200);
  const nascosto=await p.evaluate(()=>{
    var n=0;document.querySelectorAll('[onclick^="openModal"]').forEach(function(x){
      var i=+x.getAttribute('onclick').match(/\d+/)[0];if(DATA.services[i]&&DATA.services[i].autista==='Marco Rossi')n++;});
    return n;});
  t('togliendo Marco le sue righe spariscono', nascosto===0, nascosto);

  console.log('\n=== 6bis. Filtro per MEZZO, come quello per autista ===');
  await p.evaluate(()=>{setDue(false);setOrd('orario');setAutIdx(0);});await p.waitForTimeout(250);
  const conta=()=>p.evaluate(()=>{
    var per={};document.querySelectorAll('[onclick^="openModal"]').forEach(function(x){
      var i=+x.getAttribute('onclick').match(/\d+/)[0],sv=DATA.services[i];
      if(!sv)return;var k=(sv.veicolo||'(senza mezzo)')+'/'+(sv.autista||'(senza autista)');
      per[k]=(per[k]||0)+1;});
    return {righe:Object.keys(per).reduce((a,k)=>a+per[k],0),per:per,
            nascostiMezzi:Object.keys(VEI_HIDE).sort(),nascostiAutisti:Object.keys(AUT_HIDE).sort()};});
  const p0=await conta();
  const kv=await p.evaluate(()=>VEI_FILTRI.indexOf('Vito 1'));
  t('la barra Mezzi esiste e contiene i veicoli del giorno', kv>=2, kv);
  await p.evaluate(i=>setVeiIdx(i),kv);await p.waitForTimeout(200);
  const p1=await conta();
  t('un tocco toglie Vito 1 dalla vista',
    Object.keys(p1.per).every(k=>k.indexOf('Vito 1/')!==0)&&p1.righe<p0.righe, p1);
  await p.evaluate(i=>setVeiIdx(i),kv);await p.waitForTimeout(200);
  const p2=await conta();
  t('ritocco e Vito 1 torna', p2.righe===p0.righe&&p2.nascostiMezzi.length===0, p2.righe);
  await p.evaluate(()=>setVeiIdx(1));await p.waitForTimeout(200);
  const p3=await conta();
  t('"Nessuno" svuota la lista dei mezzi', p3.righe===0, p3.righe);
  const kv2=await p.evaluate(()=>VEI_FILTRI.indexOf('Vito 2'));
  await p.evaluate(i=>setVeiIdx(i),kv2);await p.waitForTimeout(200);
  const p4=await conta();
  t('"Nessuno" + Vito 2 lascia solo il suo giro',
    p4.righe>0&&Object.keys(p4.per).every(k=>k.indexOf('Vito 2/')===0), p4.per);
  // i due filtri si combinano
  await p.evaluate(()=>{setVeiIdx(0);});await p.waitForTimeout(150);
  const ka=await p.evaluate(()=>AUT_FILTRI.indexOf('Marco Rossi'));
  await p.evaluate(a=>{setAutIdx(a[0]);setVeiIdx(a[1]);},[ka,kv]);await p.waitForTimeout(220);
  const p5=await conta();
  t('nascondere Marco Rossi E Vito 1 insieme funziona',
    Object.keys(p5.per).every(k=>k.indexOf('Vito 1/')!==0&&k.indexOf('/Marco Rossi')<0), p5.per);
  await p.evaluate(()=>{setAutIdx(0);setVeiIdx(0);});await p.waitForTimeout(200);
  const p6=await conta();
  t('Tutti/Tutti riporta tutto', p6.righe===p0.righe, p6.righe);

  console.log('\n=== 8. ASSEGNA: i giri a sinistra, la coda a destra ===');
  await p.close();p=await nuova(1440,1200);
  await p.evaluate(()=>setTab('assegna'));await p.waitForTimeout(250);
  const a1=await p.evaluate(()=>({
    giri:document.querySelectorAll('.giri .autbox').length,
    coda:document.querySelectorAll('.coda .ccard:not(.mezzo)').length,
    scoperti:DATA.services.filter(s=>!isCanc(s)&&!s.autista).length,
    inServizio:autistiInServizio().length,
    ordinata:(function(){var o=[];document.querySelectorAll('.coda .ccard:not(.mezzo) .ccT b').forEach(x=>o.push(x.textContent));return o;})()}));
  t('a destra i servizi ancora da assegnare', a1.coda===a1.scoperti&&a1.coda>0, a1);
  t('e sono in ordine di ora', a1.ordinata.join('|')===a1.ordinata.slice().sort().join('|'), a1.ordinata);
  t('a sinistra un blocco per ogni autista in servizio', a1.giri===a1.inServizio&&a1.giri>0, a1);

  const a2=await p.evaluate(()=>{
    var s=DATA.services.filter(x=>!isCanc(x)&&!x.autista&&x.startMin>=0)[0];
    var c=suggest(s,availability(DATA.autisti,sv=>sv.autista,s),5);
    return {primo:c[0]&&c[0].nome,inServizio:c[0]&&c[0].inServizio,
            fermi:DATA.autisti.filter(a=>!a.esclusoMotivo&&giroDi(a.nome,null).length===0).map(a=>a.nome)};});
  t('il consigliato è uno che sta già lavorando', a2.inServizio===true, a2);
  t('e non uno degli autisti fermi', a2.fermi.indexOf(a2.primo)<0, a2);

  await p.evaluate(()=>{var s=DATA.services.filter(x=>!isCanc(x)&&!x.autista&&x.startMin>=0)[0];
    selezionaSrv(DATA.services.indexOf(s));});
  await p.waitForTimeout(220);
  const a3=await p.evaluate(()=>({
    ghost:document.querySelectorAll('.srvmini.ghost').length,
    ok:document.querySelectorAll('.autbox.v-ok').length,
    sel:document.querySelectorAll('.ccard.sel').length,
    testo:document.querySelector('.srvmini.ghost')?document.querySelector('.srvmini.ghost').textContent:''}));
  t('la scheda scelta si evidenzia', a3.sel===1, a3);
  t('il servizio compare dentro i giri, al suo posto d\'orario', a3.ghost>0, a3);
  t('con attesa e margine scritti', /(⏱|➡️|unico servizio)/.test(a3.testo), a3.testo);
  t('almeno un autista risulta compatibile', a3.ok>0, a3);

  const a4=await p.evaluate(()=>{
    var el=document.querySelector('.autbox.v-ok [onclick^="assegnaDa"]');
    if(!el)return null;
    var m=el.getAttribute('onclick').match(/assegnaDa\((\d+),(\d+)/);
    var s=DATA.services[+m[1]],nome=DATA.autisti[+m[2]].nome;
    el.click();
    return {nome:nome,dopo:DATA.services.filter(x=>x.id===s.id)[0].autista,pend:!!PEND[s.id],
            resta:document.querySelectorAll('.coda .ccard:not(.mezzo)').length};});
  t('il tocco su ➕ Assegna mette l\'autista in sospeso', !!a4&&a4.dopo===a4.nome&&a4.pend, a4);
  t('e il servizio esce dalla coda', !!a4&&a4.resta===a1.coda-1, a4);

  const a6=await p.evaluate(()=>{
    var s=DATA.services.filter(x=>!isCanc(x)&&!x.autista&&x.startMin>=0).slice(-1)[0];
    selezionaSrv(DATA.services.indexOf(s));
    var sx=[],dx=[];
    document.querySelectorAll('.giri .autbox .autNome').forEach(x=>sx.push(x.textContent.trim()));
    document.querySelector('.ccard.sel').querySelectorAll('.ccBtn button')
      .forEach(x=>dx.push(x.textContent.replace(/^[^A-Za-zÀ-ÿ]+/,'').trim()));
    var com=(a,b)=>a.filter(x=>b.indexOf(x)>=0);
    return {sx:sx,dx:dx,a:com(sx,dx).join('|'),b:com(dx,sx).join('|'),
            divari:document.querySelectorAll('.giri .divario').length};});
  t('le due colonne mettono gli autisti nello stesso ordine', a6.a===a6.b&&a6.a.length>0, a6);
  t('dentro il giro si vedono i vuoti fra un servizio e l\'altro', a6.divari>0, a6.divari);

  await p.evaluate(()=>{if(ASS_SOLO)toggleAssSolo();});await p.waitForTimeout(220);
  const a5=await p.evaluate(()=>({
    box:document.querySelectorAll('.giri .autbox').length,
    tutti:DATA.autisti.length,
    apostrofo:/D'Amico/.test(document.querySelector('.giri').textContent),
    fermo:document.querySelectorAll('.autbox.v-libero,.autbox.v-off').length}));
  t('\"Tutti gli autisti\" mostra anche chi oggi non lavora', a5.box===a5.tutti, a5);
  t('un nome con l\'apostrofo non rompe la scheda', a5.apostrofo===true, a5);
  await p.evaluate(()=>{if(!ASS_SOLO)toggleAssSolo();});
  const a7=await p.evaluate(()=>{
    setTab('servizi');
    var i=DATA.services.findIndex(x=>!isCanc(x)&&!x.autista&&x.startMin>=0);
    openModal(i);
    var g={},sel=document.getElementById('selA');
    sel.querySelectorAll('optgroup').forEach(function(o){
      g[o.label]=[];o.querySelectorAll('option').forEach(x=>g[o.label].push(x.value));});
    closeModal();
    return {gruppi:Object.keys(g),
            disp:g['✅ Disponibili — già in servizio oggi']||[],
            fermi:g['💤 Oggi non lavorano']||[],
            lavorano:autistiInServizio().map(a=>a.nome)};});
  t('nel menù del dettaglio chi non lavora ha un gruppo suo',
    a7.gruppi.indexOf('💤 Oggi non lavorano')>=0, a7.gruppi);
  t('e i "disponibili" sono davvero quelli in servizio',
    a7.disp.length>0&&a7.disp.every(n=>a7.lavorano.indexOf(n)>=0)
    &&a7.fermi.every(n=>a7.lavorano.indexOf(n)<0), a7);
  await p.evaluate(()=>setTab('assegna'));await p.waitForTimeout(150);


  console.log('\n=== 8bis. ASSEGNA sul telefono: una colonna per volta ===');
  await p.close();p=await nuova(390,844);
  await p.evaluate(()=>setTab('assegna'));await p.waitForTimeout(250);
  const visibile=sel=>p.evaluate(s=>{var e=document.querySelector(s);return !!e&&e.offsetParent!==null;},sel);
  t('si apre sulla coda', await visibile('.coda')&&!(await visibile('.giri')), null);
  t('i due bottoni ci sono', await visibile('.assswitch'), null);
  await p.evaluate(()=>{var s=DATA.services.filter(x=>!isCanc(x)&&!x.autista&&x.startMin>=0)[0];
    selezionaSrv(DATA.services.indexOf(s));});
  await p.waitForTimeout(220);
  t('toccando un servizio si passa ai giri', (await visibile('.giri'))&&!(await visibile('.coda')), null);
  t('e in cima resta scritto quale servizio si sta piazzando', await visibile('.selBanner'), null);
  const m1=await p.evaluate(()=>{
    var el=document.querySelector('.autbox [onclick^="assegnaDa"]');el.click();
    return {vista:ASS_VISTA,pend:Object.keys(PEND).length};});
  t('assegnato, torna alla coda per il prossimo', m1.vista==='coda'&&m1.pend>0, m1);
  await p.waitForTimeout(200);
  t('e la coda è di nuovo quella visibile', await visibile('.coda')&&!(await visibile('.giri')), null);
  await p.evaluate(()=>setAssVista('giri'));await p.waitForTimeout(200);
  t('il bottone "Giri autisti" da solo funziona', await visibile('.giri'), null);
  await p.evaluate(()=>{document.querySelector('.tornaCoda').click();});await p.waitForTimeout(200);
  t('"◀ Coda" riporta indietro', await visibile('.coda')&&!(await visibile('.giri')), null);
  const m2=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  t('nessuno scroll orizzontale a 390px', m2<=2, m2);

  console.log('\n=== 9. PLANCIA: le catene quando sposti un servizio ===');
  await p.close();p=await nuova(1440,1000);
  const PLSEED=`(function(){
    function mk(id,st,dur,da,per,aut,vei,extra){
      var s=JSON.parse(JSON.stringify(DATA.services[0]));
      s.id=id;s.startMin=st;s.durMin=dur;s.endMin=st+dur;
      s.time=('0'+Math.floor(st/60)).slice(-2)+':'+('0'+(st%60)).slice(-2);
      s.da=da;s.per=per;s.autista=aut;s.veicolo=vei;s.nome='Cliente '+id;s.volo='';
      s.stato='';s.allert='';s.pax=3;s.rientroMin=20;
      if(extra)for(var k in extra)s[k]=extra[k];
      return s;}
    DATA.services=[
      mk('A',480,120,'Bari','Monopoli','Marco Rossi','Vito 1'),
      mk('C',840,60,'Alberobello','Bari','Marco Rossi','Vito 1'),
      mk('B',480,120,'Bari','Monopoli','Luca Verdi','Mercedes V'),
      mk('S',660,120,'Ostuni','Matera','',''),
      mk('V',900,60,'Aeroporto di Bari','Ostuni','','',{volo:'FR8826'}),
      mk('P',820,45,'Bari','Bari','Giovanni Leo','Vito 2')];
    DATA.transfers={'A->S':{min:35,buffer:15},'S->C':{min:80,buffer:15},'A->C':{min:60,buffer:15},
      'B->S':{min:35,buffer:15},'S->V':{min:60,buffer:15},'B->V':{min:60,buffer:15},
      'P->V':{min:40,buffer:10},'V->P':{min:40,buffer:10},'A->V':{min:60,buffer:15}};
    _BYID_SRC=null;PEND={};PL_ARM=null;setTab('plancia');})()`;
  await p.evaluate(PLSEED);await p.waitForTimeout(300);
  await p.evaluate(()=>{plArma('S');});await p.waitForTimeout(300);
  const c1=await p.evaluate(()=>{
    var S=DATA.services.filter(x=>x.id==='S')[0];
    var buono=plVerifica(S,'Mercedes V',true), rotto=plVerifica(S,'Vito 1',true);
    var slot=document.querySelector('.plrow.plcanmid .plslot');
    return {arrivo:buono.cat.arrivo,margine:buono.cat.margine,k:buono.k,breve:buono.breve,
            slotTxt:slot?slot.textContent:'',slotCls:slot?slot.className:'',
            rottoOk:rotto.ok,rottoBreve:rotto.breve,rottoMsg:rotto.msg,
            avv:(document.querySelector('.plavv')||{}).textContent||'',
            pend:Object.keys(PEND).length};});
  t('la piazzola dice a che ora il mezzo è sul pick-up', c1.arrivo===635&&/10:35/.test(c1.slotTxt), c1);
  t('e il margine col segno',                            /\+10m/.test(c1.slotTxt)&&c1.margine===10, c1);
  t('10 minuti di margine = ambra, non verde',           c1.k==='stretto'&&/plsmid/.test(c1.slotCls), c1);
  t('se rompe il servizio dopo, il verdetto è rosso',    c1.rottoOk===false&&/poi salta 14:00/.test(c1.rottoBreve), c1);
  t('e non dice più "occupato" ma il motivo vero',       /non si raggiunge più/.test(c1.rottoMsg)&&/35m/.test(c1.rottoMsg), c1.rottoMsg);
  t('l\'avviso a valle compare sotto la riga',           /14:00/.test(c1.avv)&&/35m/.test(c1.avv), c1.avv);
  t('finché non assegni non si scrive niente',           c1.pend===0, c1.pend);

  const c2=await p.evaluate(()=>{
    var S=DATA.services.filter(x=>x.id==='S')[0];
    S.veicolo='Vito 1';_BYID_SRC=null;plArma(null);plArma('S');
    var lib=plCatena(S,'').liberati[0];
    return {free:(document.querySelector('.plfree')||{}).textContent||'',
            guadagno:lib?lib.guadagno:null,era:lib?lib.era:''};});
  await p.waitForTimeout(200);
  t('sulla riga di provenienza si vede cosa si libera',
    /si libera/.test(c2.free)&&/\+/.test(c2.free)&&c2.guadagno===200, c2);
  t('e che quel servizio torna raggiungibile', c2.era==='rotto'&&/raggiungibile/.test(c2.free), c2);

  const c3=await p.evaluate(()=>{
    var S=DATA.services.filter(x=>x.id==='S')[0];S.veicolo='';_BYID_SRC=null;
    var V=DATA.services.filter(x=>x.id==='V')[0];
    var conVolo=plVerifica(V,'Vito 2',true);
    V.volo='';_BYID_SRC=null;
    var senzaVolo=plVerifica(V,'Vito 2',true);
    V.volo='FR8826';_BYID_SRC=null;
    return {conVolo:conVolo.ok,conK:conVolo.k,conMsg:conVolo.msg,margine:conVolo.cat?conVolo.cat.margine:null,
            senzaVolo:senzaVolo.ok,finestra:finestraInizio(V)};});
  t('col volo dall\'aeroporto ci arriva lo stesso (bagagli)',
    c3.conVolo===true&&c3.finestra===20&&c3.margine===-15, c3);
  t('ma è ambra, non verde, e lo scrive',  c3.conK==='stretto'&&/bagagli/.test(c3.conMsg), c3);
  t('senza volo lo stesso incastro è rosso', c3.senzaVolo===false, c3);

  const c4=await p.evaluate(()=>{
    // stesso autista su due mezzi: viaggiano insieme, non è un conflitto (non deve regredire)
    var S=DATA.services.filter(x=>x.id==='S')[0];
    S.autista='Marco Rossi';S.startMin=480;S.endMin=600;_BYID_SRC=null;
    var r=plVerifica(S,'Vito 1',true);
    S.autista='';S.startMin=660;S.endMin=780;_BYID_SRC=null;
    return r.ok;});
  t('due servizi dello stesso autista restano compatibili', c4===true, c4);

  const c5=await p.evaluate(()=>{
    var S=DATA.services.filter(x=>x.id==='S')[0];
    S.da='Monopoli';_BYID_SRC=null;                 // B finisce a Monopoli: stesso posto
    var r=plVerifica(S,'Mercedes V',true);
    S.da='Ostuni';_BYID_SRC=null;
    return {trasf:r.cat.trasf,buffer:r.cat.buffer,arrivo:r.cat.arrivo};});
  t('stesso luogo: trasferimento 0 e buffer 0 anche qui', c5.trasf===0&&c5.buffer===0&&c5.arrivo===600, c5);

  console.log('\n=== 9ter. PLANCIA: due giorni, vassoio a destra, anteprima col mouse ===');
  const DOMSEED=`(function(){
    var pl_d2=addDaysC(DATA.date,1);
    var P=JSON.parse(JSON.stringify(DATA));P.date=pl_d2;P.nowMin=-1;
    P.services=[JSON.parse(JSON.stringify(DATA.services[0]))];
    var s=P.services[0];s.id='DOM1';s.startMin=390;s.durMin=60;s.endMin=450;s.time='06:30';
    s.da='Polignano a Mare';s.per='Aeroporto di Bari';s.autista='';s.veicolo='';
    s.nome='Partenza presto';s.stato='';s.allert='';s.volo='';
    P.transfers={};PLANS[pl_d2]=P;return pl_d2;})()`;
  const pl_d2=await p.evaluate(DOMSEED);
  await p.evaluate(()=>{PL_ARM=null;PEND={};setDue(true);});await p.waitForTimeout(400);
  const pl_g1=await p.evaluate(()=>{
    var P=plPiano(), dom=P.services.filter(x=>x.domani);
    return {due:DUE,pronta:plPronta(),nDom:dom.length,
            oraDom:dom.length?dom[0].startMin:null,
            mezzanotte:document.querySelectorAll('.plmezza').length,
            badge:document.querySelectorAll('.pltile .pldomani').length,
            tickDom:document.querySelectorAll('.plhrs i.pldom').length};});
  t('domani entra sulla stessa plancia', pl_g1.nDom===1&&pl_g1.pronta, pl_g1);
  t('e sta a +1440 minuti, dopo la mezzanotte', pl_g1.oraDom===390+1440, pl_g1);
  t('la mezzanotte è una riga in ogni corsia', pl_g1.mezzanotte>0, pl_g1);
  t('nel vassoio si vede che è di domani', pl_g1.badge===1, pl_g1);

  // catena che scavalla la mezzanotte: la tratta la manda il backend, non si inventa
  const pl_mid=await p.evaluate(dd=>{
    var L=JSON.parse(JSON.stringify(DATA.services[0]));
    L.id='LATE';L.startMin=1320;L.durMin=60;L.endMin=1380;L.time='22:00';
    L.da='Bari';L.per='Monopoli';L.autista='Marco Rossi';L.veicolo='Vito 1';
    L.allert='';L.note='';L.nome='Ultimo di oggi';
    DATA.services.push(L);
    var N=JSON.parse(JSON.stringify(PLANS[dd].services[0]));
    N.id='NOTTE';N.startMin=30;N.durMin=60;N.endMin=90;N.time='00:30';
    N.da='Ostuni';N.per='Bari';N.autista='';N.veicolo='';N.nome='Primo di domani';
    PLANS[dd].services.push(N);
    DATA.transfers['LATE->NOTTE']={min:40,buffer:15};   // come la manda il backend
    PL_DUE_PIANO=null;_BYID_SRC=null;render();
    var con=plCon(function(){
      var S=plPiano().services.filter(x=>x.id==='NOTTE')[0];
      return plCatena(S,'Vito 1');});
    delete DATA.transfers['LATE->NOTTE'];
    PL_DUE_PIANO=null;_BYID_SRC=null;render();
    var senza=plCon(function(){
      var S=plPiano().services.filter(x=>x.id==='NOTTE')[0];
      return plCatena(S,'Vito 1');});
    return {daDove:con.daDove&&con.daDove.id, trasf:con.trasf, stima:con.stima,
            arrivo:con.arrivo, margine:con.margine, stimaSenza:senza.stima, trasfSenza:senza.trasf};},pl_d2);
  t('la catena del mezzo scavalla la mezzanotte',        pl_mid.daDove==='LATE', pl_mid);
  t('e usa la tratta vera, non i 30 minuti di default',  pl_mid.trasf===40&&pl_mid.stima===false, pl_mid);
  // 23:00 di fine + 40' di strada = sul posto alle 23:40; al netto del buffer di 15' restano 35'
  t('sul pick-up alle 23:40, 35 minuti di margine netto', pl_mid.arrivo===1420&&pl_mid.margine===35, pl_mid);
  t('senza quella tratta la catena si direbbe a stima',  pl_mid.stimaSenza===true&&pl_mid.trasfSenza===30, pl_mid);
  await p.evaluate(dd=>{
    DATA.services=DATA.services.filter(x=>x.id!=='LATE');
    PLANS[dd].services=PLANS[dd].services.filter(x=>x.id!=='NOTTE');
    PL_DUE_PIANO=null;_BYID_SRC=null;render();},pl_d2);
  await p.waitForTimeout(250);

  const pl_g2=await p.evaluate(dd=>{
    var S=plPiano().services.filter(x=>x.id==='DOM1')[0];
    plSposta(S,'Vito 1');
    return {copia:S.veicolo, vera:PLANS[dd].services.filter(x=>x.id==='DOM1')[0].veicolo,
            pend:PEND['DOM1']?PEND['DOM1'].veicolo:null};},pl_d2);
  t('assegnare un servizio di domani scrive sulla SUA giornata',
    pl_g2.copia==='Vito 1'&&pl_g2.vera==='Vito 1'&&pl_g2.pend==='Vito 1', pl_g2);
  await p.evaluate(()=>{PEND={};setDue(false);});await p.waitForTimeout(300);

  const pl_g3=await p.evaluate(()=>{
    var t=document.querySelector('.pltiles'), st=getComputedStyle(t);
    var rt=t.getBoundingClientRect(), rg=document.querySelector('.plwrap').getBoundingClientRect();
    return {colonna:st.flexDirection,scorre:st.overflowY,aDestra:rt.left>=rg.right-40};});
  t('il vassoio è una colonna a destra', pl_g3.aDestra&&pl_g3.colonna==='column', pl_g3);
  t('e scorre da solo',                  pl_g3.scorre==='auto'||pl_g3.scorre==='scroll', pl_g3);

  const pl_pos=await p.evaluate(()=>{var n=document.querySelectorAll('.plblk')[1];
    var r=n.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};});
  await p.mouse.move(pl_pos.x,pl_pos.y);await p.waitForTimeout(250);
  const pl_g4=await p.evaluate(()=>{
    var c=document.getElementById('plcard'),s=DATA.services[1];
    var txt=c.textContent.replace(/\s+/g,' ');
    return {aperta:c.style.display==='block',anteprima:/plcpeek/.test(c.className),
            bottoni:c.querySelectorAll('button').length,armato:PL_ARM,
            ora:txt.indexOf(fmtMin(s.startMin))>=0, da:txt.indexOf(s.da)>=0,
            per:txt.indexOf(s.per)>=0, pax:txt.indexOf(s.pax+' pax')>=0};});
  t('col mouse sopra il quadratino si apre la scheda', pl_g4.aperta&&pl_g4.anteprima, pl_g4);
  t('con ora, da, per e pax',            pl_g4.ora&&pl_g4.da&&pl_g4.per&&pl_g4.pax, pl_g4);
  t('è solo un\'anteprima: non arma e non ha pulsanti', pl_g4.armato===null&&pl_g4.bottoni===0, pl_g4);
  await p.mouse.move(4,4);await p.waitForTimeout(250);
  t('togliendo il mouse sparisce',
    await p.evaluate(()=>document.getElementById('plcard').style.display!=='block'), null);

  console.log('\n=== 9quater. PLANCIA: togliere il mezzo, l\'autista, o tutti e due ===');
  await p.evaluate(()=>{PEND={};PL_ARM=null;setDue(false);render();});await p.waitForTimeout(250);
  const st=await p.evaluate(()=>{
    var s=DATA.services.filter(x=>x.autista&&x.veicolo)[0];
    var out={id:s.id,prima:{aut:s.autista,vei:s.veicolo}};
    plArma(s.id);
    out.bottoni=[].map.call(document.querySelectorAll('#plcard .plcaz button'),x=>x.textContent.trim());
    plStacca('autista');
    var d=function(){return DATA.services.filter(x=>x.id===out.id)[0];};
    out.soloAutista={aut:d().autista,vei:d().veicolo,pend:PEND[out.id]};
    d().autista=out.prima.aut;d().veicolo=out.prima.vei;delete PEND[out.id];
    plArma(out.id);plStacca('veicolo');
    out.soloMezzo={aut:d().autista,vei:d().veicolo};
    out.inCoda=DATA.services.filter(x=>!isCanc(x)&&!x.veicolo&&x.id===out.id).length;
    d().autista=out.prima.aut;d().veicolo=out.prima.vei;delete PEND[out.id];
    plArma(out.id);plStacca('tutti');
    out.tuttiEDue={aut:d().autista,vei:d().veicolo};
    d().autista=out.prima.aut;d().veicolo=out.prima.vei;PEND={};
    return out;});
  t('la scheda offre tutte e tre le vie',
    st.bottoni.length===4&&/mezzo/i.test(st.bottoni[1])&&/autista/i.test(st.bottoni[2]), st.bottoni);
  t('togliere l\'autista lascia il mezzo',
    st.soloAutista.aut===''&&st.soloAutista.vei===st.prima.vei
    &&st.soloAutista.pend.autista===''&&st.soloAutista.pend.veicolo===st.prima.vei, st.soloAutista);
  t('togliere il mezzo lascia l\'autista',
    st.soloMezzo.vei===''&&st.soloMezzo.aut===st.prima.aut, st.soloMezzo);
  t('e il servizio torna fra i da assegnare', st.inCoda===1, st.inCoda);
  t('«tutti e due» li toglie entrambi',
    st.tuttiEDue.aut===''&&st.tuttiEDue.vei==='', st.tuttiEDue);

  console.log('\n=== 9quinquies. PLANCIA: il trascinamento non può restare appeso ===');
  await p.evaluate(()=>{PEND={};PL_ARM=null;PL_DRAG=null;setDue(false);render();});await p.waitForTimeout(250);
  // 1. la app si ricarica mentre il dito è ancora giù (aggiornamento, tasto 🔄, cambio data)
  const dr=await p.evaluate(()=>{var n=document.querySelector('.plblk');var r=n.getBoundingClientRect();
    return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};});
  await p.mouse.move(dr.x,dr.y);await p.mouse.down();
  await p.mouse.move(dr.x+40,dr.y+60,{steps:3});await p.waitForTimeout(120);
  const inCorso=await p.evaluate(()=>({drag:!!PL_DRAG,ghost:document.querySelectorAll('.plghost').length}));
  t('il trascinamento è partito', inCorso.drag&&inCorso.ghost===1, inCorso);
  const dopoLoad=await p.evaluate(()=>{ load(); return {
    drag:PL_DRAG, ghost:document.querySelectorAll('.plghost').length,
    msg:(document.getElementById('plmsg')||{}).style.display};});
  t('un ricaricamento chiude il trascinamento invece di lasciarlo acceso',
    dopoLoad.drag===null&&dopoLoad.ghost===0&&dopoLoad.msg!=='block', dopoLoad);
  const tornata=await p.evaluate(()=>{ render(); return document.querySelectorAll('.plrow').length; });
  t('e la plancia si ridisegna: niente rotella per sempre', tornata>2, tornata);
  await p.mouse.up();await p.waitForTimeout(150);

  // 2. il dito si alza fuori dalla app, o il blocco sparisce da sotto
  await p.evaluate(()=>{PL_DRAG=null;render();});await p.waitForTimeout(200);
  const fuori=await p.evaluate(()=>{
    PL_DRAG='UN-ID-CHE-NON-ESISTE';
    render();                          // la rete di sicurezza deve accorgersene
    return {drag:PL_DRAG,righe:document.querySelectorAll('.plrow').length};});
  t('un trascinamento rimasto acceso su un blocco sparito viene chiuso',
    fuori.drag===null&&fuori.righe>2, fuori);

  console.log('\n=== 9sexies. PLANCIA: l\'autista lo porta dietro il mezzo, e si salva ===');
  await p.evaluate(()=>{PEND={};PL_ARM=null;PL_DRAG=null;setDue(false);render();});await p.waitForTimeout(250);
  const au=await p.evaluate(()=>{
    var out={};
    // 1. servizio senza autista e senza mezzo → prende l'ultimo autista di quel mezzo.
    //    Lo metto in un'ora in cui quell'autista è davvero libero: da quando l'ereditato
    //    salta chi non può guidare, un servizio sovrapposto non erediterebbe nessuno.
    var s=JSON.parse(JSON.stringify(DATA.services[0]));
    s.id='EREDE';s.startMin=1290;s.durMin=45;s.endMin=1335;s.time='21:30';
    s.da='Bari';s.per='Ostuni';s.autista='';s.veicolo='';s.nome='Erede';s.allert='';s.note='';
    DATA.services.push(s);_BYID_SRC=null;
    out.atteso=plUltimoAutista('Vito 1',s);
    plSposta(s,'Vito 1');
    var d=DATA.services.filter(x=>x.id===s.id)[0];
    out.senzaAutista={aut:d.autista,vei:d.veicolo,pend:PEND[s.id]};
    d.autista='';d.veicolo='';delete PEND[s.id];
    // 2. servizio con l'autista messo a mano → non si tocca
    d.autista='Pietro Salvi';
    plSposta(d,'Vito 1');
    out.autistaMio={aut:d.autista,pend:PEND[d.id]};
    d.autista='';d.veicolo='';delete PEND[d.id];
    // 3. mezzo che oggi non lavora → resta senza autista, non si inventa nessuno
    var fermo=DATA.veicoli.filter(v=>DATA.services.filter(x=>x.veicolo===v.nome).length===0)[0];
    out.mezzoFermo=fermo?fermo.nome:null;
    if(fermo){ plSposta(d,fermo.nome); out.senzaGiro={aut:d.autista,vei:d.veicolo};
               d.autista='';d.veicolo='';delete PEND[d.id]; }
    render();
    return out;});
  t('assegnando il mezzo prende l\'ultimo autista che ce l\'aveva',
    au.senzaAutista.aut===au.atteso&&au.atteso!==''&&au.senzaAutista.pend.autista===au.atteso, au);
  t('e l\'autista finisce in sospeso insieme al mezzo',
    au.senzaAutista.pend.veicolo==='Vito 1', au.senzaAutista);
  t('l\'autista messo a mano non viene sovrascritto',
    au.autistaMio.aut==='Pietro Salvi'&&au.autistaMio.pend.autista==='Pietro Salvi', au.autistaMio);
  t('su un mezzo che oggi non lavora non si inventa un autista',
    !au.mezzoFermo||au.senzaGiro.aut==='', au);

  const bar=await p.evaluate(()=>{
    var s=DATA.services.filter(x=>!x.veicolo)[0];
    plSposta(s,'Vito 1');
    var b=document.querySelector('.plsalva');
    if(!b)return {c:false};
    var st=getComputedStyle(b),r=b.getBoundingClientRect();
    return {c:true,pos:st.position,visibile:r.bottom<=window.innerHeight+1&&r.top>0,
            testo:b.textContent.replace(/\s+/g,' ').trim(),
            salva:!!b.querySelector('[onclick*="salvaTutto(false)"]'),
            recap:!!b.querySelector('[onclick*="salvaTutto(true)"]'),
            annulla:!!b.querySelector('[onclick*="annullaPend"]')};});
  t('assegnato un mezzo, la barra per salvare c\'è',  bar.c&&bar.salva&&bar.recap&&bar.annulla, bar);
  t('e sta fissa a schermo, non in cima alla pagina', bar.pos==='fixed'&&bar.visibile, bar);
  await p.evaluate(()=>{PEND={};DATA.services.forEach(function(s){});render();});await p.waitForTimeout(200);
  t('senza niente in sospeso la barra sparisce',
    await p.evaluate(()=>!document.querySelector('.plsalva')), null);
  // un messaggio lungo sul telefono va a capo tre volte: se copre la barra, non si salva
  await p.close();p=await nuova(390,844);
  await p.evaluate(()=>{setTab('plancia');
    var s=DATA.services.filter(x=>!x.veicolo)[0];plSposta(s,'Vito 1');
    toast("⚠️ forzato · Mercedes V · con Nicola D'Amico (ultimo che l'aveva) · poi salta 14:00");});
  await p.waitForTimeout(350);
  const cop=await p.evaluate(()=>{
    var b=document.querySelector('.plsalva').getBoundingClientRect();
    var to=document.getElementById('toast').getBoundingClientRect();
    var tb=document.querySelector('.tabs').getBoundingClientRect();
    var sovr=function(x,y){return !(x.bottom<=y.top||x.top>=y.bottom);};
    return {toast:Math.round(to.height),coperta:sovr(b,to),suiTab:sovr(b,tb),
            dentro:b.top>0&&b.bottom<=window.innerHeight+1};});
  t('a 390px il messaggio non copre la barra del salvataggio',
    !cop.coperta&&!cop.suiTab&&cop.dentro, cop);
  await p.close();p=await nuova(1440,1000);await p.evaluate(()=>setTab('plancia'));await p.waitForTimeout(250);

  console.log('\n=== 9septies. PLANCIA: il pennello autista ===');
  await p.evaluate(()=>{PEND={};PL_ARM=null;PL_PENNA=null;PL_DRAG=null;setDue(false);render();});
  await p.waitForTimeout(250);
  const pen0=await p.evaluate(()=>({chip:document.querySelectorAll('.plautc').length,
    autisti:DATA.autisti.length, striscia:!!document.querySelector('.plarmp')}));
  t('c\'è una casella per ogni autista', pen0.chip===pen0.autisti&&pen0.chip>0, pen0);
  t('e finché non ne prendi uno nessuna striscia', !pen0.striscia, pen0);

  await p.evaluate(()=>{plPenna(PL_AUTLISTA.indexOf('Marco Rossi'));});await p.waitForTimeout(250);
  const pen1=await p.evaluate(()=>({inMano:PL_PENNA,striscia:!!document.querySelector('.plarmp'),
    sel:document.querySelectorAll('.plautc.sel').length,
    marcati:document.querySelectorAll('.plblk.plmio').length,
    suoi:DATA.services.filter(s=>s.autista==='Marco Rossi'&&!isCanc(s)&&s.startMin>=0).length}));
  t('preso un autista, resta in mano e si vede', pen1.inMano==='Marco Rossi'&&pen1.striscia&&pen1.sel===1, pen1);
  t('e i suoi servizi sono marcati sulla plancia', pen1.marcati===pen1.suoi&&pen1.marcati>0, pen1);

  // il tocco vero su un blocco, senza trascinare
  const blocco=await p.evaluate(()=>{
    var s=DATA.services.filter(x=>x.autista&&x.autista!=='Marco Rossi'&&x.veicolo)[0];
    var n=document.querySelector('.plblk[data-id="'+s.id+'"]');
    var r=n.getBoundingClientRect();
    return {id:s.id,vei:s.veicolo,autPrima:s.autista,x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};});
  await p.mouse.move(blocco.x,blocco.y);await p.mouse.down();await p.mouse.up();
  await p.waitForTimeout(250);
  const pen2=await p.evaluate(i=>{var d=DATA.services.filter(x=>x.id===i)[0];
    return {aut:d.autista,vei:d.veicolo,pend:PEND[i],armato:PL_ARM,inMano:PL_PENNA};},blocco.id);
  t('toccando un servizio ci scrivi l\'autista', pen2.aut==='Marco Rossi', pen2);
  t('e il mezzo resta quello che aveva',        pen2.vei===blocco.vei, {atteso:blocco.vei,avuto:pen2.vei});
  t('finisce in sospeso, non sul foglio',       !!pen2.pend&&pen2.pend.autista==='Marco Rossi', pen2.pend);
  t('col pennello in mano il tocco non arma il servizio', pen2.armato===null, pen2);
  t('e il pennello resta in mano per il prossimo',        pen2.inMano==='Marco Rossi', pen2);

  // ritocco lo stesso: lo toglie
  const nodo2=await p.evaluate(i=>{var n=document.querySelector('.plblk[data-id="'+i+'"]');
    var r=n.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};},blocco.id);
  await p.mouse.move(nodo2.x,nodo2.y);await p.mouse.down();await p.mouse.up();
  await p.waitForTimeout(250);
  t('ritoccando lo stesso servizio l\'autista si toglie',
    await p.evaluate(i=>DATA.services.filter(x=>x.id===i)[0].autista==='',blocco.id), null);

  // col pennello in mano, assegnare il MEZZO non deve far vincere l'ultimo autista
  // che quel mezzo aveva: il nome che tieni in mano è una scelta, l'altro un ripiego
  const vince=await p.evaluate(()=>{
    var s=DATA.services.filter(function(x){return !x.autista&&x.startMin>=0;})[0];
    if(!s){s=DATA.services.filter(function(x){return x.startMin>=0;})[0];s.autista='';}
    var vecchio=plCon(function(){return plUltimoAutista('Vito 1',s);});
    plPenna(PL_AUTLISTA.indexOf('Pietro Salvi'));
    plSposta(s,'Vito 1');
    return {aut:s.autista, pend:PEND[s.id]?PEND[s.id].autista:null,
            vecchio:vecchio, vei:s.veicolo};});
  t('col pennello in mano vince il nome che tieni tu',
    vince.aut==='Pietro Salvi'&&vince.pend==='Pietro Salvi', vince);
  t('e non l\'ultimo autista che aveva quel mezzo',
    vince.vecchio!=='Pietro Salvi', vince);
  t('il mezzo resta quello che hai scelto', vince.vei==='Vito 1', vince);
  await p.evaluate(()=>{PEND={};load();});await p.waitForTimeout(300);
  await p.evaluate(()=>plPosa());await p.waitForTimeout(200);
  t('«posa» lascia il pennello',
    await p.evaluate(()=>PL_PENNA===null&&!document.querySelector('.plarmp')), null);
  await p.evaluate(()=>{PEND={};load();});await p.waitForTimeout(200);

  console.log('\n=== 9septies bis. PLANCIA: l\'autista si trascina sul servizio (Mac) ===');
  await p.evaluate(()=>{PEND={};PL_ARM=null;PL_PENNA=null;setPlVista('mezzi');render();});
  await p.waitForTimeout(300);
  const dd=await p.evaluate(()=>{
    var chip=[].slice.call(document.querySelectorAll('.plautc')).filter(function(n){
      return n.textContent.indexOf('Pietro Salvi')===0;})[0];
    var s=DATA.services.filter(function(x){return x.veicolo&&x.autista&&x.autista!=='Pietro Salvi'&&x.startMin>=0;})[0];
    var blk=document.querySelector('.plblk[data-id="'+s.id+'"]');
    var a=chip.getBoundingClientRect(), b=blk.getBoundingClientRect();
    return {ax:Math.round(a.left+a.width/2),ay:Math.round(a.top+a.height/2),
            bx:Math.round(b.left+b.width/2),by:Math.round(b.top+b.height/2),
            id:s.id,prima:s.autista,vei:s.veicolo};});
  await p.mouse.move(dd.ax,dd.ay);await p.mouse.down();
  await p.mouse.move(dd.ax+30,dd.ay+20,{steps:4});
  await p.mouse.move(dd.bx,dd.by,{steps:8});await p.waitForTimeout(150);
  const durante=await p.evaluate(()=>({fantasma:document.querySelectorAll('.plghost').length,
    bersaglio:document.querySelectorAll('.plblk.plsu,.pltile.plsu').length,
    msg:(document.getElementById('plmsg')||{textContent:''}).textContent}));
  t('trascinando l\'autista compare il suo colore in mano', durante.fantasma===1, durante);
  t('e il servizio sotto si illumina, dicendo se ci sta',
    durante.bersaglio===1&&durante.msg.indexOf('Pietro Salvi')>=0, durante);
  await p.mouse.up();await p.waitForTimeout(300);
  const ddDopo=await p.evaluate(i=>{var s=DATA.services.filter(function(x){return x.id===i;})[0];
    return {aut:s.autista,vei:s.veicolo,pend:PEND[i],penna:PL_PENNA,drag:PL_DRAG};},dd.id);
  t('lasciandolo lì, il servizio prende quell\'autista',
    ddDopo.aut==='Pietro Salvi'&&dd.prima!=='Pietro Salvi'&&!!ddDopo.pend, {prima:dd.prima,dopo:ddDopo});
  t('il mezzo non si tocca',            ddDopo.vei===dd.vei, {atteso:dd.vei,avuto:ddDopo.vei});
  t('non resta niente appeso',          ddDopo.drag===null&&ddDopo.penna===null, ddDopo);
  // il tocco secco fa ancora quello di prima: prende il pennello. (La casella si è
  //  spostata: dopo l'assegnazione la fila si riordina per carico, quindi la ricerco.)
  const chip2=await p.evaluate(()=>{
    var n=[].slice.call(document.querySelectorAll('.plautc')).filter(function(x){
      return x.textContent.indexOf('Pietro Salvi')===0;})[0];
    var r=n.getBoundingClientRect();
    return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};});
  await p.mouse.move(chip2.x,chip2.y);await p.mouse.down();await p.mouse.up();
  await p.waitForTimeout(250);
  t('un tocco secco invece prende il pennello, come prima',
    await p.evaluate(()=>PL_PENNA==='Pietro Salvi'), null);
  await p.evaluate(()=>{plPosa();PEND={};load();});await p.waitForTimeout(300);

  console.log('\n=== 9septies ter. PLANCIA: l\'autista si prende dal blocco stesso ===');
  await p.evaluate(()=>{PEND={};PL_ARM=null;PL_PENNA=null;setPlVista('mezzi');plZoom(1);});
  await p.waitForTimeout(400);
  const pr=await p.evaluate(()=>{
    // una presa che non finisca sotto la colonna dei mezzi, che è appiccicata a sinistra
    var rail=document.querySelector('.plrail').getBoundingClientRect();
    var g=[].slice.call(document.querySelectorAll('.plgrip')).filter(function(n){
      var r=n.getBoundingClientRect();return r.left>rail.right+6&&r.right<window.innerWidth-6;})[0];
    if(!g)return null;
    var da=g.parentNode.getAttribute('data-id');
    var chi=DATA.services.filter(function(x){return x.id===da;})[0].autista;
    var t=DATA.services.filter(function(x){
      if(x.startMin<0||!x.veicolo||!x.autista||x.autista===chi)return false;
      var n=document.querySelector('.plblk[data-id="'+x.id+'"]');
      return n&&n.getBoundingClientRect().left>rail.right+6;})[0];
    var blk=document.querySelector('.plblk[data-id="'+t.id+'"]');
    var a=g.getBoundingClientRect(), b=blk.getBoundingClientRect();
    return {ax:Math.round(a.left+a.width/2),ay:Math.round(a.top+a.height/2),
            bx:Math.round(b.left+b.width/2),by:Math.round(b.top+b.height/2),
            chi:chi,target:t.id,prima:t.autista,vei:t.veicolo};});
  t('ogni servizio con autista ha la sua presa', !!pr, pr);
  await p.mouse.move(pr.ax,pr.ay);await p.mouse.down();
  await p.mouse.move(pr.ax+25,pr.ay+15,{steps:4});
  await p.mouse.move(pr.bx,pr.by,{steps:8});await p.waitForTimeout(150);
  const durante2=await p.evaluate(()=>({fantasma:document.querySelectorAll('.plghost').length,
    bersaglio:document.querySelectorAll('.plblk.plsu').length}));
  t('trascinando la presa il nome resta in mano', durante2.fantasma===1&&durante2.bersaglio===1, durante2);
  await p.mouse.up();await p.waitForTimeout(300);
  const prDopo=await p.evaluate(i=>{var s=DATA.services.filter(function(x){return x.id===i;})[0];
    return {aut:s.autista,vei:s.veicolo,pend:!!PEND[i],drag:PL_DRAG};},pr.target);
  t('il servizio prende l\'autista preso dall\'altro blocco',
    prDopo.aut===pr.chi&&pr.prima!==pr.chi&&prDopo.pend, {preso:pr.chi,prima:pr.prima,dopo:prDopo});
  t('e il mezzo resta il suo',   prDopo.vei===pr.vei, {atteso:pr.vei,avuto:prDopo.vei});
  t('niente resta appeso',       prDopo.drag===null, prDopo);
  await p.evaluate(()=>{PEND={};PL_PENNA=null;load();});await p.waitForTimeout(300);

  console.log('\n=== 9octies. PLANCIA: i servizi cancellati non occupano niente ===');
  await p.evaluate(()=>{setTab('plancia');PEND={};PL_ARM=null;PL_PENNA=null;setDue(false);render();});
  await p.waitForTimeout(250);
  const ca0=await p.evaluate(()=>{
    var s=DATA.services.filter(x=>x.veicolo&&x.autista&&x.startMin>=0)[0];
    return {id:s.id,vei:s.veicolo,aut:s.autista,
            blocchi:document.querySelectorAll('.plblk').length,
            suoi:document.querySelectorAll('.plblk[data-id="'+s.id+'"]').length};});
  t('il servizio di partenza è disegnato', ca0.suoi>0, ca0);
  const ca1=await p.evaluate(i=>{
    var s=DATA.services.filter(x=>x.id===i)[0];
    s.allert='Cancellato'; render();
    return {blocchi:document.querySelectorAll('.plblk').length,
            suoi:document.querySelectorAll('.plblk[data-id="'+i+'"]').length,
            tile:document.querySelectorAll('.pltile[data-id="'+i+'"]').length,
            libero:!plScontro(DATA.services.filter(x=>!x.veicolo&&x.startMin>=0)[0]||s,s.veicolo)};},ca0.id);
  t('cancellato sparisce dalla corsia del mezzo', ca1.suoi===0&&ca1.blocchi===ca0.blocchi-1, {prima:ca0,dopo:ca1});
  t('e non finisce nemmeno fra i da assegnare',   ca1.tile===0, ca1);
  t('il mezzo resta libero per quell\'ora',       ca1.libero, ca1);
  const ca2=await p.evaluate(a=>{
    var i=a[0],aut=a[1];
    var chip=[].slice.call(document.querySelectorAll('.plautc')).filter(function(b){return b.textContent.indexOf(aut)===0;})[0];
    var conta=chip?(chip.querySelector('small')?+chip.querySelector('small').textContent:0):null;
    var s=DATA.services.filter(x=>x.id===i)[0];
    return {conta:conta,giro:giroDi(aut,null).length};},[ca0.id,ca0.aut]);
  t('e non conta più nel carico dell\'autista', ca2.conta===ca2.giro, ca2);
  // stessa storia ma segnata solo nelle Note: l'Allert sul foglio è rimasto indietro
  const cn=await p.evaluate(i=>{
    var s=DATA.services.filter(x=>x.id===i)[0];
    s.allert=''; s.note='Servizio cancellato dal fornitore'; render();
    return {suoi:document.querySelectorAll('.plblk[data-id="'+i+'"]').length,
            canc:isCanc(s), giro:giroDi(s.autista,null).length};},ca0.id);
  t('cancellato nelle note: per la app è cancellato', cn.canc, cn);
  t('e sparisce anche lui dalla corsia',              cn.suoi===0, cn);
  // in Servizi la riga resta visibile, barrata, e dice da dove viene il segno
  const cs=await p.evaluate(i=>{
    setTab('servizi'); render();
    var n=[].slice.call(document.querySelectorAll('div')).filter(function(d){
      return d.textContent.indexOf('CANCELLATO')>=0&&d.querySelectorAll('div').length===0;})[0];
    return {c:!!n, testo:n?n.textContent.replace(/\s+/g,' ').trim():''};},ca0.id);
  t('in Servizi la riga si vede lo stesso, barrata',  cs.c, cs);
  t('e dice che il segno sta nelle note',             cs.testo.indexOf('dalle note')>=0, cs);
  await p.evaluate(i=>{var s=DATA.services.filter(x=>x.id===i)[0];
    s.allert='';s.note='';PEND={};setTab('plancia');render();},ca0.id);
  await p.waitForTimeout(200);

  console.log('\n=== 9bis. PLANCIA a 390px: la miniatura non copre le piazzole ===');
  await p.close();p=await nuova(390,844);
  await p.evaluate(PLSEED);await p.waitForTimeout(300);
  await p.evaluate(()=>plArma('S'));await p.waitForTimeout(300);
  const pm1=await p.evaluate(()=>{
    var c=document.getElementById('plcard'),r=c.getBoundingClientRect();
    var slot=document.querySelector('.plslot'),rs=slot?slot.getBoundingClientRect():null;
    return {dentro:r.left>=0&&r.right<=window.innerWidth&&r.bottom<=window.innerHeight+1,
            copre:!!(rs&&rs.bottom>r.top&&rs.top<r.bottom&&rs.right>r.left&&rs.left<r.right),
            ov:document.documentElement.scrollWidth-document.documentElement.clientWidth};});
  t('la miniatura resta dentro lo schermo', pm1.dentro, pm1);
  t('e non copre la piazzola',              !pm1.copre, pm1);
  t('nessuno scroll orizzontale',           pm1.ov<=2, pm1.ov);

  console.log('\n=== 9decies. PLANCIA: fine · viaggio · arrivo previsto ===');
  await p.close();p=await nuova(1400,900);
  await p.evaluate(PLSEED);await p.waitForTimeout(300);
  await p.evaluate(()=>{PL_ARM=null;PEND={};PL_GAP=true;plZoom(1);plZoom(1);});await p.waitForTimeout(400);
  const ore=await p.evaluate(()=>{
    var lane=[].slice.call(document.querySelectorAll('.pllane')).filter(function(l){
      return l.getAttribute('data-v')==='Vito 1';})[0];
    var fine=[].slice.call(lane.querySelectorAll('.plora.plofin'));
    var arr=[].slice.call(lane.querySelectorAll('.plora.plarr'));
    var srt=DATA.services.filter(function(s){return s.veicolo==='Vito 1'&&s.startMin>=0;})
      .sort(function(a,b){return a.startMin-b.startMin;});
    var A=srt[0],B=srt[1],t=trf(A.id,B.id);
    return {fine:fine.map(function(n){return n.textContent;}),
            arr:arr.map(function(n){return n.textContent;}),
            attesaTxt:[].slice.call(lane.querySelectorAll('.plgatt i')).map(function(n){return n.textContent;}),
            viaggioTxt:[].slice.call(lane.querySelectorAll('.plgvia i')).map(function(n){return n.textContent;}),
            attesoFine:fmtMin(A.startMin)+' → '+fmtMin(plFine(A)), attesoArr:'arrivo '+fmtMin(plFine(A)+t.min), via:t.min, viaTxt:fmtDur(t.min),
            yFine:Math.round(fine[0].getBoundingClientRect().top),
            yArr:arr.length?Math.round(arr[0].getBoundingClientRect().top):null,
            yBarra:Math.round((lane.querySelector('.plgvia')||lane.querySelector('.plgatt')).getBoundingClientRect().top),
            xFine:Math.round(fine[0].getBoundingClientRect().left),
            xBlocco:Math.round(lane.querySelector('.plblk').getBoundingClientRect().left),
            yBlocco:Math.round(lane.querySelector('.plblk').getBoundingClientRect().top)};});
  t('sopra ogni servizio ci sono partenza e arrivo',
    ore.fine.some(function(x){return x.indexOf(ore.attesoFine)===0;}), ore);
  t('allineate al blocco, e mai coperte dal blocco',
    Math.abs(ore.xFine-ore.xBlocco)<=6&&ore.yFine<ore.yBlocco, ore);
  t('poi l\'ora in cui è sul pick-up del servizio dopo',
    ore.arr.length>0&&ore.arr[0].indexOf(ore.attesoArr)>=0, ore);
  t('la fine sta sopra la barra e l\'arrivo sotto, non si accavallano',
    ore.yFine<ore.yBarra&&ore.yArr>ore.yBarra, ore);
  // il tempo di viaggio sta dentro la barra se ci sta, altrimenti se lo porta l'etichetta
  t('e il tempo di viaggio è scritto una volta sola',
    (ore.viaggioTxt.join(' ').indexOf(ore.viaTxt)>=0) !== (ore.arr[0].indexOf(ore.viaTxt)>=0), 
    {viaggio:ore.viaggioTxt,arrivo:ore.arr,via:ore.viaTxt});
  t('l\'attesa non ripete l\'ora d\'arrivo',
    ore.attesaTxt.every(function(x){return x.indexOf('sul posto')<0;}), ore.attesaTxt);
  // con lo zoom le ore restano appese al minuto giusto
  await p.evaluate(()=>plZoom(-1));await p.waitForTimeout(300);
  const ore2=await p.evaluate(()=>{
    var n=document.querySelector('.plora.plofin');
    return {m0:+n.getAttribute('data-m0'), testo:n.textContent};});
  t('ogni ora è ancorata al suo minuto (si sposta con lo zoom)',
    ore2.m0>0&&ore2.testo.indexOf(('0'+Math.floor(ore2.m0/60)).slice(-2)+':'+('0'+(ore2.m0%60)).slice(-2))>=0, ore2);
  // catena stretta: il viaggio si mangia tutto il buco, l'attesa è zero.
  // Era il caso in cui l'ora d'arrivo non compariva mai — proprio quando serve.
  const stretta=await p.evaluate(()=>{
    var A=DATA.services.filter(function(s){return s.veicolo==='Vito 1';})
      .sort(function(x,y){return x.startMin-y.startMin;})[0];
    var B=JSON.parse(JSON.stringify(A));
    B.id='STRETTO'; B.startMin=A.endMin+40; B.durMin=60; B.endMin=B.startMin+60;
    B.time=('0'+Math.floor(B.startMin/60)).slice(-2)+':'+('0'+(B.startMin%60)).slice(-2);
    B.nome='Subito dopo'; B.da='Ostuni'; B.per='Bari';
    DATA.services=DATA.services.filter(function(s){return s.veicolo!=='Vito 1'||s.id===A.id;});
    DATA.services.push(B);
    DATA.transfers[A.id+'->'+B.id]={min:40,buffer:15,km:28};   // viaggio = tutto il buco
    _BYID_SRC=null; PL_ARM=null; render();
    var lane=[].slice.call(document.querySelectorAll('.pllane')).filter(function(l){
      return l.getAttribute('data-v')==='Vito 1';})[0];
    var arr=lane.querySelector('.plora.plarr');
    var blocco=[].slice.call(lane.querySelectorAll('.plblk')).filter(function(n){
      return n.getAttribute('data-id')==='STRETTO';})[0];
    return {attesa:lane.querySelectorAll('.plgatt').length,
            testo:arr?arr.textContent:null,
            atteso:fmtMin(A.endMin+40),
            dentro:!!(arr&&blocco&&arr.getBoundingClientRect().right<=blocco.getBoundingClientRect().left+1)};});
  t('catena stretta: nessuna attesa da disegnare', stretta.attesa===0, stretta);
  t('ma l\'ora d\'arrivo si vede lo stesso',      !!stretta.testo&&stretta.testo.indexOf(stretta.atteso)>=0, stretta);
  t('appoggiata al blocco che segue, senza coprirlo', stretta.dentro, stretta);
  await p.evaluate(()=>{PEND={};load();});await p.waitForTimeout(300);

  // il caso della bugia: il tragitto è più lungo del buco. L'ora d'arrivo deve restare
  // quella vera (fine + tragitto), non essere schiacciata sull'inizio del servizio dopo
  const bugia=await p.evaluate(()=>{
    var A=DATA.services.filter(function(s){return s.veicolo==='Vito 1';})
      .sort(function(x,y){return x.startMin-y.startMin;})[0];
    var B=JSON.parse(JSON.stringify(A));
    B.id='TARDI'; B.startMin=A.endMin+30; B.durMin=60; B.endMin=B.startMin+60;
    B.time=('0'+Math.floor(B.startMin/60)).slice(-2)+':'+('0'+(B.startMin%60)).slice(-2);
    B.nome='Non ci arriva'; B.da='Matera'; B.per='Bari';
    DATA.services=DATA.services.filter(function(s){return s.veicolo!=='Vito 1'||s.id===A.id;});
    DATA.services.push(B);
    DATA.transfers[A.id+'->'+B.id]={min:75,buffer:15,km:60};   // 75' di strada in 30' di buco
    _BYID_SRC=null; PL_ARM=null; render();
    var lane=[].slice.call(document.querySelectorAll('.pllane')).filter(function(l){
      return l.getAttribute('data-v')==='Vito 1';})[0];
    var arr=lane.querySelector('.plora.plarr');
    return {testo:arr?arr.textContent:null, rossa:!!(arr&&/pltardi/.test(arr.className)),
            vero:fmtMin(A.endMin+75), finto:fmtMin(B.startMin), ritardo:fmtDur(45),
            barra:lane.querySelectorAll('.plgatt').length};});
  t('con un tragitto più lungo del buco l\'ora d\'arrivo resta quella vera',
    !!bugia.testo&&bugia.testo.indexOf(bugia.vero)>=0&&bugia.testo.indexOf(bugia.finto)<0, bugia);
  t('e dice di quanto è in ritardo',       bugia.testo.indexOf(bugia.ritardo)>=0, bugia);
  t('scritta in rosso, non in verde',      bugia.rossa, bugia);
  t('e non disegna un\'attesa che non c\'è', bugia.barra===0, bugia);
  await p.evaluate(()=>{PEND={};load();});await p.waitForTimeout(300);

  // sul telefono la giornata sta in 390px: le scritte si accorciano invece di sparire
  await p.close();p=await nuova(390,844);
  await p.evaluate(PLSEED);await p.waitForTimeout(350);
  const oreTel=await p.evaluate(()=>({
    blocchi:document.querySelectorAll('.plblk').length,
    fine:[].slice.call(document.querySelectorAll('.plora.plofin')).map(function(n){return n.textContent;}),
    arr:[].slice.call(document.querySelectorAll('.plora.plarr')).map(function(n){return n.textContent;}),
    dentro:[].slice.call(document.querySelectorAll('.plora')).every(function(n){
      var r=n.getBoundingClientRect(), l=n.parentNode.getBoundingClientRect();
      return r.top>=l.top-1&&r.bottom<=l.bottom+1;}),
    ov:document.documentElement.scrollWidth-document.documentElement.clientWidth}));
  t('anche sul telefono ogni servizio ha le sue ore',
    oreTel.fine.length===oreTel.blocchi&&oreTel.blocchi>0, oreTel);
  t('e almeno un arrivo, magari in forma corta', oreTel.arr.length>0, oreTel);
  t('le scritte restano dentro la corsia',       oreTel.dentro, oreTel);
  t('e non allargano la pagina',                 oreTel.ov<=2, oreTel.ov);

  console.log('\n=== 9nonies. PLANCIA sul telefono: il vassoio si vede subito ===');
  await p.evaluate(()=>{PL_ARM=null;PEND={};render();});await p.waitForTimeout(250);
  const vt=await p.evaluate(()=>{
    var tr=document.querySelector('.pltray').getBoundingClientRect();
    var gr=document.querySelector('.plwrap').getBoundingClientRect();
    var ti=[].slice.call(document.querySelectorAll('.pltile')).map(function(n){var r=n.getBoundingClientRect();
      return {top:Math.round(r.top),left:Math.round(r.left),w:Math.round(r.width)};});
    return {trayTop:Math.round(tr.top),trayBot:Math.round(tr.bottom),grigliaTop:Math.round(gr.top),
            vh:window.innerHeight,tiles:ti,
            ov:document.documentElement.scrollWidth-document.documentElement.clientWidth};});
  t('il vassoio sta sopra le corsie, non in fondo alla pagina', vt.trayBot<=vt.grigliaTop+1, vt);
  t('e si vede senza scorrere',                                vt.trayTop<vt.vh-60, vt);
  t('i servizi da assegnare sono in fila, si scorrono di lato',
    vt.tiles.length>1&&vt.tiles[0].top===vt.tiles[1].top&&vt.tiles[1].left>vt.tiles[0].left, vt.tiles);
  t('nessuno scroll orizzontale della pagina',                 vt.ov<=2, vt.ov);
  // armato un servizio la striscia si richiude e le corsie salgono
  await p.evaluate(()=>plArma(DATA.services.filter(s=>!s.veicolo)[0].id));await p.waitForTimeout(300);
  const va=await p.evaluate(()=>({
    ridotto:document.querySelector('.pltray').className.indexOf('plridotto')>=0,
    listaVisibile:getComputedStyle(document.querySelector('.pltiles')).display!=='none',
    riapri:!!document.querySelector('.plriapri'),
    grigliaTop:Math.round(document.querySelector('.plwrap').getBoundingClientRect().top)}));
  t('scelto un servizio, la striscia si richiude', va.ridotto&&!va.listaVisibile, va);
  t('e le corsie guadagnano spazio',              va.grigliaTop<vt.grigliaTop, {prima:vt.grigliaTop,dopo:va.grigliaTop});
  t('resta il modo di riaprire l\'elenco',        va.riapri, va);
  await p.evaluate(()=>document.querySelector('.plriapri').click());await p.waitForTimeout(300);
  t('riaprendolo i servizi tornano in fila',
    await p.evaluate(()=>PL_ARM===null&&document.querySelectorAll('.pltile').length>0
      &&getComputedStyle(document.querySelector('.pltiles')).display!=='none'), null);
  // sul desktop il vassoio resta la colonna di destra, come prima
  await p.close();p=await nuova(1440,1000);
  await p.evaluate(PLSEED);await p.waitForTimeout(300);
  const vd=await p.evaluate(()=>{
    var tr=document.querySelector('.pltray').getBoundingClientRect();
    var gr=document.querySelector('.plwrap').getBoundingClientRect();
    return {trayL:Math.round(tr.left),trayT:Math.round(tr.top),grR:Math.round(gr.right),grT:Math.round(gr.top),
            tileW:Math.round((document.querySelector('.pltile')||{getBoundingClientRect:()=>({width:0})}).getBoundingClientRect().width)};});
  t('sul desktop il vassoio è ancora a destra della plancia', vd.trayL>=vd.grR-1&&Math.abs(vd.trayT-vd.grT)<=2, vd);
  await p.close();p=await nuova(390,844);
  await p.evaluate(PLSEED);await p.waitForTimeout(300);

  console.log('\n=== 9undecies. PLANCIA: lo zoom da Mac, da telefono e da tastiera ===');
  await p.close();p=await nuova(1400,800);
  await p.evaluate(PLSEED);await p.waitForTimeout(300);
  await p.evaluate(()=>{plSetPx(0);render();});await p.waitForTimeout(250);
  // 1. lo zoom resta ancorato al punto che guardi
  const anc=await p.evaluate(()=>{
    var box=document.getElementById('plscroll');
    var x=box.getBoundingClientRect().left+400;
    var prima=(box.scrollLeft+400-PL_RAIL_W)/plPx(plScala());
    plZoom(1,x);
    var dopo=(document.getElementById('plscroll').scrollLeft+400-PL_RAIL_W)/plPx(plScala());
    return {prima:Math.round(prima),dopo:Math.round(dopo),px:plPx(plScala())};});
  t('ingrandendo, il minuto sotto il puntatore resta lì', Math.abs(anc.prima-anc.dopo)<=1, anc);
  // 2. tastiera: + − 0
  const t0=await p.evaluate(()=>{plSetPx(0);render();return plPx(plScala());});
  await p.keyboard.press('+');await p.waitForTimeout(200);
  const t1=await p.evaluate(()=>plPx(plScala()));
  await p.keyboard.press('-');await p.waitForTimeout(200);
  const t2=await p.evaluate(()=>plPx(plScala()));
  await p.keyboard.press('+');await p.keyboard.press('+');await p.waitForTimeout(250);
  await p.keyboard.press('0');await p.waitForTimeout(250);
  const t3=await p.evaluate(()=>({px:plPx(plScala()),libero:PL_PX}));
  t('+ ingrandisce, − riduce',        t1>t0*1.4&&Math.abs(t2-t0)<0.01, {t0:t0,t1:t1,t2:t2});
  t('0 rimette «adatta»',             t3.libero===0&&Math.abs(t3.px-t0)<0.01, t3);
  // i tasti non devono rubare la scrittura nei campi
  const campo=await p.evaluate(()=>{
    var i=document.createElement('input');i.id='provaZoom';document.body.appendChild(i);i.focus();
    return plPx(plScala());});
  await p.keyboard.press('+');await p.waitForTimeout(200);
  t('mentre scrivi in un campo lo zoom non si muove',
    Math.abs(await p.evaluate(()=>plPx(plScala()))-campo)<0.01, null);
  await p.evaluate(()=>{var i=document.getElementById('provaZoom');i.blur();i.remove();});
  // 3. Mac: il pinch del trackpad arriva come rotella con ctrl
  const w0=await p.evaluate(()=>{plSetPx(0);render();return plPx(plScala());});
  const wev=await p.evaluate(()=>{
    var b=document.getElementById('plscroll');
    var e=new WheelEvent('wheel',{deltaY:-120,ctrlKey:true,bubbles:true,cancelable:true,
      clientX:b.getBoundingClientRect().left+300,clientY:b.getBoundingClientRect().top+60});
    b.dispatchEvent(e);
    return {bloccato:e.defaultPrevented};});
  await p.waitForTimeout(300);
  const w1=await p.evaluate(()=>plPx(plScala()));
  t('il pinch del trackpad ingrandisce la plancia', w1>w0, {prima:w0,dopo:w1});
  t('e non lascia zoomare tutta la pagina',         wev.bloccato, wev);
  const w2=await p.evaluate(()=>{
    var b=document.getElementById('plscroll');
    b.dispatchEvent(new WheelEvent('wheel',{deltaY:-120,bubbles:true,cancelable:true}));
    return plPx(plScala());});
  t('la rotella liscia invece scorre e basta',      Math.abs(w2-w1)<0.001, {w1:w1,w2:w2});
  // 4. sul telefono tutti i bottoni della barra si vedono, senza scorrimenti nascosti
  await p.close();p=await nuova(390,844);
  await p.evaluate(PLSEED);await p.waitForTimeout(300);
  const bar390=await p.evaluate(()=>{
    var bar=document.querySelector('.plbar'), figli=[].slice.call(bar.children);
    return {n:figli.length,
      dentro:figli.every(function(n){var r=n.getBoundingClientRect();
        return r.right<=window.innerWidth+1&&r.left>=-1;}),
      righe:figli.map(function(n){return Math.round(n.getBoundingClientRect().top);})
        .filter(function(v,i,a){return a.indexOf(v)===i;}).length,
      hint:(document.querySelector('.plhint')||{textContent:''}).textContent};});
  t('a 390px si vedono tutti i bottoni della barra', bar390.dentro&&bar390.n>=4, bar390);
  t('vanno a capo invece di nascondersi di lato',    bar390.righe>1, bar390);
  t('e il telefono sa che si zooma con due dita',    /due dita/.test(bar390.hint), bar390.hint);
  // 5. sullo schermo grande la plancia si prende tutta la finestra, e le scritte crescono
  await p.close();p=await nuova(1900,900);
  await p.evaluate(PLSEED);await p.waitForTimeout(350);
  const mac=await p.evaluate(()=>{
    var m=document.querySelector('main').getBoundingClientRect();
    var ore=document.querySelector('.plora'), gap=document.querySelector('.plgap i');
    return {main:Math.round(m.width), vp:window.innerWidth,
            ore:parseFloat(getComputedStyle(ore).fontSize),
            gap:gap?parseFloat(getComputedStyle(gap).fontSize):0,
            ov:document.documentElement.scrollWidth-document.documentElement.clientWidth};});
  t('a 1900px la plancia usa tutta la finestra', mac.main>=mac.vp-40, mac);
  // blocchi più alti, e il nome del cliente nella fascia quando il blocco è stretto
  const grande=await p.evaluate(()=>{
    var h=Math.round(document.querySelector('.plblk').getBoundingClientRect().height);
    var stretti=[].slice.call(document.querySelectorAll('.plblk')).filter(function(n){
      return n.getBoundingClientRect().width<74;});
    var fascia=[].slice.call(document.querySelectorAll('.plora.plofin')).map(function(n){return n.textContent;}).join(' | ');
    var nomiFuori=stretti.filter(function(n){
      var s=DATA.services.filter(function(x){return x.id===n.getAttribute('data-id');})[0];
      return s&&fascia.indexOf(s.nome||s.da)>=0;});
    return {h:h, stretti:stretti.length, conNome:nomiFuori.length, fascia:fascia.slice(0,80)};});
  t('i blocchi sono più alti sullo schermo grande', grande.h>=44, grande);
  t('e il nome esce nella fascia quando il blocco è stretto',
    grande.stretti===0||grande.conNome>0, grande);
  // viaggio e attesa devono sembrare due cose diverse
  const barre=await p.evaluate(()=>{
    var v=document.querySelector('.plgvia'), a=document.querySelector('.plgatt');
    if(!v||!a)return null;
    var sv=getComputedStyle(v), sa=getComputedStyle(a);
    return {viaggio:sv.backgroundImage.slice(0,30), attesa:sa.backgroundImage.slice(0,30),
            bordoV:sv.boxShadow!=='none', bordoA:sa.boxShadow!=='none',
            hV:Math.round(v.getBoundingClientRect().height)};});
  t('il viaggio è righe, l\'attesa è liscia',
    !!barre&&barre.viaggio!==barre.attesa&&barre.viaggio.indexOf('gradient')>=0, barre);
  t('e tutte e due hanno un bordo che le stacca', !!barre&&barre.bordoV&&barre.bordoA, barre);
  t('e le scritte non sono più da telefono',    mac.ore>=11&&mac.gap>=11, mac);
  t('senza far scorrere la pagina di lato',     mac.ov<=2, mac.ov);
  // le altre schede restano incolonnate, non si allargano
  const altre=await p.evaluate(()=>{setTab('servizi');render();
    return Math.round(document.querySelector('main').getBoundingClientRect().width);});
  t('le altre schede restano larghe come prima', altre<mac.main-100, {plancia:mac.main,servizi:altre});
  await p.evaluate(()=>setTab('plancia'));await p.waitForTimeout(250);

  console.log('\n=== 9duodecies. PLANCIA dalla parte degli autisti ===');
  await p.close();p=await nuova(1600,900);
  await p.evaluate(PLSEED);await p.waitForTimeout(300);
  await p.evaluate(()=>{PEND={};PL_ARM=null;setPlVista('autisti');});await p.waitForTimeout(400);
  const vA=await p.evaluate(()=>({
    vista:PL_VISTA, chiave:plChiave(),
    righe:[].slice.call(document.querySelectorAll('.pllane[data-v]')).map(function(l){return l.getAttribute('data-v');}),
    autisti:DATA.autisti.map(function(a){return a.nome;}),
    pennello:document.querySelectorAll('.plautc').length,
    tray:document.querySelector('.pltray h4').textContent.replace(/\s+/g,' ').trim(),
    senzaAut:DATA.services.filter(function(s){return !s.autista&&s.startMin>=0&&!isCanc(s);}).length}));
  t('una corsia per autista',      vA.chiave==='autista'&&vA.autisti.every(function(n){return vA.righe.indexOf(n)>=0;}), vA);
  t('il pennello sparisce: qui l\'autista è già la riga', vA.pennello===0, vA);
  t('nel vassoio i servizi senza AUTISTA',
    vA.tray.indexOf(String(vA.senzaAut))>=0&&vA.senzaAut>0, vA);
  // i blocchi dicono il mezzo, non l'autista (quello è la corsia)
  const bl=await p.evaluate(()=>{
    var lane=[].slice.call(document.querySelectorAll('.pllane[data-v]')).filter(function(l){
      return l.getAttribute('data-v')==='Marco Rossi';})[0];
    var n=lane?lane.querySelector('.plblk b'):null;
    var s=n?DATA.services.filter(function(x){return x.id===n.parentNode.getAttribute('data-id');})[0]:null;
    return {testo:n?n.textContent:'', vei:s?s.veicolo:'', aut:s?s.autista:''};});
  t('dentro il blocco c\'è il mezzo, non chi guida',
    !!bl.vei&&bl.testo.indexOf(bl.vei)>=0&&bl.testo.indexOf(bl.aut)<0, bl);
  // assegnare da qui mette l'AUTISTA (e il suo mezzo se il servizio non ne ha)
  const asg=await p.evaluate(()=>{
    var s=DATA.services.filter(function(x){return !x.autista&&x.startMin>=0;})[0];
    var prima={aut:s.autista,vei:s.veicolo};
    plSposta(s,'Luca Verdi');
    var d=DATA.services.filter(function(x){return x.id===s.id;})[0];
    return {prima:prima, aut:d.autista, vei:d.veicolo, pend:PEND[s.id]};});
  t('assegnando dalla corsia si mette l\'autista', asg.aut==='Luca Verdi'&&asg.pend.autista==='Luca Verdi', asg);
  t('e il mezzo lo porta dietro lui',              !asg.prima.vei||asg.vei===asg.prima.vei, asg);
  t('tutto in sospeso, niente sul foglio',         !!asg.pend, asg);
  // le catene sono quelle dell'autista: attese e arrivi si ricalcolano su di lui
  const catA=await p.evaluate(()=>{
    var lane=[].slice.call(document.querySelectorAll('.pllane[data-v]')).filter(function(l){
      return l.getAttribute('data-v')==='Marco Rossi';})[0];
    var giro=giroDi('Marco Rossi',null);
    var c=giro.length>1?plCatenaAutista(giro[1],'Marco Rossi'):null;
    return {barre:lane?lane.querySelectorAll('.plgap').length:0,
            chiave:c?c.chiave:null, daDove:c&&c.daDove!=='garage'?c.daDove.id:c&&c.daDove};});
  t('le attese sono quelle del giro dell\'autista', catA.chiave==='autista', catA);
  t('e le barre fra un servizio e l\'altro ci sono', catA.barre>0, catA);
  // si torna dalla parte dei mezzi e tutto è com'era
  await p.evaluate(()=>{PEND={};setPlVista('mezzi');});await p.waitForTimeout(300);
  const back=await p.evaluate(()=>({vista:PL_VISTA,
    righe:[].slice.call(document.querySelectorAll('.pllane[data-v]')).map(function(l){return l.getAttribute('data-v');}),
    veicoli:DATA.veicoli.map(function(v){return v.nome;}),
    pennello:document.querySelectorAll('.plautc').length}));
  t('tornando ai mezzi le corsie sono i veicoli',
    back.veicoli.every(function(n){return back.righe.indexOf(n)>=0;})&&back.pennello>0, back);
  // e la scelta si ricorda fra una sessione e l'altra
  t('la vista scelta resta in memoria',
    await p.evaluate(()=>{setPlVista('autisti');var v=localStorage.getItem('te_plvista');setPlVista('mezzi');
      return v==='autisti'&&localStorage.getItem('te_plvista')==='mezzi';}), null);
  await p.evaluate(()=>{PEND={};load();});await p.waitForTimeout(300);

  console.log('\n=== 9terdecies. La barra in fondo: solo le schede che si usano ===');
  await p.close();p=await nuova(1400,900);
  await p.evaluate(SEED);await p.waitForTimeout(300);
  const tabs=await p.evaluate(()=>({
    visibili:[].slice.call(document.querySelectorAll('.tabs button')).map(function(b){return b.id;}),
    testo:document.querySelector('.tabs').textContent.replace(/\s+/g,' ').trim()}));
  t('in barra restano Servizi, Plancia e Rent',
    tabs.visibili.join(',')==='tabS,tabP,tabR', tabs);
  // le schede tolte dalla barra devono restare aperte da codice, senza errori
  const nascoste=await p.evaluate(()=>{
    var out={};
    ['assegna','flotta','timeline'].forEach(function(x){
      try{ setTab(x); out[x]=(document.getElementById('main').innerHTML||'').length>50; }
      catch(e){ out[x]='ERRORE: '+e.message; }});
    setTab('servizi');
    return out;});
  t('e restano apribili da codice, senza rompere niente',
    nascoste.assegna===true&&nascoste.flotta===true&&nascoste.timeline===true, nascoste);

  console.log('\n=== 7. Tutte le larghezze, tutte le schede ===');
  await p.close();
  for(const [w,h] of [[1920,1080],[1440,900],[1024,768],[768,900],[390,844]]){
    const q=await nuova(w,h);await q.evaluate(SEED);
    for(const due of [false,true])for(const ord of ['orario','autista','mezzo','fornitore','scoperti']){
      await q.evaluate(a=>{setDue(a[0]);setOrd(a[1]);},[due,ord]);await q.waitForTimeout(90);
      const ov=await q.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
      if(ov>2)errs.push(`[${w}px] overflow ${ov}px (due=${due} ord=${ord})`);
    }
    for(const tab of ['assegna','plancia','flotta','timeline','rent','servizi']){await q.evaluate(x=>setTab(x),tab);await q.waitForTimeout(90);
      const ov=await q.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
      if(ov>2)errs.push(`[${w}px] overflow ${ov}px (tab=${tab})`);}
    for(const vista of ['coda','giri']){
      await q.evaluate(v=>{setTab('assegna');setAssVista(v);},vista);await q.waitForTimeout(90);
      const ov=await q.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
      if(ov>2)errs.push(`[${w}px] overflow ${ov}px (assegna=${vista})`);
      const vuoto=await q.evaluate(()=>{
        var c=document.querySelector('.coda'),g=document.querySelector('.giri');
        return !(c&&c.offsetParent!==null)&&!(g&&g.offsetParent!==null);});
      if(vuoto)errs.push(`[${w}px] nessuna delle due colonne visibile (assegna=${vista})`);
    }
    await q.evaluate(()=>{setTab('servizi');openModal(0);});await q.waitForTimeout(150);
    const md=await q.evaluate(()=>document.getElementById('modal').style.display);
    if(md!=='block')errs.push(`[${w}px] la modale non si apre`);
    await q.evaluate(()=>closeModal());
    await q.close();
  }
  t('nessun errore JS e nessuno scroll orizzontale su 5 larghezze × 10 combinazioni', errs.length===0, errs.slice(0,6));

  await b.close();
  bilancio();
})();
