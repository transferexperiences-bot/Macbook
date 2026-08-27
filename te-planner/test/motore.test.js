/* Motore di disponibilità lato app (src/Index.html): trasferimenti, conflitti,
   candidato autista e candidato mezzo. Include il caso segnalato in produzione:
   consegna in aeroporto e ritiro nello stesso aeroporto. */
const {caricaFrontend,eq,t,sezione,bilancio}=require('./_lib');
const F=caricaFrontend();

const srv=o=>Object.assign({id:'X',pax:2,nome:'',fornitore:'',volo:'',autista:'',veicolo:'',
  note:'',stato:'',allert:'',tariffa:'',cell:'',wa:'',hextra:'',modalita:'',acconto:'',
  durSrc:'cache',rientroMin:20},o);

const A=srv({id:'A',time:'08:00',startMin:480,durMin:120,endMin:600,
  da:'Polignano a Mare',per:'Aeroporto di Bari',autista:'Marco Rossi',veicolo:'Vito 1'});
const B=srv({id:'B',time:'10:00',startMin:600,durMin:60,endMin:660,da:'Apt Bari',per:'Ostuni'});

const base={date:'2026-07-30',today:'2026-07-30',weekday:'giovedì',nowMin:-1,bufferDefault:15,
  services:[A,B],
  transfers:{'A->B':{min:10,buffer:10},'B->A':{min:10,buffer:10}},   // cache vecchia, sbagliata
  autisti:[{nome:'Marco Rossi',categoria:'Fisso',stato:'ON',esclusoMotivo:''},
           {nome:'Luca Verdi',categoria:'Extra',stato:'ON',esclusoMotivo:''}],
  veicoli:[{nome:'Vito 1',tipo:'Minivan',pax:8,fuoriServizio:false,inRent:false,stato:'ON'},
           {nome:'Panda',tipo:'Auto',pax:3,fuoriServizio:false,inRent:false,stato:'ON'},
           {nome:'Sprinter',tipo:'Bus',pax:16,fuoriServizio:true,inRent:false,stato:'FUORI SERVIZIO'}],
  rents:[],prossimi:[],luoghiNomi:[],fornitori:[],base:'Polignano a Mare'};
F.setDATA(base);

sezione('Consegna in aeroporto → ritiro nello stesso aeroporto');
eq('trf ignora la cache vecchia', F.trf('A','B'), {min:0,buffer:0});
eq('nessun conflitto: l\'autista è già lì', F.conflict(A,B), null);
eq('Marco risulta disponibile', F.availability(base.autisti,s=>s.autista,B)['Marco Rossi'], null);
const bf=F.bestFor(B);
eq('candidato proposto',  bf&&bf.nome, 'Marco Rossi');
eq('motivo: attesa zero', bf&&bf.reason, 'arriva da Aeroporto di Bari, attesa 0m');

sezione('Controprova: aeroporti diversi restano in conflitto');
const B2=srv({id:'B',time:'10:00',startMin:600,durMin:60,endMin:660,da:'Aeroporto di Brindisi',per:'Ostuni'});
F.setDATA(Object.assign({},base,{services:[A,B2],transfers:{'A->B':{min:90,buffer:15}}}));
eq('trf usa la tratta vera', F.trf('A','B'), {min:90,buffer:15});
eq('conflitto rilevato',     !!F.conflict(A,B2), true);

sezione('Candidato mezzo');
F.setDATA(Object.assign({},base,{services:[A,B],transfers:{'A->B':{min:10,buffer:10}}}));
B.autista='Marco Rossi';B.veicolo='';B.pax=2;
let bv=F.bestVeicoloFor(B);
eq('propone il mezzo che l\'autista ha già', bv&&bv.nome, 'Vito 1');
eq('motivo',                                 bv&&bv.reason, 'già con Marco Rossi oggi');
B.autista='';
eq('senza autista sceglie il più piccolo che basta', F.bestVeicoloFor(B).nome, 'Panda');
B.pax=6;
eq('con 6 pax la Panda (3 posti) è esclusa',         F.bestVeicoloFor(B).nome, 'Vito 1');
B.pax=20;
eq('con 20 pax non c\'è niente (Sprinter fuori servizio)', F.bestVeicoloFor(B), null);
B.pax=2;B.veicolo='Vito 1';
eq('se il mezzo c\'è già non propone nulla',          F.bestVeicoloFor(B), null);

sezione('Stato flotta');
// gli stati "occupato/libero" esistono solo se la giornata mostrata è oggi (nowMin >= 0)
F.setDATA(Object.assign({},base,{nowMin:540}));   // 09:00, dentro il servizio A (08:00-10:00)
const mine=[A];
eq('mezzo in servizio adesso = occupato',
   F.statoDi({item:{nome:'Vito 1'},cur:A,next:null,n:1,mine:mine},false).k, 'occ');
eq('mezzo senza servizi = libero',
   F.statoDi({item:{nome:'Panda'},cur:null,next:null,n:0,mine:[]},false).k, 'lib');
eq('mezzo fuori servizio = non disponibile',
   F.statoDi({item:{nome:'Sprinter',fuoriServizio:true},cur:null,next:null,n:0,mine:[]},false).k, 'off');
eq('mezzo a noleggio = non disponibile',
   F.statoDi({item:{nome:'Tuk',inRent:true},cur:null,next:null,n:0,mine:[]},false).k, 'off');
eq('autista con riposo fisso = non disponibile',
   F.statoDi({item:{nome:'X',esclusoMotivo:'Riposo fisso (giovedì)'},cur:null,next:null,n:0,mine:[]},true).k, 'off');

sezione('Rientro in garage');
eq('ora di rientro = fine ultimo servizio + rientroMin',
   F.garageInfo([srv({endMin:930,per:'Monopoli',rientroMin:25})]).at, 955);
eq('senza rientroMin non inventa nulla',
   F.garageInfo([srv({endMin:930,per:'Monopoli',rientroMin:undefined})]), null);

sezione('Importi lato app');
eq('eur("150.5")',   F.eur('150.5'), 150.5);
eq('eur("1.234,50")',F.eur('1.234,50'), 1234.5);
eq('eur("")',        F.eur(''), 0);

/* ============================================================================
   Chi consigliare: prima chi sta già lavorando.
   Difetto segnalato il 18/08: la app proponeva quasi sempre un autista fermo a casa
   invece di allungare il giro di chi era già fuori, perché la categoria ("Fisso")
   pesava 300 e "nessun servizio in giornata" solo 200.
   ============================================================================ */
sezione('Consiglio autista: prima chi è già in servizio');
const W=srv({id:'W',time:'07:00',startMin:420,durMin:90,endMin:510,
  da:'Polignano a Mare',per:'Monopoli',autista:'Nico Extra',veicolo:'Vito 1'});
const NEW=srv({id:'N',time:'11:00',startMin:660,durMin:60,endMin:720,da:'Monopoli',per:'Ostuni'});
const dueAutisti={date:'2026-08-18',today:'2026-08-18',weekday:'martedì',nowMin:-1,bufferDefault:15,
  services:[W,NEW],
  transfers:{'W->N':{min:0,buffer:0},'N->W':{min:0,buffer:0}},
  autisti:[{nome:'Nico Extra',categoria:'Extra',stato:'ON',esclusoMotivo:''},
           {nome:'Piero Fisso',categoria:'Fisso',stato:'ON',esclusoMotivo:''},
           {nome:'Ugo Riposo',categoria:'Fisso',stato:'ON',esclusoMotivo:'Riposo fisso (martedì)'}],
  veicoli:[{nome:'Vito 1',tipo:'Minivan',pax:8,fuoriServizio:false,inRent:false,stato:'ON'}],
  rents:[],prossimi:[],luoghiNomi:[],fornitori:[],base:'Polignano a Mare'};
F.setDATA(dueAutisti);
const cs=F.suggest(NEW,F.availability(dueAutisti.autisti,s=>s.autista,NEW),5);
eq('primo consigliato = quello che sta lavorando', cs[0]&&cs[0].nome, 'Nico Extra');
eq('ed è marcato come in servizio',                cs[0]&&cs[0].inServizio, true);
eq('chi oggi non lavora resta in fondo',           cs[1]&&cs[1].nome, 'Piero Fisso');
eq('e la riga lo dice',                            cs[1]&&cs[1].inServizio, false);
eq('chi è in riposo non viene proposto',           cs.filter(c=>c.nome==='Ugo Riposo').length, 0);
eq('bestFor sceglie lo stesso',                    (F.bestFor(NEW)||{}).nome, 'Nico Extra');
eq('conta i servizi in giornata',                  F.giroDi('Nico Extra',null).length, 1);
eq('autisti in servizio oggi',                     F.autistiInServizio().map(a=>a.nome), ['Nico Extra']);

sezione('Valutazione di un autista, servizio per servizio');
let v=F.valutaAutista(NEW,'Nico Extra');
eq('si aggancia al servizio precedente', v.k, 'ok');
eq('attesa calcolata al netto del trasferimento', v.attesaPrima, 150);
eq('lo dice a parole', v.txt, 'arriva da Monopoli, attesa 2h 30m');
v=F.valutaAutista(NEW,'Piero Fisso');
eq('chi non ha servizi = libero', v.k, 'libero');
eq('e il motivo è esplicito',      v.txt, 'oggi non ha servizi');
v=F.valutaAutista(NEW,'Ugo Riposo');
eq('riposo fisso = non disponibile', [v.k,v.txt], ['off','Riposo fisso (martedì)']);

sezione('Stacco lungo: in servizio oggi ma non è un incastro');
const LONTANO=srv({id:'L',time:'22:00',startMin:1320,durMin:60,endMin:1380,da:'Monopoli',per:'Bari'});
F.setDATA(Object.assign({},dueAutisti,{services:[W,LONTANO],
  transfers:{'W->L':{min:0,buffer:0},'L->W':{min:0,buffer:0}}}));
v=F.valutaAutista(LONTANO,'Nico Extra');
eq('oltre 4 ore di vuoto non è più \"allungare il giro\"', v.k, 'fermo');
t('e si legge quando ha staccato', /stacca alle 08:30/.test(v.txt), v.txt);
const cs2=F.suggest(LONTANO,F.availability(dueAutisti.autisti,s=>s.autista,LONTANO),5);
eq('resta comunque davanti a chi oggi non lavora', cs2[0].nome, 'Nico Extra');

sezione('Conflitto: non ci arriva');
const SOVRAP=srv({id:'S2',time:'08:00',startMin:480,durMin:60,endMin:540,da:'Bari',per:'Ostuni'});
F.setDATA(Object.assign({},dueAutisti,{services:[W,SOVRAP],
  transfers:{'W->S2':{min:40,buffer:15},'S2->W':{min:40,buffer:15}}}));
v=F.valutaAutista(SOVRAP,'Nico Extra');
eq('sovrapposizione = non ci arriva', v.k, 'no');
eq('e dice quando si libera',         v.freeAt, 565);
eq('un occupato non viene consigliato',
   F.suggest(SOVRAP,F.availability(dueAutisti.autisti,s=>s.autista,SOVRAP),5)
    .filter(c=>c.nome==='Nico Extra').length, 0);

sezione('Buco fra due servizi: si vede l\'incastro da tutte e due le parti');
const P1=srv({id:'P1',time:'08:00',startMin:480,durMin:60,endMin:540,da:'Polignano a Mare',per:'Monopoli',autista:'Nico Extra'});
const P2=srv({id:'P2',time:'14:00',startMin:840,durMin:60,endMin:900,da:'Ostuni',per:'Bari',autista:'Nico Extra'});
const DENTRO=srv({id:'D',time:'10:00',startMin:600,durMin:90,endMin:690,da:'Monopoli',per:'Ostuni'});
F.setDATA(Object.assign({},dueAutisti,{services:[P1,P2,DENTRO],
  transfers:{'P1->D':{min:0,buffer:0},'D->P2':{min:0,buffer:0},
             'P1->P2':{min:30,buffer:15},'D->P1':{min:0,buffer:0},'P2->D':{min:0,buffer:0},'P2->P1':{min:30,buffer:15}}}));
v=F.valutaAutista(DENTRO,'Nico Extra');
eq('incastro nel buco',        v.k, 'ok');
eq('attesa prima',             v.attesaPrima, 60);
eq('margine dopo',             v.margineDopo, 150);
eq('il lato più stretto',      v.vicino, 60);
eq('il tempo morto che conta è quello prima', v.vuoto, 60);

sezione('A parità, vince chi aspetta meno prima del servizio');
// Ordinare per il lato più stretto premiava i giri fragili: qui Tino ha 10 minuti di
// margine sul servizio dopo (rischioso) ma 3 ore di attesa prima; Gino ne ha 40 e 40.
const T1=srv({id:'T1',time:'06:00',startMin:360,durMin:60,endMin:420,da:'Bari',per:'Monopoli',autista:'Tino'});
const T2=srv({id:'T2',time:'12:10',startMin:730,durMin:60,endMin:790,da:'Monopoli',per:'Bari',autista:'Tino'});
const G1=srv({id:'G1',time:'08:20',startMin:500,durMin:60,endMin:560,da:'Bari',per:'Monopoli',autista:'Gino'});
const G2=srv({id:'G2',time:'12:40',startMin:760,durMin:60,endMin:820,da:'Monopoli',per:'Bari',autista:'Gino'});
const MEZZO=srv({id:'M',time:'10:00',startMin:600,durMin:120,endMin:720,da:'Monopoli',per:'Monopoli'});
const par={date:'2026-08-18',today:'2026-08-18',weekday:'martedì',nowMin:-1,bufferDefault:15,
  services:[T1,T2,G1,G2,MEZZO],transfers:{},
  autisti:[{nome:'Tino',categoria:'Fisso',stato:'ON',esclusoMotivo:''},
           {nome:'Gino',categoria:'Fisso',stato:'ON',esclusoMotivo:''}],
  veicoli:[],rents:[],prossimi:[],luoghiNomi:[],fornitori:[],base:'Polignano a Mare'};
F.setDATA(par);
eq('Tino: 3h ferme prima, 10 minuti dopo', [F.valutaAutista(MEZZO,'Tino').vuoto,F.valutaAutista(MEZZO,'Tino').k], [180,'stretto']);
eq('Gino: 40 e 40',                        [F.valutaAutista(MEZZO,'Gino').vuoto,F.valutaAutista(MEZZO,'Gino').k], [40,'ok']);
eq('consigliato Gino', F.suggest(MEZZO,F.availability(par.autisti,s=>s.autista,MEZZO),3)[0].nome, 'Gino');

/* ============================================================================
   Catene: cosa si rompe (o si libera) se sposto un servizio.
   Handoff "Plancia: catene e tempi quando sposti un servizio".
   ============================================================================ */
sezione('Finestra degli arrivi: atterraggio + bagagli');
const VOLO=srv({id:'V',time:'10:00',startMin:600,durMin:60,endMin:660,
  da:'Aeroporto di Bari',per:'Ostuni',volo:'FR8826'});
const VOLO2=srv({id:'V2',time:'10:00',startMin:600,durMin:60,endMin:660,
  da:'Apt Bari - Arrivi',per:'Ostuni',volo:'AZ1614'});
const NOVOLO=srv({id:'NV',time:'10:00',startMin:600,durMin:60,endMin:660,
  da:'Aeroporto di Bari',per:'Ostuni',volo:''});
const CITTA=srv({id:'C',time:'10:00',startMin:600,durMin:60,endMin:660,
  da:'Polignano a Mare',per:'Ostuni',volo:'FR8826'});
F.setDATA(Object.assign({},base,{services:[VOLO]}));
eq('volo + aeroporto → 20 minuti di tolleranza', F.finestraInizio(VOLO), 20);
eq('vale anche scritto \"Apt Bari - Arrivi\"',   F.finestraInizio(VOLO2), 20);
eq('aeroporto senza volo → nessuna tolleranza', F.finestraInizio(NOVOLO), 0);
eq('volo ma partenza in città → nessuna',       F.finestraInizio(CITTA), 0);
eq('giudizio: 25 minuti di margine',      F.giudizioMargine(25,0), 'ok');
eq('giudizio: 3 minuti = stretto',        F.giudizioMargine(3,0), 'stretto');
eq('giudizio: -12 senza finestra = rotto',F.giudizioMargine(-12,0), 'rotto');
eq('giudizio: -12 con i bagagli = ci sta',F.giudizioMargine(-12,20), 'finestra');
eq('giudizio: -25 oltre i bagagli = rotto',F.giudizioMargine(-25,20), 'rotto');

sezione('plCatena: da dove arriva il mezzo e con che margine');
// Vito 1: 08:00-10:00 finisce a Monopoli · si vuole metterci il servizio delle 11:00 da Ostuni
const M1=srv({id:'M1',time:'08:00',startMin:480,durMin:120,endMin:600,
  da:'Bari',per:'Monopoli',autista:'Marco',veicolo:'Vito 1'});
const M2=srv({id:'M2',time:'14:00',startMin:840,durMin:60,endMin:900,
  da:'Alberobello',per:'Bari',autista:'Marco',veicolo:'Vito 1'});
const SPOSTA=srv({id:'SP',time:'11:00',startMin:660,durMin:120,endMin:780,
  da:'Ostuni',per:'Matera',autista:'',veicolo:''});
const pl={date:'2026-08-18',today:'2026-08-18',weekday:'martedì',nowMin:-1,bufferDefault:15,
  services:[M1,M2,SPOSTA],
  transfers:{'M1->SP':{min:35,buffer:15},'SP->M2':{min:80,buffer:15},'M1->M2':{min:60,buffer:15}},
  autisti:[{nome:'Marco',categoria:'Fisso',stato:'ON',esclusoMotivo:''}],
  veicoli:[{nome:'Vito 1',tipo:'Minivan',pax:8,fuoriServizio:false,inRent:false,stato:'ON'},
           {nome:'Vito 2',tipo:'Minivan',pax:8,fuoriServizio:false,inRent:false,stato:'ON'}],
  rents:[],prossimi:[],luoghiNomi:[],fornitori:[],base:'Polignano a Mare'};
F.setDATA(pl);
let c=F.plCatena(SPOSTA,'Vito 1');
eq('viene da Monopoli',            c.daDove&&c.daDove.per, 'Monopoli');
eq('sul pick-up alle 10:35',       c.arrivo, 635);
eq('margine 10 minuti → stretto',  [c.margine,c.k], [10,'stretto']);
eq('il tempo è quello vero, non una stima', c.stima, false);
eq('a valle salta il servizio delle 14:00', c.aValle.length&&c.aValle[0].id, 'M2');
eq('e lo dice: diventa irraggiungibile',    c.aValle[0].diventa, 'rotto');
eq('mancano 35 minuti',                     c.aValle[0].ritardo, 35);
eq('mentre prima reggeva',                  c.aValle[0].era, 'ok');

sezione('Mezzo libero: parte dal garage, nessuna ora inventata');
c=F.plCatena(SPOSTA,'Vito 2');
eq('daDove = garage', c.daDove, 'garage');
eq('nessun orario di arrivo inventato', [c.arrivo,c.margine], [null,null]);
eq('e la piazzola resta verde', c.k, 'ok');

sezione('Sovrapposizione: si può forzare, ma è rosso');
const SOVR=srv({id:'SV',time:'11:30',startMin:690,durMin:60,endMin:750,
  da:'Bari',per:'Bari',autista:'Marco',veicolo:'Vito 2'});
F.setDATA(Object.assign({},pl,{services:[M1,M2,SPOSTA,SOVR]}));
c=F.plCatena(SPOSTA,'Vito 2');
eq('la sovrapposizione è elencata', c.sovrapposti.length&&c.sovrapposti[0].id, 'SV');
eq('e il verdetto è rosso',         c.k, 'rotto');

sezione('Cosa si libera sulla catena di partenza');
// SPOSTA è su Vito 2 e strozza il servizio dopo: portandolo via, quello respira
const STRETTA=srv({id:'ST',time:'11:00',startMin:660,durMin:120,endMin:780,
  da:'Ostuni',per:'Matera',autista:'',veicolo:'Vito 2'});
const DOPO=srv({id:'DP',time:'14:20',startMin:860,durMin:60,endMin:920,
  da:'Bari',per:'Monopoli',autista:'',veicolo:'Vito 2'});
const PRIMA=srv({id:'PR',time:'08:00',startMin:480,durMin:60,endMin:540,
  da:'Bari',per:'Bari',autista:'',veicolo:'Vito 2'});
F.setDATA(Object.assign({},pl,{services:[PRIMA,STRETTA,DOPO],
  transfers:{'ST->DP':{min:70,buffer:15},'PR->DP':{min:10,buffer:10},'PR->ST':{min:35,buffer:15}}}));
c=F.plCatena(STRETTA,'Vito 1');
eq('il servizio dopo si libera',      c.liberati.length&&c.liberati[0].id, 'DP');
eq('prima non ci arrivava',           c.liberati[0].era, 'rotto');
eq('e ora ci arriva comodo',          c.liberati[0].diventa, 'ok');
// 320 di margine nuovo (PRIMA chiude a Bari e DOPO parte da Bari: stesso luogo, 0 e 0)
// contro i 5 che mancavano prima
eq('guadagno in minuti',              c.liberati[0].guadagno, 325);

sezione('Rientro in garage, prima e dopo la mossa');
const R1=srv({id:'R1',time:'08:00',startMin:480,durMin:60,endMin:540,
  da:'Bari',per:'Monopoli',veicolo:'Vito 1',rientroMin:20});
const R2=srv({id:'R2',time:'20:00',startMin:1200,durMin:60,endMin:1260,
  da:'Bari',per:'Matera',veicolo:'',rientroMin:70});
F.setDATA(Object.assign({},pl,{services:[R1,R2],transfers:{'R1->R2':{min:60,buffer:15}}}));
c=F.plCatena(R2,'Vito 1');
eq('prima rientrava alle 09:20', c.rientro.prima, 560);
eq('dopo la mossa alle 22:10',   c.rientro.dopo, 1330);

sezione('Ore dell\'autista: oltre le 12 si dice');
F.setDATA(Object.assign({},pl,{services:[
  srv({id:'A1',time:'06:00',startMin:360,durMin:60,endMin:420,da:'Bari',per:'Bari',autista:'Marco',rientroMin:10}),
  srv({id:'A2',time:'17:00',startMin:1020,durMin:60,endMin:1080,da:'Bari',per:'Ostuni',autista:'Marco',rientroMin:40})]}));
let o=F.oreAutista('Marco');
eq('dalla prima partenza all\'ultimo rientro', [o.inizio,o.fine], [360,1120]);
eq('12h 40m: oltre il limite',                 [o.minuti,o.oltre], [760,true]);
eq('senza servizi non inventa niente',         F.oreAutista('Nessuno'), null);

sezione('La catena vale anche per l\'autista, non solo per il mezzo');
F.setDATA(pl);
const ca=F.plCatenaAutista(SPOSTA,'Marco');
eq('stessa risposta sulla catena autista', [ca.chiave,ca.arrivo,ca.k], ['autista',635,'stretto']);
eq('stesso luogo → trasferimento 0 e buffer 0',
   (function(){var X=srv({id:'X1',time:'08:00',startMin:480,durMin:60,endMin:540,da:'Bari',per:'Aeroporto di Bari',veicolo:'Vito 1'});
    var Y=srv({id:'Y1',time:'09:00',startMin:540,durMin:60,endMin:600,da:'Apt Bari',per:'Ostuni',veicolo:''});
    F.setDATA(Object.assign({},pl,{services:[X,Y],transfers:{'X1->Y1':{min:30,buffer:15}}}));
    var r=F.plCatena(Y,'Vito 1');return [r.trasf,r.buffer,r.margine];})(), [0,0,0]);

sezione('La finestra dei bagagli vale per tutta la app, non solo per la Plancia');
// il mezzo è sul posto alle 10:20, il volo atterra alle 10:10: il cliente è al nastro
const PRE=srv({id:'PRE',time:'09:00',startMin:540,durMin:60,endMin:600,da:'Bari',per:'Bari',veicolo:'Vito 1'});
const ARR=srv({id:'ARR',time:'10:10',startMin:610,durMin:60,endMin:670,
  da:'Aeroporto di Bari',per:'Ostuni',volo:'FR8826',veicolo:''});
const SENZAVOLO=srv({id:'ARR',time:'10:10',startMin:610,durMin:60,endMin:670,
  da:'Aeroporto di Bari',per:'Ostuni',volo:'',veicolo:''});
const vol={date:'2026-08-18',today:'2026-08-18',weekday:'martedì',nowMin:-1,bufferDefault:15,
  services:[PRE,ARR],transfers:{'PRE->ARR':{min:10,buffer:10},'ARR->PRE':{min:10,buffer:10}},
  autisti:[],veicoli:[{nome:'Vito 1',tipo:'Minivan',pax:8,fuoriServizio:false,inRent:false,stato:'ON'}],
  rents:[],prossimi:[],luoghiNomi:[],fornitori:[],base:'Polignano a Mare'};
F.setDATA(vol);
eq('col volo ci arriva (sul posto 10:20, decolla il buffer alle 10:20)', F.conflict(PRE,ARR), null);
F.setDATA(Object.assign({},vol,{services:[PRE,SENZAVOLO]}));
t('senza volo lo stesso incastro è un conflitto', !!F.conflict(PRE,SENZAVOLO), true);

sezione('Servizi cancellati: il mezzo e l\'autista tornano liberi');
/* Sul foglio la cancellazione è morbida: la riga resta, con Allert = Cancellato.
   Per il motore quella riga non esiste più — se contasse, un mezzo resterebbe
   occupato da un servizio che nessuno farà. */
const XCANC=srv({id:'C1',time:'08:00',startMin:480,durMin:120,endMin:600,
  da:'Polignano a Mare',per:'Aeroporto di Bari',autista:'Marco Rossi',veicolo:'Vito 1',
  allert:'Cancellato'});
const CDOPO=srv({id:'D1',time:'09:00',startMin:540,durMin:60,endMin:600,
  da:'Monopoli',per:'Ostuni',autista:'',veicolo:''});
const canc={date:'2026-08-27',today:'2026-08-27',weekday:'giovedì',nowMin:-1,bufferDefault:15,
  services:[XCANC,CDOPO],transfers:{'C1->D1':{min:60,buffer:15},'D1->C1':{min:60,buffer:15}},
  autisti:[{nome:'Marco Rossi',categoria:'Fisso',stato:'ON',esclusoMotivo:''},
           {nome:'Luca Verdi',categoria:'Extra',stato:'ON',esclusoMotivo:''}],
  veicoli:[{nome:'Vito 1',tipo:'Minivan',pax:8,fuoriServizio:false,inRent:false,stato:'ON'}],
  rents:[],prossimi:[],luoghiNomi:[],fornitori:[],base:'Polignano a Mare'};
F.setDATA(canc);
eq('non entra nell\'indice del mezzo',      F.srvDi('veicolo','Vito 1').length, 0);
eq('non entra nel giro dell\'autista',      F.giroDi('Marco Rossi',null).length, 0);
eq('il mezzo non risulta occupato',         F.availability(canc.veicoli,s=>s.veicolo,CDOPO,'veicolo')['Vito 1'], null);
eq('per Marco è una giornata libera',       F.valutaAutista(CDOPO,'Marco Rossi').k, 'libero');
eq('non compare fra chi sta lavorando',     F.autistiInServizio().length, 0);
eq('la catena del mezzo è vuota',           F.catenaDi('veicolo','Vito 1',null).length, 0);
eq('dal garage, non dal servizio annullato',F.plCatena(CDOPO,'Vito 1').daDove, 'garage');
eq('nessuna ora addosso all\'autista',      F.oreAutista('Marco Rossi'), null);
eq('il pennello del mezzo non eredita un autista cancellato', F.plUltimoAutista('Vito 1',CDOPO), '');
// controprova: la stessa riga senza Allert torna a contare
F.setDATA(Object.assign({},canc,{services:[Object.assign({},XCANC,{allert:''}),CDOPO]}));
eq('senza Allert il mezzo è di nuovo occupato', !!F.availability(canc.veicoli,s=>s.veicolo,CDOPO,'veicolo')['Vito 1'], true);
eq('e l\'ultimo autista del mezzo si ritrova',  F.plUltimoAutista('Vito 1',CDOPO), 'Marco Rossi');

bilancio();
