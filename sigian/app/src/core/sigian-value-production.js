(function (A) {
  "use strict";

  const PRODUCTION_SCHEMA_VERSION = 1;
  const EVALUATOR_ID = "hybrid-atomic-oracle75-production-v1";
  const EPSILON = 1e-8;

  function clone(value) {
    if (typeof A.deepClone === "function") return A.deepClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function finite(value, fallback = null) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function pearson(rows) {
    if (!rows.length) return 0;
    const xs = rows.map(row => Number(row.x));
    const ys = rows.map(row => Number(row.y));
    const xMean = xs.reduce((sum, value) => sum + value, 0) / xs.length;
    const yMean = ys.reduce((sum, value) => sum + value, 0) / ys.length;
    let covariance = 0;
    let xSquare = 0;
    let ySquare = 0;
    rows.forEach((row, index) => {
      const xd = xs[index] - xMean;
      const yd = ys[index] - yMean;
      covariance += xd * yd;
      xSquare += xd * xd;
      ySquare += yd * yd;
    });
    const denominator = Math.sqrt(xSquare * ySquare);
    return denominator > 0 ? covariance / denominator : 0;
  }

  function canonicalMappingGate(cards) {
    const validation = A.validateSigianBaseCanonicalComponents?.(cards || []);
    const blockers = [];
    if (!validation?.valid) blockers.push("atomic-base-set-invalid");
    if (Number(validation?.cardCount) !== 65 || Number(validation?.mappedCount) !== 65) {
      blockers.push("atomic-base-set-not-65-of-65");
    }

    const componentErrors = [];
    (cards || []).forEach(card => {
      const components = A.getSigianBaseCanonicalComponents?.(card.id) || [];
      const sigils = components.filter(component => component.kind === "sigil");
      const constraints = components.filter(component => component.kind === "constraint");
      if (sigils.length > 3 || constraints.length > 1) {
        componentErrors.push(`${card.id}: invalid component slots`);
      }
      components.forEach(component => {
        const definition = A.getSigianCanonicalV2?.(component.definitionId);
        if (!definition || definition.status !== "approved") {
          componentErrors.push(`${card.id}: unapproved ${component.definitionId}`);
        }
        if (component.grade != null) {
          const grade = Number(component.grade);
          if (!Number.isInteger(grade) || grade < 1 || grade > 5) {
            componentErrors.push(`${card.id}: invalid grade ${component.grade}`);
          }
        }
      });
    });
    if (componentErrors.length) blockers.push("atomic-component-review-incomplete");
    return { validation, blockers, componentErrors };
  }

  function historicalOutlierGate() {
    const expected = [
      { cardId:"astral_water_08", definitionId:"v2-wave", grade:4, intensity:15 },
      { cardId:"astral_air_13", definitionId:"v2-damage-hero", grade:4, intensity:15 },
      { cardId:"astral_earth_10", definitionId:"v2-wave", grade:5, intensity:20 },
      { cardId:"astral_earth_13", definitionId:"v2-abbattimento", grade:5, intensity:18 }
    ];
    const failures = [];
    expected.forEach(anchor => {
      const match = (A.getSigianBaseCanonicalComponents?.(anchor.cardId) || []).find(component =>
        component.definitionId === anchor.definitionId
        && Number(component.grade) === anchor.grade
        && Number(component.intensity) === anchor.intensity
      );
      if (!match) failures.push(clone(anchor));
    });
    return {
      passed:failures.length === 0,
      expected:clone(expected),
      failures
    };
  }

  function stressGate(evaluator) {
    if (typeof A.runSigianValueStressSuite !== "function") {
      return { passed:false, blockers:["stress-suite-unavailable"], report:null };
    }
    const report = A.runSigianValueStressSuite(evaluator, { label:"hybrid-atomic-production" });
    return {
      passed:Number(report?.failed || 0) === 0 && report?.blockedForProduction === false,
      blockers:Number(report?.failed || 0) === 0 && report?.blockedForProduction === false
        ? []
        : ["adversarial-stress-failed"],
      report:clone(report)
    };
  }

  function anchorGate(samples, evaluator) {
    const rows = (samples || []).map(sample => {
      const breakdown = evaluator.evaluate(sample);
      const minimum = evaluator.minimumLevel(sample);
      return {
        id:sample.id,
        printed:Number(sample.printedLevel),
        oracle:Number(sample.oracleGrossP75),
        value:Number(breakdown.total),
        level:Number(minimum.level),
        cap:Number(evaluator.capForLevel(minimum.level)),
        previousCap:minimum.level > 1 ? Number(evaluator.capForLevel(minimum.level - 1)) : null
      };
    });

    const finiteRows = rows.every(row =>
      Number.isFinite(row.value) && row.value >= 0
      && Number.isInteger(row.level) && row.level >= 1
      && Number.isFinite(row.cap)
      && Number.isFinite(row.oracle)
    );
    const levelMae = rows.reduce((sum, row) => sum + Math.abs(row.level - row.printed), 0) / Math.max(1, rows.length);
    const oraclePearson = pearson(rows.map(row => ({ x:row.value, y:row.oracle })));
    const budgetCoherent = rows.every(row =>
      row.value <= row.cap + EPSILON
      && (row.level <= 1 || row.value > Number(row.previousCap) - EPSILON)
    );
    const capMonotone = Array.from({ length:31 }, (_, index) => index + 1).every(level =>
      Number(evaluator.capForLevel(level + 1)) > Number(evaluator.capForLevel(level))
    );

    const blockers = [];
    if (rows.length !== 65) blockers.push("anchor-count-not-65");
    if (!finiteRows) blockers.push("anchor-output-nonfinite");
    if (levelMae > 5) blockers.push("anchor-level-mae-too-high");
    if (oraclePearson < 0.35) blockers.push("oracle-signal-too-low");
    if (!budgetCoherent) blockers.push("cap-budget-incoherent");
    if (!capMonotone) blockers.push("cap-not-open-monotone");

    return {
      passed:blockers.length === 0,
      blockers,
      metrics:{
        count:rows.length,
        levelMae,
        oraclePearson,
        withinTwo:rows.filter(row => Math.abs(row.level - row.printed) <= 2).length / Math.max(1, rows.length),
        cap13:Number(evaluator.capForLevel(13)),
        cap14:Number(evaluator.capForLevel(14)),
        cap15:Number(evaluator.capForLevel(15))
      },
      rows
    };
  }

  function oracleDatasetGate(oracleRows, samples) {
    const playable = (oracleRows || []).filter(row => row?.playable);
    const scenarioCounts = new Map();
    playable.forEach(row => scenarioCounts.set(row.cardId, (scenarioCounts.get(row.cardId) || 0) + 1));
    const passed = playable.length === 390
      && (samples || []).length === 65
      && (samples || []).every(sample => scenarioCounts.get(sample.id) === 6 && sample.atomicRepresentation === true);
    return {
      passed,
      playableObservations:playable.length,
      atomicSamples:(samples || []).filter(sample => sample.atomicRepresentation === true).length,
      blockers:passed ? [] : ["atomic-oracle-dataset-incomplete"]
    };
  }

  function constraintGate(samples, evaluator) {
    const source = (samples || []).find(sample =>
      sample.atomicRepresentation
      && Number(sample.atomicConstraintCount || 0) === 0
      && (sample.sigils || []).length > 0
    );
    if (!source) return { passed:false, blockers:["constraint-certification-sample-missing"] };

    const base = clone(source);
    const weak = clone(source);
    weak.id = `${source.id}:constraint-weak`;
    weak.atomicComponents = [
      ...(weak.atomicComponents || []).map(clone),
      {
        kind:"constraint",
        definitionId:"v2-constraint-backlash",
        slotId:"constraint",
        grade:1,
        magnitude:1,
        school:null,
        damage:1
      }
    ];
    weak.atomicConstraintCount = 1;

    const strong = clone(weak);
    strong.id = `${source.id}:constraint-strong`;
    strong.atomicComponents = strong.atomicComponents.map(component =>
      component.kind === "constraint"
        ? { ...component, grade:5, magnitude:5, damage:5 }
        : component
    );

    const baseBreakdown = evaluator.evaluate(base);
    const weakBreakdown = evaluator.evaluate(weak);
    const strongBreakdown = evaluator.evaluate(strong);
    const weakCredit = Number(weakBreakdown.constraintCredit?.total || 0);
    const strongCredit = Number(strongBreakdown.constraintCredit?.total || 0);
    const combinedCap = Number(strongBreakdown.combinedMalusCredit?.cap || 0);
    const combinedTotal = Number(strongBreakdown.combinedMalusCredit?.total || 0);

    const passed = weakCredit > 0
      && strongCredit + EPSILON >= weakCredit
      && weakBreakdown.total < baseBreakdown.total
      && strongBreakdown.total <= weakBreakdown.total + EPSILON
      && combinedTotal <= combinedCap + EPSILON
      && strongBreakdown.total >= 0;

    return {
      passed,
      blockers:passed ? [] : ["constraint-credit-guard-failed"],
      metrics:{
        base:Number(baseBreakdown.total),
        weak:Number(weakBreakdown.total),
        strong:Number(strongBreakdown.total),
        weakCredit,
        strongCredit,
        combinedTotal,
        combinedCap
      }
    };
  }

  A.SIGIAN_VALUE_PRODUCTION_SCHEMA_VERSION = PRODUCTION_SCHEMA_VERSION;
  A.SIGIAN_HYBRID_PRODUCTION_EVALUATOR_ID = EVALUATOR_ID;

  A.certifySigianHybridProduction = function certifySigianHybridProduction(input = {}) {
    const cards = input.cards || [];
    const samples = input.samples || [];
    const evaluator = input.evaluator;
    if (!evaluator?.evaluate || !evaluator?.minimumLevel || !evaluator?.capForLevel) {
      return {
        schemaVersion:PRODUCTION_SCHEMA_VERSION,
        productionReady:false,
        evaluatorId:EVALUATOR_ID,
        blockers:["hybrid-evaluator-unavailable"]
      };
    }

    const mapping = canonicalMappingGate(cards);
    const oracle = oracleDatasetGate(input.oracleRows || [], samples);
    const stress = stressGate(evaluator);
    const anchors = anchorGate(samples, evaluator);
    const outliers = historicalOutlierGate();
    const constraints = constraintGate(samples, evaluator);
    const nativeRuntimeReady = !Array.isArray(A.SIGIAN_NATIVE_CARD_IDS) || (
      A.SIGIAN_NATIVE_CARD_IDS.length === 65
      && new Set(A.SIGIAN_NATIVE_CARD_IDS).size === 65
    );

    const blockers = [
      ...mapping.blockers,
      ...oracle.blockers,
      ...stress.blockers,
      ...anchors.blockers,
      ...(outliers.passed ? [] : ["historical-high-grade-anchors-unexplained"]),
      ...constraints.blockers,
      ...(nativeRuntimeReady ? [] : ["native-runtime-not-65-of-65"])
    ];

    return {
      schemaVersion:PRODUCTION_SCHEMA_VERSION,
      productionReady:blockers.length === 0,
      evaluatorId:EVALUATOR_ID,
      representation:"canonical-atomic-v2",
      calibrationTarget:"oracle75-gross-p75-65x6",
      blockers:[...new Set(blockers)],
      gates:{
        mapping:{
          passed:mapping.blockers.length === 0,
          cardCount:mapping.validation?.cardCount ?? null,
          mappedCount:mapping.validation?.mappedCount ?? null,
          componentErrors:clone(mapping.componentErrors)
        },
        oracle:clone(oracle),
        stress:stress.report ? {
          passed:stress.passed,
          total:stress.report.total,
          failed:stress.report.failed,
          cases:(stress.report.cases || []).map(item => ({
            id:item.id,
            passed:item.passed
          }))
        } : { passed:false },
        anchors:{
          passed:anchors.passed,
          metrics:clone(anchors.metrics)
        },
        historicalOutliers:clone(outliers),
        constraints:clone(constraints),
        nativeRuntime:{ passed:nativeRuntimeReady, nativeCount:Array.isArray(A.SIGIAN_NATIVE_CARD_IDS) ? A.SIGIAN_NATIVE_CARD_IDS.length : null }
      }
    };
  };
})(window.Arcane = window.Arcane || {});
