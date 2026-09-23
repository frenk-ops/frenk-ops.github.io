(function (A) {
  "use strict";

  const m = (id, params = {}) => ({ id, params });
  const s = (slotId, sigilId, config = {}, modifiers = [], grade = 1) => ({
    slotId,
    sigilId,
    grade,
    config,
    modifiers
  });

  const specs = {
    astral_fire_01: {
      sigils: [s("wave", "wave", { when: "onPlay", scope: "field" })],
      values: { wave: 3 }
    },
    astral_fire_02: {
      sigils: [s("backlash", "backlash", { when: "onSummon", target: "self-hero" }, [
        m("activation-power-threshold", { school: "nature", op: "lt", value: 6 })
      ])],
      values: { backlash: 4 }
    },
    astral_fire_03: {
      sigils: [
        s("infusion", "infusion", { when: "onPlay", scope: "power", school: "fire" }),
        s("subtraction", "subtraction", { when: "onPlay", scope: "power", school: "water" })
      ],
      values: { infusion: 5, subtraction: 1 },
      compatibilityExtras: "fire-ritual"
    },
    astral_fire_04: {
      sigils: [s("wave", "wave", { when: "onSummon", scope: "front" })],
      values: { wave: 3 }
    },
    astral_fire_05: {
      sigils: [s("subtraction", "subtraction", { when: "onSummon", scope: "power", school: "nature" })],
      values: { subtraction: 2 }
    },
    astral_fire_06: {
      sigils: [s("wave", "wave", { when: "onPlay", scope: "field" }, [
        m("scale-power-half", { school: "fire" })
      ])],
      values: { wave: 4 }
    },
    astral_fire_07: {
      sigils: [
        s("assault", "total-assault"),
        s("erosion", "erosion", { when: "whileAlive", side: "self", scope: "power", school: "fire" })
      ],
      values: { erosion: 1 }
    },
    astral_fire_08: {
      sigils: [s("wave", "wave", { when: "onPlay", scope: "front" }, [
        m("scale-power-half", { school: "fire" })
      ])],
      values: { wave: 4 }
    },
    astral_fire_09: {
      sigils: [s("fury", "combat-fury", { mode: "multiplier", numerator: 3, denominator: 2, stacking: "per-copy" })],
      values: {},
      compatibilityBySlot: { fury: { sourceBaseAttack: 4 } }
    },
    astral_fire_10: {
      sigils: [
        s("arcane-attack", "arcane-attack", { school: "fire" }),
        s("channeling", "channeling", { when: "whileAlive", scope: "power", school: "fire" }),
        s("wave", "wave", { when: "onSummon", scope: "front" })
      ],
      values: { channeling: 1, wave: 3 }
    },
    astral_fire_11: {
      sigils: [s("wave", "wave", { when: "onPlay", scope: "front" }, [
        m("scale-power", { school: "fire" }),
        m("constraint-friendly-fire")
      ])],
      values: { wave: 5 }
    },
    astral_fire_12: {
      sigils: [s("amplification", "arcane-amplification", { mode: "multiplier", numerator: 3, denominator: 2, stacking: "per-copy" })],
      values: {}
    },
    astral_fire_13: {
      sigils: [s("wave", "wave", { when: "onSummon", scope: "field" })],
      values: { wave: 10 }
    },

    astral_water_01: {
      sigils: [s("heal", "heal", { when: "onPlay", target: "self-hero" }, [
        m("scale-power-half", { school: "water" })
      ])],
      values: { heal: 3 }
    },
    astral_water_02: {
      sigils: [s("infusion", "infusion", { when: "onSummon", scope: "power", school: "nature" })],
      values: { infusion: 1 }
    },
    astral_water_03: {
      sigils: [s("wave", "wave", { when: "onPlay", scope: "field" }, [
        m("scale-target-attack")
      ])],
      values: { wave: 0 }
    },
    astral_water_04: {
      sigils: [s("backlash", "backlash", { when: "onBeforeAttack", target: "self-hero" }, [
        m("activation-power-comparison", {
          leftSide: "self", leftSchool: "water",
          rightSide: "enemy", rightSchool: "water",
          op: "lt"
        })
      ])],
      values: { backlash: 2 }
    },
    astral_water_05: {
      sigils: [s("damage", "damage", { when: "onPlay", target: "enemy-hero" }, [
        m("scale-power", { school: "water" })
      ])],
      values: { damage: 3 }
    },
    astral_water_06: {
      sigils: [s("protection", "protection", { mode: "halve", targetScope: "hero", stacking: "per-copy" })],
      values: {}
    },
    astral_water_07: {
      sigils: [s("damage", "damage", { when: "onSummon", target: "enemy-hero" })],
      values: { damage: 5 }
    },
    astral_water_08: {
      sigils: [
        s("wave", "wave", { when: "onPlay", scope: "field" }, [m("constraint-friendly-fire")]),
        s("subtraction", "subtraction", { when: "onPlay", scope: "all-powers", school: "water" })
      ],
      values: { wave: 15, subtraction: 1 }
    },
    astral_water_09: {
      sigils: [
        s("channeling", "channeling", { when: "whileAlive", scope: "power", school: "water" }),
        s("erosion", "erosion", { when: "whileAlive", side: "enemy", scope: "power", school: "water" })
      ],
      values: { channeling: 1, erosion: 1 }
    },
    astral_water_10: {
      sigils: [
        s("arcane-attack", "arcane-attack", { school: "water" }),
        s("channeling", "channeling", { when: "whileAlive", scope: "power", school: "water" }),
        s("heal", "heal", { when: "onSummon", target: "self-hero" })
      ],
      values: { channeling: 1, heal: 8 }
    },
    astral_water_11: {
      sigils: [s("channeling", "channeling", { when: "whileAlive", scope: "all-powers", school: "water" })],
      values: { channeling: 1 }
    },
    astral_water_12: {
      sigils: [s("erosion", "erosion", { when: "whileAlive", side: "enemy", scope: "all-powers", school: "water" })],
      values: { erosion: 1 }
    },
    astral_water_13: {
      sigils: [
        s("channeling", "channeling", { when: "whileAlive", scope: "power", school: "water" }),
        s("erosion", "erosion", { when: "whileAlive", side: "self", scope: "power", school: "fire" })
      ],
      values: { channeling: 1, erosion: 1 }
    },

    astral_air_01: {
      sigils: [s("amplification", "arcane-amplification", { mode: "flat" })],
      values: { amplification: 1 }
    },
    astral_air_02: {
      sigils: [s("damage", "damage", { when: "onSummon", target: "enemy-hero" }, [
        m("activation-power-threshold", { school: "air", op: "gte", value: 6 })
      ])],
      values: { damage: 5 }
    },
    astral_air_03: {
      sigils: [s("channeling", "channeling", { when: "whileAlive", scope: "power", school: "air" })],
      values: { channeling: 1 }
    },
    astral_air_04: {
      sigils: [s("damage", "damage", { when: "onSummon", target: "enemy-creature", selector: "strongest-health" })],
      values: { damage: 5 }
    },
    astral_air_05: {
      sigils: [s("domination", "domination", { when: "onPlay", destination: "own-hero" }, [
        m("selector-highest-attack")
      ])],
      values: { domination: 2 }
    },
    astral_air_06: {
      sigils: [s("damage", "damage", { when: "onPlay", target: "enemy-hero" }, [
        m("scale-power", { school: "air" })
      ])],
      values: { damage: 5 }
    },
    astral_air_07: {
      sigils: [s("eternal-rebirth", "eternal-rebirth", { when: "onSelfDeath", target: "source" }, [
        m("activation-power-threshold", { school: "fire", op: "gte", value: 10 })
      ], 1)],
      values: {}
    },
    astral_air_08: {
      sigils: [s("wave", "wave", { when: "onPlay", scope: "front" }, [
        m("scale-power", { school: "air", min: 0 })
      ])],
      values: { wave: -1 }
    },
    astral_air_09: {
      sigils: [s("destruction", "destruction", { when: "onPlay", target: "enemy-creature" }, [
        m("selector-highest-life")
      ])],
      values: {}
    },
    astral_air_10: {
      sigils: [
        s("arcane-attack", "arcane-attack", { school: "air" }),
        s("channeling", "channeling", { when: "whileAlive", scope: "power", school: "air" }),
        s("damage", "damage", { when: "onSummon", target: "enemy-hero" })
      ],
      values: { channeling: 1, damage: 7 }
    },
    astral_air_11: {
      sigils: [
        s("assault", "total-assault"),
        s("erosion", "erosion", { when: "whileAlive", side: "self", scope: "power", school: "air" })
      ],
      values: { erosion: 1 }
    },
    astral_air_12: {
      sigils: [s("restoration", "restoration", { when: "onSummon", scope: "field" }, [
        m("scale-full-health")
      ])],
      values: { restoration: 0 }
    },
    astral_air_13: {
      sigils: [s("damage", "damage", { when: "onSummon", target: "enemy-hero" })],
      values: { damage: 15 }
    },

    astral_earth_01: {
      sigils: [s("heal", "heal", { when: "onBeforeAttack", target: "self-hero" })],
      values: { heal: 2 }
    },
    astral_earth_02: {
      sigils: [s("protection", "protection", {
        mode: "subtract", targetScope: "hero-and-creatures", stacking: "presence", threshold: 1
      })],
      values: { protection: 1 }
    },
    astral_earth_03: {
      sigils: [s("assault", "total-assault")],
      values: {}
    },
    astral_earth_04: {
      sigils: [s("restoration", "restoration", { when: "onPlay", scope: "front" })],
      values: { restoration: 5 }
    },
    astral_earth_05: {
      sigils: [s("channeling", "channeling", { when: "whileAlive", scope: "power", school: "nature" })],
      values: { channeling: 2 }
    },
    astral_earth_06: {
      sigils: [s("heal", "heal", { when: "onPlay", target: "self-hero" }, [
        m("scale-power-double", { school: "nature" })
      ])],
      values: { heal: 0 }
    },
    astral_earth_07: {
      sigils: [
        s("channeling", "channeling", { when: "whileAlive", scope: "power", school: "death" }),
        s("erosion", "erosion", { when: "whileAlive", side: "self", scope: "power", school: "nature" })
      ],
      values: { channeling: 2, erosion: 1 }
    },
    astral_earth_08: {
      sigils: [s("regeneration", "regeneration", { when: "onBeforeAttack", target: "source" })],
      values: { regeneration: 3 }
    },
    astral_earth_09: {
      sigils: [s("restoration", "restoration", { when: "onBeforeAttack", scope: "front" })],
      values: { restoration: 2 }
    },
    astral_earth_10: {
      sigils: [s("wave", "wave", { when: "onPlay", scope: "field" }, [
        m("constraint-friendly-fire-power-threshold", { school: "nature", op: "lt", value: 12 })
      ])],
      values: { wave: 20 }
    },
    astral_earth_11: {
      sigils: [
        s("arcane-attack", "arcane-attack", { school: "nature" }),
        s("channeling", "channeling", { when: "whileAlive", scope: "power", school: "nature" })
      ],
      values: { channeling: 1 }
    },
    astral_earth_12: {
      sigils: [
        s("regeneration", "regeneration", { when: "onBeforeAttack", target: "source" }),
        s("assault", "total-assault")
      ],
      values: { regeneration: 4 }
    },
    astral_earth_13: {
      sigils: [s("damage", "damage", { when: "onSummon", target: "enemy-creature", selector: "strongest-health" })],
      values: { damage: 18 }
    },

    astral_death_01: {
      sigils: [s("backlash", "backlash", { when: "onSummon", target: "self-hero" })],
      values: { backlash: 1 }
    },
    astral_death_02: {
      sigils: [s("regeneration", "regeneration", { when: "onBeforeAttack", target: "source" })],
      values: { regeneration: 2 }
    },
    astral_death_03: {
      sigils: [
        s("damage", "damage", { when: "onPlay", target: "enemy-hero" }),
        s("subtraction", "subtraction", { when: "onPlay", scope: "all-powers", school: "death" })
      ],
      values: { damage: 1, subtraction: 1 }
    },
    astral_death_04: {
      sigils: [s("infusion", "infusion", { when: "onSummon", scope: "power", school: "death" }, [
        m("activation-on-any-death")
      ])],
      values: { infusion: 1 }
    },
    astral_death_05: {
      sigils: [s("channeling", "channeling", { when: "whileAlive", scope: "power", school: "fire" })],
      values: { channeling: 1 }
    },
    astral_death_06: {
      sigils: [s("subtraction", "subtraction", { when: "onSummon", scope: "all-powers", school: "death" })],
      values: { subtraction: 1 }
    },
    astral_death_07: {
      sigils: [s("damage", "damage", { when: "onSummon", target: "enemy-hero" })],
      values: { damage: 9 }
    },
    astral_death_08: {
      sigils: [
        s("damage", "damage", { when: "onPlay", target: "enemy-hero" }, [
          m("scale-power-half", { school: "death" })
        ]),
        s("absorption", "absorption", {
          sourceTarget: "any", healTarget: "self-hero", numerator: 1, denominator: 1
        })
      ],
      values: { damage: 5 }
    },
    astral_death_09: {
      sigils: [s("heal", "heal", { target: "self-hero" }, [
        m("activation-on-any-death")
      ])],
      values: { heal: 3 },
      compatibilityBySlot: { heal: { reason: "wall_of_souls" } }
    },
    astral_death_10: {
      sigils: [s("wave", "wave", { when: "onSummon", scope: "front" })],
      values: { wave: 4 }
    },
    astral_death_11: {
      sigils: [s("absorption", "absorption", {
        sourceTarget: "creature", healTarget: "source", numerator: 1, denominator: 2
      })],
      values: {}
    },
    astral_death_12: {
      sigils: [
        s("annihilation", "annihilation", { when: "onPlay", scope: "all-field" }),
        s("heal", "heal", { when: "onPlay", target: "self-hero" }, [
          m("scale-creature-count")
        ])
      ],
      values: { heal: 4 }
    },
    astral_death_13: {
      sigils: [s("tribute", "tribute", { when: "onSummon", scope: "all-powers", school: "death" })],
      values: { tribute: 1 }
    }
  };

  function buildRecipe(card, spec) {
    return A.createFormulaRecipe({
      id: card.id,
      school: card.school,
      type: card.type,
      stats: {
        attack: card.attack,
        health: card.health
      },
      presentation: {
        name: card.name,
        text: card.text,
        keyword: card.keyword,
        art: card.art,
        imageKey: card.imageKey
      },
      sigils: spec.sigils,
      metadata: {
        sourceSet: card.set || "astral-original",
        officialBaseSet: true
      }
    });
  }

  function fireRitualCompatibilitySigils(recipe) {
    return [{
      id: `${recipe.id}:compat-fire-ritual`,
      trigger: "onPlay",
      effect: A.SIGIAN_EFFECTS.EMIT,
      modifiers: [{
        id: `${recipe.id}:compat-fire-ritual:config`,
        kind: A.SIGIAN_MODIFIER_KINDS.CONFIG,
        params: {
          type: "astralFireRitual",
          values: {
            side: { literal: "acting-side" },
            fire: { side: A.SIGIAN_TARGET_SIDES.SELF, kind: A.SIGIAN_TARGET_KINDS.POWER, school: "fire" },
            enemyWater: { side: A.SIGIAN_TARGET_SIDES.ENEMY, kind: A.SIGIAN_TARGET_KINDS.POWER, school: "water" }
          }
        }
      }]
    }];
  }

  function compileOfficial(card, spec, recipe) {
    return A.compileFormulaRecipe(recipe, {
      level: card.level,
      set: card.set || "astral-original",
      legacySnapshot: card,
      resolveGradeValue: ({ sigil }) => {
        if (!Object.prototype.hasOwnProperty.call(spec.values || {}, sigil.slotId)) return 0;
        return spec.values[sigil.slotId];
      },
      compatibilityBySlot: spec.compatibilityBySlot || {},
      compatibilityTechnicalSigils: spec.compatibilityExtras === "fire-ritual"
        ? ({ recipe: compiledRecipe }) => fireRitualCompatibilitySigils(compiledRecipe)
        : null
    });
  }

  A.SIGIAN_BASE_RECIPE_SPECS = Object.freeze(specs);
  A.SIGIAN_BASE_RECIPE_IDS = Object.freeze(Object.keys(specs));

  A.buildSigianBaseRecipeCatalog = function buildSigianBaseRecipeCatalog(cards) {
    const recipes = (cards || []).map(card => {
      const spec = specs[card.id];
      if (!spec) throw new Error(`Recipe canonica mancante: ${card.id}`);
      const recipe = buildRecipe(card, spec);
      const validation = A.validateFormulaRecipe(recipe);
      if (!validation.valid) throw new Error(`Recipe canonica ${card.id} non valida: ${validation.errors.join("; ")}`);
      return recipe;
    });
    const byId = {};
    recipes.forEach(recipe => {
      if (byId[recipe.id]) throw new Error(`Recipe canonica duplicata: ${recipe.id}`);
      byId[recipe.id] = recipe;
    });
    return { schemaVersion: A.SIGIAN_RECIPE_SCHEMA_VERSION, recipes, byId };
  };

  A.buildSigianCompiledBaseCatalog = function buildSigianCompiledBaseCatalog(cards) {
    const recipeCatalog = A.buildSigianBaseRecipeCatalog(cards);
    const cardById = Object.fromEntries((cards || []).map(card => [card.id, card]));
    const formulas = recipeCatalog.recipes.map(recipe => {
      const card = cardById[recipe.id];
      const spec = specs[recipe.id];
      return compileOfficial(card, spec, recipe);
    });
    const byId = {};
    formulas.forEach(formula => {
      if (byId[formula.id]) throw new Error(`Formula compilata duplicata: ${formula.id}`);
      byId[formula.id] = formula;
    });
    return {
      schemaVersion: A.SIGIAN_FORMULA_SCHEMA_VERSION,
      formulas,
      byId,
      nativeCount: formulas.length,
      delegatedCount: 0,
      recipeCatalog
    };
  };
})(window.Arcane = window.Arcane || {});
