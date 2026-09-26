(function (A) {
  "use strict";

  const states = new Map();
  const FORMULA_PAGE_SIZE = 12;
  const SECTION_LABELS = Object.freeze({
    formulas:{ inventory:"Formule", collection:"Formule Originali" },
    sigils:{ inventory:"Sigilli", collection:"Sigilli" },
    constraints:{ inventory:"Vincoli", collection:"Vincoli" },
    grimoires:{ inventory:"Grimori", collection:"Grimori" },
    cosmetics:{ inventory:"Cosmetici", collection:"Cosmetici" }
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
    return SECTION_LABELS[id]?.[scope] || id;
  }

  function schoolOptions(includeAll = true) {
    const schools = A.SIGIAN_AFFINITY_SCHOOL_ORDER || [];
    const options = includeAll ? [{ id:"all", label:"Tutte" }] : [];
    schools.forEach(id => {
      const meta = A.sigianSchoolMeta?.(id) || { name:id, icon:"✦" };
      options.push({ id, label:`${meta.icon} ${meta.name}` });
    });
    return options;
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
        <span>Ricerca</span>
        <input type="search" data-archive-search value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">
      </label>`;
  }

  function scopeToggleMarkup(scope) {
    return `
      <div class="archive-scope-switch" role="tablist" aria-label="Archivio">
        <button type="button" data-archive-scope="inventory" class="${scope === "inventory" ? "active" : ""}" role="tab" aria-selected="${scope === "inventory"}">Inventario</button>
        <button type="button" data-archive-scope="collection" class="${scope === "collection" ? "active" : ""}" role="tab" aria-selected="${scope === "collection"}">Collezione</button>
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
      sigils:[{ id:"all", label:"Qualsiasi Sigillo" }, ...[...sigils].sort().map(name => ({ id:name, label:name }))],
      constraints:[{ id:"all", label:"Qualsiasi Vincolo" }, ...[...constraints].sort().map(name => ({ id:name, label:name }))]
    };
  }

  function formulaFiltersMarkup(data, state) {
    const options = formulaFilterOptions(data);
    return `
      <div class="archive-filter-row archive-filter-row-primary">
        ${textFilterMarkup(state.formula.search, "Cerca Formula")}
        ${selectMarkup("type", "Tipo", state.formula.type, [
          { id:"all", label:"Tutti" },
          { id:"creature", label:"Creatura" },
          { id:"spell", label:"Magia" }
        ])}
      </div>
      <details class="archive-more-filters">
        <summary>Filtri avanzati</summary>
        <div class="archive-filter-row">
          ${selectMarkup("level", "Costo / Livello", state.formula.level, [
            { id:"all", label:"Tutti" },
            ...Array.from({ length:13 }, (_, index) => ({ id:String(index + 1), label:String(index + 1) }))
          ])}
          ${selectMarkup("sigil", "Contiene Sigillo", state.formula.sigil, options.sigils)}
          ${selectMarkup("constraint", "Contiene Vincolo", state.formula.constraint, options.constraints)}
        </div>
      </details>`;
  }

  function formulaSchoolNavMarkup(state) {
    return `
      <nav class="archive-category-strip archive-school-strip" aria-label="Scuola Formula">
        ${schoolOptions(true).map(item => `
          <button type="button" data-formula-school="${escapeHtml(item.id)}" class="${state.formula.school === item.id ? "active" : ""}">
            ${escapeHtml(item.label)}
          </button>`).join("")}
      </nav>`;
  }

  function componentFiltersMarkup(state, kind) {
    const bucket = kind === "sigil" ? state.sigil : state.constraint;
    return `
      <div class="archive-filter-row archive-filter-row-primary">
        ${textFilterMarkup(bucket.search, kind === "sigil" ? "Cerca Sigillo" : "Cerca Vincolo")}
      </div>
      <details class="archive-more-filters">
        <summary>Filtri avanzati</summary>
        <div class="archive-filter-row">
          ${selectMarkup("grade", "Grado", bucket.grade, [
            { id:"all", label:"Tutti" },
            { id:"I", label:"I" },
            { id:"II", label:"II" },
            { id:"III", label:"III" },
            { id:"IV", label:"IV" },
            { id:"V", label:"V" },
            { id:"Speciale", label:"Speciale" }
          ])}
          ${selectMarkup("affinity", "Affinità", bucket.affinity, [
            { id:"all", label:"Tutte" },
            { id:"mono", label:"Mono" },
            { id:"dual", label:"Dual" },
            { id:"triple", label:"Triple" },
            { id:"universal", label:"Universale" }
          ])}
          ${selectMarkup("school", "Compatibile con", bucket.school, schoolOptions())}
          ${selectMarkup("rarity", "Rarità", "pending", [{ id:"pending", label:"In definizione" }], "disabled")}
        </div>
      </details>`;
  }

  function componentFamilyNavMarkup(groups, state, kind) {
    const bucket = kind === "sigil" ? state.sigil : state.constraint;
    const families = [...new Set(groups.map(group => group.family))].sort();
    if (!families.includes(bucket.family)) bucket.family = families[0] || null;
    return `
      <nav class="archive-category-strip archive-component-family-nav" aria-label="Categorie ${kind === "sigil" ? "Sigilli" : "Vincoli"}">
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
        ${textFilterMarkup(state.grimoire.search, "Cerca Grimorio")}
        <button type="button" class="classic-stone-button archive-new-grimoire" data-grimoire-create>＋ Nuovo Grimorio</button>
      </div>
      <p class="archive-filter-note">I Grimori vengono salvati nel browser. Le regole definitive di costruzione e l'uso diretto nei duelli verranno collegati successivamente.</p>`;
  }

  function cosmeticFiltersMarkup(state) {
    return `
      <div class="archive-filter-row">
        ${textFilterMarkup(state.cosmetic.search, "Cerca cosmetico")}
        ${selectMarkup("category", "Categoria", state.cosmetic.category, [
          { id:"all", label:"Tutte" },
          { id:"art", label:"ART" }
        ])}
        ${selectMarkup("school", "Scuola / tema", state.cosmetic.school, schoolOptions())}
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
        const haystack = [item.name, item.text, item.keyword, ...item.components.map(component => component.name)].join(" ").toLowerCase();
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
    return date.toLocaleDateString("it-IT", { day:"2-digit", month:"2-digit", year:"2-digit" });
  }

  function ownershipBadge(scope, quantity) {
    if (scope === "inventory") return `<span class="archive-quantity">×${Number(quantity || 0)}</span>`;
    return `<span class="archive-owned">Posseduto ×${Number(quantity || 0)}</span>`;
  }

  function formulaTileMarkup(item, scope, selected) {
    const school = A.sigianSchoolMeta?.(item.school) || { icon:"✦", name:item.school };
    const sigils = item.components.filter(component => component.kind === "sigil").length;
    const constraints = item.components.filter(component => component.kind === "constraint").length;
    return `
      <button type="button" class="archive-formula-tile ${selected ? "active" : ""}" data-archive-item="${escapeHtml(item.id)}">
        <span class="archive-formula-art"><img src="${escapeHtml(item.image)}" alt="" loading="lazy"></span>
        <span class="archive-formula-copy">
          <strong>${escapeHtml(item.name)}</strong>
          <small>${school.icon} ${escapeHtml(school.name)} · ${item.type === "spell" ? "Magia" : "Creatura"} · Costo ${item.level}</small>
          <em>${sigils} ${sigils === 1 ? "Sigillo" : "Sigilli"}${constraints ? ` · ${constraints} Vincolo` : ""}</em>
        </span>
        ${scope === "collection" ? '<span class="archive-owned">Posseduta</span>' : ""}
      </button>`;
  }

  function formulaPaginationMarkup(page, pageCount) {
    if (pageCount <= 1) return "";
    return `
      <nav class="archive-pagination" aria-label="Pagine Formule">
        <button type="button" data-formula-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>‹</button>
        <span>Pagina <b>${page}</b> di ${pageCount}</span>
        <button type="button" data-formula-page="${page + 1}" ${page >= pageCount ? "disabled" : ""}>›</button>
      </nav>`;
  }

  function formulaComponentMarkup(component) {
    return `
      <button type="button" class="archive-embedded-component" data-formula-component="${escapeHtml(component.id)}">
        <span aria-hidden="true">${component.kind === "constraint" ? "◇" : "✦"}</span>
        <strong>${escapeHtml(component.name)}</strong>
        <small>${component.kind === "constraint" ? "Vincolo" : "Sigillo"}</small>
      </button>`;
  }

  function formulaDetailMarkup(item, scope, selectedComponentId, grimoires = [], state = {}) {
    if (!item) return '<div class="archive-empty">Nessuna Formula corrisponde ai filtri.</div>';
    const school = A.sigianSchoolMeta?.(item.school) || { icon:"✦", name:item.school };
    const selected = item.components.find(component => component.id === selectedComponentId) || null;
    const targetId = grimoires.some(grimoire => grimoire.id === state.targetGrimoireId)
      ? state.targetGrimoireId
      : grimoires[0]?.id || null;
    const target = grimoires.find(grimoire => grimoire.id === targetId) || null;
    const alreadyPresent = Boolean(target?.formulaIds?.includes(item.id));

    return `
      <article class="archive-detail-card archive-formula-detail">
        <div class="archive-detail-art"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}"></div>
        <div class="archive-detail-heading">
          <div>
            <small>${scope === "collection" ? "FORMULA ORIGINALE" : "FORMULA POSSEDUTA"}</small>
            <h3>${escapeHtml(item.name)}</h3>
            <p>${school.icon} ${escapeHtml(school.name)} · ${item.type === "spell" ? "Magia" : "Creatura"} · Costo ${item.level}</p>
          </div>
          ${scope === "inventory" ? '<span class="archive-owned archive-owned-detail">Posseduta</span>' : ""}
        </div>
        <p class="archive-formula-text">${escapeHtml(item.text)}</p>
        ${item.type === "creature" ? `<div class="archive-stat-row"><span>⚔ <b>${item.attack}</b> Attacco</span><span>♥ <b>${item.health}</b> Vita</span></div>` : ""}
        <section class="archive-components-block">
          <div class="archive-block-heading"><strong>Composizione</strong><small>Sigilli e Vincolo della Formula</small></div>
          <div class="archive-embedded-grid">
            ${item.components.length ? item.components.map(formulaComponentMarkup).join("") : '<span class="archive-muted">Nessun Sigillo o Vincolo.</span>'}
          </div>
          ${selected ? `
            <div class="archive-component-inspector">
              <small>${selected.kind === "constraint" ? "VINCOLO" : "SIGILLO"}</small>
              <strong>${escapeHtml(selected.name)}</strong>
              <p>${escapeHtml(selected.detail)}</p>
            </div>` : ""}
        </section>
        ${scope === "inventory" ? `
          <section class="archive-grimoire-quick-add">
            <div>
              <strong>Grimorio</strong>
              <small>Aggiungi questa Formula a una composizione salvata.</small>
            </div>
            ${grimoires.length ? `
              <select data-formula-grimoire-select aria-label="Scegli Grimorio">
                ${grimoires.map(grimoire => `<option value="${escapeHtml(grimoire.id)}" ${grimoire.id === targetId ? "selected" : ""}>${escapeHtml(grimoire.name)} · ${grimoire.formulaIds.length}</option>`).join("")}
              </select>
              <button type="button" class="classic-stone-button" data-add-formula-grimoire="${escapeHtml(item.id)}" ${alreadyPresent ? "disabled" : ""}>
                ${alreadyPresent ? "Già presente" : "＋ Aggiungi"}
              </button>
            ` : `
              <button type="button" class="classic-stone-button" data-create-grimoire-for-formula="${escapeHtml(item.id)}">＋ Crea Grimorio e aggiungi</button>
            `}
          </section>
          <div class="archive-formula-actions">
            <button type="button" class="classic-stone-button" data-archive-forge="${escapeHtml(item.id)}" title="Apri questa Formula nella Forgia">⚒ <span>Forgia</span></button>
            <button type="button" class="classic-stone-button danger" disabled title="Crafting non ancora attivo">🔥 <span>Distruggi</span></button>
          </div>` : ""}
      </article>`;
  }

  function schoolListMarkup(ids) {
    if (!ids.length) return '<span class="archive-variant-chip is-neutral">Neutro</span>';
    return ids.map(id => {
      const meta = A.sigianSchoolMeta?.(id) || { icon:"✦", name:id };
      return `<span class="archive-variant-chip">${meta.icon} ${escapeHtml(meta.name)}</span>`;
    }).join("");
  }

  function gradeListMarkup(grades) {
    if (!grades.length) return '<span class="archive-variant-chip is-neutral">Senza Gradi</span>';
    return grades.map(grade => `<span class="archive-variant-chip">Grado ${escapeHtml(grade)}</span>`).join("");
  }

  function affinityModeLabel(mode) {
    return ({ mono:"Mono", dual:"Dual", triple:"Triple", universal:"Universale" })[mode] || mode;
  }

  function componentIdentityTileMarkup(group, scope, selected) {
    const copies = scope === "inventory" ? group.inventoryCopies : group.ownedCopies;
    const gradeText = group.grades.filter(value => value !== "Speciale").length
      ? `${group.grades.filter(value => value !== "Speciale").length} Gradi`
      : "Senza Gradi";
    const schoolText = group.effectSchools.length ? `${group.effectSchools.length} Scuole` : "Neutro";
    return `
      <button type="button" class="archive-component-identity ${selected ? "active" : ""}" data-archive-component-group="${escapeHtml(group.id)}">
        <span class="archive-component-symbol" aria-hidden="true">${group.kind === "constraint" ? "◇" : "✦"}</span>
        <span class="archive-component-copy">
          <strong>${escapeHtml(group.name)}</strong>
          <small>${escapeHtml(schoolText)} · ${escapeHtml(gradeText)}</small>
          <em>${group.variants.length} versioni catalogate</em>
        </span>
        ${scope === "inventory"
          ? `<span class="archive-quantity" title="Copie possedute">×${copies}</span>`
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
          const examples = [...new Set(variants.map(item => item.affinityLabel))].slice(0, 2);
          return `
            <article class="archive-affinity-card">
              <strong>${escapeHtml(affinityModeLabel(mode))}</strong>
              <span>${variants.length} ${variants.length === 1 ? "versione" : "versioni"}${scope === "inventory" ? ` · ×${copies}` : ""}</span>
              <small>${examples.map(escapeHtml).join(" · ")}</small>
            </article>`;
        }).join("")}
      </div>`;
  }

  function componentGroupDetailMarkup(group, scope) {
    if (!group) return '<div class="archive-empty">Seleziona un elemento per vederne i dettagli.</div>';
    const copies = scope === "inventory" ? group.inventoryCopies : group.ownedCopies;
    return `
      <article class="archive-detail-card archive-component-group-detail">
        <div class="archive-detail-heading">
          <div>
            <small>${group.kind === "constraint" ? "VINCOLO" : "SIGILLO"} · ${escapeHtml(group.family)}</small>
            <h3>${escapeHtml(group.name)}</h3>
          </div>
          ${scope === "inventory" ? `<span class="archive-quantity archive-detail-quantity">×${copies}</span>` : ""}
        </div>
        <p>${escapeHtml(group.summary)}</p>
        <section class="archive-variant-section">
          <div class="archive-block-heading">
            <strong>Scuole</strong>
            <small>Scuola incorporata nell'identità, quando prevista</small>
          </div>
          <div class="archive-variant-chip-row">${schoolListMarkup(group.effectSchools)}</div>
        </section>
        <section class="archive-variant-section">
          <div class="archive-block-heading">
            <strong>Gradi</strong>
            <small>Intensità disponibili per questa famiglia</small>
          </div>
          <div class="archive-variant-chip-row">${gradeListMarkup(group.grades)}</div>
        </section>
        <section class="archive-variant-section">
          <div class="archive-block-heading">
            <strong>Versioni di Affinità</strong>
            <small>Mono, Dual, Triple e Universale sono mostrate senza esplodere ogni copia nella lista principale</small>
          </div>
          ${affinitySummaryMarkup(group, scope)}
        </section>
        <p class="archive-provisional-note"><strong>Rarità:</strong> ancora in definizione. Le Affinità mostrate restano provvisorie finché non chiudiamo la matrice finale.</p>
      </article>`;
  }

  function cosmeticTileMarkup(item, scope, selected) {
    return `
      <button type="button" class="archive-cosmetic-tile ${selected ? "active" : ""}" data-archive-item="${escapeHtml(item.id)}">
        <img src="${escapeHtml(item.image)}" alt="" loading="lazy">
        <span><strong>${escapeHtml(item.name)}</strong><small>ART</small></span>
        ${ownershipBadge(scope, scope === "inventory" ? item.quantity : item.ownedQuantity)}
      </button>`;
  }

  function cosmeticDetailMarkup(item, scope) {
    if (!item) return '<div class="archive-empty">Nessun cosmetico corrisponde ai filtri.</div>';
    const school = A.sigianSchoolMeta?.(item.school) || { icon:"✦", name:item.school };
    return `
      <article class="archive-detail-card archive-cosmetic-detail">
        <div class="archive-cosmetic-preview"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}"></div>
        <div class="archive-detail-heading">
          <div><small>COSMETICO · ART</small><h3>${escapeHtml(item.name)}</h3><p>${school.icon} ${escapeHtml(school.name)}</p></div>
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
    const schoolChips = grimoireSchoolCounts(grimoire, formulas).map(([school, count]) => {
      const meta = A.sigianSchoolMeta?.(school) || { icon:"✦", name:school };
      return `<span title="${escapeHtml(meta.name)}">${meta.icon} ${count}</span>`;
    }).join("");
    return `
      <button type="button" class="archive-grimoire-tile ${selected ? "active" : ""}" data-grimoire-select="${escapeHtml(grimoire.id)}">
        <span class="archive-grimoire-icon" aria-hidden="true">📖</span>
        <span class="archive-grimoire-copy">
          <strong>${escapeHtml(grimoire.name)}</strong>
          <small>${formulaItems.length} ${formulaItems.length === 1 ? "Formula" : "Formule"} · aggiornato ${escapeHtml(formatShortDate(grimoire.updatedAt))}</small>
          <span class="archive-grimoire-schools">${schoolChips || "<em>Vuoto</em>"}</span>
        </span>
      </button>`;
  }

  function grimoireDetailMarkup(grimoire, formulas) {
    if (!grimoire) {
      return `
        <div class="archive-empty archive-grimoire-empty">
          <strong>Nessun Grimorio salvato</strong>
          <span>Crea il primo Grimorio e aggiungi le Formule direttamente dall'Inventario.</span>
          <button type="button" class="classic-stone-button" data-grimoire-create>＋ Nuovo Grimorio</button>
        </div>`;
    }
    const formulaItems = grimoireFormulaItems(grimoire, formulas);
    const schoolCounts = grimoireSchoolCounts(grimoire, formulas);
    return `
      <article class="archive-detail-card archive-grimoire-detail">
        <div class="archive-grimoire-editor-head">
          <span class="archive-grimoire-large-icon" aria-hidden="true">📖</span>
          <label>
            <span>Nome Grimorio</span>
            <input type="text" maxlength="48" value="${escapeHtml(grimoire.name)}" data-grimoire-name="${escapeHtml(grimoire.id)}">
          </label>
        </div>
        <div class="archive-grimoire-summary">
          <div><small>FORMULE</small><strong>${formulaItems.length}</strong></div>
          <div><small>SCUOLE</small><strong>${schoolCounts.length}</strong></div>
          <div><small>SALVATO</small><strong>${escapeHtml(formatShortDate(grimoire.updatedAt))}</strong></div>
        </div>
        <div class="archive-grimoire-school-breakdown">
          ${schoolCounts.length ? schoolCounts.map(([school, count]) => {
            const meta = A.sigianSchoolMeta?.(school) || { icon:"✦", name:school };
            return `<span>${meta.icon} ${escapeHtml(meta.name)} <b>${count}</b></span>`;
          }).join("") : '<span class="archive-muted">Nessuna Formula nel Grimorio.</span>'}
        </div>
        <section class="archive-grimoire-contents">
          <div class="archive-block-heading"><strong>Formule salvate</strong><small>Composizione persistente su questo dispositivo.</small></div>
          <div class="archive-grimoire-formula-grid">
            ${formulaItems.length ? formulaItems.map(formula => {
              const meta = A.sigianSchoolMeta?.(formula.school) || { icon:"✦", name:formula.school };
              return `
                <article class="archive-grimoire-formula">
                  <img src="${escapeHtml(formula.image)}" alt="" loading="lazy">
                  <span><strong>${escapeHtml(formula.name)}</strong><small>${meta.icon} ${escapeHtml(meta.name)} · Costo ${formula.level}</small></span>
                  <button type="button" data-grimoire-remove-formula="${escapeHtml(formula.id)}" data-grimoire-id="${escapeHtml(grimoire.id)}" aria-label="Rimuovi ${escapeHtml(formula.name)}">×</button>
                </article>`;
            }).join("") : '<div class="archive-empty">Questo Grimorio è vuoto.</div>'}
          </div>
        </section>
        <div class="archive-grimoire-actions">
          <button type="button" class="classic-stone-button" data-grimoire-open-formulas="${escapeHtml(grimoire.id)}">＋ Aggiungi Formule</button>
          <button type="button" class="classic-stone-button ghost" data-grimoire-duplicate="${escapeHtml(grimoire.id)}">Duplica</button>
          <button type="button" class="classic-stone-button danger" data-grimoire-delete="${escapeHtml(grimoire.id)}">Elimina</button>
        </div>
      </article>`;
  }

  function inventoryOverviewMarkup(data, grimoires) {
    const sigils = data.components.filter(item => item.kind === "sigil");
    const constraints = data.components.filter(item => item.kind === "constraint");
    const sigilCopies = sigils.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const constraintCopies = constraints.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    return `
      <section class="archive-overview" aria-label="Riepilogo Inventario">
        <button type="button" data-archive-jump="formulas"><small>Formule</small><strong>${data.formulas.length}</strong><span>possedute</span></button>
        <button type="button" data-archive-jump="sigils"><small>Sigilli</small><strong>${sigilCopies}</strong><span>copie</span></button>
        <button type="button" data-archive-jump="constraints"><small>Vincoli</small><strong>${constraintCopies}</strong><span>copie</span></button>
        <button type="button" data-archive-jump="grimoires"><small>Grimori</small><strong>${grimoires.length}</strong><span>salvati</span></button>
        <button type="button" data-archive-jump="cosmetics"><small>Cosmetici</small><strong>${data.cosmetics.length}</strong><span>posseduti</span></button>
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
        count:`${filtered.length} / ${data.formulas.length} ${data.scope === "collection" ? "Formule Originali" : "Formule"}`,
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
        count:`${filtered.length} / ${groups.length} ${kind === "sigil" ? "Sigilli" : "Vincoli"}`,
        list:`
          ${familyNav}
          <div class="archive-component-identity-grid">
            ${filtered.map(group => componentIdentityTileMarkup(group, data.scope, group.id === state.selectedId)).join("") || '<div class="archive-empty">Nessun elemento corrisponde ai filtri.</div>'}
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
        count:`${filtered.length} / ${grimoires.length} Grimori`,
        list:filtered.length
          ? `<div class="archive-grimoire-grid">${filtered.map(item => grimoireTileMarkup(item, data.formulas, item.id === state.selectedGrimoireId)).join("")}</div>`
          : '<div class="archive-empty">Nessun Grimorio corrisponde alla ricerca.</div>',
        detail:grimoireDetailMarkup(selected, data.formulas)
      };
    }

    const filtered = applyCosmeticFilters(data.cosmetics, state.cosmetic);
    if (!filtered.some(item => item.id === state.selectedId)) state.selectedId = filtered[0]?.id || null;
    const selected = filtered.find(item => item.id === state.selectedId) || null;
    return {
      filters:cosmeticFiltersMarkup(state),
      count:`${filtered.length} / ${data.cosmetics.length} cosmetici`,
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

    root.querySelectorAll("[data-archive-item]").forEach(button => button.addEventListener("click", () => {
      state.selectedId = button.dataset.archiveItem;
      state.selectedComponentId = null;
      state.detailOpen = true;
      render(root, scope);
    }));

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
      if (typeof window.confirm === "function" && !window.confirm(`Eliminare “${selected?.name || "questo Grimorio"}”?`)) return;
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

  function render(root, scope = "collection") {
    if (!root) return;
    const data = A.buildSigianArchiveData?.(scope);
    if (!data) {
      root.innerHTML = '<div class="archive-empty">Catalogo non disponibile.</div>';
      return;
    }

    const state = stateFor(scope);
    const grimoires = scope === "inventory" ? (A.listSigianGrimoires?.() || []) : [];
    if (!sectionIds(scope).includes(state.section)) state.section = "formulas";
    if (!grimoires.some(item => item.id === state.targetGrimoireId)) state.targetGrimoireId = grimoires[0]?.id || null;

    const content = sectionContentMarkup(data, state, grimoires);
    const title = scope === "inventory" ? "Inventario" : "Collezione";
    const intro = scope === "inventory"
      ? "Gestisci Formule, Sigilli, Vincoli, Grimori e Cosmetici senza perdere il punto in cui stai navigando."
      : "Consulta Formule Originali, Sigilli, Vincoli e Cosmetici attraverso categorie compatte e versioni raggruppate.";

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
          <aside class="archive-detail-panel" aria-label="Dettaglio selezione">
            <button type="button" class="archive-detail-close" data-archive-detail-close aria-label="Chiudi dettagli">×</button>
            ${content.detail}
          </aside>
        </div>
      </div>`;

    bind(root, scope, data, state);
  }

  A.SigianArchiveBrowser = Object.freeze({
    render,
    reset(scope) {
      if (scope) states.delete(scope);
      else states.clear();
    }
  });
})(window.Arcane = window.Arcane || {});
