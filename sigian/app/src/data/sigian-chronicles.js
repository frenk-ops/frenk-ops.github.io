(function (A) {
  "use strict";

  function environmentArt(slotId, altKey) {
    return Object.freeze({
      slotId,
      src:null,
      altKey
    });
  }

  function schoolEntry(options) {
    return Object.freeze({
      id:options.id,
      categoryId:"schools",
      type:"school",
      formativeSchoolId:options.formativeSchoolId,
      dominantElementId:options.dominantElementId,
      titleKey:options.titleKey,
      subtitleKey:options.subtitleKey,
      specializationKey:options.specializationKey,
      summaryKey:options.summaryKey,
      identityKey:options.identityKey,
      visualKey:options.visualKey,
      environmentKey:options.environmentKey,
      media:Object.freeze({
        environmentArt:environmentArt(options.environmentSlotId, options.environmentAltKey)
      })
    });
  }

  const schoolEntries = Object.freeze([
    schoolEntry({
      id:"school-umiria",
      formativeSchoolId:"water",
      dominantElementId:"water",
      titleKey:"chronicles.school.umiria.title",
      subtitleKey:"chronicles.school.umiria.subtitle",
      specializationKey:"chronicles.school.umiria.specialization",
      summaryKey:"chronicles.school.umiria.summary",
      identityKey:"chronicles.school.umiria.identity",
      visualKey:"chronicles.school.umiria.visual",
      environmentKey:"chronicles.school.umiria.environment",
      environmentSlotId:"school-umiria-environment",
      environmentAltKey:"chronicles.school.umiria.environmentAlt"
    }),
    schoolEntry({
      id:"school-pyrax",
      formativeSchoolId:"fire",
      dominantElementId:"fire",
      titleKey:"chronicles.school.pyrax.title",
      subtitleKey:"chronicles.school.pyrax.subtitle",
      specializationKey:"chronicles.school.pyrax.specialization",
      summaryKey:"chronicles.school.pyrax.summary",
      identityKey:"chronicles.school.pyrax.identity",
      visualKey:"chronicles.school.pyrax.visual",
      environmentKey:"chronicles.school.pyrax.environment",
      environmentSlotId:"school-pyrax-environment",
      environmentAltKey:"chronicles.school.pyrax.environmentAlt"
    }),
    schoolEntry({
      id:"school-vailis",
      formativeSchoolId:"air",
      dominantElementId:"air",
      titleKey:"chronicles.school.vailis.title",
      subtitleKey:"chronicles.school.vailis.subtitle",
      specializationKey:"chronicles.school.vailis.specialization",
      summaryKey:"chronicles.school.vailis.summary",
      identityKey:"chronicles.school.vailis.identity",
      visualKey:"chronicles.school.vailis.visual",
      environmentKey:"chronicles.school.vailis.environment",
      environmentSlotId:"school-vailis-environment",
      environmentAltKey:"chronicles.school.vailis.environmentAlt"
    }),
    schoolEntry({
      id:"school-gairon",
      formativeSchoolId:"nature",
      dominantElementId:"earth",
      titleKey:"chronicles.school.gairon.title",
      subtitleKey:"chronicles.school.gairon.subtitle",
      specializationKey:"chronicles.school.gairon.specialization",
      summaryKey:"chronicles.school.gairon.summary",
      identityKey:"chronicles.school.gairon.identity",
      visualKey:"chronicles.school.gairon.visual",
      environmentKey:"chronicles.school.gairon.environment",
      environmentSlotId:"school-gairon-environment",
      environmentAltKey:"chronicles.school.gairon.environmentAlt"
    }),
    schoolEntry({
      id:"school-nekiria",
      formativeSchoolId:"death",
      dominantElementId:"death",
      titleKey:"chronicles.school.nekiria.title",
      subtitleKey:"chronicles.school.nekiria.subtitle",
      specializationKey:"chronicles.school.nekiria.specialization",
      summaryKey:"chronicles.school.nekiria.summary",
      identityKey:"chronicles.school.nekiria.identity",
      visualKey:"chronicles.school.nekiria.visual",
      environmentKey:"chronicles.school.nekiria.environment",
      environmentSlotId:"school-nekiria-environment",
      environmentAltKey:"chronicles.school.nekiria.environmentAlt"
    })
  ]);

  const entries = Object.freeze(Object.fromEntries(
    schoolEntries.map(entry => [entry.id, entry])
  ));

  const categories = Object.freeze([
    Object.freeze({ id:"schools", titleKey:"chronicles.category.schools", descriptionKey:"chronicles.category.schoolsDescription", entryIds:Object.freeze(schoolEntries.map(entry => entry.id)) }),
    Object.freeze({ id:"sigil-art", titleKey:"chronicles.category.sigilArt", descriptionKey:"chronicles.category.sigilArtDescription", entryIds:Object.freeze([]) }),
    Object.freeze({ id:"sigian", titleKey:"chronicles.category.sigian", descriptionKey:"chronicles.category.sigianDescription", entryIds:Object.freeze([]) }),
    Object.freeze({ id:"academy", titleKey:"chronicles.category.academy", descriptionKey:"chronicles.category.academyDescription", entryIds:Object.freeze([]) }),
    Object.freeze({ id:"world", titleKey:"chronicles.category.world", descriptionKey:"chronicles.category.worldDescription", entryIds:Object.freeze([]) })
  ]);

  const chronicles = Object.freeze({
    schemaVersion:1,
    categories,
    entries
  });

  function listCategories() {
    return chronicles.categories.slice();
  }

  function listEntries(categoryId) {
    const category = chronicles.categories.find(item => item.id === categoryId);
    if (!category) return [];
    return category.entryIds.map(id => chronicles.entries[id]).filter(Boolean);
  }

  function getEntry(id) {
    return chronicles.entries[String(id || "")] || null;
  }

  function listSchoolEntries() {
    return listEntries("schools");
  }

  function getSchoolEntryByFormativeId(schoolId) {
    const requested = String(schoolId || "").trim();
    return schoolEntries.find(entry => entry.formativeSchoolId === requested) || null;
  }

  A.SIGIAN_CHRONICLES = chronicles;
  A.listSigianChronicleCategories = listCategories;
  A.listSigianChronicleEntries = listEntries;
  A.getSigianChronicleEntry = getEntry;
  A.listSigianSchoolChronicles = listSchoolEntries;
  A.getSigianSchoolChronicle = getSchoolEntryByFormativeId;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      chronicles,
      listCategories,
      listEntries,
      getEntry,
      listSchoolEntries,
      getSchoolEntryByFormativeId
    };
  }
})(typeof window !== "undefined" ? (window.Arcane = window.Arcane || {}) : {});
