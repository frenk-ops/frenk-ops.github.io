(function (A) {
  "use strict";

  const SCHOOL_ORDER = Object.freeze(["fire", "water", "air", "nature", "death"]);
  const SCHOOL_META = Object.freeze({
    fire:   { name:"Fuoco", icon:"🔥", color:"#c94a37" },
    water:  { name:"Acqua", icon:"💧", color:"#3f82d8" },
    air:    { name:"Aria", icon:"🌪️", color:"#9cc7d8" },
    nature: { name:"Terra", icon:"🍃", color:"#6f9b4d" },
    death:  { name:"Morte", icon:"💀", color:"#8d6aad" }
  });
  const AFFINITY_MODES = Object.freeze({
    mono: { id:"mono", label:"Mono", size:1 },
    dual: { id:"dual", label:"Dual", size:2 },
    triple: { id:"triple", label:"Triple", size:3 },
    universal: { id:"universal", label:"Universale", size:5 }
  });
  const ROMAN = Object.freeze({ 1:"I", 2:"II", 3:"III", 4:"IV", 5:"V" });

  function clone(value) {
    if (typeof A.deepClone === "function") return A.deepClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function hash(value) {
    let out = 0;
    const text = String(value || "");
    for (let i = 0; i < text.length; i += 1) out = ((out << 5) - out + text.charCodeAt(i)) | 0;
    return Math.abs(out);
  }

  const INVENTORY_QUANTITY_STORAGE_KEY = "sigian.inventory.quantities.v1";

  function inventoryQuantityOverrides() {
    try {
      if (typeof localStorage === "undefined") return {};
      const raw = localStorage.getItem(INVENTORY_QUANTITY_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function ownedQuantity(kind, id, fallback) {
    const overrides = inventoryQuantityOverrides();
    const key = `${kind}:${id}`;
    const value = Number(overrides[key]);
    return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : fallback;
  }

  function constraintInventoryId(constraint) {
    if (!constraint?.definitionId) return "";
    const definition = A.getSigianCanonicalV2?.(constraint.definitionId);
    if (!definition) return "";
    const schoolBound = /<Scuola>/.test(String(definition.name || ""));
    const gradeLess = /senza Gradi/i.test(String(definition.grades || ""));
    const school = schoolBound ? String(constraint.school || "fire") : "neutral";
    const grade = gradeLess || constraint.grade == null ? "special" : `g${Math.max(1, Math.trunc(Number(constraint.grade || 1)))}`;
    return [constraint.definitionId, school, grade].join(":");
  }

  const COLLECTIBLE_CANONICAL_MAP = Object.freeze({
    "damage-hero":"v2-damage-hero",
    "damage-creature":"v2-damage-creature",
    "damage-power-hero":"v2-damage-power-hero",
    "wave-field":"v2-wave",
    "wave-front":"v2-tide",
    "wave-power-field":"v2-wave-power",
    "wave-power-front":"v2-tide-power",
    "retaliation-damaged":"v2-retaliation",
    "heal-hero":"v2-heal-hero",
    "heal-power-hero":"v2-heal-power-hero",
    "restoration-front":"v2-recovery",
    "restoration-full-field":"v2-full-recovery",
    "regeneration":"v2-regeneration",
    "subtraction-all":"v2-subtraction-all",
    "channeling-all":"v2-channeling-all",
    "erosion-enemy-all":"v2-enemy-erosion-all",
    "protection-hero-half":"v2-protection-hero",
    "protection-all-flat":"v2-arcane-armor",
    "arcane-amplification-flat":"v2-spell-amplification-flat",
    "arcane-amplification-x15":"v2-spell-amplification-powerful",
    "combat-fury-x15":"v2-allied-amplification",
    "total-assault":"v2-total-assault",
    "absorption-source-half":"v2-vampirism",
    "absorption-hero-full":"v2-life-drain",
    "destruction-highest-life":"v2-uprooting",
    "rebirth":"v2-rebirth",
    "eternal-rebirth":"v2-eternal-rebirth",
    "domination":"v2-domination"
  });

  const COLLECTIBLE_CANONICAL_GRADE_OVERRIDE = Object.freeze({
    "protection-hero-half":2,
    "arcane-amplification-x15":2,
    "combat-fury-x15":2,
    "absorption-source-half":2,
    "absorption-hero-full":4
  });

  function canonicalDefinitionForCollectible(collectible) {
    if (!collectible) return null;
    const templateId = String(collectible.templateId || "");
    if (COLLECTIBLE_CANONICAL_MAP[templateId]) return COLLECTIBLE_CANONICAL_MAP[templateId];
    if (/^infusion-[^-]+$/.test(templateId)) return "v2-infusion-school";
    if (/^subtraction-[^-]+$/.test(templateId)) return "v2-subtraction-school";
    if (/^channeling-[^-]+$/.test(templateId)) return "v2-channeling-school";
    if (/^erosion-enemy-[^-]+$/.test(templateId)) return "v2-enemy-erosion-school";
    if (/^arcane-attack-[^-]+$/.test(templateId)) return "v2-arcane-attack-school";
    return null;
  }

  function collectibleInventoryIdentity(collectibleId, formulaSchool) {
    const collectible = A.getSigianCollectibleSigil?.(collectibleId);
    const definitionId = canonicalDefinitionForCollectible(collectible);
    const definition = definitionId ? A.getSigianCanonicalV2?.(definitionId) : null;
    if (!collectible || !definition || definition.status !== "approved") return null;

    const schoolBound = /<Scuola>/.test(String(definition.name || ""));
    const effectSchool = schoolBound
      ? String(collectible.schoolReference || formulaSchool || "fire")
      : "neutral";
    const gradeLess = /senza Gradi/i.test(String(definition.grades || ""));
    const specialOneGrade = /speciale\s*·\s*1 Grado/i.test(String(definition.grades || ""));
    const overrideGrade = COLLECTIBLE_CANONICAL_GRADE_OVERRIDE[collectible.templateId];
    const grade = gradeLess || specialOneGrade
      ? "special"
      : `g${Math.max(1, Math.trunc(Number(overrideGrade || collectible.grade || 1)))}`;
    return {
      inventoryId:[definitionId, effectSchool, grade].join(":"),
      definitionId,
      effectSchool:schoolBound ? effectSchool : null,
      grade:grade === "special" ? null : Number(grade.slice(1)),
      collectible
    };
  }

  function collectibleSigilInventoryItems(formulaSchool = "fire") {
    return (A.listSigianCollectibleSigils?.({ status:"active" }) || [])
      .map(item => {
        const identity = collectibleInventoryIdentity(item.id, formulaSchool);
        if (!identity) return null;
        const quantity = ownedQuantity("component", identity.inventoryId, 3);
        return {
          ...item,
          inventoryId:identity.inventoryId,
          canonicalDefinitionId:identity.definitionId,
          effectSchool:identity.effectSchool,
          canonicalGrade:identity.grade,
          kind:"sigil",
          quantity,
          ownedQuantity:quantity
        };
      })
      .filter(Boolean);
  }

  function schoolName(id) {
    return SCHOOL_META[id]?.name || String(id || "");
  }

  function schoolIcon(id) {
    return SCHOOL_META[id]?.icon || "✦";
  }

  function schoolColor(id) {
    return SCHOOL_META[id]?.color || "#b6945a";
  }

  function gradeNumbers(grades) {
    const source = String(grades || "");
    if (!source || /TBD/i.test(source) || /senza Gradi/i.test(source)) return [null];
    if (/speciale\s*·\s*1 Grado/i.test(source)) return [null];
    const matches = source.match(/\b(?:I|II|III|IV|V)\b/g) || [];
    const map = { I:1, II:2, III:3, IV:4, V:5 };
    const values = [...new Set(matches.map(value => map[value]).filter(Boolean))];
    return values.length ? values : [null];
  }

  function familyFor(entry) {
    const id = String(entry?.id || "");
    if (/constraint-(backlash|scarcity|weakness|overpower)/.test(id)) return "Vincoli reattivi";
    if (/constraint-friendly-fire/.test(id)) return "Fuoco Amico";
    if (/constraint-(erosion|threshold|limit|tribute)/.test(id)) return "Vincoli di Potere";
    if (/damage|abbattimento/.test(id)) return "Danno";
    if (/wave|tide/.test(id)) return "Area";
    if (/heal|recovery|regeneration|vital|vampirism|life-drain/.test(id)) return "Vita";
    if (/infusion|subtraction|channeling|enemy-erosion|necromantic/.test(id)) return "Potere";
    if (/armor|attack|protection|amplification|assault|retaliation/.test(id)) return "Combattimento";
    if (/domination|rebirth|destruction|uprooting|justice|soul-harvest|annihilation/.test(id)) return "Controllo";
    return entry?.kind === "constraint" ? "Vincoli" : "Arcano";
  }

  function provisionalAffinity(itemId) {
    const seed = hash(itemId);
    const modes = ["mono", "dual", "triple", "universal"];
    const mode = modes[seed % modes.length];
    const count = AFFINITY_MODES[mode].size;
    if (mode === "universal") {
      return {
        mode,
        schools:[...SCHOOL_ORDER],
        status:"provisional"
      };
    }
    const start = Math.floor(seed / 7) % SCHOOL_ORDER.length;
    const schools = [];
    for (let i = 0; i < count; i += 1) schools.push(SCHOOL_ORDER[(start + i) % SCHOOL_ORDER.length]);
    return { mode, schools, status:"provisional" };
  }

  function affinityLabel(affinity) {
    const source = affinity || { mode:"mono", schools:["fire"] };
    const mode = AFFINITY_MODES[source.mode] || AFFINITY_MODES.mono;
    if (source.mode === "universal") return `${mode.label} · ✦`;
    return `${mode.label} · ${(source.schools || []).map(id => `${schoolIcon(id)} ${schoolName(id)}`).join(" / ")}`;
  }

  function affinityCssVars(affinity) {
    const source = affinity || { mode:"mono", schools:["fire"] };
    const schools = source.mode === "universal" ? SCHOOL_ORDER : (source.schools || []);
    return {
      mode: source.mode || "mono",
      a: schoolColor(schools[0]),
      b: schoolColor(schools[1] || schools[0]),
      c: schoolColor(schools[2] || schools[1] || schools[0])
    };
  }

  function replaceSchoolToken(text, school) {
    return String(text || "").replaceAll("<Scuola>", schoolName(school));
  }

  function expandCanonicalEntries() {
    const source = A.listSigianCanonicalV2?.() || [];
    const out = [];
    source.forEach(entry => {
      const schools = /<Scuola>/.test(entry.name) ? SCHOOL_ORDER : [null];
      const grades = gradeNumbers(entry.grades);
      schools.forEach(effectSchool => {
        grades.forEach(grade => {
          const baseName = effectSchool ? replaceSchoolToken(entry.name, effectSchool) : entry.name;
          const gradeSuffix = grade == null ? "" : ` ${ROMAN[grade] || grade}`;
          const itemId = [
            entry.id,
            effectSchool || "neutral",
            grade == null ? "special" : `g${grade}`
          ].join(":");
          const affinity = provisionalAffinity(itemId);
          out.push({
            id:itemId,
            definitionId:entry.id,
            kind:entry.kind,
            family:familyFor(entry),
            name:`${baseName}${gradeSuffix}`,
            baseName,
            grade,
            gradeLabel:grade == null ? "Speciale" : ROMAN[grade],
            grades:entry.grades,
            effectSchool,
            summary:replaceSchoolToken(entry.summary, effectSchool),
            canonicalStatus:entry.status,
            selectable:entry.status === "approved",
            affinity,
            affinityLabel:affinityLabel(affinity),
            affinityStatus:"provisional",
            rarity:null,
            rarityStatus:"pending",
            quantity:3
          });
        });
      });
    });
    return out;
  }

  const LEGACY_SIGIL_NAMES = Object.freeze({
    damage:"Danno",
    wave:"Onda",
    heal:"Cura",
    restoration:"Recupero",
    regeneration:"Rigenerazione",
    infusion:"Infusione",
    subtraction:"Sottrazione",
    channeling:"Canalizzazione",
    erosion:"Erosione",
    tribute:"Tributo",
    protection:"Protezione Incantatore",
    "arcane-amplification":"Amplificazione Magie",
    "combat-fury":"Amplificazione Alleati",
    "total-assault":"Assalto Totale",
    "arcane-attack":"Attacco Arcano",
    absorption:"Assorbimento",
    destruction:"Distruzione",
    annihilation:"Annientamento",
    rebirth:"Rinascita",
    "eternal-rebirth":"Rinascita Eterna",
    domination:"Dominio",
    backlash:"Contraccolpo",
    retaliation:"Ritorsione"
  });

  function modifierById(sigil, id) {
    return (sigil?.modifiers || []).find(item => item.id === id) || null;
  }

  function provisionalLegacyComponent(sigil, index) {
    const config = sigil?.config || {};
    const id = String(sigil?.sigilId || "");
    let kind = "sigil";
    let name = LEGACY_SIGIL_NAMES[id] || id || "Componente";
    let detail = "Mappatura provvisoria dalla recipe runtime originale.";

    if (id === "wave" && config.scope === "front") name = "Marea";
    if (id === "wave" && config.scope !== "front") name = "Onda";
    if (id === "arcane-attack" && config.school) name = `Attacco Arcano ${schoolName(config.school)}`;
    if (id === "erosion" && config.side === "self") {
      kind = "constraint";
      name = `Erosione ${config.school ? schoolName(config.school) : ""}`.trim();
    }
    if (id === "erosion" && config.side === "enemy") {
      name = config.scope === "all-powers" ? "Erosione Nemica Totale" : `Erosione Nemica ${schoolName(config.school)}`;
    }
    if (id === "tribute") {
      kind = "constraint";
      name = config.scope === "all-powers" ? "Tributo Totale" : `Tributo ${schoolName(config.school)}`;
    }
    if (id === "backlash") {
      kind = "constraint";
      if (modifierById(sigil, "activation-power-threshold")) name = "Contraccolpo da Carenza";
      if (modifierById(sigil, "activation-power-comparison")) name = "Contraccolpo da Inferiorità";
    }

    return {
      id:`legacy:${sigil?.slotId || index}:${index}`,
      kind,
      name,
      status:"pending",
      detail
    };
  }

  function legacyFormulaComponents(cardId) {
    const spec = A.SIGIAN_BASE_RECIPE_SPECS?.[cardId];
    if (!spec) return [];
    const components = [];
    (spec.sigils || []).forEach((sigil, index) => {
      const main = provisionalLegacyComponent(sigil, index);
      components.push(main);

      const friendly = modifierById(sigil, "constraint-friendly-fire");
      if (friendly) {
        components.push({
          id:`${main.id}:friendly-fire`,
          kind:"constraint",
          name:"Fuoco Amico",
          status:"approved",
          detail:"Vincolo globale canonico. Il danno ad area compatibile colpisce anche le creature alleate."
        });
      }
      const friendlyLimit = modifierById(sigil, "constraint-friendly-fire-power-threshold");
      if (friendlyLimit) {
        const school = friendlyLimit.params?.school || configSchoolFromSigil(sigil);
        const value = Number(friendlyLimit.params?.value || 0);
        components.push({
          id:`${main.id}:friendly-fire-limit`,
          kind:"constraint",
          name:`Fuoco Amico Limite ${schoolName(school)}`,
          status:"approved",
          detail:`Il Fuoco Amico è attivo quando il Potere ${schoolName(school)} è inferiore a ${value}.`
        });
      }
      if (idNeedsThresholdAsGlobalConstraint(sigil)) {
        const threshold = modifierById(sigil, "activation-power-threshold");
        const school = threshold?.params?.school;
        const value = Number(threshold?.params?.value || 0);
        if (school && threshold?.params?.op === "gte") {
          components.push({
            id:`${main.id}:threshold`,
            kind:"constraint",
            name:`Soglia ${schoolName(school)}`,
            status:"approved",
            detail:`I Sigilli della Formula richiedono Potere ${schoolName(school)} almeno ${value}.`
          });
        }
      }
    });
    return components;
  }

  function configSchoolFromSigil(sigil) {
    return sigil?.config?.school || "fire";
  }

  function idNeedsThresholdAsGlobalConstraint(sigil) {
    return sigil?.sigilId === "eternal-rebirth";
  }


  function formulaComponents(cardId) {
    const canonical = A.getSigianBaseCanonicalComponents?.(cardId) || [];
    if (canonical.length) {
      return canonical.map((component, index) => ({
        ...component,
        id:`canonical:${cardId}:${index + 1}`,
        status:"approved",
        detail:component.detail || "Componente canonico della Formula originale."
      }));
    }
    return legacyFormulaComponents(cardId);
  }

  function originalCards() {
    return clone(A.RAW_CARD_SETS?.["astral-original"] || []);
  }

  function formulaItems() {
    return originalCards().map(card => ({
      id:card.id,
      formulaInstanceId:`owned:${card.id}`,
      name:card.name,
      school:card.school,
      type:card.type,
      level:Number(card.level || card.cost || 0),
      attack:Number(card.attack || 0),
      health:Number(card.health ?? card.hp ?? 0),
      text:card.text || "",
      keyword:card.keyword || "",
      image:`assets/cards/remastered/${card.id}.png`,
      original:true,
      quantity:1,
      owned:true,
      conversionStatus:"complete",
      components:formulaComponents(card.id)
    }));
  }

  function cosmeticItems() {
    return originalCards().map(card => ({
      id:`art:${card.id}`,
      category:"art",
      name:`${card.name} — ART`,
      school:card.school,
      image:`assets/cards/remastered/${card.id}.png`,
      sourceFormulaId:card.id,
      quantity:1,
      owned:true,
      status:"active"
    }));
  }

  function archiveData(scope = "collection") {
    const components = expandCanonicalEntries();
    const formulas = formulaItems();
    const cosmetics = cosmeticItems();
    const forgeSigils = collectibleSigilInventoryItems();
    const inventory = scope === "inventory";
    return {
      scope,
      formulas:formulas.map(item => ({ ...item, inventory })),
      components:components.map(item => {
        const quantity = ownedQuantity(item.kind === "constraint" ? "constraint" : "component", item.id, 3);
        return {
          ...item,
          ownedQuantity:quantity,
          quantity:inventory ? quantity : null
        };
      }),
      cosmetics:cosmetics.map(item => {
        const quantity = ownedQuantity("art", item.id, 1);
        return {
          ...item,
          ownedQuantity:quantity,
          quantity:inventory ? quantity : null
        };
      }),
      forgeSigils:forgeSigils.map(item => ({
        ...item,
        quantity:inventory ? item.ownedQuantity : null
      })),
      meta:{
        formulaCount:formulas.length,
        componentCount:components.length,
        cosmeticCount:cosmetics.length,
        forgeSigilCount:forgeSigils.length,
        affinityStatus:"provisional",
        rarityStatus:"pending",
        formulaConversionStatus:"complete"
      }
    };
  }

  A.SIGIAN_AFFINITY_MODES = AFFINITY_MODES;
  A.SIGIAN_AFFINITY_SCHOOL_ORDER = SCHOOL_ORDER;
  A.sigianSchoolMeta = function sigianSchoolMeta(id) {
    return clone(SCHOOL_META[id] || { name:String(id || ""), icon:"✦", color:"#b6945a" });
  };
  A.sigianAffinityLabel = affinityLabel;
  A.sigianAffinityCssVars = affinityCssVars;
  A.listSigianCanonicalCollectibles = function listSigianCanonicalCollectibles(options = {}) {
    return expandCanonicalEntries().filter(item => {
      if (options.kind && item.kind !== options.kind) return false;
      if (options.status && item.canonicalStatus !== options.status) return false;
      return true;
    });
  };
  A.buildSigianArchiveData = archiveData;
  A.listSigianInventoryCollectibleSigils = function listSigianInventoryCollectibleSigils(formulaSchool = "fire") {
    return collectibleSigilInventoryItems(formulaSchool).map(clone);
  };
  A.sigianCollectibleInventoryIdentity = function sigianCollectibleInventoryIdentity(collectibleId, formulaSchool = "fire") {
    const identity = collectibleInventoryIdentity(collectibleId, formulaSchool);
    return identity ? clone(identity) : null;
  };
  A.isSigianCollectibleInventoryCompatible = function isSigianCollectibleInventoryCompatible(collectibleId, formulaSchool = "fire") {
    return Boolean(collectibleInventoryIdentity(collectibleId, formulaSchool));
  };
  A.getSigianOwnedCollectibleSigilQuantity = function getSigianOwnedCollectibleSigilQuantity(collectibleId, formulaSchool = "fire") {
    const identity = collectibleInventoryIdentity(collectibleId, formulaSchool);
    return identity ? ownedQuantity("component", identity.inventoryId, 3) : 0;
  };
  A.sigianConstraintInventoryId = constraintInventoryId;
  A.getSigianOwnedConstraintQuantity = function getSigianOwnedConstraintQuantity(constraint) {
    const id = constraintInventoryId(constraint);
    return id ? ownedQuantity("constraint", id, 3) : 0;
  };
  A.listSigianInventoryArts = function listSigianInventoryArts() {
    return cosmeticItems()
      .map(item => ({ ...item, ownedQuantity:ownedQuantity("art", item.id, 1), quantity:ownedQuantity("art", item.id, 1) }))
      .filter(item => item.ownedQuantity > 0);
  };
  A.getSigianInventoryArt = function getSigianInventoryArt(id) {
    return A.listSigianInventoryArts().find(item => item.id === String(id || "")) || null;
  };
  A.getSigianInventoryFormula = function getSigianInventoryFormula(cardId) {
    return formulaItems().find(item => item.id === cardId) || null;
  };
})(window.Arcane = window.Arcane || {});
