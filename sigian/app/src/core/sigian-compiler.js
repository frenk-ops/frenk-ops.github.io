(function (A) {
  "use strict";

  function modifierByFamily(recipeSigil, family) {
    return (recipeSigil.modifiers || []).find(modifier => A.getSigianAdvancedModifier?.(modifier.id)?.family === family) || null;
  }

  function technicalModifier(id, kind, params) {
    return A.createModifier({ id, kind, params });
  }

  function targetModifier(slotId, side, kind, params = {}) {
    return technicalModifier(
      `${slotId}:target`,
      A.SIGIAN_MODIFIER_KINDS.TARGET,
      { side, kind, ...params }
    );
  }

  function conditionModifier(slotId, params) {
    return technicalModifier(`${slotId}:condition`, A.SIGIAN_MODIFIER_KINDS.CONDITION, params);
  }

  function baseGradeValue(recipe, recipeSigil, definition, context) {
    if (typeof context.resolveGradeValue !== "function") {
      throw new Error(`FormulaRecipe ${recipe.id}, Sigillo ${recipeSigil.sigilId}: manca resolveGradeValue; i valori dei Grade non sono ancora calibrati globalmente.`);
    }
    const value = Number(context.resolveGradeValue({ recipe, sigil: recipeSigil, definition }));
    if (!Number.isFinite(value)) {
      throw new Error(`FormulaRecipe ${recipe.id}, Sigillo ${recipeSigil.sigilId}: valore Grade non valido.`);
    }
    return Math.trunc(value);
  }

  function scaleModifier(recipe, recipeSigil, definition, context) {
    const base = baseGradeValue(recipe, recipeSigil, definition, context);
    const scaling = modifierByFamily(recipeSigil, "scaling");
    if (!scaling) {
      return technicalModifier(
        `${recipeSigil.slotId}:scale`,
        A.SIGIAN_MODIFIER_KINDS.SCALE,
        { mode: A.SIGIAN_SCALE_MODES.CONSTANT, value: base }
      );
    }

    const params = scaling.params || {};
    const school = String(params.school || recipe.school);
    if (scaling.id === "scale-power-half") {
      return technicalModifier(
        `${recipeSigil.slotId}:scale`,
        A.SIGIAN_MODIFIER_KINDS.SCALE,
        {
          mode: A.SIGIAN_SCALE_MODES.SOURCE_POWER,
          school,
          numerator: 1,
          denominator: 2,
          offset: base,
          round: "floor",
          ...(params.min == null ? {} : { min: Number(params.min) })
        }
      );
    }
    if (scaling.id === "scale-power") {
      return technicalModifier(
        `${recipeSigil.slotId}:scale`,
        A.SIGIAN_MODIFIER_KINDS.SCALE,
        {
          mode: A.SIGIAN_SCALE_MODES.SOURCE_POWER,
          school,
          numerator: 1,
          denominator: 1,
          offset: base,
          round: "floor",
          ...(params.min == null ? {} : { min: Number(params.min) })
        }
      );
    }
    throw new Error(`FormulaRecipe ${recipe.id}: scaling non compilabile ${scaling.id}.`);
  }

  function conditionFromRecipe(recipe, recipeSigil) {
    const condition = modifierByFamily(recipeSigil, "condition");
    if (!condition) return null;
    const params = condition.params || {};

    if (condition.id === "condition-power-threshold") {
      const side = params.side === "enemy" ? A.SIGIAN_TARGET_SIDES.ENEMY : A.SIGIAN_TARGET_SIDES.SELF;
      return conditionModifier(recipeSigil.slotId, {
        left: {
          side,
          kind: A.SIGIAN_TARGET_KINDS.POWER,
          school: String(params.school || recipe.school)
        },
        op: String(params.op || "gte"),
        right: { value: Number(params.value || 0) }
      });
    }

    if (condition.id === "condition-power-comparison") {
      return conditionModifier(recipeSigil.slotId, {
        left: {
          side: params.leftSide === "enemy" ? A.SIGIAN_TARGET_SIDES.ENEMY : A.SIGIAN_TARGET_SIDES.SELF,
          kind: A.SIGIAN_TARGET_KINDS.POWER,
          school: String(params.leftSchool || recipe.school)
        },
        op: String(params.op || "lt"),
        right: {
          side: params.rightSide === "self" ? A.SIGIAN_TARGET_SIDES.SELF : A.SIGIAN_TARGET_SIDES.ENEMY,
          kind: A.SIGIAN_TARGET_KINDS.POWER,
          school: String(params.rightSchool || recipe.school)
        }
      });
    }

    throw new Error(`FormulaRecipe ${recipe.id}: condizione non compilabile ${condition.id}.`);
  }

  function technicalSigil(recipeSigil, suffix, trigger, effect, modifiers, kind) {
    return A.createSigil({
      id: `${recipeSigil.slotId}:${suffix}`,
      kind: kind || A.SIGIAN_SIGIL_KINDS.EFFECT,
      trigger,
      effect,
      modifiers: modifiers.filter(Boolean)
    });
  }

  A.registerSigianSigilCompiler("damage", function compileDamage({ recipe, sigil, definition, context }) {
    const trigger = String(sigil.config.when || "onPlay");
    const scale = scaleModifier(recipe, sigil, definition, context);
    const condition = conditionFromRecipe(recipe, sigil);
    const target = String(sigil.config.target || "enemy-hero");
    let targetMod;
    if (target === "enemy-hero") {
      targetMod = targetModifier(sigil.slotId, A.SIGIAN_TARGET_SIDES.ENEMY, A.SIGIAN_TARGET_KINDS.HERO);
    } else if (target === "enemy-creature") {
      const selector = String(sigil.config.selector || "strongest-health");
      targetMod = targetModifier(sigil.slotId, A.SIGIAN_TARGET_SIDES.ENEMY, A.SIGIAN_TARGET_KINDS.CREATURE, { selector });
    } else {
      throw new Error(`FormulaRecipe ${recipe.id}: target Danno non compilabile ${target}.`);
    }
    return [technicalSigil(sigil, "damage", trigger, A.SIGIAN_EFFECTS.DAMAGE, [targetMod, scale, condition])];
  });

  A.registerSigianSigilCompiler("wave", function compileWave({ recipe, sigil, definition, context }) {
    const trigger = String(sigil.config.when || "onPlay");
    const scope = String(sigil.config.scope || "field");
    const scale = scaleModifier(recipe, sigil, definition, context);
    const friendly = modifierByFamily(sigil, "constraint");
    const friendlyParams = friendly?.id === "constraint-friendly-fire" ? (friendly.params || {}) : null;
    const output = [];

    output.push(technicalSigil(sigil, "enemy-creatures", trigger, A.SIGIAN_EFFECTS.DAMAGE, [
      targetModifier(sigil.slotId, A.SIGIAN_TARGET_SIDES.ENEMY, A.SIGIAN_TARGET_KINDS.CREATURES),
      scale
    ]));

    if (scope === "front") {
      output.push(technicalSigil(sigil, "enemy-hero", trigger, A.SIGIAN_EFFECTS.DAMAGE, [
        targetModifier(sigil.slotId, A.SIGIAN_TARGET_SIDES.ENEMY, A.SIGIAN_TARGET_KINDS.HERO),
        scale
      ]));
    } else if (scope !== "field") {
      throw new Error(`FormulaRecipe ${recipe.id}: portata Onda non compilabile ${scope}.`);
    }

    if (friendlyParams) {
      let condition = null;
      if (friendlyParams.condition) {
        condition = conditionModifier(`${sigil.slotId}:friendly`, friendlyParams.condition);
      }
      output.push(technicalSigil(sigil, "friendly-creatures", trigger, A.SIGIAN_EFFECTS.DAMAGE, [
        targetModifier(`${sigil.slotId}:friendly`, A.SIGIAN_TARGET_SIDES.SELF, A.SIGIAN_TARGET_KINDS.CREATURES),
        scale,
        condition
      ]));
    }
    return output;
  });

  A.registerSigianSigilCompiler("backlash", function compileBacklash({ recipe, sigil, definition, context }) {
    const trigger = String(sigil.config.when || "onSummon");
    const scale = scaleModifier(recipe, sigil, definition, context);
    const condition = conditionFromRecipe(recipe, sigil);
    return [technicalSigil(sigil, "backlash", trigger, A.SIGIAN_EFFECTS.DAMAGE, [
      targetModifier(sigil.slotId, A.SIGIAN_TARGET_SIDES.SELF, A.SIGIAN_TARGET_KINDS.HERO),
      scale,
      condition
    ])];
  });

  A.compileFormulaRecipe = function compileFormulaRecipe(input, options = {}) {
    const validation = A.validateFormulaRecipe(input, options.validation || {});
    if (!validation.valid) {
      throw new Error(`FormulaRecipe non valida: ${validation.errors.join("; ")}`);
    }
    const recipe = validation.recipe;
    const technicalSigils = [];
    recipe.sigils.forEach(recipeSigil => {
      const definition = A.getCanonicalSigil(recipeSigil.sigilId);
      const compiler = A.getSigianSigilCompiler(recipeSigil.sigilId);
      if (!compiler) {
        throw new Error(`FormulaRecipe ${recipe.id}: nessun compiler registrato per il Sigillo ${recipeSigil.sigilId}.`);
      }
      const compiled = compiler({
        recipe,
        sigil: recipeSigil,
        definition,
        context: options
      });
      if (!Array.isArray(compiled) || compiled.length === 0) {
        throw new Error(`FormulaRecipe ${recipe.id}: il compiler ${recipeSigil.sigilId} non ha prodotto effetti tecnici.`);
      }
      technicalSigils.push(...compiled);
    });

    const level = Math.max(0, Math.trunc(Number(options.level ?? 0)));
    return A.createFormula({
      id: recipe.id,
      school: recipe.school,
      type: recipe.type,
      stats: {
        cost: level,
        attack: recipe.type === "creature" ? recipe.stats.attack : 0,
        health: recipe.type === "creature" ? recipe.stats.health : 0
      },
      presentation: recipe.presentation,
      sigils: technicalSigils,
      source: {
        mode: A.SIGIAN_MIGRATION_MODES.NATIVE,
        set: options.set || "custom",
        cardId: recipe.id
      },
      legacySnapshot: options.legacySnapshot || null
    });
  };
})(window.Arcane = window.Arcane || {});
