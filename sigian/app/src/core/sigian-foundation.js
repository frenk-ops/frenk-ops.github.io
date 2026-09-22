(function (A) {
  "use strict";

  const SCHEMA_VERSION = 1;
  const MIGRATION_MODES = Object.freeze({
    LEGACY_DELEGATED: "legacy-delegated",
    NATIVE: "native"
  });
  const SIGIL_KINDS = Object.freeze({
    LEGACY_EFFECT: "legacy-effect",
    EFFECT: "effect",
    PASSIVE: "passive"
  });
  const EFFECTS = Object.freeze({
    DAMAGE: "damage",
    HEAL: "heal",
    POWER: "power",
    SUMMON: "summon",
    PASSIVE: "passive"
  });
  const MODIFIER_KINDS = Object.freeze({
    LEGACY_CARD_REFERENCE: "legacy-card-reference",
    TARGET: "target",
    SCALE: "scale",
    CONDITION: "condition"
  });
  const TARGET_SIDES = Object.freeze({
    SELF: "self",
    ENEMY: "enemy"
  });
  const TARGET_KINDS = Object.freeze({
    HERO: "hero",
    CREATURES: "creatures",
    POWER: "power"
  });
  const SCALE_MODES = Object.freeze({
    CONSTANT: "constant"
  });

  function clone(value) {
    return typeof A.deepClone === "function"
      ? A.deepClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? clone(value) : {};
  }

  function assertId(value, label) {
    const id = String(value || "").trim();
    if (!id) throw new Error(`${label} richiede un id.`);
    return id;
  }

  A.SIGIAN_FORMULA_SCHEMA_VERSION = SCHEMA_VERSION;
  A.SIGIAN_MIGRATION_MODES = MIGRATION_MODES;
  A.SIGIAN_SIGIL_KINDS = SIGIL_KINDS;
  A.SIGIAN_EFFECTS = EFFECTS;
  A.SIGIAN_MODIFIER_KINDS = MODIFIER_KINDS;
  A.SIGIAN_TARGET_SIDES = TARGET_SIDES;
  A.SIGIAN_TARGET_KINDS = TARGET_KINDS;
  A.SIGIAN_SCALE_MODES = SCALE_MODES;

  A.createModifier = function createModifier(options) {
    const source = options || {};
    return {
      id: assertId(source.id, "Modifier"),
      kind: String(source.kind || MODIFIER_KINDS.CONDITION),
      params: asRecord(source.params)
    };
  };

  A.createSigil = function createSigil(options) {
    const source = options || {};
    return {
      id: assertId(source.id, "Sigillo"),
      kind: String(source.kind || SIGIL_KINDS.EFFECT),
      trigger: String(source.trigger || "onPlay"),
      effect: String(source.effect || "none"),
      modifiers: (source.modifiers || []).map(A.createModifier)
    };
  };

  A.createFormula = function createFormula(options) {
    const source = options || {};
    const stats = source.stats || {};
    return {
      schemaVersion: SCHEMA_VERSION,
      id: assertId(source.id, "Formula"),
      school: String(source.school || "fire"),
      type: String(source.type || "creature"),
      stats: {
        cost: Math.max(0, Number(stats.cost || 0)),
        attack: Math.max(0, Number(stats.attack || 0)),
        health: Math.max(0, Number(stats.health || 0))
      },
      presentation: {
        name: String(source.presentation?.name || source.id || ""),
        text: String(source.presentation?.text || ""),
        keyword: String(source.presentation?.keyword || ""),
        art: String(source.presentation?.art || ""),
        imageKey: source.presentation?.imageKey == null ? null : String(source.presentation.imageKey)
      },
      sigils: (source.sigils || []).map(A.createSigil),
      source: {
        mode: String(source.source?.mode || MIGRATION_MODES.NATIVE),
        set: source.source?.set == null ? null : String(source.source.set),
        cardId: source.source?.cardId == null ? null : String(source.source.cardId)
      },
      legacySnapshot: source.legacySnapshot ? clone(source.legacySnapshot) : null
    };
  };

  A.formulaFromLegacyCard = function formulaFromLegacyCard(rawCard) {
    if (!rawCard) throw new Error("Impossibile creare una Formula da una carta vuota.");
    const card = typeof A.normalizeCard === "function" ? A.normalizeCard(rawCard) : clone(rawCard);
    const cardId = assertId(card.id, "Carta legacy");

    return A.createFormula({
      id: cardId,
      school: card.school,
      type: card.type,
      stats: {
        cost: card.cost,
        attack: card.attack,
        health: card.health
      },
      presentation: {
        name: card.name,
        text: card.text,
        keyword: card.keyword,
        art: card.art,
        imageKey: card.imageKey
      },
      sigils: [
        {
          id: `${cardId}:legacy-effect`,
          kind: SIGIL_KINDS.LEGACY_EFFECT,
          trigger: "legacy-dispatch",
          effect: "delegate-current-card-behavior",
          modifiers: [
            {
              id: `${cardId}:legacy-source`,
              kind: MODIFIER_KINDS.LEGACY_CARD_REFERENCE,
              params: { cardId }
            }
          ]
        }
      ],
      source: {
        mode: MIGRATION_MODES.LEGACY_DELEGATED,
        set: card.set || null,
        cardId
      },
      legacySnapshot: card
    });
  };

  A.materializeLegacyCardFromFormula = function materializeLegacyCardFromFormula(formula) {
    if (!formula?.legacySnapshot) {
      throw new Error(`La Formula ${formula?.id || "senza-id"} non contiene uno snapshot legacy.`);
    }
    return clone(formula.legacySnapshot);
  };

  A.buildFormulaCatalog = function buildFormulaCatalog(cards) {
    const formulas = (cards || []).map(A.formulaFromLegacyCard);
    const byId = {};
    formulas.forEach(formula => {
      if (byId[formula.id]) throw new Error(`Formula duplicata: ${formula.id}`);
      byId[formula.id] = formula;
    });
    return { schemaVersion: SCHEMA_VERSION, formulas, byId };
  };

  A.validateFormula = function validateFormula(formula) {
    const errors = [];
    if (!formula || typeof formula !== "object") return { valid: false, errors: ["Formula assente."] };
    if (formula.schemaVersion !== SCHEMA_VERSION) errors.push("Versione schema Formula non valida.");
    if (!formula.id) errors.push("Formula senza id.");
    if (!formula.school) errors.push(`Formula ${formula.id || "?"} senza scuola.`);
    if (!["creature", "spell"].includes(formula.type)) errors.push(`Formula ${formula.id || "?"} con tipo non valido.`);
    if (!Array.isArray(formula.sigils)) errors.push(`Formula ${formula.id || "?"} senza lista Sigilli.`);
    else {
      formula.sigils.forEach((sigil, index) => {
        if (!sigil?.id) errors.push(`Sigillo ${index} senza id.`);
        if (!Array.isArray(sigil?.modifiers)) errors.push(`Sigillo ${sigil?.id || index} senza lista Modifier.`);
        if (sigil?.kind === SIGIL_KINDS.EFFECT && !Object.values(EFFECTS).includes(sigil.effect)) {
          errors.push(`Sigillo ${sigil.id || index} con effetto non riconosciuto: ${sigil.effect}.`);
        }
      });
    }
    return { valid: errors.length === 0, errors };
  };
})(window.Arcane = window.Arcane || {});
