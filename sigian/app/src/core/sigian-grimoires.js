(function (A) {
  "use strict";

  const STORAGE_KEY = "sigian.grimoires.v1";
  const SCHEMA_VERSION = 1;
  let fallbackState = null;
  let idCounter = 0;

  function clone(value) {
    if (typeof A.deepClone === "function") return A.deepClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function storage() {
    try {
      const candidate = window.localStorage;
      const probe = "__sigian_grimoires_probe__";
      candidate.setItem(probe, "1");
      candidate.removeItem(probe);
      return candidate;
    } catch {
      return null;
    }
  }

  function normalizeName(value, fallback = "Nuovo Grimorio") {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 48) || fallback;
  }

  function normalizeFormulaIds(values) {
    const source = Array.isArray(values) ? values : [];
    return [...new Set(source.map(value => String(value || "").trim()).filter(Boolean))];
  }

  function normalizeGrimoire(input = {}, index = 0) {
    const createdAt = String(input.createdAt || nowIso());
    return {
      id:String(input.id || `grimorio-${Date.now().toString(36)}-${index + 1}`),
      name:normalizeName(input.name, `Grimorio ${index + 1}`),
      formulaIds:normalizeFormulaIds(input.formulaIds),
      createdAt,
      updatedAt:String(input.updatedAt || createdAt)
    };
  }

  function emptyState() {
    return { schemaVersion:SCHEMA_VERSION, grimoires:[] };
  }

  function readState() {
    const target = storage();
    if (!target) {
      if (!fallbackState) fallbackState = emptyState();
      return clone(fallbackState);
    }

    try {
      const parsed = JSON.parse(target.getItem(STORAGE_KEY) || "null");
      if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.grimoires)) return emptyState();
      return {
        schemaVersion:SCHEMA_VERSION,
        grimoires:parsed.grimoires.map(normalizeGrimoire)
      };
    } catch {
      return emptyState();
    }
  }

  function writeState(state) {
    const normalized = {
      schemaVersion:SCHEMA_VERSION,
      grimoires:(state?.grimoires || []).map(normalizeGrimoire)
    };
    const target = storage();
    if (target) target.setItem(STORAGE_KEY, JSON.stringify(normalized));
    else fallbackState = clone(normalized);
    return clone(normalized);
  }

  function mutate(mutator) {
    const state = readState();
    const result = mutator(state);
    writeState(state);
    return result;
  }

  function makeId() {
    idCounter += 1;
    const random = globalThis.crypto?.getRandomValues
      ? (() => {
          const values = new Uint32Array(1);
          globalThis.crypto.getRandomValues(values);
          return values[0].toString(36);
        })()
      : Math.random().toString(36).slice(2, 8);
    return `grimorio-${Date.now().toString(36)}-${idCounter.toString(36)}-${random}`;
  }

  A.SIGIAN_GRIMOIRE_STORAGE_KEY = STORAGE_KEY;
  A.SIGIAN_GRIMOIRE_SCHEMA_VERSION = SCHEMA_VERSION;

  A.listSigianGrimoires = function listSigianGrimoires() {
    return readState().grimoires
      .slice()
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
      .map(clone);
  };

  A.getSigianGrimoire = function getSigianGrimoire(id) {
    const found = readState().grimoires.find(item => item.id === String(id || ""));
    return found ? clone(found) : null;
  };

  A.createSigianGrimoire = function createSigianGrimoire(options = {}) {
    return mutate(state => {
      const createdAt = nowIso();
      const grimoire = normalizeGrimoire({
        id:makeId(),
        name:normalizeName(options.name, `Grimorio ${state.grimoires.length + 1}`),
        formulaIds:options.formulaIds,
        createdAt,
        updatedAt:createdAt
      }, state.grimoires.length);
      state.grimoires.push(grimoire);
      return clone(grimoire);
    });
  };

  A.renameSigianGrimoire = function renameSigianGrimoire(id, name) {
    return mutate(state => {
      const grimoire = state.grimoires.find(item => item.id === String(id || ""));
      if (!grimoire) return null;
      grimoire.name = normalizeName(name, grimoire.name);
      grimoire.updatedAt = nowIso();
      return clone(grimoire);
    });
  };

  A.deleteSigianGrimoire = function deleteSigianGrimoire(id) {
    return mutate(state => {
      const index = state.grimoires.findIndex(item => item.id === String(id || ""));
      if (index < 0) return false;
      state.grimoires.splice(index, 1);
      return true;
    });
  };

  A.duplicateSigianGrimoire = function duplicateSigianGrimoire(id) {
    return mutate(state => {
      const source = state.grimoires.find(item => item.id === String(id || ""));
      if (!source) return null;
      const createdAt = nowIso();
      const copy = normalizeGrimoire({
        id:makeId(),
        name:`${source.name} — copia`,
        formulaIds:source.formulaIds,
        createdAt,
        updatedAt:createdAt
      }, state.grimoires.length);
      state.grimoires.push(copy);
      return clone(copy);
    });
  };

  A.addFormulaToSigianGrimoire = function addFormulaToSigianGrimoire(id, formulaId) {
    const normalizedFormulaId = String(formulaId || "").trim();
    if (!normalizedFormulaId) return null;
    return mutate(state => {
      const grimoire = state.grimoires.find(item => item.id === String(id || ""));
      if (!grimoire) return null;
      if (!grimoire.formulaIds.includes(normalizedFormulaId)) {
        grimoire.formulaIds.push(normalizedFormulaId);
        grimoire.updatedAt = nowIso();
      }
      return clone(grimoire);
    });
  };

  A.removeFormulaFromSigianGrimoire = function removeFormulaFromSigianGrimoire(id, formulaId) {
    const normalizedFormulaId = String(formulaId || "").trim();
    return mutate(state => {
      const grimoire = state.grimoires.find(item => item.id === String(id || ""));
      if (!grimoire) return null;
      const next = grimoire.formulaIds.filter(item => item !== normalizedFormulaId);
      if (next.length !== grimoire.formulaIds.length) {
        grimoire.formulaIds = next;
        grimoire.updatedAt = nowIso();
      }
      return clone(grimoire);
    });
  };

  A.replaceSigianGrimoireFormulas = function replaceSigianGrimoireFormulas(id, formulaIds) {
    return mutate(state => {
      const grimoire = state.grimoires.find(item => item.id === String(id || ""));
      if (!grimoire) return null;
      grimoire.formulaIds = normalizeFormulaIds(formulaIds);
      grimoire.updatedAt = nowIso();
      return clone(grimoire);
    });
  };

  A.resetSigianGrimoires = function resetSigianGrimoires() {
    const target = storage();
    if (target) target.removeItem(STORAGE_KEY);
    fallbackState = emptyState();
    return [];
  };
})(window.Arcane = window.Arcane || {});
