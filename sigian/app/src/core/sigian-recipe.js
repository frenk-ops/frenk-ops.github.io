(function (A) {
  "use strict";

  const RECIPE_SCHEMA_VERSION = 3;
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

  function normalizeDeployTiming(config, sigilId) {
    const next = asRecord(config);
    const definition = A.getCanonicalSigil?.(sigilId);
    const supportsDeploy = Array.isArray(definition?.configSchema?.when) && definition.configSchema.when.includes("onDeploy");
    if (supportsDeploy && (next.when === "onPlay" || next.when === "onSummon")) next.when = "onDeploy";
    return next;
  }

  function normalizeSigilItem(item, index, formulaSchool) {
    let sigilId = id(item.sigilId || item.id);
    let grade = item.grade == null ? null : item.grade;

    // v1 compatibility: Rinascita ∞ was encoded as a Grade. It is now an
    // atomic Sigillo because unlimited revival only makes sense with a
    // mandatory activation condition.
    if (sigilId === "rebirth" && grade === "infinite") {
      sigilId = "eternal-rebirth";
      grade = 1;
    }

    const config = normalizeDeployTiming(item.config, sigilId);

    // v1 compatibility: Infusione used power/all-powers + one school.
    // Canonically the effect now targets one, two, three or all Schools.
    if (sigilId === "infusion") {
      if (config.schools == null) {
        config.schools = config.scope === "all-powers"
          ? "all"
          : [id(config.school, formulaSchool)].filter(Boolean);
      } else if (Array.isArray(config.schools)) {
        config.schools = [...new Set(config.schools.map(value => id(value)).filter(Boolean))].slice(0, 3);
      }
      delete config.scope;
      delete config.school;
    }

    return {
      slotId: id(item.slotId, `sigil-${index + 1}`),
      collectibleId: item.collectibleId == null ? null : id(item.collectibleId),
      sigilId,
      grade,
      intensity: item.intensity == null ? null : Number(item.intensity),
      affinity: item.affinity == null
        ? null
        : (A.normalizeSigianAffinity?.(item.affinity, formulaSchool) || asRecord(item.affinity)),
      config,
      modifiers: (item.modifiers || []).map(modifier => ({
        id: id(modifier.id),
        params: asRecord(modifier.params)
      }))
    };
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
      sigils: (source.sigils || []).map((item, index) => normalizeSigilItem(item, index, id(source.school))),
      metadata: asRecord(source.metadata)
    };
  };

  function validateConfigAgainstSchema(config, schema, label, errors) {
    const source = config || {};
    const rules = schema || {};

    Object.keys(source).forEach(key => {
      if (!Object.prototype.hasOwnProperty.call(rules, key)) {
        errors.push(`${label}: configurazione ${key} non supportata.`);
      }
    });

    Object.entries(rules).forEach(([key, rule]) => {
      if (!Object.prototype.hasOwnProperty.call(source, key)) return;
      const value = source[key];
      if (Array.isArray(rule)) {
        if (!rule.includes(value)) errors.push(`${label}: configurazione ${key} non valida (${value}).`);
        return;
      }
      if (rule === "number") {
        if (!Number.isFinite(Number(value))) errors.push(`${label}: configurazione ${key} deve essere numerica.`);
        return;
      }
      if (rule === "school") {
        const school = A.getSigianSchool?.(value);
        if (!school || school.status !== "active") errors.push(`${label}: scuola di configurazione non valida (${value}).`);
        return;
      }
      if (rule === "schools") {
        if (value === "all") return;
        if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
          errors.push(`${label}: selezione Scuole non valida.`);
          return;
        }
        const unique = new Set(value.map(item => String(item || "")));
        if (unique.size !== value.length) errors.push(`${label}: Scuole duplicate non ammesse.`);
        value.forEach(schoolId => {
          const school = A.getSigianSchool?.(schoolId);
          if (!school || school.status !== "active") errors.push(`${label}: scuola di configurazione non valida (${schoolId}).`);
        });
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
        const validGrade = Number.isInteger(numeric) && numeric > 0;
        if (!validGrade) errors.push(`${label}: Grade non valido ${recipeSigil.grade}.`);
        if (definition.atomic && numeric !== 1) errors.push(`${label}: il Sigillo atomico ${definition.id} usa Grade I.`);
      } else if (!options.allowUncalibratedGrade) {
        errors.push(`${label}: Grade mancante.`);
      }

      if (recipeSigil.intensity != null && !Number.isFinite(Number(recipeSigil.intensity))) {
        errors.push(`${label}: intensità non numerica.`);
      }

      if (recipeSigil.collectibleId) {
        const collectible = A.getSigianCollectibleSigil?.(recipeSigil.collectibleId);
        if (!collectible) {
          errors.push(`${label}: Sigillo collezionabile non registrato ${recipeSigil.collectibleId}.`);
        } else {
          if (collectible.baseSigilId !== recipeSigil.sigilId) {
            errors.push(`${label}: ${recipeSigil.collectibleId} non corrisponde al Sigillo interno ${recipeSigil.sigilId}.`);
          }
          if (Number(collectible.grade) !== Number(recipeSigil.grade)) {
            errors.push(`${label}: il Grado è parte dell'identità di ${recipeSigil.collectibleId} e non può essere modificato.`);
          }
          if (!A.sigianCollectibleAllowsIntensity?.(recipeSigil.collectibleId, recipeSigil.intensity)) {
            errors.push(`${label}: intensità ${recipeSigil.intensity} non ammessa per ${recipeSigil.collectibleId}.`);
          }
        }
      }

      if (recipeSigil.affinity != null) {
        const affinityValidation = A.validateSigianAffinity?.(recipeSigil.affinity);
        if (affinityValidation && !affinityValidation.valid) {
          affinityValidation.errors.forEach(error => errors.push(`${label}: ${error}`));
        }
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
        if (modifierDefinition.status !== "active" && !options.allowInactiveModifiers) {
          errors.push(`${modifierLabel}: Modifier ${modifier.id} non attivo (${modifierDefinition.status}).`);
        }
        validateConfigAgainstSchema(modifier.params, modifierDefinition.paramsSchema || {}, `${modifierLabel} params`, errors);
        if (!(definition.modifierFamilies || []).includes(modifierDefinition.family)) {
          errors.push(`${modifierLabel}: famiglia ${modifierDefinition.family} non supportata da ${definition.id}.`);
        }
        const allowedIds = definition.modifierOptions?.[modifierDefinition.family];
        if (Array.isArray(allowedIds) && !allowedIds.includes(modifier.id)) {
          errors.push(`${modifierLabel}: Modifier ${modifier.id} non ammesso per ${definition.id}.`);
        }
        if (seenFamilies.has(modifierDefinition.family)) {
          errors.push(`${modifierLabel}: più Modifier indipendenti della stessa famiglia ${modifierDefinition.family} non sono ammessi nella v1.`);
        }
        seenFamilies.add(modifierDefinition.family);
      });

      if (seenFamilies.size > 2) {
        errors.push(`${label}: oltre due famiglie Modifier avanzate indipendenti.`);
      }

      if (definition.id === "eternal-rebirth" && !seenFamilies.has("activation")) {
        errors.push(`${label}: Rinascita Eterna richiede un Modifier di Attivazione.`);
      }
    });

    return { valid: errors.length === 0, errors, warnings, recipe };
  };
})(window.Arcane = window.Arcane || {});
