(function (A) {
  "use strict";

  const VALUE_CALIBRATION_SCHEMA_VERSION = 2;
  const DEFAULT_TECHNICAL_SEARCH_LIMIT = 256;

  function clone(value) {
    if (typeof A.deepClone === "function") return A.deepClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function finiteNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function timingCategory(sigil) {
    const when = sigil?.config?.when || "";
    const reaction = sigil?.config?.reaction || "";
    if (reaction || when === "onSelfDeath" || when === "onAnyDeath") return "reactive";
    if (when === "whileAlive") return "persistent";
    if (when === "onBeforeAttack") return "repeatable";
    if (when === "onDeploy" || when === "onPlay" || when === "onSummon") return "immediate";

    if ([
      "protection",
      "arcane-amplification",
      "combat-fury",
      "total-assault",
      "arcane-attack",
      "absorption"
    ].includes(sigil?.sigilId)) return "persistent";

    return "other";
  }

  function targetShape(sigil) {
    const config = sigil?.config || {};
    if (config.scope === "front") return "front";
    if (config.scope === "field") return "field";
    if (config.scope === "all-field") return "all-field";
    if (config.scope === "enemy-field") return "enemy-field";
    if (config.scope === "all-powers" || config.schools === "all") return "all-powers";
    if (Array.isArray(config.schools)) {
      if (config.schools.length === 1) return "one-power";
      if (config.schools.length === 2) return "two-schools";
      if (config.schools.length === 3) return "three-schools";
    }
    if (config.scope === "power") return "one-power";
    if (config.target) return String(config.target);
    if (sigil?.sigilId === "total-assault") return "all-enemy-creatures";
    if (sigil?.sigilId === "arcane-attack") return "source";
    return "intrinsic";
  }

  function isAreaSigil(sigil) {
    return [
      "wave",
      "restoration",
      "annihilation",
      "total-assault"
    ].includes(sigil?.sigilId)
      || ["front", "field", "all-field", "enemy-field", "all-powers"].includes(sigil?.config?.scope)
      || sigil?.config?.schools === "all";
  }

  function isIntrinsicMalus(sigil) {
    if (!sigil) return false;
    if (sigil.sigilId === "backlash" || sigil.sigilId === "tribute") return true;
    if (sigil.sigilId === "erosion" && sigil.config?.side === "self") return true;
    const ids = (sigil.modifiers || []).map(item => item.id);
    return ids.includes("constraint-friendly-fire")
      || ids.includes("constraint-friendly-fire-power-threshold");
  }

  function modifierFeatures(modifier) {
    const definition = A.getSigianAdvancedModifier?.(modifier?.id);
    return {
      id: String(modifier?.id || ""),
      family: String(definition?.family || "unknown"),
      params: clone(modifier?.params || {})
    };
  }

  function recoveredBodyAttack(card, spec) {
    const compatible = Object.values(spec?.compatibilityBySlot || {})
      .map(item => finiteNumber(item?.sourceBaseAttack, NaN))
      .find(Number.isFinite);
    return Number.isFinite(compatible) ? compatible : finiteNumber(card?.attack, 0);
  }

  function sigilSample(sigil, spec) {
    const rawGradeValue = Object.prototype.hasOwnProperty.call(spec?.values || {}, sigil.slotId)
      ? finiteNumber(spec.values[sigil.slotId], 0)
      : 0;
    const modifiers = (sigil.modifiers || []).map(modifierFeatures);
    return {
      slotId: sigil.slotId,
      sigilId: sigil.sigilId,
      grade: sigil.grade,
      affinity: sigil.affinity == null ? null : clone(sigil.affinity),
      recoveredGradeValue: rawGradeValue,
      timing: timingCategory(sigil),
      targetShape: targetShape(sigil),
      area: isAreaSigil(sigil),
      intrinsicMalus: isIntrinsicMalus(sigil),
      config: clone(sigil.config || {}),
      modifiers,
      modifierFamilies: [...new Set(modifiers.map(item => item.family))].sort()
    };
  }

  A.SIGIAN_VALUE_CALIBRATION_SCHEMA_VERSION = VALUE_CALIBRATION_SCHEMA_VERSION;

  A.createSigianCalibrationSample = function createSigianCalibrationSample(card, recipe, spec) {
    if (!card?.id || !recipe?.id || card.id !== recipe.id) {
      throw new Error("Campione calibrazione non valido: carta e FormulaRecipe devono coincidere.");
    }
    const sigils = (recipe.sigils || []).map(sigil => sigilSample(sigil, spec || {}));
    return {
      schemaVersion: VALUE_CALIBRATION_SCHEMA_VERSION,
      id: card.id,
      name: card.name,
      school: card.school,
      type: card.type,
      printedLevel: Math.max(0, Math.trunc(finiteNumber(card.level ?? card.cost, 0))),
      body: card.type === "creature"
        ? {
            attack: recoveredBodyAttack(card, spec),
            printedAttack: finiteNumber(card.attack, 0),
            health: finiteNumber(card.health ?? card.hp, 0)
          }
        : null,
      sigilCount: sigils.length,
      sigils,
      timingMix: [...new Set(sigils.map(item => item.timing))].sort(),
      hasArea: sigils.some(item => item.area),
      hasIntrinsicMalus: sigils.some(item => item.intrinsicMalus),
      compatibilityOnly: Boolean(spec?.compatibilityExtras || Object.keys(spec?.compatibilityBySlot || {}).length)
    };
  };

  A.buildSigianCalibrationDataset = function buildSigianCalibrationDataset(cards) {
    if (typeof A.buildSigianBaseRecipeCatalog !== "function") {
      throw new Error("Il catalogo FormulaRecipe Base Set deve essere caricato prima della calibrazione.");
    }
    const cardList = cards || [];
    const catalog = A.buildSigianBaseRecipeCatalog(cardList);
    return cardList.map(card => {
      const recipe = catalog.byId[card.id];
      const spec = A.SIGIAN_BASE_RECIPE_SPECS?.[card.id];
      if (!recipe || !spec) throw new Error(`Dati calibrazione mancanti per ${card.id}.`);
      return A.createSigianCalibrationSample(card, recipe, spec);
    });
  };

  A.summarizeSigianCalibrationDataset = function summarizeSigianCalibrationDataset(dataset) {
    const samples = dataset || [];
    const levels = {};
    const sigils = {};
    const timings = {};
    const modifierFamilies = {};
    const schools = {};
    const types = {};

    samples.forEach(sample => {
      levels[sample.printedLevel] = (levels[sample.printedLevel] || 0) + 1;
      schools[sample.school] = (schools[sample.school] || 0) + 1;
      types[sample.type] = (types[sample.type] || 0) + 1;
      (sample.sigils || []).forEach(sigil => {
        sigils[sigil.sigilId] = (sigils[sigil.sigilId] || 0) + 1;
        timings[sigil.timing] = (timings[sigil.timing] || 0) + 1;
        (sigil.modifierFamilies || []).forEach(family => {
          modifierFamilies[family] = (modifierFamilies[family] || 0) + 1;
        });
      });
    });

    return {
      schemaVersion: VALUE_CALIBRATION_SCHEMA_VERSION,
      sampleCount: samples.length,
      observedMinLevel: samples.length ? Math.min(...samples.map(item => item.printedLevel)) : null,
      observedMaxLevel: samples.length ? Math.max(...samples.map(item => item.printedLevel)) : null,
      levels,
      schools,
      types,
      sigils,
      timings,
      modifierFamilies,
      areaCards: samples.filter(item => item.hasArea).length,
      intrinsicMalusCards: samples.filter(item => item.hasIntrinsicMalus).length
    };
  };

  A.findMinimumLegalSigianLevel = function findMinimumLegalSigianLevel(options = {}) {
    const evaluateAtLevel = options.evaluateAtLevel;
    const capForLevel = options.capForLevel;
    if (typeof evaluateAtLevel !== "function" || typeof capForLevel !== "function") {
      throw new Error("La ricerca del Livello richiede evaluateAtLevel(L) e capForLevel(L).");
    }

    const startLevel = Math.max(1, Math.trunc(finiteNumber(options.startLevel, 1)));
    const rulesetMaxLevel = options.rulesetMaxLevel == null
      ? null
      : Math.max(startLevel, Math.trunc(finiteNumber(options.rulesetMaxLevel, startLevel)));
    const technicalSearchLimit = Math.max(
      startLevel,
      Math.trunc(finiteNumber(options.technicalSearchLimit, DEFAULT_TECHNICAL_SEARCH_LIMIT))
    );

    const stopLevel = rulesetMaxLevel == null
      ? technicalSearchLimit
      : Math.min(rulesetMaxLevel, technicalSearchLimit);

    for (let level = startLevel; level <= stopLevel; level += 1) {
      const value = finiteNumber(evaluateAtLevel(level), NaN);
      const cap = finiteNumber(capForLevel(level), NaN);
      if (!Number.isFinite(value) || !Number.isFinite(cap)) {
        throw new Error(`Valore/Cap non numerico al Livello ${level}.`);
      }
      if (value <= cap) {
        return {
          legal: true,
          level,
          value,
          cap,
          rulesetLimited: false
        };
      }
    }

    if (rulesetMaxLevel != null && rulesetMaxLevel <= technicalSearchLimit) {
      return {
        legal: false,
        level: null,
        value: null,
        cap: null,
        rulesetLimited: true,
        rulesetMaxLevel
      };
    }

    throw new Error(`Nessun Livello legale trovato entro il limite tecnico di ricerca ${technicalSearchLimit}; estendere il limite o verificare la curva Cap(L).`);
  };
})(window.Arcane = window.Arcane || {});
