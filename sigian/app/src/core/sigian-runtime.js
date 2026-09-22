(function (A) {
  "use strict";

  function modifier(sigil, kind) {
    return (sigil.modifiers || []).find(item => item.kind === kind) || null;
  }

  function constantAmount(sigil) {
    const scale = modifier(sigil, A.SIGIAN_MODIFIER_KINDS.SCALE);
    if (!scale || scale.params?.mode !== A.SIGIAN_SCALE_MODES.CONSTANT) {
      throw new Error(`Sigillo ${sigil.id}: scaling non supportato nella foundation.`);
    }
    const value = Number(scale.params.value);
    if (!Number.isFinite(value)) throw new Error(`Sigillo ${sigil.id}: valore costante non valido.`);
    return Math.trunc(value);
  }

  function resolveTarget(engine, side, sigil) {
    const target = modifier(sigil, A.SIGIAN_MODIFIER_KINDS.TARGET);
    if (!target) throw new Error(`Sigillo ${sigil.id}: target mancante.`);
    const targetSide = target.params?.side === A.SIGIAN_TARGET_SIDES.ENEMY
      ? engine.getOpponentSide(side)
      : side;
    return {
      side: targetSide,
      kind: target.params?.kind,
      school: target.params?.school || null
    };
  }

  function sourceOptions(formula, card) {
    return {
      sourceKind: formula.type === "spell" ? "spell" : "effect",
      sourceCard: card,
      reason: formula.id
    };
  }

  function healHero(engine, side, amount, reason, events) {
    const fighter = engine.getFighter(side);
    const before = Math.max(0, Number(fighter.hp || 0));
    fighter.hp = before + Math.max(0, amount);
    const healed = fighter.hp - before;
    if (healed > 0) events.push({ type: "astralHealHero", side, amount: healed, reason, hp: fighter.hp });
  }

  function healCreatures(engine, side, amount, reason, events) {
    engine.getFighter(side).board.forEach((unit, slot) => {
      if (!unit || unit.currentHealth <= 0) return;
      const before = Math.max(0, Number(unit.currentHealth || 0));
      const max = Math.max(before, Number(unit.health || before));
      unit.currentHealth = Math.min(max, before + Math.max(0, amount));
      const healed = unit.currentHealth - before;
      if (healed > 0) {
        events.push({
          type: "astralUnitHeal",
          side,
          slot,
          cardId: unit.id,
          instanceId: unit.instanceId,
          amount: healed,
          health: unit.currentHealth,
          reason
        });
      }
    });
  }

  function changePower(engine, side, school, delta, reason, events) {
    if (!school || !A.SCHOOLS.some(item => item.id === school)) {
      throw new Error(`Scuola Potere non valida: ${school || "mancante"}.`);
    }
    const fighter = engine.getFighter(side);
    const before = Number(fighter.power[school] || 0);
    fighter.power[school] = Math.max(0, Math.min(engine.rules.maxPower, before + delta));
    const applied = fighter.power[school] - before;
    if (applied !== 0) {
      events.push({
        type: "astralPowerChange",
        side,
        school,
        delta: applied,
        value: fighter.power[school],
        reason
      });
    }
  }

  function executeEffect(engine, side, formula, sigil, events) {
    const amount = constantAmount(sigil);
    const target = resolveTarget(engine, side, sigil);
    const card = A.materializeLegacyCardFromFormula(formula);
    const options = sourceOptions(formula, card);

    switch (sigil.effect) {
      case A.SIGIAN_EFFECTS.DAMAGE:
        if (amount < 0) throw new Error(`Sigillo ${sigil.id}: danno negativo non supportato.`);
        if (target.kind === A.SIGIAN_TARGET_KINDS.HERO) {
          A.astralApplyHeroDamage(engine, side, target.side, amount, options, events);
          return;
        }
        if (target.kind === A.SIGIAN_TARGET_KINDS.CREATURES) {
          engine.getFighter(target.side).board.forEach((unit, slot) => {
            if (unit) A.astralApplyUnitDamage(engine, side, target.side, slot, amount, options, events);
          });
          return;
        }
        break;

      case A.SIGIAN_EFFECTS.HEAL:
        if (amount < 0) throw new Error(`Sigillo ${sigil.id}: cura negativa non supportata.`);
        if (target.kind === A.SIGIAN_TARGET_KINDS.HERO) {
          healHero(engine, target.side, amount, formula.id, events);
          return;
        }
        if (target.kind === A.SIGIAN_TARGET_KINDS.CREATURES) {
          healCreatures(engine, target.side, amount, formula.id, events);
          return;
        }
        break;

      case A.SIGIAN_EFFECTS.POWER:
        if (target.kind === A.SIGIAN_TARGET_KINDS.POWER) {
          changePower(engine, target.side, target.school, amount, formula.id, events);
          return;
        }
        break;

      case A.SIGIAN_EFFECTS.SUMMON:
      case A.SIGIAN_EFFECTS.PASSIVE:
        throw new Error(`Sigillo ${sigil.id}: effetto ${sigil.effect} definito ma non ancora eseguibile nella foundation.`);
      default:
        break;
    }

    throw new Error(`Sigillo ${sigil.id}: combinazione effetto/target non supportata.`);
  }

  A.executeSigianFormula = function executeSigianFormula(engine, side, formula, options = {}) {
    if (!engine || !["player", "enemy"].includes(side)) throw new Error("Esecuzione Formula: engine o lato non valido.");
    if (formula?.source?.mode !== A.SIGIAN_MIGRATION_MODES.NATIVE) {
      throw new Error(`Formula ${formula?.id || "senza-id"} non nativa.`);
    }
    const validation = A.validateFormula(formula);
    if (!validation.valid) throw new Error(`Formula ${formula.id} non valida: ${validation.errors.join("; ")}`);

    const trigger = options.trigger || (formula.type === "creature" ? "onSummon" : "onPlay");
    const events = [];
    formula.sigils
      .filter(sigil => sigil.trigger === trigger)
      .forEach(sigil => executeEffect(engine, side, formula, sigil, events));

    if (typeof A.astralCleanupDeaths === "function") A.astralCleanupDeaths(engine, events, side);
    return { events };
  };

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

  A.getSigianFormulaCatalogForEngine = function getSigianFormulaCatalogForEngine(engine) {
    return formulaCatalogForEngine(engine);
  };

  A.resolveSigianCardEffect = function resolveSigianCardEffect(engine, side, source, trigger, events) {
    const output = Array.isArray(events) ? events : [];
    const cardId = source?.id;
    if (!cardId) throw new Error("Router Sigian: carta senza id.");
    if (!["onSummon", "onPlay"].includes(trigger)) {
      throw new Error(`Router Sigian: trigger non supportato ${trigger}.`);
    }

    const catalog = formulaCatalogForEngine(engine);
    const formula = catalog?.byId?.[cardId] || null;

    if (formula?.source?.mode === A.SIGIAN_MIGRATION_MODES.NATIVE) {
      const result = A.executeSigianFormula(engine, side, formula, { trigger });
      output.push(...result.events);
      return {
        mode: A.SIGIAN_MIGRATION_MODES.NATIVE,
        formulaId: formula.id,
        events: result.events
      };
    }

    if (trigger === "onSummon" && typeof A.astralOnSummon === "function") {
      A.astralOnSummon(engine, side, source, output);
    } else if (trigger === "onPlay" && typeof A.astralOnSpell === "function") {
      A.astralOnSpell(engine, side, source, output);
    } else {
      throw new Error(`Router Sigian: dispatcher legacy mancante per ${cardId}/${trigger}.`);
    }

    return {
      mode: formula?.source?.mode || A.SIGIAN_MIGRATION_MODES.LEGACY_DELEGATED,
      formulaId: formula?.id || cardId,
      events: output
    };
  };

})(window.Arcane = window.Arcane || {});
