(function (A) {
  "use strict";

  function targetModifier(cardId, suffix, side, kind, school) {
    return {
      id: `${cardId}:${suffix}:target`,
      kind: A.SIGIAN_MODIFIER_KINDS.TARGET,
      params: { side, kind, ...(school ? { school } : {}) }
    };
  }

  function constantModifier(cardId, suffix, value) {
    return {
      id: `${cardId}:${suffix}:scale`,
      kind: A.SIGIAN_MODIFIER_KINDS.SCALE,
      params: { mode: A.SIGIAN_SCALE_MODES.CONSTANT, value }
    };
  }

  function effect(cardId, suffix, effectName, target, amount) {
    return {
      id: `${cardId}:${suffix}`,
      kind: A.SIGIAN_SIGIL_KINDS.EFFECT,
      effect: effectName,
      modifiers: [
        targetModifier(cardId, suffix, target.side, target.kind, target.school),
        constantModifier(cardId, suffix, amount)
      ]
    };
  }

  const SELF_HERO = Object.freeze({ side: A.SIGIAN_TARGET_SIDES.SELF, kind: A.SIGIAN_TARGET_KINDS.HERO });
  const ENEMY_HERO = Object.freeze({ side: A.SIGIAN_TARGET_SIDES.ENEMY, kind: A.SIGIAN_TARGET_KINDS.HERO });
  const SELF_CREATURES = Object.freeze({ side: A.SIGIAN_TARGET_SIDES.SELF, kind: A.SIGIAN_TARGET_KINDS.CREATURES });
  const ENEMY_CREATURES = Object.freeze({ side: A.SIGIAN_TARGET_SIDES.ENEMY, kind: A.SIGIAN_TARGET_KINDS.CREATURES });

  const NATIVE_SPECS = Object.freeze({
    astral_fire_01: Object.freeze([
      effect("astral_fire_01", "damage-enemy-creatures", A.SIGIAN_EFFECTS.DAMAGE, ENEMY_CREATURES, 3)
    ]),
    astral_fire_05: Object.freeze([
      effect("astral_fire_05", "reduce-enemy-nature", A.SIGIAN_EFFECTS.POWER, {
        side: A.SIGIAN_TARGET_SIDES.ENEMY,
        kind: A.SIGIAN_TARGET_KINDS.POWER,
        school: "nature"
      }, -2)
    ]),
    astral_water_02: Object.freeze([
      effect("astral_water_02", "gain-own-nature", A.SIGIAN_EFFECTS.POWER, {
        side: A.SIGIAN_TARGET_SIDES.SELF,
        kind: A.SIGIAN_TARGET_KINDS.POWER,
        school: "nature"
      }, 1)
    ]),
    astral_water_07: Object.freeze([
      effect("astral_water_07", "damage-enemy-hero", A.SIGIAN_EFFECTS.DAMAGE, ENEMY_HERO, 5)
    ]),
    astral_air_13: Object.freeze([
      effect("astral_air_13", "damage-enemy-hero", A.SIGIAN_EFFECTS.DAMAGE, ENEMY_HERO, 15)
    ]),
    astral_earth_04: Object.freeze([
      effect("astral_earth_04", "heal-own-hero", A.SIGIAN_EFFECTS.HEAL, SELF_HERO, 5),
      effect("astral_earth_04", "heal-own-creatures", A.SIGIAN_EFFECTS.HEAL, SELF_CREATURES, 5)
    ]),
    astral_death_01: Object.freeze([
      effect("astral_death_01", "damage-own-hero", A.SIGIAN_EFFECTS.DAMAGE, SELF_HERO, 1)
    ]),
    astral_death_07: Object.freeze([
      effect("astral_death_07", "damage-enemy-hero", A.SIGIAN_EFFECTS.DAMAGE, ENEMY_HERO, 9)
    ])
  });

  function nativeFormula(rawCard, sigils) {
    const legacy = A.formulaFromLegacyCard(rawCard);
    const trigger = legacy.type === "creature" ? "onSummon" : "onPlay";
    return A.createFormula({
      id: legacy.id,
      school: legacy.school,
      type: legacy.type,
      stats: legacy.stats,
      presentation: legacy.presentation,
      sigils: sigils.map(sigil => ({ ...sigil, trigger })),
      source: {
        mode: A.SIGIAN_MIGRATION_MODES.NATIVE,
        set: legacy.source.set,
        cardId: legacy.id
      },
      legacySnapshot: legacy.legacySnapshot
    });
  }

  A.SIGIAN_NATIVE_CARD_IDS = Object.freeze(Object.keys(NATIVE_SPECS));
  A.SIGIAN_NATIVE_FORMULA_SPECS = NATIVE_SPECS;

  A.buildSigianFormulaCatalog = function buildSigianFormulaCatalog(cards) {
    const formulas = (cards || []).map(card => {
      const spec = NATIVE_SPECS[card.id];
      return spec ? nativeFormula(card, spec) : A.formulaFromLegacyCard(card);
    });
    const byId = {};
    formulas.forEach(formula => {
      if (byId[formula.id]) throw new Error(`Formula duplicata: ${formula.id}`);
      byId[formula.id] = formula;
    });
    return {
      schemaVersion: A.SIGIAN_FORMULA_SCHEMA_VERSION,
      formulas,
      byId,
      nativeCount: formulas.filter(formula => formula.source.mode === A.SIGIAN_MIGRATION_MODES.NATIVE).length,
      delegatedCount: formulas.filter(formula => formula.source.mode === A.SIGIAN_MIGRATION_MODES.LEGACY_DELEGATED).length
    };
  };
})(window.Arcane = window.Arcane || {});
