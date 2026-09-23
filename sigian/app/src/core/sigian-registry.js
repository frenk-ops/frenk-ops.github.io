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
    {
      id: "damage", family: "damage",
      modifierFamilies: ["scaling", "activation"],
      modifierOptions: {
        scaling: ["scale-power-half", "scale-power", "scale-power-double"],
        activation: ["activation-power-threshold", "activation-power-comparison", "activation-critical-life"]
      },
      configSchema: {
        when: ["onDeploy"],
        target: ["enemy-hero", "enemy-creature"],
        selector: ["strongest-health", "strongest-attack"]
      }
    },
    {
      id: "wave", family: "damage",
      modifierFamilies: ["scaling", "constraint"],
      modifierOptions: {
        scaling: ["scale-power-half", "scale-power", "scale-target-attack"],
        constraint: ["constraint-friendly-fire", "constraint-friendly-fire-power-threshold"]
      },
      configSchema: { when: ["onDeploy"], scope: ["field", "front"] }
    },
    {
      id: "backlash", family: "damage",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-power-comparison"]
      },
      configSchema: { when: ["onDeploy", "onBeforeAttack"], target: ["self-hero"] }
    },
    {
      id: "retaliation", family: "damage",
      modifierFamilies: ["scaling", "activation"],
      modifierOptions: {
        scaling: ["scale-power-half", "scale-power"],
        activation: ["activation-power-threshold", "activation-power-comparison", "activation-critical-life"]
      },
      configSchema: { reaction: ["damaged", "attacked"], target: ["event-source"] }
    },
    {
      id: "heal", family: "healing",
      modifierFamilies: ["scaling", "activation"],
      modifierOptions: {
        scaling: ["scale-power-half", "scale-power", "scale-power-double", "scale-creature-count"],
        activation: ["activation-power-threshold", "activation-power-comparison", "activation-critical-life", "activation-on-any-death"]
      },
      configSchema: {
        when: ["onDeploy", "onBeforeAttack"],
        target: ["self-hero", "allied-creature"]
      }
    },
    {
      id: "restoration", family: "healing",
      modifierFamilies: ["scaling", "activation"],
      modifierOptions: {
        scaling: ["scale-power-half", "scale-power", "scale-full-health"],
        activation: ["activation-power-threshold", "activation-critical-life"]
      },
      configSchema: {
        when: ["onDeploy", "onBeforeAttack"],
        scope: ["field", "front"]
      }
    },
    {
      id: "regeneration", family: "healing",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-critical-life"]
      },
      configSchema: { when: ["onBeforeAttack"], target: ["source"] }
    },
    {
      id: "infusion", family: "power",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-power-comparison", "activation-on-any-death"]
      },
      gradeModel: { type: "magnitude", unit: "power" },
      configSchema: { when: ["onDeploy"], schools: "schools" }
    },
    {
      id: "subtraction", family: "power",
      modifierFamilies: ["selector", "activation"],
      modifierOptions: {
        selector: [],
        activation: ["activation-power-threshold", "activation-power-comparison"]
      },
      configSchema: { when: ["onDeploy"], scope: ["power", "all-powers"], school: "school" }
    },
    {
      id: "channeling", family: "power",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-power-comparison"]
      },
      configSchema: { when: ["whileAlive"], scope: ["power", "all-powers"], school: "school" }
    },
    {
      id: "erosion", family: "power",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-power-comparison"]
      },
      configSchema: {
        when: ["whileAlive"],
        side: ["self", "enemy"],
        scope: ["power", "all-powers"],
        school: "school"
      }
    },
    {
      id: "tribute", family: "power",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-power-comparison"]
      },
      configSchema: {
        when: ["onDeploy"],
        scope: ["power", "all-powers"],
        school: "school"
      }
    },
    {
      id: "protection", family: "combat",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-critical-life"]
      },
      configSchema: {
        mode: ["halve", "subtract"],
        targetScope: ["hero", "hero-and-creatures"],
        stacking: ["per-copy", "presence"],
        threshold: "number"
      }
    },
    {
      id: "arcane-amplification", family: "combat",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-critical-life"]
      },
      configSchema: { mode: ["multiplier", "flat"], numerator: "number", denominator: "number", stacking: ["per-copy", "presence"] }
    },
    {
      id: "combat-fury", family: "combat",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-critical-life"]
      },
      configSchema: { mode: ["multiplier"], numerator: "number", denominator: "number", stacking: ["per-copy", "presence"] }
    },
    {
      id: "total-assault", family: "combat",
      modifierFamilies: [],
      modifierOptions: {},
      configSchema: {}
    },
    {
      id: "arcane-attack", family: "combat",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold"]
      },
      configSchema: { school: "school" }
    },
    {
      id: "absorption", family: "combat",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-critical-life"]
      },
      configSchema: { sourceTarget: ["creature", "any"], healTarget: ["source", "self-hero"], numerator: "number", denominator: "number" }
    },
    {
      id: "destruction", family: "control",
      modifierFamilies: ["selector", "activation"],
      modifierOptions: {
        selector: ["selector-highest-life", "selector-highest-attack"],
        activation: ["activation-power-threshold", "activation-power-comparison"]
      },
      configSchema: { when: ["onDeploy"], target: ["enemy-creature"] }
    },
    {
      id: "annihilation", family: "control",
      modifierFamilies: ["constraint", "activation"],
      modifierOptions: {
        constraint: ["constraint-friendly-fire"],
        activation: ["activation-power-threshold", "activation-power-comparison"]
      },
      configSchema: { when: ["onDeploy"], scope: ["enemy-field", "all-field"] }
    },
    {
      id: "rebirth", family: "control",
      gradeModel: { type: "revival-count" },
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-power-comparison"]
      },
      configSchema: { when: ["onSelfDeath"], target: ["source"] }
    },
    {
      id: "eternal-rebirth", family: "control",
      gradeModel: { type: "fixed", grade: 1 },
      atomic: true,
      requiredModifierFamilies: ["activation"],
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-power-comparison"]
      },
      configSchema: { when: ["onSelfDeath"], target: ["source"] }
    },
    {
      id: "domination", family: "control",
      modifierFamilies: ["selector", "activation"],
      modifierOptions: {
        selector: ["selector-highest-attack"],
        activation: ["activation-power-threshold", "activation-power-comparison"]
      },
      configSchema: { when: ["onDeploy"], destination: ["own-hero"] }
    }
  ];

  SIGIL_DEFINITIONS.forEach(definition => {
    sigils.register({
      gradeModel: { type: "magnitude" },
      affinitySupport: ["mono", "dual", "triple", "universal"],
      rarityPolicy: "derived-from-power-flexibility",
      ...definition,
      status: "active"
    });
  });

  [
    { id: "chain", family: "future", modifierFamilies: [], modifierOptions: {}, configSchema: {}, status: "reserved" },
    { id: "echo", family: "future", modifierFamilies: [], modifierOptions: {}, configSchema: {}, status: "reserved" }
  ].forEach(definition => sigils.register(definition));

  [
    { id: "scale-power-half", family: "scaling", status: "active", paramsSchema: { school: "school", min: "number" } },
    { id: "scale-power", family: "scaling", status: "active", paramsSchema: { school: "school", min: "number" } },
    { id: "scale-power-double", family: "scaling", status: "active", paramsSchema: { school: "school", min: "number" } },
    { id: "scale-target-attack", family: "scaling", status: "active", paramsSchema: {} },
    { id: "scale-full-health", family: "scaling", status: "active", paramsSchema: {} },
    { id: "scale-creature-count", family: "scaling", status: "active", paramsSchema: {} },
    { id: "scale-damage-dealt", family: "scaling", status: "active", paramsSchema: { numerator: "number", denominator: "number" } },

    { id: "activation-power-threshold", family: "activation", status: "active", paramsSchema: { side: ["self", "enemy"], school: "school", op: ["lt", "lte", "gt", "gte", "eq", "neq"], value: "number" } },
    { id: "activation-power-comparison", family: "activation", status: "active", paramsSchema: { leftSide: ["self", "enemy"], rightSide: ["self", "enemy"], leftSchool: "school", rightSchool: "school", op: ["lt", "lte", "gt", "gte", "eq", "neq"] } },
    { id: "activation-critical-life", family: "activation", status: "provisional", paramsSchema: { op: ["lt", "lte", "gt", "gte"], value: "number" } },
    { id: "activation-on-any-death", family: "activation", status: "active", paramsSchema: {} },

    { id: "constraint-friendly-fire", family: "constraint", status: "active", paramsSchema: {} },
    { id: "constraint-friendly-fire-power-threshold", family: "constraint", status: "active", paramsSchema: { school: "school", op: ["lt", "lte", "gt", "gte"], value: "number" } },

    { id: "selector-highest-life", family: "selector", status: "active", paramsSchema: {} },
    { id: "selector-highest-attack", family: "selector", status: "active", paramsSchema: {} }
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
