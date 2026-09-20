(function (A) {
  "use strict";

  const CURRENT_STATE_VERSION = 2;
  const EVENT_CONTRACT_VERSION = 1;

  const EVENT_CATEGORIES = Object.freeze({
    cardPlayed: "card", summon: "summon", spell: "spell", pass: "turn",
    laneAttack: "damage", directAttack: "damage", heroDamage: "damage", creatureDamage: "damage",
    astralHeroDamage: "damage", astralCreatureDamage: "damage", heroHeal: "heal", astralHealHero: "heal",
    astralUnitHeal: "heal", astralVampireHeal: "heal", statChange: "stat", powerChange: "power",
    astralPowerChange: "power", astralPowerReduction: "power", astralPowerGrowth: "power",
    astralDeathKeeper: "power", astralDeath: "death", astralPhoenixRebirth: "resurrection"
  });

  function normalizeEngineEvent(event) {
    if (!event || typeof event !== "object") return event;
    const normalized = { schemaVersion: EVENT_CONTRACT_VERSION, ...event };
    normalized.category = normalized.category || EVENT_CATEGORIES[normalized.type] || "effect";
    if (!normalized.targetKind) {
      if (["heroDamage", "astralHeroDamage", "heroHeal", "astralHealHero", "directAttack"].includes(normalized.type)) normalized.targetKind = "hero";
      else if (["creatureDamage", "astralCreatureDamage", "astralUnitHeal", "laneAttack", "astralDeath", "astralPhoenixRebirth"].includes(normalized.type)) normalized.targetKind = "creature";
      else if (["powerChange", "astralPowerChange", "astralPowerReduction", "astralPowerGrowth", "astralDeathKeeper"].includes(normalized.type)) normalized.targetKind = "power";
    }
    if (!normalized.targetSide && normalized.side && ["damage", "heal", "death", "resurrection"].includes(normalized.category)) normalized.targetSide = normalized.side;
    return normalized;
  }

  function normalizeEngineEvents(events) {
    return (events || []).map(normalizeEngineEvent);
  }

  function snapshotError(message) {
    throw new Error(`Snapshot non valido: ${message}`);
  }

  function migrateSnapshotState(rawState, rules) {
    const state = A.deepClone(rawState);
    const sourceVersion = state.version === undefined ? 1 : Number(state.version);
    if (!Number.isInteger(sourceVersion) || sourceVersion < 1) snapshotError("versione assente o non riconosciuta");
    if (sourceVersion > CURRENT_STATE_VERSION) snapshotError(`versione futura ${sourceVersion}`);

    if (sourceVersion < 2) {
      const enemyPhase = [A.PHASES.ENEMY_THINK, A.PHASES.ENEMY_PLAY, A.PHASES.ENEMY_ATTACK].includes(state.phase);
      state.activeSide = state.activeSide === "enemy" || enemyPhase ? "enemy" : "player";
      const round = Math.max(1, Math.trunc(Number(state.round || 1)));
      state.turnCounters = state.turnCounters || {
        player: round,
        enemy: Math.max(0, round - (state.activeSide === "player" ? 1 : 0))
      };
      ["player", "enemy"].forEach(side => {
        const fighter = state[side];
        if (!fighter || typeof fighter !== "object") return;
        fighter.maxHp = Number.isFinite(Number(fighter.maxHp)) ? Number(fighter.maxHp) : Number(rules.startingHp);
        fighter.revealedCards = Array.isArray(fighter.revealedCards) ? fighter.revealedCards : [];
        fighter.flags = {
          cardPlayedThisTurn: false,
          arcaneReserveUsed: false,
          battleInstinctUsed: false,
          ...(fighter.flags || {})
        };
        if (Array.isArray(fighter.board)) fighter.board.forEach(unit => {
          if (unit && !Array.isArray(unit.astralPowerModifiers)) unit.astralPowerModifiers = [];
        });
      });
    }
    state.version = CURRENT_STATE_VERSION;
    return state;
  }

  function validateSnapshotState(state, rules) {
    if (!state || typeof state !== "object" || Array.isArray(state)) snapshotError("stato mancante");
    if (state.version !== CURRENT_STATE_VERSION) snapshotError(`versione ${state.version}`);
    if (!Object.values(A.PHASES).includes(state.phase)) snapshotError(`fase sconosciuta ${state.phase}`);
    if (!Number.isInteger(state.round) || state.round < 1) snapshotError("round non valido");
    if (!["player", "enemy"].includes(state.activeSide)) snapshotError("lato attivo non valido");
    if (!Number.isInteger(state.attackCursor) || state.attackCursor < 0 || state.attackCursor > rules.boardSize) snapshotError("cursore di attacco non valido");
    if (!state.turnCounters || !["player", "enemy"].every(side => Number.isInteger(state.turnCounters[side]) && state.turnCounters[side] >= 0)) snapshotError("contatori turno non validi");
    if (![null, "player", "enemy", "draw"].includes(state.winner ?? null)) snapshotError("vincitore non valido");
    if (typeof state.gameOver !== "boolean") snapshotError("indicatore fine partita non valido");
    if (state.gameOver && (state.phase !== A.PHASES.GAME_OVER || !state.winner)) snapshotError("fine partita incoerente");

    ["player", "enemy"].forEach(side => {
      const fighter = state[side];
      if (!fighter || typeof fighter !== "object" || Array.isArray(fighter)) snapshotError(`combattente ${side} mancante`);
      if (!Number.isFinite(fighter.hp) || fighter.hp < 0) snapshotError(`vita ${side} non valida`);
      if (!Number.isFinite(fighter.maxHp) || fighter.maxHp < 1) snapshotError(`vita iniziale ${side} non valida`);
      if (!Array.isArray(fighter.hand)) snapshotError(`mano ${side} non valida`);
      if (!Array.isArray(fighter.board) || fighter.board.length !== rules.boardSize) snapshotError(`campo ${side} non valido`);
      if (!fighter.power || !fighter.powerGain) snapshotError(`poteri ${side} mancanti`);
      A.SCHOOLS.forEach(school => {
        const power = fighter.power[school.id];
        const gain = fighter.powerGain[school.id];
        if (!Number.isFinite(power) || power < 0 || power > rules.maxPower) snapshotError(`potere ${side}/${school.id} non valido`);
        if (!Number.isFinite(gain)) snapshotError(`crescita ${side}/${school.id} non valida`);
      });
      if (!fighter.flags || typeof fighter.flags !== "object") snapshotError(`flag ${side} mancanti`);
      if (!Array.isArray(fighter.revealedCards)) snapshotError(`carte rivelate ${side} non valide`);
      fighter.board.forEach((unit, slot) => {
        if (!unit) return;
        if (typeof unit.id !== "string" || !unit.id) snapshotError(`creatura ${side}/${slot} senza id`);
        if (!Number.isFinite(unit.currentHealth) || unit.currentHealth <= 0) snapshotError(`vita creatura ${side}/${slot} non valida`);
        if (!Number.isFinite(unit.health) || unit.health <= 0) snapshotError(`vita massima creatura ${side}/${slot} non valida`);
      });
    });
    if (state.pendingCardId !== null && state.pendingCardId !== undefined) {
      if (typeof state.pendingCardId !== "string" || !state.player.hand.some(card => card.id === state.pendingCardId)) snapshotError("carta selezionata non valida");
    }
    return state;
  }

  function restoreSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) snapshotError("contenuto mancante");
    const rawRules = snapshot.rules && typeof snapshot.rules === "object" ? snapshot.rules : {};
    const rules = { ...A.DEFAULT_RULESET, ...A.deepClone(rawRules) };
    if (!Number.isInteger(rules.boardSize) || rules.boardSize < 1 || rules.boardSize > 20) snapshotError("dimensione campo non valida");
    if (!Number.isFinite(rules.maxPower) || rules.maxPower < 1) snapshotError("limite potere non valido");
    const rawState = snapshot.state || snapshot;
    const state = validateSnapshotState(migrateSnapshotState(rawState, rules), rules);
    return { rules, state };
  }

  function makePower(rules) {
    const power = {};
    const powerGain = {};
    A.SCHOOLS.forEach(school => {
      power[school.id] = rules.initialPower;
      powerGain[school.id] = rules.basePowerGain;
    });
    return { power, powerGain };
  }

  function makeFighter(hand, talent, passives, rules, initialPowers, astralAbilityIds, allCards, side) {
    const resources = makePower(rules);
    if (initialPowers) {
      A.SCHOOLS.forEach(school => {
        if (Number.isFinite(Number(initialPowers[school.id]))) resources.power[school.id] = Number(initialPowers[school.id]);
      });
    }
    const fighter = {
      hp: rules.startingHp,
      maxHp: rules.startingHp,
      hand: hand.map(A.deepClone),
      board: Array(rules.boardSize).fill(null),
      power: resources.power,
      powerGain: resources.powerGain,
      talent,
      passives: [...(passives || [])],
      revealedCards: [],
      flags: {
        cardPlayedThisTurn: false,
        arcaneReserveUsed: false,
        battleInstinctUsed: false
      }
    };
    A.applyGameStartPassives(fighter);
    if (rules.id === A.ASTRAL_ORIGINAL_RULESET?.id && typeof A.applyAstralAbilityFighterSetup === "function") {
      A.applyAstralAbilityFighterSetup(fighter, astralAbilityIds || [], allCards || hand, side);
    }
    return fighter;
  }

  function sideAttackPhase(side) {
    return side === "player" ? A.PHASES.PLAYER_ATTACK : A.PHASES.ENEMY_ATTACK;
  }

  function sidePlayPhase(side) {
    return side === "player" ? A.PHASES.PLAYER_SELECT : A.PHASES.ENEMY_PLAY;
  }

  class GameEngine {
    constructor(options) {
      const rules = { ...A.DEFAULT_RULESET, ...(options?.rules || {}) };
      const cards = (options?.cards || A.getCardSet("classic")).map(A.normalizeCard);
      const seed = String(options?.seed || `duel-${Date.now()}`);
      const requestedPlayerTalent = options?.playerTalent || "fire";
      const spellbookDistribution = ["arcane", "free", "mirror"].includes(options?.spellbookDistribution || options?.distributionMode)
        ? (options.spellbookDistribution || options.distributionMode)
        : "arcane";
      const useRecoveredAstralSpellbook = rules.id === A.ASTRAL_ORIGINAL_RULESET?.id && typeof A.generateRecoveredAstralHands === "function";
      const astralLeagueStage = typeof A.normalizeAstralLeagueStage === "function"
        ? A.normalizeAstralLeagueStage(options?.astralLeague || options?.astralLeagueStage || "starting")
        : 1;
      const playerSpecialization = useRecoveredAstralSpellbook && typeof A.normalizeAstralSpecialization === "function"
        ? A.normalizeAstralSpecialization(options?.playerSpecialization, requestedPlayerTalent)
        : options?.playerSpecialization;
      const enemySpecialization = useRecoveredAstralSpellbook && typeof A.normalizeAstralSpecialization === "function"
        ? A.normalizeAstralSpecialization(options?.enemySpecialization, options?.enemyTalent || "water")
        : options?.enemySpecialization;
      const playerSpecializationRecord = useRecoveredAstralSpellbook && typeof A.getAstralSpecialization === "function"
        ? A.getAstralSpecialization(playerSpecialization, requestedPlayerTalent)
        : null;
      const enemySpecializationRecord = useRecoveredAstralSpellbook && typeof A.getAstralSpecialization === "function"
        ? A.getAstralSpecialization(enemySpecialization, options?.enemyTalent || "water")
        : null;
      const playerTalent = playerSpecializationRecord?.talent || requestedPlayerTalent;
      const shouldAutoPlayerAbilities = useRecoveredAstralSpellbook && (!options?.hands || Boolean(options?.playerSpecialization));
      const shouldAutoEnemyAbilities = useRecoveredAstralSpellbook && (!options?.hands || Boolean(options?.enemySpecialization));
      const resolvedPlayerAstralAbilities = options?.playerAstralAbilities ?? (shouldAutoPlayerAbilities && typeof A.getAstralAbilityLoadout === "function"
        ? A.getAstralAbilityLoadout(playerSpecialization, astralLeagueStage, playerTalent)
        : []);
      const resolvedEnemyAstralAbilities = options?.enemyAstralAbilities ?? (shouldAutoEnemyAbilities && typeof A.getAstralAbilityLoadout === "function"
        ? A.getAstralAbilityLoadout(enemySpecialization, astralLeagueStage, options?.enemyTalent || enemySpecializationRecord?.talent)
        : []);
      const handResult = options?.hands || (useRecoveredAstralSpellbook
        ? A.generateRecoveredAstralHands(cards, {
            seed,
            mode: options?.astralMode || "duel",
            distributionMode: spellbookDistribution,
            enemyDifficulty: options?.aiDifficulty || "advanced",
            playerTalent,
            enemyTalent: options?.enemyTalent || enemySpecializationRecord?.talent,
            playerSpecialization,
            enemySpecialization,
            playerAbilities: resolvedPlayerAstralAbilities,
            enemyAbilities: resolvedEnemyAstralAbilities,
            playerInitialPowers: options?.playerInitialPowers,
            enemyInitialPowers: options?.enemyInitialPowers
          })
        : A.generateHands(cards, {
            rules,
            seed,
            playerTalent,
            enemyTalent: options?.enemyTalent
          }));
      const enemyTalent = options?.enemyTalent || handResult.enemyTalent || "water";

      this.cards = cards;
      this.rules = rules;
      this.state = {
        version: CURRENT_STATE_VERSION,
        rulesetId: rules.id,
        spellbookDistribution,
        seed,
        round: 1,
        turnCounters: { player: 1, enemy: 0 },
        phase: A.PHASES.PLAYER_SELECT,
        activeSide: "player",
        pendingCardId: null,
        attackCursor: 0,
        winner: null,
        gameOver: false,
        player: makeFighter(handResult.player, playerTalent, options?.playerPassives, rules, handResult.playerPowers, resolvedPlayerAstralAbilities, cards, "player"),
        enemy: makeFighter(handResult.enemy, enemyTalent, options?.enemyPassives, rules, handResult.enemyPowers, resolvedEnemyAstralAbilities, cards, "enemy"),
        astralLeagueStage,
        playerSpecialization,
        enemySpecialization,
        log: [`Duello iniziato con seed ${seed}.`],
        generationDiagnostics: handResult.diagnostics || []
      };
    }

    static fromSnapshot(snapshot, cards) {
      const restored = restoreSnapshot(snapshot);
      const engine = Object.create(GameEngine.prototype);
      engine.rules = restored.rules;
      engine.cards = (cards || []).map(A.normalizeCard);
      engine.state = restored.state;
      return engine;
    }

    snapshot() {
      return { rules: A.deepClone(this.rules), state: A.deepClone(this.state) };
    }

    clone() {
      return GameEngine.fromSnapshot(this.snapshot(), this.cards);
    }

    getState() {
      return this.state;
    }

    getFighter(side) {
      if (!['player', 'enemy'].includes(side)) throw new Error(`Lato non valido: ${side}`);
      return this.state[side];
    }

    getOpponentSide(side) {
      return side === "player" ? "enemy" : "player";
    }

    ensureTurnCounters() {
      if (!this.state.turnCounters) {
        const round = Math.max(1, Number(this.state.round || 1));
        const activeSide = this.state.activeSide === "enemy" ? "enemy" : "player";
        this.state.turnCounters = {
          player: round,
          enemy: Math.max(0, round - (activeSide === "player" ? 1 : 0))
        };
      }
      return this.state.turnCounters;
    }

    getOwnerTurnCount(side) {
      const counters = this.ensureTurnCounters();
      return Number(counters[side] || 0);
    }

    beginSideTurn(side) {
      const counters = this.ensureTurnCounters();
      counters[side] = Number(counters[side] || 0) + 1;
      this.state.activeSide = side;
      return counters[side];
    }

    isUnitSummoningSick(unit, side = unit?.owner) {
      if (!unit || !side || !Number.isFinite(Number(unit.summonedOnOwnerTurn))) return false;
      return Number(unit.summonedOnOwnerTurn) >= this.getOwnerTurnCount(side);
    }

    canUnitAttackNormally(side, unit) {
      return Boolean(unit && unit.currentHealth > 0 && !this.isUnitSummoningSick(unit, side));
    }

    getCard(side, cardId) {
      return this.getFighter(side).hand.find(card => card.id === cardId) || null;
    }

    addLog(text) {
      this.state.log.unshift(text);
      this.state.log = this.state.log.slice(0, 30);
    }

    effectiveCost(side, card) {
      const fighter = this.getFighter(side);
      const talentDiscount = card.school === fighter.talent ? this.rules.talentDiscount : 0;
      const base = Math.max(this.rules.minimumCardCost, card.level - talentDiscount);
      return A.modifyCostByPassives(fighter, base);
    }

    getPlayability(side, card, slot = null) {
      const fighter = this.getFighter(side);
      if (this.state.gameOver) return { ok: false, reason: "La partita è terminata." };
      if (fighter.flags.cardPlayedThisTurn) return { ok: false, reason: "Hai già giocato una carta in questo turno." };
      if (side === "player" && ![A.PHASES.PLAYER_SELECT, A.PHASES.PLAYER_TARGET].includes(this.state.phase)) {
        return { ok: false, reason: "Non è il momento di giocare una carta." };
      }
      if (side === "enemy" && this.state.phase !== A.PHASES.ENEMY_PLAY) {
        return { ok: false, reason: "Non è il turno di gioco dell'avversario." };
      }
      const cost = this.effectiveCost(side, card);
      if ((fighter.power[card.school] || 0) < cost) {
        return { ok: false, reason: `Servono ${cost} punti ${card.school}; disponibili ${fighter.power[card.school] || 0}.` };
      }
      if (card.type === "creature") {
        if (!fighter.board.some(unit => unit === null)) return { ok: false, reason: "Il campo è pieno." };
        if (slot !== null && (slot < 0 || slot >= this.rules.boardSize || fighter.board[slot])) {
          return { ok: false, reason: "Lo slot selezionato non è disponibile." };
        }
      }
      return { ok: true, reason: "" };
    }

    canPlay(side, card, slot = null) {
      return this.getPlayability(side, card, slot).ok;
    }

    selectCard(cardId) {
      if (this.state.phase !== A.PHASES.PLAYER_SELECT) {
        return { ok: false, reason: "Non puoi selezionare una carta adesso." };
      }
      const card = this.getCard("player", cardId);
      if (!card) return { ok: false, reason: "Carta non trovata." };

      let playable = false;
      if(card.type === "creature" ) {
        //Trova il primo slot vuoto
        let slot = 0;
        while (slot < this.rules.boardSize && this.getFighter("player").board[slot]) {
            slot++;
        }

        if (slot === this.rules.boardSize) {
            return { ok: false, reason: "Non puoi giocarla. Il campo è pieno." };
        }
        playable = this.getPlayability("player", card, slot);
      }else{
        playable = this.getPlayability("player", card);
      }
      
      if (!playable.ok) return playable;
      this.state.pendingCardId = cardId;
      this.state.phase = A.PHASES.PLAYER_TARGET;
      return { ok: true, card: A.deepClone(card), requiresSlot: card.type === "creature" };
    }

    cancelSelection() {
      if (this.state.phase !== A.PHASES.PLAYER_TARGET) return false;
      this.state.pendingCardId = null;
      this.state.phase = A.PHASES.PLAYER_SELECT;
      return true;
    }

    playSelected(slot = null) {
      if (this.state.phase !== A.PHASES.PLAYER_TARGET || !this.state.pendingCardId) {
        return { ok: false, reason: "Prima seleziona una carta." };
      }
      const cardId = this.state.pendingCardId;
      this.state.pendingCardId = null;
      return this.playMove("player", { type: "play", cardId, slot });
    }

    legalMoves(side) {
      const fighter = this.getFighter(side);
      const moves = [];
      fighter.hand.forEach(card => {
        if (!this.canPlay(side, card)) return;
        if (card.type === "spell") {
          moves.push({ type: "play", cardId: card.id, slot: null });
        } else {
          fighter.board.forEach((unit, slot) => {
            if (!unit && this.canPlay(side, card, slot)) moves.push({ type: "play", cardId: card.id, slot });
          });
        }
      });
      moves.push({ type: "pass" });
      return moves;
    }

    playMove(side, move) {
      if (move?.type === "pass") return this.pass(side);
      const card = this.getCard(side, move?.cardId);
      if (!card) return { ok: false, reason: "Carta non trovata." };
      if (card.type === "creature") {
        const slot = move?.slot;
        if (!Number.isInteger(slot) || slot < 0 || slot >= this.rules.boardSize) {
          return { ok: false, reason: "Seleziona una casella libera sul campo per evocare la creatura." };
        }
        if (this.getFighter(side).board[slot]) {
          return { ok: false, reason: "La casella selezionata è già occupata." };
        }
      }
      const playable = this.getPlayability(side, card, move.slot ?? null);
      if (!playable.ok) {
        if (side === "player") this.state.phase = A.PHASES.PLAYER_SELECT;
        return playable;
      }

      const fighter = this.getFighter(side);
      const cost = this.effectiveCost(side, card);
      const recoveredAstral = typeof A.isRecoveredAstralEngine === "function" && A.isRecoveredAstralEngine(this);
      fighter.flags.cardPlayedThisTurn = true;
      A.markCostPassivesUsed(fighter);
      if (!fighter.revealedCards.includes(card.id)) fighter.revealedCards.push(card.id);

      // Nel binario originale gli effetti usano il potere pre-costo. Il costo viene
      // sottratto soltanto dopo la risoluzione del ramo della carta.
      if (!recoveredAstral) fighter.power[card.school] -= cost;

      const events = [{ type: "cardPlayed", side, cardId: card.id, cardName: card.name, cost, school: card.school }];
      if (card.type === "creature") {
        const slot = Number(move.slot);
        const unit = {
          ...A.deepClone(card),
          currentHealth: card.health,
          owner: side,
          instanceId: `${side}-${this.state.round}-${slot}-${card.id}`,
          summonedOnOwnerTurn: this.getOwnerTurnCount(side)
        };
        fighter.board[slot] = unit;
        const passiveEvent = A.applySummonPassives(fighter, unit);
        if (passiveEvent) events.push({ ...passiveEvent, side, slot });
        events.push({ type: "summon", side, slot, cardId: card.id, cardName: card.name });
        if (recoveredAstral && typeof A.astralOnSummon === "function") A.astralOnSummon(this, side, unit, events);
        else events.push(...A.resolveEffects(this.state, side, card, "onSummon"));
        this.addLog(`${side === "player" ? "Tu evochi" : "L'avversario evoca"} ${card.name}.`);
      } else {
        events.push({ type: "spell", side, cardId: card.id, cardName: card.name });
        if (recoveredAstral && typeof A.astralOnSpell === "function") A.astralOnSpell(this, side, card, events);
        else events.push(...A.resolveEffects(this.state, side, card, "onPlay"));
        this.addLog(`${side === "player" ? "Tu lanci" : "L'avversario lancia"} ${card.name}.`);
      }

      if (recoveredAstral) fighter.power[card.school] = Math.max(0, fighter.power[card.school] - cost);
      this.state.pendingCardId = null;
      this.state.attackCursor = 0;
      this.state.phase = sideAttackPhase(side);
      this.checkWinner();
      return { ok: true, events: normalizeEngineEvents(events), card: A.deepClone(card), phase: this.state.phase };
    }

    pass(side) {
      const expected = sidePlayPhase(side);
      const allowedPlayer = side === "player" && [A.PHASES.PLAYER_SELECT, A.PHASES.PLAYER_TARGET].includes(this.state.phase);
      const allowedEnemy = side === "enemy" && this.state.phase === expected;
      if (!allowedPlayer && !allowedEnemy) return { ok: false, reason: "Non puoi passare adesso." };
      this.state.pendingCardId = null;
      this.state.attackCursor = 0;
      this.state.phase = sideAttackPhase(side);
      this.addLog(`${side === "player" ? "Tu passi" : "L'avversario passa"}.`);
      return { ok: true, events: normalizeEngineEvents([{ type: "pass", side }]), phase: this.state.phase };
    }

    _resolveAttackAtSlot(side, slot, options = {}) {
      const attacker = this.getFighter(side);
      const enemySide = this.getOpponentSide(side);
      const defender = this.getFighter(enemySide);
      const unit = attacker.board[slot];
      if (!unit || unit.currentHealth <= 0) return { ok: true, done: false, skipped: true };

      const forcedByEffect = options.forcedByEffect === true;
      if (!forcedByEffect && this.isUnitSummoningSick(unit, side)) {
        return {
          ok: true,
          done: false,
          skipped: true,
          reason: "summoning_sickness",
          events: [{ type: "summoningSicknessSkip", side, slot, cardId: unit.id, instanceId: unit.instanceId }]
        };
      }

      const recoveredAstral = typeof A.isRecoveredAstralEngine === "function" && A.isRecoveredAstralEngine(this);
      if (recoveredAstral && typeof A.astralAttackUnit === "function") {
        const result = A.astralAttackUnit(this, side, slot, { forcedByEffect });
        if (result.skipped || !result.event) return { ok: true, done: false, skipped: true, events: normalizeEngineEvents(result.events) };
        this.addLog(result.multiTarget
          ? `${unit.name} colpisce tutti i nemici.`
          : `${unit.name} infligge ${result.event.damage} danni${result.event.type === "directAttack" ? " diretti" : ""}.`);
        return { ok: true, done: false, event: normalizeEngineEvent(result.event), events: normalizeEngineEvents(result.events) };
      }

      const target = defender.board[slot];
      let event;

      if (target) {
        target.currentHealth -= unit.attack;
        const died = target.currentHealth <= 0;
        event = {
          type: "laneAttack",
          side,
          enemySide,
          slot,
          attackerId: unit.instanceId,
          attackerName: unit.name,
          targetId: target.instanceId,
          targetName: target.name,
          damage: unit.attack,
          targetHealth: Math.max(0, target.currentHealth),
          died,
          forcedByEffect
        };
        this.addLog(`${unit.name} infligge ${unit.attack} danni a ${target.name}.`);
        if (died) defender.board[slot] = null;
      } else {
        defender.hp = Math.max(0, defender.hp - unit.attack);
        event = {
          type: "directAttack",
          side,
          enemySide,
          slot,
          attackerId: unit.instanceId,
          attackerName: unit.name,
          damage: unit.attack,
          heroHealth: defender.hp,
          retaliation: null,
          forcedByEffect
        };
        this.addLog(`${unit.name} infligge ${unit.attack} danni diretti.`);

        if (unit.attack > 0 && defender.passives.includes("fire_aura")) {
          unit.currentHealth -= 2;
          const died = unit.currentHealth <= 0;
          event.retaliation = { amount: 2, died, health: Math.max(0, unit.currentHealth) };
          if (died) attacker.board[slot] = null;
        }
      }

      this.checkWinner();
      return { ok: true, done: false, event: normalizeEngineEvent(event), events: normalizeEngineEvents([event]) };
    }

    attackNext(side) {
      if (this.state.phase !== sideAttackPhase(side)) {
        return { ok: false, done: true, reason: "Fase di attacco non valida." };
      }
      const attacker = this.getFighter(side);

      while (this.state.attackCursor < this.rules.boardSize && !attacker.board[this.state.attackCursor]) {
        this.state.attackCursor += 1;
      }
      if (this.state.attackCursor >= this.rules.boardSize) {
        return { ok: true, done: true };
      }

      const slot = this.state.attackCursor;
      this.state.attackCursor += 1;
      return this._resolveAttackAtSlot(side, slot, { forcedByEffect: false });
    }

    attackUnitFromEffect(side, slot) {
      const numericSlot = Number(slot);
      if (!Number.isInteger(numericSlot) || numericSlot < 0 || numericSlot >= this.rules.boardSize) {
        return { ok: false, done: true, reason: "Slot di attacco non valido." };
      }
      return this._resolveAttackAtSlot(side, numericSlot, { forcedByEffect: true });
    }

    finishAttack(side) {
      if (this.state.phase !== sideAttackPhase(side)) return { ok: false, reason: "L'attacco non è in corso." };
      this.state.attackCursor = 0;
      if (this.state.gameOver) {
        this.state.phase = A.PHASES.GAME_OVER;
        return { ok: true, phase: this.state.phase };
      }

      const recoveredAstral = typeof A.isRecoveredAstralEngine === "function" && A.isRecoveredAstralEngine(this);
      if (recoveredAstral && typeof A.astralGrowPowers === "function") {
        const nextSide = this.getOpponentSide(side);
        const events = [];
        A.astralGrowPowers(this, nextSide, events);
        this.beginSideTurn(nextSide);
        this.state.pendingCardId = null;
        if (side === "player") {
          this.state.phase = A.PHASES.ENEMY_THINK;
          this.addLog("I poteri dell'avversario aumentano.");
        } else {
          this.state.round += 1;
          this.state.phase = A.PHASES.PLAYER_SELECT;
          this.addLog(`Round ${this.state.round}: i tuoi poteri elementali aumentano.`);
        }
        return { ok: true, events: normalizeEngineEvents(events), phase: this.state.phase };
      }

      if (side === "player") {
        this.beginSideTurn("enemy");
        this.state.phase = A.PHASES.ENEMY_THINK;
      } else {
        this.state.phase = A.PHASES.ROUND_END;
        this.startNextRound();
      }
      return { ok: true, phase: this.state.phase };
    }

    beginEnemyPlay() {
      if (this.state.phase !== A.PHASES.ENEMY_THINK) return false;
      this.state.phase = A.PHASES.ENEMY_PLAY;
      return true;
    }

    startNextRound() {
      if (this.state.gameOver) return;
      this.state.round += 1;
      ["player", "enemy"].forEach(side => {
        const fighter = this.getFighter(side);
        fighter.flags.cardPlayedThisTurn = false;
        A.SCHOOLS.forEach(school => {
          fighter.power[school.id] = Math.min(
            this.rules.maxPower,
            fighter.power[school.id] + fighter.powerGain[school.id]
          );
        });
      });
      this.beginSideTurn("player");
      this.state.pendingCardId = null;
      this.state.phase = A.PHASES.PLAYER_SELECT;
      this.addLog(`Round ${this.state.round}: i poteri elementali aumentano.`);
    }

    checkWinner() {
      if (this.state.player.hp <= 0 || this.state.enemy.hp <= 0) {
        this.state.gameOver = true;
        if (this.state.player.hp <= 0 && this.state.enemy.hp <= 0) this.state.winner = "draw";
        else this.state.winner = this.state.enemy.hp <= 0 ? "player" : "enemy";
        this.state.phase = A.PHASES.GAME_OVER;
        this.addLog(this.state.winner === "draw" ? "Il duello termina in parità." : `${this.state.winner === "player" ? "Hai vinto" : "L'avversario ha vinto"} il duello.`);
      }
      return this.state.winner;
    }

    evaluate(side) {
      const enemySide = this.getOpponentSide(side);
      const self = this.getFighter(side);
      const enemy = this.getFighter(enemySide);
      const boardValue = fighter => fighter.board.reduce((sum, unit) => sum + (unit ? unit.attack * 1.4 + unit.currentHealth : 0), 0);
      const powerValue = fighter => A.SCHOOLS.reduce((sum, school) => sum + fighter.power[school.id] * 0.18, 0);
      return (self.hp - enemy.hp) * 2 + boardValue(self) - boardValue(enemy) + powerValue(self) - powerValue(enemy);
    }
  }

  A.GameEngine = GameEngine;
  A.GAME_STATE_VERSION = CURRENT_STATE_VERSION;
  A.ENGINE_EVENT_CONTRACT_VERSION = EVENT_CONTRACT_VERSION;
  A.normalizeEngineEvent = normalizeEngineEvent;
  A.normalizeEngineEvents = normalizeEngineEvents;
  A.restoreGameSnapshot = restoreSnapshot;
})(window.Arcane = window.Arcane || {});
