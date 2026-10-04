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
    if (!id) return null;
    const override = engine?.__sigianFormulaOverrides?.[id];
    return override || formulaCatalogForEngine(engine)?.byId?.[id] || null;
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
      case A.SIGIAN_EFFECTS.SWAP_CREATURES: {
        const result = engine.swapCreatures(actingSide, source, context.targets);
        if (result.ok) events.push(result.event);
        return { executed: result.ok };
      }
      case A.SIGIAN_EFFECTS.MOVE_FIRST_FREE_LANE: {
        const fromSlot = engine.getFighter(actingSide).board.indexOf(source);
        if (fromSlot < 0 || source.currentHealth <= 0) return { executed: false };
        const opposite = engine.getFighter(engine.getOpponentSide(actingSide)).board[fromSlot];
        if (!opposite || opposite.currentHealth <= 0) return { executed: false };
        const toSlot = engine.getFullyFreeLanes()[0];
        if (toSlot === undefined) return { executed: false };
        const movement = engine.moveUnitToFreeLane(actingSide, fromSlot, toSlot);
        if (movement.ok) events.push({ ...movement.event, reason: "before-attack" });
        return { executed: movement.ok };
      }
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
            const selected = target.selector === "strongest-attack"
              ? strongestByAttack(engine, targetSide)
              : strongestByHealth(engine, targetSide);
            if (selected) {
              const amount = scaleAmount(engine, actingSide, formula, sigil, { ...context, target: selected.unit, targetSide, slot: selected.slot });
              A.astralApplyUnitDamage(engine, actingSide, targetSide, selected.slot, amount, options, events);
            }
          } else if (target.kind === A.SIGIAN_TARGET_KINDS.EVENT_SOURCE) {
            const eventSource = context?.eventSourceUnit;
            const eventSourceSide = context?.eventSourceSide || targetSide;
            if (!eventSource || eventSource.currentHealth <= 0) continue;
            const eventSourceSlot = Number.isInteger(context?.eventSourceSlot)
              ? context.eventSourceSlot
              : engine.getFighter(eventSourceSide).board.indexOf(eventSource);
            if (eventSourceSlot < 0) continue;
            const amount = scaleAmount(engine, actingSide, formula, sigil, {
              ...context,
              target: eventSource,
              targetSide: eventSourceSide,
              slot: eventSourceSlot
            });
            A.astralApplyUnitDamage(engine, actingSide, eventSourceSide, eventSourceSlot, amount, {
              ...options,
              suppressRetaliation: true
            }, events);
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
            const selected = target.selector === "strongest-attack"
              ? strongestByAttack(engine, targetSide)
              : strongestByHealth(engine, targetSide);
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

    executeTrigger(engine, side, formula, trigger, { source, targets: options.targets }, events);

    if (["onSummon", "onPlay"].includes(trigger) && typeof A.astralCleanupDeaths === "function") {
      A.astralCleanupDeaths(engine, events, side);
    }
    return { events };
  };

  function cloneRuntime(value) {
    if (typeof A.deepClone === "function") return A.deepClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  let originalInventoryRuntimeCatalog = null;

  function getOriginalInventoryRuntimeCatalog() {
    if (originalInventoryRuntimeCatalog) return originalInventoryRuntimeCatalog;
    if (typeof A.buildSigianFormulaCatalog !== "function") return null;
    const cards = A.RAW_CARD_SETS?.["astral-original"] || [];
    originalInventoryRuntimeCatalog = A.buildSigianFormulaCatalog(cards);
    return originalInventoryRuntimeCatalog;
  }

  A.resolveSigianFormulaInstanceRuntime = function resolveSigianFormulaInstanceRuntime(formulaInstanceId) {
    const requested = String(formulaInstanceId || "").trim();
    const normalized = typeof A.normalizeSigianGrimoireFormulaInstanceId === "function"
      ? A.normalizeSigianGrimoireFormulaInstanceId(requested)
      : requested;
    const blockers = [];
    const instance = normalized ? A.getSigianFormulaInstance?.(normalized) || null : null;
    if (!instance) {
      blockers.push("formula-instance-missing");
      return {
        formulaInstanceId:normalized,
        lifecycleState:null,
        playable:false,
        blockers,
        instance:null,
        composition:null,
        evaluation:null,
        formula:null,
        card:null
      };
    }

    if (instance.lifecycleState !== "SEALED") blockers.push("formula-not-sealed");

    const persisted = A.getSigianFormulaComposition?.(instance.formulaInstanceId, { allowCanonicalFallback:false }) || null;
    const isUntouchedOriginal = Boolean(instance.sourceCardId && !persisted);

    if (isUntouchedOriginal) {
      const formula = getOriginalInventoryRuntimeCatalog()?.byId?.[instance.sourceCardId] || null;
      if (!formula) blockers.push("formula-runtime-catalog-missing");
      const card = formula && !blockers.length ? A.materializeLegacyCardFromFormula?.(formula) || null : null;
      return {
        formulaInstanceId:instance.formulaInstanceId,
        lifecycleState:instance.lifecycleState,
        playable:blockers.length === 0,
        blockers,
        instance:cloneRuntime(instance),
        composition:null,
        evaluation:null,
        formula:formula && !blockers.length ? cloneRuntime(formula) : null,
        card:card && !blockers.length ? { ...cloneRuntime(card), formulaInstanceId:instance.formulaInstanceId } : null,
        source:"standard-runtime"
      };
    }

    if (!persisted?.composition) blockers.push("formula-composition-missing");
    const evaluation = persisted?.evaluation || null;
    if (!evaluation
      || String(evaluation.status || "") !== "production"
      || !Number.isInteger(Math.trunc(Number(evaluation.minimumLevel)))
      || Math.trunc(Number(evaluation.minimumLevel)) < 1) {
      blockers.push("production-evaluation-required");
    }
    if (persisted?.composition?.constraint) blockers.push("global-constraint-runtime-pending");
    if (typeof A.compileFormulaRecipe !== "function" || typeof A.materializeLegacyCardFromFormula !== "function") {
      blockers.push("formula-runtime-compiler-unavailable");
    }

    let formula = null;
    let card = null;
    if (!blockers.length) {
      try {
        const recipe = cloneRuntime(persisted.composition);
        recipe.id = instance.formulaInstanceId;
        formula = A.compileFormulaRecipe(recipe, {
          level:Math.trunc(Number(evaluation.minimumLevel)),
          set:"sigian-inventory"
        });
        card = A.materializeLegacyCardFromFormula(formula);
        card.formulaInstanceId = instance.formulaInstanceId;
        card.formulaRecipe = cloneRuntime(persisted.composition);
        card.formulaEvaluation = cloneRuntime(evaluation);
      } catch (error) {
        blockers.push("formula-runtime-compile-failed");
        return {
          formulaInstanceId:instance.formulaInstanceId,
          lifecycleState:instance.lifecycleState,
          playable:false,
          blockers,
          error:String(error?.message || error || ""),
          instance:cloneRuntime(instance),
          composition:persisted?.composition ? cloneRuntime(persisted.composition) : null,
          evaluation:evaluation ? cloneRuntime(evaluation) : null,
          formula:null,
          card:null,
          source:"persistent"
        };
      }
    }

    return {
      formulaInstanceId:instance.formulaInstanceId,
      lifecycleState:instance.lifecycleState,
      playable:blockers.length === 0,
      blockers:[...new Set(blockers)],
      instance:cloneRuntime(instance),
      composition:persisted?.composition ? cloneRuntime(persisted.composition) : null,
      evaluation:evaluation ? cloneRuntime(evaluation) : null,
      formula:formula ? cloneRuntime(formula) : null,
      card:card ? cloneRuntime(card) : null,
      source:"persistent"
    };
  };

  function standardGrimoireRuntime(grimoire) {
    const cards = A.RAW_CARD_SETS?.["astral-original"] || [];
    const catalog = getOriginalInventoryRuntimeCatalog();
    const entries = cards.map(card => {
      const formula = catalog?.byId?.[card.id] || null;
      const materialized = formula ? A.materializeLegacyCardFromFormula?.(formula) || null : null;
      return {
        formulaInstanceId:`owned:${card.id}`,
        lifecycleState:"SEALED",
        playable:Boolean(formula && materialized),
        blockers:formula && materialized ? [] : ["formula-runtime-catalog-missing"],
        instance:{
          formulaInstanceId:`owned:${card.id}`,
          recipeId:card.id,
          sourceCardId:card.id,
          lifecycleState:"SEALED"
        },
        composition:null,
        evaluation:null,
        formula:formula ? cloneRuntime(formula) : null,
        card:materialized ? { ...cloneRuntime(materialized), formulaInstanceId:`owned:${card.id}` } : null,
        source:"standard-runtime"
      };
    });
    const playableEntries = entries.filter(entry => entry.playable && entry.formula && entry.card);
    const blockers = entries.flatMap(entry =>
      (entry.blockers || []).map(code => ({ formulaInstanceId:entry.formulaInstanceId, code }))
    );
    return {
      grimoire:cloneRuntime(grimoire),
      entries,
      playableEntries,
      cards:playableEntries.map(entry => cloneRuntime(entry.card)),
      formulas:playableEntries.map(entry => cloneRuntime(entry.formula)),
      blockers,
      ready:blockers.length === 0 && playableEntries.length === cards.length
    };
  }

  A.materializeSigianGrimoireForRuntime = function materializeSigianGrimoireForRuntime(grimoireId) {
    const grimoire = A.getSigianGrimoire?.(grimoireId) || null;
    if (!grimoire) {
      return {
        grimoire:null,
        entries:[],
        playableEntries:[],
        cards:[],
        formulas:[],
        blockers:["grimoire-missing"],
        ready:false
      };
    }

    if (grimoire.kind === "STANDARD") return standardGrimoireRuntime(grimoire);

    const entries = (grimoire.formulaIds || []).map(A.resolveSigianFormulaInstanceRuntime);
    const playableEntries = entries.filter(entry => entry.playable && entry.formula && entry.card);
    const blockers = entries.flatMap(entry =>
      (entry.blockers || []).map(code => ({ formulaInstanceId:entry.formulaInstanceId, code }))
    );
    return {
      grimoire:cloneRuntime(grimoire),
      entries,
      playableEntries,
      cards:playableEntries.map(entry => cloneRuntime(entry.card)),
      formulas:playableEntries.map(entry => cloneRuntime(entry.formula)),
      blockers,
      ready:blockers.length === 0
    };
  };

  function schoolOrderIndex(schoolId) {
    const order = (A.SCHOOLS || []).map(item => item.id);
    const index = order.indexOf(schoolId);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  }

  function sortGrimoireCards(cards) {
    return [...cards].sort((left, right) => {
      const schoolDelta = schoolOrderIndex(left.school) - schoolOrderIndex(right.school);
      if (schoolDelta) return schoolDelta;
      const costDelta = Number(left.level || left.cost || 0) - Number(right.level || right.cost || 0);
      if (costDelta) return costDelta;
      return String(left.id || "").localeCompare(String(right.id || ""));
    });
  }

  function grimoireSelectionError(validation) {
    const codes = (validation?.blockers || []).map(item => item.code || item).filter(Boolean);
    const error = new Error(`Grimorio non pronto: ${codes.join(", ") || "configurazione non valida"}.`);
    error.code = "SIGIAN_GRIMOIRE_NOT_READY";
    error.blockers = cloneRuntime(validation?.blockers || []);
    return error;
  }

  A.generateSigianGrimoireDuelHands = function generateSigianGrimoireDuelHands(grimoireId, options = {}) {
    const grimoire = A.getSigianGrimoire?.(grimoireId) || null;
    if (!grimoire) throw grimoireSelectionError({ blockers:[{ code:"grimoire-missing" }] });
    if (grimoire.kind === "STANDARD") {
      return A.generateRecoveredAstralHands(A.RAW_CARD_SETS?.["astral-original"] || [], options);
    }

    const specializationsEnabled = Boolean(options.specializationsEnabled);
    const formativeSchoolId = String(options.formativeSchoolId || "").trim();
    const validation = A.validateSigianGrimoire?.(grimoire, {
      specializationsEnabled,
      formativeSchoolId,
      allowAnySpecializationSchool:options.allowAnySpecializationSchool === true
    });
    if (!validation?.ready) throw grimoireSelectionError(validation);

    const runtime = A.materializeSigianGrimoireForRuntime(grimoire.id);
    if (!runtime.ready) throw grimoireSelectionError({ blockers:runtime.blockers });

    const standardCards = A.RAW_CARD_SETS?.["astral-original"] || [];
    const seed = String(options.seed || "sigian-grimoire-duel");
    const distributionMode = ["arcane", "free", "mirror"].includes(options.distributionMode)
      ? options.distributionMode
      : "free";
    const templateOptions = {
      seed:`${seed}:sigian-shape`,
      mode:"duel",
      distributionMode:"free",
      enemyDifficulty:options.enemyDifficulty || "advanced",
      playerTalent:options.playerTalent,
      enemyTalent:options.enemyTalent,
      playerSpecialization:options.playerSpecialization,
      enemySpecialization:options.enemySpecialization,
      playerAbilities:options.playerAbilities || [],
      enemyAbilities:options.enemyAbilities || [],
      enemyGuaranteedFormulaId:options.enemyGuaranteedFormulaId || null,
      playerInitialPowers:options.playerInitialPowers,
      enemyInitialPowers:options.enemyInitialPowers,
      restrictedMode:options.restrictedMode,
      maxGenerationAttempts:options.maxGenerationAttempts
    };
    const template = A.generateRecoveredAstralHands(standardCards, templateOptions);
    const playerShape = (template.diagnostics || []).find(item => item.side === "player") || template.diagnostics?.[0] || null;
    const targetBySchool = playerShape?.bySchool || {};
    const baseFormulaCount = Number(A.SIGIAN_GRIMOIRE_BASE_FORMULA_COUNT || 20);
    const requestedCount = Object.values(targetBySchool).reduce((sum, value) => sum + Number(value || 0), 0);
    if (requestedCount !== baseFormulaCount) {
      throw grimoireSelectionError({ blockers:[{
        code:"base-distribution-count",
        expected:baseFormulaCount,
        actual:requestedCount
      }] });
    }

    const specializationFormulaId = specializationsEnabled
      ? String(grimoire.specializationFormulaId || "")
      : "";
    const rng = A.createRng(`${seed}:sigian-grimorio:${grimoire.id}`);
    const entriesBySchool = new Map();
    runtime.playableEntries.forEach(entry => {
      const school = entry.card?.school;
      if (!school) return;
      if (!entriesBySchool.has(school)) entriesBySchool.set(school, []);
      entriesBySchool.get(school).push(entry);
    });

    const selectedEntries = [];
    (grimoire.schoolIds || []).forEach(schoolId => {
      const needed = Number(targetBySchool[schoolId] || 0);
      const candidates = (entriesBySchool.get(schoolId) || []).filter(entry =>
        !specializationFormulaId || entry.formulaInstanceId !== specializationFormulaId
      );
      if (candidates.length < needed) {
        throw grimoireSelectionError({ blockers:[{
          code:"insufficient-school-pool",
          schoolId,
          expected:needed,
          actual:candidates.length
        }] });
      }
      selectedEntries.push(...rng.shuffle(candidates).slice(0, needed));
    });

    const baseCards = sortGrimoireCards(selectedEntries.map(entry => cloneRuntime(entry.card)));
    const baseFormulaIds = selectedEntries.map(entry => entry.formulaInstanceId);
    const finalPlayerCards = [...baseCards];
    let specializationEntry = null;
    if (specializationsEnabled) {
      specializationEntry = runtime.playableEntries.find(entry => entry.formulaInstanceId === specializationFormulaId) || null;
      if (!specializationEntry) {
        throw grimoireSelectionError({ blockers:[{
          code:"specialization-formula-runtime-missing",
          formulaInstanceId:specializationFormulaId
        }] });
      }
      finalPlayerCards.push({
        ...cloneRuntime(specializationEntry.card),
        sigianSpecializationGuaranteed:true
      });
    }

    let enemyHand = template.enemy.map(cloneRuntime);
    let enemyPowers = cloneRuntime(template.enemyPowers);
    let enemyDiagnostic = (template.diagnostics || []).find(item => item.side === "enemy") || template.diagnostics?.[1] || null;

    if (distributionMode === "mirror") {
      enemyHand = finalPlayerCards.map(cloneRuntime);
      enemyPowers = cloneRuntime(template.enemyPowers);
      enemyDiagnostic = {
        side:"enemy",
        distributionMode,
        baseOverlap:baseFormulaCount,
        baseCardCount:baseFormulaCount,
        finalCardCount:enemyHand.length,
        bySchool:cloneRuntime(targetBySchool),
        mirrored:true,
        generator:"sigian-grimoire-v1"
      };
    } else if (distributionMode === "arcane") {
      const standardIds = new Set(standardCards.map(card => String(card.id)));
      const enemyExcludedCardIds = baseCards
        .map(card => String(card.id || ""))
        .filter(cardId => standardIds.has(cardId));
      const enemyResult = A.generateRecoveredAstralHands(standardCards, {
        ...templateOptions,
        seed:`${seed}:sigian-enemy`,
        distributionMode:"free",
        enemyExcludedCardIds
      });
      enemyHand = enemyResult.enemy.map(cloneRuntime);
      enemyPowers = cloneRuntime(enemyResult.enemyPowers);
      enemyDiagnostic = (enemyResult.diagnostics || []).find(item => item.side === "enemy") || enemyResult.diagnostics?.[1] || null;
    }

    const baseIdSet = new Set(baseCards.map(card => String(card.id || "")));
    const schoolIndexById = new Map((A.SCHOOLS || []).map((school, index) => [school.id, index + 1]));
    const standardByGlobalId = new Map(standardCards.map(card => [
      Number(schoolIndexById.get(card.school) || 0) * 13 + Number(card.level || 0),
      card
    ]));
    const enemyBaseCards = enemyDiagnostic?.baseIds
      ? (enemyDiagnostic.baseIds || []).map(globalId => standardByGlobalId.get(Number(globalId)) || null).filter(Boolean)
      : [];
    const actualBaseOverlap = enemyBaseCards.filter(card => baseIdSet.has(String(card.id))).length;

    return {
      player:finalPlayerCards,
      enemy:enemyHand,
      playerPowers:cloneRuntime(template.playerPowers),
      enemyPowers,
      enemyTalent:options.enemyTalent || template.enemyTalent || "water",
      seed,
      recovered:false,
      distributionMode,
      sigianGrimoireId:grimoire.id,
      diagnostics:[
        {
          side:"player",
          distributionMode,
          baseOverlap:actualBaseOverlap,
          baseFormulaIds:cloneRuntime(baseFormulaIds),
          baseCardCount:baseCards.length,
          finalCardCount:finalPlayerCards.length,
          bySchool:cloneRuntime(targetBySchool),
          specializationFormulaId:specializationEntry?.formulaInstanceId || null,
          specializationGuaranteed:Boolean(specializationEntry),
          generationAttempt:playerShape?.generationAttempt || 1,
          generator:"sigian-grimoire-v1"
        },
        {
          ...(enemyDiagnostic ? cloneRuntime(enemyDiagnostic) : {}),
          side:"enemy",
          distributionMode,
          baseOverlap:actualBaseOverlap
        }
      ],
      runtime
    };
  };

  A.installSigianGrimoireRuntime = function installSigianGrimoireRuntime(engine, grimoireId) {
    if (!engine) throw new Error("Grimorio runtime: engine mancante.");
    const runtime = A.materializeSigianGrimoireForRuntime(grimoireId);
    runtime.formulas.forEach(formula => A.setSigianFormulaOverride(engine, formula));
    return runtime;
  };

  A.getSigianFormulaCatalogForEngine = function getSigianFormulaCatalogForEngine(engine) {
    return formulaCatalogForEngine(engine);
  };

  A.getSigianFormulaFor = function getSigianFormulaFor(engine, source) {
    return formulaFor(engine, source);
  };

  // null = this card has no explicit pair selection; [] = no legal pair.
  A.getSigianSwapChoices = function getSigianSwapChoices(engine, side, source) {
    const formula = formulaFor(engine, source);
    if (!formula?.sigils?.some(sigil => sigil.effect === A.SIGIAN_EFFECTS.SWAP_CREATURES)) return null;
    const enemySide = engine.getOpponentSide(side);
    const anyPair = engine.getFighter(side).power.air > engine.getFighter(enemySide).power.air;
    const refs = ["player", "enemy"].flatMap(owner => engine.getFighter(owner).board.flatMap((unit, slot) =>
      unit && unit.currentHealth > 0 ? [{ side: owner, slot, instanceId: unit.instanceId }] : []));
    const pairs = [];
    refs.forEach((first, index) => refs.slice(index + 1).forEach(second => {
      if (anyPair || first.side !== second.side) pairs.push([first, second]);
    }));
    return pairs;
  };

  A.setSigianFormulaOverride = function setSigianFormulaOverride(engine, formula) {
    if (!engine) throw new Error("Override Formula: engine mancante.");
    const validation = A.validateFormula?.(formula);
    if (!validation?.valid) {
      throw new Error(`Override Formula non valida: ${validation?.errors?.join("; ") || "errore sconosciuto"}.`);
    }
    if (formula.source?.mode !== A.SIGIAN_MIGRATION_MODES.NATIVE) {
      throw new Error("Override Formula: serve una Formula nativa.");
    }
    let overrides = engine.__sigianFormulaOverrides;
    if (!overrides) {
      overrides = Object.create(null);
      Object.defineProperty(engine, "__sigianFormulaOverrides", {
        configurable:true,
        enumerable:false,
        writable:true,
        value:overrides
      });
    }
    overrides[formula.id] = typeof A.deepClone === "function" ? A.deepClone(formula) : JSON.parse(JSON.stringify(formula));
    return overrides[formula.id];
  };

  A.clearSigianFormulaOverrides = function clearSigianFormulaOverrides(engine) {
    if (!engine?.__sigianFormulaOverrides) return;
    Object.keys(engine.__sigianFormulaOverrides).forEach(id => delete engine.__sigianFormulaOverrides[id]);
  };

  A.resolveSigianCardEffect = function resolveSigianCardEffect(engine, side, source, trigger, events, options = {}) {
    const output = Array.isArray(events) ? events : [];
    const formula = formulaFor(engine, source);
    if (!formula) throw new Error(`Router Sigian: Formula mancante per ${source?.id || "senza-id"}.`);
    const result = A.executeSigianFormula(engine, side, formula, { trigger, source, targets: options.targets });
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
    let additiveMultiplierBonus = 0;
    engine.getFighter(side).board.forEach(source => {
      if (!source || source.currentHealth <= 0) return;
      sigilsFor(engine, source, { effect: A.SIGIAN_EFFECTS.ATTACK_MULTIPLIER }).forEach(sigil => {
        const cfg = configOf(sigil);
        if (cfg.appliesTo !== "allied-creatures") return;
        const numerator = Number(cfg.numerator ?? 3);
        const denominator = Number(cfg.denominator ?? 2) || 1;
        additiveMultiplierBonus += (numerator - denominator) / denominator;
      });
    });
    if (additiveMultiplierBonus !== 0) amount = Math.trunc(amount * (1 + additiveMultiplierBonus));
    return Math.max(0, amount);
  };

  A.sigianSpellDamage = function sigianSpellDamage(engine, side, baseAmount) {
    let amount = Math.max(0, Math.trunc(baseAmount || 0));
    let additiveMultiplierBonus = 0;
    let flatBonus = 0;
    engine.getFighter(side).board.forEach(source => {
      if (!source || source.currentHealth <= 0) return;
      sigilsFor(engine, source, { effect: A.SIGIAN_EFFECTS.SPELL_DAMAGE_MULTIPLIER }).forEach(sigil => {
        const cfg = configOf(sigil);
        const numerator = Number(cfg.numerator ?? 3);
        const denominator = Number(cfg.denominator ?? 2) || 1;
        additiveMultiplierBonus += (numerator - denominator) / denominator;
      });
      sigilsFor(engine, source, { effect: A.SIGIAN_EFFECTS.SPELL_DAMAGE_BONUS }).forEach(sigil => {
        flatBonus += scaleAmount(engine, side, formulaFor(engine, source), sigil);
      });
    });
    if (additiveMultiplierBonus !== 0) amount = Math.trunc(amount * (1 + additiveMultiplierBonus));
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

  A.sigianHasInitiative = function sigianHasInitiative(engine, side, unit) {
    const board = engine.getFighter(side).board;
    if (!unit || unit.currentHealth <= 0 || !board.includes(unit)) return false;
    return board.some(source => {
      if (!source || source.currentHealth <= 0) return false;
      return sigilsFor(engine, source, { effect: A.SIGIAN_EFFECTS.INITIATIVE }).some(sigil => {
        const cfg = configOf(sigil);
        // Reject unsupported versions/shapes rather than interpreting future semantics.
        if (cfg.capabilityVersion !== 1 || sigil.kind !== A.SIGIAN_SIGIL_KINDS.PASSIVE
          || sigil.trigger !== "passive" || sigil.modifiers.length !== 1
          || Object.keys(cfg).some(key => !["capabilityVersion", "appliesTo"].includes(key))) return false;
        return cfg.appliesTo === "allied-creatures" || (cfg.appliesTo === "source" && source === unit);
      });
    });
  };

  A.sigianBeforeUnitAttack = function sigianBeforeUnitAttack(engine, side, slot, unit, events) {
    const formula = formulaFor(engine, unit);
    if (!formula) return;
    executeTrigger(engine, side, formula, "onBeforeAttack", { source: unit, slot }, events);
    engine.checkWinner();
  };

  function absorptionSigilFor(engine, sourceUnit, sourceCard) {
    const source = sourceUnit || sourceCard;
    if (!source) return null;
    const formula = formulaFor(engine, source);
    if (!formula) return null;
    const sigil = formula.sigils.find(item => item.effect === A.SIGIAN_EFFECTS.LIFESTEAL) || null;
    return sigil ? { formula, sigil } : null;
  }

  function resolveAbsorption(engine, sourceSide, sourceUnit, sourceCard, targetKind, actual, events) {
    if (actual <= 0) return 0;
    const found = absorptionSigilFor(engine, sourceUnit, sourceCard);
    if (!found) return 0;
    const cfg = configOf(found.sigil);
    if (cfg.onlyTargetKind && cfg.onlyTargetKind !== targetKind) return 0;
    const amount = scaleAmount(engine, sourceSide, found.formula, found.sigil, { damageDealt: actual });
    if (amount <= 0) return 0;

    if (cfg.healTarget === "self-hero") {
      return healHero(engine, sourceSide, amount, found.formula.id, events);
    }

    if (!sourceUnit || sourceUnit.currentHealth <= 0) return 0;
    const healed = healUnit(sourceUnit, amount);
    if (healed > 0) events?.push({ type: "astralVampireHeal", side: sourceSide, amount: healed, sourceId: sourceUnit.instanceId });
    return healed;
  }

  A.sigianOnUnitDamageDealt = function sigianOnUnitDamageDealt(engine, sourceSide, sourceUnit, sourceCard, actual, events) {
    return resolveAbsorption(engine, sourceSide, sourceUnit, sourceCard, "creature", actual, events);
  };

  A.sigianOnHeroDamageDealt = function sigianOnHeroDamageDealt(engine, sourceSide, sourceUnit, sourceCard, actual, events) {
    return resolveAbsorption(engine, sourceSide, sourceUnit, sourceCard, "hero", actual, events);
  };

  A.sigianOnUnitDamaged = function sigianOnUnitDamaged(engine, targetSide, targetSlot, targetUnit, sourceSide, sourceUnit, actual, events) {
    if (!targetUnit || targetUnit.currentHealth <= 0 || actual <= 0 || !sourceUnit) return;
    const formula = formulaFor(engine, targetUnit);
    if (!formula) return;
    executeTrigger(engine, targetSide, formula, "onDamaged", {
      source: targetUnit,
      slot: targetSlot,
      eventSourceSide: sourceSide,
      eventSourceUnit: sourceUnit,
      eventSourceSlot: engine.getFighter(sourceSide).board.indexOf(sourceUnit),
      damageDealt: actual
    }, events);
  };

  A.sigianResolveSelfDeath = function sigianResolveSelfDeath(engine, side, slot, unit, events) {
    const formula = formulaFor(engine, unit);
    if (!formula) return false;
    const sigils = formula.sigils.filter(sigil => sigil.trigger === "onSelfDeath" && sigil.effect === A.SIGIAN_EFFECTS.RESURRECT);
    for (const sigil of sigils) {
      if (!conditionPasses(engine, side, sigil)) continue;
      const cfg = configOf(sigil);
      const limited = cfg.maxRevives != null && Number.isFinite(Number(cfg.maxRevives));
      const maxRevives = limited ? Math.max(0, Math.trunc(Number(cfg.maxRevives))) : null;
      const used = Math.max(0, Math.trunc(Number(unit.sigianRebirthsUsed || 0)));
      if (limited && used >= maxRevives) continue;

      unit.currentHealth = unit.health;
      if (limited) unit.sigianRebirthsUsed = used + 1;
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
