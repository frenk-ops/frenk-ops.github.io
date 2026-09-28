(function (root, factory) {
  "use strict";

  const accountApi = typeof module === "object" && module.exports
    ? require("./account-progression")
    : (root?.Arcane || null);
  const api = factory(accountApi);

  if (typeof module === "object" && module.exports) module.exports = api;

  if (root) {
    const A = root.Arcane = root.Arcane || {};
    A.ACADEMY_PHASES = api.PHASES;
    A.ACADEMY_SCHOOL_IDS = api.SCHOOL_IDS;
    A.academyProgressionState = api.academyProgressionState;
  }
})(typeof window !== "undefined" ? window : null, function (accountApi) {
  "use strict";

  const PHASES = Object.freeze({
    candidate: "candidate",
    admittedUnassigned: "admitted-unassigned",
    exploratory: "exploratory",
    confirmed: "confirmed",
    graduated: "graduated"
  });

  const SCHOOL_IDS = Object.freeze(["fire", "water", "air", "nature", "death"]);

  const milestoneState = accountApi?.milestoneState || accountApi?.accountMilestoneState;

  function normalizedSchoolId(value) {
    const id = String(value || "").trim();
    return SCHOOL_IDS.includes(id) ? id : null;
  }

  function resolveInputs(progressionValue, identityValue) {
    if (progressionValue && typeof progressionValue === "object" && progressionValue.accountProgression) {
      return {
        progression: progressionValue.accountProgression,
        identity: progressionValue
      };
    }
    return {
      progression: progressionValue || {},
      identity: identityValue && typeof identityValue === "object" ? identityValue : {}
    };
  }

  function academyProgressionState(progressionValue = {}, identityValue = {}) {
    if (typeof milestoneState !== "function") {
      throw new Error("account-milestone-state-unavailable");
    }

    const { progression, identity } = resolveInputs(progressionValue, identityValue);
    const milestones = milestoneState(progression);
    const formativeSchoolId = normalizedSchoolId(identity.formativeSchoolId);
    const formativeSchoolConfirmedAt = formativeSchoolId && identity.formativeSchoolConfirmedAt
      ? String(identity.formativeSchoolConfirmedAt)
      : null;
    const schoolConfirmed = Boolean(formativeSchoolConfirmedAt);

    let phase = PHASES.candidate;
    if (milestones.academyAdmissionEligible) {
      if (!formativeSchoolId) phase = PHASES.admittedUnassigned;
      else if (milestones.graduated && schoolConfirmed) phase = PHASES.graduated;
      else if (schoolConfirmed) phase = PHASES.confirmed;
      else phase = PHASES.exploratory;
    }

    const schoolSelectionUnlocked = milestones.academyAdmissionEligible;
    const schoolChangeAllowed = schoolSelectionUnlocked && !schoolConfirmed;
    const schoolConfirmationRequired = Boolean(
      milestones.schoolConfirmationEligible
      && formativeSchoolId
      && !schoolConfirmed
    );
    const tournamentUnlocked = Boolean(
      milestones.academyAdmissionEligible
      && formativeSchoolId
    );
    const duelSpecializationUnlocked = tournamentUnlocked;
    const allSchoolSpecializationsUnlocked = Boolean(
      milestones.graduated
      && formativeSchoolId
      && schoolConfirmed
    );
    const allowedSpecializationSchoolIds = allSchoolSpecializationsUnlocked
      ? [...SCHOOL_IDS]
      : (formativeSchoolId ? [formativeSchoolId] : []);

    return Object.freeze({
      ...milestones,
      phase,
      formativeSchoolId,
      formativeSchoolConfirmedAt,
      schoolConfirmed,
      schoolSelectionUnlocked,
      schoolChangeAllowed,
      schoolConfirmationRequired,
      schoolConfirmationAllowed: schoolConfirmationRequired,
      tournamentUnlocked,
      duelSpecializationUnlocked,
      allSchoolSpecializationsUnlocked,
      allowedSpecializationSchoolIds:Object.freeze(allowedSpecializationSchoolIds)
    });
  }

  return Object.freeze({
    PHASES,
    SCHOOL_IDS,
    academyProgressionState
  });
});
