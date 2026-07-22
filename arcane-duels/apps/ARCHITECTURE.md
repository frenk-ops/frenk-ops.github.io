# Architettura Arcane Duels v0.18

## Moduli recuperati

- `astral-spellbook-re.js`: libro permanente e poteri iniziali;
- `astral-abilities-re.js`: specializzazioni, loadout e abilità;
- `astral-card-effects-re.js`: dispatcher delle 65 carte e combattimento;
- `astral-ai-re.js`: valutatore e cinque livelli IA;
- `game-engine.js`: macchina degli stati condivisa da partita reale e simulazioni.

## Flusso di inizializzazione Astral

1. normalizzazione di specializzazione e lega;
2. selezione diretta del loadout;
3. generazione dei poteri base e applicazione di Craft/Mystery/Penalty/Meditation/Ancient Knowledge;
4. generazione del libro e aggiunta delle carte Knowledge;
5. creazione del combattente;
6. applicazione di vita, Lord e passivi runtime;
7. collocazione delle creature iniziali.

## Entrypoint

- `index.html`;
- `START_HERE_v0.18.html`.
