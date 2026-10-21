#!/bin/bash
# manda un messaggio finto al motore (chat finta) e stampa cosa risponde il bot
# uso: manda.sh <chat 9000000xx> testo "..." | tap "RA|riep|ok"
CHAT=$1; TIPO=$2; VAL=$3; MID=$RANDOM
if [ "$TIPO" = tap ]; then BODY=$(python3 -c "import json,sys;print(json.dumps({'callback_query':{'id':'q$MID','from':{'id':$CHAT,'first_name':'Prova'},'data':sys.argv[1],'message':{'message_id':1,'chat':{'id':$CHAT},'text':'','reply_markup':{'inline_keyboard':[]}}}}))" "$VAL")
else BODY=$(python3 -c "import json,sys;print(json.dumps({'message':{'message_id':$MID,'from':{'id':$CHAT,'first_name':'Prova'},'chat':{'id':$CHAT},'text':sys.argv[1]}}))" "$VAL"); fi
curl -s -m 150 -X POST https://transfer.app.n8n.cloud/webhook/ra-prova-campo-5c8e21 -H 'Content-Type: application/json' -d "$BODY" | python3 -c "
import json,sys
try: d=json.load(sys.stdin)
except Exception as e: print('  (nessuna risposta)', e); sys.exit()
for m in d.get('messaggi',[]):
  bt=' '.join('['+b['text']+' ⇒'+b.get('callback_data','')+']' for r in (m.get('bottoni') or []) for b in r)
  print('  🤖', m.get('testo','').replace('\n','\n     '), ('\n     '+bt) if bt else '')
"
