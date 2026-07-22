# v0.19 — Recovered death triggers

- extracted single-death resolution from cleanup logic;
- Phoenix rebirth is resolved before generic death listeners;
- Phoenix keeps its slot, returns to full life and does not spend Fire;
- a reborn Phoenix does not trigger Death Keeper, Wall of Souls or Souldrinker;
- below 10 Fire, Phoenix dies normally and triggers listeners once;
- repeated Phoenix rebirth is supported;
- deterministic board cleanup order documented;
- added targeted regression tests for death replacement and threshold behavior.
