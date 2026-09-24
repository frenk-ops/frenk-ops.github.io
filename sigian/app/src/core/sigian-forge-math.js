(function (A) {
  "use strict";

  const FORGE_MATH_SCHEMA_VERSION = 1;
  let cachedCore = null;
  let cachedError = null;

  function clone(value) {
    if (typeof A.deepClone === "function") return A.deepClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function finite(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function buildCore() {
    if (cachedCore) return cachedCore;
    if (cachedError) throw cachedError;

    try {
      const required = [
        "getCardSet",
        "buildSigianCalibrationDataset",
        "buildSigianRecoveredOracleDataset",
        "buildSigianOracleTargetSamples",
        "fitSigianOracleStrengthCandidate",
        "createSigianHybridArcaneValueEvaluator"
      ];
      const missing = required.filter(name => typeof A[name] !== "function");
      if (missing.length) throw new Error(`Forgia matematica: dipendenze mancanti: ${missing.join(", ")}.`);

      const cards = A.getCardSet("astral-original");
      const calibration = A.buildSigianCalibrationDataset(cards);
      const oracleRows = A.buildSigianRecoveredOracleDataset(cards);
      const samples = A.buildSigianOracleTargetSamples(calibration, oracleRows);
      const candidate = A.fitSigianOracleStrengthCandidate(samples);
      const evaluator = A.createSigianHybridArcaneValueEvaluator(candidate);

      cachedCore = Object.freeze({
        cards,
        calibration,
        oracleRows,
        samples,
        candidate,
        evaluator
      });
      return cachedCore;
    } catch (error) {
      cachedError = error instanceof Error ? error : new Error(String(error));
      throw cachedError;
    }
  }

  function syntheticCard(recipe) {
    const stats = recipe?.stats || {};
    return {
      id:String(recipe?.id || "forge-formula"),
      name:String(recipe?.presentation?.name || "Formula"),
      school:String(recipe?.school || "fire"),
      type:recipe?.type === "spell" ? "spell" : "creature",
      level:1,
      cost:1,
      attack:recipe?.type === "creature" ? Math.max(0, finite(stats.attack, 0)) : 0,
      health:recipe?.type === "creature" ? Math.max(1, finite(stats.health, 1)) : 0,
      hp:recipe?.type === "creature" ? Math.max(1, finite(stats.health, 1)) : 0,
      text:"",
      keyword:"",
      set:"custom",
      art:"",
      effects:[]
    };
  }

  function sampleForRecipe(recipe) {
    const card = syntheticCard(recipe);
    const values = {};
    (recipe?.sigils || []).forEach(sigil => {
      if (sigil?.intensity != null && Number.isFinite(Number(sigil.intensity))) {
        values[sigil.slotId] = Number(sigil.intensity);
      }
    });
    return A.createSigianCalibrationSample(card, recipe, { values });
  }

  function contributionRows(recipe, breakdown) {
    const positiveBySlot = new Map();
    (breakdown?.sigils || []).forEach(row => {
      if (!row.slotId) return;
      positiveBySlot.set(row.slotId, (positiveBySlot.get(row.slotId) || 0) + finite(row.value, 0));
    });

    const malusBySlot = new Map();
    (breakdown?.malusCredit?.details || []).forEach(row => {
      if (!row.slotId) return;
      malusBySlot.set(row.slotId, (malusBySlot.get(row.slotId) || 0) + finite(row.credit, 0));
    });

    return (recipe?.sigils || []).map(sigil => {
      const positive = positiveBySlot.get(sigil.slotId) || 0;
      const malusCredit = malusBySlot.get(sigil.slotId) || 0;
      return {
        slotId:sigil.slotId,
        collectibleId:sigil.collectibleId || null,
        sigilId:sigil.sigilId,
        grade:sigil.grade,
        intensity:sigil.intensity ?? null,
        positive,
        malusCredit,
        net:positive - malusCredit
      };
    });
  }

  function capWindow(evaluator, level, value) {
    const currentLevel = Math.max(1, Math.trunc(finite(level, 1)));
    const currentCap = finite(evaluator.capForLevel(currentLevel), 0);
    const previousCap = currentLevel > 1 ? finite(evaluator.capForLevel(currentLevel - 1), 0) : 0;
    const nextCap = finite(evaluator.capForLevel(currentLevel + 1), currentCap);
    return {
      previousLevel:currentLevel > 1 ? currentLevel - 1 : null,
      previousCap,
      currentLevel,
      currentCap,
      nextLevel:currentLevel + 1,
      nextCap,
      margin:Math.max(0, currentCap - value),
      overPrevious:Math.max(0, value - previousCap),
      utilization:currentCap > 0 ? Math.max(0, Math.min(1, value / currentCap)) : 0,
      previousMarker:currentCap > 0 ? Math.max(0, Math.min(1, previousCap / currentCap)) : 0
    };
  }

  A.SIGIAN_FORGE_MATH_SCHEMA_VERSION = FORGE_MATH_SCHEMA_VERSION;

  A.getSigianForgeMathEvaluator = function getSigianForgeMathEvaluator() {
    return buildCore();
  };

  A.sigianForgeCapForLevel = function sigianForgeCapForLevel(level) {
    return buildCore().evaluator.capForLevel(level);
  };

  A.analyzeSigianForgeRecipe = function analyzeSigianForgeRecipe(recipe) {
    const core = buildCore();
    const sample = sampleForRecipe(recipe);
    const breakdown = core.evaluator.evaluate(sample);
    const minimum = core.evaluator.minimumLevel(sample);
    const value = Math.max(0, finite(breakdown.total, 0));
    const caps = capWindow(core.evaluator, minimum.level, value);

    return {
      schemaVersion:FORGE_MATH_SCHEMA_VERSION,
      status:"hybrid-diagnostic",
      provisional:true,
      sample,
      arcaneValue:value,
      minimumLevel:minimum.level,
      resourceSchool:recipe.school,
      resourceCost:minimum.level,
      ...caps,
      breakdown,
      sigilContributions:contributionRows(recipe, breakdown),
      calibration:{
        evaluator:core.evaluator.evaluator,
        unit:core.evaluator.calibrationUnit,
        oracleQuantile:core.candidate.oracleQuantile,
        baseSetSamples:core.samples.length
      }
    };
  };

  A.previewSigianForgeIntensity = function previewSigianForgeIntensity(recipe, slotId, intensity) {
    const next = clone(recipe);
    const sigil = (next.sigils || []).find(item => item.slotId === slotId);
    if (!sigil) throw new Error(`Forgia matematica: slot Sigillo non trovato: ${slotId}.`);
    sigil.intensity = Number(intensity);
    const result = A.analyzeSigianForgeRecipe(next);
    return {
      intensity:Number(intensity),
      arcaneValue:result.arcaneValue,
      minimumLevel:result.minimumLevel,
      currentCap:result.currentCap,
      margin:result.margin,
      sigilContribution:result.sigilContributions.find(item => item.slotId === slotId)?.net ?? null
    };
  };

  A.resetSigianForgeMathCache = function resetSigianForgeMathCache() {
    cachedCore = null;
    cachedError = null;
  };
})(window.Arcane = window.Arcane || {});
