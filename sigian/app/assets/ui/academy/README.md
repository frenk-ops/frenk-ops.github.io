# Academy map artwork contract

The Academy uses one **mobile-first portrait 4:5** map for every viewport.

## Runtime separation

The artwork is presentation only. HTML remains authoritative for:
- hotspot interaction;
- location labels and states;
- accessibility/focus;
- gates and disabled actions;
- contextual detail content.

Do not bake player-facing text, state labels, buttons or progression into the image.

## Canonical composition

The current coordinate space is `portrait-v1`, shared by mobile and desktop.

| Location | X | Y |
| --- | ---: | ---: |
| Atrium | 50% | 43% |
| School Wing | 22% | 17% |
| Study Library | 80% | 19% |
| Arcane Forge | 19% | 62% |
| Trial Hall | 49% | 80% |
| Academy Arena | 80% | 65% |

A replacement artwork must preserve these landmark centers closely enough that the HTML hotspots still sit on the intended structures.

## Raster candidate — v0.61.37

The repository now contains `academy-campus-map.webp` as the first premium raster candidate:
- 1200 × 1500 (exact 4:5);
- painterly fantasy environment;
- no embedded player-facing text or UI;
- six landmark zones aligned to the canonical HTML hotspots;
- WebP is the preferred runtime source;
- the existing SVG remains the explicit fallback and structural reference.

The candidate is intentionally replaceable: final art-direction approval may swap the WebP while preserving this coordinate contract. Replacing the artwork must not require changes to Academy progression, navigation, gates or hotspot semantics.
