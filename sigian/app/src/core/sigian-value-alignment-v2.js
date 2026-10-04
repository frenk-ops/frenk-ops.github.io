(function (A) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const STATUS = Object.freeze({
    IN_RANGE:"IN_RANGE",
    CALIBRATABLE:"CALIBRATABLE",
    STRUCTURAL_MISMATCH:"STRUCTURAL_MISMATCH",
    PENDING_SENSITIVITY:"PENDING_SENSITIVITY"
  });

  function finiteInteger(value, label) {
    const number = Number(value);
    if (!Number.isFinite(number) || Math.trunc(number) !== number || number < 1) {
      throw new Error(`Formula alignment v2: ${label} non valido.`);
    }
    return number;
  }

  function finiteNumber(value, fallback = null) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeStability(input = {}) {
    const minLevel = finiteInteger(input.minLevel, "stability.minLevel");
    const maxLevel = finiteInteger(input.maxLevel, "stability.maxLevel");
    if (minLevel > maxLevel) throw new Error("Formula alignment v2: intervallo stabilita invertito.");

    const consensusLevel = input.consensusLevel == null
      ? null
      : finiteInteger(input.consensusLevel, "stability.consensusLevel");
    const consensusShare = finiteNumber(input.consensusShare, null);
    if (consensusShare != null && (consensusShare < 0 || consensusShare > 1)) {
      throw new Error("Formula alignment v2: consensusShare deve essere tra 0 e 1.");
    }

    return {
      minLevel,
      maxLevel,
      consensusLevel,
      consensusShare,
      span:maxLevel - minLevel,
      unanimous:minLevel === maxLevel
    };
  }

  function normalizeSensitivity(input) {
    if (!input) return null;
    const declaredComplete = input.complete === true;
    const reachableMinLevel = input.reachableMinLevel == null
      ? null
      : finiteInteger(input.reachableMinLevel, "sensitivity.reachableMinLevel");
    const reachableMaxLevel = input.reachableMaxLevel == null
      ? null
      : finiteInteger(input.reachableMaxLevel, "sensitivity.reachableMaxLevel");

    if ((reachableMinLevel == null) !== (reachableMaxLevel == null)) {
      throw new Error("Formula alignment v2: sensitivity richiede entrambi gli estremi raggiungibili.");
    }
    if (reachableMinLevel != null && reachableMinLevel > reachableMaxLevel) {
      throw new Error("Formula alignment v2: intervallo sensitivity invertito.");
    }

    const knobsTested = Math.max(0, Math.trunc(finiteNumber(input.knobsTested, 0)));
    const reachableIntervals = input.reachableIntervals == null ? null : input.reachableIntervals.map(range => {
      const minLevel=finiteInteger(range.minLevel,"sensitivity.interval.minLevel");
      const maxLevel=finiteInteger(range.maxLevel,"sensitivity.interval.maxLevel");
      if (minLevel > maxLevel) throw new Error("Formula alignment v2: intervallo sensitivity invertito.");
      return {minLevel,maxLevel};
    });
    // A completion flag alone is not evidence of a tested parameter domain.
    const complete = declaredComplete && reachableMinLevel != null && knobsTested > 0
      && (reachableIntervals == null || reachableIntervals.length > 0);
    return {
      complete,
      declaredComplete,
      reachableMinLevel,
      reachableMaxLevel,
      requiresSemanticChange:input.requiresSemanticChange === true,
      knobsTested,
      reachableIntervals,
      note:input.note == null ? null : String(input.note)
    };
  }

  function distanceFromRange(target, minLevel, maxLevel) {
    if (target < minLevel) return minLevel - target;
    if (target > maxLevel) return target - maxLevel;
    return 0;
  }

  A.SIGIAN_FORMULA_ALIGNMENT_V2_SCHEMA_VERSION = SCHEMA_VERSION;
  A.SIGIAN_FORMULA_ALIGNMENT_V2_STATUS = STATUS;

  A.classifySigianFormulaAlignmentV2 = function classifySigianFormulaAlignmentV2(input = {}) {
    const targetCost = finiteInteger(input.targetCost, "targetCost");
    const stability = normalizeStability(input.stability || {});
    const sensitivity = normalizeSensitivity(input.sensitivity);
    const distance = distanceFromRange(targetCost, stability.minLevel, stability.maxLevel);
    const direction = targetCost < stability.minLevel
      ? "WEAKEN"
      : targetCost > stability.maxLevel
        ? "STRENGTHEN"
        : "NONE";

    if (distance === 0) {
      return {
        schemaVersion:SCHEMA_VERSION,
        status:STATUS.IN_RANGE,
        targetCost,
        direction,
        distanceFromStableRange:0,
        stability,
        sensitivity,
        final:true,
        reason:"Il costo target ricade nell'intervallo previsto dalle curve di stabilita."
      };
    }

    if (!sensitivity?.complete) {
      return {
        schemaVersion:SCHEMA_VERSION,
        status:STATUS.PENDING_SENSITIVITY,
        targetCost,
        direction,
        distanceFromStableRange:distance,
        stability,
        sensitivity,
        final:false,
        reason:"Il costo target e fuori intervallo: serve una sensitivity analysis completa prima di distinguere calibrazione da mismatch strutturale."
      };
    }

    const targetReachable = sensitivity.reachableIntervals != null
      ? sensitivity.reachableIntervals.some(range => targetCost >= range.minLevel && targetCost <= range.maxLevel)
      : sensitivity.reachableMinLevel != null
      && targetCost >= sensitivity.reachableMinLevel
      && targetCost <= sensitivity.reachableMaxLevel;

    if (targetReachable && !sensitivity.requiresSemanticChange) {
      return {
        schemaVersion:SCHEMA_VERSION,
        status:STATUS.CALIBRATABLE,
        targetCost,
        direction,
        distanceFromStableRange:distance,
        stability,
        sensitivity,
        final:true,
        reason:"La sensitivity analysis raggiunge il costo target modificando parametri senza cambiare la semantica della Formula."
      };
    }

    return {
      schemaVersion:SCHEMA_VERSION,
      status:STATUS.STRUCTURAL_MISMATCH,
      targetCost,
      direction,
      distanceFromStableRange:distance,
      stability,
      sensitivity,
      final:true,
      reason:sensitivity.requiresSemanticChange
        ? "Raggiungere il costo target richiede un cambiamento semantico della Formula."
        : "La sensitivity analysis completa non raggiunge il costo target nel dominio parametrico testato."
    };
  };
})(window.Arcane = window.Arcane || {});
