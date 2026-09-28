(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof module === "object" && module.exports) module.exports = api;

  if (root) {
    const A = root.Arcane = root.Arcane || {};
    A.ACCOUNT_PROGRESSION_CURVE_VERSION = api.CURVE_VERSION;
    A.ACCOUNT_PROGRESSION_CURVE_PROVISIONAL = api.PROVISIONAL_CURVE;
    A.ACCOUNT_MILESTONES = api.MILESTONES;
    A.accountLevelFromXp = api.levelFromXp;
    A.accountXpForLevel = api.xpForLevel;
    A.accountLevelProgress = api.levelProgress;
    A.normalizeAccountProgression = api.normalizeProgression;
    A.accountProgressionState = api.progressionState;
    A.reconcileAccountProgression = api.reconcileProgression;
    A.accountMilestoneState = api.milestoneState;
  }
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  // This reproduces the current backend progression curve only as a versioned,
  // provisional implementation. The Academy design explicitly keeps XP pacing open.
  const CURVE_VERSION = "provisional-sqrt-v1";
  const PROVISIONAL_CURVE = true;
  const XP_SCALE = 100;

  const MILESTONES = Object.freeze({
    academyAdmission: 3,
    schoolConfirmation: 10,
    graduation: 50
  });

  function wholeNonNegative(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.trunc(number));
  }

  function positiveLevel(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 1;
    return Math.max(1, Math.trunc(number));
  }

  function levelFromXp(value) {
    const xp = wholeNonNegative(value);
    return 1 + Math.floor(Math.sqrt(xp / XP_SCALE));
  }

  function xpForLevel(value) {
    const level = positiveLevel(value);
    return XP_SCALE * Math.pow(level - 1, 2);
  }

  function levelProgress(value) {
    const xp = wholeNonNegative(typeof value === "object" && value ? value.xp : value);
    const level = levelFromXp(xp);
    const levelStartXp = xpForLevel(level);
    const nextLevelXp = xpForLevel(level + 1);
    const span = Math.max(1, nextLevelXp - levelStartXp);
    const xpIntoLevel = Math.max(0, xp - levelStartXp);
    const xpToNextLevel = Math.max(0, nextLevelXp - xp);
    return Object.freeze({
      xp,
      level,
      levelStartXp,
      nextLevelXp,
      xpIntoLevel,
      xpToNextLevel,
      progress: Math.max(0, Math.min(1, xpIntoLevel / span))
    });
  }

  function normalizeProgression(value = {}, options = {}) {
    const source = value && typeof value === "object" ? value : {};
    const xp = wholeNonNegative(source.xp);
    return {
      xp,
      level: levelFromXp(xp),
      games_played: wholeNonNegative(source.games_played ?? source.gamesPlayed),
      wins: wholeNonNegative(source.wins),
      losses: wholeNonNegative(source.losses),
      draws: wholeNonNegative(source.draws),
      curve_version: CURVE_VERSION,
      source: String(options.source || source.source || "local"),
      synced_at: options.syncedAt || source.synced_at || source.syncedAt || null
    };
  }

  function progressionState(value = {}, options = {}) {
    const normalized = normalizeProgression(value, options);
    return Object.freeze({
      xp: normalized.xp,
      source: normalized.source,
      synced_at: normalized.synced_at
    });
  }

  function reconcileProgression(localValue = {}, remoteValue = null, options = {}) {
    // While offline XP sources are still undefined, an available server progression
    // is authoritative. Local state is the offline cache/fallback, not an upload source.
    if (remoteValue && typeof remoteValue === "object" && Number.isFinite(Number(remoteValue.xp))) {
      return normalizeProgression(remoteValue, {
        source: options.remoteSource || "online-authoritative",
        syncedAt: options.syncedAt || new Date().toISOString()
      });
    }
    return normalizeProgression(localValue, {
      source: options.localSource || localValue?.source || "local"
    });
  }

  function milestoneState(value) {
    const progression = normalizeProgression(
      typeof value === "object" && value ? value : { xp: value }
    );
    const level = progression.level;
    return Object.freeze({
      level,
      academyAdmissionLevel: MILESTONES.academyAdmission,
      schoolConfirmationLevel: MILESTONES.schoolConfirmation,
      graduationLevel: MILESTONES.graduation,
      academyAdmissionEligible: level >= MILESTONES.academyAdmission,
      schoolConfirmationEligible: level >= MILESTONES.schoolConfirmation,
      graduated: level >= MILESTONES.graduation
    });
  }

  return Object.freeze({
    CURVE_VERSION,
    PROVISIONAL_CURVE,
    MILESTONES,
    levelFromXp,
    xpForLevel,
    levelProgress,
    normalizeProgression,
    progressionState,
    reconcileProgression,
    milestoneState
  });
});
