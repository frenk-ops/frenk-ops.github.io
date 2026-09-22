(function (A) {
  "use strict";

  const VALID_TYPES = new Set(["creature", "spell"]);
  const VALID_TRIGGERS = new Set(["onPlay", "onSummon", "onRoundStart", "onDeath", "passive"]);

  A.normalizeCard = function normalizeCard(raw) {
    const card = A.deepClone(raw || {});
    card.id = String(card.id || "missing-id");
    card.name = String(card.name || "Carta senza nome");
    card.school = String(card.school || "fire");
    card.type = VALID_TYPES.has(card.type) ? card.type : "creature";
    card.level = Math.max(1, Number(card.level ?? card.cost ?? 1));
    card.cost = card.level;
    card.attack = card.type === "spell" ? 0 : Math.max(0, Number(card.attack ?? 0));
    card.health = card.type === "spell" ? 0 : Math.max(1, Number(card.health ?? card.hp ?? 1));
    card.hp = card.health;
    card.text = String(card.text || "");
    card.keyword = String(card.keyword || "");
    card.art = String(card.art || A.SCHOOLS.find(s => s.id === card.school)?.icon || "✨");
    card.effects = Array.isArray(card.effects) ? card.effects.map(effect => ({
      trigger: VALID_TRIGGERS.has(effect.trigger) ? effect.trigger : "onPlay",
      action: String(effect.action || "none"),
      amount: Number(effect.amount || 0),
      school: effect.school || null,
      target: effect.target || null
    })) : [];
    return card;
  };

  A.validateCardSet = function validateCardSet(rawCards) {
    const cards = (rawCards || []).map(A.normalizeCard);
    const errors = [];
    const ids = new Set();
    cards.forEach((card, index) => {
      if (ids.has(card.id)) errors.push(`ID duplicato: ${card.id}`);
      ids.add(card.id);
      if (!A.SCHOOLS.some(s => s.id === card.school)) errors.push(`Scuola non valida alla carta ${index + 1}: ${card.school}`);
      if (card.type === "creature" && card.health <= 0) errors.push(`Vita non valida: ${card.name}`);
    });
    return { cards, errors, valid: errors.length === 0 };
  };

  A.getCardSet = function getCardSet(setId) {
    const source = A.RAW_CARD_SETS?.[setId] || A.RAW_CARD_SETS?.classic || [];
    return A.validateCardSet(source).cards;
  };
})(window.Arcane = window.Arcane || {});
