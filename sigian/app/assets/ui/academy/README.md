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
| Atrium | 50% | 44% |
| School Wing | 24% | 19% |
| Study Library | 76% | 24% |
| Arcane Forge | 21% | 65% |
| Trial Hall | 48% | 87% |
| Academy Arena | 78% | 69% |

A replacement artwork must preserve these landmark centers closely enough that the HTML hotspots still sit on the intended structures.

## Final raster target

Preferred production asset:
- `academy-campus-map.webp`;
- exact 4:5 composition;
- no embedded UI/text;
- painterly premium fantasy environment;
- enough detail for a CSS width up to roughly 720 px;
- keep the existing SVG only as development/fallback scaffold until the raster is explicitly approved and committed.

Replacing the artwork must not require changes to Academy progression, navigation, gates or hotspot semantics.
