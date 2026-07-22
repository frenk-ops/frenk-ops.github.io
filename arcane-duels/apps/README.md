# Arcane Duels v0.19 — Recovered Specializations

Questa versione integra i quattro nuclei recuperati da `astral.exe`:

1. libro iniziale permanente;
2. valutatore delle cinque IA;
3. dispatcher ed effetti delle 65 carte;
4. sei specializzazioni con loadout distinti per le tre leghe.

## Avvio

Su macOS avviare `start_arcane_duels.command`; su Windows avviare
`START_ARCANE_DUELS.bat`. Il server locale apre il browser e si arresta
automaticamente pochi secondi dopo la chiusura dell'ultima scheda del gioco.

È ancora possibile aprire direttamente `index.html`, ma in quel caso non viene
creato alcun processo server da arrestare.

Nel duello Astral è possibile scegliere:

- una delle sei specializzazioni;
- Starting, Advanced o Major League;
- la specializzazione avversaria;
- uno dei cinque livelli IA.

## Novità principali

- i gruppi di abilità sono loadout sostitutivi, non cumulativi;
- Craft, Mystery, Penalty, Meditation e Ancient Knowledge modificano il potere iniziale nel generatore;
- i cinque Lord modificano la crescita della rispettiva scuola;
- Knowledge aggiunge Elementali e creature di livello 13 al libro;
- Skeleton Master e Faery Master schierano una creatura iniziale;
- Souldrinker, Fire Aura, Battle Lord, Stone Skin, Healing Aura e Astral Nets sono attivi;
- Life Penalty e Life Knowledge modificano vita iniziale e massimo;
- gli stessi effetti vengono mantenuti nei cloni usati da `BestMove`;
- rimossa l'errata applicazione automatica dei valori di lega 5/3, 7/5 e 10/8.

## Verifica

- 60 test automatici superati;
- 18 combinazioni specializzazione × lega sottoposte a smoke test;
- mossa IA legale verificata in ogni combinazione;
- sintassi JavaScript e riferimenti HTML verificati.

## Documentazione

- `ASTRAL_ABILITIES_RE_STATUS.md`: stato tecnico del recupero;
- `SPECIALIZATION_MATRIX.md`: matrice completa delle specializzazioni;
- `CHANGELOG_v0.19.md`: modifiche della versione;
- `PRIORITY_ROADMAP.md`: prossimi passi;
- `QA_REPORT_v0.19.txt`: rapporto di collaudo.
