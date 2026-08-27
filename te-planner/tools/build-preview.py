import json,os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def srv(i,t,dur,da,per,aut,vei,pax,nome,tar,forn,rient,**kw):
    return dict(rowNum=i+2,id="TE%03d"%(i+1),time="%02d:%02d"%(t//60,t%60),startMin=t,da=da,per=per,pax=pax,
      nome=nome,fornitore=forn,volo=kw.get('volo',''),autista=aut,veicolo=vei,note=kw.get('note',''),
      stato=kw.get('stato',''),allert=kw.get('allert',''),tariffa=tar,cell="+393331234567",wa="",hextra="",
      modalita='Contanti',acconto="",durMin=dur,endMin=t+dur,durSrc="cache",rientroMin=rient,
      km=kw.get('km',max(3,int(dur*0.7))))
S=[srv(0,330,55,'Polignano a Mare','Aeroporto di Bari','Marco Rossi','Vito 1',4,'Famiglia Bianchi','75','Covo dei Saraceni',48,volo='FR8826'),
 srv(1,435,70,'Aeroporto di Bari','Alberobello','Luca Verdi','Vito 2',6,'Mr. Anderson','110','Masseria San Domenico',65,volo='AZ1614'),
 srv(2,540,45,'Monopoli','Polignano a Mare','Marco Rossi','Vito 1',3,'Sig.ra Colombo','55','Don Ferrante',0),
 srv(3,630,90,'Polignano a Mare','Matera','','',7,'Gruppo Schmidt','180','Melograno',95),
 srv(4,780,60,'Ostuni','Aeroporto di Brindisi','Luca Verdi','Vito 2',2,'Mr. & Mrs. Taylor','90','Torre Coccaro',72),
 srv(5,870,50,'Aeroporto di Bari','Monopoli','Giovanni Leo','Mercedes V',5,"Famiglia D'Amico",'85','Booking diretto',35),
 srv(6,960,40,'Polignano a Mare','Monopoli','','Vito 1',4,'Sig. Ferrara','60','Covo dei Saraceni',35),
 srv(7,1110,75,'Alberobello','Aeroporto di Bari','Marco Rossi','Vito 1',6,'Gruppo Nakamura','120','Trulli Holiday',48),
 srv(8,1200,55,'Aeroporto di Bari','Ostuni','','',3,'Sig.ra Petrova','95','Le Carrube',80,allert='Invia')]
tr={}
for a in S:
    for b in S:
        if a is b or a['endMin']>b['startMin']+240: continue
        stesso=a['per']==b['da']
        tr[a['id']+'->'+b['id']]={'min':0 if stesso else 25,'buffer':0 if stesso else 15,'km':0 if stesso else 18}
D=dict(date="2026-07-30",today="2026-07-30",weekday="giovedì",nowMin=890,services=S,transfers=tr,
 autisti=[dict(nome=n,categoria=c,stato='ON',pref='',cell='+39333',esclusoMotivo=m) for n,c,m in
   [('Marco Rossi','Fisso',''),('Luca Verdi','Fisso',''),('Giovanni Leo','Extra',''),
    ("Nicola D'Amico",'Extra',''),('Antonio Greco','Fisso','Riposo fisso (giovedì)'),('Pietro Salvi','Emergenza','')]],
 veicoli=[dict(nome='Vito 1',tipo='Minivan',pax=8,fuoriServizio=False,inRent=False,stato='ON'),
   dict(nome='Vito 2',tipo='Minivan',pax=8,fuoriServizio=False,inRent=False,stato='ON'),
   dict(nome='Mercedes V',tipo='VIP',pax=7,fuoriServizio=False,inRent=False,stato='ON'),
   dict(nome='Tuk-Tuk',tipo='Tuk-Tuk',pax=6,fuoriServizio=False,inRent=True,stato='ON'),
   dict(nome='Sprinter',tipo='Bus',pax=16,fuoriServizio=True,inRent=False,stato='FUORI SERVIZIO')],
 rents=[dict(nome='Agenzia Sud',veicolo='Tuk-Tuk',fornitore='RentBari',prezzo='45',durata=3,inizio='2026-07-29',fine='2026-08-01',totale='135')],
 prossimi=[dict(date='2026-07-31',tot=8,senzaAutista=3,senzaMezzo=1),dict(date='2026-08-01',tot=6,senzaAutista=2,senzaMezzo=0)],
 luoghiNomi=['Polignano a Mare','Aeroporto di Bari','Monopoli','Ostuni','Alberobello','Matera'],
 fornitori=['Covo dei Saraceni','Melograno'],bufferDefault=15,base='Polignano a Mare, BA, Italia')
h=open(os.path.join(ROOT,'src','Index.html')).read().replace('<?!= boot ?>',json.dumps(D))
h=h.replace('<script>','<script>window.google={script:{run:new Proxy({},{get:function(){return function(){return window.google.script.run}}})}};',1)
open(os.path.join(ROOT,'preview.html'),'w').write(h)
print('preview.html rigenerata in '+ROOT)
