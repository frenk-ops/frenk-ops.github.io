(function (A) {
  "use strict";

  const STRESS_SCHEMA_VERSION = 1;
  const EPSILON = 1e-6;

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function sigil(sigilId, options = {}) {
    return {
      slotId: options.slotId || sigilId,
      sigilId,
      grade: options.grade == null ? 1 : options.grade,
      recoveredGradeValue: finite(options.gradeValue, 0),
      timing: options.timing || "persistent",
      targetShape: options.targetShape || "intrinsic",
      area: Boolean(options.area),
      intrinsicMalus: Boolean(options.intrinsicMalus),
      config: options.config || {},
      modifiers: (options.modifiers || []).map(item => ({
        id: item.id,
        family: item.family || "unknown",
        params: item.params || {}
      })),
      modifierFamilies: [...new Set((options.modifiers || []).map(item => item.family || "unknown"))].sort()
    };
  }

  function sample(id, options = {}) {
    const type = options.type || "creature";
    const sigils = options.sigils || [];
    return {
      schemaVersion: A.SIGIAN_VALUE_CALIBRATION_SCHEMA_VERSION || 1,
      id,
      name: options.name || id,
      school: options.school || "fire",
      type,
      printedLevel: 1,
      body: type === "creature"
        ? {
            attack: finite(options.attack, 4),
            printedAttack: finite(options.attack, 4),
            health: finite(options.health, 30)
          }
        : null,
      sigilCount: sigils.length,
      sigils,
      timingMix: [...new Set(sigils.map(item => item.timing))].sort(),
      hasArea: sigils.some(item => item.area),
      hasIntrinsicMalus: sigils.some(item => item.intrinsicMalus),
      compatibilityOnly: false
    };
  }

  function cloneWith(base, id, overrides = {}) {
    return sample(id, {
      school: overrides.school || base.school,
      type: overrides.type || base.type,
      attack: overrides.attack ?? base.body?.attack,
      health: overrides.health ?? base.body?.health,
      sigils: overrides.sigils || base.sigils
    });
  }

  function rawValue(model, formula) {
    return finite(model.predict(formula), 0);
  }

  function legalLevel(candidate, formula) {
    const value = Math.max(0, rawValue(candidate.fit.model, formula));
    return A.findMinimumLegalSigianLevel({
      evaluateAtLevel: () => value,
      capForLevel: candidate.capCandidate.capForLevel,
      technicalSearchLimit: 256
    }).level;
  }

  function result(id, title, category, passed, metrics, expectation) {
    return {
      id,
      title,
      category,
      passed: Boolean(passed),
      expectation,
      metrics
    };
  }

  function interactionCase(candidate, options) {
    const model = candidate.fit.model;
    const base = options.base;
    const a = cloneWith(base, options.id + ":a", { sigils: [options.a] });
    const b = cloneWith(base, options.id + ":b", { sigils: [options.b] });
    const combo = cloneWith(base, options.id + ":combo", { sigils: [options.a, options.b] });
    const baseValue = rawValue(model, base);
    const aValue = rawValue(model, a);
    const bValue = rawValue(model, b);
    const comboValue = rawValue(model, combo);
    const interaction = comboValue - aValue - bValue + baseValue;
    return result(
      options.id,
      options.title,
      "interaction",
      interaction > EPSILON,
      {
        baseValue,
        aValue,
        bValue,
        comboValue,
        interaction,
        comboLevel: legalLevel(candidate, combo)
      },
      options.expectation || "La combinazione deve avere un premio non lineare positivo rispetto alla semplice somma."
    );
  }

  A.SIGIAN_VALUE_STRESS_SCHEMA_VERSION = STRESS_SCHEMA_VERSION;

  A.runSigianValueCandidateStressSuite = function runSigianValueCandidateStressSuite(candidate) {
    if (!candidate?.fit?.model?.predict || !candidate?.capCandidate?.capForLevel) {
      throw new Error("Stress suite Arcane Value: candidate non valido.");
    }

    const model = candidate.fit.model;
    const cases = [];

    const assault = sigil("total-assault", {
      timing: "persistent",
      targetShape: "all-enemy-creatures",
      area: true
    });
    const lowAttackBase = sample("stress:assault:low:base", { attack: 6, health: 35 });
    const lowAttackAssault = cloneWith(lowAttackBase, "stress:assault:low", { sigils: [assault] });
    const highAttackBase = sample("stress:assault:high:base", { attack: 30, health: 35 });
    const highAttackAssault = cloneWith(highAttackBase, "stress:assault:high", { sigils: [assault] });
    const assaultLowMarginal = rawValue(model, lowAttackAssault) - rawValue(model, lowAttackBase);
    const assaultHighMarginal = rawValue(model, highAttackAssault) - rawValue(model, highAttackBase);
    cases.push(result(
      "total-assault-x-attack",
      "ATT alto × Total Assault",
      "body-synergy",
      assaultHighMarginal > assaultLowMarginal + EPSILON,
      {
        lowAttackMarginal: assaultLowMarginal,
        highAttackMarginal: assaultHighMarginal,
        highFormulaLevel: legalLevel(candidate, highAttackAssault)
      },
      "Il valore marginale di Total Assault deve crescere quando cresce l'ATT del corpo."
    ));

    const regeneration = sigil("regeneration", {
      gradeValue: 4,
      timing: "repeatable",
      targetShape: "source"
    });
    const lowHpBase = sample("stress:regen:low:base", { school: "nature", attack: 5, health: 30 });
    const lowHpRegen = cloneWith(lowHpBase, "stress:regen:low", { sigils: [regeneration] });
    const highHpBase = sample("stress:regen:high:base", { school: "nature", attack: 5, health: 120 });
    const highHpRegen = cloneWith(highHpBase, "stress:regen:high", { sigils: [regeneration] });
    const regenLowMarginal = rawValue(model, lowHpRegen) - rawValue(model, lowHpBase);
    const regenHighMarginal = rawValue(model, highHpRegen) - rawValue(model, highHpBase);
    cases.push(result(
      "regeneration-x-health",
      "HP alto × Rigenerazione",
      "body-synergy",
      regenHighMarginal > regenLowMarginal + EPSILON,
      {
        lowHealthMarginal: regenLowMarginal,
        highHealthMarginal: regenHighMarginal,
        highFormulaLevel: legalLevel(candidate, highHpRegen)
      },
      "Il valore marginale della Rigenerazione deve crescere con la sopravvivenza del corpo."
    ));

    const protection = sigil("protection", {
      timing: "persistent",
      targetShape: "intrinsic"
    });
    cases.push(interactionCase(candidate, {
      id: "protection-x-regeneration",
      title: "Protezione × Rigenerazione",
      base: sample("stress:protection-regen:base", { school: "nature", attack: 5, health: 70 }),
      a: protection,
      b: regeneration,
      expectation: "Protezione e Rigenerazione insieme devono riconoscere valore di sopravvivenza superiore alla somma additiva."
    }));

    const arcaneAttack = sigil("arcane-attack", {
      timing: "persistent",
      targetShape: "source",
      config: { school: "water" }
    });
    const channelingWater = sigil("channeling", {
      gradeValue: 2,
      timing: "persistent",
      targetShape: "one-power",
      config: { when: "whileAlive", scope: "power", school: "water" }
    });
    cases.push(interactionCase(candidate, {
      id: "arcane-attack-x-channeling",
      title: "Attacco Arcano × Canalizzazione",
      base: sample("stress:arcane-channeling:base", { school: "water", attack: 0, health: 55 }),
      a: arcaneAttack,
      b: channelingWater,
      expectation: "La crescita della stessa scuola deve aumentare anche il valore futuro dell'Attacco Arcano."
    }));

    const wave = sigil("wave", {
      gradeValue: 12,
      timing: "immediate",
      targetShape: "field",
      area: true
    });
    const absorption = sigil("absorption", {
      timing: "persistent",
      targetShape: "intrinsic",
      config: { sourceTarget: "any", healTarget: "self-hero", numerator: 1, denominator: 1 }
    });
    cases.push(interactionCase(candidate, {
      id: "area-damage-x-absorption",
      title: "Danno ad area × Assorbimento",
      base: sample("stress:area-absorption:base", { school: "death", attack: 4, health: 45 }),
      a: wave,
      b: absorption,
      expectation: "Assorbimento applicato a danno multiplo deve riconoscere un premio di combinazione."
    }));

    const rebirth = sigil("rebirth", {
      timing: "reactive",
      targetShape: "source",
      grade: 2
    });
    const smallBody = sample("stress:rebirth:small:base", { school: "air", attack: 4, health: 20 });
    const smallRebirth = cloneWith(smallBody, "stress:rebirth:small", { sigils: [rebirth] });
    const hugeBody = sample("stress:rebirth:huge:base", { school: "air", attack: 16, health: 100 });
    const hugeRebirth = cloneWith(hugeBody, "stress:rebirth:huge", { sigils: [rebirth] });
    const smallRebirthMarginal = rawValue(model, smallRebirth) - rawValue(model, smallBody);
    const hugeRebirthMarginal = rawValue(model, hugeRebirth) - rawValue(model, hugeBody);
    cases.push(result(
      "rebirth-x-body",
      "Corpo grande × Rinascita",
      "body-synergy",
      hugeRebirthMarginal > smallRebirthMarginal + EPSILON,
      {
        smallBodyMarginal: smallRebirthMarginal,
        hugeBodyMarginal: hugeRebirthMarginal,
        hugeFormulaLevel: legalLevel(candidate, hugeRebirth)
      },
      "Rinascita deve valere di più quando ripristina un corpo più forte."
    ));

    const sameSchoolInfusion = sigil("infusion", {
      gradeValue: 4,
      timing: "immediate",
      targetShape: "one-power",
      config: { when: "onSummon", scope: "power", school: "fire" }
    });
    const offSchoolInfusion = sigil("infusion", {
      gradeValue: 4,
      timing: "immediate",
      targetShape: "one-power",
      config: { when: "onSummon", scope: "power", school: "water" }
    });
    const infusionBase = sample("stress:infusion:base", { school: "fire", attack: 5, health: 30 });
    const sameInfusion = cloneWith(infusionBase, "stress:infusion:same", { sigils: [sameSchoolInfusion] });
    const offInfusion = cloneWith(infusionBase, "stress:infusion:off", { sigils: [offSchoolInfusion] });
    const sameInfusionValue = rawValue(model, sameInfusion);
    const offInfusionValue = rawValue(model, offInfusion);
    cases.push(result(
      "same-school-infusion-refund",
      "Infusione stessa scuola",
      "configuration-awareness",
      sameInfusionValue > offInfusionValue + EPSILON,
      {
        sameSchoolValue: sameInfusionValue,
        offSchoolValue: offInfusionValue,
        sameSchoolLevel: legalLevel(candidate, sameInfusion),
        offSchoolLevel: legalLevel(candidate, offInfusion)
      },
      "Infusione nella scuola della Formula deve costare più dell'equivalente fuori scuola perché può rimborsare il costo."
    ));

    const relevantMalus = sigil("erosion", {
      gradeValue: 2,
      timing: "persistent",
      targetShape: "one-power",
      intrinsicMalus: true,
      config: { when: "whileAlive", side: "self", scope: "power", school: "fire" }
    });
    const unrelatedMalus = sigil("erosion", {
      gradeValue: 2,
      timing: "persistent",
      targetShape: "one-power",
      intrinsicMalus: true,
      config: { when: "whileAlive", side: "self", scope: "power", school: "water" }
    });
    const damage = sigil("damage", {
      gradeValue: 12,
      timing: "immediate",
      targetShape: "enemy-hero"
    });
    const malusBase = sample("stress:malus:base", { school: "fire", type: "spell", sigils: [damage] });
    const relevantFormula = cloneWith(malusBase, "stress:malus:relevant", { sigils: [damage, relevantMalus] });
    const unrelatedFormula = cloneWith(malusBase, "stress:malus:unrelated", { sigils: [damage, unrelatedMalus] });
    const relevantValue = rawValue(model, relevantFormula);
    const unrelatedValue = rawValue(model, unrelatedFormula);
    cases.push(result(
      "malus-relevance",
      "Malus rilevante vs malus fittizio",
      "malus-credit",
      relevantValue < unrelatedValue - EPSILON,
      {
        relevantValue,
        unrelatedValue,
        relevantLevel: legalLevel(candidate, relevantFormula),
        unrelatedLevel: legalLevel(candidate, unrelatedFormula)
      },
      "Un malus che colpisce la scuola realmente usata dalla Formula deve dare più credito di un malus su una scuola scollegata."
    ));

    const oneChanneling = cloneWith(infusionBase, "stress:channeling:one", { sigils: [channelingWater] });
    const twoChanneling = cloneWith(infusionBase, "stress:channeling:two", { sigils: [channelingWater, channelingWater] });
    const baseChannelingValue = rawValue(model, infusionBase);
    const oneChannelingValue = rawValue(model, oneChanneling);
    const twoChannelingValue = rawValue(model, twoChanneling);
    const firstChannelingMarginal = oneChannelingValue - baseChannelingValue;
    const secondChannelingMarginal = twoChannelingValue - oneChannelingValue;
    cases.push(result(
      "channeling-stacking-premium",
      "Canalizzazione ripetuta",
      "stacking",
      secondChannelingMarginal > firstChannelingMarginal + EPSILON,
      {
        firstMarginal: firstChannelingMarginal,
        secondMarginal: secondChannelingMarginal,
        twoCopyLevel: legalLevel(candidate, twoChanneling)
      },
      "La seconda Canalizzazione concentrata deve avere un sovrapprezzo rispetto alla prima, non costo perfettamente lineare."
    ));

    const channelingAll = sigil("channeling", {
      gradeValue: 2,
      timing: "persistent",
      targetShape: "all-powers",
      area: true,
      config: { when: "whileAlive", scope: "all-powers", school: "water" }
    });
    const onePowerFormula = cloneWith(infusionBase, "stress:channeling:one-power", { sigils: [channelingWater] });
    const allPowerFormula = cloneWith(infusionBase, "stress:channeling:all-powers", { sigils: [channelingAll] });
    const onePowerValue = rawValue(model, onePowerFormula);
    const allPowerValue = rawValue(model, allPowerFormula);
    cases.push(result(
      "universal-channeling-premium",
      "Canalizzazione universale",
      "scope",
      allPowerValue > onePowerValue + EPSILON,
      {
        onePowerValue,
        allPowersValue: allPowerValue,
        onePowerLevel: legalLevel(candidate, onePowerFormula),
        allPowersLevel: legalLevel(candidate, allPowerFormula)
      },
      "La crescita di tutti i Power deve costare più della crescita di una sola scuola."
    ));

    const oneDamage = cloneWith(malusBase, "stress:burst:one", { sigils: [damage] });
    const twoDamage = cloneWith(malusBase, "stress:burst:two", { sigils: [damage, damage] });
    const noDamage = sample("stress:burst:none", { school: "fire", type: "spell", sigils: [] });
    const noDamageValue = rawValue(model, noDamage);
    const oneDamageValue = rawValue(model, oneDamage);
    const twoDamageValue = rawValue(model, twoDamage);
    const firstDamageMarginal = oneDamageValue - noDamageValue;
    const secondDamageMarginal = twoDamageValue - oneDamageValue;
    cases.push(result(
      "burst-stacking-premium",
      "Stacking di burst identico",
      "stacking",
      secondDamageMarginal > firstDamageMarginal + EPSILON,
      {
        firstMarginal: firstDamageMarginal,
        secondMarginal: secondDamageMarginal,
        twoCopyLevel: legalLevel(candidate, twoDamage)
      },
      "Concentrare più moduli di burst nella stessa Formula deve avere un sovrapprezzo non lineare."
    ));

    const tribute = sigil("tribute", {
      gradeValue: 1,
      timing: "immediate",
      targetShape: "all-powers",
      area: true,
      intrinsicMalus: true
    });
    const oneMalus = cloneWith(malusBase, "stress:malus-stack:one", { sigils: [damage, tribute] });
    const twoMalus = cloneWith(malusBase, "stress:malus-stack:two", { sigils: [damage, tribute, tribute] });
    const positiveValue = rawValue(model, malusBase);
    const oneMalusValue = rawValue(model, oneMalus);
    const twoMalusValue = rawValue(model, twoMalus);
    const firstCredit = positiveValue - oneMalusValue;
    const secondCredit = oneMalusValue - twoMalusValue;
    cases.push(result(
      "malus-credit-diminishing",
      "Credito malus decrescente",
      "malus-credit",
      firstCredit > EPSILON && secondCredit < firstCredit - EPSILON,
      {
        firstCredit,
        secondCredit,
        oneMalusLevel: legalLevel(candidate, oneMalus),
        twoMalusLevel: legalLevel(candidate, twoMalus)
      },
      "Il credito ottenuto aggiungendo altri malus deve diminuire e non finanziare positivi in modo lineare illimitato."
    ));

    const failed = cases.filter(item => !item.passed);
    return {
      schemaVersion: STRESS_SCHEMA_VERSION,
      evaluator: "oracle75-linear-candidate",
      total: cases.length,
      passed: cases.length - failed.length,
      failed: failed.length,
      blockedForProduction: failed.length > 0,
      decision: failed.length
        ? "Non promuovere il ridge Oracle75 puro: usare un evaluator meccanico ibrido con termini di interazione e regole esplicite per malus/stacking."
        : "La suite sintetica non ha rilevato blind spot; servono comunque simulazioni prima della promozione.",
      cases
    };
  };
})(window.Arcane = window.Arcane || {});
