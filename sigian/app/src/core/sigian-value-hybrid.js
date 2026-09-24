(function (A) {
  "use strict";

  const HYBRID_SCHEMA_VERSION = 1;
  const EPSILON = 1e-9;

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, finite(value, min)));
  }

  function clone(value) {
    if (typeof A.deepClone === "function") return A.deepClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function quantile(values, q) {
    const sorted = (values || []).filter(Number.isFinite).slice().sort((a,b) => a-b);
    if (!sorted.length) return 0;
    const position = (sorted.length - 1) * clamp(q, 0, 1);
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    const fraction = position - lower;
    return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
  }

  function capScale(capCandidate) {
    const anchors = (capCandidate?.anchors || []).map(Number).filter(Number.isFinite);
    const deltas = [];
    for (let index = 1; index < anchors.length; index += 1) {
      const delta = anchors[index] - anchors[index - 1];
      if (delta > EPSILON) deltas.push(delta);
    }
    const medianStep = quantile(deltas, 0.5);
    return Math.max(0.25, medianStep || finite(capCandidate?.continuationSlope, 1) || 1);
  }

  function noSigils(sample) {
    return {
      ...sample,
      sigils: [],
      sigilCount: 0,
      timingMix: [],
      hasArea: false,
      hasIntrinsicMalus: false
    };
  }

  function onlySigil(sample, sigil) {
    return {
      ...sample,
      sigils: [sigil],
      sigilCount: 1,
      timingMix: [sigil.timing || "other"],
      hasArea: Boolean(sigil.area),
      hasIntrinsicMalus: Boolean(sigil.intrinsicMalus)
    };
  }

  function magnitude(sigil) {
    const recovered = Math.abs(finite(sigil?.recoveredGradeValue, 0));
    if (recovered > EPSILON) return recovered;
    return Math.max(1, Math.abs(finite(sigil?.grade, 1)));
  }

  function hasMalusComponent(sigil) {
    if (!sigil) return false;
    if (sigil.intrinsicMalus) return true;
    if (sigil.sigilId === "backlash" || sigil.sigilId === "tribute") return true;
    if (sigil.sigilId === "erosion" && sigil.config?.side === "self") return true;
    const ids = (sigil.modifiers || []).map(item => item.id);
    return ids.includes("constraint-friendly-fire")
      || ids.includes("constraint-friendly-fire-power-threshold");
  }

  function isPureMalusSigil(sigil) {
    if (!sigil) return false;
    if (sigil.sigilId === "backlash" || sigil.sigilId === "tribute") return true;
    if (sigil.sigilId === "erosion" && sigil.config?.side === "self") return true;
    return Boolean(sigil.intrinsicMalus)
      && !(sigil.modifiers || []).some(item => String(item.id || "").startsWith("constraint-friendly-fire"));
  }

  function positiveSigilView(sigil) {
    if (!sigil || isPureMalusSigil(sigil)) return sigil;
    const modifiers = (sigil.modifiers || []).filter(item => !String(item.id || "").startsWith("constraint-friendly-fire"));
    return {
      ...sigil,
      intrinsicMalus:false,
      modifiers,
      modifierFamilies:[...new Set(modifiers.map(item => item.family || "unknown"))].sort()
    };
  }

  function affectedSchools(sigil, formulaSchool) {
    const config = sigil?.config || {};
    if (config.schools === "all") return "all";
    if (Array.isArray(config.schools)) return [...new Set(config.schools.map(String))];
    if (config.scope === "all-powers") return "all";
    if (config.school) return [String(config.school)];
    return formulaSchool ? [String(formulaSchool)] : [];
  }

  function relevantMalusFactor(sample, sigil) {
    if (!sigil) return 0;
    if (sigil.sigilId === "backlash" || sigil.sigilId === "tribute") return 1;
    if ((sigil.modifiers || []).some(item => String(item.id || "").startsWith("constraint-friendly-fire"))) return 1;
    if (sigil.sigilId === "erosion" && sigil.config?.side === "self") {
      const school = String(sigil.config?.school || "");
      return !school || school === sample.school ? 1 : 0.22;
    }
    return 0.4;
  }

  function survivalFactor(sample) {
    if (sample?.type !== "creature") return 1;
    const health = Math.max(1, finite(sample.body?.health, 1));
    const durability = health <= 30 ? health : 30 + 0.6 * (health - 30);
    return 0.65 + Math.sqrt(durability / 30);
  }

  function ratio(config) {
    const numerator = Math.max(0, finite(config?.numerator, 1));
    const denominator = Math.max(EPSILON, finite(config?.denominator, 2));
    return numerator / denominator;
  }

  function sigilsById(sample, id) {
    return (sample?.sigils || []).filter(sigil => sigil.sigilId === id);
  }

  function hasSigil(sample, id) {
    return sigilsById(sample, id).length > 0;
  }

  function channelingSchool(sigil, fallback) {
    const config = sigil?.config || {};
    if (config.scope === "all-powers") return "all";
    return String(config.school || fallback || "");
  }

  function positiveStandaloneMarginal(sample, sigil, baselineModel, baseValue, unit) {
    const calibratedSigil = positiveSigilView(sigil);
    const direct = finite(baselineModel.predict(onlySigil(sample, calibratedSigil)), baseValue) - baseValue;
    const floor = unit * (0.10 + 0.025 * Math.min(12, magnitude(sigil)));
    return Math.max(floor, direct);
  }

  function scopePremium(sample, sigil, unit) {
    const magnitudeValue = magnitude(sigil);
    if (sigil?.config?.scope === "all-powers" || sigil?.targetShape === "all-powers") {
      return unit * (0.20 + 0.06 * Math.min(8, magnitudeValue));
    }
    if (sigil?.config?.schools === "all") {
      return unit * (0.22 + 0.07 * Math.min(8, magnitudeValue));
    }
    if (Array.isArray(sigil?.config?.schools) && sigil.config.schools.length > 1) {
      return unit * 0.08 * magnitudeValue * (sigil.config.schools.length - 1);
    }
    return 0;
  }

  function sameSchoolInfusionPremium(sample, sigil, unit) {
    if (sigil?.sigilId !== "infusion") return 0;
    const schools = affectedSchools(sigil, sample.school);
    const sameSchool = schools === "all" || schools.includes(sample.school);
    if (!sameSchool) return 0;
    return unit * (0.18 + 0.045 * Math.min(12, magnitude(sigil)));
  }

  function repeatedSigilPremium(sample, unit) {
    const groups = new Map();
    (sample?.sigils || []).filter(sigil => !isPureMalusSigil(sigil)).forEach(sigil => {
      if (!groups.has(sigil.sigilId)) groups.set(sigil.sigilId, []);
      groups.get(sigil.sigilId).push(sigil);
    });

    let total = 0;
    const details = [];
    groups.forEach((sigils, sigilId) => {
      if (sigils.length < 2) return;
      for (let index = 1; index < sigils.length; index += 1) {
        const value = unit * 0.12 * magnitude(sigils[index]) * index;
        total += value;
        details.push({
          kind:"stacking",
          sigilId,
          slotId:sigils[index]?.slotId || null,
          collectibleId:sigils[index]?.collectibleId || null,
          copy:index + 1,
          value
        });
      }
    });
    return { total, details };
  }

  function interactionTerms(sample, bodyValue, unit) {
    const interactions = [];
    const bodyAttack = Math.max(0, finite(sample?.body?.attack, 0));
    const bodyHealth = Math.max(0, finite(sample?.body?.health, 0));
    const survival = survivalFactor(sample);

    sigilsById(sample, "total-assault").forEach(() => {
      const value = unit * 0.018 * bodyAttack * survival;
      interactions.push({ kind:"attack-x-total-assault", value });
    });

    sigilsById(sample, "regeneration").forEach(sigil => {
      const value = unit * 0.018 * magnitude(sigil) * survival;
      interactions.push({ kind:"durability-x-regeneration", value });
    });

    if (hasSigil(sample, "protection") && hasSigil(sample, "regeneration")) {
      const regen = sigilsById(sample, "regeneration").reduce((sum, sigil) => sum + magnitude(sigil), 0);
      const value = unit * 0.055 * regen * survival;
      interactions.push({ kind:"protection-x-regeneration", value });
    }

    const arcaneAttacks = sigilsById(sample, "arcane-attack");
    const channelings = sigilsById(sample, "channeling");
    arcaneAttacks.forEach(attackSigil => {
      const attackSchool = String(attackSigil.config?.school || sample.school || "");
      channelings.forEach(channeling => {
        const growthSchool = channelingSchool(channeling, sample.school);
        if (growthSchool !== "all" && growthSchool !== attackSchool) return;
        const value = unit * 0.16 * magnitude(channeling) * survival;
        interactions.push({ kind:"arcane-attack-x-channeling", school:attackSchool, value });
      });
    });

    const areaDamageMagnitude = (sample?.sigils || [])
      .filter(sigil => sigil.area && ["damage","wave"].includes(sigil.sigilId))
      .reduce((sum, sigil) => sum + magnitude(sigil), 0);
    if (areaDamageMagnitude > 0) {
      sigilsById(sample, "absorption").forEach(absorption => {
        const value = unit * 0.05 * areaDamageMagnitude * Math.max(0.25, ratio(absorption.config));
        interactions.push({ kind:"area-damage-x-absorption", value });
      });
    }

    [...sigilsById(sample, "rebirth"), ...sigilsById(sample, "eternal-rebirth")].forEach(rebirth => {
      const repeats = rebirth.sigilId === "eternal-rebirth"
        ? 2.5
        : Math.max(1, finite(rebirth.grade, 1));
      const bodyScale = Math.max(unit, bodyValue) * 0.08 * repeats;
      const durabilityScale = unit * 0.003 * bodyHealth * repeats;
      interactions.push({ kind:"body-x-rebirth", value:bodyScale + durabilityScale });
    });

    return interactions;
  }

  function malusCredit(sample, positiveSubtotal, unit) {
    const maluses = (sample?.sigils || []).filter(hasMalusComponent);
    let total = 0;
    const details = [];
    const hardCap = Math.max(unit * 1.5, positiveSubtotal * 0.35);

    maluses.forEach((sigil, index) => {
      const relevance = relevantMalusFactor(sample, sigil);
      const raw = unit * (0.32 + 0.07 * Math.min(10, magnitude(sigil))) * relevance;
      const diminishing = 1 / (1 + 0.75 * index);
      const remaining = Math.max(0, hardCap - total);
      const credit = Math.min(remaining, raw * diminishing);
      total += credit;
      details.push({
        slotId:sigil.slotId || null,
        collectibleId:sigil.collectibleId || null,
        sigilId:sigil.sigilId,
        relevance,
        diminishing,
        rawCredit:raw,
        credit
      });
    });

    return { total, cap:hardCap, details };
  }

  function schoolAdjustment(sample, unit) {
    // Affinity controls ownership/access, not free combat power. 0.37 keeps the
    // school-identity layer explicit but neutral until a canonical identity
    // matrix is approved. Same-school resource refund is handled separately.
    const exoticAccesses = [];
    (sample?.sigils || []).forEach(sigil => {
      if (!sigil.affinity) return;
      if (A.sigianAffinityAllowsSchool && !A.sigianAffinityAllowsSchool(sigil.affinity, sample.school)) {
        exoticAccesses.push(sigil.sigilId);
      }
    });
    return {
      value: 0,
      unit,
      exoticAccesses,
      status: exoticAccesses.length ? "invalid-affinity-access" : "neutral-pending-school-grammar"
    };
  }

  A.SIGIAN_VALUE_HYBRID_SCHEMA_VERSION = HYBRID_SCHEMA_VERSION;

  A.createSigianHybridArcaneValueEvaluator = function createSigianHybridArcaneValueEvaluator(candidate, options = {}) {
    const baselineModel = candidate?.fit?.model;
    const capCandidate = candidate?.capCandidate;
    if (!baselineModel?.predict || !capCandidate?.capForLevel) {
      throw new Error("Hybrid Arcane Value richiede il candidate Oracle75 calibrato con Cap(L).");
    }

    const unit = Math.max(0.05, finite(options.unit, capScale(capCandidate)));

    function evaluate(sample) {
      const empty = noSigils(sample);
      const baselineBody = finite(baselineModel.predict(empty), 0);
      const body = Math.max(0, baselineBody);

      const sigils = [];
      let sigilSubtotal = 0;
      let scopeSubtotal = 0;
      let refundSubtotal = 0;

      (sample?.sigils || []).filter(sigil => !isPureMalusSigil(sigil)).forEach(sigil => {
        const base = positiveStandaloneMarginal(sample, sigil, baselineModel, baselineBody, unit);
        const scope = scopePremium(sample, sigil, unit);
        const refund = sameSchoolInfusionPremium(sample, sigil, unit);
        const value = base + scope + refund;
        sigilSubtotal += base;
        scopeSubtotal += scope;
        refundSubtotal += refund;
        sigils.push({
          slotId:sigil.slotId || null,
          collectibleId:sigil.collectibleId || null,
          sigilId:sigil.sigilId,
          grade:sigil.grade,
          intensity:sigil.intensity ?? null,
          magnitude:magnitude(sigil),
          base,
          scope,
          sameSchoolRefund:refund,
          value
        });
      });

      const interactions = interactionTerms(sample, body, unit);
      const interactionSubtotal = interactions.reduce((sum, item) => sum + item.value, 0);
      const stacking = repeatedSigilPremium(sample, unit);
      const school = schoolAdjustment(sample, unit);
      const beforeMalus = body + sigilSubtotal + scopeSubtotal + refundSubtotal
        + interactionSubtotal + stacking.total + school.value;
      const malus = malusCredit(sample, beforeMalus, unit);
      const total = Math.max(0, beforeMalus - malus.total);

      return {
        schemaVersion:HYBRID_SCHEMA_VERSION,
        evaluator:"hybrid-mechanical-oracle75-calibrated",
        id:sample?.id || null,
        total,
        body,
        sigils,
        sigilSubtotal,
        scopeSubtotal,
        sameSchoolRefundSubtotal:refundSubtotal,
        interactions,
        interactionSubtotal,
        stacking,
        malusCredit:malus,
        schoolAdjustment:school,
        calibrationUnit:unit
      };
    }

    const model = {
      predict(sample) {
        return evaluate(sample).total;
      }
    };

    function minimumLevel(sample) {
      const value = model.predict(sample);
      return A.findMinimumLegalSigianLevel({
        evaluateAtLevel:() => value,
        capForLevel:capCandidate.capForLevel,
        technicalSearchLimit:256
      });
    }

    return {
      schemaVersion:HYBRID_SCHEMA_VERSION,
      evaluator:"hybrid-mechanical-oracle75-calibrated",
      baseline:"oracle75-ridge-single-component-calibration",
      calibrationUnit:unit,
      fit:{ model },
      model,
      capCandidate,
      capForLevel:capCandidate.capForLevel,
      evaluate,
      minimumLevel
    };
  };
})(window.Arcane = window.Arcane || {});
