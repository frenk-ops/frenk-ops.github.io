(function (A) {
  "use strict";

  const SCHOOL_IDS = ["fire", "water", "air", "nature", "death"];
  const LEVEL_BY_ID = Object.freeze({ novice: 1, intermediate: 2, advanced: 3, master: 4, grandmaster: 5 });

  function truncDiv(value, divisor) {
    return Math.trunc(value / divisor);
  }

  function cardMeta(card) {
    return A.ASTRAL_CARD_AI_METADATA?.[card?.id] || null;
  }

  function sameOriginalCard(a, b) {
    const am = cardMeta(a);
    const bm = cardMeta(b);
    return Boolean(am && bm && am.schoolIndex === bm.schoolIndex && am.cardNumber === bm.cardNumber);
  }

  function originalDifficultyLevel(levelOrId) {
    if (Number.isInteger(levelOrId)) return Math.max(1, Math.min(5, levelOrId));
    return LEVEL_BY_ID[levelOrId] || 3;
  }

  function heroLifeCurve(life) {
    const hp = Math.trunc(life);
    if (hp <= 5) return hp * 80;
    if (hp <= 10) return 400 + (hp - 5) * 50;
    if (hp <= 15) return 650 + (hp - 10) * 30;
    if (hp <= 20) return 800 + (hp - 15) * 20;
    if (hp <= 30) return 900 + (hp - 20) * 15;
    if (hp <= 40) return 1050 + (hp - 30) * 10;
    if (hp <= 50) return 1150 + (hp - 40) * 5;
    if (hp <= 150) return 1200 + (hp - 50);
    if (hp <= 750) return 1300 + truncDiv(hp - 150, 2);
    return 1600 + truncDiv(hp - 750, 3);
  }

  function powerWeight(level, engine) {
    if (level >= 1 && level <= 4) return 50 + level * 5;
    if (level === 5) return 65;
    const totalHp = engine.state.player.hp + engine.state.enemy.hp;
    return truncDiv(totalHp, 2) + 75;
  }

  function difficultyRandomFactor(level, rng) {
    if (level === 1) return rng.int(8) + 2;
    if (level === 2) return rng.int(4) + 3;
    if (level === 3) return rng.int(4) + 15;
    if (level === 4) return rng.int(3) + 50;
    return 1;
  }

  function effectiveOriginalAttack(fighter, unit) {
    const meta = cardMeta(unit);
    let attack = meta?.baseAttack ?? unit.attack ?? 0;
    if (attack === -1) attack = fighter.power[unit.school] || 0;
    const warlords = fighter.board.filter(candidate => candidate?.id === "astral_fire_09").length;
    return truncDiv(attack * (warlords + 2), 2);
  }

  function duplicateCount(fighter, unit, excludedSlot) {
    return fighter.board.reduce((count, candidate, index) => {
      if (!candidate || index === excludedSlot) return count;
      return count + (sameOriginalCard(candidate, unit) ? 1 : 0);
    }, 0);
  }

  function handPowerTarget(fighter, schoolId) {
    let maximum = 0;
    fighter.hand.forEach(card => {
      if (card.school !== schoolId) return;
      maximum = Math.max(maximum, cardMeta(card)?.aiPowerTarget || card.level || 0);
    });
    return maximum;
  }

  function ongoingPowerValue(meta) {
    let value = 0;
    if (meta.powerSchool1 > 0) value += meta.powerDelta1 * 20;
    else if (meta.powerSchool1 < 0) value += (-meta.powerDelta1) * 18;
    if (meta.powerSchool2 > 0) value += meta.powerDelta2 * 20;
    else if (meta.powerSchool2 < 0) value += (-meta.powerDelta2) * 18;
    return value;
  }

  function specializationPowerBonus(fighter) {
    const multiplier = Math.max(1, Number(fighter.astralRankMultiplier || 1));
    const weight = fighter.talent === "fire" ? 200 : 100;
    if (!SCHOOL_IDS.includes(fighter.talent)) return 0;
    return (fighter.power[fighter.talent] || 0) * multiplier * weight;
  }

  function evaluateCreature(engine, side, unit, slot, level, breakdown) {
    const fighter = engine.getFighter(side);
    const opponent = engine.getFighter(engine.getOpponentSide(side));
    const meta = cardMeta(unit);
    if (!meta) {
      const fallback = (unit.currentHealth || 0) * 10 * ((unit.attack || 0) * 10);
      breakdown.creatures.push({ cardId: unit.id, slot, value: fallback, recovered: false });
      return fallback;
    }

    let attackFactor = effectiveOriginalAttack(fighter, unit) * 10;
    let healthFactor = Math.trunc((unit.currentHealth || 0) * 10);
    if (healthFactor > 300) healthFactor = truncDiv(healthFactor - 300, 2) + 300;
    healthFactor += truncDiv(meta.maxHealth * 10, 4);

    if (level > 4 && slot === 4 && ((meta.schoolIndex === 4 && meta.cardNumber === 2) || (meta.schoolIndex === 5 && meta.cardNumber === 4))) {
      healthFactor += 1;
    }

    const duplicateTotal = duplicateCount(fighter, unit, slot);
    if ((meta.schoolIndex === 3 || meta.schoolIndex === 5) && meta.cardNumber === 1) {
      for (let index = 0; index < duplicateTotal; index += 1) attackFactor = truncDiv(attackFactor, 2);
    }

    let directBonus = 0;
    if (meta.schoolIndex === 3 && meta.cardNumber === 7) {
      const firePower = fighter.power.fire || 0;
      if (firePower >= 10) directBonus += 25000;
      else if (level > 4) attackFactor += firePower - 8;
    }

    if (meta.schoolIndex === 2 && meta.cardNumber === 6 && fighter.hp < 30) {
      attackFactor += 30 - fighter.hp;
    }

    if (meta.schoolIndex === 2 && meta.cardNumber === 4 && (opponent.power.water || 0) > (fighter.power.water || 0)) {
      attackFactor -= 20;
    }

    if (meta.multiTarget) {
      attackFactor = truncDiv(attackFactor * 26, 10);
      if (opponent.passives?.includes("fire_aura")) attackFactor -= 25;
    }

    attackFactor += meta.abilityCode * 10;

    let persistentValue = ongoingPowerValue(meta);
    if (persistentValue > 0 && meta.schoolIndex < 5) {
      for (let index = 0; index < duplicateTotal; index += 1) persistentValue = truncDiv(persistentValue, 2);
    }
    attackFactor += persistentValue;

    const value = directBonus + healthFactor * attackFactor;
    breakdown.creatures.push({
      cardId: unit.id,
      name: unit.name,
      slot,
      value,
      directBonus,
      attackFactor,
      healthFactor,
      persistentValue,
      duplicateTotal,
      recovered: true
    });
    return value;
  }

  function evaluateSideRaw(engine, side, currentSide, level) {
    const fighter = engine.getFighter(side);
    const breakdown = { hero: 0, powers: 0, specialization: 0, creatures: [], totalBeforeNoise: 0 };

    let total = heroLifeCurve(fighter.hp) * 65;
    if (level === 1) {
      total = side === currentSide ? total * 3 : truncDiv(total, 3);
    }
    breakdown.hero = total;

    const weight = powerWeight(level, engine);
    SCHOOL_IDS.forEach(schoolId => {
      const power = Math.trunc(fighter.power[schoolId] || 0);
      let contribution = power * weight * 10;

      if (level > 4) {
        const maximumUsefulPower = handPowerTarget(fighter, schoolId);
        if (power > maximumUsefulPower + 1) {
          contribution -= truncDiv(power * weight * 9, 2);
        }

        const gain = Math.trunc(fighter.powerGain[schoolId] || 0);
        let curve = power - 5 + gain * 2;
        if (gain === 0) curve -= 2;
        if (curve > 10) curve = 20 - curve;
        if (curve > 8) curve = 8;
        contribution += power * curve * 80;
      }
      breakdown.powers += contribution;
      total += contribution;
    });

    const specialization = specializationPowerBonus(fighter);
    breakdown.specialization = specialization;
    total += specialization;

    fighter.board.forEach((unit, slot) => {
      if (unit) total += evaluateCreature(engine, side, unit, slot, level, breakdown);
    });

    breakdown.totalBeforeNoise = total;
    return { value: total, breakdown };
  }

  function evaluateSide(engine, side, currentSide, level, rng) {
    const result = evaluateSideRaw(engine, side, currentSide, level);
    const factor = difficultyRandomFactor(level, rng);
    result.breakdown.difficultyFactor = factor;
    result.value *= factor;
    result.breakdown.totalAfterNoise = result.value;
    return result;
  }

  function resolveCurrentAttack(engine, side) {
    while (!engine.state.gameOver) {
      const step = engine.attackNext(side);
      if (!step.ok || step.done) break;
    }
    if (!engine.state.gameOver) engine.finishAttack(side);
  }

  function forcePassAndAttack(engine, side) {
    if (engine.state.gameOver) return false;
    if (side === "enemy" && engine.state.phase === A.PHASES.ENEMY_THINK) engine.beginEnemyPlay();
    if (side === "player" && engine.state.phase !== A.PHASES.PLAYER_SELECT) return false;
    const result = engine.pass(side);
    if (!result.ok) return false;
    resolveCurrentAttack(engine, side);
    return true;
  }

  function simulateRecoveredHorizon(engine, side, level) {
    resolveCurrentAttack(engine, side);
    const targetAttackPhases = level > 4 ? 3 : 2;
    let phases = 1;
    let nextSide = engine.getOpponentSide(side);
    while (!engine.state.gameOver && phases < targetAttackPhases) {
      if (!forcePassAndAttack(engine, nextSide)) break;
      phases += 1;
      nextSide = engine.getOpponentSide(nextSide);
    }
    return phases;
  }

  function moveOrder(engine, side, move) {
    if (move.type === "pass") return 999999;
    const card = engine.getCard(side, move.cardId);
    const meta = cardMeta(card);
    return ((meta?.schoolIndex || 9) * 1000) + ((meta?.cardNumber || card?.level || 99) * 10) + ((move.slot ?? 0) + 1);
  }

  A.ASTRAL_AI_RE = Object.freeze({
    bestMoveAddress: "0x44C3C8",
    boardEvaluatorAddress: "0x44BB14",
    sideDeltaEvaluatorAddress: "0x44C398",
    difficultyReaderAddress: "0x4529C0",
    attackEvaluatorAddress: "0x447A4C",
    stateSnapshotDwords: 0x35,
    scoreMatrixBytes: 0x514,
    scoreMatrixShape: "5 schools × 13 cards × 5 lanes × 4 bytes",
    observations: Object.freeze([
      "BestMove snapshots 0x35 DWORDs of duel state before testing candidates.",
      "Candidate scores are stored in a 5×13×5 integer matrix.",
      "Levels 1-4 simulate two combat passes; level 5 simulates three.",
      "The evaluator uses a nonlinear hero-life curve, power valuation, hand-aware power penalties and per-creature formulas.",
      "Difficulty 1-4 multiply each side score by exact random factors; level 5 is deterministic.",
      "A zeroed output triple represents passing."
    ])
  });

  A.astralHeroLifeCurve = heroLifeCurve;
  A.astralDifficultyRandomFactor = difficultyRandomFactor;
  A.astralOriginalDifficultyLevel = originalDifficultyLevel;

  A.evaluateRecoveredAstralSide = function evaluateRecoveredAstralSide(engine, side, currentSide, levelOrId, seed) {
    const level = originalDifficultyLevel(levelOrId);
    const rng = A.createRng(seed || `${engine.state.seed}-eval-${side}-${level}`);
    return evaluateSide(engine, side, currentSide || side, level, rng);
  };

  A.evaluateRecoveredAstralDelta = function evaluateRecoveredAstralDelta(engine, side, levelOrId, rngOrSeed) {
    const level = originalDifficultyLevel(levelOrId);
    const rng = typeof rngOrSeed === "object" && rngOrSeed?.int ? rngOrSeed : A.createRng(rngOrSeed || `${engine.state.seed}-delta-${side}-${level}`);
    const opponent = engine.getOpponentSide(side);
    // The original function evaluates the opponent first, then the current side.
    const enemyValue = evaluateSide(engine, opponent, side, level, rng);
    const selfValue = evaluateSide(engine, side, side, level, rng);
    return {
      score: selfValue.value - enemyValue.value,
      self: selfValue,
      opponent: enemyValue,
      level
    };
  };

  A.scoreRecoveredAstralMoves = function scoreRecoveredAstralMoves(engine, side, levelOrId, seedSuffix) {
    const level = originalDifficultyLevel(levelOrId);
    const rng = A.createRng(`${engine.state.seed}-${engine.state.round}-${side}-${seedSuffix || level}-astral-re`);
    const moves = engine.legalMoves(side).slice().sort((a, b) => moveOrder(engine, side, a) - moveOrder(engine, side, b));

    return moves.map(move => {
      const clone = engine.clone();
      const result = clone.playMove(side, move);
      if (!result.ok) return { move, score: -Infinity, legal: false, level };
      const simulatedAttackPhases = simulateRecoveredHorizon(clone, side, level);
      const evaluation = A.evaluateRecoveredAstralDelta(clone, side, level, rng);
      return {
        move,
        score: evaluation.score,
        legal: true,
        level,
        simulatedAttackPhases,
        evaluation
      };
    }).sort((a, b) => b.score - a.score || moveOrder(engine, side, a.move) - moveOrder(engine, side, b.move));
  };

  A.chooseRecoveredAstralMove = function chooseRecoveredAstralMove(engine, side, levelOrId, seedSuffix) {
    const ranked = A.scoreRecoveredAstralMoves(engine, side, levelOrId, seedSuffix);
    const best = ranked.find(entry => entry.legal && Number.isFinite(entry.score));
    return best ? { ...best.move, source: "astral-re-v0.17", recoveredLevel: best.level, recoveredScore: best.score } : { type: "pass", source: "astral-re-v0.17" };
  };
})(window.Arcane = window.Arcane || {});
