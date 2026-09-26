(function (A) {
  "use strict";

  function sentence(value) {
    const text = String(value || "").trim().replace(/\s+/g, " ");
    if (!text) return "";
    return /[.!?]$/.test(text) ? text : `${text}.`;
  }

  function schoolName(id) {
    return A.getSigianSchool?.(id)?.name || String(id || "");
  }

  function powerLabel(id) {
    return `Potere ${schoolName(id)}`;
  }

  function scaleText(recipe, sigil) {
    const intensity = Number(sigil?.intensity ?? sigil?.grade ?? 0);
    const scaling = (sigil?.modifiers || []).find(item => A.getSigianAdvancedModifier?.(item.id)?.family === "scaling");
    const school = scaling?.params?.school || recipe?.school || sigil?.config?.school;
    const suffix = intensity ? (intensity > 0 ? `+${intensity}` : String(intensity)) : "";
    if (!scaling) return String(Math.max(0, intensity));
    if (scaling.id === "scale-power-half") return `floor(${powerLabel(school)}/2)${suffix}`;
    if (scaling.id === "scale-power") return `${powerLabel(school)}${suffix}`;
    if (scaling.id === "scale-power-double") return `2×${powerLabel(school)}${suffix}`;
    if (scaling.id === "scale-target-attack") return `l'Attacco del bersaglio${suffix}`;
    if (scaling.id === "scale-creature-count") return `il numero di creature${suffix}`;
    if (scaling.id === "scale-full-health") return "la Vita massima";
    return intensity ? String(intensity) : "il valore del Sigillo";
  }

  function activationTail(recipe, sigil) {
    const activation = (sigil?.modifiers || []).find(item => A.getSigianAdvancedModifier?.(item.id)?.family === "activation");
    if (!activation) return "";
    const p = activation.params || {};
    if (activation.id === "activation-power-threshold") {
      const side = p.side === "enemy" ? "nemico" : "proprio";
      return ` solo se il ${powerLabel(p.school || recipe?.school)} ${side} ${p.op === "lt" ? "è inferiore a" : p.op === "lte" ? "è al massimo" : p.op === "gt" ? "è superiore a" : "è almeno"} ${Number(p.value || 0)}`;
    }
    if (activation.id === "activation-power-comparison") return " solo se la condizione di confronto tra Poteri è soddisfatta";
    if (activation.id === "activation-critical-life") return ` solo se la Vita soddisfa la soglia ${Number(p.value || 0)}`;
    if (activation.id === "activation-on-any-death") return " ogni volta che muore una creatura";
    return "";
  }

  function describeRecipeSigil(recipe, sigil) {
    if (!sigil) return "";
    const collectible = sigil.collectibleId ? A.getSigianCollectibleSigil?.(sigil.collectibleId) : null;
    const amount = scaleText(recipe, sigil);
    const tail = activationTail(recipe, sigil);
    const cfg = sigil.config || {};
    const base = collectible?.baseSigilId || sigil.sigilId;

    if (base === "damage") {
      const target = cfg.target === "enemy-creature" ? "a una creatura nemica" : "all'Incantatore nemico";
      return sentence(`Infligge ${amount} danni ${target}${tail}`);
    }
    if (base === "wave") {
      const target = cfg.scope === "front" ? "tutte le creature nemiche e l'Incantatore nemico" : "tutte le creature nemiche";
      return sentence(`Infligge ${amount} danni a ${target}${tail}`);
    }
    if (base === "backlash") return sentence(`Il proprio Incantatore subisce ${amount} danni${tail}`);
    if (base === "retaliation") return sentence(`Dopo aver subito danno da combattimento, infligge ${amount} danni all'attaccante${tail}`);
    if (base === "heal") {
      const target = cfg.target === "allied-creature" ? "una creatura alleata" : "il proprio Incantatore";
      return sentence(`Cura ${target} di ${amount}${tail}`);
    }
    if (base === "restoration") {
      const target = cfg.scope === "front" ? "il proprio Incantatore e tutte le creature alleate" : "tutte le creature alleate";
      return sentence(`Cura ${target} di ${amount}${tail}`);
    }
    if (base === "regeneration") return sentence(`Prima di ogni attacco, la creatura cura sé stessa di ${amount}${tail}`);
    if (base === "infusion") {
      const schools = cfg.schools === "all" ? "tutti i propri Poteri" : (cfg.schools || [cfg.school || recipe?.school]).map(powerLabel).join(" e ");
      return sentence(`Aumenta di ${amount} ${schools}${tail}`);
    }
    if (base === "subtraction") {
      const target = cfg.scope === "all-powers" ? "tutti i Poteri nemici" : `il ${powerLabel(cfg.school || recipe?.school)} nemico`;
      return sentence(`Riduce di ${amount} ${target}${tail}`);
    }
    if (base === "channeling") {
      const target = cfg.scope === "all-powers" ? "tutti i propri Poteri" : `la crescita del proprio ${powerLabel(cfg.school || recipe?.school)}`;
      return sentence(cfg.scope === "all-powers" ? `Aumenta di ${amount} la crescita di ${target}${tail}` : `Aumenta di ${amount} ${target}${tail}`);
    }
    if (base === "erosion") {
      const side = cfg.side === "self" ? "proprio" : "nemico";
      const target = cfg.scope === "all-powers" ? `tutti i Poteri ${side === "proprio" ? "propri" : "nemici"}` : `il ${powerLabel(cfg.school || recipe?.school)} ${side}`;
      return sentence(`Riduce di ${amount} la crescita di ${target}${tail}`);
    }
    if (base === "tribute") {
      const target = cfg.scope === "all-powers" ? "ogni proprio Potere" : `il proprio ${powerLabel(cfg.school || recipe?.school)}`;
      return sentence(`Dopo la risoluzione dei Sigilli, riduce di ${amount} ${target}`);
    }
    if (base === "protection") return sentence(`Riduce i danni subiti dal bersaglio protetto secondo il Grado del Sigillo${tail}`);
    if (base === "arcane-amplification") return sentence(`Aumenta il danno delle proprie Magie secondo il Grado del Sigillo${tail}`);
    if (base === "combat-fury") return sentence(`Aumenta il danno da combattimento delle creature alleate secondo il Grado del Sigillo${tail}`);
    if (base === "total-assault") return sentence("Quando attacca, colpisce l'Incantatore nemico e tutte le creature nemiche");
    if (base === "arcane-attack") return sentence(`L'Attacco della creatura è pari al proprio ${powerLabel(cfg.school || recipe?.school)}`);
    if (base === "absorption") return sentence("Recupera Vita in base al danno effettivamente inflitto");
    if (base === "destruction") return sentence("Distrugge la creatura nemica selezionata dal criterio del Sigillo");
    if (base === "annihilation") return sentence(cfg.scope === "all-field" ? "Distrugge tutte le creature in campo" : "Distrugge tutte le creature nemiche");
    if (base === "rebirth") return sentence(`Quando viene distrutta, ritorna in gioco fino a ${Math.max(1, Number(sigil.intensity || sigil.grade || 1))} volte`);
    if (base === "eternal-rebirth") return sentence("Quando viene distrutta, ritorna ripetutamente finché il Vincolo della Formula resta soddisfatto");
    if (base === "domination") return sentence(`Le ${Math.max(1, Number(sigil.intensity || sigil.grade || 1))} creature nemiche con Attacco più alto colpiscono il proprio Incantatore`);

    const canonical = collectible?.templateId ? A.getSigianCanonicalV2?.(`v2-${collectible.templateId}`) : null;
    return sentence(canonical?.summary || collectible?.displayName || base);
  }

  function describeConstraint(constraint) {
    if (!constraint?.definitionId) return "";
    const id = constraint.definitionId;
    const school = constraint.school || "fire";
    const power = powerLabel(school);
    const intensity = Number(constraint.intensity ?? constraint.grade ?? 1);
    const threshold = Number(constraint.threshold ?? 0);
    const damage = Number(constraint.damage ?? constraint.grade ?? 1);

    if (id === "v2-constraint-erosion-school") return sentence(`La crescita del proprio ${power} è ridotta di ${intensity}`);
    if (id === "v2-constraint-threshold-school") return sentence(`I Sigilli sono attivi solo se il proprio ${power} è almeno ${threshold}`);
    if (id === "v2-constraint-limit-school") return sentence(`I Sigilli sono attivi solo se il proprio ${power} è inferiore a ${threshold}`);
    if (id === "v2-constraint-tribute-school") return sentence(`Dopo i Sigilli, perde ${intensity} ${power}`);
    if (id === "v2-constraint-tribute-all") return sentence(`Dopo i Sigilli, perde ${intensity} in ogni proprio Potere`);
    if (id === "v2-constraint-friendly-fire") return sentence("Il danno ad area compatibile colpisce anche le creature alleate, ma non il proprio Incantatore");
    if (id === "v2-constraint-friendly-fire-limit") return sentence(`Il Fuoco Amico è attivo solo se il proprio ${power} è inferiore a ${threshold}`);
    if (id === "v2-constraint-backlash") return sentence(`Dopo la risoluzione dei Sigilli, il proprio Incantatore subisce ${damage} danni`);
    if (id === "v2-constraint-scarcity-school") return sentence(`Se il proprio ${power} è inferiore a ${threshold}, dopo i Sigilli il proprio Incantatore subisce ${damage} danni`);
    if (id === "v2-constraint-weakness-school") return sentence(`Prima di ogni attacco, se il proprio ${power} è inferiore al corrispondente Potere nemico, il proprio Incantatore subisce ${damage} danni`);
    if (id === "v2-constraint-overpower-school") return sentence(`All'inizio di ogni proprio turno, se il proprio ${power} è inferiore al corrispondente Potere nemico, il proprio Incantatore subisce ${damage} danni`);

    const definition = A.getSigianCanonicalV2?.(id);
    return sentence(String(definition?.summary || constraint.detail || "").replaceAll("<Scuola>", schoolName(school)));
  }

  function describeCanonicalComponent(component) {
    if (!component) return "";
    if (component.detail) return sentence(component.detail);
    if (component.kind === "constraint") return describeConstraint(component);
    const definition = A.getSigianCanonicalV2?.(component.definitionId);
    return sentence(String(definition?.summary || component.name || "").replaceAll("<Scuola>", schoolName(component.school)));
  }

  function compose(parts) {
    const clean = parts.map(sentence).filter(Boolean).map(text => text.replace(/[.!?]$/, ""));
    if (!clean.length) return "Nessun effetto arcano impresso.";
    if (clean.length === 1) return `${clean[0]}.`;
    if (clean.length === 2) return `${clean[0]}. ${clean[1]}.`;
    return `${clean.slice(0, -1).join("; ")}. ${clean.at(-1)}.`;
  }

  function composeRecipeDescription(recipe) {
    if (!recipe) return "";
    return compose([
      ...(recipe.sigils || []).map(sigil => describeRecipeSigil(recipe, sigil)),
      describeConstraint(recipe.constraint)
    ]);
  }

  function composeCardDescription(card) {
    const canonical = A.getSigianBaseCanonicalComponents?.(card?.id) || [];
    if (canonical.length) return compose(canonical.map(describeCanonicalComponent));
    if (card?.formulaRecipe) {
      try {
        const recipe = A.createFormulaRecipe?.(card.formulaRecipe) || card.formulaRecipe;
        return composeRecipeDescription(recipe);
      } catch {}
    }
    return "";
  }

  A.describeSigianRecipeSigil = describeRecipeSigil;
  A.describeSigianConstraint = describeConstraint;
  A.describeSigianCanonicalComponent = describeCanonicalComponent;
  A.composeSigianRecipeDescription = composeRecipeDescription;
  A.composeSigianCardDescription = composeCardDescription;
})(window.Arcane = window.Arcane || {});
