(function (A) {
  "use strict";

  const DEPTH_LAYERS = Object.freeze({
    surface: 0,
    impressed: .08,
    art: .34,
    raised: .52,
    floating: .68,
    fx: .84
  });

  const FULL_IMPRINT_MS = 1450;
  const QUICK_IMPRINT_MS = 780;
  const MOTION_IDLE_MS = 420;
  const MOTION_LIMIT_X = 4;
  const MOTION_LIMIT_Y = 4.5;
  const MOTION_DEAD_ZONE = .14;

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
    motionEnabled: false,
    motionSensorStatus: "idle",
    inlineControl: null,
    nameEditing: false
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

  function pointerMotionVector(rect, clientX, clientY) {
    const normalize = (value, size) => clamp((value / Math.max(1, size) - .5) * 2, -1, 1);
    const beyondDeadZone = value => {
      const magnitude = Math.abs(value);
      if (magnitude <= MOTION_DEAD_ZONE) return 0;
      return Math.sign(value) * (magnitude - MOTION_DEAD_ZONE) / (1 - MOTION_DEAD_ZONE);
    };
    const x = beyondDeadZone(normalize(clientX - rect.left, rect.width));
    const y = beyondDeadZone(normalize(clientY - rect.top, rect.height));
    return {
      x: clamp(-y * MOTION_LIMIT_X, -MOTION_LIMIT_X, MOTION_LIMIT_X),
      y: clamp(x * MOTION_LIMIT_Y, -MOTION_LIMIT_Y, MOTION_LIMIT_Y)
    };
  }

  function orientationImpulse(previous, beta, gamma) {
    if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return { sample: previous, x: 0, y: 0, significant: false };
    const sample = { beta, gamma };
    if (!previous) return { sample, x: 0, y: 0, significant: false };
    const deltaBeta = beta - previous.beta;
    const deltaGamma = gamma - previous.gamma;
    const significant = Math.max(Math.abs(deltaBeta), Math.abs(deltaGamma)) >= .16;
    return {
      sample,
      x: significant ? clamp(-deltaBeta * .72, -MOTION_LIMIT_X, MOTION_LIMIT_X) : 0,
      y: significant ? clamp(deltaGamma * .72, -MOTION_LIMIT_Y, MOTION_LIMIT_Y) : 0,
      significant
    };
  }

  function createMotionController() {
    const runtime = {
      root: null,
      stage: null,
      card: null,
      frame: 0,
      lastFrame: 0,
      lastInput: 0,
      targetX: 0,
      targetY: 0,
      currentX: 0,
      currentY: 0,
      velocityX: 0,
      velocityY: 0,
      orientationSample: null,
      permission: "unknown",
      direct: false,
      environmentBound: false,
      reducedQuery: null
    };

    const prefersReducedMotion = () => Boolean(runtime.reducedQuery?.matches || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    const viewIsActive = () => Boolean(runtime.root?.closest?.(".view")?.classList.contains("active") ?? true);

    const apply = () => {
      const card = runtime.card;
      if (!card) return;
      card.style.setProperty("--lab-pointer-x", runtime.currentX.toFixed(3) + "deg");
      card.style.setProperty("--lab-pointer-y", runtime.currentY.toFixed(3) + "deg");
      const moving = Math.max(Math.abs(runtime.currentX), Math.abs(runtime.currentY)) > .08;
      card.classList.toggle("is-motion-active", moving || runtime.direct);
    };

    const settle = () => {
      runtime.targetX = 0;
      runtime.targetY = 0;
      runtime.orientationSample = null;
      wake();
    };

    const tick = now => {
      runtime.frame = 0;
      if (!runtime.card?.isConnected || !state.motionEnabled || prefersReducedMotion() || document.hidden || !viewIsActive()) {
        runtime.targetX = 0;
        runtime.targetY = 0;
      } else if (!runtime.direct && now - runtime.lastInput >= MOTION_IDLE_MS) {
        runtime.targetX = 0;
        runtime.targetY = 0;
      }

      const elapsed = runtime.lastFrame ? clamp((now - runtime.lastFrame) / 16.67, .5, 2) : 1;
      runtime.lastFrame = now;
      const damping = Math.pow(.72, elapsed);
      runtime.velocityX = (runtime.velocityX + (runtime.targetX - runtime.currentX) * .12 * elapsed) * damping;
      runtime.velocityY = (runtime.velocityY + (runtime.targetY - runtime.currentY) * .12 * elapsed) * damping;
      runtime.currentX += runtime.velocityX * elapsed;
      runtime.currentY += runtime.velocityY * elapsed;
      if (Math.abs(runtime.currentX) >= MOTION_LIMIT_X) runtime.velocityX = 0;
      if (Math.abs(runtime.currentY) >= MOTION_LIMIT_Y) runtime.velocityY = 0;
      runtime.currentX = clamp(runtime.currentX, -MOTION_LIMIT_X, MOTION_LIMIT_X);
      runtime.currentY = clamp(runtime.currentY, -MOTION_LIMIT_Y, MOTION_LIMIT_Y);

      if (Math.abs(runtime.targetX) < .001 && Math.abs(runtime.currentX) < .006 && Math.abs(runtime.velocityX) < .006) {
        runtime.currentX = 0;
        runtime.velocityX = 0;
      }
      if (Math.abs(runtime.targetY) < .001 && Math.abs(runtime.currentY) < .006 && Math.abs(runtime.velocityY) < .006) {
        runtime.currentY = 0;
        runtime.velocityY = 0;
      }
      apply();

      const unsettled = runtime.currentX || runtime.currentY || runtime.velocityX || runtime.velocityY || runtime.targetX || runtime.targetY;
      if (state.motionEnabled && (unsettled || runtime.direct)) runtime.frame = window.requestAnimationFrame(tick);
    };

    function wake() {
      if (!runtime.frame) runtime.frame = window.requestAnimationFrame(tick);
    }

    const input = (x, y) => {
      if (!state.motionEnabled || prefersReducedMotion() || runtime.direct || document.hidden || !viewIsActive()) return;
      runtime.targetX = clamp(x, -MOTION_LIMIT_X, MOTION_LIMIT_X);
      runtime.targetY = clamp(y, -MOTION_LIMIT_Y, MOTION_LIMIT_Y);
      runtime.lastInput = performance.now();
      wake();
    };

    const onOrientation = event => {
      const impulse = orientationImpulse(runtime.orientationSample, Number(event.beta), Number(event.gamma));
      runtime.orientationSample = impulse.sample;
      if (!impulse.significant) return;
      input(impulse.x, impulse.y);
    };

    const onVisibility = () => {
      runtime.orientationSample = null;
      if (document.hidden) {
        window.removeEventListener("deviceorientation", onOrientation);
        settle();
      } else {
        if (runtime.permission === "granted" && runtime.environmentBound) {
          window.removeEventListener("deviceorientation", onOrientation);
          window.addEventListener("deviceorientation", onOrientation, { passive: true });
        }
        runtime.currentX = 0;
        runtime.currentY = 0;
        runtime.velocityX = 0;
        runtime.velocityY = 0;
        apply();
      }
    };

    const onReducedMotionChange = () => {
      runtime.orientationSample = null;
      settle();
      syncClasses();
    };

    const bindEnvironment = () => {
      if (runtime.environmentBound) return;
      runtime.environmentBound = true;
      runtime.reducedQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)") || null;
      runtime.reducedQuery?.addEventListener?.("change", onReducedMotionChange);
      document.addEventListener("visibilitychange", onVisibility);
      if (runtime.permission === "granted") window.addEventListener("deviceorientation", onOrientation, { passive: true });
    };

    const unbindEnvironment = () => {
      if (!runtime.environmentBound) return;
      runtime.environmentBound = false;
      runtime.reducedQuery?.removeEventListener?.("change", onReducedMotionChange);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("deviceorientation", onOrientation);
      runtime.reducedQuery = null;
      runtime.orientationSample = null;
    };

    function syncClasses() {
      const card = runtime.card;
      if (!card) return;
      card.classList.toggle("motion-enabled", state.motionEnabled && !prefersReducedMotion());
      card.classList.toggle("motion-reduced", state.motionEnabled && prefersReducedMotion());
      card.dataset.labMotionSensor = state.motionSensorStatus;
    }

    async function requestSensorPermission() {
      if (prefersReducedMotion()) return "reduced";
      const OrientationEvent = window.DeviceOrientationEvent;
      if (typeof OrientationEvent === "undefined") return "unsupported";
      if (typeof OrientationEvent.requestPermission === "function") {
        try {
          const result = await OrientationEvent.requestPermission();
          return result === "granted" ? "granted" : "denied";
        } catch (_) {
          return "denied";
        }
      }
      return "granted";
    }

    return {
      attach(root, stage, card) {
        runtime.root = root;
        runtime.stage = stage;
        runtime.card = card;
        apply();
        syncClasses();
        if (state.motionEnabled) bindEnvironment();
      },
      pointer(event) {
        if (!runtime.stage || event.pointerType === "touch") return;
        const vector = pointerMotionVector(runtime.stage.getBoundingClientRect(), event.clientX, event.clientY);
        input(vector.x, vector.y);
      },
      pointerLeave() {
        runtime.lastInput = performance.now();
        wake();
      },
      setDirect(active) {
        runtime.direct = Boolean(active);
        if (runtime.direct) {
          runtime.targetX = 0;
          runtime.targetY = 0;
          runtime.currentX = 0;
          runtime.currentY = 0;
          runtime.velocityX = 0;
          runtime.velocityY = 0;
        } else runtime.lastInput = performance.now();
        apply();
        wake();
      },
      async setEnabled(enabled) {
        state.motionEnabled = Boolean(enabled);
        if (!state.motionEnabled) {
          state.motionSensorStatus = "idle";
          unbindEnvironment();
          if (runtime.frame) window.cancelAnimationFrame(runtime.frame);
          runtime.frame = 0;
          runtime.lastFrame = 0;
          runtime.targetX = 0;
          runtime.targetY = 0;
          runtime.currentX = 0;
          runtime.currentY = 0;
          runtime.velocityX = 0;
          runtime.velocityY = 0;
          apply();
          syncClasses();
          return state.motionSensorStatus;
        }
        bindEnvironment();
        runtime.permission = await requestSensorPermission();
        if (!state.motionEnabled) {
          unbindEnvironment();
          state.motionSensorStatus = "idle";
          syncClasses();
          return state.motionSensorStatus;
        }
        state.motionSensorStatus = runtime.permission;
        if (runtime.permission === "granted" && runtime.environmentBound) {
          window.removeEventListener("deviceorientation", onOrientation);
          window.addEventListener("deviceorientation", onOrientation, { passive: true });
        }
        syncClasses();
        return state.motionSensorStatus;
      },
      suspend() {
        unbindEnvironment();
        if (runtime.frame) window.cancelAnimationFrame(runtime.frame);
        runtime.frame = 0;
        runtime.lastFrame = 0;
        runtime.targetX = 0;
        runtime.targetY = 0;
        runtime.currentX = 0;
        runtime.currentY = 0;
        runtime.velocityX = 0;
        runtime.velocityY = 0;
        runtime.direct = false;
        apply();
      }
    };
  }

  const motionController = createMotionController();

  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[char]);

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

  function schoolIconMarkup(id, className = "forge-lab-school-icon") {
    return A.sigianContentSchoolIconMarkup?.(id, className)
      || A.schoolIconMarkup?.(id, className)
      || '<span class="' + escapeHtml(className) + '" aria-hidden="true">✦</span>';
  }

  function cardDisplayName(item) {
    if (!item) return "";
    const sourceCardId = item.sourceFormulaId || item.id;
    const key = "cards." + sourceCardId + ".name";
    const translated = A.i18n?.t?.(key, {}, "it");
    if (translated && translated !== key) return translated;
    return String(item.name || sourceCardId || "").replace(/\s+—\s+ART$/, "");
  }

  function artItems() {
    return A.listSigianInventoryArts?.()
      || A.listSigianContent?.({ kind:"cosmetic", status:"active" })
      || [];
  }

  function activeSchools() {
    return A.listSigianContent?.({ kind:"school", status:"active" }) || [];
  }

  function forgeSigilOptions(recipe) {
    return A.listSigianOwnedForgeSigilOptions?.(recipe?.school || "fire") || [];
  }

  function sigilOption(recipe, sigil) {
    if (!sigil?.collectibleId) return null;
    return A.getSigianForgeSigilOption?.(sigil.collectibleId, recipe?.school || "fire") || null;
  }

  function sigilName(recipe, sigil) {
    return sigilOption(recipe, sigil)?.displayName
      || sigilOption(recipe, sigil)?.canonicalName
      || String(sigil?.collectibleId || sigil?.sigilId || "Sigillo");
  }

  function sigilGlyph(recipe, sigil) {
    const option = sigilOption(recipe, sigil);
    return A.sigianContentSigilGlyph?.(option?.canonicalId) || "◈";
  }

  function selectedArtCard(recipe) {
    const set = artItems();
    const requested = String(recipe?.presentation?.imageKey || state.artCardId || "");
    let art = set.find(item => item.id === requested) || null;
    if (!art) {
      art = set.find(item => item.school === recipe?.school)
        || set[0]
        || null;
    }
    state.artCardId = art?.id || "";
    return art;
  }

  function artUrl(art) {
    return String(art?.image || "");
  }

  function ensureSession() {
    if (state.session) return state.session;
    const draft = A.loadSigianForgeDraft?.();
    state.session = A.createSigianForgeSession?.({ draft:draft || undefined }) || null;
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

  function geometryStyle() {
    const depth = Math.max(0, Math.min(100, Number(state.depth || 0)));
    return depthGeometryProperties(depth).map(([name, value]) => name + ":" + value).concat([
      "--lab-depth:" + depth + "px",
      "--lab-tilt-x:" + Number(state.tiltX || 0) + "deg",
      "--lab-tilt-y:" + Number(state.tiltY || 0) + "deg",
      "--lab-tilt-z:" + Number(state.tiltZ || 0) + "deg",
      "--lab-art-z:var(--lab-z-art)",
      "--lab-ui-z:var(--lab-z-floating)",
      "--lab-name-z:var(--lab-z-raised)",
      "--lab-sigil-z:var(--lab-z-impressed)"
    ]).join(";");
  }

  function depthGeometryProperties(depth) {
    return Object.entries(DEPTH_LAYERS).map(([name, multiplier]) => [
      "--lab-z-" + name,
      Math.round(depth * multiplier) + "px"
    ]).concat([["--lab-z-control-local", "2px"]]);
  }

  function sigilIdentityMarkup(recipe, sigil) {
    const option = sigilOption(recipe, sigil);
    const chips = [];
    if (sigil?.grade != null && !option?.atomic) {
      chips.push('<span class="forge-lab-chip grade">Grado ' + escapeHtml(({1:"I",2:"II",3:"III",4:"IV",5:"V"})[Number(sigil.grade)] || sigil.grade) + '</span>');
    } else if (option?.atomic) {
      chips.push('<span class="forge-lab-chip grade">Speciale</span>');
    }
    if (sigil?.intensity != null && Number(sigil.intensity) !== 0) {
      chips.push('<span class="forge-lab-chip">Intensità ' + escapeHtml(sigil.intensity) + '</span>');
    }
    if (option?.effectSchool) {
      chips.push('<span class="forge-lab-chip">' + escapeHtml(schoolLabel(option.effectSchool)) + '</span>');
    }
    return chips.join("");
  }

  function sigilNameLettersMarkup(name) {
    return [...String(name || "")].map((char, index) =>
      '<span class="forge-lab-sigil-letter" style="--lab-letter:' + index + '">' +
        (char === " " ? "&nbsp;" : escapeHtml(char)) +
      '</span>'
    ).join("");
  }

  function constraintDefinition(recipe) {
    return recipe?.constraint?.definitionId
      ? A.getSigianContent?.(recipe.constraint.definitionId, "constraint")
      : null;
  }

  function constraintName(recipe) {
    const definition = constraintDefinition(recipe);
    if (!definition) return "Vincolo";
    return A.materializeSigianContentName?.(definition.name, recipe.constraint?.school || recipe.school)
      || definition.name
      || "Vincolo";
  }

  function constraintCardMarkup(recipe) {
    const current = recipe.constraint || null;
    const name = current ? constraintName(recipe) : "Vincolo vuoto";
    return '<button type="button" class="forge-lab-constraint ' + (current ? "is-filled" : "is-empty") +
      (current?.school ? " school-" + escapeHtml(current.school) : "") +
      '" data-lab-constraint-main data-lab-depth-layer="floating" aria-label="' + escapeHtml(name) + '">' +
      '<span aria-hidden="true">◇</span>' +
      (current ? '<small>' + escapeHtml(name) + '</small>' : '<small>Vincolo</small>') +
    '</button>';
  }

  function sigilQuickMarkup(recipe, sigil) {
    if (state.inlineControl !== "sigil:" + sigil.slotId) return "";
    const slot = escapeHtml(sigil.slotId);
    const option = sigilOption(recipe, sigil);
    const grade = sigil?.grade == null ? "" : (({1:"I",2:"II",3:"III",4:"IV",5:"V"})[Number(sigil.grade)] || sigil.grade);
    return '<div class="forge-lab-sigil-quick" role="group" aria-label="Controllo rapido Sigillo">' +
      '<span>' + escapeHtml(option?.atomic ? "Sigillo speciale" : ("Grado " + grade)) + '</span>' +
      '<button type="button" data-lab-sigil-advanced="' + slot + '" aria-label="Dettaglio Sigillo">✦</button>' +
      '<button type="button" data-lab-quick-close aria-label="Chiudi controllo rapido">×</button>' +
    '</div>';
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
      const option = sigilOption(recipe, sigil);
      const imprint = state.imprintSlotId === sigil.slotId ? " is-imprinting" : "";
      const breaking = state.breakSlotId === sigil.slotId ? " is-breaking" : "";
      rows.push(
        '<div class="forge-lab-sigil-row forge-lab-control-anchor forge-lab-sigil-anchor' + imprint + breaking + '" data-lab-control-anchor="sigil" data-lab-depth-layer="impressed" data-lab-row="' + escapeHtml(sigil.slotId) + '" style="--lab-sigil-index:' + index + '">' +
          '<button type="button" class="forge-lab-cycle" data-lab-sigil-step="-1" data-lab-slot="' + escapeHtml(sigil.slotId) + '" aria-label="Sigillo precedente">‹</button>' +
          '<button type="button" class="forge-lab-sigil-mark" data-lab-sigil="' + escapeHtml(sigil.slotId) + '">' +
            '<span class="forge-lab-sigil-burn" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>' +
            '<span class="forge-lab-sigil-emblem" aria-hidden="true">' +
              '<span class="forge-lab-sigil-runes"><i>ᚨ</i><i>ᚱ</i><i>ᚲ</i><i>ᚾ</i><i>ᛟ</i><i>ᛉ</i></span>' +
              '<span class="forge-lab-sigil-glyph">' + escapeHtml(sigilGlyph(recipe, sigil)) + '</span>' +
            '</span>' +
            '<span class="forge-lab-sigil-copy">' +
              '<strong class="forge-lab-sigil-name">' + sigilNameLettersMarkup(sigilName(recipe, sigil)) + '</strong>' +
              '<span class="forge-lab-chip-row">' + sigilIdentityMarkup(recipe, sigil) + '</span>' +
            '</span>' +
          '</button>' +
          '<button type="button" class="forge-lab-cycle" data-lab-sigil-step="1" data-lab-slot="' + escapeHtml(sigil.slotId) + '" aria-label="Sigillo successivo">›</button>' +
          sigilQuickMarkup(recipe, sigil) +
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

    if (!["cost", "attack", "health"].includes(control)) return "";
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
      ? '<form class="forge-lab-nameplate forge-lab-name-editing' + longName + '" data-lab-depth-layer="raised" data-lab-name-inline-form>' +
          '<input name="name" maxlength="48" value="' + escapeHtml(name) + '" aria-label="Nome Formula" autocomplete="off">' +
        '</form>'
      : '<button type="button" class="forge-lab-nameplate' + longName + '" data-lab-depth-layer="raised" data-lab-edit-name><span>' + escapeHtml(name) + '</span></button>';

    return (
      '<div class="forge-lab-card-shell">' +
        '<article class="forge-lab-card school-' + escapeHtml(recipe.school) + ' type-' + escapeHtml(recipe.type) + (state.atmosphere ? "" : " no-atmosphere") + (state.imprintSlotId ? " is-ritual-active" : "") + '" style="' + geometryStyle() + '">' +
          '<div class="forge-lab-card-frame" data-lab-depth-layer="surface" aria-hidden="true"><span></span><i></i><i></i><i></i><i></i></div>' +
          '<div class="forge-lab-card-aura" aria-hidden="true"><i></i><i></i><i></i></div>' +
          '<div class="forge-lab-control-anchor forge-lab-art-anchor" data-lab-control-anchor="art" data-lab-depth-layer="art">' +
            '<button type="button" class="forge-lab-art-arrow is-prev" data-lab-art-step="-1" aria-label="Illustrazione precedente">‹</button>' +
            '<button type="button" class="forge-lab-art-layer" data-lab-art-main aria-label="Scegli o scorri illustrazione">' +
              (art ? '<img src="' + escapeHtml(artUrl(art)) + '" alt="' + escapeHtml(cardDisplayName(art)) + '">' : '<span class="forge-lab-art-fallback">✦</span>') +
            '</button>' +
            '<button type="button" class="forge-lab-art-arrow is-next" data-lab-art-step="1" aria-label="Illustrazione successiva">›</button>' +
          '</div>' +
          '<button type="button" class="forge-lab-cost" data-lab-depth-layer="floating" data-lab-control="cost"><small>COSTO</small><strong>' + escapeHtml(cost) + '</strong><em class="forge-lab-control-feedback" aria-hidden="true"></em></button>' +
          '<button type="button" class="forge-lab-type" data-lab-depth-layer="floating" data-lab-toggle-type>' + (recipe.type === "spell" ? "MAGIA" : "CREATURA") + '</button>' +
          '<div class="forge-lab-control-anchor forge-lab-school-anchor" data-lab-control-anchor="school" data-lab-depth-layer="floating">' +
            '<button type="button" class="forge-lab-school-nav is-prev" data-lab-school-step="-1" aria-label="Scuola precedente">‹</button>' +
            '<button type="button" class="forge-lab-school" data-lab-school-main aria-label="Scuola: ' + escapeHtml(schoolLabel(recipe.school)) + '. Tocca per scegliere; scorri per cambiare">' +
              schoolIconMarkup(recipe.school, "forge-lab-school-icon") +
            '</button>' +
            '<button type="button" class="forge-lab-school-nav is-next" data-lab-school-step="1" aria-label="Scuola successiva">›</button>' +
          '</div>' +
          nameplate +
          (recipe.type === "creature"
            ? '<div class="forge-lab-stats" data-lab-depth-layer="floating">' +
                '<button type="button" class="forge-lab-stat attack" data-lab-control="attack" aria-label="Attacco ' + escapeHtml(stats.attack ?? 0) + '"><span aria-hidden="true">⚔</span><strong>' + escapeHtml(stats.attack ?? 0) + '</strong><em class="forge-lab-control-feedback" aria-hidden="true"></em></button>' +
                '<button type="button" class="forge-lab-stat health" data-lab-control="health" aria-label="Vita ' + escapeHtml(stats.health ?? 1) + '"><span aria-hidden="true">♥</span><strong>' + escapeHtml(stats.health ?? 1) + '</strong><em class="forge-lab-control-feedback" aria-hidden="true"></em></button>' +
              '</div>'
            : "") +
          inlineControlMarkup(recipe) +
          constraintCardMarkup(recipe) +
          '<section class="forge-lab-sigils" aria-label="Sigilli">' + sigilRowsMarkup(recipe) + '</section>' +
        '</article>' +
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
    const arts = artItems();
    return modalShell(
      modalHeading("Illustrazione", "Scegli l’illustrazione completa", "Le ART disponibili provengono dall’Inventario canonico.") +
      '<div class="forge-lab-art-grid">' +
        arts.map(art =>
          '<button type="button" class="forge-lab-art-choice ' + (art.id === recipe.presentation?.imageKey ? "is-selected" : "") + '" data-lab-art-card="' + escapeHtml(art.id) + '">' +
            '<img src="' + escapeHtml(artUrl(art)) + '" alt="' + escapeHtml(cardDisplayName(art)) + '">' +
            '<small>' + escapeHtml(cardDisplayName(art)) + '</small>' +
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
    const options = forgeSigilOptions(recipe);
    return modalShell(
      modalHeading(
        "Sigilli Arcani",
        replace ? "Sostituisci Sigillo" : "Imprimi un Sigillo",
        "Mostra solo i Sigilli posseduti. Grado, portata e scaling fanno parte dell’identità del Sigillo."
      ) +
      '<div class="forge-lab-sigil-picker">' +
        options.map(option => {
          const selected = current?.collectibleId === option.id;
          const owned = Number(A.getSigianOwnedCollectibleSigilQuantity?.(option.id, recipe.school) ?? 0);
          const used = recipe.sigils.filter(item => item.collectibleId === option.id && item.slotId !== slotId).length;
          const available = Math.max(0, owned - used);
          const disabled = available < 1 && !selected;
          return '<button type="button" class="forge-lab-sigil-choice ' + (selected ? "is-selected " : "") + (disabled ? "is-disabled" : "") + '" ' +
            (replace ? 'data-lab-replace-collectible="' : 'data-lab-add-collectible="') + escapeHtml(option.id) + '"' +
            (replace ? ' data-lab-slot="' + escapeHtml(slotId) + '"' : "") +
            (disabled ? ' disabled' : '') + '>' +
              '<span aria-hidden="true">' + escapeHtml(A.sigianContentSigilGlyph?.(option.canonicalId) || "◈") + '</span>' +
              '<strong>' + escapeHtml(option.displayName) + '</strong>' +
              '<small>' + escapeHtml(option.summary || "") + '</small>' +
              '<em>Inventario ' + escapeHtml(available) + ' / ' + escapeHtml(owned) + '</em>' +
            '</button>';
        }).join("") +
      '</div>',
      "is-wide"
    );
  }

  function sigilEditorMarkup(recipe, slotId) {
    const sigil = recipe.sigils.find(item => item.slotId === slotId);
    if (!sigil) return sigilPickerMarkup(recipe);
    const option = sigilOption(recipe, sigil);
    const description = A.describeSigianRecipeSigil?.(recipe, sigil) || option?.summary || "";
    const grade = option?.atomic
      ? "Speciale"
      : (({1:"I",2:"II",3:"III",4:"IV",5:"V"})[Number(sigil.grade)] || sigil.grade || "—");
    const intensityValues = option?.intensityValues || [];
    const intensity = intensityValues.length > 1
      ? '<div class="forge-lab-field"><span>Intensità</span><div class="forge-lab-intensity-options">' +
          intensityValues.map(value =>
            '<button type="button" data-lab-intensity="' + escapeHtml(value) + '" data-lab-slot="' + escapeHtml(slotId) + '" class="' +
            (Number(sigil.intensity) === Number(value) ? "is-selected" : "") + '">' + escapeHtml(value) + '</button>'
          ).join("") +
        '</div></div>'
      : "";

    return modalShell(
      '<div class="forge-lab-sigil-editor-heading">' +
        '<span class="forge-lab-editor-glyph" aria-hidden="true">' + escapeHtml(sigilGlyph(recipe, sigil)) + '</span>' +
        modalHeading("Sigillo canonico", sigilName(recipe, sigil), description) +
      '</div>' +
      '<div class="forge-lab-editor-grid">' +
        '<div class="forge-lab-field"><span>Tipo</span><strong>Sigillo</strong></div>' +
        '<div class="forge-lab-field"><span>Grado</span><strong>' + escapeHtml(grade) + '</strong></div>' +
        (option?.effectSchool ? '<div class="forge-lab-field"><span>Scuola</span><strong>' + escapeHtml(schoolLabel(option.effectSchool)) + '</strong></div>' : "") +
        intensity +
      '</div>' +
      '<p class="forge-lab-canonical-note">Bersaglio, portata e scaling sono incorporati nell’identità canonica. I Modifier runtime non sono contenuto modificabile.</p>' +
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
    const option = sigilOption(recipe, sigil);
    const description = A.describeSigianRecipeSigil?.(recipe, sigil) || option?.summary || "";
    const grade = option?.atomic
      ? "Speciale"
      : (({1:"I",2:"II",3:"III",4:"IV",5:"V"})[Number(sigil.grade)] || sigil.grade || "—");
    return modalShell(
      '<div class="forge-lab-sigil-detail">' +
        '<span class="forge-lab-detail-glyph" aria-hidden="true">' + escapeHtml(sigilGlyph(recipe, sigil)) + '</span>' +
        modalHeading("Dettaglio Sigillo", sigilName(recipe, sigil), description) +
        '<div class="forge-lab-detail-meta">' +
          '<span><small>Tipo</small><strong>Sigillo</strong></span>' +
          '<span><small>Grado</small><strong>' + escapeHtml(grade) + '</strong></span>' +
          (sigil.intensity != null ? '<span><small>Intensità</small><strong>' + escapeHtml(sigil.intensity) + '</strong></span>' : "") +
        '</div>' +
        '<p class="forge-lab-hold-note">Pressione lunga: dettaglio · tocco breve: controlli rapidi</p>' +
      '</div>'
    );
  }

  function constraintPickerMarkup(recipe) {
    const definitions = A.listSigianContent?.({ kind:"constraint", status:"approved" }) || [];
    return modalShell(
      modalHeading("Vincolo globale", "Scegli un Vincolo", "La lista è la stessa usata dalla Forgia, dall’Inventario e dal resto di SIGIAN.") +
      '<div class="forge-lab-constraint-picker">' +
        definitions.map(definition => {
          const schoolBound = /<Scuola>/.test(String(definition.name || ""));
          const gradeLess = /senza Gradi/i.test(String(definition.grades || ""));
          const probe = {
            definitionId:definition.id,
            school:schoolBound ? recipe.school : null,
            grade:gradeLess ? null : 1
          };
          const owned = Number(A.getSigianOwnedConstraintQuantity?.(probe) ?? 0);
          const disabled = owned < 1;
          const name = A.materializeSigianContentName?.(definition.name, recipe.school) || definition.name;
          return '<button type="button" class="forge-lab-constraint-choice ' + (disabled ? "is-disabled" : "") +
            '" data-lab-constraint-id="' + escapeHtml(definition.id) + '"' + (disabled ? ' disabled' : '') + '>' +
            '<span aria-hidden="true">◇</span><strong>' + escapeHtml(name) + '</strong>' +
            '<small>' + escapeHtml(definition.summary || "") + '</small><em>Inventario ×' + escapeHtml(owned) + '</em>' +
          '</button>';
        }).join("") +
      '</div>',
      "is-wide"
    );
  }

  function constraintEditorMarkup(recipe) {
    const current = recipe.constraint;
    if (!current) return constraintPickerMarkup(recipe);
    const definition = constraintDefinition(recipe);
    const description = A.describeSigianConstraint?.(current) || definition?.summary || "";
    const schoolBound = /<Scuola>/.test(String(definition?.name || ""));
    const gradeLess = /senza Gradi/i.test(String(definition?.grades || ""));
    const specs = A.getSigianForgeConstraintParameters?.(current) || [];
    const gradeDriven = specs.some(spec => spec.drivesGrade);

    const schoolControl = schoolBound
      ? '<label class="forge-lab-field"><span>Scuola</span><select data-lab-constraint-school>' +
          activeSchools().map(school => '<option value="' + escapeHtml(school.id) + '" ' +
            (current.school === school.id ? "selected" : "") + '>' + escapeHtml(schoolLabel(school.id)) + '</option>').join("") +
        '</select></label>'
      : "";

    const gradeControl = !gradeLess && !gradeDriven
      ? '<label class="forge-lab-field"><span>Grado</span><select data-lab-constraint-grade>' +
          [1,2,3,4,5].map(grade => '<option value="' + grade + '" ' +
            (Number(current.grade || 1) === grade ? "selected" : "") + '>' +
            escapeHtml(({1:"I",2:"II",3:"III",4:"IV",5:"V"})[grade]) + '</option>').join("") +
        '</select></label>'
      : "";

    const params = specs.map(spec =>
      '<div class="forge-lab-field"><span>' + escapeHtml(({intensity:"Intensità",threshold:"Soglia",damage:"Danno"})[spec.key] || spec.key) + '</span>' +
        '<div class="forge-lab-intensity-options">' +
          spec.values.map(value => '<button type="button" data-lab-constraint-param="' + escapeHtml(spec.key) +
            '" data-lab-constraint-value="' + escapeHtml(value) + '" class="' +
            (Number(spec.value) === Number(value) ? "is-selected" : "") + '">' + escapeHtml(value) + '</button>').join("") +
        '</div></div>'
    ).join("");

    return modalShell(
      '<div class="forge-lab-sigil-editor-heading">' +
        '<span class="forge-lab-editor-glyph" aria-hidden="true">◇</span>' +
        modalHeading("Vincolo canonico", constraintName(recipe), description) +
      '</div>' +
      '<div class="forge-lab-editor-grid">' +
        '<div class="forge-lab-field"><span>Tipo</span><strong>Vincolo</strong></div>' +
        schoolControl + gradeControl + params +
      '</div>' +
      '<div class="forge-lab-editor-actions">' +
        '<button type="button" class="classic-stone-button ghost" data-lab-open-constraint-picker>Cambia Vincolo</button>' +
        '<button type="button" class="classic-stone-button danger" data-lab-remove-constraint>Rimuovi Vincolo</button>' +
      '</div>',
      "is-editor"
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
    if (modal.type === "constraint-picker") return constraintPickerMarkup(recipe);
    if (modal.type === "constraint-edit") return constraintEditorMarkup(recipe);
    return "";
  }

  function motionStatusText() {
    if (!state.motionEnabled) return "Disattivato · il trascinamento manuale resta disponibile.";
    return {
      granted: "Attivo · sensori relativi, mouse e touch disponibili.",
      denied: "Sensori non autorizzati · fallback mouse e touch attivo.",
      unsupported: "Sensori non disponibili · fallback mouse e touch attivo.",
      reduced: "Ridotto dalle preferenze di sistema · editing invariato."
    }[state.motionSensorStatus] || "Attivo · rilevamento delle capacità in corso.";
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
          '<label class="forge-lab-motion-toggle"><input type="checkbox" data-lab-motion ' + (state.motionEnabled ? "checked" : "") + '> Movimento carta</label>' +
          '<p class="forge-lab-motion-status" data-lab-motion-status aria-live="polite">' + escapeHtml(motionStatusText()) + '</p>' +
          "<p>Il movimento è temporaneo: al rilascio la Formula torna progressivamente al proprio assetto neutro.</p>" +
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
    depthGeometryProperties(depth).forEach(([name, value]) => card.style.setProperty(name, value));
    card.style.setProperty("--lab-art-z", "var(--lab-z-art)");
    card.style.setProperty("--lab-ui-z", "var(--lab-z-floating)");
    card.style.setProperty("--lab-name-z", "var(--lab-z-raised)");
    card.style.setProperty("--lab-sigil-z", "var(--lab-z-impressed)");
  }

  function cycleArt(recipe, delta) {
    const session = ensureSession();
    const set = artItems();
    if (!session || !set.length) return;
    const current = selectedArtCard(recipe);
    const index = Math.max(0, set.findIndex(art => art.id === current?.id));
    const next = set[(index + Number(delta) + set.length) % set.length];
    mutate(() => session.setArt(next.id));
    state.artCardId = next.id;
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
    state.imprintSlotId = slotId;
    state.modal = null;
    render();
    window.setTimeout(() => {
      if (state.imprintSlotId !== slotId) return;
      state.imprintSlotId = null;
      render();
    }, duration);
  }

  function cycleSigil(recipe, slotId, delta) {
    const session = ensureSession();
    const list = forgeSigilOptions(recipe);
    const current = recipe.sigils.find(item => item.slotId === slotId);
    if (!session || !current || !list.length) return;
    const index = Math.max(0, list.findIndex(item => item.id === current.collectibleId));
    const next = list[(index + Number(delta) + list.length) % list.length];
    mutate(() => session.replaceCollectibleSigil(slotId, next.id));
    playImprint(slotId, { quick:true });
  }

  function controlValue(recipe, kind) {
    if (kind === "cost") return state.cost == null ? 0 : Number(state.cost);
    if (kind === "health") return Number(recipe.stats?.health ?? 1);
    return Number(recipe.stats?.attack ?? 0);
  }

  function changeCardControl(session, kind, delta, button = null) {
    const amount = Number(delta || 0);
    if (!amount) return 0;

    const previous = controlValue(session.snapshot().draft.recipe, kind);
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
      button.setAttribute("aria-label", (kind === "attack" ? "Attacco " : kind === "health" ? "Vita " : "Costo ") + next);
      const feedback = button.querySelector(".forge-lab-control-feedback");
      if (feedback && next !== previous) {
        const actual = next - previous;
        feedback.textContent = actual > 0 ? "+" + actual : "−" + Math.abs(actual);
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

      const finish = event => {
        if (event.pointerId !== pointerId) return;
        clearTimer();
        suppressClick = suppressClick || active || event.type !== "pointerup";
        active = false;
        button.classList.remove("is-scrubbing");
        button.style.setProperty("--lab-control-lean", "0deg");
        const id = pointerId;
        pointerId = null;
        if (button.hasPointerCapture(id)) button.releasePointerCapture(id);
        event.stopPropagation();
      };

      button.addEventListener("pointerdown", event => {
        if (pointerId != null || event.isPrimary === false || (event.pointerType === "mouse" && event.button !== 0)) return;
        startX = event.clientX;
        startY = event.clientY;
        lastStep = 0;
        suppressClick = false;
        pointerId = event.pointerId;
        button.setPointerCapture(pointerId);
        event.stopPropagation();
        clearTimer();
        timer = window.setTimeout(() => {
          timer = 0;
          active = true;
          state.inlineControl = null;
          root.querySelectorAll("[data-lab-inline-wheel]").forEach(wheel => wheel.remove());
          button.classList.add("is-scrubbing");
        }, 190);
      });

      button.addEventListener("pointermove", event => {
        if (event.pointerId !== pointerId) return;
        event.stopPropagation();
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        if (!active) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) > 10) {
            clearTimer();
            suppressClick = true;
          }
          return;
        }
        const axis = Math.abs(dx) > Math.abs(dy) ? dx : -dy;
        const step = Math.trunc(axis / 22);
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
        if (suppressClick && event.detail !== 0) {
          suppressClick = false;
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

  // One captured pointer; vertical movement remains native page scrolling.
  function bindHorizontalControl(button, onStep, onTap) {
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let axis = null;
    let suppressClick = false;

    const release = () => {
      const id = pointerId;
      pointerId = null;
      if (id != null && button.hasPointerCapture(id)) button.releasePointerCapture(id);
    };
    button.addEventListener("dragstart", event => event.preventDefault());
    button.addEventListener("pointerdown", event => {
      if (pointerId != null || event.isPrimary === false || (event.pointerType === "mouse" && event.button !== 0)) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      axis = null;
      suppressClick = false;
      button.setPointerCapture(pointerId);
      event.stopPropagation();
    });
    button.addEventListener("pointermove", event => {
      if (event.pointerId !== pointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (!axis && Math.max(Math.abs(dx), Math.abs(dy)) > 34) {
        axis = Math.abs(dx) > Math.abs(dy) * 1.15 ? "horizontal" : "vertical";
        suppressClick = true;
      }
      if (axis === "horizontal") event.preventDefault();
      event.stopPropagation(); // Keep the card tilt still during manipulation.
    });
    button.addEventListener("pointerup", event => {
      if (event.pointerId !== pointerId) return;
      const dx = event.clientX - startX;
      const step = axis === "horizontal" && Math.abs(dx) > 34 ? (dx < 0 ? -1 : 1) : 0;
      release();
      event.stopPropagation();
      if (step) onStep(step);
    });
    ["pointercancel", "lostpointercapture"].forEach(type => button.addEventListener(type, event => {
      if (event.pointerId !== pointerId) return;
      suppressClick = true;
      release();
    }));
    button.addEventListener("click", event => {
      event.stopPropagation();
      if (suppressClick && event.detail !== 0) {
        event.preventDefault();
        suppressClick = false;
        return;
      }
      onTap();
    });
  }

  function bindArtControl(root, recipe) {
    const art = root.querySelector("[data-lab-art-main]");
    if (!art) return;
    bindHorizontalControl(art, delta => cycleArt(recipe, delta), () => {
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
    bindHorizontalControl(button, delta => cycleSchool(recipe, delta), () => {
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
        motionController.setDirect(false);
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
        motionController.setDirect(true);
        card.classList.remove("is-returning");
        card.classList.add("is-grabbed");
        try { card.setPointerCapture(pointerId); } catch {}
      }, 150);
    });

    card.addEventListener("pointermove", event => {
      if (!active || event.pointerId !== pointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const rotateY = clamp(dx / 12, -MOTION_LIMIT_Y, MOTION_LIMIT_Y);
      const rotateX = clamp(-dy / 14, -MOTION_LIMIT_X, MOTION_LIMIT_X);
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
          state.inlineControl = null;
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
        const slotId = button.dataset.labSigil;
        state.modal = null;
        state.inlineControl = state.inlineControl === "sigil:" + slotId ? null : "sigil:" + slotId;
        render();
      });
    });
  }

  function bindSigilQuick(root, session) {
    root.querySelectorAll("[data-lab-sigil-advanced]").forEach(button => button.addEventListener("click", () => {
      state.inlineControl = null;
      state.modal = { type:"sigil-edit", slotId:button.dataset.labSigilAdvanced };
      render();
    }));
    root.querySelectorAll("[data-lab-quick-close]").forEach(button => button.addEventListener("click", () => {
      state.inlineControl = null;
      render();
    }));
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

    root.querySelector("[data-lab-constraint-main]")?.addEventListener("click", () => {
      state.inlineControl = null;
      state.modal = { type:recipe.constraint ? "constraint-edit" : "constraint-picker" };
      render();
    });

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
      mutate(() => session.setArt(button.dataset.labArtCard));
      state.artCardId = button.dataset.labArtCard;
      state.modal = null;
      render();
    }));

    root.querySelectorAll("[data-lab-school]").forEach(button => button.addEventListener("click", () => {
      mutate(() => session.setSchool(button.dataset.labSchool));
      state.modal = null;
      render();
    }));

    root.querySelectorAll("[data-lab-add-collectible]").forEach(button => button.addEventListener("click", () => {
      const result = mutate(() => session.addCollectibleSigil(button.dataset.labAddCollectible));
      const slotId = result.draft.recipe.sigils.at(-1)?.slotId || null;
      if (slotId) {
        state.inlineControl = "sigil:" + slotId;
        playImprint(slotId);
      } else render();
    }));

    root.querySelectorAll("[data-lab-replace-collectible]").forEach(button => button.addEventListener("click", () => {
      const slotId = button.dataset.labSlot;
      mutate(() => session.replaceCollectibleSigil(slotId, button.dataset.labReplaceCollectible));
      state.inlineControl = "sigil:" + slotId;
      playImprint(slotId);
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

    root.querySelectorAll("[data-lab-intensity]").forEach(button => button.addEventListener("click", () => {
      const slotId = button.dataset.labSlot;
      mutate(() => session.setSigilIntensity(slotId, Number(button.dataset.labIntensity)));
      state.modal = { type:"sigil-edit", slotId };
      render();
    }));

    root.querySelectorAll("[data-lab-constraint-id]").forEach(button => button.addEventListener("click", () => {
      mutate(() => session.setConstraint(button.dataset.labConstraintId));
      state.modal = { type:"constraint-edit" };
      render();
    }));

    root.querySelector("[data-lab-open-constraint-picker]")?.addEventListener("click", () => {
      state.modal = { type:"constraint-picker" };
      render();
    });

    root.querySelector("[data-lab-remove-constraint]")?.addEventListener("click", () => {
      mutate(() => session.removeConstraint());
      state.modal = null;
      render();
    });

    root.querySelector("[data-lab-constraint-school]")?.addEventListener("change", event => {
      mutate(() => session.setConstraintSchool(event.currentTarget.value));
      state.modal = { type:"constraint-edit" };
      render();
    });

    root.querySelector("[data-lab-constraint-grade]")?.addEventListener("change", event => {
      mutate(() => session.setConstraintGrade(Number(event.currentTarget.value)));
      state.modal = { type:"constraint-edit" };
      render();
    });

    root.querySelectorAll("[data-lab-constraint-param]").forEach(button => button.addEventListener("click", () => {
      mutate(() => session.setConstraintParameter(
        button.dataset.labConstraintParam,
        Number(button.dataset.labConstraintValue)
      ));
      state.modal = { type:"constraint-edit" };
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

    root.querySelector("[data-lab-motion]")?.addEventListener("change", async event => {
      const toggle = event.currentTarget;
      toggle.disabled = true;
      const status = await motionController.setEnabled(Boolean(toggle.checked));
      toggle.disabled = false;
      toggle.checked = state.motionEnabled;
      const output = root.querySelector("[data-lab-motion-status]");
      if (output) output.textContent = motionStatusText(status);
    });

    const stage = root.querySelector(".forge-lab-card-stage");
    const card = root.querySelector(".forge-lab-card");
    motionController.attach(root, stage, card);
    stage?.addEventListener("pointermove", event => motionController.pointer(event));
    stage?.addEventListener("pointerleave", () => motionController.pointerLeave());

    bindDirectControls(root, recipe, session);
    bindArtControl(root, recipe);
    bindInlineName(root, session);
    bindTypeToggle(root, recipe, session);
    bindSchoolControl(root, recipe);
    bindCardGrab(root);
    bindLongPress(root);
    bindSigilQuick(root, session);
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
    suspendMotion: () => motionController.suspend(),
    resetSession() {
      state.session = null;
    }
  });
})(window.Arcane = window.Arcane || {});
