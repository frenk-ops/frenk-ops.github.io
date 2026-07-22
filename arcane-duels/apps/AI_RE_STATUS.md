# Astral Tournament — ricostruzione IA, checkpoint v0.15

## Risultato principale

La routine originale `BestMove`, localizzata a `0x44C3C8`, è stata tradotta nella sua struttura essenziale e collegata al motore di Arcane Duels.

Il flusso recuperato è:

1. salva `0x35` DWORD dello stato del duello, cioè 212 byte;
2. enumera scuole, carte e cinque corsie;
3. verifica costo e legalità;
4. applica la mossa su uno stato copiato;
5. simula le successive fasi di attacco;
6. valuta entrambi i lati tramite la routine collegata a `0x44BB14`;
7. calcola la differenza tramite la routine a `0x44C398`;
8. ripristina lo stato;
9. conserva la coordinata con il punteggio migliore.

La matrice osservata misura `0x514` byte, equivalenti a:

```text
5 scuole × 13 carte × 5 corsie × 4 byte
```

La terna nulla rappresenta il passaggio del turno.

## Curva della vita recuperata

Il valore base della vita non è lineare. La routine applica una curva a segmenti e moltiplica il risultato per 65:

```text
HP <=   5: HP × 80
HP <=  10: 400  + (HP - 5)   × 50
HP <=  15: 650  + (HP - 10)  × 30
HP <=  20: 800  + (HP - 15)  × 20
HP <=  30: 900  + (HP - 20)  × 15
HP <=  40: 1050 + (HP - 30)  × 10
HP <=  50: 1150 + (HP - 40)  × 5
HP <= 150: 1200 + (HP - 50)
HP <= 750: 1300 + trunc((HP - 150) / 2)
oltre 750: 1600 + trunc((HP - 750) / 3)
```

Questo rende gli ultimi punti vita molto più importanti di una semplice valutazione lineare.

## Difficoltà

| Livello | Nome | Rumore recuperato | Simulazione |
|---:|---|---|---|
| 1 | Novice Mage | `random(8)+2` | 2 fasi d’attacco |
| 2 | Advanced Mage | `random(4)+3` | 2 fasi d’attacco |
| 3 | Expert Mage | `random(4)+15` | 2 fasi d’attacco |
| 4 | Master Mage | `random(3)+50` | 2 fasi d’attacco |
| 5 | Archmage | nessun fattore casuale | 3 fasi d’attacco |

L’Arcimago è quindi più forte per due ragioni: non altera casualmente la valutazione e osserva una fase di combattimento aggiuntiva.

## Termini già tradotti nel valutatore

- curva non lineare della vita;
- poteri elementali correnti;
- crescita dei poteri;
- penalità per potere accumulato oltre ciò che serve alla mano;
- bonus della scuola di specializzazione;
- attacco della creatura;
- vita attuale e vita massima;
- attacco dipendente dal potere;
- riduzione del valore di alcuni duplicati;
- creature multi-bersaglio;
- modificatori permanenti dei poteri;
- casi speciali già identificati, tra cui Phoenix, Ice Guard e Sea Sprite;
- orizzonte differente tra livelli 1–4 e livello 5.

## Struttura carta recuperata

Per ciascuna delle 65 carte è stato estratto un record con:

- attacco base;
- vita massima;
- codice abilità;
- flag multi-bersaglio;
- due coppie scuola/modifica permanente;
- soglia di potere utilizzata dall’IA.

I record convertiti si trovano in `src/data/astral-ai-card-metadata.js`.

## Integrazione v0.15

La pagina carica ora esplicitamente:

```text
original-cards.js
astral-ai-card-metadata.js
original-rules.js
astral-ai-re.js
```

Quando è selezionato il set Astral, `src/ui/app.js` richiama `chooseRecoveredAstralMove`. La v0.14 conteneva i moduli ma non li caricava nella pagina principale: questo difetto è stato corretto.

## Limiti ancora aperti

- Non tutti gli effetti delle 65 carte sono ancora simulati con la semantica originale.
- Il bonus immediato associato all’esito della mossa deve essere separato completamente dal valore statico dello stato.
- Alcuni rami dell’assembler non sono ancora associati con certezza a una carta specifica.
- La fedeltà finale richiederà un confronto dinamico mossa-per-mossa con `astral.exe`.

## Indirizzi di riferimento

- `BestMove`: `0x44C3C8`
- valutatore lato: `0x44BB14`
- differenza dei lati: `0x44C398`
- lettura difficoltà: `0x4529C0`
- valutatore attacco: `0x447A4C`
