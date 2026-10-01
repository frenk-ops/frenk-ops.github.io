(function (A) {
  "use strict";
  const SCHEMA = 1;
  const clone = value => JSON.parse(JSON.stringify(value));
  A.exportSigianForgeStaticModel = function exportSigianForgeStaticModel(core) {
    if (!core?.certification?.productionReady) throw new Error("Modello non certificato: esportazione bloccata.");
    return clone({ schemaVersion:SCHEMA,
      calibration:{ oracleQuantile:core.candidate.oracleQuantile, sampleCount:core.samples.length,
        calibrationUnit:core.evaluator.calibrationUnit, evaluatorId:core.certification.evaluatorId },
      ridge:A.serializeSigianValueTargetRidge(core.candidate.fit.model),
      cap:core.candidate.capCandidate, certification:core.certification });
  };
  A.restoreSigianForgeStaticModel = function restoreSigianForgeStaticModel(input) {
    const data = clone(input);
    if (data?.schemaVersion !== SCHEMA || data.certification?.productionReady !== true
      || data.certification.schemaVersion !== A.SIGIAN_VALUE_PRODUCTION_SCHEMA_VERSION
      || data.certification.evaluatorId !== A.SIGIAN_HYBRID_PRODUCTION_EVALUATOR_ID
      || data.certification.representation !== "canonical-atomic-v2"
      || !Array.isArray(data.certification.blockers) || data.certification.blockers.length
      || !Number.isFinite(data.calibration?.calibrationUnit) || data.calibration.calibrationUnit < 0.05
      || !Number.isInteger(data.calibration?.sampleCount) || data.calibration.sampleCount < 2
      || !Number.isFinite(data.calibration?.oracleQuantile) || data.calibration.oracleQuantile < 0 || data.calibration.oracleQuantile > 1
      || typeof data.calibration.evaluatorId !== "string" || !data.calibration.evaluatorId
      || data.calibration.evaluatorId !== data.certification.evaluatorId) throw new Error("Modello statico Forgia incompatibile o non certificato.");
    const candidate = { oracleQuantile:data.calibration.oracleQuantile,
      fit:{ model:A.restoreSigianValueTargetRidge(data.ridge) }, capCandidate:A.restoreSigianCapCandidate(data.cap) };
    const evaluator = A.createSigianHybridArcaneValueEvaluator(candidate, { unit:data.calibration.calibrationUnit });
    return { candidate, evaluator, certification:data.certification, calibration:data.calibration };
  };
})(window.Arcane = window.Arcane || {});
