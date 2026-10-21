#!/bin/bash
M=./manda.sh; C=900000003
s() { echo; echo "👤 $2"; $M $C $1 "$2"; }
s testo "/prova Claudio Moccia 12/10"
s testo "ciao"
s testo "quanti contanti devo consegnare oggi?"
s testo "il cliente delle 19:15 ha già pagato?"
s testo "che macchina ho oggi?"
s testo "sono in ritardo di 10 minuti per il ritiro delle 11"
s testo "il cliente non c'è, aspetto o vado?"
s testo "ho finito per oggi"
