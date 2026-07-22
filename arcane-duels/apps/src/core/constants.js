(function (A) {
  "use strict";

  A.SCHOOLS = Object.freeze([
    { id: "fire", name: "Fuoco", icon: "🔥" },
    { id: "water", name: "Acqua", icon: "💧" },
    { id: "air", name: "Aria", icon: "🌪️" },
    { id: "nature", name: "Terra", icon: "🌿" },
    { id: "death", name: "Morte", icon: "☠️" }
  ]);

  A.PHASES = Object.freeze({
    SETUP: "SETUP",
    PLAYER_SELECT: "PLAYER_SELECT",
    PLAYER_TARGET: "PLAYER_TARGET",
    PLAYER_ATTACK: "PLAYER_ATTACK",
    ENEMY_THINK: "ENEMY_THINK",
    ENEMY_PLAY: "ENEMY_PLAY",
    ENEMY_ATTACK: "ENEMY_ATTACK",
    ROUND_END: "ROUND_END",
    GAME_OVER: "GAME_OVER"
  });

  A.DIFFICULTIES = Object.freeze({
    novice: { id: "novice", label: "Novice Mage", recoveredLevel: 1, randomFactor: "2–9", simulatedAttackPhases: 2, searchDepth: 0, candidateLimit: 99, errorRate: 0.55 },
    intermediate: { id: "intermediate", label: "Advanced Mage", recoveredLevel: 2, randomFactor: "3–6", simulatedAttackPhases: 2, searchDepth: 0, candidateLimit: 8, errorRate: 0.28 },
    advanced: { id: "advanced", label: "Expert Mage", recoveredLevel: 3, randomFactor: "15–18", simulatedAttackPhases: 2, searchDepth: 1, candidateLimit: 6, errorRate: 0.14 },
    master: { id: "master", label: "Master Mage", recoveredLevel: 4, randomFactor: "50–52", simulatedAttackPhases: 2, searchDepth: 1, candidateLimit: 5, errorRate: 0.05 },
    grandmaster: { id: "grandmaster", label: "Archmage", recoveredLevel: 5, randomFactor: "nessuno", simulatedAttackPhases: 3, searchDepth: 2, candidateLimit: 4, errorRate: 0 }
  });

  A.DEFAULT_RULESET = Object.freeze({
    id: "foundation-0.17",
    label: "Foundation + Astral evaluator",
    boardSize: 5,
    startingHp: 45,
    initialPower: 3,
    basePowerGain: 1,
    maxPower: 99,
    handSizePerSchool: 4,
    talentHandSizePerSchool: 5,
    talentDiscount: 1,
    minimumCardCost: 1,
    oneCardPerTurn: true,
    attackAfterCreature: true,
    attackAfterSpell: true,
    noCounterattack: true,
    exclusiveCardPools: true,
    immediateCostThreshold: 3,
    lowCostThreshold: 5,
    highCostThreshold: 10,
    minImmediatePerSchool: 1,
    minLowCostPerSchool: 2,
    maxHighCostPerSchool: 1,
    maxHighCostTalentSchool: 2,
    revealedCardsOnly: true
  });

  A.RANKS = Object.freeze([
    "Apprendista",
    "Adepto",
    "Evocatore",
    "Mago da battaglia",
    "Maestro",
    "Arcimago",
    "Campione astrale"
  ]);

  A.deepClone = function deepClone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  };
})(window.Arcane = window.Arcane || {});
