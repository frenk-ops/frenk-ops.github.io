(function (A) {
  "use strict";

  function clone(value) {
    if (typeof A.deepClone === "function") return A.deepClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function normalizedId(value, label) {
    const id = String(value || "").trim();
    if (!id) throw new Error(`${label} richiede un id.`);
    return id;
  }

  function createRegistry(label) {
    const items = new Map();

    return Object.freeze({
      register(definition, options = {}) {
        const source = definition || {};
        const id = normalizedId(source.id, label);
        if (items.has(id) && !options.replace) {
          throw new Error(`${label} già registrato: ${id}.`);
        }
        const stored = {
          ...source,
          id,
          status: String(source.status || "active")
        };
        items.set(id, stored);
        return stored;
      },
      get(id) {
        return items.get(String(id || "")) || null;
      },
      has(id) {
        return items.has(String(id || ""));
      },
      list(options = {}) {
        const status = options.status == null ? null : String(options.status);
        return [...items.values()]
          .filter(item => !status || item.status === status)
          .map(item => {
            const copy = { ...item };
            delete copy.compile;
            return clone(copy);
          });
      }
    });
  }

  const schools = createRegistry("Scuola");
  const sigils = createRegistry("Sigillo canonico");
  const modifiers = createRegistry("Modifier");
  const compilers = new Map();

  (A.SCHOOLS || []).forEach(school => schools.register({
    id: school.id,
    name: school.name,
    icon: school.icon,
    status: "active",
    source: "base-set"
  }));

  const SIGIL_DEFINITIONS = [
    {
      id: "damage", family: "damage",
      modifierFamilies: ["scaling", "activation"],
      modifierOptions: {
        scaling: ["scale-power-half", "scale-power", "scale-power-double"],
        activation: ["activation-power-threshold", "activation-power-comparison", "activation-critical-life"]
      },
      configSchema: {
        when: ["onDeploy"],
        target: ["enemy-hero", "enemy-creature"],
        selector: ["strongest-health", "strongest-attack"]
      }
    },
    {
      id: "wave", family: "damage",
      modifierFamilies: ["scaling", "constraint"],
      modifierOptions: {
        scaling: ["scale-power-half", "scale-power", "scale-target-attack"],
        constraint: ["constraint-friendly-fire", "constraint-friendly-fire-power-threshold"]
      },
      configSchema: { when: ["onDeploy"], scope: ["field", "front"] }
    },
    {
      id: "backlash", family: "damage",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-power-comparison"]
      },
      configSchema: { when: ["onDeploy", "onBeforeAttack"], target: ["self-hero"] }
    },
    {
      id: "retaliation", family: "damage",
      modifierFamilies: ["scaling", "activation"],
      modifierOptions: {
        scaling: ["scale-power-half", "scale-power"],
        activation: ["activation-power-threshold", "activation-power-comparison", "activation-critical-life"]
      },
      configSchema: { reaction: ["damaged", "attacked"], target: ["event-source"] }
    },
    {
      id: "heal", family: "healing",
      modifierFamilies: ["scaling", "activation"],
      modifierOptions: {
        scaling: ["scale-power-half", "scale-power", "scale-power-double", "scale-creature-count"],
        activation: ["activation-power-threshold", "activation-power-comparison", "activation-critical-life", "activation-on-any-death"]
      },
      configSchema: {
        when: ["onDeploy", "onBeforeAttack"],
        target: ["self-hero", "allied-creature"]
      }
    },
    {
      id: "restoration", family: "healing",
      modifierFamilies: ["scaling", "activation"],
      modifierOptions: {
        scaling: ["scale-power-half", "scale-power", "scale-full-health"],
        activation: ["activation-power-threshold", "activation-critical-life"]
      },
      configSchema: {
        when: ["onDeploy", "onBeforeAttack"],
        scope: ["field", "front"]
      }
    },
    {
      id: "regeneration", family: "healing",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-critical-life"]
      },
      configSchema: { when: ["onBeforeAttack"], target: ["source"] }
    },
    {
      id: "infusion", family: "power",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-power-comparison", "activation-on-any-death"]
      },
      gradeModel: { type: "magnitude", unit: "power" },
      configSchema: { when: ["onDeploy"], schools: "schools" }
    },
    {
      id: "subtraction", family: "power",
      modifierFamilies: ["selector", "activation"],
      modifierOptions: {
        selector: [],
        activation: ["activation-power-threshold", "activation-power-comparison"]
      },
      configSchema: { when: ["onDeploy"], scope: ["power", "all-powers"], school: "school" }
    },
    {
      id: "channeling", family: "power",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-power-comparison"]
      },
      configSchema: { when: ["whileAlive"], scope: ["power", "all-powers"], school: "school" }
    },
    {
      id: "erosion", family: "power",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-power-comparison"]
      },
      configSchema: {
        when: ["whileAlive"],
        side: ["self", "enemy"],
        scope: ["power", "all-powers"],
        school: "school"
      }
    },
    {
      id: "tribute", family: "power",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-power-comparison"]
      },
      configSchema: {
        when: ["onDeploy"],
        scope: ["power", "all-powers"],
        school: "school"
      }
    },
    {
      id: "protection", family: "combat",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-critical-life"]
      },
      configSchema: {
        mode: ["halve", "subtract"],
        targetScope: ["hero", "hero-and-creatures"],
        stacking: ["per-copy", "presence"],
        threshold: "number"
      }
    },
    {
      id: "arcane-amplification", family: "combat",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-critical-life"]
      },
      configSchema: { mode: ["multiplier", "flat"], numerator: "number", denominator: "number", stacking: ["per-copy", "presence"] }
    },
    {
      id: "combat-fury", family: "combat",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-critical-life"]
      },
      configSchema: { mode: ["multiplier"], numerator: "number", denominator: "number", stacking: ["per-copy", "presence"] }
    },
    {
      id: "total-assault", family: "combat",
      modifierFamilies: [],
      modifierOptions: {},
      configSchema: {}
    },
    {
      id: "arcane-attack", family: "combat",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold"]
      },
      configSchema: { school: "school" }
    },
    {
      id: "absorption", family: "combat",
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-critical-life"]
      },
      configSchema: { sourceTarget: ["creature", "any"], healTarget: ["source", "self-hero"], numerator: "number", denominator: "number" }
    },
    {
      id: "destruction", family: "control",
      modifierFamilies: ["selector", "activation"],
      modifierOptions: {
        selector: ["selector-highest-life", "selector-highest-attack"],
        activation: ["activation-power-threshold", "activation-power-comparison"]
      },
      configSchema: { when: ["onDeploy"], target: ["enemy-creature"] }
    },
    {
      id: "annihilation", family: "control",
      modifierFamilies: ["constraint", "activation"],
      modifierOptions: {
        constraint: ["constraint-friendly-fire"],
        activation: ["activation-power-threshold", "activation-power-comparison"]
      },
      configSchema: { when: ["onDeploy"], scope: ["enemy-field", "all-field"] }
    },
    {
      id: "rebirth", family: "control",
      gradeModel: { type: "revival-count" },
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-power-comparison"]
      },
      configSchema: { when: ["onSelfDeath"], target: ["source"] }
    },
    {
      id: "eternal-rebirth", family: "control",
      gradeModel: { type: "fixed", grade: 1 },
      atomic: true,
      requiredModifierFamilies: ["activation"],
      modifierFamilies: ["activation"],
      modifierOptions: {
        activation: ["activation-power-threshold", "activation-power-comparison"]
      },
      configSchema: { when: ["onSelfDeath"], target: ["source"] }
    },
    {
      id: "domination", family: "control",
      modifierFamilies: ["selector", "activation"],
      modifierOptions: {
        selector: ["selector-highest-attack"],
        activation: ["activation-power-threshold", "activation-power-comparison"]
      },
      configSchema: { when: ["onDeploy"], destination: ["own-hero"] }
    }
  ];

  SIGIL_DEFINITIONS.forEach(definition => {
    sigils.register({
      gradeModel: { type: "magnitude" },
      affinitySupport: ["mono", "dual", "triple", "universal"],
      rarityPolicy: "derived-from-power-flexibility",
      ...definition,
      status: "active"
    });
  });

  [
    { id: "chain", family: "future", modifierFamilies: [], modifierOptions: {}, configSchema: {}, status: "reserved" },
    { id: "echo", family: "future", modifierFamilies: [], modifierOptions: {}, configSchema: {}, status: "reserved" }
  ].forEach(definition => sigils.register(definition));

  [
    { id: "scale-power-half", family: "scaling", status: "active", paramsSchema: { school: "school", min: "number" } },
    { id: "scale-power", family: "scaling", status: "active", paramsSchema: { school: "school", min: "number" } },
    { id: "scale-power-double", family: "scaling", status: "active", paramsSchema: { school: "school", min: "number" } },
    { id: "scale-target-attack", family: "scaling", status: "active", paramsSchema: {} },
    { id: "scale-full-health", family: "scaling", status: "active", paramsSchema: {} },
    { id: "scale-creature-count", family: "scaling", status: "active", paramsSchema: {} },
    { id: "scale-damage-dealt", family: "scaling", status: "active", paramsSchema: { numerator: "number", denominator: "number" } },

    { id: "activation-power-threshold", family: "activation", status: "active", paramsSchema: { side: ["self", "enemy"], school: "school", op: ["lt", "lte", "gt", "gte", "eq", "neq"], value: "number" } },
    { id: "activation-power-comparison", family: "activation", status: "active", paramsSchema: { leftSide: ["self", "enemy"], rightSide: ["self", "enemy"], leftSchool: "school", rightSchool: "school", op: ["lt", "lte", "gt", "gte", "eq", "neq"] } },
    { id: "activation-critical-life", family: "activation", status: "provisional", paramsSchema: { op: ["lt", "lte", "gt", "gte"], value: "number" } },
    { id: "activation-on-any-death", family: "activation", status: "active", paramsSchema: {} },

    { id: "constraint-friendly-fire", family: "constraint", status: "active", paramsSchema: {} },
    { id: "constraint-friendly-fire-power-threshold", family: "constraint", status: "active", paramsSchema: { school: "school", op: ["lt", "lte", "gt", "gte"], value: "number" } },

    { id: "selector-highest-life", family: "selector", status: "active", paramsSchema: {} },
    { id: "selector-highest-attack", family: "selector", status: "active", paramsSchema: {} }
  ].forEach(definition => modifiers.register(definition));


  // Canonical v2 design catalog.
  //
  // This catalog is deliberately separate from the legacy runtime/compiler
  // registry above. "approved" means the player-facing structure has been
  // agreed; it does NOT imply that the compiler/runtime migration is complete.
  // "review" entries stay visible in the UI Lab but disabled until their
  // structure is explicitly approved.
  const canonicalV2 = createRegistry("Catalogo canonico v2");

  const FIXED_BANDS = "I 1–3 · II 4–6 · III 7–10 · IV 11–15 · V 16–20";
  const POWER_OFFSET_BANDS = "I 0–3 · II 4–6 · III 7–10 · IV 11–15 · V 16–20";
  const TIGHT_FIVE = "I 1 · II 2 · III 3 · IV 4 · V 5";

  [
    { id:"v2-damage-hero", kind:"sigil", name:"Danno Incantatore", status:"approved", grades:FIXED_BANDS, summary:"Danno fisso all'Incantatore nemico." },
    { id:"v2-damage-creature", kind:"sigil", name:"Danno Creatura", status:"approved", grades:FIXED_BANDS, summary:"Danno fisso a una creatura nemica scelta." },
    { id:"v2-abbattimento", kind:"sigil", name:"Abbattimento", status:"approved", grades:FIXED_BANDS, summary:"Danno alla creatura nemica con più Vita." },

    { id:"v2-damage-power-minor-hero", kind:"sigil", name:"Danno Potere Minore <Scuola>", status:"approved", grades:POWER_OFFSET_BANDS, summary:"floor(P/2) + X all'Incantatore nemico." },
    { id:"v2-damage-power-hero", kind:"sigil", name:"Danno Potere <Scuola>", status:"approved", grades:POWER_OFFSET_BANDS, summary:"P + X all'Incantatore nemico." },
    { id:"v2-damage-power-major-hero", kind:"sigil", name:"Danno Potere Maggiore <Scuola>", status:"approved", grades:POWER_OFFSET_BANDS, summary:"2P + X all'Incantatore nemico." },

    { id:"v2-wave", kind:"sigil", name:"Onda", status:"approved", grades:FIXED_BANDS, summary:"Danno fisso a tutte le creature nemiche." },
    { id:"v2-wave-power-minor", kind:"sigil", name:"Onda Potere Minore <Scuola>", status:"approved", grades:POWER_OFFSET_BANDS, summary:"floor(P/2) + X a tutte le creature nemiche." },
    { id:"v2-wave-power", kind:"sigil", name:"Onda Potere <Scuola>", status:"approved", grades:POWER_OFFSET_BANDS, summary:"P + X a tutte le creature nemiche." },
    { id:"v2-wave-power-major", kind:"sigil", name:"Onda Potere Maggiore <Scuola>", status:"approved", grades:POWER_OFFSET_BANDS, summary:"2P + X a tutte le creature nemiche." },

    { id:"v2-tide", kind:"sigil", name:"Marea", status:"approved", grades:FIXED_BANDS, summary:"Onda estesa: danno alle creature nemiche e all'Incantatore nemico.", formerName:"Deflagrazione" },
    { id:"v2-tide-power-minor", kind:"sigil", name:"Marea Potere Minore <Scuola>", status:"approved", grades:POWER_OFFSET_BANDS, summary:"floor(P/2) + X alle creature nemiche e all'Incantatore nemico." },
    { id:"v2-tide-power", kind:"sigil", name:"Marea Potere <Scuola>", status:"approved", grades:POWER_OFFSET_BANDS, summary:"P + X alle creature nemiche e all'Incantatore nemico." },
    { id:"v2-tide-power-major", kind:"sigil", name:"Marea Potere Maggiore <Scuola>", status:"approved", grades:POWER_OFFSET_BANDS, summary:"2P + X alle creature nemiche e all'Incantatore nemico." },
    { id:"v2-tide-power-reduced", kind:"sigil", name:"Marea Potere Ridotta <Scuola>", status:"approved", grades:"speciale · 1 Grado", summary:"max(0, P − 1) alle creature nemiche e all'Incantatore nemico; Chain Lightning anchor." },

    { id:"v2-heal-hero", kind:"sigil", name:"Cura Incantatore", status:"approved", grades:FIXED_BANDS, summary:"Cura fissa al proprio Incantatore." },
    { id:"v2-heal-power-minor-hero", kind:"sigil", name:"Cura Potere Minore <Scuola>", status:"approved", grades:POWER_OFFSET_BANDS, summary:"floor(P/2) + X Vita al proprio Incantatore." },
    { id:"v2-heal-power-hero", kind:"sigil", name:"Cura Potere <Scuola>", status:"approved", grades:POWER_OFFSET_BANDS, summary:"P + X Vita al proprio Incantatore." },
    { id:"v2-heal-power-major-hero", kind:"sigil", name:"Cura Potere Maggiore <Scuola>", status:"approved", grades:POWER_OFFSET_BANDS, summary:"2P + X Vita al proprio Incantatore." },

    { id:"v2-regeneration", kind:"sigil", name:"Rigenerazione", status:"approved", grades:TIGHT_FIVE, summary:"La creatura cura sé stessa al proprio trigger naturale." },
    { id:"v2-recurring-heal-hero", kind:"sigil", name:"Cura Ricorrente Incantatore", status:"approved", grades:TIGHT_FIVE, summary:"Cura ricorrente del proprio Incantatore." },
    { id:"v2-recovery", kind:"sigil", name:"Recupero", status:"approved", grades:FIXED_BANDS, summary:"Cura dello stesso X al proprio Incantatore e a tutte le creature alleate." },
    { id:"v2-recurring-recovery", kind:"sigil", name:"Recupero Ricorrente", status:"approved", grades:TIGHT_FIVE, summary:"Cura ricorrente del proprio Incantatore e di tutte le creature alleate." },
    { id:"v2-full-recovery", kind:"sigil", name:"Recupero Totale", status:"approved", grades:"speciale · senza Gradi", summary:"Cura completamente tutte le creature alleate." },

    { id:"v2-infusion-school", kind:"sigil", name:"Infusione <Scuola>", status:"approved", grades:FIXED_BANDS, summary:"Aumento immediato del proprio Potere della Scuola." },
    { id:"v2-subtraction-school", kind:"sigil", name:"Sottrazione <Scuola>", status:"approved", grades:FIXED_BANDS, summary:"Riduzione immediata del Potere nemico della Scuola." },
    { id:"v2-subtraction-all", kind:"sigil", name:"Sottrazione Totale", status:"approved", grades:FIXED_BANDS, summary:"Riduzione immediata di tutti i Poteri nemici." },
    { id:"v2-channeling-school", kind:"sigil", name:"Canalizzazione <Scuola>", status:"approved", grades:TIGHT_FIVE, summary:"Aumenta la crescita del proprio Potere della Scuola." },
    { id:"v2-channeling-all", kind:"sigil", name:"Canalizzazione Totale", status:"approved", grades:TIGHT_FIVE, summary:"Aumenta la crescita di tutti i propri Poteri." },
    { id:"v2-enemy-erosion-school", kind:"sigil", name:"Erosione Nemica <Scuola>", status:"approved", grades:TIGHT_FIVE, summary:"Riduce la crescita del Potere nemico della Scuola." },
    { id:"v2-enemy-erosion-all", kind:"sigil", name:"Erosione Nemica Totale", status:"approved", grades:TIGHT_FIVE, summary:"Riduce la crescita di tutti i Poteri nemici." },

    { id:"v2-necromantic-resonance", kind:"sigil", name:"Risonanza Necromantica", status:"approved", grades:TIGHT_FIVE, summary:"A ogni morte di una creatura aumenta il proprio Potere Morte." },
    { id:"v2-vital-resonance", kind:"sigil", name:"Risonanza Vitale", status:"approved", grades:TIGHT_FIVE, summary:"A ogni morte di una creatura cura il proprio Incantatore." },

    { id:"v2-vampirism", kind:"sigil", name:"Vampirismo", status:"approved", grades:"I 25% · II 50% · III 75% · IV 100%", summary:"La creatura cura sé stessa per una percentuale del danno effettivo che infligge." },
    { id:"v2-life-drain", kind:"sigil", name:"Drenaggio Vitale", status:"approved", grades:"I 25% · II 50% · III 75% · IV 100%", summary:"Il proprio Incantatore recupera una percentuale del danno effettivo della Formula all'Incantatore nemico." },

    { id:"v2-domination", kind:"sigil", name:"Dominio", status:"approved", grades:"I 1 creatura · II 2 · III 3", summary:"Infligge al nemico la somma dell'Attacco attuale delle N creature nemiche più forti." },
    { id:"v2-rebirth", kind:"sigil", name:"Rinascita", status:"approved", grades:"I 1 ritorno · II 2 · III 3", summary:"Rinascite finite della creatura." },
    { id:"v2-eternal-rebirth", kind:"sigil", name:"Rinascita Eterna", status:"approved", grades:"speciale · senza Gradi", summary:"Rinascita ripetuta; Sigillo vincolato a un Vincolo compatibile (Phoenix: Soglia Fuoco ≥ 10)." },
    { id:"v2-arcane-armor", kind:"sigil", name:"Armatura Arcana", status:"approved", grades:TIGHT_FIVE, summary:"Riduce di 1–5 ogni danno a Incantatore e creature alleate, mai sotto 1; non cumulabile." },
    { id:"v2-destruction", kind:"sigil", name:"Distruzione", status:"approved", grades:"speciale · senza Gradi", summary:"Distrugge una creatura nemica scelta senza danno normale." },
    { id:"v2-uprooting", kind:"sigil", name:"Sradicamento", status:"approved", grades:"speciale · senza Gradi", summary:"Distrugge la creatura nemica con più Vita." },
    { id:"v2-justice", kind:"sigil", name:"Giustizia", status:"approved", grades:"speciale · senza Gradi", summary:"Ogni creatura nemica subisce danno pari al proprio Attacco." },
    { id:"v2-soul-harvest", kind:"sigil", name:"Mietitura d'Anime", status:"approved", grades:"speciale · senza Gradi", summary:"Distrugge tutte le creature e cura in base alle creature coinvolte." },

    { id:"v2-arcane-attack-school", kind:"sigil", name:"Attacco Arcano <Scuola>", status:"approved", grades:"speciale · senza Gradi", summary:"L'Attacco della creatura è pari al proprio Potere della Scuola indicata." },
    { id:"v2-protection-hero", kind:"sigil", name:"Protezione Incantatore", status:"approved", grades:"I 25% · II 50% · III 75% · IV 100%", summary:"Riduce percentualmente ogni danno subito dal proprio Incantatore; non cumulabile, prevale il Grado più alto." },
    { id:"v2-allied-amplification", kind:"sigil", name:"Amplificazione Alleati", status:"approved", grades:"I 25% · II 50% · III 75% · IV 100%", summary:"Aumenta percentualmente il danno da combattimento delle creature alleate; non cumulabile, prevale il Grado più alto." },
    { id:"v2-spell-amplification-flat", kind:"sigil", name:"Amplificazione Magie", status:"approved", grades:"I +1 · II +2 · III +3 · IV +4 · V +5", summary:"Aggiunge danno fisso alle proprie Magie; non cumulabile con copie della stessa identità." },
    { id:"v2-spell-amplification-powerful", kind:"sigil", name:"Amplificazione Magie Potente", status:"approved", grades:"I 25% · II 50% · III 75% · IV 100%", summary:"Aggiunge una percentuale del danno base della Magia; distinta da Amplificazione Magie e non cumulabile con copie della stessa identità." },
    { id:"v2-total-assault", kind:"sigil", name:"Assalto Totale", status:"approved", grades:"speciale · senza Gradi", summary:"Quando la creatura attacca, colpisce l'Incantatore nemico e tutte le creature nemiche." },
    { id:"v2-retaliation", kind:"sigil", name:"Ritorsione", status:"approved", grades:"I 1 · II 2 · III 3 · IV 4 · V 5", summary:"Dopo aver subito danno da combattimento da una creatura nemica, infligge X danni all'attaccante; si attiva anche se muore, una volta per attacco, e non genera altra Ritorsione." },
    { id:"v2-heal-creature", kind:"sigil", name:"Cura Creatura", status:"review", grades:"TBD", summary:"Possibile famiglia futura; non ancora approvata nel catalogo v2." },
    { id:"v2-infusion-all", kind:"sigil", name:"Infusione Totale", status:"review", grades:"TBD", summary:"Possibile famiglia futura; non ancora approvata nel catalogo v2." },
    { id:"v2-annihilation", kind:"sigil", name:"Annientamento", status:"review", grades:"TBD", summary:"Famiglia generica distinta da Mietitura d'Anime ancora da rivedere." },

    { id:"v2-constraint-erosion-school", kind:"constraint", name:"Erosione <Scuola>", status:"approved", grades:TIGHT_FIVE, summary:"Riduce di 1–5 la crescita del proprio Potere della Scuola." },
    { id:"v2-constraint-threshold-school", kind:"constraint", name:"Soglia <Scuola>", status:"approved", grades:"I 1–3 · II 4–6 · III 7–10 · IV 11–15 · V 16–20", summary:"Gate globale: tutti i Sigilli attivi solo se P ≥ N; il Body resta attivo." },
    { id:"v2-constraint-limit-school", kind:"constraint", name:"Limite <Scuola>", status:"approved", grades:"I 16–20 · II 11–15 · III 7–10 · IV 4–6 · V 1–3", summary:"Gate globale: tutti i Sigilli attivi solo se P < N; il Body resta attivo." },
    { id:"v2-constraint-tribute-school", kind:"constraint", name:"Tributo <Scuola>", status:"approved", grades:TIGHT_FIVE, summary:"Dopo i Sigilli perde 1–5 Potere della Scuola; fallback casuale solo se quella Scuola era già a 0, senza residuo." },
    { id:"v2-constraint-tribute-all", kind:"constraint", name:"Tributo Totale", status:"approved", grades:TIGHT_FIVE, summary:"Dopo i Sigilli perde 1–5 in ogni proprio Potere, con floor 0 e senza redistribuzione." },
    { id:"v2-constraint-friendly-fire", kind:"constraint", name:"Fuoco Amico", status:"approved", grades:"speciale · senza Gradi", summary:"Il danno ad area compatibile colpisce anche le creature alleate; non il proprio Incantatore." },
    { id:"v2-constraint-friendly-fire-limit", kind:"constraint", name:"Fuoco Amico Limite <Scuola>", status:"approved", grades:"I 1–3 · II 4–6 · III 7–10 · IV 11–15 · V 16–20", summary:"Fuoco Amico attivo solo se P < N; non spegne mai i Sigilli. Stone Rain: Terra IV / 12." },

    { id:"v2-constraint-backlash", kind:"constraint", name:"Contraccolpo", status:"approved", grades:FIXED_BANDS, summary:"Dopo l'attivazione della Formula e la risoluzione dei Sigilli, il proprio Incantatore subisce X danni." },
    { id:"v2-constraint-scarcity-school", kind:"constraint", name:"Carenza <Scuola>", status:"approved", grades:FIXED_BANDS, summary:"All'attivazione, se il proprio Potere della Scuola è inferiore a N, dopo i Sigilli il proprio Incantatore subisce X danni; N e X variano indipendentemente nella stessa fascia di Grado." },
    { id:"v2-constraint-weakness-school", kind:"constraint", name:"Debolezza <Scuola>", status:"approved", grades:FIXED_BANDS, summary:"Prima di ogni attacco, se il proprio Potere della Scuola è inferiore al corrispondente Potere nemico, il proprio Incantatore subisce X danni." },
    { id:"v2-constraint-overpower-school", kind:"constraint", name:"Sopraffazione <Scuola>", status:"approved", grades:FIXED_BANDS, summary:"All'inizio di ogni proprio turno, se il proprio Potere della Scuola è inferiore al corrispondente Potere nemico, il proprio Incantatore subisce X danni." }
  ].forEach(definition => canonicalV2.register({
    ...definition,
    selectable: definition.status === "approved"
  }));

  A.SIGIAN_SCHOOL_REGISTRY = schools;
  A.SIGIAN_CANONICAL_SIGIL_REGISTRY = sigils;
  A.SIGIAN_ADVANCED_MODIFIER_REGISTRY = modifiers;

  A.SIGIAN_CANONICAL_V2_REGISTRY = canonicalV2;


  A.registerSigianSchool = function registerSigianSchool(definition, options) {
    return schools.register(definition, options);
  };

  A.getSigianSchool = function getSigianSchool(id) {
    return schools.get(id);
  };

  A.listSigianSchools = function listSigianSchools(options) {
    return schools.list(options);
  };

  A.registerCanonicalSigil = function registerCanonicalSigil(definition, options) {
    return sigils.register(definition, options);
  };

  A.getCanonicalSigil = function getCanonicalSigil(id) {
    return sigils.get(id);
  };

  A.listCanonicalSigils = function listCanonicalSigils(options) {
    return sigils.list(options);
  };

  A.registerSigianAdvancedModifier = function registerSigianAdvancedModifier(definition, options) {
    return modifiers.register(definition, options);
  };

  A.getSigianAdvancedModifier = function getSigianAdvancedModifier(id) {
    return modifiers.get(id);
  };

  A.listSigianAdvancedModifiers = function listSigianAdvancedModifiers(options) {
    return modifiers.list(options);
  };

  A.getSigianCanonicalV2 = function getSigianCanonicalV2(id) {
    return canonicalV2.get(id);
  };

  A.listSigianCanonicalV2 = function listSigianCanonicalV2(options = {}) {
    const status = options.status == null ? null : String(options.status);
    const kind = options.kind == null ? null : String(options.kind);
    return canonicalV2.list(status ? { status } : {})
      .filter(item => !kind || item.kind === kind);
  };

  A.registerSigianSigilCompiler = function registerSigianSigilCompiler(sigilId, compiler, options = {}) {
    const id = normalizedId(sigilId, "Compiler Sigillo");
    if (typeof compiler !== "function") throw new Error(`Compiler Sigillo ${id} non valido.`);
    if (compilers.has(id) && !options.replace) throw new Error(`Compiler Sigillo già registrato: ${id}.`);
    compilers.set(id, compiler);
    return compiler;
  };

  A.getSigianSigilCompiler = function getSigianSigilCompiler(sigilId) {
    return compilers.get(String(sigilId || "")) || null;
  };
})(window.Arcane = window.Arcane || {});
