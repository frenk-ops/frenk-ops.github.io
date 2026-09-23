(function (A) {
  "use strict";

  const CANDIDATE_SCHEMA_VERSION = 1;
  const ORACLE_QUANTILE = 0.75;

  function clone(value) {
    if (typeof A.deepClone === "function") return A.deepClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function quantile(values, q) {
    if (!Array.isArray(values) || !values.length) return null;
    const sorted = [...values].map(Number).filter(Number.isFinite).sort((a,b) => a-b);
    if (!sorted.length) return null;
    const position = (sorted.length - 1) * Math.max(0, Math.min(1, Number(q)));
    const low = Math.floor(position);
    const high = Math.ceil(position);
    if (low === high) return sorted[low];
    return sorted[low] + ((sorted[high] - sorted[low]) * (position - low));
  }

  function median(values) {
    return quantile(values, 0.5);
  }

  function attachOracleTargets(samples, oracleRows, options = {}) {
    const q = Number.isFinite(Number(options.quantile)) ? Number(options.quantile) : ORACLE_QUANTILE;
    const divisor = Math.max(1, finite(options.divisor, 1000));
    const grouped = {};
    (oracleRows || []).filter(row => row?.playable).forEach(row => {
      (grouped[row.cardId] ||= []).push(finite(row.grossMarginal, 0));
    });

    return (samples || []).map(sample => {
      const values = grouped[sample.id] || [];
      if (!values.length) throw new Error(`Oracle gross mancante per ${sample.id}.`);
      const grossMean = values.reduce((sum,value) => sum + value, 0) / values.length;
      const grossMin = Math.min(...values);
      const grossMax = Math.max(...values);
      return {
        ...clone(sample),
        oracleGrossMean: grossMean / divisor,
        oracleGrossP75: quantile(values, q) / divisor,
        oracleGrossMedian: median(values) / divisor,
        oracleGrossSpread: (grossMax - grossMin) / divisor,
        oracleScenarioCount: values.length
      };
    });
  }

  function enforceMonotone(values, minimumStep = 0) {
    const result = [];
    (values || []).forEach((value,index) => {
      const numeric = finite(value, index ? result[index - 1] : 0);
      if (!index) result.push(numeric);
      else result.push(Math.max(numeric, result[index - 1] + minimumStep));
    });
    return result;
  }

  function buildCapCandidate(samples, model, options = {}) {
    const maxObservedLevel = Math.max(...samples.map(sample => Math.trunc(finite(sample.printedLevel, 1))));
    const quantileValue = Number.isFinite(Number(options.levelQuantile)) ? Number(options.levelQuantile) : 0.75;
    const minimumStep = Math.max(0, finite(options.minimumStep, 0.25));
    const levelGroups = new Map();

    samples.forEach(sample => {
      const level = Math.trunc(finite(sample.printedLevel, 1));
      const predicted = Math.max(0, finite(model.predict(sample), 0));
      if (!levelGroups.has(level)) levelGroups.set(level, []);
      levelGroups.get(level).push(predicted);
    });

    const rawAnchors = [];
    for (let level = 1; level <= maxObservedLevel; level += 1) {
      const values = levelGroups.get(level) || [];
      if (!values.length) throw new Error(`Nessuna ancora per Livello ${level}.`);
      rawAnchors.push(quantile(values, quantileValue));
    }
    const monotoneAnchors = enforceMonotone(rawAnchors, minimumStep);
    const recentDeltas = [];
    for (let index = Math.max(1, monotoneAnchors.length - 4); index < monotoneAnchors.length; index += 1) {
      const delta = monotoneAnchors[index] - monotoneAnchors[index - 1];
      if (delta > 0) recentDeltas.push(delta);
    }
    const continuationSlope = Math.max(minimumStep, median(recentDeltas) || minimumStep || 1);

    function capForLevel(levelInput) {
      const level = Math.max(1, Math.trunc(finite(levelInput, 1)));
      if (level <= monotoneAnchors.length) return monotoneAnchors[level - 1];
      return monotoneAnchors[monotoneAnchors.length - 1] + continuationSlope * (level - monotoneAnchors.length);
    }

    return {
      schemaVersion:CANDIDATE_SCHEMA_VERSION,
      observedMaxLevel:maxObservedLevel,
      levelQuantile:quantileValue,
      minimumStep,
      rawAnchors,
      anchors:monotoneAnchors,
      continuationSlope,
      capForLevel
    };
  }

  function levelMetrics(samples, model, capCandidate) {
    const rows = samples.map(sample => {
      const value = Math.max(0, finite(model.predict(sample), 0));
      const result = A.findMinimumLegalSigianLevel({
        evaluateAtLevel:() => value,
        capForLevel:capCandidate.capForLevel,
        technicalSearchLimit:256
      });
      return {
        id:sample.id,
        actual:sample.printedLevel,
        predicted:result.level,
        value
      };
    });
    const absolute = rows.map(row => Math.abs(row.predicted - row.actual));
    return {
      rows,
      count:rows.length,
      mae:absolute.reduce((sum,value) => sum + value, 0) / Math.max(1, rows.length),
      exactRate:rows.filter(row => row.predicted === row.actual).length / Math.max(1, rows.length),
      withinOneRate:rows.filter(row => Math.abs(row.predicted-row.actual) <= 1).length / Math.max(1, rows.length)
    };
  }

  A.SIGIAN_VALUE_CANDIDATE_SCHEMA_VERSION = CANDIDATE_SCHEMA_VERSION;
  A.SIGIAN_ORACLE_TARGET_QUANTILE = ORACLE_QUANTILE;

  A.buildSigianOracleTargetSamples = attachOracleTargets;

  A.fitSigianOracleStrengthCandidate = function fitSigianOracleStrengthCandidate(samples, options = {}) {
    const fit = A.fitSigianValueTargetCandidate(samples, {
      targetName:"oracle-gross-p75",
      targetOf:sample => sample.oracleGrossP75,
      lambdas:options.lambdas
    });
    const capCandidate = buildCapCandidate(samples, fit.model, options.cap || {});
    const levels = levelMetrics(samples, fit.model, capCandidate);
    return {
      schemaVersion:CANDIDATE_SCHEMA_VERSION,
      oracleQuantile:ORACLE_QUANTILE,
      fit,
      capCandidate,
      levels
    };
  };
})(window.Arcane = window.Arcane || {});
