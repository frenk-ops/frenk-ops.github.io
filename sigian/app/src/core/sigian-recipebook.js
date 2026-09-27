(function (A) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const STORAGE_KEY = "sigian.recipebook.v1";
  const ORIGINS = Object.freeze({
    STANDARD:"STANDARD",
    PERSONAL:"PERSONAL"
  });

  function clone(value) {
    if (typeof A.deepClone === "function") return A.deepClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function storage() {
    return typeof localStorage !== "undefined" ? localStorage : null;
  }

  function standardCards() {
    return A.RAW_CARD_SETS?.["astral-original"] || [];
  }

  function emptyStore() {
    return {
      schemaVersion:SCHEMA_VERSION,
      revision:0,
      standardBootstrapVersion:0,
      nextSequence:1,
      entries:[]
    };
  }

  function normalizeOrigin(value) {
    return String(value || "").toUpperCase() === ORIGINS.PERSONAL
      ? ORIGINS.PERSONAL
      : ORIGINS.STANDARD;
  }

  function normalizeEntry(input = {}) {
    const recipeId = String(input.recipeId || "").trim();
    if (!recipeId) return null;
    const origin = normalizeOrigin(input.origin);
    const createdAt = String(input.createdAt || nowIso());
    const recipe = origin === ORIGINS.PERSONAL && input.recipe
      ? A.createFormulaRecipe?.(input.recipe) || clone(input.recipe)
      : null;
    return {
      recipeId,
      origin,
      sourceCardId:origin === ORIGINS.STANDARD
        ? String(input.sourceCardId || recipeId)
        : (input.sourceCardId == null ? null : String(input.sourceCardId)),
      recipe,
      createdAt,
      updatedAt:String(input.updatedAt || createdAt)
    };
  }

  function readStore() {
    const target = storage();
    if (!target) return emptyStore();
    try {
      const parsed = JSON.parse(target.getItem(STORAGE_KEY) || "null");
      if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.entries)) return emptyStore();
      return {
        schemaVersion:SCHEMA_VERSION,
        revision:Math.max(0, Math.trunc(Number(parsed.revision || 0))),
        standardBootstrapVersion:Math.max(0, Math.trunc(Number(parsed.standardBootstrapVersion || 0))),
        nextSequence:Math.max(1, Math.trunc(Number(parsed.nextSequence || 1))),
        entries:parsed.entries.map(normalizeEntry).filter(Boolean)
      };
    } catch {
      return emptyStore();
    }
  }

  function persist(store) {
    const target = storage();
    if (target) target.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function standardDescriptors() {
    return standardCards().map(card => ({
      recipeId:String(card.id),
      origin:ORIGINS.STANDARD,
      sourceCardId:String(card.id)
    }));
  }

  function syncStore(input = null) {
    const store = input ? clone(input) : readStore();
    const standards = standardDescriptors();
    const standardIds = new Set(standards.map(item => item.recipeId));
    let changed = false;

    store.entries = store.entries
      .map(normalizeEntry)
      .filter(Boolean)
      .filter((entry, index, entries) =>
        entries.findIndex(candidate => candidate.recipeId === entry.recipeId) === index
      );

    standards.forEach(descriptor => {
      const existing = store.entries.find(entry => entry.recipeId === descriptor.recipeId);
      if (!existing) {
        store.entries.push(normalizeEntry({
          ...descriptor,
          createdAt:nowIso(),
          updatedAt:nowIso()
        }));
        changed = true;
        return;
      }
      if (existing.origin !== ORIGINS.STANDARD || existing.sourceCardId !== descriptor.sourceCardId || existing.recipe != null) {
        existing.origin = ORIGINS.STANDARD;
        existing.sourceCardId = descriptor.sourceCardId;
        existing.recipe = null;
        existing.updatedAt = nowIso();
        changed = true;
      }
    });

    // Standard IDs are canonical knowledge and cannot be shadowed by personal data.
    store.entries.forEach(entry => {
      if (!standardIds.has(entry.recipeId)) return;
      if (entry.origin !== ORIGINS.STANDARD) {
        entry.origin = ORIGINS.STANDARD;
        entry.sourceCardId = entry.recipeId;
        entry.recipe = null;
        changed = true;
      }
    });

    if (store.standardBootstrapVersion < 1) {
      store.standardBootstrapVersion = 1;
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
      throw new Error(`Ricettario modificato: attesa revisione ${expectedRevision}, corrente ${current.revision}.`);
    }
    const working = clone(current);
    const result = mutator(working);
    working.revision += 1;
    persist(working);
    return { snapshot:clone(working), result:clone(result) };
  }

  let standardCatalogCache = null;
  function standardCatalog() {
    if (!standardCatalogCache) {
      if (typeof A.buildSigianBaseRecipeCatalog !== "function") return null;
      standardCatalogCache = A.buildSigianBaseRecipeCatalog(standardCards());
    }
    return standardCatalogCache;
  }

  function standardRecipe(recipeId) {
    const recipe = standardCatalog()?.byId?.[String(recipeId || "")] || null;
    return recipe ? clone(recipe) : null;
  }

  function personalRecipe(entry) {
    return entry?.recipe ? A.createFormulaRecipe?.(entry.recipe) || clone(entry.recipe) : null;
  }

  function linkedFormulaInstances(recipeId) {
    return (A.listSigianFormulaInstances?.() || [])
      .filter(instance => String(instance.recipeId || "") === String(recipeId || ""))
      .map(clone);
  }

  function standardComponents(entry) {
    if (entry.origin !== ORIGINS.STANDARD || !entry.sourceCardId) return [];
    return (A.getSigianBaseCanonicalComponents?.(entry.sourceCardId) || []).map(clone);
  }

  function personalComponents(recipe) {
    if (!recipe) return [];
    const sigils = (recipe.sigils || []).map((sigil, index) => {
      const collectible = sigil.collectibleId ? A.getSigianCollectibleSigil?.(sigil.collectibleId) : null;
      return {
        kind:"sigil",
        definitionId:collectible?.canonicalDefinitionId || null,
        name:collectible?.displayName || collectible?.name || sigil.collectibleId || sigil.sigilId || `Sigillo ${index + 1}`,
        grade:sigil.grade == null ? null : Number(sigil.grade),
        intensity:sigil.intensity == null ? null : Number(sigil.intensity),
        school:collectible?.schoolReference || sigil.config?.school || null
      };
    });
    const constraint = recipe.constraint ? [{
      kind:"constraint",
      definitionId:recipe.constraint.definitionId,
      name:A.getSigianCanonicalV2?.(recipe.constraint.definitionId)?.name || recipe.constraint.definitionId,
      grade:recipe.constraint.grade,
      intensity:recipe.constraint.intensity,
      school:recipe.constraint.school
    }] : [];
    return [...sigils, ...constraint];
  }

  function enrich(entry) {
    const recipe = entry.origin === ORIGINS.STANDARD
      ? standardRecipe(entry.recipeId)
      : personalRecipe(entry);
    const linked = linkedFormulaInstances(entry.recipeId);
    const sourceCard = entry.sourceCardId
      ? standardCards().find(card => String(card.id) === entry.sourceCardId) || null
      : null;
    return {
      ...clone(entry),
      recipe,
      components:entry.origin === ORIGINS.STANDARD
        ? standardComponents(entry)
        : personalComponents(recipe),
      name:recipe?.presentation?.name || sourceCard?.name || entry.recipeId,
      school:recipe?.school || sourceCard?.school || null,
      type:recipe?.type || sourceCard?.type || null,
      sourceCardId:entry.sourceCardId,
      linkedFormulaInstances:linked,
      linkedFormulaCount:linked.length,
      playableFormulaCount:linked.filter(item => item.lifecycleState === "SEALED").length
    };
  }

  function nextPersonalId(store) {
    let id;
    do {
      id = `recipe:personal-${String(store.nextSequence++).padStart(4, "0")}`;
    } while (store.entries.some(entry => entry.recipeId === id));
    return id;
  }

  A.SIGIAN_RECIPEBOOK_SCHEMA_VERSION = SCHEMA_VERSION;
  A.SIGIAN_RECIPEBOOK_STORAGE_KEY = STORAGE_KEY;
  A.SIGIAN_RECIPE_ORIGINS = ORIGINS;

  A.getSigianRecipebookSnapshot = function getSigianRecipebookSnapshot() {
    return clone(syncStore());
  };

  A.listSigianRecipebookEntries = function listSigianRecipebookEntries(options = {}) {
    const origin = options.origin == null ? null : normalizeOrigin(options.origin);
    return syncStore().entries
      .filter(entry => !origin || entry.origin === origin)
      .map(enrich)
      .sort((left, right) =>
        (left.origin === ORIGINS.STANDARD ? 0 : 1) - (right.origin === ORIGINS.STANDARD ? 0 : 1)
        || String(left.school || "").localeCompare(String(right.school || ""))
        || String(left.name || "").localeCompare(String(right.name || ""))
      );
  };

  A.getSigianRecipebookEntry = function getSigianRecipebookEntry(recipeId) {
    const entry = syncStore().entries.find(item => item.recipeId === String(recipeId || ""));
    return entry ? enrich(entry) : null;
  };

  A.getSigianKnownRecipe = function getSigianKnownRecipe(recipeId) {
    return A.getSigianRecipebookEntry(recipeId)?.recipe || null;
  };

  A.isSigianRecipeKnown = function isSigianRecipeKnown(recipeId) {
    return Boolean(syncStore().entries.some(entry => entry.recipeId === String(recipeId || "")));
  };

  A.saveSigianPersonalRecipe = function saveSigianPersonalRecipe(inputRecipe = {}, options = {}, expectedRevision = null) {
    const current = syncStore();
    const requestedId = String(options.recipeId || inputRecipe.id || "").trim();
    const recipeId = requestedId && !current.entries.some(entry => entry.recipeId === requestedId && entry.origin === ORIGINS.STANDARD)
      ? requestedId
      : (requestedId && current.entries.some(entry => entry.recipeId === requestedId && entry.origin === ORIGINS.STANDARD)
        ? null
        : null);
    if (requestedId && recipeId == null) {
      throw new Error(`La Ricetta STANDARD ${requestedId} non può essere sovrascritta.`);
    }

    return mutate(expectedRevision, working => {
      const finalId = recipeId || nextPersonalId(working);
      const normalized = A.createFormulaRecipe?.({ ...inputRecipe, id:finalId }) || { ...clone(inputRecipe), id:finalId };
      const validation = A.validateFormulaRecipe?.(normalized);
      if (validation && !validation.valid) {
        throw new Error(`Ricetta personale non valida: ${validation.errors.join("; ")}`);
      }
      const existing = working.entries.find(entry => entry.recipeId === finalId);
      const now = nowIso();
      if (existing) {
        if (existing.origin !== ORIGINS.PERSONAL) throw new Error(`Ricetta ${finalId} non modificabile.`);
        existing.recipe = clone(normalized);
        existing.updatedAt = now;
        return existing;
      }
      const entry = normalizeEntry({
        recipeId:finalId,
        origin:ORIGINS.PERSONAL,
        recipe:normalized,
        createdAt:now,
        updatedAt:now
      });
      working.entries.push(entry);
      return entry;
    });
  };

  A.deleteSigianPersonalRecipe = function deleteSigianPersonalRecipe(recipeId, expectedRevision = null) {
    const id = String(recipeId || "").trim();
    return mutate(expectedRevision, working => {
      const index = working.entries.findIndex(entry => entry.recipeId === id);
      if (index < 0) throw new Error(`Ricetta non trovata: ${id}.`);
      if (working.entries[index].origin !== ORIGINS.PERSONAL) {
        throw new Error(`La Ricetta STANDARD ${id} non può essere eliminata.`);
      }
      return working.entries.splice(index, 1)[0];
    });
  };
})(window.Arcane = window.Arcane || {});
