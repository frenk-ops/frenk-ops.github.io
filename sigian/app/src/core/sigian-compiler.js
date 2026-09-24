(function (A) {
  "use strict";

  function modifierByFamily(recipeSigil, family) {
    return (recipeSigil.modifiers || []).find(modifier => A.getSigianAdvancedModifier?.(modifier.id)?.family === family) || null;
  }

  function compatibilityFor(context, recipeSigil) {
    return context?.compatibilityBySlot?.[recipeSigil.slotId] || {};
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

  function scaleTechnicalModifier(slotId, params) {
    return technicalModifier(`${slotId}:scale`, A.SIGIAN_MODIFIER_KINDS.SCALE, params);
  }

  function conditionModifier(slotId, params) {
    return technicalModifier(`${slotId}:condition`, A.SIGIAN_MODIFIER_KINDS.CONDITION, params);
  }

  function configModifier(slotId, params) {
    return technicalModifier(`${slotId}:config`, A.SIGIAN_MODIFIER_KINDS.CONFIG, params);
  }

  function baseGradeValue(recipe, recipeSigil, definition, context) {
    if (recipeSigil.intensity != null && Number.isFinite(Number(recipeSigil.intensity))) {
      return Math.trunc(Number(recipeSigil.intensity));
    }
    if (typeof context.resolveGradeValue !== "function") {
      throw new Error(`FormulaRecipe ${recipe.id}, Sigillo ${recipeSigil.sigilId}: manca intensity/resolveGradeValue.`);
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
      return scaleTechnicalModifier(recipeSigil.slotId, {
        mode: A.SIGIAN_SCALE_MODES.CONSTANT,
        value: base
      });
    }

    const params = scaling.params || {};
    const school = String(params.school || recipe.school);
    if (scaling.id === "scale-power-half") {
      return scaleTechnicalModifier(recipeSigil.slotId, {
        mode: A.SIGIAN_SCALE_MODES.SOURCE_POWER,
        school,
        numerator: 1,
        denominator: 2,
        offset: base,
        round: "floor",
        ...(params.min == null ? {} : { min: Number(params.min) })
      });
    }
    if (scaling.id === "scale-power") {
      return scaleTechnicalModifier(recipeSigil.slotId, {
        mode: A.SIGIAN_SCALE_MODES.SOURCE_POWER,
        school,
        numerator: 1,
        denominator: 1,
        offset: base,
        round: "floor",
        ...(params.min == null ? {} : { min: Number(params.min) })
      });
    }
    if (scaling.id === "scale-power-double") {
      return scaleTechnicalModifier(recipeSigil.slotId, {
        mode: A.SIGIAN_SCALE_MODES.SOURCE_POWER,
        school,
        numerator: 2,
        denominator: 1,
        offset: base,
        round: "floor",
        ...(params.min == null ? {} : { min: Number(params.min) })
      });
    }
    if (scaling.id === "scale-target-attack") {
      return scaleTechnicalModifier(recipeSigil.slotId, {
        mode: A.SIGIAN_SCALE_MODES.TARGET_ATTACK
      });
    }
    if (scaling.id === "scale-full-health") {
      return scaleTechnicalModifier(recipeSigil.slotId, {
        mode: A.SIGIAN_SCALE_MODES.FULL_HEALTH
      });
    }
    if (scaling.id === "scale-creature-count") {
      return scaleTechnicalModifier(recipeSigil.slotId, {
        mode: A.SIGIAN_SCALE_MODES.CREATURE_COUNT,
        sides: [A.SIGIAN_TARGET_SIDES.BOTH],
        multiplier: base
      });
    }
    if (scaling.id === "scale-damage-dealt") {
      return scaleTechnicalModifier(recipeSigil.slotId, {
        mode: A.SIGIAN_SCALE_MODES.DAMAGE_DEALT,
        numerator: Number(params.numerator ?? 1),
        denominator: Number(params.denominator ?? 1)
      });
    }
    throw new Error(`FormulaRecipe ${recipe.id}: scaling non compilabile ${scaling.id}.`);
  }

  function runtimeTrigger(recipe, trigger) {
    const canonical = String(trigger || "");
    if (canonical !== "onDeploy") return canonical;
    return recipe.type === "spell" ? "onPlay" : "onSummon";
  }

  function activationPlan(recipe, recipeSigil, baseTrigger) {
    const activation = modifierByFamily(recipeSigil, "activation");
    const resolvedTrigger = runtimeTrigger(recipe, baseTrigger);
    if (!activation) return { trigger: resolvedTrigger, condition: null, activation: null };

    const params = activation.params || {};
    if (activation.id === "activation-on-any-death") {
      return { trigger: "onAnyDeath", condition: null, activation };
    }

    if (activation.id === "activation-power-threshold") {
      const side = params.side === "enemy" ? A.SIGIAN_TARGET_SIDES.ENEMY : A.SIGIAN_TARGET_SIDES.SELF;
      return {
        trigger: resolvedTrigger,
        condition: conditionModifier(recipeSigil.slotId, {
          left: {
            side,
            kind: A.SIGIAN_TARGET_KINDS.POWER,
            school: String(params.school || recipe.school)
          },
          op: String(params.op || "gte"),
          right: { value: Number(params.value || 0) }
        }),
        activation
      };
    }

    if (activation.id === "activation-power-comparison") {
      return {
        trigger: resolvedTrigger,
        condition: conditionModifier(recipeSigil.slotId, {
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
        }),
        activation
      };
    }

    throw new Error(`FormulaRecipe ${recipe.id}: Attivazione non compilabile ${activation.id}.`);
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

  function powerTarget(slotId, side, scope, school) {
    return scope === "all-powers"
      ? targetModifier(slotId, side, A.SIGIAN_TARGET_KINDS.POWERS)
      : targetModifier(slotId, side, A.SIGIAN_TARGET_KINDS.POWER, { school });
  }

  function signedConstantScale(slotId, amount) {
    return scaleTechnicalModifier(slotId, {
      mode: A.SIGIAN_SCALE_MODES.CONSTANT,
      value: Math.trunc(Number(amount || 0))
    });
  }

  A.registerSigianSigilCompiler("damage", function compileDamage({ recipe, sigil, definition, context }) {
    const activation = activationPlan(recipe, sigil, sigil.config.when || "onPlay");
    const scale = scaleModifier(recipe, sigil, definition, context);
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
    return [technicalSigil(sigil, "damage", activation.trigger, A.SIGIAN_EFFECTS.DAMAGE, [
      targetMod,
      scale,
      activation.condition
    ])];
  });

  A.registerSigianSigilCompiler("wave", function compileWave({ recipe, sigil, definition, context }) {
    const trigger = runtimeTrigger(recipe, sigil.config.when || "onDeploy");
    const scope = String(sigil.config.scope || "field");
    const scale = scaleModifier(recipe, sigil, definition, context);
    const friendly = modifierByFamily(sigil, "constraint");
    const output = [];

    // Preserve the historical resolution order for global waves:
    // allied creatures -> enemy creatures -> enemy mage.
    // Death cleanup still occurs after the whole Formula trigger, but event order is
    // observable by replay/multiplayer and therefore part of the compatibility contract.
    if (friendly) {
      let condition = null;
      if (friendly.id === "constraint-friendly-fire-power-threshold") {
        const params = friendly.params || {};
        condition = conditionModifier(`${sigil.slotId}:friendly`, {
          left: {
            side: A.SIGIAN_TARGET_SIDES.SELF,
            kind: A.SIGIAN_TARGET_KINDS.POWER,
            school: String(params.school || recipe.school)
          },
          op: String(params.op || "lt"),
          right: { value: Number(params.value || 0) }
        });
      } else if (friendly.id !== "constraint-friendly-fire") {
        throw new Error(`FormulaRecipe ${recipe.id}: Constraint Onda non compilabile ${friendly.id}.`);
      }
      output.push(technicalSigil(sigil, "friendly-creatures", trigger, A.SIGIAN_EFFECTS.DAMAGE, [
        targetModifier(`${sigil.slotId}:friendly`, A.SIGIAN_TARGET_SIDES.SELF, A.SIGIAN_TARGET_KINDS.CREATURES),
        scale,
        condition
      ]));
    }

    output.push(technicalSigil(sigil, "enemy-creatures", trigger, A.SIGIAN_EFFECTS.DAMAGE, [
      targetModifier(sigil.slotId, A.SIGIAN_TARGET_SIDES.ENEMY, A.SIGIAN_TARGET_KINDS.CREATURES),
      scale
    ]));

    if (scope === "front") {
      output.push(technicalSigil(sigil, "enemy-hero", trigger, A.SIGIAN_EFFECTS.DAMAGE, [
        targetModifier(`${sigil.slotId}:hero`, A.SIGIAN_TARGET_SIDES.ENEMY, A.SIGIAN_TARGET_KINDS.HERO),
        scale
      ]));
    } else if (scope !== "field") {
      throw new Error(`FormulaRecipe ${recipe.id}: portata Onda non compilabile ${scope}.`);
    }

    return output;
  });

  A.registerSigianSigilCompiler("backlash", function compileBacklash({ recipe, sigil, definition, context }) {
    const activation = activationPlan(recipe, sigil, sigil.config.when || "onSummon");
    const scale = scaleModifier(recipe, sigil, definition, context);
    return [technicalSigil(sigil, "backlash", activation.trigger, A.SIGIAN_EFFECTS.DAMAGE, [
      targetModifier(sigil.slotId, A.SIGIAN_TARGET_SIDES.SELF, A.SIGIAN_TARGET_KINDS.HERO),
      scale,
      activation.condition
    ])];
  });

  A.registerSigianSigilCompiler("retaliation", function compileRetaliation({ recipe, sigil, definition, context }) {
    const reaction = String(sigil.config.reaction || "damaged");
    if (reaction !== "damaged") {
      throw new Error(`FormulaRecipe ${recipe.id}: Ritorsione supporta per ora solo la reazione damaged.`);
    }
    const activation = activationPlan(recipe, sigil, "onDamaged");
    const scale = scaleModifier(recipe, sigil, definition, context);
    return [technicalSigil(sigil, "retaliation", "onDamaged", A.SIGIAN_EFFECTS.DAMAGE, [
      targetModifier(sigil.slotId, A.SIGIAN_TARGET_SIDES.ENEMY, A.SIGIAN_TARGET_KINDS.EVENT_SOURCE),
      scale,
      activation.condition,
      configModifier(sigil.slotId, { suppressRetaliation: true })
    ])];
  });

  A.registerSigianSigilCompiler("heal", function compileHeal({ recipe, sigil, definition, context }) {
    const activation = activationPlan(recipe, sigil, sigil.config.when || "onPlay");
    const target = String(sigil.config.target || "self-hero");
    if (target !== "self-hero") {
      throw new Error(`FormulaRecipe ${recipe.id}: il target Cura ${target} richiede ancora il targeting interattivo della Forgia.`);
    }
    const scale = scaleModifier(recipe, sigil, definition, context);
    const compat = compatibilityFor(context, sigil);
    const config = activation.activation?.id === "activation-on-any-death"
      ? configModifier(sigil.slotId, { reason: compat.reason || recipe.id })
      : null;
    return [technicalSigil(sigil, "heal", activation.trigger, A.SIGIAN_EFFECTS.HEAL, [
      targetModifier(sigil.slotId, A.SIGIAN_TARGET_SIDES.SELF, A.SIGIAN_TARGET_KINDS.HERO),
      scale,
      activation.condition,
      config
    ])];
  });

  A.registerSigianSigilCompiler("restoration", function compileRestoration({ recipe, sigil, definition, context }) {
    const activation = activationPlan(recipe, sigil, sigil.config.when || "onPlay");
    const scope = String(sigil.config.scope || "field");
    const scale = scaleModifier(recipe, sigil, definition, context);
    if (scope === "front" && scale.params?.mode === A.SIGIAN_SCALE_MODES.FULL_HEALTH) {
      throw new Error(`FormulaRecipe ${recipe.id}: Restaurazione full-health sul Fronte richiede una regola di Vita massima dell'Incantatore non ancora definita.`);
    }

    const output = [];
    // Historical Front restoration resolves the mage first, then allied creatures.
    // Keep that observable order for event/replay equivalence.
    if (scope === "front") {
      output.push(technicalSigil(sigil, "own-hero", activation.trigger, A.SIGIAN_EFFECTS.HEAL, [
        targetModifier(`${sigil.slotId}:hero`, A.SIGIAN_TARGET_SIDES.SELF, A.SIGIAN_TARGET_KINDS.HERO),
        scale,
        activation.condition
      ]));
    } else if (scope !== "field") {
      throw new Error(`FormulaRecipe ${recipe.id}: portata Restaurazione non compilabile ${scope}.`);
    }

    output.push(technicalSigil(sigil, "allied-creatures", activation.trigger, A.SIGIAN_EFFECTS.HEAL, [
      targetModifier(sigil.slotId, A.SIGIAN_TARGET_SIDES.SELF, A.SIGIAN_TARGET_KINDS.CREATURES),
      scale,
      activation.condition
    ]));

    return output;
  });

  A.registerSigianSigilCompiler("regeneration", function compileRegeneration({ recipe, sigil, definition, context }) {
    const activation = activationPlan(recipe, sigil, sigil.config.when || "onBeforeAttack");
    return [technicalSigil(sigil, "regeneration", activation.trigger, A.SIGIAN_EFFECTS.HEAL, [
      targetModifier(sigil.slotId, A.SIGIAN_TARGET_SIDES.SELF, A.SIGIAN_TARGET_KINDS.SOURCE),
      scaleModifier(recipe, sigil, definition, context),
      activation.condition
    ])];
  });

  A.registerSigianSigilCompiler("infusion", function compileInfusion({ recipe, sigil, definition, context }) {
    const activation = activationPlan(recipe, sigil, sigil.config.when || "onDeploy");
    const amount = baseGradeValue(recipe, sigil, definition, context);
    const config = activation.activation?.id === "activation-on-any-death"
      ? configModifier(sigil.slotId, { eventType: "astralDeathKeeper" })
      : null;
    const schools = sigil.config.schools === "all"
      ? "all"
      : [...new Set((Array.isArray(sigil.config.schools) ? sigil.config.schools : [recipe.school]).map(String))];

    if (schools === "all") {
      return [technicalSigil(sigil, "infusion-all", activation.trigger, A.SIGIAN_EFFECTS.POWER_ALL, [
        targetModifier(sigil.slotId, A.SIGIAN_TARGET_SIDES.SELF, A.SIGIAN_TARGET_KINDS.POWERS),
        signedConstantScale(sigil.slotId, amount),
        activation.condition,
        config
      ])];
    }

    return schools.map((school, index) => technicalSigil(
      sigil,
      `infusion-${school}-${index + 1}`,
      activation.trigger,
      A.SIGIAN_EFFECTS.POWER,
      [
        targetModifier(`${sigil.slotId}:${school}`, A.SIGIAN_TARGET_SIDES.SELF, A.SIGIAN_TARGET_KINDS.POWER, { school }),
        signedConstantScale(`${sigil.slotId}:${school}`, amount),
        activation.condition,
        config
      ]
    ));
  });

  A.registerSigianSigilCompiler("subtraction", function compileSubtraction({ recipe, sigil, definition, context }) {
    const activation = activationPlan(recipe, sigil, sigil.config.when || "onPlay");
    const scope = String(sigil.config.scope || "power");
    const school = String(sigil.config.school || recipe.school);
    const amount = Math.abs(baseGradeValue(recipe, sigil, definition, context));
    return [technicalSigil(
      sigil,
      "subtraction",
      activation.trigger,
      scope === "all-powers" ? A.SIGIAN_EFFECTS.POWER_ALL : A.SIGIAN_EFFECTS.POWER,
      [
        powerTarget(sigil.slotId, A.SIGIAN_TARGET_SIDES.ENEMY, scope, school),
        signedConstantScale(sigil.slotId, -amount),
        activation.condition
      ]
    )];
  });

  A.registerSigianSigilCompiler("channeling", function compileChanneling({ recipe, sigil, definition, context }) {
    const activation = activationPlan(recipe, sigil, sigil.config.when || "whileAlive");
    const scope = String(sigil.config.scope || "power");
    const school = String(sigil.config.school || recipe.school);
    const amount = Math.abs(baseGradeValue(recipe, sigil, definition, context));
    return [technicalSigil(sigil, "channeling", activation.trigger, A.SIGIAN_EFFECTS.POWER_GROWTH, [
      powerTarget(sigil.slotId, A.SIGIAN_TARGET_SIDES.SELF, scope, school),
      signedConstantScale(sigil.slotId, amount),
      activation.condition
    ])];
  });

  A.registerSigianSigilCompiler("erosion", function compileErosion({ recipe, sigil, definition, context }) {
    const activation = activationPlan(recipe, sigil, sigil.config.when || "whileAlive");
    const scope = String(sigil.config.scope || "power");
    const school = String(sigil.config.school || recipe.school);
    const side = sigil.config.side === "enemy" ? A.SIGIAN_TARGET_SIDES.ENEMY : A.SIGIAN_TARGET_SIDES.SELF;
    const amount = Math.abs(baseGradeValue(recipe, sigil, definition, context));
    return [technicalSigil(sigil, "erosion", activation.trigger, A.SIGIAN_EFFECTS.POWER_GROWTH, [
      powerTarget(sigil.slotId, side, scope, school),
      signedConstantScale(sigil.slotId, -amount),
      activation.condition
    ])];
  });

  A.registerSigianSigilCompiler("tribute", function compileTribute({ recipe, sigil, definition, context }) {
    const activation = activationPlan(recipe, sigil, sigil.config.when || "onSummon");
    const scope = String(sigil.config.scope || "all-powers");
    const school = String(sigil.config.school || recipe.school);
    const amount = Math.abs(baseGradeValue(recipe, sigil, definition, context));
    return [technicalSigil(
      sigil,
      "tribute",
      activation.trigger,
      scope === "all-powers" ? A.SIGIAN_EFFECTS.POWER_ALL : A.SIGIAN_EFFECTS.POWER,
      [
        powerTarget(sigil.slotId, A.SIGIAN_TARGET_SIDES.SELF, scope, school),
        signedConstantScale(sigil.slotId, -amount),
        activation.condition
      ]
    )];
  });

  A.registerSigianSigilCompiler("protection", function compileProtection({ recipe, sigil, definition, context }) {
    const activation = activationPlan(recipe, sigil, "passive");
    if (activation.condition) {
      throw new Error(`FormulaRecipe ${recipe.id}: Protezione condizionale dinamica richiede ancora il resolver passivo contestuale.`);
    }
    const mode = String(sigil.config.mode || "subtract");
    const targetScope = String(sigil.config.targetScope || "hero");
    const targetKinds = targetScope === "hero-and-creatures" ? ["hero", "creature"] : ["hero"];
    const cfg = {
      mode,
      targetKinds,
      stacking: String(sigil.config.stacking || (mode === "halve" ? "per-copy" : "presence"))
    };
    if (mode === "subtract") {
      cfg.value = Math.abs(baseGradeValue(recipe, sigil, definition, context));
      cfg.threshold = Number(sigil.config.threshold ?? 1);
    }
    return [technicalSigil(sigil, "protection", "passive", A.SIGIAN_EFFECTS.DAMAGE_REDUCTION, [
      configModifier(sigil.slotId, cfg)
    ], A.SIGIAN_SIGIL_KINDS.PASSIVE)];
  });

  A.registerSigianSigilCompiler("arcane-amplification", function compileArcaneAmplification({ recipe, sigil, definition, context }) {
    const activation = activationPlan(recipe, sigil, "passive");
    if (activation.condition) {
      throw new Error(`FormulaRecipe ${recipe.id}: Amplificazione Arcana condizionale dinamica richiede ancora il resolver passivo contestuale.`);
    }
    const mode = String(sigil.config.mode || "flat");
    if (mode === "flat") {
      return [technicalSigil(sigil, "arcane-amplification-flat", "passive", A.SIGIAN_EFFECTS.SPELL_DAMAGE_BONUS, [
        signedConstantScale(sigil.slotId, Math.abs(baseGradeValue(recipe, sigil, definition, context)))
      ], A.SIGIAN_SIGIL_KINDS.PASSIVE)];
    }
    if (mode === "multiplier") {
      return [technicalSigil(sigil, "arcane-amplification-multiplier", "passive", A.SIGIAN_EFFECTS.SPELL_DAMAGE_MULTIPLIER, [
        configModifier(sigil.slotId, {
          numerator: Number(sigil.config.numerator ?? 3),
          denominator: Number(sigil.config.denominator ?? 2),
          stacking: String(sigil.config.stacking || "per-copy")
        })
      ], A.SIGIAN_SIGIL_KINDS.PASSIVE)];
    }
    throw new Error(`FormulaRecipe ${recipe.id}: modalità Amplificazione Arcana non compilabile ${mode}.`);
  });

  A.registerSigianSigilCompiler("combat-fury", function compileCombatFury({ recipe, sigil, context }) {
    const activation = activationPlan(recipe, sigil, "passive");
    if (activation.condition) {
      throw new Error(`FormulaRecipe ${recipe.id}: Furia condizionale dinamica richiede ancora il resolver passivo contestuale.`);
    }
    const compat = compatibilityFor(context, sigil);
    return [technicalSigil(sigil, "combat-fury", "passive", A.SIGIAN_EFFECTS.ATTACK_MULTIPLIER, [
      configModifier(sigil.slotId, {
        numerator: Number(sigil.config.numerator ?? 3),
        denominator: Number(sigil.config.denominator ?? 2),
        stacking: String(sigil.config.stacking || "per-copy"),
        appliesTo: "allied-creatures",
        ...(Number.isFinite(Number(compat.sourceBaseAttack))
          ? { sourceBaseAttack: Number(compat.sourceBaseAttack) }
          : {})
      })
    ], A.SIGIAN_SIGIL_KINDS.PASSIVE)];
  });

  A.registerSigianSigilCompiler("total-assault", function compileTotalAssault({ sigil }) {
    return [technicalSigil(sigil, "total-assault", "passive", A.SIGIAN_EFFECTS.ATTACK_ALL, [], A.SIGIAN_SIGIL_KINDS.PASSIVE)];
  });

  A.registerSigianSigilCompiler("arcane-attack", function compileArcaneAttack({ recipe, sigil }) {
    const activation = activationPlan(recipe, sigil, "passive");
    if (activation.condition) {
      throw new Error(`FormulaRecipe ${recipe.id}: Attacco Arcano condizionale dinamico richiede ancora il resolver passivo contestuale.`);
    }
    return [technicalSigil(sigil, "arcane-attack", "passive", A.SIGIAN_EFFECTS.ATTACK_FROM_POWER, [
      configModifier(sigil.slotId, { school: String(sigil.config.school || recipe.school) })
    ], A.SIGIAN_SIGIL_KINDS.PASSIVE)];
  });

  A.registerSigianSigilCompiler("absorption", function compileAbsorption({ recipe, sigil }) {
    const activation = activationPlan(recipe, sigil, "passive");
    if (activation.condition) {
      throw new Error(`FormulaRecipe ${recipe.id}: Assorbimento condizionale dinamico richiede ancora il resolver passivo contestuale.`);
    }
    return [technicalSigil(sigil, "absorption", "passive", A.SIGIAN_EFFECTS.LIFESTEAL, [
      scaleTechnicalModifier(sigil.slotId, {
        mode: A.SIGIAN_SCALE_MODES.DAMAGE_DEALT,
        numerator: Number(sigil.config.numerator ?? 1),
        denominator: Number(sigil.config.denominator ?? 2)
      }),
      configModifier(sigil.slotId, {
        onlyTargetKind: sigil.config.sourceTarget === "any" ? null : "creature",
        healTarget: sigil.config.healTarget === "self-hero" ? "self-hero" : "source"
      })
    ], A.SIGIAN_SIGIL_KINDS.PASSIVE)];
  });

  A.registerSigianSigilCompiler("destruction", function compileDestruction({ recipe, sigil }) {
    const activation = activationPlan(recipe, sigil, sigil.config.when || "onPlay");
    const selectorModifier = modifierByFamily(sigil, "selector");
    const selector = selectorModifier?.id === "selector-highest-attack" ? "strongest-attack" : "strongest-health";
    return [technicalSigil(sigil, "destruction", activation.trigger, A.SIGIAN_EFFECTS.DESTROY, [
      targetModifier(sigil.slotId, A.SIGIAN_TARGET_SIDES.ENEMY, A.SIGIAN_TARGET_KINDS.CREATURE, { selector }),
      activation.condition
    ])];
  });

  A.registerSigianSigilCompiler("annihilation", function compileAnnihilation({ recipe, sigil }) {
    const activation = activationPlan(recipe, sigil, sigil.config.when || "onPlay");
    const friendly = modifierByFamily(sigil, "constraint");
    const scope = String(sigil.config.scope || "enemy-field");
    const side = (scope === "all-field" || friendly?.id === "constraint-friendly-fire")
      ? A.SIGIAN_TARGET_SIDES.BOTH
      : A.SIGIAN_TARGET_SIDES.ENEMY;
    return [technicalSigil(sigil, "annihilation", activation.trigger, A.SIGIAN_EFFECTS.DESTROY, [
      targetModifier(sigil.slotId, side, A.SIGIAN_TARGET_KINDS.CREATURES),
      activation.condition
    ])];
  });

  A.registerSigianSigilCompiler("rebirth", function compileRebirth({ recipe, sigil }) {
    const activation = activationPlan(recipe, sigil, sigil.config.when || "onSelfDeath");
    const maxRevives = Math.max(1, Math.trunc(Number(sigil.grade || 1)));
    return [technicalSigil(sigil, "rebirth", activation.trigger, A.SIGIAN_EFFECTS.RESURRECT, [
      targetModifier(sigil.slotId, A.SIGIAN_TARGET_SIDES.SELF, A.SIGIAN_TARGET_KINDS.SOURCE),
      scaleTechnicalModifier(sigil.slotId, { mode: A.SIGIAN_SCALE_MODES.FULL_HEALTH }),
      activation.condition,
      configModifier(sigil.slotId, { maxRevives })
    ])];
  });

  A.registerSigianSigilCompiler("eternal-rebirth", function compileEternalRebirth({ recipe, sigil }) {
    const activation = activationPlan(recipe, sigil, sigil.config.when || "onSelfDeath");
    if (!activation.condition) {
      throw new Error(`FormulaRecipe ${recipe.id}: Rinascita Eterna richiede una condizione di Attivazione.`);
    }
    return [technicalSigil(sigil, "eternal-rebirth", activation.trigger, A.SIGIAN_EFFECTS.RESURRECT, [
      targetModifier(sigil.slotId, A.SIGIAN_TARGET_SIDES.SELF, A.SIGIAN_TARGET_KINDS.SOURCE),
      scaleTechnicalModifier(sigil.slotId, { mode: A.SIGIAN_SCALE_MODES.FULL_HEALTH }),
      activation.condition,
      configModifier(sigil.slotId, { maxRevives:null, eternal:true })
    ])];
  });

  A.registerSigianSigilCompiler("domination", function compileDomination({ recipe, sigil, definition, context }) {
    const activation = activationPlan(recipe, sigil, sigil.config.when || "onPlay");
    const count = Math.max(1, Math.abs(baseGradeValue(recipe, sigil, definition, context)));
    return [technicalSigil(sigil, "domination", activation.trigger, A.SIGIAN_EFFECTS.FORCE_ATTACK, [
      targetModifier(sigil.slotId, A.SIGIAN_TARGET_SIDES.ENEMY, A.SIGIAN_TARGET_KINDS.CREATURES, {
        selector: "strongest-attack",
        count
      }),
      activation.condition,
      configModifier(sigil.slotId, { destination: "own-hero" })
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

    const compatibilityExtras = typeof options.compatibilityTechnicalSigils === "function"
      ? options.compatibilityTechnicalSigils({ recipe, technicalSigils: [...technicalSigils] })
      : options.compatibilityTechnicalSigils;
    if (Array.isArray(compatibilityExtras)) {
      compatibilityExtras.forEach(extra => {
        if (!extra?.id || !extra?.effect) throw new Error(`FormulaRecipe ${recipe.id}: compatibility technical Sigil non valido.`);
        technicalSigils.push(A.createSigil(extra));
      });
    }

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
