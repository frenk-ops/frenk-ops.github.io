(function (A) {
  "use strict";

  const SCHOOL_GLYPHS = Object.freeze({
    fire: "🔥",
    water: "💧",
    air: "◌",
    earth: "◆",
    death: "☠"
  });

  const SIGIL_GLYPHS = Object.freeze({
    damage: "✦",
    wave: "≋",
    backlash: "↯",
    retaliation: "⚔",
    heal: "✚",
    restoration: "❈",
    regeneration: "♨",
    infusion: "✧",
    subtraction: "−",
    channeling: "⌁",
    erosion: "⌇",
    tribute: "◇",
    protection: "⬡",
    "arcane-amplification": "✺"
  });

  const SIGIL_NAMES = Object.freeze({
    damage: "Danno",
    wave: "Onda",
    backlash: "Contraccolpo",
    retaliation: "Ritorsione",
    heal: "Cura",
    restoration: "Restaurazione",
    regeneration: "Rigenerazione",
    infusion: "Infusione",
    subtraction: "Sottrazione",
    channeling: "Canalizzazione",
    erosion: "Erosione",
    tribute: "Tributo",
    protection: "Protezione",
    "arcane-amplification": "Amplificazione Arcana"
  });

  const SIGIL_DESCRIPTIONS = Object.freeze({
    damage: "Infligge danno al bersaglio configurato quando il Sigillo si attiva.",
    wave: "Propaga danno a più creature secondo portata e modificatori scelti.",
    backlash: "Converte una condizione della Formula in danno rivolto al proprio Incantatore.",
    retaliation: "Reagisce a un attacco o a un danno ricevuto colpendo la fonte dell'evento.",
    heal: "Ripristina Vita al bersaglio configurato quando il Sigillo si attiva.",
    restoration: "Distribuisce cura su più creature alleate.",
    regeneration: "Rigenera la creatura che porta il Sigillo durante il combattimento.",
    infusion: "Aumenta uno o più Poteri della scuola scelta.",
    subtraction: "Riduce uno o più Poteri secondo la configurazione del Sigillo.",
    channeling: "Genera Potere mentre la creatura resta in campo.",
    erosion: "Erode progressivamente uno o più Poteri.",
    tribute: "Consuma Potere come parte dell'effetto della Formula.",
    protection: "Riduce o attenua il danno subito dal bersaglio protetto.",
    "arcane-amplification": "Amplifica una componente della Formula secondo le condizioni configurate."
  });

  const MODIFIER_NAMES = Object.freeze({
    "scale-power-half": "½ Potere",
    "scale-power": "Potere",
    "scale-power-double": "2× Potere",
    "scale-target-attack": "Attacco bersaglio",
    "scale-full-health": "Vita piena",
    "scale-creature-count": "Numero creature",
    "scale-damage-dealt": "Danno inflitto",
    "activation-power-threshold": "Soglia Potere",
    "activation-power-comparison": "Confronto Potere",
    "activation-critical-life": "Vita critica",
    "activation-on-any-death": "Alla morte",
    "constraint-friendly-fire": "Fuoco amico",
    "constraint-friendly-fire-power-threshold": "Fuoco amico con soglia",
    "selector-highest-life": "Vita più alta",
    "selector-highest-attack": "Attacco più alto"
  });

  const state = {
    session: null,
    artCardId: "",
    cost: null,
    modal: null,
    imprintSlotId: null,
    breakSlotId: null,
    tiltX: 6,
    tiltY: -9,
    tiltZ: -2,
    depth: 42,
    atmosphere: true
  };

  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[char]);

  function labelId(value) {
    const id = String(value || "");
    if (MODIFIER_NAMES[id]) return MODIFIER_NAMES[id];
    return id
      .replace(/^activation-/, "")
      .replace(/^constraint-/, "")
      .replace(/^selector-/, "")
      .replace(/^scale-/, "")
      .replaceAll("-", " ")
      .replace(/\b\w/g, match => match.toUpperCase());
  }

  function schoolLabel(id) {
    const school = A.getSigianSchool?.(id);
    return school?.name || String(id || "");
  }

  function schoolGlyph(id) {
    return A.getSigianSchool?.(id)?.icon || SCHOOL_GLYPHS[id] || "✦";
  }

  function sigilName(id) {
    return SIGIL_NAMES[id] || labelId(id);
  }

  function sigilGlyph(id) {
    return SIGIL_GLYPHS[id] || "◈";
  }

  function cards() {
    return A.RAW_CARD_SETS?.["astral-original"] || [];
  }

  function activeSchools() {
    return A.listSigianSchools?.({ status: "active" }) || [];
  }

  function activeSigils() {
    return A.listCanonicalSigils?.({ status: "active" }) || [];
  }

  function ensureSession() {
    if (state.session) return state.session;
    const draft = A.loadSigianForgeDraft?.();
    state.session = A.createSigianForgeSession?.({ draft: draft || undefined }) || null;
    return state.session;
  }

  function changed() {
    window.dispatchEvent(new CustomEvent("sigian:forge-draft-updated"));
  }

  function mutate(fn) {
    const result = fn();
    changed();
    return result;
  }

  function selectedArtCard(recipe) {
    const set = cards();
    let card = set.find(item => item.id === state.artCardId) || null;
    if (!card) {
      card = set.find(item => item.school === recipe.school && item.type === recipe.type)
        || set.find(item => item.school === recipe.school)
        || set[0]
        || null;
      state.artCardId = card?.id || "";
    }
    return card;
  }

  function artUrl(card) {
    return card ? "assets/cards/remastered/" + card.id + ".png" : "";
  }

  function geometryStyle() {
    const depth = Math.max(0, Math.min(50, Number(state.depth || 0)));
    const px = multiplier => Math.round(depth * multiplier);
    return [
      "--lab-tilt-x:" + Number(state.tiltX || 0) + "deg",
      "--lab-tilt-y:" + Number(state.tiltY || 0) + "deg",
      "--lab-tilt-z:" + Number(state.tiltZ || 0) + "deg",
      "--lab-art-z:" + px(.45) + "px",
      "--lab-ui-z:" + px(.78) + "px",
      "--lab-name-z:" + px(.98) + "px",
      "--lab-sigil-z:" + px(1.16) + "px"
    ].join(";");
  }

  function currentModifierForFamily(sigil, family) {
    return (sigil.modifiers || []).find(item => A.getSigianAdvancedModifier?.(item.id)?.family === family) || null;
  }

  function compactModifierMarkup(sigil) {
    const grade = Number(sigil.grade || 1);
    const chips = ['<span class="forge-lab-chip grade">Grado ' + grade + '</span>'];
    (sigil.modifiers || []).slice(0, 2).forEach(modifier => {
      chips.push('<span class="forge-lab-chip">' + escapeHtml(labelId(modifier.id)) + '</span>');
    });
    return chips.join("");
  }

  function sigilRowsMarkup(recipe) {
    const max = A.SIGIAN_MAX_PRIMARY_SIGILS || 3;
    const rows = [];
    for (let index = 0; index < max; index += 1) {
      const sigil = recipe.sigils[index] || null;
      if (!sigil) {
        rows.push(
          '<div class="forge-lab-sigil-row is-empty">' +
            '<button type="button" class="forge-lab-empty-sigil" data-lab-add-empty="' + index + '">' +
              '<span>＋</span><small>Imprimi Sigillo</small>' +
            '</button>' +
          '</div>'
        );
        continue;
      }
      const imprint = state.imprintSlotId === sigil.slotId ? " is-imprinting" : "";
      const breaking = state.breakSlotId === sigil.slotId ? " is-breaking" : "";
      rows.push(
        '<div class="forge-lab-sigil-row' + imprint + breaking + '" data-lab-row="' + escapeHtml(sigil.slotId) + '">' +
          '<button type="button" class="forge-lab-cycle" data-lab-sigil-step="-1" data-lab-slot="' + escapeHtml(sigil.slotId) + '" aria-label="Sigillo precedente">‹</button>' +
          '<button type="button" class="forge-lab-sigil-mark" data-lab-sigil="' + escapeHtml(sigil.slotId) + '">' +
            '<span class="forge-lab-sigil-emblem" aria-hidden="true">' + escapeHtml(sigilGlyph(sigil.sigilId)) + '</span>' +
            '<span class="forge-lab-sigil-copy">' +
              '<strong>' + escapeHtml(sigilName(sigil.sigilId)) + '</strong>' +
              '<span class="forge-lab-chip-row">' + compactModifierMarkup(sigil) + '</span>' +
            '</span>' +
          '</button>' +
          '<button type="button" class="forge-lab-cycle" data-lab-sigil-step="1" data-lab-slot="' + escapeHtml(sigil.slotId) + '" aria-label="Sigillo successivo">›</button>' +
        '</div>'
      );
    }
    return rows.join("");
  }

  function cardMarkup(recipe) {
    const art = selectedArtCard(recipe);
    const name = recipe.presentation?.name || "Nuova Formula";
    const cost = state.cost == null ? "—" : String(state.cost);
    const stats = recipe.stats || {};
    const longName = name.length > 34 ? " is-very-long" : name.length > 22 ? " is-long" : "";
    return (
      '<div class="forge-lab-card-shell">' +
        '<button type="button" class="forge-lab-art-arrow is-prev" data-lab-art-step="-1" aria-label="Illustrazione precedente">‹</button>' +
        '<article class="forge-lab-card school-' + escapeHtml(recipe.school) + ' type-' + escapeHtml(recipe.type) + (state.atmosphere ? "" : " no-atmosphere") + '" style="' + geometryStyle() + '">' +
          '<div class="forge-lab-card-frame" aria-hidden="true"><span></span></div>' +
          '<div class="forge-lab-card-aura" aria-hidden="true"><i></i><i></i><i></i></div>' +
          '<button type="button" class="forge-lab-art-layer" data-lab-open="art" aria-label="Scegli illustrazione">' +
            (art ? '<img src="' + escapeHtml(artUrl(art)) + '" alt="' + escapeHtml(art.name) + '">' : '<span class="forge-lab-art-fallback">✦</span>') +
          '</button>' +
          '<button type="button" class="forge-lab-cost" data-lab-open="cost"><small>COSTO</small><strong>' + escapeHtml(cost) + '</strong></button>' +
          '<button type="button" class="forge-lab-type" data-lab-open="type">' + (recipe.type === "spell" ? "MAGIA" : "CREATURA") + '</button>' +
          '<button type="button" class="forge-lab-school" data-lab-open="school" aria-label="Modifica scuola">' +
            '<span class="forge-lab-school-glyph" aria-hidden="true">' + escapeHtml(schoolGlyph(recipe.school)) + '</span>' +
            '<small>' + escapeHtml(schoolLabel(recipe.school)) + '</small>' +
          '</button>' +
          '<button type="button" class="forge-lab-nameplate' + longName + '" data-lab-open="name"><span>' + escapeHtml(name) + '</span></button>' +
          (recipe.type === "creature"
            ? '<div class="forge-lab-stats">' +
                '<button type="button" class="forge-lab-stat attack" data-lab-open="stats"><span aria-hidden="true">⚔</span><strong>' + escapeHtml(stats.attack ?? 0) + '</strong></button>' +
                '<button type="button" class="forge-lab-stat health" data-lab-open="stats"><span aria-hidden="true">♥</span><strong>' + escapeHtml(stats.health ?? 1) + '</strong></button>' +
              '</div>'
            : "") +
          '<section class="forge-lab-sigils" aria-label="Sigilli">' + sigilRowsMarkup(recipe) + '</section>' +
        '</article>' +
        '<button type="button" class="forge-lab-art-arrow is-next" data-lab-art-step="1" aria-label="Illustrazione successiva">›</button>' +
      '</div>'
    );
  }

  function modalShell(body, extraClass = "") {
    return (
      '<div class="forge-lab-modal-layer" data-lab-modal-layer>' +
        '<section class="forge-lab-modal ' + extraClass + '" role="dialog" aria-modal="true">' +
          '<button type="button" class="forge-lab-modal-close" data-lab-close aria-label="Chiudi">×</button>' +
          body +
        '</section>' +
      '</div>'
    );
  }

  function modalHeading(kicker, title, copy) {
    return (
      '<div class="forge-lab-modal-copy">' +
        '<span class="classic-menu-kicker">' + escapeHtml(kicker) + '</span>' +
        '<h3>' + escapeHtml(title) + '</h3>' +
        (copy ? '<p>' + escapeHtml(copy) + '</p>' : "") +
      '</div>'
    );
  }

  function artPickerMarkup(recipe) {
    return modalShell(
      modalHeading("Illustrazione", "Scegli la full art", "La Forgia mantiene l'immagine intera: nessun crop aggressivo.") +
      '<div class="forge-lab-art-grid">' +
        cards().map(card =>
          '<button type="button" class="forge-lab-art-choice ' + (card.id === state.artCardId ? "is-selected" : "") + '" data-lab-art-card="' + escapeHtml(card.id) + '">' +
            '<img src="' + escapeHtml(artUrl(card)) + '" alt="' + escapeHtml(card.name) + '">' +
            '<small>' + escapeHtml(card.name) + '</small>' +
          '</button>'
        ).join("") +
      '</div>',
      "is-wide"
    );
  }

  function schoolPickerMarkup(recipe) {
    return modalShell(
      modalHeading("Scuola", "Risonanza della Formula", "La scuola cambia simbolo, bordo e aura della carta.") +
      '<div class="forge-lab-school-picker">' +
        activeSchools().map(school =>
          '<button type="button" class="forge-lab-school-choice school-' + escapeHtml(school.id) + ' ' + (school.id === recipe.school ? "is-selected" : "") + '" data-lab-school="' + escapeHtml(school.id) + '">' +
            '<span aria-hidden="true">' + escapeHtml(schoolGlyph(school.id)) + '</span><strong>' + escapeHtml(schoolLabel(school.id)) + '</strong>' +
          '</button>'
        ).join("") +
      '</div>'
    );
  }

  function sigilPickerMarkup(recipe, slotId = null) {
    const replace = Boolean(slotId);
    const current = replace ? recipe.sigils.find(item => item.slotId === slotId) : null;
    return modalShell(
      modalHeading("Sigilli Arcani", replace ? "Sostituisci Sigillo" : "Imprimi un Sigillo", "Scegli il marchio da incidere sulla Formula.") +
      '<div class="forge-lab-sigil-picker">' +
        activeSigils().map(definition =>
          '<button type="button" class="forge-lab-sigil-choice ' + (current?.sigilId === definition.id ? "is-selected" : "") + '" ' +
            (replace ? 'data-lab-replace-sigil="' : 'data-lab-add-sigil="') + escapeHtml(definition.id) + '"' +
            (replace ? ' data-lab-slot="' + escapeHtml(slotId) + '"' : "") + '>' +
            '<span aria-hidden="true">' + escapeHtml(sigilGlyph(definition.id)) + '</span>' +
            '<strong>' + escapeHtml(sigilName(definition.id)) + '</strong>' +
            '<small>' + escapeHtml(labelId(definition.family || "arcano")) + '</small>' +
          '</button>'
        ).join("") +
      '</div>',
      "is-wide"
    );
  }

  function schemaOptions(schema, value, key) {
    if (Array.isArray(schema)) {
      return '<select data-lab-config="' + escapeHtml(key) + '">' +
        schema.map(option => '<option value="' + escapeHtml(option) + '" ' + (String(option) === String(value) ? "selected" : "") + '>' + escapeHtml(labelId(option)) + '</option>').join("") +
      '</select>';
    }
    if (schema === "school") {
      return '<select data-lab-config="' + escapeHtml(key) + '">' +
        activeSchools().map(school => '<option value="' + escapeHtml(school.id) + '" ' + (school.id === value ? "selected" : "") + '>' + escapeHtml(schoolLabel(school.id)) + '</option>').join("") +
      '</select>';
    }
    if (schema === "schools") {
      const selected = value === "all" ? ["all"] : Array.isArray(value) ? value : [];
      return '<div class="forge-lab-school-multi" data-lab-schools-config="' + escapeHtml(key) + '">' +
        '<label><input type="checkbox" value="all" ' + (selected.includes("all") ? "checked" : "") + '> Tutte</label>' +
        activeSchools().map(school => '<label><input type="checkbox" value="' + escapeHtml(school.id) + '" ' + (selected.includes(school.id) ? "checked" : "") + ' ' + (selected.includes("all") ? "disabled" : "") + '> ' + escapeHtml(schoolLabel(school.id)) + '</label>').join("") +
      '</div>';
    }
    return '<input data-lab-config="' + escapeHtml(key) + '" type="number" value="' + escapeHtml(value ?? 0) + '">';
  }

  function modifierParamControl(modifier, key, schema, value) {
    const attrs = ' data-lab-modifier-param="' + escapeHtml(key) + '" data-lab-modifier-family="' + escapeHtml(A.getSigianAdvancedModifier?.(modifier.id)?.family || "") + '"';
    if (Array.isArray(schema)) {
      return '<select' + attrs + '>' + schema.map(option => '<option value="' + escapeHtml(option) + '" ' + (String(option) === String(value) ? "selected" : "") + '>' + escapeHtml(labelId(option)) + '</option>').join("") + '</select>';
    }
    if (schema === "school") {
      return '<select' + attrs + '>' + activeSchools().map(school => '<option value="' + escapeHtml(school.id) + '" ' + (school.id === value ? "selected" : "") + '>' + escapeHtml(schoolLabel(school.id)) + '</option>').join("") + '</select>';
    }
    return '<input' + attrs + ' type="number" value="' + escapeHtml(value ?? 0) + '">';
  }

  function sigilEditorMarkup(recipe, slotId) {
    const sigil = recipe.sigils.find(item => item.slotId === slotId);
    if (!sigil) return sigilPickerMarkup(recipe);
    const definition = A.getCanonicalSigil?.(sigil.sigilId) || {};
    const configFields = Object.entries(definition.configSchema || {}).map(([key, schema]) =>
      '<label class="forge-lab-field"><span>' + escapeHtml(labelId(key)) + '</span>' + schemaOptions(schema, sigil.config?.[key], key) + '</label>'
    ).join("");

    const modifierFields = (definition.modifierFamilies || []).map(family => {
      const current = currentModifierForFamily(sigil, family);
      const required = (definition.requiredModifierFamilies || []).includes(family);
      const options = definition.modifierOptions?.[family] || [];
      const select =
        '<select data-lab-modifier-family="' + escapeHtml(family) + '">' +
          (required ? "" : '<option value="">Nessuno</option>') +
          options.map(id => '<option value="' + escapeHtml(id) + '" ' + (current?.id === id ? "selected" : "") + '>' + escapeHtml(labelId(id)) + '</option>').join("") +
        '</select>';
      let params = "";
      if (current) {
        const modifierDefinition = A.getSigianAdvancedModifier?.(current.id);
        params = Object.entries(modifierDefinition?.paramsSchema || {}).map(([key, schema]) =>
          '<label class="forge-lab-subfield"><span>' + escapeHtml(labelId(key)) + '</span>' + modifierParamControl(current, key, schema, current.params?.[key]) + '</label>'
        ).join("");
      }
      return '<div class="forge-lab-modifier-editor"><label class="forge-lab-field"><span>' + escapeHtml(labelId(family)) + '</span>' + select + '</label>' + params + '</div>';
    }).join("");

    return modalShell(
      '<div class="forge-lab-sigil-editor-heading">' +
        '<span class="forge-lab-editor-glyph" aria-hidden="true">' + escapeHtml(sigilGlyph(sigil.sigilId)) + '</span>' +
        modalHeading("Modifica Sigillo", sigilName(sigil.sigilId), SIGIL_DESCRIPTIONS[sigil.sigilId] || "Configura il Sigillo e i suoi modificatori.") +
      '</div>' +
      '<div class="forge-lab-editor-grid">' +
        '<label class="forge-lab-field"><span>Grado</span><select data-lab-grade><option value="1" ' + (Number(sigil.grade) === 1 ? "selected" : "") + '>I</option><option value="2" ' + (Number(sigil.grade) === 2 ? "selected" : "") + '>II</option><option value="3" ' + (Number(sigil.grade) === 3 ? "selected" : "") + '>III</option></select></label>' +
        configFields +
      '</div>' +
      (modifierFields ? '<h4>Modificatori</h4><div class="forge-lab-modifier-list">' + modifierFields + '</div>' : "") +
      '<div class="forge-lab-editor-actions">' +
        '<button type="button" class="classic-stone-button ghost" data-lab-open-picker="' + escapeHtml(slotId) + '">Cambia Sigillo</button>' +
        '<button type="button" class="classic-stone-button danger" data-lab-remove-sigil="' + escapeHtml(slotId) + '">Spezza / dissolvi</button>' +
      '</div>',
      "is-editor"
    );
  }

  function sigilDetailMarkup(recipe, slotId) {
    const sigil = recipe.sigils.find(item => item.slotId === slotId);
    if (!sigil) return "";
    const config = Object.entries(sigil.config || {}).map(([key, value]) =>
      '<span><small>' + escapeHtml(labelId(key)) + '</small><strong>' + escapeHtml(Array.isArray(value) ? value.map(schoolLabel).join(", ") : value === "all" ? "Tutte" : labelId(value)) + '</strong></span>'
    ).join("");
    const modifiers = (sigil.modifiers || []).map(item => '<span class="forge-lab-chip">' + escapeHtml(labelId(item.id)) + '</span>').join("");
    return modalShell(
      '<div class="forge-lab-sigil-detail">' +
        '<span class="forge-lab-detail-glyph" aria-hidden="true">' + escapeHtml(sigilGlyph(sigil.sigilId)) + '</span>' +
        modalHeading("Dettaglio Sigillo", sigilName(sigil.sigilId), SIGIL_DESCRIPTIONS[sigil.sigilId] || "Effetto canonico della Formula.") +
        '<div class="forge-lab-detail-meta"><span><small>Grado</small><strong>' + escapeHtml(sigil.grade || 1) + '</strong></span>' + config + '</div>' +
        '<div class="forge-lab-chip-row">' + (modifiers || '<span class="forge-lab-chip">Nessun modificatore</span>') + '</div>' +
        '<p class="forge-lab-hold-note">Pressione lunga: dettaglio · tocco breve: modifica</p>' +
      '</div>'
    );
  }

  function modalMarkup(recipe) {
    const modal = state.modal;
    if (!modal) return "";
    if (modal.type === "art") return artPickerMarkup(recipe);
    if (modal.type === "school") return schoolPickerMarkup(recipe);
    if (modal.type === "sigil-add") return sigilPickerMarkup(recipe);
    if (modal.type === "sigil-picker") return sigilPickerMarkup(recipe, modal.slotId);
    if (modal.type === "sigil-edit") return sigilEditorMarkup(recipe, modal.slotId);
    if (modal.type === "sigil-detail") return sigilDetailMarkup(recipe, modal.slotId);
    if (modal.type === "name") {
      return modalShell(
        '<form class="forge-lab-simple-editor" data-lab-name-form>' +
          modalHeading("Nome", "Rinomina la Formula", "Il nome resta completo e può andare su due righe.") +
          '<label>Nome completo<input name="name" maxlength="48" value="' + escapeHtml(recipe.presentation?.name || "") + '" autofocus></label>' +
          '<button class="classic-stone-button" type="submit">Applica</button>' +
        '</form>'
      );
    }
    if (modal.type === "cost") {
      return modalShell(
        '<form class="forge-lab-simple-editor" data-lab-cost-form>' +
          modalHeading("Costo", "Costo di anteprima", "Il pricing reale non viene modificato da UI Lab.") +
          '<label>Costo<input name="cost" type="number" min="0" max="30" value="' + escapeHtml(state.cost ?? 0) + '"></label>' +
          '<div class="forge-lab-editor-actions"><button class="classic-stone-button" type="submit">Applica</button><button class="classic-stone-button ghost" type="button" data-lab-clear-cost>Non definito</button></div>' +
        '</form>'
      );
    }
    if (modal.type === "type") {
      return modalShell(
        '<div class="forge-lab-simple-editor">' +
          modalHeading("Tipo", "Tipo di Formula", "Il cambio usa la sessione Forge reale.") +
          '<div class="forge-lab-type-picker"><button type="button" data-lab-type="creature" class="' + (recipe.type === "creature" ? "is-selected" : "") + '">Creatura</button><button type="button" data-lab-type="spell" class="' + (recipe.type === "spell" ? "is-selected" : "") + '">Magia</button></div>' +
        '</div>'
      );
    }
    if (modal.type === "stats") {
      return modalShell(
        '<form class="forge-lab-simple-editor" data-lab-stats-form>' +
          modalHeading("Statistiche", "Attacco e Vita", "I valori vengono salvati nel draft Forge.") +
          '<div class="forge-lab-stat-editor"><label>Attacco<input name="attack" type="number" min="0" max="99" value="' + escapeHtml(recipe.stats?.attack ?? 0) + '"></label><label>Vita<input name="health" type="number" min="1" max="99" value="' + escapeHtml(recipe.stats?.health ?? 1) + '"></label></div>' +
          '<button class="classic-stone-button" type="submit">Applica</button>' +
        '</form>'
      );
    }
    return "";
  }

  function tuningMarkup() {
    return (
      '<section class="forge-lab-tuning" aria-label="Regolazione 2.5D">' +
        '<div class="forge-lab-tuning-heading"><div><span class="classic-menu-kicker">Regolazione</span><h3>Profondità 2.5D</h3></div><span class="forge-lab-tech-badge">CSS 3D · DOM</span></div>' +
        '<div class="forge-lab-tuning-grid">' +
          '<label>Indietro <output data-lab-output="tiltX">' + state.tiltX + '°</output><input type="range" min="-2" max="10" step="1" value="' + state.tiltX + '" data-lab-tuning="tiltX"></label>' +
          '<label>Sinistra / destra <output data-lab-output="tiltY">' + state.tiltY + '°</output><input type="range" min="-14" max="6" step="1" value="' + state.tiltY + '" data-lab-tuning="tiltY"></label>' +
          '<label>Rotazione <output data-lab-output="tiltZ">' + state.tiltZ + '°</output><input type="range" min="-5" max="4" step="1" value="' + state.tiltZ + '" data-lab-tuning="tiltZ"></label>' +
          '<label>Distacco layer <output data-lab-output="depth">' + state.depth + 'px</output><input type="range" min="0" max="50" step="2" value="' + state.depth + '" data-lab-tuning="depth"></label>' +
        '</div>' +
        '<label class="forge-lab-atmosphere-toggle"><input type="checkbox" data-lab-atmosphere ' + (state.atmosphere ? "checked" : "") + '> Nubi, brace e aura rituale</label>' +
        "<p>Desktop: il puntatore aggiunge un parallax lieve. Touch: l'inclinazione resta stabile per non interferire con lo scroll.</p>" +
      '</section>'
    );
  }

  function applyGeometry(root) {
    const card = root.querySelector(".forge-lab-card");
    if (!card) return;
    const depth = Math.max(0, Math.min(50, Number(state.depth || 0)));
    card.style.setProperty("--lab-tilt-x", Number(state.tiltX || 0) + "deg");
    card.style.setProperty("--lab-tilt-y", Number(state.tiltY || 0) + "deg");
    card.style.setProperty("--lab-tilt-z", Number(state.tiltZ || 0) + "deg");
    card.style.setProperty("--lab-art-z", Math.round(depth * .45) + "px");
    card.style.setProperty("--lab-ui-z", Math.round(depth * .78) + "px");
    card.style.setProperty("--lab-name-z", Math.round(depth * .98) + "px");
    card.style.setProperty("--lab-sigil-z", Math.round(depth * 1.16) + "px");
  }

  function cycleArt(recipe, delta) {
    const set = cards();
    if (!set.length) return;
    const current = selectedArtCard(recipe);
    const index = Math.max(0, set.findIndex(card => card.id === current?.id));
    state.artCardId = set[(index + Number(delta) + set.length) % set.length].id;
    render();
  }

  function cycleSigil(recipe, slotId, delta) {
    const session = ensureSession();
    const list = activeSigils();
    const current = recipe.sigils.find(item => item.slotId === slotId);
    if (!session || !current || !list.length) return;
    const index = Math.max(0, list.findIndex(item => item.id === current.sigilId));
    const next = list[(index + Number(delta) + list.length) % list.length];
    mutate(() => session.replaceSigil(slotId, next.id));
    state.imprintSlotId = slotId;
    render();
    window.setTimeout(() => {
      if (state.imprintSlotId === slotId) state.imprintSlotId = null;
    }, 900);
  }

  function bindLongPress(root) {
    root.querySelectorAll("[data-lab-sigil]").forEach(button => {
      let timer = 0;
      let longPress = false;
      const cancel = () => {
        if (timer) window.clearTimeout(timer);
        timer = 0;
      };
      button.addEventListener("pointerdown", event => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        longPress = false;
        cancel();
        timer = window.setTimeout(() => {
          longPress = true;
          state.modal = { type: "sigil-detail", slotId: button.dataset.labSigil };
          render();
        }, 560);
      });
      ["pointerup", "pointercancel", "pointerleave"].forEach(type => button.addEventListener(type, cancel));
      button.addEventListener("click", event => {
        if (longPress) {
          event.preventDefault();
          longPress = false;
          return;
        }
        state.modal = { type: "sigil-edit", slotId: button.dataset.labSigil };
        render();
      });
    });
  }

  function bind(root, recipe) {
    const session = ensureSession();
    if (!session) return;

    root.querySelectorAll("[data-lab-open]").forEach(button => button.addEventListener("click", () => {
      state.modal = { type: button.dataset.labOpen };
      render();
    }));

    root.querySelectorAll("[data-lab-art-step]").forEach(button => button.addEventListener("click", () => cycleArt(recipe, button.dataset.labArtStep)));
    root.querySelectorAll("[data-lab-sigil-step]").forEach(button => button.addEventListener("click", () => cycleSigil(recipe, button.dataset.labSlot, button.dataset.labSigilStep)));

    root.querySelectorAll("[data-lab-add-empty]").forEach(button => button.addEventListener("click", () => {
      state.modal = { type: "sigil-add" };
      render();
    }));

    root.querySelectorAll("[data-lab-close]").forEach(button => button.addEventListener("click", () => {
      state.modal = null;
      render();
    }));
    root.querySelector("[data-lab-modal-layer]")?.addEventListener("pointerdown", event => {
      if (event.target !== event.currentTarget) return;
      state.modal = null;
      render();
    });

    root.querySelectorAll("[data-lab-art-card]").forEach(button => button.addEventListener("click", () => {
      state.artCardId = button.dataset.labArtCard;
      state.modal = null;
      render();
    }));

    root.querySelectorAll("[data-lab-school]").forEach(button => button.addEventListener("click", () => {
      mutate(() => session.setSchool(button.dataset.labSchool));
      state.modal = null;
      render();
    }));

    root.querySelectorAll("[data-lab-type]").forEach(button => button.addEventListener("click", () => {
      mutate(() => session.setType(button.dataset.labType));
      state.modal = null;
      render();
    }));

    root.querySelector("[data-lab-name-form]")?.addEventListener("submit", event => {
      event.preventDefault();
      mutate(() => session.setName(new FormData(event.currentTarget).get("name")));
      state.modal = null;
      render();
    });

    root.querySelector("[data-lab-cost-form]")?.addEventListener("submit", event => {
      event.preventDefault();
      const value = Number(new FormData(event.currentTarget).get("cost"));
      state.cost = Math.max(0, Math.min(30, Number.isFinite(value) ? Math.trunc(value) : 0));
      state.modal = null;
      render();
    });

    root.querySelector("[data-lab-clear-cost]")?.addEventListener("click", () => {
      state.cost = null;
      state.modal = null;
      render();
    });

    root.querySelector("[data-lab-stats-form]")?.addEventListener("submit", event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      mutate(() => session.setCreatureStats({
        attack: Math.max(0, Math.trunc(Number(form.get("attack") || 0))),
        health: Math.max(1, Math.trunc(Number(form.get("health") || 1)))
      }));
      state.modal = null;
      render();
    });

    root.querySelectorAll("[data-lab-add-sigil]").forEach(button => button.addEventListener("click", () => {
      const result = mutate(() => session.addSigil(button.dataset.labAddSigil));
      const slotId = result.draft.recipe.sigils.at(-1)?.slotId || null;
      state.imprintSlotId = slotId;
      state.modal = slotId ? { type: "sigil-edit", slotId } : null;
      render();
      window.setTimeout(() => {
        if (state.imprintSlotId === slotId) state.imprintSlotId = null;
      }, 900);
    }));

    root.querySelectorAll("[data-lab-replace-sigil]").forEach(button => button.addEventListener("click", () => {
      const slotId = button.dataset.labSlot;
      mutate(() => session.replaceSigil(slotId, button.dataset.labReplaceSigil));
      state.imprintSlotId = slotId;
      state.modal = { type: "sigil-edit", slotId };
      render();
      window.setTimeout(() => {
        if (state.imprintSlotId === slotId) state.imprintSlotId = null;
      }, 900);
    }));

    root.querySelector("[data-lab-open-picker]")?.addEventListener("click", event => {
      state.modal = { type: "sigil-picker", slotId: event.currentTarget.dataset.labOpenPicker };
      render();
    });

    root.querySelector("[data-lab-remove-sigil]")?.addEventListener("click", event => {
      const slotId = event.currentTarget.dataset.labRemoveSigil;
      state.breakSlotId = slotId;
      state.modal = null;
      render();
      window.setTimeout(() => {
        mutate(() => session.removeSigil(slotId));
        state.breakSlotId = null;
        render();
      }, 470);
    });

    root.querySelector("[data-lab-grade]")?.addEventListener("change", event => {
      const slotId = state.modal?.slotId;
      if (!slotId) return;
      mutate(() => session.setSigilGrade(slotId, Number(event.currentTarget.value)));
      state.imprintSlotId = slotId;
      render();
    });

    root.querySelectorAll("[data-lab-config]").forEach(control => control.addEventListener("change", () => {
      const slotId = state.modal?.slotId;
      if (!slotId) return;
      mutate(() => session.setSigilConfig(slotId, control.dataset.labConfig, control.value));
      render();
    }));

    root.querySelectorAll("[data-lab-schools-config]").forEach(group => {
      group.querySelectorAll('input[type="checkbox"]').forEach(input => input.addEventListener("change", () => {
        const slotId = state.modal?.slotId;
        if (!slotId) return;
        const checks = [...group.querySelectorAll('input[type="checkbox"]')];
        const all = checks.find(item => item.value === "all");
        if (input.value === "all" && input.checked) {
          mutate(() => session.setSigilConfig(slotId, group.dataset.labSchoolsConfig, "all"));
          render();
          return;
        }
        if (all) all.checked = false;
        const selected = checks.filter(item => item.value !== "all" && item.checked).map(item => item.value).slice(0, 3);
        if (!selected.length) {
          input.checked = true;
          return;
        }
        mutate(() => session.setSigilConfig(slotId, group.dataset.labSchoolsConfig, selected));
        render();
      }));
    });

    root.querySelectorAll("select[data-lab-modifier-family]").forEach(control => control.addEventListener("change", () => {
      const slotId = state.modal?.slotId;
      if (!slotId) return;
      mutate(() => session.setSigilModifier(slotId, control.dataset.labModifierFamily, control.value || null));
      render();
    }));

    root.querySelectorAll("[data-lab-modifier-param]").forEach(control => control.addEventListener("change", () => {
      const slotId = state.modal?.slotId;
      if (!slotId) return;
      mutate(() => session.setSigilModifierParam(
        slotId,
        control.dataset.labModifierFamily,
        control.dataset.labModifierParam,
        control.value
      ));
      render();
    }));

    root.querySelectorAll("[data-lab-tuning]").forEach(control => control.addEventListener("input", () => {
      state[control.dataset.labTuning] = Number(control.value);
      const suffix = control.dataset.labTuning === "depth" ? "px" : "°";
      const output = root.querySelector('[data-lab-output="' + control.dataset.labTuning + '"]');
      if (output) output.textContent = control.value + suffix;
      applyGeometry(root);
    }));

    root.querySelector("[data-lab-atmosphere]")?.addEventListener("change", event => {
      state.atmosphere = Boolean(event.currentTarget.checked);
      root.querySelector(".forge-lab-card")?.classList.toggle("no-atmosphere", !state.atmosphere);
      root.querySelector(".forge-lab-stage")?.classList.toggle("no-atmosphere", !state.atmosphere);
    });

    const stage = root.querySelector(".forge-lab-card-stage");
    const card = root.querySelector(".forge-lab-card");
    stage?.addEventListener("pointermove", event => {
      if (!card || event.pointerType === "touch") return;
      const rect = stage.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / Math.max(1, rect.width) - .5) * 2;
      const y = ((event.clientY - rect.top) / Math.max(1, rect.height) - .5) * 2;
      card.style.setProperty("--lab-pointer-x", (-y * 1.4).toFixed(2) + "deg");
      card.style.setProperty("--lab-pointer-y", (x * 2.1).toFixed(2) + "deg");
    });
    stage?.addEventListener("pointerleave", () => {
      card?.style.setProperty("--lab-pointer-x", "0deg");
      card?.style.setProperty("--lab-pointer-y", "0deg");
    });

    bindLongPress(root);
  }

  function render(target) {
    const root = target || document.getElementById("forgeUiLabContent");
    const session = ensureSession();
    if (!root || !session) return;
    const recipe = session.snapshot().draft.recipe;
    selectedArtCard(recipe);

    root.innerHTML =
      '<div class="forge-lab-layout">' +
        '<section class="forge-lab-stage ' + (state.atmosphere ? "" : "no-atmosphere") + '">' +
          '<div class="forge-lab-cloud cloud-one" aria-hidden="true"></div>' +
          '<div class="forge-lab-cloud cloud-two" aria-hidden="true"></div>' +
          '<div class="forge-lab-embers" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
          '<div class="forge-lab-card-stage">' + cardMarkup(recipe) + '</div>' +
          '<p class="forge-lab-gesture-hint">Tocca gli elementi della carta · tieni premuto un Sigillo per il dettaglio</p>' +
        '</section>' +
        tuningMarkup() +
      '</div>' +
      modalMarkup(recipe);

    applyGeometry(root);
    bind(root, recipe);
  }

  function refreshFromPersistedDraft() {
    state.session = null;
    render();
  }

  A.ForgeUiLab = Object.freeze({
    render,
    refreshFromPersistedDraft,
    resetSession() {
      state.session = null;
    }
  });
})(window.Arcane = window.Arcane || {});
