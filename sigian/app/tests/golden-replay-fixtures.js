(function (A) {
  "use strict";

  A.GOLDEN_REPLAY_SCENARIOS = Object.freeze([
    {
      id: "air-spell-through-water-earth-defenses",
      playerIds: ["astral_air_06"],
      enemyIds: ["astral_water_06", "astral_earth_02"],
      setup: {
        powers: { player: { air: 6 } },
        units: [
          { side: "enemy", cardId: "astral_water_06", slot: 1 },
          { side: "enemy", cardId: "astral_earth_02", slot: 2 }
        ]
      },
      commands: [
        { actor: "player", type: "PLAY", payload: { cardId: "astral_air_06", slot: null } }
      ],
      expected: {
        checksum: "fnv1a32:e6389825",
        eventTypes: ["cardPlayed", "spell", "astralHeroDamage"],
        state: {
          phase: "PLAYER_ATTACK",
          playerHp: 50,
          enemyHp: 46,
          playerPowers: { air: 0 },
          playerBoard: [null, null, null, null, null],
          enemyBoard: [null, "astral_water_06:15", "astral_earth_02:8", null, null]
        }
      }
    },
    {
      id: "death-drain-souls-with-phoenix-and-death-triggers",
      playerIds: ["astral_death_12", "astral_air_07", "astral_death_04", "astral_death_09"],
      enemyIds: ["astral_fire_02"],
      setup: {
        hp: { player: 30 },
        powers: { player: { fire: 10, death: 12 } },
        units: [
          { side: "player", cardId: "astral_air_07", slot: 0 },
          { side: "player", cardId: "astral_death_04", slot: 1 },
          { side: "player", cardId: "astral_death_09", slot: 2 },
          { side: "enemy", cardId: "astral_fire_02", slot: 0 }
        ]
      },
      commands: [
        { actor: "player", type: "PLAY", payload: { cardId: "astral_death_12", slot: null } }
      ],
      expected: {
        checksum: "fnv1a32:0e6b92f1",
        eventTypes: [
          "cardPlayed", "spell", "astralHealHero", "astralDeath",
          "astralPhoenixRebirth", "astralDeath", "astralDeath"
        ],
        state: {
          phase: "PLAYER_ATTACK",
          playerHp: 46,
          enemyHp: 50,
          playerPowers: { fire: 10, death: 0 },
          playerBoard: ["astral_air_07:18", null, null, null, null],
          enemyBoard: [null, null, null, null, null]
        }
      }
    },
    {
      id: "water-growth-aura-removed-by-enemy-air-spell",
      playerIds: ["astral_water_09"],
      enemyIds: ["astral_air_09"],
      setup: {
        powers: { player: { water: 9 }, enemy: { air: 9 } }
      },
      commands: [
        { actor: "player", type: "PLAY", payload: { cardId: "astral_water_09", slot: 0 } },
        { actor: "player", type: "ATTACK_NEXT" },
        { actor: "player", type: "ATTACK_NEXT" },
        { actor: "player", type: "FINISH_ATTACK" },
        { actor: "enemy", type: "BEGIN_PLAY" },
        { actor: "enemy", type: "PLAY", payload: { cardId: "astral_air_09", slot: null } }
      ],
      expected: {
        checksum: "fnv1a32:60a82b50",
        eventTypes: [
          "cardPlayed", "summon", "summoningSicknessSkip",
          "astralPowerGrowth", "cardPlayed", "spell", "astralDeath"
        ],
        state: {
          phase: "ENEMY_ATTACK",
          playerHp: 50,
          enemyHp: 50,
          playerPowers: { water: 0 },
          enemyPowers: { air: 1 },
          playerPowerGain: { water: 1 },
          enemyPowerGain: { water: 1 },
          playerBoard: [null, null, null, null, null],
          enemyBoard: [null, null, null, null, null]
        }
      }
    }
  ]);
})(window.Arcane = window.Arcane || {});
