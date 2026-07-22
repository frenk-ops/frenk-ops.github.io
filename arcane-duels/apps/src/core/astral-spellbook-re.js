(function (A) {
  "use strict";

  const SCHOOL_ORDER = Object.freeze(["fire", "water", "air", "nature", "death"]);
  const SCHOOL_INDEX = Object.freeze(Object.fromEntries(SCHOOL_ORDER.map((school, index) => [school, index + 1])));

  const AI_CARD_COUNTS = Object.freeze({
    novice: 15,
    intermediate: 15,
    advanced: 17,
    master: 20,
    grandmaster: 20
  });

  const ABILITY = Object.freeze({
    ELEMENTAL_KNOWLEDGE: 29,
    EFREETS_KNOWLEDGE: 30,
    SEA_KNOWLEDGE: 31,
    TITANS_KNOWLEDGE: 32,
    STONE_KNOWLEDGE: 33,
    HELL_KNOWLEDGE: 34
  });

  // Bit flags matching the counters built by astral.exe:0x446A9C.
  const FLAG = Object.freeze({
    ELEMENTAL: 1 << 0,
    C24: 1 << 1,
    C30: 1 << 2,
    HEALING: 1 << 3,
    C34: 1 << 4,
    DAMAGE: 1 << 5,
    C38: 1 << 6,
    C3C: 1 << 7,
    C40: 1 << 8,
    C54: 1 << 9,
    DEATH_UTILITY: 1 << 10,
    FIRE_SUPPORT: 1 << 11,
    POWER_ENGINE: 1 << 12
  });

  const CARD_FLAGS = new Uint16Array(79);
  function mark(ids, flag) {
    ids.forEach(id => { CARD_FLAGS[id] |= flag; });
  }

  mark([23, 36, 49, 63], FLAG.ELEMENTAL);
  mark([19, 21, 47], FLAG.C24);
  mark([56, 58], FLAG.C30);
  // Exact multiword bit mask stored at 0x4475F0.
  mark([27, 36, 56, 58, 61, 73], FLAG.HEALING);
  mark([16, 70], FLAG.C34);
  // Exact multiword bit mask stored at 0x4475F8.
  mark([21, 24, 31, 45, 47, 73], FLAG.DAMAGE);
  mark([22, 70], FLAG.C38);
  mark([57, 61], FLAG.C3C);
  mark([16, 34, 68], FLAG.C40);
  mark([34, 68], FLAG.C54);
  // The branch chain at 0x446F58 includes Lich and Vampire, not Drain Life.
  mark([68, 70, 71, 72, 75, 76], FLAG.DEATH_UTILITY);
  mark([21, 23, 25], FLAG.FIRE_SUPPORT);
  mark([57, 70], FLAG.POWER_ENGINE);

  function normalizeAbilities(abilities) {
    return new Set((abilities || []).map(Number).filter(Number.isFinite));
  }

  function cardGlobalId(card) {
    return (SCHOOL_INDEX[card.school] || 0) * 13 + Number(card.level);
  }

  function difficultyLevel(id) {
    return A.DIFFICULTIES?.[id]?.recoveredLevel || ({
      novice: 1,
      intermediate: 2,
      advanced: 3,
      master: 4,
      grandmaster: 5
    }[id] || 3);
  }

  function spellbookCount(options, side) {
    if (options?.mode === "tournament") {
      const specialization = side === "player" ? options.playerSpecialization : options.enemySpecialization;
      return specialization === "wizard" ? 24 : 20;
    }
    if (options?.mode === "network-equalized") return side === "player" ? 20 : 19;
    if (side === "player") return 20;
    return AI_CARD_COUNTS[options?.enemyDifficulty] || 17;
  }

  function actorClass(options, side) {
    if (options?.mode === "tournament") {
      const specialization = side === "player" ? options.playerSpecialization : options.enemySpecialization;
      const table = { necromancer: 1, battlemage: 2, druid: 3, thundermage: 4, stormmage: 5, wizard: 6 };
      return table[specialization] || 1;
    }
    return side === "player" ? 0 : difficultyLevel(options?.enemyDifficulty);
  }

  function generateBasePowers(rng, ordinal, abilities) {
    const target = ordinal === 1 ? 20 : 19;
    const values = new Uint8Array(5);
    let accepted = false;

    for (let attempt = 0; attempt < 100000; attempt += 1) {
      let sum = 0;
      let fours = 0;
      let hasSix = false;
      for (let i = 0; i < 5; i += 1) {
        let value = 3 + rng.int(3);
        const adjustment = rng.int(10);
        if (adjustment === 0) value -= 1;
        else if (adjustment === 1) value += 1;
        values[i] = value;
        sum += value;
        if (value === 4) fours += 1;
        if (value === 6) hasSix = true;
      }
      if (sum !== target) continue;
      if (ordinal === 1 && hasSix) continue;
      if (ordinal === 2 && fours === 5) continue;
      accepted = true;
      break;
    }

    if (!accepted) {
      values.set(ordinal === 1 ? [4, 4, 4, 4, 4] : [3, 4, 4, 4, 4]);
    }

    for (let i = 0; i < 5; i += 1) {
      if (abilities.has(11 + i)) values[i] += 1; // Craft
      if (abilities.has(1 + i)) values[i] += 2;  // Mystery
      if (i < 4 && abilities.has(16 + i)) values[i] = Math.max(0, values[i] - 1); // Penalty
      if (abilities.has(35)) values[i] += 1; // Meditation
      if (abilities.has(36)) values[i] += 2; // Ancient Knowledge
    }

    return Object.fromEntries(SCHOOL_ORDER.map((school, index) => [school, values[index]]));
  }

  function buildNumericIndex(cards, allowedCardIds) {
    const cardByGlobalId = Array(79).fill(null);
    const isSpell = new Uint8Array(79);
    const allowed = new Uint8Array(79);
    const restriction = allowedCardIds ? new Set(allowedCardIds) : null;

    cards.forEach(card => {
      const globalId = cardGlobalId(card);
      if (globalId < 14 || globalId > 78) return;
      cardByGlobalId[globalId] = card;
      isSpell[globalId] = card.type === "spell" ? 1 : 0;
      allowed[globalId] = !restriction || restriction.has(card.id) ? 1 : 0;
    });

    return { cardByGlobalId, isSpell, allowed };
  }

  function addAbilityCards(bookIds, numeric, abilities) {
    const additions = [];
    if (abilities.has(ABILITY.ELEMENTAL_KNOWLEDGE)) {
      additions.push(23, 36, 49, 63); // Fire10, Water10, Air10, Earth11
    }
    if (abilities.has(ABILITY.EFREETS_KNOWLEDGE)) additions.push(26);
    if (abilities.has(ABILITY.SEA_KNOWLEDGE)) additions.push(39);
    if (abilities.has(ABILITY.TITANS_KNOWLEDGE)) additions.push(52);
    if (abilities.has(ABILITY.STONE_KNOWLEDGE)) additions.push(65);
    if (abilities.has(ABILITY.HELL_KNOWLEDGE)) additions.push(78);

    additions.forEach(globalId => {
      if (!numeric.cardByGlobalId[globalId] || !numeric.allowed[globalId]) return;
      if (!bookIds.includes(globalId)) bookIds.push(globalId);
    });
  }

  function generateOne(numeric, rng, options) {
    const cardCount = options.cardCount;
    const ordinal = options.ordinal;
    const actorClassValue = options.actorClassValue;
    const abilities = normalizeAbilities(options.abilities);
    const powers = options.powers || generateBasePowers(rng, ordinal, abilities);
    const powerValues = SCHOOL_ORDER.map(school => Number(powers[school] || 0));
    const maxPerSchool = Math.floor(cardCount / 5) + 1;
    const minPerSchool = maxPerSchool - 2;
    const restrictedMode = Boolean(options.restrictedMode);
    const maxGenerationAttempts = Number(options.maxGenerationAttempts || 2000000);

    // Reused typed arrays keep the literal rejection sampler fast enough for browsers.
    const selectedStamp = new Uint32Array(79);
    const schoolCounts = new Uint8Array(6);
    const spellCounts = new Uint8Array(6);
    const levels = new Uint8Array(36); // six slots for each school; base maximum is five.
    const chosen = new Uint8Array(Math.max(cardCount, 24));
    let stamp = 0;

    for (let generationAttempt = 1; generationAttempt <= maxGenerationAttempts; generationAttempt += 1) {
      stamp += 1;
      if (stamp === 0xffffffff) {
        selectedStamp.fill(0);
        stamp = 1;
      }
      schoolCounts.fill(0);
      spellCounts.fill(0);

      let level12 = 0;
      let elementals = 0;
      let c24 = 0;
      let c30 = 0;
      let healing = 0;
      let c34 = 0;
      let damage = 0;
      let powerEngine = 0;
      let c38 = 0;
      let c3c = 0;
      let c40 = 0;
      let c54 = 0;
      let fireBalance = 0;
      let deathUtility = 0;
      let failed = false;

      for (let position = 1; position <= cardCount; position += 1) {
        let schoolIndex = 0;
        let level = 0;
        let globalId = 0;
        let found = false;

        for (let candidateAttempt = 1; candidateAttempt <= 5000; candidateAttempt += 1) {
          if (position <= 15 && candidateAttempt <= 200) {
            schoolIndex = Math.floor((position + 2) / 3);
            if (candidateAttempt <= 100) {
              const band = (position + 2) % 3;
              level = band * 4 + 1 + rng.int(4);
            } else {
              level = 1 + rng.int(12);
            }
          } else {
            schoolIndex = 1 + rng.int(5);
            level = 1 + rng.int(12);
          }

          globalId = schoolIndex * 13 + level;
          if (!numeric.cardByGlobalId[globalId] || !numeric.allowed[globalId]) continue;
          if (selectedStamp[globalId] === stamp) continue;
          if (schoolCounts[schoolIndex] >= maxPerSchool) continue;
          found = true;
          break;
        }

        if (!found) {
          failed = true;
          break;
        }

        selectedStamp[globalId] = stamp;
        chosen[position - 1] = globalId;
        const schoolOffset = (schoolIndex - 1) * 6;
        levels[schoolOffset + schoolCounts[schoolIndex]] = level;
        schoolCounts[schoolIndex] += 1;
        spellCounts[schoolIndex] += numeric.isSpell[globalId];

        if (level === 12) level12 += 1;
        const flags = CARD_FLAGS[globalId];
        if (flags & FLAG.ELEMENTAL) elementals += 1;
        if (flags & FLAG.C24) c24 += 1;
        if (flags & FLAG.C30) c30 += 1;
        if (flags & FLAG.HEALING) healing += 1;
        if (flags & FLAG.C34) c34 += 1;
        if (flags & FLAG.DAMAGE) damage += 1;
        if (flags & FLAG.C38) c38 += 1;
        if (flags & FLAG.C3C) c3c += 1;
        if (flags & FLAG.C40) c40 += 1;
        if (flags & FLAG.C54) c54 += 1;
        if (flags & FLAG.DEATH_UTILITY) deathUtility += 1;
        if (flags & FLAG.FIRE_SUPPORT) fireBalance += 1;
        if (globalId === 70) fireBalance -= powerValues[0] > 3 ? 1 : 2;
        if (flags & FLAG.POWER_ENGINE) powerEngine += 1;

        // Priest of Air is accepted as the unique power engine only on a rare roll.
        if (globalId === 42) {
          powerEngine += 1;
          const range = restrictedMode ? 10 : (18 - ordinal * 5);
          if (rng.int(range) !== 0) powerEngine += 20;
        }
      }

      if (failed) continue;
      if (level12 !== 1 || healing === 0 || c30 === 2) continue;

      // Elemental Knowledge injects its own four elementals after validation, so the
      // randomly generated base book must contain none of them.
      if (abilities.has(ABILITY.ELEMENTAL_KNOWLEDGE)) {
        if (elementals > 0) continue;
      } else if (elementals === 0 || elementals > 2) {
        continue;
      }

      if (cardCount >= 19) {
        if (damage !== 2) continue;
        if (c24 < 1) continue;
        if (c24 > 1 && ordinal === 1) continue;
        if (c34 > 1) continue;
        if (powerEngine !== 1) continue;
        if (c38 === 2 || c3c === 2 || c40 === 3) continue;
        if (c54 === 2 && powerValues[1] + powerValues[4] > 8) continue;
        if (fireBalance < 0 || deathUtility < 2) continue;
      }

      let threeCardSchools = 0;
      let invalid = false;
      for (let schoolIndex = 1; schoolIndex <= 5; schoolIndex += 1) {
        const count = schoolCounts[schoolIndex];
        if (count < minPerSchool) { invalid = true; break; }
        if (count === 3) threeCardSchools += 1;
      }
      if (invalid) continue;
      if (threeCardSchools > 1 && actorClassValue <= 0) continue;

      if (actorClassValue <= 0) {
        for (let schoolIndex = 1; schoolIndex <= 5; schoolIndex += 1) {
          const count = schoolCounts[schoolIndex];
          const spells = spellCounts[schoolIndex];
          if (count === 3 && spells > 1) { invalid = true; break; }
          if (count > 3 && (spells < 1 || spells > 2)) { invalid = true; break; }

          let highest = 0;
          let secondHighest = 0;
          const schoolOffset = (schoolIndex - 1) * 6;
          for (let i = 0; i < count; i += 1) {
            const level = levels[schoolOffset + i];
            if (level > highest) {
              secondHighest = highest;
              highest = level;
            } else if (level > secondHighest) {
              secondHighest = level;
            }
          }
          if (highest === 12) {
            if (count !== 3 || secondHighest < ordinal + 5 || secondHighest > ordinal + 7) {
              invalid = true;
              break;
            }
          }
        }
      }
      if (invalid) continue;

      const bookIds = Array.from(chosen.slice(0, cardCount));
      addAbilityCards(bookIds, numeric, abilities);
      bookIds.sort((left, right) => {
        const leftSchool = Math.floor(left / 13);
        const rightSchool = Math.floor(right / 13);
        return leftSchool === rightSchool ? (left % 13) - (right % 13) : leftSchool - rightSchool;
      });

      const hand = bookIds.map(globalId => A.deepClone(numeric.cardByGlobalId[globalId]));
      return {
        hand,
        powers,
        baseCardCount: cardCount,
        finalCardCount: hand.length,
        generationAttempt,
        bySchool: Object.fromEntries(SCHOOL_ORDER.map((school, index) => [school, schoolCounts[index + 1]])),
        stats: {
          level12,
          elementals,
          healing,
          damage,
          powerEngine,
          deathUtility,
          fireBalance
        }
      };
    }

    throw new Error(`Generazione Astral non riuscita dopo ${maxGenerationAttempts} tentativi.`);
  }

  A.ASTRAL_SPELLBOOK_RE = Object.freeze({
    schoolOrder: SCHOOL_ORDER,
    aiCardCounts: AI_CARD_COUNTS,
    abilityIds: ABILITY,
    sourceFunction: "astral.exe:0x446A9C",
    generator: "literal optimized rejection sampler",
    validationMasks: Object.freeze({ healing: "0x4475F0", damage: "0x4475F8" })
  });

  A.getRecoveredAstralSpellbookCount = function getRecoveredAstralSpellbookCount(options, side) {
    return spellbookCount(options || {}, side || "player");
  };

  A.generateRecoveredAstralHands = function generateRecoveredAstralHands(cards, options) {
    const rng = A.createRng(options?.seed || "astral-recovered-spellbook");
    const numeric = buildNumericIndex(cards, options?.allowedCardIds);
    const playerAbilities = options?.playerAbilities || [];
    const enemyAbilities = options?.enemyAbilities || [];
    const playerCount = spellbookCount(options, "player");
    const enemyCount = spellbookCount(options, "enemy");

    const player = generateOne(numeric, rng, {
      cardCount: playerCount,
      ordinal: 1,
      actorClassValue: actorClass(options, "player"),
      abilities: playerAbilities,
      powers: options?.playerInitialPowers,
      restrictedMode: options?.restrictedMode,
      maxGenerationAttempts: options?.maxGenerationAttempts
    });
    const enemy = generateOne(numeric, rng, {
      cardCount: enemyCount,
      ordinal: 2,
      actorClassValue: actorClass(options, "enemy"),
      abilities: enemyAbilities,
      powers: options?.enemyInitialPowers,
      restrictedMode: options?.restrictedMode,
      maxGenerationAttempts: options?.maxGenerationAttempts
    });

    return {
      player: player.hand,
      enemy: enemy.hand,
      playerPowers: player.powers,
      enemyPowers: enemy.powers,
      enemyTalent: options?.enemyTalent || "water",
      seed: rng.seed,
      recovered: true,
      diagnostics: [
        { side: "player", ...player },
        { side: "enemy", ...enemy }
      ]
    };
  };
})(window.Arcane = window.Arcane || {});
