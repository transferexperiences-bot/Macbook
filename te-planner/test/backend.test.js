/* Backend (src/Code.gs): parser importi, date di indisponibilità, riposi,
   riconoscimento "stesso luogo" e stima dei tempi. */
const {caricaBackend,eq,t,sezione,bilancio}=require('./_lib');
const B=caricaBackend();

sezione('parseEuro_ — il bug delle tariffe ×10');
eq('"150.5" (numero letto dal foglio)', B.parseEuro_('150.5'), 150.5);
eq('"150,50"',   B.parseEuro_('150,50'), 150.5);
eq('"1.234,50"', B.parseEuro_('1.234,50'), 1234.5);
eq('"1,234.50"', B.parseEuro_('1,234.50'), 1234.5);
eq('"1.234" (migliaia all\'italiana)', B.parseEuro_('1.234'), 1234);
eq('"€ 62,50"',  B.parseEuro_('€ 62,50'), 62.5);
eq('"120"',      B.parseEuro_('120'), 120);
eq('numero 150.5', B.parseEuro_(150.5), 150.5);
eq('vuoto',      B.parseEuro_(''), null);

sezione('indisponibileIn_ — celle Data vere e elenchi');
eq('cella Data del giorno',      B.indisponibileIn_(new Date(2026,6,15),'2026-07-15'), true);
eq('cella Data di un altro giorno', B.indisponibileIn_(new Date(2026,6,16),'2026-07-15'), false);
eq('"15/07"',                    B.indisponibileIn_('15/07','2026-07-15'), true);
eq('"15/7"',                     B.indisponibileIn_('15/7','2026-07-15'), true);
eq('"14/07, 15/07, 16/07"',      B.indisponibileIn_('14/07, 15/07, 16/07','2026-07-15'), true);
eq('"15/07/2025" (anno diverso)', B.indisponibileIn_('15/07/2025','2026-07-15'), false);
eq('"15 luglio"',                B.indisponibileIn_('15 luglio','2026-07-15'), true);
eq('"20/07"',                    B.indisponibileIn_('20/07','2026-07-15'), false);
eq('vuoto',                      B.indisponibileIn_('','2026-07-15'), false);

sezione('riposoIn_ — elenchi di giorni');
eq('"dom" di domenica',            B.riposoIn_('dom','domenica'), true);
eq('"domenica" di domenica',       B.riposoIn_('domenica','domenica'), true);
eq('"sab e dom" di domenica',      B.riposoIn_('sab e dom','domenica'), true);
eq('"sabato, domenica" di sabato', B.riposoIn_('sabato, domenica','sabato'), true);
eq('"dom" di lunedì',              B.riposoIn_('dom','lunedì'), false);
eq('"-"',                          B.riposoIn_('-','sabato'), false);
eq('"e" (vecchio falso positivo)', B.riposoIn_('e','mercoledì'), false);
eq('vuoto',                        B.riposoIn_('','sabato'), false);

sezione('stessoLuogo_ — il bug delle catene apt → apt');
eq('Aeroporto di Bari / Aeroporto di Bari',      B.stessoLuogo_('Aeroporto di Bari','Aeroporto di Bari'), true);
eq('Aeroporto di Bari / AEROPORTO BARI',         B.stessoLuogo_('Aeroporto di Bari','AEROPORTO BARI'), true);
eq('Apt Bari / Aeroporto di Bari',               B.stessoLuogo_('Apt Bari','Aeroporto di Bari'), true);
eq('Aeroporto di Bari - Arrivi / Aeroporto Bari',B.stessoLuogo_('Aeroporto di Bari - Arrivi','Aeroporto Bari'), true);
eq('Aeroporto di Bari, Italia / aeroporto bari', B.stessoLuogo_('Aeroporto di Bari, Italia','aeroporto bari'), true);
eq('Monopoli, BA / Monopoli',                    B.stessoLuogo_('Monopoli, BA','Monopoli'), true);
eq('Bari / Brindisi NON devono collassare',      B.stessoLuogo_('Aeroporto di Bari','Aeroporto di Brindisi'), false);
eq('Monopoli / Polignano a Mare',                B.stessoLuogo_('Monopoli','Polignano a Mare'), false);
eq('Via Roma / Piazza Roma',                     B.stessoLuogo_('Via Roma','Piazza Roma'), false);
eq('vuoto / vuoto',                              B.stessoLuogo_('',''), false);

sezione('driveTime_ e stimaMin_');
const luoghi=[{nome:'aeroporto di bari',coords:[41.1389,16.7606]},
              {nome:'polignano a mare',coords:[41.0000,17.2186]}];
const cache={},nr=[];
eq('apt Bari → Apt Bari',                B.driveTime_('Aeroporto di Bari','Apt Bari',cache,luoghi,nr).min, 0);
eq('apt Bari → apt Bari - Arrivi',       B.driveTime_('Aeroporto di Bari','Aeroporto di Bari - Arrivi',cache,luoghi,nr).min, 0);
const lontano=B.driveTime_('Aeroporto di Bari','Polignano a Mare',cache,luoghi,nr);
t('apt Bari → Polignano resta una tratta vera', lontano.min>20, lontano);
eq('stimaMin_(0)',   B.stimaMin_(0), 0);
eq('stimaMin_(0,4)', B.stimaMin_(0.4), 2);
eq('stimaMin_(2)',   B.stimaMin_(2), 5);
eq('stimaMin_(30)',  B.stimaMin_(30), 36);

sezione('Cancellato: l\'Allert, ma anche il segno lasciato nelle Note');
// la cancellazione morbida scrive in tutti e due i posti; a volte resta solo la nota
eq('Allert = Cancellato',                B.isCancRow_('Cancellato',''), true);
eq('la firma della cancellazione morbida',B.isCancRow_('','seggiolino | Cancellazione 12/08/2026 10:15'), true);
eq('il ⛔ della nota',                    B.isCancRow_('','⛔ non si fa più'), true);
eq('«servizio cancellato»',              B.isCancRow_('','Servizio cancellato dal fornitore'), true);
eq('«è stato annullato»',                B.isCancRow_('','il transfer è stato annullato ieri'), true);
// \b davanti a «è» non funziona: in JS il confine di parola è solo ASCII, e senza questo
// controllo «purtroppo è stato cancellato» passava liscio
eq('«è stato cancellato» dopo una parola',B.isCancRow_('','purtroppo è stato cancellato'), true);
// e quello che NON è una cancellazione del servizio: nel dubbio si tiene
eq('un volo cancellato non è il servizio',B.isCancRow_('','Volo cancellato, il cliente arriva domani'), false);
eq('una richiesta non è una cancellazione',B.isCancRow_('','Il cliente chiede la cancellazione, aspetto conferma'), false);
eq('la negazione non inganna',            B.isCancRow_('','NON cancellato: confermato'), false);
eq('un pagamento annullato non tocca il servizio', B.isCancRow_('','Pagamento annullato ma il servizio si fa'), false);
eq('note normali',                        B.isCancRow_('','Bagaglio extra, seggiolino'), false);
eq('nessuna nota',                        B.isCancRow_('',''), false);

sezione('Frontend e backend dicono la stessa cosa su una nota');
(function(){
  var F=require('./_lib').caricaFrontend();
  var casi=['Cancellazione 12/08/2026 10:15','⛔ stop','Servizio cancellato','purtroppo è stato cancellato',
            'Volo cancellato, riprotetto','chiede la cancellazione','NON cancellato','Bagaglio extra','',
            'prenotazione annullata','Pagamento annullato ma il servizio si fa'];
  var diversi=[];
  casi.forEach(function(n){ if(B.isCancRow_('',n)!==F.cancInNote(n)) diversi.push(n); });
  eq('stessa risposta su '+casi.length+' note', diversi, []);
})();

bilancio();
