(function (A) {
  "use strict";

  function cardUtility(engine, side, move) {
    if (move.type === "pass") return -0.4;
    const card = engine.getCard(side, move.cardId);
    if (!card) return -999;
    const cost = engine.effectiveCost(side, card);
    let score = -cost * 0.18;
    if (card.type === "creature") {
      const enemy = engine.getFighter(engine.getOpponentSide(side));
      const target = enemy.board[move.slot];
      score += card.attack * 1.25 + card.health * 0.62;
      if (!target) score += card.attack * 0.8;
      if (target && card.attack >= target.currentHealth) score += 5 + target.attack * 0.7;
      if (target && card.health <= target.attack) score -= 1.5;
    } else {
      (card.effects || []).forEach(effect => {
        const amount = Number(effect.amount || 0);
        if (effect.action === "damage_enemy_hero") score += amount * 2;
        if (effect.action === "damage_all_enemy_creatures") score += amount * 2.4;
        if (effect.action === "heal_self_hero") score += amount * 1.2;
        if (effect.action === "reduce_strongest_enemy_attack") score += amount * 1.3;
        if (effect.action === "buff_strongest_ally_health") score += amount;
      });
    }
    return score;
  }

  function resolveSimulation(engine, side) {
    while (!engine.state.gameOver) {
      const step = engine.attackNext(side);
      if (!step.ok || step.done) break;
    }
    engine.finishAttack(side);
  }

  function simulateMove(engine, side, move) {
    const clone = engine.clone();
    const result = clone.playMove(side, move);
    if (!result.ok) return { score: -9999, engine: clone };
    resolveSimulation(clone, side);
    return { score: clone.evaluate(side), engine: clone };
  }

  function opponentReplyPenalty(simulation, side, depth, difficulty, rng) {
    if (depth < 2 || simulation.state.gameOver) return 0;
    const opponent = simulation.getOpponentSide(side);
    if (opponent === "enemy" && simulation.state.phase === A.PHASES.ENEMY_THINK) simulation.beginEnemyPlay();
    if (opponent === "player" && simulation.state.phase !== A.PHASES.PLAYER_SELECT) return 0;

    const replies = simulation.legalMoves(opponent)
      .map(move => ({ move, base: cardUtility(simulation, opponent, move) }))
      .sort((a, b) => b.base - a.base)
      .slice(0, difficulty.candidateLimit);

    let best = -Infinity;
    replies.forEach(entry => {
      const clone = simulation.clone();
      if (opponent === "player" && entry.move.type === "play") {
        clone.state.phase = A.PHASES.PLAYER_TARGET;
        clone.state.pendingCardId = entry.move.cardId;
        const result = clone.playSelected(entry.move.slot);
        if (!result.ok) return;
      } else {
        const result = clone.playMove(opponent, entry.move);
        if (!result.ok) return;
      }
      resolveSimulation(clone, opponent);
      best = Math.max(best, clone.evaluate(opponent));
    });
    return Number.isFinite(best) ? best * 0.55 : 0;
  }

  A.chooseAiMove = function chooseAiMove(engine, side, difficultyId, seedSuffix) {
    const difficulty = A.DIFFICULTIES[difficultyId] || A.DIFFICULTIES.intermediate;
    const rng = A.createRng(`${engine.state.seed}-${engine.state.round}-${side}-${seedSuffix || difficultyId}`);
    const moves = engine.legalMoves(side);
    if (!moves.length) return { type: "pass" };
    if (difficulty.id === "novice") return rng.pick(moves);

    const ranked = moves.map(move => {
      const immediate = cardUtility(engine, side, move);
      let score = immediate;
      if (difficulty.searchDepth > 0) {
        const simulated = simulateMove(engine, side, move);
        score += simulated.score;
        score -= opponentReplyPenalty(simulated.engine, side, difficulty.searchDepth, difficulty, rng);
      }
      score += rng.next() * 0.015;
      return { move, score };
    }).sort((a, b) => b.score - a.score);

    const candidates = ranked.slice(0, Math.min(difficulty.candidateLimit, ranked.length));
    if (difficulty.errorRate > 0 && rng.next() < difficulty.errorRate && candidates.length > 1) {
      const index = 1 + rng.int(candidates.length - 1);
      return candidates[index].move;
    }
    return candidates[0].move;
  };

  A.scoreAiMoves = function scoreAiMoves(engine, side, difficultyId) {
    const difficulty = A.DIFFICULTIES[difficultyId] || A.DIFFICULTIES.intermediate;
    return engine.legalMoves(side).map(move => ({
      move,
      score: cardUtility(engine, side, move)
    })).sort((a, b) => b.score - a.score).slice(0, difficulty.candidateLimit);
  };
})(window.Arcane = window.Arcane || {});
