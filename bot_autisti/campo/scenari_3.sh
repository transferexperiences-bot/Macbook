#!/bin/bash
M=./manda.sh; C=900000004
s() { echo; echo "👤 $2"; $M $C $1 "$2"; }
s testo "/prova Claudio Moccia 12/10"
s testo "il cliente delle 19:15 ha già pagato?"
s testo "ma le ore effettive come le calcolate?"
s testo "sono in ritardo di 10 minuti per il ritiro delle 11"
s testo "ho finito"
s testo "si"
s testo "ok confermo"
s testo "tutto a posto niente spese"
s testo "mezzo serbatoio"
s testo "nessun problema"
