(function (A) {
  "use strict";

  const TEMPORAL_ORACLE_SCHEMA_VERSION = 2;
  const DEFAULT_HORIZONS = Object.freeze([0, 1, 2, 3]);
  const ORACLE_AI_LEVEL = 5;
  const DEFAULT_SCORE_DIVISOR = 1000;

  function clone(value) {
    if (typeof A.deepClone === "function") return A.deepClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function finite(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function quantile(values, q) {
    const sorted = (values || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const position = (sorted.length - 1) * Math.max(0, Math.min(1, Number(q)));
    const low = Math.floor(position);
    const high = Math.ceil(position);
    if (low === high) return sorted[low];
    return sorted[low] + ((sorted[high] - sorted[low]) * (position - low));
  }

  function boardUnit(card, owner, slot, healthRatio) {
    const health = Math.max(1, Number(card.health || card.hp || 1));
    return {
      ...clone(card),
      health,
      hp:health,
      currentHealth:Math.max(1, Math.min(health, Math.round(health * Number(healthRatio ?? 1)))),
      owner,
      instanceId:`temporal-${owner}-${slot}-${card.id}`,
      summonedOnOwnerTurn:0,
      astralPowerModifiers:[]
    };
  }

  function scenarioById(id) {
    return (A.SIGIAN_VALUE_ORACLE_SCENARIOS || []).find(item => item.id === id) || null;
  }

  function createScenarioEngine(cards, card, scenarioInput) {
    const scenario = typeof scenarioInput === "string" ? scenarioById(scenarioInput) : scenarioInput;
    if (!scenario) throw new Error(`Scenario Temporal Oracle sconosciuto: ${scenarioInput}.`);
    const byId = Object.fromEntries((cards || []).map(item => [item.id, item]));
    const engine = new A.GameEngine({
      cards,
      rules:A.ASTRAL_ORIGINAL_RULESET,
      seed:`temporal-oracle-${card.id}-${scenario.id}`,
      hands:{
        player:(cards || []).map(clone),
        enemy:(cards || []).map(clone)
      },
      playerTalent:"neutral",
      enemyTalent:"neutral",
      playerAstralAbilities:[],
      enemyAstralAbilities:[]
    });

    engine.state.player.hp = scenario.playerHp;
    engine.state.enemy.hp = scenario.enemyHp;
    engine.state.player.maxHp = A.ASTRAL_ORIGINAL_RULESET.startingHp;
    engine.state.enemy.maxHp = A.ASTRAL_ORIGINAL_RULESET.startingHp;

    A.SCHOOLS.forEach(school => {
      engine.state.player.power[school.id] = Number(scenario.playerPower);
      engine.state.enemy.power[school.id] = Number(scenario.enemyPower);
      engine.state.player.powerGain[school.id] = 1;
      engine.state.enemy.powerGain[school.id] = 1;
    });

    const liveCard = engine.getCard("player", card.id);
    const cost = engine.effectiveCost("player", liveCard);
    engine.state.player.power[card.school] = Math.max(cost + 1, Number(scenario.playerPower));

    (scenario.ownBoard || []).forEach(seed => {
      const source = byId[seed.cardId];
      if (!source || seed.slot < 0 || seed.slot >= engine.rules.boardSize) return;
      engine.state.player.board[seed.slot] = boardUnit(source, "player", seed.slot, seed.healthRatio);
    });
    (scenario.enemyBoard || []).forEach(seed => {
      const source = byId[seed.cardId];
      if (!source || seed.slot < 0 || seed.slot >= engine.rules.boardSize) return;
      engine.state.enemy.board[seed.slot] = boardUnit(source, "enemy", seed.slot, seed.healthRatio);
    });

    engine.state.phase = A.PHASES.PLAYER_SELECT;
    engine.state.activeSide = "player";
    engine.state.player.flags.cardPlayedThisTurn = false;
    return { engine, scenario, cost };
  }

  function moveFor(engine, card) {
    if (card.type === "spell") return { type:"play", cardId:card.id, slot:null };
    const slot = engine.state.player.board.findIndex(unit => !unit);
    return { type:"play", cardId:card.id, slot };
  }

  function score(engine, side, seed) {
    if (typeof A.evaluateRecoveredAstralDelta !== "function") {
      throw new Error("Temporal Oracle richiede evaluateRecoveredAstralDelta.");
    }
    return A.evaluateRecoveredAstralDelta(engine, side, ORACLE_AI_LEVEL, seed).score;
  }

  function sideFromPhase(engine) {
    const phase = engine.state.phase;
    if ([A.PHASES.PLAYER_SELECT, A.PHASES.PLAYER_TARGET, A.PHASES.PLAYER_ATTACK].includes(phase)) return "player";
    if ([A.PHASES.ENEMY_THINK, A.PHASES.ENEMY_PLAY, A.PHASES.ENEMY_ATTACK].includes(phase)) return "enemy";
    return engine.state.activeSide === "enemy" ? "enemy" : "player";
  }

  function resolveAttack(engine, side) {
    const attackPhase = side === "player" ? A.PHASES.PLAYER_ATTACK : A.PHASES.ENEMY_ATTACK;
    if (engine.state.phase !== attackPhase) return { ok:false, completedSide:null, reason:"not-attack-phase" };
    while (!engine.state.gameOver) {
      const step = engine.attackNext(side);
      if (!step.ok) return { ok:false, completedSide:null, reason:step.reason || "attack-step-failed" };
      if (step.done) break;
    }
    if (engine.state.gameOver) return { ok:true, completedSide:side, gameOver:true };
    const finished = engine.finishAttack(side);
    return {
      ok:Boolean(finished?.ok),
      completedSide:side,
      gameOver:Boolean(engine.state.gameOver),
      reason:finished?.reason || null
    };
  }

  function completeActiveTurnPassOnly(engine) {
    if (engine.state.gameOver) return { ok:false, completedSide:null, gameOver:true, reason:"game-over" };
    const side = sideFromPhase(engine);
    const attackPhase = side === "player" ? A.PHASES.PLAYER_ATTACK : A.PHASES.ENEMY_ATTACK;

    if (engine.state.phase === attackPhase) return resolveAttack(engine, side);

    if (side === "enemy" && engine.state.phase === A.PHASES.ENEMY_THINK) {
      if (!engine.beginEnemyPlay()) return { ok:false, completedSide:null, reason:"enemy-play-transition-failed" };
    }

    const result = engine.pass(side);
    if (!result?.ok) return { ok:false, completedSide:null, reason:result?.reason || "pass-failed" };
    return resolveAttack(engine, side);
  }

  function advanceOwnerTurns(engine, ownerSide, turns, options = {}) {
    const target = Math.max(0, Math.trunc(finite(turns, 0)));
    const maxCompletedTurns = Math.max(target * 4 + 4, Math.trunc(finite(options.maxCompletedTurns, 32)));
    let ownerCompleted = 0;
    let totalCompleted = 0;
    const trace = [];

    while (!engine.state.gameOver && ownerCompleted < target && totalCompleted < maxCompletedTurns) {
      const step = completeActiveTurnPassOnly(engine);
      trace.push({
        ok:step.ok,
        completedSide:step.completedSide,
        phase:engine.state.phase,
        round:engine.state.round,
        turnCounters:clone(engine.state.turnCounters || {}),
        gameOver:Boolean(engine.state.gameOver),
        reason:step.reason || null
      });
      if (!step.ok) break;
      if (step.completedSide) {
        totalCompleted += 1;
        if (step.completedSide === ownerSide) ownerCompleted += 1;
      }
    }

    return {
      requestedOwnerTurns:target,
      completedOwnerTurns:ownerCompleted,
      totalCompletedTurns:totalCompleted,
      reached:ownerCompleted >= target,
      gameOver:Boolean(engine.state.gameOver),
      trace
    };
  }

  function checkpoint(control, treated, side, ownerSide, horizon, seedBase, scoreDivisor) {
    const controlAdvance = advanceOwnerTurns(control, ownerSide, horizon);
    const treatedAdvance = advanceOwnerTurns(treated, ownerSide, horizon);
    const controlScore = score(control, side, `${seedBase}-h${horizon}-control`);
    const treatedScore = score(treated, side, `${seedBase}-h${horizon}-treated`);
    const marginal = treatedScore - controlScore;
    const divisor = Math.max(1, finite(scoreDivisor, DEFAULT_SCORE_DIVISOR));
    return {
      horizon,
      ownerSide,
      controlScore,
      treatedScore,
      marginal,
      scoreDivisor:divisor,
      controlOracleUnits:controlScore / divisor,
      treatedOracleUnits:treatedScore / divisor,
      marginalOracleUnits:marginal / divisor,
      reached:Boolean(controlAdvance.reached && treatedAdvance.reached),
      controlAdvance,
      treatedAdvance,
      controlGameOver:Boolean(control.state.gameOver),
      treatedGameOver:Boolean(treated.state.gameOver)
    };
  }

  A.SIGIAN_TEMPORAL_ORACLE_SCHEMA_VERSION = TEMPORAL_ORACLE_SCHEMA_VERSION;
  A.SIGIAN_TEMPORAL_ORACLE_DEFAULT_HORIZONS = DEFAULT_HORIZONS;
  A.SIGIAN_TEMPORAL_ORACLE_DEFAULT_SCORE_DIVISOR = DEFAULT_SCORE_DIVISOR;

  A.advanceSigianTemporalOwnerTurns = function advanceSigianTemporalOwnerTurns(engine, ownerSide, turns, options = {}) {
    if (!engine?.state || !["player", "enemy"].includes(ownerSide)) {
      throw new Error("Temporal Oracle: engine/ownerSide non validi.");
    }
    return advanceOwnerTurns(engine, ownerSide, turns, options);
  };

  A.evaluateSigianTemporalCardWithRecoveredOracle = function evaluateSigianTemporalCardWithRecoveredOracle(
    cards,
    card,
    scenarioInput,
    options = {}
  ) {
    const focusSide = options.focusSide === "enemy" ? "enemy" : "player";
    const ownerSide = options.ownerSide === "enemy" ? "enemy" : "player";
    const scoreDivisor = Math.max(1, finite(options.scoreDivisor, DEFAULT_SCORE_DIVISOR));
    const horizons = [...new Set((options.horizons || DEFAULT_HORIZONS)
      .map(value => Math.max(0, Math.trunc(finite(value, 0)))))]
      .sort((a, b) => a - b);

    const setup = createScenarioEngine(cards, card, scenarioInput);
    const controlBase = setup.engine.clone();
    const treatedNetBase = setup.engine.clone();

    const controlPass = controlBase.pass("player");
    if (!controlPass?.ok) {
      return { schemaVersion:TEMPORAL_ORACLE_SCHEMA_VERSION, playable:false, reason:controlPass?.reason || "control-pass-failed" };
    }

    const liveCard = treatedNetBase.getCard("player", card.id);
    const played = treatedNetBase.playMove("player", moveFor(treatedNetBase, liveCard));
    if (!played?.ok) {
      return { schemaVersion:TEMPORAL_ORACLE_SCHEMA_VERSION, playable:false, reason:played?.reason || "play-failed" };
    }

    const treatedGrossBase = treatedNetBase.clone();
    treatedGrossBase.state.player.power[card.school] = Math.min(
      treatedGrossBase.rules.maxPower,
      finite(treatedGrossBase.state.player.power[card.school], 0) + setup.cost
    );

    const seedBase = `temporal-score-${card.id}-${setup.scenario.id}-${ownerSide}`;
    const net = horizons.map(horizon => checkpoint(
      controlBase.clone(),
      treatedNetBase.clone(),
      focusSide,
      ownerSide,
      horizon,
      `${seedBase}-net`,
      scoreDivisor
    ));
    const gross = horizons.map(horizon => checkpoint(
      controlBase.clone(),
      treatedGrossBase.clone(),
      focusSide,
      ownerSide,
      horizon,
      `${seedBase}-gross`,
      scoreDivisor
    ));

    return {
      schemaVersion:TEMPORAL_ORACLE_SCHEMA_VERSION,
      status:"diagnostic",
      policy:"pass-only-with-normal-attacks",
      playable:true,
      cardId:card.id,
      scenarioId:setup.scenario.id,
      printedLevel:Number(card.level || card.cost || 0),
      cost:setup.cost,
      focusSide,
      ownerSide,
      scoreDivisor,
      rawScoreUnit:"recovered-oracle-score",
      normalizedScoreUnit:"oracle-units",
      eventCount:Array.isArray(played.events) ? played.events.length : 0,
      horizons,
      net,
      gross
    };
  };

  A.summarizeSigianTemporalOracle = function summarizeSigianTemporalOracle(rows, options = {}) {
    const q = Number.isFinite(Number(options.quantile)) ? Number(options.quantile) : 0.75;
    const grouped = {};
    (rows || []).filter(row => row?.playable).forEach(row => {
      const bucket = grouped[row.cardId] ||= { cardId:row.cardId, printedLevel:row.printedLevel, scenarios:0, horizons:{} };
      bucket.scenarios += 1;
      (row.gross || []).forEach(point => {
        const h = bucket.horizons[point.horizon] ||= { rawValues:[], oracleValues:[], reached:0, total:0 };
        h.rawValues.push(point.marginal);
        h.oracleValues.push(point.marginalOracleUnits);
        h.total += 1;
        if (point.reached) h.reached += 1;
      });
    });

    return Object.values(grouped).map(bucket => ({
      cardId:bucket.cardId,
      printedLevel:bucket.printedLevel,
      scenarios:bucket.scenarios,
      horizons:Object.fromEntries(Object.entries(bucket.horizons).map(([h, data]) => [h, {
        p75:quantile(data.rawValues, q),
        median:quantile(data.rawValues, 0.5),
        min:data.rawValues.length ? Math.min(...data.rawValues) : null,
        max:data.rawValues.length ? Math.max(...data.rawValues) : null,
        p75OracleUnits:quantile(data.oracleValues, q),
        medianOracleUnits:quantile(data.oracleValues, 0.5),
        minOracleUnits:data.oracleValues.length ? Math.min(...data.oracleValues) : null,
        maxOracleUnits:data.oracleValues.length ? Math.max(...data.oracleValues) : null,
        reached:data.reached,
        total:data.total
      }]))
    }));
  };
})(window.Arcane = window.Arcane || {});
