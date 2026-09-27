(function (A) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const STORAGE_KEY = "sigian.inventory.formulaInstances.v1";
  const STATES = Object.freeze({
    SEALED:"SEALED",
    NEEDS_RESEAL:"NEEDS_RESEAL",
    DISSOLVED:"DISSOLVED"
  });
  const VALID_STATES = new Set(Object.values(STATES));

  function clone(value) {
    if (typeof A.deepClone === "function") return A.deepClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function targetStorage() {
    return typeof localStorage !== "undefined" ? localStorage : null;
  }

  function emptyStore() {
    return {
      schemaVersion:SCHEMA_VERSION,
      revision:0,
      originalFormulaBootstrapVersion:0,
      instances:[]
    };
  }

  function normalizeLifecycleState(value) {
    const state = String(value || STATES.SEALED).toUpperCase();
    return VALID_STATES.has(state) ? state : STATES.SEALED;
  }

  function normalizeInstance(input = {}) {
    const formulaInstanceId = String(input.formulaInstanceId || "").trim();
    if (!formulaInstanceId) return null;
    const createdAt = String(input.createdAt || nowIso());
    return {
      formulaInstanceId,
      recipeId:input.recipeId == null ? null : String(input.recipeId),
      sourceCardId:input.sourceCardId == null ? null : String(input.sourceCardId),
      lifecycleState:normalizeLifecycleState(input.lifecycleState),
      createdAt,
      updatedAt:String(input.updatedAt || createdAt)
    };
  }

  function readStore() {
    A.recoverSigianForgeAtomicCommit?.();
    const storage = targetStorage();
    if (!storage) return emptyStore();
    try {
      const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || "null");
      if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.instances)) return emptyStore();
      return {
        schemaVersion:SCHEMA_VERSION,
        revision:Math.max(0, Math.trunc(Number(parsed.revision || 0))),
        originalFormulaBootstrapVersion:Math.max(0, Math.trunc(Number(parsed.originalFormulaBootstrapVersion || 0))),
        instances:parsed.instances.map(normalizeInstance).filter(Boolean)
      };
    } catch {
      return emptyStore();
    }
  }

  function persist(store) {
    const storage = targetStorage();
    if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function originalFormulaDescriptors() {
    return (A.RAW_CARD_SETS?.["astral-original"] || []).map(card => ({
      formulaInstanceId:`owned:${card.id}`,
      recipeId:String(card.id),
      sourceCardId:String(card.id)
    }));
  }

  function syncStore(input = null) {
    const store = input ? clone(input) : readStore();
    const ids = new Set(store.instances.map(instance => instance.formulaInstanceId));
    let changed = false;

    originalFormulaDescriptors().forEach(descriptor => {
      if (ids.has(descriptor.formulaInstanceId)) return;
      const createdAt = nowIso();
      store.instances.push(normalizeInstance({
        ...descriptor,
        lifecycleState:STATES.SEALED,
        createdAt,
        updatedAt:createdAt
      }));
      ids.add(descriptor.formulaInstanceId);
      changed = true;
    });

    if (store.originalFormulaBootstrapVersion < 1) {
      store.originalFormulaBootstrapVersion = 1;
      changed = true;
    }

    if (changed || store.revision === 0) {
      store.revision = Math.max(1, store.revision + 1);
      persist(store);
    }
    return store;
  }

  function mutate(expectedRevision, mutator) {
    const current = syncStore();
    if (expectedRevision != null && Number(expectedRevision) !== Number(current.revision)) {
      throw new Error(`Inventario Formula modificato: attesa revisione ${expectedRevision}, corrente ${current.revision}.`);
    }
    const working = clone(current);
    const result = mutator(working);
    working.revision += 1;
    persist(working);
    return { snapshot:clone(working), result:clone(result) };
  }

  function resolveInstanceId(value) {
    const id = String(value || "").trim();
    if (!id) return "";
    return id.startsWith("owned:") || id.startsWith("formula:") ? id : `owned:${id}`;
  }

  A.SIGIAN_FORMULA_INSTANCE_SCHEMA_VERSION = SCHEMA_VERSION;
  A.SIGIAN_FORMULA_INSTANCE_STORAGE_KEY = STORAGE_KEY;
  A.SIGIAN_FORMULA_LIFECYCLE = STATES;

  A.sigianFormulaInstanceIdForCardId = function sigianFormulaInstanceIdForCardId(cardId) {
    return resolveInstanceId(cardId);
  };

  A.getSigianFormulaInventorySnapshot = function getSigianFormulaInventorySnapshot() {
    return clone(syncStore());
  };

  A.listSigianFormulaInstances = function listSigianFormulaInstances(options = {}) {
    const requestedState = options.lifecycleState == null ? null : normalizeLifecycleState(options.lifecycleState);
    return syncStore().instances
      .filter(instance => !requestedState || instance.lifecycleState === requestedState)
      .map(clone);
  };

  A.getSigianFormulaInstance = function getSigianFormulaInstance(formulaInstanceId) {
    const id = resolveInstanceId(formulaInstanceId);
    const instance = syncStore().instances.find(item => item.formulaInstanceId === id);
    return instance ? clone(instance) : null;
  };

  A.getSigianFormulaLifecycleState = function getSigianFormulaLifecycleState(formulaInstanceId) {
    return A.getSigianFormulaInstance(formulaInstanceId)?.lifecycleState || null;
  };

  A.isSigianFormulaPlayable = function isSigianFormulaPlayable(formulaInstanceId) {
    return A.getSigianFormulaLifecycleState(formulaInstanceId) === STATES.SEALED;
  };

  A.ensureSigianFormulaInstance = function ensureSigianFormulaInstance(input = {}, expectedRevision = null) {
    const formulaInstanceId = String(input.formulaInstanceId || "").trim();
    if (!formulaInstanceId) throw new Error("Formula instance ID mancante.");
    const current = syncStore();
    const existing = current.instances.find(item => item.formulaInstanceId === formulaInstanceId);
    if (existing) return { snapshot:clone(current), result:clone(existing) };
    return mutate(expectedRevision, working => {
      const createdAt = nowIso();
      const instance = normalizeInstance({
        formulaInstanceId,
        recipeId:input.recipeId ?? null,
        sourceCardId:input.sourceCardId ?? null,
        lifecycleState:input.lifecycleState || STATES.SEALED,
        createdAt,
        updatedAt:createdAt
      });
      working.instances.push(instance);
      return instance;
    });
  };

  A.setSigianFormulaLifecycleState = function setSigianFormulaLifecycleState(formulaInstanceId, lifecycleState, expectedRevision = null) {
    const id = resolveInstanceId(formulaInstanceId);
    const requested = String(lifecycleState || "").toUpperCase();
    if (!VALID_STATES.has(requested)) throw new Error(`Stato Formula non valido: ${lifecycleState}.`);
    return mutate(expectedRevision, working => {
      const instance = working.instances.find(item => item.formulaInstanceId === id);
      if (!instance) throw new Error(`Formula non trovata: ${id}.`);
      instance.lifecycleState = requested;
      instance.updatedAt = nowIso();
      return instance;
    });
  };
})(window.Arcane = window.Arcane || {});
