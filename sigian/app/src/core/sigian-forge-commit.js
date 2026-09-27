(function (A) {
  "use strict";

  const JOURNAL_SCHEMA_VERSION = 1;
  const JOURNAL_KEY = "sigian.forge.atomicCommit.v1";
  let recovering = false;
  let committing = false;

  function clone(value) {
    if (typeof A.deepClone === "function") return A.deepClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function storage() {
    return typeof localStorage !== "undefined" ? localStorage : null;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function normalizeFormulaInstanceId(value) {
    const id = String(value || "").trim();
    if (!id) return "";
    if (id.startsWith("formula:") || id.startsWith("owned:")) return id;
    return `formula:${id}`;
  }

  function exactAffinity(left, right) {
    const a = A.normalizeSigianCraftAffinity?.(left) || left;
    const b = A.normalizeSigianCraftAffinity?.(right) || right;
    if (!a || !b || a.mode !== b.mode) return false;
    const as = a.schools || [];
    const bs = b.schools || [];
    return as.length === bs.length && as.every((school, index) => school === bs[index]);
  }

  function affinityAllows(affinity, school) {
    const normalized = A.normalizeSigianCraftAffinity?.(affinity) || affinity;
    if (!normalized) return false;
    return normalized.mode === "universal" || (normalized.schools || []).includes(String(school || ""));
  }

  function canonicalInventoryId(component) {
    return A.sigianCanonicalComponentInventoryId?.(component) || "";
  }

  function rawValue(target, key) {
    return target.getItem(key);
  }

  function applyRaw(target, key, value) {
    if (value == null) target.removeItem(key);
    else target.setItem(key, value);
  }

  function storeKeys() {
    return {
      components:A.SIGIAN_COMPONENT_INSTANCE_STORAGE_KEY || "sigian.inventory.componentInstances.v1",
      formulas:A.SIGIAN_FORMULA_INSTANCE_STORAGE_KEY || "sigian.inventory.formulaInstances.v1",
      compositions:A.SIGIAN_FORMULA_COMPOSITION_STORAGE_KEY || "sigian.inventory.formulaCompositions.v1"
    };
  }

  A.SIGIAN_FORGE_ATOMIC_COMMIT_JOURNAL_KEY = JOURNAL_KEY;

  A.recoverSigianForgeAtomicCommit = function recoverSigianForgeAtomicCommit() {
    if (recovering || committing) return false;
    const target = storage();
    if (!target) return false;
    const raw = target.getItem(JOURNAL_KEY);
    if (!raw) return false;

    recovering = true;
    try {
      const journal = JSON.parse(raw);
      if (!journal || journal.schemaVersion !== JOURNAL_SCHEMA_VERSION || !journal.after) {
        target.removeItem(JOURNAL_KEY);
        return false;
      }
      Object.entries(journal.after).forEach(([key, value]) => applyRaw(target, key, value));
      target.removeItem(JOURNAL_KEY);
      return true;
    } finally {
      recovering = false;
    }
  };

  function formulaValidationBlockers(recipe) {
    const blockers = [];
    const validation = A.validateFormulaRecipe?.(recipe);
    if (validation && !validation.valid) blockers.push("recipe-invalid");
    if (recipe.type === "spell" && !(recipe.sigils || []).length) blockers.push("spell-requires-sigil");

    const familyCounts = new Map();
    (recipe.sigils || []).forEach(sigil => {
      if (!sigil.collectibleId) return;
      const collectible = A.getSigianCollectibleSigil?.(sigil.collectibleId);
      const family = collectible?.templateId ? String(collectible.templateId) : "";
      if (!family) return;
      familyCounts.set(family, (familyCounts.get(family) || 0) + 1);
    });
    if ([...familyCounts.values()].some(count => count > 1)) blockers.push("same-family-redundancy");

    const sigils = recipe.sigils || [];
    for (let leftIndex = 0; leftIndex < sigils.length - 1; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < sigils.length; rightIndex += 1) {
        const left = sigils[leftIndex];
        const right = sigils[rightIndex];
        const leftTemplate = A.getSigianCollectibleSigil?.(left.collectibleId)?.templateId || "";
        const rightTemplate = A.getSigianCollectibleSigil?.(right.collectibleId)?.templateId || "";
        const roles = new Set([leftTemplate, rightTemplate]);
        if (!roles.has("wave-field") || !roles.has("damage-hero") || roles.size !== 2) continue;
        if (Number(left.grade) !== Number(right.grade)) continue;
        if (Number(left.intensity) !== Number(right.intensity)) continue;
        if (String(left.config?.when || "onDeploy") !== String(right.config?.when || "onDeploy")) continue;
        blockers.push("horizontal-redundancy");
      }
    }
    return { blockers, validation };
  }

  function normalizedProductionEvaluation(input) {
    if (!input || String(input.status || "") !== "production") return null;
    const arcaneValue = Number(input.arcaneValue);
    const minimumLevel = Math.trunc(Number(input.minimumLevel));
    const evaluatorId = String(input.evaluatorId || "").trim();
    if (!Number.isFinite(arcaneValue) || !Number.isInteger(minimumLevel) || minimumLevel < 1 || !evaluatorId) return null;
    return {
      status:"production",
      arcaneValue,
      minimumLevel,
      evaluatorId,
      evaluatedAt:String(input.evaluatedAt || nowIso())
    };
  }

  function nextPersistentComponentId(store, usedIds) {
    let id = "";
    do {
      const sequence = Math.max(1, Math.trunc(Number(store.nextSequence || 1)));
      store.nextSequence = sequence + 1;
      id = `cmp-${String(sequence).padStart(6, "0")}`;
    } while (usedIds.has(id));
    usedIds.add(id);
    return id;
  }

  function persistentCraftOutput(store, component, inventoryId, usedIds) {
    const definitionId = String(component?.definitionId || component?.canonicalDefinitionId || "");
    if (!definitionId || !inventoryId) throw new Error("Output crafting persistente incompleto.");
    return {
      componentInstanceId:nextPersistentComponentId(store, usedIds),
      kind:component?.kind === "constraint" ? "constraint" : "sigil",
      inventoryId:String(inventoryId),
      definitionId,
      effectSchool:component?.effectSchool == null ? null : String(component.effectSchool),
      grade:component?.grade == null ? null : Math.max(1, Math.trunc(Number(component.grade || 1))),
      affinity:clone(A.normalizeSigianCraftAffinity?.(component.affinity) || component.affinity),
      allocation:{ state:"free" },
      createdAt:nowIso()
    };
  }

  function getById(store) {
    return new Map(store.instances.map(instance => [String(instance.componentInstanceId), instance]));
  }

  function resolveOperationId(value, virtualMap) {
    const id = String(value || "");
    return virtualMap.get(id) || id;
  }

  function prepareCommit(input = {}) {
    A.recoverSigianForgeAtomicCommit?.();

    const transaction = A.createSigianForgeTransactionPlan?.(input.transaction || {}) || clone(input.transaction || {});
    const targetFormulaInstanceId = normalizeFormulaInstanceId(input.targetFormulaInstanceId);
    const requestedLifecycle = String(input.targetLifecycleState || "NEEDS_RESEAL").toUpperCase();
    const recipe = A.createFormulaRecipe?.(input.recipe || {}) || clone(input.recipe || {});
    const blockers = [];
    const issues = [];

    if (!targetFormulaInstanceId) blockers.push("target-formula-missing");
    if (!["NEEDS_RESEAL", "SEALED"].includes(requestedLifecycle)) blockers.push("target-lifecycle-invalid");

    const recipeCheck = formulaValidationBlockers(recipe);
    blockers.push(...recipeCheck.blockers);

    const componentSnapshot = A.getSigianComponentInventorySnapshot?.();
    const formulaSnapshot = A.getSigianFormulaInventorySnapshot?.();
    const compositionSnapshot = A.getSigianFormulaCompositionSnapshot?.();
    if (!componentSnapshot || !formulaSnapshot || !compositionSnapshot) {
      blockers.push("persistence-layer-unavailable");
      return { valid:false, blockers:[...new Set(blockers)], issues, recipe, transaction, targetFormulaInstanceId };
    }

    if (transaction.baselineRevision == null
      || Number(transaction.baselineRevision) !== Number(componentSnapshot.revision)) {
      blockers.push("component-revision-stale");
    }
    if (transaction.formulaBaselineRevision == null
      || Number(transaction.formulaBaselineRevision) !== Number(formulaSnapshot.revision)) {
      blockers.push("formula-revision-stale");
    }
    if (transaction.compositionBaselineRevision == null
      || Number(transaction.compositionBaselineRevision) !== Number(compositionSnapshot.revision)) {
      blockers.push("composition-revision-stale");
    }

    const existingTargetFormula = formulaSnapshot.instances.find(
      item => item.formulaInstanceId === targetFormulaInstanceId
    );
    const requestedRecipeId = Object.prototype.hasOwnProperty.call(input, "recipeId")
      ? (input.recipeId == null ? null : String(input.recipeId))
      : (existingTargetFormula?.recipeId ?? null);
    if (requestedRecipeId && typeof A.isSigianRecipeKnown === "function" && !A.isSigianRecipeKnown(requestedRecipeId)) {
      blockers.push("recipe-reference-missing");
    }

    const productionEvaluation = normalizedProductionEvaluation(input.evaluation);
    if (requestedLifecycle === "SEALED" && !productionEvaluation) {
      blockers.push("production-evaluation-required");
    }

    if (blockers.length) {
      return {
        valid:false,
        blockers:[...new Set(blockers)],
        issues,
        recipe,
        transaction,
        targetFormulaInstanceId,
        currentRevisions:{
          components:componentSnapshot.revision,
          formulas:formulaSnapshot.revision,
          compositions:compositionSnapshot.revision
        }
      };
    }

    const componentStore = clone(componentSnapshot);
    const formulaStore = clone(formulaSnapshot);
    const compositionStore = clone(compositionSnapshot);
    const originalComponents = new Map(componentSnapshot.instances.map(instance => [instance.componentInstanceId, clone(instance)]));
    const components = getById(componentStore);
    const usedIds = new Set(components.keys());
    const virtualMap = new Map();
    const sourceFormulaIds = new Set();
    let componentTouched = false;

    componentStore.instances.forEach(instance => {
      if (instance.allocation?.state === "assigned"
        && instance.allocation.formulaInstanceId === targetFormulaInstanceId) {
        instance.allocation = { state:"free" };
        componentTouched = true;
      }
    });

    function refreshComponentsMap() {
      components.clear();
      componentStore.instances.forEach(instance => components.set(instance.componentInstanceId, instance));
    }
    refreshComponentsMap();

    function removeComponent(id) {
      const index = componentStore.instances.findIndex(instance => instance.componentInstanceId === id);
      if (index < 0) throw new Error(`Componente crafting non trovato: ${id}.`);
      componentStore.instances.splice(index, 1);
      components.delete(id);
      componentTouched = true;
    }

    function addOutput(virtualId, plannedComponent, inventoryId) {
      if (!virtualId) throw new Error("ID virtuale output crafting mancante.");
      if (virtualMap.has(virtualId)) throw new Error(`Output virtuale duplicato: ${virtualId}.`);
      const output = persistentCraftOutput(componentStore, plannedComponent, inventoryId, usedIds);
      componentStore.instances.push(output);
      components.set(output.componentInstanceId, output);
      virtualMap.set(String(virtualId), output.componentInstanceId);
      componentTouched = true;
      return output;
    }

    for (const operation of transaction.operations || []) {
      const payload = operation.payload || {};
      if (!["assign", "reclaim", "fuse", "split"].includes(operation.type)) {
        throw new Error(`Operazione Forgia non committabile: ${operation.type}.`);
      }

      if (operation.type === "reclaim") {
        const id = resolveOperationId(payload.componentInstanceId, virtualMap);
        const original = originalComponents.get(id);
        const current = components.get(id);
        const sourceFormulaInstanceId = String(payload.sourceFormulaInstanceId || "");
        const sourceSlotId = String(payload.sourceSlotId || "");
        if (!current || !original
          || sourceFormulaInstanceId === targetFormulaInstanceId
          || original.allocation?.state !== "assigned"
          || original.allocation.formulaInstanceId !== sourceFormulaInstanceId
          || original.allocation.slotId !== sourceSlotId
          || current.allocation?.state !== "assigned"
          || current.allocation.formulaInstanceId !== sourceFormulaInstanceId
          || current.allocation.slotId !== sourceSlotId) {
          throw new Error(`Recupero non più valido per ${id}.`);
        }
        const sourceFormula = formulaStore.instances.find(item => item.formulaInstanceId === sourceFormulaInstanceId);
        if (!sourceFormula || sourceFormula.lifecycleState === "DISSOLVED") {
          throw new Error(`Formula sorgente non recuperabile: ${sourceFormulaInstanceId}.`);
        }
        current.allocation = { state:"free" };
        sourceFormulaIds.add(sourceFormulaInstanceId);
        componentTouched = true;
        continue;
      }

      if (operation.type === "fuse") {
        const ids = (payload.inputInstanceIds || []).map(id => resolveOperationId(id, virtualMap));
        if (ids.length !== 2 || ids[0] === ids[1]) throw new Error("Fusion commit: input non validi.");
        const left = components.get(ids[0]);
        const right = components.get(ids[1]);
        if (!left || !right || left.allocation?.state !== "free" || right.allocation?.state !== "free") {
          throw new Error("Fusion commit: gli input non sono più liberi.");
        }

        let planned;
        if (payload.craftingAxis === "horizontal") {
          planned = A.planSigianHorizontalFusion?.(left, right, {
            leftSemantics:payload.semantics,
            rightSemantics:payload.semantics
          });
          if (!planned || String(planned.recipeId || "") !== String(payload.recipeId || "")) {
            throw new Error("Fusion H001 commit: ricetta non più valida.");
          }
        } else {
          planned = A.planSigianVerticalFusion?.(left, right);
        }
        if (!planned?.output) throw new Error("Fusion commit non più valida.");
        const outputInventoryId = canonicalInventoryId(planned.output);
        if (!outputInventoryId || outputInventoryId !== String(payload.outputInventoryId || "")) {
          throw new Error("Fusion commit: identità output cambiata.");
        }

        removeComponent(left.componentInstanceId);
        removeComponent(right.componentInstanceId);
        addOutput(payload.outputInstance?.componentInstanceId, planned.output, outputInventoryId);
        continue;
      }

      if (operation.type === "split") {
        const inputId = resolveOperationId(payload.inputInstanceId, virtualMap);
        const current = components.get(inputId);
        if (!current || current.allocation?.state !== "free") {
          throw new Error("Split commit: input non più libero.");
        }

        let planned;
        if (payload.craftingAxis === "horizontal") {
          planned = A.planSigianHorizontalSplit?.(current, { semantics:payload.semantics });
          if (!planned || String(planned.recipeId || "") !== String(payload.recipeId || "")) {
            throw new Error("Split H001 commit: ricetta non più valida.");
          }
        } else {
          planned = A.planSigianVerticalSplit?.(current);
        }
        if (!planned?.outputs?.length || planned.outputs.length !== (payload.outputInstances || []).length) {
          throw new Error("Split commit: output non più validi.");
        }

        removeComponent(current.componentInstanceId);
        planned.outputs.forEach((output, index) => {
          const inventoryId = canonicalInventoryId(output);
          const expected = payload.outputInventoryIds?.[index]
            || payload.outputInventoryId
            || payload.outputInstances?.[index]?.inventoryId;
          if (!inventoryId || inventoryId !== String(expected || "")) {
            throw new Error("Split commit: identità output cambiata.");
          }
          addOutput(payload.outputInstances[index]?.componentInstanceId, output, inventoryId);
        });
        continue;
      }

      if (operation.type === "assign") {
        const id = resolveOperationId(payload.componentInstanceId, virtualMap);
        const current = components.get(id);
        const kind = payload.kind === "constraint" ? "constraint" : "sigil";
        const slotId = String(payload.slotId || "");
        if (!current || current.allocation?.state !== "free" || current.kind !== kind || !slotId) {
          throw new Error(`Assegnazione commit non valida per ${id || "?"}.`);
        }
        if (payload.inventoryId != null && current.inventoryId !== String(payload.inventoryId)) {
          throw new Error(`Assegnazione commit: identità componente cambiata per ${id}.`);
        }
        const duplicateSlot = componentStore.instances.some(instance =>
          instance.componentInstanceId !== current.componentInstanceId
          && instance.allocation?.state === "assigned"
          && instance.allocation.formulaInstanceId === targetFormulaInstanceId
          && instance.allocation.slotId === slotId
        );
        if (duplicateSlot) throw new Error(`Assegnazione commit duplicata sullo slot ${slotId}.`);
        current.allocation = {
          state:"assigned",
          formulaInstanceId:targetFormulaInstanceId,
          slotId
        };
        componentTouched = true;
      }
    }

    const targetAssigned = componentStore.instances.filter(instance =>
      instance.allocation?.state === "assigned"
      && instance.allocation.formulaInstanceId === targetFormulaInstanceId
    );
    const expectedSlots = new Map();

    (recipe.sigils || []).forEach(sigil => {
      if (!sigil.collectibleId) {
        blockers.push("physical-sigil-identity-required");
        return;
      }
      const expected = A.sigianCollectibleInventoryIdentity?.(sigil.collectibleId, recipe.school);
      if (!expected?.inventoryId) {
        blockers.push("physical-sigil-identity-unresolved");
        return;
      }
      const slotId = String(sigil.slotId || "");
      const instance = targetAssigned.find(item => item.kind === "sigil" && item.allocation.slotId === slotId);
      if (!instance
        || instance.inventoryId !== expected.inventoryId
        || !affinityAllows(instance.affinity, recipe.school)
        || (sigil.affinity != null && !exactAffinity(instance.affinity, sigil.affinity))) {
        blockers.push("final-component-binding-invalid");
        return;
      }
      expectedSlots.set(slotId, instance.componentInstanceId);
    });

    if (recipe.constraint) {
      const expectedInventoryId = A.sigianConstraintInventoryId?.(recipe.constraint) || "";
      const instance = targetAssigned.find(item =>
        item.kind === "constraint" && item.allocation.slotId === "constraint"
      );
      if (!expectedInventoryId || !instance
        || instance.inventoryId !== expectedInventoryId
        || !affinityAllows(instance.affinity, recipe.school)
        || (recipe.constraint.affinity != null && !exactAffinity(instance.affinity, recipe.constraint.affinity))) {
        blockers.push("final-constraint-binding-invalid");
      } else {
        expectedSlots.set("constraint", instance.componentInstanceId);
      }
    }

    const expectedAssignmentCount = (recipe.sigils || []).length + (recipe.constraint ? 1 : 0);
    if (targetAssigned.length !== expectedAssignmentCount) blockers.push("unexpected-target-assignments");

    if (blockers.length) {
      return {
        valid:false,
        blockers:[...new Set(blockers)],
        issues,
        recipe,
        transaction,
        targetFormulaInstanceId,
        virtualComponentInstanceIds:Object.fromEntries(virtualMap)
      };
    }

    const existingFormula = formulaStore.instances.find(item => item.formulaInstanceId === targetFormulaInstanceId);
    const now = nowIso();
    const recipeId = Object.prototype.hasOwnProperty.call(input, "recipeId")
      ? (input.recipeId == null ? null : String(input.recipeId))
      : (existingFormula?.recipeId ?? null);
    const sourceCardId = Object.prototype.hasOwnProperty.call(input, "sourceCardId")
      ? (input.sourceCardId == null ? null : String(input.sourceCardId))
      : (existingFormula?.sourceCardId ?? null);

    sourceFormulaIds.forEach(sourceId => {
      const source = formulaStore.instances.find(item => item.formulaInstanceId === sourceId);
      if (!source) throw new Error(`Formula sorgente scomparsa: ${sourceId}.`);
      source.lifecycleState = "NEEDS_RESEAL";
      source.updatedAt = now;
    });

    if (existingFormula) {
      existingFormula.recipeId = recipeId;
      existingFormula.sourceCardId = sourceCardId;
      existingFormula.lifecycleState = requestedLifecycle;
      existingFormula.updatedAt = now;
    } else {
      formulaStore.instances.push({
        formulaInstanceId:targetFormulaInstanceId,
        recipeId,
        sourceCardId,
        lifecycleState:requestedLifecycle,
        createdAt:now,
        updatedAt:now
      });
    }

    const existingCompositionIndex = compositionStore.entries.findIndex(
      entry => entry.formulaInstanceId === targetFormulaInstanceId
    );
    const previousComposition = existingCompositionIndex >= 0
      ? compositionStore.entries[existingCompositionIndex]
      : null;
    const compositionEntry = {
      formulaInstanceId:targetFormulaInstanceId,
      composition:clone(recipe),
      evaluation:requestedLifecycle === "SEALED" ? clone(productionEvaluation) : null,
      createdAt:previousComposition?.createdAt || now,
      updatedAt:now
    };
    if (existingCompositionIndex >= 0) compositionStore.entries[existingCompositionIndex] = compositionEntry;
    else compositionStore.entries.push(compositionEntry);

    if (componentTouched) componentStore.revision = Number(componentStore.revision || 0) + 1;
    formulaStore.revision = Number(formulaStore.revision || 0) + 1;
    compositionStore.revision = Number(compositionStore.revision || 0) + 1;

    return {
      valid:true,
      blockers:[],
      issues,
      recipe,
      transaction,
      targetFormulaInstanceId,
      requestedLifecycle,
      evaluation:productionEvaluation,
      sourceFormulaInstanceIds:[...sourceFormulaIds],
      virtualComponentInstanceIds:Object.fromEntries(virtualMap),
      next:{
        components:componentStore,
        formulas:formulaStore,
        compositions:compositionStore
      }
    };
  }

  A.validateSigianForgeAtomicCommit = function validateSigianForgeAtomicCommit(input = {}) {
    try {
      const prepared = prepareCommit(input);
      return {
        valid:Boolean(prepared.valid),
        blockers:[...(prepared.blockers || [])],
        issues:[...(prepared.issues || [])],
        targetFormulaInstanceId:prepared.targetFormulaInstanceId || null,
        sourceFormulaInstanceIds:[...(prepared.sourceFormulaInstanceIds || [])],
        virtualComponentInstanceIds:clone(prepared.virtualComponentInstanceIds || {}),
        requestedLifecycle:prepared.requestedLifecycle || String(input.targetLifecycleState || "NEEDS_RESEAL").toUpperCase()
      };
    } catch (error) {
      return {
        valid:false,
        blockers:["commit-revalidation-failed"],
        issues:[String(error?.message || error)],
        targetFormulaInstanceId:normalizeFormulaInstanceId(input.targetFormulaInstanceId),
        sourceFormulaInstanceIds:[],
        virtualComponentInstanceIds:{},
        requestedLifecycle:String(input.targetLifecycleState || "NEEDS_RESEAL").toUpperCase()
      };
    }
  };

  A.commitSigianForgeTransactionAtomic = function commitSigianForgeTransactionAtomic(input = {}) {
    if (committing) throw new Error("Un commit Forgia è già in corso.");
    const target = storage();
    if (!target) throw new Error("Persistenza locale Forgia non disponibile.");

    const prepared = prepareCommit(input);
    if (!prepared.valid) {
      const detail = prepared.blockers?.join(", ") || "commit non valido";
      throw new Error(`Commit Forgia bloccato: ${detail}.`);
    }

    const keys = storeKeys();
    const before = {
      [keys.components]:rawValue(target, keys.components),
      [keys.formulas]:rawValue(target, keys.formulas),
      [keys.compositions]:rawValue(target, keys.compositions)
    };
    const after = {
      [keys.components]:JSON.stringify(prepared.next.components),
      [keys.formulas]:JSON.stringify(prepared.next.formulas),
      [keys.compositions]:JSON.stringify(prepared.next.compositions)
    };
    const journal = {
      schemaVersion:JOURNAL_SCHEMA_VERSION,
      commitId:`forge-commit-${Date.now()}`,
      createdAt:nowIso(),
      targetFormulaInstanceId:prepared.targetFormulaInstanceId,
      before,
      after
    };

    committing = true;
    target.setItem(JOURNAL_KEY, JSON.stringify(journal));
    try {
      Object.entries(after).forEach(([key, value]) => applyRaw(target, key, value));
      target.removeItem(JOURNAL_KEY);
    } catch (error) {
      let rollbackComplete = false;
      try {
        Object.entries(before).forEach(([key, value]) => applyRaw(target, key, value));
        target.removeItem(JOURNAL_KEY);
        rollbackComplete = true;
      } catch {}
      if (!rollbackComplete) {
        try { target.setItem(JOURNAL_KEY, JSON.stringify(journal)); } catch {}
      }
      throw error;
    } finally {
      committing = false;
    }

    return {
      committed:true,
      targetFormulaInstanceId:prepared.targetFormulaInstanceId,
      lifecycleState:prepared.requestedLifecycle,
      sourceFormulaInstanceIds:[...prepared.sourceFormulaInstanceIds],
      virtualComponentInstanceIds:clone(prepared.virtualComponentInstanceIds),
      componentRevision:prepared.next.components.revision,
      formulaRevision:prepared.next.formulas.revision,
      compositionRevision:prepared.next.compositions.revision
    };
  };
})(window.Arcane = window.Arcane || {});
