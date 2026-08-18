/* Screenshot della app con dati finti. Uso:
     node tools/screenshot.js                     → tutte le schede a 1440px e 390px
     node tools/screenshot.js flotta 1440         → una sola scheda a una larghezza
   I file finiscono in shots/. */
const {apriBrowser,PREVIEW,ROOT}=require('../test/_lib');
const path=require('path'),fs=require('fs');
(async()=>{
  const tab=process.argv[2],w=+process.argv[3];
  const combos=tab?[[tab,w||1440]]:[['servizi',1440],['assegna',1440],['flotta',1440],['timeline',1440],
                                    ['rent',1440],['servizi',390],['assegna',390],['flotta',390]];
  fs.mkdirSync(path.join(ROOT,'shots'),{recursive:true});
  const b=await apriBrowser();
  for(const [t,larg] of combos){
    const p=await b.newPage({viewport:{width:larg,height:larg>800?1600:1800},deviceScaleFactor:2});
    p.on('pageerror',e=>console.log('❌ errore JS:',e.message));
    await p.goto(PREVIEW);await p.waitForTimeout(500);
    await p.evaluate(x=>setTab(x),t);await p.waitForTimeout(300);
    const f=path.join(ROOT,'shots',`${larg}-${t}.png`);
    await p.screenshot({path:f});
    console.log('→ shots/'+path.basename(f));
    await p.close();
  }
  await b.close();
})();
