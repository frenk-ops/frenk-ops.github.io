(function (A) {
  "use strict";

  function modifier(cardId, suffix, kind, params) {
    return {
      id: `${cardId}:${suffix}:${kind}`,
      kind,
      params: { ...(params || {}) }
    };
  }

  function target(cardId, suffix, side, kind, options = {}) {
    return modifier(cardId, suffix, A.SIGIAN_MODIFIER_KINDS.TARGET, { side, kind, ...options });
  }

  function scale(cardId, suffix, mode, options = {}) {
    return modifier(cardId, suffix, A.SIGIAN_MODIFIER_KINDS.SCALE, { mode, ...options });
  }

  function condition(cardId, suffix, params) {
    return modifier(cardId, suffix, A.SIGIAN_MODIFIER_KINDS.CONDITION, params);
  }

  function config(cardId, suffix, params) {
    return modifier(cardId, suffix, A.SIGIAN_MODIFIER_KINDS.CONFIG, params);
  }

  function sigil(cardId, suffix, trigger, effect, options = {}) {
    const modifiers = [];
    if (options.target) modifiers.push(target(cardId, suffix, options.target.side, options.target.kind, options.target.options));
    if (options.scale) modifiers.push(scale(cardId, suffix, options.scale.mode, options.scale.options));
    if (options.condition) modifiers.push(condition(cardId, suffix, options.condition));
    if (options.config) modifiers.push(config(cardId, suffix, options.config));
    return {
      id: `${cardId}:${suffix}`,
      kind: options.kind || A.SIGIAN_SIGIL_KINDS.EFFECT,
      trigger,
      effect,
      modifiers
    };
  }

  const SELF = A.SIGIAN_TARGET_SIDES.SELF;
  const ENEMY = A.SIGIAN_TARGET_SIDES.ENEMY;
  const BOTH = A.SIGIAN_TARGET_SIDES.BOTH;
  const HERO = A.SIGIAN_TARGET_KINDS.HERO;
  const CREATURES = A.SIGIAN_TARGET_KINDS.CREATURES;
  const CREATURE = A.SIGIAN_TARGET_KINDS.CREATURE;
  const SOURCE = A.SIGIAN_TARGET_KINDS.SOURCE;
  const POWER = A.SIGIAN_TARGET_KINDS.POWER;
  const POWERS = A.SIGIAN_TARGET_KINDS.POWERS;
  const C = A.SIGIAN_SCALE_MODES.CONSTANT;
  const P = A.SIGIAN_SCALE_MODES.SOURCE_POWER;
  const TA = A.SIGIAN_SCALE_MODES.TARGET_ATTACK;
  const DD = A.SIGIAN_SCALE_MODES.DAMAGE_DEALT;
  const CC = A.SIGIAN_SCALE_MODES.CREATURE_COUNT;
  const FH = A.SIGIAN_SCALE_MODES.FULL_HEALTH;

  const t = (side, kind, options) => ({ side, kind, options });
  const c = value => ({ mode: C, options: { value } });
  const p = (school, multiplier = 1, offset = 0, min = null) => ({
    mode: P,
    options: {
      school,
      numerator: multiplier,
      denominator: 1,
      offset,
      round: "floor",
      ...(min == null ? {} : { min })
    }
  });
  const half = (school, offset = 0, min = null) => ({
    mode: P,
    options: {
      school,
      numerator: 1,
      denominator: 2,
      offset,
      round: "floor",
      ...(min == null ? {} : { min })
    }
  });
  const targetAttack = () => ({ mode: TA, options: {} });
  const fullHealth = () => ({ mode: FH, options: {} });
  const creatureCount = (sides, multiplier) => ({ mode: CC, options: { sides, multiplier } });
  const damageDealt = (numerator = 1, denominator = 1) => ({ mode: DD, options: { numerator, denominator, round: "floor" } });

  const specs = {
    astral_fire_01: [
      sigil("astral_fire_01", "damage-enemy-creatures", "onPlay", A.SIGIAN_EFFECTS.DAMAGE, { target: t(ENEMY, CREATURES), scale: c(3) })
    ],
    astral_fire_02: [
      sigil("astral_fire_02", "summon-backlash", "onSummon", A.SIGIAN_EFFECTS.DAMAGE, {
        target: t(SELF, HERO), scale: c(4),
        condition: { left: { side: SELF, kind: POWER, school: "nature" }, op: "lt", right: { value: 6 } }
      })
    ],
    astral_fire_03: [
      sigil("astral_fire_03", "gain-fire", "onPlay", A.SIGIAN_EFFECTS.POWER, { target: t(SELF, POWER, { school: "fire" }), scale: c(5) }),
      sigil("astral_fire_03", "reduce-enemy-water", "onPlay", A.SIGIAN_EFFECTS.POWER, { target: t(ENEMY, POWER, { school: "water" }), scale: c(-1) }),
      sigil("astral_fire_03", "ritual-event", "onPlay", A.SIGIAN_EFFECTS.EMIT, {
        config: {
          type: "astralFireRitual",
          values: {
            side: { literal: "acting-side" },
            fire: { side: SELF, kind: POWER, school: "fire" },
            enemyWater: { side: ENEMY, kind: POWER, school: "water" }
          }
        }
      })
    ],
    astral_fire_04: [
      sigil("astral_fire_04", "damage-enemy-creatures", "onSummon", A.SIGIAN_EFFECTS.DAMAGE, { target: t(ENEMY, CREATURES), scale: c(3) }),
      sigil("astral_fire_04", "damage-enemy-hero", "onSummon", A.SIGIAN_EFFECTS.DAMAGE, { target: t(ENEMY, HERO), scale: c(3) })
    ],
    astral_fire_05: [
      sigil("astral_fire_05", "reduce-enemy-nature", "onSummon", A.SIGIAN_EFFECTS.POWER, { target: t(ENEMY, POWER, { school: "nature" }), scale: c(-2) })
    ],
    astral_fire_06: [
      sigil("astral_fire_06", "flame-wave", "onPlay", A.SIGIAN_EFFECTS.DAMAGE, { target: t(ENEMY, CREATURES), scale: half("fire", 4) })
    ],
    astral_fire_07: [
      sigil("astral_fire_07", "multi-target-attack", "passive", A.SIGIAN_EFFECTS.ATTACK_ALL, { kind: A.SIGIAN_SIGIL_KINDS.PASSIVE }),
      sigil("astral_fire_07", "fire-growth-penalty", "whileAlive", A.SIGIAN_EFFECTS.POWER_GROWTH, { target: t(SELF, POWER, { school: "fire" }), scale: c(-1) })
    ],
    astral_fire_08: [
      sigil("astral_fire_08", "inferno-creatures", "onPlay", A.SIGIAN_EFFECTS.DAMAGE, { target: t(ENEMY, CREATURES), scale: half("fire", 4) }),
      sigil("astral_fire_08", "inferno-hero", "onPlay", A.SIGIAN_EFFECTS.DAMAGE, { target: t(ENEMY, HERO), scale: half("fire", 4) })
    ],
    astral_fire_09: [
      sigil("astral_fire_09", "warlord-aura", "passive", A.SIGIAN_EFFECTS.ATTACK_MULTIPLIER, {
        kind: A.SIGIAN_SIGIL_KINDS.PASSIVE,
        config: { numerator: 3, denominator: 2, stacking: "per-copy", appliesTo: "allied-creatures", sourceBaseAttack: 4 }
      })
    ],
    astral_fire_10: [
      sigil("astral_fire_10", "dynamic-attack", "passive", A.SIGIAN_EFFECTS.ATTACK_FROM_POWER, { kind: A.SIGIAN_SIGIL_KINDS.PASSIVE, config: { school: "fire" } }),
      sigil("astral_fire_10", "fire-growth", "whileAlive", A.SIGIAN_EFFECTS.POWER_GROWTH, { target: t(SELF, POWER, { school: "fire" }), scale: c(1) }),
      sigil("astral_fire_10", "summon-damage-creatures", "onSummon", A.SIGIAN_EFFECTS.DAMAGE, { target: t(ENEMY, CREATURES), scale: c(3) }),
      sigil("astral_fire_10", "summon-damage-hero", "onSummon", A.SIGIAN_EFFECTS.DAMAGE, { target: t(ENEMY, HERO), scale: c(3) })
    ],
    astral_fire_11: [
      sigil("astral_fire_11", "armageddon-creatures", "onPlay", A.SIGIAN_EFFECTS.DAMAGE, { target: t(BOTH, CREATURES), scale: p("fire", 1, 5) }),
      sigil("astral_fire_11", "armageddon-hero", "onPlay", A.SIGIAN_EFFECTS.DAMAGE, { target: t(ENEMY, HERO), scale: p("fire", 1, 5) })
    ],
    astral_fire_12: [
      sigil("astral_fire_12", "spell-damage-aura", "passive", A.SIGIAN_EFFECTS.SPELL_DAMAGE_MULTIPLIER, {
        kind: A.SIGIAN_SIGIL_KINDS.PASSIVE,
        config: { numerator: 3, denominator: 2, stacking: "per-copy" }
      })
    ],
    astral_fire_13: [
      sigil("astral_fire_13", "summon-burn", "onSummon", A.SIGIAN_EFFECTS.DAMAGE, { target: t(ENEMY, CREATURES), scale: c(10) })
    ],

    astral_water_01: [
      sigil("astral_water_01", "cure", "onPlay", A.SIGIAN_EFFECTS.HEAL, { target: t(SELF, HERO), scale: half("water", 3) })
    ],
    astral_water_02: [
      sigil("astral_water_02", "gain-nature", "onSummon", A.SIGIAN_EFFECTS.POWER, { target: t(SELF, POWER, { school: "nature" }), scale: c(1) })
    ],
    astral_water_03: [
      sigil("astral_water_03", "justice", "onPlay", A.SIGIAN_EFFECTS.DAMAGE, { target: t(ENEMY, CREATURES), scale: targetAttack() })
    ],
    astral_water_04: [
      sigil("astral_water_04", "sea-sprite-backlash", "onBeforeAttack", A.SIGIAN_EFFECTS.DAMAGE, {
        target: t(SELF, HERO), scale: c(2),
        condition: {
          left: { side: SELF, kind: POWER, school: "water" },
          op: "lt",
          right: { side: ENEMY, kind: POWER, school: "water" }
        }
      })
    ],
    astral_water_05: [
      sigil("astral_water_05", "ice-bolt", "onPlay", A.SIGIAN_EFFECTS.DAMAGE, { target: t(ENEMY, HERO), scale: p("water", 1, 3) })
    ],
    astral_water_06: [
      sigil("astral_water_06", "ice-guard", "passive", A.SIGIAN_EFFECTS.DAMAGE_REDUCTION, {
        kind: A.SIGIAN_SIGIL_KINDS.PASSIVE,
        config: { targetKinds: ["hero"], mode: "halve", stacking: "per-copy" }
      })
    ],
    astral_water_07: [
      sigil("astral_water_07", "summon-damage", "onSummon", A.SIGIAN_EFFECTS.DAMAGE, { target: t(ENEMY, HERO), scale: c(5) })
    ],
    astral_water_08: [
      sigil("astral_water_08", "acidic-rain", "onPlay", A.SIGIAN_EFFECTS.DAMAGE, { target: t(BOTH, CREATURES), scale: c(15) }),
      sigil("astral_water_08", "reduce-enemy-powers", "onPlay", A.SIGIAN_EFFECTS.POWER_ALL, { target: t(ENEMY, POWERS), scale: c(-1) })
    ],
    astral_water_09: [
      sigil("astral_water_09", "own-water-growth", "whileAlive", A.SIGIAN_EFFECTS.POWER_GROWTH, { target: t(SELF, POWER, { school: "water" }), scale: c(1) }),
      sigil("astral_water_09", "enemy-water-growth", "whileAlive", A.SIGIAN_EFFECTS.POWER_GROWTH, { target: t(ENEMY, POWER, { school: "water" }), scale: c(-1) })
    ],
    astral_water_10: [
      sigil("astral_water_10", "dynamic-attack", "passive", A.SIGIAN_EFFECTS.ATTACK_FROM_POWER, { kind: A.SIGIAN_SIGIL_KINDS.PASSIVE, config: { school: "water" } }),
      sigil("astral_water_10", "water-growth", "whileAlive", A.SIGIAN_EFFECTS.POWER_GROWTH, { target: t(SELF, POWER, { school: "water" }), scale: c(1) }),
      sigil("astral_water_10", "summon-heal", "onSummon", A.SIGIAN_EFFECTS.HEAL, { target: t(SELF, HERO), scale: c(8) })
    ],
    astral_water_11: [
      sigil("astral_water_11", "all-power-growth", "whileAlive", A.SIGIAN_EFFECTS.POWER_GROWTH, { target: t(SELF, POWERS), scale: c(1) })
    ],
    astral_water_12: [
      sigil("astral_water_12", "enemy-all-power-growth", "whileAlive", A.SIGIAN_EFFECTS.POWER_GROWTH, { target: t(ENEMY, POWERS), scale: c(-1) })
    ],
    astral_water_13: [
      sigil("astral_water_13", "water-growth", "whileAlive", A.SIGIAN_EFFECTS.POWER_GROWTH, { target: t(SELF, POWER, { school: "water" }), scale: c(1) }),
      sigil("astral_water_13", "fire-growth-penalty", "whileAlive", A.SIGIAN_EFFECTS.POWER_GROWTH, { target: t(SELF, POWER, { school: "fire" }), scale: c(-1) })
    ],

    astral_air_01: [
      sigil("astral_air_01", "spell-damage-bonus", "passive", A.SIGIAN_EFFECTS.SPELL_DAMAGE_BONUS, { kind: A.SIGIAN_SIGIL_KINDS.PASSIVE, scale: c(1) })
    ],
    astral_air_02: [
      sigil("astral_air_02", "summon-strike", "onSummon", A.SIGIAN_EFFECTS.DAMAGE, {
        target: t(ENEMY, HERO), scale: c(5),
        condition: { left: { side: SELF, kind: POWER, school: "air" }, op: "gte", right: { value: 6 } }
      })
    ],
    astral_air_03: [
      sigil("astral_air_03", "air-growth", "whileAlive", A.SIGIAN_EFFECTS.POWER_GROWTH, { target: t(SELF, POWER, { school: "air" }), scale: c(1) })
    ],
    astral_air_04: [
      sigil("astral_air_04", "wyvern-strike", "onSummon", A.SIGIAN_EFFECTS.DAMAGE, { target: t(ENEMY, CREATURE, { selector: "strongest-health" }), scale: c(5) })
    ],
    astral_air_05: [
      sigil("astral_air_05", "hypnosis", "onPlay", A.SIGIAN_EFFECTS.FORCE_ATTACK, {
        target: t(ENEMY, CREATURES, { selector: "strongest-attack", count: 2 }),
        config: { destination: "own-hero" }
      })
    ],
    astral_air_06: [
      sigil("astral_air_06", "lightning", "onPlay", A.SIGIAN_EFFECTS.DAMAGE, { target: t(ENEMY, HERO), scale: p("air", 1, 5) })
    ],
    astral_air_07: [
      sigil("astral_air_07", "phoenix-rebirth", "onSelfDeath", A.SIGIAN_EFFECTS.RESURRECT, {
        target: t(SELF, SOURCE), scale: fullHealth(),
        condition: { left: { side: SELF, kind: POWER, school: "fire" }, op: "gte", right: { value: 10 } }
      })
    ],
    astral_air_08: [
      sigil("astral_air_08", "chain-creatures", "onPlay", A.SIGIAN_EFFECTS.DAMAGE, { target: t(ENEMY, CREATURES), scale: p("air", 1, -1, 0) }),
      sigil("astral_air_08", "chain-hero", "onPlay", A.SIGIAN_EFFECTS.DAMAGE, { target: t(ENEMY, HERO), scale: p("air", 1, -1, 0) })
    ],
    astral_air_09: [
      sigil("astral_air_09", "tornado", "onPlay", A.SIGIAN_EFFECTS.DESTROY, { target: t(ENEMY, CREATURE, { selector: "strongest-health" }) })
    ],
    astral_air_10: [
      sigil("astral_air_10", "dynamic-attack", "passive", A.SIGIAN_EFFECTS.ATTACK_FROM_POWER, { kind: A.SIGIAN_SIGIL_KINDS.PASSIVE, config: { school: "air" } }),
      sigil("astral_air_10", "air-growth", "whileAlive", A.SIGIAN_EFFECTS.POWER_GROWTH, { target: t(SELF, POWER, { school: "air" }), scale: c(1) }),
      sigil("astral_air_10", "summon-strike", "onSummon", A.SIGIAN_EFFECTS.DAMAGE, { target: t(ENEMY, HERO), scale: c(7) })
    ],
    astral_air_11: [
      sigil("astral_air_11", "multi-target-attack", "passive", A.SIGIAN_EFFECTS.ATTACK_ALL, { kind: A.SIGIAN_SIGIL_KINDS.PASSIVE }),
      sigil("astral_air_11", "air-growth-penalty", "whileAlive", A.SIGIAN_EFFECTS.POWER_GROWTH, { target: t(SELF, POWER, { school: "air" }), scale: c(-1) })
    ],
    astral_air_12: [
      sigil("astral_air_12", "full-heal-allies", "onSummon", A.SIGIAN_EFFECTS.HEAL, { target: t(SELF, CREATURES), scale: fullHealth() })
    ],
    astral_air_13: [
      sigil("astral_air_13", "summon-strike", "onSummon", A.SIGIAN_EFFECTS.DAMAGE, { target: t(ENEMY, HERO), scale: c(15) })
    ],

    astral_earth_01: [
      sigil("astral_earth_01", "attack-heal", "onBeforeAttack", A.SIGIAN_EFFECTS.HEAL, { target: t(SELF, HERO), scale: c(2) })
    ],
    astral_earth_02: [
      sigil("astral_earth_02", "armorer", "passive", A.SIGIAN_EFFECTS.DAMAGE_REDUCTION, {
        kind: A.SIGIAN_SIGIL_KINDS.PASSIVE,
        config: { targetKinds: ["hero", "creature"], mode: "subtract", value: 1, threshold: 1, stacking: "presence" }
      })
    ],
    astral_earth_03: [
      sigil("astral_earth_03", "multi-target-attack", "passive", A.SIGIAN_EFFECTS.ATTACK_ALL, { kind: A.SIGIAN_SIGIL_KINDS.PASSIVE })
    ],
    astral_earth_04: [
      sigil("astral_earth_04", "heal-hero", "onPlay", A.SIGIAN_EFFECTS.HEAL, { target: t(SELF, HERO), scale: c(5) }),
      sigil("astral_earth_04", "heal-creatures", "onPlay", A.SIGIAN_EFFECTS.HEAL, { target: t(SELF, CREATURES), scale: c(5) })
    ],
    astral_earth_05: [
      sigil("astral_earth_05", "nature-growth", "whileAlive", A.SIGIAN_EFFECTS.POWER_GROWTH, { target: t(SELF, POWER, { school: "nature" }), scale: c(2) })
    ],
    astral_earth_06: [
      sigil("astral_earth_06", "rejuvenation", "onPlay", A.SIGIAN_EFFECTS.HEAL, { target: t(SELF, HERO), scale: p("nature", 2, 0) })
    ],
    astral_earth_07: [
      sigil("astral_earth_07", "death-growth", "whileAlive", A.SIGIAN_EFFECTS.POWER_GROWTH, { target: t(SELF, POWER, { school: "death" }), scale: c(2) }),
      sigil("astral_earth_07", "nature-growth-penalty", "whileAlive", A.SIGIAN_EFFECTS.POWER_GROWTH, { target: t(SELF, POWER, { school: "nature" }), scale: c(-1) })
    ],
    astral_earth_08: [
      sigil("astral_earth_08", "regenerate", "onBeforeAttack", A.SIGIAN_EFFECTS.HEAL, { target: t(SELF, SOURCE), scale: c(3) })
    ],
    astral_earth_09: [
      sigil("astral_earth_09", "heal-hero", "onBeforeAttack", A.SIGIAN_EFFECTS.HEAL, { target: t(SELF, HERO), scale: c(2) }),
      sigil("astral_earth_09", "heal-allies", "onBeforeAttack", A.SIGIAN_EFFECTS.HEAL, { target: t(SELF, CREATURES), scale: c(2) })
    ],
    astral_earth_10: [
      sigil("astral_earth_10", "stone-rain-enemy", "onPlay", A.SIGIAN_EFFECTS.DAMAGE, {
        target: t(ENEMY, CREATURES), scale: c(20),
        condition: { left: { side: SELF, kind: POWER, school: "nature" }, op: "gte", right: { value: 12 } }
      }),
      sigil("astral_earth_10", "stone-rain-all", "onPlay", A.SIGIAN_EFFECTS.DAMAGE, {
        target: t(BOTH, CREATURES), scale: c(20),
        condition: { left: { side: SELF, kind: POWER, school: "nature" }, op: "lt", right: { value: 12 } }
      })
    ],
    astral_earth_11: [
      sigil("astral_earth_11", "dynamic-attack", "passive", A.SIGIAN_EFFECTS.ATTACK_FROM_POWER, { kind: A.SIGIAN_SIGIL_KINDS.PASSIVE, config: { school: "nature" } }),
      sigil("astral_earth_11", "nature-growth", "whileAlive", A.SIGIAN_EFFECTS.POWER_GROWTH, { target: t(SELF, POWER, { school: "nature" }), scale: c(1) })
    ],
    astral_earth_12: [
      sigil("astral_earth_12", "regenerate", "onBeforeAttack", A.SIGIAN_EFFECTS.HEAL, { target: t(SELF, SOURCE), scale: c(4) }),
      sigil("astral_earth_12", "multi-target-attack", "passive", A.SIGIAN_EFFECTS.ATTACK_ALL, { kind: A.SIGIAN_SIGIL_KINDS.PASSIVE })
    ],
    astral_earth_13: [
      sigil("astral_earth_13", "giant-strike", "onSummon", A.SIGIAN_EFFECTS.DAMAGE, { target: t(ENEMY, CREATURE, { selector: "strongest-health" }), scale: c(18) })
    ],

    astral_death_01: [
      sigil("astral_death_01", "summon-backlash", "onSummon", A.SIGIAN_EFFECTS.DAMAGE, { target: t(SELF, HERO), scale: c(1) })
    ],
    astral_death_02: [
      sigil("astral_death_02", "regenerate", "onBeforeAttack", A.SIGIAN_EFFECTS.HEAL, { target: t(SELF, SOURCE), scale: c(2) })
    ],
    astral_death_03: [
      sigil("astral_death_03", "curse-damage", "onPlay", A.SIGIAN_EFFECTS.DAMAGE, { target: t(ENEMY, HERO), scale: c(1) }),
      sigil("astral_death_03", "curse-power", "onPlay", A.SIGIAN_EFFECTS.POWER_ALL, { target: t(ENEMY, POWERS), scale: c(-1) })
    ],
    astral_death_04: [
      sigil("astral_death_04", "death-keeper", "onAnyDeath", A.SIGIAN_EFFECTS.POWER, { target: t(SELF, POWER, { school: "death" }), scale: c(1), config: { eventType: "astralDeathKeeper" } })
    ],
    astral_death_05: [
      sigil("astral_death_05", "fire-growth", "whileAlive", A.SIGIAN_EFFECTS.POWER_GROWTH, { target: t(SELF, POWER, { school: "fire" }), scale: c(1) })
    ],
    astral_death_06: [
      sigil("astral_death_06", "ghost-drain", "onSummon", A.SIGIAN_EFFECTS.POWER_ALL, { target: t(ENEMY, POWERS), scale: c(-1) })
    ],
    astral_death_07: [
      sigil("astral_death_07", "summon-strike", "onSummon", A.SIGIAN_EFFECTS.DAMAGE, { target: t(ENEMY, HERO), scale: c(9) })
    ],
    astral_death_08: [
      sigil("astral_death_08", "drain-life", "onPlay", A.SIGIAN_EFFECTS.DRAIN, {
        target: t(ENEMY, HERO),
        scale: half("death", 5),
        config: { healTarget: SELF, healKind: HERO }
      })
    ],
    astral_death_09: [
      sigil("astral_death_09", "wall-of-souls", "onAnyDeath", A.SIGIAN_EFFECTS.HEAL, { target: t(SELF, HERO), scale: c(3), config: { reason: "wall_of_souls" } })
    ],
    astral_death_10: [
      sigil("astral_death_10", "summon-damage-creatures", "onSummon", A.SIGIAN_EFFECTS.DAMAGE, { target: t(ENEMY, CREATURES), scale: c(4) }),
      sigil("astral_death_10", "summon-damage-hero", "onSummon", A.SIGIAN_EFFECTS.DAMAGE, { target: t(ENEMY, HERO), scale: c(4) })
    ],
    astral_death_11: [
      sigil("astral_death_11", "vampire", "passive", A.SIGIAN_EFFECTS.LIFESTEAL, {
        kind: A.SIGIAN_SIGIL_KINDS.PASSIVE,
        scale: damageDealt(1, 2),
        config: { onlyTargetKind: "creature" }
      })
    ],
    astral_death_12: [
      sigil("astral_death_12", "destroy-all", "onPlay", A.SIGIAN_EFFECTS.DESTROY, { target: t(BOTH, CREATURES) }),
      sigil("astral_death_12", "soul-heal", "onPlay", A.SIGIAN_EFFECTS.HEAL, { target: t(SELF, HERO), scale: creatureCount([SELF, ENEMY], 4) })
    ],
    astral_death_13: [
      sigil("astral_death_13", "summon-power-cost", "onSummon", A.SIGIAN_EFFECTS.POWER_ALL, { target: t(SELF, POWERS), scale: c(-1) })
    ]
  };

  function nativeFormula(rawCard, sigils) {
    const legacy = A.formulaFromLegacyCard(rawCard);
    return A.createFormula({
      id: legacy.id,
      school: legacy.school,
      type: legacy.type,
      stats: legacy.stats,
      presentation: legacy.presentation,
      sigils,
      source: {
        mode: A.SIGIAN_MIGRATION_MODES.NATIVE,
        set: legacy.source.set,
        cardId: legacy.id
      },
      legacySnapshot: legacy.legacySnapshot
    });
  }

  A.SIGIAN_TECHNICAL_ORACLE_SPECS = Object.freeze(specs);
  A.SIGIAN_NATIVE_FORMULA_SPECS = A.SIGIAN_TECHNICAL_ORACLE_SPECS;
  A.SIGIAN_NATIVE_CARD_IDS = Object.freeze(
    Array.isArray(A.SIGIAN_BASE_RECIPE_IDS) && A.SIGIAN_BASE_RECIPE_IDS.length
      ? [...A.SIGIAN_BASE_RECIPE_IDS]
      : Object.keys(specs)
  );

  A.buildSigianTechnicalOracleCatalog = function buildSigianTechnicalOracleCatalog(cards) {
    const formulas = (cards || []).map(card => {
      const cardSigils = specs[card.id];
      if (!cardSigils) throw new Error(`Spec tecnica oracle mancante: ${card.id}`);
      return nativeFormula(card, cardSigils);
    });
    const byId = {};
    formulas.forEach(formula => {
      if (byId[formula.id]) throw new Error(`Formula oracle duplicata: ${formula.id}`);
      byId[formula.id] = formula;
    });
    return {
      schemaVersion: A.SIGIAN_FORMULA_SCHEMA_VERSION,
      formulas,
      byId,
      nativeCount: formulas.length,
      delegatedCount: 0
    };
  };

  A.buildSigianFormulaCatalog = function buildSigianFormulaCatalog(cards) {
    if (typeof A.buildSigianCompiledBaseCatalog === "function") {
      return A.buildSigianCompiledBaseCatalog(cards);
    }
    return A.buildSigianTechnicalOracleCatalog(cards);
  };
})(window.Arcane = window.Arcane || {});
