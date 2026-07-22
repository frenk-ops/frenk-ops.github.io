(function (A) {
  "use strict";

  function xmur3(text) {
    let h = 1779033703 ^ text.length;
    for (let i = 0; i < text.length; i += 1) {
      h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }

  function mulberry32(seed) {
    return function () {
      let t = (seed += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  A.createRng = function createRng(seed) {
    const normalized = String(seed || "arcane-default-seed");
    const random = mulberry32(xmur3(normalized)());
    return {
      seed: normalized,
      next: random,
      int(max) {
        if (!Number.isInteger(max) || max <= 0) throw new Error("max deve essere un intero positivo");
        return Math.floor(random() * max);
      },
      pick(items) {
        if (!items.length) return null;
        return items[this.int(items.length)];
      },
      shuffle(items) {
        const copy = [...items];
        for (let i = copy.length - 1; i > 0; i -= 1) {
          const j = this.int(i + 1);
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
      }
    };
  };
})(window.Arcane = window.Arcane || {});
