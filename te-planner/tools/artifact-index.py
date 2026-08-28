#!/usr/bin/env python3
"""Rigenera la pagina «Index TE Planner» — quella che sta nel pannello a destra e da cui
si copia il file da incollare in Apps Script.

    python3 tools/artifact-index.py        # scrive tools/artifact-index.html

Poi si ripubblica sullo STESSO indirizzo (l'artifact fc8e5034-…): stesso percorso del file
= stesso link, e chi ce l'ha aperto vede la versione nuova. Da fare dopo ogni modifica a
src/Index.html, insieme ai test e al commit.
"""
import io, os, subprocess, datetime

QUI = os.path.dirname(os.path.abspath(__file__))
RADICE = os.path.dirname(QUI)
SORGENTE = os.path.join(RADICE, 'src', 'Index.html')
MODELLO = os.path.join(QUI, 'artifact-index.tpl.html')
USCITA = os.path.join(QUI, 'artifact-index.html')


def git(*a):
    try:
        return subprocess.check_output(['git', '-C', RADICE] + list(a),
                                       stderr=subprocess.DEVNULL).decode().strip()
    except Exception:
        return ''


def main():
    testo = io.open(SORGENTE, encoding='utf-8').read()
    righe = testo.count('\n') + 1
    kb = round(len(testo.encode('utf-8')) / 1024)
    # dentro <pre> il sorgente va scappato, o il browser prova a eseguirlo
    dentro = (testo.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))
    tpl = io.open(MODELLO, encoding='utf-8').read()
    pagina = (tpl
              .replace('{{RIGHE}}', '{:,}'.format(righe).replace(',', '.'))
              .replace('{{KB}}', str(kb))
              .replace('{{COMMIT}}', git('rev-parse', '--short', 'HEAD') or '—')
              .replace('{{DATA}}', datetime.datetime.now().strftime('%d/%m/%Y %H:%M'))
              .replace('{{TITOLO}}', git('log', '-1', '--pretty=%s') or '—')
              .replace('{{SORGENTE}}', dentro))
    io.open(USCITA, 'w', encoding='utf-8').write(pagina)
    print('scritto {} — {} righe, {} KB'.format(USCITA, righe, kb))


if __name__ == '__main__':
    main()
