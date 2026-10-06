(function (A) {
  "use strict";
  const clone = value => JSON.parse(JSON.stringify(value));
  const fail = message => { throw new Error(`Sensitivity v2: ${message}`); };
  const numeric = value => typeof value === "number" && Number.isFinite(value);
  const leaves = new Set(["attack", "health", "life", "magnitude", "amount", "value", "damage", "heal",
    "duration", "ratio", "percentage", "percent", "threshold", "maxTriggers", "triggerCap", "intensity"]);
  function at(object, path) {
    return path.reduce((value, key) => value && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined, object);
  }
  function put(object, path, value) {
    let parent = object;
    for (const key of path.slice(0, -1)) parent = parent[key];
    parent[path.at(-1)] = value;
  }
  function parameters(formula, declarations) {
    if (!Array.isArray(declarations) || !declarations.length) fail("explicit authorized parameters required");
    const seen = new Set();
    return declarations.map(item => {
      const path = item.path;
      if (item.authorized !== true || !Array.isArray(path) || path.length < 2
        || path.some(key => !(typeof key === "string" || Number.isSafeInteger(key))
          || ["__proto__", "constructor", "prototype"].includes(key))
        || !["stats", "body", "sigils", "constraint"].includes(path[0])
        || !leaves.has(path.at(-1))) fail("unauthorized numeric path");
      const id = JSON.stringify(path);
      if (seen.has(id)) fail("duplicate parameter path");
      seen.add(id);
      const originalValue = at(formula, path);
      if (!numeric(originalValue)) fail("parameter must already be a finite number");
      let values = item.values;
      if (!values && item.range) {
        const {min, max, step} = item.range;
        if (![min, max, step].every(numeric) || min > max || step <= 0) fail("invalid tested range");
        const count = (max - min) / step;
        if (Math.abs(count - Math.round(count)) > 1e-8 || count > 10000) fail("range must be a bounded declared grid");
        values = Array.from({length:Math.round(count) + 1}, (_, index) => Number((min + index * step).toPrecision(15)));
      }
      if (!Array.isArray(values) || !values.length || values.length > 10001 || !values.every(numeric)) fail("invalid parameter values");
      values = [...new Set(values)].sort((a,b) => a-b);
      if (!values.includes(originalValue)) fail("tested domain must include original value");
      return {parameter:item.parameter || path.join("."), path:clone(path), originalValue, testedRange:values};
    });
  }
  const distance = (target, interval) => Math.max(interval.minLevel - target, target - interval.maxLevel, 0);
  A.runSigianFormulaSensitivityV2 = function runSigianFormulaSensitivityV2(options = {}) {
    if (!options.formula || typeof options.evaluateFormula !== "function") fail("Formula and canonical evaluator adapter required");
    const formula = clone(options.formula);
    const targetCost = options.targetCost;
    if (!Number.isSafeInteger(targetCost) || targetCost < 1) fail("invalid target cost");
    const knobs = parameters(formula, options.parameters);
    const maxCases = options.maxCases ?? 5000;
    if (!Number.isSafeInteger(maxCases) || maxCases < 1 || maxCases > 100000) fail("invalid case budget");
    const totalCases = knobs.reduce((count, item) => count * item.testedRange.length, 1);
    if (!Number.isSafeInteger(totalCases)) fail("declared domain too large");
    const caseOffset=options.caseOffset??0;
    if(!Number.isSafeInteger(caseOffset)||caseOffset<0||caseOffset>=totalCases) fail("invalid case offset");
    if(caseOffset>0&&(typeof options.expectedDomainSignature!=="string"||!options.expectedDomainSignature.length))
      fail("continuation domain signature required");
    if(caseOffset>0&&options.evaluationIdentity===undefined) fail("explicit evaluator identity required for continuation");
    if(options.evaluationIdentity!==undefined&&(typeof options.evaluationIdentity!=="string"||!options.evaluationIdentity.length))
      fail("invalid evaluator identity");
    const domainSignature=JSON.stringify({version:1,formula,targetCost,parameters:knobs,
      evaluationIdentity:options.evaluationIdentity??null});
    if(options.expectedDomainSignature!==undefined&&options.expectedDomainSignature!==domainSignature)
      fail("continuation domain or evaluator identity changed");
    const endIndexExclusive=Math.min(totalCases,caseOffset+maxCases);
    const scanWindow={startIndex:caseOffset,endIndexExclusive,
      nextOffset:endIndexExclusive<totalCases?endIndexExclusive:null,
      firstWindow:caseOffset===0,lastWindow:endIndexExclusive===totalCases,domainSignature};
    const signature = value => {
      const masked = clone(value);
      knobs.forEach(item => put(masked, item.path, "AUTHORIZED_NUMERIC_PARAMETER"));
      return JSON.stringify(masked);
    };
    const identity = signature(formula);
    function evaluate(candidate, values) {
      if (signature(candidate) !== identity) fail("semantic change detected");
      const before = JSON.stringify(candidate);
      const result = options.evaluateFormula(candidate);
      if (JSON.stringify(candidate) !== before) fail("evaluator mutated Formula");
      if (!result || !numeric(result.arcaneValue) || result.arcaneValue < 0) fail("invalid Arcane Value; Oracle Units are not AV");
      const stability = result.stability || A.evaluateSigianCapV2PredictionStability(result.arcaneValue, options.predictors);
      if (!Number.isSafeInteger(stability.minLevel) || !Number.isSafeInteger(stability.maxLevel)
        || stability.minLevel < 1 || stability.maxLevel < stability.minLevel
        || !numeric(stability.consensusShare) || stability.consensusShare < 0 || stability.consensusShare > 1) fail("invalid cost stability");
      const changes = knobs.map((item,index) => ({parameter:item.parameter,originalValue:item.originalValue,value:values[index]}))
        .filter(item => item.value !== item.originalValue);
      const normalizedChange = knobs.reduce((sum,item,index) => sum + Math.abs(values[index]-item.originalValue)
        / Math.max(1e-12,item.testedRange.at(-1)-item.testedRange[0]), 0);
      return {values:clone(values), changes, normalizedChange, predictedAV:result.arcaneValue,
        centralCost:stability.consensusLevel ?? null,
        predictedCostRange:clone(stability), distanceFromTarget:distance(targetCost,stability), semanticChange:false,
        coverageComplete:result.coverageComplete === true,
        contributions:clone(result.contributions || {}), temporalEvidence:clone(result.temporalEvidence || [])};
    }
    const originals = knobs.map(item => item.originalValue);
    const baseline = evaluate(clone(formula), originals);
    const rows = [];
    // Mixed-radix enumeration is deterministic and explores coupled parameters.
    for (let index=caseOffset; index<endIndexExclusive; index+=1) {
      let cursor=index;
      const values=knobs.map(item => {const value=item.testedRange[cursor % item.testedRange.length];cursor=Math.floor(cursor/item.testedRange.length);return value;});
      const candidate=clone(formula);
      knobs.forEach((item,j) => put(candidate,item.path,values[j]));
      rows.push(evaluate(candidate,values));
    }
    const complete = scanWindow.firstWindow&&scanWindow.lastWindow && baseline.coverageComplete && rows.every(row=>row.coverageComplete);
    const minLevel=rows.reduce((min,row)=>Math.min(min,row.predictedCostRange.minLevel),Infinity);
    const maxLevel=rows.reduce((max,row)=>Math.max(max,row.predictedCostRange.maxLevel),0);
    const reaching=rows.filter(row=>row.distanceFromTarget === 0)
      .sort((a,b)=>a.changes.length-b.changes.length || a.normalizedChange-b.normalizedChange
        || a.values.reduce((order,value,index)=>order || value-b.values[index],0));
    const evidence={complete,knobsTested:knobs.length,reachableMinLevel:minLevel,reachableMaxLevel:maxLevel,
      reachableIntervals:rows.map(row=>({minLevel:row.predictedCostRange.minLevel,maxLevel:row.predictedCostRange.maxLevel})),
      requiresSemanticChange:false,note:"Exhaustive only within the explicitly authorized discrete domain and evaluator coverage."};
    const classification=A.classifySigianFormulaAlignmentV2({targetCost,stability:baseline.predictedCostRange,sensitivity:evidence});
    if (!baseline.coverageComplete) {
      classification.status="PENDING_SENSITIVITY"; classification.final=false;
      classification.reason="Evaluator coverage is incomplete; no final design verdict.";
    }
    return {schemaVersion:1,status:"diagnostic-only",targetDesignCost:targetCost,baseline,parameters:knobs,
      totalCases,testedCases:rows.length,scanWindow,complete,rows,sensitivity:evidence,classification,
      smallestChangeReachingTarget:reaching[0] || null,
      scope:"declared domain only; no mechanism changes, no Formula mutation, no production promotion"};
  };
})(window.Arcane = window.Arcane || {});
