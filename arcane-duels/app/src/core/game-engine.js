(function (A) {
  "use strict";

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
        version: 1,
        rulesetId: rules.id,
        seed,
        round: 1,
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
      const engine = Object.create(GameEngine.prototype);
      engine.rules = { ...A.DEFAULT_RULESET, ...(snapshot.rules || {}) };
      engine.cards = (cards || []).map(A.normalizeCard);
      engine.state = A.deepClone(snapshot.state || snapshot);
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
          instanceId: `${side}-${this.state.round}-${slot}-${card.id}`
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
      return { ok: true, events, card: A.deepClone(card), phase: this.state.phase };
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
      return { ok: true, events: [{ type: "pass", side }], phase: this.state.phase };
    }

    attackNext(side) {
      if (this.state.phase !== sideAttackPhase(side)) {
        return { ok: false, done: true, reason: "Fase di attacco non valida." };
      }
      const attacker = this.getFighter(side);
      const enemySide = this.getOpponentSide(side);
      const defender = this.getFighter(enemySide);

      while (this.state.attackCursor < this.rules.boardSize && !attacker.board[this.state.attackCursor]) {
        this.state.attackCursor += 1;
      }
      if (this.state.attackCursor >= this.rules.boardSize) {
        return { ok: true, done: true };
      }

      const slot = this.state.attackCursor;
      this.state.attackCursor += 1;
      const unit = attacker.board[slot];
      if (!unit) return { ok: true, done: false, skipped: true };

      const recoveredAstral = typeof A.isRecoveredAstralEngine === "function" && A.isRecoveredAstralEngine(this);
      if (recoveredAstral && typeof A.astralAttackUnit === "function") {
        const result = A.astralAttackUnit(this, side, slot);
        if (result.skipped || !result.event) return { ok: true, done: false, skipped: true, events: result.events || [] };
        this.addLog(result.multiTarget
          ? `${unit.name} colpisce tutti i nemici.`
          : `${unit.name} infligge ${result.event.damage} danni${result.event.type === "directAttack" ? " diretti" : ""}.`);
        return { ok: true, done: false, event: result.event, events: result.events || [] };
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
          died
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
          retaliation: null
        };
        this.addLog(`${unit.name} infligge ${unit.attack} danni diretti.`);

        if (defender.passives.includes("fire_aura")) {
          unit.currentHealth -= 2;
          const died = unit.currentHealth <= 0;
          event.retaliation = { amount: 2, died, health: Math.max(0, unit.currentHealth) };
          if (died) attacker.board[slot] = null;
        }
      }

      this.checkWinner();
      return { ok: true, done: false, event };
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
        A.astralGrowPowers(this, nextSide, []);
        this.state.activeSide = nextSide;
        this.state.pendingCardId = null;
        if (side === "player") {
          this.state.phase = A.PHASES.ENEMY_THINK;
          this.addLog("I poteri dell'avversario aumentano.");
        } else {
          this.state.round += 1;
          this.state.phase = A.PHASES.PLAYER_SELECT;
          this.addLog(`Round ${this.state.round}: i tuoi poteri elementali aumentano.`);
        }
        return { ok: true, phase: this.state.phase };
      }

      if (side === "player") {
        this.state.activeSide = "enemy";
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
      this.state.activeSide = "player";
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
})(window.Arcane = window.Arcane || {});
