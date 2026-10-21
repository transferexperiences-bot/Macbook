#!/bin/bash
M=./manda.sh; C=900000009
s() { echo; echo "👤 $2"; $M $C $1 "$2"; }
s testo "/prova Claudio Moccia 12/10"
s testo "a che ora devo essere domani?"
s testo "e mercoledì cosa faccio?"
s testo "ho mangiato un panino 8 euro, con i miei soldi"
s testo "non ho lo scontrino, l'ho perso"
s testo "si giusto"
