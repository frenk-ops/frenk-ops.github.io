(function (A) {
  "use strict";

  const SCHEMA_VERSION = 1;

  function freezeEntry(entry) {
    return Object.freeze({
      ...entry,
      dimensions:Object.freeze([...(entry.dimensions || [])]),
      interactions:Object.freeze([...(entry.interactions || [])]),
      canonicalRules:Object.freeze([...(entry.canonicalRules || [])])
    });
  }

  const CATALOG = Object.freeze([
    freezeEntry({
      id:"initiative",
      family:"attack-timing",
      temporal:true,
      dimensions:["bodyAttack","attackTriggerValue","validTargetProbability","summoningSicknessBypass"],
      interactions:["attack-x-initiative","attack-triggers-x-initiative","total-assault-x-initiative"],
      canonicalRules:["May attack on the turn it enters; does not reorder normal attacks."]
    }),
    freezeEntry({
      id:"collective-initiative",
      family:"aura",
      temporal:true,
      dimensions:["futureAlliedSummons","sourceSurvival","eligibleAlliedAttackValue"],
      interactions:["aura-survival-x-future-summons"],
      canonicalRules:["Allied creatures may attack on the turn they enter while the source remains active."]
    }),
    freezeEntry({
      id:"movement-complete-lane",
      family:"spatial",
      temporal:true,
      dimensions:["blockedFront","completeFreeLaneCount","destinationTargetQuality","bodyAttack"],
      interactions:["movement-x-blocked-lane","movement-x-attack-value"],
      canonicalRules:[
        "Pegasus movement is automatic when triggered.",
        "Destination is the first valid complete free lane in deterministic canonical lane order.",
        "Complete free lane means allied slot free and corresponding enemy slot free."
      ]
    }),
    freezeEntry({
      id:"swap",
      family:"spatial",
      temporal:true,
      dimensions:["sourceTargetQuality","destinationTargetQuality","boardOccupancy","targetFreedom"],
      interactions:["swap-x-board-quality"],
      canonicalRules:[
        "Base Wind Shift swaps an allied and an enemy creature; empowered mode may swap any two creatures.",
        "Swap the existing complete live instances; preserve personal runtime state, Formula identity, separate provenance and summon timestamp.",
        "Cross-side controller follows destination. No heal, reset, summon or death triggers; external board auras are recalculated normally."
      ]
    }),
    freezeEntry({
      id:"double-attack",
      family:"attack-events",
      temporal:true,
      dimensions:["bodyAttack","attackTriggerValue","validTargetProbability","attackEventCount"],
      interactions:["attack-x-double-attack","attack-triggers-x-double-attack","total-assault-x-double-attack"],
      canonicalRules:["Creates two complete attack events; never model as damage multiplied by two."]
    }),
    freezeEntry({
      id:"damage-redirection",
      family:"mitigation-redirection",
      temporal:false,
      dimensions:["incomingDamage","retainedRatio","redirectedDamage","adjacentEnemyCount"],
      interactions:["mitigation-x-adjacent-occupancy"],
      canonicalRules:["Half-damage retained portions round up unless explicitly overridden."]
    }),
    freezeEntry({
      id:"propagation",
      family:"multi-target-damage",
      temporal:false,
      dimensions:["primaryDamage","adjacentEnemyCount","propagationRatio","conditionSatisfied"],
      interactions:["propagation-x-adjacent-occupancy","propagation-x-power-condition"],
      canonicalRules:[
        "Thunder Chain adjacent ratio is 70% with rounding up.",
        "If own Air Power > enemy Water Power, adjacent ratio becomes 100%.",
        "Propagation stops after immediately adjacent enemy slots."
      ]
    }),
    freezeEntry({
      id:"neutralization",
      family:"temporary-denial",
      temporal:true,
      dimensions:["durationOwnerTurns","targetBodyValue","targetEffectValue","targetAttackOpportunity","targetDefenseOpportunity"],
      interactions:["neutralization-x-target-value"],
      canonicalRules:[
        "Duration is counted on turns of the affected creature's owner.",
        "Neutralized creature occupies its slot but cannot attack, defend or produce effects."
      ]
    }),
    freezeEntry({
      id:"silence",
      family:"effect-denial",
      temporal:true,
      dimensions:["durationOwnerTurns","targetEffectValue","targetConstraintValue","permanentConditionProbability"],
      interactions:["silence-x-target-effect-value","silence-x-runtime-components"],
      canonicalRules:[
        "Duration is counted on turns of the affected creature's owner.",
        "Silenced creature keeps Body, attack and defense; Sigils, Constraints and other Formula effects are inactive.",
        "Silence may target allied or enemy creatures."
      ]
    }),
    freezeEntry({
      id:"breakthrough",
      family:"overflow-damage",
      temporal:false,
      dimensions:["sourceDamage","defenderRemainingLife","mitigation","expectedOverkill"],
      interactions:["attack-x-breakthrough","mitigation-x-breakthrough"],
      canonicalRules:["Only excess damage after defeating the creature can reach the opposing Caster."]
    }),
    freezeEntry({
      id:"runtime-sigil-imprint",
      family:"generated-components",
      temporal:true,
      dimensions:["generatedSigilValue","eligibleTargetProbability","runtimeCapacity","repeatability"],
      interactions:["generated-sigil-x-target-count","generated-sigil-x-runtime-cap"],
      canonicalRules:["Additional runtime Sigils are real runtime component instances, not hidden stat patches; maximum additional Sigils is 3."]
    }),
    freezeEntry({
      id:"runtime-constraint-impose",
      family:"generated-components",
      temporal:true,
      dimensions:["generatedConstraintValue","eligibleTargetProbability","runtimeCapacity","repeatability"],
      interactions:["generated-constraint-x-target-value","generated-constraint-x-runtime-cap"],
      canonicalRules:["Additional runtime Constraints are separate from the single native Formula Constraint; maximum additional Constraints is 3."]
    }),
    freezeEntry({
      id:"max-health-growth",
      family:"body-growth",
      temporal:true,
      dimensions:["maxHealthDelta","currentHealDelta","sourceSurvival","futureHealingSynergy"],
      interactions:["max-health-x-healing","max-health-x-regeneration"],
      canonicalRules:["Permanent maximum-Life growth is valued through the Body/durability model plus any actual healing performed."]
    }),
    freezeEntry({
      id:"resurrection-last-ally",
      family:"resurrection",
      temporal:true,
      dimensions:["restoredBodyValue","restoredHealthRatio","slotAvailability","summoningSickness","lastDeathQuality"],
      interactions:["resurrection-x-restored-body"],
      canonicalRules:["Lich restores only the last allied creature that died, at half maximum Life, with normal summoning sickness."]
    }),
    freezeEntry({
      id:"eternal-rebirth",
      family:"resurrection",
      temporal:true,
      dimensions:["restoredBodyValue","conditionPersistence","expectedRevivalCount","deathTriggerValue"],
      interactions:["rebirth-x-body","rebirth-x-death-triggers"],
      canonicalRules:["Phoenix may return repeatedly while its Power condition remains satisfied."]
    }),
    freezeEntry({
      id:"annihilation",
      family:"global-removal",
      temporal:false,
      dimensions:["alliedBoardValue","enemyBoardValue","deathTriggerSwing"],
      interactions:["annihilation-x-death-economy"],
      canonicalRules:["Destroys all creatures on both sides; intrinsic value is net board swing, not infinite damage."]
    }),
    freezeEntry({
      id:"bastion-souls",
      family:"death-economy",
      temporal:true,
      dimensions:["deathRate","sourceSurvival","timeToDeath","accumulatedSouls"],
      interactions:["souls-x-survival","souls-x-death-rate"],
      canonicalRules:["Every creature death grants one Soul; on Bastion death, X Souls deal X damage to the enemy Caster."]
    }),
    freezeEntry({
      id:"soul-eater-souls",
      family:"death-economy",
      temporal:true,
      dimensions:["historicalDeathCount","entrySoulCount","bodyValue","destructionEventsPrevented"],
      interactions:["souls-x-body"],
      canonicalRules:[
        "Soul count is fixed on entry: one Soul per three creature deaths, maximum three.",
        "When destruction would occur, consume one Soul and remain at one Life."
      ]
    }),
    freezeEntry({
      id:"burning-strike",
      family:"attack-trigger-damage",
      temporal:true,
      dimensions:["triggerAttackCount","adjacentEnemyProbability","splashDamage"],
      interactions:["burning-strike-x-double-attack","burning-strike-x-initiative"],
      canonicalRules:["On attacking a creature, deal 2 additional damage to the adjacent enemy creature with the lowest Life, if present."]
    }),
    freezeEntry({
      id:"forgeheart",
      family:"generated-components",
      temporal:true,
      dimensions:["triggerAttackCount","generatedSigilValue","eligibleAlliedTargets","runtimeCapacity"],
      interactions:["forgeheart-x-survival","forgeheart-x-double-attack","forgeheart-x-runtime-cap"],
      canonicalRules:["After attacking, imprint Tempered Flame on another eligible allied creature."]
    }),
    freezeEntry({
      id:"tempered-flame",
      family:"body-stat",
      temporal:true,
      dimensions:["attackDelta","sourceSurvival","futureAttackCount"],
      interactions:["attack-buff-x-attack-events"],
      canonicalRules:["Permanent +2 Attack runtime Sigil."]
    }),
    freezeEntry({
      id:"pyro-damage",
      family:"damage-amplification",
      temporal:true,
      dimensions:["creatureHitCount","damageDelta"],
      interactions:["pyro-damage-x-multi-hit","pyro-damage-x-double-attack"],
      canonicalRules:["Adds +1 damage only when damage is dealt to creatures, not to the opposing Caster."]
    })
  ]);

  const BY_ID = Object.freeze(Object.fromEntries(CATALOG.map(entry => [entry.id, entry])));

  A.SIGIAN_VALUE_V2_MECHANIC_SCHEMA_VERSION = SCHEMA_VERSION;
  A.SIGIAN_VALUE_V2_MECHANIC_CATALOG = CATALOG;

  A.getSigianValueV2Mechanic = function getSigianValueV2Mechanic(id) {
    return BY_ID[String(id || "")] || null;
  };

  A.listSigianValueV2Mechanics = function listSigianValueV2Mechanics() {
    return CATALOG.slice();
  };
})(window.Arcane = window.Arcane || {});
