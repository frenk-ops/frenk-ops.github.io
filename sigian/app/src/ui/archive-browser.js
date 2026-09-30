(function (A) {
  "use strict";

  const states = new Map();
  const FORMULA_PAGE_SIZE = 12;
  const roots = new Map();

  function t(key, vars) {
    return A.i18n?.t?.(key, vars) || key;
  }

  function localizedFormula(item) {
    const localized = A.i18n?.card?.(item) || {};
    return {
      name:localized.name || item?.name || "",
      text:localized.description || item?.text || ""
    };
  }

  function schoolName(id) {
    const key = `schools.${id}`;
    const translated = t(key);
    if (translated !== key) return translated;
    return A.SCHOOLS?.find(item => item.id === id)?.name || id || "";
  }

  function schoolIconMarkup(id, className = "school-icon-svg archive-school-icon") {
    if (typeof A.schoolIconMarkup === "function") return A.schoolIconMarkup(id, className);
    return "";
  }

  function schoolLabelMarkup(id, options = {}) {
    const showName = options.showName !== false;
    return `<span class="archive-school-label">${schoolIconMarkup(id)}${showName ? `<span>${escapeHtml(schoolName(id))}</span>` : ""}</span>`;
  }

  const SECTION_LABEL_KEYS = Object.freeze({
    formulas:{ inventory:"archive.formulas", collection:"archive.originalFormulas" },
    recipes:{ inventory:"archive.recipes", collection:"archive.recipes" },
    sigils:{ inventory:"archive.sigils", collection:"archive.sigils" },
    constraints:{ inventory:"archive.constraints", collection:"archive.constraints" },
    grimoires:{ inventory:"archive.grimoires", collection:"archive.grimoires" },
    cosmetics:{ inventory:"archive.cosmetics", collection:"archive.cosmetics" }
  });

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function stateFor(scope) {
    if (!states.has(scope)) {
      states.set(scope, {
        section:"formulas",
        selectedId:null,
        selectedComponentId:null,
        selectedGrimoireId:null,
        targetGrimoireId:null,
        detailOpen:false,
        returnFocus:null,
        formula:{ search:"", school:"all", type:"all", level:"all", sigil:"all", constraint:"all", page:1 },
        recipe:{ search:"", origin:"all", school:"all" },
        sigil:{ search:"", family:null, grade:"all", affinity:"all", school:"all" },
        constraint:{ search:"", family:null, grade:"all", affinity:"all", school:"all" },
        grimoire:{ search:"" },
        cosmetic:{ search:"", category:"all", school:"all" }
      });
    }
    return states.get(scope);
  }

  function sectionIds(scope) {
    return scope === "inventory"
      ? ["formulas", "recipes", "sigils", "constraints", "grimoires", "cosmetics"]
      : ["formulas", "sigils", "constraints", "cosmetics"];
  }

  function sectionLabel(id, scope) {
    const key = SECTION_LABEL_KEYS[id]?.[scope];
    return key ? t(key) : id;
  }

  function schoolOptions(includeAll = true) {
    const schools = A.SIGIAN_AFFINITY_SCHOOL_ORDER || A.SCHOOLS?.map(item => item.id) || [];
    const options = includeAll ? [{ id:"all", label:t("archive.all") }] : [];
    schools.forEach(id => options.push({ id, label:schoolName(id) }));
    return options;
  }

  function schoolNavItems(includeAll = true) {
    const schools = A.SIGIAN_AFFINITY_SCHOOL_ORDER || A.SCHOOLS?.map(item => item.id) || [];
    const items = includeAll ? [{ id:"all", label:t("archive.all"), markup:escapeHtml(t("archive.all")) }] : [];
    schools.forEach(id => items.push({ id, label:schoolName(id), markup:schoolLabelMarkup(id) }));
    return items;
  }

  function selectMarkup(name, label, value, options, extra = "") {
    return `
      <label class="archive-filter">
        <span>${escapeHtml(label)}</span>
        <select data-archive-filter="${escapeHtml(name)}" ${extra}>
          ${options.map(item => `<option value="${escapeHtml(item.id)}" ${String(item.id) === String(value) ? "selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}
        </select>
      </label>`;
  }

  function textFilterMarkup(value, placeholder) {
    return `
      <label class="archive-filter archive-search">
        <span>${escapeHtml(t("archive.search"))}</span>
        <input type="search" data-archive-search value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">
      </label>`;
  }

  function scopeToggleMarkup(scope) {
    return `
      <div class="archive-scope-switch sigian-ui-tabset archive-codex-scope" role="tablist" aria-label="${escapeHtml(t("nav.library"))}">
        <button type="button" data-archive-scope="inventory" class="${scope === "inventory" ? "active" : ""}" role="tab" aria-selected="${scope === "inventory"}">${escapeHtml(t("archive.inventory"))}</button>
        <button type="button" data-archive-scope="collection" class="${scope === "collection" ? "active" : ""}" role="tab" aria-selected="${scope === "collection"}">${escapeHtml(t("archive.codex"))}</button>
        <button type="button" data-archive-scope="chronicles" class="${scope === "chronicles" ? "active" : ""}" role="tab" aria-selected="${scope === "chronicles"}">${escapeHtml(t("archive.chronicles"))}</button>
        <button type="button" data-archive-scope="guide" role="tab" aria-selected="false">${escapeHtml(t("nav.howToPlay"))}</button>
      </div>`;
  }

  function aggregateComponentGroups(data, kind) {
    const groups = new Map();
    data.components
      .filter(item => item.kind === kind)
      .forEach(item => {
        if (!groups.has(item.definitionId)) {
          const canonical = A.getSigianCanonicalV2?.(item.definitionId) || null;
          groups.set(item.definitionId, {
            id:item.definitionId,
            kind,
            name:canonical?.name || item.baseName || item.name,
            summary:canonical?.summary || item.summary || "",
            family:item.family,
            canonicalStatus:item.canonicalStatus,
            variants:[]
          });
        }
        groups.get(item.definitionId).variants.push(item);
      });

    return [...groups.values()]
      .map(group => {
        const grades = [...new Set(group.variants.map(item => item.gradeLabel).filter(Boolean))];
        const effectSchools = [...new Set(group.variants.map(item => item.effectSchool).filter(Boolean))];
        const affinityModes = [...new Set(group.variants.map(item => item.affinity?.mode).filter(Boolean))];
        const ownedCopies = group.variants.reduce((sum, item) => sum + Number(item.ownedQuantity || item.quantity || 0), 0);
        const inventoryCopies = group.variants.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
        const freeCopies = group.variants.reduce((sum, item) => sum + Number(item.freeQuantity ?? item.quantity ?? item.ownedQuantity ?? 0), 0);
        const inUseCopies = group.variants.reduce((sum, item) => sum + Number(item.inUseQuantity || 0), 0);
        const assignedFormulaInstanceIds = [...new Set(group.variants.flatMap(item =>
          item.assignedFormulaInstanceIds || []
        ))];
        return { ...group, grades, effectSchools, affinityModes, ownedCopies, inventoryCopies, freeCopies, inUseCopies, assignedFormulaInstanceIds };
      })
      .sort((left, right) => left.family.localeCompare(right.family) || left.name.localeCompare(right.name));
  }

  function sectionCounts(scope, data, grimoires) {
    return {
      formulas:data.formulas.length,
      recipes:(data.recipes || []).length,
      sigils:aggregateComponentGroups(data, "sigil").length,
      constraints:aggregateComponentGroups(data, "constraint").length,
      grimoires:grimoires.length,
      cosmetics:data.cosmetics.length
    };
  }

  function sectionTabsMarkup(state, scope, data, grimoires) {
    const counts = sectionCounts(scope, data, grimoires);
    return `
      <nav class="archive-section-tabs sigian-ui-tabset archive-codex-tabs" aria-label="Sezioni archivio">
        ${sectionIds(scope).map(id =>
          `<button type="button" data-archive-section="${id}" class="${state.section === id ? "active" : ""}">
            <span>${escapeHtml(sectionLabel(id, scope))}</span><small>${counts[id]}</small>
          </button>`
        ).join("")}
      </nav>`;
  }

  function formulaFilterOptions(data) {
    const sigils = new Set();
    const constraints = new Set();
    data.formulas.forEach(item => item.components.forEach(component => {
      (component.kind === "constraint" ? constraints : sigils).add(component.name);
    }));
    return {
      sigils:[{ id:"all", label:t("archive.anySigil") }, ...[...sigils].sort().map(name => ({ id:name, label:name }))],
      constraints:[{ id:"all", label:t("archive.anyConstraint") }, ...[...constraints].sort().map(name => ({ id:name, label:name }))]
    };
  }

  function formulaFiltersMarkup(data, state) {
    const options = formulaFilterOptions(data);
    return `
      <div class="archive-filter-row archive-filter-row-primary">
        ${textFilterMarkup(state.formula.search, t("archive.searchFormula"))}
        ${selectMarkup("type", t("archive.type"), state.formula.type, [
          { id:"all", label:t("archive.allMasculine") },
          { id:"creature", label:t("archive.creature") },
          { id:"spell", label:t("archive.spell") }
        ])}
      </div>
      <details class="archive-more-filters">
        <summary>${escapeHtml(t("archive.advancedFilters"))}</summary>
        <div class="archive-filter-row">
          ${selectMarkup("level", t("archive.levelCost"), state.formula.level, [
            { id:"all", label:t("archive.allMasculine") },
            ...Array.from({ length:13 }, (_, index) => ({ id:String(index + 1), label:String(index + 1) }))
          ])}
          ${selectMarkup("sigil", t("archive.containsSigil"), state.formula.sigil, options.sigils)}
          ${selectMarkup("constraint", t("archive.containsConstraint"), state.formula.constraint, options.constraints)}
        </div>
      </details>`;
  }

  function formulaSchoolNavMarkup(state) {
    return `
      <nav class="archive-category-strip archive-school-strip" aria-label="${escapeHtml(t("archive.formulaSchool"))}">
        ${schoolNavItems(true).map(item => `
          <button type="button" data-formula-school="${escapeHtml(item.id)}" class="${state.formula.school === item.id ? "active" : ""}" aria-label="${escapeHtml(item.label)}">
            ${item.markup}
          </button>`).join("")}
      </nav>`;
  }

  function recipeFiltersMarkup(state) {
    return `
      <div class="archive-filter-row archive-filter-row-primary">
        ${textFilterMarkup(state.recipe.search, t("archive.searchRecipe"))}
        ${selectMarkup("origin", t("archive.recipeOrigin"), state.recipe.origin, [
          { id:"all", label:t("archive.all") },
          { id:"STANDARD", label:t("archive.recipeStandard") },
          { id:"PERSONAL", label:t("archive.recipePersonal") }
        ])}
        ${selectMarkup("school", t("archive.formulaSchool"), state.recipe.school, schoolOptions())}
      </div>`;
  }

  function applyRecipeFilters(items, filters) {
    const search = String(filters.search || "").trim().toLowerCase();
    return (items || []).filter(item => {
      if (filters.origin !== "all" && item.origin !== filters.origin) return false;
      if (filters.school !== "all" && item.school !== filters.school) return false;
      if (search) {
        const haystack = [
          item.name,
          item.recipeId,
          schoolName(item.school),
          item.origin,
          ...(item.components || []).map(component => component.name)
        ].join(" ").toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }

  function recipeTileMarkup(item, selected) {
    const typeLabel = t(item.type === "spell" ? "archive.spell" : "archive.creature");
    const originLabel = t(item.origin === "PERSONAL" ? "archive.recipePersonal" : "archive.recipeStandard");
    return `
      <article class="archive-formula-tile archive-formula-index-row archive-school-${escapeHtml(item.school || "neutral")} ${selected ? "active" : ""}" data-archive-recipe="${escapeHtml(item.recipeId)}" tabindex="0">
        <span class="archive-index-school-rail" aria-hidden="true"></span>
        <span class="archive-formula-copy">
          <strong>${escapeHtml(item.name || item.recipeId)}</strong>
          <small class="archive-formula-index-meta">
            ${item.school ? schoolLabelMarkup(item.school) : ""}
            <span class="archive-formula-meta-separator">·</span>
            <span>${escapeHtml(typeLabel)}</span>
          </small>
          <em>${escapeHtml(originLabel)} · ${escapeHtml(t("archive.recipeKnown"))}</em>
        </span>
        <span class="archive-formula-index-tail">
          <strong class="archive-quantity archive-formula-index-quantity">${escapeHtml(item.linkedFormulaCount || 0)}</strong>
          <span class="archive-formula-index-chevron" aria-hidden="true">›</span>
        </span>
      </article>`;
  }

  function recipeComponentMarkup(component) {
    const constraint = component.kind === "constraint";
    const grade = component.grade == null ? "" : ` · ${t("archive.gradeLabel", { grade:({1:"I",2:"II",3:"III",4:"IV",5:"V"})[Number(component.grade)] || component.grade })}`;
    return `
      <div class="archive-embedded-component ${constraint ? "is-constraint" : "is-sigil"}">
        <span class="archive-embedded-symbol" aria-hidden="true">${constraint ? "◇" : "✦"}</span>
        <strong>${escapeHtml(component.name || component.definitionId || "?")}</strong>
        <small>${escapeHtml(t(constraint ? "archive.constraint" : "archive.sigil"))}${escapeHtml(grade)}</small>
      </div>`;
  }

  function recipeDetailMarkup(item, formulas = []) {
    if (!item) return `<div class="archive-empty">${escapeHtml(t("archive.noRecipe"))}</div>`;
    const originLabel = t(item.origin === "PERSONAL" ? "archive.recipePersonal" : "archive.recipeStandard");
    return `
      <article class="archive-detail-card archive-recipe-detail">
        <span class="classic-menu-kicker">${escapeHtml(t("archive.recipe"))}</span>
        <h3>${escapeHtml(item.name || item.recipeId)}</h3>
        <div class="archive-detail-meta">
          ${item.school ? schoolLabelMarkup(item.school) : ""}
          <span>${escapeHtml(originLabel)}</span>
          <span>${escapeHtml(item.type === "spell" ? t("archive.spell") : t("archive.creature"))}</span>
        </div>
        <p>${escapeHtml(t(item.origin === "STANDARD" ? "archive.recipeStandardHint" : "archive.recipePersonalHint"))}</p>
        <section>
          <h4>${escapeHtml(t("archive.recipeComposition"))}</h4>
          <div class="archive-formula-components">
            ${(item.components || []).map(recipeComponentMarkup).join("") || `<div class="archive-empty">${escapeHtml(t("archive.noItems"))}</div>`}
          </div>
        </section>
        <section>
          <h4>${escapeHtml(t("archive.recipeLinkedFormulas"))}</h4>
          <p>${escapeHtml(t("archive.recipeLinkedSummary", {
            total:item.linkedFormulaCount || 0,
            playable:item.playableFormulaCount || 0
          }))}</p>
          <div class="archive-component-assignment-list">
            ${(item.linkedFormulaInstances || []).map(instance => {
              const formula = formulas.find(candidate => candidate.formulaInstanceId === instance.formulaInstanceId);
              return `
              <button type="button" class="archive-component-assigned-formula" data-recipe-linked-formula="${escapeHtml(instance.formulaInstanceId)}">
                <strong>${escapeHtml(formula ? localizedFormula(formula).name : instance.formulaInstanceId)}</strong>
                <small>${escapeHtml(formulaLifecycleLabel(instance))}</small>
              </button>`;
            }).join("") || `<span class="archive-empty">${escapeHtml(t("archive.recipeNoLinkedFormula"))}</span>`}
          </div>
        </section>
        <small class="archive-full-interaction-note">${escapeHtml(t("archive.recipeRebuildPending"))}</small>
      </article>`;
  }

  function componentFiltersMarkup(state, kind) {
    const bucket = kind === "sigil" ? state.sigil : state.constraint;
    return `
      <div class="archive-filter-row archive-filter-row-primary">
        ${textFilterMarkup(bucket.search, kind === "sigil" ? t("archive.searchSigil") : t("archive.searchConstraint"))}
      </div>
      <details class="archive-more-filters">
        <summary>Filtri avanzati</summary>
        <div class="archive-filter-row">
          ${selectMarkup("grade", t("archive.grade"), bucket.grade, [
            { id:"all", label:t("archive.allMasculine") },
            { id:"I", label:"I" },
            { id:"II", label:"II" },
            { id:"III", label:"III" },
            { id:"IV", label:"IV" },
            { id:"V", label:"V" },
            { id:"Speciale", label:t("archive.special") }
          ])}
          ${selectMarkup("affinity", t("archive.affinity"), bucket.affinity, [
            { id:"all", label:t("archive.all") },
            { id:"mono", label:"Mono" },
            { id:"dual", label:"Dual" },
            { id:"triple", label:"Triple" },
            { id:"universal", label:"Universale" }
          ])}
          ${selectMarkup("school", t("archive.compatibleWith"), bucket.school, schoolOptions())}
          ${selectMarkup("rarity", t("archive.rarity"), "pending", [{ id:"pending", label:t("archive.pending") }], "disabled")}
        </div>
      </details>`;
  }

  function componentFamilyNavMarkup(groups, state, kind) {
    const bucket = kind === "sigil" ? state.sigil : state.constraint;
    const families = [...new Set(groups.map(group => group.family))].sort();
    if (!families.includes(bucket.family)) bucket.family = families[0] || null;
    return `
      <nav class="archive-category-strip archive-component-family-nav" aria-label="${escapeHtml(t(kind === "sigil" ? "archive.categoriesSigils" : "archive.categoriesConstraints"))}">
        ${families.map(family => {
          const count = groups.filter(group => group.family === family).length;
          return `<button type="button" data-component-family="${escapeHtml(family)}" class="${bucket.family === family ? "active" : ""}">
            <span>${escapeHtml(family)}</span><small>${count}</small>
          </button>`;
        }).join("")}
      </nav>`;
  }

  function grimoireFiltersMarkup(state) {
    return `
      <div class="archive-grimoire-filterbar">
        ${textFilterMarkup(state.grimoire.search, t("archive.searchGrimoire"))}
        <button type="button" class="classic-stone-button archive-new-grimoire" data-grimoire-create>＋ ${escapeHtml(t("archive.newGrimoire"))}</button>
      </div>
      <p class="archive-filter-note">${escapeHtml(t("archive.grimoireLocalNote"))}</p>`;
  }

  function cosmeticFiltersMarkup(state) {
    return `
      <div class="archive-filter-row">
        ${textFilterMarkup(state.cosmetic.search, t("archive.searchCosmetic"))}
        ${selectMarkup("category", t("archive.category"), state.cosmetic.category, [
          { id:"all", label:t("archive.all") },
          { id:"art", label:"ART" }
        ])}
        ${selectMarkup("school", t("archive.schoolTheme"), state.cosmetic.school, schoolOptions())}
      </div>`;
  }

  function applyFormulaFilters(items, filter) {
    const search = filter.search.trim().toLowerCase();
    return items.filter(item => {
      if (filter.school !== "all" && item.school !== filter.school) return false;
      if (filter.type !== "all" && item.type !== filter.type) return false;
      if (filter.level !== "all" && String(item.level) !== String(filter.level)) return false;
      if (filter.sigil !== "all" && !item.components.some(component => component.kind === "sigil" && component.name === filter.sigil)) return false;
      if (filter.constraint !== "all" && !item.components.some(component => component.kind === "constraint" && component.name === filter.constraint)) return false;
      if (search) {
        const localized = localizedFormula(item);
        const haystack = [localized.name, localized.text, item.name, item.text, item.keyword, ...item.components.map(component => component.name)].join(" ").toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }

  function componentGroupMatches(group, bucket) {
    const search = String(bucket.search || "").trim().toLowerCase();
    if (search) {
      const haystack = [group.name, group.summary, group.family, ...group.variants.map(item => `${item.name} ${item.affinityLabel}`)].join(" ").toLowerCase();
      if (!haystack.includes(search)) return false;
    } else if (bucket.family && group.family !== bucket.family) {
      return false;
    }
    if (bucket.grade !== "all" && !group.variants.some(item => item.gradeLabel === bucket.grade)) return false;
    if (bucket.affinity !== "all" && !group.variants.some(item => item.affinity?.mode === bucket.affinity)) return false;
    if (bucket.school !== "all" && !group.variants.some(item => (item.affinity?.schools || []).includes(bucket.school))) return false;
    return true;
  }

  function applyCosmeticFilters(items, filter) {
    const search = filter.search.trim().toLowerCase();
    return items.filter(item => {
      if (filter.category !== "all" && item.category !== filter.category) return false;
      if (filter.school !== "all" && item.school !== filter.school) return false;
      if (search && !item.name.toLowerCase().includes(search)) return false;
      return true;
    });
  }

  function applyGrimoireFilters(items, filter) {
    const search = String(filter?.search || "").trim().toLowerCase();
    if (!search) return items;
    return items.filter(item => item.name.toLowerCase().includes(search));
  }

  function formatShortDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const locale = A.i18n?.getLanguage?.() === "en" ? "en-US" : "it-IT";
    return date.toLocaleDateString(locale, { day:"2-digit", month:"2-digit", year:"2-digit" });
  }

  function ownershipBadge(scope, quantity) {
    if (scope === "inventory") return `<span class="archive-quantity">×${Number(quantity || 0)}</span>`;
    return `<span class="archive-owned">${escapeHtml(t("archive.owned"))} ×${Number(quantity || 0)}</span>`;
  }

  function formulaLifecycleLabel(item) {
    const key = ({
      SEALED:"archive.lifecycle.sealed",
      NEEDS_RESEAL:"archive.lifecycle.needsReseal",
      DISSOLVED:"archive.lifecycle.dissolved"
    })[item?.lifecycleState] || "archive.lifecycle.sealed";
    return t(key);
  }

  function formulaLifecycleHint(item) {
    const key = ({
      SEALED:"archive.lifecycle.sealedHint",
      NEEDS_RESEAL:"archive.lifecycle.needsResealHint",
      DISSOLVED:"archive.lifecycle.dissolvedHint"
    })[item?.lifecycleState] || "archive.lifecycle.sealedHint";
    return t(key);
  }

  function formulaTileMarkup(item, scope, selected) {
    const localized = localizedFormula(item);
    const typeLabel = t(item.type === "spell" ? "archive.spell" : "archive.creature");
    const quantityLabel = scope === "inventory" ? `, ×${item.quantity || 1}` : "";
    const rowLabel = `${localized.name}, ${schoolName(item.school)}, ${typeLabel}, ${t("archive.cost")} ${item.level}${quantityLabel}`;
    return `
      <article class="archive-formula-tile archive-formula-index-row archive-school-${escapeHtml(item.school)} lifecycle-${escapeHtml(String(item.lifecycleState || "SEALED").toLowerCase())} ${selected ? "active" : ""}" data-archive-item="${escapeHtml(item.id)}" tabindex="0" aria-label="${escapeHtml(rowLabel)}">
        <span class="archive-index-school-rail" aria-hidden="true"></span>
        <span class="archive-formula-art" aria-hidden="true">
          <img src="${escapeHtml(item.image)}" alt="" loading="lazy">
          <span class="archive-formula-cost-seal">${escapeHtml(item.level)}</span>
        </span>
        <span class="archive-formula-copy">
          <strong>${escapeHtml(localized.name)}</strong>
          <small class="archive-formula-index-meta">
            ${schoolLabelMarkup(item.school)}
            <span class="archive-formula-meta-separator">·</span>
            <span>${escapeHtml(typeLabel)}</span>
          </small>
          <em>${escapeHtml(t(scope === "collection" ? "archive.originalFormula" : "archive.ownedFormula"))}${scope === "inventory" ? ` · ${escapeHtml(formulaLifecycleLabel(item))}` : ""}</em>
        </span>
        <span class="archive-formula-index-tail">
          ${scope === "inventory"
            ? `<strong class="archive-quantity archive-formula-index-quantity">×${escapeHtml(item.quantity || 1)}</strong>`
            : ""}
          <span class="archive-formula-index-chevron" aria-hidden="true">›</span>
        </span>
      </article>`;
  }


  function formulaPaginationMarkup(page, pageCount) {
    if (pageCount <= 1) return "";
    return `
      <nav class="archive-pagination" aria-label="${escapeHtml(t("archive.formulaPages"))}">
        <button type="button" data-formula-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>‹</button>
        <span>${t("archive.page", { page:`<b>${page}</b>`, pages:pageCount })}</span>
        <button type="button" data-formula-page="${page + 1}" ${page >= pageCount ? "disabled" : ""}>›</button>
      </nav>`;
  }

  function formulaComponentMarkup(component) {
    const constraint = component.kind === "constraint";
    return `
      <button type="button" class="archive-embedded-component ${constraint ? "is-constraint" : "is-sigil"}" data-formula-component="${escapeHtml(component.id)}">
        <span class="archive-embedded-symbol" aria-hidden="true">${constraint ? "◇" : "✦"}</span>
        <strong>${escapeHtml(component.name)}</strong>
        <small>${escapeHtml(t(constraint ? "archive.constraint" : "archive.sigil"))}</small>
      </button>`;
  }

  function formulaDetailMarkup(item, scope, selectedComponentId, grimoires = [], state = {}) {
    if (!item) return `<div class="archive-empty">${escapeHtml(t("archive.noFormula"))}</div>`;
    const targetId = grimoires.some(grimoire => grimoire.id === state.targetGrimoireId)
      ? state.targetGrimoireId
      : grimoires[0]?.id || null;
    const target = grimoires.find(grimoire => grimoire.id === targetId) || null;
    const formulaInstanceId = item.formulaInstanceId || item.id;
    const alreadyPresent = Boolean(target?.formulaIds?.includes(formulaInstanceId));

    return `
      <article class="archive-detail-card archive-formula-detail archive-formula-full-detail">
        <div class="archive-full-detail-host" data-archive-full-card="${escapeHtml(item.id)}"></div>
        <p class="archive-full-interaction-note">${escapeHtml(t("archive.fullInteractionHint"))}</p>
        ${scope === "inventory" ? `
          <div class="archive-formula-lifecycle lifecycle-${escapeHtml(String(item.lifecycleState || "SEALED").toLowerCase())}">
            <strong>${escapeHtml(formulaLifecycleLabel(item))}</strong>
            <small>${escapeHtml(formulaLifecycleHint(item))}</small>
          </div>
          <section class="archive-grimoire-quick-add">
            <div>
              <strong>${escapeHtml(t("archive.grimoire"))}</strong>
              <small>${escapeHtml(t("archive.addToComposition"))}</small>
            </div>
            ${grimoires.length ? `
              <select data-formula-grimoire-select aria-label="${escapeHtml(t("archive.chooseGrimoire"))}">
                ${grimoires.map(grimoire => `<option value="${escapeHtml(grimoire.id)}" ${grimoire.id === targetId ? "selected" : ""}>${escapeHtml(grimoire.name)} · ${grimoire.formulaIds.length}</option>`).join("")}
              </select>
              <button type="button" class="classic-stone-button archive-grimoire-add-action" data-add-formula-grimoire="${escapeHtml(formulaInstanceId)}" ${alreadyPresent ? "disabled" : ""}>
                ${escapeHtml(alreadyPresent ? t("archive.alreadyPresent") : `＋ ${t("archive.add")}`)}
              </button>
            ` : `
              <button type="button" class="classic-stone-button archive-grimoire-create-action" data-create-grimoire-for-formula="${escapeHtml(formulaInstanceId)}">＋ ${escapeHtml(t("archive.createGrimoireAdd"))}</button>
            `}
          </section>
          <div class="archive-formula-actions">
            ${item.recipeId && A.isSigianRecipeKnown?.(item.recipeId) ? `<button type="button" class="classic-stone-button ghost" data-open-recipe="${escapeHtml(item.recipeId)}">📜 <span>${escapeHtml(t("archive.openRecipe"))}</span></button>` : ""}
            <button type="button" class="classic-stone-button" data-archive-forge="${escapeHtml(item.id)}" title="${escapeHtml(t("archive.openForge"))}">⚒ <span>${escapeHtml(t("archive.forge"))}</span></button>
            <button type="button" class="classic-stone-button danger" disabled title="${escapeHtml(t("archive.craftingInactive"))}">🔥 <span>${escapeHtml(t("archive.destroy"))}</span></button>
          </div>` : ""}
      </article>`;
  }

  function schoolListMarkup(ids) {
    if (!ids.length) return `<span class="archive-variant-chip is-neutral">${escapeHtml(t("archive.neutral"))}</span>`;
    return ids.map(id => `<span class="archive-variant-chip">${schoolLabelMarkup(id)}</span>`).join("");
  }

  function gradeListMarkup(grades) {
    if (!grades.length) return `<span class="archive-variant-chip is-neutral">${escapeHtml(t("archive.noGrades"))}</span>`;
    return grades.map(grade => `<span class="archive-variant-chip">${escapeHtml(t("archive.gradeLabel", { grade }))}</span>`).join("");
  }

  function affinityModeLabel(mode) {
    const labels = {
      mono:"Mono",
      dual:"Dual",
      triple:"Triple",
      universal:A.i18n?.getLanguage?.() === "en" ? "Universal" : "Universale"
    };
    return labels[mode] || mode;
  }

  function affinitySchoolsMarkup(affinity) {
    const schools = affinity?.schools || [];
    if (!schools.length) return `<span class="archive-affinity-school is-neutral">${escapeHtml(t("archive.neutral"))}</span>`;
    return schools.map(id => `<span class="archive-affinity-school">${schoolLabelMarkup(id)}</span>`).join("");
  }

  function componentIdentityTileMarkup(group, scope, selected) {
    const copies = scope === "inventory" ? group.inventoryCopies : group.ownedCopies;
    const gradeCount = group.grades.filter(value => value !== "Speciale").length;
    const gradeText = gradeCount
      ? `${gradeCount} ${t("archive.grades")}`
      : t("archive.noGrades");
    const schoolText = group.effectSchools.length ? `${group.effectSchools.length} ${t("archive.schools")}` : t("archive.neutral");
    return `
      <button type="button" class="archive-component-identity ${selected ? "active" : ""}" data-archive-component-group="${escapeHtml(group.id)}">
        <span class="archive-component-symbol" aria-hidden="true">${group.kind === "constraint" ? "◇" : "✦"}</span>
        <span class="archive-component-copy">
          <strong>${escapeHtml(group.name)}</strong>
          <small>${escapeHtml(schoolText)} · ${escapeHtml(gradeText)}</small>
          <em>${escapeHtml(t("archive.versionsCatalogued", { count:group.variants.length }))}</em>
        </span>
        ${scope === "inventory"
          ? `<span class="archive-quantity" title="${escapeHtml(t("archive.copiesOwned"))}">×${copies}</span>`
          : ""}
      </button>`;
  }

  function affinitySummaryMarkup(group, scope) {
    const modes = ["mono", "dual", "triple", "universal"];
    return `
      <div class="archive-affinity-summary">
        ${modes.map(mode => {
          const variants = group.variants.filter(item => item.affinity?.mode === mode);
          if (!variants.length) return "";
          const copies = variants.reduce((sum, item) => sum + Number(scope === "inventory" ? item.quantity : item.ownedQuantity || 0), 0);
          const examples = variants.slice(0, 2);
          return `
            <article class="archive-affinity-card">
              <strong>${escapeHtml(affinityModeLabel(mode))}</strong>
              <span>${variants.length} ${escapeHtml(t(variants.length === 1 ? "archive.version" : "archive.versions"))}${scope === "inventory" ? ` · ×${copies}` : ""}</span>
              <div class="archive-affinity-school-examples">${examples.map(item => `<span>${affinitySchoolsMarkup(item.affinity)}</span>`).join("")}</div>
            </article>`;
        }).join("")}
      </div>`;
  }

  function componentAssignmentsMarkup(group, formulas) {
    const ids = group?.assignedFormulaInstanceIds || [];
    if (!ids.length) return "";
    return `<section class="archive-component-assignments">
      <div class="archive-block-heading">
        <strong>${escapeHtml(t("archive.assignedTo"))}</strong>
        <small>${escapeHtml(t("archive.assignmentHint"))}</small>
      </div>
      <div class="archive-component-assignment-list">
        ${ids.map(formulaInstanceId => {
          const formula = formulas.find(item => item.formulaInstanceId === formulaInstanceId);
          const label = formula ? localizedFormula(formula).name : formulaInstanceId;
          return `<button type="button" data-component-assigned-formula="${escapeHtml(formulaInstanceId)}">${escapeHtml(label)}</button>`;
        }).join("")}
      </div>
    </section>`;
  }
  function componentGroupDetailMarkup(group, scope, formulas = []) {
    if (!group) return `<div class="archive-empty">${escapeHtml(t("archive.selectForDetails"))}</div>`;
    const copies = scope === "inventory" ? group.inventoryCopies : group.ownedCopies;
    return `
      <article class="archive-detail-card archive-component-group-detail">
        <div class="archive-detail-heading">
          <div>
            <small>${escapeHtml(t(group.kind === "constraint" ? "archive.constraint" : "archive.sigil")).toUpperCase()} · ${escapeHtml(group.family)}</small>
            <h3>${escapeHtml(group.name)}</h3>
          </div>
          ${scope === "inventory" ? `<span class="archive-quantity archive-detail-quantity">×${copies}</span>` : ""}
        </div>
        ${scope === "inventory" ? `<div class="archive-component-allocation-summary">
          <span><strong>${escapeHtml(group.freeCopies)}</strong> ${escapeHtml(t("archive.freeCopies"))}</span>
          <span><strong>${escapeHtml(group.inUseCopies)}</strong> ${escapeHtml(t("archive.inUseCopies"))}</span>
        </div>` : ""}
        ${scope === "inventory" ? componentAssignmentsMarkup(group, formulas) : ""}\n        <p>${escapeHtml(group.summary)}</p>
        <section class="archive-variant-section">
          <div class="archive-block-heading">
            <strong>${escapeHtml(t("archive.schools"))}</strong>
            <small>${escapeHtml(t("archive.identitySchoolHint"))}</small>
          </div>
          <div class="archive-variant-chip-row">${schoolListMarkup(group.effectSchools)}</div>
        </section>
        <section class="archive-variant-section">
          <div class="archive-block-heading">
            <strong>${escapeHtml(t("archive.grades"))}</strong>
            <small>${escapeHtml(t("archive.gradesHint"))}</small>
          </div>
          <div class="archive-variant-chip-row">${gradeListMarkup(group.grades)}</div>
        </section>
        <section class="archive-variant-section">
          <div class="archive-block-heading">
            <strong>${escapeHtml(t("archive.affinityVersions"))}</strong>
            <small>${escapeHtml(t("archive.affinityVersionsHint"))}</small>
          </div>
          ${affinitySummaryMarkup(group, scope)}
        </section>
        <p class="archive-provisional-note"><strong>${escapeHtml(t("archive.rarity"))}:</strong> ${escapeHtml(t("archive.rarityPendingNote"))}</p>
      </article>`;
  }

  function cosmeticDisplayName(item) {
    const sourceName = item.sourceFormulaId ? A.i18n?.card?.(item.sourceFormulaId)?.name : "";
    return sourceName ? `${sourceName} — ART` : item.name;
  }

  function cosmeticTileMarkup(item, scope, selected) {
    return `
      <button type="button" class="archive-cosmetic-tile ${selected ? "active" : ""}" data-archive-item="${escapeHtml(item.id)}">
        <img src="${escapeHtml(item.image)}" alt="" loading="lazy">
        <span><strong>${escapeHtml(cosmeticDisplayName(item))}</strong><small>ART</small></span>
        ${ownershipBadge(scope, scope === "inventory" ? item.quantity : item.ownedQuantity)}
      </button>`;
  }

  function cosmeticDetailMarkup(item, scope) {
    if (!item) return `<div class="archive-empty">${escapeHtml(t("archive.noCosmetic"))}</div>`;
    const name = cosmeticDisplayName(item);
    return `
      <article class="archive-detail-card archive-cosmetic-detail">
        <div class="archive-cosmetic-preview"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(name)}"></div>
        <div class="archive-detail-heading">
          <div><small>COSMETICO · ART</small><h3>${escapeHtml(name)}</h3><p>${schoolLabelMarkup(item.school)}</p></div>
          ${ownershipBadge(scope, scope === "inventory" ? item.quantity : item.ownedQuantity)}
        </div>
      </article>`;
  }

  function grimoireFormulaItems(grimoire, formulas) {
    const byId = new Map(formulas.map(item => [item.formulaInstanceId || item.id, item]));
    return (grimoire?.formulaIds || []).map(id => byId.get(id)).filter(Boolean);
  }

  function grimoireSchoolCounts(grimoire, formulas) {
    const canonical = A.getSigianGrimoireSchoolCounts?.(grimoire);
    if (canonical && Object.keys(canonical).length) return Object.entries(canonical);
    const counts = new Map();
    grimoireFormulaItems(grimoire, formulas).forEach(formula => {
      counts.set(formula.school, (counts.get(formula.school) || 0) + 1);
    });
    return [...counts.entries()];
  }

  function grimoireTileMarkup(grimoire, formulas, selected) {
    const formulaItems = grimoireFormulaItems(grimoire, formulas);
    const validation = A.validateSigianGrimoire?.(grimoire, { specializationsEnabled:false }) || { ready:false };
    const schoolChips = grimoireSchoolCounts(grimoire, formulas).map(([school, count]) =>
      `<span title="${escapeHtml(schoolName(school))}">${schoolLabelMarkup(school, { showName:false })} ${escapeHtml(t("archive.schoolSlots", { count }))}</span>`
    ).join("");
    const standard = grimoire.kind === "STANDARD";
    return `
      <button type="button" class="archive-grimoire-tile ${selected ? "active" : ""} ${standard ? "is-standard" : ""}" data-grimoire-select="${escapeHtml(grimoire.id)}">
        <span class="archive-grimoire-icon" aria-hidden="true">${standard ? "📜" : "📖"}</span>
        <span class="archive-grimoire-copy">
          <strong>${escapeHtml(standard ? t("menu.grimoireStandard") : grimoire.name)}</strong>
          <small>${escapeHtml(t(standard ? "archive.standardGrimoire" : "archive.personalGrimoire"))} · ${formulaItems.length}/65 · ${escapeHtml(t(validation.ready ? "archive.ready" : "archive.notReady"))}</small>
          <span class="archive-grimoire-schools">${schoolChips || `<em>${escapeHtml(t("archive.empty"))}</em>`}</span>
        </span>
      </button>`;
  }

  function grimoireDetailMarkup(grimoire, formulas) {
    if (!grimoire) {
      return `
        <div class="archive-empty archive-grimoire-empty">
          <strong>${escapeHtml(t("archive.noGrimoires"))}</strong>
          <span>${escapeHtml(t("archive.noGrimoiresHint"))}</span>
          <button type="button" class="classic-stone-button" data-grimoire-create>＋ ${escapeHtml(t("archive.newGrimoire"))}</button>
        </div>`;
    }
    const standard = grimoire.kind === "STANDARD";
    const formulaItems = grimoireFormulaItems(grimoire, formulas);
    const schoolCounts = grimoireSchoolCounts(grimoire, formulas);
    const profile = A.loadProfile?.() || {};
    const formativeSchoolId = profile.formativeSchoolId || null;
    const academy = A.academyProgressionState
      ? A.academyProgressionState(profile.accountProgression || { xp:0 }, profile)
      : null;
    const specializationAccessUnlocked = academy
      ? academy.duelSpecializationUnlocked
      : Boolean(formativeSchoolId);
    const allSchoolSpecializationsUnlocked = Boolean(academy?.allSchoolSpecializationsUnlocked);
    const normalValidation = A.validateSigianGrimoire?.(grimoire, { specializationsEnabled:false }) || { ready:false };
    const specializedValidation = A.validateSigianGrimoire?.(grimoire, {
      specializationsEnabled:specializationAccessUnlocked,
      formativeSchoolId,
      allowAnySpecializationSchool:allSchoolSpecializationsUnlocked
    }) || { ready:false };
    const specializationCandidates = !standard && specializationAccessUnlocked
      ? formulaItems.filter(formula =>
          (allSchoolSpecializationsUnlocked || formula.school === formativeSchoolId)
          && String(formula.lifecycleState || "SEALED") === "SEALED"
        )
      : [];
    const selectedSpecializationFormula = specializationCandidates.find(formula =>
      (formula.formulaInstanceId || formula.id) === grimoire.specializationFormulaId
    ) || null;
    const selectedSpecializationLocalized = selectedSpecializationFormula
      ? localizedFormula(selectedSpecializationFormula)
      : null;
    const standardSpecializationPresets = standard
      ? (A.SIGIAN_TOURNAMENT_SPECIALIZATIONS || []).map(spec => {
          const formula = formulaItems.find(item => {
            const formulaInstanceId = String(item.formulaInstanceId || item.id || "");
            return item.sourceCardId === spec.specializationFormulaId
              || item.recipeId === spec.specializationFormulaId
              || formulaInstanceId === `owned:${spec.specializationFormulaId}`;
          }) || null;
          return { spec, formula, localized:formula ? localizedFormula(formula) : null };
        }).filter(item => item.formula && item.localized)
      : [];
    const specializationField = standard
      ? `
        <section class="archive-grimoire-specialization is-standard-preset">
          <div class="archive-block-heading">
            <strong>${escapeHtml(t("archive.specializationFormula"))}</strong>
            <small>${escapeHtml(t("archive.standardSpecializationHint"))}</small>
          </div>
          <div class="archive-specialization-slot is-standard">
            <span class="archive-specialization-slot-glyph" aria-hidden="true">✦</span>
            <span class="archive-specialization-slot-copy">
              <small>${escapeHtml(t("archive.standardSpecializationPresets"))}</small>
              <strong>${escapeHtml(t("archive.specializationGuaranteed"))}</strong>
            </span>
          </div>
          <div class="archive-specialization-preset-grid">
            ${standardSpecializationPresets.map(({ spec, formula, localized }) => `
              <div class="archive-specialization-preset archive-school-${escapeHtml(formula.school)}">
                <img src="${escapeHtml(formula.image)}" alt="" loading="lazy">
                <span>
                  <small>${escapeHtml(t(`specialization.${spec.id}`))}</small>
                  <strong>${escapeHtml(localized.name)}</strong>
                  <em>${escapeHtml(t("archive.cost"))} ${escapeHtml(formula.level || formula.cost || 13)}</em>
                </span>
              </div>`).join("")}
          </div>
        </section>`
      : specializationAccessUnlocked
        ? `
          <section class="archive-grimoire-specialization">
            <div class="archive-block-heading">
              <strong>${escapeHtml(t("archive.specializationFormula"))}</strong>
              <small>${escapeHtml(t("archive.specializationFormulaHint"))}</small>
            </div>
            <div class="archive-specialization-slot ${selectedSpecializationFormula ? "is-filled" : "is-empty"}">
              ${selectedSpecializationFormula
                ? `<img src="${escapeHtml(selectedSpecializationFormula.image)}" alt="" loading="lazy">
                   <span class="archive-specialization-slot-copy">
                     <small>${schoolLabelMarkup(selectedSpecializationFormula.school)}</small>
                     <strong>${escapeHtml(selectedSpecializationLocalized.name)}</strong>
                     <em>${escapeHtml(t("archive.cost"))} ${escapeHtml(selectedSpecializationFormula.level || selectedSpecializationFormula.cost || 0)}</em>
                   </span>
                   <b>${escapeHtml(t("archive.specializationGuaranteed"))}</b>`
                : `<span class="archive-specialization-slot-glyph" aria-hidden="true">✦</span>
                   <span class="archive-specialization-slot-copy">
                     <small>${schoolLabelMarkup(formativeSchoolId)}</small>
                     <strong>${escapeHtml(t("archive.specializationSlotEmpty"))}</strong>
                   </span>`}
            </div>
            <div class="archive-grimoire-specialization-row">
              ${allSchoolSpecializationsUnlocked ? `<span class="archive-school-label">${escapeHtml(t("archive.anySchoolSpecialization"))}</span>` : schoolLabelMarkup(formativeSchoolId)}
              <select data-grimoire-specialization="${escapeHtml(grimoire.id)}">
                <option value="">${escapeHtml(t("archive.chooseSpecializationFormula"))}</option>
                ${specializationCandidates.map(formula => {
                  const localized = localizedFormula(formula);
                  const id = formula.formulaInstanceId || formula.id;
                  return `<option value="${escapeHtml(id)}" ${grimoire.specializationFormulaId === id ? "selected" : ""}>${escapeHtml(localized.name)} · ${escapeHtml(t("archive.cost"))} ${escapeHtml(formula.level)}</option>`;
                }).join("")}
              </select>
            </div>
            <small class="archive-grimoire-specialization-state ${specializedValidation.ready ? "is-ready" : "is-blocked"}">${escapeHtml(t(specializedValidation.ready ? "archive.ready" : "archive.notReady"))}</small>
          </section>`
        : `
          <section class="archive-grimoire-specialization is-blocked">
            <div class="archive-block-heading"><strong>${escapeHtml(t("archive.specializationFormula"))}</strong></div>
            <div class="archive-specialization-slot is-empty">
              <span class="archive-specialization-slot-glyph" aria-hidden="true">✦</span>
              <span class="archive-specialization-slot-copy"><strong>${escapeHtml(t("archive.specializationSlotEmpty"))}</strong></span>
            </div>
            <p>${escapeHtml(t(academy?.academyAdmissionEligible ? "archive.formativeSchoolMissing" : "archive.specializationAcademyLocked"))}</p>
          </section>`;

    return `
      <article class="archive-detail-card archive-grimoire-detail ${standard ? "is-standard" : ""}">
        <div class="archive-grimoire-editor-head">
          <span class="archive-grimoire-large-icon" aria-hidden="true">${standard ? "📜" : "📖"}</span>
          ${standard
            ? `<div><small>${escapeHtml(t("archive.standardGrimoire"))}</small><h3>${escapeHtml(t("menu.grimoireStandard"))}</h3></div>`
            : `<label><span>${escapeHtml(t("archive.grimoireName"))}</span><input type="text" maxlength="48" value="${escapeHtml(grimoire.name)}" data-grimoire-name="${escapeHtml(grimoire.id)}"></label>`}
        </div>
        <div class="archive-grimoire-summary">
          <div><small>${escapeHtml(t("archive.formulasLabel"))}</small><strong>${formulaItems.length}/65</strong></div>
          <div><small>${escapeHtml(t("archive.schoolsLabel"))}</small><strong>${(grimoire.schoolIds || []).length}/5</strong></div>
          <div><small>${escapeHtml(t("archive.ready"))}</small><strong>${escapeHtml(t(normalValidation.ready ? "archive.ready" : "archive.notReady"))}</strong></div>
        </div>
        <div class="archive-grimoire-school-breakdown">
          ${schoolCounts.length ? schoolCounts.map(([school, count]) =>
            `<span class="${Number(count) === 13 ? "is-complete" : "is-incomplete"}">${schoolLabelMarkup(school)} <b>${escapeHtml(t("archive.schoolSlots", { count }))}</b></span>`
          ).join("") : `<span class="archive-muted">${escapeHtml(t("archive.noFormulaInGrimoire"))}</span>`}
        </div>
        ${specializationField}
        <section class="archive-grimoire-contents">
          <div class="archive-block-heading"><strong>${escapeHtml(t("archive.savedFormulas"))}</strong><small>${escapeHtml(t("archive.savedCompositionHint"))}</small></div>
          <div class="archive-grimoire-formula-grid">
            ${formulaItems.length ? formulaItems.map(formula => {
              const localized = localizedFormula(formula);
              const formulaId = formula.formulaInstanceId || formula.id;
              const isSpecialization = !standard && formulaId === grimoire.specializationFormulaId;
              return `
                <article class="archive-grimoire-formula archive-grimoire-index-formula archive-school-${escapeHtml(formula.school)} ${isSpecialization ? "is-specialization" : ""}">
                  <span class="archive-index-school-rail" aria-hidden="true"></span>
                  <span class="archive-formula-art" aria-hidden="true">
                    <img src="${escapeHtml(formula.image)}" alt="" loading="lazy">
                    <span class="archive-formula-cost-seal">${escapeHtml(formula.level)}</span>
                  </span>
                  <span class="archive-formula-copy">
                    <strong>${escapeHtml(localized.name)}</strong>
                    <small>${schoolLabelMarkup(formula.school)}${isSpecialization ? ` · ${escapeHtml(t("archive.specializationFormula"))}` : ""}</small>
                    <em class="archive-grimoire-formula-lifecycle lifecycle-${escapeHtml(String(formula.lifecycleState || "SEALED").toLowerCase())}" title="${escapeHtml(formulaLifecycleHint(formula))}">${escapeHtml(formulaLifecycleLabel(formula))}</em>
                  </span>
                  ${standard ? "" : `<button type="button" data-grimoire-remove-formula="${escapeHtml(formulaId)}" data-grimoire-id="${escapeHtml(grimoire.id)}" aria-label="${escapeHtml(t("archive.remove", { name:localized.name }))}">×</button>`}
                </article>`;
            }).join("") : `<div class="archive-empty">${escapeHtml(t("archive.emptyGrimoire"))}</div>`}
          </div>
        </section>
        ${standard ? "" : `
          <div class="archive-grimoire-actions">
            <button type="button" class="classic-stone-button" data-grimoire-open-formulas="${escapeHtml(grimoire.id)}">＋ ${escapeHtml(t("archive.addFormulas"))}</button>
            <button type="button" class="classic-stone-button ghost" data-grimoire-duplicate="${escapeHtml(grimoire.id)}">${escapeHtml(t("archive.duplicate"))}</button>
            <button type="button" class="classic-stone-button danger" data-grimoire-delete="${escapeHtml(grimoire.id)}">${escapeHtml(t("archive.delete"))}</button>
          </div>`}
      </article>`;
  }

  function inventoryOverviewMarkup(data, grimoires, state) {
    const sigils = data.components.filter(item => item.kind === "sigil");
    const constraints = data.components.filter(item => item.kind === "constraint");
    const sigilCopies = sigils.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const constraintCopies = constraints.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    return `
      <section class="archive-overview sigian-ui-panel archive-codex-overview" aria-label="${escapeHtml(t("archive.inventory"))}">
        <button type="button" class="${state?.section === "formulas" ? "active" : ""}" data-archive-jump="formulas" ${state?.section === "formulas" ? 'aria-current="page"' : ""}><small>${escapeHtml(t("archive.formulas"))}</small><strong>${data.formulas.length}</strong><span>${escapeHtml(t("archive.formulasOwned"))}</span></button>
        <button type="button" class="${state?.section === "recipes" ? "active" : ""}" data-archive-jump="recipes" ${state?.section === "recipes" ? 'aria-current="page"' : ""}><small>${escapeHtml(t("archive.recipes"))}</small><strong>${(data.recipes || []).length}</strong><span>${escapeHtml(t("archive.known"))}</span></button>
        <button type="button" class="${state?.section === "sigils" ? "active" : ""}" data-archive-jump="sigils" ${state?.section === "sigils" ? 'aria-current="page"' : ""}><small>${escapeHtml(t("archive.sigils"))}</small><strong>${sigilCopies}</strong><span>${escapeHtml(t("archive.copies"))}</span></button>
        <button type="button" class="${state?.section === "constraints" ? "active" : ""}" data-archive-jump="constraints" ${state?.section === "constraints" ? 'aria-current="page"' : ""}><small>${escapeHtml(t("archive.constraints"))}</small><strong>${constraintCopies}</strong><span>${escapeHtml(t("archive.copies"))}</span></button>
        <button type="button" class="${state?.section === "grimoires" ? "active" : ""}" data-archive-jump="grimoires" ${state?.section === "grimoires" ? 'aria-current="page"' : ""}><small>${escapeHtml(t("archive.grimoires"))}</small><strong>${grimoires.length}</strong><span>${escapeHtml(t("archive.saved"))}</span></button>
        <button type="button" class="${state?.section === "cosmetics" ? "active" : ""}" data-archive-jump="cosmetics" ${state?.section === "cosmetics" ? 'aria-current="page"' : ""}><small>${escapeHtml(t("archive.cosmetics"))}</small><strong>${data.cosmetics.length}</strong><span>${escapeHtml(t("archive.ownedPlural"))}</span></button>
      </section>`;
  }

  function sectionContentMarkup(data, state, grimoires, personalGrimoires = grimoires) {
    if (state.section === "formulas") {
      const filtered = applyFormulaFilters(data.formulas, state.formula);
      const pageCount = Math.max(1, Math.ceil(filtered.length / FORMULA_PAGE_SIZE));
      state.formula.page = Math.max(1, Math.min(Number(state.formula.page || 1), pageCount));
      const start = (state.formula.page - 1) * FORMULA_PAGE_SIZE;
      const pageItems = filtered.slice(start, start + FORMULA_PAGE_SIZE);
      if (!filtered.some(item => item.id === state.selectedId)) state.selectedId = pageItems[0]?.id || null;
      const selected = filtered.find(item => item.id === state.selectedId) || null;
      return {
        filters:formulaFiltersMarkup(data, state),
        count:`${filtered.length} / ${data.formulas.length} ${escapeHtml(t(data.scope === "collection" ? "archive.originalFormulas" : "archive.formulas"))}`,
        list:`
          ${formulaSchoolNavMarkup(state)}
          <div class="archive-formula-grid">${pageItems.map(item => formulaTileMarkup(item, data.scope, item.id === state.selectedId)).join("")}</div>
          ${formulaPaginationMarkup(state.formula.page, pageCount)}
        `,
        detail:formulaDetailMarkup(selected, data.scope, state.selectedComponentId, personalGrimoires, state)
      };
    }

    if (state.section === "recipes" && data.scope === "inventory") {
      const filtered = applyRecipeFilters(data.recipes || [], state.recipe);
      if (!filtered.some(item => item.recipeId === state.selectedId)) state.selectedId = filtered[0]?.recipeId || null;
      const selected = filtered.find(item => item.recipeId === state.selectedId) || null;
      return {
        filters:recipeFiltersMarkup(state),
        count:`${filtered.length} / ${(data.recipes || []).length} ${escapeHtml(t("archive.recipes"))}`,
        list:filtered.length
          ? `<div class="archive-formula-grid">${filtered.map(item => recipeTileMarkup(item, item.recipeId === state.selectedId)).join("")}</div>`
          : `<div class="archive-empty">${escapeHtml(t("archive.noRecipes"))}</div>`,
        detail:recipeDetailMarkup(selected, data.formulas)
      };
    }

    if (state.section === "sigils" || state.section === "constraints") {
      const kind = state.section === "sigils" ? "sigil" : "constraint";
      const bucket = kind === "sigil" ? state.sigil : state.constraint;
      const groups = aggregateComponentGroups(data, kind);
      const familyNav = componentFamilyNavMarkup(groups, state, kind);
      const filtered = groups.filter(group => componentGroupMatches(group, bucket));
      if (!filtered.some(group => group.id === state.selectedId)) state.selectedId = filtered[0]?.id || null;
      const selected = filtered.find(group => group.id === state.selectedId) || null;
      return {
        filters:componentFiltersMarkup(state, kind),
        count:`${filtered.length} / ${groups.length} ${escapeHtml(t(kind === "sigil" ? "archive.sigils" : "archive.constraints"))}`,
        list:`
          ${familyNav}
          <div class="archive-component-identity-grid">
            ${filtered.map(group => componentIdentityTileMarkup(group, data.scope, group.id === state.selectedId)).join("") || `<div class="archive-empty">${escapeHtml(t("archive.noItems"))}</div>`}
          </div>
        `,
        detail:componentGroupDetailMarkup(selected, data.scope, data.formulas)
      };
    }

    if (state.section === "grimoires" && data.scope === "inventory") {
      const filtered = applyGrimoireFilters(grimoires, state.grimoire);
      if (!filtered.some(item => item.id === state.selectedGrimoireId)) state.selectedGrimoireId = filtered[0]?.id || null;
      const selected = filtered.find(item => item.id === state.selectedGrimoireId) || null;
      return {
        filters:grimoireFiltersMarkup(state),
        count:`${filtered.length} / ${grimoires.length} ${escapeHtml(t("archive.grimoires"))}`,
        list:filtered.length
          ? `<div class="archive-grimoire-grid">${filtered.map(item => grimoireTileMarkup(item, data.formulas, item.id === state.selectedGrimoireId)).join("")}</div>`
          : `<div class="archive-empty">${escapeHtml(t("archive.noGrimoireSearch"))}</div>`,
        detail:grimoireDetailMarkup(selected, data.formulas)
      };
    }

    const filtered = applyCosmeticFilters(data.cosmetics, state.cosmetic);
    if (!filtered.some(item => item.id === state.selectedId)) state.selectedId = filtered[0]?.id || null;
    const selected = filtered.find(item => item.id === state.selectedId) || null;
    return {
      filters:cosmeticFiltersMarkup(state),
      count:`${filtered.length} / ${data.cosmetics.length} ${escapeHtml(t("archive.cosmetics"))}`,
      list:`<div class="archive-cosmetic-grid">${filtered.map(item => cosmeticTileMarkup(item, data.scope, item.id === state.selectedId)).join("")}</div>`,
      detail:cosmeticDetailMarkup(selected, data.scope)
    };
  }

  function filterBucket(state) {
    if (state.section === "formulas") return state.formula;
    if (state.section === "recipes") return state.recipe;
    if (state.section === "sigils") return state.sigil;
    if (state.section === "constraints") return state.constraint;
    if (state.section === "grimoires") return state.grimoire;
    return state.cosmetic;
  }

  function archiveLockOwner(scope) {
    return `archive-detail-${scope}`;
  }

  function rememberArchiveDetailTrigger(state, node) {
    if (!state || !node) return;
    const attributes = ["data-archive-item", "data-archive-recipe", "data-archive-component-group", "data-grimoire-select"];
    const attribute = attributes.find(name => node.hasAttribute?.(name));
    const value = attribute ? node.getAttribute(attribute) : "";
    if (attribute && value) state.returnFocus = { attribute, value };
  }

  function restoreArchiveDetailFocus(state, root) {
    const token = state?.returnFocus;
    let target = null;
    if (token?.attribute && token?.value) {
      target = Array.from(root.querySelectorAll(`[${token.attribute}]`))
        .find(node => node.getAttribute(token.attribute) === token.value) || null;
    }
    target ||= root.querySelector("[data-archive-section].active, [data-archive-jump].active, [data-archive-search]");
    target?.focus?.({ preventScroll:true });
  }

  function syncArchiveDetailLock(state, scope) {
    const mobile = window.matchMedia?.("(max-width:980px)")?.matches;
    if (state?.detailOpen && mobile) A.MenuSheetLock?.lock?.(archiveLockOwner(scope));
    else A.MenuSheetLock?.unlock?.(archiveLockOwner(scope));
  }

  function bindArchiveDetailDrag(root, state, scope) {
    const handle = root.querySelector("[data-archive-detail-drag]");
    const sheet = root.querySelector(".archive-detail-sheet");
    if (!handle || !sheet || !window.matchMedia?.("(max-width:980px)")?.matches) return;
    let pointerId = null;
    let startY = 0;
    let lastY = 0;
    let dragging = false;

    const reset = () => {
      sheet.style.removeProperty("transform");
      sheet.style.removeProperty("transition");
      handle.classList.remove("is-dragging");
      dragging = false;
      pointerId = null;
    };
    const finish = event => {
      if (pointerId === null || (event.pointerId != null && event.pointerId !== pointerId)) return;
      const delta = Math.max(0, lastY - startY);
      try { handle.releasePointerCapture?.(pointerId); } catch {}
      if (delta >= 72) {
        handle.classList.remove("is-dragging");
        closeDetail(state, root, scope);
        return;
      }
      sheet.style.transition = "transform 150ms ease";
      sheet.style.transform = "translateY(0)";
      window.setTimeout(reset, 170);
    };

    handle.addEventListener("pointerdown", event => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      pointerId = event.pointerId;
      startY = lastY = event.clientY;
      dragging = true;
      handle.classList.add("is-dragging");
      sheet.style.transition = "none";
      handle.setPointerCapture?.(pointerId);
      event.preventDefault();
    });
    handle.addEventListener("pointermove", event => {
      if (!dragging || event.pointerId !== pointerId) return;
      lastY = event.clientY;
      const delta = Math.max(0, lastY - startY);
      sheet.style.transform = `translateY(${Math.min(delta, 180)}px)`;
      event.preventDefault();
    });
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
    handle.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " " && event.key !== "ArrowDown") return;
      event.preventDefault();
      closeDetail(state, root, scope);
    });
  }

  function closeDetail(state, root, scope) {
    const panel = root.querySelector(".archive-detail-panel");
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const mobileSheet = window.matchMedia?.("(max-width:980px)")?.matches;
    const finalize = () => {
      state.detailOpen = false;
      syncArchiveDetailLock(state, scope);
      render(root, scope);
      restoreArchiveDetailFocus(state, root);
    };
    if (!state.detailOpen || !panel || reducedMotion || !mobileSheet) {
      finalize();
      return;
    }
    if (panel.classList.contains("is-closing")) return;
    panel.classList.add("is-closing");
    window.setTimeout(finalize, 105);
  }

  function bind(root, scope, data, state) {
    bindScopeNavigation(root, scope);

    root.querySelectorAll("[data-archive-section], [data-archive-jump]").forEach(button => button.addEventListener("click", () => {
      state.section = button.dataset.archiveSection || button.dataset.archiveJump;
      state.selectedId = null;
      state.selectedComponentId = null;
      state.detailOpen = false;
      render(root, scope);
    }));

    root.querySelectorAll("[data-archive-filter]").forEach(control => control.addEventListener("change", () => {
      const bucket = filterBucket(state);
      bucket[control.dataset.archiveFilter] = control.value;
      if (state.section === "formulas") state.formula.page = 1;
      state.selectedId = null;
      state.selectedComponentId = null;
      state.detailOpen = false;
      render(root, scope);
    }));

    root.querySelector("[data-archive-search]")?.addEventListener("input", event => {
      const bucket = filterBucket(state);
      bucket.search = event.currentTarget.value;
      if (state.section === "formulas") state.formula.page = 1;
      const caret = event.currentTarget.selectionStart ?? bucket.search.length;
      state.selectedId = null;
      state.selectedComponentId = null;
      state.detailOpen = false;
      render(root, scope);
      const next = root.querySelector("[data-archive-search]");
      if (next) {
        next.focus();
        next.setSelectionRange?.(caret, caret);
      }
    });

    root.querySelectorAll("[data-formula-school]").forEach(button => button.addEventListener("click", () => {
      state.formula.school = button.dataset.formulaSchool;
      state.formula.page = 1;
      state.selectedId = null;
      state.detailOpen = false;
      render(root, scope);
    }));

    root.querySelectorAll("[data-formula-page]").forEach(button => button.addEventListener("click", () => {
      state.formula.page = Number(button.dataset.formulaPage || 1);
      state.selectedId = null;
      state.detailOpen = false;
      render(root, scope);
      root.querySelector(".archive-list-panel")?.scrollIntoView?.({ block:"start", behavior:"smooth" });
    }));

    root.querySelectorAll("[data-component-family]").forEach(button => button.addEventListener("click", () => {
      const bucket = state.section === "sigils" ? state.sigil : state.constraint;
      bucket.family = button.dataset.componentFamily;
      bucket.search = "";
      state.selectedId = null;
      state.detailOpen = false;
      render(root, scope);
    }));

    root.querySelectorAll("[data-archive-item]").forEach(item => {
      item.addEventListener("click", event => {
        if (event.target.closest?.("[data-sigian-inspect]")) return;
        rememberArchiveDetailTrigger(state, item);
        state.selectedId = item.dataset.archiveItem;
        state.selectedComponentId = null;
        state.detailOpen = true;
        render(root, scope);
      });
      item.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (event.target.closest?.("[data-sigian-inspect]")) return;
        event.preventDefault();
        rememberArchiveDetailTrigger(state, item);
        state.selectedId = item.dataset.archiveItem;
        state.selectedComponentId = null;
        state.detailOpen = true;
        render(root, scope);
      });
    });

    root.querySelectorAll("[data-open-recipe]").forEach(button => button.addEventListener("click", event => {
      event.stopPropagation();
      state.section = "recipes";
      state.selectedId = button.dataset.openRecipe;
      state.selectedComponentId = null;
      state.detailOpen = true;
      render(root, scope);
    }));

    root.querySelectorAll("[data-archive-recipe]").forEach(item => {
      const open = () => {
        rememberArchiveDetailTrigger(state, item);
        state.selectedId = item.dataset.archiveRecipe;
        state.selectedComponentId = null;
        state.detailOpen = true;
        render(root, scope);
      };
      item.addEventListener("click", open);
      item.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        open();
      });
    });

    root.querySelectorAll("[data-recipe-linked-formula]").forEach(button => button.addEventListener("click", () => {
      const formulaInstanceId = button.dataset.recipeLinkedFormula;
      const formula = data.formulas.find(item => item.formulaInstanceId === formulaInstanceId);
      if (!formula) return;
      state.section = "formulas";
      state.selectedId = formula.id;
      state.selectedComponentId = null;
      state.formula.page = 1;
      state.detailOpen = true;
      render(root, scope);
    }));

    root.querySelectorAll("[data-archive-component-group]").forEach(button => button.addEventListener("click", () => {
      rememberArchiveDetailTrigger(state, button);
      state.selectedId = button.dataset.archiveComponentGroup;
      state.detailOpen = true;
      render(root, scope);
    }));

    root.querySelectorAll("[data-formula-component]").forEach(button => button.addEventListener("click", () => {
      state.selectedComponentId = button.dataset.formulaComponent;
      state.detailOpen = true;
      render(root, scope);
    }));

    root.querySelectorAll("[data-component-assigned-formula]").forEach(button => button.addEventListener("click", () => {
      const formulaInstanceId = button.dataset.componentAssignedFormula;
      const formula = data.formulas.find(item => item.formulaInstanceId === formulaInstanceId);
      if (!formula) return;
      state.section = "formulas";
      state.selectedId = formula.id;
      state.selectedComponentId = null;
      state.formula.page = 1;
      state.detailOpen = true;
      render(root, scope);
    }));

    root.querySelector("[data-archive-detail-close]")?.addEventListener("click", () => closeDetail(state, root, scope));
    bindArchiveDetailDrag(root, state, scope);

    const detailPanel = root.querySelector(".archive-detail-panel");
    detailPanel?.addEventListener("click", event => {
      if (event.target !== detailPanel) return;
      closeDetail(state, root, scope);
    });
    detailPanel?.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeDetail(state, root, scope);
    });

    root.querySelector("[data-archive-forge]")?.addEventListener("click", event => {
      window.dispatchEvent(new CustomEvent("sigian:inventory-forge-request", {
        detail:{ cardId:event.currentTarget.dataset.archiveForge }
      }));
    });

    root.querySelector("[data-formula-grimoire-select]")?.addEventListener("change", event => {
      state.targetGrimoireId = event.currentTarget.value;
      render(root, scope);
    });

    root.querySelector("[data-add-formula-grimoire]")?.addEventListener("click", event => {
      const grimoires = A.listSigianGrimoires?.() || [];
      const targetId = grimoires.some(item => item.id === state.targetGrimoireId)
        ? state.targetGrimoireId
        : grimoires[0]?.id;
      if (!targetId) return;
      A.addFormulaToSigianGrimoire?.(targetId, event.currentTarget.dataset.addFormulaGrimoire);
      state.targetGrimoireId = targetId;
      window.dispatchEvent(new CustomEvent("sigian:grimoireschange"));
      render(root, scope);
    });

    root.querySelector("[data-create-grimoire-for-formula]")?.addEventListener("click", event => {
      const grimoire = A.createSigianGrimoire?.();
      if (!grimoire) return;
      A.addFormulaToSigianGrimoire?.(grimoire.id, event.currentTarget.dataset.createGrimoireForFormula);
      state.targetGrimoireId = grimoire.id;
      state.selectedGrimoireId = grimoire.id;
      window.dispatchEvent(new CustomEvent("sigian:grimoireschange"));
      render(root, scope);
    });

    root.querySelectorAll("[data-grimoire-create]").forEach(button => button.addEventListener("click", () => {
      const grimoire = A.createSigianGrimoire?.();
      if (!grimoire) return;
      state.section = "grimoires";
      state.selectedGrimoireId = grimoire.id;
      state.targetGrimoireId = grimoire.id;
      state.grimoire.search = "";
      state.detailOpen = true;
      window.dispatchEvent(new CustomEvent("sigian:grimoireschange"));
      render(root, scope);
    }));

    root.querySelectorAll("[data-grimoire-select]").forEach(button => button.addEventListener("click", () => {
      rememberArchiveDetailTrigger(state, button);
      state.selectedGrimoireId = button.dataset.grimoireSelect;
      state.targetGrimoireId = button.dataset.grimoireSelect;
      state.detailOpen = true;
      render(root, scope);
    }));

    root.querySelector("[data-grimoire-name]")?.addEventListener("change", event => {
      A.renameSigianGrimoire?.(event.currentTarget.dataset.grimoireName, event.currentTarget.value);
      window.dispatchEvent(new CustomEvent("sigian:grimoireschange"));
      render(root, scope);
    });

    root.querySelector("[data-grimoire-name]")?.addEventListener("keydown", event => {
      if (event.key === "Enter") event.currentTarget.blur();
    });

    root.querySelector("[data-grimoire-specialization]")?.addEventListener("change", event => {
      const grimoireId = event.currentTarget.dataset.grimoireSpecialization;
      const profile = A.loadProfile?.() || {};
      const formativeSchoolId = profile.formativeSchoolId || null;
      const academy = A.academyProgressionState
        ? A.academyProgressionState(profile.accountProgression || { xp:0 }, profile)
        : null;
      A.setSigianGrimoireSpecializationFormula?.(
        grimoireId,
        event.currentTarget.value,
        formativeSchoolId,
        { allowAnySpecializationSchool:Boolean(academy?.allSchoolSpecializationsUnlocked) }
      );
      window.dispatchEvent(new CustomEvent("sigian:grimoireschange"));
      render(root, scope);
    });

    root.querySelector("[data-grimoire-duplicate]")?.addEventListener("click", event => {
      const copy = A.duplicateSigianGrimoire?.(event.currentTarget.dataset.grimoireDuplicate);
      if (!copy) return;
      state.selectedGrimoireId = copy.id;
      state.targetGrimoireId = copy.id;
      state.grimoire.search = "";
      state.detailOpen = true;
      window.dispatchEvent(new CustomEvent("sigian:grimoireschange"));
      render(root, scope);
    });

    root.querySelector("[data-grimoire-delete]")?.addEventListener("click", event => {
      const id = event.currentTarget.dataset.grimoireDelete;
      const selected = A.getSigianGrimoire?.(id);
      if (typeof window.confirm === "function" && !window.confirm(t("archive.deleteConfirm", { name:selected?.name || t("archive.grimoire") }))) return;
      A.deleteSigianGrimoire?.(id);
      state.selectedGrimoireId = null;
      state.detailOpen = false;
      if (state.targetGrimoireId === id) state.targetGrimoireId = null;
      window.dispatchEvent(new CustomEvent("sigian:grimoireschange"));
      render(root, scope);
    });

    root.querySelectorAll("[data-grimoire-remove-formula]").forEach(button => button.addEventListener("click", () => {
      A.removeFormulaFromSigianGrimoire?.(button.dataset.grimoireId, button.dataset.grimoireRemoveFormula);
      window.dispatchEvent(new CustomEvent("sigian:grimoireschange"));
      render(root, scope);
    }));

    root.querySelector("[data-grimoire-open-formulas]")?.addEventListener("click", event => {
      state.targetGrimoireId = event.currentTarget.dataset.grimoireOpenFormulas;
      state.section = "formulas";
      state.formula.page = 1;
      state.selectedId = null;
      state.selectedComponentId = null;
      state.detailOpen = false;
      render(root, scope);
    });
  }

  function mountFormulaFullCards(root, data) {
    if (!root || !data) return;
    const byId = new Map((data.formulas || []).map(item => [item.id, item]));
    root.querySelectorAll("[data-archive-full-card]").forEach(host => {
      const item = byId.get(host.dataset.archiveFullCard);
      if (!item) return;
      const card = A.SigianCardRenderer?.buildFull?.(item, {
        editable:false,
        inspectable:true,
        surface:data.scope || "archive"
      });
      if (!card) {
        host.innerHTML = `<div class="archive-empty">${escapeHtml(t("archive.catalogUnavailable"))}</div>`;
        return;
      }
      card.classList.add("archive-full-card-view");
      host.replaceChildren(card);
    });
  }

  function bindScopeNavigation(root, scope) {
    root.querySelectorAll("[data-archive-scope]").forEach(button => button.addEventListener("click", () => {
      const next = button.dataset.archiveScope;
      if (next === scope) return;
      const state = states.get(scope);
      if (state) state.detailOpen = false;
      A.MenuSheetLock?.unlock?.(archiveLockOwner(scope));
      window.dispatchEvent(new CustomEvent("sigian:archive-scope-request", { detail:{ scope:next } }));
    }));
  }

  function chronicleEntryArtMarkup(entry) {
    const art = entry?.media?.environmentArt;
    if (!art) return "";
    if (art.src) {
      return `
        <figure class="chronicles-entry-art" data-chronicle-art-slot="${escapeHtml(art.slotId || entry.id)}">
          <img src="${escapeHtml(art.src)}" alt="${escapeHtml(t(art.altKey))}" loading="lazy" decoding="async">
        </figure>`;
    }
    return `
      <div class="chronicles-entry-art chronicles-entry-art-placeholder" data-chronicle-art-slot="${escapeHtml(art.slotId || entry.id)}" aria-label="${escapeHtml(t(art.altKey))}">
        <span aria-hidden="true">◇</span>
        <small>${escapeHtml(t("chronicles.environmentArtPending"))}</small>
      </div>`;
  }

  function chronicleEntryMarkup(entry) {
    const schoolId = String(entry.formativeSchoolId || "");
    return `
      <details class="chronicles-entry-card" data-chronicle-entry="${escapeHtml(entry.id)}" data-chronicle-school="${escapeHtml(schoolId)}">
        <summary>
          <span class="chronicles-entry-school-icon" aria-hidden="true">${schoolIconMarkup(schoolId, "school-icon-svg chronicles-school-icon")}</span>
          <span class="chronicles-entry-heading">
            <strong>${escapeHtml(t(entry.titleKey))}</strong>
            <small>${escapeHtml(t(entry.subtitleKey))}</small>
          </span>
          <span class="chronicles-entry-chevron" aria-hidden="true">›</span>
        </summary>
        <div class="chronicles-entry-content">
          ${chronicleEntryArtMarkup(entry)}
          <div class="chronicles-entry-copy">
            <p class="chronicles-entry-summary">${escapeHtml(t(entry.summaryKey))}</p>
            <dl>
              <div><dt>${escapeHtml(t("chronicles.entry.specialization"))}</dt><dd>${escapeHtml(t(entry.specializationKey))}</dd></div>
              <div><dt>${escapeHtml(t("chronicles.entry.identity"))}</dt><dd>${escapeHtml(t(entry.identityKey))}</dd></div>
              <div><dt>${escapeHtml(t("chronicles.entry.visual"))}</dt><dd>${escapeHtml(t(entry.visualKey))}</dd></div>
              <div><dt>${escapeHtml(t("chronicles.entry.environment"))}</dt><dd>${escapeHtml(t(entry.environmentKey))}</dd></div>
            </dl>
          </div>
        </div>
      </details>`;
  }

  function chronicleCategoryMarkup(category) {
    const entries = A.listSigianChronicleEntries?.(category.id) || [];
    return `
      <article class="chronicles-category-card sigian-ui-panel ${entries.length ? "has-entries" : "is-empty"}" data-chronicle-category="${escapeHtml(category.id)}">
        <div class="chronicles-category-heading">
          <span class="chronicles-category-mark" aria-hidden="true">◇</span>
          <div>
            <h3>${escapeHtml(t(category.titleKey))}</h3>
            <small>${escapeHtml(t("chronicles.entries", { count:entries.length }))}</small>
          </div>
        </div>
        <p>${escapeHtml(t(category.descriptionKey))}</p>
        ${entries.length
          ? `<div class="chronicles-entry-list">${entries.map(chronicleEntryMarkup).join("")}</div>`
          : `<span class="chronicles-category-state">${escapeHtml(t("chronicles.empty"))}</span>`}
      </article>`;
  }
  function renderChronicles(root) {
    const categories = A.listSigianChronicleCategories?.() || [];
    root.innerHTML = `
      <div class="archive-browser archive-codex-screen archive-chronicles-screen" data-archive-scope-root="chronicles">
        <header class="archive-heading archive-codex-heading sigian-ui-section-header">
          <div class="archive-codex-heading-main">
            <span class="archive-codex-heading-icon" aria-hidden="true"><svg><use href="#sigian-nav-archive"></use></svg></span>
            <div>
              <span class="classic-menu-kicker">${escapeHtml(t("nav.library"))}</span>
              <h2>${escapeHtml(t("archive.chronicles"))}</h2>
              <p>${escapeHtml(t("archive.chroniclesIntro"))}</p>
            </div>
          </div>
        </header>
        ${scopeToggleMarkup("chronicles")}

        <section class="chronicles-foundation sigian-ui-panel" aria-labelledby="chroniclesFoundationTitle">
          <span class="classic-menu-kicker">${escapeHtml(t("archive.chronicles"))}</span>
          <h3 id="chroniclesFoundationTitle">${escapeHtml(t("chronicles.foundationTitle"))}</h3>
          <p>${escapeHtml(t("chronicles.foundationDescription"))}</p>
        </section>

        <section class="chronicles-category-grid" aria-label="${escapeHtml(t("archive.chronicles"))}">
          ${categories.map(chronicleCategoryMarkup).join("")}
        </section>
      </div>`;
    bindScopeNavigation(root, "chronicles");
  }

  function render(root, scope = "collection") {
    if (!root) return;
    roots.set(scope, root);
    if (scope === "chronicles") {
      renderChronicles(root);
      return;
    }
    const data = A.buildSigianArchiveData?.(scope);
    if (!data) {
      root.innerHTML = `<div class="archive-empty">${escapeHtml(t("archive.catalogUnavailable"))}</div>`;
      return;
    }

    const state = stateFor(scope);
    const personalGrimoires = scope === "inventory" ? (A.listSigianGrimoires?.() || []) : [];
    const grimoires = scope === "inventory"
      ? (A.listSigianAllGrimoires?.() || personalGrimoires)
      : [];
    if (!sectionIds(scope).includes(state.section)) state.section = "formulas";
    if (!personalGrimoires.some(item => item.id === state.targetGrimoireId)) state.targetGrimoireId = personalGrimoires[0]?.id || null;

    const content = sectionContentMarkup(data, state, grimoires, personalGrimoires);
    const title = t(scope === "inventory" ? "archive.inventory" : "archive.codex");
    const intro = t(scope === "inventory" ? "archive.inventoryIntro" : "archive.collectionIntro");

    root.innerHTML = `
      <div class="archive-browser archive-codex-screen ${state.detailOpen ? "detail-open" : ""}" data-archive-scope-root="${scope}">
        <header class="archive-heading archive-codex-heading sigian-ui-section-header">
          <div class="archive-codex-heading-main">
            <span class="archive-codex-heading-icon" aria-hidden="true"><svg><use href="#sigian-nav-archive"></use></svg></span>
            <div>
              <span class="classic-menu-kicker">${escapeHtml(t("nav.library"))}</span>
              <h2>${title}</h2>
              <p>${intro}</p>
            </div>
          </div>
        </header>
        ${scopeToggleMarkup(scope)}

        ${scope === "inventory" ? inventoryOverviewMarkup(data, grimoires, state) : sectionTabsMarkup(state, scope, data, grimoires)}

        <section class="archive-filters archive-codex-filters sigian-ui-panel">
          ${content.filters}
          <div class="archive-count">${content.count}</div>
        </section>

        <div class="archive-layout archive-codex-layout ${state.section === "grimoires" ? "is-grimoires" : ""}">
          <main class="archive-list-panel archive-codex-index">${content.list}</main>
          <aside class="archive-detail-panel archive-codex-detail" aria-label="${escapeHtml(t("archive.selectionDetail"))}" tabindex="-1">
            <div class="archive-detail-sheet archive-codex-inspector sigian-ui-codex sigian-ui-bottom-sheet">
              <button type="button" class="archive-detail-drag-handle" data-archive-detail-drag aria-label="${escapeHtml(t("archive.closeDetails"))}"><span aria-hidden="true"></span></button>
              <button type="button" class="archive-detail-close" data-archive-detail-close aria-label="${escapeHtml(t("archive.closeDetails"))}">×</button>
              ${content.detail}
            </div>
          </aside>
        </div>
      </div>`;

    mountFormulaFullCards(root, data);
    syncArchiveDetailLock(state, scope);
    bind(root, scope, data, state);
    if (state.detailOpen && window.matchMedia?.("(max-width:980px)")?.matches) {
      window.requestAnimationFrame?.(() => root.querySelector("[data-archive-detail-close]")?.focus?.({ preventScroll:true }));
    }
  }

  A.SigianArchiveBrowser = Object.freeze({
    render,
    reset(scope) {
      if (scope) states.delete(scope);
      else states.clear();
    }
  });

  if (typeof window !== "undefined") {
    const rerenderConnectedRoots = () => {
      roots.forEach((root, scope) => {
        if (root?.isConnected) render(root, scope);
      });
    };
    window.addEventListener("arcane:languagechange", rerenderConnectedRoots);
    window.addEventListener("sigian:formative-school-change", rerenderConnectedRoots);
  }
})(window.Arcane = window.Arcane || {});
