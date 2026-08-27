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
    // 1. servizio senza autista e senza mezzo → prende l'ultimo autista di quel mezzo
    var s=DATA.services.filter(x=>!x.veicolo&&!x.autista)[0];
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

  await p.evaluate(()=>plPosa());await p.waitForTimeout(200);
  t('«posa» lascia il pennello',
    await p.evaluate(()=>PL_PENNA===null&&!document.querySelector('.plarmp')), null);
  await p.evaluate(()=>{PEND={};load();});await p.waitForTimeout(200);

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
  await p.evaluate(i=>{DATA.services.filter(x=>x.id===i)[0].allert='';PEND={};render();},ca0.id);
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
