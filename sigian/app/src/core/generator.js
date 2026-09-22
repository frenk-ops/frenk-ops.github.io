(function (A) {
  "use strict";

  function sortCards(cards) {
    return [...cards].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }

  function takeOne(bucket, used, rng) {
    const available = bucket.filter(card => !used.has(card.id));
    if (!available.length) return null;
    const card = rng.pick(available);
    used.add(card.id);
    return card;
  }

  function countTier(hand, predicate) {
    return hand.filter(predicate).length;
  }

  function fillHand(hand, pool, count, used, rng, rules, isTalent) {
    const immediate = pool.filter(c => c.level <= rules.immediateCostThreshold);
    const low = pool.filter(c => c.level <= rules.lowCostThreshold);
    const high = pool.filter(c => c.level >= rules.highCostThreshold);
    const maxHigh = isTalent ? rules.maxHighCostTalentSchool : rules.maxHighCostPerSchool;

    while (hand.length < Math.min(count, rules.minImmediatePerSchool)) {
      const card = takeOne(immediate, used, rng);
      if (!card) break;
      hand.push(card);
    }

    while (hand.length < count && countTier(hand, c => c.level <= rules.lowCostThreshold) < rules.minLowCostPerSchool) {
      const card = takeOne(low, used, rng);
      if (!card) break;
      hand.push(card);
    }

    const shuffled = rng.shuffle(pool);
    for (const card of shuffled) {
      if (hand.length >= count) break;
      if (used.has(card.id)) continue;
      if (card.level >= rules.highCostThreshold && countTier(hand, c => c.level >= rules.highCostThreshold) >= maxHigh) continue;
      used.add(card.id);
      hand.push(card);
    }

    // In caso di pool piccolo, completa comunque rispettando l'esclusività finché possibile.
    for (const card of sortCards(pool)) {
      if (hand.length >= count) break;
      if (used.has(card.id)) continue;
      used.add(card.id);
      hand.push(card);
    }

    return sortCards(hand);
  }

  function allocateSchool(pool, playerCount, enemyCount, rng, rules, playerTalent, enemyTalent, schoolId) {
    const used = new Set();
    const player = [];
    const enemy = [];

    // Prenota una carta iniziale per entrambi prima di riempire il resto.
    const immediate = rng.shuffle(pool.filter(c => c.level <= rules.immediateCostThreshold));
    if (immediate[0]) { player.push(immediate[0]); used.add(immediate[0].id); }
    if (immediate[1]) { enemy.push(immediate[1]); used.add(immediate[1].id); }

    fillHand(player, pool, playerCount, used, rng, rules, schoolId === playerTalent);
    fillHand(enemy, pool, enemyCount, used, rng, rules, schoolId === enemyTalent);

    return { player, enemy };
  }

  A.generateHands = function generateHands(cards, options) {
    const rules = { ...A.DEFAULT_RULESET, ...(options?.rules || {}) };
    const rng = A.createRng(options?.seed || "foundation");
    const playerTalent = options?.playerTalent || "fire";
    const enemyTalent = options?.enemyTalent || rng.pick(A.SCHOOLS).id;
    const player = [];
    const enemy = [];
    const diagnostics = [];

    A.SCHOOLS.forEach(school => {
      const pool = cards.filter(card => card.school === school.id);
      const playerCount = school.id === playerTalent ? rules.talentHandSizePerSchool : rules.handSizePerSchool;
      const enemyCount = school.id === enemyTalent ? rules.talentHandSizePerSchool : rules.handSizePerSchool;
      const allocation = allocateSchool(pool, playerCount, enemyCount, rng, rules, playerTalent, enemyTalent, school.id);
      player.push(...allocation.player.map(A.deepClone));
      enemy.push(...allocation.enemy.map(A.deepClone));

      const playerImmediate = allocation.player.filter(c => c.level <= rules.initialPower).length;
      const enemyImmediate = allocation.enemy.filter(c => c.level <= rules.initialPower).length;
      diagnostics.push({
        school: school.id,
        playerCount: allocation.player.length,
        enemyCount: allocation.enemy.length,
        playerImmediate,
        enemyImmediate,
        exclusive: !allocation.player.some(pc => allocation.enemy.some(ec => ec.id === pc.id))
      });
    });

    const sorter = (a, b) => {
      const sa = A.SCHOOLS.findIndex(s => s.id === a.school);
      const sb = A.SCHOOLS.findIndex(s => s.id === b.school);
      return sa - sb || a.level - b.level;
    };

    return {
      player: player.sort(sorter),
      enemy: enemy.sort(sorter),
      enemyTalent,
      seed: rng.seed,
      diagnostics
    };
  };
})(window.Arcane = window.Arcane || {});
