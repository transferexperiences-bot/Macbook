#!/usr/bin/env bash
# Batteria completa. Da lanciare dalla radice del repo.
set -e
cd "$(dirname "$0")"

echo "▶ sintassi"
cp src/Code.gs /tmp/_code_check.js && node --check /tmp/_code_check.js && echo "  src/Code.gs ok"
python3 - <<'PY'
import re
h=open('src/Index.html').read()
open('/tmp/_index_check.js','w').write(re.search(r'<script>(.*?)</script>',h,re.S).group(1).replace('<?!= boot ?>','null'))
assert h.lstrip().startswith('<!DOCTYPE html>'), 'src/Index.html non inizia con <!DOCTYPE html>'
assert 'var CONFIG =' not in h, 'src/Index.html contiene codice del backend'
assert open('src/Code.gs').read().lstrip().startswith('/**'), 'src/Code.gs non inizia con /**'
assert '<!DOCTYPE' not in open('src/Code.gs').read(), 'src/Code.gs contiene HTML'
PY
node --check /tmp/_index_check.js && echo "  src/Index.html ok"

echo "▶ preview con dati finti"
python3 tools/build-preview.py

echo "▶ backend"; node test/backend.test.js
echo "▶ motore";  node test/motore.test.js
echo "▶ app end-to-end"; node test/app.test.js
echo "✅ tutto verde"
