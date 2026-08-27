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
