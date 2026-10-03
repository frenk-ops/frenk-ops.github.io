(function (A) {
  "use strict";

  const CAP_V2_SCHEMA_VERSION = 1;
  const DEFAULT_MINIMUM_STEP = 0.25;

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function quantile(values, q) {
    const sorted = (values || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const position = (sorted.length - 1) * Math.max(0, Math.min(1, finite(q, 0.5)));
    const low = Math.floor(position);
    const high = Math.ceil(position);
    if (low === high) return sorted[low];
    return sorted[low] + ((sorted[high] - sorted[low]) * (position - low));
  }

  function median(values) {
    return quantile(values, 0.5);
  }

  function mean(values) {
    const finiteValues = (values || []).map(Number).filter(Number.isFinite);
    if (!finiteValues.length) return 0;
    return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
  }

  function weightedPoolAdjacentViolators(values, weights) {
    const blocks = [];
    values.forEach((value, index) => {
      const weight = Math.max(1e-9, finite(weights?.[index], 1));
      blocks.push({
        start:index,
        end:index,
        weight,
        mean:finite(value, 0)
      });

      while (blocks.length >= 2 && blocks[blocks.length - 2].mean > blocks[blocks.length - 1].mean) {
        const right = blocks.pop();
        const left = blocks.pop();
        const weightTotal = left.weight + right.weight;
        blocks.push({
          start:left.start,
          end:right.end,
          weight:weightTotal,
          mean:((left.mean * left.weight) + (right.mean * right.weight)) / weightTotal
        });
      }
    });

    const fitted = Array(values.length).fill(0);
    blocks.forEach(block => {
      for (let index = block.start; index <= block.end; index += 1) fitted[index] = block.mean;
    });
    return { fitted, blocks };
  }

  function enforceMinimumStepWithIsotonic(rawAnchors, minimumStep, weights) {
    const step = Math.max(0, finite(minimumStep, DEFAULT_MINIMUM_STEP));
    const transformed = rawAnchors.map((value, index) => finite(value, 0) - (index * step));
    const pooled = weightedPoolAdjacentViolators(transformed, weights);
    const anchors = pooled.fitted.map((value, index) => value + (index * step));
    return {
      anchors,
      blocks:pooled.blocks.map(block => ({
        startLevel:block.start + 1,
        endLevel:block.end + 1,
        weight:block.weight,
        transformedMean:block.mean
      }))
    };
  }

  function deltasOf(anchors) {
    const out = [];
    for (let index = 1; index < anchors.length; index += 1) out.push(anchors[index] - anchors[index - 1]);
    return out;
  }

  function capFromAnchors(anchors, continuationSlope, levelInput) {
    const level = Math.max(1, Math.trunc(finite(levelInput, 1)));
    if (level <= anchors.length) return anchors[level - 1];
    return anchors[anchors.length - 1] + (continuationSlope * (level - anchors.length));
  }

  A.SIGIAN_CAP_V2_SCHEMA_VERSION = CAP_V2_SCHEMA_VERSION;

  A.fitSigianMonotoneCapV2Diagnostic = function fitSigianMonotoneCapV2Diagnostic(rawAnchorsInput, options = {}) {
    const rawAnchors = (rawAnchorsInput || []).map(Number);
    if (!rawAnchors.length || rawAnchors.some(value => !Number.isFinite(value) || value < 0)) {
      throw new Error("Cap v2 diagnostica: servono anchor numeriche non negative.");
    }

    const minimumStep = Math.max(0, finite(options.minimumStep, DEFAULT_MINIMUM_STEP));
    const weights = Array.isArray(options.weights) && options.weights.length === rawAnchors.length
      ? options.weights.map(value => Math.max(1e-9, finite(value, 1)))
      : rawAnchors.map(() => 1);

    const fit = enforceMinimumStepWithIsotonic(rawAnchors, minimumStep, weights);
    const deltas = deltasOf(fit.anchors);
    const continuationSlope = Math.max(minimumStep, median(deltas));

    const rawDeltas = deltasOf(rawAnchors);
    const repairedLevels = rawAnchors
      .map((value, index) => ({
        level:index + 1,
        raw:value,
        fitted:fit.anchors[index],
        delta:fit.anchors[index] - value
      }))
      .filter(row => Math.abs(row.delta) > 1e-9);

    return {
      schemaVersion:CAP_V2_SCHEMA_VERSION,
      status:"diagnostic",
      method:"strict-isotonic-pav-v1",
      minimumStep,
      rawAnchors:[...rawAnchors],
      anchors:fit.anchors,
      rawDeltas,
      fittedDeltas:deltas,
      continuationSlope,
      repairedLevels,
      pooledBlocks:fit.blocks.filter(block => block.endLevel > block.startLevel),
      capForLevel(level) {
        return capFromAnchors(fit.anchors, continuationSlope, level);
      }
    };
  };


  A.buildSigianCapV2LevelEvidence = function buildSigianCapV2LevelEvidence(samples, options = {}) {
    const valueOf = typeof options.valueOf === "function"
      ? options.valueOf
      : sample => {
          const model = options.model;
          if (!model?.predict) throw new Error("Cap v2 evidence: serve valueOf oppure model.predict.");
          return model.predict(sample);
        };

    const groups = new Map();
    (samples || []).forEach(sample => {
      const level = Math.max(1, Math.trunc(finite(sample?.printedLevel, 1)));
      const value = Math.max(0, finite(valueOf(sample), 0));
      if (!groups.has(level)) groups.set(level, []);
      groups.get(level).push(value);
    });
    if (!groups.size) throw new Error("Cap v2 evidence: dataset vuoto.");

    const maxLevel = Math.max(...groups.keys());
    const evidence = [];
    for (let level = 1; level <= maxLevel; level += 1) {
      const values = groups.get(level) || [];
      if (!values.length) throw new Error(`Cap v2 evidence: nessun anchor per L${level}.`);
      evidence.push({
        level,
        count:values.length,
        min:Math.min(...values),
        q25:quantile(values, 0.25),
        median:quantile(values, 0.5),
        p60:quantile(values, 0.6),
        p75:quantile(values, 0.75),
        mean:mean(values),
        max:Math.max(...values),
        spread:Math.max(...values) - Math.min(...values)
      });
    }
    return evidence;
  };

  A.fitSigianCapV2FromLevelEvidence = function fitSigianCapV2FromLevelEvidence(evidence, options = {}) {
    const statistic = String(options.statistic || "median");
    const supported = new Set(["q25", "median", "p60", "p75", "mean"]);
    if (!supported.has(statistic)) throw new Error(`Cap v2 evidence: statistica non supportata ${statistic}.`);
    const rows = Array.isArray(evidence) ? evidence : [];
    if (!rows.length) throw new Error("Cap v2 evidence: righe mancanti.");
    const rawAnchors = rows.map(row => Number(row?.[statistic]));
    const weights = rows.map(row => Math.max(1, Number(row?.count || 1)));
    const fit = A.fitSigianMonotoneCapV2Diagnostic(rawAnchors, {
      minimumStep:options.minimumStep,
      weights
    });
    return {
      ...fit,
      source:"level-evidence",
      statistic,
      evidence:rows.map(row => ({ ...row }))
    };
  };

  A.compareSigianCapV2Statistics = function compareSigianCapV2Statistics(evidence, options = {}) {
    const statistics = options.statistics || ["median", "p60", "p75"];
    return statistics.map(statistic => A.fitSigianCapV2FromLevelEvidence(evidence, {
      statistic,
      minimumStep:options.minimumStep
    }));
  };

  A.summarizeSigianCapV2Diagnostic = function summarizeSigianCapV2Diagnostic(rawAnchors, options = {}) {
    const result = A.fitSigianMonotoneCapV2Diagnostic(rawAnchors, options);
    return {
      schemaVersion:result.schemaVersion,
      status:result.status,
      method:result.method,
      minimumStep:result.minimumStep,
      rawAnchors:result.rawAnchors,
      anchors:result.anchors,
      rawDeltas:result.rawDeltas,
      fittedDeltas:result.fittedDeltas,
      continuationSlope:result.continuationSlope,
      pooledBlocks:result.pooledBlocks,
      repairedLevels:result.repairedLevels,
      cap14:result.capForLevel(14),
      cap15:result.capForLevel(15)
    };
  };
})(window.Arcane = window.Arcane || {});
