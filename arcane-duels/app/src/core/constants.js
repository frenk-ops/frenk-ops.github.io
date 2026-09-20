(function (A) {
  "use strict";

  A.SCHOOLS = Object.freeze([
    { id: "fire", name: "Fuoco", icon: "🔥" },
    { id: "water", name: "Acqua", icon: "💧" },
    { id: "air", name: "Aria", icon: "🌪️" },
    { id: "nature", name: "Terra", icon: "🍃" },
    { id: "death", name: "Morte", icon: "💀" }
  ]);

  const SCHOOL_ICON_PATHS = Object.freeze({
    fire: '<path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/>',
    water: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
    air: '<path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/>',
    nature: '<path d="M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20"/><path d="M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13"/>',
    death: '<path d="m12.5 17-.5-1-.5 1h1z"/><path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="12" r="1"/>'
  });

  A.schoolIconMarkup = function schoolIconMarkup(id, className = "school-icon-svg") {
    const key = SCHOOL_ICON_PATHS[id] ? id : "fire";
    return `<svg class="${className} school-icon-${key}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SCHOOL_ICON_PATHS[key]}</svg>`;
  };

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
    "Aspirante",
    "Adepto",
    "Duellante",
    "Evocatore",
    "Custode Arcano",
    "Arcanista",
    "Campione Astrale"
  ]);

  A.deepClone = function deepClone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  };
})(window.Arcane = window.Arcane || {});
