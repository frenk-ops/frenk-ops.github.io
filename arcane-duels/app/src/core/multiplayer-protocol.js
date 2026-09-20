(function (A) {
  "use strict";

  const PROTOCOL_VERSION = 3;
  const COMMANDS = Object.freeze({
    SELECT: "SELECT",
    CANCEL_SELECTION: "CANCEL_SELECTION",
    PLAY: "PLAY",
    PASS: "PASS",
    ATTACK_NEXT: "ATTACK_NEXT",
    FINISH_ATTACK: "FINISH_ATTACK",
    BEGIN_PLAY: "BEGIN_PLAY"
  });

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === "object") {
      return Object.keys(value).sort().reduce((result, key) => {
        if (value[key] !== undefined) result[key] = canonicalize(value[key]);
        return result;
      }, {});
    }
    return value;
  }

  function stableStringify(value) {
    return JSON.stringify(canonicalize(value));
  }

  function checksum(value) {
    const text = stableStringify(value);
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function stateChecksum(engine) {
    return checksum(engine.snapshot());
  }

  function expectedActor(engine) {
    const phase = engine.state.phase;
    if ([A.PHASES.PLAYER_SELECT, A.PHASES.PLAYER_TARGET, A.PHASES.PLAYER_ATTACK].includes(phase)) return "player";
    if ([A.PHASES.ENEMY_THINK, A.PHASES.ENEMY_PLAY, A.PHASES.ENEMY_ATTACK].includes(phase)) return "enemy";
    return null;
  }

  function applyCommand(engine, command) {
    const payload = command.payload || {};
    switch (command.type) {
      case COMMANDS.SELECT:
        return engine.selectCard(String(payload.cardId || ""));
      case COMMANDS.CANCEL_SELECTION:
        return engine.cancelSelection()
          ? { ok: true, phase: engine.state.phase }
          : { ok: false, reason: "Non c'è una selezione da annullare." };
      case COMMANDS.PLAY:
        return engine.playMove(command.actor, {
          type: "play",
          cardId: String(payload.cardId || ""),
          slot: payload.slot === null || payload.slot === undefined ? null : Number(payload.slot)
        });
      case COMMANDS.PASS:
        return engine.pass(command.actor);
      case COMMANDS.ATTACK_NEXT:
        return engine.attackNext(command.actor);
      case COMMANDS.FINISH_ATTACK:
        return engine.finishAttack(command.actor);
      case COMMANDS.BEGIN_PLAY:
        if (command.actor !== "enemy") return { ok: false, reason: "Solo il lato nemico può iniziare questa fase." };
        return engine.beginEnemyPlay()
          ? { ok: true, phase: engine.state.phase }
          : { ok: false, reason: "La fase di gioco nemica non può iniziare adesso." };
      default:
        return { ok: false, reason: `Comando non supportato: ${command.type}.` };
    }
  }

  class CommandSession {
    constructor(engine, options = {}) {
      if (!engine?.snapshot || !engine?.state) throw new Error("È richiesto un GameEngine valido.");
      this.engine = engine;
      this.matchId = String(options.matchId || `duel:${engine.state.seed}`);
      this.sequence = Number(options.sequence || 0);
      this.initialSnapshot = A.deepClone(options.initialSnapshot || engine.snapshot());
      this.history = [];
    }

    get checksum() {
      return stateChecksum(this.engine);
    }

    createCommand(actor, type, payload = {}) {
      return {
        protocolVersion: PROTOCOL_VERSION,
        matchId: this.matchId,
        sequence: this.sequence + 1,
        actor,
        type,
        payload: A.deepClone(payload),
        previousChecksum: this.checksum
      };
    }

    dispatch(command) {
      const before = this.engine.snapshot();
      const beforeChecksum = checksum(before);
      const reject = reason => ({ ok: false, reason, sequence: this.sequence, checksum: beforeChecksum });
      const rollback = () => {
        this.engine.rules = A.deepClone(before.rules);
        this.engine.state = A.deepClone(before.state);
      };

      if (!command || typeof command !== "object") return reject("Comando non valido.");
      if (command.protocolVersion !== PROTOCOL_VERSION) return reject("Versione del protocollo incompatibile.");
      if (command.matchId !== this.matchId) return reject("Il comando appartiene a un'altra partita.");
      if (command.sequence !== this.sequence + 1) return reject("Sequenza del comando non valida.");
      if (command.previousChecksum !== beforeChecksum) return reject("Stato desincronizzato.");
      if (!["player", "enemy"].includes(command.actor)) return reject("Giocatore non valido.");
      if (expectedActor(this.engine) !== command.actor) return reject("Il comando non appartiene al giocatore attivo.");

      let result;
      try {
        result = applyCommand(this.engine, command);
        if (!result?.ok) {
          rollback();
          return reject(result?.reason || "Comando rifiutato.");
        }
        if (typeof A.restoreGameSnapshot === "function") A.restoreGameSnapshot(this.engine.snapshot());
      } catch (error) {
        rollback();
        return reject(`Comando annullato: ${error?.message || "errore interno"}`);
      }

      this.sequence = command.sequence;
      const accepted = A.deepClone(command);
      this.history.push(accepted);
      return {
        ok: true,
        sequence: this.sequence,
        checksum: this.checksum,
        command: accepted,
        result
      };
    }

    exportReplay() {
      return {
        protocolVersion: PROTOCOL_VERSION,
        matchId: this.matchId,
        initialSnapshot: A.deepClone(this.initialSnapshot),
        commands: A.deepClone(this.history),
        finalChecksum: this.checksum
      };
    }
  }

  function replayCommands(replay, cards) {
    if (replay?.protocolVersion !== PROTOCOL_VERSION) throw new Error("Versione replay incompatibile.");
    const engine = A.GameEngine.fromSnapshot(replay.initialSnapshot, cards);
    const session = new CommandSession(engine, {
      matchId: replay.matchId,
      initialSnapshot: replay.initialSnapshot
    });
    for (const command of replay.commands || []) {
      const outcome = session.dispatch(command);
      if (!outcome.ok) throw new Error(`Replay interrotto al comando ${command.sequence}: ${outcome.reason}`);
    }
    if (replay.finalChecksum && replay.finalChecksum !== session.checksum) {
      throw new Error("Checksum finale del replay non valido.");
    }
    return session;
  }

  A.MULTIPLAYER_PROTOCOL_VERSION = PROTOCOL_VERSION;
  A.MULTIPLAYER_COMMANDS = COMMANDS;
  A.stableStringify = stableStringify;
  A.stateChecksum = stateChecksum;
  A.CommandSession = CommandSession;
  A.replayCommands = replayCommands;
})(window.Arcane = window.Arcane || {});
