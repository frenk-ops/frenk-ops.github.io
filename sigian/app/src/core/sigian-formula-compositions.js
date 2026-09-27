(function (A) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const STORAGE_KEY = "sigian.inventory.formulaCompositions.v1";

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

  function emptyStore() {
    return {
      schemaVersion:SCHEMA_VERSION,
      revision:0,
      entries:[]
    };
  }

  function normalizeEvaluation(input) {
    if (!input || typeof input !== "object") return null;
    return {
      status:String(input.status || "unpriced"),
      arcaneValue:Number.isFinite(Number(input.arcaneValue)) ? Number(input.arcaneValue) : null,
      minimumLevel:Number.isFinite(Number(input.minimumLevel)) ? Math.max(1, Math.trunc(Number(input.minimumLevel))) : null,
      evaluatorId:input.evaluatorId == null ? null : String(input.evaluatorId),
      evaluatedAt:input.evaluatedAt == null ? null : String(input.evaluatedAt)
    };
  }

  function normalizeEntry(input = {}) {
    const formulaInstanceId = String(input.formulaInstanceId || "").trim();
    if (!formulaInstanceId || !input.composition) return null;
    const composition = A.createFormulaRecipe?.(input.composition) || clone(input.composition);
    const createdAt = String(input.createdAt || nowIso());
    return {
      formulaInstanceId,
      composition,
      evaluation:normalizeEvaluation(input.evaluation),
      createdAt,
      updatedAt:String(input.updatedAt || createdAt)
    };
  }

  function readStore() {
    A.recoverSigianForgeAtomicCommit?.();
    const target = storage();
    if (!target) return emptyStore();
    try {
      const parsed = JSON.parse(target.getItem(STORAGE_KEY) || "null");
      if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.entries)) return emptyStore();
      return {
        schemaVersion:SCHEMA_VERSION,
        revision:Math.max(0, Math.trunc(Number(parsed.revision || 0))),
        entries:parsed.entries.map(normalizeEntry).filter(Boolean)
      };
    } catch {
      return emptyStore();
    }
  }

  function canonicalFallback(formulaInstanceId) {
    const formula = A.getSigianFormulaInstance?.(formulaInstanceId);
    const recipeId = formula?.recipeId || null;
    if (!recipeId) return null;

    const known = A.getSigianKnownRecipe?.(recipeId);
    if (known) return {
      formulaInstanceId:String(formulaInstanceId),
      composition:clone(known),
      evaluation:null,
      source:"recipebook"
    };

    if (typeof A.buildSigianBaseRecipeCatalog === "function") {
      try {
        const cards = A.RAW_CARD_SETS?.["astral-original"] || [];
        const recipe = A.buildSigianBaseRecipeCatalog(cards)?.byId?.[recipeId] || null;
        if (recipe) return {
          formulaInstanceId:String(formulaInstanceId),
          composition:clone(recipe),
          evaluation:null,
          source:"standard-catalog"
        };
      } catch {}
    }
    return null;
  }

  A.SIGIAN_FORMULA_COMPOSITION_SCHEMA_VERSION = SCHEMA_VERSION;
  A.SIGIAN_FORMULA_COMPOSITION_STORAGE_KEY = STORAGE_KEY;

  A.getSigianFormulaCompositionSnapshot = function getSigianFormulaCompositionSnapshot() {
    return clone(readStore());
  };

  A.listSigianFormulaCompositions = function listSigianFormulaCompositions() {
    return readStore().entries.map(clone);
  };

  A.getSigianFormulaComposition = function getSigianFormulaComposition(formulaInstanceId, options = {}) {
    const id = String(formulaInstanceId || "").trim();
    if (!id) return null;
    const entry = readStore().entries.find(item => item.formulaInstanceId === id);
    if (entry) return { ...clone(entry), source:"persistent" };
    if (options.allowCanonicalFallback === false) return null;
    return canonicalFallback(id);
  };
})(window.Arcane = window.Arcane || {});
