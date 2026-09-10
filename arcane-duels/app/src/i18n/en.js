(function (A) {
  "use strict";
  const ui = {
    "ui.language": "Language", "ui.italian": "Italiano", "ui.english": "English",
    "ui.menu": "MENU", "ui.viewCard": "VIEW CARD", "ui.passTurn": "PASS",
    "ui.selectCardForDetails": "Select a card to view its details",
    "ui.noCard": "No card selected", "ui.currentValue": "Current value", "ui.beforeDefense": "before defenses",
    "log.damageHero": "{source} deals {amount} damage to {target}.",
    "log.damageHeroReduced": "{source}: {gross} damage, reduced to {amount} against {target}.",
    "log.damageCreature": "{source} deals {amount} damage to {target}.",
    "log.healHero": "{source} restores {amount} life to {target}.",
    "log.death": "{target} is destroyed.",
    "log.rebirth": "{target} is reborn with {amount} health.",
    "log.powerReduction": "{target}'s powers decrease by {amount}.",
    "log.vampireHeal": "{source} drains {amount} health.",
    "log.fireRitual": "Fire Ritual empowers {actor} and weakens {target}'s Water.",
    "log.astralNets": "Astral Nets deal {amount} damage to {target}.",
    "log.deathKeeper": "Death Keeper grants +{amount} Death to {actor}.",
    "log.fireAura": "Fire Aura deals {amount} retaliation damage to {target}.",
    "effect.souldrinker": "Souldrinker", "effect.healingAura": "Healing Aura",
    "effect.forcedAttack": "Forced attack", "effect.turnShort": "turn",
    "log.regenerate": "{source} regenerates {amount} health before attacking.",
    "log.healCreature": "{source} restores {amount} health to {target}.",
    "log.cast": "{actor} casts {card}.", "log.summon": "{actor} summons {card}.",
    "log.pass": "{actor} passes.", "log.attack": "{source} deals {amount} combat damage to {target}.",
    "ui.player": "Player", "ui.opponent": "Opponent", "ui.life": "Life",
    "ui.school": "School", "ui.type": "Type", "ui.cost": "Cost",
    "ui.attack": "Attack", "ui.ability": "Ability", "ui.spell": "Spell",
    "ui.creature": "Creature", "ui.original": "Original",
    "ui.animationSpeed": "Animation speed", "ui.backgroundMusic": "Background music",
    "ui.volume": "Volume", "ui.sound": "Sound", "ui.speed": "Speed",
    "ui.returnMainMenu": "RETURN TO MENU", "ui.round": "Round {value}",
    "menu.main": "Main menu", "menu.newDuel": "New duel",
    "menu.rulesetSummary": "Classic rules — 65 cards.",
    "menu.localDuel": "Local duel", "menu.playerName": "Player name",
    "menu.mode": "Mode", "menu.classicDuel": "Classic duel",
    "menu.specializedDuel": "Duel with specializations", "menu.opponent": "AI opponent",
    "menu.cardStyle": "Card art", "menu.originalArt": "Original",
    "menu.remasteredArt": "New", "menu.seed": "Match seed",
    "menu.randomSeed": "Random (or enter a seed)",
    "nav.duel": "Duel", "nav.tournament": "Tournament", "nav.collection": "Collection",
    "tournament.title": "Arcane Duels Tournament", "tournament.new": "New tournament", "tournament.abandon": "Abandon tournament", "tournament.confirmAbandon": "Abandon the active tournament? This competition's progress will be lost.",
    "tournament.introTitle": "Arcane Duels Championship", "tournament.intro": "One 65-card set. Face 7 opponents and earn at least 5 victories.",
    "tournament.matches12": "Matches 1–2", "tournament.matches34": "Matches 3–4", "tournament.matches57": "Matches 5–7",
    "tournament.playerSchool": "Player school", "tournament.seed": "Tournament seed", "tournament.randomSeed": "Random (or enter a seed)",
    "tournament.create": "Create tournament", "tournament.school": "School", "tournament.match": "Match", "tournament.wins": "Victories", "tournament.points": "Points",
    "tournament.nextOpponent": "Next opponent", "tournament.winsNeeded": "You still need {value} victories to win the tournament.",
    "tournament.win": "Victory", "tournament.loss": "Defeat", "tournament.pending": "Not played", "tournament.pointsShort": "pts",
    "tournament.passives": "Acquired passives", "tournament.noPassives": "No passives yet.", "tournament.choosePassive": "Choose a permanent passive for this tournament",
    "tournament.won": "Tournament won", "tournament.notWon": "Tournament not won", "tournament.result": "{wins} victories out of {matches} · {points} points.",
    "tournament.archive": "Archive tournament", "tournament.face": "Face {name}",
    "tournament.rank.0": "Apprentice", "tournament.rank.1": "Adept", "tournament.rank.2": "Summoner", "tournament.rank.3": "Battle Mage", "tournament.rank.4": "Master", "tournament.rank.5": "Archmage", "tournament.rank.6": "Astral Champion",
    "nav.editor": "Editor", "nav.help": "Help", "nav.options": "Options",
    "online.title": "Online game", "online.create": "Create online game", "online.join": "Join",
    "online.codePlaceholder": "Room code", "online.room": "Room", "online.leave": "Leave room",
    "online.waiting": "Waiting for opponent…", "online.ready": "Opponent connected. Match ready.",
    "online.error": "Connection failed.",
    "phase.playerSelect": "Choose a card", "phase.playerTarget": "Choose a slot",
    "phase.playerAttack": "Your attack", "phase.enemyThink": "Opponent is thinking",
    "phase.enemyPlay": "Opponent's play", "phase.enemyAttack": "Opponent's attack",
    "phase.roundEnd": "End of round", "phase.gameOver": "Duel over",
    "status.summoningSickness": "Summoning sickness — can attack from the next turn",
    "schools.fire": "Fire", "schools.water": "Water", "schools.air": "Air",
    "schools.earth": "Earth", "schools.nature": "Earth", "schools.death": "Death"
  };
  const cards = {};
  const originals = A.RAW_CARD_SETS?.["astral-original"] || [];
  originals.forEach(card => {
    cards[`cards.${card.id}.name`] = card.name;
    cards[`cards.${card.id}.description`] = card.text;
  });
  A.I18N_CATALOGS = A.I18N_CATALOGS || {};
  A.I18N_CATALOGS.en = Object.freeze({ ...ui, ...cards });
})(window.Arcane = window.Arcane || {});
