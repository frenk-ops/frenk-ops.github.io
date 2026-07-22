# Roadmap prioritaria

## 1. Estrazione e libro di magie — completato nel nucleo in v0.16

Libro permanente, quantità IA, fasce, vincoli e carte Knowledge.

## 2. Effetti speciali e simulazione IA — completato nel nucleo in v0.17

Dispatcher delle 65 carte, combattimento, ricorrenze, crescita e morte sono collegati al motore e a `BestMove`.

## 3. Abilità delle specializzazioni — completato nel nucleo in v0.18

- loadout sostitutivi per le tre leghe;
- modificatori iniziali;
- Lord e Knowledge;
- creature iniziali;
- sei trigger runtime;
- vita iniziale.

### Verifiche residue

- individuare il sito macchina esatto di Life Penalty e Life Knowledge;
- validare sotto debugger l'ordine in casi con più trigger simultanei.

## 4. Ordine delle morti e dei trigger simultanei — prossimo obiettivo

Ricostruire con precisione:

- scansione delle corsie;
- ordine tra i due campi;
- Phoenix durante distruzioni globali;
- Souldrinker, Death Keeper e Wall of Souls con morti multiple;
- rimozione dei modificatori permanenti;
- vittoria e pareggio quando entrambi i maghi raggiungono zero.

## 5. Formula e struttura completa del torneo

Attribuire i quattro campi numerici delle leghe, ricostruire punteggio, classifica, avversari, spareggi e salvataggio.

## 6. Confronto dinamico dell'IA

Confrontare le mosse dell'Archmage originale e della ricostruzione su stati identici.

## 7. Asset grafici

Identificare il codec degli archivi `graphics.dat` ed estrarre le immagini originali.
