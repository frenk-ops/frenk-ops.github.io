(function (A) {
  "use strict";

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const sessionSets = {
    "astral-original": A.getCardSet("astral-original")
  };

  let engine = null;
  let activeSchool = "fire";
  let enemySchool = "fire";
  let enemyRevealedModalOpen = false;
  let animationSpeed = 1;
  let cardArtStyle = "original";
  let soundEnabled = true;
  let busy = false;
  let audioContext = null;
  const originalSoundCache = new Map();
  let profile = A.loadProfile();
  let tournament = A.loadTournament();
  let tournamentMatch = false;
  let matchRecorded = false;
  const urlParams = new URLSearchParams(window.location.search);
  const UI_MODE = urlParams.get("ui") === "essential" ? "essential" : "classic";
  document.body.classList.toggle("ui-essential", UI_MODE === "essential");
  document.body.classList.toggle("ui-classic", UI_MODE === "classic");
  document.body.dataset.uiMode = UI_MODE;
  let inspectedCardId = null;
  let inspectedCardSide = null;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false;
  let turnBannerTimer = null;
  let previewCloseTimer = null;
  let currentDuelLaunch = null;
  const collectionState = { school: "all", type: "all", level: "all", search: "" };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[char]));
  }

  function bindTapAction(element, handler) {
    if (!element) return;
    element.type = "button";
    let suppressNextClick = false;
    const run = event => {
      const isTouchInput = event.type === "touchstart" || (event.type === "pointerdown" && event.pointerType === "touch");
      if (isTouchInput) {
        if (event.cancelable) event.preventDefault();
        suppressNextClick = true;
        handler(event);
        return;
      }
      if (event.type === "click" && suppressNextClick) {
        suppressNextClick = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      suppressNextClick = false;
      handler(event);
    };
    element.addEventListener("click", run);
    element.addEventListener("touchstart", run, { passive: false });
    element.addEventListener("pointerdown", run);
  }

  function school(id) {
    return A.SCHOOLS.find(item => item.id === id) || A.SCHOOLS[0];
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms * animationSpeed));
  }

  function setupLocalServerLifecycle() {
    if (!/^https?:$/.test(location.protocol) || !["127.0.0.1", "localhost", "::1"].includes(location.hostname)) return;
    const clientId = globalThis.crypto?.randomUUID?.()
      || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const endpoint = action => `/__arcane_duels__/${action}?client=${encodeURIComponent(clientId)}`;
    let heartbeatTimer = null;
    let connected = false;

    const heartbeat = () => fetch(endpoint("heartbeat"), { cache: "no-store" })
      .then(response => {
        if (!response.ok) throw new Error("Lifecycle endpoint unavailable");
        connected = true;
        if (!heartbeatTimer) heartbeatTimer = setInterval(heartbeat, 2500);
      })
      .catch(() => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        connected = false;
      });

    window.addEventListener("pagehide", () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (connected) navigator.sendBeacon(endpoint("close"), new Blob([], { type: "text/plain" }));
    }, { once: true });
    heartbeat();
  }

  function switchView(name) {
    $$(".view").forEach(view => view.classList.remove("active"));
    $$(".tab").forEach(tab => tab.classList.remove("active"));
    $(`#${name}View`)?.classList.add("active");
    $(`.tab[data-view="${name}"]`)?.classList.add("active");
    if (name === "tournament") renderTournament();
    if (name === "profile") renderProfile();
    if (name === "rules") renderRuleset();
  }

  $$(".tab").forEach(tab => tab.addEventListener("click", () => switchView(tab.dataset.view)));

  $$('[data-view-jump]').forEach(button => button.addEventListener('click', () => {
    const view = button.dataset.viewJump;
    if (view === 'game') restartDuel();
    switchView(view);
  }));

  function ensureAudio() {
    if (!soundEnabled) return null;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    if (!audioContext) audioContext = new Context();
    if (audioContext.state === "suspended") audioContext.resume();
    return audioContext;
  }

  function playSyntheticCue(options = {}) {
    const ctx = ensureAudio();
    if (!ctx) return false;
    const now = ctx.currentTime;
    const duration = Math.max(0.08, Number(options.duration || 0.22));
    const volume = Math.max(0.0001, Math.min(0.18, Number(options.volume || 0.05)));
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = options.type || "sine";
    osc.frequency.setValueAtTime(options.frequency || 440, now);
    if (options.secondFrequency) {
      osc.frequency.exponentialRampToValueAtTime(options.secondFrequency, now + duration * 0.65);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + Math.min(0.02, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.01);
    return true;
  }

  function playFallbackSound(name, volume = 0.45) {
    if (!soundEnabled || UI_MODE === "essential") return false;
    const normalized = String(name || "");
    if (normalized === "summon2") {
      return playSyntheticCue({
        type: "triangle",
        frequency: 620,
        secondFrequency: 940,
        duration: 0.26,
        volume: Math.min(0.07, Math.max(0.04, volume * 0.16))
      });
    }
    if (normalized === "click") {
      return playSyntheticCue({
        type: "square",
        frequency: 820,
        secondFrequency: 560,
        duration: 0.14,
        volume: Math.min(0.06, Math.max(0.03, volume * 0.14))
      });
    }
    if (normalized === "move" || normalized === "movecard") {
      return playSyntheticCue({
        type: "sawtooth",
        frequency: 300,
        secondFrequency: 420,
        duration: 0.2,
        volume: Math.min(0.06, Math.max(0.03, volume * 0.14))
      });
    }
    if (normalized === "spelldamaged") {
      return playSyntheticCue({
        type: "sine",
        frequency: 220,
        secondFrequency: 980,
        duration: 0.34,
        volume: Math.min(0.07, Math.max(0.04, volume * 0.16))
      });
    }
    if (normalized === "winner") {
      return playSyntheticCue({
        type: "triangle",
        frequency: 650,
        secondFrequency: 1320,
        duration: 0.42,
        volume: Math.min(0.08, Math.max(0.04, volume * 0.16))
      });
    }
    if (normalized === "looser") {
      return playSyntheticCue({
        type: "sine",
        frequency: 180,
        secondFrequency: 120,
        duration: 0.38,
        volume: Math.min(0.06, Math.max(0.04, volume * 0.16))
      });
    }
    return playSyntheticCue({ type: "sine", frequency: 440, duration: 0.16, volume: 0.04 });
  }

  function playOriginalSound(name, volume = 0.45) {
    if (!soundEnabled || UI_MODE === "essential") return false;
    try {
      let source = originalSoundCache.get(name);
      if (!source) {
        source = new Audio(`assets/audio/original/${name}.ogg`);
        source.preload = "auto";
        originalSoundCache.set(name, source);
      }
      const sound = source.cloneNode();
      sound.volume = Math.max(0, Math.min(1, volume));
      const playPromise = sound.play();
      playPromise?.catch(() => {
        try { sound.pause(); } catch (e) {}
        playFallbackSound(name, volume);
      });
      return true;
    } catch (error) {
      return playFallbackSound(name, volume);
    }
  }

  function playSchoolSelectionSound() {
    return playSyntheticCue({ type: "triangle", frequency: 560, secondFrequency: 780, duration: 0.16, volume: 0.045 });
  }

  function playCardReadySound() {
    return playSyntheticCue({ type: "sine", frequency: 720, secondFrequency: 1120, duration: 0.22, volume: 0.05 });
  }

  function attackSound(direct) {
    if (playOriginalSound(direct ? "move" : "movecard", 0.36)) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = direct ? "triangle" : "sawtooth";
    osc.frequency.setValueAtTime(direct ? 410 : 520, now);
    osc.frequency.exponentialRampToValueAtTime(direct ? 95 : 75, now + 0.24);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.27);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.28);
  }

  function spellSound() {
    if (playOriginalSound("spelldamaged", 0.42)) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.32);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  function setMessage(text) {
    $("#message").textContent = text;
  }

  function renderTalentChoices() {
    const root = $("#talentChoices");
    const mode = $("#duelModeSelect")?.value || "normal";
    const withSpecializations = mode === "specializations";
    root.innerHTML = "";
    $("#talentChoiceHeading").textContent = withSpecializations ? "Scegli la specializzazione" : "Duello normale";
    $("#astralLeagueLabel").classList.toggle("hidden", !withSpecializations);
    $("#enemySpecializationLabel").classList.toggle("hidden", !withSpecializations);
    if (!withSpecializations) {
      const button = document.createElement("button");
      button.className = "talent";
      button.innerHTML = `<span>⚔️</span><strong>Avvia duello normale</strong><small>Nessuna specializzazione. Regole e 65 carte originali.</small>`;
      button.addEventListener("click", () => startDuel("fire", false, null, "normal"));
      root.appendChild(button);
      return;
    }
    A.ASTRAL_SPECIALIZATIONS.forEach(item => {
      const button = document.createElement("button");
      button.className = "talent";
      const starting = A.getAstralAbilityRecords(item.groups[0]).map(ability => ability.name).join(" · ");
      button.innerHTML = `<span>${item.icon}</span><strong>${item.name}</strong><small>${starting}</small>`;
      button.addEventListener("click", () => startDuel(item.talent, false, item.id, "specializations"));
      root.appendChild(button);
    });
  }

  function setupDifficultyOptions() {
    $("#difficultySelect").innerHTML = Object.values(A.DIFFICULTIES)
      .map(item => `<option value="${item.id}" ${item.id === "advanced" ? "selected" : ""}>${item.label}</option>`)
      .join("");
  }

  function setupAstralSpecializationOptions() {
    $("#enemySpecializationSelect").innerHTML = A.ASTRAL_SPECIALIZATIONS
      .map(item => `<option value="${item.id}" ${item.id === "stormmage" ? "selected" : ""}>${item.icon} ${item.name}</option>`)
      .join("");
  }

  function createDuelSeed() {
    if (globalThis.crypto?.getRandomValues) {
      const values = new Uint32Array(2);
      globalThis.crypto.getRandomValues(values);
      return `duel-${Date.now().toString(36)}-${values[0].toString(36)}${values[1].toString(36)}`;
    }
    return `duel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  function startDuel(playerTalent, fromTournament, selectedSpecialization, requestedMode, seedOverride = null) {
    const setId = "astral-original";
    const duelMode = fromTournament ? "specializations" : (requestedMode || $("#duelModeSelect")?.value || "normal");
    const withSpecializations = duelMode === "specializations";
    const opponent = fromTournament ? tournament.opponents[tournament.currentMatch] : null;
    const requestedSeed = $("#seedInput").value.trim();
    const seed = fromTournament
      ? `${tournament.seed}-match-${tournament.currentMatch + 1}`
      : (seedOverride || requestedSeed || createDuelSeed());
    const difficulty = fromTournament ? opponent.difficulty : $("#difficultySelect").value;
    tournamentMatch = Boolean(fromTournament);
    matchRecorded = false;
    activeSchool = playerTalent;
    const originalMode = setId === "astral-original";
    const duelRules = originalMode
      ? { ...A.ASTRAL_ORIGINAL_RULESET }
      : { startingHp: setId === "arcane" ? 30 : A.DEFAULT_RULESET.startingHp };
    engine = new A.GameEngine({
      cards: sessionSets[setId],
      seed,
      playerTalent,
      enemyTalent: opponent?.talent,
      playerPassives: fromTournament ? tournament.selectedPassives : [],
      enemyPassives: opponent?.passives || [],
      rules: duelRules,
      aiDifficulty: difficulty,
      astralMode: fromTournament ? "tournament" : "duel",
      astralLeague: originalMode ? (fromTournament ? (tournament.astralLeague || "starting") : ($("#astralLeagueSelect")?.value || "starting")) : undefined,
      playerSpecialization: withSpecializations ? (fromTournament ? tournament.specialization : selectedSpecialization) : undefined,
      enemySpecialization: withSpecializations ? (fromTournament ? opponent?.specialization : ($("#enemySpecializationSelect")?.value || undefined)) : undefined,
      playerAstralAbilities: withSpecializations ? undefined : [],
      enemyAstralAbilities: withSpecializations ? undefined : []
    });
    engine.aiDifficulty = difficulty;
    currentDuelLaunch = {
      playerTalent,
      fromTournament: Boolean(fromTournament),
      selectedSpecialization,
      requestedMode: duelMode,
      seed
    };
    enemySchool = engine.state.enemy.talent;
    inspectedCardId = engine.state.player.hand[0]?.id || allAstralCards()[0]?.id || null;
    inspectedCardSide = "player";
    $("#setupPanel").classList.add("hidden");
    $("#battlePanel").classList.remove("hidden");
    const generation = engine.state.generationDiagnostics?.[0];
    $("#seedBadge").textContent = generation ? `seed: ${seed} · libro: ${generation.generationAttempt} tentativi` : `seed: ${seed}`;
    $("#duelSessionActions")?.classList.add("hidden");
    $("#duelMenuBtn")?.setAttribute("aria-expanded", "false");
    busy = false;
    clearFxLayer();
    switchView("game");
    setMessage("");
    renderGame();
    showTurnBanner("Il tuo turno", "player", 900);
  }

  function restartDuel() {
    engine = null;
    busy = false;
    tournamentMatch = false;
    $("#battlePanel").classList.add("hidden");
    $("#setupPanel").classList.remove("hidden");
    clearFxLayer();
    setMessage("");
  }

  $("#restartBtn").addEventListener("click", restartDuel);
  $("#duelMenuBtn")?.addEventListener("click", () => {
    if (tournamentMatch) return restartDuel();
    const actions = $("#duelSessionActions");
    const willOpen = actions?.classList.contains("hidden");
    actions?.classList.toggle("hidden", !willOpen);
    $("#duelMenuBtn").setAttribute("aria-expanded", String(Boolean(willOpen)));
  });
  $("#restartSameSetsBtn")?.addEventListener("click", () => {
    if (!currentDuelLaunch || busy) return;
    const launch = currentDuelLaunch;
    startDuel(launch.playerTalent, launch.fromTournament, launch.selectedSpecialization, launch.requestedMode, launch.seed);
  });
  $("#startNewDrawBtn")?.addEventListener("click", () => {
    if (!currentDuelLaunch || busy) return;
    const launch = currentDuelLaunch;
    const nextSeed = createDuelSeed();
    $("#seedInput").value = "";
    startDuel(launch.playerTalent, false, launch.selectedSpecialization, launch.requestedMode, nextSeed);
  });

  function fxDuration(ms) {
    if (reducedMotion) return 0;
    return Math.max(0, ms * animationSpeed);
  }

  function showTurnBanner(text, tone = "player", duration = 950) {
    const banner = $("#turnBanner");
    if (!banner) return;
    clearTimeout(turnBannerTimer);
    banner.textContent = text;
    banner.className = `turn-banner show tone-${tone}`;
    turnBannerTimer = setTimeout(() => {
      banner.className = "turn-banner";
    }, fxDuration(duration) || 40);
  }

  function clearFxLayer() {
    const layer = $("#duelFxLayer");
    if (layer) layer.innerHTML = "";
  }

  function createAttackTrail(attacker, target, side) {
    if (reducedMotion || !attacker || !target) return null;
    const layer = $("#duelFxLayer");
    if (!layer) return null;
    const a = attacker.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const x1 = a.left + a.width / 2;
    const y1 = a.top + a.height / 2;
    const x2 = b.left + b.width / 2;
    const y2 = b.top + b.height / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const trail = document.createElement("div");
    trail.className = `attack-trail side-${side}`;
    trail.style.left = `${x1}px`;
    trail.style.top = `${y1}px`;
    trail.style.width = `${Math.hypot(dx, dy)}px`;
    trail.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    layer.appendChild(trail);
    setTimeout(() => trail.remove(), fxDuration(520) || 40);
    return trail;
  }

  async function animateCardPlay(result, side, slot = null) {
    if (!result?.card) return;
    const card = result.card;
    const layer = $("#duelFxLayer");
    if (!reducedMotion && layer) {
      const cast = document.createElement("div");
      cast.className = `cast-card school-${card.school} ${card.type === "spell" ? "spell-cast" : "creature-cast"} side-${side}`;
      const art = document.createElement("div");
      art.className = "cast-card-art";
      art.appendChild(buildArtBlock(card, "cast"));
      const label = document.createElement("strong");
      label.textContent = card.name;
      cast.appendChild(art);
      cast.appendChild(label);
      layer.appendChild(cast);
      requestAnimationFrame(() => cast.classList.add("active"));
      setTimeout(() => cast.remove(), fxDuration(820) || 40);
    }
    const panel = $("#battlePanel");
    panel?.classList.add(card.type === "spell" ? `spell-impact-${card.school}` : "summon-impact");
    setTimeout(() => panel?.classList.remove(`spell-impact-${card.school}`, "summon-impact"), fxDuration(520) || 40);
    if (card.type === "creature" && slot !== null) {
      await sleep(45);
      const target = $(`#${side}Board [data-slot="${slot}"]`);
      target?.classList.add("summon-arrival");
      setTimeout(() => target?.classList.remove("summon-arrival"), fxDuration(700) || 40);
    }
    // Keep the cast readable as a distinct beat before combat starts.
    // `sleep` and the removal timer share the same speed multiplier.
    await sleep(reducedMotion ? 0 : 760);
  }

  function updatePhaseVisual(state) {
    const battle = $("#battlePanel");
    if (!battle) return;
    battle.dataset.phase = state.phase;
    battle.classList.toggle("targeting-slot", state.phase === A.PHASES.PLAYER_TARGET);
    battle.classList.toggle("enemy-active", [A.PHASES.ENEMY_THINK, A.PHASES.ENEMY_PLAY, A.PHASES.ENEMY_ATTACK].includes(state.phase));
  }

  function phaseLabel(phase) {
    return ({
      [A.PHASES.PLAYER_SELECT]: "Scegli una carta",
      [A.PHASES.PLAYER_TARGET]: "Scegli lo slot",
      [A.PHASES.PLAYER_ATTACK]: "Il tuo attacco",
      [A.PHASES.ENEMY_THINK]: "L'IA sta pensando",
      [A.PHASES.ENEMY_PLAY]: "Giocata avversaria",
      [A.PHASES.ENEMY_ATTACK]: "Attacco avversario",
      [A.PHASES.ROUND_END]: "Fine round",
      [A.PHASES.GAME_OVER]: "Duello terminato"
    })[phase] || phase;
  }

  function renderBoard(side) {
    const root = $(`#${side}Board`);
    const fighter = engine.state[side];
    root.innerHTML = "";
    fighter.board.forEach((unit, slot) => {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = unit ? `unit school-${unit.school}` : "slot";
      cell.dataset.slot = String(slot);
      cell.style.setProperty("--slot-index", slot);
      if (unit) {
        const cardSchool = school(unit.school);
        const isMultiTargetAttacker = Boolean(A.ASTRAL_CARD_AI_METADATA?.[unit.id]?.multiTarget);
        cell.classList.toggle("multi-target-attacker", isMultiTargetAttacker);
        cell.innerHTML = `<div class="unit-art"></div>
          ${isMultiTargetAttacker ? '<span class="multi-target-badge" title="Attacca tutti i nemici" aria-label="Attacco multiplo">⚔×</span>' : ''}
          <div class="unit-stats"><strong class="unit-attack" title="Attacco"><span aria-hidden="true">⚔</span>${unit.attack}</strong><strong class="unit-health" title="Vita"><span aria-hidden="true">♥</span>${Math.max(0, unit.currentHealth)}</strong></div>`;
        const unitArt = cell.querySelector(".unit-art");
        unitArt.appendChild(buildArtBlock(unit, "board"));
        const unitName = document.createElement("small");
        unitName.textContent = unit.name;
        unitArt.appendChild(unitName);
        const inspectUnit = () => {
          inspectedCardId = unit.id;
          inspectedCardSide = side;
          renderCollectionPanels();
        };
        cell.addEventListener("mouseenter", inspectUnit);
        cell.addEventListener("focus", inspectUnit);
        cell.addEventListener("click", inspectUnit);
      } else {
        const isValidTarget = side === "player" && engine.state.phase === A.PHASES.PLAYER_TARGET;
        cell.textContent = isValidTarget ? "Evoca qui" : `${slot + 1}`;
        cell.classList.toggle("valid-target", isValidTarget);
        if (side === "player") cell.addEventListener("click", () => onPlayerSlot(slot));
      }
      root.appendChild(cell);
    });
  }

  function isMobileEnemyBookLayout() {
    return window.matchMedia("(max-width: 820px)").matches;
  }

  function openEnemyRevealedModal() {
    const modal = $("#enemyRevealedModal");
    if (!modal) return;
    enemyRevealedModalOpen = true;
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeEnemyRevealedModal() {
    const modal = $("#enemyRevealedModal");
    if (!modal) return;
    enemyRevealedModalOpen = false;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }

  function toggleEnemyRevealedModal(forceOpen = null) {
    if (forceOpen === true) {
      openEnemyRevealedModal();
      return;
    }
    if (forceOpen === false) {
      closeEnemyRevealedModal();
      return;
    }
    if (enemyRevealedModalOpen) {
      closeEnemyRevealedModal();
    } else {
      openEnemyRevealedModal();
    }
  }

  function renderSchoolButtons() {
    const playerRoot = $("#schoolFilters");
    const enemyRoot = $("#enemySchoolMenu");
    const updateSide = (root, side) => {
      A.SCHOOLS.forEach(item => {
        let button = root.querySelector(`[data-school-id="${item.id}"]`);
        if (!button) {
          button = document.createElement("button");
          button.dataset.schoolId = item.id;
          bindTapAction(button, () => {
            const selectedSchool = button.dataset.schoolId;
            if (side === "player") {
              if (activeSchool === selectedSchool) return;
              activeSchool = selectedSchool;
              playSchoolSelectionSound();
              renderSchoolButtons();
              renderHand();
            } else {
              if (isMobileEnemyBookLayout()) {
                if (enemySchool === selectedSchool) return;
                enemySchool = selectedSchool;
                playSchoolSelectionSound();
                renderSchoolButtons();
                renderEnemyRevealed();
                toggleEnemyRevealedModal(true);
                return;
              }
              if (enemySchool === selectedSchool) return;
              enemySchool = selectedSchool;
              playSchoolSelectionSound();
              renderSchoolButtons();
              renderEnemyRevealed();
            }
          });
          root.appendChild(button);
        }
        const fighter = engine.state[side];
        const selected = side === "player" ? activeSchool : enemySchool;
        button.className = `school-status school-${item.id} ${selected === item.id ? "active" : ""}`;
        button.innerHTML = `<span>${item.icon} ${item.name}</span><strong>${fighter.power[item.id]}</strong><small>${formatGain(fighter.powerGain[item.id])}</small>`;
      });
    };
    updateSide(playerRoot, "player");
    updateSide(enemyRoot, "enemy");
  }

  function formatGain(value) {
    const number = Number(value || 0);
    return `${number >= 0 ? "+" : ""}${number}/turno`;
  }

  function getCardImageCandidates(card) {
    const id = card?.id || "";
    if (!id) return [];
    const candidates = [];
    if (cardArtStyle === "new" && ["fire", "water", "air", "nature"].includes(card.school)) {
      candidates.push(`assets/cards/remastered/${id}.png`);
    }
    candidates.push(
      `assets/cards/original/${id}.png`,
      window.ArcaneCardArt?.[id],
      `assets/cards/${id}.webp`,
      `assets/cards/${id}.png`,
      `assets/cards/${id}.svg`,
      `../shared/assets/cards/${id}.webp`,
      `../shared/assets/cards/${id}.svg`,
      `../shared/assets/cards/${id}.png`
    );
    return candidates.filter(Boolean);
  }

  function buildArtBlock(card, variant = "hand") {
    const wrapper = document.createElement("div");
    wrapper.className = `art-media art-variant-${variant}`;

    const img = document.createElement("img");
    img.className = "art-image";
    img.alt = `Illustrazione di ${card.name}`;
    img.loading = "eager";
    img.decoding = "async";

    const fallback = document.createElement("div");
    fallback.className = "art-fallback";
    fallback.innerHTML = `<span>${escapeHtml(card.art || school(card.school).icon)}</span><small>${card.type === "spell" ? "MAGIA" : "CREATURA"}</small>`;

    const status = document.createElement("div");
    status.className = "art-status";
    status.textContent = "";

    wrapper.appendChild(img);
    wrapper.appendChild(fallback);
    wrapper.appendChild(status);

    if (UI_MODE === "essential") {
      wrapper.classList.add("art-error", "mode-essential-art");
      status.textContent = "UI essenziale";
      return wrapper;
    }

    const candidates = getCardImageCandidates(card);
    let index = 0;
    const tryNext = () => {
      if (index >= candidates.length) {
        wrapper.classList.add("art-error");
        status.textContent = "Errore caricamento immagine";
        return;
      }
      const nextSrc = candidates[index++];
      img.onload = () => {
        wrapper.classList.add("has-image");
        wrapper.classList.remove("art-error");
        status.textContent = "";
      };
      img.onerror = () => tryNext();
      img.src = nextSrc;
    };
    if (candidates.length) tryNext();
    else {
      wrapper.classList.add("art-error");
      status.textContent = "Immagine non disponibile";
    }
    return wrapper;
  }

  function allAstralCards() {
    return sessionSets["astral-original"] || [];
  }

  function getIllustratedSchoolCounts() {
    return { fire: 13, water: 13, air: 13, earth: 13, death: 0 };
  }

  function getIllustratedTotal() {
    return Object.values(getIllustratedSchoolCounts()).reduce((a, b) => a + b, 0);
  }

  function getInspectedCard() {
    const cards = allAstralCards();
    return cards.find(card => card.id === inspectedCardId) || cards[0] || null;
  }

  function currentCardValue(card, side = inspectedCardSide) {
    if (!engine || !side || !card) return null;
    const power = Number(engine.state[side]?.power?.[card.school] || 0);
    const formulas = {
      astral_fire_06: Math.trunc(power / 2) + 4,
      astral_fire_08: Math.trunc(power / 2) + 4,
      astral_fire_11: power + 5,
      astral_water_01: Math.trunc(power / 2) + 3,
      astral_water_05: power + 3,
      astral_air_06: power + 5,
      astral_air_08: Math.max(0, power - 1),
      astral_earth_06: power * 2,
      astral_death_08: Math.trunc(power / 2) + 5
    };
    return Object.hasOwn(formulas, card.id) ? formulas[card.id] : null;
  }

  function cardDescription(card, side = inspectedCardSide) {
    const raw = card?.text || card?.keyword || "Nessuna abilità descritta.";
    const separated = raw.replace(/\s+([+-]\d+\b)/g, ". $1");
    const base = /[.!?]$/.test(separated) ? separated : `${separated}.`;
    const value = currentCardValue(card, side);
    return value === null ? base : `${base} · Valore attuale: ${value}`;
  }

  function cardDescriptionHtml(card, side = inspectedCardSide) {
    const raw = card?.text || card?.keyword || "Nessuna abilità descritta.";
    const separated = raw.replace(/\s+([+-]\d+\b)/g, ". $1");
    const base = /[.!?]$/.test(separated) ? separated : `${separated}.`;
    const value = currentCardValue(card, side);
    const safeBase = escapeHtml(base);
    return value === null
      ? safeBase
      : `${safeBase} <span class="current-card-value"><small>Valore attuale</small><strong>${escapeHtml(value)}</strong></span>`;
  }

  function applyCollectionFilters(cards) {
    const search = (collectionState.search || "").trim().toLowerCase();
    return cards.filter(card => {
      if (collectionState.school !== "all" && card.school !== collectionState.school) return false;
      if (collectionState.type !== "all" && card.type !== collectionState.type) return false;
      if (collectionState.level !== "all" && String(card.level) !== String(collectionState.level)) return false;
      if (search) {
        const haystack = `${card.name} ${card.text} ${card.keyword} ${card.school}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }

  function ensureInspectedCardVisible(cards) {
    if (!cards.length) return;
    if (!cards.some(card => card.id === inspectedCardId)) inspectedCardId = cards[0].id;
  }

  function renderInspectPanel() {
    const card = getInspectedCard();
    const target = $("#inspectPreview");
    if (!target) return;
    if (!card) {
      target.innerHTML = "<p>Nessuna carta selezionata.</p>";
      $("#inspectCardTitle").textContent = "Nessuna carta";
      $("#inspectCardAbility").textContent = "Evidenzia una carta per leggerne l'abilità.";
      $("#inspectCardDetails").innerHTML = "";
      $("#inspectCardMeta").innerHTML = "";
      return;
    }
    renderPreviewInto(target, card, null);
    $("#inspectCardTitle").textContent = card.name;
    $("#inspectCardAbility").innerHTML = cardDescriptionHtml(card);
    const combatDetails = card.type === "spell" ? "" : `
      <span class="detail-combat-stat detail-attack"><small><i aria-hidden="true">⚔</i> Attacco</small><b>${escapeHtml(card.attack)}</b></span>
      <span class="detail-combat-stat detail-health"><small><i aria-hidden="true">♥</i> Vita</small><b>${escapeHtml(card.currentHealth ?? card.health)}</b></span>`;
    $("#inspectCardDetails").innerHTML = `
      <span class="detail-school"><small>Scuola</small><b>${escapeHtml(school(card.school).name)}</b></span>
      <span class="detail-type"><small>Tipo</small><b>${card.type === "spell" ? "Magia" : "Creatura"}</b></span>
      <span class="detail-cost"><small>Costo</small><b>${escapeHtml(card.level)}</b></span>
      ${combatDetails}
      <span class="detail-ability"><small>Abilità</small><b>${escapeHtml(card.keyword || "Originale")}</b></span>`;
    const previewCombatMeta = card.type === "spell" ? "" : `
        <div><small>Attacco</small><strong>${escapeHtml(card.attack)}</strong></div>
        <div><small>Vita</small><strong>${escapeHtml(card.health)}</strong></div>`;
    $("#inspectCardMeta").innerHTML = `
      <div class="inspect-meta-grid">
        <div><small>Scuola</small><strong>${school(card.school).name}</strong></div>
        <div><small>Tipo</small><strong>${card.type === "spell" ? "Magia" : "Creatura"}</strong></div>
        <div><small>Livello</small><strong>${card.level}</strong></div>
        <div><small>Rarità</small><strong>${card.level >= 8 ? "Leggendaria" : card.level >= 6 ? "Rara" : "Comune"}</strong></div>
        ${previewCombatMeta}
      </div>
      <div class="inspect-ability-block"><small>Abilità</small><p><strong>${escapeHtml(card.keyword || "Originale")}</strong></p><p>${escapeHtml(card.text || "")}</p></div>`;
    $("#illustrationProgress").textContent = `${getIllustratedTotal()} / ${allAstralCards().length}`;
  }

  function renderFilterGroup(rootSelector, group, items) {
    const root = $(rootSelector);
    if (!root) return;
    root.innerHTML = items.map(item => `<button type="button" class="mini-filter-btn ${collectionState[group] === item.id ? "active" : ""}" data-filter-group="${group}" data-filter-value="${item.id}">${item.label}</button>`).join("");
    root.onclick = event => {
      const button = event.target.closest("[data-filter-group]");
      if (!button) return;
      collectionState[button.dataset.filterGroup] = button.dataset.filterValue;
      renderCollectionPanels();
    };
  }

  function buildCollectionFilterButtons() {
    renderFilterGroup("#collectionSchoolFilters", "school", [{ id: "all", label: "Tutte" }, ...A.SCHOOLS.map(item => ({ id: item.id, label: `${item.icon}` }))]);
    renderFilterGroup("#collectionTypeFilters", "type", [{ id: "all", label: "Tutti" }, { id: "creature", label: "Creature" }, { id: "spell", label: "Magie" }]);
    renderFilterGroup("#collectionLevelFilters", "level", [{ id: "all", label: "Tutti" }, ...Array.from({ length: 9 }, (_, i) => ({ id: String(i + 1), label: String(i + 1) }))]);
    renderFilterGroup("#collectionPageSchoolFilters", "school", [{ id: "all", label: "Tutte" }, ...A.SCHOOLS.map(item => ({ id: item.id, label: `${item.icon} ${item.name}` }))]);
    renderFilterGroup("#collectionPageTypeFilters", "type", [{ id: "all", label: "Tutti" }, { id: "creature", label: "Creature" }, { id: "spell", label: "Magie" }]);
    renderFilterGroup("#collectionPageLevelFilters", "level", [{ id: "all", label: "Tutti" }, ...Array.from({ length: 9 }, (_, i) => ({ id: String(i + 1), label: `Liv. ${i + 1}` }))]);
  }

  function buildCollectionTile(card, compact = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `collection-tile school-${card.school} type-${card.type} ${compact ? "compact" : ""} ${inspectedCardId === card.id ? "active" : ""}`;
    const art = document.createElement("div");
    art.className = "collection-tile-art";
    art.appendChild(buildArtBlock(card, compact ? "collectionCompact" : "collection"));
    const body = document.createElement("div");
    body.className = "collection-tile-body";
    body.innerHTML = `<strong>${escapeHtml(card.name)}</strong><small>Lv. ${card.level}</small>`;
    button.appendChild(art);
    button.appendChild(body);
    button.addEventListener("click", () => {
      inspectedCardId = card.id;
      if (engine) inspectedCardSide = "player";
      renderCollectionPanels();
    });
    return button;
  }

  function renderCollectionPanels() {
    const allCards = allAstralCards();
    buildCollectionFilterButtons();
    const filtered = applyCollectionFilters(allCards);
    ensureInspectedCardVisible(filtered.length ? filtered : allCards);
    const quick = $("#collectionQuickList");
    const grid = $("#collectionGrid");
    const status = $("#collectionStatus");
    if (status) status.textContent = `${filtered.length} carte mostrate su ${allCards.length}`;
    if (quick) {
      quick.innerHTML = "";
      filtered.slice(0, 18).forEach(card => quick.appendChild(buildCollectionTile(card, true)));
    }
    if (grid) {
      grid.innerHTML = "";
      filtered.forEach(card => grid.appendChild(buildCollectionTile(card, false)));
    }
    renderInspectPanel();
    renderCollectionPage();
  }

  function renderCollectionPage() {
    const root = $("#profileContent");
    if (!root) return;
    profile = A.loadProfile();
    const allCards = allAstralCards();
    const filtered = applyCollectionFilters(allCards);
    const counts = getIllustratedSchoolCounts();
    root.innerHTML = `
      <div class="collection-page-layout">
        <aside class="collection-page-sidebar">
          <div class="collection-page-progress ornate-subpanel">
            <h3>Progresso illustrazioni</h3>
            <div class="progress-total"><strong>${getIllustratedTotal()} / ${allCards.length}</strong><small>Carte illustrate</small></div>
            <div class="progress-school-list">
              <div><span>🔥 Fuoco</span><strong>${counts.fire} / 13</strong></div>
              <div><span>💧 Acqua</span><strong>${counts.water} / 13</strong></div>
              <div><span>🌪️ Aria</span><strong>${counts.air} / 13</strong></div>
              <div><span>🌿 Terra</span><strong>${counts.earth} / 13</strong></div>
              <div><span>💀 Morte</span><strong>${counts.death} / 13</strong></div>
            </div>
          </div>
          <div class="collection-page-filters ornate-subpanel">
            <h3>Filtri</h3>
            <div id="collectionPageSchoolFilters" class="mini-filter-grid vertical-filters"></div>
            <div id="collectionPageTypeFilters" class="mini-filter-grid"></div>
            <div id="collectionPageLevelFilters" class="mini-filter-grid level-filters wide"></div>
            <label class="search-label">Cerca una carta<input id="collectionPageSearch" type="search" placeholder="Nome, scuola, testo..."></label>
            <div class="collection-page-profile-box">
              <h4>Profilo</h4>
              <div class="profile-mini-grid">
                <div><small>Tornei giocati</small><strong>${profile.tournamentsPlayed}</strong></div>
                <div><small>Tornei vinti</small><strong>${profile.tournamentsWon}</strong></div>
                <div><small>Duelli vinti</small><strong>${profile.duelsWon}</strong></div>
                <div><small>Duelli persi</small><strong>${profile.duelsLost}</strong></div>
              </div>
            </div>
          </div>
        </aside>
        <section class="collection-page-main">
          <div class="collection-page-top">
            <div class="collection-page-featured" id="collectionPageFeatured"></div>
            <div class="collection-page-meta">
              <div class="collection-page-meta-card ornate-subpanel">
                <h3 id="collectionPageCardTitle">Dettaglio carta</h3>
                <div id="collectionPageMeta"></div>
              </div>
              <div class="collection-page-meta-card ornate-subpanel">
                <h3>Stato visualizzazione</h3>
                <p id="collectionPageStatus">${filtered.length} carte mostrate su ${allCards.length}</p>
                <p>Questa schermata usa lo stesso archivio del duello, ma in una vista più ampia e leggibile.</p>
              </div>
            </div>
          </div>
          <div id="collectionPageGrid" class="collection-grid page-grid"></div>
        </section>
      </div>`;
    buildCollectionFilterButtons();
    const search = $("#collectionPageSearch");
    if (search) {
      search.value = collectionState.search || "";
      search.oninput = event => {
        collectionState.search = event.target.value;
        renderCollectionPanels();
      };
    }
    const card = getInspectedCard();
    const featured = $("#collectionPageFeatured");
    const meta = $("#collectionPageMeta");
    if (card && featured && meta) {
      renderPreviewInto(featured, card, null);
      $("#collectionPageCardTitle").textContent = card.name;
      meta.innerHTML = `
        <div class="inspect-meta-grid">
          <div><small>Scuola</small><strong>${school(card.school).name}</strong></div>
          <div><small>Tipo</small><strong>${card.type === "spell" ? "Magia" : "Creatura"}</strong></div>
          <div><small>Livello</small><strong>${card.level}</strong></div>
          <div><small>Attacco</small><strong>${card.type === "spell" ? "—" : card.attack}</strong></div>
          <div><small>Vita</small><strong>${card.type === "spell" ? "—" : card.health}</strong></div>
          <div><small>Keyword</small><strong>${escapeHtml(card.keyword || "Originale")}</strong></div>
        </div>
        <div class="inspect-ability-block"><small>Testo carta</small><p>${escapeHtml(card.text || "")}</p></div>`;
    }
    const pageGrid = $("#collectionPageGrid");
    if (pageGrid) {
      pageGrid.innerHTML = "";
      filtered.forEach(card => pageGrid.appendChild(buildCollectionTile(card, false)));
    }
  }

  let renderedHandSignature = "";
  let renderedHandEngine = null;

  function renderHand() {
    const root = $("#playerHand");
    const template = $("#smallCardTemplate");
    const cards = engine.state.player.hand.filter(card => card.school === activeSchool);
    const signature = JSON.stringify({
      school: activeSchool,
      phase: engine.state.phase,
      pending: engine.state.pendingCardId,
      art: cardArtStyle,
      cards: cards.map(card => [card.id, engine.effectiveCost("player", card), engine.getPlayability("player", card).ok])
    });
    if (engine === renderedHandEngine && signature === renderedHandSignature) return;
    renderedHandEngine = engine;
    renderedHandSignature = signature;
    const fragment = document.createDocumentFragment();
    cards.forEach((card, cardIndex) => {
      const clone = template.content.firstElementChild.cloneNode(true);
      const selected = engine.state.pendingCardId === card.id;
      const cost = engine.effectiveCost("player", card);
      const playable = engine.getPlayability("player", card).ok;
      clone.dataset.cardId = card.id;
      clone.style.setProperty("--card-index", cardIndex);
      clone.classList.add(`school-${card.school}`, `type-${card.type}`);
      clone.classList.toggle("selected", selected);
      clone.classList.toggle("unplayable", !playable && !selected);
      clone.querySelector(".cost").textContent = cost;
      clone.querySelector(".school").textContent = `${school(card.school).icon} ${school(card.school).name}`;
      const artNode = clone.querySelector(".art");
      artNode.innerHTML = "";
      artNode.appendChild(buildArtBlock(card, "hand"));
      clone.querySelector(".name").textContent = card.name;
      clone.querySelector(".text").textContent = card.text;
      clone.querySelector(".keyword").textContent = card.keyword || "—";
      clone.querySelector(".stats").textContent = card.type === "spell" ? `Lv ${card.level} · ✨` : `Lv ${card.level} · ⚔ ${card.attack} · ♥ ${card.health}`;
      const inspectHandCard = () => { inspectedCardId = card.id; inspectedCardSide = "player"; renderCollectionPanels(); };
      clone.addEventListener("mouseenter", inspectHandCard);
      clone.addEventListener("focus", inspectHandCard);
      clone.addEventListener("click", () => onPlayerCard(card.id));
      fragment.appendChild(clone);
    });
    root.replaceChildren(fragment);
    $("#handSummary").textContent = `${cards.length} carte · ${school(activeSchool).name}`;
    const pending = engine.state.pendingCardId ? engine.getCard("player", engine.state.pendingCardId) : null;
    $("#selectedCardHint").textContent = pending
      ? `${pending.name} ${pending.type === "spell" && !supportsHoverPreview ? "preparata" : "selezionata"}: ${pending.type === "creature" ? "scegli uno slot libero" : "tocca di nuovo per lanciarla"}.`
      : "";
  }

  function renderEnemyRevealed() {
    const root = $("#enemyRevealedCards");
    const modalRoot = $("#enemyRevealedModalContent");
    const summary = $("#enemySchoolSummary");
    const modalSummary = $("#enemyRevealedModalSummary");
    const hand = engine.state.enemy.hand.filter(card => card.school === enemySchool);
    const revealed = hand.filter(card => engine.state.enemy.revealedCards.includes(card.id));
    const summaryText = `${school(enemySchool).name}: ${hand.length} carte totali · ${revealed.length} rivelate`;
    if (summary) summary.textContent = summaryText;
    if (modalSummary) modalSummary.textContent = summaryText;
    const fragment = document.createDocumentFragment();
    revealed.forEach(card => {
      const chip = document.createElement("button");
      chip.className = `revealed-chip school-${card.school} type-${card.type}`;
      chip.innerHTML = "";
      const art = document.createElement("div");
      art.className = "revealed-chip-art";
      art.appendChild(buildArtBlock(card, "enemyBook"));
      const label = document.createElement("span");
      label.className = "enemy-card-cost";
      label.textContent = engine.effectiveCost("enemy", card);
      chip.appendChild(art);
      chip.appendChild(label);
      chip.addEventListener("mouseenter", () => {
        inspectedCardId = card.id;
        inspectedCardSide = "enemy";
        renderCollectionPanels();
      });
      chip.addEventListener("focus", () => { inspectedCardId = card.id; inspectedCardSide = "enemy"; renderCollectionPanels(); });
      chip.addEventListener("click", () => { inspectedCardId = card.id; inspectedCardSide = "enemy"; renderCollectionPanels(); });
      fragment.appendChild(chip);
    });
    for (let i = revealed.length; i < hand.length; i += 1) {
      const hidden = document.createElement("span");
      hidden.className = "hidden-card-chip";
      hidden.setAttribute("aria-label", "Carta avversaria nascosta");
      fragment.appendChild(hidden);
    }
    if (isMobileEnemyBookLayout()) {
      if (modalRoot) modalRoot.replaceChildren(fragment);
      if (root) root.replaceChildren("");
      return;
    }
    if (root) root.replaceChildren(fragment);
    closeEnemyRevealedModal();
  }

  function renderGame() {
    if (!engine) return;
    const state = engine.state;
    updatePhaseVisual(state);
    $("#enemyHpBattle").textContent = `${state.enemy.hp} ♥`;
    $("#playerHpBattle").textContent = `${state.player.hp} ♥`;
    $("#phaseLabel").textContent = phaseLabel(state.phase);
    $("#roundLabel").textContent = `Round ${state.round}`;
    const abilitiesEnabled = (state.player.astralAbilityIds || []).length > 0 || (state.enemy.astralAbilityIds || []).length > 0;
    const playerSpec = abilitiesEnabled && state.playerSpecialization && A.getAstralSpecialization ? A.getAstralSpecialization(state.playerSpecialization) : null;
    const enemySpec = abilitiesEnabled && state.enemySpecialization && A.getAstralSpecialization ? A.getAstralSpecialization(state.enemySpecialization) : null;
    const playerAbilityNames = state.player.astralAbilities?.map(item => item.name).join(" · ");
    const enemyAbilityNames = state.enemy.astralAbilities?.map(item => item.name).join(" · ");
    $("#playerTalentLabel").textContent = playerSpec ? `${playerSpec.name}: ${playerAbilityNames || "nessuna abilità"}` : `Talento: ${school(state.player.talent).name}`;
    $("#enemyTalentLabel").textContent = enemySpec ? `${enemySpec.name}: ${enemyAbilityNames || "nessuna abilità"}` : `Talento: ${school(state.enemy.talent).name}`;
    $("#endTurnBtn").disabled = busy || ![A.PHASES.PLAYER_SELECT, A.PHASES.PLAYER_TARGET].includes(state.phase);
    $("#combatLog").innerHTML = state.log.map(item => `<div>${escapeHtml(item)}</div>`).join("");
    renderSchoolButtons();
    renderBoard("enemy");
    renderBoard("player");
    renderHand();
    renderEnemyRevealed();
    const playerTotalMana = Object.values(state.player.power || {}).reduce((sum, value) => sum + Number(value || 0), 0);
    const enemyTotalMana = Object.values(state.enemy.power || {}).reduce((sum, value) => sum + Number(value || 0), 0);
    const playerGrowth = Object.values(state.player.powerGain || {}).reduce((sum, value) => sum + Number(value || 0), 0);
    const enemyGrowth = Object.values(state.enemy.powerGain || {}).reduce((sum, value) => sum + Number(value || 0), 0);
    const playerManaOrb = $("#playerManaOrb");
    const enemyManaOrb = $("#enemyManaOrb");
    if (playerManaOrb) playerManaOrb.textContent = `${playerTotalMana}/${playerGrowth >= 0 ? "+" : ""}${playerGrowth}`;
    if (enemyManaOrb) enemyManaOrb.textContent = `${enemyTotalMana}/${enemyGrowth >= 0 ? "+" : ""}${enemyGrowth}`;
    renderCollectionPanels();
  }

  const supportsHoverPreview = (() => {
    if (!window.matchMedia) return true;
    const hasHover = window.matchMedia("(hover: hover)").matches;
    const hasFinePointer = window.matchMedia("(pointer: fine)").matches;
    const hasCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const hasTouch = window.matchMedia("(hover: none)").matches
      || navigator.maxTouchPoints > 0
      || "ontouchstart" in window;
    return hasHover && hasFinePointer && !hasTouch && !hasCoarsePointer;
  })();

  $("#enemyRevealedModalClose")?.addEventListener("click", () => closeEnemyRevealedModal());
  $("#enemyRevealedQuickToggle")?.addEventListener("click", () => toggleEnemyRevealedModal());
  $("#enemyRevealedModal")?.addEventListener("click", event => {
    if (event.target === event.currentTarget) closeEnemyRevealedModal();
  });
  window.addEventListener("resize", () => {
    if (!isMobileEnemyBookLayout()) {
      closeEnemyRevealedModal();
    }
    renderEnemyRevealed();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && enemyRevealedModalOpen) closeEnemyRevealedModal();
  });

  async function onPlayerCard(cardId) {
    inspectedCardId = cardId;
    inspectedCardSide = "player";
    renderCollectionPanels();
    if (!engine || busy) return;

    const isSpellConfirmTap = !supportsHoverPreview
      && engine.state.phase === A.PHASES.PLAYER_TARGET
      && engine.state.pendingCardId === cardId;

    if (isSpellConfirmTap) {
      const healthBefore = captureHealthState();
      const play = engine.playSelected(null);
      if (play.ok) {
        spellSound();
        renderGame();
        showHealingChanges(healthBefore);
        await animateCardPlay(play, "player", null);
        await sleep(120);
        await resolveAttackFlow("player");
      } else {
        setMessage(play.reason);
        renderGame();
      }
      return;
    }

    if (engine.state.phase === A.PHASES.PLAYER_TARGET) {
      const sameCard = engine.state.pendingCardId === cardId;
      engine.cancelSelection();
      if (sameCard) {
        setMessage("Selezione annullata.");
        renderGame();
        return;
      }
    }

    if (engine.state.phase !== A.PHASES.PLAYER_SELECT) return;
    const result = engine.selectCard(cardId);
    if (!result.ok) {
      setMessage(result.reason);
      renderGame();
      return;
    }
    renderGame();

    if (result.requiresSlot) {
      setMessage(`Hai selezionato ${result.card.name}. Scegli uno slot.`);
      return;
    }

    playCardReadySound();

    if (supportsHoverPreview) {
      setMessage(`${result.card.name} viene lanciata.`);
      const healthBefore = captureHealthState();
      const play = engine.playSelected(null);
      if (play.ok) {
        spellSound();
        renderGame();
        showHealingChanges(healthBefore);
        await animateCardPlay(play, "player", null);
        await sleep(120);
        await resolveAttackFlow("player");
      }
    } else {
      setMessage(`${result.card.name} ${result.card.type === "spell" ? "preparata" : "selezionata"}. Tocca di nuovo per lanciarla.`);
    }
  }

  async function onPlayerSlot(slot) {
    if (!engine || busy || engine.state.phase !== A.PHASES.PLAYER_TARGET) return;
    const healthBefore = captureHealthState();
    const result = engine.playSelected(slot);
    if (!result.ok) {
      setMessage(result.reason);
      renderGame();
      return;
    }
    playOriginalSound("summon2", 0.4);
    renderGame();
    showHealingChanges(healthBefore);
    await animateCardPlay(result, "player", slot);
    await sleep(80);
    await resolveAttackFlow("player");
  }

  $("#endTurnBtn").addEventListener("click", async () => {
    if (!engine || busy) return;
    const result = engine.pass("player");
    if (!result.ok) return setMessage(result.reason);
    playOriginalSound("click", 0.35);
    showTurnBanner("Turno passato", "neutral", 700);
    renderGame();
    await resolveAttackFlow("player");
  });

  async function animateAttack(event) {
    const attacker = $(`#${event.side}Board [data-slot="${event.slot}"]`);
    const target = event.type === "laneAttack" ? $(`#${event.enemySide}Board [data-slot="${event.slot}"]`) : $(`#${event.enemySide}HpBattle`);
    const multiTargets = event.multiTarget
      ? [...$$(`#${event.enemySide}Board .unit`), $(`#${event.enemySide}HpBattle`)].filter(Boolean)
      : [target].filter(Boolean);
    attacker?.classList.add(event.side === "player" ? "attacking-player" : "attacking-enemy");
    attacker?.classList.toggle("attacking-multi", Boolean(event.multiTarget));
    multiTargets.forEach(node => {
      node.classList.add("target-locked");
      createAttackTrail(attacker, node, event.side);
    });
    $("#battlePanel")?.classList.toggle("multi-target-attack", Boolean(event.multiTarget));
    showCombatCue(event);
    attackSound(event.type === "directAttack");
    await sleep(event.multiTarget ? 460 : 330);
    attacker?.classList.remove("attacking-player", "attacking-enemy", "attacking-multi");
    multiTargets.forEach(node => node.classList.add("hit"));
    await sleep(event.multiTarget ? 180 : 110);
    multiTargets.forEach(node => node.classList.remove("hit", "target-locked"));
    $("#battlePanel")?.classList.remove("multi-target-attack");
  }

  function showCombatCue(event) {
    const layer = $("#duelFxLayer");
    if (!layer || !event) return;
    const cue = document.createElement("div");
    cue.className = `combat-cue side-${event.side}${event.multiTarget ? " multi-target" : ""}`;
    const target = event.multiTarget ? "tutti i nemici" : (event.targetName || "eroe avversario");
    cue.textContent = `${event.attackerName || "Creatura"} → ${target}`;
    layer.appendChild(cue);
    requestAnimationFrame(() => cue.classList.add("show"));
    setTimeout(() => cue.remove(), fxDuration(760) || 40);
  }

  function appendDamageBadge(parent, amount, options = {}) {
    if (!parent || amount <= 0) return;
    const badge = document.createElement("span");
    badge.className = `damage-number${options.lethal ? " lethal" : ""}${options.hero ? " hero-damage" : ""}${options.collateral ? " collateral" : ""}`;
    badge.textContent = options.lethal ? `−${amount} · KO` : options.hero ? `−${amount} ♥` : `−${amount}`;
    const fxLayer = $("#duelFxLayer");
    if (options.hero && fxLayer) {
      const rect = parent.getBoundingClientRect();
      badge.style.left = `${rect.left + rect.width / 2}px`;
      badge.style.top = `${rect.bottom + 7}px`;
      fxLayer.appendChild(badge);
    } else {
      parent.style.position = "relative";
      parent.appendChild(badge);
    }
    setTimeout(() => badge.remove(), fxDuration(options.lethal ? 1650 : 1350) || 40);
  }

  function showDamage(event) {
    const parent = event.type === "laneAttack"
      ? $(`#${event.enemySide}Board [data-slot="${event.slot}"]`)
      : $(`#${event.enemySide}HpBattle`)?.parentElement;
    appendDamageBadge(parent, event.damage, { lethal: Boolean(event.died), hero: event.type === "directAttack" });
  }

  function showCollateralDamage(events) {
    (events || [])
      .filter(event => event.type === "astralCreatureDamage" && event.reason === "multi_target")
      .forEach(event => appendDamageBadge(
        $(`#${event.targetSide}Board [data-slot="${event.slot}"]`),
        event.amount,
        { lethal: event.health <= 0, collateral: true }
      ));
  }

  function captureHealthState() {
    if (!engine) return null;
    return Object.fromEntries(["player", "enemy"].map(side => [side, {
      hp: Number(engine.state[side].hp || 0),
      units: engine.state[side].board.map(unit => unit ? Number(unit.currentHealth || 0) : null)
    }]));
  }

  function showHealingNumber(parent, amount) {
    if (!parent || amount <= 0) return;
    const layer = $("#duelFxLayer");
    if (!layer) return;
    const rect = parent.getBoundingClientRect();
    const badge = document.createElement("span");
    badge.className = "healing-number";
    badge.textContent = `+${amount}`;
    badge.style.left = `${rect.left + rect.width / 2}px`;
    badge.style.top = `${rect.top + rect.height / 2}px`;
    layer.appendChild(badge);
    setTimeout(() => badge.remove(), fxDuration(1450) || 40);
  }

  function showHealingChanges(before) {
    if (!before || !engine) return;
    ["player", "enemy"].forEach(side => {
      const fighter = engine.state[side];
      showHealingNumber($(`#${side}HpBattle`)?.parentElement, Number(fighter.hp || 0) - before[side].hp);
      fighter.board.forEach((unit, slot) => {
        if (!unit || before[side].units[slot] === null) return;
        showHealingNumber($(`#${side}Board [data-slot="${slot}"]`), Number(unit.currentHealth || 0) - before[side].units[slot]);
      });
    });
  }

  async function resolveAttackFlow(side) {
    busy = true;
    renderGame();
    while (!engine.state.gameOver) {
      const healthBefore = captureHealthState();
      const step = engine.attackNext(side);
      if (!step.ok || step.done) break;
      if (step.skipped) continue;
      await animateAttack(step.event);
      renderGame();
      showDamage(step.event);
      showCollateralDamage(step.events);
      showHealingChanges(healthBefore);
      await sleep(260);
    }
    const finishHealthBefore = captureHealthState();
    engine.finishAttack(side);
    renderGame();
    showHealingChanges(finishHealthBefore);

    if (engine.state.gameOver) {
      busy = false;
      await finalizeMatch();
      return;
    }

    if (side === "player") {
      setMessage("L'avversario sta valutando la mossa...");
      showTurnBanner("Turno avversario", "enemy", 760);
      await sleep(420);
      engine.beginEnemyPlay();
      renderGame();
      const useRecoveredAi = engine.state.rulesetId === A.ASTRAL_ORIGINAL_RULESET?.id;
      const move = useRecoveredAi
        ? A.chooseRecoveredAstralMove(engine, "enemy", engine.aiDifficulty || "advanced")
        : A.chooseAiMove(engine, "enemy", engine.aiDifficulty || "advanced");
      const healthBefore = captureHealthState();
      const result = engine.playMove("enemy", move);
      if (result.ok && result.card?.type === "spell") spellSound();
      if (result.ok && result.card?.type === "creature") playOriginalSound("summon2", 0.36);
      renderGame();
      showHealingChanges(healthBefore);
      if (result.ok && result.card) await animateCardPlay(result, "enemy", move?.slot ?? null);
      await sleep(100);
      await resolveAttackFlow("enemy");
    } else {
      busy = false;
      showTurnBanner(`Round ${engine.state.round} · Il tuo turno`, "player", 900);
      setMessage(`Round ${engine.state.round}: scegli una carta o passa.`);
      renderGame();
    }
  }

  async function finalizeMatch() {
    const winner = engine.state.winner;
    if (winner === "player") playOriginalSound("winner", 0.5);
    if (winner === "enemy") playOriginalSound("looser", 0.5);
    const resultText = winner === "player" ? "Vittoria" : winner === "enemy" ? "Sconfitta" : "Parità";
    showTurnBanner(resultText, winner === "player" ? "player" : winner === "enemy" ? "enemy" : "neutral", 1800);
    setMessage(winner === "player" ? "Hai vinto il duello." : winner === "enemy" ? "Hai perso il duello." : "Il duello è finito in parità.");
    if (tournamentMatch && !matchRecorded) {
      matchRecorded = true;
      const won = winner === "player";
      const score = won ? Math.max(10, engine.state.player.hp * 10 + Math.max(0, 20 - engine.state.round) * 5) : 0;
      A.recordTournamentDuel(profile, tournament, won, score);
      profile = A.loadProfile();
      tournament = A.loadTournament();
      renderTournament();
      renderProfile();
    }
  }

  function renderPreviewInto(target, card, side) {
    target.innerHTML = "";
    const cost = engine && side ? engine.effectiveCost(side, card) : card.level;
    const article = document.createElement("article");
    article.className = `preview-card type-${card.type}`;

    const art = document.createElement("div");
    art.className = "preview-art";
    art.appendChild(buildArtBlock(card, "preview"));
    article.appendChild(art);

    const title = document.createElement("h3");
    title.textContent = card.name;
    article.appendChild(title);

    const subtitle = document.createElement("div");
    subtitle.textContent = `${school(card.school).name} · ${card.type === "spell" ? "Magia" : "Creatura"}`;
    article.appendChild(subtitle);

    const meta = document.createElement("div");
    meta.className = "preview-meta";
    const blocks = [
      { value: cost, label: "Livello/costo" },
      { value: card.type === "spell" ? "—" : card.attack, label: "Attacco" },
      { value: card.type === "spell" ? "—" : (card.currentHealth ?? card.health ?? 0), label: "Vita" }
    ];
    blocks.forEach(item => {
      const stat = document.createElement("div");
      stat.className = "preview-stat";
      stat.innerHTML = `<strong>${escapeHtml(item.value)}</strong><br><small>${escapeHtml(item.label)}</small>`;
      meta.appendChild(stat);
    });
    article.appendChild(meta);

    const keyword = document.createElement("p");
    keyword.innerHTML = `<strong>${escapeHtml(card.keyword || "Originale")}</strong>`;
    article.appendChild(keyword);

    const text = document.createElement("p");
    text.textContent = cardDescription(card, side || inspectedCardSide);
    article.appendChild(text);

    target.appendChild(article);
  }

  function openCardPreview(card, side, mode, anchor) {
    clearTimeout(previewCloseTimer);
    const overlay = $("#cardPreviewOverlay");
    renderPreviewInto($("#cardPreviewContent"), card, side);
    overlay.className = `card-preview-overlay open ${mode === "hover" ? "hover-preview" : "modal-preview"}`;
    overlay.dataset.previewMode = mode;
    overlay.setAttribute("aria-hidden", "false");
    if (mode === "hover" && anchor) {
      const modal = overlay.querySelector(".card-preview-modal");
      const rect = anchor.getBoundingClientRect();
      modal.style.width = `${Math.min(330, window.innerWidth - 24)}px`;
      modal.style.left = `${Math.max(12, Math.min(window.innerWidth - 342, rect.left))}px`;
      modal.style.top = `${Math.min(window.innerHeight - 420, rect.bottom + 8)}px`;
    }
  }

  function schedulePreviewClose(mode, delay = 220) {
    clearTimeout(previewCloseTimer);
    previewCloseTimer = setTimeout(() => closeCardPreview(mode), delay);
  }

  function closeCardPreview(mode) {
    const overlay = $("#cardPreviewOverlay");
    if (mode && overlay.dataset.previewMode !== mode) return;
    overlay.className = "card-preview-overlay";
    overlay.removeAttribute("data-preview-mode");
    overlay.setAttribute("aria-hidden", "true");
    const modal = overlay.querySelector(".card-preview-modal");
    modal.removeAttribute("style");
  }

  $('[data-open-preview="true"]')?.addEventListener("click", () => {
    const card = getInspectedCard();
    if (card) openCardPreview(card, null, "modal");
  });

  $("#closeCardPreview").addEventListener("click", () => closeCardPreview());
  $("#cardPreviewOverlay").addEventListener("click", event => {
    if (event.target.id === "cardPreviewOverlay" && event.currentTarget.dataset.previewMode === "modal") closeCardPreview();
  });
  $("#cardPreviewOverlay").querySelector(".card-preview-modal").addEventListener("mouseenter", () => {
    if ($("#cardPreviewOverlay").dataset.previewMode === "hover") clearTimeout(previewCloseTimer);
  });
  $("#cardPreviewOverlay").querySelector(".card-preview-modal").addEventListener("mouseleave", () => {
    if ($("#cardPreviewOverlay").dataset.previewMode === "hover") schedulePreviewClose("hover", 120);
  });

  function renderTournament() {
    const root = $("#tournamentContent");
    if (!tournament) {
      root.innerHTML = `<div class="tournament-create">
        <label>Specializzazione <select id="tournamentTalentSelect">${A.SCHOOLS.map(s => `<option value="${s.id}">${s.icon} ${s.name}</option>`).join("")}</select></label>
        <label>Seed torneo <input id="tournamentSeedInput" value="astral-cup-001"></label>
        <label>Set <select id="tournamentSetSelect"><option value="classic">Classico provvisorio</option><option value="arcane">Arcane</option></select></label>
        <button id="createTournamentConfirm" class="primary">Crea il torneo</button>
      </div>`;
      $("#createTournamentConfirm")?.addEventListener("click", () => {
        tournament = A.createTournament({
          specialization: $("#tournamentTalentSelect").value,
          seed: $("#tournamentSeedInput").value,
          setId: $("#tournamentSetSelect").value
        });
        profile.tournamentsPlayed += 1;
        A.saveProfile(profile);
        A.saveTournament(tournament);
        renderProfile();
        renderTournament();
      });
      return;
    }

    const current = tournament.opponents[tournament.currentMatch];
    root.innerHTML = `
      <div class="tournament-summary">
        <div><small>Specializzazione</small><strong>${school(tournament.specialization).icon} ${school(tournament.specialization).name}</strong></div>
        <div><small>Vittorie</small><strong>${tournament.wins}</strong></div>
        <div><small>Punti</small><strong>${tournament.points}</strong></div>
        <div><small>Rango</small><strong>${A.RANKS[Math.min(tournament.currentMatch, A.RANKS.length - 1)]}</strong></div>
      </div>
      <div class="opponent-list">${tournament.opponents.map((opponent, index) => `<div class="opponent-row ${opponent.defeated ? "defeated" : ""} ${index === tournament.currentMatch ? "current" : ""}"><span>${index + 1}. ${escapeHtml(opponent.name)}</span><small>${escapeHtml(opponent.rank)} · ${school(opponent.talent).icon} · ${A.DIFFICULTIES[opponent.difficulty].label}</small></div>`).join("")}</div>
      <div class="passive-list"><h3>Passive acquisite</h3>${tournament.selectedPassives.length ? tournament.selectedPassives.map(id => `<span class="passive-chip">${escapeHtml(A.getPassive(id)?.name || id)}</span>`).join("") : "<p>Nessuna passiva.</p>"}</div>
      <div id="tournamentActions"></div>`;

    const actions = $("#tournamentActions");
    if (tournament.pendingPassiveChoice) {
      actions.innerHTML = `<h3>Scegli una passiva permanente per questo torneo</h3><div class="passive-choice-grid">${tournament.offeredPassives.map(id => { const p = A.getPassive(id); return `<button class="passive-choice" data-passive="${id}"><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.description)}</small></button>`; }).join("")}</div>`;
      actions.querySelectorAll("[data-passive]").forEach(button => button.addEventListener("click", () => {
        A.selectTournamentPassive(tournament, button.dataset.passive);
        A.saveTournament(tournament);
        renderTournament();
      }));
    } else if (tournament.completed) {
      actions.innerHTML = `<div class="tournament-result"><strong>${tournament.won ? "Torneo vinto" : "Torneo concluso"}</strong><p>${tournament.wins} vittorie, ${tournament.points} punti.</p><button id="archiveTournamentBtn" class="ghost">Chiudi torneo</button></div>`;
      $("#archiveTournamentBtn")?.addEventListener("click", () => { tournament = null; A.saveTournament(null); renderTournament(); });
    } else {
      actions.innerHTML = `<button id="continueTournamentBtn" class="primary">Affronta ${escapeHtml(current.name)}</button>`;
      $("#continueTournamentBtn")?.addEventListener("click", () => startDuel(tournament.specialization, true));
    }
  }

  $("#newTournamentBtn").addEventListener("click", () => {
    if (tournament && !confirm("Il torneo attivo verrà sostituito. Continuare?")) return;
    tournament = null;
    A.saveTournament(null);
    renderTournament();
  });

  function renderProfile() {
    renderCollectionPage();
  }

  $("#resetProfileBtn").addEventListener("click", () => {
    if (!confirm("Azzerare profilo, trofei e torneo attivo?")) return;
    A.resetProgress();
    profile = A.loadProfile();
    tournament = null;
    renderProfile();
    renderTournament();
  });

  function populateEditor() {
    const setId = $("#editorSetSelect").value;
    const cards = sessionSets[setId];
    $("#editSchool").innerHTML = A.SCHOOLS.map(s => `<option value="${s.id}">${s.icon} ${s.name}</option>`).join("");
    $("#editorCardSelect").innerHTML = cards.map(card => `<option value="${card.id}">${school(card.school).name} · Lv ${card.level} · ${escapeHtml(card.name)}</option>`).join("");
    loadEditorCard(cards[0]?.id);
  }

  function loadEditorCard(id) {
    const card = sessionSets[$("#editorSetSelect").value].find(item => item.id === id);
    if (!card) return;
    $("#editorCardSelect").value = card.id;
    $("#editName").value = card.name;
    $("#editSchool").value = card.school;
    $("#editLevel").value = card.level;
    $("#editType").value = card.type;
    $("#editKeyword").value = card.keyword;
    $("#editAttack").value = card.attack;
    $("#editHealth").value = card.health;
    $("#editText").value = card.text;
    const effect = card.effects?.[0] || null;
    $("#editEffectTrigger").value = effect?.trigger || "none";
    $("#editEffectAction").value = effect?.action || "none";
    $("#editEffectAmount").value = effect?.amount || 0;
    renderEditorPreview();
  }

  function editorDraft() {
    return A.normalizeCard({
      id: $("#editorCardSelect").value,
      name: $("#editName").value,
      school: $("#editSchool").value,
      level: Number($("#editLevel").value),
      type: $("#editType").value,
      keyword: $("#editKeyword").value,
      attack: Number($("#editAttack").value),
      health: Number($("#editHealth").value),
      text: $("#editText").value,
      art: sessionSets[$("#editorSetSelect").value].find(c => c.id === $("#editorCardSelect").value)?.art || "✨",
      effects: $("#editEffectAction").value === "none" || $("#editEffectTrigger").value === "none" ? [] : [{
        trigger: $("#editEffectTrigger").value,
        action: $("#editEffectAction").value,
        amount: Number($("#editEffectAmount").value || 0)
      }]
    });
  }

  function renderEditorPreview() {
    const card = editorDraft();
    renderPreviewInto($("#cardPreview"), card, null);
    const validation = A.validateCardSet(sessionSets[$("#editorSetSelect").value]);
    $("#schemaValidation").innerHTML = validation.valid ? `<strong class="test-pass">Schema valido</strong><p>${validation.cards.length} carte caricate.</p>` : `<strong class="test-fail">Errori</strong><p>${validation.errors.map(escapeHtml).join("<br>")}</p>`;
  }

  $("#editorSetSelect").addEventListener("change", populateEditor);
  $("#editorCardSelect").addEventListener("change", event => loadEditorCard(event.target.value));
  ["editName", "editSchool", "editLevel", "editType", "editKeyword", "editAttack", "editHealth", "editText", "editEffectTrigger", "editEffectAction", "editEffectAmount"].forEach(id => {
    $(`#${id}`).addEventListener("input", renderEditorPreview);
    $(`#${id}`).addEventListener("change", renderEditorPreview);
  });
  $("#saveCardBtn").addEventListener("click", () => {
    const setId = $("#editorSetSelect").value;
    const draft = editorDraft();
    const index = sessionSets[setId].findIndex(card => card.id === draft.id);
    if (index >= 0) sessionSets[setId][index] = draft;
    populateEditor();
    $("#editorCardSelect").value = draft.id;
    loadEditorCard(draft.id);
  });
  $("#exportCardsBtn").addEventListener("click", () => downloadJson(`arcane-duels-${$("#editorSetSelect").value}-cards.json`, sessionSets[$("#editorSetSelect").value]));

  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderRuleset() {
    const rules = A.ASTRAL_ORIGINAL_RULESET || A.DEFAULT_RULESET;
    const aiRows = Object.values(A.DIFFICULTIES).map(item => `<div><code>${escapeHtml(item.label)}</code><strong>fattore ${escapeHtml(item.randomFactor)} · ${item.simulatedAttackPhases} fasi</strong></div>`).join("");
    $("#rulesetContent").innerHTML = `<h3>Ruleset originale recuperato</h3><div class="ruleset-grid">${Object.entries(rules).map(([key, value]) => `<div><code>${escapeHtml(key)}</code><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>
      <h3>Le cinque IA originali</h3><div class="ruleset-grid">${aiRows}</div>
      <h3>Macchina degli stati</h3><div class="state-flow">${Object.values(A.PHASES).map(phase => `<span>${phase}</span>`).join("<b>→</b>")}</div>
      <h3>Estrazione originale recuperata</h3><div class="ruleset-grid"><div><code>Giocatore</code><strong>20 carte permanenti</strong></div><div><code>IA</code><strong>15 / 15 / 17 / 20 / 20</strong></div><div><code>Fasce iniziali</code><strong>1–4 · 5–8 · 9–12 per scuola</strong></div><div><code>Livello 13</code><strong>solo tramite Knowledge</strong></div></div>
      <h3>Motore delle 65 carte</h3><div class="ruleset-grid"><div><code>Dispatcher</code><strong>0x448878 · 65 rami</strong></div><div><code>Danno</code><strong>0x447AE0</strong></div><div><code>Attacco</code><strong>0x44A698</strong></div><div><code>Morti</code><strong>0x447DF4</strong></div><div><code>Ordine</code><strong>effetto → costo</strong></div><div><code>Costo</code><strong>sempre uguale al livello</strong></div></div>
      <h3>Specializzazioni recuperate</h3><div class="ruleset-grid">${A.ASTRAL_SPECIALIZATIONS.map(spec => `<div><code>${escapeHtml(spec.name)}</code><strong>${spec.groups.map((group,index) => `${index + 1}: ${A.getAstralAbilityRecords(group).map(a => a.name).join(", ")}`).join(" · ")}</strong></div>`).join("")}</div>
      <p class="note">I gruppi delle tre leghe sono loadout sostitutivi, non cumulativi. Craft/Mystery/Penalty modificano i poteri iniziali; Lord, aure, Nets, creature iniziali e Knowledge sono attivi anche nelle simulazioni IA.</p>`;
  }

  $("#runTestsBtn").addEventListener("click", () => {
    const report = A.runFoundationTests();
    $("#testResults").innerHTML = `<h3>${report.passed}/${report.total} test superati</h3>${report.results.map(result => `<div class="test-row ${result.ok ? "ok" : "fail"}"><strong>${result.ok ? "PASS" : "FAIL"}</strong><span>${escapeHtml(result.name)}</span><small>${result.duration} ms${result.error ? ` · ${escapeHtml(result.error)}` : ""}</small></div>`).join("")}`;
  });

  $("#legacyFolderInput").addEventListener("change", async event => {
    const files = [...event.target.files];
    const extensions = {};
    const candidates = [];
    const textHits = [];
    const namePattern = /(card|creature|spell|tournament|rank|trophy|ai|difficulty|astral|mana|power|save|profile)/i;
    files.forEach(file => {
      const extension = (file.name.split(".").pop() || "senza-estensione").toLowerCase();
      extensions[extension] = (extensions[extension] || 0) + 1;
      if (namePattern.test(file.webkitRelativePath || file.name)) candidates.push(file.webkitRelativePath || file.name);
    });
    const readable = files.filter(file => file.size <= 1_000_000 && /\.(txt|ini|cfg|xml|json|csv|log)$/i.test(file.name)).slice(0, 25);
    for (const file of readable) {
      try {
        const text = await file.text();
        const matches = text.match(/.{0,35}(card|creature|spell|tournament|rank|trophy|difficulty|mana|power).{0,55}/ig);
        if (matches) textHits.push({ file: file.webkitRelativePath || file.name, samples: matches.slice(0, 3) });
      } catch (error) { /* file non leggibile */ }
    }
    $("#legacyScanResults").innerHTML = `<h3>${files.length} file individuati</h3>
      <p><strong>Estensioni:</strong> ${Object.entries(extensions).sort((a,b) => b[1]-a[1]).slice(0,20).map(([ext,count]) => `${escapeHtml(ext)}: ${count}`).join(" · ")}</p>
      <h4>Nomi potenzialmente utili</h4><pre>${escapeHtml(candidates.slice(0,80).join("\n") || "Nessun nome evidente")}</pre>
      <h4>Stringhe trovate nei file testuali</h4><pre>${escapeHtml(textHits.map(hit => `${hit.file}\n  ${hit.samples.join("\n  ")}`).join("\n\n") || "Nessuna stringa rilevante")}</pre>`;
  });

  $("#animationSpeed").addEventListener("change", event => {
    animationSpeed = Number(event.target.value || 1);
    document.body.dataset.animationSpeed = animationSpeed >= 2 ? "slow" : animationSpeed < 1 ? "fast" : "normal";
    // keep menu selector in sync if present
    try { const m = $("#animationSpeedMenu"); if (m && m.value !== String(event.target.value)) m.value = String(event.target.value); } catch (e) {}
  });
  // Sync menu speed selector (footer) with main selector and set mobile default
  const menuSpeed = $("#animationSpeedMenu");
  if (menuSpeed) {
    // when menu selector changes, update main selector and trigger change logic
    menuSpeed.addEventListener("change", e => {
      const v = e.target.value;
      const main = $("#animationSpeed");
      if (main && main.value !== v) main.value = v;
      animationSpeed = Number(v || 1);
      document.body.dataset.animationSpeed = animationSpeed >= 2 ? "slow" : animationSpeed < 1 ? "fast" : "normal";
    });
  }
  // If on narrow screens, default to slow animations
  try {
    const isMobile = window.matchMedia && window.matchMedia('(max-width:760px)').matches;
    if (isMobile) {
      const slowVal = '2.75';
      const main = $("#animationSpeed");
      const menu = $("#animationSpeedMenu");
      if (main) main.value = slowVal;
      if (menu) menu.value = slowVal;
      animationSpeed = Number(slowVal);
      document.body.dataset.animationSpeed = "slow";
    }
  } catch (e) {}

  // Ensure selectors reflect the actual animationSpeed on startup
  try {
    const cur = String(animationSpeed);
    if (menuSpeed && menuSpeed.value !== cur) menuSpeed.value = cur;
    const mainSel = $("#animationSpeed");
    if (mainSel && mainSel.value !== cur) mainSel.value = cur;
    document.body.dataset.animationSpeed = animationSpeed >= 2 ? "slow" : animationSpeed < 1 ? "fast" : "normal";
  } catch (e) {}

  // Background music support
  let bgmAudio = null;
  let bgmEnabled = false;
  // subtle default so music is present but not intrusive
  let bgmVolume = 0.12;

  function startBackgroundMusic() {
    if (!bgmEnabled || !soundEnabled || UI_MODE === "essential") return;
    if (document.visibilityState === "hidden") return;
    try {
      if (!bgmAudio) {
        bgmAudio = new Audio('assets/audio/bgm.ogg');
        bgmAudio.loop = true;
        bgmAudio.volume = bgmVolume;
        bgmAudio.preload = 'auto';
      }
      if (bgmAudio.paused) {
        bgmAudio.play().catch(err => {
          console.warn('Background music play blocked or failed:', err);
          try {
            const cb = document.querySelector('#bgmEnabled');
            if (cb) cb.checked = false;
            window.localStorage.setItem('bgmEnabled', '0');
          } catch (e) {}
          pauseBackgroundMusic();
          // Inform the user that interaction is required to start audio
          try { alert('Il browser ha bloccato l\'autoplay della musica. Clicca il checkbox "Musica di sottofondo" per attivarla.'); } catch (e) {}
        });
      }
    } catch (e) { bgmAudio = null; }
  }

  function pauseBackgroundMusic() {
    try { if (bgmAudio && !bgmAudio.paused) bgmAudio.pause(); } catch (e) {}
  }

  function resumeBackgroundMusic() {
    if (!bgmEnabled || !soundEnabled || UI_MODE === "essential") return;
    startBackgroundMusic();
  }

  function handleBackgroundMusicVisibility() {
    if (document.visibilityState === "hidden") {
      pauseBackgroundMusic();
    } else {
      resumeBackgroundMusic();
    }
  }

  // initialize bgm toggle from localStorage and wire the menu checkbox
  try {
    const stored = window.localStorage.getItem('bgmEnabled');
    bgmEnabled = stored === null ? false : stored === '1';
    const bgmCheckbox = $("#bgmEnabled");
    const bgmSlider = $("#bgmVolume");

    // load stored volume (0-100) -> convert to 0-1
    const storedVol = window.localStorage.getItem('bgmVolume');
    if (storedVol !== null) {
      const n = Number(storedVol);
      if (!Number.isNaN(n)) bgmVolume = Math.max(0, Math.min(1, n / 100));
    }

    if (bgmSlider) {
      bgmSlider.value = Math.round(bgmVolume * 100);
      bgmSlider.addEventListener('input', e => {
        const v = Number(e.target.value || 0);
        bgmVolume = Math.max(0, Math.min(1, v / 100));
        window.localStorage.setItem('bgmVolume', String(Math.round(bgmVolume * 100)));
        try { if (bgmAudio) bgmAudio.volume = bgmVolume; } catch (err) {}
      });
    }

    if (bgmCheckbox) {
      bgmCheckbox.checked = bgmEnabled;
      bgmCheckbox.addEventListener('change', e => {
        bgmEnabled = Boolean(e.target.checked);
        window.localStorage.setItem('bgmEnabled', bgmEnabled ? '1' : '0');
        if (bgmEnabled) startBackgroundMusic(); else pauseBackgroundMusic();
      });
    }
    document.addEventListener("visibilitychange", handleBackgroundMusicVisibility);
    window.addEventListener("focus", resumeBackgroundMusic);
    window.addEventListener("blur", pauseBackgroundMusic);
    window.addEventListener("pageshow", resumeBackgroundMusic);
    window.addEventListener("pagehide", pauseBackgroundMusic);
    if (bgmEnabled) startBackgroundMusic();
  } catch (e) {}
  $("#collectionSearch")?.addEventListener("input", event => { collectionState.search = event.target.value; renderCollectionPanels(); const other = $("#collectionPageSearch"); if (other && other.value !== event.target.value) other.value = event.target.value; });
  $("#soundEnabled").addEventListener("change", event => { soundEnabled = event.target.checked; if (soundEnabled) { ensureAudio(); if (bgmEnabled) startBackgroundMusic(); } else { pauseBackgroundMusic(); } });

  function cleanupOldCaches() {
    if ("serviceWorker" in navigator) navigator.serviceWorker.getRegistrations().then(items => items.forEach(item => item.unregister())).catch(() => {});
    if ("caches" in window) caches.keys().then(keys => keys.forEach(key => caches.delete(key))).catch(() => {});
  }

  setupDifficultyOptions();
  setupLocalServerLifecycle();
  setupAstralSpecializationOptions();
  $("#duelModeSelect").addEventListener("change", renderTalentChoices);
  $("#cardArtStyleSelect").addEventListener("change", event => {
    cardArtStyle = event.target.value === "new" ? "new" : "original";
    document.body.dataset.cardArtStyle = cardArtStyle;
    renderCollectionPanels();
  });
  document.body.dataset.cardArtStyle = cardArtStyle;
  renderTalentChoices();
  populateEditor();
  renderTournament();
  renderProfile();
  renderRuleset();
  inspectedCardId = allAstralCards()[0]?.id || null;
  renderCollectionPanels();
  if (urlParams.get("qa") === "duel") {
    setTimeout(() => startDuel("fire", false, null, "normal"), 30);
  }
  cleanupOldCaches();
})(window.Arcane = window.Arcane || {});
