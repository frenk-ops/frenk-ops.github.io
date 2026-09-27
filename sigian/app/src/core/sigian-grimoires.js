(function (A) {
  "use strict";

  const STORAGE_KEY = "sigian.grimoires.v2";
  const LEGACY_STORAGE_KEY = "sigian.grimoires.v1";
  const SCHEMA_VERSION = 2;
  const STANDARD_GRIMOIRE_ID = "standard";
  const MAX_PERSONAL_GRIMOIRES = 10;
  const ACTIVE_SCHOOL_LIMIT = 5;
  const FORMULAS_PER_SCHOOL = 13;
  const BASE_FORMULA_COUNT = 20;
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

  function officialSchoolIds() {
    return (A.SCHOOLS || []).map(item => String(item.id || "")).filter(Boolean);
  }

  function launchSchoolIds() {
    return officialSchoolIds().slice(0, ACTIVE_SCHOOL_LIMIT);
  }

  function normalizeSchoolIds(values, fallback = launchSchoolIds()) {
    const valid = new Set(officialSchoolIds());
    const source = Array.isArray(values) ? values : [];
    const result = [...new Set(source.map(value => String(value || "").trim()).filter(value => valid.has(value)))]
      .slice(0, ACTIVE_SCHOOL_LIMIT);
    return result.length ? result : [...fallback];
  }

  function normalizeName(value, fallback = "Nuovo Grimorio") {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 48) || fallback;
  }

  function normalizeFormulaInstanceId(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (raw.startsWith("owned:") || raw.startsWith("formula:")) return raw;
    const instance = A.getSigianFormulaInstance?.(raw);
    return String(instance?.formulaInstanceId || raw);
  }

  function normalizeFormulaIds(values) {
    const source = Array.isArray(values) ? values : [];
    return [...new Set(source.map(normalizeFormulaInstanceId).filter(Boolean))];
  }

  function rawOriginalCard(cardId) {
    return (A.RAW_CARD_SETS?.["astral-original"] || []).find(card => card.id === String(cardId || "")) || null;
  }

  function formulaSchool(formulaInstanceId) {
    const id = normalizeFormulaInstanceId(formulaInstanceId);
    const instance = id ? A.getSigianFormulaInstance?.(id) || null : null;
    if (!instance) return null;
    const persisted = A.getSigianFormulaComposition?.(id, { allowCanonicalFallback:false }) || null;
    if (persisted?.composition?.school) return String(persisted.composition.school);
    if (instance.sourceCardId) return String(rawOriginalCard(instance.sourceCardId)?.school || "") || null;
    return null;
  }

  function formulaReference(formulaInstanceId, options = {}) {
    const id = normalizeFormulaInstanceId(formulaInstanceId);
    if (options.standard) {
      const sourceCardId = id.startsWith("owned:") ? id.slice(6) : id;
      const card = rawOriginalCard(sourceCardId);
      return {
        formulaInstanceId:id,
        exists:Boolean(card),
        recipeId:card?.id || null,
        sourceCardId:card?.id || null,
        school:card?.school || null,
        lifecycleState:card ? "SEALED" : null,
        playable:Boolean(card),
        standard:true
      };
    }
    const instance = id ? A.getSigianFormulaInstance?.(id) || null : null;
    return {
      formulaInstanceId:id,
      exists:Boolean(instance),
      recipeId:instance?.recipeId ?? null,
      sourceCardId:instance?.sourceCardId ?? null,
      school:instance ? formulaSchool(id) : null,
      lifecycleState:instance?.lifecycleState ?? null,
      playable:Boolean(instance && instance.lifecycleState === "SEALED")
    };
  }

  function normalizePersonalGrimoire(input = {}, index = 0) {
    const createdAt = String(input.createdAt || nowIso());
    const specializationFormulaId = normalizeFormulaInstanceId(input.specializationFormulaId);
    return {
      id:String(input.id || `grimorio-${Date.now().toString(36)}-${index + 1}`),
      kind:"PERSONAL",
      immutable:false,
      name:normalizeName(input.name, `Grimorio ${index + 1}`),
      schoolIds:normalizeSchoolIds(input.schoolIds),
      formulaIds:normalizeFormulaIds(input.formulaIds),
      specializationFormulaId:specializationFormulaId || null,
      createdAt,
      updatedAt:String(input.updatedAt || createdAt)
    };
  }

  function standardGrimoire() {
    const cards = A.RAW_CARD_SETS?.["astral-original"] || [];
    const schoolIds = [...new Set(cards.map(card => card.school).filter(Boolean))];
    return {
      id:STANDARD_GRIMOIRE_ID,
      kind:"STANDARD",
      immutable:true,
      name:"Grimorio Standard",
      schoolIds,
      formulaIds:cards.map(card => `owned:${card.id}`),
      specializationFormulaId:null,
      createdAt:null,
      updatedAt:null
    };
  }

  function emptyState() {
    return { schemaVersion:SCHEMA_VERSION, grimoires:[] };
  }

  function legacyState(target) {
    try {
      const parsed = JSON.parse(target?.getItem(LEGACY_STORAGE_KEY) || "null");
      if (!parsed || !Array.isArray(parsed.grimoires)) return null;
      return {
        schemaVersion:SCHEMA_VERSION,
        grimoires:parsed.grimoires.map((item, index) => normalizePersonalGrimoire(item, index)).slice(0, MAX_PERSONAL_GRIMOIRES)
      };
    } catch {
      return null;
    }
  }

  function readState() {
    const target = storage();
    if (!target) {
      if (!fallbackState) fallbackState = emptyState();
      return clone(fallbackState);
    }

    try {
      const parsed = JSON.parse(target.getItem(STORAGE_KEY) || "null");
      if (parsed && parsed.schemaVersion === SCHEMA_VERSION && Array.isArray(parsed.grimoires)) {
        return {
          schemaVersion:SCHEMA_VERSION,
          grimoires:parsed.grimoires.map(normalizePersonalGrimoire).slice(0, MAX_PERSONAL_GRIMOIRES)
        };
      }
      return legacyState(target) || emptyState();
    } catch {
      return legacyState(target) || emptyState();
    }
  }

  function writeState(state) {
    const normalized = {
      schemaVersion:SCHEMA_VERSION,
      grimoires:(state?.grimoires || []).map(normalizePersonalGrimoire).slice(0, MAX_PERSONAL_GRIMOIRES)
    };
    const target = storage();
    if (target) {
      target.setItem(STORAGE_KEY, JSON.stringify(normalized));
      target.removeItem(LEGACY_STORAGE_KEY);
    } else fallbackState = clone(normalized);
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

  function isStandardId(id) {
    return String(id || "") === STANDARD_GRIMOIRE_ID;
  }

  function schoolCounts(grimoire) {
    const counts = Object.fromEntries((grimoire?.schoolIds || []).map(id => [id, 0]));
    (grimoire?.formulaIds || []).forEach(formulaInstanceId => {
      const school = formulaSchool(formulaInstanceId);
      if (school && Object.prototype.hasOwnProperty.call(counts, school)) counts[school] += 1;
    });
    return counts;
  }

  function normalizedFormulasForSchools(formulaIds, schoolIds) {
    const selected = new Set(schoolIds || []);
    const counts = Object.fromEntries((schoolIds || []).map(id => [id, 0]));
    const result = [];
    normalizeFormulaIds(formulaIds).forEach(formulaInstanceId => {
      const instance = A.getSigianFormulaInstance?.(formulaInstanceId);
      if (!instance) return;
      const school = formulaSchool(formulaInstanceId);
      if (!school || !selected.has(school)) return;
      if ((counts[school] || 0) >= FORMULAS_PER_SCHOOL) return;
      counts[school] += 1;
      result.push(formulaInstanceId);
    });
    return result;
  }

  A.SIGIAN_GRIMOIRE_STORAGE_KEY = STORAGE_KEY;
  A.SIGIAN_GRIMOIRE_LEGACY_STORAGE_KEY = LEGACY_STORAGE_KEY;
  A.SIGIAN_GRIMOIRE_SCHEMA_VERSION = SCHEMA_VERSION;
  A.SIGIAN_STANDARD_GRIMOIRE_ID = STANDARD_GRIMOIRE_ID;
  A.SIGIAN_GRIMOIRE_MAX_PERSONAL = MAX_PERSONAL_GRIMOIRES;
  A.SIGIAN_GRIMOIRE_ACTIVE_SCHOOLS = ACTIVE_SCHOOL_LIMIT;
  A.SIGIAN_GRIMOIRE_FORMULAS_PER_SCHOOL = FORMULAS_PER_SCHOOL;
  A.SIGIAN_GRIMOIRE_BASE_FORMULA_COUNT = BASE_FORMULA_COUNT;
  A.normalizeSigianGrimoireFormulaInstanceId = normalizeFormulaInstanceId;
  A.getSigianFormulaInstanceSchool = formulaSchool;

  A.listSigianGrimoires = function listSigianGrimoires() {
    return readState().grimoires
      .slice()
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
      .map(clone);
  };

  A.getSigianStandardGrimoire = function getSigianStandardGrimoire() {
    return clone(standardGrimoire());
  };

  A.listSigianAllGrimoires = function listSigianAllGrimoires() {
    return [A.getSigianStandardGrimoire(), ...A.listSigianGrimoires()];
  };

  A.getSigianGrimoire = function getSigianGrimoire(id) {
    if (isStandardId(id)) return A.getSigianStandardGrimoire();
    const found = readState().grimoires.find(item => item.id === String(id || ""));
    return found ? clone(found) : null;
  };

  A.getSigianGrimoireFormulaEntries = function getSigianGrimoireFormulaEntries(id) {
    const grimoire = A.getSigianGrimoire(id);
    return (grimoire?.formulaIds || []).map(formulaInstanceId => formulaReference(formulaInstanceId, {
      standard:grimoire?.kind === "STANDARD"
    }));
  };

  A.getSigianGrimoireSchoolCounts = function getSigianGrimoireSchoolCounts(id) {
    const grimoire = typeof id === "object" ? id : A.getSigianGrimoire(id);
    if (!grimoire) return {};
    if (grimoire.kind === "STANDARD") {
      const counts = Object.fromEntries((grimoire.schoolIds || []).map(schoolId => [schoolId, 0]));
      (A.RAW_CARD_SETS?.["astral-original"] || []).forEach(card => {
        if (Object.prototype.hasOwnProperty.call(counts, card.school)) counts[card.school] += 1;
      });
      return counts;
    }
    return schoolCounts(grimoire);
  };

  A.validateSigianGrimoire = function validateSigianGrimoire(id, options = {}) {
    const grimoire = typeof id === "object" ? clone(id) : A.getSigianGrimoire(id);
    if (!grimoire) return {
      grimoire:null,
      ready:false,
      structuralReady:false,
      blockers:[{ code:"grimoire-missing" }],
      schoolCounts:{}
    };

    const blockers = [];
    const counts = A.getSigianGrimoireSchoolCounts(grimoire);
    if ((grimoire.schoolIds || []).length !== ACTIVE_SCHOOL_LIMIT) {
      blockers.push({ code:"active-school-count", expected:ACTIVE_SCHOOL_LIMIT, actual:(grimoire.schoolIds || []).length });
    }
    if ((grimoire.formulaIds || []).length !== ACTIVE_SCHOOL_LIMIT * FORMULAS_PER_SCHOOL) {
      blockers.push({ code:"formula-count", expected:ACTIVE_SCHOOL_LIMIT * FORMULAS_PER_SCHOOL, actual:(grimoire.formulaIds || []).length });
    }
    (grimoire.schoolIds || []).forEach(schoolId => {
      if (Number(counts[schoolId] || 0) !== FORMULAS_PER_SCHOOL) {
        blockers.push({ code:"school-formula-count", schoolId, expected:FORMULAS_PER_SCHOOL, actual:Number(counts[schoolId] || 0) });
      }
    });

    if (grimoire.kind !== "STANDARD") {
      A.getSigianGrimoireFormulaEntries(grimoire.id).forEach(entry => {
        if (!entry.exists) blockers.push({ code:"formula-instance-missing", formulaInstanceId:entry.formulaInstanceId });
        else if (!entry.playable) blockers.push({ code:"formula-not-sealed", formulaInstanceId:entry.formulaInstanceId });
        if (entry.school && !(grimoire.schoolIds || []).includes(entry.school)) {
          blockers.push({ code:"formula-school-not-active", formulaInstanceId:entry.formulaInstanceId, schoolId:entry.school });
        }
      });

      if (options.specializationsEnabled) {
        const formativeSchoolId = String(options.formativeSchoolId || "").trim();
        if (!formativeSchoolId || !(grimoire.schoolIds || []).includes(formativeSchoolId)) {
          blockers.push({ code:"formative-school-missing", schoolId:formativeSchoolId || null });
        }
        const specializationFormulaId = normalizeFormulaInstanceId(grimoire.specializationFormulaId);
        if (!specializationFormulaId) {
          blockers.push({ code:"specialization-formula-missing" });
        } else {
          const entry = formulaReference(specializationFormulaId);
          if (!(grimoire.formulaIds || []).includes(specializationFormulaId)) {
            blockers.push({ code:"specialization-formula-outside-grimoire", formulaInstanceId:specializationFormulaId });
          }
          if (!entry.playable) {
            blockers.push({ code:entry.exists ? "specialization-formula-not-sealed" : "specialization-formula-missing-instance", formulaInstanceId:specializationFormulaId });
          }
          if (formativeSchoolId && entry.school !== formativeSchoolId) {
            blockers.push({ code:"specialization-formula-school-mismatch", formulaInstanceId:specializationFormulaId, expectedSchoolId:formativeSchoolId, actualSchoolId:entry.school });
          }
        }
      }
    }

    const structuralCodes = new Set(["active-school-count", "formula-count", "school-formula-count", "formula-instance-missing", "formula-not-sealed", "formula-school-not-active"]);
    return {
      grimoire:clone(grimoire),
      ready:blockers.length === 0,
      structuralReady:!blockers.some(item => structuralCodes.has(item.code)),
      blockers,
      schoolCounts:clone(counts),
      baseFormulaCount:BASE_FORMULA_COUNT,
      finalFormulaCount:BASE_FORMULA_COUNT + (options.specializationsEnabled && grimoire.kind !== "STANDARD" ? 1 : 0)
    };
  };

  A.createSigianGrimoire = function createSigianGrimoire(options = {}) {
    return mutate(state => {
      if (state.grimoires.length >= MAX_PERSONAL_GRIMOIRES) return null;
      const createdAt = nowIso();
      const grimoire = normalizePersonalGrimoire({
        id:makeId(),
        name:normalizeName(options.name, `Grimorio ${state.grimoires.length + 1}`),
        schoolIds:options.schoolIds,
        formulaIds:options.formulaIds,
        specializationFormulaId:options.specializationFormulaId,
        createdAt,
        updatedAt:createdAt
      }, state.grimoires.length);
      grimoire.formulaIds = normalizedFormulasForSchools(grimoire.formulaIds, grimoire.schoolIds);
      if (!grimoire.formulaIds.includes(grimoire.specializationFormulaId)) grimoire.specializationFormulaId = null;
      state.grimoires.push(grimoire);
      return clone(grimoire);
    });
  };

  A.renameSigianGrimoire = function renameSigianGrimoire(id, name) {
    if (isStandardId(id)) return null;
    return mutate(state => {
      const grimoire = state.grimoires.find(item => item.id === String(id || ""));
      if (!grimoire) return null;
      grimoire.name = normalizeName(name, grimoire.name);
      grimoire.updatedAt = nowIso();
      return clone(grimoire);
    });
  };

  A.deleteSigianGrimoire = function deleteSigianGrimoire(id) {
    if (isStandardId(id)) return false;
    return mutate(state => {
      const index = state.grimoires.findIndex(item => item.id === String(id || ""));
      if (index < 0) return false;
      state.grimoires.splice(index, 1);
      return true;
    });
  };

  A.duplicateSigianGrimoire = function duplicateSigianGrimoire(id) {
    if (isStandardId(id)) return null;
    return mutate(state => {
      if (state.grimoires.length >= MAX_PERSONAL_GRIMOIRES) return null;
      const source = state.grimoires.find(item => item.id === String(id || ""));
      if (!source) return null;
      const createdAt = nowIso();
      const copy = normalizePersonalGrimoire({
        id:makeId(),
        name:`${source.name} — copia`,
        schoolIds:source.schoolIds,
        formulaIds:source.formulaIds,
        specializationFormulaId:source.specializationFormulaId,
        createdAt,
        updatedAt:createdAt
      }, state.grimoires.length);
      state.grimoires.push(copy);
      return clone(copy);
    });
  };

  A.setSigianGrimoireSchools = function setSigianGrimoireSchools(id, schoolIds) {
    if (isStandardId(id)) return null;
    return mutate(state => {
      const grimoire = state.grimoires.find(item => item.id === String(id || ""));
      if (!grimoire) return null;
      grimoire.schoolIds = normalizeSchoolIds(schoolIds, []);
      const selected = new Set(grimoire.schoolIds);
      grimoire.formulaIds = grimoire.formulaIds.filter(formulaInstanceId => selected.has(formulaSchool(formulaInstanceId)));
      if (!grimoire.formulaIds.includes(grimoire.specializationFormulaId)) grimoire.specializationFormulaId = null;
      grimoire.updatedAt = nowIso();
      return clone(grimoire);
    });
  };

  A.addFormulaToSigianGrimoire = function addFormulaToSigianGrimoire(id, formulaId) {
    if (isStandardId(id)) return null;
    const normalizedFormulaId = normalizeFormulaInstanceId(formulaId);
    if (!normalizedFormulaId) return null;
    if (typeof A.getSigianFormulaInstance === "function" && !A.getSigianFormulaInstance(normalizedFormulaId)) return null;
    return mutate(state => {
      const grimoire = state.grimoires.find(item => item.id === String(id || ""));
      if (!grimoire) return null;
      if (grimoire.formulaIds.includes(normalizedFormulaId)) return clone(grimoire);
      const school = formulaSchool(normalizedFormulaId);
      if (!school || !grimoire.schoolIds.includes(school)) return null;
      const counts = schoolCounts(grimoire);
      if (Number(counts[school] || 0) >= FORMULAS_PER_SCHOOL) return null;
      grimoire.formulaIds.push(normalizedFormulaId);
      grimoire.updatedAt = nowIso();
      return clone(grimoire);
    });
  };

  A.removeFormulaFromSigianGrimoire = function removeFormulaFromSigianGrimoire(id, formulaId) {
    if (isStandardId(id)) return null;
    const normalizedFormulaId = normalizeFormulaInstanceId(formulaId);
    return mutate(state => {
      const grimoire = state.grimoires.find(item => item.id === String(id || ""));
      if (!grimoire) return null;
      const next = grimoire.formulaIds.filter(item => item !== normalizedFormulaId);
      if (next.length !== grimoire.formulaIds.length) {
        grimoire.formulaIds = next;
        if (grimoire.specializationFormulaId === normalizedFormulaId) grimoire.specializationFormulaId = null;
        grimoire.updatedAt = nowIso();
      }
      return clone(grimoire);
    });
  };

  A.replaceSigianGrimoireFormulas = function replaceSigianGrimoireFormulas(id, formulaIds) {
    if (isStandardId(id)) return null;
    return mutate(state => {
      const grimoire = state.grimoires.find(item => item.id === String(id || ""));
      if (!grimoire) return null;
      grimoire.formulaIds = normalizedFormulasForSchools(formulaIds, grimoire.schoolIds);
      if (!grimoire.formulaIds.includes(grimoire.specializationFormulaId)) grimoire.specializationFormulaId = null;
      grimoire.updatedAt = nowIso();
      return clone(grimoire);
    });
  };

  A.setSigianGrimoireSpecializationFormula = function setSigianGrimoireSpecializationFormula(id, formulaId, formativeSchoolId) {
    if (isStandardId(id)) return null;
    const schoolId = String(formativeSchoolId || "").trim();
    const normalizedFormulaId = normalizeFormulaInstanceId(formulaId);
    return mutate(state => {
      const grimoire = state.grimoires.find(item => item.id === String(id || ""));
      if (!grimoire) return null;
      if (!normalizedFormulaId) {
        grimoire.specializationFormulaId = null;
        grimoire.updatedAt = nowIso();
        return clone(grimoire);
      }
      if (!schoolId || !grimoire.schoolIds.includes(schoolId)) return null;
      if (!grimoire.formulaIds.includes(normalizedFormulaId)) return null;
      if (formulaSchool(normalizedFormulaId) !== schoolId) return null;
      grimoire.specializationFormulaId = normalizedFormulaId;
      grimoire.updatedAt = nowIso();
      return clone(grimoire);
    });
  };

  A.resetSigianGrimoires = function resetSigianGrimoires() {
    const target = storage();
    if (target) {
      target.removeItem(STORAGE_KEY);
      target.removeItem(LEGACY_STORAGE_KEY);
    }
    fallbackState = emptyState();
    return [];
  };
})(window.Arcane = window.Arcane || {});
