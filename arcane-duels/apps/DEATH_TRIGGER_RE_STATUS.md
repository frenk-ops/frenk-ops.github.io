# Death trigger reverse engineering status — v0.19

## Phoenix

The original description is explicit: Phoenix rebirths whenever it is killed if the owner's Fire power is greater than 9.
The recovered runtime model now treats rebirth as a replacement of death:

1. damage reduces Phoenix to zero or below;
2. the engine checks the owner's current Fire power;
3. at Fire >= 10 Phoenix returns to full printed life in the same slot;
4. no Fire is spent;
5. no generic death event is emitted, so Death Keeper, Wall of Souls and Souldrinker do not count that event;
6. because Fire is not consumed, Phoenix may rebirth again after a later lethal hit.

At Fire <= 9, Phoenix leaves play normally and produces exactly one death event.

## Generic death processing

A creature that actually leaves play produces one death event. For each such event:

- every living Death Keeper grants +1 Death power to its owner;
- every living Wall of Souls heals its owner by 3;
- each active Souldrinker passive heals its owner by 2;
- persistent power-growth modifiers belonging to the dead creature are removed;
- the creature slot becomes empty.

The board is resolved in stable order: player slots 0–4, then enemy slots 0–4. Effects from one resolved death are visible to the following death in the same cleanup pass.

## Confidence

High confidence: Phoenix threshold, full-life rebirth, no Fire cost, repeated rebirth, normal death below threshold.
Medium confidence pending dynamic Windows comparison: exact slot-order behavior when multiple creatures with death-listener abilities die in the same global effect.
