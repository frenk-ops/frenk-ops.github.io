(function (A) {
  "use strict";

  const ATOMIC_VALUE_SCHEMA_VERSION = 1;

  function clone(value) {
    if (typeof A.deepClone === "function") return A.deepClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function finite(value, fallback = null) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function magnitudeOf(component = {}) {
    for (const key of ["intensity", "damage", "threshold"]) {
      const value = finite(component[key]);
      if (value != null) return Math.abs(value);
    }
    const percent = finite(component.percent);
    if (percent != null) return Math.max(1, Math.abs(percent) / 25);
    const multiplier = finite(component.multiplier);
    if (multiplier != null) return Math.max(1, Math.abs(multiplier - 1) * 4);
    const grade = finite(component.grade);
    return grade == null ? 1 : Math.max(1, Math.abs(grade));
  }

  function atomicComponent(component, index = 0) {
    const definitionId = String(component?.definitionId || "");
    if (!definitionId) throw new Error("Componente atomico senza definitionId.");
    return {
      kind:component.kind === "constraint" ? "constraint" : "sigil",
      definitionId,
      slotId:component.slotId == null ? null : String(component.slotId),
      grade:component.grade == null ? null : Math.max(1, Math.trunc(Number(component.grade || 1))),
      magnitude:magnitudeOf(component),
      school:component.school == null ? null : String(component.school),
      intensity:finite(component.intensity),
      threshold:finite(component.threshold),
      damage:finite(component.damage),
      percent:finite(component.percent),
      multiplier:finite(component.multiplier),
      index
    };
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
      attack:recipe?.type === "creature" ? Math.max(0, Number(stats.attack || 0)) : 0,
      health:recipe?.type === "creature" ? Math.max(1, Number(stats.health || 1)) : 0,
      hp:recipe?.type === "creature" ? Math.max(1, Number(stats.health || 1)) : 0,
      text:"",
      keyword:"",
      set:"custom",
      art:"",
      effects:[]
    };
  }

  function normalizeLegacySemanticSampleForAtomic(sample, canonicalComponents) {
    const constraints = (canonicalComponents || []).filter(component => component.kind === "constraint");
    if (!constraints.length) return clone(sample);

    const hasFriendlyFire = constraints.some(component =>
      component.definitionId === "v2-constraint-friendly-fire"
      || component.definitionId === "v2-constraint-friendly-fire-limit"
    );
    const hasThreshold = constraints.some(component => component.definitionId === "v2-constraint-threshold-school");
    const hasPureMalusConstraint = constraints.some(component =>
      /v2-constraint-(backlash|scarcity|weakness|erosion|tribute)/.test(String(component.definitionId || ""))
    );

    const sigils = (sample.sigils || [])
      .filter(sigil => !(hasPureMalusConstraint && (
        sigil.sigilId === "backlash"
        || sigil.sigilId === "tribute"
        || (sigil.sigilId === "erosion" && sigil.config?.side === "self")
      )))
      .map(sigil => {
        const next = clone(sigil);
        next.modifiers = (next.modifiers || []).filter(modifier => {
          const id = String(modifier.id || "");
          if (hasFriendlyFire && id.startsWith("constraint-friendly-fire")) return false;
          if (hasThreshold && id === "activation-power-threshold") return false;
          return true;
        });
        next.modifierFamilies = [...new Set((next.modifiers || []).map(modifier => modifier.family || "unknown"))].sort();
        next.intrinsicMalus = false;
        return next;
      });

    return {
      ...clone(sample),
      sigils,
      sigilCount:sigils.length,
      timingMix:[...new Set(sigils.map(sigil => sigil.timing || "other"))].sort(),
      hasArea:sigils.some(sigil => Boolean(sigil.area)),
      hasIntrinsicMalus:false
    };
  }

  function atomicComponentsForRecipe(recipe) {
    const components = [];
    (recipe?.sigils || []).forEach((sigil, index) => {
      if (!sigil.collectibleId) {
        throw new Error(`Valutazione production: lo slot ${sigil.slotId || index + 1} non ha una identità collezionabile atomica.`);
      }
      const identity = A.sigianCollectibleInventoryIdentity?.(sigil.collectibleId, recipe.school);
      if (!identity?.definitionId) {
        throw new Error(`Valutazione production: identità canonica non risolta per ${sigil.collectibleId}.`);
      }
      components.push(atomicComponent({
        kind:"sigil",
        definitionId:identity.definitionId,
        slotId:sigil.slotId,
        grade:identity.grade ?? sigil.grade,
        school:identity.effectSchool,
        intensity:sigil.intensity
      }, index));
    });
    if (recipe?.constraint) {
      components.push(atomicComponent({
        kind:"constraint",
        definitionId:recipe.constraint.definitionId,
        slotId:"constraint",
        grade:recipe.constraint.grade,
        school:recipe.constraint.school,
        intensity:recipe.constraint.intensity,
        threshold:recipe.constraint.threshold,
        damage:recipe.constraint.damage,
        percent:recipe.constraint.percent,
        multiplier:recipe.constraint.multiplier
      }, components.length));
    }
    return components;
  }

  A.SIGIAN_ATOMIC_VALUE_SCHEMA_VERSION = ATOMIC_VALUE_SCHEMA_VERSION;

  A.buildSigianAtomicCalibrationDataset = function buildSigianAtomicCalibrationDataset(cards) {
    const cardList = cards || [];
    const validation = A.validateSigianBaseCanonicalComponents?.(cardList);
    if (!validation?.valid || validation.cardCount !== 65 || validation.mappedCount !== 65) {
      throw new Error(`Calibrazione atomica: mapping Base Set non valido: ${(validation?.errors || []).join("; ")}`);
    }
    const legacySamples = A.buildSigianCalibrationDataset?.(cardList) || [];
    if (legacySamples.length !== cardList.length) {
      throw new Error("Calibrazione atomica: dataset semantico Base Set incompleto.");
    }
    return legacySamples.map(sample => {
      const components = A.getSigianBaseCanonicalComponents?.(sample.id) || [];
      const normalizedSample = normalizeLegacySemanticSampleForAtomic(sample, components);
      return {
        ...normalizedSample,
        atomicSchemaVersion:ATOMIC_VALUE_SCHEMA_VERSION,
        atomicRepresentation:true,
        atomicComponents:components.map((component, index) => atomicComponent(component, index)),
        atomicSigilCount:components.filter(component => component.kind === "sigil").length,
        atomicConstraintCount:components.filter(component => component.kind === "constraint").length
      };
    });
  };

  A.createSigianAtomicForgeValueSample = function createSigianAtomicForgeValueSample(recipeInput) {
    const recipe = A.createFormulaRecipe?.(recipeInput || {}) || clone(recipeInput || {});
    const card = syntheticCard(recipe);
    const values = {};
    (recipe.sigils || []).forEach(sigil => {
      if (sigil.intensity != null && Number.isFinite(Number(sigil.intensity))) {
        values[sigil.slotId] = Number(sigil.intensity);
      }
    });
    const sample = A.createSigianCalibrationSample?.(card, recipe, { values });
    if (!sample) throw new Error("Valutazione production: impossibile costruire il campione Formula.");
    const components = atomicComponentsForRecipe(recipe);
    return {
      ...sample,
      atomicSchemaVersion:ATOMIC_VALUE_SCHEMA_VERSION,
      atomicRepresentation:true,
      atomicComponents:components,
      atomicSigilCount:components.filter(component => component.kind === "sigil").length,
      atomicConstraintCount:components.filter(component => component.kind === "constraint").length
    };
  };

  A.listSigianAtomicValueComponentsForRecipe = function listSigianAtomicValueComponentsForRecipe(recipe) {
    return atomicComponentsForRecipe(A.createFormulaRecipe?.(recipe || {}) || recipe || {}).map(clone);
  };
})(window.Arcane = window.Arcane || {});
