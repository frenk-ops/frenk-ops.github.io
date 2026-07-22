# Astral Classic UI 3.0 — specifica

## Riferimenti applicati

La nuova composizione riprende gli screenshot originali forniti dall'utente:

- ritratti dei due giocatori negli angoli superiori;
- nome e vita accanto al ritratto;
- cinque scuole disposte verticalmente ai lati;
- due colonne centrali da cinque slot creatura;
- separatore ornamentale centrale;
- spellbook visualizzato come griglia 2×2;
- stato delle carte non giocabili sovrapposto alla carta;
- barra informativa della carta in basso;
- pulsanti con resa pietra/metallo;
- schermata torneo con sipari e classifica centrale;
- menu blu con logo e grandi pulsanti illustrati.

## Desktop

Il desktop è la modalità primaria e cerca una replica strutturale dell'originale, senza riutilizzare gli screenshot come sfondo.

## Mobile

Sotto 820 px il layout viene adattato:

- poteri di entrambi i giocatori compatti in alto;
- campo centrale mantenuto a due colonne;
- spellbook del giocatore scorrevole orizzontalmente;
- spellbook avversario nascosto e sostituito da un pannello modale per le carte rivelate;
- rimosso il testo e il pulsante inline tra la mano giocatore e il footer;
- navigazione fissa in basso;
- barra informativa compatta.

## Vincolo motore

La versione 3.0 modifica esclusivamente:

- `app/index.html`;
- `app/styles.css`;
- `app/src/ui/app.js`;
- file di documentazione e avvio.

I file in `src/core`, `src/data` e `tests` sono invariati.
