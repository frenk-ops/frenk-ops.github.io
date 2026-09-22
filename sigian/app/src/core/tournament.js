(function (A) {
  "use strict";

  const PROFILE_KEY = "arcane-duels-profile-v013";
  const TOURNAMENT_KEY = "arcane-duels-tournament-v013";
  const REWARD_WINS = [2, 4, 6];
  const WIN_TARGET = 5;
  const LEAGUE_BY_MATCH = ["starting", "starting", "advanced", "advanced", "major", "major", "major"];
  const TOURNAMENT_MODES = Object.freeze({
    league: Object.freeze({ id: "league", spellbookDistribution: "arcane", specializationsEnabled: true, evolutionEnabled: false }),
    evolution: Object.freeze({ id: "evolution", spellbookDistribution: "arcane", specializationsEnabled: true, evolutionEnabled: true }),
    custom: Object.freeze({ id: "custom", spellbookDistribution: "arcane", specializationsEnabled: true, evolutionEnabled: false })
  });
  const PASSIVE_PRIORITY_BY_SPECIALIZATION = Object.freeze({
    battlemage: Object.freeze(["fire_aura", "elemental_focus", "battle_instinct", "arcane_reserve", "vitality"]),
    stormmage: Object.freeze(["elemental_focus", "vitality", "arcane_reserve", "battle_instinct", "fire_aura"]),
    thundermage: Object.freeze(["battle_instinct", "elemental_focus", "arcane_reserve", "vitality", "fire_aura"]),
    druid: Object.freeze(["vitality", "elemental_focus", "arcane_reserve", "battle_instinct", "fire_aura"]),
    necromancer: Object.freeze(["vitality", "battle_instinct", "elemental_focus", "arcane_reserve", "fire_aura"]),
    wizard: Object.freeze(["arcane_reserve", "vitality", "battle_instinct", "elemental_focus", "fire_aura"])
  });
  const SPECIALIZATION_BY_TALENT = Object.freeze({
    fire: "battlemage", water: "stormmage", air: "thundermage", nature: "druid", death: "necromancer"
  });
  const normalizePlayerSpecialization = value => SPECIALIZATION_BY_TALENT[value] || value || "battlemage";
  const normalizeTournamentMode = value => TOURNAMENT_MODES[value] ? value : "league";
  const normalizeDistribution = value => ["arcane", "free", "mirror"].includes(value) ? value : "arcane";

  function resolveTournamentRules(options = {}) {
    const tournamentMode = normalizeTournamentMode(options.tournamentMode || options.mode);
    const preset = TOURNAMENT_MODES[tournamentMode];
    if (tournamentMode !== "custom") return { tournamentMode, ...preset };
    return {
      tournamentMode,
      id: "custom",
      spellbookDistribution: normalizeDistribution(options.spellbookDistribution),
      specializationsEnabled: options.specializationsEnabled !== false,
      evolutionEnabled: Boolean(options.evolutionEnabled)
    };
  }

  function memoryStorage() {
    const values = {};
    return {
      getItem(key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
      setItem(key, value) { values[key] = String(value); },
      removeItem(key) { delete values[key]; }
    };
  }

  const PROFILE_ACHIEVEMENTS = Object.freeze([
    Object.freeze({ id: "multi-5-wins", metric: "multiplayerWins", target: 5 }),
    Object.freeze({ id: "single-5-wins", metric: "singlePlayerWins", target: 5 }),
    Object.freeze({ id: "water-30-cards", metric: "waterCardsPlayed", target: 30 }),
    Object.freeze({ id: "turn-20-damage", metric: "maxTurnDamage", target: 20 }),
    Object.freeze({ id: "speed-5-min", metric: "fastestWinMs", target: 5 * 60 * 1000, comparison: "lte" }),
    Object.freeze({ id: "drain-100-life", metric: "lifeDrained", target: 100 })
  ]);

  function createModeStats() {
    return { played: 0, wins: 0, losses: 0, draws: 0, fastestWinMs: null };
  }

  function createPlayStats() {
    return {
      singlePlayer: createModeStats(),
      multiplayer: createModeStats(),
      creaturesPlayed: 0,
      spellsPlayed: 0,
      cardsPlayed: 0,
      cardsBySchool: Object.fromEntries(A.SCHOOLS.map(s => [s.id, 0])),
      damageDealt: 0,
      maxTurnDamage: 0,
      lifeDrained: 0
    };
  }

  function normalizeModeStats(value) {
    const base = createModeStats();
    const source = value && typeof value === "object" ? value : {};
    return {
      played: Math.max(0, Number(source.played || base.played)),
      wins: Math.max(0, Number(source.wins || base.wins)),
      losses: Math.max(0, Number(source.losses || base.losses)),
      draws: Math.max(0, Number(source.draws || base.draws)),
      fastestWinMs: Number.isFinite(Number(source.fastestWinMs)) && Number(source.fastestWinMs) > 0
        ? Number(source.fastestWinMs)
        : null
    };
  }

  function normalizePlayStats(value) {
    const base = createPlayStats();
    const source = value && typeof value === "object" ? value : {};
    return {
      ...base,
      ...source,
      singlePlayer: normalizeModeStats(source.singlePlayer),
      multiplayer: normalizeModeStats(source.multiplayer),
      cardsBySchool: {
        ...base.cardsBySchool,
        ...(source.cardsBySchool && typeof source.cardsBySchool === "object" ? source.cardsBySchool : {})
      }
    };
  }

  function achievementMetric(profile, achievement) {
    const stats = profile.stats || createPlayStats();
    switch (achievement.metric) {
      case "multiplayerWins": return stats.multiplayer.wins;
      case "singlePlayerWins": return stats.singlePlayer.wins;
      case "waterCardsPlayed": return Number(stats.cardsBySchool.water || 0);
      case "maxTurnDamage": return Number(stats.maxTurnDamage || 0);
      case "fastestWinMs": return stats.singlePlayer.fastestWinMs === null && stats.multiplayer.fastestWinMs === null
        ? null
        : Math.min(...[stats.singlePlayer.fastestWinMs, stats.multiplayer.fastestWinMs].filter(value => Number.isFinite(value)));
      case "lifeDrained": return Number(stats.lifeDrained || 0);
      default: return 0;
    }
  }

  A.createDefaultProfile = function createDefaultProfile() {
    return {
      version: 2,
      playerName: "",
      tournamentsPlayed: 0,
      tournamentsWon: 0,
      duelsWon: 0,
      duelsLost: 0,
      highestRank: 0,
      trophies: [],
      achievements: [],
      recordedMatches: [],
      stats: createPlayStats(),
      victoriesByClass: Object.fromEntries(A.SCHOOLS.map(s => [s.id, 0])),
      updatedAt: new Date().toISOString()
    };
  };

  A.evaluateProfileAchievements = function evaluateProfileAchievements(profile) {
    profile.achievements = Array.isArray(profile.achievements) ? profile.achievements : [];
    PROFILE_ACHIEVEMENTS.forEach(achievement => {
      const value = achievementMetric(profile, achievement);
      const earned = achievement.comparison === "lte"
        ? Number.isFinite(value) && value <= achievement.target
        : Number(value || 0) >= achievement.target;
      if (earned && !profile.achievements.includes(achievement.id)) profile.achievements.push(achievement.id);
    });
    return profile.achievements;
  };

  A.recordProfileCardPlay = function recordProfileCardPlay(profile, card) {
    if (!profile || !card) return profile;
    profile.stats = normalizePlayStats(profile.stats);
    profile.stats.cardsPlayed += 1;
    if (card.type === "creature") profile.stats.creaturesPlayed += 1;
    if (card.type === "spell") profile.stats.spellsPlayed += 1;
    if (card.school && Object.hasOwn(profile.stats.cardsBySchool, card.school)) {
      profile.stats.cardsBySchool[card.school] += 1;
    }
    A.evaluateProfileAchievements(profile);
    A.saveProfile(profile);
    return profile;
  };

  A.recordProfileCombat = function recordProfileCombat(profile, details = {}) {
    if (!profile) return profile;
    profile.stats = normalizePlayStats(profile.stats);
    profile.stats.damageDealt += Math.max(0, Number(details.damage || 0));
    profile.stats.lifeDrained += Math.max(0, Number(details.lifeDrained || 0));
    if (Number.isFinite(Number(details.turnDamage))) {
      profile.stats.maxTurnDamage = Math.max(profile.stats.maxTurnDamage, Math.max(0, Number(details.turnDamage)));
    }
    A.evaluateProfileAchievements(profile);
    A.saveProfile(profile);
    return profile;
  };

  A.recordProfileMatch = function recordProfileMatch(profile, details = {}) {
    if (!profile) return profile;
    profile.stats = normalizePlayStats(profile.stats);
    profile.recordedMatches = Array.isArray(profile.recordedMatches) ? profile.recordedMatches : [];
    const matchId = String(details.matchId || "");
    if (matchId && profile.recordedMatches.includes(matchId)) return profile;
    const modeKey = details.mode === "multiplayer" ? "multiplayer" : "singlePlayer";
    const stats = profile.stats[modeKey];
    const result = details.result === "win" ? "win" : details.result === "loss" ? "loss" : "draw";
    stats.played += 1;
    if (result === "win") {
      stats.wins += 1;
      const duration = Number(details.durationMs);
      if (Number.isFinite(duration) && duration > 0) {
        stats.fastestWinMs = stats.fastestWinMs === null ? duration : Math.min(stats.fastestWinMs, duration);
      }
    } else if (result === "loss") stats.losses += 1;
    else stats.draws += 1;
    if (matchId) profile.recordedMatches = [...profile.recordedMatches, matchId].slice(-100);
    A.evaluateProfileAchievements(profile);
    A.saveProfile(profile);
    return profile;
  };

  A.PROFILE_ACHIEVEMENTS = PROFILE_ACHIEVEMENTS;

  A.getStorage = function getStorage() {
    try {
      const storage = window.localStorage;
      const testKey = "__arcane_test__";
      storage.setItem(testKey, "1");
      storage.removeItem(testKey);
      return storage;
    } catch (error) {
      if (!A.__memoryStorage) A.__memoryStorage = memoryStorage();
      return A.__memoryStorage;
    }
  };

  A.loadProfile = function loadProfile(storage) {
    const target = storage || A.getStorage();
    try {
      const base = A.createDefaultProfile();
      const stored = JSON.parse(target.getItem(PROFILE_KEY) || "{}");
      const profile = {
        ...base,
        ...stored,
        version: 2,
        stats: normalizePlayStats(stored.stats),
        achievements: Array.isArray(stored.achievements) ? stored.achievements : [],
        recordedMatches: Array.isArray(stored.recordedMatches) ? stored.recordedMatches.slice(-100) : [],
        victoriesByClass: { ...base.victoriesByClass, ...(stored.victoriesByClass || {}) }
      };
      A.evaluateProfileAchievements(profile);
      return profile;
    } catch (error) {
      return A.createDefaultProfile();
    }
  };

  A.saveProfile = function saveProfile(profile, storage) {
    const target = storage || A.getStorage();
    profile.updatedAt = new Date().toISOString();
    target.setItem(PROFILE_KEY, JSON.stringify(profile));
    return profile;
  };

  A.createTournament = function createTournament(options) {
    const seed = String(options?.seed || `tournament-${Date.now()}`);
    const rng = A.createRng(seed);
    const tournamentRules = resolveTournamentRules(options || {});
    const difficultyOrder = ["novice", "intermediate", "intermediate", "advanced", "advanced", "master", "grandmaster"];
    const opponents = A.RANKS.map((rank, index) => {
      const talent = rng.pick(A.SCHOOLS).id;
      const specialization = SPECIALIZATION_BY_TALENT[talent] || "battlemage";
      return {
        id: `opponent-${index + 1}`,
        name: ["Mira", "Orion", "Kael", "Selene", "Vargos", "Ilyra", "Asterion"][index],
        rank,
        talent,
        specialization: tournamentRules.specializationsEnabled ? specialization : undefined,
        difficulty: difficultyOrder[index],
        league: LEAGUE_BY_MATCH[index],
        passives: [],
        defeated: false,
        result: null,
        score: 0
      };
    });
    const requestedSpecialization = options?.specialization;
    const availableSpecializations = (A.ASTRAL_SPECIALIZATIONS || []).map(item => item.id).filter(Boolean);
    const resolvedSpecialization = tournamentRules.specializationsEnabled
      ? (requestedSpecialization === "random"
        ? (rng.pick(availableSpecializations) || "battlemage")
        : normalizePlayerSpecialization(requestedSpecialization))
      : null;
    return {
      version: 3,
      id: seed,
      seed,
      tournamentMode: tournamentRules.tournamentMode,
      spellbookDistribution: tournamentRules.spellbookDistribution,
      specializationsEnabled: tournamentRules.specializationsEnabled,
      evolutionEnabled: tournamentRules.evolutionEnabled,
      specialization: resolvedSpecialization,
      setId: "astral-original",
      currentMatch: 0,
      points: 0,
      wins: 0,
      losses: 0,
      selectedPassives: [],
      pendingPassiveChoice: false,
      offeredPassives: [],
      opponents,
      completed: false,
      won: false,
      winTarget: WIN_TARGET,
      results: [],
      startedAt: new Date().toISOString()
    };
  };

  function normalizeTournament(tournament) {
    if (!tournament) return null;
    const legacyEvolution = Number(tournament.version || 0) < 3;
    const tournamentMode = normalizeTournamentMode(tournament.tournamentMode || (legacyEvolution ? "evolution" : "league"));
    const preset = TOURNAMENT_MODES[tournamentMode];
    tournament.version = 3;
    tournament.setId = "astral-original";
    tournament.tournamentMode = tournamentMode;
    tournament.spellbookDistribution = normalizeDistribution(tournament.spellbookDistribution || preset.spellbookDistribution);
    tournament.specializationsEnabled = tournament.specializationsEnabled !== undefined
      ? Boolean(tournament.specializationsEnabled)
      : preset.specializationsEnabled;
    tournament.evolutionEnabled = tournament.evolutionEnabled !== undefined
      ? Boolean(tournament.evolutionEnabled)
      : (legacyEvolution || preset.evolutionEnabled);
    tournament.specialization = tournament.specializationsEnabled
      ? (tournament.specialization === "random"
        ? (A.createRng(`${tournament.seed}-player-specialization`).pick((A.ASTRAL_SPECIALIZATIONS || []).map(item => item.id).filter(Boolean)) || "battlemage")
        : normalizePlayerSpecialization(tournament.specialization))
      : null;
    tournament.winTarget = WIN_TARGET;
    tournament.selectedPassives = Array.isArray(tournament.selectedPassives) ? tournament.selectedPassives : [];
    tournament.pendingPassiveChoice = tournament.evolutionEnabled && Boolean(tournament.pendingPassiveChoice);
    tournament.offeredPassives = tournament.evolutionEnabled && Array.isArray(tournament.offeredPassives) ? tournament.offeredPassives : [];
    tournament.results = Array.isArray(tournament.results) ? tournament.results : [];
    tournament.opponents = (tournament.opponents || []).map((opponent, index) => ({
      ...opponent,
      league: opponent.league || LEAGUE_BY_MATCH[index] || "major",
      specialization: tournament.specializationsEnabled
        ? (opponent.specialization || SPECIALIZATION_BY_TALENT[opponent.talent] || "battlemage")
        : undefined,
      passives: [],
      result: opponent.result || (opponent.defeated ? "win" : null),
      score: Number(opponent.score || 0)
    }));
    return tournament;
  }

  A.loadTournament = function loadTournament(storage) {
    const target = storage || A.getStorage();
    try {
      return normalizeTournament(JSON.parse(target.getItem(TOURNAMENT_KEY) || "null"));
    } catch (error) {
      return null;
    }
  };

  A.saveTournament = function saveTournament(tournament, storage) {
    const target = storage || A.getStorage();
    if (!tournament) target.removeItem(TOURNAMENT_KEY);
    else target.setItem(TOURNAMENT_KEY, JSON.stringify(tournament));
    return tournament;
  };

  A.startTournament = function startTournament(profile, options, storage) {
    const tournament = A.createTournament(options);
    profile.tournamentsPlayed += 1;
    A.saveProfile(profile, storage);
    A.saveTournament(tournament, storage);
    return tournament;
  };

  A.getTournamentLeagueForMatch = function getTournamentLeagueForMatch(tournament, matchIndex) {
    const index = Math.max(0, Math.min(Number(matchIndex ?? tournament?.currentMatch) || 0, LEAGUE_BY_MATCH.length - 1));
    return tournament?.opponents?.[index]?.league || LEAGUE_BY_MATCH[index];
  };

  A.calculateTournamentScore = function calculateTournamentScore(won, playerHp, round) {
    const life = Math.max(0, Math.trunc(Number(playerHp) || 0));
    const rounds = Math.max(1, Math.trunc(Number(round) || 1));
    const lifePoints = won ? life * 10 : 0;
    const speedBonus = won ? Math.max(0, 20 - rounds) * 5 : 0;
    return { total: won ? Math.max(10, lifePoints + speedBonus) : 0, lifePoints, speedBonus, rounds };
  };

  A.offerTournamentPassives = function offerTournamentPassives(tournament) {
    if (!tournament?.evolutionEnabled) {
      tournament.pendingPassiveChoice = false;
      tournament.offeredPassives = [];
      return [];
    }
    const rng = A.createRng(`${tournament.seed}-reward-${tournament.wins}`);
    const available = A.PASSIVES.filter(passive => !tournament.selectedPassives.includes(passive.id));
    tournament.offeredPassives = rng.shuffle(available).slice(0, 3).map(passive => passive.id);
    tournament.pendingPassiveChoice = tournament.offeredPassives.length > 0;
    return tournament.offeredPassives;
  };

  A.selectTournamentPassive = function selectTournamentPassive(tournament, passiveId) {
    if (!tournament?.evolutionEnabled || !tournament.pendingPassiveChoice || !tournament.offeredPassives.includes(passiveId)) return false;
    tournament.selectedPassives.push(passiveId);
    tournament.pendingPassiveChoice = false;
    tournament.offeredPassives = [];
    return true;
  };

  A.recordTournamentDuel = function recordTournamentDuel(profile, tournament, won, score) {
    if (!tournament || tournament.completed) return { profile, tournament };
    const opponent = tournament.opponents[tournament.currentMatch];
    const scoreDetails = typeof score === "object" && score
      ? { ...score, total: Number(score.total || 0) }
      : { total: Number(score || 0), lifePoints: 0, speedBonus: 0, rounds: null };
    if (won) {
      profile.duelsWon += 1;
      tournament.wins += 1;
      tournament.points += scoreDetails.total;
      if (opponent) opponent.defeated = true;
      profile.highestRank = Math.max(profile.highestRank, tournament.currentMatch + 1);
      profile.victoriesByClass[tournament.specialization] = (profile.victoriesByClass[tournament.specialization] || 0) + 1;
    } else {
      profile.duelsLost += 1;
      tournament.losses += 1;
      tournament.points += scoreDetails.total;
    }

    if (opponent) {
      opponent.result = won ? "win" : "loss";
      opponent.score = scoreDetails.total;
    }
    tournament.results.push({
      match: tournament.currentMatch + 1,
      opponentId: opponent?.id || null,
      won: Boolean(won),
      score: scoreDetails.total,
      lifePoints: Number(scoreDetails.lifePoints || 0),
      speedBonus: Number(scoreDetails.speedBonus || 0),
      rounds: scoreDetails.rounds
    });

    tournament.currentMatch += 1;
    if (tournament.evolutionEnabled && won && REWARD_WINS.includes(tournament.wins)) A.offerTournamentPassives(tournament);
    if (tournament.currentMatch >= tournament.opponents.length) {
      tournament.completed = true;
      tournament.won = tournament.wins >= WIN_TARGET;
      if (tournament.won) {
        profile.tournamentsWon += 1;
        profile.trophies.push({
          id: `trophy-${tournament.id}`,
          specialization: tournament.specialization,
          wins: tournament.wins,
          points: tournament.points,
          earnedAt: new Date().toISOString()
        });
      }
    }
    A.saveProfile(profile);
    A.saveTournament(tournament);
    return { profile, tournament };
  };

  A.getTournamentOpponentPassives = function getTournamentOpponentPassives(tournament, matchIndex) {
    if (!tournament?.evolutionEnabled) return [];
    const index = Math.max(0, Math.min(Number(matchIndex ?? tournament.currentMatch) || 0, (tournament.opponents?.length || 1) - 1));
    const opponent = tournament.opponents?.[index];
    const count = Math.min(
      Array.isArray(tournament.selectedPassives) ? tournament.selectedPassives.length : 0,
      A.PASSIVES.length
    );
    if (!count) return [];
    const specialization = opponent?.specialization || SPECIALIZATION_BY_TALENT[opponent?.talent] || "battlemage";
    const priority = PASSIVE_PRIORITY_BY_SPECIALIZATION[specialization] || A.PASSIVES.map(passive => passive.id);
    return priority.filter(id => A.getPassive(id)).slice(0, count);
  };

  A.getTournamentModeRules = function getTournamentModeRules(value, options = {}) {
    return resolveTournamentRules({ ...options, tournamentMode: value });
  };

  A.resetProgress = function resetProgress(storage) {
    const target = storage || A.getStorage();
    target.removeItem(PROFILE_KEY);
    target.removeItem(TOURNAMENT_KEY);
  };

  A.TOURNAMENT_MODES = TOURNAMENT_MODES;
  A.TOURNAMENT_RULES = Object.freeze({ matches: 7, winTarget: WIN_TARGET, rewardWins: Object.freeze([...REWARD_WINS]), leagues: Object.freeze([...LEAGUE_BY_MATCH]) });
})(window.Arcane = window.Arcane || {});
