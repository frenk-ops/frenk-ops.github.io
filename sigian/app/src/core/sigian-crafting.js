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

  const HORIZONTAL_RECIPES = Object.freeze([
    Object.freeze({
      id:"H001-fixed",
      leftDefinitionId:"v2-wave",
      rightDefinitionId:"v2-damage-hero",
      outputDefinitionId:"v2-tide",
      scaling:"fixed",
      schoolBound:false
    }),
    Object.freeze({
      id:"H001-power-minor",
      leftDefinitionId:"v2-wave-power-minor",
      rightDefinitionId:"v2-damage-power-minor-hero",
      outputDefinitionId:"v2-tide-power-minor",
      scaling:"power-minor",
      schoolBound:true
    }),
    Object.freeze({
      id:"H001-power",
      leftDefinitionId:"v2-wave-power",
      rightDefinitionId:"v2-damage-power-hero",
      outputDefinitionId:"v2-tide-power",
      scaling:"power",
      schoolBound:true
    }),
    Object.freeze({
      id:"H001-power-major",
      leftDefinitionId:"v2-wave-power-major",
      rightDefinitionId:"v2-damage-power-major-hero",
      outputDefinitionId:"v2-tide-power-major",
      scaling:"power-major",
      schoolBound:true
    })
  ]);

  function horizontalRecipeForInputs(left, right) {
    const leftId = componentDefinitionId(left);
    const rightId = componentDefinitionId(right);
    return HORIZONTAL_RECIPES.find(recipe =>
      (recipe.leftDefinitionId === leftId && recipe.rightDefinitionId === rightId)
      || (recipe.leftDefinitionId === rightId && recipe.rightDefinitionId === leftId)
    ) || null;
  }

  function horizontalRecipeForOutput(component) {
    const outputId = componentDefinitionId(component);
    return HORIZONTAL_RECIPES.find(recipe => recipe.outputDefinitionId === outputId) || null;
  }

  function normalizeHorizontalSemantics(value, expectedScaling) {
    if (!value || typeof value !== "object") return null;
    const magnitude = Number(value.magnitude);
    const timing = String(value.timing || "").trim();
    const scaling = String(value.scaling || "").trim();
    if (!Number.isFinite(magnitude) || !timing || !scaling) return null;
    if (expectedScaling && scaling !== expectedScaling) return null;
    return {
      magnitude,
      timing,
      scaling
    };
  }

  function sameHorizontalSemantics(left, right) {
    return Boolean(left && right
      && Number(left.magnitude) === Number(right.magnitude)
      && left.timing === right.timing
      && left.scaling === right.scaling);
  }

  function canonicalHorizontalOutput(component, recipe, affinity) {
    const output = {
      ...clone(component),
      definitionId:recipe.outputDefinitionId,
      canonicalDefinitionId:recipe.outputDefinitionId,
      affinity:clone(affinity)
    };
    delete output.componentInstanceId;
    delete output.assignment;
    return output;
  }

  function canonicalHorizontalSplitOutput(component, definitionId, affinity) {
    const output = {
      ...clone(component),
      definitionId,
      canonicalDefinitionId:definitionId,
      affinity:clone(affinity)
    };
    delete output.componentInstanceId;
    delete output.assignment;
    return output;
  }

  A.SIGIAN_HORIZONTAL_CRAFTING_RECIPES = HORIZONTAL_RECIPES.map(clone);

  A.getSigianHorizontalCraftingRecipeForInputs = function getSigianHorizontalCraftingRecipeForInputs(left, right) {
    const recipe = horizontalRecipeForInputs(left, right);
    return recipe ? clone(recipe) : null;
  };

  A.getSigianHorizontalCraftingRecipeForOutput = function getSigianHorizontalCraftingRecipeForOutput(component) {
    const recipe = horizontalRecipeForOutput(component);
    return recipe ? clone(recipe) : null;
  };

  A.planSigianHorizontalFusion = function planSigianHorizontalFusion(left, right, options = {}) {
    if (!left || !right) throw new Error("Fusione orizzontale: servono due componenti.");
    if (left.kind !== "sigil" || right.kind !== "sigil") {
      throw new Error("Fusione orizzontale: H001 è definita solo per Sigilli.");
    }

    const recipe = horizontalRecipeForInputs(left, right);
    if (!recipe) throw new Error("Fusione orizzontale: combinazione non presente nel catalogo H001.");

    const leftGrade = Math.trunc(Number(left.grade || 0));
    const rightGrade = Math.trunc(Number(right.grade || 0));
    if (!leftGrade || leftGrade !== rightGrade) {
      throw new Error("Fusione orizzontale: i Gradi devono coincidere.");
    }

    const leftSchool = String(left.effectSchool || left.school || "neutral");
    const rightSchool = String(right.effectSchool || right.school || "neutral");
    if (recipe.schoolBound && leftSchool !== rightSchool) {
      throw new Error("Fusione orizzontale: la Scuola deve coincidere.");
    }
    if (!recipe.schoolBound && (leftSchool !== "neutral" || rightSchool !== "neutral")) {
      throw new Error("Fusione orizzontale: la forma fissa H001 non accetta una Scuola effetto.");
    }

    const leftSemantics = normalizeHorizontalSemantics(options.leftSemantics, recipe.scaling);
    const rightSemantics = normalizeHorizontalSemantics(options.rightSemantics, recipe.scaling);
    if (!sameHorizontalSemantics(leftSemantics, rightSemantics)) {
      throw new Error("Fusione orizzontale: magnitudine, timing e scaling devono coincidere esattamente.");
    }

    const affinity = A.evaluateSigianCraftAffinityFusion(left.affinity, right.affinity);
    if (!affinity.compatible) {
      throw new Error("Fusione orizzontale: le Affinità non hanno Scuole compatibili in comune.");
    }

    const template = recipe.leftDefinitionId === componentDefinitionId(left) ? left : right;
    const output = canonicalHorizontalOutput(template, recipe, affinity.affinity);
    output.grade = leftGrade;
    output.effectSchool = recipe.schoolBound ? leftSchool : null;

    return {
      type:"horizontal-fusion",
      recipeId:recipe.id,
      inputs:[clone(left), clone(right)],
      output,
      semantics:clone(leftSemantics),
      affinityNarrowed:affinity.narrowed
    };
  };

  A.planSigianHorizontalSplit = function planSigianHorizontalSplit(component, options = {}) {
    if (!component) throw new Error("Scomposizione orizzontale: componente mancante.");
    if (component.kind !== "sigil") throw new Error("Scomposizione orizzontale: H001 è definita solo per Sigilli.");

    const recipe = horizontalRecipeForOutput(component);
    if (!recipe) throw new Error("Scomposizione orizzontale: il Sigillo non è un output H001.");

    const grade = Math.trunc(Number(component.grade || 0));
    if (!grade) throw new Error("Scomposizione orizzontale: Grado non valido.");
    const effectSchool = String(component.effectSchool || component.school || "neutral");
    if (recipe.schoolBound && effectSchool === "neutral") {
      throw new Error("Scomposizione orizzontale: la forma Potere richiede una Scuola.");
    }
    if (!recipe.schoolBound && effectSchool !== "neutral") {
      throw new Error("Scomposizione orizzontale: la forma fissa non usa una Scuola effetto.");
    }

    const semantics = normalizeHorizontalSemantics(options.semantics, recipe.scaling);
    if (!semantics) {
      throw new Error("Scomposizione orizzontale: firma meccanica risolta mancante o incompatibile.");
    }
    const affinity = normalizeAffinity(component.affinity);
    if (!affinity) throw new Error("Scomposizione orizzontale: Affinità non valida.");

    const left = canonicalHorizontalSplitOutput(component, recipe.leftDefinitionId, affinity);
    const right = canonicalHorizontalSplitOutput(component, recipe.rightDefinitionId, affinity);
    left.grade = grade;
    right.grade = grade;
    left.effectSchool = recipe.schoolBound ? effectSchool : null;
    right.effectSchool = recipe.schoolBound ? effectSchool : null;

    return {
      type:"horizontal-split",
      recipeId:recipe.id,
      input:clone(component),
      outputs:[left, right],
      semantics:clone(semantics)
    };
  };

  A.createSigianForgeTransactionPlan = function createSigianForgeTransactionPlan(input = {}) {
    const operations = Array.isArray(input.operations)
      ? input.operations.map((operation, index) => transactionOperation(operation, index))
      : [];
    return {
      mode:"simulation",
      baselineRevision:input.baselineRevision == null ? null : String(input.baselineRevision),
      formulaBaselineRevision:input.formulaBaselineRevision == null ? null : String(input.formulaBaselineRevision),
      compositionBaselineRevision:input.compositionBaselineRevision == null ? null : String(input.compositionBaselineRevision),
      nextVirtualSequence:Math.max(1, Math.trunc(Number(input.nextVirtualSequence || 1))),
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

  A.reclaimSigianForgeTransactionComponentForCrafting = function reclaimSigianForgeTransactionComponentForCrafting(plan, input = {}) {
    if (!input.componentInstanceId || !input.sourceFormulaInstanceId || !input.sourceSlotId) {
      throw new Error("Recupero crafting componente Forgia incompleto.");
    }
    const kind = input.kind === "constraint" ? "constraint" : "sigil";
    const componentInstanceId = String(input.componentInstanceId);
    const current = A.createSigianForgeTransactionPlan(plan || {});
    if (current.operations.some(operation =>
      operation.type === "reclaim"
      && String(operation.payload?.componentInstanceId || "") === componentInstanceId
    )) {
      return current;
    }
    current.operations.push(transactionOperation({
      id:`reclaim:craft:${componentInstanceId}`,
      type:"reclaim",
      payload:{
        kind,
        componentInstanceId,
        inventoryId:input.inventoryId == null ? null : String(input.inventoryId),
        sourceFormulaInstanceId:String(input.sourceFormulaInstanceId),
        sourceSlotId:String(input.sourceSlotId),
        targetSlotId:`craft:${componentInstanceId}`,
        craftingOnly:true
      }
    }, current.operations.length));
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
          statusAfterCommit:"NEEDS_RESEAL",
          componentInstanceIds:[]
        });
      }
      formulas.get(formulaInstanceId).componentInstanceIds.push(String(payload.componentInstanceId || ""));
    });
    return [...formulas.values()].map(clone);
  };
})(window.Arcane = window.Arcane || {});
