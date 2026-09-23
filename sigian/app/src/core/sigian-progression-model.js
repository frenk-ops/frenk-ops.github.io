(function (A) {
  "use strict";

  const AFFINITY_MODES = Object.freeze({
    MONO: "mono",
    DUAL: "dual",
    TRIPLE: "triple",
    UNIVERSAL: "universal"
  });

  const MODE_SIZES = Object.freeze({
    [AFFINITY_MODES.MONO]: 1,
    [AFFINITY_MODES.DUAL]: 2,
    [AFFINITY_MODES.TRIPLE]: 3
  });

  function activeSchoolIds() {
    return (A.listSigianSchools?.({ status: "active" }) || []).map(school => school.id);
  }

  function uniqueSchools(values) {
    const active = new Set(activeSchoolIds());
    return [...new Set((values || []).map(value => String(value || "").trim()).filter(Boolean))]
      .filter(school => active.has(school));
  }

  A.SIGIAN_AFFINITY_MODES = AFFINITY_MODES;
  A.SIGIAN_RARITY_FACTORS = Object.freeze([
    "grade",
    "affinityBreadth",
    "modifierComplexity",
    "schoolIdentityAccess"
  ]);

  A.sigianAffinityModeForSchools = function sigianAffinityModeForSchools(schools) {
    const count = uniqueSchools(schools).length;
    if (count <= 1) return AFFINITY_MODES.MONO;
    if (count === 2) return AFFINITY_MODES.DUAL;
    if (count === 3) return AFFINITY_MODES.TRIPLE;
    return AFFINITY_MODES.UNIVERSAL;
  };

  A.normalizeSigianAffinity = function normalizeSigianAffinity(input, fallbackSchool = null) {
    if (input == null) return null;
    const source = typeof input === "string" ? { mode: input } : input;
    const mode = String(source?.mode || "").trim();

    if (mode === AFFINITY_MODES.UNIVERSAL) {
      return { mode: AFFINITY_MODES.UNIVERSAL, schools: [] };
    }

    const requested = uniqueSchools(source?.schools || []);
    const fallback = fallbackSchool && A.getSigianSchool?.(fallbackSchool)?.status === "active"
      ? String(fallbackSchool)
      : null;
    if (!requested.length && fallback) requested.push(fallback);

    const inferred = Object.values(AFFINITY_MODES).includes(mode)
      ? mode
      : A.sigianAffinityModeForSchools(requested);
    const expected = MODE_SIZES[inferred];

    if (!expected) {
      return requested.length
        ? { mode: A.sigianAffinityModeForSchools(requested), schools: requested.slice(0, 3) }
        : null;
    }

    return {
      mode: inferred,
      schools: requested.slice(0, expected)
    };
  };

  A.validateSigianAffinity = function validateSigianAffinity(input) {
    if (input == null) return { valid: true, errors: [], affinity: null };
    const affinity = A.normalizeSigianAffinity(input);
    const errors = [];
    if (!affinity) {
      errors.push("Affinità Sigillo non valida.");
      return { valid: false, errors, affinity: null };
    }
    if (affinity.mode === AFFINITY_MODES.UNIVERSAL) {
      return { valid: true, errors, affinity };
    }

    const expected = MODE_SIZES[affinity.mode];
    if (!expected || affinity.schools.length !== expected) {
      errors.push(`Affinità ${affinity.mode} richiede ${expected || "un numero valido di"} Scuole.`);
    }
    return { valid: errors.length === 0, errors, affinity };
  };

  A.sigianAffinityAllowsSchool = function sigianAffinityAllowsSchool(input, schoolId) {
    if (input == null) return true; // Legacy / ownership not yet attached.
    const affinity = A.normalizeSigianAffinity(input);
    if (!affinity) return false;
    if (affinity.mode === AFFINITY_MODES.UNIVERSAL) return true;
    return affinity.schools.includes(String(schoolId || ""));
  };

  A.sigianAffinityBreadth = function sigianAffinityBreadth(input) {
    if (input == null) return null;
    const affinity = A.normalizeSigianAffinity(input);
    if (!affinity) return null;
    if (affinity.mode === AFFINITY_MODES.UNIVERSAL) return activeSchoolIds().length;
    return affinity.schools.length;
  };

  A.sigianRarityProfile = function sigianRarityProfile({ grade = 1, affinity = null, modifierCount = 0, schoolIdentityAccess = "native" } = {}) {
    return {
      grade: Math.max(1, Math.trunc(Number(grade || 1))),
      affinityBreadth: A.sigianAffinityBreadth(affinity),
      modifierComplexity: Math.max(0, Math.trunc(Number(modifierCount || 0))),
      schoolIdentityAccess: String(schoolIdentityAccess || "native"),
      tier: null,
      status: "unassigned"
    };
  };
})(window.Arcane = window.Arcane || {});
