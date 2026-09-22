(function (A) {
  "use strict";

  A.PASSIVES = Object.freeze([
    {
      id: "vitality",
      name: "Vitalità astrale",
      description: "+5 vita massima all'inizio di ogni duello.",
      hook: "onGameStart"
    },
    {
      id: "elemental_focus",
      name: "Concentrazione elementale",
      description: "+1 incremento per turno nella scuola del talento.",
      hook: "onGameStart"
    },
    {
      id: "battle_instinct",
      name: "Istinto di battaglia",
      description: "La prima creatura evocata in ogni duello ottiene +1 attacco.",
      hook: "onCreatureSummoned"
    },
    {
      id: "fire_aura",
      name: "Aura di ritorsione",
      description: "Una creatura che infligge danno diretto al tuo eroe subisce 2 danni.",
      hook: "onHeroDamagedByCreature"
    },
    {
      id: "arcane_reserve",
      name: "Riserva arcana",
      description: "La prima carta giocata nel duello costa 1 potere in meno.",
      hook: "modifyCost"
    }
  ]);

  A.getPassive = function getPassive(id) {
    return A.PASSIVES.find(passive => passive.id === id) || null;
  };

  A.applyGameStartPassives = function applyGameStartPassives(fighter) {
    if (fighter.passives.includes("vitality")) {
      fighter.maxHp += 5;
      fighter.hp += 5;
    }
    if (fighter.passives.includes("elemental_focus")) {
      fighter.powerGain[fighter.talent] += 1;
    }
  };

  A.modifyCostByPassives = function modifyCostByPassives(fighter, cost) {
    let result = cost;
    if (fighter.passives.includes("arcane_reserve") && !fighter.flags.arcaneReserveUsed) {
      result = Math.max(1, result - 1);
    }
    return result;
  };

  A.markCostPassivesUsed = function markCostPassivesUsed(fighter) {
    if (fighter.passives.includes("arcane_reserve")) fighter.flags.arcaneReserveUsed = true;
  };

  A.applySummonPassives = function applySummonPassives(fighter, unit) {
    if (fighter.passives.includes("battle_instinct") && !fighter.flags.battleInstinctUsed) {
      unit.attack += 1;
      fighter.flags.battleInstinctUsed = true;
      return { type: "passive", passiveId: "battle_instinct", amount: 1 };
    }
    return null;
  };
})(window.Arcane = window.Arcane || {});
