(function (A) {
  "use strict";

  const SCHEMA_VERSION = 1;

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function quantile(values, q) {
    const sorted = (values || []).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
    if (!sorted.length) return null;
    const position = (sorted.length - 1) * Math.max(0, Math.min(1, finite(q, 0.5)));
    const low = Math.floor(position);
    const high = Math.ceil(position);
    if (low === high) return sorted[low];
    return sorted[low] + ((sorted[high] - sorted[low]) * (position - low));
  }

  function predictLevel(value, fit, maxLevel = 256) {
    if (!fit || typeof fit.capForLevel !== "function") {
      throw new Error("Cap v2 stability: predictor privo di capForLevel.");
    }
    const numeric = Math.max(0, finite(value, NaN));
    if (!Number.isFinite(numeric)) throw new Error("Cap v2 stability: value non valido.");
    for (let level = 1; level <= maxLevel; level += 1) {
      if (numeric <= fit.capForLevel(level)) return level;
    }
    throw new Error("Cap v2 stability: livello non trovato.");
  }

  A.SIGIAN_CAP_V2_STABILITY_SCHEMA_VERSION = SCHEMA_VERSION;

  A.evaluateSigianCapV2PredictionStability = function evaluateSigianCapV2PredictionStability(value, predictors) {
    const list = (predictors || []).map((item,index) => ({
      id:String(item?.id || `predictor-${index}`),
      fit:item?.fit || item
    }));
    if (!list.length) throw new Error("Cap v2 stability: servono predictor.");

    const predictions = list.map(item => ({
      id:item.id,
      level:predictLevel(value, item.fit)
    }));
    const counts = new Map();
    predictions.forEach(row => counts.set(row.level, (counts.get(row.level) || 0) + 1));
    const maxCount = Math.max(...counts.values());
    const modalLevels = [...counts.entries()]
      .filter(([,count]) => count === maxCount)
      .map(([level]) => Number(level))
      .sort((a,b)=>a-b);
    const levels = predictions.map(row => row.level);
    const minLevel = Math.min(...levels);
    const maxLevel = Math.max(...levels);

    return {
      schemaVersion:SCHEMA_VERSION,
      value:Number(value),
      predictions,
      counts:Object.fromEntries([...counts.entries()].sort((a,b)=>a[0]-b[0])),
      modalLevels,
      consensusLevel:modalLevels.length === 1 ? modalLevels[0] : null,
      consensusShare:maxCount / predictions.length,
      minLevel,
      maxLevel,
      span:maxLevel - minLevel,
      unanimous:minLevel === maxLevel,
      adjacentOnly:(maxLevel - minLevel) <= 1
    };
  };

  A.summarizeSigianCapV2ThresholdStability = function summarizeSigianCapV2ThresholdStability(predictors, options = {}) {
    const list = (predictors || []).map((item,index) => ({
      id:String(item?.id || `predictor-${index}`),
      fit:item?.fit || item
    }));
    if (!list.length) throw new Error("Cap v2 stability: servono predictor.");
    const maxLevel = Math.max(1, Math.trunc(finite(options.maxLevel, 13)));

    return Array.from({ length:maxLevel }, (_,index) => {
      const level = index + 1;
      const values = list.map(item => Number(item.fit.capForLevel(level))).filter(Number.isFinite);
      if (values.length !== list.length) throw new Error(`Cap v2 stability: cap non valido a L${level}.`);
      return {
        level,
        count:values.length,
        min:Math.min(...values),
        q25:quantile(values, 0.25),
        median:quantile(values, 0.5),
        q75:quantile(values, 0.75),
        max:Math.max(...values),
        spread:Math.max(...values) - Math.min(...values)
      };
    });
  };

  A.summarizeSigianCapV2PredictionStability = function summarizeSigianCapV2PredictionStability(rows) {
    const items = rows || [];
    const spans = items.map(row => Number(row?.span)).filter(Number.isFinite);
    const shares = items.map(row => Number(row?.consensusShare)).filter(Number.isFinite);
    const distribution = {};
    spans.forEach(span => {
      const key = span >= 3 ? "3+" : String(span);
      distribution[key] = (distribution[key] || 0) + 1;
    });

    return {
      count:items.length,
      unanimous:items.filter(row => row?.unanimous).length,
      adjacentOnly:items.filter(row => row?.adjacentOnly).length,
      uniqueConsensus:items.filter(row => row?.consensusLevel != null).length,
      averageConsensusShare:shares.length ? shares.reduce((a,b)=>a+b,0) / shares.length : null,
      maxSpan:spans.length ? Math.max(...spans) : null,
      spanDistribution:distribution
    };
  };
})(window.Arcane = window.Arcane || {});
