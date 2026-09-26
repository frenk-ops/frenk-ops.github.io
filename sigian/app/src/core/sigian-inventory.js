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
    const inventory = scope === "inventory";
    return {
      scope,
      formulas:formulas.map(item => ({ ...item, inventory })),
      components:components.map(item => ({
        ...item,
        ownedQuantity:3,
        quantity:inventory ? 3 : null
      })),
      cosmetics:cosmetics.map(item => ({
        ...item,
        ownedQuantity:1,
        quantity:inventory ? 1 : null
      })),
      meta:{
        formulaCount:formulas.length,
        componentCount:components.length,
        cosmeticCount:cosmetics.length,
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
  A.getSigianInventoryFormula = function getSigianInventoryFormula(cardId) {
    return formulaItems().find(item => item.id === cardId) || null;
  };
})(window.Arcane = window.Arcane || {});
