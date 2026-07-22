(function (A) {
  "use strict";

  function strongest(board, metric) {
    return board
      .map((unit, slot) => ({ unit, slot }))
      .filter(entry => entry.unit)
      .sort((a, b) => metric(b.unit) - metric(a.unit))[0] || null;
  }

  A.resolveEffects = function resolveEffects(state, side, card, trigger) {
    const self = state[side];
    const enemySide = side === "player" ? "enemy" : "player";
    const enemy = state[enemySide];
    const events = [];
    const effects = (card.effects || []).filter(effect => effect.trigger === trigger);

    effects.forEach(effect => {
      const amount = Number(effect.amount || 0);
      switch (effect.action) {
        case "damage_enemy_hero":
          enemy.hp = Math.max(0, enemy.hp - amount);
          events.push({ type: "heroDamage", side: enemySide, amount, source: card.name });
          break;
        case "heal_self_hero":
          self.hp = Math.min(self.maxHp, self.hp + amount);
          events.push({ type: "heroHeal", side, amount, source: card.name });
          break;
        case "damage_all_enemy_creatures":
          enemy.board.forEach((unit, slot) => {
            if (!unit) return;
            unit.currentHealth -= amount;
            const died = unit.currentHealth <= 0;
            events.push({ type: "creatureDamage", side: enemySide, slot, amount, died, source: card.name });
            if (died) enemy.board[slot] = null;
          });
          break;
        case "reduce_strongest_enemy_attack": {
          const target = strongest(enemy.board, unit => unit.attack);
          if (target) {
            const previous = target.unit.attack;
            target.unit.attack = Math.max(0, target.unit.attack - amount);
            events.push({ type: "statChange", side: enemySide, slot: target.slot, stat: "attack", delta: target.unit.attack - previous });
          }
          break;
        }
        case "buff_strongest_ally_health": {
          const target = strongest(self.board, unit => unit.currentHealth);
          if (target) {
            target.unit.health += amount;
            target.unit.currentHealth += amount;
            events.push({ type: "statChange", side, slot: target.slot, stat: "health", delta: amount });
          } else {
            self.hp = Math.min(self.maxHp, self.hp + amount);
            events.push({ type: "heroHeal", side, amount, source: card.name });
          }
          break;
        }
        case "heal_all_allies":
          self.board.forEach((unit, slot) => {
            if (!unit) return;
            const before = unit.currentHealth;
            unit.currentHealth = Math.min(unit.health, unit.currentHealth + amount);
            events.push({ type: "statChange", side, slot, stat: "health", delta: unit.currentHealth - before });
          });
          break;
        case "mana_gain": {
          const school = effect.school || card.school;
          self.power[school] += amount;
          events.push({ type: "powerChange", side, school, amount });
          break;
        }
        default:
          break;
      }
    });
    return events;
  };
})(window.Arcane = window.Arcane || {});
