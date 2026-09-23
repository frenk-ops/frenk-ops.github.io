(function (A) {
  "use strict";

  function modifier(sigil, kind) {
    return (sigil?.modifiers || []).find(item => item.kind === kind) || null;
  }

  function configOf(sigil) {
    return modifier(sigil, A.SIGIAN_MODIFIER_KINDS.CONFIG)?.params || {};
  }

  function targetOf(sigil) {
    return modifier(sigil, A.SIGIAN_MODIFIER_KINDS.TARGET)?.params || null;
  }

  function scaleOf(sigil) {
    return modifier(sigil, A.SIGIAN_MODIFIER_KINDS.SCALE)?.params || null;
  }

  function conditionOf(sigil) {
    return modifier(sigil, A.SIGIAN_MODIFIER_KINDS.CONDITION)?.params || null;
  }

  function sideValue(engine, actingSide, sideRef) {
    if (sideRef === A.SIGIAN_TARGET_SIDES.ENEMY) return engine.getOpponentSide(actingSide);
    return actingSide;
  }

  function targetSides(engine, actingSide, sideRef) {
    if (sideRef === A.SIGIAN_TARGET_SIDES.BOTH) return ["player", "enemy"];
    return [sideValue(engine, actingSide, sideRef)];
  }

  function catalogSignature(cards) {
    return JSON.stringify((cards || []).map(card => [
      card.id,
      card.school,
      card.type,
      card.level,
      card.cost,
      card.attack,
      card.health,
      card.text,
      card.keyword
    ]));
  }

  function formulaCatalogForEngine(engine) {
    if (!engine || typeof A.buildSigianFormulaCatalog !== "function") return null;
    const cards = engine.cards || [];
    const signature = catalogSignature(cards);
    const cached = engine.__sigianFormulaCatalog;
    if (cached?.signature === signature) return cached.catalog;

    const catalog = A.buildSigianFormulaCatalog(cards);
    Object.defineProperty(engine, "__sigianFormulaCatalog", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: { signature, catalog }
    });
    return catalog;
  }

  function formulaFor(engine, source) {
    const id = typeof source === "string" ? source : source?.id;
    return id ? formulaCatalogForEngine(engine)?.byId?.[id] || null : null;
  }

  function sigilsFor(engine, source, options = {}) {
    const formula = formulaFor(engine, source);
    if (!formula) return [];
    return formula.sigils.filter(sigil => {
      if (options.trigger && sigil.trigger !== options.trigger) return false;
      if (options.effect && sigil.effect !== options.effect) return false;
      return true;
    });
  }

  function resolveOperand(engine, actingSide, operand) {
    if (!operand || typeof operand !== "object") return Number(operand || 0);
    if (Object.prototype.hasOwnProperty.call(operand, "value")) return Number(operand.value || 0);
    if (operand.kind === A.SIGIAN_TARGET_KINDS.POWER) {
      const side = sideValue(engine, actingSide, operand.side);
      return Number(engine.getFighter(side).power?.[operand.school] || 0);
    }
    return 0;
  }

  function conditionPasses(engine, actingSide, sigil) {
    const condition = conditionOf(sigil);
    if (!condition) return true;
    const left = resolveOperand(engine, actingSide, condition.left);
    const right = resolveOperand(engine, actingSide, condition.right);
    switch (condition.op) {
      case "lt": return left < right;
      case "lte": return left <= right;
      case "gt": return left > right;
      case "gte": return left >= right;
      case "eq": return left === right;
      case "neq": return left !== right;
      default: throw new Error(`Sigillo ${sigil.id}: operatore condizione non supportato ${condition.op}.`);
    }
  }

  function strongestByHealth(engine, side) {
    let best = null;
    engine.getFighter(side).board.forEach((unit, slot) => {
      if (!unit || unit.currentHealth <= 0) return;
      if (!best || unit.currentHealth > best.unit.currentHealth) best = { unit, slot };
    });
    return best;
  }

  function strongestByAttack(engine, side, excludedSlots) {
    let best = null;
    engine.getFighter(side).board.forEach((unit, slot) => {
      if (!unit || unit.currentHealth <= 0 || excludedSlots?.has(slot)) return;
      const attack = typeof A.astralCombatAttack === "function"
        ? A.astralCombatAttack(engine, side, unit)
        : Number(unit.attack || 0);
      if (!best || attack > best.attack) best = { unit, slot, attack };
    });
    return best;
  }

  function scaleAmount(engine, actingSide, formula, sigil, context = {}) {
    const scale = scaleOf(sigil);
    if (!scale) return 0;
    switch (scale.mode) {
      case A.SIGIAN_SCALE_MODES.CONSTANT: {
        const value = Number(scale.value);
        if (!Number.isFinite(value)) throw new Error(`Sigillo ${sigil.id}: valore costante non valido.`);
        return Math.trunc(value);
      }
      case A.SIGIAN_SCALE_MODES.SOURCE_POWER: {
        const school = scale.school || formula.school;
        const power = Number(engine.getFighter(actingSide).power?.[school] || 0);
        const numerator = Number(scale.numerator ?? 1);
        const denominator = Number(scale.denominator ?? 1) || 1;
        let amount = Math.trunc((power * numerator) / denominator) + Math.trunc(Number(scale.offset || 0));
        if (Number.isFinite(Number(scale.min))) amount = Math.max(Number(scale.min), amount);
        return Math.trunc(amount);
      }
      case A.SIGIAN_SCALE_MODES.TARGET_ATTACK:
        return Math.max(0, Math.trunc(typeof A.astralEffectiveAttack === "function"
          ? A.astralEffectiveAttack(engine, context.targetSide, context.target)
          : Number(context.target?.attack || 0)));
      case A.SIGIAN_SCALE_MODES.CREATURE_COUNT: {
        const refs = Array.isArray(scale.sides) ? scale.sides : [A.SIGIAN_TARGET_SIDES.BOTH];
        const sides = refs.flatMap(ref => targetSides(engine, actingSide, ref));
        const uniqueSides = [...new Set(sides)];
        const count = uniqueSides.reduce((sum, targetSide) => (
          sum + engine.getFighter(targetSide).board.filter(Boolean).length
        ), 0);
        return Math.trunc(count * Number(scale.multiplier || 1));
      }
      case A.SIGIAN_SCALE_MODES.DAMAGE_DEALT: {
        const numerator = Number(scale.numerator ?? 1);
        const denominator = Number(scale.denominator ?? 1) || 1;
        return Math.trunc((Number(context.damageDealt || 0) * numerator) / denominator);
      }
      case A.SIGIAN_SCALE_MODES.FULL_HEALTH:
        if (context.target) {
          return Math.max(0, Number(context.target.health || 0) - Number(context.target.currentHealth || 0));
        }
        return 0;
      default:
        throw new Error(`Sigillo ${sigil.id}: scaling non supportato ${scale.mode}.`);
    }
  }

  function sourceOptions(formula, source) {
    return {
      sourceKind: formula.type === "spell" ? "spell" : "effect",
      sourceCard: A.materializeLegacyCardFromFormula(formula),
      ...(source && source.type === "creature" ? { sourceUnit: source } : {}),
      reason: formula.id
    };
  }

  function healHero(engine, side, amount, reason, events) {
    const fighter = engine.getFighter(side);
    const before = Math.max(0, Number(fighter.hp || 0));
    fighter.hp = before + Math.max(0, Math.trunc(amount || 0));
    const healed = fighter.hp - before;
    if (healed > 0) events?.push({ type: "astralHealHero", side, amount: healed, reason, hp: fighter.hp });
    return healed;
  }

  function healUnit(unit, amount, events, details = {}) {
    if (!unit || unit.currentHealth <= 0) return 0;
    const before = Math.max(0, Number(unit.currentHealth || 0));
    const max = Math.max(before, Number(unit.health || before));
    unit.currentHealth = Math.min(max, before + Math.max(0, Math.trunc(amount || 0)));
    const healed = unit.currentHealth - before;
    if (healed > 0) events?.push({
      type: "astralUnitHeal",
      side: details.side,
      slot: details.slot,
      cardId: unit.id,
      instanceId: unit.instanceId,
      amount: healed,
      health: unit.currentHealth,
      reason: details.reason || unit.id
    });
    return healed;
  }

  function changePower(engine, side, school, delta, reason, events) {
    const fighter = engine.getFighter(side);
    const before = Number(fighter.power[school] || 0);
    fighter.power[school] = Math.max(0, Math.min(engine.rules.maxPower, before + Math.trunc(delta || 0)));
    const applied = fighter.power[school] - before;
    if (applied !== 0) events?.push({
      type: "astralPowerChange",
      side,
      school,
      delta: applied,
      value: fighter.power[school],
      reason
    });
    return applied;
  }

  function changeAllPowers(engine, side, delta, reason, events) {
    const amount = Math.abs(Math.trunc(delta || 0));
    const target = engine.getFighter(side);
    const changes = {};
    A.SCHOOLS.forEach(school => {
      const before = Number(target.power[school.id] || 0);
      target.power[school.id] = Math.max(0, Math.min(engine.rules.maxPower, before + Math.trunc(delta || 0)));
      changes[school.id] = target.power[school.id] - before;
    });
    if (delta < 0) {
      events?.push({ type: "astralPowerReduction", side, amount, changes, reason });
    } else {
      A.SCHOOLS.forEach(school => {
        const applied = changes[school.id];
        if (applied !== 0) events?.push({
          type: "astralPowerChange",
          side,
          school: school.id,
          delta: applied,
          value: target.power[school.id],
          reason
        });
      });
    }
  }

  function applyGrowthModifier(engine, actingSide, source, sigil) {
    const target = targetOf(sigil);
    const delta = scaleAmount(engine, actingSide, formulaFor(engine, source), sigil);
    if (!target || !delta || !source) return;
    const sides = targetSides(engine, actingSide, target.side);
    const schools = target.kind === A.SIGIAN_TARGET_KINDS.POWERS
      ? A.SCHOOLS.map(school => school.id)
      : [target.school];
    source.astralPowerModifiers = source.astralPowerModifiers || [];
    sides.forEach(targetSide => {
      schools.forEach(school => {
        if (!school) return;
        engine.getFighter(targetSide).powerGain[school] += delta;
        source.astralPowerModifiers.push({ targetSide, school, delta });
      });
    });
  }

  function executeSigil(engine, actingSide, formula, sigil, context, events) {
    if (!conditionPasses(engine, actingSide, sigil)) return { executed: false };
    const target = targetOf(sigil);
    const source = context?.source || null;
    const options = sourceOptions(formula, source);
    const targetSideList = target ? targetSides(engine, actingSide, target.side) : [];

    switch (sigil.effect) {
      case A.SIGIAN_EFFECTS.DAMAGE: {
        if (!target) throw new Error(`Sigillo ${sigil.id}: target danno mancante.`);
        for (const targetSide of targetSideList) {
          if (target.kind === A.SIGIAN_TARGET_KINDS.HERO) {
            const amount = scaleAmount(engine, actingSide, formula, sigil, { ...context, targetSide });
            A.astralApplyHeroDamage(engine, actingSide, targetSide, amount, options, events);
          } else if (target.kind === A.SIGIAN_TARGET_KINDS.CREATURES) {
            engine.getFighter(targetSide).board.forEach((unit, slot) => {
              if (!unit) return;
              const amount = scaleAmount(engine, actingSide, formula, sigil, { ...context, target: unit, targetSide, slot });
              A.astralApplyUnitDamage(engine, actingSide, targetSide, slot, amount, options, events);
            });
          } else if (target.kind === A.SIGIAN_TARGET_KINDS.CREATURE) {
            const selected = target.selector === "strongest-health" ? strongestByHealth(engine, targetSide) : null;
            if (selected) {
              const amount = scaleAmount(engine, actingSide, formula, sigil, { ...context, target: selected.unit, targetSide, slot: selected.slot });
              A.astralApplyUnitDamage(engine, actingSide, targetSide, selected.slot, amount, options, events);
            }
          }
        }
        return { executed: true };
      }

      case A.SIGIAN_EFFECTS.HEAL: {
        if (!target) throw new Error(`Sigillo ${sigil.id}: target cura mancante.`);
        for (const targetSide of targetSideList) {
          if (target.kind === A.SIGIAN_TARGET_KINDS.HERO) {
            const amount = scaleAmount(engine, actingSide, formula, sigil, { ...context, targetSide });
            healHero(engine, targetSide, amount, configOf(sigil).reason || formula.id, events);
          } else if (target.kind === A.SIGIAN_TARGET_KINDS.CREATURES) {
            engine.getFighter(targetSide).board.forEach((unit, slot) => {
              if (!unit) return;
              const amount = scaleAmount(engine, actingSide, formula, sigil, { ...context, target: unit, targetSide, slot });
              healUnit(unit, amount, events, { side: targetSide, slot, reason: configOf(sigil).reason || formula.id });
            });
          } else if (target.kind === A.SIGIAN_TARGET_KINDS.SOURCE && source) {
            const slot = engine.getFighter(actingSide).board.indexOf(source);
            const amount = scaleAmount(engine, actingSide, formula, sigil, { ...context, target: source, targetSide: actingSide, slot });
            healUnit(source, amount, events, { side: actingSide, slot, reason: configOf(sigil).reason || formula.id });
          }
        }
        return { executed: true };
      }

      case A.SIGIAN_EFFECTS.POWER: {
        if (!target) throw new Error(`Sigillo ${sigil.id}: target Potere mancante.`);
        const amount = scaleAmount(engine, actingSide, formula, sigil, context);
        for (const targetSide of targetSideList) {
          const cfg = configOf(sigil);
          if (cfg.eventType === "astralDeathKeeper") {
            const fighter = engine.getFighter(targetSide);
            const before = Number(fighter.power[target.school] || 0);
            fighter.power[target.school] = Math.min(engine.rules.maxPower, before + amount);
            const applied = fighter.power[target.school] - before;
            if (applied > 0) events?.push({ type: "astralDeathKeeper", side: targetSide, amount: applied, deadId: context.deadUnit?.id });
          } else {
            changePower(engine, targetSide, target.school, amount, formula.id, events);
          }
        }
        return { executed: true };
      }

      case A.SIGIAN_EFFECTS.POWER_ALL: {
        const amount = scaleAmount(engine, actingSide, formula, sigil, context);
        for (const targetSide of targetSideList) changeAllPowers(engine, targetSide, amount, formula.id, events);
        return { executed: true };
      }

      case A.SIGIAN_EFFECTS.POWER_GROWTH:
        applyGrowthModifier(engine, actingSide, source, sigil);
        return { executed: true };

      case A.SIGIAN_EFFECTS.DESTROY:
        for (const targetSide of targetSideList) {
          if (target.kind === A.SIGIAN_TARGET_KINDS.CREATURES) {
            engine.getFighter(targetSide).board.forEach(unit => {
              if (unit) unit.currentHealth = 0;
            });
          } else if (target.kind === A.SIGIAN_TARGET_KINDS.CREATURE) {
            const selected = target.selector === "strongest-health" ? strongestByHealth(engine, targetSide) : null;
            if (selected) selected.unit.currentHealth = 0;
          }
        }
        return { executed: true };

      case A.SIGIAN_EFFECTS.DRAIN: {
        const targetSide = targetSideList[0];
        const amount = scaleAmount(engine, actingSide, formula, sigil, context);
        const dealt = A.astralApplyHeroDamage(engine, actingSide, targetSide, amount, options, events);
        healHero(engine, actingSide, dealt, formula.id, events);
        return { executed: true, damageDealt: dealt };
      }

      case A.SIGIAN_EFFECTS.FORCE_ATTACK: {
        const targetSide = targetSideList[0];
        const used = new Set();
        const count = Math.max(0, Math.trunc(Number(target?.count || 1)));
        for (let index = 0; index < count; index += 1) {
          const attacker = strongestByAttack(engine, targetSide, used);
          if (!attacker) break;
          used.add(attacker.slot);
          A.astralApplyHeroDamage(engine, targetSide, targetSide, attacker.attack, {
            sourceKind: "creature",
            sourceUnit: attacker.unit,
            reason: formula.id
          }, events);
        }
        return { executed: true };
      }

      case A.SIGIAN_EFFECTS.EMIT: {
        const cfg = configOf(sigil);
        const event = { type: cfg.type };
        Object.entries(cfg.values || {}).forEach(([key, descriptor]) => {
          if (descriptor?.literal === "acting-side") event[key] = actingSide;
          else if (descriptor?.kind === A.SIGIAN_TARGET_KINDS.POWER) {
            const targetSide = sideValue(engine, actingSide, descriptor.side);
            event[key] = engine.getFighter(targetSide).power?.[descriptor.school] || 0;
          }
        });
        events?.push(event);
        return { executed: true };
      }

      default:
        return { executed: false };
    }
  }

  function executeTrigger(engine, actingSide, formula, trigger, context = {}, events = []) {
    formula.sigils
      .filter(sigil => sigil.trigger === trigger)
      .forEach(sigil => executeSigil(engine, actingSide, formula, sigil, context, events));
    return events;
  }

  function applyAstralNets(engine, side, source, events) {
    const enemySide = engine.getOpponentSide(side);
    if (!engine.getFighter(enemySide).passives?.includes("astral_nets")) return;
    const slot = engine.getFighter(side).board.indexOf(source);
    A.astralApplyUnitDamage(engine, enemySide, side, slot, 3, {
      sourceKind: "effect",
      reason: "astral_nets"
    }, events);
    events?.push({ type: "astralNets", sourceSide: enemySide, targetSide: side, targetId: source.id, amount: 3 });
  }

  A.executeSigianFormula = function executeSigianFormula(engine, side, formula, options = {}) {
    if (!engine || !["player", "enemy"].includes(side)) throw new Error("Esecuzione Formula: engine o lato non valido.");
    if (formula?.source?.mode !== A.SIGIAN_MIGRATION_MODES.NATIVE) throw new Error(`Formula ${formula?.id || "senza-id"} non nativa.`);
    const validation = A.validateFormula(formula);
    if (!validation.valid) throw new Error(`Formula ${formula.id} non valida: ${validation.errors.join("; ")}`);

    const trigger = options.trigger || (formula.type === "creature" ? "onSummon" : "onPlay");
    const source = options.source || A.materializeLegacyCardFromFormula(formula);
    const events = [];

    if (trigger === "onSummon" && source?.type === "creature") {
      source.health = Number(source.health || source.hp || 1);
      source.currentHealth = Number(source.currentHealth ?? source.health);
      source.astralPowerModifiers = [];
      executeTrigger(engine, side, formula, "whileAlive", { source }, events);
      applyAstralNets(engine, side, source, events);
    }

    executeTrigger(engine, side, formula, trigger, { source }, events);

    if (["onSummon", "onPlay"].includes(trigger) && typeof A.astralCleanupDeaths === "function") {
      A.astralCleanupDeaths(engine, events, side);
    }
    return { events };
  };

  A.getSigianFormulaCatalogForEngine = function getSigianFormulaCatalogForEngine(engine) {
    return formulaCatalogForEngine(engine);
  };

  A.getSigianFormulaFor = function getSigianFormulaFor(engine, source) {
    return formulaFor(engine, source);
  };

  A.resolveSigianCardEffect = function resolveSigianCardEffect(engine, side, source, trigger, events) {
    const output = Array.isArray(events) ? events : [];
    const formula = formulaFor(engine, source);
    if (!formula) throw new Error(`Router Sigian: Formula mancante per ${source?.id || "senza-id"}.`);
    const result = A.executeSigianFormula(engine, side, formula, { trigger, source });
    output.push(...result.events);
    return { mode: A.SIGIAN_MIGRATION_MODES.NATIVE, formulaId: formula.id, events: result.events };
  };

  A.sigianEffectiveAttack = function sigianEffectiveAttack(engine, side, unit) {
    const formula = formulaFor(engine, unit);
    if (!formula) return Math.max(0, Math.trunc(Number(unit?.attack || 0)));
    const dynamic = formula.sigils.find(sigil => sigil.effect === A.SIGIAN_EFFECTS.ATTACK_FROM_POWER);
    if (dynamic) {
      const school = configOf(dynamic).school || formula.school;
      return Math.max(0, Math.trunc(Number(engine.getFighter(side).power?.[school] || 0)));
    }
    const aura = formula.sigils.find(sigil => sigil.effect === A.SIGIAN_EFFECTS.ATTACK_MULTIPLIER);
    const baseOverride = Number(configOf(aura).sourceBaseAttack);
    if (Number.isFinite(baseOverride)) return Math.max(0, Math.trunc(baseOverride));
    return Math.max(0, Math.trunc(Number(unit?.attack || 0)));
  };

  A.sigianCombatAttack = function sigianCombatAttack(engine, side, unit) {
    let amount = A.sigianEffectiveAttack(engine, side, unit);
    let linearHalfBonuses = 0;
    engine.getFighter(side).board.forEach(source => {
      if (!source || source.currentHealth <= 0) return;
      sigilsFor(engine, source, { effect: A.SIGIAN_EFFECTS.ATTACK_MULTIPLIER }).forEach(sigil => {
        const cfg = configOf(sigil);
        if (cfg.appliesTo === "allied-creatures") linearHalfBonuses += 1;
      });
    });
    if (linearHalfBonuses > 0) amount = Math.trunc((amount * (2 + linearHalfBonuses)) / 2);
    return Math.max(0, amount);
  };

  A.sigianSpellDamage = function sigianSpellDamage(engine, side, baseAmount) {
    let amount = Math.max(0, Math.trunc(baseAmount || 0));
    let linearHalfBonuses = 0;
    let flatBonus = 0;
    engine.getFighter(side).board.forEach(source => {
      if (!source || source.currentHealth <= 0) return;
      sigilsFor(engine, source, { effect: A.SIGIAN_EFFECTS.SPELL_DAMAGE_MULTIPLIER }).forEach(() => { linearHalfBonuses += 1; });
      sigilsFor(engine, source, { effect: A.SIGIAN_EFFECTS.SPELL_DAMAGE_BONUS }).forEach(sigil => {
        flatBonus += scaleAmount(engine, side, formulaFor(engine, source), sigil);
      });
    });
    if (linearHalfBonuses > 0) amount = Math.trunc((amount * (2 + linearHalfBonuses)) / 2);
    amount += flatBonus;
    if (engine.getFighter(side).passives?.includes("battle_lord")) amount += 1;
    return Math.max(0, amount);
  };

  A.sigianReduceIncomingDamage = function sigianReduceIncomingDamage(engine, targetSide, targetKind, amount) {
    let result = Math.max(0, Math.trunc(amount || 0));
    const active = [];
    engine.getFighter(targetSide).board.forEach(source => {
      if (!source || source.currentHealth <= 0) return;
      sigilsFor(engine, source, { effect: A.SIGIAN_EFFECTS.DAMAGE_REDUCTION }).forEach(sigil => active.push(sigil));
    });

    active.filter(sigil => {
      const cfg = configOf(sigil);
      return cfg.mode === "halve" && (!cfg.targetKinds || cfg.targetKinds.includes(targetKind));
    }).forEach(() => { result = Math.trunc(result / 2); });

    const subtractors = active.filter(sigil => {
      const cfg = configOf(sigil);
      return cfg.mode === "subtract" && (!cfg.targetKinds || cfg.targetKinds.includes(targetKind));
    });
    if (subtractors.length > 0) {
      const cfg = configOf(subtractors[0]);
      if (result > Number(cfg.threshold ?? 0)) result -= Math.max(0, Math.trunc(Number(cfg.value || 0)));
    }

    if (result > 1 && engine.getFighter(targetSide).passives?.includes("stone_skin")) result -= 1;
    return Math.max(0, result);
  };

  A.sigianIsMultiTargetAttack = function sigianIsMultiTargetAttack(engine, unit) {
    return sigilsFor(engine, unit, { effect: A.SIGIAN_EFFECTS.ATTACK_ALL }).length > 0;
  };

  A.sigianBeforeUnitAttack = function sigianBeforeUnitAttack(engine, side, slot, unit, events) {
    const formula = formulaFor(engine, unit);
    if (!formula) return;
    executeTrigger(engine, side, formula, "onBeforeAttack", { source: unit, slot }, events);
    engine.checkWinner();
  };

  A.sigianOnUnitDamageDealt = function sigianOnUnitDamageDealt(engine, sourceSide, sourceUnit, actual, events) {
    if (!sourceUnit || actual <= 0) return;
    const lifesteal = sigilsFor(engine, sourceUnit, { effect: A.SIGIAN_EFFECTS.LIFESTEAL })[0];
    if (!lifesteal) return;
    const cfg = configOf(lifesteal);
    if (cfg.onlyTargetKind && cfg.onlyTargetKind !== "creature") return;
    const healed = healUnit(sourceUnit, scaleAmount(engine, sourceSide, formulaFor(engine, sourceUnit), lifesteal, { damageDealt: actual }));
    if (healed > 0) events?.push({ type: "astralVampireHeal", side: sourceSide, amount: healed, sourceId: sourceUnit.instanceId });
  };

  A.sigianResolveSelfDeath = function sigianResolveSelfDeath(engine, side, slot, unit, events) {
    const formula = formulaFor(engine, unit);
    if (!formula) return false;
    const sigils = formula.sigils.filter(sigil => sigil.trigger === "onSelfDeath" && sigil.effect === A.SIGIAN_EFFECTS.RESURRECT);
    for (const sigil of sigils) {
      if (!conditionPasses(engine, side, sigil)) continue;
      unit.currentHealth = unit.health;
      if (typeof engine.getOwnerTurnCount === "function") unit.summonedOnOwnerTurn = engine.getOwnerTurnCount(side);
      events?.push({ type: "astralPhoenixRebirth", side, slot, cardId: unit.id, health: unit.currentHealth });
      return true;
    }
    return false;
  };

  A.sigianTriggerAnyDeath = function sigianTriggerAnyDeath(engine, deadUnit, events) {
    ["player", "enemy"].forEach(side => {
      const living = engine.getFighter(side).board.filter(unit => unit && unit.currentHealth > 0);
      const keepers = living.filter(unit => sigilsFor(engine, unit, { trigger: "onAnyDeath", effect: A.SIGIAN_EFFECTS.POWER }).some(sigil => configOf(sigil).eventType === "astralDeathKeeper")).length;
      if (keepers > 0) {
        const owner = engine.getFighter(side);
        owner.power.death = Math.min(engine.rules.maxPower, owner.power.death + keepers);
        events?.push({ type: "astralDeathKeeper", side, amount: keepers, deadId: deadUnit.id });
      }

      let deathHeal = 0;
      let reason = null;
      living.forEach(unit => {
        sigilsFor(engine, unit, { trigger: "onAnyDeath", effect: A.SIGIAN_EFFECTS.HEAL }).forEach(sigil => {
          deathHeal += Math.max(0, scaleAmount(engine, side, formulaFor(engine, unit), sigil));
          reason = configOf(sigil).reason || formulaFor(engine, unit)?.id || reason;
        });
      });
      if (deathHeal > 0) healHero(engine, side, deathHeal, reason, events);
    });
  };

  A.sigianPreviewCardValue = function sigianPreviewCardValue(engine, side, card) {
    const formula = formulaFor(engine, card);
    if (!formula) return null;
    const sigil = formula.sigils.find(item =>
      item.trigger === "onPlay" &&
      [A.SIGIAN_EFFECTS.DAMAGE, A.SIGIAN_EFFECTS.HEAL, A.SIGIAN_EFFECTS.DRAIN].includes(item.effect) &&
      [A.SIGIAN_SCALE_MODES.SOURCE_POWER].includes(scaleOf(item)?.mode)
    );
    if (!sigil) return null;
    const target = targetOf(sigil);
    const base = scaleAmount(engine, side, formula, sigil);
    if (sigil.effect === A.SIGIAN_EFFECTS.HEAL) return { base, kind: "heal", modified: base, effective: base, targetSide: side };
    const targetSide = target?.side === A.SIGIAN_TARGET_SIDES.ENEMY ? engine.getOpponentSide(side) : side;
    const targetKind = target?.kind === A.SIGIAN_TARGET_KINDS.CREATURES ? "creature" : "hero";
    const modified = A.sigianSpellDamage(engine, side, base);
    const reduced = A.sigianReduceIncomingDamage(engine, targetSide, targetKind, modified);
    const effective = targetKind === "hero"
      ? Math.min(reduced, Math.max(0, Number(engine.getFighter(targetSide).hp || 0)))
      : reduced;
    return { base, kind: "damage", targetKind, modified, effective, targetSide };
  };
})(window.Arcane = window.Arcane || {});
