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

bilancio();
