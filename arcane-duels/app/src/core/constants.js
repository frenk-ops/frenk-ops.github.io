(function (A) {
  "use strict";

  A.SCHOOLS = Object.freeze([
    { id: "fire", name: "Fuoco", icon: "🔥" },
    { id: "water", name: "Acqua", icon: "💧" },
    { id: "air", name: "Aria", icon: "🌪️" },
    { id: "nature", name: "Terra", icon: "🍃" },
    { id: "death", name: "Morte", icon: "💀" }
  ]);

  const SCHOOL_ICON_SVGS = Object.freeze({
    fire: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M13.2 2.2c.5 2.6-1.6 4.1-.5 6.3.5 1.1 1.7 1.6 2.7 2.2.7-1.4.8-2.9.4-4.2 2.6 2.2 3.8 4.9 3.1 7.8-.8 3.7-3.7 6.3-7.1 6.3-3.5 0-6.5-2.6-7.2-6.2-.6-2.9.9-5.8 4.1-8.5-.1 2.3.6 4.1 2.2 5.2.8-2 .3-4.7 2.3-8.9Z"/></svg>',
    water: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.5S5.8 9.5 5.8 14a6.2 6.2 0 1 0 12.4 0C18.2 9.5 12 2.5 12 2.5Z"/></svg>',
    air: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 7.2h11.4a2.6 2.6 0 1 0-2.1-4.1"/><path d="M3 12h15.1a2.5 2.5 0 1 1-2 3.9"/><path d="M3 16.7h8.8"/></svg>',
    nature: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.4 3.4C13 3.7 6.5 6 5 11.4c-1.1 3.9 1.4 7.1 5.2 7.3 5.3.3 8.9-4.8 10.2-15.3Z"/><path class="school-icon-detail" d="M4.1 20.8c3-5.1 6.9-8.6 12.2-11"/></svg>',
    death: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 10a7 7 0 1 1 14 0c0 3-1.4 4.8-3.1 6v2.9H8.1V16C6.4 14.8 5 13 5 10Z"/><circle class="school-icon-cutout" cx="9.3" cy="10.3" r="1.6"/><circle class="school-icon-cutout" cx="14.7" cy="10.3" r="1.6"/><path class="school-icon-cutout" d="m12 13-1.1 2h2.2L12 13Z"/><path class="school-icon-detail" d="M9 19v2m3-2v2m3-2v2"/></svg>'
  });

  A.schoolIconMarkup = function schoolIconMarkup(id, className = "school-icon-svg") {
    const key = SCHOOL_ICON_SVGS[id] ? id : "fire";
    return SCHOOL_ICON_SVGS[key].replace("<svg ", `<svg class="${className} school-icon-${key}" `);
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
