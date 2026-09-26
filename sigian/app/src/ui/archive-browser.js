(function (A) {
  "use strict";

  const states = new Map();
  const SECTION_LABELS = Object.freeze({
    formulas:"Formule",
    components:"Sigilli & Vincoli",
    cosmetics:"Cosmetici"
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
        formula:{ search:"", school:"all", type:"all", level:"all", sigil:"all", constraint:"all" },
        component:{ search:"", kind:"all", family:"all", grade:"all", affinity:"all", school:"all", status:"all" },
        cosmetic:{ search:"", category:"all", school:"all" }
      });
    }
    return states.get(scope);
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

  function sectionTabsMarkup(state) {
    return `
      <nav class="archive-section-tabs" aria-label="Sezioni archivio">
        ${Object.entries(SECTION_LABELS).map(([id, label]) =>
          `<button type="button" data-archive-section="${id}" class="${state.section === id ? "active" : ""}">${label}</button>`
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
      <div class="archive-filter-row">
        ${textFilterMarkup(state.formula.search, "Cerca Formula")}
        ${selectMarkup("school", "Scuola", state.formula.school, schoolOptions())}
        ${selectMarkup("type", "Tipo", state.formula.type, [
          { id:"all", label:"Tutti" },
          { id:"creature", label:"Creatura" },
          { id:"spell", label:"Magia" }
        ])}
      </div>
      <details class="archive-more-filters">
        <summary>Altri filtri</summary>
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

  function componentFiltersMarkup(data, state) {
    const families = [...new Set(data.components.map(item => item.family))].sort();
    const grades = [...new Set(data.components.map(item => item.gradeLabel))].filter(Boolean);
    return `
      <div class="archive-filter-row">
        ${textFilterMarkup(state.component.search, "Cerca Sigillo o Vincolo")}
        ${selectMarkup("kind", "Tipo", state.component.kind, [
          { id:"all", label:"Sigilli + Vincoli" },
          { id:"sigil", label:"Sigilli" },
          { id:"constraint", label:"Vincoli" }
        ])}
        ${selectMarkup("family", "Famiglia", state.component.family, [
          { id:"all", label:"Tutte" },
          ...families.map(value => ({ id:value, label:value }))
        ])}
        ${selectMarkup("grade", "Grado", state.component.grade, [
          { id:"all", label:"Tutti" },
          ...grades.map(value => ({ id:value, label:value }))
        ])}
      </div>
      <details class="archive-more-filters" open>
        <summary>Affinità e disponibilità</summary>
        <div class="archive-filter-row">
          ${selectMarkup("affinity", "Affinità", state.component.affinity, [
            { id:"all", label:"Tutte" },
            { id:"mono", label:"Mono" },
            { id:"dual", label:"Dual" },
            { id:"triple", label:"Triple" },
            { id:"universal", label:"Universale" }
          ])}
          ${selectMarkup("school", "Compatibile con", state.component.school, schoolOptions())}
          ${selectMarkup("status", "Stato", state.component.status, [
            { id:"all", label:"Tutti" },
            { id:"approved", label:"OK" },
            { id:"review", label:"Da rivedere" }
          ])}
          ${selectMarkup("rarity", "Rarità", "pending", [{ id:"pending", label:"In definizione" }], "disabled title=\"La rarità verrà derivata anche dall'Affinità\"")}
        </div>
        <p class="archive-filter-note">L'Affinità è già modellata e filtrabile. Le assegnazioni attuali sono provvisorie finché non definiamo la matrice finale e la rarità.</p>
      </details>`;
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
      </div>
      <p class="archive-filter-note">Per ora il catalogo Cosmetici contiene le ART. Cornici, dorsi ed effetti visivi restano categorie predisposte ma non ancora definite.</p>`;
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

  function applyComponentFilters(items, filter) {
    const search = filter.search.trim().toLowerCase();
    return items.filter(item => {
      if (filter.kind !== "all" && item.kind !== filter.kind) return false;
      if (filter.family !== "all" && item.family !== filter.family) return false;
      if (filter.grade !== "all" && item.gradeLabel !== filter.grade) return false;
      if (filter.affinity !== "all" && item.affinity?.mode !== filter.affinity) return false;
      if (filter.school !== "all" && !(item.affinity?.schools || []).includes(filter.school)) return false;
      if (filter.status !== "all" && item.canonicalStatus !== filter.status) return false;
      if (search && !`${item.name} ${item.family} ${item.summary} ${item.affinityLabel}`.toLowerCase().includes(search)) return false;
      return true;
    });
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

  function ownershipBadge(scope, quantity) {
    if (scope === "inventory") return `<span class="archive-quantity">×${Number(quantity || 0)}</span>`;
    return `<span class="archive-owned">Posseduto ×${Number(quantity || 0)}</span>`;
  }

  function formulaTileMarkup(item, scope, selected) {
    const school = A.sigianSchoolMeta?.(item.school) || { icon:"✦", name:item.school };
    return `
      <button type="button" class="archive-formula-tile ${selected ? "active" : ""}" data-archive-item="${escapeHtml(item.id)}">
        <span class="archive-formula-art"><img src="${escapeHtml(item.image)}" alt="" loading="lazy"></span>
        <span class="archive-formula-copy">
          <strong>${escapeHtml(item.name)}</strong>
          <small>${school.icon} ${escapeHtml(school.name)} · ${item.type === "spell" ? "Magia" : "Creatura"} · ${item.level}</small>
          <em>Conversione canonica completata</em>
        </span>
        ${scope === "collection" ? '<span class="archive-owned">Posseduta</span>' : ""}
      </button>`;
  }

  function componentStyle(item) {
    const vars = A.sigianAffinityCssVars?.(item.affinity) || {};
    return `--affinity-a:${escapeHtml(vars.a || "#b6945a")};--affinity-b:${escapeHtml(vars.b || vars.a || "#b6945a")};--affinity-c:${escapeHtml(vars.c || vars.b || vars.a || "#b6945a")};`;
  }

  function componentTileMarkup(item, scope, selected) {
    const status = item.canonicalStatus === "approved" ? "OK" : "DA RIVEDERE";
    return `
      <button type="button"
        class="archive-component-tile affinity-${escapeHtml(item.affinity?.mode || "mono")} ${item.canonicalStatus === "review" ? "is-review" : ""} ${selected ? "active" : ""}"
        style="${componentStyle(item)}"
        data-archive-item="${escapeHtml(item.id)}">
        <span class="archive-component-symbol" aria-hidden="true">${item.kind === "constraint" ? "◇" : "✦"}</span>
        <span class="archive-component-copy">
          <strong>${escapeHtml(item.name)}</strong>
          <small><b>Affinità:</b> ${escapeHtml(item.affinityLabel)}</small>
          <em>${escapeHtml(item.family)} · ${escapeHtml(status)}</em>
        </span>
        ${ownershipBadge(scope, scope === "inventory" ? item.quantity : item.ownedQuantity)}
      </button>`;
  }

  function cosmeticTileMarkup(item, scope, selected) {
    return `
      <button type="button" class="archive-cosmetic-tile ${selected ? "active" : ""}" data-archive-item="${escapeHtml(item.id)}">
        <img src="${escapeHtml(item.image)}" alt="" loading="lazy">
        <span><strong>${escapeHtml(item.name)}</strong><small>ART</small></span>
        ${ownershipBadge(scope, scope === "inventory" ? item.quantity : item.ownedQuantity)}
      </button>`;
  }

  function formulaComponentMarkup(component) {
    return `
      <button type="button" class="archive-embedded-component ${component.status === "pending" ? "is-pending" : ""}" data-formula-component="${escapeHtml(component.id)}">
        <span aria-hidden="true">${component.kind === "constraint" ? "◇" : "✦"}</span>
        <strong>${escapeHtml(component.name)}</strong>
        <small>${component.kind === "constraint" ? "Vincolo" : "Sigillo"}</small>
      </button>`;
  }

  function formulaDetailMarkup(item, scope, selectedComponentId) {
    if (!item) return '<div class="archive-empty">Nessuna Formula corrisponde ai filtri.</div>';
    const school = A.sigianSchoolMeta?.(item.school) || { icon:"✦", name:item.school };
    const selected = item.components.find(component => component.id === selectedComponentId) || null;
    return `
      <article class="archive-detail-card archive-formula-detail">
        <div class="archive-detail-art"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}"></div>
        <div class="archive-detail-heading">
          <div>
            <small>FORMULA CANONICA · ORIGINALE</small>
            <h3>${escapeHtml(item.name)}</h3>
            <p>${school.icon} ${escapeHtml(school.name)} · ${item.type === "spell" ? "Magia" : "Creatura"} · Costo ${item.level}</p>
          </div>
          <span class="archive-conversion-badge">Canonica</span>
        </div>
        <p class="archive-formula-text">${escapeHtml(item.text)}</p>
        ${item.type === "creature" ? `<div class="archive-stat-row"><span>⚔ <b>${item.attack}</b> Attacco</span><span>♥ <b>${item.health}</b> Vita</span></div>` : ""}
        <section class="archive-components-block">
          <div class="archive-block-heading"><strong>Sigilli e Vincoli canonici</strong><small>Conversione canonica delle 65 Formule completata</small></div>
          <div class="archive-embedded-grid">
            ${item.components.length ? item.components.map(formulaComponentMarkup).join("") : '<span class="archive-muted">Nessun componente runtime censito.</span>'}
          </div>
          ${selected ? `
            <div class="archive-component-inspector">
              <small>${selected.kind === "constraint" ? "VINCOLO" : "SIGILLO"} · ${selected.status === "approved" ? "OK" : "IN CONVERSIONE"}</small>
              <strong>${escapeHtml(selected.name)}</strong>
              <p>${escapeHtml(selected.detail)}</p>
            </div>` : ""}
        </section>
        ${scope === "inventory" ? `
          <div class="archive-formula-actions">
            <button type="button" class="classic-stone-button" data-archive-forge="${escapeHtml(item.id)}" title="Apri questa Formula nella Forgia">⚒ <span>Forgia</span></button>
            <button type="button" class="classic-stone-button danger" disabled title="Crafting non ancora attivo">🔥 <span>Distruggi</span></button>
          </div>` : ""}
      </article>`;
  }

  function componentDetailMarkup(item, scope) {
    if (!item) return '<div class="archive-empty">Nessun Sigillo o Vincolo corrisponde ai filtri.</div>';
    const status = item.canonicalStatus === "approved" ? "OK" : "DA RIVEDERE";
    return `
      <article class="archive-detail-card archive-component-detail affinity-${escapeHtml(item.affinity?.mode || "mono")}" style="${componentStyle(item)}">
        <div class="archive-detail-heading">
          <div>
            <small>${item.kind === "constraint" ? "VINCOLO" : "SIGILLO"} · ${escapeHtml(item.family)}</small>
            <h3>${escapeHtml(item.name)}</h3>
          </div>
          <span class="archive-status-badge ${item.canonicalStatus === "review" ? "is-review" : ""}">${status}</span>
        </div>
        <p>${escapeHtml(item.summary)}</p>
        <dl class="archive-definition-grid">
          <div><dt>Grado</dt><dd>${escapeHtml(item.gradeLabel || "Speciale")}</dd></div>
          <div><dt>Affinità</dt><dd>${escapeHtml(item.affinityLabel)}</dd></div>
          <div><dt>Rarità</dt><dd>In definizione</dd></div>
          <div><dt>Disponibilità</dt><dd>${scope === "inventory" ? `×${item.quantity}` : `Posseduto ×${item.ownedQuantity}`}</dd></div>
        </dl>
        <p class="archive-provisional-note"><strong>Affinità provvisoria:</strong> il modello Mono / Dual / Triple / Universale è attivo; le combinazioni finali e la rarità verranno fissate dopo la chiusura della tassonomia.</p>
      </article>`;
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

  function groupedComponentsMarkup(items, scope, selectedId) {
    const groups = new Map();
    items.forEach(item => {
      if (!groups.has(item.family)) groups.set(item.family, []);
      groups.get(item.family).push(item);
    });
    if (!groups.size) return '<div class="archive-empty">Nessun Sigillo o Vincolo corrisponde ai filtri.</div>';
    return [...groups.entries()].map(([family, group]) => `
      <section class="archive-family-group">
        <div class="archive-family-heading"><h3>${escapeHtml(family)}</h3><span>${group.length}</span></div>
        <div class="archive-component-grid">
          ${group.map(item => componentTileMarkup(item, scope, item.id === selectedId)).join("")}
        </div>
      </section>`).join("");
  }

  function sectionContentMarkup(data, state) {
    if (state.section === "formulas") {
      const filtered = applyFormulaFilters(data.formulas, state.formula);
      if (!filtered.some(item => item.id === state.selectedId)) state.selectedId = filtered[0]?.id || null;
      const selected = filtered.find(item => item.id === state.selectedId) || null;
      return {
        filters:formulaFiltersMarkup(data, state),
        count:`${filtered.length} / ${data.formulas.length} Formule`,
        list:`<div class="archive-formula-grid">${filtered.map(item => formulaTileMarkup(item, data.scope, item.id === state.selectedId)).join("")}</div>`,
        detail:formulaDetailMarkup(selected, data.scope, state.selectedComponentId)
      };
    }

    if (state.section === "components") {
      const filtered = applyComponentFilters(data.components, state.component);
      if (!filtered.some(item => item.id === state.selectedId)) state.selectedId = filtered[0]?.id || null;
      const selected = filtered.find(item => item.id === state.selectedId) || null;
      return {
        filters:componentFiltersMarkup(data, state),
        count:`${filtered.length} / ${data.components.length} elementi`,
        list:groupedComponentsMarkup(filtered, data.scope, state.selectedId),
        detail:componentDetailMarkup(selected, data.scope)
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

  function bind(root, scope, data, state) {
    root.querySelectorAll("[data-archive-scope]").forEach(button => button.addEventListener("click", () => {
      const next = button.dataset.archiveScope;
      if (next === scope) return;
      window.dispatchEvent(new CustomEvent("sigian:archive-scope-request", { detail:{ scope:next } }));
    }));

    root.querySelectorAll("[data-archive-section]").forEach(button => button.addEventListener("click", () => {
      state.section = button.dataset.archiveSection;
      state.selectedId = null;
      state.selectedComponentId = null;
      render(root, scope);
    }));

    root.querySelectorAll("[data-archive-filter]").forEach(control => control.addEventListener("change", () => {
      const bucket = state[state.section === "formulas" ? "formula" : state.section === "components" ? "component" : "cosmetic"];
      bucket[control.dataset.archiveFilter] = control.value;
      state.selectedId = null;
      state.selectedComponentId = null;
      render(root, scope);
    }));

    root.querySelector("[data-archive-search]")?.addEventListener("input", event => {
      const bucket = state[state.section === "formulas" ? "formula" : state.section === "components" ? "component" : "cosmetic"];
      bucket.search = event.currentTarget.value;
      const caret = event.currentTarget.selectionStart ?? bucket.search.length;
      state.selectedId = null;
      state.selectedComponentId = null;
      render(root, scope);
      const next = root.querySelector("[data-archive-search]");
      if (next) {
        next.focus();
        next.setSelectionRange?.(caret, caret);
      }
    });

    root.querySelectorAll("[data-archive-item]").forEach(button => button.addEventListener("click", () => {
      state.selectedId = button.dataset.archiveItem;
      state.selectedComponentId = null;
      render(root, scope);
    }));

    root.querySelectorAll("[data-formula-component]").forEach(button => button.addEventListener("click", () => {
      state.selectedComponentId = button.dataset.formulaComponent;
      render(root, scope);
    }));

    root.querySelector("[data-archive-forge]")?.addEventListener("click", event => {
      window.dispatchEvent(new CustomEvent("sigian:inventory-forge-request", {
        detail:{ cardId:event.currentTarget.dataset.archiveForge }
      }));
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
    const content = sectionContentMarkup(data, state);
    const title = scope === "inventory" ? "Inventario" : "Collezione";
    const intro = scope === "inventory"
      ? "Tutto ciò che possiedi: Formule, Sigilli, Vincoli e Cosmetici."
      : "Consulta tutto il contenuto di SIGIAN. Il possesso è mostrato solo come informazione secondaria.";

    root.innerHTML = `
      <div class="archive-browser" data-archive-scope-root="${scope}">
        <header class="archive-heading">
          <div>
            <span class="classic-menu-kicker">${title}</span>
            <h2>${title}</h2>
            <p>${intro}</p>
          </div>
          ${scopeToggleMarkup(scope)}
        </header>
        ${sectionTabsMarkup(state)}
        <section class="archive-filters">
          ${content.filters}
          <div class="archive-count">${content.count}</div>
        </section>
        <div class="archive-layout">
          <main class="archive-list-panel">${content.list}</main>
          <aside class="archive-detail-panel">${content.detail}</aside>
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
