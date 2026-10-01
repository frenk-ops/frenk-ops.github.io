(function (A) {
  "use strict";

  const COMPONENT_DESIGN_SCHEMA_VERSION = 3;
  const CURRENT_SCHOOL_ORDER = Object.freeze(["fire", "water", "air", "nature", "death"]);
  const ADHERENCE_LEVELS = Object.freeze(["core", "compatible", "exotic", "dissonant"]);
  const ADHERENCE_LABELS = Object.freeze({
    core:"Core",
    compatible:"Compatibile",
    exotic:"Esotico",
    dissonant:"Dissonante"
  });
  const ADHERENCE_VALUE = Object.freeze({ core:3, compatible:2, exotic:1, dissonant:0 });
  const ADMISSIBILITY_LEVELS = Object.freeze(["standard", "exceptional", "forbidden"]);
  const ADMISSIBILITY_FROM_ADHERENCE = Object.freeze({
    core:"standard",
    compatible:"standard",
    exotic:"standard",
    dissonant:"exceptional"
  });
  const COMPATIBILITY_MODE_ORDER = Object.freeze({ mono:1, dual:2, triple:3, universal:4 });
  const SCHOOL_DISPLAY_NAMES = Object.freeze({
    fire:"Pyrax",
    water:"Umiria",
    air:"Vailis",
    nature:"Gairon",
    death:"Nekiria"
  });
  const POWER_DISPLAY_NAMES = Object.freeze({
    fire:"Fuoco",
    water:"Acqua",
    air:"Aria",
    nature:"Terra",
    death:"Morte"
  });
  const ADHERENCE_SCORE_BANDS = Object.freeze({
    core:Object.freeze({ min:75, max:100 }),
    compatible:Object.freeze({ min:50, max:74.999 }),
    exotic:Object.freeze({ min:25, max:49.999 }),
    dissonant:Object.freeze({ min:0, max:24.999 })
  });
  const PRIMARY_TAG_WEIGHT = 0.7;
  const SECONDARY_TAG_WEIGHT = 0.3;
  const CONFIDENCE_WEIGHTS = Object.freeze({
    semanticCoverage:0.20,
    mechanicAgreement:0.20,
    bandMargin:0.20,
    reviewStability:0.25,
    canonicalAgreement:0.15
  });
  const CONFIDENCE_THRESHOLDS = Object.freeze({
    low:0.70,
    high:0.85,
    largeReviewAdjustment:12.5,
    nearBoundary:3,
    flatAutomaticRange:25,
    forbiddenCandidateScore:16.667,
    forbiddenCandidateConfidence:0.85,
    widthReviewDissonantSchools:2
  });
  const RARITY_V2_CALIBRATION = Object.freeze({
    adherenceScale:2.5,
    adherenceExponent:1.75,
    exceptionalBase:0.45,
    exceptionalAdditional:0.15
  });
  const COMPATIBILITY_BY_SIZE = Object.freeze({ 1:"mono", 2:"dual", 3:"triple" });
  const COMPATIBILITY_RARITY = Object.freeze({ mono:0, dual:0.12, triple:0.55, universal:1.25 });
  const RARITY_TIERS = Object.freeze([
    Object.freeze({ id:"common", label:"Comune", max:0.85 }),
    Object.freeze({ id:"uncommon", label:"Non comune", max:1.6 }),
    Object.freeze({ id:"rare", label:"Raro", max:2.5 }),
    Object.freeze({ id:"very-rare", label:"Molto raro", max:3.5 }),
    Object.freeze({ id:"exceptional", label:"Eccezionale", max:Infinity })
  ]);

  const FIXED_BANDS = Object.freeze({
    1:Object.freeze([1,2,3]),
    2:Object.freeze([4,5,6]),
    3:Object.freeze([7,8,9,10]),
    4:Object.freeze([11,12,13,14,15]),
    5:Object.freeze([16,17,18,19,20])
  });
  const OFFSET_BANDS = Object.freeze({
    1:Object.freeze([0,1,2,3]),
    2:Object.freeze([4,5,6]),
    3:Object.freeze([7,8,9,10]),
    4:Object.freeze([11,12,13,14,15]),
    5:Object.freeze([16,17,18,19,20])
  });
  const TIGHT_FIVE = Object.freeze({
    1:Object.freeze([1]), 2:Object.freeze([2]), 3:Object.freeze([3]), 4:Object.freeze([4]), 5:Object.freeze([5])
  });
  const PERCENT_FOUR = Object.freeze({
    1:Object.freeze([25]), 2:Object.freeze([50]), 3:Object.freeze([75]), 4:Object.freeze([100])
  });
  const LIMIT_BANDS = Object.freeze({
    1:Object.freeze([16,17,18,19,20]),
    2:Object.freeze([11,12,13,14,15]),
    3:Object.freeze([7,8,9,10]),
    4:Object.freeze([4,5,6]),
    5:Object.freeze([1,2,3])
  });
  const THREE_COUNT = Object.freeze({
    1:Object.freeze([1]), 2:Object.freeze([2]), 3:Object.freeze([3])
  });

  const TAG_SCHOOL_VALUES = Object.freeze({
    "direct-damage":      Object.freeze({ fire:3, water:1, air:3, nature:0.5, death:2 }),
    "targeted-damage":    Object.freeze({ fire:3, water:1.25, air:3, nature:0.5, death:2 }),
    "area-damage":        Object.freeze({ fire:3, water:1.25, air:2, nature:0.5, death:2 }),
    "healing":            Object.freeze({ fire:1, water:2, air:1, nature:3, death:1 }),
    "regeneration":       Object.freeze({ fire:1, water:2, air:1, nature:3, death:2 }),
    "protection":         Object.freeze({ fire:1, water:3, air:1, nature:3, death:1 }),
    "power-growth":       Object.freeze({ fire:3, water:2, air:2, nature:3, death:2 }),
    "power-control":      Object.freeze({ fire:1, water:3, air:2, nature:0.5, death:2 }),
    "debuff":             Object.freeze({ fire:1, water:3, air:2, nature:0.5, death:2 }),
    "amplification":      Object.freeze({ fire:3, water:2, air:2, nature:2, death:1 }),
    "combat-scaling":     Object.freeze({ fire:3, water:2, air:2, nature:3, death:2 }),
    "death-resource":     Object.freeze({ fire:0.5, water:1, air:0.5, nature:1, death:3 }),
    "drain":              Object.freeze({ fire:1, water:1, air:1, nature:1, death:3 }),
    "rebirth":            Object.freeze({ fire:2, water:1, air:1, nature:2, death:3 }),
    "behavior-control":   Object.freeze({ fire:1, water:2, air:3, nature:0.5, death:1 }),
    "hard-removal":       Object.freeze({ fire:2, water:2, air:1, nature:0.5, death:3 }),
    "reactive-punish":    Object.freeze({ fire:2, water:2.5, air:1.5, nature:2.5, death:2 }),
    "state-control":      Object.freeze({ fire:1.5, water:3, air:2, nature:1, death:2 }),
    "self-risk":          Object.freeze({ fire:3, water:1, air:2, nature:0.5, death:2 }),
    "self-resource-loss": Object.freeze({ fire:2, water:2, air:1, nature:0.5, death:3 }),
    "conditional-risk":   Object.freeze({ fire:2, water:3, air:2, nature:1, death:2 }),
    "friendly-fire":      Object.freeze({ fire:3, water:0.5, air:2, nature:0.5, death:2 }),
    "forge-manipulation": Object.freeze({ fire:3, water:1.5, air:2, nature:2, death:1.5 }),
    "movement":           Object.freeze({ fire:1, water:1, air:3, nature:0.5, death:1 }),
    "tempo":              Object.freeze({ fire:2, water:2, air:3, nature:1, death:1 }),
    "extra-action":       Object.freeze({ fire:2, water:1.5, air:3, nature:1, death:1 })
  });
  const TAG_VERSATILITY = Object.freeze({
    "direct-damage":0.95,
    "targeted-damage":0.9,
    "area-damage":0.72,
    "healing":0.86,
    "regeneration":0.58,
    "protection":0.78,
    "power-growth":0.82,
    "power-control":0.82,
    "debuff":0.8,
    "amplification":0.7,
    "combat-scaling":0.6,
    "death-resource":0.5,
    "drain":0.62,
    "rebirth":0.45,
    "behavior-control":0.62,
    "hard-removal":0.74,
    "reactive-punish":0.55,
    "state-control":0.68,
    "self-risk":0.9,
    "self-resource-loss":0.84,
    "conditional-risk":0.72,
    "friendly-fire":0.35,
    "forge-manipulation":0.65,
    "movement":0.7,
    "tempo":0.72,
    "extra-action":0.55
  });

  const TAG_ARCANE_BASE = Object.freeze({
    "direct-damage":1.0,
    "targeted-damage":1.05,
    "area-damage":1.35,
    "healing":0.9,
    "regeneration":1.05,
    "protection":1.15,
    "power-growth":0.95,
    "power-control":1.0,
    "debuff":1.0,
    "amplification":1.15,
    "combat-scaling":1.1,
    "death-resource":1.15,
    "drain":1.25,
    "rebirth":1.6,
    "behavior-control":1.7,
    "hard-removal":1.9,
    "reactive-punish":1.0,
    "state-control":1.35,
    "self-risk":0.65,
    "self-resource-loss":0.65,
    "conditional-risk":0.7,
    "friendly-fire":0.55,
    "forge-manipulation":1.35,
    "movement":1.1,
    "tempo":1.2,
    "extra-action":1.6
  });

  const TAG_EXCEPTIONALITY = Object.freeze({
    "behavior-control":0.35,
    "hard-removal":0.35,
    "rebirth":0.35,
    "death-resource":0.12,
    "forge-manipulation":0.3,
    "extra-action":0.4
  });

  const TAGS_BY_ID = Object.freeze({
    "v2-damage-hero":["direct-damage"],
    "v2-damage-creature":["targeted-damage"],
    "v2-abbattimento":["targeted-damage"],
    "v2-damage-power-minor-hero":["direct-damage","combat-scaling"],
    "v2-damage-power-hero":["direct-damage","combat-scaling"],
    "v2-damage-power-major-hero":["direct-damage","combat-scaling"],
    "v2-wave":["area-damage"],
    "v2-wave-power-minor":["area-damage","combat-scaling"],
    "v2-wave-power":["area-damage","combat-scaling"],
    "v2-wave-power-major":["area-damage","combat-scaling"],
    "v2-tide":["area-damage","direct-damage"],
    "v2-tide-power-minor":["area-damage","direct-damage","combat-scaling"],
    "v2-tide-power":["area-damage","direct-damage","combat-scaling"],
    "v2-tide-power-major":["area-damage","direct-damage","combat-scaling"],
    "v2-tide-power-reduced":["area-damage","direct-damage","combat-scaling"],
    "v2-heal-hero":["healing"],
    "v2-heal-power-minor-hero":["healing","combat-scaling"],
    "v2-heal-power-hero":["healing","combat-scaling"],
    "v2-heal-power-major-hero":["healing","combat-scaling"],
    "v2-regeneration":["regeneration","healing"],
    "v2-recurring-heal-hero":["healing","regeneration"],
    "v2-recovery":["healing"],
    "v2-recurring-recovery":["healing","regeneration"],
    "v2-full-recovery":["healing"],
    "v2-infusion-school":["power-growth"],
    "v2-subtraction-school":["power-control","debuff"],
    "v2-subtraction-all":["power-control","debuff"],
    "v2-channeling-school":["power-growth"],
    "v2-channeling-all":["power-growth"],
    "v2-enemy-erosion-school":["power-control","debuff"],
    "v2-enemy-erosion-all":["power-control","debuff"],
    "v2-necromantic-resonance":["death-resource","power-growth"],
    "v2-vital-resonance":["death-resource","healing"],
    "v2-vampirism":["drain","healing"],
    "v2-life-drain":["drain","healing","direct-damage"],
    "v2-domination":["behavior-control"],
    "v2-rebirth":["rebirth","death-resource"],
    "v2-eternal-rebirth":["rebirth","death-resource"],
    "v2-arcane-armor":["protection"],
    "v2-destruction":["hard-removal"],
    "v2-uprooting":["hard-removal"],
    "v2-justice":["reactive-punish","area-damage"],
    "v2-soul-harvest":["hard-removal","death-resource","healing"],
    "v2-arcane-attack-school":["combat-scaling","power-growth"],
    "v2-protection-hero":["protection"],
    "v2-allied-amplification":["amplification"],
    "v2-spell-amplification-flat":["amplification"],
    "v2-spell-amplification-powerful":["amplification"],
    "v2-total-assault":["area-damage","amplification"],
    "v2-retaliation":["reactive-punish"],
    "v2-heal-creature":["healing"],
    "v2-infusion-all":["power-growth"],
    "v2-annihilation":["hard-removal","area-damage"],

    "v2-constraint-erosion-school":["self-resource-loss"],
    "v2-constraint-threshold-school":["conditional-risk","state-control"],
    "v2-constraint-limit-school":["conditional-risk","state-control"],
    "v2-constraint-tribute-school":["self-resource-loss"],
    "v2-constraint-tribute-all":["self-resource-loss"],
    "v2-constraint-friendly-fire":["friendly-fire","self-risk"],
    "v2-constraint-friendly-fire-limit":["friendly-fire","conditional-risk"],
    "v2-constraint-backlash":["self-risk"],
    "v2-constraint-scarcity-school":["conditional-risk","self-risk"],
    "v2-constraint-weakness-school":["conditional-risk","self-risk"],
    "v2-constraint-overpower-school":["conditional-risk","self-risk"]
  });

  const PRIMARY_TAG_OVERRIDES_BY_ID = Object.freeze({
    // Soglia/Limite are state-control gates first and conditional risks second.
    "v2-constraint-threshold-school":"state-control",
    "v2-constraint-limit-school":"state-control"
  });

  const REVIEWED_ADHERENCE_BY_ID = Object.freeze({
    "v2-damage-hero":Object.freeze({ fire:"core", water:"exotic", air:"core", nature:"dissonant", death:"compatible" }),
    "v2-damage-creature":Object.freeze({ fire:"core", water:"exotic", air:"core", nature:"dissonant", death:"compatible" }),
    "v2-abbattimento":Object.freeze({ fire:"compatible", water:"exotic", air:"core", nature:"dissonant", death:"compatible" }),
    "v2-damage-power-minor-hero":Object.freeze({ fire:"core", water:"exotic", air:"core", nature:"dissonant", death:"compatible" }),
    "v2-damage-power-hero":Object.freeze({ fire:"core", water:"exotic", air:"core", nature:"dissonant", death:"compatible" }),
    "v2-damage-power-major-hero":Object.freeze({ fire:"core", water:"exotic", air:"core", nature:"dissonant", death:"compatible" }),
    "v2-wave":Object.freeze({ fire:"core", water:"exotic", air:"compatible", nature:"dissonant", death:"compatible" }),
    "v2-wave-power-minor":Object.freeze({ fire:"core", water:"exotic", air:"compatible", nature:"dissonant", death:"compatible" }),
    "v2-wave-power":Object.freeze({ fire:"core", water:"exotic", air:"compatible", nature:"dissonant", death:"compatible" }),
    "v2-wave-power-major":Object.freeze({ fire:"core", water:"exotic", air:"compatible", nature:"dissonant", death:"compatible" }),
    "v2-tide":Object.freeze({ fire:"core", water:"exotic", air:"compatible", nature:"dissonant", death:"compatible" }),
    "v2-tide-power-minor":Object.freeze({ fire:"core", water:"exotic", air:"compatible", nature:"dissonant", death:"compatible" }),
    "v2-tide-power":Object.freeze({ fire:"core", water:"exotic", air:"compatible", nature:"dissonant", death:"compatible" }),
    "v2-tide-power-major":Object.freeze({ fire:"core", water:"exotic", air:"compatible", nature:"dissonant", death:"compatible" }),
    "v2-tide-power-reduced":Object.freeze({ fire:"core", water:"exotic", air:"compatible", nature:"dissonant", death:"compatible" }),
    "v2-heal-hero":Object.freeze({ fire:"exotic", water:"compatible", air:"exotic", nature:"core", death:"exotic" }),
    "v2-heal-power-minor-hero":Object.freeze({ fire:"exotic", water:"compatible", air:"exotic", nature:"core", death:"exotic" }),
    "v2-heal-power-hero":Object.freeze({ fire:"exotic", water:"compatible", air:"exotic", nature:"core", death:"exotic" }),
    "v2-heal-power-major-hero":Object.freeze({ fire:"exotic", water:"compatible", air:"exotic", nature:"core", death:"exotic" }),
    "v2-regeneration":Object.freeze({ fire:"exotic", water:"compatible", air:"exotic", nature:"core", death:"compatible" }),
    "v2-recurring-heal-hero":Object.freeze({ fire:"exotic", water:"compatible", air:"exotic", nature:"core", death:"exotic" }),
    "v2-recovery":Object.freeze({ fire:"exotic", water:"compatible", air:"exotic", nature:"core", death:"exotic" }),
    "v2-recurring-recovery":Object.freeze({ fire:"exotic", water:"compatible", air:"exotic", nature:"core", death:"exotic" }),
    "v2-full-recovery":Object.freeze({ fire:"exotic", water:"compatible", air:"exotic", nature:"core", death:"exotic" }),
    "v2-infusion-school":Object.freeze({ fire:"core", water:"compatible", air:"compatible", nature:"core", death:"compatible" }),
    "v2-subtraction-school":Object.freeze({ fire:"exotic", water:"core", air:"compatible", nature:"dissonant", death:"compatible" }),
    "v2-subtraction-all":Object.freeze({ fire:"exotic", water:"core", air:"compatible", nature:"dissonant", death:"compatible" }),
    "v2-channeling-school":Object.freeze({ fire:"core", water:"compatible", air:"compatible", nature:"core", death:"exotic" }),
    "v2-channeling-all":Object.freeze({ fire:"core", water:"compatible", air:"compatible", nature:"core", death:"exotic" }),
    "v2-enemy-erosion-school":Object.freeze({ fire:"exotic", water:"core", air:"compatible", nature:"dissonant", death:"compatible" }),
    "v2-enemy-erosion-all":Object.freeze({ fire:"exotic", water:"core", air:"compatible", nature:"dissonant", death:"compatible" }),
    "v2-necromantic-resonance":Object.freeze({ fire:"dissonant", water:"exotic", air:"dissonant", nature:"exotic", death:"core" }),
    "v2-vital-resonance":Object.freeze({ fire:"dissonant", water:"exotic", air:"dissonant", nature:"compatible", death:"core" }),
    "v2-vampirism":Object.freeze({ fire:"exotic", water:"exotic", air:"exotic", nature:"exotic", death:"core" }),
    "v2-life-drain":Object.freeze({ fire:"exotic", water:"exotic", air:"exotic", nature:"exotic", death:"core" }),
    "v2-domination":Object.freeze({ fire:"exotic", water:"compatible", air:"core", nature:"dissonant", death:"exotic" }),
    "v2-rebirth":Object.freeze({ fire:"compatible", water:"exotic", air:"exotic", nature:"compatible", death:"core" }),
    "v2-eternal-rebirth":Object.freeze({ fire:"compatible", water:"exotic", air:"exotic", nature:"compatible", death:"core" }),
    "v2-arcane-armor":Object.freeze({ fire:"exotic", water:"core", air:"exotic", nature:"core", death:"exotic" }),
    "v2-destruction":Object.freeze({ fire:"compatible", water:"compatible", air:"exotic", nature:"dissonant", death:"core" }),
    "v2-uprooting":Object.freeze({ fire:"compatible", water:"compatible", air:"core", nature:"dissonant", death:"core" }),
    "v2-justice":Object.freeze({ fire:"exotic", water:"core", air:"compatible", nature:"compatible", death:"compatible" }),
    "v2-soul-harvest":Object.freeze({ fire:"exotic", water:"exotic", air:"dissonant", nature:"dissonant", death:"core" }),
    "v2-arcane-attack-school":Object.freeze({ fire:"core", water:"compatible", air:"compatible", nature:"core", death:"compatible" }),
    "v2-protection-hero":Object.freeze({ fire:"exotic", water:"core", air:"exotic", nature:"core", death:"exotic" }),
    "v2-allied-amplification":Object.freeze({ fire:"core", water:"compatible", air:"compatible", nature:"compatible", death:"exotic" }),
    "v2-spell-amplification-flat":Object.freeze({ fire:"core", water:"exotic", air:"compatible", nature:"exotic", death:"exotic" }),
    "v2-spell-amplification-powerful":Object.freeze({ fire:"core", water:"exotic", air:"compatible", nature:"exotic", death:"exotic" }),
    "v2-total-assault":Object.freeze({ fire:"core", water:"exotic", air:"compatible", nature:"exotic", death:"exotic" }),
    "v2-retaliation":Object.freeze({ fire:"compatible", water:"compatible", air:"exotic", nature:"core", death:"compatible" }),
    "v2-heal-creature":Object.freeze({ fire:"exotic", water:"compatible", air:"exotic", nature:"core", death:"exotic" }),
    "v2-infusion-all":Object.freeze({ fire:"core", water:"compatible", air:"compatible", nature:"core", death:"compatible" }),
    "v2-annihilation":Object.freeze({ fire:"compatible", water:"exotic", air:"exotic", nature:"dissonant", death:"core" }),
    "v2-constraint-erosion-school":Object.freeze({ fire:"compatible", water:"compatible", air:"exotic", nature:"dissonant", death:"core" }),
    "v2-constraint-threshold-school":Object.freeze({ fire:"compatible", water:"core", air:"compatible", nature:"exotic", death:"compatible" }),
    "v2-constraint-limit-school":Object.freeze({ fire:"compatible", water:"core", air:"compatible", nature:"exotic", death:"compatible" }),
    "v2-constraint-tribute-school":Object.freeze({ fire:"compatible", water:"compatible", air:"exotic", nature:"dissonant", death:"core" }),
    "v2-constraint-tribute-all":Object.freeze({ fire:"compatible", water:"compatible", air:"exotic", nature:"dissonant", death:"core" }),
    "v2-constraint-friendly-fire":Object.freeze({ fire:"core", water:"dissonant", air:"compatible", nature:"dissonant", death:"compatible" }),
    "v2-constraint-friendly-fire-limit":Object.freeze({ fire:"core", water:"compatible", air:"compatible", nature:"dissonant", death:"compatible" }),
    "v2-constraint-backlash":Object.freeze({ fire:"core", water:"exotic", air:"compatible", nature:"dissonant", death:"compatible" }),
    "v2-constraint-scarcity-school":Object.freeze({ fire:"compatible", water:"core", air:"compatible", nature:"exotic", death:"compatible" }),
    "v2-constraint-weakness-school":Object.freeze({ fire:"compatible", water:"core", air:"compatible", nature:"exotic", death:"compatible" }),
    "v2-constraint-overpower-school":Object.freeze({ fire:"compatible", water:"core", air:"compatible", nature:"exotic", death:"compatible" })
  });

  function clone(value) {
    if (typeof A.deepClone === "function") return A.deepClone(value);
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value)));
  }

  function round(value, digits = 3) {
    const factor = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  }

  function schoolOrder() {
    const explicit = Array.isArray(A.SIGIAN_AFFINITY_SCHOOL_ORDER) ? A.SIGIAN_AFFINITY_SCHOOL_ORDER : null;
    const active = typeof A.listSigianSchools === "function"
      ? A.listSigianSchools({ status:"active" }).map(item => item.id)
      : [];
    const base = explicit?.length ? explicit : active.length ? active : CURRENT_SCHOOL_ORDER;
    return [...new Set(base.map(String))];
  }

  function normalizeAdherence(value) {
    const id = String(value || "").toLowerCase();
    if (!ADHERENCE_LEVELS.includes(id)) throw new Error(`Aderenza non valida: ${value}.`);
    return id;
  }

  function normalizeAdmissibility(value) {
    const id = String(value || "").toLowerCase();
    if (!ADMISSIBILITY_LEVELS.includes(id)) throw new Error(`Ammissibilità non valida: ${value}.`);
    return id;
  }

  function normalizeMaxCompatibilityMode(value) {
    const id = String(value || "universal").toLowerCase();
    if (!COMPATIBILITY_MODE_ORDER[id]) throw new Error(`Ampiezza Compatibilità non valida: ${value}.`);
    return id;
  }

  function schoolDisplayName(id) {
    return SCHOOL_DISPLAY_NAMES[String(id || "")] || String(id || "");
  }

  function powerDisplayName(id) {
    return POWER_DISPLAY_NAMES[String(id || "")] || String(id || "");
  }

  function compatibilityDisplayLabel(compatibility) {
    const modeLabel = compatibility.mode === "universal"
      ? "Universale"
      : compatibility.mode.charAt(0).toUpperCase() + compatibility.mode.slice(1);
    if (compatibility.mode === "universal") return modeLabel;
    return modeLabel + " " + compatibility.schools.map(schoolDisplayName).join("/");
  }

  function scoreToAdherence(score) {
    const numeric = Number(score);
    if (numeric >= 2.55) return "core";
    if (numeric >= 1.75) return "compatible";
    if (numeric >= 0.75) return "exotic";
    return "dissonant";
  }

  function semanticTags(definition, options = {}) {
    const explicit = options.tags || definition?.tags;
    const tags = explicit ? [...new Set(explicit.map(String))] : (TAGS_BY_ID[definition?.id] || []);
    if (!tags.length) throw new Error(`Manca la classificazione semantica per ${definition?.id || definition?.name || "nuovo componente"}.`);
    tags.forEach(tag => {
      if (!TAG_SCHOOL_VALUES[tag]) throw new Error(`Tag meccanico non registrato: ${tag}.`);
    });
    return tags;
  }

  function primaryTagFor(definition, tags, options = {}) {
    const explicit = options.primaryTag || definition?.primaryTag || PRIMARY_TAG_OVERRIDES_BY_ID[definition?.id] || tags[0];
    const primaryTag = String(explicit || "");
    if (!tags.includes(primaryTag)) {
      throw new Error(`Tag primario ${primaryTag || "-"} non presente nella classificazione di ${definition?.id || definition?.name || "nuovo componente"}.`);
    }
    return primaryTag;
  }

  function weightedSchoolScore(tags, primaryTag, school) {
    const primaryValue = TAG_SCHOOL_VALUES[primaryTag]?.[school];
    if (!Number.isFinite(primaryValue)) return null;
    const secondaryValues = tags
      .filter(tag => tag !== primaryTag)
      .map(tag => TAG_SCHOOL_VALUES[tag]?.[school])
      .filter(value => Number.isFinite(value));
    if (!secondaryValues.length) return primaryValue;
    const secondaryAverage = secondaryValues.reduce((sum, value) => sum + value, 0) / secondaryValues.length;
    return primaryValue * PRIMARY_TAG_WEIGHT + secondaryAverage * SECONDARY_TAG_WEIGHT;
  }

  function adherenceScore100(rawScore) {
    if (!Number.isFinite(Number(rawScore))) return null;
    return round(clamp(Number(rawScore), 0, 3) / 3 * 100);
  }

  function adherenceFromScore100(score) {
    const numeric = Number(score);
    if (numeric >= ADHERENCE_SCORE_BANDS.core.min) return "core";
    if (numeric >= ADHERENCE_SCORE_BANDS.compatible.min) return "compatible";
    if (numeric >= ADHERENCE_SCORE_BANDS.exotic.min) return "exotic";
    return "dissonant";
  }

  function calibrateScoreToReviewedBand(score, level) {
    const band = ADHERENCE_SCORE_BANDS[normalizeAdherence(level)];
    const fallback = (band.min + band.max) / 2;
    const numeric = Number.isFinite(Number(score)) ? Number(score) : fallback;
    return round(clamp(numeric, band.min, band.max));
  }

  function grammarEvidence(tags, primaryTag, school) {
    const primaryRaw = TAG_SCHOOL_VALUES[primaryTag]?.[school];
    if (!Number.isFinite(primaryRaw)) return null;
    const secondaryRawValues = tags
      .filter(tag => tag !== primaryTag)
      .map(tag => TAG_SCHOOL_VALUES[tag]?.[school])
      .filter(value => Number.isFinite(value));
    const secondaryRaw = secondaryRawValues.length
      ? secondaryRawValues.reduce((sum, value) => sum + value, 0) / secondaryRawValues.length
      : null;
    const weightedRaw = weightedSchoolScore(tags, primaryTag, school);
    return {
      primaryRaw:round(primaryRaw),
      secondaryRaw:secondaryRaw == null ? null : round(secondaryRaw),
      weightedRaw:round(weightedRaw),
      primaryScore100:adherenceScore100(primaryRaw),
      secondaryScore100:secondaryRaw == null ? null : adherenceScore100(secondaryRaw),
      automaticScore100:adherenceScore100(weightedRaw),
      primaryWeight:secondaryRawValues.length ? PRIMARY_TAG_WEIGHT : 1,
      secondaryWeight:secondaryRawValues.length ? SECONDARY_TAG_WEIGHT : 0
    };
  }

  function deriveAdherence(definition, tags, options = {}) {
    const schools = schoolOrder();
    const primaryTag = primaryTagFor(definition, tags, options);
    const reviewed = REVIEWED_ADHERENCE_BY_ID[definition?.id] || {};
    const definitionOverrides = definition?.adherence || {};
    const optionOverrides = options.adherence || {};
    const overrides = { ...reviewed, ...definitionOverrides, ...optionOverrides };
    const bySchool = {};
    const evidence = {};
    schools.forEach(school => {
      const grammar = grammarEvidence(tags, primaryTag, school);
      if (overrides[school]) {
        bySchool[school] = normalizeAdherence(overrides[school]);
        const source = optionOverrides[school]
          ? "manual-override"
          : definitionOverrides[school]
            ? "definition-override"
            : reviewed[school]
              ? "canonical-review"
              : "override";
        const score100 = calibrateScoreToReviewedBand(grammar?.automaticScore100, bySchool[school]);
        evidence[school] = {
          source,
          score:ADHERENCE_VALUE[bySchool[school]],
          score100,
          automaticScore100:grammar?.automaticScore100 ?? null,
          reviewAdjustment:grammar?.automaticScore100 == null ? null : round(score100 - grammar.automaticScore100),
          primaryTag,
          grammar
        };
        return;
      }
      const score = grammar?.weightedRaw;
      if (!Number.isFinite(score)) {
        bySchool[school] = null;
        evidence[school] = { source:"unclassified", score:null, score100:null, automaticScore100:null, primaryTag, grammar:null };
        return;
      }
      const score100 = grammar.automaticScore100;
      bySchool[school] = adherenceFromScore100(score100);
      evidence[school] = {
        source:tags.length > 1 ? "weighted-grammar" : "grammar",
        score:round(score),
        score100,
        automaticScore100:score100,
        reviewAdjustment:0,
        primaryTag,
        primaryWeight:grammar.primaryWeight,
        grammar
      };
    });
    return { bySchool, evidence, primaryTag };
  }

  function nearestBandBoundaryDistance(score100) {
    const numeric = Number(score100);
    if (!Number.isFinite(numeric)) return null;
    return Math.min(...[25, 50, 75].map(boundary => Math.abs(numeric - boundary)));
  }

  function confidenceFactor(score, weight, reason) {
    return {
      score:round(clamp(score, 0, 1)),
      weight:round(weight),
      contribution:round(clamp(score, 0, 1) * weight),
      reason
    };
  }

  function confidenceForSchool(tags, primaryTag, finalAdherence, evidence, school) {
    const grammar = evidence?.grammar || null;
    const automaticScore100 = evidence?.automaticScore100;
    const finalScore100 = evidence?.score100;
    const source = evidence?.source || "unclassified";
    const reviewAdjustment = Number(evidence?.reviewAdjustment || 0);

    const calibratedTags = tags.filter(tag => Number.isFinite(TAG_SCHOOL_VALUES[tag]?.[school]));
    const primaryCalibrated = Number.isFinite(TAG_SCHOOL_VALUES[primaryTag]?.[school]);
    const semanticCoverageScore = tags.length && primaryCalibrated
      ? calibratedTags.length / tags.length
      : 0;

    const primaryScore = grammar?.primaryScore100;
    const secondaryScore = grammar?.secondaryScore100;
    const mechanicAgreementScore = Number.isFinite(primaryScore) && Number.isFinite(secondaryScore)
      ? 1 - Math.abs(primaryScore - secondaryScore) / 100
      : Number.isFinite(primaryScore) ? 1 : 0;

    const boundaryDistance = nearestBandBoundaryDistance(automaticScore100);
    const bandMarginScore = boundaryDistance == null ? 0 : Math.min(1, boundaryDistance / 12.5);

    const adjustmentPenalty = Math.min(1, Math.abs(reviewAdjustment) / 25);
    const sourceBase = source === "canonical-review"
      ? 1
      : source === "manual-override" || source === "definition-override"
        ? 0.60
        : source === "grammar" || source === "weighted-grammar"
          ? 0.70
          : 0.40;
    const reviewStabilityScore = sourceBase * (1 - adjustmentPenalty);

    const automaticBand = Number.isFinite(Number(automaticScore100))
      ? adherenceFromScore100(automaticScore100)
      : null;
    let canonicalAgreementScore = 0.40;
    if (source === "canonical-review" && automaticBand) {
      const automaticIndex = ADHERENCE_LEVELS.indexOf(automaticBand);
      const finalIndex = ADHERENCE_LEVELS.indexOf(finalAdherence);
      const distance = Math.abs(automaticIndex - finalIndex);
      canonicalAgreementScore = distance === 0 ? 1 : distance === 1 ? 0.5 : distance === 2 ? 0.2 : 0;
    } else if (source === "manual-override" || source === "definition-override") {
      canonicalAgreementScore = 0.45;
    } else if (automaticBand) {
      canonicalAgreementScore = 0.65;
    }

    const breakdown = {
      semanticCoverage:confidenceFactor(
        semanticCoverageScore,
        CONFIDENCE_WEIGHTS.semanticCoverage,
        calibratedTags.length + "/" + tags.length + " tag calibrati per la Scuola; primaria " + (primaryCalibrated ? "coperta" : "non coperta")
      ),
      mechanicAgreement:confidenceFactor(
        mechanicAgreementScore,
        CONFIDENCE_WEIGHTS.mechanicAgreement,
        Number.isFinite(secondaryScore)
          ? "primaria=" + primaryScore + ", secondarie=" + secondaryScore
          : "nessuna secondaria conflittuale; primaria=" + (primaryScore ?? "-")
      ),
      bandMargin:confidenceFactor(
        bandMarginScore,
        CONFIDENCE_WEIGHTS.bandMargin,
        boundaryDistance == null
          ? "score automatico non disponibile"
          : "distanza dal confine di banda più vicino=" + round(boundaryDistance)
      ),
      reviewStability:confidenceFactor(
        reviewStabilityScore,
        CONFIDENCE_WEIGHTS.reviewStability,
        "source=" + source + ", reviewAdjustment=" + round(reviewAdjustment)
      ),
      canonicalAgreement:confidenceFactor(
        canonicalAgreementScore,
        CONFIDENCE_WEIGHTS.canonicalAgreement,
        "banda automatica=" + (automaticBand || "-") + ", banda finale=" + (finalAdherence || "-")
      )
    };
    const score = round(Object.values(breakdown).reduce((sum, factor) => sum + factor.contribution, 0));
    const score100 = round(score * 100, 1);
    return {
      score,
      score100,
      label:score >= CONFIDENCE_THRESHOLDS.high ? "alta" : score >= CONFIDENCE_THRESHOLDS.low ? "media" : "bassa",
      requiresHumanReview:score < CONFIDENCE_THRESHOLDS.low || Math.abs(reviewAdjustment) >= CONFIDENCE_THRESHOLDS.largeReviewAdjustment,
      automaticScore100:automaticScore100 ?? null,
      finalScore100:finalScore100 ?? null,
      automaticBand,
      finalBand:finalAdherence || null,
      source,
      reviewAdjustment:round(reviewAdjustment),
      breakdown
    };
  }

  function deriveConfidence(tags, adherence) {
    const bySchool = {};
    schoolOrder().forEach(school => {
      bySchool[school] = confidenceForSchool(
        tags,
        adherence.primaryTag,
        adherence.bySchool[school],
        adherence.evidence[school],
        school
      );
    });
    const values = Object.values(bySchool).map(item => item.score).filter(Number.isFinite);
    const average = values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
    const minimum = values.length ? round(Math.min(...values)) : 0;
    return {
      score:average,
      score100:round(average * 100, 1),
      minimum,
      minimum100:round(minimum * 100, 1),
      lowSchools:Object.entries(bySchool).filter(([, item]) => item.score < CONFIDENCE_THRESHOLDS.low).map(([school]) => school),
      reviewSchools:Object.entries(bySchool).filter(([, item]) => item.requiresHumanReview).map(([school]) => school),
      bySchool
    };
  }

  function deriveAdmissibility(definition, adherenceBySchool, options = {}) {
    const definitionOverrides = definition?.admissibility || {};
    const optionOverrides = options.admissibility || {};
    const bySchool = {};
    const evidence = {};
    schoolOrder().forEach(school => {
      const explicit = optionOverrides[school] ?? definitionOverrides[school];
      if (explicit != null) {
        bySchool[school] = normalizeAdmissibility(explicit);
        evidence[school] = {
          source:optionOverrides[school] != null ? "manual-override" : "definition-override",
          adherence:adherenceBySchool[school]
        };
        return;
      }
      const adherence = normalizeAdherence(adherenceBySchool[school]);
      bySchool[school] = ADMISSIBILITY_FROM_ADHERENCE[adherence];
      evidence[school] = { source:"adherence-default", adherence };
    });
    const maxCompatibilityMode = normalizeMaxCompatibilityMode(
      options.maxCompatibilityMode ?? definition?.maxCompatibilityMode ?? "universal"
    );
    return { bySchool, evidence, maxCompatibilityMode };
  }

  function classifyCompatibilityForProfile(profile, compatibility) {
    const maxMode = normalizeMaxCompatibilityMode(profile.maxCompatibilityMode || "universal");
    const reasons = [];
    if (COMPATIBILITY_MODE_ORDER[compatibility.mode] > COMPATIBILITY_MODE_ORDER[maxMode]) {
      reasons.push("max-compatibility-mode");
    }
    const schoolStates = Object.fromEntries(
      compatibility.schools.map(school => [school, normalizeAdmissibility(profile.admissibility?.[school] || "standard")])
    );
    if (Object.values(schoolStates).includes("forbidden")) reasons.push("forbidden-school");
    const status = reasons.length
      ? "forbidden"
      : Object.values(schoolStates).includes("exceptional")
        ? "exceptional"
        : "standard";
    return {
      status,
      legal:status !== "forbidden",
      schoolStates,
      maxCompatibilityMode:maxMode,
      reasons
    };
  }

  function compatibilityDomain(definitionOrProfile, options = {}) {
    const profile = definitionOrProfile
      && Number(definitionOrProfile.schemaVersion) === COMPONENT_DESIGN_SCHEMA_VERSION
      && definitionOrProfile.gradeProfile
      && definitionOrProfile.adherence
      ? definitionOrProfile
      : buildFamilyProfile(definitionOrProfile, options);
    return enumerateCompatibilities().map(compatibility => ({
      compatibility,
      ...classifyCompatibilityForProfile(profile, compatibility)
    }));
  }

  function familyDisplayName(profile, referencePower) {
    const label = referencePower ? powerDisplayName(referencePower) : "<Potere>";
    return String(profile.family || "")
      .replace(/<Scuola>/gi, label)
      .replace(/<Potere>/gi, label);
  }

  function parseGradeProfile(definition) {
    const raw = String(definition?.grades || "").trim();
    const normalized = raw.replace(/\s+/g, " ");
    if (!normalized) return { id:"unknown", grades:[], status:"unsupported", raw };
    if (/senza Gradi/i.test(normalized)) {
      return { id:"grade-less", grades:[{ grade:null, intensities:[null] }], status:"canonical", raw };
    }
    if (/speciale\s*·\s*1 Grado/i.test(normalized)) {
      return { id:"special-one", grades:[{ grade:1, intensities:[null] }], status:"canonical", raw };
    }
    if (/I 1–3 .*II 4–6 .*III 7–10 .*IV 11–15 .*V 16–20/i.test(normalized)) {
      return { id:"fixed-1-20", grades:Object.keys(FIXED_BANDS).map(key => ({ grade:Number(key), intensities:[...FIXED_BANDS[key]] })), status:"canonical", raw };
    }
    if (/I 0–3 .*II 4–6 .*III 7–10 .*IV 11–15 .*V 16–20/i.test(normalized)) {
      return { id:"offset-0-20", grades:Object.keys(OFFSET_BANDS).map(key => ({ grade:Number(key), intensities:[...OFFSET_BANDS[key]] })), status:"canonical", raw };
    }
    if (/I 1 .*II 2 .*III 3 .*IV 4 .*V 5/i.test(normalized) || /I \+1 .*II \+2 .*III \+3 .*IV \+4 .*V \+5/i.test(normalized)) {
      return { id:"tight-five", grades:Object.keys(TIGHT_FIVE).map(key => ({ grade:Number(key), intensities:[...TIGHT_FIVE[key]] })), status:"canonical", raw };
    }
    if (/I 16–20 .*II 11–15 .*III 7–10 .*IV 4–6 .*V 1–3/i.test(normalized)) {
      return { id:"limit-20-1", grades:Object.keys(LIMIT_BANDS).map(key => ({ grade:Number(key), intensities:[...LIMIT_BANDS[key]] })), status:"canonical", raw };
    }
    if (/I 25% .*II 50% .*III 75% .*IV 100%/i.test(normalized)) {
      return { id:"percent-four", grades:Object.keys(PERCENT_FOUR).map(key => ({ grade:Number(key), intensities:[...PERCENT_FOUR[key]] })), status:"canonical", raw };
    }
    if (/I 1 (creatura|ritorno).*II 2 .*III 3/i.test(normalized)) {
      return { id:"count-three", grades:Object.keys(THREE_COUNT).map(key => ({ grade:Number(key), intensities:[...THREE_COUNT[key]] })), status:"canonical", raw };
    }
    return { id:"unknown", grades:[], status:"unsupported", raw };
  }

  function gradeEntry(profile, grade) {
    if (grade == null) return profile.grades.find(item => item.grade == null) || null;
    return profile.grades.find(item => Number(item.grade) === Number(grade)) || null;
  }

  function craftingWeightForGrade(grade) {
    if (grade == null) return 1;
    if (typeof A.sigianCraftingWeightForGrade === "function") {
      const value = Number(A.sigianCraftingWeightForGrade(grade));
      if (Number.isFinite(value) && value > 0) return value;
    }
    return 2 ** Math.max(0, Number(grade) - 1);
  }

  function intensityPosition(entry, intensity) {
    const values = entry?.intensities || [];
    if (values.length <= 1 || intensity == null) return 0;
    const index = values.findIndex(value => Number(value) === Number(intensity));
    if (index < 0) throw new Error(`Intensità ${intensity} fuori dal Grado ${entry.grade}.`);
    return index / (values.length - 1);
  }

  function deriveVersatility(tags) {
    const values = tags.map(tag => TAG_VERSATILITY[tag]).filter(Number.isFinite);
    const score = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0.5;
    const normalized = round(clamp(score, 0, 1));
    return {
      score:normalized,
      label:normalized >= 0.78 ? "alta" : normalized >= 0.55 ? "media" : "bassa",
      source:"semantic-grammar"
    };
  }

  function estimatedArcaneWeight(tags, grade, intensityPercentile) {
    const bases = tags.map(tag => TAG_ARCANE_BASE[tag]).filter(Number.isFinite);
    const base = bases.length ? bases.reduce((sum, value) => sum + value, 0) / bases.length : 1;
    const gradeFactor = grade == null ? 1 : 1 + Math.max(0, Number(grade) - 1) * 0.32;
    const intensityFactor = 1 + clamp(intensityPercentile || 0, 0, 1) * 0.18;
    return round(base * gradeFactor * intensityFactor);
  }

  function deriveExceptional(tags) {
    return round(Math.max(0, ...tags.map(tag => TAG_EXCEPTIONALITY[tag] || 0)));
  }

  function compatibilityForSchools(inputSchools) {
    const all = schoolOrder();
    const schools = [...new Set((inputSchools || []).map(String))].filter(id => all.includes(id));
    if (!schools.length) throw new Error("Compatibilità senza Scuole.");
    if (schools.length === all.length && all.every(id => schools.includes(id))) {
      return { mode:"universal", schools:[...all] };
    }
    const mode = COMPATIBILITY_BY_SIZE[schools.length];
    if (!mode) throw new Error(`Compatibilità non prevista per ${schools.length} Scuole.`);
    return { mode, schools:all.filter(id => schools.includes(id)) };
  }

  function combinations(list, size, start = 0, prefix = [], out = []) {
    if (prefix.length === size) {
      out.push([...prefix]);
      return out;
    }
    for (let index = start; index <= list.length - (size - prefix.length); index += 1) {
      prefix.push(list[index]);
      combinations(list, size, index + 1, prefix, out);
      prefix.pop();
    }
    return out;
  }

  function enumerateCompatibilities() {
    const schools = schoolOrder();
    const output = [];
    [1,2,3].forEach(size => combinations(schools, size).forEach(set => output.push(compatibilityForSchools(set))));
    output.push({ mode:"universal", schools:[...schools] });
    return output;
  }

  function rarityTier(score) {
    return RARITY_TIERS.find(tier => score < tier.max) || RARITY_TIERS[RARITY_TIERS.length - 1];
  }

  function continuousAdherenceRarity(score100) {
    const score = Number(score100);
    if (!Number.isFinite(score)) throw new Error("Score Aderenza 0-100 mancante per il calcolo Rarità v2.");
    const distance = 1 - clamp(score, 0, 100) / 100;
    return RARITY_V2_CALIBRATION.adherenceScale * (distance ** RARITY_V2_CALIBRATION.adherenceExponent);
  }

  function exceptionalAdmissibilityRarity(states) {
    const exceptionalCount = states.filter(state => state === "exceptional").length;
    if (!exceptionalCount) return 0;
    return RARITY_V2_CALIBRATION.exceptionalBase
      + Math.max(0, exceptionalCount - 1) * RARITY_V2_CALIBRATION.exceptionalAdditional;
  }

  function rarityBreakdown({ compatibility, adherenceScoresBySchool, admissibilityBySchool, referencePower, referenceSchool, grade, intensityPercentile, arcaneWeight, craftingWeight, versatility, exceptionality }) {
    const resolvedReferencePower = referencePower ?? referenceSchool ?? null;
    const selectedScores = compatibility.schools.map(school => Number(adherenceScoresBySchool?.[school]));
    if (selectedScores.some(score => !Number.isFinite(score))) {
      throw new Error(`Score Aderenza incompleto per la Rarità v2 / ${compatibility.schools.join(",")}.`);
    }
    const adherencePoints = selectedScores.map(continuousAdherenceRarity);
    const averageAdherence = adherencePoints.reduce((sum, value) => sum + value, 0) / adherencePoints.length;
    const worstAdherence = Math.max(...adherencePoints);
    const adherence = averageAdherence + 0.25 * worstAdherence;
    const selectedAdmissibility = compatibility.schools.map(school => normalizeAdmissibility(admissibilityBySchool?.[school] || "standard"));
    const admissibilityPoints = exceptionalAdmissibilityRarity(selectedAdmissibility);
    const compatibilityPoints = COMPATIBILITY_RARITY[compatibility.mode] ?? 0;
    const referencePowerPoints = resolvedReferencePower && !compatibility.schools.includes(resolvedReferencePower) ? 0.35 : 0;
    const gradePoints = grade == null ? 0.12 : Math.max(0, Number(grade) - 1) * 0.22;
    const intensityPoints = clamp(intensityPercentile || 0, 0, 1) * 0.22;
    const arcanePoints = Math.min(0.72, Math.log2(1 + Math.max(0, Number(arcaneWeight) || 0)) * 0.28);
    const craftingPoints = Math.max(0, Math.log2(Math.max(1, Number(craftingWeight) || 1))) * 0.13;
    const versatilityPoints = clamp(versatility?.score ?? versatility ?? 0, 0, 1) * 0.28;
    const exceptionalPoints = Math.max(0, Number(exceptionality) || 0);
    const total = round(adherence + admissibilityPoints + compatibilityPoints + referencePowerPoints + gradePoints + intensityPoints + arcanePoints + craftingPoints + versatilityPoints + exceptionalPoints);
    return {
      model:"continuous-v2",
      total,
      adherence:round(adherence),
      adherenceAverage:round(averageAdherence),
      adherenceWorst:round(worstAdherence),
      adherenceScores:Object.fromEntries(compatibility.schools.map((school, index) => [school, selectedScores[index]])),
      adherencePoints:Object.fromEntries(compatibility.schools.map((school, index) => [school, round(adherencePoints[index])])),
      admissibility:round(admissibilityPoints),
      admissibilityStates:Object.fromEntries(compatibility.schools.map((school, index) => [school, selectedAdmissibility[index]])),
      exceptionalSchools:compatibility.schools.filter((school, index) => selectedAdmissibility[index] === "exceptional"),
      forbiddenSchools:compatibility.schools.filter((school, index) => selectedAdmissibility[index] === "forbidden"),
      compatibility:round(compatibilityPoints),
      referencePower:round(referencePowerPoints),
      referenceSchool:round(referencePowerPoints),
      grade:round(gradePoints),
      intensity:round(intensityPoints),
      arcaneWeight:round(arcanePoints),
      craftingWeight:round(craftingPoints),
      versatility:round(versatilityPoints),
      exceptionality:round(exceptionalPoints)
    };
  }

  function buildFamilyProfile(definitionOrId, options = {}) {
    const definition = typeof definitionOrId === "string"
      ? A.getSigianCanonicalV2?.(definitionOrId)
      : clone(definitionOrId);
    if (!definition) throw new Error(`Componente canonico non trovato: ${definitionOrId}.`);
    if (!definition.id) throw new Error("La definizione del componente richiede un id.");
    if (!definition.kind) throw new Error(`Il componente ${definition.id} richiede kind.`);
    const tags = semanticTags(definition, options);
    const adherence = deriveAdherence(definition, tags, options);
    const confidence = deriveConfidence(tags, adherence);
    const admissibility = deriveAdmissibility(definition, adherence.bySchool, options);
    const gradeProfile = options.gradeProfile || parseGradeProfile(definition);
    if (gradeProfile.status === "unsupported" && !options.allowUnsupportedGradeProfile) {
      throw new Error(`Scala Gradi non riconosciuta per ${definition.id}: ${definition.grades || "-"}.`);
    }
    return {
      schemaVersion:COMPONENT_DESIGN_SCHEMA_VERSION,
      id:definition.id,
      kind:definition.kind,
      family:definition.name,
      summary:definition.summary || "",
      powerReference:/<(Scuola|Potere)>/i.test(String(definition.name || "")),
      requiresReferencePower:/<(Scuola|Potere)>/i.test(String(definition.name || "")),
      schoolReference:/<(Scuola|Potere)>/i.test(String(definition.name || "")),
      requiresReferenceSchool:/<(Scuola|Potere)>/i.test(String(definition.name || "")),
      semanticTags:tags,
      primaryTag:adherence.primaryTag,
      adherence:adherence.bySchool,
      adherenceScores:Object.fromEntries(Object.entries(adherence.evidence).map(([school, item]) => [school, item?.score100 ?? null])),
      adherenceAutomaticScores:Object.fromEntries(Object.entries(adherence.evidence).map(([school, item]) => [school, item?.automaticScore100 ?? null])),
      adherenceEvidence:adherence.evidence,
      confidence:confidence,
      confidenceBySchool:confidence.bySchool,
      admissibility:admissibility.bySchool,
      admissibilityEvidence:admissibility.evidence,
      maxCompatibilityMode:admissibility.maxCompatibilityMode,
      gradeProfile:clone(gradeProfile),
      versatility:deriveVersatility(tags),
      exceptionality:deriveExceptional(tags),
      status:definition.status || "draft"
    };
  }

  function resolveArcaneWeight(profile, grade, intensityPercentile, options = {}) {
    if (Number.isFinite(Number(options.arcaneWeight))) {
      return { value:Math.abs(Number(options.arcaneWeight)), signedDelta:Number(options.arcaneValueDelta ?? options.arcaneWeight), source:"explicit-evaluator" };
    }
    if (typeof options.arcaneWeightResolver === "function") {
      const result = options.arcaneWeightResolver({ profile:clone(profile), grade, intensityPercentile });
      const value = Number(result?.value ?? result);
      if (Number.isFinite(value)) {
        return { value:Math.abs(value), signedDelta:Number(result?.signedDelta ?? value), source:result?.source || "custom-evaluator" };
      }
    }
    return {
      value:estimatedArcaneWeight(profile.semanticTags, grade, intensityPercentile),
      signedDelta:null,
      source:"design-estimate"
    };
  }

  function calculateVariant(definitionOrId, options = {}) {
    const profile = definitionOrId
      && Number(definitionOrId.schemaVersion) === COMPONENT_DESIGN_SCHEMA_VERSION
      && definitionOrId.gradeProfile
      && definitionOrId.adherence
      ? definitionOrId
      : buildFamilyProfile(definitionOrId, options);
    const gradeProfile = profile.gradeProfile;
    const requestedGrade = options.grade === undefined
      ? gradeProfile.grades[0]?.grade
      : options.grade;
    const entry = gradeEntry(gradeProfile, requestedGrade);
    if (!entry) throw new Error(`Grado ${requestedGrade} non disponibile per ${profile.id}.`);
    const intensity = options.intensity === undefined ? entry.intensities?.[0] ?? null : options.intensity;
    if (entry.intensities?.length && intensity != null && !entry.intensities.some(value => Number(value) === Number(intensity))) {
      throw new Error(`Intensità ${intensity} non disponibile per ${profile.id} Grado ${requestedGrade}.`);
    }
    const intensityPercentile = intensityPosition(entry, intensity);
    const compatibility = options.compatibility
      ? compatibilityForSchools(options.compatibility.schools || options.compatibility)
      : compatibilityForSchools(options.compatibilitySchools || [schoolOrder()[0]]);
    const requiresReferencePower = profile.requiresReferencePower || profile.requiresReferenceSchool || profile.powerReference || profile.schoolReference;
    const referencePower = requiresReferencePower
      ? String(options.referencePower ?? options.referenceSchool ?? "").trim()
      : null;
    if (requiresReferencePower && !schoolOrder().includes(referencePower)) {
      throw new Error(`Potere di riferimento richiesto per ${profile.id}: ${referencePower || "-"}.`);
    }
    const compatibilityDomainStatus = classifyCompatibilityForProfile(profile, compatibility);
    if (!compatibilityDomainStatus.legal && options.allowForbiddenCompatibility !== true) {
      throw new Error(`Compatibilità vietata per ${profile.id}: ${compatibility.schools.join(",")} (${compatibilityDomainStatus.reasons.join(",")}).`);
    }
    const includedAdherence = Object.fromEntries(compatibility.schools.map(school => [school, profile.adherence[school]]));
    if (Object.values(includedAdherence).some(value => !value)) {
      throw new Error(`Aderenza incompleta per ${profile.id} / ${compatibility.schools.join(",")}.`);
    }
    const craftingWeight = Number.isFinite(Number(options.craftingWeight))
      ? Number(options.craftingWeight)
      : craftingWeightForGrade(requestedGrade);
    const arcaneWeight = resolveArcaneWeight(profile, requestedGrade, intensityPercentile, options);
    const rarity = rarityBreakdown({
      compatibility,
      adherenceScoresBySchool:profile.adherenceScores,
      admissibilityBySchool:profile.admissibility,
      referencePower,
      grade:requestedGrade,
      intensityPercentile,
      arcaneWeight:arcaneWeight.value,
      craftingWeight,
      versatility:profile.versatility,
      exceptionality:profile.exceptionality
    });
    const tier = rarityTier(rarity.total);
    if (options.auditLightweight === true) {
      return {
        familyId:profile.id,
        family:profile.family,
        kind:profile.kind,
        compatibility,
        compatibilityStatus:compatibilityDomainStatus.status,
        compatibilityStatusReasons:[...compatibilityDomainStatus.reasons],
        referencePower,
        referencePowerAlignment:referencePower == null ? "not-applicable" : compatibility.schools.includes(referencePower) ? "included" : "cross-school",
        grade:requestedGrade,
        intensity,
        rarity:{ id:tier.id, label:tier.label, score:rarity.total }
      };
    }
    return {
      schemaVersion:COMPONENT_DESIGN_SCHEMA_VERSION,
      familyId:profile.id,
      family:profile.family,
      kind:profile.kind,
      compatibility,
      compatibilityLabel:compatibilityDisplayLabel(compatibility),
      compatibilityStatus:compatibilityDomainStatus.status,
      compatibilityStatusReasons:[...compatibilityDomainStatus.reasons],
      admissibility:Object.fromEntries(compatibility.schools.map(school => [school, profile.admissibility[school]])),
      admissibilityMatrix:clone(profile.admissibility),
      maxCompatibilityMode:profile.maxCompatibilityMode,
      referencePower,
      referencePowerLabel:referencePower == null ? null : powerDisplayName(referencePower),
      referencePowerAlignment:referencePower == null ? "not-applicable" : compatibility.schools.includes(referencePower) ? "included" : "cross-school",
      referenceSchool:referencePower,
      referenceSchoolAlignment:referencePower == null ? "not-applicable" : compatibility.schools.includes(referencePower) ? "included" : "cross-school",
      familyDisplayName:familyDisplayName(profile, referencePower),
      adherence:includedAdherence,
      adherenceScore:Object.fromEntries(compatibility.schools.map(school => [school, profile.adherenceScores?.[school] ?? null])),
      adherenceMatrix:clone(profile.adherence),
      adherenceScoreMatrix:clone(profile.adherenceScores || {}),
      confidence:Object.fromEntries(compatibility.schools.map(school => [school, clone(profile.confidenceBySchool?.[school] || null)])),
      confidenceMatrix:clone(profile.confidenceBySchool || {}),
      grade:requestedGrade,
      intensity,
      arcaneWeight:round(arcaneWeight.value),
      arcaneValueDelta:arcaneWeight.signedDelta == null ? null : round(arcaneWeight.signedDelta),
      arcaneWeightSource:arcaneWeight.source,
      craftingWeight,
      versatility:clone(profile.versatility),
      rarity:{
        id:tier.id,
        label:tier.label,
        score:rarity.total,
        provisional:true,
        breakdown:rarity
      },
      powerReference:profile.powerReference,
      schoolReference:profile.schoolReference,
      semanticTags:[...profile.semanticTags]
    };
  }

  function generateVariants(definitionOrId, options = {}) {
    const profile = definitionOrId
      && Number(definitionOrId.schemaVersion) === COMPONENT_DESIGN_SCHEMA_VERSION
      && definitionOrId.gradeProfile
      && definitionOrId.adherence
      ? definitionOrId
      : buildFamilyProfile(definitionOrId, options);
    const requestedCompatibilities = options.compatibilities
      ? options.compatibilities.map(item => compatibilityForSchools(item?.schools || item))
      : compatibilityDomain(profile, options).map(item => item.compatibility);
    const compatibilities = requestedCompatibilities.filter(compatibility => {
      const domainStatus = classifyCompatibilityForProfile(profile, compatibility);
      return domainStatus.legal || options.includeForbiddenCompatibilities === true;
    });
    const grades = options.grade === undefined
      ? profile.gradeProfile.grades
      : profile.gradeProfile.grades.filter(entry => entry.grade === options.grade);
    const requiresReferencePower = profile.requiresReferencePower || profile.requiresReferenceSchool || profile.powerReference || profile.schoolReference;
    const referencePowers = requiresReferencePower
      ? (options.referencePower ?? options.referenceSchool)
        ? [String(options.referencePower ?? options.referenceSchool)]
        : (options.referencePowers || options.referenceSchools || schoolOrder())
      : [null];
    const output = [];
    grades.forEach(entry => {
      const intensities = options.intensity === undefined ? (entry.intensities?.length ? entry.intensities : [null]) : [options.intensity];
      intensities.forEach(intensity => {
        referencePowers.forEach(referencePower => {
          compatibilities.forEach(compatibility => {
            output.push(calculateVariant(profile, {
              ...options,
              grade:entry.grade,
              intensity,
              referencePower,
              compatibility,
              allowForbiddenCompatibility:options.includeForbiddenCompatibilities === true
            }));
          });
        });
      });
    });
    return output.sort((left, right) => left.rarity.score - right.rarity.score || left.family.localeCompare(right.family));
  }

  function canonicalCatalog(options = {}) {
    if (typeof A.listSigianCanonicalV2 !== "function") throw new Error("Catalogo canonico v2 non disponibile.");
    return A.listSigianCanonicalV2({ status:options.status || "approved" })
      .map(definition => buildFamilyProfile(definition, options));
  }

  function gradeIntensityPairsForProfile(profile) {
    return profile.gradeProfile.grades.flatMap(entry => {
      const intensities = entry.intensities?.length ? entry.intensities : [null];
      return intensities.map(intensity => ({ grade:entry.grade, intensity }));
    });
  }

  function compatibilityKey(compatibility) {
    return compatibility.schools.join("+");
  }

  function concreteVariantKey(variant) {
    return [
      variant.familyId,
      "g=" + String(variant.grade),
      "i=" + String(variant.intensity),
      "p=" + String(variant.referencePower),
      "c=" + compatibilityKey(variant.compatibility)
    ].join("|");
  }

  function modeCounts(items) {
    const counts = { mono:0, dual:0, triple:0, universal:0 };
    items.forEach(item => {
      const compatibility = item.compatibility || item;
      if (counts[compatibility.mode] !== undefined) counts[compatibility.mode] += 1;
    });
    return counts;
  }

  function concreteVariantCoordinate(profile, pair, referencePower, domainEntry) {
    return {
      familyId:profile.id,
      grade:pair.grade,
      intensity:pair.intensity,
      referencePower,
      compatibility:domainEntry.compatibility,
      compatibilityStatus:domainEntry.status,
      referencePowerAlignment:referencePower == null
        ? "not-applicable"
        : domainEntry.compatibility.schools.includes(referencePower)
          ? "included"
          : "cross-school"
    };
  }

  function enumerateConcreteVariantCoordinates(profile, domainEntries, gradeIntensityPairs, referencePowers) {
    const output = [];
    gradeIntensityPairs.forEach(pair => {
      referencePowers.forEach(referencePower => {
        domainEntries.forEach(domainEntry => {
          output.push(concreteVariantCoordinate(profile, pair, referencePower, domainEntry));
        });
      });
    });
    return output;
  }

  function combinatorialAudit(options = {}) {
    const profiles = options.profiles || canonicalCatalog(options);
    const schools = schoolOrder();
    const theoreticalCompatibilities = enumerateCompatibilities();
    const expectedModes = modeCounts(theoreticalCompatibilities);
    const allAnomalies = [];

    const families = profiles.map(profile => {
      const theoreticalDomain = compatibilityDomain(profile);
      const legalDomain = theoreticalDomain.filter(item => item.legal);
      const excludedDomain = theoreticalDomain.filter(item => !item.legal);
      const gradeIntensityPairs = gradeIntensityPairsForProfile(profile);
      const requiresReferencePower = profile.requiresReferencePower || profile.requiresReferenceSchool || profile.powerReference || profile.schoolReference;
      const referencePowers = requiresReferencePower ? schools : [null];
      const variantMultiplier = gradeIntensityPairs.length * referencePowers.length;
      const familyAnomalies = [];

      const pushAnomaly = (category, reason, details = {}) => {
        const anomaly = { category, familyId:profile.id, family:familyDisplayName(profile, null), reason, ...details };
        familyAnomalies.push(anomaly);
        allAnomalies.push(anomaly);
      };

      if (theoreticalDomain.length !== theoreticalCompatibilities.length) {
        pushAnomaly("theoretical-domain-size", "Il Dominio di Compatibilità non contiene tutte le combinazioni teoriche.", {
          expected:theoreticalCompatibilities.length,
          actual:theoreticalDomain.length
        });
      }

      const theoreticalModes = modeCounts(theoreticalDomain);
      Object.keys(expectedModes).forEach(mode => {
        if (theoreticalModes[mode] !== expectedModes[mode]) {
          pushAnomaly("theoretical-mode-coverage", "Copertura teorica incompleta per " + mode + ".", {
            mode,
            expected:expectedModes[mode],
            actual:theoreticalModes[mode]
          });
        }
      });

      if (!legalDomain.length) {
        pushAnomaly("empty-legal-domain", "La Famiglia non possiede alcuna Compatibilità legalmente generabile.");
      }
      if (!gradeIntensityPairs.length) {
        pushAnomaly("empty-grade-intensity-domain", "La Famiglia non possiede configurazioni Grado/Intensità auditabili.");
      }

      legalDomain.forEach(item => {
        if (COMPATIBILITY_MODE_ORDER[item.compatibility.mode] > COMPATIBILITY_MODE_ORDER[profile.maxCompatibilityMode]) {
          pushAnomaly("max-mode-leak", "Una Compatibilità oltre maxCompatibilityMode risulta legalmente ammessa.", {
            compatibility:compatibilityDisplayLabel(item.compatibility),
            maxCompatibilityMode:profile.maxCompatibilityMode
          });
        }
        const forbiddenSchools = item.compatibility.schools.filter(school => profile.admissibility[school] === "forbidden");
        if (forbiddenSchools.length) {
          pushAnomaly("forbidden-school-leak", "Una Compatibilità con Scuola forbidden risulta legalmente ammessa.", {
            compatibility:compatibilityDisplayLabel(item.compatibility),
            schools:forbiddenSchools
          });
        }
      });

      const legalCoordinates = enumerateConcreteVariantCoordinates(profile, legalDomain, gradeIntensityPairs, referencePowers);
      const diagnosticCoordinates = enumerateConcreteVariantCoordinates(profile, theoreticalDomain, gradeIntensityPairs, referencePowers);
      const expectedLegalConcrete = legalDomain.length * variantMultiplier;
      const expectedTheoreticalConcrete = theoreticalDomain.length * variantMultiplier;

      if (legalCoordinates.length !== expectedLegalConcrete) {
        pushAnomaly("legal-enumeration-count", "L'enumerazione concreta legale non coincide con lo spazio atteso.", {
          expected:expectedLegalConcrete,
          actual:legalCoordinates.length
        });
      }
      if (diagnosticCoordinates.length !== expectedTheoreticalConcrete) {
        pushAnomaly("diagnostic-enumeration-count", "L'enumerazione diagnostica non coincide con l'intero spazio teorico.", {
          expected:expectedTheoreticalConcrete,
          actual:diagnosticCoordinates.length
        });
      }

      if (legalCoordinates.some(variant => variant.compatibilityStatus === "forbidden")) {
        pushAnomaly("forbidden-enumerated-as-legal", "Lo spazio concreto legale contiene almeno una variante forbidden.");
      }

      const legalKeys = legalCoordinates.map(concreteVariantKey);
      if (new Set(legalKeys).size !== legalKeys.length) {
        pushAnomaly("duplicate-legal-variant", "L'enumerazione legale contiene varianti concrete duplicate.");
      }
      const diagnosticKeys = diagnosticCoordinates.map(concreteVariantKey);
      if (new Set(diagnosticKeys).size !== diagnosticKeys.length) {
        pushAnomaly("duplicate-diagnostic-variant", "Il dominio diagnostico contiene varianti concrete duplicate.");
      }

      let alignedReferencePowerVariants = 0;
      let crossSchoolReferencePowerVariants = 0;
      legalCoordinates.forEach(variant => {
        if (variant.referencePowerAlignment === "included") alignedReferencePowerVariants += 1;
        if (variant.referencePowerAlignment === "cross-school") crossSchoolReferencePowerVariants += 1;
      });

      let runtimeSamplesChecked = 0;
      const representativePair = gradeIntensityPairs[0] || null;
      if (representativePair) {
        legalDomain.forEach(domainEntry => {
          referencePowers.forEach(referencePower => {
            try {
              const variant = calculateVariant(profile, {
                grade:representativePair.grade,
                intensity:representativePair.intensity,
                referencePower,
                compatibility:domainEntry.compatibility,
                auditLightweight:true
              });
              runtimeSamplesChecked += 1;
              if (variant.compatibilityStatus !== domainEntry.status) {
                pushAnomaly("compatibility-status-mismatch", "Lo status runtime non coincide con il Dominio di Compatibilità.", {
                  compatibility:compatibilityDisplayLabel(domainEntry.compatibility),
                  referencePower,
                  expected:domainEntry.status,
                  actual:variant.compatibilityStatus
                });
              }
              const expectedAlignment = referencePower == null
                ? "not-applicable"
                : domainEntry.compatibility.schools.includes(referencePower)
                  ? "included"
                  : "cross-school";
              if (variant.referencePowerAlignment !== expectedAlignment) {
                pushAnomaly("reference-power-alignment", "L'allineamento del Potere di riferimento non coincide con la Compatibilità.", {
                  compatibility:compatibilityDisplayLabel(domainEntry.compatibility),
                  referencePower,
                  expected:expectedAlignment,
                  actual:variant.referencePowerAlignment
                });
              }
              if (!Number.isFinite(Number(variant.rarity?.score))) {
                pushAnomaly("rarity-not-finite", "Il campione runtime legale non possiede uno score Rarità numerico.", {
                  compatibility:compatibilityDisplayLabel(domainEntry.compatibility),
                  referencePower
                });
              }
            } catch (error) {
              pushAnomaly("legal-runtime-error", "Una Compatibilità legale fallisce nel calcolatore runtime.", {
                compatibility:compatibilityDisplayLabel(domainEntry.compatibility),
                referencePower,
                error:String(error?.message || error)
              });
            }
          });
        });

        excludedDomain.forEach(domainEntry => {
          const referencePower = referencePowers[0];
          let rejected = false;
          try {
            calculateVariant(profile, {
              grade:representativePair.grade,
              intensity:representativePair.intensity,
              referencePower,
              compatibility:domainEntry.compatibility,
              auditLightweight:true
            });
          } catch (_) {
            rejected = true;
          }
          if (!rejected) {
            pushAnomaly("excluded-runtime-accepted", "Una Compatibilità esclusa viene accettata dal calcolatore senza opt-in diagnostico.", {
              compatibility:compatibilityDisplayLabel(domainEntry.compatibility),
              reasons:[...domainEntry.reasons]
            });
          }
          try {
            const diagnosticVariant = calculateVariant(profile, {
              grade:representativePair.grade,
              intensity:representativePair.intensity,
              referencePower,
              compatibility:domainEntry.compatibility,
              allowForbiddenCompatibility:true,
              auditLightweight:true
            });
            runtimeSamplesChecked += 1;
            if (diagnosticVariant.compatibilityStatus !== "forbidden") {
              pushAnomaly("excluded-diagnostic-status", "Una Compatibilità esclusa non resta forbidden in modalità diagnostica.", {
                compatibility:compatibilityDisplayLabel(domainEntry.compatibility),
                actual:diagnosticVariant.compatibilityStatus
              });
            }
          } catch (error) {
            pushAnomaly("excluded-diagnostic-error", "Una Compatibilità esclusa non è ispezionabile in modalità diagnostica.", {
              compatibility:compatibilityDisplayLabel(domainEntry.compatibility),
              error:String(error?.message || error)
            });
          }
        });
      }

      const legalModes = modeCounts(legalDomain);
      const excludedModes = modeCounts(excludedDomain);
      const standardDomain = legalDomain.filter(item => item.status === "standard");
      const exceptionalDomain = legalDomain.filter(item => item.status === "exceptional");
      const excludedKeySet = new Set(excludedDomain.map(item => compatibilityKey(item.compatibility)));

      return {
        familyId:profile.id,
        family:familyDisplayName(profile, null),
        kind:profile.kind,
        maxCompatibilityMode:profile.maxCompatibilityMode,
        requiresReferencePower:Boolean(requiresReferencePower),
        gradeIntensityConfigurations:gradeIntensityPairs.length,
        referencePowerChoices:referencePowers.length,
        compatibilityDomain:{
          theoretical:theoreticalDomain.length,
          legal:legalDomain.length,
          standard:standardDomain.length,
          exceptional:exceptionalDomain.length,
          excluded:excludedDomain.length,
          modes:{
            theoretical:theoreticalModes,
            legal:legalModes,
            excluded:excludedModes
          },
          legalCompatibilities:legalDomain.map(item => ({
            label:compatibilityDisplayLabel(item.compatibility),
            mode:item.compatibility.mode,
            schools:[...item.compatibility.schools],
            status:item.status
          })),
          excludedCompatibilities:excludedDomain.map(item => ({
            label:compatibilityDisplayLabel(item.compatibility),
            mode:item.compatibility.mode,
            schools:[...item.compatibility.schools],
            status:item.status,
            reasons:[...item.reasons]
          }))
        },
        concreteVariants:{
          theoretical:expectedTheoreticalConcrete,
          legal:expectedLegalConcrete,
          standard:standardDomain.length * variantMultiplier,
          exceptional:exceptionalDomain.length * variantMultiplier,
          excluded:excludedDomain.length * variantMultiplier,
          enumeratedChecked:legalCoordinates.length,
          diagnosticEnumerated:diagnosticCoordinates.length,
          runtimeSamplesChecked,
          legalVariantKeys:options.includeVariantKeys === true ? legalKeys : undefined,
          excludedVariantKeys:options.includeVariantKeys === true
            ? diagnosticCoordinates.filter(variant => excludedKeySet.has(compatibilityKey(variant.compatibility))).map(concreteVariantKey)
            : undefined
        },
        referencePower:{
          applicable:Boolean(requiresReferencePower),
          aligned:alignedReferencePowerVariants,
          crossSchool:crossSchoolReferencePowerVariants
        },
        anomalies:familyAnomalies
      };
    });

    const aggregateModes = key => families.reduce((acc, family) => {
      Object.keys(acc).forEach(mode => {
        acc[mode] += family.compatibilityDomain.modes[key][mode];
      });
      return acc;
    }, { mono:0, dual:0, triple:0, universal:0 });

    const summary = {
      familyCount:families.length,
      referencePowerFamilies:families.filter(item => item.requiresReferencePower).length,
      compatibilitySets:{
        theoretical:families.reduce((sum, item) => sum + item.compatibilityDomain.theoretical, 0),
        legal:families.reduce((sum, item) => sum + item.compatibilityDomain.legal, 0),
        standard:families.reduce((sum, item) => sum + item.compatibilityDomain.standard, 0),
        exceptional:families.reduce((sum, item) => sum + item.compatibilityDomain.exceptional, 0),
        excluded:families.reduce((sum, item) => sum + item.compatibilityDomain.excluded, 0)
      },
      compatibilityModes:{
        theoretical:aggregateModes("theoretical"),
        legal:aggregateModes("legal"),
        excluded:aggregateModes("excluded")
      },
      concreteVariants:{
        theoretical:families.reduce((sum, item) => sum + item.concreteVariants.theoretical, 0),
        legal:families.reduce((sum, item) => sum + item.concreteVariants.legal, 0),
        standard:families.reduce((sum, item) => sum + item.concreteVariants.standard, 0),
        exceptional:families.reduce((sum, item) => sum + item.concreteVariants.exceptional, 0),
        excluded:families.reduce((sum, item) => sum + item.concreteVariants.excluded, 0),
        runtimeSamplesChecked:families.reduce((sum, item) => sum + item.concreteVariants.runtimeSamplesChecked, 0)
      },
      referencePowerVariants:{
        aligned:families.reduce((sum, item) => sum + item.referencePower.aligned, 0),
        crossSchool:families.reduce((sum, item) => sum + item.referencePower.crossSchool, 0)
      },
      anomalyCount:allAnomalies.length,
      familiesWithAnomalies:families.filter(item => item.anomalies.length).length
    };

    return {
      schemaVersion:COMPONENT_DESIGN_SCHEMA_VERSION,
      generatedAt:new Date().toISOString(),
      policy:{
        theoreticalCompatibilityModes:{ ...expectedModes },
        forbiddenGeneration:"excluded-by-default",
        diagnosticForbiddenGeneration:"explicit-only",
        concreteEnumeration:"exhaustive-coordinate-space",
        runtimeValidation:"compatibility-by-reference-power representative grade/intensity",
        referencePower:"audited-as-separate-axis",
        mutationsApplied:false
      },
      summary,
      anomalies:allAnomalies,
      families
    };
  }

  function componentDesignAudit(options = {}) {
    const profiles = options.profiles || canonicalCatalog(options);
    const schools = schoolOrder();
    const reviewQueue = [];
    const forbiddenCandidates = [];
    const compatibilityWidthCandidates = [];
    const familyRows = profiles.map(profile => {
      const auditFamily = familyDisplayName(profile, null);
      const domain = compatibilityDomain(profile);
      const domainCounts = {
        standard:domain.filter(item => item.status === "standard").length,
        exceptional:domain.filter(item => item.status === "exceptional").length,
        forbidden:domain.filter(item => item.status === "forbidden").length,
        legal:domain.filter(item => item.legal).length
      };
      const coreSchools = schools.filter(school => profile.adherence[school] === "core");
      const dissonantSchools = schools.filter(school => profile.adherence[school] === "dissonant");
      const lowConfidenceSchools = schools.filter(school => profile.confidenceBySchool[school]?.score < CONFIDENCE_THRESHOLDS.low);
      const adjustedSchools = schools.filter(school => Math.abs(Number(profile.adherenceEvidence[school]?.reviewAdjustment || 0)) >= CONFIDENCE_THRESHOLDS.largeReviewAdjustment);
      const nearBoundarySchools = schools.filter(school => {
        const distance = nearestBandBoundaryDistance(profile.adherenceAutomaticScores[school]);
        return distance != null && distance <= CONFIDENCE_THRESHOLDS.nearBoundary;
      });
      const admissibilityInconsistencies = schools.filter(school => {
        const evidence = profile.admissibilityEvidence?.[school];
        if (evidence?.source !== "adherence-default") return false;
        return profile.admissibility[school] !== ADMISSIBILITY_FROM_ADHERENCE[profile.adherence[school]];
      });
      const automaticScores = schools.map(school => Number(profile.adherenceAutomaticScores[school])).filter(Number.isFinite);
      const automaticRange = automaticScores.length ? round(Math.max(...automaticScores) - Math.min(...automaticScores)) : null;
      const explicitAdmissibility = schools.filter(school => profile.admissibilityEvidence?.[school]?.source !== "adherence-default");
      const anomalies = [];

      if (!coreSchools.length) {
        anomalies.push("no-core");
        reviewQueue.push({ category:"no-core", familyId:profile.id, family:auditFamily, reason:"La Famiglia non ha alcuna Scuola Core." });
      }
      if (coreSchools.length > 2) {
        anomalies.push("too-many-core");
        reviewQueue.push({ category:"too-many-core", familyId:profile.id, family:auditFamily, schools:coreSchools, reason:"La Famiglia ha " + coreSchools.length + " Scuole Core." });
      }
      if (automaticRange != null && automaticRange <= CONFIDENCE_THRESHOLDS.flatAutomaticRange) {
        anomalies.push("flat-automatic-profile");
        reviewQueue.push({ category:"flat-automatic-profile", familyId:profile.id, family:auditFamily, automaticRange, reason:"Gli score automatici differiscono di soli " + automaticRange + " punti." });
      }
      lowConfidenceSchools.forEach(school => {
        reviewQueue.push({
          category:"low-confidence",
          familyId:profile.id,
          family:auditFamily,
          school,
          confidence:profile.confidenceBySchool[school].score,
          confidence100:profile.confidenceBySchool[school].score100,
          reason:"Confidence sotto " + CONFIDENCE_THRESHOLDS.low + "."
        });
      });
      adjustedSchools.forEach(school => {
        reviewQueue.push({
          category:"large-review-adjustment",
          familyId:profile.id,
          family:auditFamily,
          school,
          automaticScore:profile.adherenceAutomaticScores[school],
          finalScore:profile.adherenceScores[school],
          adjustment:profile.adherenceEvidence[school].reviewAdjustment,
          reason:"Review adjustment almeno " + CONFIDENCE_THRESHOLDS.largeReviewAdjustment + " punti."
        });
      });
      nearBoundarySchools.forEach(school => {
        reviewQueue.push({
          category:"near-band-boundary",
          familyId:profile.id,
          family:auditFamily,
          school,
          automaticScore:profile.adherenceAutomaticScores[school],
          distance:nearestBandBoundaryDistance(profile.adherenceAutomaticScores[school]),
          reason:"Score automatico entro " + CONFIDENCE_THRESHOLDS.nearBoundary + " punti da un confine di banda."
        });
      });
      admissibilityInconsistencies.forEach(school => {
        reviewQueue.push({
          category:"admissibility-incoherent",
          familyId:profile.id,
          family:auditFamily,
          school,
          adherence:profile.adherence[school],
          admissibility:profile.admissibility[school],
          expected:ADMISSIBILITY_FROM_ADHERENCE[profile.adherence[school]],
          reason:"Ammissibilità derivata non coerente con il default dell'Aderenza."
        });
      });
      if (explicitAdmissibility.length) {
        anomalies.push("explicit-admissibility");
        reviewQueue.push({
          category:"explicit-admissibility",
          familyId:profile.id,
          family:auditFamily,
          schools:explicitAdmissibility,
          reason:"Sono presenti override espliciti di Ammissibilità; conservarli come decisioni tracciate."
        });
      }
      if (domainCounts.legal < schools.length) {
        anomalies.push("few-legal-combinations");
        reviewQueue.push({
          category:"few-legal-combinations",
          familyId:profile.id,
          family:auditFamily,
          legalCombinations:domainCounts.legal,
          reason:"Il Dominio legale contiene meno combinazioni delle cinque Mono teoriche."
        });
      }

      schools.forEach(school => {
        const confidence = profile.confidenceBySchool[school];
        const adjustment = Math.abs(Number(profile.adherenceEvidence[school]?.reviewAdjustment || 0));
        const automaticScore = Number(profile.adherenceAutomaticScores[school]);
        if (
          profile.adherence[school] === "dissonant"
          && Number.isFinite(automaticScore)
          && automaticScore <= CONFIDENCE_THRESHOLDS.forbiddenCandidateScore
          && confidence?.score >= CONFIDENCE_THRESHOLDS.forbiddenCandidateConfidence
          && adjustment <= 4.167
        ) {
          const candidate = {
            familyId:profile.id,
            family:auditFamily,
            school,
            score:profile.adherenceScores[school],
            automaticScore,
            confidence:confidence.score,
            confidence100:confidence.score100,
            currentAdmissibility:profile.admissibility[school],
            reason:"Dissonanza forte, stabile e ad alta Confidence: candidata a review umana forbidden, non a modifica automatica."
          };
          forbiddenCandidates.push(candidate);
          reviewQueue.push({ category:"forbidden-candidate", ...candidate });
        }
      });

      if (
        profile.maxCompatibilityMode === "universal"
        && dissonantSchools.length >= CONFIDENCE_THRESHOLDS.widthReviewDissonantSchools
      ) {
        const candidate = {
          familyId:profile.id,
          family:auditFamily,
          currentMaxCompatibilityMode:profile.maxCompatibilityMode,
          dissonantSchools:[...dissonantSchools],
          dissonantConfidence:Object.fromEntries(dissonantSchools.map(school => [school, profile.confidenceBySchool[school]?.score ?? null])),
          exceptionalCombinations:domainCounts.exceptional,
          legalCombinations:domainCounts.legal,
          reason:"La Famiglia resta Universale pur avendo almeno due relazioni Dissonanti. È solo un segnale per review dell'ampiezza; non suggerisce automaticamente Mono/Dual/Triple e non sostituisce la review delle singole relazioni."
        };
        compatibilityWidthCandidates.push(candidate);
        reviewQueue.push({ category:"max-width-candidate", ...candidate });
      }

      return {
        id:profile.id,
        family:auditFamily,
        kind:profile.kind,
        primaryTag:profile.primaryTag,
        coreSchools,
        dissonantSchools,
        adherence:clone(profile.adherence),
        automaticScores:clone(profile.adherenceAutomaticScores),
        finalScores:clone(profile.adherenceScores),
        reviewAdjustment:Object.fromEntries(schools.map(school => [school, profile.adherenceEvidence[school]?.reviewAdjustment ?? null])),
        confidence:Object.fromEntries(schools.map(school => [school, profile.confidenceBySchool[school]?.score ?? null])),
        confidence100:Object.fromEntries(schools.map(school => [school, profile.confidenceBySchool[school]?.score100 ?? null])),
        confidenceAverage:profile.confidence.score,
        confidenceMinimum:profile.confidence.minimum,
        lowConfidenceSchools,
        nearBoundarySchools,
        admissibilityInconsistencies,
        admissibility:clone(profile.admissibility),
        maxCompatibilityMode:profile.maxCompatibilityMode,
        domain:domainCounts,
        automaticRange,
        anomalies
      };
    });

    const cells = profiles.flatMap(profile => schools.map(school => ({
      profile,
      school,
      adherence:profile.adherence[school],
      admissibility:profile.admissibility[school],
      confidence:profile.confidenceBySchool[school]?.score ?? 0
    })));
    const countBy = (items, keyFn) => items.reduce((acc, item) => {
      const key = keyFn(item);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return {
      schemaVersion:COMPONENT_DESIGN_SCHEMA_VERSION,
      thresholds:clone(CONFIDENCE_THRESHOLDS),
      confidenceWeights:clone(CONFIDENCE_WEIGHTS),
      families:familyRows,
      summary:{
        familyCount:profiles.length,
        cellCount:cells.length,
        adherenceDistribution:countBy(cells, cell => cell.adherence),
        admissibilityDistribution:countBy(cells, cell => cell.admissibility),
        confidenceDistribution:{
          high:cells.filter(cell => cell.confidence >= CONFIDENCE_THRESHOLDS.high).length,
          medium:cells.filter(cell => cell.confidence >= CONFIDENCE_THRESHOLDS.low && cell.confidence < CONFIDENCE_THRESHOLDS.high).length,
          low:cells.filter(cell => cell.confidence < CONFIDENCE_THRESHOLDS.low).length
        },
        compatibilityDomainTotals:familyRows.reduce((acc, row) => {
          ["standard","exceptional","forbidden","legal"].forEach(key => { acc[key] += row.domain[key]; });
          return acc;
        }, { standard:0, exceptional:0, forbidden:0, legal:0 }),
        familiesWithoutCore:familyRows.filter(row => row.coreSchools.length === 0).length,
        familiesWithMoreThanTwoCore:familyRows.filter(row => row.coreSchools.length > 2).length,
        familiesWithLowConfidence:familyRows.filter(row => row.lowConfidenceSchools.length > 0).length,
        reviewQueueItems:reviewQueue.length,
        forbiddenCandidates:forbiddenCandidates.length,
        compatibilityWidthCandidates:compatibilityWidthCandidates.length
      },
      reviewQueue,
      forbiddenCandidates,
      compatibilityWidthCandidates
    };
  }

  function compatibilityOnDissolution(options = {}) {
    const existing = options.imprintedCompatibility || options.componentCompatibility || null;
    if (existing) {
      const normalized = compatibilityForSchools(existing.schools || existing);
      return { ...normalized, provenance:"preserved-imprinted-component" };
    }
    const school = String(options.sourceFormulaSchool || "").trim();
    if (!school || !schoolOrder().includes(school)) throw new Error(`Scuola Formula sorgente non valida: ${school || "-"}.`);
    return { mode:"mono", schools:[school], provenance:"generated-from-formula-school" };
  }

  A.SIGIAN_COMPONENT_DESIGN_SCHEMA_VERSION = COMPONENT_DESIGN_SCHEMA_VERSION;
  A.SIGIAN_COMPONENT_ADHERENCE_LEVELS = ADHERENCE_LEVELS;
  A.SIGIAN_COMPONENT_ADMISSIBILITY_LEVELS = ADMISSIBILITY_LEVELS;
  A.SIGIAN_COMPONENT_ADMISSIBILITY_FROM_ADHERENCE = ADMISSIBILITY_FROM_ADHERENCE;
  A.SIGIAN_COMPONENT_SCHOOL_DISPLAY_NAMES = SCHOOL_DISPLAY_NAMES;
  A.SIGIAN_COMPONENT_POWER_DISPLAY_NAMES = POWER_DISPLAY_NAMES;
  A.SIGIAN_COMPONENT_PRIMARY_TAG_WEIGHT = PRIMARY_TAG_WEIGHT;
  A.SIGIAN_COMPONENT_CONFIDENCE_WEIGHTS = CONFIDENCE_WEIGHTS;
  A.SIGIAN_COMPONENT_CONFIDENCE_THRESHOLDS = CONFIDENCE_THRESHOLDS;
  A.SIGIAN_COMPONENT_RARITY_V2_CALIBRATION = RARITY_V2_CALIBRATION;
  A.SIGIAN_COMPONENT_ADHERENCE_LABELS = ADHERENCE_LABELS;
  A.SIGIAN_COMPONENT_ADHERENCE_SCORE_BANDS = ADHERENCE_SCORE_BANDS;
  A.SIGIAN_COMPONENT_RARITY_TIERS = RARITY_TIERS;
  A.SIGIAN_COMPONENT_SEMANTIC_TAGS = TAGS_BY_ID;
  A.SIGIAN_COMPONENT_REVIEWED_ADHERENCE = REVIEWED_ADHERENCE_BY_ID;
  A.listSigianComponentCompatibilities = enumerateCompatibilities;
  A.listSigianComponentCompatibilityDomain = compatibilityDomain;
  A.getSigianComponentFamilyProfile = buildFamilyProfile;
  A.calculateSigianComponentVariant = calculateVariant;
  A.generateSigianComponentVariants = generateVariants;
  A.buildSigianCanonicalComponentDesignCatalog = canonicalCatalog;
  A.buildSigianComponentCombinatorialAudit = combinatorialAudit;
  A.buildSigianComponentDesignAudit = componentDesignAudit;
  A.deriveSigianComponentCompatibilityOnDissolution = compatibilityOnDissolution;
})(window.Arcane = window.Arcane || {});
