(function (A) {
  "use strict";

  const FORGE_DRAFT_SCHEMA_VERSION = 3;
  const FORGE_DRAFT_STORAGE_KEY = "sigian.forge.draft.v1";
  const MAX_HISTORY = 50;

  function clone(value) {
    if (typeof A.deepClone === "function") return A.deepClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function memoryStorage() {
    const values = {};
    return {
      getItem(key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
      setItem(key, value) { values[key] = String(value); },
      removeItem(key) { delete values[key]; }
    };
  }

  function resolveStorage(storage) {
    if (storage) return storage;
    try {
      if (A.getStorage) return A.getStorage();
      const candidate = window.localStorage;
      const key = "__sigian_forge_storage_test__";
      candidate.setItem(key, "1");
      candidate.removeItem(key);
      return candidate;
    } catch {
      if (!A.__sigianForgeMemoryStorage) A.__sigianForgeMemoryStorage = memoryStorage();
      return A.__sigianForgeMemoryStorage;
    }
  }

  function normalizeId(value, fallback) {
    const id = String(value || "").trim();
    return id || fallback;
  }

  function createDraftId() {
    return `formula-${Date.now().toString(36)}`;
  }

  function defaultValueForSchema(schema, school) {
    if (Array.isArray(schema)) return schema.length ? clone(schema[0]) : null;
    if (schema === "school") return school;
    if (schema === "schools") return [school];
    if (schema === "number") return null;
    return null;
  }

  function defaultConfigForSigil(definition, school) {
    const config = {};
    Object.entries(definition?.configSchema || {}).forEach(([key, schema]) => {
      const value = defaultValueForSchema(schema, school);
      if (value !== null && value !== undefined) config[key] = value;
    });
    return config;
  }

  function defaultForgeSigil(sigilId, school, slotIndex = 0) {
    const definition = A.getCanonicalSigil?.(sigilId);
    if (!definition) throw new Error(`Sigillo non registrato: ${sigilId}.`);
    if (definition.status !== "active") throw new Error(`Sigillo non attivo: ${sigilId}.`);
    const modifiers = (definition.requiredModifierFamilies || []).flatMap(family => {
      const modifierId = (definition.modifierOptions?.[family] || []).find(id => A.getSigianAdvancedModifier?.(id)?.status === "active");
      return modifierId ? [{ id:modifierId, params:defaultModifierParams(modifierId, school) }] : [];
    });
    return {
      slotId: `forge-${slotIndex + 1}-${sigilId}`,
      sigilId,
      grade: 1,
      affinity: A.normalizeSigianAffinity?.({ mode:"mono", schools:[school] }, school) || { mode:"mono", schools:[school] },
      config: defaultConfigForSigil(definition, school),
      modifiers
    };
  }

  function constraintGradeDefaults(definitionId, grade) {
    const g = Math.max(1, Math.min(5, Math.trunc(Number(grade || 1))));
    const fixedBandStart = ({ 1:1, 2:4, 3:7, 4:11, 5:16 })[g];
    const limitBandStart = ({ 1:16, 2:11, 3:7, 4:4, 5:1 })[g];
    if (definitionId === "v2-constraint-erosion-school"
      || definitionId === "v2-constraint-tribute-school"
      || definitionId === "v2-constraint-tribute-all") {
      return { grade:g, intensity:g };
    }
    if (definitionId === "v2-constraint-threshold-school"
      || definitionId === "v2-constraint-friendly-fire-limit") {
      return { grade:g, threshold:fixedBandStart };
    }
    if (definitionId === "v2-constraint-limit-school") {
      return { grade:g, threshold:limitBandStart };
    }
    if (definitionId === "v2-constraint-backlash"
      || definitionId === "v2-constraint-weakness-school"
      || definitionId === "v2-constraint-overpower-school") {
      return { grade:g, damage:fixedBandStart };
    }
    if (definitionId === "v2-constraint-scarcity-school") {
      return { grade:g, threshold:fixedBandStart, damage:fixedBandStart };
    }
    return { grade:g };
  }

  function constraintBandValues(definitionId, grade) {
    const g = Math.max(1, Math.min(5, Math.trunc(Number(grade || 1))));
    const fixed = {
      1:[1,2,3],
      2:[4,5,6],
      3:[7,8,9,10],
      4:[11,12,13,14,15],
      5:[16,17,18,19,20]
    };
    const limit = {
      1:[16,17,18,19,20],
      2:[11,12,13,14,15],
      3:[7,8,9,10],
      4:[4,5,6],
      5:[1,2,3]
    };
    if (definitionId === "v2-constraint-limit-school") return limit[g];
    return fixed[g];
  }

  function constraintParameterSpecs(constraint) {
    if (!constraint?.definitionId) return [];
    const id = constraint.definitionId;
    const grade = Math.max(1, Math.min(5, Math.trunc(Number(constraint.grade || 1))));
    if (id === "v2-constraint-erosion-school"
      || id === "v2-constraint-tribute-school"
      || id === "v2-constraint-tribute-all") {
      return [{
        key:"intensity",
        values:[1,2,3,4,5],
        value:Number(constraint.intensity || grade),
        drivesGrade:true
      }];
    }
    if (id === "v2-constraint-threshold-school"
      || id === "v2-constraint-limit-school"
      || id === "v2-constraint-friendly-fire-limit") {
      return [{
        key:"threshold",
        values:constraintBandValues(id, grade),
        value:Number(constraint.threshold)
      }];
    }
    if (id === "v2-constraint-backlash"
      || id === "v2-constraint-weakness-school"
      || id === "v2-constraint-overpower-school") {
      return [{
        key:"damage",
        values:constraintBandValues(id, grade),
        value:Number(constraint.damage)
      }];
    }
    if (id === "v2-constraint-scarcity-school") {
      const values = constraintBandValues(id, grade);
      return [
        { key:"threshold", values, value:Number(constraint.threshold) },
        { key:"damage", values, value:Number(constraint.damage) }
      ];
    }
    return [];
  }

  function defaultForgeConstraint(definitionId, school) {
    const definition = A.getSigianCanonicalV2?.(definitionId);
    if (!definition || definition.kind !== "constraint" || definition.status !== "approved") {
      throw new Error(`Vincolo non disponibile: ${definitionId}.`);
    }

    const schoolBound = /<Scuola>/i.test(String(definition.name || ""));
    const gradeLess = /senza Gradi/i.test(String(definition.grades || ""));
    const constraint = {
      definitionId,
      grade: gradeLess ? null : 1,
      school: schoolBound ? school : null,
      intensity: null,
      threshold: null,
      damage: null,
      percent: null,
      multiplier: null,
      affinity: null,
      detail: String(definition.summary || "")
    };

    if (definitionId === "v2-constraint-erosion-school"
      || definitionId === "v2-constraint-tribute-school"
      || definitionId === "v2-constraint-tribute-all") {
      constraint.intensity = 1;
    }
    if (definitionId === "v2-constraint-threshold-school"
      || definitionId === "v2-constraint-friendly-fire-limit") {
      constraint.threshold = 1;
    }
    if (definitionId === "v2-constraint-limit-school") {
      constraint.threshold = 16;
    }
    if (definitionId === "v2-constraint-backlash"
      || definitionId === "v2-constraint-weakness-school"
      || definitionId === "v2-constraint-overpower-school") {
      constraint.damage = 1;
    }
    if (definitionId === "v2-constraint-scarcity-school") {
      constraint.threshold = 1;
      constraint.damage = 1;
    }
    return constraint;
  }

  function defaultForgeCollectibleSigil(collectibleId, school, slotIndex = 0) {
    const collectible = A.getSigianCollectibleSigil?.(collectibleId);
    if (!collectible) throw new Error(`Sigillo collezionabile non registrato: ${collectibleId}.`);
    return A.createRecipeSigilFromCollectible(collectibleId, {
      formulaSchool:school,
      slotId:`forge-${slotIndex + 1}-${collectibleId}`
    });
  }

  function defaultModifierParams(modifierId, school) {
    const definition = A.getSigianAdvancedModifier?.(modifierId);
    const params = {};
    Object.entries(definition?.paramsSchema || {}).forEach(([key, schema]) => {
      const value = defaultValueForSchema(schema, school);
      if (value !== null && value !== undefined) params[key] = value;
    });

    if (modifierId === "activation-power-threshold") {
      params.side = params.side || "self";
      params.op = params.op || "gte";
      params.value = 6;
    }
    if (modifierId === "activation-power-comparison") {
      params.leftSide = params.leftSide || "self";
      params.rightSide = params.rightSide || "enemy";
      params.op = params.op || "lt";
    }
    if (modifierId === "constraint-friendly-fire-power-threshold") {
      params.op = params.op || "lt";
      params.value = 12;
    }
    if (modifierId === "scale-damage-dealt") {
      params.numerator = 1;
      params.denominator = 2;
    }
    return params;
  }

  function sameForgeValue(left, right) {
    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
      return left.every((value, index) => sameForgeValue(value, right[index]));
    }
    if (left && right && typeof left === "object" && typeof right === "object") {
      const leftKeys = Object.keys(left).sort();
      const rightKeys = Object.keys(right).sort();
      if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) return false;
      return leftKeys.every(key => sameForgeValue(left[key], right[key]));
    }
    return String(left ?? "") === String(right ?? "");
  }

  function inferCollectibleForLegacySigil(sigil) {
    if (!sigil?.sigilId || sigil.collectibleId) return null;
    const grade = Math.max(1, Math.trunc(Number(sigil.grade || 1)));
    const modifierIds = new Set((sigil.modifiers || []).map(item => item?.id).filter(Boolean));
    const candidates = (A.listSigianCollectibleSigils?.({ status:"active" }) || [])
      .filter(entry => entry.baseSigilId === sigil.sigilId && Number(entry.grade || 1) === grade)
      .filter(entry => Object.entries(entry.presetConfig || {}).every(([key, value]) => sameForgeValue(sigil.config?.[key], value)))
      .filter(entry => (entry.fixedModifiers || []).every(modifier => modifierIds.has(modifier.id)))
      .map(entry => ({
        entry,
        score:Object.keys(entry.presetConfig || {}).length * 10 + (entry.fixedModifiers || []).length * 6
      }))
      .sort((left, right) => right.score - left.score || left.entry.id.localeCompare(right.entry.id));
    return candidates[0]?.entry || null;
  }

  function migrateLegacyForgeSigils(sigils, school) {
    return (Array.isArray(sigils) ? sigils : []).map((sigil, index) => {
      if (!sigil || sigil.collectibleId) return clone(sigil);
      const collectible = inferCollectibleForLegacySigil(sigil);
      if (!collectible) return clone(sigil);
      return {
        ...clone(sigil),
        slotId:String(sigil.slotId || `forge-${index + 1}-${collectible.id}`),
        collectibleId:collectible.id,
        sigilId:collectible.baseSigilId,
        grade:collectible.grade,
        intensity:sigil.intensity == null ? collectible.defaultIntensity : sigil.intensity,
        affinity:sigil.affinity || (
          A.normalizeSigianAffinity?.({ mode:"mono", schools:[school] }, school)
          || { mode:"mono", schools:[school] }
        )
      };
    });
  }

  function normalizeRecipe(input = {}) {
    const id = normalizeId(input.id, createDraftId());
    const school = normalizeId(input.school, A.listSigianSchools?.({ status: "active" })?.[0]?.id || "fire");
    const type = input.type === "spell" ? "spell" : "creature";
    const recipe = A.createFormulaRecipe({
      ...input,
      id,
      school,
      type,
      sigils:migrateLegacyForgeSigils(input.sigils, school),
      stats: type === "creature"
        ? {
            attack: Math.max(0, Math.trunc(Number(input.stats?.attack ?? 1))),
            health: Math.max(1, Math.trunc(Number(input.stats?.health ?? 5)))
          }
        : {},
      presentation: {
        name: String(input.presentation?.name || "Nuova Formula"),
        text: String(input.presentation?.text || ""),
        keyword: String(input.presentation?.keyword || ""),
        art: String(input.presentation?.art || ""),
        imageKey: input.presentation?.imageKey ?? null
      }
    });
    return recipe;
  }

  function normalizeDraft(input = {}) {
    const recipe = normalizeRecipe(input.recipe || input);
    const transaction = typeof A.createSigianForgeTransactionPlan === "function"
      ? A.createSigianForgeTransactionPlan(input.transaction || {})
      : {
          mode:"simulation",
          baselineRevision:input.transaction?.baselineRevision == null ? null : String(input.transaction.baselineRevision),
          formulaBaselineRevision:input.transaction?.formulaBaselineRevision == null ? null : String(input.transaction.formulaBaselineRevision),
          compositionBaselineRevision:input.transaction?.compositionBaselineRevision == null ? null : String(input.transaction.compositionBaselineRevision),
          nextVirtualSequence:Math.max(1, Math.trunc(Number(input.transaction?.nextVirtualSequence || 1))),
          operations:Array.isArray(input.transaction?.operations) ? clone(input.transaction.operations) : []
        };
    return {
      schemaVersion: FORGE_DRAFT_SCHEMA_VERSION,
      id: normalizeId(input.id, recipe.id),
      status: "draft",
      revision: Math.max(0, Math.trunc(Number(input.revision || 0))),
      recipe,
      transaction,
      createdAt: String(input.createdAt || new Date().toISOString()),
      updatedAt: String(input.updatedAt || new Date().toISOString())
    };
  }

  function fixedH001Role(collectibleId) {
    const templateId = A.getSigianCollectibleSigil?.(collectibleId)?.templateId || "";
    if (templateId === "wave-field") return "wave";
    if (templateId === "damage-hero") return "damage";
    if (templateId === "wave-front") return "tide";
    return null;
  }

  function fixedH001Semantics(sigil) {
    const role = fixedH001Role(sigil?.collectibleId);
    if (!role) return null;
    const magnitude = Number(sigil?.intensity);
    const timing = String(sigil?.config?.when || "onDeploy");
    if (!Number.isFinite(magnitude) || !timing) return null;
    return {
      magnitude,
      timing,
      scaling:"fixed"
    };
  }

  function fixedH001TargetCollectibleId(grade) {
    const id = `wave-front-g${Math.trunc(Number(grade || 0))}`;
    return A.getSigianCollectibleSigil?.(id) ? id : null;
  }

  function fixedH001InputCollectibleIds(grade) {
    const suffix = `g${Math.trunc(Number(grade || 0))}`;
    const wave = `wave-field-${suffix}`;
    const damage = `damage-hero-${suffix}`;
    if (!A.getSigianCollectibleSigil?.(wave) || !A.getSigianCollectibleSigil?.(damage)) return null;
    return { wave, damage };
  }

  function sameFixedH001Semantics(left, right) {
    const a = fixedH001Semantics(left);
    const b = fixedH001Semantics(right);
    return Boolean(a && b
      && a.magnitude === b.magnitude
      && a.timing === b.timing
      && a.scaling === b.scaling);
  }

  function fixedH001FusionPairs(recipe) {
    const sigils = recipe?.sigils || [];
    const pairs = [];
    for (let leftIndex = 0; leftIndex < sigils.length - 1; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < sigils.length; rightIndex += 1) {
        const left = sigils[leftIndex];
        const right = sigils[rightIndex];
        const roles = new Set([fixedH001Role(left.collectibleId), fixedH001Role(right.collectibleId)]);
        if (!roles.has("wave") || !roles.has("damage") || roles.size !== 2) continue;
        if (Math.trunc(Number(left.grade || 0)) !== Math.trunc(Number(right.grade || 0))) continue;
        if (!sameFixedH001Semantics(left, right)) continue;
        const targetCollectibleId = fixedH001TargetCollectibleId(left.grade);
        if (!targetCollectibleId) continue;
        pairs.push({
          left:clone(left),
          right:clone(right),
          targetCollectibleId,
          semantics:fixedH001Semantics(left)
        });
      }
    }
    return pairs;
  }

  function sealTargetFormulaInstanceId(draft) {
    const raw = String(draft?.id || draft?.recipe?.id || "").trim();
    if (!raw) return "";
    return raw.startsWith("formula:") ? raw : `formula:${raw}`;
  }

  function draftAnalysis(draft) {
    const validation = A.validateFormulaRecipe(draft.recipe);
    const structuralReasons = [];
    if (!validation.valid) structuralReasons.push("recipe-invalid");
    if (draft.recipe.type === "spell" && draft.recipe.sigils.length === 0) structuralReasons.push("spell-requires-sigil");

    const collectibleFamilyCounts = new Map();
    draft.recipe.sigils.filter(item => item.collectibleId).forEach(sigil => {
      const collectible = A.getSigianCollectibleSigil?.(sigil.collectibleId);
      const familyKey = collectible?.templateId ? String(collectible.templateId) : null;
      if (!familyKey) return;
      collectibleFamilyCounts.set(familyKey, (collectibleFamilyCounts.get(familyKey) || 0) + 1);
    });
    if ([...collectibleFamilyCounts.values()].some(count => count > 1)) {
      structuralReasons.push("same-family-redundancy");
    }
    if (fixedH001FusionPairs(draft.recipe).length) {
      structuralReasons.push("horizontal-redundancy");
    }

    if (typeof A.getSigianComponentInstance === "function" && typeof A.getSigianForgeTransactionBinding === "function") {
      const school = draft.recipe.school;
      const affinityAllowsSchool = affinity => {
        const normalized = A.normalizeSigianCraftAffinity?.(affinity) || affinity;
        return normalized?.mode === "universal" || (normalized?.schools || []).includes(school);
      };
      draft.recipe.sigils.filter(item => item.collectibleId).forEach(sigil => {
        const binding = A.getSigianForgeTransactionBinding(draft.transaction, "sigil", sigil.slotId);
        const instance = binding?.componentInstanceId
          ? (A.getSigianProjectedComponentInstance?.(binding.componentInstanceId, draft.transaction)
            || A.getSigianComponentInstance(binding.componentInstanceId))
          : null;
        const expectedId = A.sigianCollectibleInventoryIdentity?.(sigil.collectibleId, school)?.inventoryId || null;
        const reclaim = (draft.transaction?.operations || []).find(operation =>
          operation.type === "reclaim"
          && operation.payload?.kind === "sigil"
          && String(operation.payload?.targetSlotId || "") === String(sigil.slotId)
        );
        const reclaimValid = !reclaim || (
          instance?.allocation?.state === "assigned"
          && instance.allocation.formulaInstanceId === reclaim.payload?.sourceFormulaInstanceId
          && instance.allocation.slotId === reclaim.payload?.sourceSlotId
          && A.getSigianFormulaLifecycleState?.(reclaim.payload?.sourceFormulaInstanceId) !== "DISSOLVED"
        );
        if (!binding || !instance || instance.inventoryId !== expectedId || !affinityAllowsSchool(instance.affinity) || !reclaimValid) {
          structuralReasons.push("component-copy-unavailable");
        }
      });
      (draft.transaction?.operations || []).filter(operation =>
        operation.type === "reclaim" && operation.payload?.craftingOnly
      ).forEach(operation => {
        const payload = operation.payload || {};
        const persistent = A.getSigianComponentInstance?.(payload.componentInstanceId);
        const valid = persistent?.allocation?.state === "assigned"
          && persistent.allocation.formulaInstanceId === payload.sourceFormulaInstanceId
          && persistent.allocation.slotId === payload.sourceSlotId
          && A.getSigianFormulaLifecycleState?.(payload.sourceFormulaInstanceId) !== "DISSOLVED";
        if (!valid) structuralReasons.push("component-copy-unavailable");
      });

      if (draft.recipe.constraint) {
        const binding = A.getSigianForgeTransactionBinding(draft.transaction, "constraint", "constraint");
        const instance = binding?.componentInstanceId
          ? (A.getSigianProjectedComponentInstance?.(binding.componentInstanceId, draft.transaction)
            || A.getSigianComponentInstance(binding.componentInstanceId))
          : null;
        const expectedId = A.sigianConstraintInventoryId?.(draft.recipe.constraint) || null;
        const reclaim = (draft.transaction?.operations || []).find(operation =>
          operation.type === "reclaim"
          && operation.payload?.kind === "constraint"
          && String(operation.payload?.targetSlotId || "") === "constraint"
        );
        const reclaimValid = !reclaim || (
          instance?.allocation?.state === "assigned"
          && instance.allocation.formulaInstanceId === reclaim.payload?.sourceFormulaInstanceId
          && instance.allocation.slotId === reclaim.payload?.sourceSlotId
          && A.getSigianFormulaLifecycleState?.(reclaim.payload?.sourceFormulaInstanceId) !== "DISSOLVED"
        );
        if (!binding || !instance || instance.inventoryId !== expectedId || !affinityAllowsSchool(instance.affinity) || !reclaimValid) {
          structuralReasons.push("component-copy-unavailable");
        }
      }
    }

    let math = null;
    let mathError = null;
    if (typeof A.analyzeSigianForgeRecipe === "function") {
      try {
        math = A.analyzeSigianForgeRecipe(draft.recipe);
      } catch (error) {
        mathError = String(error?.message || error || "Errore evaluator");
      }
    }

    const sealReasons = [...structuralReasons];
    let productionEvaluation = null;
    let sealValidation = null;
    if (!math) {
      sealReasons.push("balance-calibration-pending");
    } else if (math.status !== "hybrid-production" || !math.productionCertification?.productionReady) {
      sealReasons.push("hybrid-diagnostic-not-production");
    } else if (!sealReasons.length) {
      try {
        productionEvaluation = A.getSigianForgeProductionEvaluation?.(draft.recipe) || null;
        if (!productionEvaluation) {
          sealReasons.push("production-evaluation-unavailable");
        } else if (typeof A.validateSigianForgeAtomicCommit !== "function") {
          sealReasons.push("atomic-commit-unavailable");
        } else {
          sealValidation = A.validateSigianForgeAtomicCommit({
            targetFormulaInstanceId:sealTargetFormulaInstanceId(draft),
            recipeId:null,
            recipe:draft.recipe,
            transaction:draft.transaction,
            targetLifecycleState:"SEALED",
            evaluation:productionEvaluation
          });
          if (!sealValidation.valid) {
            sealReasons.push(...(sealValidation.blockers || ["atomic-commit-invalid"]));
          }
        }
      } catch (error) {
        sealReasons.push("production-evaluation-failed");
        mathError = mathError || String(error?.message || error || "Valutazione production non disponibile.");
      }
    }

    const tryReasons = [...structuralReasons];
    let tryError = null;
    if (draft.recipe.constraint) {
      tryReasons.push("global-constraint-test-runtime-pending");
    } else if (typeof A.compileFormulaRecipe !== "function" || typeof A.materializeLegacyCardFromFormula !== "function") {
      tryReasons.push("test-runtime-unavailable");
    } else if (!tryReasons.length) {
      try {
        const level = Math.max(1, Math.trunc(Number(math?.minimumLevel || 1)));
        A.compileFormulaRecipe(draft.recipe, { level, set:"forge-test-validation" });
      } catch (error) {
        tryReasons.push("test-compile-unsupported");
        tryError = String(error?.message || error || "Formula non compilabile nel banco di prova.");
      }
    }

    return {
      valid: validation.valid && !structuralReasons.includes("spell-requires-sigil"),
      validation,
      sigilCount: draft.recipe.sigils.length,
      maxSigils: A.SIGIAN_MAX_PRIMARY_SIGILS || 3,
      arcaneValue: math?.arcaneValue ?? null,
      minimumLevel: math?.minimumLevel ?? null,
      evaluatorStatus: math?.status || "pending-calibration",
      math,
      mathError,
      canTry: tryReasons.length === 0,
      tryBlockers:[...new Set(tryReasons)],
      tryError,
      canSeal: sealReasons.length === 0,
      sealBlockers: [...new Set(sealReasons)],
      productionEvaluation:productionEvaluation ? clone(productionEvaluation) : null,
      sealValidation:sealValidation ? clone(sealValidation) : null,
      sealTargetFormulaInstanceId:sealTargetFormulaInstanceId(draft)
    };
  }

  function createSession(options = {}) {
    const storage = resolveStorage(options.storage);
    const history = [];
    const future = [];
    const listeners = new Set();
    let draft = normalizeDraft(options.draft || {
      recipe: {
        id: options.id || createDraftId(),
        school: options.school,
        type: options.type,
        stats: options.stats,
        presentation: options.presentation,
        sigils: [],
        constraint: null
      }
    });
    if (draft.transaction?.baselineRevision == null && typeof A.getSigianComponentInventorySnapshot === "function") {
      draft.transaction.baselineRevision = String(A.getSigianComponentInventorySnapshot().revision);
    }
    if (draft.transaction?.formulaBaselineRevision == null && typeof A.getSigianFormulaInventorySnapshot === "function") {
      draft.transaction.formulaBaselineRevision = String(A.getSigianFormulaInventorySnapshot().revision);
    }
    if (draft.transaction?.compositionBaselineRevision == null && typeof A.getSigianFormulaCompositionSnapshot === "function") {
      draft.transaction.compositionBaselineRevision = String(A.getSigianFormulaCompositionSnapshot().revision);
    }

    if (typeof A.findSigianFreeCollectibleComponentInstance === "function"
      && typeof A.bindSigianForgeTransactionComponent === "function") {
      let transaction = clone(draft.transaction);
      const recipe = clone(draft.recipe);
      let migrated = false;

      recipe.sigils.filter(item => item.collectibleId).forEach(sigil => {
        if (A.getSigianForgeTransactionBinding?.(transaction, "sigil", sigil.slotId)) return;
        const instance = A.findSigianFreeCollectibleComponentInstance(sigil.collectibleId, recipe.school, { transaction });
        if (!instance) return;
        sigil.affinity = clone(instance.affinity);
        const inventoryId = A.sigianCollectibleInventoryIdentity?.(sigil.collectibleId, recipe.school)?.inventoryId || null;
        transaction = A.bindSigianForgeTransactionComponent(transaction, {
          kind:"sigil",
          slotId:sigil.slotId,
          componentInstanceId:instance.componentInstanceId,
          inventoryId
        });
        migrated = true;
      });

      if (recipe.constraint && !A.getSigianForgeTransactionBinding?.(transaction, "constraint", "constraint")) {
        const instance = A.findSigianFreeConstraintComponentInstance?.(recipe.constraint, recipe.school, { transaction });
        if (instance) {
          recipe.constraint.affinity = clone(instance.affinity);
          transaction = A.bindSigianForgeTransactionComponent(transaction, {
            kind:"constraint",
            slotId:"constraint",
            componentInstanceId:instance.componentInstanceId,
            inventoryId:A.sigianConstraintInventoryId?.(recipe.constraint) || null
          });
          migrated = true;
        }
      }

      if (migrated) {
        draft = normalizeDraft({ ...draft, recipe, transaction });
      }
    }

    function notify() {
      const snapshot = api.snapshot();
      listeners.forEach(listener => {
        try { listener(snapshot); } catch {}
      });
      return snapshot;
    }

    function persist() {
      draft.updatedAt = new Date().toISOString();
      storage.setItem(FORGE_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    }

    function commitRecipe(nextRecipe, options = {}) {
      const normalized = normalizeRecipe(nextRecipe);
      if (!options.skipHistory) {
        history.push(clone(draft));
        if (history.length > MAX_HISTORY) history.shift();
        future.length = 0;
      }
      draft = {
        ...draft,
        revision: draft.revision + 1,
        recipe: normalized,
        updatedAt: new Date().toISOString()
      };
      persist();
      return notify();
    }

    function recipeWith(patch) {
      return {
        ...clone(draft.recipe),
        ...patch
      };
    }

    function draftBinding(kind, slotId) {
      return A.getSigianForgeTransactionBinding?.(draft.transaction, kind, slotId) || null;
    }

    function transactionWithoutBinding(kind, slotId) {
      return A.unbindSigianForgeTransactionComponent?.(draft.transaction, kind, slotId)
        || clone(draft.transaction);
    }

    function bindTransaction(transaction, kind, slotId, instance, inventoryId) {
      if (!instance?.componentInstanceId || typeof A.bindSigianForgeTransactionComponent !== "function") return transaction;
      return A.bindSigianForgeTransactionComponent(transaction, {
        kind,
        slotId,
        componentInstanceId:instance.componentInstanceId,
        inventoryId
      });
    }

    function commitDraftPatch(patch, options = {}) {
      if (!options.skipHistory) {
        history.push(clone(draft));
        if (history.length > MAX_HISTORY) history.shift();
        future.length = 0;
      }
      draft = normalizeDraft({
        ...clone(draft),
        ...clone(patch),
        revision:draft.revision + 1,
        updatedAt:new Date().toISOString()
      });
      persist();
      return notify();
    }

    function commitRecipeAndTransaction(nextRecipe, nextTransaction) {
      return commitDraftPatch({
        recipe:normalizeRecipe(nextRecipe),
        transaction:nextTransaction
      });
    }

    function reclaimAndBindTransaction(transaction, kind, targetSlotId, instance, inventoryId) {
      if (typeof A.reclaimSigianForgeTransactionComponent !== "function") {
        throw new Error("Recupero componente Forgia non disponibile.");
      }
      const allocation = instance?.allocation;
      if (!instance?.componentInstanceId || allocation?.state !== "assigned") {
        throw new Error("La copia scelta non è assegnata a una Formula.");
      }
      return A.reclaimSigianForgeTransactionComponent(transaction, {
        kind,
        targetSlotId,
        componentInstanceId:instance.componentInstanceId,
        inventoryId,
        sourceFormulaInstanceId:allocation.formulaInstanceId,
        sourceSlotId:allocation.slotId
      });
    }

    function rebindRecipeComponentsForSchool(nextSchool) {
      const recipe = clone(draft.recipe);
      recipe.school = nextSchool;
      if (typeof A.findSigianFreeCollectibleComponentInstance !== "function") {
        return { recipe, transaction:clone(draft.transaction) };
      }

      let transaction = clone(draft.transaction);
      recipe.sigils.forEach(sigil => {
        if (sigil.collectibleId) {
          transaction = A.unbindSigianForgeTransactionComponent?.(transaction, "sigil", sigil.slotId) || transaction;
        }
      });
      if (recipe.constraint) {
        transaction = A.unbindSigianForgeTransactionComponent?.(transaction, "constraint", "constraint") || transaction;
      }

      recipe.sigils.forEach(sigil => {
        if (!sigil.collectibleId) return;
        const instance = A.findSigianFreeCollectibleComponentInstance(sigil.collectibleId, nextSchool, { transaction });
        if (!instance) {
          throw new Error(`Nessuna copia libera di ${sigil.collectibleId} compatibile con la Scuola ${nextSchool}.`);
        }
        sigil.affinity = clone(instance.affinity);
        const inventoryId = A.sigianCollectibleInventoryIdentity?.(sigil.collectibleId, nextSchool)?.inventoryId || null;
        transaction = bindTransaction(transaction, "sigil", sigil.slotId, instance, inventoryId);
      });

      if (recipe.constraint) {
        const instance = A.findSigianFreeConstraintComponentInstance?.(recipe.constraint, nextSchool, { transaction });
        if (!instance) {
          throw new Error("Nessuna copia libera del Vincolo compatibile con la nuova Scuola.");
        }
        recipe.constraint.affinity = clone(instance.affinity);
        const inventoryId = A.sigianConstraintInventoryId?.(recipe.constraint) || null;
        transaction = bindTransaction(transaction, "constraint", "constraint", instance, inventoryId);
      }

      return { recipe, transaction };
    }

    function collectibleFamily(collectibleId) {
      const collectible = A.getSigianCollectibleSigil?.(collectibleId);
      if (!collectible?.templateId) return null;
      return {
        collectible,
        key:String(collectible.templateId),
        grade:Number(collectible.grade || 0)
      };
    }

    function sameFamilySigils(collectibleId) {
      const family = collectibleFamily(collectibleId);
      if (!family) return [];
      return draft.recipe.sigils
        .filter(sigil => {
          const candidate = collectibleFamily(sigil.collectibleId);
          return candidate?.key === family.key;
        })
        .map(clone);
    }

    function assignedCollectibleCandidates(collectibleId, transaction) {
      return A.listSigianAssignedCollectibleComponentInstances?.(
        collectibleId,
        draft.recipe.school,
        { transaction }
      ) || [];
    }

    function freeCollectibleCandidates(collectibleId, transaction) {
      const identity = A.sigianCollectibleInventoryIdentity?.(collectibleId, draft.recipe.school);
      if (!identity?.inventoryId) return [];
      return A.listSigianProjectedAvailableComponentInstances?.({
        transaction,
        inventoryId:identity.inventoryId,
        compatibleSchool:draft.recipe.school
      }) || [];
    }

    function prepareBoundSigilForCrafting(transaction, slotId) {
      const binding = A.getSigianForgeTransactionBinding?.(transaction, "sigil", slotId);
      if (!binding?.componentInstanceId) {
        throw new Error(`Nessuna copia concreta legata allo slot ${slotId}.`);
      }
      let next = A.unbindSigianForgeTransactionComponent?.(transaction, "sigil", slotId) || clone(transaction);
      const persistent = A.getSigianComponentInstance?.(binding.componentInstanceId);
      if (persistent?.allocation?.state === "assigned") {
        if (typeof A.reclaimSigianForgeTransactionComponentForCrafting !== "function") {
          throw new Error("Recupero crafting non disponibile.");
        }
        next = A.reclaimSigianForgeTransactionComponentForCrafting(next, {
          kind:"sigil",
          componentInstanceId:persistent.componentInstanceId,
          inventoryId:persistent.inventoryId,
          sourceFormulaInstanceId:persistent.allocation.formulaInstanceId,
          sourceSlotId:persistent.allocation.slotId
        });
      }
      const projected = A.getSigianProjectedComponentInstance?.(binding.componentInstanceId, next);
      if (!projected || projected.allocation?.state !== "free") {
        throw new Error("La copia legata non è disponibile come input di crafting nel draft.");
      }
      return {
        transaction:next,
        componentInstanceId:binding.componentInstanceId,
        instance:projected
      };
    }

    function horizontalCollectibleAddSuggestion(collectibleId) {
      const requestedRole = fixedH001Role(collectibleId);
      if (requestedRole !== "wave" && requestedRole !== "damage") return null;
      const requested = defaultForgeCollectibleSigil(collectibleId, draft.recipe.school, draft.recipe.sigils.length);
      const requestedSemantics = fixedH001Semantics(requested);
      if (!requestedSemantics) return null;

      const oppositeRole = requestedRole === "wave" ? "damage" : "wave";
      const existing = draft.recipe.sigils.find(sigil =>
        fixedH001Role(sigil.collectibleId) === oppositeRole
        && Math.trunc(Number(sigil.grade || 0)) === Math.trunc(Number(requested.grade || 0))
        && sameFixedH001Semantics(sigil, requested)
      );
      if (!existing) return null;

      const targetCollectibleId = fixedH001TargetCollectibleId(requested.grade);
      if (!targetCollectibleId) return null;

      const targetFree = A.findSigianFreeCollectibleComponentInstance?.(
        targetCollectibleId,
        draft.recipe.school,
        { transaction:draft.transaction }
      );
      if (targetFree) {
        return {
          type:"horizontal",
          recipeId:"H001-fixed",
          strategy:"use-horizontal-output-free",
          collectibleId:String(collectibleId),
          existingSlotId:existing.slotId,
          existingCollectibleId:existing.collectibleId,
          targetCollectibleId,
          semantics:clone(requestedSemantics),
          targetGrade:Number(requested.grade || 0)
        };
      }

      let prepared;
      try {
        prepared = prepareBoundSigilForCrafting(draft.transaction, existing.slotId);
      } catch {
        return {
          type:"horizontal",
          recipeId:"H001-fixed",
          strategy:"blocked-horizontal-input",
          collectibleId:String(collectibleId),
          existingSlotId:existing.slotId,
          existingCollectibleId:existing.collectibleId,
          targetCollectibleId,
          semantics:clone(requestedSemantics)
        };
      }

      const requestedFree = A.findSigianFreeCollectibleComponentInstance?.(
        collectibleId,
        draft.recipe.school,
        { transaction:prepared.transaction }
      );
      if (requestedFree) {
        try {
          A.planSigianHorizontalFusion?.(
            prepared.instance,
            requestedFree,
            {
              leftSemantics:fixedH001Semantics(existing),
              rightSemantics:requestedSemantics
            }
          );
          return {
            type:"horizontal",
            recipeId:"H001-fixed",
            strategy:"fuse-horizontal-free",
            collectibleId:String(collectibleId),
            existingSlotId:existing.slotId,
            existingCollectibleId:existing.collectibleId,
            targetCollectibleId,
            semantics:clone(requestedSemantics),
            targetGrade:Number(requested.grade || 0)
          };
        } catch {}
      }

      const assigned = assignedCollectibleCandidates(collectibleId, prepared.transaction)
        .filter(instance => {
          try {
            A.planSigianHorizontalFusion?.(
              prepared.instance,
              instance,
              {
                leftSemantics:fixedH001Semantics(existing),
                rightSemantics:requestedSemantics
              }
            );
            return true;
          } catch {
            return false;
          }
        });
      if (assigned.length) {
        return {
          type:"horizontal",
          recipeId:"H001-fixed",
          strategy:"fuse-horizontal-reclaim",
          collectibleId:String(collectibleId),
          existingSlotId:existing.slotId,
          existingCollectibleId:existing.collectibleId,
          targetCollectibleId,
          semantics:clone(requestedSemantics),
          targetGrade:Number(requested.grade || 0),
          requiredReclaims:1,
          reclaimCandidates:assigned.map(clone)
        };
      }

      return {
        type:"horizontal",
        recipeId:"H001-fixed",
        strategy:"blocked-horizontal-no-path",
        collectibleId:String(collectibleId),
        existingSlotId:existing.slotId,
        existingCollectibleId:existing.collectibleId,
        targetCollectibleId,
        semantics:clone(requestedSemantics)
      };
    }

    function collectibleAddSuggestion(collectibleId) {
      const requested = collectibleFamily(collectibleId);
      if (!requested || !requested.grade) return null;
      const sameFamily = sameFamilySigils(collectibleId);
      if (!sameFamily.length) return horizontalCollectibleAddSuggestion(collectibleId);
      if (sameFamily.length > 1) {
        return {
          type:"same-family",
          strategy:"blocked-existing-conflict",
          collectibleId:String(collectibleId),
          existingSlotIds:sameFamily.map(item => item.slotId)
        };
      }

      const existing = sameFamily[0];
      const current = collectibleFamily(existing.collectibleId);
      if (!current?.grade) return null;

      if (current.grade !== requested.grade) {
        const free = A.findSigianFreeCollectibleComponentInstance?.(
          collectibleId,
          draft.recipe.school,
          { transaction:draft.transaction }
        );
        if (free) {
          return {
            type:"same-family",
            strategy:"replace-selected-free",
            collectibleId:String(collectibleId),
            targetCollectibleId:String(collectibleId),
            existingSlotId:existing.slotId,
            existingCollectibleId:existing.collectibleId,
            existingGrade:current.grade,
            targetGrade:requested.grade
          };
        }
        const assigned = assignedCollectibleCandidates(collectibleId, draft.transaction);
        if (assigned.length) {
          return {
            type:"same-family",
            strategy:"replace-selected-reclaim",
            collectibleId:String(collectibleId),
            targetCollectibleId:String(collectibleId),
            existingSlotId:existing.slotId,
            existingCollectibleId:existing.collectibleId,
            existingGrade:current.grade,
            targetGrade:requested.grade,
            requiredReclaims:1,
            reclaimCandidates:assigned.map(clone)
          };
        }
        return {
          type:"same-family",
          strategy:"blocked-selected-unavailable",
          collectibleId:String(collectibleId),
          targetCollectibleId:String(collectibleId),
          existingSlotId:existing.slotId,
          existingCollectibleId:existing.collectibleId,
          existingGrade:current.grade,
          targetGrade:requested.grade
        };
      }

      const fusion = A.sigianCollectibleFusion?.(collectibleId);
      if (!fusion?.to) {
        return {
          type:"same-family",
          strategy:"blocked-max-grade",
          collectibleId:String(collectibleId),
          existingSlotId:existing.slotId,
          existingCollectibleId:existing.collectibleId,
          existingGrade:current.grade
        };
      }

      const higherFree = A.findSigianFreeCollectibleComponentInstance?.(
        fusion.to,
        draft.recipe.school,
        { transaction:draft.transaction }
      );
      if (higherFree) {
        return {
          type:"same-family",
          strategy:"use-higher-free",
          collectibleId:String(collectibleId),
          targetCollectibleId:String(fusion.to),
          existingSlotId:existing.slotId,
          existingCollectibleId:existing.collectibleId,
          existingGrade:current.grade,
          targetGrade:current.grade + 1
        };
      }

      const unbound = transactionWithoutBinding("sigil", existing.slotId);
      const freeInputs = freeCollectibleCandidates(collectibleId, unbound);
      if (freeInputs.length >= 2) {
        return {
          type:"same-family",
          strategy:"fuse-free",
          collectibleId:String(collectibleId),
          targetCollectibleId:String(fusion.to),
          existingSlotId:existing.slotId,
          existingCollectibleId:existing.collectibleId,
          existingGrade:current.grade,
          targetGrade:current.grade + 1,
          availableInputInstanceIds:freeInputs.slice(0, 2).map(item => item.componentInstanceId)
        };
      }

      const higherAssigned = assignedCollectibleCandidates(fusion.to, draft.transaction);
      if (higherAssigned.length) {
        return {
          type:"same-family",
          strategy:"use-higher-reclaim",
          collectibleId:String(collectibleId),
          targetCollectibleId:String(fusion.to),
          existingSlotId:existing.slotId,
          existingCollectibleId:existing.collectibleId,
          existingGrade:current.grade,
          targetGrade:current.grade + 1,
          requiredReclaims:1,
          reclaimCandidates:higherAssigned.map(clone)
        };
      }

      const assignedInputs = assignedCollectibleCandidates(collectibleId, unbound);
      const requiredReclaims = Math.max(0, 2 - freeInputs.length);
      if (requiredReclaims > 0 && assignedInputs.length >= requiredReclaims) {
        return {
          type:"same-family",
          strategy:"fuse-reclaim",
          collectibleId:String(collectibleId),
          targetCollectibleId:String(fusion.to),
          existingSlotId:existing.slotId,
          existingCollectibleId:existing.collectibleId,
          existingGrade:current.grade,
          targetGrade:current.grade + 1,
          requiredReclaims,
          availableInputInstanceIds:freeInputs.map(item => item.componentInstanceId),
          reclaimCandidates:assignedInputs.map(clone)
        };
      }

      return {
        type:"same-family",
        strategy:"blocked-no-normalization-path",
        collectibleId:String(collectibleId),
        targetCollectibleId:String(fusion.to),
        existingSlotId:existing.slotId,
        existingCollectibleId:existing.collectibleId,
        existingGrade:current.grade,
        targetGrade:current.grade + 1
      };
    }

    function replaceWithFreeCollectiblePreservingSemantics(slotId, collectibleId, semantics) {
      const index = draft.recipe.sigils.findIndex(item => item.slotId === slotId);
      if (index < 0) throw new Error(`Slot Sigillo non trovato: ${slotId}.`);
      const transaction = transactionWithoutBinding("sigil", slotId);
      const instance = A.findSigianFreeCollectibleComponentInstance?.(
        collectibleId,
        draft.recipe.school,
        { transaction }
      );
      if (!instance) throw new Error("La copia output H001 non è più libera.");
      const next = clone(draft.recipe.sigils);
      const replacement = defaultForgeCollectibleSigil(collectibleId, draft.recipe.school, index);
      replacement.slotId = slotId;
      replacement.affinity = clone(instance.affinity);
      replacement.intensity = Number(semantics?.magnitude);
      if (!A.sigianCollectibleAllowsIntensity?.(collectibleId, replacement.intensity)) {
        throw new Error("La magnitudine H001 non è ammessa dall'output canonico.");
      }
      next[index] = replacement;
      const inventoryId = A.sigianCollectibleInventoryIdentity?.(collectibleId, draft.recipe.school)?.inventoryId || null;
      return commitRecipeAndTransaction(
        recipeWith({ sigils:next }),
        bindTransaction(transaction, "sigil", slotId, instance, inventoryId)
      );
    }

    function fuseHorizontalIncoming(existingSlotId, incomingCollectibleId, targetCollectibleId, reclaimInstanceIds = []) {
      const index = draft.recipe.sigils.findIndex(item => item.slotId === existingSlotId);
      if (index < 0) throw new Error(`Slot Sigillo non trovato: ${existingSlotId}.`);
      const existing = draft.recipe.sigils[index];
      const incoming = defaultForgeCollectibleSigil(incomingCollectibleId, draft.recipe.school, draft.recipe.sigils.length);
      if (!sameFixedH001Semantics(existing, incoming)) {
        throw new Error("H001 richiede magnitudine, timing e scaling identici.");
      }

      let prepared = prepareBoundSigilForCrafting(draft.transaction, existingSlotId);
      let transaction = prepared.transaction;

      [...new Set((reclaimInstanceIds || []).map(String))].forEach(instanceId => {
        const persistent = A.getSigianComponentInstance?.(instanceId);
        const incomingIdentity = A.sigianCollectibleInventoryIdentity?.(incomingCollectibleId, draft.recipe.school);
        if (!incomingIdentity?.inventoryId
          || persistent?.inventoryId !== incomingIdentity.inventoryId
          || persistent.allocation?.state !== "assigned") {
          throw new Error("La copia da recuperare non è valida come input H001.");
        }
        transaction = A.reclaimSigianForgeTransactionComponentForCrafting(transaction, {
          kind:"sigil",
          componentInstanceId:persistent.componentInstanceId,
          inventoryId:persistent.inventoryId,
          sourceFormulaInstanceId:persistent.allocation.formulaInstanceId,
          sourceSlotId:persistent.allocation.slotId
        });
      });

      const incomingInstance = A.findSigianFreeCollectibleComponentInstance?.(
        incomingCollectibleId,
        draft.recipe.school,
        { transaction }
      );
      if (!incomingInstance) throw new Error("Nessuna copia H001 compatibile disponibile per il secondo input.");

      const staged = A.stageSigianHorizontalFusion?.(
        transaction,
        prepared.componentInstanceId,
        incomingInstance.componentInstanceId,
        {
          leftSemantics:fixedH001Semantics(existing),
          rightSemantics:fixedH001Semantics(incoming),
          targetSlotId:existingSlotId
        }
      );
      if (!staged?.outputInstance) throw new Error("Fusion H001 non pianificata.");

      const targetIdentity = A.sigianCollectibleInventoryIdentity?.(targetCollectibleId, draft.recipe.school);
      if (!targetIdentity?.inventoryId || staged.outputInstance.inventoryId !== targetIdentity.inventoryId) {
        throw new Error("Fusion H001: output canonico inatteso.");
      }

      const replacement = defaultForgeCollectibleSigil(targetCollectibleId, draft.recipe.school, index);
      replacement.slotId = existingSlotId;
      replacement.affinity = clone(staged.outputInstance.affinity);
      replacement.intensity = Number(staged.semantics?.magnitude);
      const next = clone(draft.recipe.sigils);
      next[index] = replacement;
      transaction = bindTransaction(
        staged.transaction,
        "sigil",
        existingSlotId,
        staged.outputInstance,
        targetIdentity.inventoryId
      );
      return commitRecipeAndTransaction(recipeWith({ sigils:next }), transaction);
    }

    function fuseExistingHorizontalPair(leftSlotId, rightSlotId) {
      const leftIndex = draft.recipe.sigils.findIndex(item => item.slotId === leftSlotId);
      const rightIndex = draft.recipe.sigils.findIndex(item => item.slotId === rightSlotId);
      if (leftIndex < 0 || rightIndex < 0 || leftIndex === rightIndex) {
        throw new Error("Coppia H001 non valida.");
      }
      const leftSigil = draft.recipe.sigils[leftIndex];
      const rightSigil = draft.recipe.sigils[rightIndex];
      const pair = fixedH001FusionPairs({ sigils:[leftSigil, rightSigil] })[0];
      if (!pair) throw new Error("I due Sigilli non soddisfano H001.");

      let first = prepareBoundSigilForCrafting(draft.transaction, leftSlotId);
      let second = prepareBoundSigilForCrafting(first.transaction, rightSlotId);
      const staged = A.stageSigianHorizontalFusion?.(
        second.transaction,
        first.componentInstanceId,
        second.componentInstanceId,
        {
          leftSemantics:fixedH001Semantics(leftSigil),
          rightSemantics:fixedH001Semantics(rightSigil),
          targetSlotId:leftSlotId
        }
      );
      if (!staged?.outputInstance) throw new Error("Fusion H001 non pianificata.");

      const targetIdentity = A.sigianCollectibleInventoryIdentity?.(pair.targetCollectibleId, draft.recipe.school);
      if (!targetIdentity?.inventoryId || staged.outputInstance.inventoryId !== targetIdentity.inventoryId) {
        throw new Error("Fusion H001: output canonico inatteso.");
      }

      const keepIndex = Math.min(leftIndex, rightIndex);
      const keepSlotId = leftIndex <= rightIndex ? leftSlotId : rightSlotId;
      const replacement = defaultForgeCollectibleSigil(pair.targetCollectibleId, draft.recipe.school, keepIndex);
      replacement.slotId = keepSlotId;
      replacement.intensity = Number(pair.semantics.magnitude);
      replacement.affinity = clone(staged.outputInstance.affinity);
      const next = draft.recipe.sigils
        .filter((_, index) => index !== leftIndex && index !== rightIndex)
        .map(clone);
      next.splice(keepIndex, 0, replacement);
      const transaction = bindTransaction(
        staged.transaction,
        "sigil",
        keepSlotId,
        staged.outputInstance,
        targetIdentity.inventoryId
      );
      return commitRecipeAndTransaction(recipeWith({ sigils:next }), transaction);
    }

    function splitHorizontalTide(slotId) {
      const index = draft.recipe.sigils.findIndex(item => item.slotId === slotId);
      if (index < 0) throw new Error(`Slot Sigillo non trovato: ${slotId}.`);
      const tide = draft.recipe.sigils[index];
      if (fixedH001Role(tide.collectibleId) !== "tide") {
        throw new Error("Solo una Marea fissa può essere scomposta con H001 nella Forgia corrente.");
      }
      const inputIds = fixedH001InputCollectibleIds(tide.grade);
      if (!inputIds) throw new Error("Gli output H001 non sono disponibili nel catalogo selezionabile.");

      const prepared = prepareBoundSigilForCrafting(draft.transaction, slotId);
      const staged = A.stageSigianHorizontalSplit?.(
        prepared.transaction,
        prepared.componentInstanceId,
        {
          semantics:fixedH001Semantics(tide),
          targetSlotId:slotId
        }
      );
      if (!staged?.outputInstances || staged.outputInstances.length !== 2) {
        throw new Error("Split H001 non pianificato.");
      }

      const waveIdentity = A.sigianCollectibleInventoryIdentity?.(inputIds.wave, draft.recipe.school);
      const damageIdentity = A.sigianCollectibleInventoryIdentity?.(inputIds.damage, draft.recipe.school);
      const outputIds = new Set(staged.outputInstances.map(instance => instance.inventoryId));
      if (!outputIds.has(waveIdentity?.inventoryId) || !outputIds.has(damageIdentity?.inventoryId)) {
        throw new Error("Split H001: output canonici inattesi.");
      }

      const next = draft.recipe.sigils.filter((_, itemIndex) => itemIndex !== index).map(clone);
      return commitRecipeAndTransaction(recipeWith({ sigils:next }), staged.transaction);
    }

    function horizontalFormulaCraftingOptions() {
      const fusions = fixedH001FusionPairs(draft.recipe)
        .filter(pair => {
          try {
            const first = prepareBoundSigilForCrafting(draft.transaction, pair.left.slotId);
            const second = prepareBoundSigilForCrafting(first.transaction, pair.right.slotId);
            A.planSigianHorizontalFusion?.(
              first.instance,
              second.instance,
              {
                leftSemantics:fixedH001Semantics(pair.left),
                rightSemantics:fixedH001Semantics(pair.right)
              }
            );
            return true;
          } catch {
            return false;
          }
        })
        .map(pair => ({
          recipeId:"H001-fixed",
          leftSlotId:pair.left.slotId,
          rightSlotId:pair.right.slotId,
          leftCollectibleId:pair.left.collectibleId,
          rightCollectibleId:pair.right.collectibleId,
          targetCollectibleId:pair.targetCollectibleId,
          semantics:clone(pair.semantics)
        }));
      const splits = draft.recipe.sigils
        .filter(sigil => fixedH001Role(sigil.collectibleId) === "tide"
          && fixedH001InputCollectibleIds(sigil.grade)
          && fixedH001Semantics(sigil)
          && A.getSigianForgeTransactionBinding?.(draft.transaction, "sigil", sigil.slotId))
        .map(sigil => ({
          recipeId:"H001-fixed",
          slotId:sigil.slotId,
          collectibleId:sigil.collectibleId,
          semantics:fixedH001Semantics(sigil),
          outputs:fixedH001InputCollectibleIds(sigil.grade)
        }));
      return { fusions, splits };
    }

    function replaceWithReclaimedCollectible(slotId, collectibleId, componentInstanceId) {
      const index = draft.recipe.sigils.findIndex(item => item.slotId === slotId);
      if (index < 0) throw new Error(`Slot Sigillo non trovato: ${slotId}.`);
      const candidates = assignedCollectibleCandidates(
        collectibleId,
        transactionWithoutBinding("sigil", slotId)
      );
      const instance = candidates.find(item => item.componentInstanceId === String(componentInstanceId || ""));
      if (!instance) throw new Error("La copia assegnata scelta non è più disponibile.");
      const next = clone(draft.recipe.sigils);
      const replacement = defaultForgeCollectibleSigil(collectibleId, draft.recipe.school, index);
      replacement.slotId = slotId;
      replacement.affinity = clone(instance.affinity);
      next[index] = replacement;
      const inventoryId = A.sigianCollectibleInventoryIdentity?.(collectibleId, draft.recipe.school)?.inventoryId || null;
      const transaction = reclaimAndBindTransaction(
        transactionWithoutBinding("sigil", slotId),
        "sigil",
        slotId,
        instance,
        inventoryId
      );
      return commitRecipeAndTransaction(recipeWith({ sigils:next }), transaction);
    }

    function fuseSameFamilyIntoSlot(existingSlotId, sourceCollectibleId, targetCollectibleId, reclaimInstanceIds = []) {
      const index = draft.recipe.sigils.findIndex(item => item.slotId === existingSlotId);
      if (index < 0) throw new Error(`Slot Sigillo non trovato: ${existingSlotId}.`);
      let transaction = transactionWithoutBinding("sigil", existingSlotId);
      const sourceIdentity = A.sigianCollectibleInventoryIdentity?.(sourceCollectibleId, draft.recipe.school);
      const targetIdentity = A.sigianCollectibleInventoryIdentity?.(targetCollectibleId, draft.recipe.school);
      if (!sourceIdentity?.inventoryId || !targetIdentity?.inventoryId) {
        throw new Error("Identità canonica crafting non disponibile.");
      }

      [...new Set((reclaimInstanceIds || []).map(String))].forEach(instanceId => {
        const persistent = A.getSigianComponentInstance?.(instanceId);
        if (persistent?.inventoryId !== sourceIdentity.inventoryId || persistent.allocation?.state !== "assigned") {
          throw new Error("La copia da recuperare non è più valida per questa Fusion.");
        }
        if (typeof A.reclaimSigianForgeTransactionComponentForCrafting !== "function") {
          throw new Error("Recupero crafting non disponibile.");
        }
        transaction = A.reclaimSigianForgeTransactionComponentForCrafting(transaction, {
          kind:"sigil",
          componentInstanceId:persistent.componentInstanceId,
          inventoryId:persistent.inventoryId,
          sourceFormulaInstanceId:persistent.allocation.formulaInstanceId,
          sourceSlotId:persistent.allocation.slotId
        });
      });

      const available = A.listSigianProjectedAvailableComponentInstances?.({
        transaction,
        inventoryId:sourceIdentity.inventoryId,
        compatibleSchool:draft.recipe.school
      }) || [];
      if (available.length < 2) {
        throw new Error("Servono due copie compatibili disponibili per la Fusion.");
      }
      const staged = A.stageSigianVerticalFusion?.(
        transaction,
        available[0].componentInstanceId,
        available[1].componentInstanceId,
        { targetSlotId:existingSlotId }
      );
      if (!staged?.outputInstance || staged.outputInstance.inventoryId !== targetIdentity.inventoryId) {
        throw new Error("La Fusion non produce l'identità canonica attesa.");
      }

      const next = clone(draft.recipe.sigils);
      const replacement = defaultForgeCollectibleSigil(targetCollectibleId, draft.recipe.school, index);
      replacement.slotId = existingSlotId;
      replacement.affinity = clone(staged.outputInstance.affinity);
      next[index] = replacement;
      transaction = bindTransaction(
        staged.transaction,
        "sigil",
        existingSlotId,
        staged.outputInstance,
        targetIdentity.inventoryId
      );
      return commitRecipeAndTransaction(recipeWith({ sigils:next }), transaction);
    }

    const api = Object.freeze({
      snapshot() {
        return {
          draft: clone(draft),
          analysis: draftAnalysis(draft),
          canUndo: history.length > 0,
          canRedo: future.length > 0
        };
      },

      subscribe(listener) {
        if (typeof listener !== "function") return () => {};
        listeners.add(listener);
        return () => listeners.delete(listener);
      },

      save() {
        persist();
        return this.snapshot();
      },

      getSealTargetFormulaInstanceId() {
        return sealTargetFormulaInstanceId(draft);
      },

      sealFormula(options = {}) {
        const analysis = draftAnalysis(draft);
        if (!analysis.canSeal) {
          throw new Error(`Sigilla Formula bloccato: ${(analysis.sealBlockers || []).join(", ") || "stato non valido"}.`);
        }
        if (typeof A.commitSigianForgeTransactionAtomic !== "function") {
          throw new Error("Commit atomico Forgia non disponibile.");
        }
        const evaluation = analysis.productionEvaluation
          || A.getSigianForgeProductionEvaluation?.(draft.recipe);
        if (!evaluation || evaluation.status !== "production") {
          throw new Error("Valutazione Hybrid production non disponibile.");
        }
        const result = A.commitSigianForgeTransactionAtomic({
          targetFormulaInstanceId:sealTargetFormulaInstanceId(draft),
          recipeId:Object.prototype.hasOwnProperty.call(options, "recipeId") ? options.recipeId : null,
          sourceCardId:Object.prototype.hasOwnProperty.call(options, "sourceCardId") ? options.sourceCardId : null,
          recipe:draft.recipe,
          transaction:draft.transaction,
          targetLifecycleState:"SEALED",
          evaluation
        });
        return {
          ...clone(result),
          evaluation:clone(evaluation),
          recipe:clone(draft.recipe)
        };
      },

      stageTransactionOperation(operation) {
        if (typeof A.appendSigianForgeTransactionOperation !== "function") {
          throw new Error("Piano transazionale Forgia non disponibile.");
        }
        const transaction = A.appendSigianForgeTransactionOperation(draft.transaction, operation);
        return commitDraftPatch({ transaction });
      },

      clearTransactionOperations() {
        const transaction = typeof A.createSigianForgeTransactionPlan === "function"
          ? A.createSigianForgeTransactionPlan({
              baselineRevision:draft.transaction?.baselineRevision,
              formulaBaselineRevision:draft.transaction?.formulaBaselineRevision,
              compositionBaselineRevision:draft.transaction?.compositionBaselineRevision
            })
          : {
              mode:"simulation",
              baselineRevision:draft.transaction?.baselineRevision ?? null,
              formulaBaselineRevision:draft.transaction?.formulaBaselineRevision ?? null,
              compositionBaselineRevision:draft.transaction?.compositionBaselineRevision ?? null,
              nextVirtualSequence:1,
              operations:[]
            };
        return commitDraftPatch({ transaction });
      },

      listVerticalCraftingOptions(options = {}) {
        return A.listSigianVerticalCraftingOptions?.(draft.transaction, {
          compatibleSchool:options.compatibleSchool || draft.recipe.school
        }) || { fusions:[], splits:[] };
      },

      stageVerticalFusion(leftInstanceId, rightInstanceId) {
        if (typeof A.stageSigianVerticalFusion !== "function") {
          throw new Error("Crafting verticale non disponibile.");
        }
        const staged = A.stageSigianVerticalFusion(
          draft.transaction,
          leftInstanceId,
          rightInstanceId
        );
        return commitDraftPatch({ transaction:staged.transaction });
      },

      stageVerticalSplit(inputInstanceId) {
        if (typeof A.stageSigianVerticalSplit !== "function") {
          throw new Error("Crafting verticale non disponibile.");
        }
        const staged = A.stageSigianVerticalSplit(
          draft.transaction,
          inputInstanceId
        );
        return commitDraftPatch({ transaction:staged.transaction });
      },

      reset(options = {}) {
        history.push(clone(draft));
        if (history.length > MAX_HISTORY) history.shift();
        future.length = 0;
        draft = normalizeDraft({
          transaction:{
            baselineRevision:typeof A.getSigianComponentInventorySnapshot === "function"
              ? String(A.getSigianComponentInventorySnapshot().revision)
              : null,
            formulaBaselineRevision:typeof A.getSigianFormulaInventorySnapshot === "function"
              ? String(A.getSigianFormulaInventorySnapshot().revision)
              : null,
            compositionBaselineRevision:typeof A.getSigianFormulaCompositionSnapshot === "function"
              ? String(A.getSigianFormulaCompositionSnapshot().revision)
              : null,
            operations:[]
          },
          recipe: {
            id: options.id || createDraftId(),
            school: options.school || draft.recipe.school,
            type: options.type || "creature",
            stats: options.stats || { attack: 1, health: 5 },
            presentation: options.presentation || { name: "Nuova Formula" },
            sigils: [],
            constraint: null
          }
        });
        persist();
        return notify();
      },

      setName(name) {
        return commitRecipe(recipeWith({
          presentation: {
            ...draft.recipe.presentation,
            name: String(name || "").trim().slice(0, 48) || "Nuova Formula"
          }
        }));
      },

      setArt(cosmeticId) {
        const id = String(cosmeticId || "").trim();
        if (!id) {
          return commitRecipe(recipeWith({
            presentation: {
              ...draft.recipe.presentation,
              art:"",
              imageKey:null
            }
          }));
        }
        const art = A.getSigianInventoryArt?.(id);
        if (!art || Number(art.ownedQuantity ?? art.quantity ?? 0) <= 0) {
          throw new Error(`ART non posseduta: ${id}.`);
        }
        return commitRecipe(recipeWith({
          presentation: {
            ...draft.recipe.presentation,
            art:String(art.image || ""),
            imageKey:id
          }
        }));
      },

      setSchool(school) {
        const definition = A.getSigianSchool?.(school);
        if (!definition || definition.status !== "active") throw new Error(`Scuola non attiva: ${school}.`);
        if (definition.id === draft.recipe.school) return this.snapshot();
        const rebound = rebindRecipeComponentsForSchool(definition.id);
        return commitRecipeAndTransaction(rebound.recipe, rebound.transaction);
      },

      setType(type) {
        if (!["creature", "spell"].includes(type)) throw new Error(`Tipo Formula non valido: ${type}.`);
        const stats = type === "creature"
          ? {
              attack: Math.max(0, Math.trunc(Number(draft.recipe.stats?.attack ?? 1))),
              health: Math.max(1, Math.trunc(Number(draft.recipe.stats?.health ?? 5)))
            }
          : {};
        return commitRecipe(recipeWith({ type, stats }));
      },

      setCreatureStats(stats = {}) {
        if (draft.recipe.type !== "creature") throw new Error("Attacco e Vita sono disponibili solo per le Creature.");
        return commitRecipe(recipeWith({
          stats: {
            attack: Math.max(0, Math.trunc(Number(stats.attack ?? draft.recipe.stats.attack))),
            health: Math.max(1, Math.trunc(Number(stats.health ?? draft.recipe.stats.health)))
          }
        }));
      },

      setConstraint(definitionId) {
        const normalizedId = String(definitionId || "").trim();
        if (!normalizedId) return this.removeConstraint();
        const constraint = defaultForgeConstraint(normalizedId, draft.recipe.school);
        if (typeof A.findSigianFreeConstraintComponentInstance === "function") {
          const transaction = transactionWithoutBinding("constraint", "constraint");
          const instance = A.findSigianFreeConstraintComponentInstance(constraint, draft.recipe.school, { transaction });
          if (!instance) throw new Error(`Nessuna copia libera del Vincolo ${normalizedId}.`);
          constraint.affinity = clone(instance.affinity);
          const inventoryId = A.sigianConstraintInventoryId?.(constraint) || null;
          return commitRecipeAndTransaction(
            recipeWith({ constraint }),
            bindTransaction(transaction, "constraint", "constraint", instance, inventoryId)
          );
        }
        if (typeof A.getSigianOwnedConstraintQuantity === "function"
          && A.getSigianOwnedConstraintQuantity(constraint) < 1) {
          throw new Error(`Vincolo non posseduto: ${normalizedId}.`);
        }
        return commitRecipe(recipeWith({ constraint }));
      },

      setReclaimedConstraint(definitionId, componentInstanceId) {
        const normalizedId = String(definitionId || "").trim();
        if (!normalizedId) throw new Error("Vincolo da recuperare non valido.");
        const constraint = defaultForgeConstraint(normalizedId, draft.recipe.school);
        const candidates = A.listSigianAssignedConstraintComponentInstances?.(
          constraint,
          draft.recipe.school,
          { transaction:draft.transaction }
        ) || [];
        const instance = candidates.find(item => item.componentInstanceId === String(componentInstanceId || ""));
        if (!instance) throw new Error("La copia assegnata del Vincolo non è più disponibile per il recupero.");
        constraint.affinity = clone(instance.affinity);
        const inventoryId = A.sigianConstraintInventoryId?.(constraint) || null;
        const transaction = reclaimAndBindTransaction(
          transactionWithoutBinding("constraint", "constraint"),
          "constraint",
          "constraint",
          instance,
          inventoryId
        );
        return commitRecipeAndTransaction(recipeWith({ constraint }), transaction);
      },

      updateConstraint(patch = {}) {
        if (!draft.recipe.constraint) throw new Error("Nessun Vincolo globale impostato.");
        const current = clone(draft.recipe.constraint);
        const constraint = {
          ...current,
          ...clone(patch),
          definitionId:current.definitionId
        };
        if (typeof A.findSigianFreeConstraintComponentInstance === "function") {
          const currentId = A.sigianConstraintInventoryId?.(current) || null;
          const nextId = A.sigianConstraintInventoryId?.(constraint) || null;
          const existing = draftBinding("constraint", "constraint");
          if (currentId && currentId === nextId && existing?.componentInstanceId) {
            const instance = A.getSigianComponentInstance?.(existing.componentInstanceId);
            if (instance) {
              constraint.affinity = clone(instance.affinity);
              return commitRecipe(recipeWith({ constraint }));
            }
          }
          const transaction = transactionWithoutBinding("constraint", "constraint");
          const instance = A.findSigianFreeConstraintComponentInstance(constraint, draft.recipe.school, { transaction });
          if (!instance) throw new Error("Nessuna copia libera di questa variante del Vincolo.");
          constraint.affinity = clone(instance.affinity);
          return commitRecipeAndTransaction(
            recipeWith({ constraint }),
            bindTransaction(transaction, "constraint", "constraint", instance, nextId)
          );
        }
        if (typeof A.getSigianOwnedConstraintQuantity === "function"
          && A.getSigianOwnedConstraintQuantity(constraint) < 1) {
          throw new Error(`Questa copia del Vincolo non è presente nell'Inventario.`);
        }
        return commitRecipe(recipeWith({ constraint }));
      },

      setConstraintGrade(grade) {
        if (!draft.recipe.constraint) throw new Error("Nessun Vincolo globale impostato.");
        return this.updateConstraint(constraintGradeDefaults(draft.recipe.constraint.definitionId, grade));
      },

      setConstraintSchool(school) {
        if (!draft.recipe.constraint) throw new Error("Nessun Vincolo globale impostato.");
        const definition = A.getSigianSchool?.(school);
        if (!definition || definition.status !== "active") throw new Error(`Scuola non attiva: ${school}.`);
        return this.updateConstraint({ school:definition.id });
      },

      setConstraintParameter(key, value) {
        if (!draft.recipe.constraint) throw new Error("Nessun Vincolo globale impostato.");
        const normalizedKey = String(key || "");
        const spec = constraintParameterSpecs(draft.recipe.constraint).find(item => item.key === normalizedKey);
        if (!spec) throw new Error(`Parametro Vincolo non supportato: ${normalizedKey}.`);
        const numeric = Math.trunc(Number(value));
        if (!Number.isFinite(numeric) || !spec.values.includes(numeric)) {
          throw new Error(`Valore ${value} non ammesso per ${normalizedKey}.`);
        }
        if (spec.drivesGrade) {
          return this.setConstraintGrade(numeric);
        }
        return this.updateConstraint({ [normalizedKey]:numeric });
      },

      removeConstraint() {
        if (!draft.recipe.constraint) return this.snapshot();
        if (typeof A.unbindSigianForgeTransactionComponent === "function") {
          return commitRecipeAndTransaction(
            recipeWith({ constraint:null }),
            transactionWithoutBinding("constraint", "constraint")
          );
        }
        return commitRecipe(recipeWith({ constraint:null }));
      },

      addSigil(sigilId) {
        if (draft.recipe.sigils.length >= (A.SIGIAN_MAX_PRIMARY_SIGILS || 3)) {
          throw new Error(`La Formula può contenere al massimo ${A.SIGIAN_MAX_PRIMARY_SIGILS || 3} Sigilli primari.`);
        }
        const next = clone(draft.recipe.sigils);
        let candidate = defaultForgeSigil(sigilId, draft.recipe.school, next.length);
        let counter = 1;
        const used = new Set(next.map(item => item.slotId));
        while (used.has(candidate.slotId)) {
          candidate.slotId = `forge-${next.length + 1}-${sigilId}-${counter++}`;
        }
        next.push(candidate);
        return commitRecipe(recipeWith({ sigils: next }));
      },

      getCollectibleAddSuggestion(collectibleId) {
        const suggestion = collectibleAddSuggestion(collectibleId);
        return suggestion ? clone(suggestion) : null;
      },

      listHorizontalCraftingOptions() {
        return clone(horizontalFormulaCraftingOptions());
      },

      stageHorizontalFormulaFusion(leftSlotId, rightSlotId) {
        return fuseExistingHorizontalPair(String(leftSlotId || ""), String(rightSlotId || ""));
      },

      stageHorizontalFormulaSplit(slotId) {
        return splitHorizontalTide(String(slotId || ""));
      },

      applyCollectibleAddSuggestion(collectibleId, options = {}) {
        const suggestion = collectibleAddSuggestion(collectibleId);
        if (!suggestion) return this.addCollectibleSigil(collectibleId);
        const strategy = suggestion.strategy;
        if (strategy === "use-horizontal-output-free") {
          return replaceWithFreeCollectiblePreservingSemantics(
            suggestion.existingSlotId,
            suggestion.targetCollectibleId,
            suggestion.semantics
          );
        }
        if (strategy === "fuse-horizontal-free") {
          return fuseHorizontalIncoming(
            suggestion.existingSlotId,
            suggestion.collectibleId,
            suggestion.targetCollectibleId
          );
        }
        if (strategy === "fuse-horizontal-reclaim") {
          const ids = [...new Set((options.reclaimInstanceIds || []).map(String))];
          if (ids.length !== Number(suggestion.requiredReclaims || 0)) {
            throw new Error(`Seleziona esattamente ${suggestion.requiredReclaims} copie da recuperare.`);
          }
          return fuseHorizontalIncoming(
            suggestion.existingSlotId,
            suggestion.collectibleId,
            suggestion.targetCollectibleId,
            ids
          );
        }
        if (strategy === "replace-selected-free" || strategy === "use-higher-free") {
          return this.replaceCollectibleSigil(suggestion.existingSlotId, suggestion.targetCollectibleId);
        }
        if (strategy === "replace-selected-reclaim" || strategy === "use-higher-reclaim") {
          const instanceId = String((options.reclaimInstanceIds || [])[0] || "");
          if (!instanceId) throw new Error("Seleziona la copia assegnata da recuperare.");
          return replaceWithReclaimedCollectible(
            suggestion.existingSlotId,
            suggestion.targetCollectibleId,
            instanceId
          );
        }
        if (strategy === "fuse-free") {
          return fuseSameFamilyIntoSlot(
            suggestion.existingSlotId,
            suggestion.collectibleId,
            suggestion.targetCollectibleId
          );
        }
        if (strategy === "fuse-reclaim") {
          const ids = [...new Set((options.reclaimInstanceIds || []).map(String))];
          if (ids.length !== Number(suggestion.requiredReclaims || 0)) {
            throw new Error(`Seleziona esattamente ${suggestion.requiredReclaims} copie da recuperare.`);
          }
          return fuseSameFamilyIntoSlot(
            suggestion.existingSlotId,
            suggestion.collectibleId,
            suggestion.targetCollectibleId,
            ids
          );
        }
        throw new Error("La combinazione selezionata richiede una normalizzazione canonica prima di essere aggiunta.");
      },

      addCollectibleSigil(collectibleId) {
        if (collectibleAddSuggestion(collectibleId)) {
          throw new Error("Il Sigillo richiede il suggerimento di normalizzazione della Forgia prima di essere aggiunto.");
        }
        if (draft.recipe.sigils.length >= (A.SIGIAN_MAX_PRIMARY_SIGILS || 3)) {
          throw new Error(`La Formula può contenere al massimo ${A.SIGIAN_MAX_PRIMARY_SIGILS || 3} Sigilli primari.`);
        }
        const next = clone(draft.recipe.sigils);
        let candidate = defaultForgeCollectibleSigil(collectibleId, draft.recipe.school, next.length);
        let counter = 1;
        const used = new Set(next.map(item => item.slotId));
        while (used.has(candidate.slotId)) {
          candidate.slotId = `forge-${next.length + 1}-${collectibleId}-${counter++}`;
        }

        if (typeof A.findSigianFreeCollectibleComponentInstance === "function") {
          const instance = A.findSigianFreeCollectibleComponentInstance(collectibleId, draft.recipe.school, {
            transaction:draft.transaction
          });
          if (!instance) throw new Error(`Nessuna copia libera di ${collectibleId}.`);
          candidate.affinity = clone(instance.affinity);
          next.push(candidate);
          const inventoryId = A.sigianCollectibleInventoryIdentity?.(collectibleId, draft.recipe.school)?.inventoryId || null;
          const transaction = bindTransaction(draft.transaction, "sigil", candidate.slotId, instance, inventoryId);
          return commitRecipeAndTransaction(recipeWith({ sigils:next }), transaction);
        }

        const owned = typeof A.getSigianOwnedCollectibleSigilQuantity === "function"
          ? A.getSigianOwnedCollectibleSigilQuantity(collectibleId, draft.recipe.school)
          : null;
        const usedCopies = draft.recipe.sigils.filter(item => item.collectibleId === collectibleId).length;
        if (owned != null && usedCopies >= owned) {
          throw new Error(`Non possiedi altre copie di ${collectibleId}.`);
        }
        next.push(candidate);
        return commitRecipe(recipeWith({ sigils:next }));
      },

      addReclaimedCollectibleSigil(collectibleId, componentInstanceId) {
        if (collectibleAddSuggestion(collectibleId)) {
          throw new Error("Il Sigillo richiede il suggerimento di normalizzazione della Forgia prima di essere aggiunto.");
        }
        if (draft.recipe.sigils.length >= (A.SIGIAN_MAX_PRIMARY_SIGILS || 3)) {
          throw new Error(`La Formula può contenere al massimo ${A.SIGIAN_MAX_PRIMARY_SIGILS || 3} Sigilli primari.`);
        }
        const candidates = A.listSigianAssignedCollectibleComponentInstances?.(
          collectibleId,
          draft.recipe.school,
          { transaction:draft.transaction }
        ) || [];
        const instance = candidates.find(item => item.componentInstanceId === String(componentInstanceId || ""));
        if (!instance) throw new Error("La copia assegnata del Sigillo non è più disponibile per il recupero.");

        const next = clone(draft.recipe.sigils);
        let candidate = defaultForgeCollectibleSigil(collectibleId, draft.recipe.school, next.length);
        let counter = 1;
        const used = new Set(next.map(item => item.slotId));
        while (used.has(candidate.slotId)) {
          candidate.slotId = `forge-${next.length + 1}-${collectibleId}-${counter++}`;
        }
        candidate.affinity = clone(instance.affinity);
        next.push(candidate);

        const inventoryId = A.sigianCollectibleInventoryIdentity?.(collectibleId, draft.recipe.school)?.inventoryId || null;
        const transaction = reclaimAndBindTransaction(
          draft.transaction,
          "sigil",
          candidate.slotId,
          instance,
          inventoryId
        );
        return commitRecipeAndTransaction(recipeWith({ sigils:next }), transaction);
      },

      removeSigil(slotId) {
        const next = draft.recipe.sigils.filter(item => item.slotId !== slotId);
        if (next.length === draft.recipe.sigils.length) return this.snapshot();
        if (typeof A.unbindSigianForgeTransactionComponent === "function") {
          return commitRecipeAndTransaction(
            recipeWith({ sigils:next }),
            transactionWithoutBinding("sigil", slotId)
          );
        }
        return commitRecipe(recipeWith({ sigils: next }));
      },

      replaceSigil(slotId, sigilId) {
        const index = draft.recipe.sigils.findIndex(item => item.slotId === slotId);
        if (index < 0) throw new Error(`Slot Sigillo non trovato: ${slotId}.`);
        const next = clone(draft.recipe.sigils);
        const replacement = defaultForgeSigil(sigilId, draft.recipe.school, index);
        replacement.slotId = slotId;
        next[index] = replacement;
        return commitRecipe(recipeWith({ sigils: next }));
      },

      replaceCollectibleSigil(slotId, collectibleId) {
        const index = draft.recipe.sigils.findIndex(item => item.slotId === slotId);
        if (index < 0) throw new Error(`Slot Sigillo non trovato: ${slotId}.`);
        const targetFamily = collectibleFamily(collectibleId);
        if (targetFamily && draft.recipe.sigils.some((item, itemIndex) =>
          itemIndex !== index && collectibleFamily(item.collectibleId)?.key === targetFamily.key
        )) {
          throw new Error("La famiglia del Sigillo è già presente in un altro slot: normalizzala prima della sostituzione.");
        }
        const current = draft.recipe.sigils[index];

        if (typeof A.findSigianFreeCollectibleComponentInstance === "function") {
          const existing = draftBinding("sigil", slotId);
          if (current.collectibleId === collectibleId && existing?.componentInstanceId) return this.snapshot();

          const transaction = transactionWithoutBinding("sigil", slotId);
          const instance = A.findSigianFreeCollectibleComponentInstance(collectibleId, draft.recipe.school, { transaction });
          if (!instance) throw new Error(`Nessuna copia libera di ${collectibleId}.`);
          const next = clone(draft.recipe.sigils);
          const replacement = defaultForgeCollectibleSigil(collectibleId, draft.recipe.school, index);
          replacement.slotId = slotId;
          replacement.affinity = clone(instance.affinity);
          next[index] = replacement;
          const inventoryId = A.sigianCollectibleInventoryIdentity?.(collectibleId, draft.recipe.school)?.inventoryId || null;
          return commitRecipeAndTransaction(
            recipeWith({ sigils:next }),
            bindTransaction(transaction, "sigil", slotId, instance, inventoryId)
          );
        }

        const owned = typeof A.getSigianOwnedCollectibleSigilQuantity === "function"
          ? A.getSigianOwnedCollectibleSigilQuantity(collectibleId, draft.recipe.school)
          : null;
        const usedCopies = draft.recipe.sigils.filter((item, itemIndex) =>
          itemIndex !== index && item.collectibleId === collectibleId
        ).length;
        if (owned != null && usedCopies >= owned) {
          throw new Error(`Non possiedi altre copie di ${collectibleId}.`);
        }
        const next = clone(draft.recipe.sigils);
        const replacement = defaultForgeCollectibleSigil(collectibleId, draft.recipe.school, index);
        replacement.slotId = slotId;
        next[index] = replacement;
        return commitRecipe(recipeWith({ sigils: next }));
      },

      updateSigil(slotId, patch = {}) {
        const index = draft.recipe.sigils.findIndex(item => item.slotId === slotId);
        if (index < 0) throw new Error(`Slot Sigillo non trovato: ${slotId}.`);
        const current = clone(draft.recipe.sigils[index]);
        const nextSigil = {
          ...current,
          ...(patch.grade !== undefined ? { grade: patch.grade } : {}),
          ...(patch.intensity !== undefined ? { intensity: patch.intensity } : {}),
          ...(patch.collectibleId !== undefined ? { collectibleId: patch.collectibleId } : {}),
          ...(patch.affinity !== undefined ? { affinity: clone(patch.affinity) } : {}),
          ...(patch.config ? { config: { ...current.config, ...clone(patch.config) } } : {}),
          ...(patch.modifiers ? { modifiers: clone(patch.modifiers) } : {})
        };
        const next = clone(draft.recipe.sigils);
        next[index] = nextSigil;
        return commitRecipe(recipeWith({ sigils: next }));
      },

      setSigilGrade(slotId, grade) {
        const current = draft.recipe.sigils.find(item => item.slotId === slotId);
        if (current?.collectibleId) {
          throw new Error("Il Grado appartiene all'identità del Sigillo: scegli direttamente un altro Sigillo dal catalogo.");
        }
        const numeric = Math.max(1, Math.trunc(Number(grade || 1)));
        return this.updateSigil(slotId, { grade:numeric });
      },

      setSigilIntensity(slotId, intensity) {
        const current = draft.recipe.sigils.find(item => item.slotId === slotId);
        if (!current) throw new Error(`Slot Sigillo non trovato: ${slotId}.`);
        if (!current.collectibleId) throw new Error("L'intensità guidata è disponibile solo per i Sigilli collezionabili atomici.");
        const numeric = Number(intensity);
        if (!A.sigianCollectibleAllowsIntensity?.(current.collectibleId, numeric)) {
          throw new Error(`Intensità ${intensity} non ammessa per ${current.collectibleId}.`);
        }
        return this.updateSigil(slotId, { intensity:numeric });
      },

      setSigilAffinity(slotId, affinity) {
        const current = draft.recipe.sigils.find(item => item.slotId === slotId);
        if (current?.collectibleId && draftBinding("sigil", slotId)) {
          throw new Error("L'Affinità è determinata dalla copia posseduta e non può essere modificata direttamente.");
        }
        const normalized = A.normalizeSigianAffinity?.(affinity, draft.recipe.school);
        if (!normalized) throw new Error("Affinità Sigillo non valida.");
        const validation = A.validateSigianAffinity?.(normalized);
        if (validation && !validation.valid) throw new Error(validation.errors.join(" "));
        return this.updateSigil(slotId, { affinity:normalized });
      },

      setSigilConfig(slotId, key, value) {
        const index = draft.recipe.sigils.findIndex(item => item.slotId === slotId);
        if (index < 0) throw new Error(`Slot Sigillo non trovato: ${slotId}.`);
        const currentSigil = draft.recipe.sigils[index];
        const collectible = currentSigil.collectibleId ? A.getSigianCollectibleSigil?.(currentSigil.collectibleId) : null;
        if (collectible?.hiddenConfigKeys?.includes(key)) {
          throw new Error(`La configurazione ${key} è incorporata nell'identità di ${collectible.displayName}.`);
        }
        const definition = A.getCanonicalSigil?.(currentSigil.sigilId);
        const schema = definition?.configSchema?.[key];
        if (schema === undefined) throw new Error(`Configurazione ${key} non supportata da ${definition?.id || "?"}.`);

        let normalized = value;
        if (schema === "number") {
          normalized = Number(value);
          if (!Number.isFinite(normalized)) throw new Error(`Configurazione numerica non valida: ${key}.`);
        } else if (schema === "school") {
          const school = A.getSigianSchool?.(value);
          if (!school || school.status !== "active") throw new Error(`Scuola non valida per ${key}: ${value}.`);
          normalized = school.id;
        } else if (schema === "schools") {
          if (value === "all") {
            normalized = "all";
          } else {
            const requested = Array.isArray(value) ? value : String(value || "").split(",").filter(Boolean);
            normalized = [...new Set(requested.map(item => String(item || "").trim()).filter(Boolean))];
            if (normalized.length < 1 || normalized.length > 3) throw new Error("Seleziona da 1 a 3 Scuole, oppure Tutte.");
            normalized.forEach(schoolId => {
              const school = A.getSigianSchool?.(schoolId);
              if (!school || school.status !== "active") throw new Error(`Scuola non valida: ${schoolId}.`);
            });
          }
        } else if (Array.isArray(schema) && !schema.includes(value)) {
          throw new Error(`Valore ${value} non supportato per ${key}.`);
        }
        return this.updateSigil(slotId, { config: { [key]:normalized } });
      },

      setSigilModifier(slotId, family, modifierId) {
        const index = draft.recipe.sigils.findIndex(item => item.slotId === slotId);
        if (index < 0) throw new Error(`Slot Sigillo non trovato: ${slotId}.`);
        const sigil = draft.recipe.sigils[index];
        const collectible = sigil.collectibleId ? A.getSigianCollectibleSigil?.(sigil.collectibleId) : null;
        if (collectible?.hiddenModifierFamilies?.includes(family)) {
          throw new Error(`La famiglia ${family} è incorporata nell'identità di ${collectible.displayName}.`);
        }
        const definition = A.getCanonicalSigil?.(sigil.sigilId);
        const allowed = definition?.modifierOptions?.[family];
        if (!Array.isArray(allowed)) throw new Error(`Famiglia Modifier non supportata: ${family}.`);

        const nextModifiers = clone(sigil.modifiers || []).filter(item => A.getSigianAdvancedModifier?.(item.id)?.family !== family);
        if (modifierId) {
          if (!allowed.includes(modifierId)) throw new Error(`Modifier ${modifierId} non ammesso per ${sigil.sigilId}.`);
          const modifierDefinition = A.getSigianAdvancedModifier?.(modifierId);
          if (!modifierDefinition || modifierDefinition.status !== "active") throw new Error(`Modifier non attivo: ${modifierId}.`);
          nextModifiers.push({
            id: modifierId,
            params: defaultModifierParams(modifierId, draft.recipe.school)
          });
        }
        return this.updateSigil(slotId, { modifiers:nextModifiers });
      },

      setSigilModifierParam(slotId, family, key, value) {
        const index = draft.recipe.sigils.findIndex(item => item.slotId === slotId);
        if (index < 0) throw new Error(`Slot Sigillo non trovato: ${slotId}.`);
        const sigil = draft.recipe.sigils[index];
        const modifierIndex = (sigil.modifiers || []).findIndex(item => A.getSigianAdvancedModifier?.(item.id)?.family === family);
        if (modifierIndex < 0) throw new Error(`Nessun Modifier ${family} attivo nello slot ${slotId}.`);

        const nextModifiers = clone(sigil.modifiers);
        const modifier = nextModifiers[modifierIndex];
        const modifierDefinition = A.getSigianAdvancedModifier?.(modifier.id);
        const schema = modifierDefinition?.paramsSchema?.[key];
        if (schema === undefined) throw new Error(`Parametro ${key} non supportato da ${modifier.id}.`);

        let normalized = value;
        if (schema === "number") {
          normalized = Number(value);
          if (!Number.isFinite(normalized)) throw new Error(`Parametro numerico non valido: ${key}.`);
        } else if (schema === "school") {
          const school = A.getSigianSchool?.(value);
          if (!school || school.status !== "active") throw new Error(`Scuola non valida per ${key}: ${value}.`);
          normalized = school.id;
        } else if (Array.isArray(schema) && !schema.includes(value)) {
          throw new Error(`Valore ${value} non supportato per ${key}.`);
        }

        modifier.params = { ...(modifier.params || {}), [key]:normalized };
        return this.updateSigil(slotId, { modifiers:nextModifiers });
      },

      undo() {
        if (!history.length) return this.snapshot();
        future.push(clone(draft));
        draft = history.pop();
        persist();
        return notify();
      },

      redo() {
        if (!future.length) return this.snapshot();
        history.push(clone(draft));
        draft = future.pop();
        persist();
        return notify();
      },

      clearPersistedDraft() {
        storage.removeItem(FORGE_DRAFT_STORAGE_KEY);
      }
    });

    persist();
    return api;
  }

  A.SIGIAN_FORGE_DRAFT_SCHEMA_VERSION = FORGE_DRAFT_SCHEMA_VERSION;
  A.SIGIAN_FORGE_DRAFT_STORAGE_KEY = FORGE_DRAFT_STORAGE_KEY;
  A.createSigianForgeDefaultSigil = defaultForgeSigil;
  A.createSigianForgeCollectibleSigil = defaultForgeCollectibleSigil;
  A.createSigianForgeDefaultModifierParams = defaultModifierParams;
  A.getSigianForgeConstraintParameters = function getSigianForgeConstraintParameters(constraint) {
    return constraintParameterSpecs(constraint).map(item => ({
      ...item,
      values:[...item.values]
    }));
  };
  A.migrateSigianForgeLegacySigils = migrateLegacyForgeSigils;
  A.normalizeSigianForgeDraft = normalizeDraft;
  A.analyzeSigianForgeDraft = draftAnalysis;
  A.createSigianForgeSession = createSession;
  A.createSigianForgeTestBundle = function createSigianForgeTestBundle(input, options = {}) {
    const draft = normalizeDraft(input?.recipe ? input : { recipe:input });
    const analysis = draftAnalysis(draft);
    if (!analysis.valid) {
      throw new Error(`Prova Formula non disponibile: ${analysis.tryBlockers.join(", ") || "draft non valido"}.`);
    }
    if (!analysis.canTry) {
      throw new Error(analysis.tryError || `Prova Formula non disponibile: ${analysis.tryBlockers.join(", ")}.`);
    }
    const level = Math.max(1, Math.trunc(Number(options.level ?? analysis.minimumLevel ?? 1)));
    const formula = A.compileFormulaRecipe(draft.recipe, {
      level,
      set:"forge-test"
    });
    const card = A.materializeLegacyCardFromFormula(formula);
    card.formulaRecipe = clone(draft.recipe);
    card.__forgeTest = true;
    card.set = "forge-test";
    return {
      mode:"simulation",
      draftId:draft.id,
      revision:draft.revision,
      level,
      recipe:clone(draft.recipe),
      transaction:clone(draft.transaction),
      formula,
      card
    };
  };

  A.loadSigianForgeDraft = function loadSigianForgeDraft(storage) {
    const target = resolveStorage(storage);
    try {
      const parsed = JSON.parse(target.getItem(FORGE_DRAFT_STORAGE_KEY) || "null");
      return parsed ? normalizeDraft(parsed) : null;
    } catch {
      return null;
    }
  };
})(window.Arcane = window.Arcane || {});
