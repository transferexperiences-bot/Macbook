/* Utilità comuni ai test. Nessuna dipendenza obbligatoria tranne Playwright
   per i test che aprono davvero la app in un browser. */
const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');

function leggi(rel){return fs.readFileSync(path.join(ROOT,rel),'utf8');}

/* Carica il backend Apps Script in Node con gli oggetti Google finti. */
function caricaBackend(){
  const src=leggi('src/Code.gs');
  const ctx={
    Utilities:{formatDate:(d)=>{const p=n=>(n<10?'0':'')+n;return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}},
    CacheService:{getScriptCache:()=>({get:()=>null,put:()=>{}})},
    SpreadsheetApp:{},Maps:{},UrlFetchApp:{},LockService:{},PropertiesService:{},HtmlService:{}
  };
  Object.assign(global,ctx);
  const fn=new Function(src+'\nreturn this;');
  // eval nel contesto globale: le funzioni top-level restano raggiungibili
  eval(src.replace(/^\/\*\*[\s\S]*?\*\//,''));
  const out={};
  ['normLuogo_','stessoLuogo_','driveTime_','stimaMin_','parseEuro_','indisponibileIn_',
   'riposoIn_','haversine_','normDate','toMin','isoToItalian','addDaysISO','lookupCoords_',
   'isCancRow_']
    .forEach(n=>{try{out[n]=eval(n);}catch(e){}});
  return out;
}

/* Carica il JS della web app in Node, senza il blocco di avvio. */
function caricaFrontend(){
  const html=leggi('src/Index.html');
  let js=html.match(/<script>([\s\S]*?)<\/script>/)[1].replace('<?!= boot ?>','null');
  js=js.slice(0,js.indexOf('/* avvio veloce'));
  const stub={value:'',style:{},focus(){},innerHTML:'',className:'',textContent:'',setAttribute(){}};
  global.document={getElementById:()=>stub,body:{setAttribute(){}},querySelectorAll:()=>[],
    querySelector:()=>null,addEventListener(){},createElement:()=>stub};
  global.localStorage={getItem:()=>null,setItem(){}};
  global.window={innerWidth:1440,addEventListener(){}};
  eval(js);
  const out={};
  ['trf','conflict','availability','bestFor','bestVeicoloFor','suggest','stessoLuogoUI',
   'normLuogoUI','garageInfo','statoDi','eur','fmtDur','fmtMin','isDone','isCanc','cancInNote',
   'servizioVisibile','colorOf','colorOfVeicolo',
   'giroDi','valutaAutista','autistiInServizio','punteggioAutista',
   'finestraInizio','giudizioMargine','catenaDi','trattaFra','catenaIpotesi',
   'plCatena','plCatenaAutista','oreAutista','plUltimoAutista','srvDi']
    .forEach(n=>{try{out[n]=eval(n);}catch(e){}});
  out.setDATA=(d)=>{eval('DATA=d;_BYID_SRC=null;');};
  return out;
}

/* Avvia Chromium. In cloud usa il binario preinstallato, in locale quello di Playwright. */
async function apriBrowser(){
  let chromium;
  for(const m of ['playwright','@playwright/test','playwright-core']){
    try{chromium=require(m).chromium;break;}catch(e){}
  }
  if(!chromium)throw new Error('Playwright non installato. Esegui: npm i -D playwright && npx playwright install chromium');
  const exe=process.env.PW_CHROMIUM||(fs.existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':undefined);
  return chromium.launch(exe?{executablePath:exe}:{});
}
const PREVIEW='file://'+path.join(ROOT,'preview.html');

/* Mini test runner */
let ok=0,ko=0;
const t=(nome,cond,extra)=>{
  console.log((cond?'  ok   ':'  FAIL ')+nome+(extra!==undefined?'  → '+JSON.stringify(extra):''));
  cond?ok++:ko++;
};
const eq=(nome,got,exp)=>t(nome,JSON.stringify(got)===JSON.stringify(exp),got);
const sezione=(s)=>console.log('\n=== '+s+' ===');
const bilancio=()=>{console.log('\n=== '+ok+' ok, '+ko+' falliti ===');process.exit(ko?1:0);};

module.exports={ROOT,leggi,caricaBackend,caricaFrontend,apriBrowser,PREVIEW,t,eq,sezione,bilancio};
