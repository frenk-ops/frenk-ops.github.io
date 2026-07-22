# Reverse engineering delle abilità — v0.18

## Risultato principale

La tabella delle specializzazioni è presente in `astral.exe` all'indirizzo `0x478330`. Contiene sei record e, per ciascun record, tre gruppi da otto slot.

Il codice torneo tra `0x43AB90` e `0x43ABF9` seleziona direttamente il gruppo usando:

- specializzazione del partecipante;
- indice della lega corrente, da 1 a 3.

Gli otto byte selezionati vengono copiati nel profilo del combattente all'offset `+0x2C`. La funzione `0x44B3CC` verifica poi la presenza di un ID nei suoi otto slot.

### Conseguenza verificata

I tre gruppi sono **loadout sostitutivi**:

- gruppo 1: Starting League;
- gruppo 2: Advanced League;
- gruppo 3: Major League.

Non sono cumulativi e non sono una lista tra cui scegliere. Per esempio, Meditation non resta attiva nel Major Wizard: viene sostituita da Ancient Knowledge e Life Knowledge.

## Applicazione a inizio duello

La routine `PrepareDuel` applica, in quest'ordine:

1. Craft: `+1` alla relativa scuola;
2. Mystery: `+2` alla relativa scuola;
3. Penalty elementale: `-1` alla relativa scuola;
4. Meditation: `+1` a tutte le scuole;
5. Ancient Knowledge: `+2` a tutte le scuole.

Questo avviene dopo la generazione dei poteri base con somma 20 per il giocatore e 19 per l'avversario.

## Crescita

La routine tra `0x447788` e `0x4477CF` inizializza ogni crescita a `1` e la porta a `2` quando è presente il Lord della scuola corrispondente.

## Carte aggiuntive

- Elemental Knowledge aggiunge i quattro Elementali.
- Efreets, Sea, Titans, Stone e Hell Knowledge aggiungono la rispettiva creatura di livello 13.
- Le carte aggiunte non sostituiscono carte del libro base.

## Creature iniziali

- Skeleton Master inserisce direttamente uno Skeleton nel primo slot disponibile.
- Faery Master inserisce direttamente una Faerie nel primo slot disponibile.

Il codice originale costruisce direttamente la struttura della creatura: non rilancia la carta. Perciò lo Skeleton iniziale non infligge al proprietario il suo danno di evocazione e non attiva Astral Nets.

## Trigger runtime verificati

| ID | Abilità | Comportamento |
|---:|---|---|
| 22 | Souldrinker | +2 vita al proprietario per ogni creatura che muore |
| 23 | Fire Aura | la creatura che infligge danno diretto al mago subisce 2 danni |
| 24 | Battle Lord | +1 al danno delle magie |
| 25 | Stone Skin | -1 al danno subito dal mago, senza ridurre un danno positivo sotto 1 |
| 26 | Healing Aura | +2 vita dopo la crescita dei poteri del proprio turno |
| 28 | Astral Nets | la creatura appena evocata dall'avversario subisce 3 danni |

## Vita iniziale

Le descrizioni dati originali assegnano:

- Life Penalty: `-15` vita iniziale;
- Life Knowledge: `+20` vita iniziale.

Questi valori sono implementati su vita corrente e massimo. Il punto preciso del codice che applica i due modificatori non è ancora stato isolato con la stessa certezza dei trigger sopra; il valore è però esplicito nei dati originali delle abilità.

## Integrazione nel motore

Il modulo `src/core/astral-abilities-re.js`:

- contiene tutti i 37 record;
- risolve specializzazione e lega;
- assegna il loadout al combattente;
- converte le abilità runtime nei flag usati dal motore;
- applica vita, crescita e creature iniziali.

Il libro riceve gli stessi ID prima della generazione, quindi Craft, Mystery, Meditation, Ancient Knowledge e Knowledge influenzano davvero poteri e carte. I cloni usati dall'IA conservano abilità, passivi, crescita, vita e creature iniziali.
