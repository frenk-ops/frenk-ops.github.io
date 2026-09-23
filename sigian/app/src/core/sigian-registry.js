(function (A) {
  "use strict";

  function clone(value) {
    if (typeof A.deepClone === "function") return A.deepClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function normalizedId(value, label) {
    const id = String(value || "").trim();
    if (!id) throw new Error(`${label} richiede un id.`);
    return id;
  }

  function createRegistry(label) {
    const items = new Map();

    return Object.freeze({
      register(definition, options = {}) {
        const source = definition || {};
        const id = normalizedId(source.id, label);
        if (items.has(id) && !options.replace) {
          throw new Error(`${label} già registrato: ${id}.`);
        }
        const stored = {
          ...source,
          id,
          status: String(source.status || "active")
        };
        items.set(id, stored);
        return stored;
      },
      get(id) {
        return items.get(String(id || "")) || null;
      },
      has(id) {
        return items.has(String(id || ""));
      },
      list(options = {}) {
        const status = options.status == null ? null : String(options.status);
        return [...items.values()]
          .filter(item => !status || item.status === status)
          .map(item => {
            const copy = { ...item };
            delete copy.compile;
            return clone(copy);
          });
      }
    });
  }

  const schools = createRegistry("Scuola");
  const sigils = createRegistry("Sigillo canonico");
  const modifiers = createRegistry("Modifier");
  const compilers = new Map();

  (A.SCHOOLS || []).forEach(school => schools.register({
    id: school.id,
    name: school.name,
    icon: school.icon,
    status: "active",
    source: "base-set"
  }));

  const SIGIL_DEFINITIONS = [
    ["damage", "damage", ["scaling", "condition"], { when: ["onPlay", "onSummon"], target: ["enemy-hero", "enemy-creature"], selector: ["strongest-health", "strongest-attack"] }],
    ["wave", "damage", ["scaling", "constraint"], { when: ["onPlay", "onSummon"], scope: ["field", "front"] }],
    ["backlash", "damage", ["condition"], { when: ["onSummon", "onBeforeAttack"], target: ["self-hero"] }],
    ["retaliation", "damage", ["scaling", "condition"], { reaction: ["attacked", "damaged"], target: ["event-source"] }],
    ["heal", "healing", ["scaling", "condition"], { target: ["self-hero", "allied-creature"] }],
    ["restoration", "healing", ["scaling", "condition"], { scope: ["field", "front"] }],
    ["regeneration", "healing", ["condition"], { when: ["onBeforeAttack"], target: ["source"] }],
    ["infusion", "power", ["condition"], { scope: ["power", "all-powers"] }],
    ["subtraction", "power", ["selector", "condition"], { scope: ["power", "all-powers"] }],
    ["channeling", "power", ["condition"], { scope: ["power", "all-powers"] }],
    ["erosion", "power", ["condition"], { side: ["self", "enemy"], scope: ["power", "all-powers"] }],
    ["protection", "combat", ["condition"], {}],
    ["arcane-amplification", "combat", ["condition"], {}],
    ["combat-fury", "combat", ["condition"], {}],
    ["total-assault", "combat", [], {}],
    ["arcane-attack", "combat", ["condition"], {}],
    ["absorption", "combat", ["condition"], {}],
    ["destruction", "control", ["selector", "condition"], { target: ["enemy-creature"] }],
    ["annihilation", "control", ["constraint", "condition"], { scope: ["enemy-field", "all-field"] }],
    ["rebirth", "control", ["condition"], { target: ["source"] }],
    ["domination", "control", ["selector", "condition"], {}]
  ];

  SIGIL_DEFINITIONS.forEach(([id, family, modifierFamilies, configSchema]) => {
    sigils.register({
      id,
      family,
      modifierFamilies,
      configSchema,
      status: "active"
    });
  });

  [
    { id: "chain", family: "future", modifierFamilies: [], configSchema: {}, status: "reserved" },
    { id: "echo", family: "future", modifierFamilies: [], configSchema: {}, status: "reserved" }
  ].forEach(definition => sigils.register(definition));

  [
    { id: "scale-power-half", family: "scaling", status: "active" },
    { id: "scale-power", family: "scaling", status: "active" },
    { id: "condition-power-threshold", family: "condition", status: "active" },
    { id: "condition-power-comparison", family: "condition", status: "active" },
    { id: "condition-critical-life", family: "condition", status: "provisional" },
    { id: "constraint-friendly-fire", family: "constraint", status: "active" },
    { id: "selector-highest-life", family: "selector", status: "active" },
    { id: "selector-highest-attack", family: "selector", status: "active" }
  ].forEach(definition => modifiers.register(definition));

  A.SIGIAN_SCHOOL_REGISTRY = schools;
  A.SIGIAN_CANONICAL_SIGIL_REGISTRY = sigils;
  A.SIGIAN_ADVANCED_MODIFIER_REGISTRY = modifiers;

  A.registerSigianSchool = function registerSigianSchool(definition, options) {
    return schools.register(definition, options);
  };

  A.getSigianSchool = function getSigianSchool(id) {
    return schools.get(id);
  };

  A.listSigianSchools = function listSigianSchools(options) {
    return schools.list(options);
  };

  A.registerCanonicalSigil = function registerCanonicalSigil(definition, options) {
    return sigils.register(definition, options);
  };

  A.getCanonicalSigil = function getCanonicalSigil(id) {
    return sigils.get(id);
  };

  A.listCanonicalSigils = function listCanonicalSigils(options) {
    return sigils.list(options);
  };

  A.registerSigianAdvancedModifier = function registerSigianAdvancedModifier(definition, options) {
    return modifiers.register(definition, options);
  };

  A.getSigianAdvancedModifier = function getSigianAdvancedModifier(id) {
    return modifiers.get(id);
  };

  A.listSigianAdvancedModifiers = function listSigianAdvancedModifiers(options) {
    return modifiers.list(options);
  };

  A.registerSigianSigilCompiler = function registerSigianSigilCompiler(sigilId, compiler, options = {}) {
    const id = normalizedId(sigilId, "Compiler Sigillo");
    if (typeof compiler !== "function") throw new Error(`Compiler Sigillo ${id} non valido.`);
    if (compilers.has(id) && !options.replace) throw new Error(`Compiler Sigillo già registrato: ${id}.`);
    compilers.set(id, compiler);
    return compiler;
  };

  A.getSigianSigilCompiler = function getSigianSigilCompiler(sigilId) {
    return compilers.get(String(sigilId || "")) || null;
  };
})(window.Arcane = window.Arcane || {});
