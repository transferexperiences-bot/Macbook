#!/bin/bash
M=./manda.sh; C=900000005
s() { echo; echo "👤 $2"; $M $C $1 "$2"; }
s testo "/prova Claudio Moccia 12/10"
s testo "il cliente delle 19:15 ha già pagato?"
s testo "chi sei?"
s testo "buongiorno, inizio adesso"
s testo "si"
s testo "il cliente vuole fermarsi al supermercato, posso?"
s testo "il cliente mi chiede la fattura"
s testo "ho mangiato un panino 12 euro, con i miei soldi"
s testo "non ho lo scontrino"
s testo "a che ora devo essere domani?"
s testo "grazie, a dopo"
