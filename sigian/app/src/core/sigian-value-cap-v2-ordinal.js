(function (A) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const EPSILON = 1e-9;

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function median(values) {
    const sorted = (values || []).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
    if (!sorted.length) return 0;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function capFromAnchors(anchors, slope, levelInput) {
    const level = Math.max(1, Math.trunc(finite(levelInput, 1)));
    if (level <= anchors.length) return anchors[level - 1];
    return anchors[anchors.length - 1] + slope * (level - anchors.length);
  }

  function segmentCostPrefix(rows, maxLevel, lossPower) {
    const prefix = Array.from({ length:maxLevel + 1 }, () => Array(rows.length + 1).fill(0));
    for (let level = 1; level <= maxLevel; level += 1) {
      for (let index = 0; index < rows.length; index += 1) {
        const error = Math.abs(rows[index].actual - level);
        const loss = lossPower === 2 ? error * error : error;
        prefix[level][index + 1] = prefix[level][index] + loss;
      }
    }
    return prefix;
  }

  function segmentCost(prefix, level, start, endExclusive) {
    return prefix[level][endExclusive] - prefix[level][start];
  }

  function strictAnchors(rawAnchors, minimumStep) {
    const step = Math.max(0, finite(minimumStep, 0.25));
    const anchors = [];
    rawAnchors.forEach((value,index) => {
      const numeric = Math.max(0, finite(value, 0));
      anchors.push(index ? Math.max(numeric, anchors[index - 1] + step) : numeric);
    });
    return anchors;
  }

  function metrics(rows, capForLevel) {
    const scored = rows.map(row => {
      let predicted = 1;
      for (; predicted <= 256; predicted += 1) {
        if (row.value <= capForLevel(predicted)) break;
      }
      return { ...row, predicted, error:predicted - row.actual };
    });
    const abs = scored.map(row => Math.abs(row.error));
    return {
      count:scored.length,
      mae:abs.reduce((sum,value)=>sum+value,0)/Math.max(1,scored.length),
      exact:scored.filter(row=>row.error===0).length/Math.max(1,scored.length),
      withinOne:scored.filter(row=>Math.abs(row.error)<=1).length/Math.max(1,scored.length),
      withinTwo:scored.filter(row=>Math.abs(row.error)<=2).length/Math.max(1,scored.length),
      rows:scored
    };
  }

  A.SIGIAN_CAP_V2_ORDINAL_SCHEMA_VERSION = SCHEMA_VERSION;

  A.fitSigianOrdinalCapV2Diagnostic = function fitSigianOrdinalCapV2Diagnostic(inputRows, options = {}) {
    const rows = (inputRows || []).map((row,index) => ({
      id:String(row?.id || `row-${index}`),
      value:Math.max(0, finite(row?.value, NaN)),
      actual:Math.max(1, Math.trunc(finite(row?.actual ?? row?.printedLevel, NaN)))
    }));
    if (!rows.length || rows.some(row => !Number.isFinite(row.value) || !Number.isFinite(row.actual))) {
      throw new Error("Cap v2 ordinale: servono righe con value/actual validi.");
    }

    rows.sort((a,b) => a.value - b.value || a.actual - b.actual || a.id.localeCompare(b.id));
    const maxLevel = Math.max(1, Math.trunc(finite(options.maxLevel, Math.max(...rows.map(row=>row.actual)))));
    if (rows.length < maxLevel) throw new Error("Cap v2 ordinale: servono almeno tante righe quanti livelli.");
    const minimumStep = Math.max(0, finite(options.minimumStep, 0.25));
    const lossPower = Number(options.lossPower) === 2 ? 2 : 1;
    const prefix = segmentCostPrefix(rows, maxLevel, lossPower);

    const inf = Number.POSITIVE_INFINITY;
    const dp = Array.from({ length:maxLevel + 1 }, () => Array(rows.length + 1).fill(inf));
    const prev = Array.from({ length:maxLevel + 1 }, () => Array(rows.length + 1).fill(-1));
    dp[0][0] = 0;

    for (let level = 1; level <= maxLevel; level += 1) {
      const minEnd = level;
      const maxEnd = rows.length - (maxLevel - level);
      for (let end = minEnd; end <= maxEnd; end += 1) {
        for (let start = level - 1; start < end; start += 1) {
          if (!Number.isFinite(dp[level - 1][start])) continue;
          const value = dp[level - 1][start] + segmentCost(prefix, level, start, end);
          if (value + EPSILON < dp[level][end]) {
            dp[level][end] = value;
            prev[level][end] = start;
          }
        }
      }
    }

    if (!Number.isFinite(dp[maxLevel][rows.length])) {
      throw new Error("Cap v2 ordinale: partizione non trovata.");
    }

    const segments = [];
    let cursor = rows.length;
    for (let level = maxLevel; level >= 1; level -= 1) {
      const start = prev[level][cursor];
      if (start < 0) throw new Error("Cap v2 ordinale: backtracking non valido.");
      segments.push({ level, start, end:cursor });
      cursor = start;
    }
    segments.reverse();

    const rawAnchors = [];
    for (let index = 0; index < segments.length - 1; index += 1) {
      const left = rows[segments[index].end - 1].value;
      const right = rows[segments[index + 1].start].value;
      rawAnchors.push(right > left ? (left + right) / 2 : left);
    }
    rawAnchors.push(Math.max(rows[rows.length - 1].value, (rawAnchors.at(-1) || 0) + minimumStep));

    const anchors = strictAnchors(rawAnchors, minimumStep);
    const deltas = [];
    for (let index = 1; index < anchors.length; index += 1) {
      const delta = anchors[index] - anchors[index - 1];
      if (delta > EPSILON) deltas.push(delta);
    }
    const continuationSlope = Math.max(minimumStep, median(deltas) || minimumStep || 1);
    const capForLevel = level => capFromAnchors(anchors, continuationSlope, level);
    const scored = metrics(rows, capForLevel);

    return {
      schemaVersion:SCHEMA_VERSION,
      status:"diagnostic",
      method:`ordinal-dp-l${lossPower}-v1`,
      maxLevel,
      minimumStep,
      lossPower,
      objectiveLoss:dp[maxLevel][rows.length],
      rawAnchors,
      anchors,
      continuationSlope,
      segments:segments.map(segment => ({
        level:segment.level,
        count:segment.end - segment.start,
        minValue:rows[segment.start].value,
        maxValue:rows[segment.end - 1].value
      })),
      trainingMetrics:scored,
      capForLevel
    };
  };
})(window.Arcane = window.Arcane || {});
