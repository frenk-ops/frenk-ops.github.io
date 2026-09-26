(function (A) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const STORAGE_KEY = "sigian.inventory.componentInstances.v1";

  function clone(value) {
    if (typeof A.deepClone === "function") return A.deepClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function storage() {
    return typeof localStorage !== "undefined" ? localStorage : null;
  }

  function normalizeAffinity(affinity) {
    return A.normalizeSigianCraftAffinity?.(affinity)
      || A.normalizeSigianAffinity?.(affinity)
      || (affinity && typeof affinity === "object" ? clone(affinity) : null);
  }

  function affinityAllows(affinity, school) {
    if (!school) return true;
    const normalized = normalizeAffinity(affinity);
    if (!normalized) return false;
    if (normalized.mode === "universal") return true;
    return (normalized.schools || []).includes(String(school));
  }

  function canonicalItems() {
    return (A.listSigianCanonicalCollectibles?.({ status:"approved" }) || [])
      .filter(item => item?.id && (item.kind === "sigil" || item.kind === "constraint"));
  }

  function emptyStore() {
    return {
      schemaVersion:SCHEMA_VERSION,
      revision:0,
      nextSequence:1,
      originalFormulaBootstrapVersion:0,
      instances:[]
    };
  }

  function normalizeAllocation(input) {
    if (input?.state === "assigned" && input.formulaInstanceId && input.slotId) {
      return {
        state:"assigned",
        formulaInstanceId:String(input.formulaInstanceId),
        slotId:String(input.slotId)
      };
    }
    return { state:"free" };
  }

  function normalizeInstance(input) {
    if (!input?.componentInstanceId || !input?.inventoryId || !input?.definitionId) return null;
    return {
      componentInstanceId:String(input.componentInstanceId),
      kind:input.kind === "constraint" ? "constraint" : "sigil",
      inventoryId:String(input.inventoryId),
      definitionId:String(input.definitionId),
      effectSchool:input.effectSchool == null ? null : String(input.effectSchool),
      grade:input.grade == null ? null : Math.max(1, Math.trunc(Number(input.grade || 1))),
      affinity:normalizeAffinity(input.affinity),
      allocation:normalizeAllocation(input.allocation),
      createdAt:String(input.createdAt || "")
    };
  }

  function readRaw() {
    const target = storage();
    if (!target) return emptyStore();
    try {
      const parsed = JSON.parse(target.getItem(STORAGE_KEY) || "null");
      if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.instances)) return emptyStore();
      const instances = parsed.instances.map(normalizeInstance).filter(Boolean);
      return {
        schemaVersion:SCHEMA_VERSION,
        revision:Math.max(0, Math.trunc(Number(parsed.revision || 0))),
        nextSequence:Math.max(1, Math.trunc(Number(parsed.nextSequence || 1))),
        originalFormulaBootstrapVersion:Math.max(0, Math.trunc(Number(parsed.originalFormulaBootstrapVersion || 0))),
        instances
      };
    } catch {
      return emptyStore();
    }
  }

  function persist(store) {
    const target = storage();
    if (!target) return;
    target.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function nextInstanceId(store) {
    const sequence = store.nextSequence++;
    return `cmp-${String(sequence).padStart(6, "0")}`;
  }

  function seedQuantity(item) {
    return Math.max(0, Math.trunc(Number(
      A.getSigianSeedComponentQuantity?.(item.kind, item.id, 3) ?? 3
    )));
  }

  function createInstance(store, item) {
    return {
      componentInstanceId:nextInstanceId(store),
      kind:item.kind,
      inventoryId:String(item.id),
      definitionId:String(item.definitionId),
      effectSchool:item.effectSchool == null ? null : String(item.effectSchool),
      grade:item.grade == null ? null : Math.max(1, Math.trunc(Number(item.grade || 1))),
      affinity:normalizeAffinity(item.affinity),
      allocation:{ state:"free" },
      createdAt:new Date().toISOString()
    };
  }

  function originalFormulaRequirements() {
    const cards = A.RAW_CARD_SETS?.["astral-original"] || [];
    const out = [];
    cards.forEach(card => {
      const counters = { sigil:0, constraint:0 };
      (A.getSigianBaseCanonicalComponents?.(card.id) || []).forEach(component => {
        const kind = component.kind === "constraint" ? "constraint" : "sigil";
        const inventoryId = A.sigianCanonicalComponentInventoryId?.(component) || "";
        if (!inventoryId) return;
        counters[kind] += 1;
        out.push({
          inventoryId,
          kind,
          formulaInstanceId:`owned:${card.id}`,
          slotId:`${kind}:${counters[kind]}`
        });
      });
    });
    return out;
  }

  function requiredStarterCountByInventoryId(requirements) {
    const counts = new Map();
    requirements.forEach(item => counts.set(item.inventoryId, (counts.get(item.inventoryId) || 0) + 1));
    return counts;
  }

  function syncStore(inputStore = null) {
    const store = inputStore ? clone(inputStore) : readRaw();
    const catalog = canonicalItems();
    const catalogById = new Map(catalog.map(item => [String(item.id), item]));
    const starterRequirements = originalFormulaRequirements();
    const starterCounts = requiredStarterCountByInventoryId(starterRequirements);
    let changed = false;

    catalog.forEach(item => {
      const inventoryId = String(item.id);
      const target = Math.max(seedQuantity(item), starterCounts.get(inventoryId) || 0);
      const matching = store.instances.filter(instance => instance.inventoryId === inventoryId);

      if (matching.length < target) {
        for (let index = matching.length; index < target; index += 1) {
          store.instances.push(createInstance(store, item));
          changed = true;
        }
      } else if (matching.length > target) {
        let excess = matching.length - target;
        const removable = store.instances
          .filter(instance => instance.inventoryId === inventoryId && instance.allocation?.state === "free")
          .sort((left, right) => right.componentInstanceId.localeCompare(left.componentInstanceId));
        const removeIds = new Set(removable.slice(0, excess).map(instance => instance.componentInstanceId));
        if (removeIds.size) {
          store.instances = store.instances.filter(instance => !removeIds.has(instance.componentInstanceId));
          excess -= removeIds.size;
          changed = true;
        }
      }
    });

    if (store.originalFormulaBootstrapVersion < 1) {
      starterRequirements.forEach(requirement => {
        const alreadyAssigned = store.instances.some(instance =>
          instance.inventoryId === requirement.inventoryId
          && instance.allocation?.state === "assigned"
          && instance.allocation.formulaInstanceId === requirement.formulaInstanceId
          && instance.allocation.slotId === requirement.slotId
        );
        if (alreadyAssigned) return;

        const instance = store.instances
          .filter(candidate =>
            candidate.inventoryId === requirement.inventoryId
            && candidate.allocation?.state === "free"
          )
          .sort((left, right) => left.componentInstanceId.localeCompare(right.componentInstanceId))[0];
        if (!instance) return;
        instance.allocation = {
          state:"assigned",
          formulaInstanceId:requirement.formulaInstanceId,
          slotId:requirement.slotId
        };
        changed = true;
      });
      store.originalFormulaBootstrapVersion = 1;
      changed = true;
    }

    // Keep assigned legacy/orphan copies rather than deleting player state.
    store.instances.forEach(instance => {
      if (catalogById.has(instance.inventoryId)) return;
      if (instance.allocation?.state === "assigned") return;
      // Free orphaned definitions are left intact as migration-safe inventory history.
    });

    if (changed || store.revision === 0) {
      store.revision = Math.max(1, store.revision + 1);
      persist(store);
    }
    return store;
  }

  function snapshot() {
    return syncStore();
  }

  function listInstances(options = {}) {
    const store = snapshot();
    const excluded = new Set((options.excludeInstanceIds || []).map(String));
    return store.instances.filter(instance => {
      if (excluded.has(instance.componentInstanceId)) return false;
      if (options.kind && instance.kind !== options.kind) return false;
      if (options.inventoryId && instance.inventoryId !== String(options.inventoryId)) return false;
      if (options.allocation && instance.allocation?.state !== options.allocation) return false;
      if (options.compatibleSchool && !affinityAllows(instance.affinity, options.compatibleSchool)) return false;
      return true;
    }).map(clone);
  }

  function draftUsedIds(transaction) {
    const ids = new Set();
    (transaction?.operations || []).forEach(operation => {
      const payload = operation?.payload || {};
      if (operation.type === "assign" && payload.componentInstanceId) ids.add(String(payload.componentInstanceId));
      if (operation.type === "fuse") (payload.inputInstanceIds || []).forEach(id => ids.add(String(id)));
      if (operation.type === "split" && payload.inputInstanceId) ids.add(String(payload.inputInstanceId));
    });
    return ids;
  }

  function availabilityFromInstances(instances, inventoryId, options = {}) {
    const compatibleSchool = options.compatibleSchool || null;
    const transaction = options.transaction || null;
    const all = (instances || []).filter(instance => {
      if (instance.inventoryId !== String(inventoryId || "")) return false;
      if (compatibleSchool && !affinityAllows(instance.affinity, compatibleSchool)) return false;
      return true;
    });
    const free = all.filter(instance => instance.allocation?.state === "free");
    const assigned = all.filter(instance => instance.allocation?.state === "assigned");
    const usedByDraft = draftUsedIds(transaction);
    const projectedFree = free.filter(instance => !usedByDraft.has(instance.componentInstanceId));
    return {
      inventoryId:String(inventoryId || ""),
      total:all.length,
      free:free.length,
      inUse:assigned.length,
      projectedFree:projectedFree.length,
      assigned:assigned.map(clone),
      draftUsed:[...usedByDraft].filter(id => all.some(instance => instance.componentInstanceId === id))
    };
  }

  function availability(inventoryId, options = {}) {
    return availabilityFromInstances(snapshot().instances, inventoryId, options);
  }

  function freeInstance(inventoryId, options = {}) {
    const excluded = new Set([
      ...(options.excludeInstanceIds || []).map(String),
      ...draftUsedIds(options.transaction)
    ]);
    return listInstances({
      inventoryId,
      allocation:"free",
      compatibleSchool:options.compatibleSchool,
      excludeInstanceIds:[...excluded]
    })[0] || null;
  }

  function collectibleInventoryId(collectibleId, formulaSchool) {
    return A.sigianCollectibleInventoryIdentity?.(collectibleId, formulaSchool)?.inventoryId || null;
  }

  function constraintInventoryId(constraint) {
    return A.sigianConstraintInventoryId?.(constraint) || null;
  }

  function mutate(expectedRevision, mutator) {
    const store = snapshot();
    if (expectedRevision != null && Number(expectedRevision) !== Number(store.revision)) {
      throw new Error(`Inventario componenti modificato: attesa revisione ${expectedRevision}, corrente ${store.revision}.`);
    }
    const working = clone(store);
    const result = mutator(working);
    working.revision += 1;
    persist(working);
    return { snapshot:clone(working), result:clone(result) };
  }

  function instanceIndex(store, instanceId) {
    return store.instances.findIndex(instance => instance.componentInstanceId === String(instanceId || ""));
  }

  A.SIGIAN_COMPONENT_INSTANCE_SCHEMA_VERSION = SCHEMA_VERSION;
  A.SIGIAN_COMPONENT_INSTANCE_STORAGE_KEY = STORAGE_KEY;

  A.getSigianComponentInventorySnapshot = function getSigianComponentInventorySnapshot() {
    return clone(snapshot());
  };

  A.listSigianComponentInstances = function listSigianComponentInstances(options = {}) {
    return listInstances(options);
  };

  A.getSigianComponentInstance = function getSigianComponentInstance(instanceId) {
    return listInstances().find(instance => instance.componentInstanceId === String(instanceId || "")) || null;
  };

  A.getSigianComponentAvailabilityByInventoryId = function getSigianComponentAvailabilityByInventoryId(inventoryId, options = {}) {
    return availability(inventoryId, options);
  };

  A.getSigianComponentAvailabilityMap = function getSigianComponentAvailabilityMap(options = {}) {
    const store = snapshot();
    const out = {};
    const tracked = new Set(canonicalItems().map(item => String(item.id)));
    tracked.forEach(inventoryId => {
      out[inventoryId] = availabilityFromInstances(store.instances, inventoryId, options);
    });
    return clone(out);
  };

  A.getSigianCollectibleComponentAvailability = function getSigianCollectibleComponentAvailability(collectibleId, formulaSchool = "fire", transaction = null) {
    const inventoryId = collectibleInventoryId(collectibleId, formulaSchool);
    return inventoryId
      ? availability(inventoryId, { compatibleSchool:formulaSchool, transaction })
      : { inventoryId:null, total:0, free:0, inUse:0, projectedFree:0, assigned:[], draftUsed:[] };
  };

  A.findSigianFreeCollectibleComponentInstance = function findSigianFreeCollectibleComponentInstance(collectibleId, formulaSchool = "fire", options = {}) {
    const inventoryId = collectibleInventoryId(collectibleId, formulaSchool);
    return inventoryId
      ? freeInstance(inventoryId, {
          compatibleSchool:formulaSchool,
          transaction:options.transaction,
          excludeInstanceIds:options.excludeInstanceIds
        })
      : null;
  };

  A.getSigianConstraintComponentAvailability = function getSigianConstraintComponentAvailability(constraint, formulaSchool = "fire", transaction = null) {
    const inventoryId = constraintInventoryId(constraint);
    return inventoryId
      ? availability(inventoryId, { compatibleSchool:formulaSchool, transaction })
      : { inventoryId:null, total:0, free:0, inUse:0, projectedFree:0, assigned:[], draftUsed:[] };
  };

  A.findSigianFreeConstraintComponentInstance = function findSigianFreeConstraintComponentInstance(constraint, formulaSchool = "fire", options = {}) {
    const inventoryId = constraintInventoryId(constraint);
    return inventoryId
      ? freeInstance(inventoryId, {
          compatibleSchool:formulaSchool,
          transaction:options.transaction,
          excludeInstanceIds:options.excludeInstanceIds
        })
      : null;
  };

  A.assignSigianComponentInstance = function assignSigianComponentInstance(instanceId, assignment, expectedRevision = null) {
    if (!assignment?.formulaInstanceId || !assignment?.slotId) throw new Error("Assegnazione componente incompleta.");
    return mutate(expectedRevision, working => {
      const index = instanceIndex(working, instanceId);
      if (index < 0) throw new Error(`Componente non trovato: ${instanceId}.`);
      const current = working.instances[index];
      if (current.allocation?.state !== "free") {
        throw new Error(`Componente già assegnato: ${instanceId}.`);
      }
      current.allocation = {
        state:"assigned",
        formulaInstanceId:String(assignment.formulaInstanceId),
        slotId:String(assignment.slotId)
      };
      return current;
    });
  };

  A.releaseSigianComponentInstance = function releaseSigianComponentInstance(instanceId, expectedRevision = null) {
    return mutate(expectedRevision, working => {
      const index = instanceIndex(working, instanceId);
      if (index < 0) throw new Error(`Componente non trovato: ${instanceId}.`);
      const current = working.instances[index];
      const previous = clone(current.allocation);
      current.allocation = { state:"free" };
      return { instance:current, previous };
    });
  };

  A.listSigianFormulaComponentAssignments = function listSigianFormulaComponentAssignments(formulaInstanceId) {
    const id = String(formulaInstanceId || "");
    if (!id) return [];
    return listInstances().filter(instance =>
      instance.allocation?.state === "assigned"
      && instance.allocation.formulaInstanceId === id
    );
  };
})(window.Arcane = window.Arcane || {});
