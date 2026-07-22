(function (A) {
  "use strict";

  A.ASTRAL_ORIGINAL_RULESET = Object.freeze({
    id: "astral-original-recovered",
    label: "Astral Tournament — regole recuperate",
    boardSize: 5,
    startingHp: 50,
    initialPower: 3,
    basePowerGain: 1,
    maxPower: 99,
    talentDiscount: 0,
    minimumCardCost: 1,
    oneCardPerTurn: true,
    attackAfterCreature: true,
    attackAfterSpell: true,
    noCounterattack: true,
    cardLevelIsCost: true,
    permanentHand: true,
    revealedCardsOnly: true,
    recoveredSpellbook: true,
    randomLevel13Cards: false,
    playerBaseCardCount: 20,
    wizardBaseCardCount: 24
  });

  A.ASTRAL_LEAGUES = Object.freeze([
    { id: "starting", label: "Starting League", raw: Object.freeze([75, 5, 3, 100]), abilityStage: 1 },
    { id: "advanced", label: "Advanced League", raw: Object.freeze([200, 7, 5, 250]), abilityStage: 2 },
    { id: "major", label: "Major League", raw: Object.freeze([400, 10, 8, 750]), abilityStage: 3 }
  ]);

  A.ASTRAL_AI_LEVELS = Object.freeze([
    { id: 1, label: "Novice Mage", recovered: true },
    { id: 2, label: "Advanced Mage", recovered: true },
    { id: 3, label: "Expert Mage", recovered: true },
    { id: 4, label: "Master Mage", recovered: true },
    { id: 5, label: "Archmage", recovered: true }
  ]);

  A.applyAstralLeaguePowers = function applyAstralLeaguePowers(engine, leagueId) {
    // Compatibilità con i vecchi checkpoint: i quattro valori della tabella di
    // lega non sono più interpretati come poteri iniziali. Il generatore 0x446A9C
    // costruisce i poteri base 20/19 e applica poi le abilità del loadout.
    const league = A.ASTRAL_LEAGUES.find(item => item.id === leagueId) || A.ASTRAL_LEAGUES[0];
    engine.state.astralLeague = league.id;
    engine.state.astralLeagueStage = league.abilityStage;
    engine.state.log.unshift(`${league.label}: loadout abilità stadio ${league.abilityStage}.`);
    return league;
  };

})(window.Arcane = window.Arcane || {});
