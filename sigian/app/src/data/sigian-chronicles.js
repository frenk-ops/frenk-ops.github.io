(function (A) {
  "use strict";

  const categories = Object.freeze([
    Object.freeze({ id:"schools", titleKey:"chronicles.category.schools", descriptionKey:"chronicles.category.schoolsDescription", entryIds:Object.freeze([]) }),
    Object.freeze({ id:"sigil-art", titleKey:"chronicles.category.sigilArt", descriptionKey:"chronicles.category.sigilArtDescription", entryIds:Object.freeze([]) }),
    Object.freeze({ id:"sigian", titleKey:"chronicles.category.sigian", descriptionKey:"chronicles.category.sigianDescription", entryIds:Object.freeze([]) }),
    Object.freeze({ id:"academy", titleKey:"chronicles.category.academy", descriptionKey:"chronicles.category.academyDescription", entryIds:Object.freeze([]) }),
    Object.freeze({ id:"world", titleKey:"chronicles.category.world", descriptionKey:"chronicles.category.worldDescription", entryIds:Object.freeze([]) })
  ]);

  const entries = Object.freeze({});

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

  A.SIGIAN_CHRONICLES = chronicles;
  A.listSigianChronicleCategories = listCategories;
  A.listSigianChronicleEntries = listEntries;
  A.getSigianChronicleEntry = getEntry;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { chronicles, listCategories, listEntries, getEntry };
  }
})(typeof window !== "undefined" ? (window.Arcane = window.Arcane || {}) : {});
