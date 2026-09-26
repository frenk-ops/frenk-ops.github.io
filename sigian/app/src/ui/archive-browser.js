(function (A) {
  "use strict";

  const states = new Map();
  const SECTION_LABELS = Object.freeze({
    formulas:"Formule",
    components:"Sigilli & Vincoli",
    grimoires:"Grimori",
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
        selectedGrimoireId:null,
        targetGrimoireId:null,
        formula:{ search:"", school:"all", type:"all", level:"all", sigil:"all", constraint:"all" },
        component:{ search:"", kind:"all", family:"all", grade:"all", affinity:"all", school:"all", status:"all" },
        grimoire:{ search:"" },
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

  function sectionTabsMarkup(state, scope, data, grimoires) {
    const labels = scope === "inventory"
      ? ["formulas", "components", "grimoires", "cosmetics"]
      : ["formulas", "components", "cosmetics"];
    const counts = {
      formulas:data.formulas.length,
      components:data.components.length,
      grimoires:grimoires.length,
      cosmetics:data.cosmetics.length
    };
    return `
      <nav class="archive-section-tabs" aria-label="Sezioni archivio">
        ${labels.map(id =>
          `<button type="button" data-archive-section="${id}" class="${state.section === id ? "active" : ""}">
            <span>${SECTION_LABELS[id]}</span><small>${counts[id]}</small>
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

  function grimoireFiltersMarkup(state) {
    return `
      <div class="archive-grimoire-filterbar">
        ${textFilterMarkup(state.grimoire.search, "Cerca Grimorio")}
        <button type="button" class="classic-stone-button archive-new-grimoire" data-grimoire-create>＋ Nuovo Grimorio</button>
      </div>
      <p class="archive-filter-note">I Grimori vengono salvati nel browser. Per ora conservano la composizione; i vincoli di legalità e l'uso diretto nei duelli verranno collegati in un passaggio dedicato.</p>`;
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

  function formatShortDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("it-IT", { day:"2-digit", month:"2-digit", year:"2-digit" });
  }

  function applyGrimoireFilters(items, filter) {
    const search = String(filter?.search || "").trim().toLowerCase();
    if (!search) return items;
    return items.filter(item => item.name.toLowerCase().includes(search));
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

  function formulaDetailMarkup(item, scope, selectedComponentId, grimoires = [], state = {}) {
    if (!item) return '<div class="archive-empty">Nessuna Formula corrisponde ai filtri.</div>';
    const school = A.sigianSchoolMeta?.(item.school) || { icon:"✦", name:item.school };
    const selected = item.components.find(component => component.id === selectedComponentId) || null;
    const targetId = grimoires.some(item => item.id === state.targetGrimoireId)
      ? state.targetGrimoireId
      : grimoires[0]?.id || null;
    const target = grimoires.find(grimoire => grimoire.id === targetId) || null;
    const alreadyPresent = Boolean(target?.formulaIds?.includes(item.id));
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
          <div class="archive-block-heading"><strong>Sigilli e Vincoli canonici</strong><small>Composizione della Formula</small></div>
          <div class="archive-embedded-grid">
            ${item.components.length ? item.components.map(formulaComponentMarkup).join("") : '<span class="archive-muted">Nessun componente canonico censito.</span>'}
          </div>
          ${selected ? `
            <div class="archive-component-inspector">
              <small>${selected.kind === "constraint" ? "VINCOLO" : "SIGILLO"} · ${selected.status === "approved" ? "OK" : "IN CONVERSIONE"}</small>
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
          <div class="archive-block-heading">
            <strong>Formule salvate</strong>
            <small>La composizione è persistente su questo dispositivo.</small>
          </div>
          <div class="archive-grimoire-formula-grid">
            ${formulaItems.length ? formulaItems.map(formula => {
              const meta = A.sigianSchoolMeta?.(formula.school) || { icon:"✦", name:formula.school };
              return `
                <article class="archive-grimoire-formula">
                  <img src="${escapeHtml(formula.image)}" alt="" loading="lazy">
                  <span>
                    <strong>${escapeHtml(formula.name)}</strong>
                    <small>${meta.icon} ${escapeHtml(meta.name)} · Costo ${formula.level}</small>
                  </span>
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
        <p class="archive-provisional-note"><strong>Nota:</strong> il Grimorio viene già salvato e modificato dall'Inventario. Le regole definitive di costruzione e l'uso diretto nei duelli verranno applicati quando chiudiamo il sistema Grimori.</p>
      </article>`;
  }

  function inventoryOverviewMarkup(data, grimoires) {
    const componentCopies = data.components.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const cosmeticCopies = data.cosmetics.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    return `
      <section class="archive-overview" aria-label="Riepilogo Inventario">
        <button type="button" data-archive-jump="formulas"><small>Formule</small><strong>${data.formulas.length}</strong><span>possedute</span></button>
        <button type="button" data-archive-jump="components"><small>Sigilli & Vincoli</small><strong>${componentCopies}</strong><span>copie</span></button>
        <button type="button" data-archive-jump="grimoires"><small>Grimori</small><strong>${grimoires.length}</strong><span>salvati</span></button>
        <button type="button" data-archive-jump="cosmetics"><small>Cosmetici</small><strong>${cosmeticCopies}</strong><span>posseduti</span></button>
      </section>`;
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

  function sectionContentMarkup(data, state, grimoires) {
    if (state.section === "formulas") {
      const filtered = applyFormulaFilters(data.formulas, state.formula);
      if (!filtered.some(item => item.id === state.selectedId)) state.selectedId = filtered[0]?.id || null;
      const selected = filtered.find(item => item.id === state.selectedId) || null;
      return {
        filters:formulaFiltersMarkup(data, state),
        count:`${filtered.length} / ${data.formulas.length} Formule`,
        list:`<div class="archive-formula-grid">${filtered.map(item => formulaTileMarkup(item, data.scope, item.id === state.selectedId)).join("")}</div>`,
        detail:formulaDetailMarkup(selected, data.scope, state.selectedComponentId, grimoires, state)
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

    if (state.section === "grimoires" && data.scope === "inventory") {
      const filtered = applyGrimoireFilters(grimoires, state.grimoire);
      if (!filtered.some(item => item.id === state.selectedGrimoireId)) {
        state.selectedGrimoireId = filtered[0]?.id || null;
      }
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
    if (state.section === "components") return state.component;
    if (state.section === "grimoires") return state.grimoire;
    return state.cosmetic;
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
      render(root, scope);
    }));

    root.querySelectorAll("[data-archive-filter]").forEach(control => control.addEventListener("change", () => {
      const bucket = filterBucket(state);
      bucket[control.dataset.archiveFilter] = control.value;
      state.selectedId = null;
      state.selectedComponentId = null;
      render(root, scope);
    }));

    root.querySelector("[data-archive-search]")?.addEventListener("input", event => {
      const bucket = filterBucket(state);
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
      render(root, scope);
    }));

    root.querySelectorAll("[data-grimoire-select]").forEach(button => button.addEventListener("click", () => {
      state.selectedGrimoireId = button.dataset.grimoireSelect;
      state.targetGrimoireId = button.dataset.grimoireSelect;
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
      render(root, scope);
    });

    root.querySelector("[data-grimoire-delete]")?.addEventListener("click", event => {
      const id = event.currentTarget.dataset.grimoireDelete;
      const selected = A.getSigianGrimoire?.(id);
      if (typeof window.confirm === "function" && !window.confirm(`Eliminare “${selected?.name || "questo Grimorio"}”?`)) return;
      A.deleteSigianGrimoire?.(id);
      state.selectedGrimoireId = null;
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
      state.selectedId = null;
      state.selectedComponentId = null;
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
    if (scope !== "inventory" && state.section === "grimoires") state.section = "formulas";
    if (!grimoires.some(item => item.id === state.targetGrimoireId)) state.targetGrimoireId = grimoires[0]?.id || null;
    const content = sectionContentMarkup(data, state, grimoires);
    const title = scope === "inventory" ? "Inventario" : "Collezione";
    const intro = scope === "inventory"
      ? "Gestisci ciò che possiedi, costruisci i tuoi Grimori e accedi rapidamente a Formule, Sigilli, Vincoli e Cosmetici."
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
        ${scope === "inventory" ? inventoryOverviewMarkup(data, grimoires) : ""}
        ${sectionTabsMarkup(state, scope, data, grimoires)}
        <section class="archive-filters">
          ${content.filters}
          <div class="archive-count">${content.count}</div>
        </section>
        <div class="archive-layout ${state.section === "grimoires" ? "is-grimoires" : ""}">
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
