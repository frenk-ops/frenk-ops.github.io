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
    "arcane-amplification": "Amplificazione Arcana",
    "combat-fury": "Furia di Combattimento",
    "total-assault": "Assalto Totale",
    "arcane-attack": "Attacco Arcano",
    absorption: "Assorbimento",
    destruction: "Distruzione",
    annihilation: "Annientamento",
    rebirth: "Rinascita",
    "eternal-rebirth": "Rinascita Eterna",
    domination: "Dominazione"
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
    "arcane-amplification": "Amplifica una componente della Formula secondo le condizioni configurate.",
    "combat-fury": "Aumenta la pressione offensiva della creatura secondo le condizioni configurate.",
    "total-assault": "Concentra la Formula su un assalto totale.",
    "arcane-attack": "Trasforma il Potere della scuola scelta in pressione offensiva.",
    absorption: "Converte parte dell'effetto subito in recupero di Vita.",
    destruction: "Distrugge una creatura avversaria secondo i criteri configurati.",
    annihilation: "Estende la distruzione a più bersagli secondo l'ambito scelto.",
    rebirth: "Riporta in gioco la creatura quando si verifica la condizione di rinascita.",
    "eternal-rebirth": "Rende la rinascita parte permanente dell'identità della Formula.",
    domination: "Prende il controllo del bersaglio previsto dalla configurazione."
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

  const IT_LABELS = Object.freeze({
    damage: "Danno",
    healing: "Cura",
    power: "Potere",
    combat: "Combattimento",
    control: "Controllo",
    scaling: "Intensità",
    activation: "Attivazione",
    constraint: "Vincolo",
    selector: "Selettore",
    when: "Momento",
    target: "Bersaglio",
    scope: "Ambito",
    reaction: "Reazione",
    schools: "Scuole",
    school: "Scuola",
    side: "Lato",
    mode: "Modalità",
    targetScope: "Bersagli",
    stacking: "Cumulabilità",
    threshold: "Soglia",
    numerator: "Numeratore",
    denominator: "Denominatore",
    sourceTarget: "Origine",
    healTarget: "Destinazione cura",
    destination: "Destinazione",
    min: "Minimo",
    onDeploy: "All'evocazione",
    onBeforeAttack: "Prima dell'attacco",
    onSelfDeath: "Alla propria morte",
    whileAlive: "Finché è in campo",
    "enemy-hero": "Incantatore avversario",
    "enemy-creature": "Creatura avversaria",
    "self-hero": "Il tuo Incantatore",
    "allied-creature": "Creatura alleata",
    source: "Fonte",
    "event-source": "Fonte dell'evento",
    field: "Campo",
    front: "Prima linea",
    "all-powers": "Tutti i Poteri",
    self: "Proprio",
    enemy: "Avversario",
    halve: "Dimezza",
    subtract: "Sottrai",
    hero: "Incantatore",
    "hero-and-creatures": "Incantatore e creature",
    "per-copy": "Per copia",
    presence: "Presenza",
    multiplier: "Moltiplicatore",
    flat: "Valore fisso",
    creature: "Creatura",
    any: "Qualsiasi",
    damaged: "Quando subisce danno",
    attacked: "Quando viene attaccata",
    "strongest-health": "Vita più alta",
    "strongest-attack": "Attacco più alto",
    "enemy-field": "Campo avversario",
    "all-field": "Tutto il campo",
    "own-hero": "Il tuo Incantatore"
  });

  const FULL_IMPRINT_MS = 1450;
  const QUICK_IMPRINT_MS = 780;

  const state = {
    session: null,
    artCardId: "",
    cost: null,
    modal: null,
    imprintSlotId: null,
    breakSlotId: null,
    tiltX: 18,
    tiltY: -6,
    tiltZ: -2,
    depth: 72,
    atmosphere: true,
    inlineControl: null,
    nameEditing: false
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
    if (IT_LABELS[id]) return IT_LABELS[id];
    return id
      .replace(/^activation-/, "")
      .replace(/^constraint-/, "")
      .replace(/^selector-/, "")
      .replace(/^scale-/, "")
      .replaceAll("-", " ")
      .replace(/\b\w/g, match => match.toUpperCase());
  }

  function italianText(key, fallback) {
    const translated = A.i18n?.t?.(key, {}, "it");
    return translated && translated !== key ? translated : fallback;
  }

  function schoolLabel(id) {
    return italianText("schools." + id, {
      fire: "Fuoco",
      water: "Acqua",
      air: "Aria",
      earth: "Terra",
      death: "Morte"
    }[id] || String(id || ""));
  }

  function schoolGlyph(id) {
    return A.getSigianSchool?.(id)?.icon || SCHOOL_GLYPHS[id] || "✦";
  }

  function schoolIconMarkup(id, className = "forge-lab-school-icon") {
    if (typeof A.schoolIconMarkup === "function") return A.schoolIconMarkup(id, className);
    return '<span class="' + escapeHtml(className) + ' school-icon-fallback" aria-hidden="true">' + escapeHtml(schoolGlyph(id)) + '</span>';
  }

  function cardDisplayName(card) {
    if (!card) return "";
    const key = "cards." + card.id + ".name";
    const translated = A.i18n?.t?.(key, {}, "it");
    return translated && translated !== key ? translated : (card.name || card.id);
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
    const depth = Math.max(0, Math.min(100, Number(state.depth || 0)));
    const px = multiplier => Math.round(depth * multiplier);
    return [
      "--lab-depth:" + depth + "px",
      "--lab-tilt-x:" + Number(state.tiltX || 0) + "deg",
      "--lab-tilt-y:" + Number(state.tiltY || 0) + "deg",
      "--lab-tilt-z:" + Number(state.tiltZ || 0) + "deg",
      "--lab-art-z:" + px(1.28) + "px",
      "--lab-ui-z:" + px(2.05) + "px",
      "--lab-name-z:" + px(1.62) + "px",
      "--lab-sigil-z:" + px(.18) + "px"
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

  function sigilNameLettersMarkup(name) {
    return [...String(name || "")].map((char, index) =>
      '<span class="forge-lab-sigil-letter" style="--lab-letter:' + index + '">' +
        (char === " " ? "&nbsp;" : escapeHtml(char)) +
      '</span>'
    ).join("");
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
        '<div class="forge-lab-sigil-row' + imprint + breaking + '" data-lab-row="' + escapeHtml(sigil.slotId) + '" style="--lab-sigil-index:' + index + '">' +
          '<button type="button" class="forge-lab-cycle" data-lab-sigil-step="-1" data-lab-slot="' + escapeHtml(sigil.slotId) + '" aria-label="Sigillo precedente">‹</button>' +
          '<button type="button" class="forge-lab-sigil-mark" data-lab-sigil="' + escapeHtml(sigil.slotId) + '">' +
            '<span class="forge-lab-sigil-burn" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>' +
            '<span class="forge-lab-sigil-emblem" aria-hidden="true">' +
              '<span class="forge-lab-sigil-runes"><i>ᚨ</i><i>ᚱ</i><i>ᚲ</i><i>ᚾ</i><i>ᛟ</i><i>ᛉ</i></span>' +
              '<span class="forge-lab-sigil-glyph">' + escapeHtml(sigilGlyph(sigil.sigilId)) + '</span>' +
            '</span>' +
            '<span class="forge-lab-sigil-copy">' +
              '<strong class="forge-lab-sigil-name">' + sigilNameLettersMarkup(sigilName(sigil.sigilId)) + '</strong>' +
              '<span class="forge-lab-chip-row">' + compactModifierMarkup(sigil) + '</span>' +
            '</span>' +
          '</button>' +
          '<button type="button" class="forge-lab-cycle" data-lab-sigil-step="1" data-lab-slot="' + escapeHtml(sigil.slotId) + '" aria-label="Sigillo successivo">›</button>' +
        '</div>'
      );
    }
    return rows.join("");
  }

  function inlineControlMarkup(recipe) {
    const control = state.inlineControl;
    if (!control) return "";

    if (control === "school") {
      const schools = activeSchools();
      return (
        '<div class="forge-lab-school-radial" data-lab-inline-wheel="school" aria-label="Scelta rapida scuola">' +
          schools.map((school, index) =>
            '<button type="button" class="' + (school.id === recipe.school ? "is-selected" : "") + '" ' +
              'data-lab-inline-school="' + escapeHtml(school.id) + '" ' +
              'style="--lab-orbit-index:' + index + ';--lab-orbit-count:' + schools.length + '" ' +
              'aria-label="' + escapeHtml(schoolLabel(school.id)) + '">' +
              schoolIconMarkup(school.id, "forge-lab-radial-school-icon") +
            '</button>'
          ).join("") +
        '</div>'
      );
    }

    const isCost = control === "cost";
    const value = isCost
      ? (state.cost == null ? 0 : Number(state.cost))
      : Number(recipe.stats?.[control] ?? (control === "health" ? 1 : 0));
    const label = control === "attack" ? "ATTACCO" : control === "health" ? "VITA" : "COSTO";

    return (
      '<div class="forge-lab-inline-wheel is-' + escapeHtml(control) + '" data-lab-inline-wheel="' + escapeHtml(control) + '">' +
        '<button type="button" class="is-minus" data-lab-inline-step="' + escapeHtml(control) + '" data-lab-delta="-1" aria-label="Diminuisci ' + label.toLowerCase() + '">−</button>' +
        '<span class="forge-lab-inline-wheel-value"><small>' + label + '</small><strong>' + escapeHtml(value) + '</strong></span>' +
        '<button type="button" class="is-plus" data-lab-inline-step="' + escapeHtml(control) + '" data-lab-delta="1" aria-label="Aumenta ' + label.toLowerCase() + '">+</button>' +
      '</div>'
    );
  }

  function cardMarkup(recipe) {
    const art = selectedArtCard(recipe);
    const name = recipe.presentation?.name || "Nuova Formula";
    const cost = state.cost == null ? "—" : String(state.cost);
    const stats = recipe.stats || {};
    const longName = name.length > 34 ? " is-very-long" : name.length > 22 ? " is-long" : "";
    const nameplate = state.nameEditing
      ? '<form class="forge-lab-nameplate forge-lab-name-editing' + longName + '" data-lab-name-inline-form>' +
          '<input name="name" maxlength="48" value="' + escapeHtml(name) + '" aria-label="Nome Formula" autocomplete="off">' +
        '</form>'
      : '<button type="button" class="forge-lab-nameplate' + longName + '" data-lab-edit-name><span>' + escapeHtml(name) + '</span></button>';

    return (
      '<div class="forge-lab-card-shell">' +
        '<button type="button" class="forge-lab-art-arrow is-prev" data-lab-art-step="-1" aria-label="Illustrazione precedente">‹</button>' +
        '<article class="forge-lab-card school-' + escapeHtml(recipe.school) + ' type-' + escapeHtml(recipe.type) + (state.atmosphere ? "" : " no-atmosphere") + (state.imprintSlotId ? " is-ritual-active" : "") + '" style="' + geometryStyle() + '">' +
          '<div class="forge-lab-card-frame" aria-hidden="true"><span></span><i></i><i></i><i></i><i></i></div>' +
          '<div class="forge-lab-card-aura" aria-hidden="true"><i></i><i></i><i></i></div>' +
          '<button type="button" class="forge-lab-art-layer" data-lab-art-main aria-label="Scegli o scorri illustrazione">' +
            (art ? '<img src="' + escapeHtml(artUrl(art)) + '" alt="' + escapeHtml(cardDisplayName(art)) + '">' : '<span class="forge-lab-art-fallback">✦</span>') +
          '</button>' +
          '<button type="button" class="forge-lab-cost" data-lab-control="cost"><small>COSTO</small><strong>' + escapeHtml(cost) + '</strong><em class="forge-lab-control-feedback" aria-hidden="true"></em></button>' +
          '<button type="button" class="forge-lab-type" data-lab-toggle-type>' + (recipe.type === "spell" ? "MAGIA" : "CREATURA") + '</button>' +
          '<button type="button" class="forge-lab-school-nav is-prev" data-lab-school-step="-1" aria-label="Scuola precedente">‹</button>' +
          '<button type="button" class="forge-lab-school" data-lab-school-main aria-label="Scuola: ' + escapeHtml(schoolLabel(recipe.school)) + '. Tocca per scegliere; scorri per cambiare">' +
            schoolIconMarkup(recipe.school, "forge-lab-school-icon") +
          '</button>' +
          '<button type="button" class="forge-lab-school-nav is-next" data-lab-school-step="1" aria-label="Scuola successiva">›</button>' +
          nameplate +
          (recipe.type === "creature"
            ? '<div class="forge-lab-stats">' +
                '<button type="button" class="forge-lab-stat attack" data-lab-control="attack" aria-label="Attacco ' + escapeHtml(stats.attack ?? 0) + '"><span aria-hidden="true">⚔</span><strong>' + escapeHtml(stats.attack ?? 0) + '</strong><em class="forge-lab-control-feedback" aria-hidden="true"></em></button>' +
                '<button type="button" class="forge-lab-stat health" data-lab-control="health" aria-label="Vita ' + escapeHtml(stats.health ?? 1) + '"><span aria-hidden="true">♥</span><strong>' + escapeHtml(stats.health ?? 1) + '</strong><em class="forge-lab-control-feedback" aria-hidden="true"></em></button>' +
              '</div>'
            : "") +
          inlineControlMarkup(recipe) +
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
      modalHeading("Illustrazione", "Scegli l’illustrazione completa", "La Forgia mantiene l’immagine intera e la fonde nella pergamena.") +
      '<div class="forge-lab-art-grid">' +
        cards().map(card =>
          '<button type="button" class="forge-lab-art-choice ' + (card.id === state.artCardId ? "is-selected" : "") + '" data-lab-art-card="' + escapeHtml(card.id) + '">' +
            '<img src="' + escapeHtml(artUrl(card)) + '" alt="' + escapeHtml(cardDisplayName(card)) + '">' +
            '<small>' + escapeHtml(cardDisplayName(card)) + '</small>' +
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
            '<span aria-hidden="true">' + schoolIconMarkup(school.id, "forge-lab-picker-school-icon") + '</span><strong>' + escapeHtml(schoolLabel(school.id)) + '</strong>' +
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
    return "";
  }

  function tuningMarkup() {
    const expanded = window.matchMedia?.("(min-width: 981px)")?.matches ? " open" : "";
    return (
      '<details class="forge-lab-tuning"' + expanded + '>' +
        '<summary class="forge-lab-tuning-summary"><span><small>LABORATORIO UI</small><strong>Calibrazione 2.5D</strong></span><span class="forge-lab-tech-badge">CSS 3D · DOM</span></summary>' +
        '<div class="forge-lab-tuning-body">' +
          '<div class="forge-lab-tuning-heading"><div><span class="classic-menu-kicker">Regolazione</span><h3>Profondità e atmosfera</h3></div></div>' +
          '<div class="forge-lab-tuning-grid">' +
            '<label>Prospettiva verticale <output data-lab-output="tiltX">' + state.tiltX + '°</output><input type="range" min="6" max="28" step="1" value="' + state.tiltX + '" data-lab-tuning="tiltX"></label>' +
            '<label>Sinistra / destra <output data-lab-output="tiltY">' + state.tiltY + '°</output><input type="range" min="-14" max="6" step="1" value="' + state.tiltY + '" data-lab-tuning="tiltY"></label>' +
            '<label>Rotazione <output data-lab-output="tiltZ">' + state.tiltZ + '°</output><input type="range" min="-5" max="4" step="1" value="' + state.tiltZ + '" data-lab-tuning="tiltZ"></label>' +
            '<label>Separazione elementi <output data-lab-output="depth">' + state.depth + 'px</output><input type="range" min="0" max="100" step="2" value="' + state.depth + '" data-lab-tuning="depth"></label>' +
          '</div>' +
          '<label class="forge-lab-atmosphere-toggle"><input type="checkbox" data-lab-atmosphere ' + (state.atmosphere ? "checked" : "") + '> Nubi, brace e aura rituale</label>' +
          "<p>Su computer il puntatore aggiunge una lieve profondità. Su schermo tattile la carta resta stabile finché non la afferri.</p>" +
        '</div>' +
      '</details>'
    );
  }

  function applyGeometry(root) {
    const card = root.querySelector(".forge-lab-card");
    if (!card) return;
    const depth = Math.max(0, Math.min(100, Number(state.depth || 0)));
    card.style.setProperty("--lab-depth", depth + "px");
    card.style.setProperty("--lab-tilt-x", Number(state.tiltX || 0) + "deg");
    card.style.setProperty("--lab-tilt-y", Number(state.tiltY || 0) + "deg");
    card.style.setProperty("--lab-tilt-z", Number(state.tiltZ || 0) + "deg");
    card.style.setProperty("--lab-art-z", Math.round(depth * 1.28) + "px");
    card.style.setProperty("--lab-ui-z", Math.round(depth * 2.05) + "px");
    card.style.setProperty("--lab-name-z", Math.round(depth * 1.62) + "px");
    card.style.setProperty("--lab-sigil-z", Math.round(depth * .18) + "px");
  }

  function cycleArt(recipe, delta) {
    const set = cards();
    if (!set.length) return;
    const current = selectedArtCard(recipe);
    const index = Math.max(0, set.findIndex(card => card.id === current?.id));
    state.artCardId = set[(index + Number(delta) + set.length) % set.length].id;
    render();
  }

  function cycleSchool(recipe, delta) {
    const session = ensureSession();
    const schools = activeSchools();
    if (!session || !schools.length) return;
    const index = Math.max(0, schools.findIndex(item => item.id === recipe.school));
    const next = schools[(index + Number(delta) + schools.length) % schools.length];
    mutate(() => session.setSchool(next.id));
    render();
  }

  function playImprint(slotId, options = {}) {
    const duration = options.quick ? QUICK_IMPRINT_MS : FULL_IMPRINT_MS;
    const reopenEditor = Boolean(options.reopenEditor);
    state.imprintSlotId = slotId;
    state.modal = null;
    render();
    window.setTimeout(() => {
      if (state.imprintSlotId !== slotId) return;
      state.imprintSlotId = null;
      if (reopenEditor) state.modal = { type: "sigil-edit", slotId };
      render();
    }, duration);
  }

  function cycleSigil(recipe, slotId, delta) {
    const session = ensureSession();
    const list = activeSigils();
    const current = recipe.sigils.find(item => item.slotId === slotId);
    if (!session || !current || !list.length) return;
    const index = Math.max(0, list.findIndex(item => item.id === current.sigilId));
    const next = list[(index + Number(delta) + list.length) % list.length];
    mutate(() => session.replaceSigil(slotId, next.id));
    playImprint(slotId, { quick: true });
  }

  function controlValue(recipe, kind) {
    if (kind === "cost") return state.cost == null ? 0 : Number(state.cost);
    if (kind === "health") return Number(recipe.stats?.health ?? 1);
    return Number(recipe.stats?.attack ?? 0);
  }

  function changeCardControl(session, kind, delta, button = null) {
    const amount = Number(delta || 0);
    if (!amount) return 0;

    let next = 0;
    if (kind === "cost") {
      const current = state.cost == null ? 0 : Number(state.cost);
      next = Math.max(0, Math.min(30, Math.trunc(current + amount)));
      state.cost = next;
    } else {
      const liveRecipe = session.snapshot().draft.recipe;
      const stats = liveRecipe.stats || {};
      const attack = Number(stats.attack ?? 0);
      const health = Number(stats.health ?? 1);
      if (kind === "attack") {
        next = Math.max(0, Math.min(99, Math.trunc(attack + amount)));
        mutate(() => session.setCreatureStats({ attack: next, health }));
      } else {
        next = Math.max(1, Math.min(99, Math.trunc(health + amount)));
        mutate(() => session.setCreatureStats({ attack, health: next }));
      }
    }

    if (button) {
      const value = button.querySelector("strong");
      if (value) value.textContent = String(next);
      const feedback = button.querySelector(".forge-lab-control-feedback");
      if (feedback) {
        feedback.textContent = amount > 0 ? "+" + Math.abs(amount) : "−" + Math.abs(amount);
        feedback.classList.remove("is-pulsing");
        void feedback.offsetWidth;
        feedback.classList.add("is-pulsing");
      }
    }
    return next;
  }

  function bindDirectControls(root, recipe, session) {
    root.querySelectorAll("[data-lab-control]").forEach(button => {
      const kind = button.dataset.labControl;
      let timer = 0;
      let active = false;
      let suppressClick = false;
      let pointerId = null;
      let startX = 0;
      let startY = 0;
      let lastStep = 0;

      const clearTimer = () => {
        if (timer) window.clearTimeout(timer);
        timer = 0;
      };

      const finish = () => {
        clearTimer();
        if (active) {
          active = false;
          suppressClick = true;
          button.classList.remove("is-scrubbing");
          button.classList.add("is-scrub-return");
          window.setTimeout(() => button.classList.remove("is-scrub-return"), 260);
          window.setTimeout(() => { suppressClick = false; }, 0);
        }
        pointerId = null;
      };

      button.addEventListener("pointerdown", event => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        startX = event.clientX;
        startY = event.clientY;
        lastStep = 0;
        pointerId = event.pointerId;
        clearTimer();
        timer = window.setTimeout(() => {
          active = true;
          button.classList.add("is-scrubbing");
          try { button.setPointerCapture(pointerId); } catch {}
        }, 190);
      });

      button.addEventListener("pointermove", event => {
        if (!active || event.pointerId !== pointerId) return;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        const axis = dx - dy;
        const step = axis >= 0 ? Math.floor(axis / 22) : Math.ceil(axis / 22);
        const diff = step - lastStep;
        if (diff) {
          changeCardControl(session, kind, diff, button);
          lastStep = step;
        }
        const lean = Math.max(-8, Math.min(8, axis / 18));
        button.style.setProperty("--lab-control-lean", lean.toFixed(2) + "deg");
        event.preventDefault();
      });

      ["pointerup", "pointercancel", "lostpointercapture"].forEach(type => button.addEventListener(type, finish));

      button.addEventListener("click", event => {
        if (suppressClick) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        state.inlineControl = state.inlineControl === kind ? null : kind;
        render();
      });
    });

    root.querySelectorAll("[data-lab-inline-step]").forEach(button => button.addEventListener("click", event => {
      event.stopPropagation();
      const kind = button.dataset.labInlineStep;
      changeCardControl(session, kind, Number(button.dataset.labDelta || 0));
      render();
    }));

    root.querySelectorAll("[data-lab-inline-school]").forEach(button => button.addEventListener("click", event => {
      event.stopPropagation();
      mutate(() => session.setSchool(button.dataset.labInlineSchool));
      state.inlineControl = null;
      render();
    }));
  }

  function bindArtControl(root, recipe) {
    const art = root.querySelector("[data-lab-art-main]");
    if (!art) return;
    let startX = 0;
    let startY = 0;
    let swiped = false;

    art.addEventListener("pointerdown", event => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      startX = event.clientX;
      startY = event.clientY;
      swiped = false;
    });

    art.addEventListener("pointermove", event => {
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.abs(dx) > 34 && Math.abs(dx) > Math.abs(dy) * 1.1) {
        swiped = true;
        event.preventDefault();
      }
    });

    art.addEventListener("pointerup", event => {
      if (!swiped) return;
      const dx = event.clientX - startX;
      cycleArt(recipe, dx > 0 ? -1 : 1);
    });

    art.addEventListener("click", event => {
      if (swiped) {
        event.preventDefault();
        event.stopImmediatePropagation();
        swiped = false;
        return;
      }
      state.modal = { type: "art" };
      render();
    });
  }

  function bindInlineName(root, session) {
    root.querySelector("[data-lab-edit-name]")?.addEventListener("click", () => {
      state.inlineControl = null;
      state.nameEditing = true;
      render();
      const input = document.querySelector("#forgeUiLabContent [data-lab-name-inline-form] input");
      input?.focus();
      input?.select();
    });

    const form = root.querySelector("[data-lab-name-inline-form]");
    const input = form?.querySelector('input[name="name"]');
    if (!form || !input) return;

    let settled = false;
    const commit = () => {
      if (settled) return;
      settled = true;
      mutate(() => session.setName(input.value));
      state.nameEditing = false;
      window.setTimeout(() => render(), 0);
    };

    form.addEventListener("submit", event => {
      event.preventDefault();
      commit();
    });
    input.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault();
        settled = true;
        state.nameEditing = false;
        render();
      }
    });
    input.addEventListener("blur", commit, { once: true });
  }

  function bindTypeToggle(root, recipe, session) {
    root.querySelector("[data-lab-toggle-type]")?.addEventListener("click", () => {
      state.inlineControl = null;
      mutate(() => session.setType(recipe.type === "creature" ? "spell" : "creature"));
      render();
    });
  }

  function bindSchoolControl(root, recipe) {
    const button = root.querySelector("[data-lab-school-main]");
    if (!button) return;
    let timer = 0;
    let longPress = false;
    let swiped = false;
    let startX = 0;
    let startY = 0;

    const cancelTimer = () => {
      if (timer) window.clearTimeout(timer);
      timer = 0;
    };

    button.addEventListener("pointerdown", event => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      startX = event.clientX;
      startY = event.clientY;
      longPress = false;
      swiped = false;
      cancelTimer();
      timer = window.setTimeout(() => {
        longPress = true;
        state.inlineControl = null;
        state.modal = { type: "school" };
        render();
      }, 560);
    });

    button.addEventListener("pointermove", event => {
      if (longPress) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.abs(dx) < 30 || Math.abs(dx) < Math.abs(dy) * 1.15) return;
      cancelTimer();
      swiped = true;
      event.preventDefault();
    });

    button.addEventListener("pointerup", event => {
      cancelTimer();
      if (!swiped || longPress) return;
      const dx = event.clientX - startX;
      cycleSchool(recipe, dx > 0 ? -1 : 1);
    });

    ["pointercancel", "pointerleave"].forEach(type => button.addEventListener(type, cancelTimer));

    button.addEventListener("click", event => {
      if (longPress || swiped) {
        event.preventDefault();
        event.stopImmediatePropagation();
        longPress = false;
        swiped = false;
        return;
      }
      state.inlineControl = state.inlineControl === "school" ? null : "school";
      render();
    });
  }

  function bindCardGrab(root) {
    const card = root.querySelector(".forge-lab-card");
    if (!card) return;
    let timer = 0;
    let active = false;
    let pointerId = null;
    let startX = 0;
    let startY = 0;

    const reset = () => {
      if (timer) window.clearTimeout(timer);
      timer = 0;
      if (active) {
        active = false;
        card.classList.remove("is-grabbed");
        card.classList.add("is-returning");
        card.style.setProperty("--lab-grab-x", "0deg");
        card.style.setProperty("--lab-grab-y", "0deg");
        window.setTimeout(() => card.classList.remove("is-returning"), 420);
      }
      pointerId = null;
    };

    card.addEventListener("pointerdown", event => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (event.target.closest("button, input, select, textarea, label, a")) return;
      startX = event.clientX;
      startY = event.clientY;
      pointerId = event.pointerId;
      timer = window.setTimeout(() => {
        active = true;
        card.classList.remove("is-returning");
        card.classList.add("is-grabbed");
        try { card.setPointerCapture(pointerId); } catch {}
      }, 150);
    });

    card.addEventListener("pointermove", event => {
      if (!active || event.pointerId !== pointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const rotateY = Math.max(-10, Math.min(10, dx / 7));
      const rotateX = Math.max(-6, Math.min(6, -dy / 9));
      card.style.setProperty("--lab-grab-x", rotateX.toFixed(2) + "deg");
      card.style.setProperty("--lab-grab-y", rotateY.toFixed(2) + "deg");
      event.preventDefault();
    });

    ["pointerup", "pointercancel", "lostpointercapture"].forEach(type => card.addEventListener(type, reset));
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

    root.querySelectorAll("[data-lab-art-step]").forEach(button => button.addEventListener("click", () => cycleArt(recipe, button.dataset.labArtStep)));
    root.querySelectorAll(".forge-lab-school-nav[data-lab-school-step]").forEach(button => button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      cycleSchool(recipe, button.dataset.labSchoolStep);
    }));
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

    root.querySelectorAll("[data-lab-add-sigil]").forEach(button => button.addEventListener("click", () => {
      const result = mutate(() => session.addSigil(button.dataset.labAddSigil));
      const slotId = result.draft.recipe.sigils.at(-1)?.slotId || null;
      if (slotId) playImprint(slotId, { reopenEditor: true });
      else render();
    }));

    root.querySelectorAll("[data-lab-replace-sigil]").forEach(button => button.addEventListener("click", () => {
      const slotId = button.dataset.labSlot;
      mutate(() => session.replaceSigil(slotId, button.dataset.labReplaceSigil));
      playImprint(slotId, { reopenEditor: true });
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
      if (!card || event.pointerType === "touch" || card.classList.contains("is-grabbed")) return;
      const rect = stage.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / Math.max(1, rect.width) - .5) * 2;
      const y = ((event.clientY - rect.top) / Math.max(1, rect.height) - .5) * 2;
      card.style.setProperty("--lab-pointer-x", (-y * .7).toFixed(2) + "deg");
      card.style.setProperty("--lab-pointer-y", (x * 1.05).toFixed(2) + "deg");
    });
    stage?.addEventListener("pointerleave", () => {
      card?.style.setProperty("--lab-pointer-x", "0deg");
      card?.style.setProperty("--lab-pointer-y", "0deg");
    });

    bindDirectControls(root, recipe, session);
    bindArtControl(root, recipe);
    bindInlineName(root, session);
    bindTypeToggle(root, recipe, session);
    bindSchoolControl(root, recipe);
    bindCardGrab(root);
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
        '<section class="forge-lab-stage school-' + escapeHtml(recipe.school) + ' ' + (state.atmosphere ? "" : "no-atmosphere") + (state.imprintSlotId ? " is-ritual-active" : "") + '">' +
          '<div class="forge-lab-forge-core" aria-hidden="true"><i></i><i></i><i></i></div>' +
          '<div class="forge-lab-cloud cloud-one" aria-hidden="true"></div>' +
          '<div class="forge-lab-cloud cloud-two" aria-hidden="true"></div>' +
          '<div class="forge-lab-wisps" aria-hidden="true"><i></i><i></i><i></i></div>' +
          '<div class="forge-lab-arcane-filaments" aria-hidden="true"><i></i><i></i><i></i><i></i></div>' +
          '<div class="forge-lab-embers" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
          '<div class="forge-lab-card-stage">' + cardMarkup(recipe) + '</div>' +
          '<p class="forge-lab-gesture-hint">Tap sui medaglioni per la ruota · tieni premuto e trascina alto/destra o basso/sinistra per cambiare valore · scorri Art e Scuola direttamente sulla Formula</p>' +
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
