(function (A) {
  "use strict";

  const CONTENT_SCHEMA_VERSION = 1;
  const KINDS = Object.freeze({
    SCHOOL:"school",
    SIGIL:"sigil",
    CONSTRAINT:"constraint",
    COSMETIC:"cosmetic"
  });

  function clone(value) {
    if (typeof A.deepClone === "function") return A.deepClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function materializeSchoolName(name, schoolId) {
    const school = A.getSigianSchool?.(schoolId);
    return String(name || "").replaceAll("<Scuola>", school?.name || String(schoolId || ""));
  }

  function schoolItems() {
    return (A.listSigianSchools?.({ status:"active" }) || []).map(item => ({
      ...item,
      kind:KINDS.SCHOOL,
      contentId:`school:${item.id}`,
      canonical:true
    }));
  }

  function schoolIconMarkup(schoolId, className = "school-icon-svg") {
    if (typeof A.schoolIconMarkup === "function") return A.schoolIconMarkup(schoolId, className);
    return `<span class="${String(className || "school-icon-svg")}" aria-hidden="true">✦</span>`;
  }

  function sigilGlyph(canonicalId) {
    const id = String(canonicalId || "");
    if (/damage|abbattimento|justice/.test(id)) return "✦";
    if (/wave|tide/.test(id)) return "≋";
    if (/heal|recovery/.test(id)) return "✚";
    if (/regeneration|rebirth/.test(id)) return "♨";
    if (/infusion/.test(id)) return "✧";
    if (/subtraction/.test(id)) return "−";
    if (/channeling|resonance/.test(id)) return "⌁";
    if (/erosion/.test(id)) return "⌇";
    if (/vampirism|life-drain/.test(id)) return "♥";
    if (/armor|protection/.test(id)) return "⬡";
    if (/amplification/.test(id)) return "✺";
    if (/retaliation|assault|arcane-attack/.test(id)) return "⚔";
    if (/destruction|uprooting|annihilation|soul-harvest/.test(id)) return "✹";
    if (/domination/.test(id)) return "◉";
    return "◈";
  }

  function canonicalItems(kind, status = null) {
    return (A.listSigianCanonicalV2?.({ kind, ...(status ? { status } : {}) }) || []).map(item => ({
      ...item,
      kind,
      contentId:`${kind}:${item.id}`,
      canonical:true
    }));
  }

  function cosmeticItems() {
    return (A.RAW_CARD_SETS?.["astral-original"] || []).map(card => ({
      id:`art:${card.id}`,
      contentId:`cosmetic:art:${card.id}`,
      kind:KINDS.COSMETIC,
      category:"art",
      name:`${card.name} — ART`,
      school:card.school,
      image:`assets/cards/remastered/${card.id}.png`,
      sourceFormulaId:card.id,
      status:"active",
      canonical:true
    }));
  }

  function listContent(options = {}) {
    const kind = options.kind == null ? null : String(options.kind);
    const status = options.status == null ? null : String(options.status);
    let items = [];
    if (!kind || kind === KINDS.SCHOOL) items.push(...schoolItems());
    if (!kind || kind === KINDS.SIGIL) items.push(...canonicalItems(KINDS.SIGIL, status));
    if (!kind || kind === KINDS.CONSTRAINT) items.push(...canonicalItems(KINDS.CONSTRAINT, status));
    if (!kind || kind === KINDS.COSMETIC) items.push(...cosmeticItems().filter(item => !status || item.status === status));
    return items.map(clone);
  }

  function getContent(id, kind = null) {
    const wanted = String(id || "");
    return listContent(kind ? { kind } : {}).find(item => item.id === wanted || item.contentId === wanted) || null;
  }

  function canonicalForCollectible(collectibleId, formulaSchool) {
    const identity = A.sigianCollectibleInventoryIdentity?.(collectibleId, formulaSchool);
    if (!identity?.definitionId) return null;
    const canonical = A.getSigianCanonicalV2?.(identity.definitionId);
    if (!canonical || canonical.kind !== KINDS.SIGIL || canonical.status !== "approved") return null;
    return { identity, canonical };
  }

  function forgeSigilOptions(formulaSchool = "fire") {
    const school = String(formulaSchool || "fire");
    return (A.listSigianCollectibleSigils?.({ status:"active" }) || [])
      .map(adapter => {
        const resolved = canonicalForCollectible(adapter.id, school);
        if (!resolved) return null;
        const schoolId = resolved.identity.effectSchool || adapter.schoolReference || school;
        const canonicalName = materializeSchoolName(resolved.canonical.name, schoolId);
        const displayName = adapter.atomic || adapter.grade == null
          ? canonicalName
          : `${canonicalName} ${adapter.grade === 1 ? "I" : adapter.grade === 2 ? "II" : adapter.grade === 3 ? "III" : adapter.grade === 4 ? "IV" : adapter.grade === 5 ? "V" : adapter.grade}`;
        return {
          ...adapter,
          kind:KINDS.SIGIL,
          canonicalId:resolved.canonical.id,
          canonicalName,
          displayName,
          summary:resolved.canonical.summary,
          grades:resolved.canonical.grades,
          effectSchool:resolved.identity.effectSchool || null,
          canonicalStatus:resolved.canonical.status,
          runtimeAdapter:true
        };
      })
      .filter(Boolean);
  }

  function getForgeSigilOption(collectibleId, formulaSchool = "fire") {
    return forgeSigilOptions(formulaSchool).find(item => item.id === String(collectibleId || "")) || null;
  }

  function sigilRuntimeCoverage(canonicalId) {
    if (typeof A.listSigianCollectibleSigils !== "function"
      || typeof A.sigianCollectibleInventoryIdentity !== "function") {
      return { runtimeReady:false, adapterIds:[] };
    }
    const adapterIds = new Set();
    const schools = schoolItems();
    schools.forEach(school => {
      forgeSigilOptions(school.id)
        .filter(item => item.canonicalId === canonicalId)
        .forEach(item => adapterIds.add(item.id));
    });
    return {
      runtimeReady:adapterIds.size > 0,
      adapterIds:[...adapterIds].sort()
    };
  }

  function exportCatalog() {
    return {
      schemaVersion:CONTENT_SCHEMA_VERSION,
      source:"SIGIAN canonical content catalog",
      schools:listContent({ kind:KINDS.SCHOOL }),
      sigils:listContent({ kind:KINDS.SIGIL }).map(item => ({
        ...item,
        ...sigilRuntimeCoverage(item.id)
      })),
      constraints:listContent({ kind:KINDS.CONSTRAINT }).map(item => ({
        ...item,
        runtimeReady:true
      })),
      cosmetics:listContent({ kind:KINDS.COSMETIC }).map(item => ({
        ...item,
        runtimeReady:true
      }))
    };
  }

  A.SIGIAN_CONTENT_SCHEMA_VERSION = CONTENT_SCHEMA_VERSION;
  A.SIGIAN_CONTENT_KINDS = KINDS;
  A.sigianContentSchoolIconMarkup = schoolIconMarkup;
  A.sigianContentSigilGlyph = sigilGlyph;
  A.listSigianContent = listContent;
  A.getSigianContent = getContent;
  A.materializeSigianContentName = materializeSchoolName;
  A.listSigianForgeSigilOptions = forgeSigilOptions;
  A.getSigianForgeSigilOption = getForgeSigilOption;
  A.buildSigianContentExport = exportCatalog;
})(window.Arcane = window.Arcane || {});
