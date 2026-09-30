(function (A) {
  "use strict";

  const COMPONENT_DESIGN_SCHEMA_VERSION = 1;
  const CURRENT_SCHOOL_ORDER = Object.freeze(["fire", "water", "air", "nature", "death"]);
  const ADHERENCE_LEVELS = Object.freeze(["core", "compatible", "exotic", "dissonant"]);
  const ADHERENCE_LABELS = Object.freeze({
    core:"Core",
    compatible:"Compatibile",
    exotic:"Esotico",
    dissonant:"Dissonante"
  });
  const ADHERENCE_VALUE = Object.freeze({ core:3, compatible:2, exotic:1, dissonant:0 });
  const ADHERENCE_RARITY = Object.freeze({ core:0, compatible:0.35, exotic:1.25, dissonant:2.2 });
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
    "direct-damage":      Object.freeze({ fire:3, water:1, air:3, nature:1, death:2 }),
    "targeted-damage":    Object.freeze({ fire:2.5, water:1.5, air:3, nature:1.5, death:2 }),
    "area-damage":        Object.freeze({ fire:3, water:1.5, air:2.5, nature:1.5, death:2 }),
    "healing":            Object.freeze({ fire:1, water:2, air:1.5, nature:3, death:1.5 }),
    "regeneration":       Object.freeze({ fire:1, water:2, air:1.5, nature:3, death:2 }),
    "protection":         Object.freeze({ fire:1.5, water:2.5, air:1.5, nature:3, death:1.5 }),
    "power-growth":       Object.freeze({ fire:3, water:2, air:2.5, nature:3, death:2 }),
    "power-control":      Object.freeze({ fire:1.5, water:3, air:2, nature:1.5, death:2.5 }),
    "debuff":             Object.freeze({ fire:1.5, water:3, air:2, nature:1.5, death:2.5 }),
    "amplification":      Object.freeze({ fire:3, water:1.5, air:2.5, nature:2.5, death:2 }),
    "combat-scaling":     Object.freeze({ fire:2.5, water:1.5, air:2.5, nature:2.5, death:2 }),
    "death-resource":     Object.freeze({ fire:1, water:1.5, air:1, nature:1.5, death:3 }),
    "drain":              Object.freeze({ fire:1.5, water:2, air:1.5, nature:1.5, death:3 }),
    "rebirth":            Object.freeze({ fire:2, water:1.5, air:1.5, nature:2, death:3 }),
    "behavior-control":   Object.freeze({ fire:1, water:2.5, air:3, nature:1, death:2 }),
    "hard-removal":       Object.freeze({ fire:2, water:2, air:2.5, nature:1.5, death:3 }),
    "reactive-punish":    Object.freeze({ fire:2, water:2, air:2, nature:2.5, death:2.5 }),
    "state-control":      Object.freeze({ fire:1, water:3, air:2, nature:1.5, death:2 }),
    "self-risk":          Object.freeze({ fire:3, water:1, air:2, nature:1, death:2.5 }),
    "self-resource-loss": Object.freeze({ fire:2, water:1.5, air:1.5, nature:1.5, death:3 }),
    "conditional-risk":   Object.freeze({ fire:2.5, water:2, air:2, nature:1.5, death:2.5 }),
    "friendly-fire":      Object.freeze({ fire:3, water:1, air:2, nature:1, death:2 }),
    "forge-manipulation": Object.freeze({ fire:3, water:1.5, air:2, nature:2, death:1.5 }),
    "movement":           Object.freeze({ fire:1.5, water:1.5, air:3, nature:1, death:1.5 }),
    "tempo":              Object.freeze({ fire:2, water:2, air:3, nature:1, death:1.5 }),
    "extra-action":       Object.freeze({ fire:2, water:1.5, air:3, nature:1, death:1.5 })
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

  const ADHERENCE_OVERRIDES_BY_ID = Object.freeze({
    // Explicit design anchor agreed for Danno Incantatore. Terra remains derived
    // from the general grammar until its case is reviewed explicitly.
    "v2-damage-hero":Object.freeze({
      fire:"core",
      air:"core",
      death:"compatible",
      water:"exotic"
    })
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

  function deriveAdherence(definition, tags, options = {}) {
    const schools = schoolOrder();
    const overrides = {
      ...(ADHERENCE_OVERRIDES_BY_ID[definition?.id] || {}),
      ...(definition?.adherence || {}),
      ...(options.adherence || {})
    };
    const bySchool = {};
    const evidence = {};
    schools.forEach(school => {
      if (overrides[school]) {
        bySchool[school] = normalizeAdherence(overrides[school]);
        evidence[school] = { source:"override", score:ADHERENCE_VALUE[bySchool[school]] };
        return;
      }
      const values = tags
        .map(tag => TAG_SCHOOL_VALUES[tag]?.[school])
        .filter(value => Number.isFinite(value));
      if (!values.length) {
        bySchool[school] = null;
        evidence[school] = { source:"unclassified", score:null };
        return;
      }
      const score = values.reduce((sum, value) => sum + value, 0) / values.length;
      bySchool[school] = scoreToAdherence(score);
      evidence[school] = { source:"grammar", score:round(score) };
    });
    return { bySchool, evidence };
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

  function rarityBreakdown({ compatibility, adherenceBySchool, grade, intensityPercentile, arcaneWeight, craftingWeight, versatility, exceptionality }) {
    const selected = compatibility.schools.map(school => normalizeAdherence(adherenceBySchool[school]));
    const adherencePoints = selected.map(level => ADHERENCE_RARITY[level]);
    const averageAdherence = adherencePoints.reduce((sum, value) => sum + value, 0) / adherencePoints.length;
    const worstAdherence = Math.max(...adherencePoints);
    const adherence = averageAdherence + 0.25 * worstAdherence;
    const compatibilityPoints = COMPATIBILITY_RARITY[compatibility.mode] ?? 0;
    const gradePoints = grade == null ? 0.12 : Math.max(0, Number(grade) - 1) * 0.22;
    const intensityPoints = clamp(intensityPercentile || 0, 0, 1) * 0.22;
    const arcanePoints = Math.min(0.72, Math.log2(1 + Math.max(0, Number(arcaneWeight) || 0)) * 0.28);
    const craftingPoints = Math.max(0, Math.log2(Math.max(1, Number(craftingWeight) || 1))) * 0.13;
    const versatilityPoints = clamp(versatility?.score ?? versatility ?? 0, 0, 1) * 0.28;
    const exceptionalPoints = Math.max(0, Number(exceptionality) || 0);
    const total = round(adherence + compatibilityPoints + gradePoints + intensityPoints + arcanePoints + craftingPoints + versatilityPoints + exceptionalPoints);
    return {
      total,
      adherence:round(adherence),
      compatibility:round(compatibilityPoints),
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
      schoolReference:/<Scuola>/i.test(String(definition.name || "")),
      semanticTags:tags,
      adherence:adherence.bySchool,
      adherenceEvidence:adherence.evidence,
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
      ? clone(definitionOrId)
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
      adherenceBySchool:profile.adherence,
      grade:requestedGrade,
      intensityPercentile,
      arcaneWeight:arcaneWeight.value,
      craftingWeight,
      versatility:profile.versatility,
      exceptionality:profile.exceptionality
    });
    const tier = rarityTier(rarity.total);
    return {
      schemaVersion:COMPONENT_DESIGN_SCHEMA_VERSION,
      familyId:profile.id,
      family:profile.family,
      kind:profile.kind,
      compatibility,
      adherence:includedAdherence,
      adherenceMatrix:clone(profile.adherence),
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
      schoolReference:profile.schoolReference,
      semanticTags:[...profile.semanticTags]
    };
  }

  function generateVariants(definitionOrId, options = {}) {
    const profile = buildFamilyProfile(definitionOrId, options);
    const compatibilities = options.compatibilities || enumerateCompatibilities();
    const grades = options.grade === undefined
      ? profile.gradeProfile.grades
      : profile.gradeProfile.grades.filter(entry => entry.grade === options.grade);
    const output = [];
    grades.forEach(entry => {
      const intensities = options.intensity === undefined ? (entry.intensities?.length ? entry.intensities : [null]) : [options.intensity];
      intensities.forEach(intensity => {
        compatibilities.forEach(compatibility => {
          output.push(calculateVariant(profile, {
            ...options,
            grade:entry.grade,
            intensity,
            compatibility
          }));
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
  A.SIGIAN_COMPONENT_ADHERENCE_LABELS = ADHERENCE_LABELS;
  A.SIGIAN_COMPONENT_RARITY_TIERS = RARITY_TIERS;
  A.SIGIAN_COMPONENT_SEMANTIC_TAGS = TAGS_BY_ID;
  A.listSigianComponentCompatibilities = enumerateCompatibilities;
  A.getSigianComponentFamilyProfile = buildFamilyProfile;
  A.calculateSigianComponentVariant = calculateVariant;
  A.generateSigianComponentVariants = generateVariants;
  A.buildSigianCanonicalComponentDesignCatalog = canonicalCatalog;
  A.deriveSigianComponentCompatibilityOnDissolution = compatibilityOnDissolution;
})(window.Arcane = window.Arcane || {});
