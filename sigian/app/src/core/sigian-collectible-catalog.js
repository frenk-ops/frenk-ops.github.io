(function (A) {
  "use strict";

  const CATALOG_VERSION = 1;
  const FUSION_COPIES = 2;

  const DAMAGE_BANDS = Object.freeze({
    1:[1,2,3],
    2:[4,5,6],
    3:[7,8,9,10]
  });
  const HEAL_BANDS = Object.freeze({
    1:[1,2,3],
    2:[4,5,6],
    3:[7,8,9,10]
  });
  const AREA_BANDS = Object.freeze({
    1:[1,2,3],
    2:[4,5,6],
    3:[7,8,9,10]
  });
  const SMALL_RESOURCE_BANDS = Object.freeze({
    1:[1],
    2:[2],
    3:[3]
  });
  const TIGHT_FIVE_BANDS = Object.freeze({
    1:[1],
    2:[2],
    3:[3],
    4:[4],
    5:[5]
  });
  const POWER_SCALE_BY_GRADE = Object.freeze({
    1:"scale-power-half",
    2:"scale-power",
    3:"scale-power-double"
  });

  function clone(value) {
    if (typeof A.deepClone === "function") return A.deepClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function roman(grade) {
    return ({ 1:"I", 2:"II", 3:"III", 4:"IV", 5:"V" })[grade] || String(grade);
  }

  function activeSchools() {
    return A.listSigianSchools?.({ status:"active" }) || [];
  }

  function schoolName(schoolId) {
    return A.getSigianSchool?.(schoolId)?.name || String(schoolId || "");
  }

  function normalizeModifiers(list) {
    return (list || []).map(item => ({
      id:String(item.id || ""),
      params:clone(item.params || {})
    }));
  }

  const templates = [];
  function add(definition) {
    templates.push(Object.freeze({
      grades:[1],
      family:"other",
      fusion:"none",
      split:"none",
      intensityBands:null,
      presetConfig:{},
      fixedModifiers:[],
      hiddenConfigKeys:[],
      hiddenModifierFamilies:[],
      status:"active",
      ...definition
    }));
  }

  function addGraded(definition) {
    add({
      grades:[1,2,3],
      fusion:"vertical-2x",
      split:"vertical-2x",
      ...definition
    });
  }

  function addSchoolGraded(base) {
    activeSchools().forEach(school => addGraded({
      ...base,
      id:`${base.id}-${school.id}`,
      name:`${base.name} ${school.name}`,
      presetConfig:{
        ...(base.presetConfig || {}),
        ...(typeof base.schoolConfig === "function" ? base.schoolConfig(school.id) : { school:school.id })
      },
      schoolReference:school.id
    }));
  }

  // Direct fixed-value damage. Grade chooses the collectible band; intensity is
  // selected only inside that band. These ranges are a FIXED design decision
  // from the 0.43 atomization pass.
  addGraded({
    id:"damage-hero",
    name:"Danno Incantatore",
    baseSigilId:"damage",
    family:"damage",
    intensityBands:DAMAGE_BANDS,
    presetConfig:{ when:"onDeploy", target:"enemy-hero" },
    hiddenConfigKeys:["when","target","selector"],
    hiddenModifierFamilies:["scaling"]
  });
  addGraded({
    id:"damage-creature",
    name:"Danno Creatura",
    baseSigilId:"damage",
    family:"damage",
    intensityBands:DAMAGE_BANDS,
    presetConfig:{ when:"onDeploy", target:"enemy-creature", selector:"strongest-health" },
    hiddenConfigKeys:["when","target","selector"],
    hiddenModifierFamilies:["scaling"]
  });
  addGraded({
    id:"damage-power-hero",
    name:"Danno Potere Incantatore",
    baseSigilId:"damage",
    family:"damage-power",
    intensityBands:{ 1:[0], 2:[0], 3:[0] },
    presetConfig:{ when:"onDeploy", target:"enemy-hero" },
    modifierByGrade:POWER_SCALE_BY_GRADE,
    hiddenConfigKeys:["when","target","selector"],
    hiddenModifierFamilies:["scaling"]
  });

  addGraded({
    id:"wave-field",
    name:"Onda Creature",
    baseSigilId:"wave",
    family:"area-damage",
    intensityBands:AREA_BANDS,
    presetConfig:{ when:"onDeploy", scope:"field" },
    hiddenConfigKeys:["when","scope"],
    hiddenModifierFamilies:["scaling"]
  });
  addGraded({
    id:"wave-front",
    name:"Onda Fronte",
    baseSigilId:"wave",
    family:"area-damage",
    intensityBands:AREA_BANDS,
    presetConfig:{ when:"onDeploy", scope:"front" },
    hiddenConfigKeys:["when","scope"],
    hiddenModifierFamilies:["scaling"]
  });
  addGraded({
    id:"wave-power-field",
    name:"Onda Potere Creature",
    baseSigilId:"wave",
    family:"area-damage-power",
    intensityBands:{ 1:[0], 2:[0], 3:[0] },
    presetConfig:{ when:"onDeploy", scope:"field" },
    modifierByGrade:POWER_SCALE_BY_GRADE,
    hiddenConfigKeys:["when","scope"],
    hiddenModifierFamilies:["scaling"]
  });
  addGraded({
    id:"wave-power-front",
    name:"Onda Potere Fronte",
    baseSigilId:"wave",
    family:"area-damage-power",
    intensityBands:{ 1:[0], 2:[0], 3:[0] },
    presetConfig:{ when:"onDeploy", scope:"front" },
    modifierByGrade:POWER_SCALE_BY_GRADE,
    hiddenConfigKeys:["when","scope"],
    hiddenModifierFamilies:["scaling"]
  });

  addGraded({
    id:"backlash-deploy",
    name:"Contraccolpo d'Impronta",
    baseSigilId:"backlash",
    family:"malus-damage",
    intensityBands:DAMAGE_BANDS,
    presetConfig:{ when:"onDeploy", target:"self-hero" },
    hiddenConfigKeys:["when","target"]
  });
  addGraded({
    id:"backlash-attack",
    name:"Contraccolpo d'Attacco",
    baseSigilId:"backlash",
    family:"malus-damage",
    intensityBands:DAMAGE_BANDS,
    presetConfig:{ when:"onBeforeAttack", target:"self-hero" },
    hiddenConfigKeys:["when","target"]
  });

  addGraded({
    id:"retaliation-damaged",
    name:"Ritorsione al Danno",
    baseSigilId:"retaliation",
    family:"reactive-damage",
    intensityBands:DAMAGE_BANDS,
    presetConfig:{ reaction:"damaged", target:"event-source" },
    hiddenConfigKeys:["reaction","target"],
    hiddenModifierFamilies:["scaling"]
  });
  addGraded({
    id:"retaliation-attacked",
    name:"Ritorsione all'Attacco",
    baseSigilId:"retaliation",
    family:"reactive-damage",
    intensityBands:DAMAGE_BANDS,
    presetConfig:{ reaction:"attacked", target:"event-source" },
    hiddenConfigKeys:["reaction","target"],
    hiddenModifierFamilies:["scaling"]
  });

  addGraded({
    id:"heal-hero",
    name:"Cura Incantatore",
    baseSigilId:"heal",
    family:"healing",
    intensityBands:HEAL_BANDS,
    presetConfig:{ when:"onDeploy", target:"self-hero" },
    hiddenConfigKeys:["when","target"],
    hiddenModifierFamilies:["scaling"]
  });
  addGraded({
    id:"heal-creature",
    name:"Cura Creatura",
    baseSigilId:"heal",
    family:"healing",
    grades:[1,2,3,4,5],
    intensityBands:TIGHT_FIVE_BANDS,
    presetConfig:{ when:"onDeploy", target:"allied-creature" },
    hiddenConfigKeys:["when","target"],
    hiddenModifierFamilies:["scaling"]
  });
  addGraded({
    id:"heal-power-hero",
    name:"Cura Potere Incantatore",
    baseSigilId:"heal",
    family:"healing-power",
    intensityBands:{ 1:[0], 2:[0], 3:[0] },
    presetConfig:{ when:"onDeploy", target:"self-hero" },
    modifierByGrade:POWER_SCALE_BY_GRADE,
    hiddenConfigKeys:["when","target"],
    hiddenModifierFamilies:["scaling"]
  });

  addGraded({
    id:"restoration-field",
    name:"Restaurazione Creature",
    baseSigilId:"restoration",
    family:"area-healing",
    intensityBands:AREA_BANDS,
    presetConfig:{ when:"onDeploy", scope:"field" },
    hiddenConfigKeys:["when","scope"],
    hiddenModifierFamilies:["scaling"]
  });
  addGraded({
    id:"restoration-front",
    name:"Restaurazione Fronte",
    baseSigilId:"restoration",
    family:"area-healing",
    intensityBands:AREA_BANDS,
    presetConfig:{ when:"onDeploy", scope:"front" },
    hiddenConfigKeys:["when","scope"],
    hiddenModifierFamilies:["scaling"]
  });
  add({
    id:"restoration-full-field",
    name:"Restaurazione Totale",
    baseSigilId:"restoration",
    family:"area-healing",
    atomic:true,
    presetConfig:{ when:"onDeploy", scope:"field" },
    intensityBands:{ 1:[0] },
    fixedModifiers:[{ id:"scale-full-health", params:{} }],
    hiddenConfigKeys:["when","scope"],
    hiddenModifierFamilies:["scaling"]
  });

  addGraded({
    id:"regeneration",
    name:"Rigenerazione",
    baseSigilId:"regeneration",
    family:"healing-over-time",
    intensityBands:SMALL_RESOURCE_BANDS,
    presetConfig:{ when:"onBeforeAttack", target:"source" },
    hiddenConfigKeys:["when","target"]
  });

  addSchoolGraded({
    id:"infusion",
    name:"Infusione",
    baseSigilId:"infusion",
    family:"power-gain",
    intensityBands:SMALL_RESOURCE_BANDS,
    schoolConfig:schoolId => ({ when:"onDeploy", schools:[schoolId] }),
    hiddenConfigKeys:["when","schools"]
  });
  addGraded({
    id:"infusion-all",
    name:"Infusione Totale",
    baseSigilId:"infusion",
    family:"power-gain",
    grades:[1,2,3,4,5],
    intensityBands:TIGHT_FIVE_BANDS,
    presetConfig:{ when:"onDeploy", schools:"all" },
    hiddenConfigKeys:["when","schools"]
  });

  addSchoolGraded({
    id:"subtraction",
    name:"Sottrazione",
    baseSigilId:"subtraction",
    family:"power-loss",
    intensityBands:SMALL_RESOURCE_BANDS,
    schoolConfig:schoolId => ({ when:"onDeploy", scope:"power", school:schoolId }),
    hiddenConfigKeys:["when","scope","school"]
  });
  addGraded({
    id:"subtraction-all",
    name:"Sottrazione Totale",
    baseSigilId:"subtraction",
    family:"power-loss",
    intensityBands:SMALL_RESOURCE_BANDS,
    presetConfig:{ when:"onDeploy", scope:"all-powers", school:activeSchools()[0]?.id || "fire" },
    hiddenConfigKeys:["when","scope","school"]
  });

  addSchoolGraded({
    id:"channeling",
    name:"Canalizzazione",
    baseSigilId:"channeling",
    family:"power-growth",
    intensityBands:SMALL_RESOURCE_BANDS,
    schoolConfig:schoolId => ({ when:"whileAlive", scope:"power", school:schoolId }),
    hiddenConfigKeys:["when","scope","school"]
  });
  addGraded({
    id:"channeling-all",
    name:"Canalizzazione Totale",
    baseSigilId:"channeling",
    family:"power-growth",
    intensityBands:SMALL_RESOURCE_BANDS,
    presetConfig:{ when:"whileAlive", scope:"all-powers", school:activeSchools()[0]?.id || "fire" },
    hiddenConfigKeys:["when","scope","school"]
  });

  addSchoolGraded({
    id:"erosion-enemy",
    name:"Erosione",
    baseSigilId:"erosion",
    family:"enemy-power-growth-loss",
    intensityBands:SMALL_RESOURCE_BANDS,
    schoolConfig:schoolId => ({ when:"whileAlive", side:"enemy", scope:"power", school:schoolId }),
    hiddenConfigKeys:["when","side","scope","school"]
  });
  addGraded({
    id:"erosion-enemy-all",
    name:"Erosione Totale",
    baseSigilId:"erosion",
    family:"enemy-power-growth-loss",
    intensityBands:SMALL_RESOURCE_BANDS,
    presetConfig:{ when:"whileAlive", side:"enemy", scope:"all-powers", school:activeSchools()[0]?.id || "fire" },
    hiddenConfigKeys:["when","side","scope","school"]
  });
  addSchoolGraded({
    id:"erosion-self",
    name:"Erosione Propria",
    baseSigilId:"erosion",
    family:"self-power-growth-loss",
    intensityBands:SMALL_RESOURCE_BANDS,
    schoolConfig:schoolId => ({ when:"whileAlive", side:"self", scope:"power", school:schoolId }),
    hiddenConfigKeys:["when","side","scope","school"]
  });

  addSchoolGraded({
    id:"tribute",
    name:"Tributo",
    baseSigilId:"tribute",
    family:"self-power-loss",
    intensityBands:SMALL_RESOURCE_BANDS,
    schoolConfig:schoolId => ({ when:"onDeploy", scope:"power", school:schoolId }),
    hiddenConfigKeys:["when","scope","school"]
  });
  addGraded({
    id:"tribute-all",
    name:"Tributo Totale",
    baseSigilId:"tribute",
    family:"self-power-loss",
    intensityBands:SMALL_RESOURCE_BANDS,
    presetConfig:{ when:"onDeploy", scope:"all-powers", school:activeSchools()[0]?.id || "fire" },
    hiddenConfigKeys:["when","scope","school"]
  });

  add({
    id:"protection-hero-half",
    name:"Protezione Incantatore",
    baseSigilId:"protection",
    family:"protection",
    atomic:true,
    presetConfig:{ mode:"halve", targetScope:"hero", stacking:"per-copy" },
    hiddenConfigKeys:["mode","targetScope","stacking","threshold"]
  });
  addGraded({
    id:"protection-all-flat",
    name:"Protezione Totale",
    baseSigilId:"protection",
    family:"protection",
    intensityBands:SMALL_RESOURCE_BANDS,
    presetConfig:{ mode:"subtract", targetScope:"hero-and-creatures", stacking:"presence", threshold:1 },
    hiddenConfigKeys:["mode","targetScope","stacking","threshold"]
  });

  addGraded({
    id:"arcane-amplification-flat",
    name:"Amplificazione Arcana",
    baseSigilId:"arcane-amplification",
    family:"spell-amplification",
    intensityBands:SMALL_RESOURCE_BANDS,
    presetConfig:{ mode:"flat", numerator:1, denominator:1, stacking:"per-copy" },
    hiddenConfigKeys:["mode","numerator","denominator","stacking"]
  });
  add({
    id:"arcane-amplification-x15",
    name:"Amplificazione Arcana ×1,5",
    baseSigilId:"arcane-amplification",
    family:"spell-amplification",
    atomic:true,
    presetConfig:{ mode:"multiplier", numerator:3, denominator:2, stacking:"per-copy" },
    hiddenConfigKeys:["mode","numerator","denominator","stacking"]
  });

  add({
    id:"combat-fury-x15",
    name:"Furia ×1,5",
    baseSigilId:"combat-fury",
    family:"combat-amplification",
    atomic:true,
    presetConfig:{ mode:"multiplier", numerator:3, denominator:2, stacking:"per-copy" },
    hiddenConfigKeys:["mode","numerator","denominator","stacking"]
  });
  add({
    id:"total-assault",
    name:"Assalto Totale",
    baseSigilId:"total-assault",
    family:"combat",
    atomic:true
  });

  activeSchools().forEach(school => add({
    id:`arcane-attack-${school.id}`,
    name:`Attacco Arcano ${school.name}`,
    baseSigilId:"arcane-attack",
    family:"combat",
    atomic:true,
    presetConfig:{ school:school.id },
    schoolReference:school.id,
    hiddenConfigKeys:["school"]
  }));

  add({
    id:"absorption-source-half",
    name:"Assorbimento Creatura",
    baseSigilId:"absorption",
    family:"lifesteal",
    atomic:true,
    presetConfig:{ sourceTarget:"creature", healTarget:"source", numerator:1, denominator:2 },
    hiddenConfigKeys:["sourceTarget","healTarget","numerator","denominator"]
  });
  add({
    id:"absorption-hero-full",
    name:"Assorbimento Incantatore",
    baseSigilId:"absorption",
    family:"lifesteal",
    atomic:true,
    presetConfig:{ sourceTarget:"any", healTarget:"self-hero", numerator:1, denominator:1 },
    hiddenConfigKeys:["sourceTarget","healTarget","numerator","denominator"]
  });

  add({
    id:"destruction-highest-life",
    name:"Distruzione · Più Vita",
    baseSigilId:"destruction",
    family:"control",
    atomic:true,
    presetConfig:{ when:"onDeploy", target:"enemy-creature" },
    fixedModifiers:[{ id:"selector-highest-life", params:{} }],
    hiddenConfigKeys:["when","target"],
    hiddenModifierFamilies:["selector"]
  });
  add({
    id:"destruction-highest-attack",
    name:"Distruzione · Più Attacco",
    baseSigilId:"destruction",
    family:"control",
    atomic:true,
    presetConfig:{ when:"onDeploy", target:"enemy-creature" },
    fixedModifiers:[{ id:"selector-highest-attack", params:{} }],
    hiddenConfigKeys:["when","target"],
    hiddenModifierFamilies:["selector"]
  });

  add({
    id:"annihilation-enemy",
    name:"Annientamento Nemico",
    baseSigilId:"annihilation",
    family:"control",
    atomic:true,
    status:"retired",
    presetConfig:{ when:"onDeploy", scope:"enemy-field" },
    hiddenConfigKeys:["when","scope"],
    hiddenModifierFamilies:["constraint"]
  });
  add({
    id:"annihilation-all",
    name:"Annientamento",
    baseSigilId:"annihilation",
    family:"control",
    atomic:true,
    presetConfig:{ when:"onDeploy", scope:"all-field" },
    hiddenConfigKeys:["when","scope"],
    hiddenModifierFamilies:["constraint"]
  });

  addGraded({
    id:"rebirth",
    name:"Rinascita",
    baseSigilId:"rebirth",
    family:"control",
    intensityBands:SMALL_RESOURCE_BANDS,
    presetConfig:{ when:"onSelfDeath", target:"source" },
    hiddenConfigKeys:["when","target"]
  });
  add({
    id:"eternal-rebirth",
    name:"Rinascita Eterna",
    baseSigilId:"eternal-rebirth",
    family:"control",
    atomic:true,
    presetConfig:{ when:"onSelfDeath", target:"source" },
    hiddenConfigKeys:["when","target"]
  });

  addGraded({
    id:"domination",
    name:"Dominio",
    baseSigilId:"domination",
    family:"control",
    intensityBands:SMALL_RESOURCE_BANDS,
    presetConfig:{ when:"onDeploy", destination:"own-hero" },
    fixedModifiers:[{ id:"selector-highest-attack", params:{} }],
    hiddenConfigKeys:["when","destination"],
    hiddenModifierFamilies:["selector"]
  });

  function gradeEntry(template, grade) {
    const intensityValues = template.intensityBands?.[grade] || null;
    const modifierId = template.modifierByGrade?.[grade] || null;
    const fixedModifiers = normalizeModifiers(template.fixedModifiers);
    if (modifierId) {
      fixedModifiers.push({
        id:modifierId,
        params:{ school:"$formula-school" }
      });
    }
    const id = `${template.id}-g${grade}`;
    return Object.freeze({
      id,
      templateId:template.id,
      name:template.name,
      displayName:template.atomic ? template.name : `${template.name} ${roman(grade)}`,
      baseSigilId:template.baseSigilId,
      family:template.family,
      grade,
      atomic:Boolean(template.atomic),
      affinitySupport:["mono","dual","triple","universal"],
      intensityValues:intensityValues ? [...intensityValues] : null,
      defaultIntensity:intensityValues?.[0] ?? (template.atomic ? null : grade),
      presetConfig:clone(template.presetConfig || {}),
      fixedModifiers,
      hiddenConfigKeys:[...(template.hiddenConfigKeys || [])],
      hiddenModifierFamilies:[...(template.hiddenModifierFamilies || [])],
      fusion:template.fusion,
      split:template.split,
      fusionCopies:template.fusion === "vertical-2x" ? FUSION_COPIES : null,
      schoolReference:template.schoolReference || null,
      status:template.status
    });
  }

  const entries = [];
  templates.forEach(template => {
    (template.grades || [1]).forEach(grade => entries.push(gradeEntry(template, grade)));
  });
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const templatesById = new Map(templates.map(template => [template.id, template]));

  function materializeModifier(modifier, formulaSchool) {
    const params = clone(modifier.params || {});
    Object.keys(params).forEach(key => {
      if (params[key] === "$formula-school") params[key] = formulaSchool;
    });
    return { id:modifier.id, params };
  }

  A.SIGIAN_COLLECTIBLE_CATALOG_VERSION = CATALOG_VERSION;
  A.SIGIAN_COLLECTIBLE_FUSION_COPIES = FUSION_COPIES;
  A.SIGIAN_DIRECT_DAMAGE_GRADE_BANDS = clone(DAMAGE_BANDS);

  A.listSigianCollectibleSigils = function listSigianCollectibleSigils(options = {}) {
    const status = options.status == null ? "active" : String(options.status);
    return entries
      .filter(entry => !status || entry.status === status)
      .map(clone);
  };

  A.getSigianCollectibleSigil = function getSigianCollectibleSigil(id) {
    const entry = byId.get(String(id || ""));
    return entry ? clone(entry) : null;
  };

  A.getSigianCollectibleTemplate = function getSigianCollectibleTemplate(id) {
    const template = templatesById.get(String(id || ""));
    return template ? clone(template) : null;
  };

  A.createRecipeSigilFromCollectible = function createRecipeSigilFromCollectible(collectibleId, options = {}) {
    const entry = byId.get(String(collectibleId || ""));
    if (!entry || entry.status !== "active") throw new Error(`Sigillo collezionabile non attivo: ${collectibleId}.`);
    const formulaSchool = String(options.formulaSchool || activeSchools()[0]?.id || "fire");
    const modifiers = entry.fixedModifiers.map(modifier => materializeModifier(modifier, formulaSchool));
    const baseDefinition = A.getCanonicalSigil?.(entry.baseSigilId);
    (baseDefinition?.requiredModifierFamilies || []).forEach(family => {
      if (modifiers.some(modifier => A.getSigianAdvancedModifier?.(modifier.id)?.family === family)) return;
      const modifierId = (baseDefinition.modifierOptions?.[family] || []).find(id => A.getSigianAdvancedModifier?.(id)?.status === "active");
      if (!modifierId) return;
      const params = {};
      const modifierDefinition = A.getSigianAdvancedModifier?.(modifierId);
      Object.entries(modifierDefinition?.paramsSchema || {}).forEach(([key, schema]) => {
        if (schema === "school") params[key] = formulaSchool;
        else if (Array.isArray(schema) && schema.length) params[key] = schema[0];
      });
      if (modifierId === "activation-power-threshold") {
        params.side = "self";
        params.op = "gte";
        params.value = 6;
      }
      modifiers.push({ id:modifierId, params });
    });

    return {
      slotId:String(options.slotId || `forge-${entry.id}`),
      collectibleId:entry.id,
      sigilId:entry.baseSigilId,
      grade:entry.grade,
      intensity:entry.defaultIntensity,
      affinity:A.normalizeSigianAffinity?.({ mode:"mono", schools:[formulaSchool] }, formulaSchool)
        || { mode:"mono", schools:[formulaSchool] },
      config:clone(entry.presetConfig),
      modifiers
    };
  };

  A.sigianCollectibleAllowsIntensity = function sigianCollectibleAllowsIntensity(collectibleId, value) {
    const entry = byId.get(String(collectibleId || ""));
    if (!entry) return false;
    if (!entry.intensityValues) return value == null;
    return entry.intensityValues.includes(Number(value));
  };

  A.sigianCollectibleFusion = function sigianCollectibleFusion(collectibleId) {
    const entry = byId.get(String(collectibleId || ""));
    if (!entry || entry.fusion !== "vertical-2x") return null;
    const next = byId.get(`${entry.templateId}-g${entry.grade + 1}`);
    if (!next) return null;
    return {
      copies:FUSION_COPIES,
      from:entry.id,
      to:next.id
    };
  };

  A.sigianCollectibleSplit = function sigianCollectibleSplit(collectibleId) {
    const entry = byId.get(String(collectibleId || ""));
    if (!entry || entry.split !== "vertical-2x" || entry.grade <= 1) return null;
    const previous = byId.get(`${entry.templateId}-g${entry.grade - 1}`);
    if (!previous) return null;
    return {
      from:entry.id,
      produces:FUSION_COPIES,
      to:previous.id,
      costPolicy:"open"
    };
  };
})(window.Arcane = window.Arcane || {});
