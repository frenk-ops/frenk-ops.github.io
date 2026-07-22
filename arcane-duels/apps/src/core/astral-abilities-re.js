(function (A) {
  "use strict";

  const ABILITIES = [
    null,
    { id: 1, key: "fire_mystery", name: "Fire Mystery", effect: "Start with +2 Fire power" },
    { id: 2, key: "water_mystery", name: "Water Mystery", effect: "Start with +2 Water power" },
    { id: 3, key: "air_mystery", name: "Air Mystery", effect: "Start with +2 Air power" },
    { id: 4, key: "earth_mystery", name: "Earth Mystery", effect: "Start with +2 Earth power" },
    { id: 5, key: "death_mystery", name: "Death Mystery", effect: "Start with +2 Death power" },
    { id: 6, key: "fire_lord", name: "Fire Lord", effect: "+1 Fire power growth each turn" },
    { id: 7, key: "water_lord", name: "Water Lord", effect: "+1 Water power growth each turn" },
    { id: 8, key: "air_lord", name: "Air Lord", effect: "+1 Air power growth each turn" },
    { id: 9, key: "earth_lord", name: "Earth Lord", effect: "+1 Earth power growth each turn" },
    { id: 10, key: "death_lord", name: "Death Lord", effect: "+1 Death power growth each turn" },
    { id: 11, key: "firecraft", name: "Firecraft", effect: "Start with +1 Fire power" },
    { id: 12, key: "watercraft", name: "Watercraft", effect: "Start with +1 Water power" },
    { id: 13, key: "aircraft", name: "Aircraft", effect: "Start with +1 Air power" },
    { id: 14, key: "earthcraft", name: "Earthcraft", effect: "Start with +1 Earth power" },
    { id: 15, key: "deathcraft", name: "Deathcraft", effect: "Start with +1 Death power" },
    { id: 16, key: "fire_penalty", name: "Fire Penalty", effect: "Start with -1 Fire power" },
    { id: 17, key: "water_penalty", name: "Water Penalty", effect: "Start with -1 Water power" },
    { id: 18, key: "air_penalty", name: "Air Penalty", effect: "Start with -1 Air power" },
    { id: 19, key: "earth_penalty", name: "Earth Penalty", effect: "Start with -1 Earth power" },
    { id: 20, key: "life_penalty", name: "Life Penalty", effect: "Start with -15 life" },
    { id: 21, key: "skeleton_master", name: "Skeleton Master", effect: "Start combat with 1 Skeleton" },
    { id: 22, key: "souldrinker", name: "Souldrinker", effect: "Whenever any creature dies, gain 2 life" },
    { id: 23, key: "fire_aura", name: "Fire Aura", effect: "Whenever a creature damages this mage, it loses 2 life" },
    { id: 24, key: "battle_lord", name: "Battle Lord", effect: "All damage dealt by this mage's spells +1" },
    { id: 25, key: "stone_skin", name: "Stone Skin", effect: "All damage dealt to this mage -1" },
    { id: 26, key: "healing_aura", name: "Healing Aura", effect: "Gain 2 life each turn" },
    { id: 27, key: "faery_master", name: "Faery Master", effect: "Start combat with 1 Faerie" },
    { id: 28, key: "astral_nets", name: "Astral Nets", effect: "When opponent summons a creature, it loses 3 life" },
    { id: 29, key: "elemental_knowledge", name: "Elemental Knowledge", effect: "Can summon all elementals" },
    { id: 30, key: "efreets_knowledge", name: "Efreets Knowledge", effect: "Additional Efreet creature spell" },
    { id: 31, key: "sea_knowledge", name: "Sea Knowledge", effect: "Additional Sea Monster creature spell" },
    { id: 32, key: "titans_knowledge", name: "Titans Knowledge", effect: "Additional Titan creature spell" },
    { id: 33, key: "stone_knowledge", name: "Stone Knowledge", effect: "Additional Stone Giant creature spell" },
    { id: 34, key: "hell_knowledge", name: "Hell Knowledge", effect: "Additional Greater Demon creature spell" },
    { id: 35, key: "meditation", name: "Meditation", effect: "Start with +1 to all powers" },
    { id: 36, key: "ancient_knowledge", name: "Ancient Knowledge", effect: "Start with +2 to all powers" },
    { id: 37, key: "life_knowledge", name: "Life Knowledge", effect: "Start with +20 life" }
  ];

  const SPECIALIZATIONS = [
    { id: "necromancer", name: "Necromancer", talent: "death", icon: "☠️", groups: [[15,34],[5,22,34],[10,5,22,34,1]] },
    { id: "battlemage", name: "BattleMage", talent: "fire", icon: "🔥", groups: [[11,30],[1,23,30],[6,1,23,30]] },
    { id: "druid", name: "Druid", talent: "nature", icon: "🌿", groups: [[14,33],[4,26,33],[9,4,26,33]] },
    { id: "thundermage", name: "ThunderMage", talent: "air", icon: "🌪️", groups: [[13,32],[3,27,32],[8,3,4,27,32]] },
    { id: "stormmage", name: "StormMage", talent: "water", icon: "💧", groups: [[12,31],[2,28,31],[7,2,28,31,17]] },
    { id: "wizard", name: "Wizard", talent: "fire", icon: "✨", groups: [[29],[29,35],[29,36,37]] }
  ];

  const LEAGUE_STAGE = Object.freeze({ starting: 1, advanced: 2, major: 3, 1: 1, 2: 2, 3: 3 });
  const TALENT_TO_SPECIALIZATION = Object.freeze({ fire: "battlemage", water: "stormmage", air: "thundermage", nature: "druid", earth: "druid", death: "necromancer" });
  const RUNTIME_PASSIVE_IDS = new Set([22, 23, 24, 25, 26, 28]);
  const LORD_SCHOOLS = Object.freeze({ 6: "fire", 7: "water", 8: "air", 9: "nature", 10: "death" });

  function normalizeSpecialization(value, fallbackTalent) {
    const key = String(value || "").toLowerCase().replace(/[^a-z]/g, "");
    const aliases = {
      necromancer: "necromancer", battlemage: "battlemage", druid: "druid",
      thundermage: "thundermage", stormmage: "stormmage", wizard: "wizard",
      fire: "battlemage", water: "stormmage", air: "thundermage",
      earth: "druid", nature: "druid", death: "necromancer"
    };
    return aliases[key] || TALENT_TO_SPECIALIZATION[fallbackTalent] || "battlemage";
  }

  function normalizeStage(value) {
    if (typeof value === "number") return Math.max(1, Math.min(3, Math.trunc(value)));
    return LEAGUE_STAGE[String(value || "starting").toLowerCase()] || 1;
  }

  function specialization(value, fallbackTalent) {
    const id = normalizeSpecialization(value, fallbackTalent);
    return SPECIALIZATIONS.find(item => item.id === id) || SPECIALIZATIONS[1];
  }

  function abilityLoadout(specializationValue, stageValue, fallbackTalent) {
    const spec = specialization(specializationValue, fallbackTalent);
    const stage = normalizeStage(stageValue);
    return [...spec.groups[stage - 1]];
  }

  function abilityRecords(ids) {
    return [...new Set((ids || []).map(Number).filter(id => ABILITIES[id]))].map(id => ({ ...ABILITIES[id] }));
  }

  function abilityKeys(ids) {
    return abilityRecords(ids).filter(record => RUNTIME_PASSIVE_IDS.has(record.id)).map(record => record.key);
  }

  function createStartingUnit(card, side, slot, sourceAbilityId) {
    return {
      ...A.deepClone(card),
      currentHealth: Number(card.health || card.life || 1),
      owner: side,
      instanceId: `${side}-ability-${sourceAbilityId}-${slot}-${card.id}`,
      astralPowerModifiers: [],
      startedFromAbility: sourceAbilityId
    };
  }

  function applyFighterSetup(fighter, ids, allCards, side) {
    const abilityIds = [...new Set((ids || []).map(Number).filter(id => ABILITIES[id]))];
    fighter.astralAbilityIds = abilityIds;
    fighter.astralAbilities = abilityRecords(abilityIds);
    fighter.passives = [...new Set([...(fighter.passives || []), ...abilityKeys(abilityIds)])];

    if (abilityIds.includes(20)) {
      fighter.hp = Math.max(1, fighter.hp - 15);
      fighter.maxHp = Math.max(1, fighter.maxHp - 15);
    }
    if (abilityIds.includes(37)) {
      fighter.hp += 20;
      fighter.maxHp += 20;
    }

    Object.entries(LORD_SCHOOLS).forEach(([abilityId, school]) => {
      if (abilityIds.includes(Number(abilityId))) fighter.powerGain[school] = (fighter.powerGain[school] || 0) + 1;
    });

    const startCards = [];
    if (abilityIds.includes(21)) startCards.push({ id: "astral_death_01", abilityId: 21 });
    if (abilityIds.includes(27)) startCards.push({ id: "astral_air_01", abilityId: 27 });
    startCards.forEach(entry => {
      const slot = fighter.board.findIndex(unit => !unit);
      const card = (allCards || []).find(candidate => candidate.id === entry.id);
      if (slot >= 0 && card) fighter.board[slot] = createStartingUnit(card, side, slot, entry.abilityId);
    });
    return fighter;
  }

  A.ASTRAL_ABILITIES = Object.freeze(ABILITIES.map(item => item ? Object.freeze({ ...item }) : null));
  A.ASTRAL_SPECIALIZATIONS = Object.freeze(SPECIALIZATIONS.map(item => Object.freeze({ ...item, groups: item.groups.map(group => Object.freeze([...group])) })));
  A.ASTRAL_ABILITY_RE = Object.freeze({
    specializationTableAddress: "0x478330",
    profileAbilityOffset: "0x2C",
    hasAbilityAddress: "0x44B3CC",
    tournamentCopyRange: "0x43AB90–0x43ABF9",
    prepareDuelRange: "0x446BE7–0x446C58",
    lordGrowthRange: "0x447788–0x4477CF",
    groupSemantics: "direct replacement loadout by league; not cumulative and not a choice"
  });
  A.normalizeAstralSpecialization = normalizeSpecialization;
  A.normalizeAstralLeagueStage = normalizeStage;
  A.getAstralSpecialization = specialization;
  A.getAstralAbilityLoadout = abilityLoadout;
  A.getAstralAbilityRecords = abilityRecords;
  A.getAstralRuntimePassiveKeys = abilityKeys;
  A.applyAstralAbilityFighterSetup = applyFighterSetup;
})(window.Arcane = window.Arcane || {});
