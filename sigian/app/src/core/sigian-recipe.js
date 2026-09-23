(function (A) {
  "use strict";

  const RECIPE_SCHEMA_VERSION = 1;
  const MAX_PRIMARY_SIGILS = 3;

  function clone(value) {
    if (typeof A.deepClone === "function") return A.deepClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function id(value, fallback = "") {
    return String(value == null ? fallback : value).trim();
  }

  function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? clone(value) : {};
  }

  A.SIGIAN_RECIPE_SCHEMA_VERSION = RECIPE_SCHEMA_VERSION;
  A.SIGIAN_MAX_PRIMARY_SIGILS = MAX_PRIMARY_SIGILS;

  A.createFormulaRecipe = function createFormulaRecipe(options = {}) {
    const source = options || {};
    const type = id(source.type, "creature");
    const stats = source.stats || {};
    return {
      schemaVersion: RECIPE_SCHEMA_VERSION,
      id: id(source.id),
      school: id(source.school),
      type,
      stats: type === "creature"
        ? {
            attack: Math.max(0, Math.trunc(Number(stats.attack ?? 1))),
            health: Math.max(1, Math.trunc(Number(stats.health ?? 5)))
          }
        : {},
      presentation: {
        name: id(source.presentation?.name, source.id),
        text: String(source.presentation?.text || ""),
        keyword: String(source.presentation?.keyword || ""),
        art: String(source.presentation?.art || ""),
        imageKey: source.presentation?.imageKey == null ? null : String(source.presentation.imageKey)
      },
      sigils: (source.sigils || []).map((item, index) => ({
        slotId: id(item.slotId, `sigil-${index + 1}`),
        sigilId: id(item.sigilId || item.id),
        grade: item.grade == null ? null : item.grade,
        config: asRecord(item.config),
        modifiers: (item.modifiers || []).map(modifier => ({
          id: id(modifier.id),
          params: asRecord(modifier.params)
        }))
      })),
      metadata: asRecord(source.metadata)
    };
  };

  function validateConfigAgainstSchema(config, schema, label, errors) {
    Object.entries(schema || {}).forEach(([key, allowed]) => {
      if (!Array.isArray(allowed) || !Object.prototype.hasOwnProperty.call(config || {}, key)) return;
      if (!allowed.includes(config[key])) {
        errors.push(`${label}: configurazione ${key} non valida (${config[key]}).`);
      }
    });
  }

  A.validateFormulaRecipe = function validateFormulaRecipe(input, options = {}) {
    const recipe = input && input.schemaVersion === RECIPE_SCHEMA_VERSION ? clone(input) : A.createFormulaRecipe(input || {});
    const errors = [];
    const warnings = [];

    if (recipe.schemaVersion !== RECIPE_SCHEMA_VERSION) errors.push("Versione schema FormulaRecipe non valida.");
    if (!recipe.id) errors.push("FormulaRecipe senza id.");
    if (!["creature", "spell"].includes(recipe.type)) errors.push(`FormulaRecipe ${recipe.id || "?"}: tipo non valido.`);

    const school = A.getSigianSchool?.(recipe.school);
    if (!school) errors.push(`FormulaRecipe ${recipe.id || "?"}: scuola non registrata ${recipe.school || "(vuota)"}.`);
    else if (school.status !== "active" && !options.allowInactiveSchools) {
      errors.push(`FormulaRecipe ${recipe.id || "?"}: scuola ${recipe.school} non attiva.`);
    }

    if (!Array.isArray(recipe.sigils)) {
      errors.push(`FormulaRecipe ${recipe.id || "?"}: lista Sigilli assente.`);
      return { valid: false, errors, warnings, recipe };
    }
    if (recipe.sigils.length > MAX_PRIMARY_SIGILS && !options.allowSignatureOverflow) {
      errors.push(`FormulaRecipe ${recipe.id || "?"}: massimo ${MAX_PRIMARY_SIGILS} Sigilli primari.`);
    }

    const slotIds = new Set();
    recipe.sigils.forEach((recipeSigil, index) => {
      const label = `FormulaRecipe ${recipe.id || "?"}, Sigillo ${index + 1}`;
      if (!recipeSigil.slotId) errors.push(`${label}: slotId mancante.`);
      else if (slotIds.has(recipeSigil.slotId)) errors.push(`${label}: slotId duplicato ${recipeSigil.slotId}.`);
      else slotIds.add(recipeSigil.slotId);

      const definition = A.getCanonicalSigil?.(recipeSigil.sigilId);
      if (!definition) {
        errors.push(`${label}: Sigillo non registrato ${recipeSigil.sigilId || "(vuoto)"}.`);
        return;
      }
      if (definition.status !== "active" && !options.allowReservedSigils) {
        errors.push(`${label}: Sigillo ${recipeSigil.sigilId} non attivo (${definition.status}).`);
      }

      if (recipeSigil.grade != null) {
        const numeric = Number(recipeSigil.grade);
        const validGrade = recipeSigil.grade === "infinite" || (Number.isInteger(numeric) && numeric > 0);
        if (!validGrade) errors.push(`${label}: Grade non valido ${recipeSigil.grade}.`);
      } else if (!options.allowUncalibratedGrade) {
        errors.push(`${label}: Grade mancante.`);
      }

      validateConfigAgainstSchema(recipeSigil.config, definition.configSchema, label, errors);

      const seenFamilies = new Set();
      (recipeSigil.modifiers || []).forEach((modifier, modifierIndex) => {
        const modifierLabel = `${label}, Modifier ${modifierIndex + 1}`;
        const modifierDefinition = A.getSigianAdvancedModifier?.(modifier.id);
        if (!modifierDefinition) {
          errors.push(`${modifierLabel}: Modifier non registrato ${modifier.id || "(vuoto)"}.`);
          return;
        }
        if (modifierDefinition.status === "reserved" && !options.allowReservedModifiers) {
          errors.push(`${modifierLabel}: Modifier ${modifier.id} riservato.`);
        }
        if (!(definition.modifierFamilies || []).includes(modifierDefinition.family)) {
          errors.push(`${modifierLabel}: famiglia ${modifierDefinition.family} non supportata da ${definition.id}.`);
        }
        if (seenFamilies.has(modifierDefinition.family)) {
          errors.push(`${modifierLabel}: più Modifier indipendenti della stessa famiglia ${modifierDefinition.family} non sono ammessi nella v1.`);
        }
        seenFamilies.add(modifierDefinition.family);
      });

      if (seenFamilies.size > 2) {
        errors.push(`${label}: oltre due famiglie Modifier avanzate indipendenti.`);
      }

      if (definition.id === "rebirth" && recipeSigil.grade === "infinite" && !seenFamilies.has("condition")) {
        errors.push(`${label}: Rinascita ∞ richiede un Modifier di Condizione.`);
      }
    });

    return { valid: errors.length === 0, errors, warnings, recipe };
  };
})(window.Arcane = window.Arcane || {});
