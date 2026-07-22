# Reverse engineering del motore carte — v0.17

## Risultato

Il motore originale delle carte è stato localizzato e collegato al porting.

- dispatcher centrale: `0x448878`;
- 65 rami, uno per ogni carta (`5 scuole × 13 livelli`);
- formula dell'indice: `school * 13 + card - 14`;
- calcolo dell'attacco: `0x447A4C`;
- applicazione del danno: `0x447AE0`;
- danno di massa: `0x448334`;
- pulizia morti e trigger: `0x447DF4`;
- fase di attacco e ricorrenze: `0x44A698`;
- selezione della creatura “più grande”: `0x44B170`.

## Correzioni di regola

### L'effetto precede il costo

Nel binario il ramo della carta viene risolto prima della sottrazione del livello dal potere. Questo incide direttamente su:

- Flame Wave e Inferno;
- Cure e Rejuvenation;
- Ice Bolt, Lightning e Chain Lightning;
- Armageddon;
- Drain Life;
- Fire Ritual.

Esempio: Lightning con 10 Aria infligge `10 + 5 = 15`, poi il potere scende a 4 pagando il costo 6.

### Nessuno sconto di talento

Nel ruleset Astral il costo è sempre il livello della carta. La v0.16 ereditava erroneamente lo sconto di 1 del ruleset moderno; è stato rimosso.

### Crescita dei poteri

I poteri non aumentano simultaneamente a fine round. Dopo l'attacco di un mago cresce soltanto il mago che sta per iniziare la propria fase di gioco.

## Sistemi implementati

### Effetti immediati

Sono tradotti i rami di danno, cura, variazione dei poteri, distruzione, drenaggio e selezione del bersaglio delle 65 carte. Le carte senza effetto immediato passano correttamente al comportamento passivo o al normale combattimento.

### Attacco e difese

- attacco dinamico degli Elementali;
- Warlord: moltiplicatore cumulativo del danno da combattimento;
- Dragon: +50% cumulativo alle magie;
- Faerie: +1 cumulativo alle magie;
- Ice Guard: dimezzamento ripetuto del danno all'eroe;
- Elf Armorer: -1 al danno maggiore di 1 su eroe e creature;
- attacchi multi-bersaglio a tutte le creature e all'eroe;
- Vampire: cura pari alla metà del danno effettivo alle creature.

### Effetti ricorrenti

Eseguiti immediatamente prima dell'attacco della relativa creatura:

- Sea Sprite;
- Elf Healer;
- Troll;
- Master Healer;
- Hydra;
- Zombie.

### Crescita elementale persistente

I modificatori entrano quando la creatura viene evocata e vengono rimossi quando muore:

- Elementali;
- Salamander e Lightning Cloud;
- Ocean Master e Sea Monster;
- Mind Master e Astral Guard;
- Priest of Air, Elf Hermit, Night Elf e Demon.

### Morti

- Phoenix rinasce a vita piena con almeno 10 Fuoco;
- Death Keeper aumenta Morte per ogni morte;
- Wall of Souls cura per ogni morte;
- supporto al talento Souldrinker;
- rimozione corretta dei modificatori persistenti.

## Impatto sull'IA

`BestMove` usa cloni reali del `GameEngine`. Di conseguenza la simulazione ora considera gli effetti sopra elencati quando valuta ogni carta e corsia. Prima della v0.17 molte carte risultavano all'IA come creature prive di abilità o magie vuote.

## Verifica

- 50 test automatici superati;
- tutte le 65 carte attraversano il dispatcher senza eccezioni;
- test mirati su ordine effetto/costo, Warlord, Dragon, Faerie, Ice Guard, Armorer, multi-target, Phoenix, Death Keeper, Wall of Souls, Drain Life, Drain Souls, Stone Rain, Mind Master e Astral Guard;
- cinque duelli completi IA contro IA terminati senza stalli, uno per difficoltà.

## Limiti residui

La struttura è recuperata con alta confidenza tramite disassemblaggio statico. Restano da verificare dinamicamente alcuni casi limite:

1. ordine esatto dei trigger quando molte creature muoiono nello stesso istante;
2. cura di Drain Life in presenza di tutte le combinazioni difensive;
3. interazioni delle abilità di specializzazione non ancora collegate al profilo torneo;
4. eventuali differenze di arrotondamento del runtime Borland in rarissime catene di moltiplicatori.
