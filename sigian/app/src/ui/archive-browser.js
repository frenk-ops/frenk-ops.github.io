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
        formula:{ search:"", school:"all", type:"all", level:"all", sigil:"all", constraint:"all", page:1 },
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
      ? ["formulas", "sigils", "constraints", "grimoires", "cosmetics"]
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
      <div class="archive-scope-switch" role="tablist" aria-label="${escapeHtml(t("nav.more"))}">
        <button type="button" data-archive-scope="inventory" class="${scope === "inventory" ? "active" : ""}" role="tab" aria-selected="${scope === "inventory"}">${escapeHtml(t("archive.inventory"))}</button>
        <button type="button" data-archive-scope="collection" class="${scope === "collection" ? "active" : ""}" role="tab" aria-selected="${scope === "collection"}">${escapeHtml(t("archive.collection"))}</button>
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
        return { ...group, grades, effectSchools, affinityModes, ownedCopies, inventoryCopies };
      })
      .sort((left, right) => left.family.localeCompare(right.family) || left.name.localeCompare(right.name));
  }

  function sectionCounts(scope, data, grimoires) {
    return {
      formulas:data.formulas.length,
      sigils:aggregateComponentGroups(data, "sigil").length,
      constraints:aggregateComponentGroups(data, "constraint").length,
      grimoires:grimoires.length,
      cosmetics:data.cosmetics.length
    };
  }

  function sectionTabsMarkup(state, scope, data, grimoires) {
    const counts = sectionCounts(scope, data, grimoires);
    return `
      <nav class="archive-section-tabs" aria-label="Sezioni archivio">
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

  function formulaTileMarkup(item, scope, selected) {
    const localized = localizedFormula(item);
    const typeLabel = t(item.type === "spell" ? "archive.spell" : "archive.creature");
    const quantityLabel = scope === "inventory" ? `, ×${item.quantity || 1}` : "";
    const rowLabel = `${localized.name}, ${schoolName(item.school)}, ${typeLabel}, ${t("archive.cost")} ${item.level}${quantityLabel}`;
    return `
      <article class="archive-formula-tile archive-formula-index-row archive-school-${escapeHtml(item.school)} ${selected ? "active" : ""}" data-archive-item="${escapeHtml(item.id)}" tabindex="0" aria-label="${escapeHtml(rowLabel)}">
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
          <em>${escapeHtml(t(scope === "collection" ? "archive.originalFormula" : "archive.ownedFormula"))}</em>
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
    const alreadyPresent = Boolean(target?.formulaIds?.includes(item.id));

    return `
      <article class="archive-detail-card archive-formula-detail archive-formula-full-detail">
        <div class="archive-full-detail-host" data-archive-full-card="${escapeHtml(item.id)}"></div>
        <p class="archive-full-interaction-note">${escapeHtml(t("archive.fullInteractionHint"))}</p>
        ${scope === "inventory" ? `
          <section class="archive-grimoire-quick-add">
            <div>
              <strong>${escapeHtml(t("archive.grimoire"))}</strong>
              <small>${escapeHtml(t("archive.addToComposition"))}</small>
            </div>
            ${grimoires.length ? `
              <select data-formula-grimoire-select aria-label="${escapeHtml(t("archive.chooseGrimoire"))}">
                ${grimoires.map(grimoire => `<option value="${escapeHtml(grimoire.id)}" ${grimoire.id === targetId ? "selected" : ""}>${escapeHtml(grimoire.name)} · ${grimoire.formulaIds.length}</option>`).join("")}
              </select>
              <button type="button" class="classic-stone-button archive-grimoire-add-action" data-add-formula-grimoire="${escapeHtml(item.id)}" ${alreadyPresent ? "disabled" : ""}>
                ${escapeHtml(alreadyPresent ? t("archive.alreadyPresent") : `＋ ${t("archive.add")}`)}
              </button>
            ` : `
              <button type="button" class="classic-stone-button archive-grimoire-create-action" data-create-grimoire-for-formula="${escapeHtml(item.id)}">＋ ${escapeHtml(t("archive.createGrimoireAdd"))}</button>
            `}
          </section>
          <div class="archive-formula-actions">
            <button type="button" class="classic-stone-button" data-archive-forge="${escapeHtml(item.id)}" title="${escapeHtml(t("archive.openForge"))}">⚒ <span>${escapeHtml(t("archive.forge"))}</span></button>
            <button type="button" class="classic-stone-button danger" disabled title="${escapeHtml(t("archive.craftingInactive"))}">🔥 <span>${escapeHtml(t("archive.destroy"))}</span></button>
          </div>` : ""}
      </article>`;
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

  function componentGroupDetailMarkup(group, scope) {
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
        <p>${escapeHtml(group.summary)}</p>
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
    const byId = new Map(formulas.map(item => [item.id, item]));
    return (grimoire?.formulaIds || []).map(id => byId.get(id)).filter(Boolean);
  }

  function grimoireSchoolCounts(grimoire, formulas) {
    const counts = new Map();
    grimoireFormulaItems(grimoire, formulas).forEach(formula => {
      counts.set(formula.school, (counts.get(formula.school) || 0) + 1);
    });
    return [...counts.entries()];
  }

  function grimoireTileMarkup(grimoire, formulas, selected) {
    const formulaItems = grimoireFormulaItems(grimoire, formulas);
    const schoolChips = grimoireSchoolCounts(grimoire, formulas).map(([school, count]) =>
      `<span title="${escapeHtml(schoolName(school))}">${schoolLabelMarkup(school, { showName:false })} ${count}</span>`
    ).join("");
    return `
      <button type="button" class="archive-grimoire-tile ${selected ? "active" : ""}" data-grimoire-select="${escapeHtml(grimoire.id)}">
        <span class="archive-grimoire-icon" aria-hidden="true">📖</span>
        <span class="archive-grimoire-copy">
          <strong>${escapeHtml(grimoire.name)}</strong>
          <small>${formulaItems.length} ${escapeHtml(t(formulaItems.length === 1 ? "archive.formula" : "archive.formulas"))} · ${escapeHtml(t("archive.updated", { date:formatShortDate(grimoire.updatedAt) }))}</small>
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
    const formulaItems = grimoireFormulaItems(grimoire, formulas);
    const schoolCounts = grimoireSchoolCounts(grimoire, formulas);
    return `
      <article class="archive-detail-card archive-grimoire-detail">
        <div class="archive-grimoire-editor-head">
          <span class="archive-grimoire-large-icon" aria-hidden="true">📖</span>
          <label>
            <span>${escapeHtml(t("archive.grimoireName"))}</span>
            <input type="text" maxlength="48" value="${escapeHtml(grimoire.name)}" data-grimoire-name="${escapeHtml(grimoire.id)}">
          </label>
        </div>
        <div class="archive-grimoire-summary">
          <div><small>${escapeHtml(t("archive.formulasLabel"))}</small><strong>${formulaItems.length}</strong></div>
          <div><small>${escapeHtml(t("archive.schoolsLabel"))}</small><strong>${schoolCounts.length}</strong></div>
          <div><small>${escapeHtml(t("archive.savedLabel"))}</small><strong>${escapeHtml(formatShortDate(grimoire.updatedAt))}</strong></div>
        </div>
        <div class="archive-grimoire-school-breakdown">
          ${schoolCounts.length ? schoolCounts.map(([school, count]) =>
            `<span>${schoolLabelMarkup(school)} <b>${count}</b></span>`
          ).join("") : `<span class="archive-muted">${escapeHtml(t("archive.noFormulaInGrimoire"))}</span>`}
        </div>
        <section class="archive-grimoire-contents">
          <div class="archive-block-heading"><strong>${escapeHtml(t("archive.savedFormulas"))}</strong><small>${escapeHtml(t("archive.savedCompositionHint"))}</small></div>
          <div class="archive-grimoire-formula-grid">
            ${formulaItems.length ? formulaItems.map(formula => {
              const localized = localizedFormula(formula);
              return `
                <article class="archive-grimoire-formula archive-grimoire-index-formula archive-school-${escapeHtml(formula.school)}">
                  <span class="archive-index-school-rail" aria-hidden="true"></span>
                  <span class="archive-formula-art" aria-hidden="true">
                    <img src="${escapeHtml(formula.image)}" alt="" loading="lazy">
                    <span class="archive-formula-cost-seal">${escapeHtml(formula.level)}</span>
                  </span>
                  <span class="archive-formula-copy">
                    <strong>${escapeHtml(localized.name)}</strong>
                    <small>
                      ${schoolLabelMarkup(formula.school)}
                    </small>
                  </span>
                  <button type="button" data-grimoire-remove-formula="${escapeHtml(formula.id)}" data-grimoire-id="${escapeHtml(grimoire.id)}" aria-label="${escapeHtml(t("archive.remove", { name:localized.name }))}">×</button>
                </article>`;
            }).join("") : `<div class="archive-empty">${escapeHtml(t("archive.emptyGrimoire"))}</div>`}
          </div>
        </section>
        <div class="archive-grimoire-actions">
          <button type="button" class="classic-stone-button" data-grimoire-open-formulas="${escapeHtml(grimoire.id)}">＋ ${escapeHtml(t("archive.addFormulas"))}</button>
          <button type="button" class="classic-stone-button ghost" data-grimoire-duplicate="${escapeHtml(grimoire.id)}">${escapeHtml(t("archive.duplicate"))}</button>
          <button type="button" class="classic-stone-button danger" data-grimoire-delete="${escapeHtml(grimoire.id)}">${escapeHtml(t("archive.delete"))}</button>
        </div>
      </article>`;
  }

  function inventoryOverviewMarkup(data, grimoires) {
    const sigils = data.components.filter(item => item.kind === "sigil");
    const constraints = data.components.filter(item => item.kind === "constraint");
    const sigilCopies = sigils.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const constraintCopies = constraints.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    return `
      <section class="archive-overview" aria-label="${escapeHtml(t("archive.inventory"))}">
        <button type="button" data-archive-jump="formulas"><small>${escapeHtml(t("archive.formulas"))}</small><strong>${data.formulas.length}</strong><span>${escapeHtml(t("archive.formulasOwned"))}</span></button>
        <button type="button" data-archive-jump="sigils"><small>${escapeHtml(t("archive.sigils"))}</small><strong>${sigilCopies}</strong><span>${escapeHtml(t("archive.copies"))}</span></button>
        <button type="button" data-archive-jump="constraints"><small>${escapeHtml(t("archive.constraints"))}</small><strong>${constraintCopies}</strong><span>${escapeHtml(t("archive.copies"))}</span></button>
        <button type="button" data-archive-jump="grimoires"><small>${escapeHtml(t("archive.grimoires"))}</small><strong>${grimoires.length}</strong><span>${escapeHtml(t("archive.saved"))}</span></button>
        <button type="button" data-archive-jump="cosmetics"><small>${escapeHtml(t("archive.cosmetics"))}</small><strong>${data.cosmetics.length}</strong><span>${escapeHtml(t("archive.ownedPlural"))}</span></button>
      </section>`;
  }

  function sectionContentMarkup(data, state, grimoires) {
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
        detail:formulaDetailMarkup(selected, data.scope, state.selectedComponentId, grimoires, state)
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
        detail:componentGroupDetailMarkup(selected, data.scope)
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
    if (state.section === "sigils") return state.sigil;
    if (state.section === "constraints") return state.constraint;
    if (state.section === "grimoires") return state.grimoire;
    return state.cosmetic;
  }

  function closeDetail(state, root, scope) {
    state.detailOpen = false;
    render(root, scope);
  }

  function bind(root, scope, data, state) {
    root.querySelectorAll("[data-archive-scope]").forEach(button => button.addEventListener("click", () => {
      const next = button.dataset.archiveScope;
      if (next === scope) return;
      window.dispatchEvent(new CustomEvent("sigian:archive-scope-request", { detail:{ scope:next } }));
    }));

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
        state.selectedId = item.dataset.archiveItem;
        state.selectedComponentId = null;
        state.detailOpen = true;
        render(root, scope);
      });
      item.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (event.target.closest?.("[data-sigian-inspect]")) return;
        event.preventDefault();
        state.selectedId = item.dataset.archiveItem;
        state.selectedComponentId = null;
        state.detailOpen = true;
        render(root, scope);
      });
    });

    root.querySelectorAll("[data-archive-component-group]").forEach(button => button.addEventListener("click", () => {
      state.selectedId = button.dataset.archiveComponentGroup;
      state.detailOpen = true;
      render(root, scope);
    }));

    root.querySelectorAll("[data-formula-component]").forEach(button => button.addEventListener("click", () => {
      state.selectedComponentId = button.dataset.formulaComponent;
      state.detailOpen = true;
      render(root, scope);
    }));

    root.querySelector("[data-archive-detail-close]")?.addEventListener("click", () => closeDetail(state, root, scope));

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
      render(root, scope);
    });

    root.querySelector("[data-create-grimoire-for-formula]")?.addEventListener("click", event => {
      const grimoire = A.createSigianGrimoire?.();
      if (!grimoire) return;
      A.addFormulaToSigianGrimoire?.(grimoire.id, event.currentTarget.dataset.createGrimoireForFormula);
      state.targetGrimoireId = grimoire.id;
      state.selectedGrimoireId = grimoire.id;
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
      render(root, scope);
    }));

    root.querySelectorAll("[data-grimoire-select]").forEach(button => button.addEventListener("click", () => {
      state.selectedGrimoireId = button.dataset.grimoireSelect;
      state.targetGrimoireId = button.dataset.grimoireSelect;
      state.detailOpen = true;
      render(root, scope);
    }));

    root.querySelector("[data-grimoire-name]")?.addEventListener("change", event => {
      A.renameSigianGrimoire?.(event.currentTarget.dataset.grimoireName, event.currentTarget.value);
      render(root, scope);
    });

    root.querySelector("[data-grimoire-name]")?.addEventListener("keydown", event => {
      if (event.key === "Enter") event.currentTarget.blur();
    });

    root.querySelector("[data-grimoire-duplicate]")?.addEventListener("click", event => {
      const copy = A.duplicateSigianGrimoire?.(event.currentTarget.dataset.grimoireDuplicate);
      if (!copy) return;
      state.selectedGrimoireId = copy.id;
      state.targetGrimoireId = copy.id;
      state.grimoire.search = "";
      state.detailOpen = true;
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
      render(root, scope);
    });

    root.querySelectorAll("[data-grimoire-remove-formula]").forEach(button => button.addEventListener("click", () => {
      A.removeFormulaFromSigianGrimoire?.(button.dataset.grimoireId, button.dataset.grimoireRemoveFormula);
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

  function render(root, scope = "collection") {
    if (!root) return;
    roots.set(scope, root);
    const data = A.buildSigianArchiveData?.(scope);
    if (!data) {
      root.innerHTML = `<div class="archive-empty">${escapeHtml(t("archive.catalogUnavailable"))}</div>`;
      return;
    }

    const state = stateFor(scope);
    const grimoires = scope === "inventory" ? (A.listSigianGrimoires?.() || []) : [];
    if (!sectionIds(scope).includes(state.section)) state.section = "formulas";
    if (!grimoires.some(item => item.id === state.targetGrimoireId)) state.targetGrimoireId = grimoires[0]?.id || null;

    const content = sectionContentMarkup(data, state, grimoires);
    const title = t(scope === "inventory" ? "archive.inventory" : "archive.collection");
    const intro = t(scope === "inventory" ? "archive.inventoryIntro" : "archive.collectionIntro");

    root.innerHTML = `
      <div class="archive-browser ${state.detailOpen ? "detail-open" : ""}" data-archive-scope-root="${scope}">
        <header class="archive-heading">
          <div>
            <span class="classic-menu-kicker">${title}</span>
            <h2>${title}</h2>
            <p>${intro}</p>
          </div>
          ${scopeToggleMarkup(scope)}
        </header>

        ${scope === "inventory" ? inventoryOverviewMarkup(data, grimoires) : ""}
        ${sectionTabsMarkup(state, scope, data, grimoires)}

        <section class="archive-filters">
          ${content.filters}
          <div class="archive-count">${content.count}</div>
        </section>

        <div class="archive-layout ${state.section === "grimoires" ? "is-grimoires" : ""}">
          <main class="archive-list-panel">${content.list}</main>
          <aside class="archive-detail-panel" aria-label="${escapeHtml(t("archive.selectionDetail"))}" tabindex="-1">
            <div class="archive-detail-sheet">
              <button type="button" class="archive-detail-close" data-archive-detail-close aria-label="${escapeHtml(t("archive.closeDetails"))}">×</button>
              ${content.detail}
            </div>
          </aside>
        </div>
      </div>`;

    mountFormulaFullCards(root, data);
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
    window.addEventListener("arcane:languagechange", () => {
      roots.forEach((root, scope) => {
        if (root?.isConnected) render(root, scope);
      });
    });
  }
})(window.Arcane = window.Arcane || {});
