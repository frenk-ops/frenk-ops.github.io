(function (A) {
  "use strict";

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function makeSimpleCards() {
    const cards = [];
    A.SCHOOLS.forEach((school, schoolIndex) => {
      for (let level = 1; level <= 10; level += 1) {
        cards.push(A.normalizeCard({
          id: `${school.id}-${level}`,
          name: `${school.name} ${level}`,
          school: school.id,
          level,
          type: "creature",
          attack: Math.max(1, level),
          health: Math.max(1, level + 1),
          art: school.icon
        }));
      }
    });
    return cards;
  }

  function engineWithHands() {
    const cards = makeSimpleCards();
    const hands = {
      player: cards.filter(c => c.school === "fire").slice(0, 4),
      enemy: cards.filter(c => c.school === "water").slice(0, 4),
      enemyTalent: "water",
      diagnostics: []
    };
    return new A.GameEngine({ cards, hands, seed: "test", playerTalent: "fire", enemyTalent: "water", rules: { startingHp: 20, initialPower: 10 } });
  }


  function astralEngine(playerIds, enemyIds, options) {
    const cards = A.getCardSet("astral-original");
    const byId = Object.fromEntries(cards.map(card => [card.id, card]));
    const fallbackPlayer = ["astral_fire_01", "astral_water_01", "astral_air_01", "astral_earth_01", "astral_death_01"];
    const fallbackEnemy = ["astral_fire_02", "astral_water_02", "astral_air_02", "astral_earth_02", "astral_death_02"];
    const hands = {
      player: (playerIds?.length ? playerIds : fallbackPlayer).map(id => byId[id]),
      enemy: (enemyIds?.length ? enemyIds : fallbackEnemy).map(id => byId[id]),
      enemyTalent: options?.enemyTalent || "water",
      playerPowers: options?.playerPowers,
      enemyPowers: options?.enemyPowers,
      diagnostics: []
    };
    const engine = new A.GameEngine({
      cards,
      hands,
      seed: options?.seed || "astral-card-engine-test",
      playerTalent: options?.playerTalent || "fire",
      enemyTalent: options?.enemyTalent || "water",
      playerPassives: options?.playerPassives || [],
      enemyPassives: options?.enemyPassives || [],
      playerAstralAbilities: options?.playerAstralAbilities,
      enemyAstralAbilities: options?.enemyAstralAbilities,
      playerSpecialization: options?.playerSpecialization,
      enemySpecialization: options?.enemySpecialization,
      astralLeague: options?.astralLeague,
      rules: A.ASTRAL_ORIGINAL_RULESET
    });
    ["player", "enemy"].forEach(side => A.SCHOOLS.forEach(school => {
      engine.state[side].power[school.id] = options?.[`${side}Power`]?.[school.id] ?? 20;
      if (!options?.preserveAbilitySetup) engine.state[side].powerGain[school.id] = 1;
    }));
    return engine;
  }

  function placeAstralUnit(engine, side, cardId, slot, health) {
    const card = A.getCardSet("astral-original").find(item => item.id === cardId);
    const unit = { ...A.deepClone(card), currentHealth: health ?? card.health, owner: side, instanceId: `${side}-test-${slot}-${card.id}`, astralPowerModifiers: [] };
    engine.state[side].board[slot] = unit;
    return unit;
  }

  function assertAstralStateIntegrity(engine, context) {
    ["player", "enemy"].forEach(side => {
      const fighter = engine.state[side];
      assert(Number.isFinite(fighter.hp) && fighter.hp >= 0, `${context}: vita ${side} non valida`);
      A.SCHOOLS.forEach(school => {
        const power = fighter.power[school.id];
        const gain = fighter.powerGain[school.id];
        assert(Number.isFinite(power) && power >= 0 && power <= engine.rules.maxPower, `${context}: potere ${side}/${school.id} non valido: ${power}`);
        assert(Number.isFinite(gain) && Math.abs(gain) <= 20, `${context}: crescita ${side}/${school.id} non valida: ${gain}`);
      });
      assert(fighter.board.length === engine.rules.boardSize, `${context}: dimensione campo ${side} non valida`);
      fighter.board.forEach((unit, slot) => {
        if (!unit) return;
        assert(Number.isFinite(unit.currentHealth) && unit.currentHealth > 0, `${context}: creatura morta rimasta in ${side}:${slot}`);
        assert(Number.isFinite(unit.health) && unit.health > 0, `${context}: vita massima creatura non valida in ${side}:${slot}`);
      });
    });
  }

  function assertStructuredEvents(events, context) {
    (events || []).forEach((event, index) => {
      assert(event && typeof event.type === "string" && event.type.length > 0, `${context}: evento ${index} senza tipo`);
      ["amount", "baseAmount", "modifiedAmount", "resolvedAmount", "health", "hp"].forEach(field => {
        if (event[field] !== undefined) assert(Number.isFinite(event[field]), `${context}: ${event.type}.${field} non numerico`);
      });
    });
  }

  function goldenStateProjection(engine, expected) {
    const projectBoard = board => board.map(unit => unit ? `${unit.id}:${unit.currentHealth}` : null);
    const projection = {
      phase: engine.state.phase,
      playerHp: engine.state.player.hp,
      enemyHp: engine.state.enemy.hp
    };
    if (expected.playerPowers) projection.playerPowers = Object.fromEntries(Object.keys(expected.playerPowers).map(school => [school, engine.state.player.power[school]]));
    if (expected.enemyPowers) projection.enemyPowers = Object.fromEntries(Object.keys(expected.enemyPowers).map(school => [school, engine.state.enemy.power[school]]));
    if (expected.playerPowerGain) projection.playerPowerGain = Object.fromEntries(Object.keys(expected.playerPowerGain).map(school => [school, engine.state.player.powerGain[school]]));
    if (expected.enemyPowerGain) projection.enemyPowerGain = Object.fromEntries(Object.keys(expected.enemyPowerGain).map(school => [school, engine.state.enemy.powerGain[school]]));
    if (expected.playerBoard) projection.playerBoard = projectBoard(engine.state.player.board);
    if (expected.enemyBoard) projection.enemyBoard = projectBoard(engine.state.enemy.board);
    return projection;
  }

  function buildGoldenReplayEngine(scenario) {
    const engine = astralEngine(scenario.playerIds, scenario.enemyIds, { seed: `golden:${scenario.id}` });
    Object.entries(scenario.setup?.hp || {}).forEach(([side, hp]) => { engine.state[side].hp = hp; });
    Object.entries(scenario.setup?.powers || {}).forEach(([side, powers]) => {
      Object.entries(powers).forEach(([school, value]) => { engine.state[side].power[school] = value; });
    });
    (scenario.setup?.units || []).forEach(unit => placeAstralUnit(engine, unit.side, unit.cardId, unit.slot, unit.health));
    if (scenario.setup?.phase) engine.state.phase = scenario.setup.phase;
    const enemyPhases = [A.PHASES.ENEMY_THINK, A.PHASES.ENEMY_PLAY, A.PHASES.ENEMY_ATTACK];
    engine.state.activeSide = scenario.setup?.activeSide || (enemyPhases.includes(engine.state.phase) ? "enemy" : "player");
    engine.state.attackCursor = scenario.setup?.attackCursor || 0;
    return engine;
  }

  const tests = [
    {
      name: "Profilo giocatore: statistiche e sei trofei richiesti vengono persistiti e sbloccati",
      run() {
        const profile = A.createDefaultProfile();
        profile.playerName = "Tester";
        for (let index = 0; index < 5; index += 1) {
          A.recordProfileMatch(profile, { matchId: `single-win-${index}`, mode: "singlePlayer", result: "win", durationMs: index === 0 ? 4 * 60 * 1000 : 8 * 60 * 1000 });
          A.recordProfileMatch(profile, { matchId: `multi-win-${index}`, mode: "multiplayer", result: "win", durationMs: 9 * 60 * 1000 });
        }
        for (let index = 0; index < 30; index += 1) {
          A.recordProfileCardPlay(profile, { type: index % 2 ? "spell" : "creature", school: "water" });
        }
        A.recordProfileCombat(profile, { turnDamage: 20, damage: 20, lifeDrained: 100 });
        const earned = new Set(profile.achievements);
        ["multi-5-wins", "single-5-wins", "water-30-cards", "turn-20-damage", "speed-5-min", "drain-100-life"].forEach(id => {
          assert(earned.has(id), `Trofeo non sbloccato: ${id}`);
        });
        assert(profile.stats.singlePlayer.wins === 5 && profile.stats.multiplayer.wins === 5, "Le vittorie per modalità devono essere separate");
        assert(profile.stats.cardsBySchool.water === 30, "Le carte Acqua devono essere conteggiate");
        assert(profile.stats.creaturesPlayed === 15 && profile.stats.spellsPlayed === 15, "Creature e magie devono essere conteggiate separatamente");
        assert(profile.stats.fastestWinMs === undefined, "Il record veloce deve vivere nelle statistiche per modalità");
        assert(profile.stats.singlePlayer.fastestWinMs === 4 * 60 * 1000, "La vittoria più veloce deve conservare il tempo minimo");
      }
    },
    {
      name: "Protocollo multiplayer: comandi e replay producono lo stesso stato",
      run() {
        const first = engineWithHands();
        const card = first.state.player.hand[0];
        const session = new A.CommandSession(first, { matchId: "match-replay" });
        const play = session.createCommand("player", A.MULTIPLAYER_COMMANDS.PLAY, { cardId: card.id, slot: 0 });
        assert(session.dispatch(play).ok, "Il comando PLAY deve essere accettato");
        while (first.state.phase === A.PHASES.PLAYER_ATTACK) {
          const attack = session.createCommand("player", A.MULTIPLAYER_COMMANDS.ATTACK_NEXT);
          const result = session.dispatch(attack);
          assert(result.ok, "Il comando ATTACK_NEXT deve essere accettato");
          if (result.result.done) {
            const finish = session.createCommand("player", A.MULTIPLAYER_COMMANDS.FINISH_ATTACK);
            assert(session.dispatch(finish).ok, "Il comando FINISH_ATTACK deve essere accettato");
          }
        }
        const replay = session.exportReplay();
        const restored = A.replayCommands(replay, first.cards);
        assert(restored.checksum === session.checksum, "Il replay deve produrre lo stesso checksum");
        assert(A.stableStringify(restored.engine.state) === A.stableStringify(first.state), "Il replay deve riprodurre lo stesso stato");
      }
    },
    {
      name: "Una creatura richiede una casella libera esplicita e non sostituisce quella occupata",
      run() {
        const engine = engineWithHands();
        const card = engine.state.player.hand[0];
        const occupant = { ...A.deepClone(card), instanceId: "existing-creature", currentHealth: card.health, owner: "player" };
        engine.state.player.board[0] = occupant;
        const session = new A.CommandSession(engine, { matchId: "creature-slot-regression" });
        const selection = session.dispatch(session.createCommand("player", A.MULTIPLAYER_COMMANDS.SELECT, { cardId: card.id }));
        assert(selection.ok && engine.state.phase === A.PHASES.PLAYER_TARGET, "La creatura deve restare selezionata in attesa del campo");
        const before = session.checksum;
        for (const slot of [null, 0, -1, 1.5]) {
          const rejected = session.dispatch(session.createCommand("player", A.MULTIPLAYER_COMMANDS.PLAY, { cardId: card.id, slot }));
          assert(!rejected.ok, `La casella ${slot} non deve essere accettata`);
          assert(session.checksum === before && engine.state.player.board[0]?.instanceId === "existing-creature", `La casella ${slot} ha mutato il campo`);
          assert(engine.state.pendingCardId === card.id && engine.state.phase === A.PHASES.PLAYER_TARGET, "La selezione deve restare attiva dopo il rifiuto");
        }
        const played = session.dispatch(session.createCommand("player", A.MULTIPLAYER_COMMANDS.PLAY, { cardId: card.id, slot: 1 }));
        assert(played.ok, "La casella libera selezionata deve accettare la creatura");
        assert(engine.state.player.board[0]?.instanceId === "existing-creature" && engine.state.player.board[1]?.id === card.id, "La creatura esistente deve rimanere intatta");
      }
    },
    {
      name: "Protocollo multiplayer: rifiuta sequenze vecchie e desincronizzate senza mutare lo stato",
      run() {
        const engine = engineWithHands();
        const session = new A.CommandSession(engine, { matchId: "match-validation" });
        const valid = session.createCommand("player", A.MULTIPLAYER_COMMANDS.PASS);
        const stale = { ...valid, sequence: 2 };
        const before = session.checksum;
        assert(!session.dispatch(stale).ok, "Una sequenza fuori ordine deve essere rifiutata");
        assert(session.checksum === before, "Un comando rifiutato non deve mutare lo stato");
        const desynced = { ...valid, previousChecksum: "fnv1a32:00000000" };
        assert(!session.dispatch(desynced).ok, "Un checksum precedente errato deve essere rifiutato");
        assert(session.checksum === before, "Una desincronizzazione non deve mutare lo stato");
      }
    },
    {
      name: "Protocollo multiplayer: un comando fallito o corrotto viene annullato atomicamente",
      run() {
        const throwingEngine = engineWithHands();
        const throwingSession = new A.CommandSession(throwingEngine, { matchId: "match-atomic-throw" });
        const throwingBefore = throwingSession.checksum;
        throwingEngine.pass = function passWithFailure() {
          this.state.player.hp = 1;
          throw new Error("effetto simulato fallito");
        };
        const throwingCommand = throwingSession.createCommand("player", A.MULTIPLAYER_COMMANDS.PASS);
        const throwingResult = throwingSession.dispatch(throwingCommand);
        assert(!throwingResult.ok && /Comando annullato/.test(throwingResult.reason), "L'eccezione deve diventare un rifiuto controllato");
        assert(throwingSession.checksum === throwingBefore && throwingSession.sequence === 0 && throwingSession.history.length === 0, "L'eccezione non deve lasciare stato o cronologia parziali");

        const corruptingEngine = engineWithHands();
        const corruptingSession = new A.CommandSession(corruptingEngine, { matchId: "match-atomic-invalid" });
        const corruptingBefore = corruptingSession.checksum;
        corruptingEngine.pass = function passWithInvalidState() {
          this.state.player.hp = -5;
          return { ok: true, events: [], phase: this.state.phase };
        };
        const corruptingCommand = corruptingSession.createCommand("player", A.MULTIPLAYER_COMMANDS.PASS);
        const corruptingResult = corruptingSession.dispatch(corruptingCommand);
        assert(!corruptingResult.ok && /Snapshot non valido/.test(corruptingResult.reason), "Uno stato invalido deve essere rifiutato dal validatore");
        assert(corruptingSession.checksum === corruptingBefore && corruptingSession.sequence === 0 && corruptingSession.history.length === 0, "Uno stato invalido deve essere ripristinato integralmente");
      }
    },
    {
      name: "Protocollo multiplayer: serializzazione canonica indipendente dall'ordine delle chiavi",
      run() {
        const left = { b: 2, a: { d: 4, c: 3 } };
        const right = { a: { c: 3, d: 4 }, b: 2 };
        assert(A.stableStringify(left) === A.stableStringify(right), "La serializzazione deve essere canonica");
      }
    },
    {
      name: "Replay golden: le catene tra scuole mantengono eventi, stato e checksum",
      run() {
        assert(Array.isArray(A.GOLDEN_REPLAY_SCENARIOS) && A.GOLDEN_REPLAY_SCENARIOS.length >= 3, "Fixture golden mancanti");
        const checksumMismatches = [];
        A.GOLDEN_REPLAY_SCENARIOS.forEach(scenario => {
          const engine = buildGoldenReplayEngine(scenario);
          const session = new A.CommandSession(engine, { matchId: `golden:${scenario.id}` });
          const eventTypes = [];
          scenario.commands.forEach(spec => {
            const command = session.createCommand(spec.actor, A.MULTIPLAYER_COMMANDS[spec.type], spec.payload || {});
            const outcome = session.dispatch(command);
            assert(outcome.ok, `${scenario.id}: comando ${spec.type} rifiutato: ${outcome.reason}`);
            (outcome.result.events || []).forEach(event => eventTypes.push(event.type));
          });
          assert(JSON.stringify(eventTypes) === JSON.stringify(scenario.expected.eventTypes), `${scenario.id}: eventi ${JSON.stringify(eventTypes)}`);
          const projection = goldenStateProjection(engine, scenario.expected.state);
          assert(A.stableStringify(projection) === A.stableStringify(scenario.expected.state), `${scenario.id}: stato ${A.stableStringify(projection)}`);
          if (session.checksum !== scenario.expected.checksum) {
            checksumMismatches.push(`${scenario.id}=${session.checksum}`);
          }
          const replayed = A.replayCommands(session.exportReplay(), engine.cards);
          assert(replayed.checksum === session.checksum, `${scenario.id}: replay non deterministico`);
        });
        assert(checksumMismatches.length === 0, `Golden checksum updates: ${checksumMismatches.join(", ")}`);
      }
    },
    {
      name: "Snapshot: valida struttura e rifiuta versioni future senza mutare l'input",
      run() {
        const engine = engineWithHands();
        const valid = engine.snapshot();
        const original = A.stableStringify(valid);
        const restored = A.GameEngine.fromSnapshot(valid, engine.cards);
        assert(A.stableStringify(restored.snapshot()) === original, "Il ripristino valido deve essere fedele");
        assert(A.stableStringify(valid) === original, "Il ripristino non deve mutare lo snapshot sorgente");

        const future = A.deepClone(valid);
        future.state.version = A.GAME_STATE_VERSION + 1;
        let futureRejected = false;
        try { A.GameEngine.fromSnapshot(future, engine.cards); } catch (error) { futureRejected = /versione futura/.test(error.message); }
        assert(futureRejected, "Una versione futura deve essere rifiutata esplicitamente");

        const malformed = A.deepClone(valid);
        malformed.state.player.board.pop();
        let malformedRejected = false;
        try { A.GameEngine.fromSnapshot(malformed, engine.cards); } catch (error) { malformedRejected = /campo player/.test(error.message); }
        assert(malformedRejected, "Un campo di dimensione errata deve essere rifiutato");
      }
    },
    {
      name: "Snapshot: migra lo stato versione 1 aggiungendo i contratti mancanti",
      run() {
        const engine = engineWithHands();
        const legacy = engine.snapshot();
        legacy.state.version = 1;
        delete legacy.state.activeSide;
        delete legacy.state.turnCounters;
        delete legacy.state.player.maxHp;
        delete legacy.state.player.revealedCards;
        delete legacy.state.player.flags;
        const restored = A.GameEngine.fromSnapshot(legacy, engine.cards);
        assert(restored.state.version === A.GAME_STATE_VERSION, "La versione deve essere migrata");
        assert(restored.state.activeSide === "player", "Il lato attivo deve essere ricostruito dalla fase");
        assert(restored.state.turnCounters.player === 1 && restored.state.turnCounters.enemy === 0, "I contatori turno devono essere ricostruiti");
        assert(restored.state.player.maxHp === restored.rules.startingHp, "La vita iniziale deve essere ricostruita");
        assert(Array.isArray(restored.state.player.revealedCards) && restored.state.player.flags.cardPlayedThisTurn === false, "I campi runtime devono essere ricostruiti");
      }
    },
    {
      name: "Generatore deterministico con seed",
      run() {
        const cards = makeSimpleCards();
        const a = A.generateHands(cards, { seed: "same", playerTalent: "fire", enemyTalent: "water" });
        const b = A.generateHands(cards, { seed: "same", playerTalent: "fire", enemyTalent: "water" });
        assert(JSON.stringify(a.player.map(c => c.id)) === JSON.stringify(b.player.map(c => c.id)), "Lo stesso seed deve produrre la stessa mano");
      }
    },
    {
      name: "Generatore Astral: la cache per seed e isolata dalle mutazioni della partita",
      run() {
        const cards = A.getCardSet("astral-original");
        const options = { seed: "spellbook-cache-contract", enemyDifficulty: "novice" };
        const before = A.getAstralSpellbookCacheStats();
        const first = A.generateRecoveredAstralHands(cards, options);
        const afterFirst = A.getAstralSpellbookCacheStats();
        first.player[0].name = "mutazione locale";
        first.playerPowers.fire = 999;
        const second = A.generateRecoveredAstralHands(cards, options);
        const afterSecond = A.getAstralSpellbookCacheStats();
        assert(afterFirst.misses === before.misses + 1, "La prima generazione deve registrare un cache miss");
        assert(afterSecond.hits === afterFirst.hits + 1, "La seconda generazione deve usare la cache");
        assert(second.player[0].name !== "mutazione locale" && second.playerPowers.fire !== 999, "La cache deve restituire una copia profonda indipendente");
      }
    },
    {
      name: "Pool esclusivi",
      run() {
        const cards = makeSimpleCards();
        const result = A.generateHands(cards, { seed: "exclusive", playerTalent: "fire", enemyTalent: "water" });
        const playerIds = new Set(result.player.map(c => c.id));
        assert(!result.enemy.some(c => playerIds.has(c.id)), "Una carta è stata assegnata a entrambi");
      }
    },
    {
      name: "Almeno una carta iniziale per scuola quando disponibile",
      run() {
        const cards = makeSimpleCards();
        const result = A.generateHands(cards, { seed: "opening", playerTalent: "fire", enemyTalent: "water" });
        A.SCHOOLS.forEach(school => {
          assert(result.player.some(c => c.school === school.id && c.level <= A.DEFAULT_RULESET.initialPower), `Giocatore senza apertura ${school.id}`);
          assert(result.enemy.some(c => c.school === school.id && c.level <= A.DEFAULT_RULESET.initialPower), `IA senza apertura ${school.id}`);
        });
      }
    },
    {
      name: "Selezione carta porta alla fase bersaglio",
      run() {
        const engine = engineWithHands();
        const card = engine.state.player.hand[0];
        const result = engine.selectCard(card.id);
        assert(result.ok, "La carta doveva essere selezionabile");
        assert(engine.state.phase === A.PHASES.PLAYER_TARGET, "Fase non aggiornata");
      }
    },
    {
      name: "Una sola carta per turno",
      run() {
        const engine = engineWithHands();
        const card = engine.state.player.hand[0];
        engine.selectCard(card.id);
        const played = engine.playSelected(0);
        assert(played.ok, "Prima carta non giocata");
        assert(engine.state.phase === A.PHASES.PLAYER_ATTACK, "Il turno deve entrare in attacco");
        const second = engine.playMove("player", { type: "play", cardId: engine.state.player.hand[1].id, slot: 1 });
        assert(!second.ok, "Non deve essere possibile giocare una seconda carta");
      }
    },
    {
      name: "Debolezza da evocazione: una creatura appena giocata salta l'attacco",
      run() {
        const engine = engineWithHands();
        const card = engine.state.player.hand[0];
        engine.selectCard(card.id);
        const played = engine.playSelected(0);
        assert(played.ok, "La creatura non è stata evocata");
        const before = engine.state.enemy.hp;
        const step = engine.attackNext("player");
        assert(step.skipped && step.reason === "summoning_sickness", "La creatura appena evocata avrebbe dovuto essere saltata");
        assert(engine.state.enemy.hp === before, "La creatura appena evocata ha inflitto danno");
      }
    },
    {
      name: "Debolezza da evocazione: la creatura attacca dal turno successivo del proprietario",
      run() {
        const engine = engineWithHands();
        const card = engine.state.player.hand[0];
        engine.selectCard(card.id);
        engine.playSelected(0);
        while (!engine.attackNext("player").done) { /* skip della creatura appena evocata */ }
        engine.finishAttack("player");
        engine.beginEnemyPlay();
        engine.pass("enemy");
        while (!engine.attackNext("enemy").done) { /* nessun attaccante */ }
        engine.finishAttack("enemy");
        engine.pass("player");
        const before = engine.state.enemy.hp;
        const step = engine.attackNext("player");
        assert(step.event?.type === "directAttack", "La creatura non ha attaccato nel turno successivo");
        assert(engine.state.enemy.hp < before, "L'attacco del turno successivo non ha inflitto danno");
      }
    },
    {
      name: "Debolezza da evocazione: la creatura difende subito la propria corsia",
      run() {
        const engine = engineWithHands();
        const attackerCard = engine.state.player.hand[0];
        const defenderCard = engine.state.enemy.hand[0];
        const attacker = {
          ...A.deepClone(attackerCard),
          currentHealth: attackerCard.health,
          owner: "player",
          instanceId: "ready-attacker",
          summonedOnOwnerTurn: engine.getOwnerTurnCount("player") - 1
        };
        const defender = {
          ...A.deepClone(defenderCard),
          currentHealth: defenderCard.health,
          owner: "enemy",
          instanceId: "sick-defender",
          summonedOnOwnerTurn: engine.getOwnerTurnCount("enemy")
        };
        engine.state.player.board[0] = attacker;
        engine.state.enemy.board[0] = defender;
        engine.state.phase = A.PHASES.PLAYER_ATTACK;

        assert(engine.isUnitSummoningSick(defender, "enemy"), "Il difensore dovrebbe avere debolezza da evocazione");
        const heroHealthBefore = engine.state.enemy.hp;
        const defenderHealthBefore = defender.currentHealth;
        const step = engine.attackNext("player");

        assert(step.event?.type === "laneAttack", "L'attacco ha ignorato il difensore appena evocato");
        assert(engine.state.enemy.hp === heroHealthBefore, "L'eroe ha subito danno diretto nonostante il difensore");
        assert(defender.currentHealth < defenderHealthBefore, "Il difensore appena evocato non ha assorbito l'attacco");
      }
    },
    {
      name: "Attacco ordinato da un effetto ignora soltanto la debolezza da evocazione",
      run() {
        const engine = engineWithHands();
        const card = engine.state.player.hand[0];
        engine.selectCard(card.id);
        engine.playSelected(0);
        const unit = engine.state.player.board[0];
        assert(engine.isUnitSummoningSick(unit, "player"), "La creatura dovrebbe avere debolezza da evocazione");
        const before = engine.state.enemy.hp;
        const forced = engine.attackUnitFromEffect("player", 0);
        assert(forced.event?.forcedByEffect === true, "L'attacco non è stato marcato come generato da un effetto");
        assert(engine.state.enemy.hp < before, "L'attacco generato dall'effetto non ha inflitto danno");
        assert(engine.isUnitSummoningSick(unit, "player"), "L'attacco forzato ha rimosso prematuramente la debolezza");
        const normal = engine.attackNext("player");
        assert(normal.skipped && normal.reason === "summoning_sickness", "La creatura ha attaccato anche nella fase normale");
      }
    },
    {
      name: "Una creatura evocata fuori turno è pronta al prossimo turno del proprietario",
      run() {
        const engine = engineWithHands();
        const card = engine.state.enemy.hand[0];
        const unit = { ...A.deepClone(card), currentHealth: card.health, owner: "enemy", instanceId: "enemy-out-of-turn", summonedOnOwnerTurn: engine.getOwnerTurnCount("enemy") };
        engine.state.enemy.board[0] = unit;
        assert(engine.isUnitSummoningSick(unit, "enemy"), "La creatura dovrebbe risultare appena evocata");
        engine.state.phase = A.PHASES.PLAYER_ATTACK;
        engine.finishAttack("player");
        assert(!engine.isUnitSummoningSick(unit, "enemy"), "La creatura non è diventata pronta all'inizio del turno del proprietario");
      }
    },
    {
      name: "Lo spostamento di slot non riapplica la debolezza da evocazione",
      run() {
        const engine = engineWithHands();
        const card = engine.state.player.hand[0];
        const unit = { ...A.deepClone(card), currentHealth: card.health, owner: "player", instanceId: "moved-unit", summonedOnOwnerTurn: engine.getOwnerTurnCount("player") - 1 };
        engine.state.player.board[0] = unit;
        engine.state.player.board[0] = null;
        engine.state.player.board[2] = unit;
        assert(!engine.isUnitSummoningSick(unit, "player"), "Lo spostamento ha riapplicato la debolezza");
      }
    },
    {
      name: "Il difensore non contrattacca",
      run() {
        const engine = engineWithHands();
        engine.state.player.board[0] = { ...engine.state.player.hand[0], currentHealth: 5, health: 5, attack: 3, instanceId: "p" };
        engine.state.enemy.board[0] = { ...engine.state.enemy.hand[0], currentHealth: 5, health: 5, attack: 9, instanceId: "e" };
        engine.state.phase = A.PHASES.PLAYER_ATTACK;
        const step = engine.attackNext("player");
        assert(step.event.targetHealth === 2, "Danno al difensore errato");
        assert(engine.state.player.board[0].currentHealth === 5, "L'attaccante ha subito un contrattacco");
      }
    },
    {
      name: "Il danno diretto aggiorna la vita dell'eroe",
      run() {
        const engine = engineWithHands();
        engine.state.player.board[0] = { ...engine.state.player.hand[0], currentHealth: 5, health: 5, attack: 4, instanceId: "p" };
        engine.state.phase = A.PHASES.PLAYER_ATTACK;
        const before = engine.state.enemy.hp;
        const step = engine.attackNext("player");
        assert(step.event.type === "directAttack", "Tipo evento errato");
        assert(engine.state.enemy.hp === before - 4, "Vita eroe non aggiornata");
      }
    },
    {
      name: "Foundation: un attacco a zero non attiva Fire Aura",
      run() {
        const engine = engineWithHands();
        engine.state.player.board[0] = {
          ...A.normalizeCard({ id: "zero-attacker", name: "Zero", school: "fire", level: 1, type: "creature", attack: 0, health: 5 }),
          currentHealth: 5, owner: "player", instanceId: "zero-attacker-instance", summonedOnOwnerTurn: 0
        };
        engine.state.enemy.passives.push("fire_aura");
        engine.state.phase = A.PHASES.PLAYER_ATTACK;
        const step = engine.attackNext("player");
        assert(step.event?.damage === 0 && engine.state.player.board[0].currentHealth === 5, "Fire Aura non deve reagire a zero danni");
      }
    },
    {
      name: "Fine attacco giocatore avvia il pensiero IA",
      run() {
        const engine = engineWithHands();
        engine.state.phase = A.PHASES.PLAYER_ATTACK;
        engine.finishAttack("player");
        assert(engine.state.phase === A.PHASES.ENEMY_THINK, "IA non avviata");
      }
    },
    {
      name: "Il round aumenta dopo il turno IA",
      run() {
        const engine = engineWithHands();
        const before = engine.state.player.power.fire;
        engine.state.phase = A.PHASES.ENEMY_ATTACK;
        engine.finishAttack("enemy");
        assert(engine.state.round === 2, "Round non incrementato");
        assert(engine.state.phase === A.PHASES.PLAYER_SELECT, "Turno non restituito al giocatore");
        assert(engine.state.player.power.fire === before + engine.state.player.powerGain.fire, "Potere non incrementato");
      }
    },
    {
      name: "L'IA produce una mossa legale a ogni difficoltà",
      run() {
        Object.keys(A.DIFFICULTIES).forEach(difficulty => {
          const engine = engineWithHands();
          engine.state.phase = A.PHASES.ENEMY_PLAY;
          const move = A.chooseAiMove(engine, "enemy", difficulty);
          const legal = engine.legalMoves("enemy");
          assert(legal.some(candidate => JSON.stringify(candidate) === JSON.stringify(move)), `Mossa illegale: ${difficulty}`);
        });
      }
    },
    {
      name: "Torneo Evolutivo: propone Potenziamenti e bilancia gli avversari",
      run() {
        const profile = A.createDefaultProfile();
        const tournament = A.createTournament({ seed: "cup", tournamentMode: "evolution", specialization: "fire" });
        A.recordTournamentDuel(profile, tournament, true, 100);
        A.recordTournamentDuel(profile, tournament, true, 100);
        assert(tournament.wins === 2, "Vittorie torneo errate");
        assert(tournament.pendingPassiveChoice, "Scelta Potenziamento non proposta");
        const selected = A.selectTournamentPassive(tournament, tournament.offeredPassives[0]);
        assert(selected && tournament.selectedPassives.length === 1, "Potenziamento non salvato");
        assert(A.getTournamentOpponentPassives(tournament, tournament.currentMatch).length === 1, "L'avversario deve ricevere un Potenziamento equivalente");
      }
    },
    {
      name: "Torneo delle Leghe: non assegna Potenziamenti extra",
      run() {
        const profile = A.createDefaultProfile();
        const tournament = A.createTournament({ seed: "league-no-powerups", tournamentMode: "league", specialization: "water" });
        A.recordTournamentDuel(profile, tournament, true, 100);
        A.recordTournamentDuel(profile, tournament, true, 100);
        assert(!tournament.evolutionEnabled && !tournament.pendingPassiveChoice,"Il Torneo delle Leghe non deve proporre Potenziamenti");
        assert(A.getTournamentOpponentPassives(tournament, tournament.currentMatch).length===0,"Gli avversari del Torneo delle Leghe non devono avere Potenziamenti extra");
      }
    },
    {
      name: "Il torneo usa una sola collezione e avanza tra le tre leghe",
      run() {
        const tournament = A.createTournament({ seed: "league-ladder", tournamentMode: "league", specialization: "fire", setId: "classic" });
        assert(tournament.setId === "astral-original", `Set torneo ambiguo: ${tournament.setId}`);
        assert(tournament.tournamentMode === "league" && tournament.spellbookDistribution === "arcane" && tournament.specializationsEnabled, "Preset Torneo delle Leghe errato");
        assert(tournament.specialization === "battlemage", `Specializzazione legacy non migrata: ${tournament.specialization}`);
        assert(JSON.stringify(tournament.opponents.map(item => item.league)) === JSON.stringify(["starting", "starting", "advanced", "advanced", "major", "major", "major"]), "Progressione leghe errata");
        assert(tournament.opponents.every(item => A.getAstralSpecialization(item.specialization, item.talent).talent === item.talent), "Specializzazione avversario incoerente");
      }
    },
    {
      name: "Il torneo accetta tutte le specializzazioni, incluso Mago Arcano",
      run() {
        const wizard = A.createTournament({ seed: "wizard-cup", specialization: "wizard" });
        assert(wizard.specialization === "wizard", `Specializzazione Mago persa: ${wizard.specialization}`);
        assert(A.ASTRAL_SPECIALIZATIONS.length === 6, `Specializzazioni disponibili: ${A.ASTRAL_SPECIALIZATIONS.length}`);
        assert(A.ASTRAL_SPECIALIZATIONS.some(item => item.id === "wizard"), "Mago non disponibile nel torneo");

        const randomA = A.createTournament({ seed: "random-specialization-cup", specialization: "random" });
        const randomB = A.createTournament({ seed: "random-specialization-cup", specialization: "random" });
        assert(randomA.specialization && randomA.specialization !== "random", "Casuale torneo non risolta in una specializzazione concreta");
        assert(randomA.specialization === randomB.specialization, "Casuale torneo non stabile rispetto al seed");
      }
    },
    {
      name: "Torneo Personalizzato: conserva distribuzione e assi scelti",
      run() {
        const tournament=A.createTournament({
          seed:"custom-cup",
          tournamentMode:"custom",
          spellbookDistribution:"mirror",
          specializationsEnabled:false,
          evolutionEnabled:true
        });
        assert(tournament.tournamentMode==="custom","Modalita personalizzata persa");
        assert(tournament.spellbookDistribution==="mirror","Distribuzione speculare persa");
        assert(!tournament.specializationsEnabled && tournament.specialization===null,"Le specializzazioni dovevano essere disattivate");
        assert(tournament.evolutionEnabled,"I Potenziamenti evolutivi dovevano essere attivi");
      }
    },
    {
      name: "Avvio e ripresa torneo persistono una sola partecipazione",
      run() {
        const storage = (() => { const data = {}; return { getItem:key => data[key] ?? null, setItem:(key,value) => { data[key] = String(value); }, removeItem:key => { delete data[key]; } }; })();
        const profile = A.createDefaultProfile();
        const tournament = A.startTournament(profile, { seed: "resume-cup", specialization: "water" }, storage);
        const restored = A.loadTournament(storage);
        const restoredProfile = A.loadProfile(storage);
        assert(restored.id === tournament.id && restored.currentMatch === 0, "Torneo non ripristinato");
        assert(restoredProfile.tournamentsPlayed === 1, `Partecipazioni registrate: ${restoredProfile.tournamentsPlayed}`);
        assert(A.getTournamentLeagueForMatch(restored, 4) === "major", "Lega ripristinata errata");
      }
    },
    {
      name: "Punteggio torneo separa vita residua e bonus velocità",
      run() {
        const score = A.calculateTournamentScore(true, 37, 8);
        assert(score.lifePoints === 370 && score.speedBonus === 60 && score.total === 430, `Punteggio: ${JSON.stringify(score)}`);
        assert(A.calculateTournamentScore(false, 37, 8).total === 0, "Una sconfitta ha assegnato punti");
      }
    },
    {
      name: "Cinque vittorie su sette conquistano il torneo e salvano i risultati",
      run() {
        const profile = A.createDefaultProfile();
        const tournament = A.createTournament({ seed: "five-of-seven", specialization: "death" });
        [true, true, false, true, false, true, true].forEach((won, index) => {
          const score = A.calculateTournamentScore(won, 30 + index, 10);
          A.recordTournamentDuel(profile, tournament, won, score);
          if (tournament.pendingPassiveChoice) A.selectTournamentPassive(tournament, tournament.offeredPassives[0]);
        });
        assert(tournament.completed && tournament.won, "Il torneo 5/7 non è stato conquistato");
        assert(tournament.results.length === 7 && tournament.results.filter(item => item.won).length === 5, "Storico incontri incompleto");
        assert(tournament.opponents[2].result === "loss" && tournament.opponents[2].score === 0, "Sconfitta non registrata");
        assert(profile.trophies.length === 1 && profile.trophies[0].id === "trophy-five-of-seven", "Trofeo non stabile");
      }
    },
    {
      name: "Ciclo completo giocatore → IA → nuovo round senza stalli",
      run() {
        const engine = engineWithHands();
        for (let cycle = 0; cycle < 12 && !engine.state.gameOver; cycle += 1) {
          const playerMove = A.chooseAiMove(engine, "player", "advanced", `p-${cycle}`);
          let playerResult;
          if (playerMove.type === "pass") playerResult = engine.pass("player");
          else {
            engine.selectCard(playerMove.cardId);
            playerResult = engine.playSelected(playerMove.slot);
          }
          assert(playerResult.ok, `Mossa giocatore fallita al ciclo ${cycle}`);
          while (!engine.attackNext("player").done) { /* risoluzione */ }
          engine.finishAttack("player");
          if (engine.state.gameOver) break;
          assert(engine.state.phase === A.PHASES.ENEMY_THINK, "Fase ENEMY_THINK mancante");
          engine.beginEnemyPlay();
          const enemyMove = A.chooseAiMove(engine, "enemy", "advanced", `e-${cycle}`);
          const enemyResult = engine.playMove("enemy", enemyMove);
          assert(enemyResult.ok, `Mossa IA fallita al ciclo ${cycle}`);
          while (!engine.attackNext("enemy").done) { /* risoluzione */ }
          engine.finishAttack("enemy");
          if (!engine.state.gameOver) assert(engine.state.phase === A.PHASES.PLAYER_SELECT, `Turno bloccato in ${engine.state.phase}`);
        }
      }
    },
    {
      name: "Le mani rispettano la quantità configurata",
      run() {
        const cards = makeSimpleCards();
        const result = A.generateHands(cards, { seed: "counts", playerTalent: "fire", enemyTalent: "water" });
        const playerExpected = A.DEFAULT_RULESET.handSizePerSchool * 4 + A.DEFAULT_RULESET.talentHandSizePerSchool;
        const enemyExpected = playerExpected;
        assert(result.player.length === playerExpected, `Mano giocatore ${result.player.length}/${playerExpected}`);
        assert(result.enemy.length === enemyExpected, `Mano IA ${result.enemy.length}/${enemyExpected}`);
      }
    },
    {
      name: "Completare un torneo vincente assegna un trofeo",
      run() {
        const profile = A.createDefaultProfile();
        const tournament = A.createTournament({ seed: "champion", specialization: "air" });
        while (!tournament.completed) {
          A.recordTournamentDuel(profile, tournament, true, 100);
          if (tournament.pendingPassiveChoice) A.selectTournamentPassive(tournament, tournament.offeredPassives[0]);
        }
        assert(tournament.won, "Il torneo doveva risultare vinto");
        assert(profile.tournamentsWon === 1, "Contatore tornei non aggiornato");
        assert(profile.trophies.length === 1, "Trofeo non assegnato");
      }
    },
    {
      name: "Schema carte valido",
      run() {
        const validation = A.validateCardSet(A.getCardSet("classic"));
        assert(validation.valid, validation.errors.join("; "));
        assert(validation.cards.every(c => Number.isFinite(c.level)), "Livello carta mancante");
      }
    },
    {
      name: "Il set Astral contiene 65 carte e 65 record IA",
      run() {
        assert(A.getCardSet("astral-original").length === 65, "Numero carte Astral errato");
        assert(Object.keys(A.ASTRAL_CARD_AI_METADATA).length === 65, "Metadati IA incompleti");
      }
    },
    {
      name: "Curva vita originale tradotta senza approssimazioni",
      run() {
        const expected = [[5,400],[6,450],[10,650],[11,680],[20,900],[30,1050],[40,1150],[50,1200],[150,1300],[750,1600]];
        expected.forEach(([hp,value]) => assert(A.astralHeroLifeCurve(hp) === value, `Curva vita errata a ${hp}`));
      }
    },
    {
      name: "Fattori casuali delle cinque IA rispettano gli intervalli originali",
      run() {
        const ranges = { 1:[2,9], 2:[3,6], 3:[15,18], 4:[50,52], 5:[1,1] };
        Object.entries(ranges).forEach(([level,[min,max]]) => {
          for (let i=0;i<50;i+=1) {
            const rng=A.createRng(`factor-${level}-${i}`);
            const value=A.astralDifficultyRandomFactor(Number(level),rng);
            assert(value>=min && value<=max, `Fattore livello ${level}: ${value}`);
          }
        });
      }
    },
    {
      name: "Le leghe selezionano lo stadio abilità senza sovrascrivere i poteri",
      run() {
        const cards=A.getCardSet("astral-original");
        const hands={player:cards.slice(0,20),enemy:cards.slice(20,40),enemyTalent:"water",diagnostics:[]};
        const engine=new A.GameEngine({cards,hands,playerTalent:"fire",enemyTalent:"water",rules:A.ASTRAL_ORIGINAL_RULESET,seed:"league",playerAstralAbilities:[],enemyAstralAbilities:[]});
        const before=A.deepClone(engine.state.player.power);
        const league=A.applyAstralLeaguePowers(engine,"major");
        assert(league.abilityStage===3,"Stadio Major errato");
        assert(JSON.stringify(engine.state.player.power)===JSON.stringify(before),"La lega non deve sovrascrivere i poteri generati");
        assert(JSON.stringify(league.raw)===JSON.stringify([400,10,8,750]),"Record binario Major errato");
      }
    },
    {
      name: "L'IA recuperata produce una mossa legale a tutti i livelli",
      run() {
        Object.keys(A.DIFFICULTIES).forEach(difficulty => {
          const engine=engineWithHands();
          engine.state.phase=A.PHASES.ENEMY_PLAY;
          const move=A.chooseRecoveredAstralMove(engine,"enemy",difficulty,`legal-${difficulty}`);
          const comparable={type:move.type,cardId:move.cardId,slot:move.slot};
          assert(engine.legalMoves("enemy").some(candidate => candidate.type===comparable.type && candidate.cardId===comparable.cardId && candidate.slot===comparable.slot),`Mossa recuperata illegale: ${difficulty}`);
        });
      }
    },
    {
      name: "Archmage è deterministico a parità di stato e seed",
      run() {
        const a=engineWithHands(); a.state.phase=A.PHASES.ENEMY_PLAY;
        const b=a.clone();
        const ma=A.chooseRecoveredAstralMove(a,"enemy","grandmaster","same");
        const mb=A.chooseRecoveredAstralMove(b,"enemy","grandmaster","same");
        assert(JSON.stringify(ma)===JSON.stringify(mb),"Archmage non deterministico");
      }
    },
    {
      name: "Archmage simula tre fasi di attacco, le altre IA due",
      run() {
        const engine=engineWithHands(); engine.state.phase=A.PHASES.ENEMY_PLAY;
        const novice=A.scoreRecoveredAstralMoves(engine,"enemy","novice","horizon-n")[0];
        const archmage=A.scoreRecoveredAstralMoves(engine,"enemy","grandmaster","horizon-a")[0];
        assert(novice.simulatedAttackPhases===2,"Orizzonte Novice errato");
        assert(archmage.simulatedAttackPhases===3,"Orizzonte Archmage errato");
      }
    },
    {
      name: "Il comparatore Archmage distingue corrispondenza, corsia e divergenza",
      run() {
        const ranked=[
          {legal:true,score:120,move:{type:"play",cardId:"astral_fire_01",slot:0}},
          {legal:true,score:115,move:{type:"play",cardId:"astral_fire_01",slot:1}},
          {legal:true,score:90,move:{type:"play",cardId:"astral_water_01",slot:0}}
        ];
        const exact=A.compareRecoveredAstralOracle(ranked,{type:"play",cardId:"astral_fire_01",slot:0});
        const lane=A.compareRecoveredAstralOracle(ranked,{type:"play",cardId:"astral_fire_01",slot:1});
        const different=A.compareRecoveredAstralOracle(ranked,{type:"play",cardId:"astral_water_01",slot:0});
        const pending=A.compareRecoveredAstralOracle(ranked,null);
        assert(exact.status==="exact" && exact.oracleRank===1,"Corrispondenza esatta non rilevata");
        assert(lane.status==="lane-difference" && lane.oracleRank===2 && lane.scoreGap===5,"Differenza di corsia non rilevata");
        assert(different.status==="different" && different.oracleRank===3 && different.scoreGap===30,"Divergenza carta non rilevata");
        assert(pending.status==="pending" && pending.oracle===null,"Oracle mancante non gestito");
      }
    },
    {
      name: "Il libro Astral umano contiene 20 carte permanenti e un livello 12",
      run() {
        const cards=A.getCardSet("astral-original");
        const result=A.generateRecoveredAstralHands(cards,{seed:"spellbook-test",enemyDifficulty:"novice"});
        assert(result.player.length===20,`Libro umano: ${result.player.length}`);
        assert(new Set(result.player.map(card=>card.id)).size===20,"Duplicati nel libro umano");
        assert(result.player.filter(card=>card.level===12).length===1,"Il libro deve avere esattamente un livello 12");
        assert(result.player.every(card=>card.level<=12),"Un livello 13 è stato estratto casualmente");
      }
    },
    {
      name: "Duello Arcano: i Grimori base sono mutuamente esclusivi",
      run() {
        const cards=A.getCardSet("astral-original");
        const result=A.generateRecoveredAstralHands(cards,{seed:"arcane-exclusive",enemyDifficulty:"master",distributionMode:"arcane"});
        const playerIds=new Set(result.player.map(card=>card.id));
        assert(!result.enemy.some(card=>playerIds.has(card.id)),"Il Duello Arcano ha condiviso una carta base");
        assert(result.diagnostics.every(item=>item.baseOverlap===0),"La diagnostica segnala overlap nel Duello Arcano");
      }
    },
    {
      name: "Duello Libero: i Grimori indipendenti possono condividere carte",
      run() {
        const cards=A.getCardSet("astral-original");
        let overlap=0;
        for(let index=0;index<8 && overlap===0;index+=1){
          const result=A.generateRecoveredAstralHands(cards,{seed:`free-overlap-${index}`,enemyDifficulty:"master",distributionMode:"free"});
          overlap=result.diagnostics[0].baseOverlap;
        }
        assert(overlap>0,"Il Duello Libero non ha mai prodotto carte condivise");
      }
    },
    {
      name: "Duello Speculare: entrambi ricevono lo stesso Grimorio base",
      run() {
        const cards=A.getCardSet("astral-original");
        const result=A.generateRecoveredAstralHands(cards,{seed:"mirror-book",mode:"multiplayer",distributionMode:"mirror",playerAbilities:[],enemyAbilities:[]});
        assert(result.player.length===20 && result.enemy.length===20,"Il Duello Speculare deve usare 20 carte per entrambi");
        assert(JSON.stringify(result.player.map(card=>card.id))===JSON.stringify(result.enemy.map(card=>card.id)),"I Grimori speculari non coincidono");
      }
    },
    {
      name: "Duello Arcano: Knowledge puo creare eccezioni dopo l'esclusivita base",
      run() {
        const cards=A.getCardSet("astral-original");
        const result=A.generateRecoveredAstralHands(cards,{
          seed:"arcane-knowledge-overlap",
          mode:"tournament",
          distributionMode:"arcane",
          playerSpecialization:"battlemage",
          enemySpecialization:"battlemage",
          playerAbilities:[30],
          enemyAbilities:[30]
        });
        assert(result.diagnostics.every(item=>item.baseOverlap===0),"Le carte base del torneo devono restare esclusive");
        assert(result.player.some(card=>card.id==="astral_fire_13") && result.enemy.some(card=>card.id==="astral_fire_13"),"La Sapienza degli Efreet deve poter aggiungere la stessa carta a entrambi");
      }
    },
    {
      name: "Le prime fasce garantiscono basso, medio e alto in ogni scuola",
      run() {
        const cards=A.getCardSet("astral-original");
        const result=A.generateRecoveredAstralHands(cards,{seed:"bands-test",enemyDifficulty:"novice"});
        A.ASTRAL_SPELLBOOK_RE.schoolOrder.forEach(school=>{
          const levels=result.player.filter(card=>card.school===school).map(card=>card.level);
          assert(levels.some(level=>level>=1&&level<=4),`Fascia bassa mancante: ${school}`);
          assert(levels.some(level=>level>=5&&level<=8),`Fascia media mancante: ${school}`);
          assert(levels.some(level=>level>=9&&level<=12),`Fascia alta mancante: ${school}`);
        });
      }
    },
    {
      name: "La difficoltà modifica il numero di carte dell'IA",
      run() {
        const expected={novice:15,intermediate:15,advanced:17,master:20,grandmaster:20};
        Object.entries(expected).forEach(([difficulty,count])=>{
          assert(A.getRecoveredAstralSpellbookCount({enemyDifficulty:difficulty},"enemy")===count,`Conteggio ${difficulty} errato`);
        });
        assert(A.getRecoveredAstralSpellbookCount({mode:"tournament",enemySpecialization:"wizard"},"enemy")===24,"Wizard non riceve 24 carte");
      }
    },
    {
      name: "Knowledge aggiunge elementali e livello 13 senza estrarli casualmente",
      run() {
        const cards=A.getCardSet("astral-original");
        const result=A.generateRecoveredAstralHands(cards,{seed:"knowledge-ability",enemyDifficulty:"novice",playerAbilities:[29,30]});
        const names=new Set(result.player.map(card=>card.name));
        ["Fire Elemental","Water Elemental","Air Elemental","Earth Elemental","Efreet"].forEach(name=>assert(names.has(name),`Carta Knowledge mancante: ${name}`));
        assert(result.player.length===25,`Conteggio dopo Knowledge: ${result.player.length}`);
      }
    },
    {
      name: "Le carte Terra sono collegate alla scuola interna Natura",
      run() {
        const cards=A.getCardSet("astral-original");
        const earthCards=cards.filter(card=>card.id.startsWith("astral_earth_"));
        assert(earthCards.length===13,"Set Terra incompleto");
        assert(earthCards.every(card=>card.school==="nature"),"Mappatura Earth/Nature incoerente");
        assert(A.validateCardSet(cards).valid,"Il set Astral deve essere valido nello schema interno");
      }
    },
    {
      name: "Il motore applica i poteri iniziali recuperati",
      run() {
        const engine=new A.GameEngine({cards:A.getCardSet("astral-original"),rules:A.ASTRAL_ORIGINAL_RULESET,seed:"foundation-001",aiDifficulty:"novice",playerTalent:"fire",enemyTalent:"water",playerAstralAbilities:[],enemyAstralAbilities:[]});
        const playerTotal=Object.values(engine.state.player.power).reduce((sum,value)=>sum+value,0);
        const enemyTotal=Object.values(engine.state.enemy.power).reduce((sum,value)=>sum+value,0);
        assert(playerTotal===20,`Somma poteri giocatore: ${playerTotal}`);
        assert(enemyTotal===19,`Somma poteri IA: ${enemyTotal}`);
      }
    },
    {
      name: "Le carte del libro restano disponibili dopo il lancio",
      run() {
        const cards=A.getCardSet("astral-original");
        const hands=A.generateRecoveredAstralHands(cards,{seed:"permanent-book",enemyDifficulty:"novice"});
        const engine=new A.GameEngine({cards,hands,rules:A.ASTRAL_ORIGINAL_RULESET,seed:"permanent-book",playerTalent:"fire",enemyTalent:"water"});
        Object.keys(engine.state.player.power).forEach(school=>{engine.state.player.power[school]=20;});
        const before=engine.state.player.hand.length;
        const move=engine.legalMoves("player").find(candidate=>candidate.type==="play");
        assert(Boolean(move),"Nessuna mossa giocabile");
        const result=engine.playMove("player",move);
        assert(result.ok,"Lancio non riuscito");
        assert(engine.state.player.hand.length===before,"La carta è stata rimossa dal libro");
        assert(engine.state.player.hand.some(card=>card.id===move.cardId),"La carta giocata non è più disponibile");
      }
    },
    {
      name: "Le formule Astral usano il potere prima di sottrarre il costo",
      run() {
        const engine = astralEngine(["astral_air_06"], ["astral_fire_02"]);
        engine.state.player.power.air = 10;
        const beforeHp = engine.state.enemy.hp;
        const result = engine.playMove("player", { type: "play", cardId: "astral_air_06", slot: null });
        assert(result.ok, "Lightning non giocata");
        assert(engine.state.enemy.hp === beforeHp - 15, `Danno Lightning: ${beforeHp - engine.state.enemy.hp}`);
        assert(engine.state.player.power.air === 4, `Potere Air residuo: ${engine.state.player.power.air}`);
      }
    },
    {
      name: "Fulmine mostra il danno effettivo dopo le difese",
      run() {
        const engine = astralEngine(["astral_air_06"], ["astral_earth_02"]);
        engine.state.player.power.air = 6;
        placeAstralUnit(engine, "enemy", "astral_earth_02", 0);
        const card = engine.getCard("player", "astral_air_06");
        const preview = A.astralPreviewCardValue(engine, "player", card);
        assert(preview.base === 11 && preview.modified === 11 && preview.effective === 10, `Anteprima Fulmine: ${JSON.stringify(preview)}`);
        const result = engine.playMove("player", { type: "play", cardId: card.id });
        const damage = result.events.find(event => event.type === "astralHeroDamage");
        assert(damage?.modifiedAmount === 11 && damage.resolvedAmount === 10 && damage.amount === 10, `Evento Fulmine: ${JSON.stringify(damage)}`);
      }
    },
    {
      name: "Fire Ritual produce il +2 netto originale",
      run() {
        const engine = astralEngine(["astral_fire_03"], ["astral_water_02"]);
        engine.state.player.power.fire = 3;
        engine.state.enemy.power.water = 8;
        const result = engine.playMove("player", { type: "play", cardId: "astral_fire_03" });
        assert(result.ok, "Fire Ritual non giocato");
        assert(engine.state.player.power.fire === 5, `Fuoco netto: ${engine.state.player.power.fire}`);
        assert(engine.state.enemy.power.water === 7, "Riduzione Acqua nemica non applicata");
      }
    },
    {
      name: "Dragon e Faerie modificano insieme il danno delle magie",
      run() {
        const engine = astralEngine(["astral_fire_01"], ["astral_fire_02"]);
        placeAstralUnit(engine, "player", "astral_fire_12", 1);
        placeAstralUnit(engine, "player", "astral_air_01", 2);
        const target = placeAstralUnit(engine, "enemy", "astral_fire_02", 0, 13);
        engine.playMove("player", { type: "play", cardId: "astral_fire_01" });
        assert(target.currentHealth === 8, `Danno potenziato errato, vita ${target.currentHealth}`);
      }
    },
    {
      name: "Warlord potenzia anche l'attacco dinamico dell'elementale",
      run() {
        const engine = astralEngine(["astral_fire_10"], ["astral_water_02"]);
        placeAstralUnit(engine, "player", "astral_fire_09", 0);
        placeAstralUnit(engine, "player", "astral_fire_10", 1);
        engine.state.player.power.fire = 10;
        engine.state.phase = A.PHASES.PLAYER_ATTACK;
        engine.state.attackCursor = 1;
        const before = engine.state.enemy.hp;
        const step = engine.attackNext("player");
        assert(step.event.damage === 15, `Attacco Elementale: ${step.event.damage}`);
        assert(engine.state.enemy.hp === before - 15, "Danno dinamico non applicato");
      }
    },
    {
      name: "Ice Guard e Elf Armorer riducono in sequenza il danno all'eroe",
      run() {
        const engine = astralEngine(["astral_fire_02"], ["astral_water_06", "astral_earth_02"]);
        const attacker = placeAstralUnit(engine, "player", "astral_earth_13", 0);
        attacker.attack = 10;
        placeAstralUnit(engine, "enemy", "astral_water_06", 1);
        placeAstralUnit(engine, "enemy", "astral_earth_02", 2);
        engine.state.phase = A.PHASES.PLAYER_ATTACK;
        const before = engine.state.enemy.hp;
        const step = engine.attackNext("player");
        assert(step.event.damage === 4, `Danno ridotto: ${step.event.damage}`);
        assert(engine.state.enemy.hp === before - 4, "Riduzione difensiva errata");
      }
    },
    {
      name: "Le creature multi-bersaglio colpiscono eroe e tutte le creature",
      run() {
        const engine = astralEngine(["astral_earth_03"], ["astral_fire_02", "astral_water_02"]);
        placeAstralUnit(engine, "player", "astral_earth_03", 0);
        const a = placeAstralUnit(engine, "enemy", "astral_fire_02", 1, 13);
        const b = placeAstralUnit(engine, "enemy", "astral_water_02", 3, 9);
        engine.state.phase = A.PHASES.PLAYER_ATTACK;
        const before = engine.state.enemy.hp;
        const step = engine.attackNext("player");
        assert(step.event.multiTarget, "Attacco non marcato multi-bersaglio");
        assert(a.currentHealth === 12 && b.currentHealth === 8, "Creature nemiche non colpite tutte");
        assert(engine.state.enemy.hp === before - 1, "Eroe nemico non colpito");
      }
    },
    {
      name: "Phoenix rinasce a vita piena con almeno 10 Fuoco",
      run() {
        const engine = astralEngine(["astral_air_07"], ["astral_fire_02"]);
        const phoenix = placeAstralUnit(engine, "player", "astral_air_07", 0, 5);
        engine.state.player.power.fire = 10;
        A.astralApplyUnitDamage(engine, "enemy", "player", 0, 20, { sourceKind: "creature" }, []);
        A.astralCleanupDeaths(engine, []);
        assert(engine.state.player.board[0] === phoenix, "Phoenix rimossa dal campo");
        assert(phoenix.currentHealth === phoenix.health, `Phoenix rinata a ${phoenix.currentHealth}`);
        assert(engine.isUnitSummoningSick(phoenix, "player"), "Phoenix rinata senza debolezza da evocazione");
      }
    },
    {
      name: "Phoenix sostituisce la morte e non attiva i trigger di morte",
      run() {
        const engine = astralEngine(["astral_air_07", "astral_death_04", "astral_death_09"], ["astral_fire_02"]);
        placeAstralUnit(engine, "player", "astral_air_07", 0, 1);
        placeAstralUnit(engine, "player", "astral_death_04", 1);
        placeAstralUnit(engine, "player", "astral_death_09", 2);
        engine.state.player.power.fire = 10;
        engine.state.player.power.death = 4;
        engine.state.player.hp = 40;
        const events = [];
        A.astralApplyUnitDamage(engine, "enemy", "player", 0, 5, { sourceKind: "spell" }, events);
        A.astralCleanupDeaths(engine, events);
        assert(engine.state.player.board[0]?.id === "astral_air_07", "Phoenix non rinata");
        assert(engine.state.player.power.fire === 10, "La rinascita ha consumato Fuoco");
        assert(engine.state.player.power.death === 4, "Death Keeper ha contato una falsa morte");
        assert(engine.state.player.hp === 40, "Wall of Souls ha contato una falsa morte");
        assert(events.some(e => e.type === "astralPhoenixRebirth"), "Evento rinascita assente");
        assert(!events.some(e => e.type === "astralDeath" && e.cardId === "astral_air_07"), "Emesso evento morte per Phoenix rinata");
      }
    },
    {
      name: "Phoenix può rinascere più volte finché Fuoco resta almeno 10",
      run() {
        const engine = astralEngine(["astral_air_07"], ["astral_fire_02"]);
        const phoenix = placeAstralUnit(engine, "player", "astral_air_07", 0, 1);
        engine.state.player.power.fire = 10;
        for (let i = 0; i < 2; i += 1) {
          A.astralApplyUnitDamage(engine, "enemy", "player", 0, 99, { sourceKind: "spell" }, []);
          A.astralCleanupDeaths(engine, []);
          assert(engine.state.player.board[0] === phoenix, `Phoenix rimossa al ciclo ${i}`);
          assert(phoenix.currentHealth === phoenix.health, `Phoenix non a vita piena al ciclo ${i}`);
        }
      }
    },
    {
      name: "Phoenix sotto 10 Fuoco muore e attiva una volta i trigger",
      run() {
        const engine = astralEngine(["astral_air_07", "astral_death_04", "astral_death_09"], ["astral_fire_02"]);
        placeAstralUnit(engine, "player", "astral_air_07", 0, 1);
        placeAstralUnit(engine, "player", "astral_death_04", 1);
        placeAstralUnit(engine, "player", "astral_death_09", 2);
        engine.state.player.power.fire = 9;
        engine.state.player.power.death = 4;
        engine.state.player.hp = 40;
        A.astralApplyUnitDamage(engine, "enemy", "player", 0, 5, { sourceKind: "spell" }, []);
        A.astralCleanupDeaths(engine, []);
        assert(engine.state.player.board[0] === null, "Phoenix non rimossa sotto soglia");
        assert(engine.state.player.power.death === 5, "Death Keeper non attivato una volta");
        assert(engine.state.player.hp === 43, "Wall of Souls non attivato una volta");
      }
    },
    {
      name: "Death Keeper e Wall of Souls reagiscono alla morte di una creatura",
      run() {
        const engine = astralEngine(["astral_death_04", "astral_death_09"], ["astral_fire_02"]);
        placeAstralUnit(engine, "player", "astral_death_04", 0);
        placeAstralUnit(engine, "player", "astral_death_09", 1);
        placeAstralUnit(engine, "enemy", "astral_fire_02", 0, 2);
        engine.state.player.hp = 40;
        engine.state.player.power.death = 5;
        A.astralApplyUnitDamage(engine, "player", "enemy", 0, 5, { sourceKind: "spell" }, []);
        A.astralCleanupDeaths(engine, []);
        assert(engine.state.player.power.death === 6, "Death Keeper non attivato");
        assert(engine.state.player.hp === 43, "Wall of Souls non attivato");
      }
    },
    {
      name: "I modificatori permanenti scompaiono quando la creatura muore",
      run() {
        const engine = astralEngine(["astral_water_09"], ["astral_fire_02"]);
        engine.state.player.power.water = 20;
        const result = engine.playMove("player", { type: "play", cardId: "astral_water_09", slot: 0 });
        assert(result.ok, "Ocean Master non evocato");
        assert(engine.state.player.powerGain.water === 2, `Crescita propria: ${engine.state.player.powerGain.water}`);
        assert(engine.state.enemy.powerGain.water === 0, `Crescita nemica: ${engine.state.enemy.powerGain.water}`);
        engine.state.player.board[0].currentHealth = 0;
        A.astralCleanupDeaths(engine, []);
        assert(engine.state.player.powerGain.water === 1, "Bonus Water non rimosso");
        assert(engine.state.enemy.powerGain.water === 1, "Malus Water nemico non rimosso");
      }
    },
    {
      name: "A fine attacco cresce solo il potere del prossimo giocatore",
      run() {
        const engine = astralEngine(["astral_fire_01"], ["astral_water_01"]);
        engine.state.player.power.fire = 5;
        engine.state.enemy.power.fire = 5;
        engine.state.phase = A.PHASES.PLAYER_ATTACK;
        engine.finishAttack("player");
        assert(engine.state.player.power.fire === 5, "Il giocatore attivo è cresciuto troppo presto");
        assert(engine.state.enemy.power.fire === 6, "Il prossimo giocatore non è cresciuto");
      }
    },
    {
      name: "Drain Life cura in base al danno realmente inflitto",
      run() {
        const engine = astralEngine(["astral_death_08"], ["astral_water_06"]);
        placeAstralUnit(engine, "enemy", "astral_water_06", 1);
        engine.state.player.power.death = 10;
        engine.state.player.hp = 35;
        const enemyBefore = engine.state.enemy.hp;
        const result = engine.playMove("player", { type: "play", cardId: "astral_death_08" });
        const dealt = enemyBefore - engine.state.enemy.hp;
        assert(dealt === 5, `Danno drenato dopo Ice Guard: ${dealt}`);
        assert(engine.state.player.hp === 40, `Cura drenata: ${engine.state.player.hp}`);
        const damage = result.events.find(event => event.type === "astralHeroDamage");
        const healing = result.events.find(event => event.type === "astralHealHero");
        assert(damage?.amount === 5 && healing?.amount === 5, "Drain Life non espone danno e cura effettivi nello stesso risultato");
      }
    },
    {
      name: "Le famiglie di effetti espongono eventi presentabili completi",
      run() {
        const healing = astralEngine(["astral_water_01"], ["astral_fire_02"]);
        healing.state.player.hp = 31;
        healing.state.player.power.water = 8;
        const healingResult = healing.playMove("player", { type: "play", cardId: "astral_water_01" });
        assert(healingResult.events.some(event => event.type === "astralHealHero" && event.side === "player" && event.amount === 7), "Evento cura eroe incompleto");

        const power = astralEngine(["astral_water_02"], ["astral_fire_02"]);
        power.state.player.power.water = 2;
        power.state.player.power.nature = 4;
        const powerResult = power.playMove("player", { type: "play", cardId: "astral_water_02", slot: 0 });
        assert(powerResult.events.some(event => event.type === "astralPowerChange" && event.side === "player" && event.school === "nature" && event.delta === 1), "Evento incremento potere incompleto");

        const reduction = astralEngine(["astral_death_03"], ["astral_fire_02"]);
        A.SCHOOLS.forEach(school => { reduction.state.enemy.power[school.id] = school.id === "fire" ? 0 : 3; });
        reduction.state.player.power.death = 3;
        const reductionResult = reduction.playMove("player", { type: "play", cardId: "astral_death_03" });
        const reductionEvent = reductionResult.events.find(event => event.type === "astralPowerReduction");
        assert(reductionEvent?.changes?.fire === 0 && reductionEvent?.changes?.water === -1, "Evento riduzione poteri non espone i delta effettivi");

        const destruction = astralEngine(["astral_air_09"], ["astral_fire_02"]);
        placeAstralUnit(destruction, "enemy", "astral_fire_02", 0, 12);
        destruction.state.player.power.air = 9;
        const destructionResult = destruction.playMove("player", { type: "play", cardId: "astral_air_09" });
        assert(destructionResult.events.some(event => event.type === "astralDeath" && event.side === "enemy" && event.slot === 0), "Evento distruzione incompleto");

        const rebirth = astralEngine(["astral_death_12", "astral_air_07"], ["astral_fire_02"]);
        placeAstralUnit(rebirth, "player", "astral_air_07", 0);
        placeAstralUnit(rebirth, "enemy", "astral_fire_02", 0);
        rebirth.state.player.power.fire = 10;
        rebirth.state.player.power.death = 12;
        const rebirthResult = rebirth.playMove("player", { type: "play", cardId: "astral_death_12" });
        assert(rebirthResult.events.some(event => event.type === "astralPhoenixRebirth" && event.side === "player" && event.slot === 0), "Evento resurrezione incompleto");
        assert(rebirthResult.events.some(event => event.type === "astralDeath" && event.side === "enemy" && event.slot === 0), "Morte associata alla resurrezione assente");
      }
    },
    {
      name: "Contratto eventi: Astral e Foundation espongono lo stesso envelope canonico",
      run() {
        const astral = astralEngine(["astral_water_05"], ["astral_fire_02"]);
        astral.state.player.power.water = 5;
        const astralResult = astral.playMove("player", { type: "play", cardId: "astral_water_05" });
        const astralDamage = astralResult.events.find(event => event.type === "astralHeroDamage");
        assert(astralDamage?.schemaVersion === A.ENGINE_EVENT_CONTRACT_VERSION && astralDamage.category === "damage" && astralDamage.targetKind === "hero" && astralDamage.targetSide === "enemy", "Envelope danno Astral incompleto");

        const spell = A.normalizeCard({ id: "contract-spell", name: "Contract spell", school: "fire", level: 1, type: "spell", effects: [{ trigger: "onPlay", action: "damage_enemy_hero", amount: 3 }] });
        const enemyCard = A.normalizeCard({ id: "contract-enemy", name: "Contract enemy", school: "water", level: 1, type: "creature", attack: 1, health: 2 });
        const foundation = new A.GameEngine({
          cards: [spell, enemyCard], seed: "event-contract",
          hands: { player: [spell], enemy: [enemyCard], enemyTalent: "water", diagnostics: [] },
          rules: { startingHp: 20, initialPower: 10 }
        });
        const foundationResult = foundation.playMove("player", { type: "play", cardId: spell.id });
        const foundationDamage = foundationResult.events.find(event => event.type === "heroDamage");
        assert(foundationDamage?.schemaVersion === A.ENGINE_EVENT_CONTRACT_VERSION && foundationDamage.category === "damage" && foundationDamage.targetKind === "hero" && foundationDamage.sourceSide === "player" && foundationDamage.targetSide === "enemy", "Envelope danno Foundation incompleto");

        while (!astral.attackNext("player").done) { /* completa la fase */ }
        const growth = astral.finishAttack("player");
        assert(growth.events?.some(event => event.type === "astralPowerGrowth" && event.category === "power" && event.targetKind === "power"), "La crescita di fine turno deve essere restituita come evento canonico");
      }
    },
    {
      name: "Tutte le 65 carte producono stato ed eventi integri in uno scenario reale",
      run() {
        const cards = A.getCardSet("astral-original");
        cards.forEach(card => {
          const engine = astralEngine([card.id], ["astral_fire_02", "astral_water_02", "astral_air_02"]);
          A.SCHOOLS.forEach(school => { engine.state.player.power[school.id] = 30; });
          placeAstralUnit(engine, "enemy", "astral_fire_02", 0);
          placeAstralUnit(engine, "enemy", "astral_water_02", 1);
          const result = engine.playMove("player", { type: "play", cardId: card.id, slot: card.type === "creature" ? 0 : null });
          assert(result.ok, `Dispatcher fallito per ${card.id}: ${result.reason || "errore"}`);
          assertStructuredEvents(result.events, card.id);
          assertAstralStateIntegrity(engine, card.id);
        });
      }
    },
    {
      name: "Le cinque IA completano più round senza stalli o stati corrotti",
      run() {
        const allIds = A.getCardSet("astral-original").map(card => card.id);
        Object.keys(A.DIFFICULTIES).forEach(difficulty => {
          const engine = astralEngine(allIds, allIds, { seed: `milestone-c-${difficulty}` });
          for (let round = 0; round < 6 && !engine.state.gameOver; round += 1) {
            const playerMove = A.chooseRecoveredAstralMove(engine, "player", difficulty, `p-${round}`);
            const playerResult = engine.playMove("player", playerMove);
            assert(playerResult.ok, `${difficulty} giocatore, round ${round}: ${playerResult.reason}`);
            assertStructuredEvents(playerResult.events, `${difficulty}/player/${round}`);
            while (!engine.state.gameOver) {
              const attack = engine.attackNext("player");
              assert(attack.ok, `${difficulty}: attacco giocatore non valido`);
              assertStructuredEvents(attack.events, `${difficulty}/player-attack/${round}`);
              if (attack.done) break;
            }
            engine.finishAttack("player");
            if (engine.state.gameOver) break;
            assert(engine.state.phase === A.PHASES.ENEMY_THINK, `${difficulty}: fase IA bloccata`);
            engine.beginEnemyPlay();
            const enemyMove = A.chooseRecoveredAstralMove(engine, "enemy", difficulty, `e-${round}`);
            const enemyResult = engine.playMove("enemy", enemyMove);
            assert(enemyResult.ok, `${difficulty} IA, round ${round}: ${enemyResult.reason}`);
            assertStructuredEvents(enemyResult.events, `${difficulty}/enemy/${round}`);
            while (!engine.state.gameOver) {
              const attack = engine.attackNext("enemy");
              assert(attack.ok, `${difficulty}: attacco IA non valido`);
              assertStructuredEvents(attack.events, `${difficulty}/enemy-attack/${round}`);
              if (attack.done) break;
            }
            engine.finishAttack("enemy");
            assertAstralStateIntegrity(engine, `${difficulty}/round-${round}`);
            if (!engine.state.gameOver) assert(engine.state.phase === A.PHASES.PLAYER_SELECT, `${difficulty}: nuovo round bloccato`);
          }
        });
      }
    },
    {
      name: "La fine partita distingue vittoria, sconfitta e pareggio simultaneo",
      run() {
        const outcomes = [
          { player: 10, enemy: 0, winner: "player" },
          { player: 0, enemy: 10, winner: "enemy" },
          { player: 0, enemy: 0, winner: "draw" }
        ];
        outcomes.forEach(outcome => {
          const engine = astralEngine(["astral_fire_01"], ["astral_water_01"]);
          engine.state.player.hp = outcome.player;
          engine.state.enemy.hp = outcome.enemy;
          engine.checkWinner();
          assert(engine.state.gameOver && engine.state.winner === outcome.winner, `Esito ${outcome.player}/${outcome.enemy}: ${engine.state.winner}`);
        });
      }
    }
,
    {
      name: "Il ruleset Astral non applica sconti alla scuola del talento",
      run() {
        const engine = astralEngine(["astral_fire_05"], ["astral_water_02"], { playerTalent: "fire" });
        engine.state.player.power.fire = 5;
        const card = engine.getCard("player", "astral_fire_05");
        assert(engine.effectiveCost("player", card) === 5, `Costo Minotaur: ${engine.effectiveCost("player", card)}`);
      }
    },
    {
      name: "Master Healer cura prima del proprio attacco",
      run() {
        const engine = astralEngine(["astral_earth_09"], ["astral_fire_02"]);
        const healer = placeAstralUnit(engine, "player", "astral_earth_09", 0, 20);
        const ally = placeAstralUnit(engine, "player", "astral_fire_02", 1, 8);
        engine.state.player.hp = 40;
        engine.state.phase = A.PHASES.PLAYER_ATTACK;
        const step = engine.attackNext("player");
        assert(engine.state.player.hp === 42, "Eroe non curato prima dell'attacco");
        assert(healer.currentHealth === 22 && ally.currentHealth === 10, "Creature non curate correttamente");
        const unitHeals = step.events.filter(event => event.type === "astralUnitHeal");
        assert(unitHeals.length === 2, `Eventi cura creature: ${unitHeals.length}`);
        assert(unitHeals.every(event => event.amount === 2 && event.reason === "astral_earth_09"), "Evento cura creatura non autorevole");
      }
    },
    {
      name: "Sea Sprite danneggia il proprietario quando è indietro in Acqua",
      run() {
        const engine = astralEngine(["astral_water_04"], ["astral_fire_02"]);
        placeAstralUnit(engine, "player", "astral_water_04", 0);
        engine.state.player.power.water = 4;
        engine.state.enemy.power.water = 7;
        engine.state.phase = A.PHASES.PLAYER_ATTACK;
        const before = engine.state.player.hp;
        engine.attackNext("player");
        assert(engine.state.player.hp === before - 2, "Malus Sea Sprite non applicato");
      }
    },
    {
      name: "Vampire recupera metà del danno effettivo inflitto",
      run() {
        const engine = astralEngine(["astral_death_11"], ["astral_earth_02", "astral_fire_02"]);
        const vampire = placeAstralUnit(engine, "player", "astral_death_11", 0, 20);
        placeAstralUnit(engine, "enemy", "astral_fire_02", 0, 13);
        placeAstralUnit(engine, "enemy", "astral_earth_02", 1, 8);
        engine.state.phase = A.PHASES.PLAYER_ATTACK;
        const step = engine.attackNext("player");
        assert(step.event.damage === 7, `Danno Vampire dopo Armorer: ${step.event.damage}`);
        assert(vampire.currentHealth === 23, `Cura Vampire: ${vampire.currentHealth}`);
      }
    },
    {
      name: "Stone Rain rispetta la soglia di 12 Terra",
      run() {
        const low = astralEngine(["astral_earth_10"], ["astral_fire_02"]);
        low.state.player.power.nature = 10;
        const ownLow = placeAstralUnit(low, "player", "astral_fire_02", 0, 30);
        const enemyLow = placeAstralUnit(low, "enemy", "astral_fire_02", 0, 30);
        low.playMove("player", { type: "play", cardId: "astral_earth_10" });
        assert(ownLow.currentHealth === 10 && enemyLow.currentHealth === 10, "Stone Rain sotto soglia non ha colpito tutti");

        const high = astralEngine(["astral_earth_10"], ["astral_fire_02"]);
        high.state.player.power.nature = 12;
        const ownHigh = placeAstralUnit(high, "player", "astral_fire_02", 0, 30);
        const enemyHigh = placeAstralUnit(high, "enemy", "astral_fire_02", 0, 30);
        high.playMove("player", { type: "play", cardId: "astral_earth_10" });
        assert(ownHigh.currentHealth === 30 && enemyHigh.currentHealth === 10, "Stone Rain sopra soglia errata");
      }
    },
    {
      name: "Wyvern e Tornado scelgono la creatura con più vita attuale",
      run() {
        const wyvernEngine = astralEngine(["astral_air_04"], ["astral_fire_02", "astral_water_02"]);
        const high = placeAstralUnit(wyvernEngine, "enemy", "astral_fire_02", 0, 12);
        const low = placeAstralUnit(wyvernEngine, "enemy", "astral_water_02", 1, 8);
        const wyvernResult = wyvernEngine.playMove("player", { type: "play", cardId: "astral_air_04", slot: 0 });
        assert(high.currentHealth === 7 && low.currentHealth === 8, "Wyvern ha scelto il bersaglio sbagliato");
        assert(wyvernResult.events.some(event => event.type === "astralCreatureDamage" && event.targetSide === "enemy" && event.slot === 0 && event.amount === 5), "Wyvern non ha emesso un evento danno presentabile");

        const tornadoEngine = astralEngine(["astral_air_09"], ["astral_fire_02", "astral_water_02"]);
        placeAstralUnit(tornadoEngine, "enemy", "astral_fire_02", 0, 12);
        placeAstralUnit(tornadoEngine, "enemy", "astral_water_02", 1, 8);
        tornadoEngine.playMove("player", { type: "play", cardId: "astral_air_09" });
        assert(tornadoEngine.state.enemy.board[0] === null && tornadoEngine.state.enemy.board[1], "Tornado ha distrutto il bersaglio sbagliato");
      }
    },
    {
      name: "Drain Souls conta tutte le creature e consente la rinascita di Phoenix",
      run() {
        const engine = astralEngine(["astral_death_12", "astral_air_07"], ["astral_fire_02"]);
        placeAstralUnit(engine, "player", "astral_air_07", 0);
        placeAstralUnit(engine, "enemy", "astral_fire_02", 0);
        engine.state.player.power.fire = 10;
        engine.state.player.hp = 30;
        engine.playMove("player", { type: "play", cardId: "astral_death_12" });
        assert(engine.state.player.hp === 38, `Cura Drain Souls: ${engine.state.player.hp}`);
        assert(engine.state.player.board[0]?.id === "astral_air_07", "Phoenix non è rinata");
        assert(engine.state.enemy.board[0] === null, "Creatura nemica non distrutta");
      }
    },
    {
      name: "Mind Master e Astral Guard modificano tutte le crescite",
      run() {
        const mind = astralEngine(["astral_water_11"], ["astral_fire_02"]);
        mind.playMove("player", { type: "play", cardId: "astral_water_11", slot: 0 });
        assert(A.SCHOOLS.every(school => mind.state.player.powerGain[school.id] === 2), "Mind Master non aumenta tutte le scuole");
        mind.state.player.board[0].currentHealth = 0;
        A.astralCleanupDeaths(mind, []);
        assert(A.SCHOOLS.every(school => mind.state.player.powerGain[school.id] === 1), "Bonus Mind Master non rimosso");

        const guard = astralEngine(["astral_water_12"], ["astral_fire_02"]);
        guard.playMove("player", { type: "play", cardId: "astral_water_12", slot: 0 });
        assert(A.SCHOOLS.every(school => guard.state.enemy.powerGain[school.id] === 0), "Astral Guard non riduce tutte le scuole nemiche");
      }
    },
    {
      name: "Più Ice Guard dimezzano ripetutamente il danno",
      run() {
        const engine = astralEngine(["astral_fire_02"], ["astral_water_06"]);
        const attacker = placeAstralUnit(engine, "player", "astral_earth_13", 0);
        attacker.attack = 20;
        placeAstralUnit(engine, "enemy", "astral_water_06", 1);
        placeAstralUnit(engine, "enemy", "astral_water_06", 2);
        engine.state.phase = A.PHASES.PLAYER_ATTACK;
        const step = engine.attackNext("player");
        assert(step.event.damage === 5, `Doppio dimezzamento: ${step.event.damage}`);
      }
    }

    ,{
      name: "I gruppi di specializzazione sostituiscono il loadout tra le tre leghe",
      run() {
        assert(JSON.stringify(A.getAstralAbilityLoadout("battlemage", "starting")) === JSON.stringify([11,30]), "BattleMage Starting errato");
        assert(JSON.stringify(A.getAstralAbilityLoadout("battlemage", "advanced")) === JSON.stringify([1,23,30]), "BattleMage Advanced errato");
        assert(JSON.stringify(A.getAstralAbilityLoadout("battlemage", "major")) === JSON.stringify([6,1,23,30]), "BattleMage Major errato");
        const wizardMajor = A.getAstralAbilityLoadout("wizard", "major");
        assert(JSON.stringify(wizardMajor) === JSON.stringify([29,36,37]), "Wizard Major errato");
        assert(!wizardMajor.includes(35), "Meditation non deve restare nel Major loadout");
      }
    },
    {
      name: "Il GameEngine assegna automaticamente il loadout della lega",
      run() {
        const engine = astralEngine(["astral_fire_01"], ["astral_water_01"], {
          playerSpecialization: "stormmage",
          enemySpecialization: "druid",
          astralLeague: "advanced"
        });
        assert(JSON.stringify(engine.state.player.astralAbilityIds) === JSON.stringify([2,28,31]), "Loadout StormMage non assegnato");
        assert(JSON.stringify(engine.state.enemy.astralAbilityIds) === JSON.stringify([4,26,33]), "Loadout Druid non assegnato");
        assert(engine.state.player.passives.includes("astral_nets"), "Astral Nets non attivata");
        assert(engine.state.enemy.passives.includes("healing_aura"), "Healing Aura non attivata");
      }
    },
    {
      name: "I Lord aumentano a 2 la crescita della propria scuola",
      run() {
        const engine = astralEngine(["astral_fire_01"], ["astral_water_01"], {
          playerAstralAbilities: [6],
          enemyAstralAbilities: [7],
          preserveAbilitySetup: true
        });
        assert(engine.state.player.powerGain.fire === 2, `Fire Lord: ${engine.state.player.powerGain.fire}`);
        assert(engine.state.player.powerGain.water === 1, "Fire Lord ha modificato una scuola estranea");
        assert(engine.state.enemy.powerGain.water === 2, `Water Lord: ${engine.state.enemy.powerGain.water}`);
      }
    },
    {
      name: "Life Knowledge e Life Penalty modificano vita iniziale e massimo",
      run() {
        const engine = astralEngine(["astral_fire_01"], ["astral_water_01"], {
          playerAstralAbilities: [37],
          enemyAstralAbilities: [20]
        });
        assert(engine.state.player.hp === 70 && engine.state.player.maxHp === 70, "Life Knowledge non applicata");
        assert(engine.state.enemy.hp === 35 && engine.state.enemy.maxHp === 35, "Life Penalty non applicata");
      }
    },
    {
      name: "Skeleton Master e Faery Master schierano creature senza effetti di evocazione",
      run() {
        const engine = astralEngine(["astral_fire_01"], ["astral_water_01"], {
          playerAstralAbilities: [21],
          enemyAstralAbilities: [27]
        });
        assert(engine.state.player.board[0]?.id === "astral_death_01", "Skeleton iniziale mancante");
        assert(engine.state.enemy.board[0]?.id === "astral_air_01", "Faerie iniziale mancante");
        assert(engine.state.player.hp === 50, "Lo Skeleton iniziale non deve infliggere il danno di evocazione");
      }
    },
    {
      name: "Astral Nets infligge 3 danni alla creatura appena evocata",
      run() {
        const engine = astralEngine(["astral_fire_02"], ["astral_water_01"], {
          enemyAstralAbilities: [28]
        });
        const before = engine.getCard("player", "astral_fire_02").health;
        const result = engine.playMove("player", { type: "play", cardId: "astral_fire_02", slot: 0 });
        assert(result.ok, "Evocazione fallita");
        assert(engine.state.player.board[0].currentHealth === before - 3, `Astral Nets: ${engine.state.player.board[0].currentHealth}`);
      }
    },
    {
      name: "Healing Aura cura dopo la crescita dei poteri del turno",
      run() {
        const engine = astralEngine(["astral_fire_01"], ["astral_water_01"], {
          playerAstralAbilities: [26],
          preserveAbilitySetup: true
        });
        engine.state.player.hp = 40;
        engine.state.phase = A.PHASES.ENEMY_ATTACK;
        const beforePower = engine.state.player.power.fire;
        engine.finishAttack("enemy");
        assert(engine.state.player.power.fire === beforePower + 1, "Crescita potere non applicata");
        assert(engine.state.player.hp === 42, `Healing Aura: ${engine.state.player.hp}`);
      }
    },
    {
      name: "Knowledge aggiunge le carte extra al libro generato",
      run() {
        const cards = A.getCardSet("astral-original");
        const result = A.generateRecoveredAstralHands(cards, {
          seed: "knowledge-loadout",
          enemyDifficulty: "grandmaster",
          playerSpecialization: "wizard",
          enemySpecialization: "necromancer",
          playerAbilities: [29],
          enemyAbilities: [34]
        });
        const playerIds = new Set(result.player.map(card => card.id));
        ["astral_fire_10","astral_water_10","astral_air_10","astral_earth_11"].forEach(id => assert(playerIds.has(id), `Elementale mancante: ${id}`));
        assert(result.enemy.some(card => card.id === "astral_death_13"), "Greater Demon mancante");
      }
    }

    ,{
      name: "Gli ID delle abilità runtime vengono convertiti nei passivi corretti",
      run() {
        const keys=A.getAstralRuntimePassiveKeys([22,23,24,25,26,28]);
        assert(JSON.stringify(keys)===JSON.stringify(["souldrinker","fire_aura","battle_lord","stone_skin","healing_aura","astral_nets"]),`Passivi: ${keys.join(",")}`);
      }
    },
    {
      name: "Le morti simultanee partono dal campo opposto all'attore e seguono gli slot",
      run() {
        const engine = astralEngine(["astral_fire_02"], ["astral_water_07"]);
        const makeDead = (side, id, slot) => {
          const card = A.deepClone(A.getCardSet("astral-original").find(item => item.id === id));
          card.currentHealth = 0;
          card.instanceId = `${side}-${slot}-${id}`;
          engine.state[side].board[slot] = card;
        };
        makeDead("enemy", "astral_water_07", 0);
        makeDead("enemy", "astral_fire_02", 3);
        makeDead("player", "astral_fire_02", 1);
        makeDead("player", "astral_water_07", 4);
        const events = [];
        A.astralCleanupDeaths(engine, events, "player");
        const order = events.filter(event => event.type === "astralDeath").map(event => `${event.side}:${event.slot}`);
        assert(JSON.stringify(order) === JSON.stringify(["enemy:0", "enemy:3", "player:1", "player:4"]), `Ordine morti: ${order.join(", ")}`);
      }
    },
    {
      name: "Nel turno avversario le morti partono dal campo del giocatore",
      run() {
        const engine = astralEngine(["astral_fire_02"], ["astral_water_07"]);
        const makeDead = (side, id, slot) => {
          const card = A.deepClone(A.getCardSet("astral-original").find(item => item.id === id));
          card.currentHealth = 0;
          card.instanceId = `${side}-${slot}-${id}`;
          engine.state[side].board[slot] = card;
        };
        makeDead("player", "astral_fire_02", 0);
        makeDead("enemy", "astral_water_07", 0);
        const events = [];
        A.astralCleanupDeaths(engine, events, "enemy");
        const order = events.filter(event => event.type === "astralDeath").map(event => `${event.side}:${event.slot}`);
        assert(JSON.stringify(order) === JSON.stringify(["player:0", "enemy:0"]), `Ordine morti IA: ${order.join(", ")}`);
      }
    },

    {
      name: "Battle Lord e Stone Skin funzionano anche tramite ID abilità",
      run() {
        const battle=astralEngine(["astral_air_06"],["astral_fire_02"],{playerAstralAbilities:[24]});
        battle.state.player.power.air=20;
        battle.playMove("player",{type:"play",cardId:"astral_air_06"});
        assert(battle.state.enemy.hp===24,`Battle Lord danno: ${50-battle.state.enemy.hp}`);

        const skin=astralEngine(["astral_air_06"],["astral_fire_02"],{enemyAstralAbilities:[25]});
        skin.state.player.power.air=20;
        skin.playMove("player",{type:"play",cardId:"astral_air_06"});
        assert(skin.state.enemy.hp===26,`Stone Skin danno: ${50-skin.state.enemy.hp}`);
      }
    },
    {
      name: "Acqua 01–13 — matrice semantica completa",
      run() {
        const cure=astralEngine(["astral_water_01"],["astral_fire_02"]); cure.state.player.power.water=8; cure.playMove("player",{type:"play",cardId:"astral_water_01"}); assert(cure.state.player.hp===57,"Water 01: cura");
        const shaman=astralEngine(["astral_water_02"],["astral_fire_02"]); shaman.state.player.power.water=2; shaman.state.player.power.nature=4; shaman.playMove("player",{type:"play",cardId:"astral_water_02",slot:0}); assert(shaman.state.player.power.nature===5,"Water 02: +1 Terra");
        const justice=astralEngine(["astral_water_03"],["astral_fire_02","astral_water_07"]); const j1=placeAstralUnit(justice,"enemy","astral_fire_02",0,20); const j2=placeAstralUnit(justice,"enemy","astral_water_07",1,20); justice.state.player.power.water=3; justice.playMove("player",{type:"play",cardId:"astral_water_03"}); assert(j1.currentHealth===16&&j2.currentHealth===15,"Water 03: danno pari agli attacchi nemici");
        const sprite=astralEngine(["astral_water_04"],["astral_fire_02"]); placeAstralUnit(sprite,"player","astral_water_04",0); sprite.state.player.power.water=3; sprite.state.enemy.power.water=4; sprite.state.player.hp=40; sprite.state.phase=A.PHASES.PLAYER_ATTACK; const spriteStep=sprite.attackNext("player"); assert(sprite.state.player.hp===38&&spriteStep.events.some(event=>event.reason==="astral_water_04"&&event.amount===2),"Water 04: penalita pre-attacco");
        const bolt=astralEngine(["astral_water_05"],["astral_fire_02"]); bolt.state.player.power.water=5; bolt.playMove("player",{type:"play",cardId:"astral_water_05"}); assert(bolt.state.enemy.hp===42,"Water 05: Acqua+3");
        const guard=astralEngine(["astral_fire_01"],["astral_water_06"]); placeAstralUnit(guard,"enemy","astral_water_06",0); const guardEvents=[]; A.astralApplyHeroDamage(guard,"player","enemy",9,{sourceKind:"spell"},guardEvents); assert(guard.state.enemy.hp===46&&guardEvents[0].resolvedAmount===4,"Water 06: dimezzamento danno eroe");
        const toad=astralEngine(["astral_water_07"],["astral_fire_02"]); toad.state.player.power.water=7; toad.playMove("player",{type:"play",cardId:"astral_water_07",slot:0}); assert(toad.state.enemy.hp===45,"Water 07: 5 danni d'ingresso");
        const rain=astralEngine(["astral_water_08"],["astral_fire_02"]); const ownRain=placeAstralUnit(rain,"player","astral_fire_02",0,20); const enemyRain=placeAstralUnit(rain,"enemy","astral_fire_02",0,20); A.SCHOOLS.forEach(s=>rain.state.enemy.power[s.id]=3); rain.state.player.power.water=8; rain.playMove("player",{type:"play",cardId:"astral_water_08"}); assert(ownRain.currentHealth===5&&enemyRain.currentHealth===5&&A.SCHOOLS.every(s=>rain.state.enemy.power[s.id]===2),"Water 08: pioggia acida");
        const ocean=astralEngine(["astral_water_09"],["astral_fire_02"]); ocean.state.player.power.water=9; ocean.playMove("player",{type:"play",cardId:"astral_water_09",slot:0}); assert(ocean.state.player.powerGain.water===2&&ocean.state.enemy.powerGain.water===0,"Water 09: modificatori crescita"); ocean.state.player.board[0].currentHealth=0; A.astralCleanupDeaths(ocean,[],"player"); assert(ocean.state.player.powerGain.water===1&&ocean.state.enemy.powerGain.water===1,"Water 09: rimozione modificatori");
        const elemental=astralEngine(["astral_water_10"],["astral_fire_02"]); elemental.state.player.power.water=10; elemental.playMove("player",{type:"play",cardId:"astral_water_10",slot:0}); assert(A.astralEffectiveAttack(elemental,"player",elemental.state.player.board[0])===0&&elemental.state.player.powerGain.water===2,"Water 10: attacco dinamico e crescita");
        const mind=astralEngine(["astral_water_11"],["astral_fire_02"]); mind.state.player.power.water=11; mind.playMove("player",{type:"play",cardId:"astral_water_11",slot:0}); assert(A.SCHOOLS.every(s=>mind.state.player.powerGain[s.id]===2),"Water 11: crescita globale"); mind.state.player.board[0].currentHealth=0; A.astralCleanupDeaths(mind,[],"player"); assert(A.SCHOOLS.every(s=>mind.state.player.powerGain[s.id]===1),"Water 11: rimozione crescita globale");
        const astralGuard=astralEngine(["astral_water_12"],["astral_fire_02"]); astralGuard.state.player.power.water=12; astralGuard.playMove("player",{type:"play",cardId:"astral_water_12",slot:0}); assert(A.SCHOOLS.every(s=>astralGuard.state.enemy.powerGain[s.id]===0),"Water 12: penalita globale nemica"); astralGuard.state.player.board[0].currentHealth=0; A.astralCleanupDeaths(astralGuard,[],"player"); assert(A.SCHOOLS.every(s=>astralGuard.state.enemy.powerGain[s.id]===1),"Water 12: rimozione penalita globale");
        const monster=astralEngine(["astral_water_13"],["astral_fire_02"]); monster.state.player.power.water=13; monster.playMove("player",{type:"play",cardId:"astral_water_13",slot:0}); assert(monster.state.player.powerGain.water===2&&monster.state.player.powerGain.fire===0,"Water 13: crescita Acqua e penalita Fuoco propria");
      }
    },
    {
      name: "Aria 01–13 — matrice semantica completa",
      run() {
        const faerie=astralEngine(["astral_air_01","astral_air_06"],["astral_fire_02"]); placeAstralUnit(faerie,"player","astral_air_01",0); faerie.state.player.power.air=6; faerie.playMove("player",{type:"play",cardId:"astral_air_06"}); assert(faerie.state.enemy.hp===38,"Air 01: +1 danno magie");
        const griffon=astralEngine(["astral_air_02"],["astral_fire_02"]); griffon.state.player.power.air=6; griffon.playMove("player",{type:"play",cardId:"astral_air_02",slot:0}); assert(griffon.state.enemy.hp===45,"Air 02: soglia Aria");
        const priest=astralEngine(["astral_air_03"],["astral_fire_02"]); priest.state.player.power.air=3; priest.playMove("player",{type:"play",cardId:"astral_air_03",slot:0}); assert(priest.state.player.powerGain.air===2,"Air 03: crescita Aria");
        const wyvern=astralEngine(["astral_air_04"],["astral_fire_02","astral_water_07"]); const weak=placeAstralUnit(wyvern,"enemy","astral_fire_02",0,8); const strong=placeAstralUnit(wyvern,"enemy","astral_water_07",1,20); wyvern.state.player.power.air=4; wyvern.playMove("player",{type:"play",cardId:"astral_air_04",slot:0}); assert(weak.currentHealth===8&&strong.currentHealth===15,"Air 04: bersaglio con piu vita");
        const hypnosis=astralEngine(["astral_air_05"],["astral_fire_02","astral_water_07","astral_air_01"]); placeAstralUnit(hypnosis,"enemy","astral_fire_02",0); placeAstralUnit(hypnosis,"enemy","astral_water_07",1); placeAstralUnit(hypnosis,"enemy","astral_air_01",2); hypnosis.state.player.power.air=5; hypnosis.playMove("player",{type:"play",cardId:"astral_air_05"}); assert(hypnosis.state.enemy.hp===41,"Air 05: i due attacchi maggiori colpiscono il proprietario");
        const lightning=astralEngine(["astral_air_06"],["astral_fire_02"]); lightning.state.player.power.air=6; lightning.playMove("player",{type:"play",cardId:"astral_air_06"}); assert(lightning.state.enemy.hp===39,"Air 06: Aria+5");
        const phoenix=astralEngine(["astral_air_07"],["astral_fire_02"]); const bird=placeAstralUnit(phoenix,"player","astral_air_07",0,1); phoenix.state.player.power.fire=10; bird.currentHealth=0; const rebirth=[]; A.astralCleanupDeaths(phoenix,rebirth,"player"); assert(phoenix.state.player.board[0]?.currentHealth===bird.health&&rebirth.some(e=>e.type==="astralPhoenixRebirth"),"Air 07: rinascita");
        const chain=astralEngine(["astral_air_08"],["astral_fire_02"]); const chainTarget=placeAstralUnit(chain,"enemy","astral_fire_02",0,20); chain.state.player.power.air=8; chain.playMove("player",{type:"play",cardId:"astral_air_08"}); assert(chainTarget.currentHealth===13&&chain.state.enemy.hp===43,"Air 08: Aria-1 su eroe e creature");
        const tornado=astralEngine(["astral_air_09"],["astral_fire_02","astral_water_07"]); placeAstralUnit(tornado,"enemy","astral_fire_02",0,8); placeAstralUnit(tornado,"enemy","astral_water_07",1,20); tornado.state.player.power.air=9; tornado.playMove("player",{type:"play",cardId:"astral_air_09"}); assert(tornado.state.enemy.board[0]&&tornado.state.enemy.board[1]===null,"Air 09: distruzione creatura con piu vita");
        const airElemental=astralEngine(["astral_air_10"],["astral_fire_02"]); airElemental.state.player.power.air=10; airElemental.playMove("player",{type:"play",cardId:"astral_air_10",slot:0}); assert(airElemental.state.enemy.hp===43&&A.astralEffectiveAttack(airElemental,"player",airElemental.state.player.board[0])===0&&airElemental.state.player.powerGain.air===2,"Air 10: ingresso, attacco dinamico e crescita");
        const cloud=astralEngine(["astral_air_11"],["astral_fire_02","astral_water_02"]); cloud.state.player.power.air=11; cloud.playMove("player",{type:"play",cardId:"astral_air_11",slot:0}); assert(cloud.state.player.powerGain.air===0,"Air 11: penalita crescita"); placeAstralUnit(cloud,"enemy","astral_fire_02",0,20); placeAstralUnit(cloud,"enemy","astral_water_02",1,20); const cloudStep=cloud.attackUnitFromEffect("player",0); assert(cloudStep.event?.multiTarget&&cloud.state.enemy.hp===45&&cloud.state.enemy.board[0].currentHealth===15&&cloud.state.enemy.board[1].currentHealth===15,`Air 11: attacco multiplo ${cloudStep.event?.multiTarget}/${cloud.state.enemy.hp}/${cloud.state.enemy.board.map(u=>u?.currentHealth)}`);
        const archangel=astralEngine(["astral_air_12"],["astral_fire_02"]); const ally=placeAstralUnit(archangel,"player","astral_fire_02",1,5); archangel.state.player.power.air=12; archangel.playMove("player",{type:"play",cardId:"astral_air_12",slot:0}); assert(ally.currentHealth===ally.health,"Air 12: cura completa alleati");
        const titan=astralEngine(["astral_air_13"],["astral_fire_02"]); titan.state.player.power.air=13; titan.playMove("player",{type:"play",cardId:"astral_air_13",slot:0}); assert(titan.state.enemy.hp===35,"Air 13: 15 danni d'ingresso");
      }
    },
    {
      name: "Terra 01–13 — matrice semantica completa",
      run() {
        const healer=astralEngine(["astral_earth_01"],["astral_fire_02"]); placeAstralUnit(healer,"player","astral_earth_01",0); healer.state.player.hp=40; healer.state.phase=A.PHASES.PLAYER_ATTACK; healer.attackNext("player"); assert(healer.state.player.hp===42,"Earth 01: cura pre-attacco");
        const armorer=astralEngine(["astral_earth_02"],["astral_fire_02"]); placeAstralUnit(armorer,"player","astral_earth_02",0); const armorEvents=[]; A.astralApplyHeroDamage(armorer,"enemy","player",5,{sourceKind:"spell"},armorEvents); assert(armorer.state.player.hp===46&&armorEvents[0].resolvedAmount===4,"Earth 02: riduzione danno");
        const forest=astralEngine(["astral_earth_03"],["astral_fire_02","astral_water_02"]); forest.state.player.power.nature=3; forest.playMove("player",{type:"play",cardId:"astral_earth_03",slot:0}); placeAstralUnit(forest,"enemy","astral_fire_02",0,10); placeAstralUnit(forest,"enemy","astral_water_02",1,10); const forestStep=forest.attackUnitFromEffect("player",0); assert(forestStep.event?.multiTarget&&forest.state.enemy.hp===49&&forest.state.enemy.board.every(unit=>!unit||unit.currentHealth===9),`Earth 03: attacco multiplo ${forestStep.event?.multiTarget}/${forest.state.enemy.hp}/${forest.state.enemy.board.map(u=>u?.currentHealth)}`);
        const ritual=astralEngine(["astral_earth_04"],["astral_fire_02"]); const ritualAlly=placeAstralUnit(ritual,"player","astral_fire_02",0,5); ritual.state.player.hp=40; ritual.state.player.power.nature=4; ritual.playMove("player",{type:"play",cardId:"astral_earth_04"}); assert(ritual.state.player.hp===45&&ritualAlly.currentHealth===10,"Earth 04: cura eroe e alleati");
        const hermit=astralEngine(["astral_earth_05"],["astral_fire_02"]); hermit.state.player.power.nature=5; hermit.playMove("player",{type:"play",cardId:"astral_earth_05",slot:0}); assert(hermit.state.player.powerGain.nature===3,"Earth 05: +2 crescita Terra");
        const rejuvenation=astralEngine(["astral_earth_06"],["astral_fire_02"]); rejuvenation.state.player.power.nature=6; rejuvenation.playMove("player",{type:"play",cardId:"astral_earth_06"}); assert(rejuvenation.state.player.hp===62,"Earth 06: cura Terra*2");
        const nightElf=astralEngine(["astral_earth_07"],["astral_fire_02"]); nightElf.state.player.power.nature=7; nightElf.playMove("player",{type:"play",cardId:"astral_earth_07",slot:0}); assert(nightElf.state.player.powerGain.death===3&&nightElf.state.player.powerGain.nature===0,"Earth 07: modificatori incrociati");
        const troll=astralEngine(["astral_earth_08"],["astral_fire_02"]); const trollUnit=placeAstralUnit(troll,"player","astral_earth_08",0,10); troll.state.phase=A.PHASES.PLAYER_ATTACK; troll.attackNext("player"); assert(trollUnit.currentHealth===13,"Earth 08: rigenerazione 3");
        const master=astralEngine(["astral_earth_09"],["astral_fire_02"]); const masterUnit=placeAstralUnit(master,"player","astral_earth_09",0,10); const masterAlly=placeAstralUnit(master,"player","astral_fire_02",1,5); master.state.player.hp=40; master.state.phase=A.PHASES.PLAYER_ATTACK; master.attackNext("player"); assert(master.state.player.hp===42&&masterUnit.currentHealth===12&&masterAlly.currentHealth===7,"Earth 09: cura di gruppo pre-attacco");
        const lowRain=astralEngine(["astral_earth_10"],["astral_fire_02"]); const lowOwn=placeAstralUnit(lowRain,"player","astral_fire_02",0,30); const lowEnemy=placeAstralUnit(lowRain,"enemy","astral_fire_02",0,30); lowRain.state.player.power.nature=10; lowRain.playMove("player",{type:"play",cardId:"astral_earth_10"}); assert(lowOwn.currentHealth===10&&lowEnemy.currentHealth===10,"Earth 10: sotto soglia colpisce entrambi");
        const earthElemental=astralEngine(["astral_earth_11"],["astral_fire_02"]); earthElemental.state.player.power.nature=11; earthElemental.playMove("player",{type:"play",cardId:"astral_earth_11",slot:0}); assert(A.astralEffectiveAttack(earthElemental,"player",earthElemental.state.player.board[0])===0&&earthElemental.state.player.powerGain.nature===2,"Earth 11: attacco dinamico e crescita");
        const hydra=astralEngine(["astral_earth_12"],["astral_fire_02"]); hydra.state.player.power.nature=12; hydra.playMove("player",{type:"play",cardId:"astral_earth_12",slot:0}); hydra.state.player.board[0].currentHealth=30; placeAstralUnit(hydra,"enemy","astral_fire_02",0,10); const hydraStep=hydra.attackUnitFromEffect("player",0); assert(hydraStep.event?.multiTarget&&hydra.state.player.board[0].currentHealth===34&&hydra.state.enemy.hp===47&&hydra.state.enemy.board[0].currentHealth===7,"Earth 12: rigenerazione e attacco multiplo");
        const giant=astralEngine(["astral_earth_13"],["astral_fire_02","astral_water_07"]); const giantWeak=placeAstralUnit(giant,"enemy","astral_fire_02",0,15); placeAstralUnit(giant,"enemy","astral_water_07",1,20); giant.state.player.power.nature=13; giant.playMove("player",{type:"play",cardId:"astral_earth_13",slot:0}); assert(giantWeak.currentHealth===15&&giant.state.enemy.board[1].currentHealth===2,"Earth 13: 18 alla creatura con piu vita");
      }
    },
    {
      name: "Morte 01–13 — matrice semantica completa",
      run() {
        const skeleton=astralEngine(["astral_death_01"],["astral_fire_02"]); skeleton.state.player.power.death=1; skeleton.playMove("player",{type:"play",cardId:"astral_death_01",slot:0}); assert(skeleton.state.player.hp===49,"Death 01: un danno al proprietario");
        const zombie=astralEngine(["astral_death_02"],["astral_fire_02"]); const zombieUnit=placeAstralUnit(zombie,"player","astral_death_02",0,5); zombie.state.phase=A.PHASES.PLAYER_ATTACK; zombie.attackNext("player"); assert(zombieUnit.currentHealth===7,"Death 02: rigenerazione 2");
        const curse=astralEngine(["astral_death_03"],["astral_fire_02"]); A.SCHOOLS.forEach(s=>curse.state.enemy.power[s.id]=3); curse.state.player.power.death=3; curse.playMove("player",{type:"play",cardId:"astral_death_03"}); assert(curse.state.enemy.hp===49&&A.SCHOOLS.every(s=>curse.state.enemy.power[s.id]===2),"Death 03: danno e riduzione poteri");
        const keeper=astralEngine(["astral_death_04"],["astral_fire_02"]); placeAstralUnit(keeper,"player","astral_death_04",0); const doomed=placeAstralUnit(keeper,"enemy","astral_fire_02",0,1); keeper.state.player.power.death=4; doomed.currentHealth=0; A.astralCleanupDeaths(keeper,[],"player"); assert(keeper.state.player.power.death===5,"Death 04: guadagno alla morte");
        const demon=astralEngine(["astral_death_05"],["astral_fire_02"]); demon.state.player.power.death=5; demon.playMove("player",{type:"play",cardId:"astral_death_05",slot:0}); assert(demon.state.player.powerGain.fire===2,"Death 05: crescita Fuoco");
        const ghost=astralEngine(["astral_death_06"],["astral_fire_02"]); A.SCHOOLS.forEach(s=>ghost.state.enemy.power[s.id]=3); ghost.state.player.power.death=6; ghost.playMove("player",{type:"play",cardId:"astral_death_06",slot:0}); assert(A.SCHOOLS.every(s=>ghost.state.enemy.power[s.id]===2),"Death 06: riduzione poteri nemici");
        const assassin=astralEngine(["astral_death_07"],["astral_fire_02"]); assassin.state.player.power.death=7; assassin.playMove("player",{type:"play",cardId:"astral_death_07",slot:0}); assert(assassin.state.enemy.hp===41,"Death 07: 9 danni d'ingresso");
        const drain=astralEngine(["astral_death_08"],["astral_water_06"]); placeAstralUnit(drain,"enemy","astral_water_06",0); drain.state.player.hp=35; drain.state.player.power.death=10; drain.playMove("player",{type:"play",cardId:"astral_death_08"}); assert(drain.state.enemy.hp===45&&drain.state.player.hp===40,"Death 08: risucchio sul danno effettivo");
        const wall=astralEngine(["astral_death_09"],["astral_fire_02"]); placeAstralUnit(wall,"player","astral_death_09",0); const wallVictim=placeAstralUnit(wall,"enemy","astral_fire_02",0,1); wall.state.player.hp=40; wallVictim.currentHealth=0; A.astralCleanupDeaths(wall,[],"player"); assert(wall.state.player.hp===43,"Death 09: cura alla morte");
        const lich=astralEngine(["astral_death_10"],["astral_fire_02","astral_water_02"]); const lichA=placeAstralUnit(lich,"enemy","astral_fire_02",0,10); const lichB=placeAstralUnit(lich,"enemy","astral_water_02",1,10); lich.state.player.power.death=10; lich.playMove("player",{type:"play",cardId:"astral_death_10",slot:0}); assert(lichA.currentHealth===6&&lichB.currentHealth===6&&lich.state.enemy.hp===46,"Death 10: 4 a tutti i nemici");
        const vampire=astralEngine(["astral_death_11"],["astral_fire_02"]); const vampireUnit=placeAstralUnit(vampire,"player","astral_death_11",0,20); placeAstralUnit(vampire,"enemy","astral_fire_02",0,20); vampire.state.phase=A.PHASES.PLAYER_ATTACK; vampire.attackNext("player"); assert(vampireUnit.currentHealth===24,"Death 11: cura meta danno");
        const souls=astralEngine(["astral_death_12"],["astral_fire_02"]); placeAstralUnit(souls,"player","astral_fire_02",0); placeAstralUnit(souls,"enemy","astral_fire_02",0); souls.state.player.hp=40; souls.state.player.power.death=12; souls.playMove("player",{type:"play",cardId:"astral_death_12"}); assert(souls.state.player.hp===48&&souls.state.player.board[0]===null&&souls.state.enemy.board[0]===null,"Death 12: distruzione totale e cura per conteggio");
        const greater=astralEngine(["astral_death_13"],["astral_fire_02"]); A.SCHOOLS.forEach(s=>greater.state.player.power[s.id]=5); greater.state.player.power.death=13; greater.playMove("player",{type:"play",cardId:"astral_death_13",slot:0}); assert(greater.state.player.power.fire===4&&greater.state.player.power.water===4&&greater.state.player.power.air===4&&greater.state.player.power.nature===4&&greater.state.player.power.death===0,"Death 13: riduzione di tutti i poteri prima del costo");
      }
    },
    {
      name: "Fuoco 01 — Fire Spikes infligge 3 a tutte le creature nemiche",
      run() {
        const engine=astralEngine(["astral_fire_01"],["astral_fire_02","astral_water_02"]);
        const a=placeAstralUnit(engine,"enemy","astral_fire_02",0,13);
        const b=placeAstralUnit(engine,"enemy","astral_water_02",1,9);
        engine.state.player.power.fire=1;
        const result=engine.playMove("player",{type:"play",cardId:"astral_fire_01"});
        assert(a.currentHealth===10 && b.currentHealth===6,`Fire Spikes: ${a.currentHealth}/${b.currentHealth}`);
        assert(engine.state.enemy.hp===50,"Fire Spikes non deve colpire l'eroe");
        const damageEvents=result.events.filter(event=>event.type==="astralCreatureDamage");
        assert(damageEvents.length===2 && damageEvents.every(event=>event.amount===3),"Fire Spikes non ha emesso un evento per ogni bersaglio");
      }
    },
    {
      name: "Fuoco 02 — Orc usa la soglia Terra 6 e il danno non è una magia",
      run() {
        const low=astralEngine(["astral_fire_02"],["astral_water_01"]);
        placeAstralUnit(low,"player","astral_fire_12",1);
        placeAstralUnit(low,"player","astral_air_01",2);
        low.state.player.power.nature=5;
        low.state.player.power.fire=2;
        low.playMove("player",{type:"play",cardId:"astral_fire_02",slot:0});
        assert(low.state.player.hp===46,`Orc sotto soglia: ${low.state.player.hp}`);
        const high=astralEngine(["astral_fire_02"],["astral_water_01"]);
        high.state.player.power.nature=6;
        high.state.player.power.fire=2;
        high.playMove("player",{type:"play",cardId:"astral_fire_02",slot:0});
        assert(high.state.player.hp===50,"Orc a Terra 6 non deve danneggiare il caster");
      }
    },
    {
      name: "Fuoco 03 — Fire Ritual applica +5 prima del costo e -1 Acqua nemica",
      run() {
        const engine=astralEngine(["astral_fire_03"],["astral_water_01"]);
        engine.state.player.power.fire=3;
        engine.state.enemy.power.water=1;
        const result=engine.playMove("player",{type:"play",cardId:"astral_fire_03"});
        assert(engine.state.player.power.fire===5,`Fire Ritual netto: ${engine.state.player.power.fire}`);
        assert(engine.state.enemy.power.water===0,"Fire Ritual deve ridurre Acqua e fermarsi a zero");
        const changes=result.events.filter(event=>event.type==="astralPowerChange");
        assert(changes.some(event=>event.side==="player"&&event.school==="fire"&&event.delta===5),"Fire Ritual non espone il +5 separato dal costo");
        assert(changes.some(event=>event.side==="enemy"&&event.school==="water"&&event.delta===-1),"Fire Ritual non espone il -1 Acqua");
      }
    },
    {
      name: "Fuoco 04 — Fire Wall infligge 3 a tutti i nemici senza bonus Dragon",
      run() {
        const engine=astralEngine(["astral_fire_04"],["astral_fire_02","astral_water_02"]);
        placeAstralUnit(engine,"player","astral_fire_12",1);
        placeAstralUnit(engine,"player","astral_air_01",2);
        const a=placeAstralUnit(engine,"enemy","astral_fire_02",0,13);
        const b=placeAstralUnit(engine,"enemy","astral_water_02",1,9);
        engine.state.player.power.fire=4;
        engine.playMove("player",{type:"play",cardId:"astral_fire_04",slot:0});
        assert(a.currentHealth===10 && b.currentHealth===6,`Fire Wall creature: ${a.currentHealth}/${b.currentHealth}`);
        assert(engine.state.enemy.hp===47,`Fire Wall eroe: ${engine.state.enemy.hp}`);
      }
    },
    {
      name: "Fuoco 05 — Minotaur riduce di 2 Terra nemica con minimo zero",
      run() {
        const engine=astralEngine(["astral_fire_05"],["astral_water_01"]);
        engine.state.player.power.fire=5;
        engine.state.enemy.power.nature=1;
        const result=engine.playMove("player",{type:"play",cardId:"astral_fire_05",slot:0});
        assert(engine.state.enemy.power.nature===0,`Terra nemica: ${engine.state.enemy.power.nature}`);
        assert(result.events.some(event=>event.type==="astralPowerChange"&&event.school==="nature"&&event.delta===-1),"Minotaur deve esporre la riduzione effettiva limitata a zero");
      }
    },
    {
      name: "Fuoco 06 — Flame Wave usa il Fuoco pre-costo e colpisce solo creature",
      run() {
        const engine=astralEngine(["astral_fire_06"],["astral_fire_02"]);
        const target=placeAstralUnit(engine,"enemy","astral_fire_02",0,20);
        engine.state.player.power.fire=7;
        engine.playMove("player",{type:"play",cardId:"astral_fire_06"});
        assert(target.currentHealth===13,`Flame Wave danno: ${20-target.currentHealth}`);
        assert(engine.state.enemy.hp===50,"Flame Wave non deve colpire l'eroe");
        assert(engine.state.player.power.fire===1,`Costo Flame Wave: ${engine.state.player.power.fire}`);
      }
    },
    {
      name: "Fuoco 07 — Salamander colpisce tutti e riduce la crescita Fuoco finché vive",
      run() {
        const engine=astralEngine(["astral_fire_07"],["astral_fire_02","astral_water_02"]);
        engine.state.player.power.fire=7;
        const a=placeAstralUnit(engine,"enemy","astral_fire_02",0,13);
        const b=placeAstralUnit(engine,"enemy","astral_water_02",1,9);
        engine.playMove("player",{type:"play",cardId:"astral_fire_07",slot:0});
        assert(engine.state.player.powerGain.fire===0,`Crescita Fuoco: ${engine.state.player.powerGain.fire}`);
        engine.state.phase=A.PHASES.PLAYER_ATTACK;
        engine.state.attackCursor=0;
        const before=engine.state.enemy.hp;
        const normal=engine.attackNext("player");
        assert(normal.skipped && normal.reason==="summoning_sickness","Salamander appena evocata non deve attaccare normalmente");
        const step=engine.attackUnitFromEffect("player",0);
        assert(step.event.damage===2 && a.currentHealth===11 && b.currentHealth===7 && engine.state.enemy.hp===before-2,"Attacco multi-bersaglio Salamander errato");
        engine.state.player.board[0].currentHealth=0;
        A.astralCleanupDeaths(engine,[],"player");
        assert(engine.state.player.powerGain.fire===1,"La penalità Salamander deve sparire alla morte");
      }
    },
    {
      name: "Fuoco 08 — Inferno colpisce eroe e creature con formula pre-costo",
      run() {
        const engine=astralEngine(["astral_fire_08"],["astral_fire_02"]);
        const target=placeAstralUnit(engine,"enemy","astral_fire_02",0,20);
        engine.state.player.power.fire=9;
        engine.playMove("player",{type:"play",cardId:"astral_fire_08"});
        assert(target.currentHealth===12 && engine.state.enemy.hp===42,`Inferno: vita ${target.currentHealth}, eroe ${engine.state.enemy.hp}`);
        assert(engine.state.player.power.fire===1,`Costo Inferno: ${engine.state.player.power.fire}`);
      }
    },
    {
      name: "Fuoco 09 — Warlord parte da 4 interno e mostra 6 grazie alla propria aura",
      run() {
        const engine=astralEngine(["astral_fire_09"],["astral_water_01"]);
        const first=placeAstralUnit(engine,"player","astral_fire_09",0);
        assert(A.astralEffectiveAttack(engine,"player",first)===4,"Base interna Warlord deve essere 4");
        assert(A.astralCombatAttack(engine,"player",first)===6,`Warlord singolo: ${A.astralCombatAttack(engine,"player",first)}`);
        placeAstralUnit(engine,"player","astral_fire_09",1);
        assert(A.astralCombatAttack(engine,"player",first)===8,`Due Warlord: ${A.astralCombatAttack(engine,"player",first)}`);
      }
    },
    {
      name: "Fuoco 10 — Fire Elemental ha attacco dinamico, +1 crescita e danno entrata non magico",
      run() {
        const engine=astralEngine(["astral_fire_10"],["astral_fire_02"]);
        placeAstralUnit(engine,"player","astral_fire_12",1);
        placeAstralUnit(engine,"player","astral_air_01",2);
        const target=placeAstralUnit(engine,"enemy","astral_fire_02",0,20);
        engine.state.player.power.fire=10;
        engine.playMove("player",{type:"play",cardId:"astral_fire_10",slot:0});
        const unit=engine.state.player.board[0];
        assert(target.currentHealth===17 && engine.state.enemy.hp===47,"Danno entrata Elementale deve restare 3");
        assert(engine.state.player.powerGain.fire===2,"Elementale deve dare +1 crescita Fuoco");
        assert(A.astralEffectiveAttack(engine,"player",unit)===0,`L'attacco usa il Fuoco dopo il costo: ${A.astralEffectiveAttack(engine,"player",unit)}`);
      }
    },
    {
      name: "Fuoco 11 — Armageddon colpisce tutte le creature e solo l'eroe avversario",
      run() {
        const engine=astralEngine(["astral_fire_11"],["astral_fire_02"]);
        const own=placeAstralUnit(engine,"player","astral_fire_02",0,40);
        const enemy=placeAstralUnit(engine,"enemy","astral_fire_02",0,40);
        engine.state.player.power.fire=11;
        engine.playMove("player",{type:"play",cardId:"astral_fire_11"});
        assert(own.currentHealth===24 && enemy.currentHealth===24,"Armageddon deve infliggere 16 a entrambe le creature");
        assert(engine.state.player.hp===50 && engine.state.enemy.hp===34,"Armageddon deve colpire solo l'eroe avversario");
      }
    },
    {
      name: "Fuoco 12 — Dragon potenzia le magie ma non gli effetti di evocazione",
      run() {
        const spell=astralEngine(["astral_fire_01"],["astral_fire_02"]);
        placeAstralUnit(spell,"player","astral_fire_12",1);
        const target=placeAstralUnit(spell,"enemy","astral_fire_02",0,20);
        spell.state.player.power.fire=1;
        spell.playMove("player",{type:"play",cardId:"astral_fire_01"});
        assert(target.currentHealth===16,`Fire Spikes con Dragon: ${20-target.currentHealth}`);
        const summon=astralEngine(["astral_fire_13"],["astral_fire_02"]);
        placeAstralUnit(summon,"player","astral_fire_12",1);
        const summonedTarget=placeAstralUnit(summon,"enemy","astral_fire_02",0,30);
        summon.state.player.power.fire=13;
        summon.playMove("player",{type:"play",cardId:"astral_fire_13",slot:0});
        assert(summonedTarget.currentHealth===20,"Dragon non deve potenziare Efreet");
      }
    },
    {
      name: "Fuoco 13 — Efreet infligge 10 solo alle creature nemiche",
      run() {
        const engine=astralEngine(["astral_fire_13"],["astral_fire_02","astral_water_02"]);
        const a=placeAstralUnit(engine,"enemy","astral_fire_02",0,20);
        const b=placeAstralUnit(engine,"enemy","astral_water_02",1,20);
        engine.state.player.power.fire=13;
        engine.playMove("player",{type:"play",cardId:"astral_fire_13",slot:0});
        assert(a.currentHealth===10 && b.currentHealth===10,"Efreet deve infliggere 10 a tutte le creature nemiche");
        assert(engine.state.enemy.hp===50,"Efreet non deve colpire l'eroe");
      }
    },
    {
      name: "La vita degli eroi può superare il valore massimo iniziale",
      run() {
        const player=astralEngine(["astral_water_01"],["astral_fire_02"]);
        player.state.player.power.water=20;
        player.playMove("player",{type:"play",cardId:"astral_water_01"});
        assert(player.state.player.hp===63,`Cura oltre il massimo errata: ${player.state.player.hp}`);
        assert(player.state.player.maxHp===50,"Il riferimento alla vita iniziale non deve cambiare");

        const enemy=astralEngine(["astral_fire_02"],["astral_water_01"]);
        enemy.state.enemy.power.water=20;
        enemy.state.phase=A.PHASES.ENEMY_PLAY;
        enemy.playMove("enemy",{type:"play",cardId:"astral_water_01"});
        assert(enemy.state.enemy.hp===63,`Cura nemica oltre il massimo errata: ${enemy.state.enemy.hp}`);
      }
    }

  ];

  A.runFoundationTests = function runFoundationTests() {
    const results = [];
    tests.forEach(test => {
      const started = Date.now();
      try {
        test.run();
        results.push({ name: test.name, ok: true, duration: Date.now() - started });
      } catch (error) {
        results.push({ name: test.name, ok: false, error: error.message, duration: Date.now() - started });
      }
    });
    return {
      passed: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      total: results.length,
      results
    };
  };
})(window.Arcane = window.Arcane || {});
