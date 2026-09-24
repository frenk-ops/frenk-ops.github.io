(function (A) {
  "use strict";

  const FORGE_DRAFT_SCHEMA_VERSION = 1;
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

  function normalizeRecipe(input = {}) {
    const id = normalizeId(input.id, createDraftId());
    const school = normalizeId(input.school, A.listSigianSchools?.({ status: "active" })?.[0]?.id || "fire");
    const type = input.type === "spell" ? "spell" : "creature";
    const recipe = A.createFormulaRecipe({
      ...input,
      id,
      school,
      type,
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
    return {
      schemaVersion: FORGE_DRAFT_SCHEMA_VERSION,
      id: normalizeId(input.id, recipe.id),
      status: "draft",
      revision: Math.max(0, Math.trunc(Number(input.revision || 0))),
      recipe,
      createdAt: String(input.createdAt || new Date().toISOString()),
      updatedAt: String(input.updatedAt || new Date().toISOString())
    };
  }

  function draftAnalysis(draft) {
    const validation = A.validateFormulaRecipe(draft.recipe);
    const reasons = [];
    if (!validation.valid) reasons.push("recipe-invalid");
    if (draft.recipe.type === "spell" && draft.recipe.sigils.length === 0) reasons.push("spell-requires-sigil");
    // Arcane Value / minimum legal level is deliberately not invented here.
    // Sealing becomes available only when the calibrated evaluator is connected.
    reasons.push("balance-calibration-pending");
    return {
      valid: validation.valid && !reasons.includes("spell-requires-sigil"),
      validation,
      sigilCount: draft.recipe.sigils.length,
      maxSigils: A.SIGIAN_MAX_PRIMARY_SIGILS || 3,
      arcaneValue: null,
      minimumLevel: null,
      evaluatorStatus: "pending-calibration",
      canSeal: false,
      sealBlockers: [...new Set(reasons)]
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
        sigils: []
      }
    });

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

      reset(options = {}) {
        history.push(clone(draft));
        if (history.length > MAX_HISTORY) history.shift();
        future.length = 0;
        draft = normalizeDraft({
          recipe: {
            id: options.id || createDraftId(),
            school: options.school || draft.recipe.school,
            type: options.type || "creature",
            stats: options.stats || { attack: 1, health: 5 },
            presentation: options.presentation || { name: "Nuova Formula" },
            sigils: []
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

      setSchool(school) {
        const definition = A.getSigianSchool?.(school);
        if (!definition || definition.status !== "active") throw new Error(`Scuola non attiva: ${school}.`);
        return commitRecipe(recipeWith({ school: definition.id }));
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

      addCollectibleSigil(collectibleId) {
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
        next.push(candidate);
        return commitRecipe(recipeWith({ sigils:next }));
      },

      removeSigil(slotId) {
        const next = draft.recipe.sigils.filter(item => item.slotId !== slotId);
        if (next.length === draft.recipe.sigils.length) return this.snapshot();
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
  A.normalizeSigianForgeDraft = normalizeDraft;
  A.analyzeSigianForgeDraft = draftAnalysis;
  A.createSigianForgeSession = createSession;

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
