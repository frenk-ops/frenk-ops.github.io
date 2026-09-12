(function (A) {
  "use strict";

  const PROFILE_KEY = "arcane-duels-profile-v013";
  const TOURNAMENT_KEY = "arcane-duels-tournament-v013";
  const REWARD_WINS = [2, 4, 6];
  const WIN_TARGET = 5;
  const LEAGUE_BY_MATCH = ["starting", "starting", "advanced", "advanced", "major", "major", "major"];
  const SPECIALIZATION_BY_TALENT = Object.freeze({
    fire: "battlemage", water: "stormmage", air: "thundermage", nature: "druid", death: "necromancer"
  });
  const normalizePlayerSpecialization = value => SPECIALIZATION_BY_TALENT[value] || value || "battlemage";

  function memoryStorage() {
    const values = {};
    return {
      getItem(key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
      setItem(key, value) { values[key] = String(value); },
      removeItem(key) { delete values[key]; }
    };
  }

  A.createDefaultProfile = function createDefaultProfile() {
    return {
      version: 1,
      tournamentsPlayed: 0,
      tournamentsWon: 0,
      duelsWon: 0,
      duelsLost: 0,
      highestRank: 0,
      trophies: [],
      victoriesByClass: Object.fromEntries(A.SCHOOLS.map(s => [s.id, 0])),
      updatedAt: new Date().toISOString()
    };
  };

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
      return { ...A.createDefaultProfile(), ...JSON.parse(target.getItem(PROFILE_KEY) || "{}") };
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
    const difficultyOrder = ["novice", "intermediate", "intermediate", "advanced", "advanced", "master", "grandmaster"];
    const opponents = A.RANKS.map((rank, index) => {
      const talent = rng.pick(A.SCHOOLS).id;
      return {
        id: `opponent-${index + 1}`,
        name: ["Mira", "Orion", "Kael", "Selene", "Vargos", "Ilyra", "Asterion"][index],
        rank,
        talent,
        specialization: SPECIALIZATION_BY_TALENT[talent] || "battlemage",
        difficulty: difficultyOrder[index],
        league: LEAGUE_BY_MATCH[index],
        passives: index < 2 ? [] : rng.shuffle(A.PASSIVES).slice(0, Math.min(2, Math.floor(index / 2))).map(p => p.id),
        defeated: false,
        result: null,
        score: 0
      };
    });
    return {
      version: 2,
      id: seed,
      seed,
      specialization: normalizePlayerSpecialization(options?.specialization),
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
    tournament.version = 2;
    tournament.setId = "astral-original";
    tournament.specialization = normalizePlayerSpecialization(tournament.specialization);
    tournament.winTarget = WIN_TARGET;
    tournament.results = Array.isArray(tournament.results) ? tournament.results : [];
    tournament.opponents = (tournament.opponents || []).map((opponent, index) => ({
      ...opponent,
      league: opponent.league || LEAGUE_BY_MATCH[index] || "major",
      specialization: opponent.specialization || SPECIALIZATION_BY_TALENT[opponent.talent] || "battlemage",
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
    const rng = A.createRng(`${tournament.seed}-reward-${tournament.wins}`);
    const available = A.PASSIVES.filter(passive => !tournament.selectedPassives.includes(passive.id));
    tournament.offeredPassives = rng.shuffle(available).slice(0, 3).map(passive => passive.id);
    tournament.pendingPassiveChoice = tournament.offeredPassives.length > 0;
    return tournament.offeredPassives;
  };

  A.selectTournamentPassive = function selectTournamentPassive(tournament, passiveId) {
    if (!tournament.pendingPassiveChoice || !tournament.offeredPassives.includes(passiveId)) return false;
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
    if (won && REWARD_WINS.includes(tournament.wins)) A.offerTournamentPassives(tournament);
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

  A.resetProgress = function resetProgress(storage) {
    const target = storage || A.getStorage();
    target.removeItem(PROFILE_KEY);
    target.removeItem(TOURNAMENT_KEY);
  };

  A.TOURNAMENT_RULES = Object.freeze({ matches: 7, winTarget: WIN_TARGET, rewardWins: Object.freeze([...REWARD_WINS]), leagues: Object.freeze([...LEAGUE_BY_MATCH]) });
})(window.Arcane = window.Arcane || {});
