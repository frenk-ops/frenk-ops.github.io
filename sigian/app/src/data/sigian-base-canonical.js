(function (A) {
  "use strict";

  function component(kind, definitionId, name, options = {}) {
    return Object.freeze({
      kind,
      definitionId,
      name,
      status:"approved",
      ...(options.grade != null ? { grade:Number(options.grade) } : {}),
      ...(options.intensity != null ? { intensity:Number(options.intensity) } : {}),
      ...(options.school ? { school:String(options.school) } : {}),
      ...(options.threshold != null ? { threshold:Number(options.threshold) } : {}),
      ...(options.damage != null ? { damage:Number(options.damage) } : {}),
      ...(options.percent != null ? { percent:Number(options.percent) } : {}),
      ...(options.multiplier != null ? { multiplier:Number(options.multiplier) } : {}),
      ...(options.detail ? { detail:String(options.detail) } : {})
    });
  }

  const S = (definitionId, name, options) => component("sigil", definitionId, name, options);
  const V = (definitionId, name, options) => component("constraint", definitionId, name, options);

  const MAP = Object.freeze({
    // FUOCO
    astral_fire_01: [S("v2-wave", "Onda I", { grade:1, intensity:3, detail:"Infligge 3 danni a tutte le creature nemiche." })],
    astral_fire_02: [V("v2-constraint-scarcity-school", "Carenza Terra II", { grade:2, school:"nature", threshold:6, damage:4, detail:"All'attivazione, se il Potere Terra è inferiore a 6, dopo la risoluzione il proprio Incantatore subisce 4 danni." })],
    astral_fire_03: [
      S("v2-infusion-school", "Infusione Fuoco II", { grade:2, school:"fire", intensity:5, detail:"Aumenta immediatamente di 5 il proprio Potere Fuoco." }),
      S("v2-subtraction-school", "Sottrazione Acqua I", { grade:1, school:"water", intensity:1, detail:"Riduce immediatamente di 1 il Potere Acqua nemico." })
    ],
    astral_fire_04: [S("v2-tide", "Marea I", { grade:1, intensity:3, detail:"Infligge 3 danni a tutte le creature nemiche e all'Incantatore nemico." })],
    astral_fire_05: [S("v2-subtraction-school", "Sottrazione Terra I", { grade:1, school:"nature", intensity:2, detail:"Riduce immediatamente di 2 il Potere Terra nemico." })],
    astral_fire_06: [S("v2-wave-power-minor", "Onda Potere Minore Fuoco II", { grade:2, school:"fire", intensity:4, detail:"Infligge floor(Potere Fuoco/2)+4 a tutte le creature nemiche." })],
    astral_fire_07: [
      S("v2-total-assault", "Assalto Totale", { detail:"Quando attacca, colpisce l'Incantatore nemico e tutte le creature nemiche." }),
      V("v2-constraint-erosion-school", "Erosione Fuoco I", { grade:1, school:"fire", intensity:1, detail:"La crescita del proprio Potere Fuoco è ridotta di 1." })
    ],
    astral_fire_08: [S("v2-tide-power-minor", "Marea Potere Minore Fuoco II", { grade:2, school:"fire", intensity:4, detail:"Infligge floor(Potere Fuoco/2)+4 alle creature nemiche e all'Incantatore nemico." })],
    astral_fire_09: [S("v2-allied-amplification", "Amplificazione Alleati II", { grade:2, percent:50, detail:"Le creature alleate infliggono il 50% di danno da combattimento in più. Non cumulabile con copie della stessa identità." })],
    astral_fire_10: [
      S("v2-arcane-attack-school", "Attacco Arcano Fuoco", { school:"fire", detail:"L'Attacco della creatura è pari al proprio Potere Fuoco." }),
      S("v2-channeling-school", "Canalizzazione Fuoco I", { grade:1, school:"fire", intensity:1, detail:"La crescita del proprio Potere Fuoco aumenta di 1." }),
      S("v2-tide", "Marea I", { grade:1, intensity:3, detail:"All'evocazione infligge 3 danni alle creature nemiche e all'Incantatore nemico." })
    ],
    astral_fire_11: [
      S("v2-tide-power", "Marea Potere Fuoco II", { grade:2, school:"fire", intensity:5, detail:"Infligge Potere Fuoco+5 alle creature nemiche e all'Incantatore nemico." }),
      V("v2-constraint-friendly-fire", "Fuoco Amico", { detail:"Il danno ad area compatibile colpisce anche le creature alleate, mai il proprio Incantatore." })
    ],
    astral_fire_12: [S("v2-spell-amplification-powerful", "Amplificazione Magie Potente II", { grade:2, percent:50, multiplier:1.5, detail:"Le Magie ottengono un bonus pari al 50% del loro danno base. Non cumulabile con copie della stessa identità." })],
    astral_fire_13: [S("v2-wave", "Onda III", { grade:3, intensity:10, detail:"Infligge 10 danni a tutte le creature nemiche." })],

    // ACQUA
    astral_water_01: [S("v2-heal-power-minor-hero", "Cura Potere Minore Acqua I", { grade:1, school:"water", intensity:3, detail:"Cura il proprio Incantatore di floor(Potere Acqua/2)+3." })],
    astral_water_02: [S("v2-infusion-school", "Infusione Terra I", { grade:1, school:"nature", intensity:1, detail:"Aumenta immediatamente di 1 il proprio Potere Terra." })],
    astral_water_03: [S("v2-justice", "Giustizia", { detail:"Ogni creatura nemica subisce danno pari al proprio Attacco attuale." })],
    astral_water_04: [V("v2-constraint-weakness-school", "Debolezza Acqua I", { grade:1, school:"water", damage:2, detail:"Prima di ogni attacco, se il proprio Potere Acqua è inferiore al Potere Acqua nemico, il proprio Incantatore subisce 2 danni." })],
    astral_water_05: [S("v2-damage-power-hero", "Danno Potere Acqua I", { grade:1, school:"water", intensity:3, detail:"Infligge Potere Acqua+3 all'Incantatore nemico." })],
    astral_water_06: [S("v2-protection-hero", "Protezione Incantatore II", { grade:2, percent:50, detail:"Riduce del 50% ogni danno subito dal proprio Incantatore. Non cumulabile con copie della stessa identità." })],
    astral_water_07: [S("v2-damage-hero", "Danno Incantatore II", { grade:2, intensity:5, detail:"Infligge 5 danni all'Incantatore nemico." })],
    astral_water_08: [
      S("v2-wave", "Onda IV", { grade:4, intensity:15, detail:"Infligge 15 danni a tutte le creature nemiche." }),
      S("v2-subtraction-all", "Sottrazione Totale I", { grade:1, intensity:1, detail:"Riduce immediatamente di 1 tutti i Poteri nemici." }),
      V("v2-constraint-friendly-fire", "Fuoco Amico", { detail:"L'Onda colpisce anche tutte le creature alleate." })
    ],
    astral_water_09: [
      S("v2-channeling-school", "Canalizzazione Acqua I", { grade:1, school:"water", intensity:1, detail:"La crescita del proprio Potere Acqua aumenta di 1." }),
      S("v2-enemy-erosion-school", "Erosione Nemica Acqua I", { grade:1, school:"water", intensity:1, detail:"La crescita del Potere Acqua nemico è ridotta di 1." })
    ],
    astral_water_10: [
      S("v2-arcane-attack-school", "Attacco Arcano Acqua", { school:"water", detail:"L'Attacco della creatura è pari al proprio Potere Acqua." }),
      S("v2-channeling-school", "Canalizzazione Acqua I", { grade:1, school:"water", intensity:1, detail:"La crescita del proprio Potere Acqua aumenta di 1." }),
      S("v2-heal-hero", "Cura Incantatore III", { grade:3, intensity:8, detail:"All'evocazione cura di 8 il proprio Incantatore." })
    ],
    astral_water_11: [S("v2-channeling-all", "Canalizzazione Totale I", { grade:1, intensity:1, detail:"La crescita di tutti i propri Poteri aumenta di 1." })],
    astral_water_12: [S("v2-enemy-erosion-all", "Erosione Nemica Totale I", { grade:1, intensity:1, detail:"La crescita di tutti i Poteri nemici è ridotta di 1." })],
    astral_water_13: [
      S("v2-channeling-school", "Canalizzazione Acqua I", { grade:1, school:"water", intensity:1, detail:"La crescita del proprio Potere Acqua aumenta di 1." }),
      V("v2-constraint-erosion-school", "Erosione Fuoco I", { grade:1, school:"fire", intensity:1, detail:"La crescita del proprio Potere Fuoco è ridotta di 1." })
    ],

    // ARIA
    astral_air_01: [S("v2-spell-amplification-flat", "Amplificazione Magie I", { grade:1, intensity:1, detail:"Le proprie Magie infliggono +1 danno. Non cumulabile con copie della stessa identità." })],
    astral_air_02: [
      S("v2-damage-hero", "Danno Incantatore II", { grade:2, intensity:5, detail:"All'evocazione infligge 5 danni all'Incantatore nemico." }),
      V("v2-constraint-threshold-school", "Soglia Aria II", { grade:2, school:"air", threshold:6, detail:"I Sigilli sono attivi solo se il proprio Potere Aria è almeno 6." })
    ],
    astral_air_03: [S("v2-channeling-school", "Canalizzazione Aria I", { grade:1, school:"air", intensity:1, detail:"La crescita del proprio Potere Aria aumenta di 1." })],
    astral_air_04: [S("v2-abbattimento", "Abbattimento II", { grade:2, intensity:5, detail:"Infligge 5 danni alla creatura nemica con più Vita." })],
    astral_air_05: [S("v2-domination", "Dominio II", { grade:2, intensity:2, detail:"Le 2 creature nemiche con Attacco più alto colpiscono il proprio Incantatore." })],
    astral_air_06: [S("v2-damage-power-hero", "Danno Potere Aria II", { grade:2, school:"air", intensity:5, detail:"Infligge Potere Aria+5 all'Incantatore nemico." })],
    astral_air_07: [
      S("v2-eternal-rebirth", "Rinascita Eterna", { detail:"Quando viene distrutta ritorna a Vita piena ripetutamente, finché il Vincolo resta soddisfatto." }),
      V("v2-constraint-threshold-school", "Soglia Fuoco III", { grade:3, school:"fire", threshold:10, detail:"Rinascita Eterna è attiva solo con Potere Fuoco almeno 10." })
    ],
    astral_air_08: [S("v2-tide-power-reduced", "Marea Potere Ridotta Aria", { school:"air", detail:"Infligge max(0, Potere Aria−1) alle creature nemiche e all'Incantatore nemico." })],
    astral_air_09: [S("v2-uprooting", "Sradicamento", { detail:"Distrugge la creatura nemica con più Vita." })],
    astral_air_10: [
      S("v2-arcane-attack-school", "Attacco Arcano Aria", { school:"air", detail:"L'Attacco della creatura è pari al proprio Potere Aria." }),
      S("v2-channeling-school", "Canalizzazione Aria I", { grade:1, school:"air", intensity:1, detail:"La crescita del proprio Potere Aria aumenta di 1." }),
      S("v2-damage-hero", "Danno Incantatore III", { grade:3, intensity:7, detail:"All'evocazione infligge 7 danni all'Incantatore nemico." })
    ],
    astral_air_11: [
      S("v2-total-assault", "Assalto Totale", { detail:"Quando attacca, colpisce l'Incantatore nemico e tutte le creature nemiche." }),
      V("v2-constraint-erosion-school", "Erosione Aria I", { grade:1, school:"air", intensity:1, detail:"La crescita del proprio Potere Aria è ridotta di 1." })
    ],
    astral_air_12: [S("v2-full-recovery", "Recupero Totale", { detail:"All'evocazione cura completamente tutte le creature alleate." })],
    astral_air_13: [S("v2-damage-hero", "Danno Incantatore IV", { grade:4, intensity:15, detail:"All'evocazione infligge 15 danni all'Incantatore nemico." })],

    // TERRA
    astral_earth_01: [S("v2-recurring-heal-hero", "Cura Ricorrente Incantatore II", { grade:2, intensity:2, detail:"Prima di ogni attacco cura di 2 il proprio Incantatore." })],
    astral_earth_02: [S("v2-arcane-armor", "Armatura Arcana I", { grade:1, intensity:1, detail:"Riduce di 1 ogni istanza di danno superiore a 1 al proprio Incantatore o alle creature alleate; il danno non scende mai sotto 1." })],
    astral_earth_03: [S("v2-total-assault", "Assalto Totale", { detail:"Quando attacca, colpisce l'Incantatore nemico e tutte le creature nemiche." })],
    astral_earth_04: [S("v2-recovery", "Recupero II", { grade:2, intensity:5, detail:"Cura di 5 il proprio Incantatore e tutte le creature alleate." })],
    astral_earth_05: [S("v2-channeling-school", "Canalizzazione Terra II", { grade:2, school:"nature", intensity:2, detail:"La crescita del proprio Potere Terra aumenta di 2." })],
    astral_earth_06: [S("v2-heal-power-major-hero", "Cura Potere Maggiore Terra I", { grade:1, school:"nature", intensity:0, detail:"Cura il proprio Incantatore di 2×Potere Terra." })],
    astral_earth_07: [
      S("v2-channeling-school", "Canalizzazione Morte II", { grade:2, school:"death", intensity:2, detail:"La crescita del proprio Potere Morte aumenta di 2." }),
      V("v2-constraint-erosion-school", "Erosione Terra I", { grade:1, school:"nature", intensity:1, detail:"La crescita del proprio Potere Terra è ridotta di 1." })
    ],
    astral_earth_08: [S("v2-regeneration", "Rigenerazione III", { grade:3, intensity:3, detail:"Prima di ogni attacco la creatura recupera 3 Vita." })],
    astral_earth_09: [S("v2-recurring-recovery", "Recupero Ricorrente II", { grade:2, intensity:2, detail:"Prima di ogni attacco cura di 2 il proprio Incantatore e tutte le creature alleate." })],
    astral_earth_10: [
      S("v2-wave", "Onda V", { grade:5, intensity:20, detail:"Infligge 20 danni a tutte le creature nemiche." }),
      V("v2-constraint-friendly-fire-limit", "Fuoco Amico Limite Terra IV", { grade:4, school:"nature", threshold:12, detail:"Se il Potere Terra è inferiore a 12, l'Onda colpisce anche le creature alleate; non è un gate." })
    ],
    astral_earth_11: [
      S("v2-arcane-attack-school", "Attacco Arcano Terra", { school:"nature", detail:"L'Attacco della creatura è pari al proprio Potere Terra." }),
      S("v2-channeling-school", "Canalizzazione Terra I", { grade:1, school:"nature", intensity:1, detail:"La crescita del proprio Potere Terra aumenta di 1." })
    ],
    astral_earth_12: [
      S("v2-regeneration", "Rigenerazione IV", { grade:4, intensity:4, detail:"Prima di ogni attacco la creatura recupera 4 Vita." }),
      S("v2-total-assault", "Assalto Totale", { detail:"Quando attacca, colpisce l'Incantatore nemico e tutte le creature nemiche." })
    ],
    astral_earth_13: [S("v2-abbattimento", "Abbattimento V", { grade:5, intensity:18, detail:"Infligge 18 danni alla creatura nemica con più Vita." })],

    // MORTE
    astral_death_01: [V("v2-constraint-backlash", "Contraccolpo I", { grade:1, damage:1, detail:"Dopo l'attivazione della Formula, il proprio Incantatore subisce 1 danno." })],
    astral_death_02: [S("v2-regeneration", "Rigenerazione II", { grade:2, intensity:2, detail:"Prima di ogni attacco la creatura recupera 2 Vita." })],
    astral_death_03: [
      S("v2-damage-hero", "Danno Incantatore I", { grade:1, intensity:1, detail:"Infligge 1 danno all'Incantatore nemico." }),
      S("v2-subtraction-all", "Sottrazione Totale I", { grade:1, intensity:1, detail:"Riduce immediatamente di 1 tutti i Poteri nemici." })
    ],
    astral_death_04: [S("v2-necromantic-resonance", "Risonanza Necromantica I", { grade:1, intensity:1, detail:"Ogni volta che una creatura muore, aumenta di 1 il proprio Potere Morte." })],
    astral_death_05: [S("v2-channeling-school", "Canalizzazione Fuoco I", { grade:1, school:"fire", intensity:1, detail:"La crescita del proprio Potere Fuoco aumenta di 1." })],
    astral_death_06: [S("v2-subtraction-all", "Sottrazione Totale I", { grade:1, intensity:1, detail:"All'evocazione riduce di 1 tutti i Poteri nemici." })],
    astral_death_07: [S("v2-damage-hero", "Danno Incantatore III", { grade:3, intensity:9, detail:"All'evocazione infligge 9 danni all'Incantatore nemico." })],
    astral_death_08: [
      S("v2-damage-power-minor-hero", "Danno Potere Minore Morte II", { grade:2, school:"death", intensity:5, detail:"Infligge floor(Potere Morte/2)+5 all'Incantatore nemico." }),
      S("v2-life-drain", "Drenaggio Vitale IV", { grade:4, percent:100, detail:"Il proprio Incantatore recupera Vita pari al 100% del danno effettivamente inflitto dalla Formula all'Incantatore nemico." })
    ],
    astral_death_09: [S("v2-vital-resonance", "Risonanza Vitale III", { grade:3, intensity:3, detail:"Ogni volta che una creatura muore, cura di 3 il proprio Incantatore." })],
    astral_death_10: [S("v2-tide", "Marea II", { grade:2, intensity:4, detail:"All'evocazione infligge 4 danni alle creature nemiche e all'Incantatore nemico." })],
    astral_death_11: [S("v2-vampirism", "Vampirismo II", { grade:2, percent:50, detail:"La creatura recupera Vita pari al 50% del danno effettivamente inflitto." })],
    astral_death_12: [S("v2-soul-harvest", "Mietitura d'Anime", { intensity:4, detail:"Distrugge tutte le creature e cura il proprio Incantatore di 4 per ogni creatura presente sul campo al momento della risoluzione." })],
    astral_death_13: [V("v2-constraint-tribute-all", "Tributo Totale I", { grade:1, intensity:1, detail:"Dopo la risoluzione perde 1 punto in ciascun proprio Potere, con minimo 0." })]
  });

  function clone(value) {
    if (typeof A.deepClone === "function") return A.deepClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  A.SIGIAN_BASE_CANONICAL_COMPONENTS = MAP;

  A.getSigianBaseCanonicalComponents = function getSigianBaseCanonicalComponents(cardId) {
    return clone(MAP[String(cardId || "")] || []);
  };

  A.validateSigianBaseCanonicalComponents = function validateSigianBaseCanonicalComponents(cards = []) {
    const errors = [];
    const ids = (cards || []).map(card => String(card.id || "")).filter(Boolean);
    ids.forEach(cardId => {
      const components = MAP[cardId];
      if (!Array.isArray(components) || components.length === 0) {
        errors.push(`Mappatura canonica mancante: ${cardId}`);
        return;
      }
      const sigils = components.filter(item => item.kind === "sigil");
      const constraints = components.filter(item => item.kind === "constraint");
      if (sigils.length > 3) errors.push(`${cardId}: più di 3 Sigilli canonici`);
      if (constraints.length > 1) errors.push(`${cardId}: più di 1 Vincolo canonico`);
      components.forEach(item => {
        const definition = A.getSigianCanonicalV2?.(item.definitionId);
        if (!definition) errors.push(`${cardId}: definizione canonica assente ${item.definitionId}`);
        else if (definition.status !== "approved") errors.push(`${cardId}: definizione non approvata ${item.definitionId}`);
      });
    });
    Object.keys(MAP).forEach(cardId => {
      if (!ids.includes(cardId)) errors.push(`Mappatura canonica senza carta originale: ${cardId}`);
    });
    return {
      valid: errors.length === 0,
      errors,
      cardCount: ids.length,
      mappedCount: Object.keys(MAP).length
    };
  };
})(window.Arcane = window.Arcane || {});
