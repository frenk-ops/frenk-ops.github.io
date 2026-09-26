(function (A) {
  "use strict";

  const GRADE_WEIGHTS = Object.freeze({ 1:1, 2:2, 3:4, 4:8, 5:16 });
  const OP_TYPES = new Set(["assign", "reclaim", "fuse", "split", "dissolve", "replace"]);

  function clone(value) {
    if (typeof A.deepClone === "function") return A.deepClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function schoolOrder() {
    const explicit = A.SIGIAN_AFFINITY_SCHOOL_ORDER;
    if (Array.isArray(explicit) && explicit.length) return [...explicit];
    const registered = Array.isArray(A.SCHOOLS) ? A.SCHOOLS.map(item => item.id).filter(Boolean) : [];
    return registered.length ? registered : ["fire", "water", "air", "nature", "death"];
  }

  function normalizedSchools(affinity) {
    const order = schoolOrder();
    if (affinity?.mode === "universal") return order;
    const wanted = new Set((affinity?.schools || []).map(String));
    return order.filter(id => wanted.has(id));
  }

  function modeForSchools(schools) {
    const count = schools.length;
    const total = schoolOrder().length;
    if (count === total) return "universal";
    if (count === 3) return "triple";
    if (count === 2) return "dual";
    if (count === 1) return "mono";
    return null;
  }

  function normalizeAffinity(affinity) {
    const schools = normalizedSchools(affinity);
    const mode = modeForSchools(schools);
    if (!mode) return null;
    return {
      mode,
      schools,
      ...(affinity?.status ? { status:String(affinity.status) } : {})
    };
  }

  function sameSchools(left, right) {
    const a = normalizedSchools(left);
    const b = normalizedSchools(right);
    return a.length === b.length && a.every((id, index) => id === b[index]);
  }

  function componentDefinitionId(component) {
    return String(component?.definitionId || component?.canonicalDefinitionId || "");
  }

  function componentIdentityKey(component) {
    return [
      String(component?.kind || "sigil"),
      componentDefinitionId(component),
      String(component?.effectSchool || component?.school || "neutral")
    ].join(":");
  }

  function romanToNumber(value) {
    return ({ I:1, II:2, III:3, IV:4, V:5 })[value] || null;
  }

  function inferMaxGrade(component, explicitMaxGrade = null) {
    const requested = Number(explicitMaxGrade);
    if (Number.isInteger(requested) && requested > 0) return requested;

    const definitionId = componentDefinitionId(component);
    const definition = definitionId
      ? (A.getSigianCanonicalV2?.(definitionId) || A.getSigianContent?.(definitionId, component?.kind))
      : null;
    const grades = String(definition?.grades || component?.grades || "");
    if (!grades || /senza Gradi|speciale/i.test(grades)) return null;

    const matches = grades.match(/\b(?:I|II|III|IV|V)\b/g) || [];
    const values = matches.map(romanToNumber).filter(Boolean);
    return values.length ? Math.max(...values) : null;
  }

  function transactionOperation(input = {}, index = 0) {
    const type = String(input.type || "");
    if (!OP_TYPES.has(type)) throw new Error(`Operazione Forgia non supportata: ${type || "?"}.`);
    return {
      id:String(input.id || `forge-op-${index + 1}-${type}`),
      type,
      payload:clone(input.payload || {})
    };
  }

  A.SIGIAN_CRAFTING_GRADE_WEIGHTS = GRADE_WEIGHTS;

  A.sigianCraftingWeightForGrade = function sigianCraftingWeightForGrade(grade) {
    return GRADE_WEIGHTS[Math.trunc(Number(grade || 0))] || null;
  };

  A.normalizeSigianCraftAffinity = function normalizeSigianCraftAffinity(affinity) {
    const normalized = normalizeAffinity(affinity);
    return normalized ? clone(normalized) : null;
  };

  A.intersectSigianCraftAffinities = function intersectSigianCraftAffinities(left, right) {
    const a = normalizeAffinity(left);
    const b = normalizeAffinity(right);
    if (!a || !b) return null;
    const allowed = new Set(b.schools);
    const schools = a.schools.filter(id => allowed.has(id));
    const mode = modeForSchools(schools);
    return mode ? { mode, schools, status:"crafted" } : null;
  };

  A.evaluateSigianCraftAffinityFusion = function evaluateSigianCraftAffinityFusion(left, right) {
    const a = normalizeAffinity(left);
    const b = normalizeAffinity(right);
    const affinity = a && b ? A.intersectSigianCraftAffinities(a, b) : null;
    if (!a || !b || !affinity) {
      return {
        compatible:false,
        affinity:null,
        narrowed:false,
        inputA:a ? clone(a) : null,
        inputB:b ? clone(b) : null
      };
    }
    return {
      compatible:true,
      affinity:clone(affinity),
      narrowed:!sameSchools(a, affinity) || !sameSchools(b, affinity),
      inputA:clone(a),
      inputB:clone(b)
    };
  };

  A.planSigianVerticalFusion = function planSigianVerticalFusion(left, right, options = {}) {
    if (!left || !right) throw new Error("Fusione verticale: servono due componenti.");
    if (componentIdentityKey(left) !== componentIdentityKey(right)) {
      throw new Error("Fusione verticale: i componenti devono appartenere alla stessa identità canonica.");
    }

    const grade = Math.trunc(Number(left.grade || 0));
    const rightGrade = Math.trunc(Number(right.grade || 0));
    if (!grade || grade !== rightGrade) {
      throw new Error("Fusione verticale: i due componenti devono avere lo stesso Grado.");
    }

    const maxGrade = inferMaxGrade(left, options.maxGrade);
    if (!maxGrade || grade >= maxGrade) {
      throw new Error("Fusione verticale: non esiste un Grado successivo per questa famiglia.");
    }

    const affinity = A.evaluateSigianCraftAffinityFusion(left.affinity, right.affinity);
    if (!affinity.compatible) {
      throw new Error("Fusione verticale: le Affinità non hanno Scuole compatibili in comune.");
    }

    const output = {
      ...clone(left),
      grade:grade + 1,
      affinity:clone(affinity.affinity)
    };
    delete output.componentInstanceId;
    delete output.assignment;

    return {
      type:"vertical-fusion",
      inputs:[clone(left), clone(right)],
      output,
      affinityNarrowed:affinity.narrowed,
      baseWeight:A.sigianCraftingWeightForGrade(grade + 1)
    };
  };

  A.planSigianVerticalSplit = function planSigianVerticalSplit(component) {
    if (!component) throw new Error("Scomposizione verticale: componente mancante.");
    const grade = Math.trunc(Number(component.grade || 0));
    if (grade <= 1) throw new Error("Scomposizione verticale: il Grado I non può essere scomposto.");

    const affinity = normalizeAffinity(component.affinity);
    if (!affinity) throw new Error("Scomposizione verticale: Affinità non valida.");

    const lower = {
      ...clone(component),
      grade:grade - 1,
      affinity:clone(affinity)
    };
    delete lower.componentInstanceId;
    delete lower.assignment;

    return {
      type:"vertical-split",
      input:clone(component),
      outputs:[clone(lower), clone(lower)],
      baseWeight:A.sigianCraftingWeightForGrade(grade)
    };
  };

  A.createSigianForgeTransactionPlan = function createSigianForgeTransactionPlan(input = {}) {
    const operations = Array.isArray(input.operations)
      ? input.operations.map((operation, index) => transactionOperation(operation, index))
      : [];
    return {
      mode:"simulation",
      baselineRevision:input.baselineRevision == null ? null : String(input.baselineRevision),
      operations
    };
  };

  A.appendSigianForgeTransactionOperation = function appendSigianForgeTransactionOperation(plan, operation) {
    const current = A.createSigianForgeTransactionPlan(plan || {});
    const next = transactionOperation(operation, current.operations.length);
    if (current.operations.some(item => item.id === next.id)) {
      throw new Error(`Operazione Forgia duplicata: ${next.id}.`);
    }
    current.operations.push(next);
    return current;
  };

  A.getSigianForgeTransactionBinding = function getSigianForgeTransactionBinding(plan, kind, slotId) {
    const expectedKind = kind === "constraint" ? "constraint" : "sigil";
    const expectedSlot = String(slotId || "");
    const operation = (plan?.operations || []).find(item =>
      item.type === "assign"
      && item.payload?.kind === expectedKind
      && String(item.payload?.slotId || "") === expectedSlot
    );
    return operation ? clone(operation.payload) : null;
  };

  A.bindSigianForgeTransactionComponent = function bindSigianForgeTransactionComponent(plan, binding) {
    if (!binding?.componentInstanceId || !binding?.slotId) {
      throw new Error("Binding componente Forgia incompleto.");
    }
    const kind = binding.kind === "constraint" ? "constraint" : "sigil";
    const slotId = String(binding.slotId);
    const current = A.createSigianForgeTransactionPlan(plan || {});
    current.operations = current.operations.filter(item => !(
      item.type === "assign"
      && item.payload?.kind === kind
      && String(item.payload?.slotId || "") === slotId
    ));
    current.operations.push(transactionOperation({
      id:`bind:${kind}:${slotId}`,
      type:"assign",
      payload:{
        kind,
        slotId,
        componentInstanceId:String(binding.componentInstanceId),
        inventoryId:binding.inventoryId == null ? null : String(binding.inventoryId)
      }
    }, current.operations.length));
    return current;
  };

  A.unbindSigianForgeTransactionComponent = function unbindSigianForgeTransactionComponent(plan, kind, slotId) {
    const expectedKind = kind === "constraint" ? "constraint" : "sigil";
    const expectedSlot = String(slotId || "");
    const current = A.createSigianForgeTransactionPlan(plan || {});
    current.operations = current.operations.filter(item => {
      if (item.payload?.kind !== expectedKind) return true;
      if (item.type === "assign" && String(item.payload?.slotId || "") === expectedSlot) return false;
      if (item.type === "reclaim" && String(item.payload?.targetSlotId || "") === expectedSlot) return false;
      return true;
    });
    return current;
  };

  A.reclaimSigianForgeTransactionComponent = function reclaimSigianForgeTransactionComponent(plan, input = {}) {
    if (!input.componentInstanceId || !input.sourceFormulaInstanceId || !input.sourceSlotId || !input.targetSlotId) {
      throw new Error("Recupero componente Forgia incompleto.");
    }
    const kind = input.kind === "constraint" ? "constraint" : "sigil";
    let current = A.unbindSigianForgeTransactionComponent(plan, kind, input.targetSlotId);
    current.operations.push(transactionOperation({
      id:`reclaim:${kind}:${String(input.targetSlotId)}`,
      type:"reclaim",
      payload:{
        kind,
        componentInstanceId:String(input.componentInstanceId),
        inventoryId:input.inventoryId == null ? null : String(input.inventoryId),
        sourceFormulaInstanceId:String(input.sourceFormulaInstanceId),
        sourceSlotId:String(input.sourceSlotId),
        targetSlotId:String(input.targetSlotId)
      }
    }, current.operations.length));
    current = A.bindSigianForgeTransactionComponent(current, {
      kind,
      slotId:String(input.targetSlotId),
      componentInstanceId:String(input.componentInstanceId),
      inventoryId:input.inventoryId == null ? null : String(input.inventoryId)
    });
    return current;
  };

  A.listSigianForgeReclaimConsequences = function listSigianForgeReclaimConsequences(plan) {
    const formulas = new Map();
    (plan?.operations || []).forEach(operation => {
      if (operation.type !== "reclaim") return;
      const payload = operation.payload || {};
      const formulaInstanceId = String(payload.sourceFormulaInstanceId || "");
      if (!formulaInstanceId) return;
      if (!formulas.has(formulaInstanceId)) {
        formulas.set(formulaInstanceId, {
          formulaInstanceId,
          statusAfterCommit:"needs-reseal",
          componentInstanceIds:[]
        });
      }
      formulas.get(formulaInstanceId).componentInstanceIds.push(String(payload.componentInstanceId || ""));
    });
    return [...formulas.values()].map(clone);
  };
})(window.Arcane = window.Arcane || {});
