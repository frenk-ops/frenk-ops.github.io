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
        when: ["onPlay", "onSummon"],
        target: ["enemy-hero", "enemy-creature"],
        selector: ["strongest-health", "strongest-attack"]
      }
    },
    {
      id: "wave", family: "damage",
      modifierFamilies: ["scaling", "constraint"],
      modifierOptions: {
        scaling: ["scale-power-half", "scale-power", "scale-target-attack"],
        constraint: ["constraint-friendly-fire"]
      },
      configSchema: { when: ["onPlay", "onSummon"], scope: ["field", "front"] }
    },
    {
      id: "backlash", family: "damage",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-power-comparison"]
      },
      configSchema: { when: ["onSummon", "onBeforeAttack"], target: ["self-hero"] }
    },
    {
      id: "retaliation", family: "damage",
      modifierFamilies: ["scaling", "activation"],
      modifierOptions: {
        scaling: ["scale-power-half", "scale-power"],
        activation: ["activation-power-threshold", "activation-power-comparison", "activation-critical-life"]
      },
      configSchema: { reaction: ["attacked", "damaged"], target: ["event-source"] }
    },
    {
      id: "heal", family: "healing",
      modifierFamilies: ["scaling", "activation"],
      modifierOptions: {
        scaling: ["scale-power-half", "scale-power", "scale-power-double"],
        activation: ["activation-power-threshold", "activation-power-comparison", "activation-critical-life", "activation-on-any-death"]
      },
      configSchema: {
        when: ["onPlay", "onSummon", "onBeforeAttack"],
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
        when: ["onPlay", "onSummon", "onBeforeAttack"],
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
      configSchema: { when: ["onPlay", "onSummon"], scope: ["power", "all-powers"] }
    },
    {
      id: "subtraction", family: "power",
      modifierFamilies: ["selector", "activation"],
      modifierOptions: {
        selector: [],
        activation: ["activation-power-threshold", "activation-power-comparison"]
      },
      configSchema: { when: ["onPlay", "onSummon"], scope: ["power", "all-powers"] }
    },
    {
      id: "channeling", family: "power",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-power-comparison"]
      },
      configSchema: { when: ["whileAlive"], scope: ["power", "all-powers"] }
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
        scope: ["power", "all-powers"]
      }
    },
    {
      id: "tribute", family: "power",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-power-comparison"]
      },
      configSchema: {
        when: ["onPlay", "onSummon"],
        scope: ["power", "all-powers"]
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
        targetScope: ["hero", "hero-and-creatures"]
      }
    },
    {
      id: "arcane-amplification", family: "combat",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-critical-life"]
      },
      configSchema: { mode: ["multiplier", "flat"] }
    },
    {
      id: "combat-fury", family: "combat",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-critical-life"]
      },
      configSchema: { mode: ["multiplier"] }
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
      configSchema: {}
    },
    {
      id: "absorption", family: "combat",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-critical-life"]
      },
      configSchema: { sourceTarget: ["creature", "any"] }
    },
    {
      id: "destruction", family: "control",
      modifierFamilies: ["selector", "activation"],
      modifierOptions: {
        selector: ["selector-highest-life", "selector-highest-attack"],
        activation: ["activation-power-threshold", "activation-power-comparison"]
      },
      configSchema: { when: ["onPlay", "onSummon"], target: ["enemy-creature"] }
    },
    {
      id: "annihilation", family: "control",
      modifierFamilies: ["constraint", "activation"],
      modifierOptions: {
        constraint: ["constraint-friendly-fire"],
        activation: ["activation-power-threshold", "activation-power-comparison"]
      },
      configSchema: { when: ["onPlay", "onSummon"], scope: ["enemy-field", "all-field"] }
    },
    {
      id: "rebirth", family: "control",
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
      configSchema: { when: ["onPlay"], destination: ["own-hero"] }
    }
  ];

  SIGIL_DEFINITIONS.forEach(definition => {
    sigils.register({
      ...definition,
      status: "active"
    });
  });

  [
    { id: "chain", family: "future", modifierFamilies: [], modifierOptions: {}, configSchema: {}, status: "reserved" },
    { id: "echo", family: "future", modifierFamilies: [], modifierOptions: {}, configSchema: {}, status: "reserved" }
  ].forEach(definition => sigils.register(definition));

  [
    { id: "scale-power-half", family: "scaling", status: "active" },
    { id: "scale-power", family: "scaling", status: "active" },
    { id: "scale-power-double", family: "scaling", status: "active" },
    { id: "scale-target-attack", family: "scaling", status: "active" },
    { id: "scale-full-health", family: "scaling", status: "active" },
    { id: "scale-creature-count", family: "scaling", status: "active" },
    { id: "scale-damage-dealt", family: "scaling", status: "active" },

    { id: "activation-power-threshold", family: "activation", status: "active" },
    { id: "activation-power-comparison", family: "activation", status: "active" },
    { id: "activation-critical-life", family: "activation", status: "provisional" },
    { id: "activation-on-any-death", family: "activation", status: "active" },

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
