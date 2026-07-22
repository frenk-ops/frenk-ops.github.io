(function (A) {
  "use strict";

  const PROFILE_KEY = "arcane-duels-profile-v013";
  const TOURNAMENT_KEY = "arcane-duels-tournament-v013";
  const REWARD_WINS = [2, 4, 6];

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
    const opponents = A.RANKS.map((rank, index) => ({
      id: `opponent-${index + 1}`,
      name: ["Mira", "Orion", "Kael", "Selene", "Vargos", "Ilyra", "Asterion"][index],
      rank,
      talent: rng.pick(A.SCHOOLS).id,
      difficulty: difficultyOrder[index],
      passives: index < 2 ? [] : rng.shuffle(A.PASSIVES).slice(0, Math.min(2, Math.floor(index / 2))).map(p => p.id),
      defeated: false
    }));
    return {
      version: 1,
      id: seed,
      seed,
      specialization: options?.specialization || "fire",
      setId: options?.setId || "classic",
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
      startedAt: new Date().toISOString()
    };
  };

  A.loadTournament = function loadTournament(storage) {
    const target = storage || A.getStorage();
    try {
      return JSON.parse(target.getItem(TOURNAMENT_KEY) || "null");
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
    profile.tournamentsPlayed = Math.max(profile.tournamentsPlayed, 1);
    if (won) {
      profile.duelsWon += 1;
      tournament.wins += 1;
      tournament.points += Number(score || 100);
      if (opponent) opponent.defeated = true;
      profile.highestRank = Math.max(profile.highestRank, tournament.currentMatch + 1);
      profile.victoriesByClass[tournament.specialization] = (profile.victoriesByClass[tournament.specialization] || 0) + 1;
    } else {
      profile.duelsLost += 1;
      tournament.losses += 1;
      tournament.points += Number(score || 0);
    }

    tournament.currentMatch += 1;
    if (won && REWARD_WINS.includes(tournament.wins)) A.offerTournamentPassives(tournament);
    if (tournament.currentMatch >= tournament.opponents.length) {
      tournament.completed = true;
      tournament.won = tournament.wins >= Math.ceil(tournament.opponents.length * 0.7);
      if (tournament.won) {
        profile.tournamentsWon += 1;
        profile.trophies.push({
          id: `trophy-${Date.now()}`,
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
})(window.Arcane = window.Arcane || {});
