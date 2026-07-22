# Astral Tournament — estrazione e libro di magie, checkpoint v0.16

## Risultato principale

La funzione di preparazione del duello è stata localizzata in `astral.exe` a **0x446A9C** e tradotta nel modulo:

`src/core/astral-spellbook-re.js`

Il gioco originale non usa una mano con pesca e scarto. All'inizio del duello costruisce per ogni mago un **libro permanente di magie e creature**. Una carta giocata resta disponibile e può essere lanciata di nuovo quando il relativo potere è sufficiente.

## Quantità recuperate

### Duello ordinario

- giocatore: **20 carte**;
- Novice Mage: **15**;
- Advanced Mage: **15**;
- Expert Mage: **17**;
- Master Mage: **20**;
- Archmage: **20**.

### Torneo

- specializzazioni normali: **20 carte**;
- Wizard: **24 carte** prima delle aggiunte derivanti dalle abilità.

I libri dei due sfidanti vengono generati separatamente. La stessa carta può quindi appartenere a entrambi, ma non può comparire due volte nello stesso libro.

## Costruzione delle prime quindici carte

Le prime 15 posizioni garantiscono tre fasce per ogni scuola, nell'ordine Fuoco, Acqua, Aria, Terra e Morte:

1. un livello casuale tra **1 e 4**;
2. un livello casuale tra **5 e 8**;
3. un livello casuale tra **9 e 12**.

Le carte successive vengono scelte tra tutte le cinque scuole e i livelli 1–12. In caso di collisioni ripetute il codice originale allenta gradualmente la fascia e poi la scuola richiesta.

## Vincoli verificati

La routine rigenera l'intero libro finché non supera una serie di controlli di equilibrio. Tra quelli tradotti:

- nessun duplicato;
- esattamente una carta di livello 12;
- almeno una carta di recupero/cura;
- da una a due creature elementali, salvo Elemental Knowledge;
- gruppi precisi di magie offensive e utility;
- almeno due carte utility della scuola Morte;
- limiti di carte per scuola;
- rapporto magie/creature più restrittivo per il giocatore umano;
- vincoli tra la carta di livello 12 e la seconda carta più alta della stessa scuola;
- alcune coppie e terne vietate;
- controlli dipendenti dai poteri iniziali.

Le due maschere multiword dell'eseguibile sono state lette integralmente:

- `0x4475F0`: gruppo recupero/cura;
- `0x4475F8`: gruppo danno.

## Livello 13 e abilità Knowledge

I livelli 13 non vengono mai estratti casualmente. Sono aggiunti dopo la validazione tramite:

- Efreet's Knowledge;
- Sea Knowledge;
- Titans Knowledge;
- Stone Knowledge;
- Hell Knowledge.

Elemental Knowledge aggiunge direttamente Fire Elemental, Water Elemental, Air Elemental ed Earth Elemental. Per questo il libro casuale di base deve contenere **zero elementali** quando l'abilità è attiva.

## Poteri iniziali

La stessa funzione genera i poteri iniziali:

- il primo mago ha somma base **20**;
- il secondo ha somma base **19**;
- ogni valore nasce prevalentemente nell'intervallo 3–5, con piccole correzioni casuali;
- Craft, Mystery, Penalty, Meditation e Ancient Knowledge modificano poi i valori.

La v0.16 applica questi poteri realmente al duello. L'override automatico 5/3 della vecchia interfaccia è stato rimosso. La precedente tabella 5/3, 7/5 e 10/8 resta nel codice di ricerca, ma il suo significato non viene più dichiarato come potere iniziale finché il relativo utilizzo non sarà dimostrato.

## Prestazioni e verifica

Il comportamento originale è un rejection sampler: crea un candidato e lo scarta se non è equilibrato. Il primo porting basato su oggetti era troppo lento; la v0.16 usa strutture numeriche riutilizzabili senza cambiare la procedura.

Stress test su 100 seed:

- **100/100 riusciti**;
- tempo mediano: **27 ms**;
- tempo massimo osservato: **299 ms**;
- tentativi medi: **24.569**;
- massimo osservato: **181.127**.

Rapporto: `research/SPELLBOOK_STRESS_REPORT.json`.

## Limiti ancora aperti

- Il generatore usa un RNG moderno deterministico per rendere le partite riproducibili; non produce la stessa sequenza numerica del runtime Borland originale.
- Il significato preciso della modalità globale letta a `0x9114C8` non è ancora nominato con certezza, anche se il suo ramo è supportato come `restrictedMode`.
- Alcuni pool possono essere limitati da una matrice globale di disponibilità; nel set completo tutte le 65 carte sono abilitate.
