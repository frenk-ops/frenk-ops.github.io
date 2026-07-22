# Changelog v0.18

## Reverse engineering

- dimostrata la semantica sostitutiva dei tre gruppi abilità;
- documentati indirizzo tabella, offset profilo e routine `hasAbility`;
- recuperato l'ordine dei modificatori iniziali;
- recuperati Lord, creature iniziali e trigger runtime;
- corretta l'interpretazione dei record numerici delle leghe.

## Motore

- aggiunto `astral-abilities-re.js` con 37 abilità e sei specializzazioni;
- loadout risolto automaticamente da specializzazione e lega;
- passivi collegati al duello e ai cloni dell'IA;
- aggiunti Astral Nets e Healing Aura mancanti;
- aggiunti Lord, Life Knowledge, Life Penalty, Skeleton Master e Faery Master;
- mantenuti Knowledge e modificatori iniziali nel generatore del libro.

## Interfaccia

- scelta tra sei specializzazioni;
- selezione Starting, Advanced o Major League;
- selezione della specializzazione avversaria;
- visualizzazione delle abilità attive durante il duello;
- pagina Ruleset aggiornata con la matrice completa.

## Qualità

- test aumentati da 50 a 60;
- 18 smoke test su tutte le combinazioni specializzazione × lega;
- corretto il test obsoleto che applicava 5/3, 7/5 e 10/8 come poteri iniziali.
