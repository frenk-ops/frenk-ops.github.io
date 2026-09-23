(function (A) {
  "use strict";

  const ORACLE_SCHEMA_VERSION = 1;
  const ORACLE_AI_LEVEL = 5;

  const SCENARIOS = Object.freeze([
    Object.freeze({
      id:"open-balanced",
      playerHp:40,
      enemyHp:40,
      playerPower:8,
      enemyPower:8,
      ownBoard:[],
      enemyBoard:[]
    }),
    Object.freeze({
      id:"contested",
      playerHp:34,
      enemyHp:36,
      playerPower:10,
      enemyPower:10,
      ownBoard:[
        { cardId:"astral_air_04", slot:1, healthRatio:0.7 },
        { cardId:"astral_earth_08", slot:3, healthRatio:0.8 }
      ],
      enemyBoard:[
        { cardId:"astral_water_07", slot:0, healthRatio:0.8 },
        { cardId:"astral_fire_13", slot:2, healthRatio:0.9 },
        { cardId:"astral_death_07", slot:4, healthRatio:0.75 }
      ]
    }),
    Object.freeze({
      id:"wounded",
      playerHp:18,
      enemyHp:38,
      playerPower:8,
      enemyPower:8,
      ownBoard:[
        { cardId:"astral_earth_08", slot:1, healthRatio:0.35 },
        { cardId:"astral_water_07", slot:3, healthRatio:0.5 }
      ],
      enemyBoard:[
        { cardId:"astral_fire_13", slot:0, healthRatio:0.85 },
        { cardId:"astral_air_04", slot:2, healthRatio:0.7 }
      ]
    }),
    Object.freeze({
      id:"enemy-ahead",
      playerHp:32,
      enemyHp:40,
      playerPower:6,
      enemyPower:12,
      ownBoard:[
        { cardId:"astral_water_07", slot:1, healthRatio:0.8 }
      ],
      enemyBoard:[
        { cardId:"astral_fire_13", slot:0, healthRatio:1 },
        { cardId:"astral_death_07", slot:2, healthRatio:1 },
        { cardId:"astral_air_04", slot:4, healthRatio:1 }
      ]
    }),
    Object.freeze({
      id:"low-offschool-power",
      playerHp:37,
      enemyHp:37,
      playerPower:4,
      enemyPower:8,
      ownBoard:[
        { cardId:"astral_earth_08", slot:3, healthRatio:0.65 }
      ],
      enemyBoard:[
        { cardId:"astral_water_07", slot:0, healthRatio:0.9 },
        { cardId:"astral_fire_13", slot:2, healthRatio:0.8 }
      ]
    }),
    Object.freeze({
      id:"high-power",
      playerHp:40,
      enemyHp:40,
      playerPower:20,
      enemyPower:20,
      ownBoard:[
        { cardId:"astral_water_07", slot:1, healthRatio:1 }
      ],
      enemyBoard:[
        { cardId:"astral_fire_13", slot:0, healthRatio:1 },
        { cardId:"astral_air_04", slot:2, healthRatio:1 }
      ]
    })
  ]);

  function clone(value) {
    if (typeof A.deepClone === "function") return A.deepClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a,b) => a-b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function pearson(rows, xKey, yKey) {
    if (!rows.length) return null;
    const xs = rows.map(row => Number(row[xKey]));
    const ys = rows.map(row => Number(row[yKey]));
    const xMean = xs.reduce((sum,value) => sum + value, 0) / xs.length;
    const yMean = ys.reduce((sum,value) => sum + value, 0) / ys.length;
    let numerator = 0;
    let xSquare = 0;
    let ySquare = 0;
    for (let index = 0; index < rows.length; index += 1) {
      const xd = xs[index] - xMean;
      const yd = ys[index] - yMean;
      numerator += xd * yd;
      xSquare += xd * xd;
      ySquare += yd * yd;
    }
    const denominator = Math.sqrt(xSquare * ySquare);
    return denominator > 0 ? numerator / denominator : 0;
  }

  function rank(values) {
    const indexed = values.map((value,index) => ({ value, index })).sort((a,b) => a.value - b.value || a.index - b.index);
    const ranks = Array(values.length).fill(0);
    let cursor = 0;
    while (cursor < indexed.length) {
      let end = cursor + 1;
      while (end < indexed.length && indexed[end].value === indexed[cursor].value) end += 1;
      const averageRank = (cursor + 1 + end) / 2;
      for (let index = cursor; index < end; index += 1) ranks[indexed[index].index] = averageRank;
      cursor = end;
    }
    return ranks;
  }

  function spearman(rows, xKey, yKey) {
    if (!rows.length) return null;
    const xRanks = rank(rows.map(row => Number(row[xKey])));
    const yRanks = rank(rows.map(row => Number(row[yKey])));
    return pearson(xRanks.map((value,index) => ({ x:value, y:yRanks[index] })), "x", "y");
  }

  function boardUnit(card, owner, slot, healthRatio) {
    const health = Math.max(1, Number(card.health || card.hp || 1));
    return {
      ...clone(card),
      health,
      hp:health,
      currentHealth:Math.max(1, Math.min(health, Math.round(health * Number(healthRatio ?? 1)))),
      owner,
      instanceId:`oracle-${owner}-${slot}-${card.id}`,
      summonedOnOwnerTurn:0,
      astralPowerModifiers:[]
    };
  }

  function scenarioById(id) {
    return SCENARIOS.find(item => item.id === id) || null;
  }

  function makeOracleEngine(cards, card, scenario) {
    const byId = Object.fromEntries(cards.map(item => [item.id, item]));
    const engine = new A.GameEngine({
      cards,
      rules:A.ASTRAL_ORIGINAL_RULESET,
      seed:`value-oracle-${card.id}-${scenario.id}`,
      // Keep all recovered cards in the spellbook so the recovered evaluator's
      // hand-aware Power usefulness does not treat every point above this one
      // card's cost as automatically wasted.
      hands:{
        player:cards.map(clone),
        enemy:cards.map(clone)
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

    const cost = engine.effectiveCost("player", engine.getCard("player", card.id));
    // One point above printed cost prevents cost subtraction from erasing a
    // same-school drawback (e.g. Tribute) before the gross-cost refund step.
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
    return engine;
  }

  function moveFor(engine, card) {
    if (card.type === "spell") return { type:"play", cardId:card.id, slot:null };
    const slot = engine.state.player.board.findIndex(unit => !unit);
    return { type:"play", cardId:card.id, slot };
  }

  function deterministicDelta(engine, seed) {
    return A.evaluateRecoveredAstralDelta(engine, "player", ORACLE_AI_LEVEL, seed).score;
  }

  A.SIGIAN_VALUE_ORACLE_SCHEMA_VERSION = ORACLE_SCHEMA_VERSION;
  A.SIGIAN_VALUE_ORACLE_SCENARIOS = SCENARIOS;

  A.evaluateSigianCardWithRecoveredOracle = function evaluateSigianCardWithRecoveredOracle(cards, card, scenarioInput) {
    if (typeof A.evaluateRecoveredAstralDelta !== "function") {
      throw new Error("Il recovered Astral evaluator deve essere caricato prima dell'oracle di calibrazione.");
    }
    const scenario = typeof scenarioInput === "string" ? scenarioById(scenarioInput) : scenarioInput;
    if (!scenario) throw new Error(`Scenario oracle sconosciuto: ${scenarioInput}.`);

    const engine = makeOracleEngine(cards, card, scenario);
    const liveCard = engine.getCard("player", card.id);
    const cost = engine.effectiveCost("player", liveCard);
    const seed = `oracle-score-${card.id}-${scenario.id}`;
    const beforeScore = deterministicDelta(engine, `${seed}-before`);
    const beforePower = clone(engine.state.player.power);
    const result = engine.playMove("player", moveFor(engine, liveCard));
    if (!result?.ok) {
      return {
        schemaVersion:ORACLE_SCHEMA_VERSION,
        cardId:card.id,
        scenarioId:scenario.id,
        playable:false,
        reason:result?.reason || "play failed"
      };
    }

    const afterNetScore = deterministicDelta(engine, `${seed}-after-net`);
    engine.state.player.power[card.school] = Math.min(
      engine.rules.maxPower,
      Number(engine.state.player.power[card.school] || 0) + cost
    );
    const afterGrossScore = deterministicDelta(engine, `${seed}-after-gross`);

    return {
      schemaVersion:ORACLE_SCHEMA_VERSION,
      cardId:card.id,
      scenarioId:scenario.id,
      playable:true,
      printedLevel:Number(card.level || card.cost || 0),
      cost,
      beforePower,
      beforeScore,
      afterNetScore,
      afterGrossScore,
      netMarginal:afterNetScore - beforeScore,
      grossMarginal:afterGrossScore - beforeScore,
      recoveredCostSignal:afterGrossScore - afterNetScore,
      eventCount:Array.isArray(result.events) ? result.events.length : 0
    };
  };

  A.buildSigianRecoveredOracleDataset = function buildSigianRecoveredOracleDataset(cards, scenarios = SCENARIOS) {
    const rows = [];
    (cards || []).forEach(card => {
      (scenarios || []).forEach(scenario => {
        rows.push(A.evaluateSigianCardWithRecoveredOracle(cards, card, scenario));
      });
    });
    return rows;
  };

  A.summarizeSigianRecoveredOracle = function summarizeSigianRecoveredOracle(cards, rows) {
    const cardById = Object.fromEntries((cards || []).map(card => [card.id, card]));
    const grouped = {};
    (rows || []).filter(row => row.playable).forEach(row => {
      (grouped[row.cardId] ||= []).push(row);
    });

    const cardsSummary = Object.entries(grouped).map(([cardId, cardRows]) => {
      const card = cardById[cardId];
      const gross = cardRows.map(row => row.grossMarginal);
      const net = cardRows.map(row => row.netMarginal);
      return {
        cardId,
        name:card?.name || cardId,
        school:card?.school || null,
        type:card?.type || null,
        printedLevel:Number(card?.level || card?.cost || 0),
        scenarioCount:cardRows.length,
        grossMean:gross.reduce((sum,value) => sum + value, 0) / gross.length,
        grossMedian:median(gross),
        grossMin:Math.min(...gross),
        grossMax:Math.max(...gross),
        grossSpread:Math.max(...gross) - Math.min(...gross),
        netMean:net.reduce((sum,value) => sum + value, 0) / net.length,
        recoveredCostSignalMean:cardRows.reduce((sum,row) => sum + row.recoveredCostSignal, 0) / cardRows.length
      };
    }).sort((a,b) => a.printedLevel - b.printedLevel || a.cardId.localeCompare(b.cardId));

    return {
      schemaVersion:ORACLE_SCHEMA_VERSION,
      scenarioCount:(scenariosForRows(rows)).length,
      rowCount:(rows || []).length,
      playableRows:(rows || []).filter(row => row.playable).length,
      cards:cardsSummary,
      grossLevelPearson:pearson(cardsSummary, "printedLevel", "grossMean"),
      grossLevelSpearman:spearman(cardsSummary, "printedLevel", "grossMean"),
      netLevelPearson:pearson(cardsSummary, "printedLevel", "netMean"),
      netLevelSpearman:spearman(cardsSummary, "printedLevel", "netMean")
    };
  };

  function scenariosForRows(rows) {
    return [...new Set((rows || []).map(row => row.scenarioId))];
  }
})(window.Arcane = window.Arcane || {});
