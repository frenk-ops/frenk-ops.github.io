(function (A) {
  "use strict";

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const t = (key, vars) => A.i18n?.t(key, vars) ?? key;
  const APP_VERSION = String(document.querySelector('meta[name="arcane-app-version"]')?.content || "").trim();
  A.APP_VERSION = APP_VERSION;
  const localizedCard = card => A.i18n?.card(card) || { name: card?.name || "", description: card?.text || "" };
  const cardName = card => localizedCard(card).name;
  const cardText = card => localizedCard(card).description;
  const sessionSets = {
    "astral-original": A.getCardSet("astral-original")
  };
  const configuredMultiplayerApiUrl = String(
    document.querySelector('meta[name="arcane-multiplayer-api"]')?.content || ""
  ).trim().replace(/\/$/, "");
  const localMultiplayerApiUrl = /^https?:$/.test(location.protocol)
    && ["127.0.0.1", "localhost", "::1"].includes(location.hostname)
    ? location.origin
    : "";
  A.MULTIPLAYER_API_URL = configuredMultiplayerApiUrl || localMultiplayerApiUrl;
  const multiplayerEnabled = Boolean(A.MULTIPLAYER_API_URL);
  const preference = (key, fallback) => {
    try {
      const value = localStorage.getItem(`arcane.${key}`);
      return value === null ? fallback : value;
    } catch { return fallback; }
  };

  let engine = null;
  let duelCommandSession = null;
  let activeSchool = "fire";
  let enemySchool = "fire";
  let enemyRevealedModalOpen = false;
  const normalizeAnimationSpeed = value => {
    const parsed = Number(value);
    if (parsed === 1.15) return 1.2;
    if (parsed === 2.75) return 1.5;
    return [0.55, 0.8, 1.2, 1.5].includes(parsed) ? parsed : 1.2;
  };
  const isMobileLayout = Boolean(window.matchMedia && window.matchMedia("(max-width: 820px)").matches);
  const defaultBoardCreatureNames = !isMobileLayout;
  if (isMobileLayout) {
    try {
      const migrationKey = "arcane.boardCreatureNamesMobileDefault.v1";
      if (!localStorage.getItem(migrationKey)) {
        localStorage.setItem("arcane.boardCreatureNames", "0");
        localStorage.setItem(migrationKey, "1");
      }
    } catch {}
  }
  let animationSpeed = normalizeAnimationSpeed(preference("animationSpeed", "1.2"));
  let cardArtStyle = "new";
  let parchmentSpellFrames = preference("parchmentSpellFrames", "0") === "1";
  let soundEnabled = preference("soundEnabled", "1") !== "0";
  let boardCreatureNames = preference("boardCreatureNames", defaultBoardCreatureNames ? "1" : "0") !== "0";
  let busy = false;
  let audioContext = null;
  const originalSoundCache = new Map();

  // UI-only spell identity registry. Engine events remain the source of truth;
  // these profiles only decide how a resolved spell is presented.
  const SPELL_FX_REGISTRY = Object.freeze({
    astral_fire_01: Object.freeze({
      vfx: "fire-spikes",
      sfx: Object.freeze({
        cast: Object.freeze([
          { type: "triangle", frequency: 170, secondFrequency: 620, duration: 0.28, volume: 0.055 },
          { type: "sawtooth", frequency: 420, secondFrequency: 980, duration: 0.18, volume: 0.025, delay: 0.08 }
        ]),
        impact: Object.freeze([
          { type: "sawtooth", frequency: 260, secondFrequency: 90, duration: 0.20, volume: 0.052 },
          { type: "triangle", frequency: 740, secondFrequency: 310, duration: 0.17, volume: 0.035, delay: 0.07 }
        ])
      })
    }),
    astral_water_01: Object.freeze({
      vfx: "cure",
      sfx: Object.freeze({
        cast: Object.freeze([
          { type: "sine", frequency: 480, secondFrequency: 900, duration: 0.34, volume: 0.045 },
          { type: "triangle", frequency: 720, secondFrequency: 1320, duration: 0.28, volume: 0.026, delay: 0.10 }
        ]),
        impact: Object.freeze([
          { type: "sine", frequency: 620, secondFrequency: 1180, duration: 0.42, volume: 0.045 }
        ])
      })
    }),
    astral_air_06: Object.freeze({
      vfx: "lightning",
      sfx: Object.freeze({
        cast: Object.freeze([
          { type: "square", frequency: 1320, secondFrequency: 2480, duration: 0.12, volume: 0.032 },
          { type: "sawtooth", frequency: 860, secondFrequency: 1720, duration: 0.16, volume: 0.025, delay: 0.08 }
        ]),
        impact: Object.freeze([
          { type: "square", frequency: 260, secondFrequency: 72, duration: 0.25, volume: 0.060 },
          { type: "triangle", frequency: 1120, secondFrequency: 180, duration: 0.18, volume: 0.038, delay: 0.025 }
        ])
      })
    }),
    astral_air_09: Object.freeze({
      vfx: "tornado",
      sfx: Object.freeze({
        cast: Object.freeze([
          { type: "sawtooth", frequency: 120, secondFrequency: 720, duration: 0.52, volume: 0.042 },
          { type: "sine", frequency: 260, secondFrequency: 960, duration: 0.44, volume: 0.025, delay: 0.07 }
        ]),
        impact: Object.freeze([
          { type: "triangle", frequency: 760, secondFrequency: 160, duration: 0.40, volume: 0.045 }
        ])
      })
    }),
    astral_death_08: Object.freeze({
      vfx: "drain-life",
      sfx: Object.freeze({
        cast: Object.freeze([
          { type: "sine", frequency: 390, secondFrequency: 145, duration: 0.45, volume: 0.040 },
          { type: "triangle", frequency: 680, secondFrequency: 230, duration: 0.34, volume: 0.024, delay: 0.08 }
        ]),
        impact: Object.freeze([
          { type: "sine", frequency: 210, secondFrequency: 520, duration: 0.48, volume: 0.046 }
        ])
      })
    }),
    astral_death_12: Object.freeze({
      vfx: "drain-souls",
      sfx: Object.freeze({
        cast: Object.freeze([
          { type: "sine", frequency: 105, secondFrequency: 58, duration: 0.62, volume: 0.052 },
          { type: "triangle", frequency: 390, secondFrequency: 118, duration: 0.48, volume: 0.028, delay: 0.12 }
        ]),
        impact: Object.freeze([
          { type: "sine", frequency: 92, secondFrequency: 230, duration: 0.66, volume: 0.055 },
          { type: "triangle", frequency: 510, secondFrequency: 155, duration: 0.46, volume: 0.026, delay: 0.10 }
        ])
      })
    })
  });

  function spellFxProfile(card) {
    return card?.id ? SPELL_FX_REGISTRY[card.id] || null : null;
  }
  let profile = A.loadProfile();
  let tournament = A.loadTournament();
  let tournamentMatch = false;
  let matchRecorded = false;
  const urlParams = new URLSearchParams(window.location.search);
  const UI_MODE = urlParams.get("ui") === "essential" ? "essential" : "classic";
  document.body.classList.toggle("ui-essential", UI_MODE === "essential");
  document.body.classList.toggle("ui-classic", UI_MODE === "classic");
  document.body.dataset.uiMode = UI_MODE;
  document.body.dataset.boardCreatureNames = boardCreatureNames ? "show" : "hide";
  let inspectedCardId = null;
  let inspectedCardSide = null;
  let inspectedCardInstanceId = null;
  let collectionSelectedCardId = null;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false;
  let turnBannerTimer = null;
  let presentationLog = [];
  let currentDuelLaunch = null;
  let remoteRoomClient = null;
  let remoteRoomPoll = null;
  let remoteHeartbeatTimer = null;
  let roomBrowserPoll = null;
  let remoteDuelActive = false;
  let remoteBattleSuspendedToMenu = false;
  let remoteLifecycleStatus = "idle";
  let lastRemoteRoomState = null;
  let remoteRenderedSnapshotKey = "";
  let remoteRefreshBusy = false;
  let multiplayerServerStatus = "idle";
  let multiplayerServerVersion = "";
  let multiplayerServerCheckPromise = null;
  let multiplayerServerRetryTimer = null;
  let multiplayerControlsLocked = false;
  let multiplayerUpdateRequested = false;
  let inspectedRemoteRoomCode = "";
  let inspectedRemoteRoomSettings = null;
  let remoteRoomInspectTimer = null;
  let currentPlayerName = "";
  let currentOpponentName = "";
  let matchStartedAt = null;
  let remoteMatchStartedAt = null;
  let currentTurnDamage = 0;
  let navigation = null;
  let pauseMenu = null;
  const collectionState = { school: "all", type: "all", level: "all", search: "" };

  const ACTIVE_LOCAL_DUEL_KEY = "arcane.activeLocalDuel.v1";

  function clearPersistedLocalDuel() {
    try { localStorage.removeItem(ACTIVE_LOCAL_DUEL_KEY); } catch {}
  }

  function persistLocalDuelState() {
    if (!engine || remoteDuelActive || engine.state?.gameOver) {
      if (engine?.state?.gameOver) clearPersistedLocalDuel();
      return;
    }
    try {
      localStorage.setItem(ACTIVE_LOCAL_DUEL_KEY, JSON.stringify({
        version: 1,
        savedAt: Date.now(),
        snapshot: engine.snapshot(),
        sequence: Number(duelCommandSession?.sequence || 0),
        matchId: duelCommandSession?.matchId || `local:${engine.state.seed}`,
        initialSnapshot: duelCommandSession?.initialSnapshot || engine.snapshot(),
        aiDifficulty: engine.aiDifficulty || "advanced",
        currentDuelLaunch,
        currentPlayerName,
        currentOpponentName,
        tournamentMatch,
        matchRecorded,
        matchStartedAt,
        currentTurnDamage,
        activeSchool,
        enemySchool
      }));
    } catch {}
  }

  function resumeRestoredLocalDuelFlow() {
    if (!engine || remoteDuelActive || engine.state.gameOver) return;
    const phase = engine.state.phase;
    if (phase === A.PHASES.PLAYER_ATTACK) {
      setTimeout(() => resolveAttackFlow("player"), 80);
    } else if ([A.PHASES.ENEMY_THINK, A.PHASES.ENEMY_PLAY].includes(phase)) {
      setTimeout(() => resolveAttackFlow("player"), 80);
    } else if (phase === A.PHASES.ENEMY_ATTACK) {
      setTimeout(() => resolveAttackFlow("enemy"), 80);
    }
  }

  function restorePersistedLocalDuel() {
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(ACTIVE_LOCAL_DUEL_KEY) || "null");
    } catch {
      clearPersistedLocalDuel();
      return false;
    }
    if (!saved || saved.version !== 1 || !saved.snapshot) return false;
    try {
      engine = A.GameEngine.fromSnapshot(saved.snapshot, sessionSets["astral-original"]);
      engine.aiDifficulty = saved.aiDifficulty || "advanced";
      duelCommandSession = new A.CommandSession(engine, {
        matchId: saved.matchId || `local:${engine.state.seed}`,
        sequence: Number(saved.sequence || 0),
        initialSnapshot: saved.initialSnapshot || saved.snapshot
      });
      currentDuelLaunch = saved.currentDuelLaunch || {
        playerTalent: engine.state.player?.talent || "fire",
        fromTournament: Boolean(saved.tournamentMatch),
        selectedSpecialization: engine.state.playerSpecialization,
        requestedMode: engine.state.playerSpecialization ? "specializations" : "normal",
        seed: engine.state.seed
      };
      currentPlayerName = normalizedPlayerName(saved.currentPlayerName, t("ui.player"));
      currentOpponentName = normalizedPlayerName(saved.currentOpponentName, t("ui.opponent"));
      tournamentMatch = Boolean(saved.tournamentMatch);
      matchRecorded = Boolean(saved.matchRecorded);
      matchStartedAt = Number(saved.matchStartedAt || Date.now());
      currentTurnDamage = Math.max(0, Number(saved.currentTurnDamage || 0));
      activeSchool = saved.activeSchool || engine.state.player?.talent || "fire";
      enemySchool = saved.enemySchool || engine.state.enemy?.talent || "water";
      inspectedCardId = engine.state.player.hand[0]?.id || allAstralCards()[0]?.id || null;
      inspectedCardSide = "player";
      inspectedCardInstanceId = null;
      $("#setupPanel")?.classList.add("hidden");
      $("#battlePanel")?.classList.remove("hidden");
      $("#duelSessionActions")?.classList.add("hidden");
      $("#duelMenuBtn")?.setAttribute("aria-expanded", "false");
      const generation = engine.state.generationDiagnostics?.[0];
      $("#seedBadge").textContent = generation
        ? `seed: ${engine.state.seed} · libro: ${generation.generationAttempt} tentativi`
        : `seed: ${engine.state.seed}`;
      busy = false;
      clearFxLayer();
      switchView("game");
      setMessage(t("status.duelRestored"));
      renderGame();
      resumeBackgroundMusic();
      resumeRestoredLocalDuelFlow();
      return true;
    } catch {
      clearPersistedLocalDuel();
      engine = null;
      duelCommandSession = null;
      return false;
    }
  }

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

  function schoolName(id) {
    return t(`schools.${id}`);
  }

  function schoolIconMarkup(id, className = "school-icon-svg") {
    if (typeof A.schoolIconMarkup === "function") return A.schoolIconMarkup(id, className);
    return `<span class="${className} school-icon-fallback" aria-hidden="true">${escapeHtml(school(id).icon)}</span>`;
  }

  function isTextEditingControl(target) {
    const element = target instanceof Element ? target : target?.parentElement;
    return Boolean(element?.closest("input, textarea, select, [contenteditable='true']"));
  }

  // Installed-app behavior: no browser zoom, text selection menu or native image drag
  // on the game surface. Form controls keep their normal editing behavior.
  ["gesturestart", "gesturechange", "gestureend"].forEach(type => {
    document.addEventListener(type, event => {
      if (!isTextEditingControl(event.target) && event.cancelable) event.preventDefault();
    }, { passive: false, capture: true });
  });
  document.addEventListener("touchmove", event => {
    if (event.touches?.length > 1 && event.cancelable) event.preventDefault();
  }, { passive: false, capture: true });
  document.addEventListener("contextmenu", event => {
    if (!isTextEditingControl(event.target)) event.preventDefault();
  }, true);
  document.addEventListener("dragstart", event => {
    const element = event.target instanceof Element ? event.target : null;
    if (element?.matches("img") || element?.closest(".game-card, .art-media, #battlePanel")) event.preventDefault();
  }, true);

  const SPELLBOOK_MODE_KEYS = Object.freeze({
    arcane: ["menu.arcaneDuel", "menu.arcaneDuelDescription"],
    free: ["menu.freeDuel", "menu.freeDuelDescription"],
    mirror: ["menu.mirrorDuel", "menu.mirrorDuelDescription"]
  });

  function normalizeSpellbookMode(value) {
    return SPELLBOOK_MODE_KEYS[value] ? value : "arcane";
  }

  function spellbookModeLabel(value) {
    return t(SPELLBOOK_MODE_KEYS[normalizeSpellbookMode(value)][0]);
  }

  function spellbookModeDescription(value) {
    return t(SPELLBOOK_MODE_KEYS[normalizeSpellbookMode(value)][1]);
  }

  function abilityName(ability) {
    return ability ? t(`ability.${ability.key}.name`) : "";
  }

  function abilityDescription(ability) {
    return ability ? t(`ability.${ability.key}.description`) : "";
  }

  function updateDuelModeDescription() {
    const mode = normalizeSpellbookMode($("#duelModeSelect")?.value);
    if ($("#duelModeDescription")) $("#duelModeDescription").textContent = spellbookModeDescription(mode);
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms * animationSpeed));
  }

  function normalizedPlayerName(value, fallback = t("ui.player")) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 24) || fallback;
  }

  function selectedPlayerName(input = null) {
    const candidate = input?.value
      ?? $("#optionsPlayerNameInput")?.value
      ?? localStorage.getItem("arcane.playerName")
      ?? profile?.playerName
      ?? $("#playerNameInput")?.value;
    return normalizedPlayerName(candidate);
  }

  function savePlayerName(input = null) {
    const name = selectedPlayerName(input);
    if ($("#playerNameInput")) $("#playerNameInput").value = name;
    if ($("#optionsPlayerNameInput")) $("#optionsPlayerNameInput").value = name;
    if ($("#onlinePlayerNameInput")) $("#onlinePlayerNameInput").value = name;
    localStorage.setItem("arcane.playerName", name);
    if (profile) {
      profile.playerName = name;
      A.saveProfile?.(profile);
    }
    return name;
  }

  function createRemoteRoomClient() {
    if (!multiplayerEnabled) throw new Error("Multiplayer online non configurato.");
    return new A.RemoteRoomClient({
      baseUrl: A.MULTIPLAYER_API_URL,
      clientVersion: APP_VERSION,
      compatibilityVersion: multiplayerServerVersion || APP_VERSION,
      protocolVersion: A.MULTIPLAYER_PROTOCOL_VERSION
    });
  }

  function setMultiplayerControlsDisabled(disabled) {
    multiplayerControlsLocked = Boolean(disabled);
    ["#onlineRoomCode", "#onlineSpecializationSelect", "#onlineJoinSpecializationSelect", "#onlineDuelModeSelect", "#onlineSpecializationsSelect", "#onlineRoomNameInput", "#onlineRoomVisibilitySelect"]
      .forEach(selector => {
        const control = $(selector);
        if (control) control.disabled = multiplayerControlsLocked;
      });
    const actionDisabled = multiplayerControlsLocked || multiplayerServerStatus !== "online";
    ["#createOnlineRoomBtn", "#joinOnlineRoomBtn"].forEach(selector => {
      const control = $(selector);
      if (control) control.disabled = actionDisabled;
    });
    if ($("#onlinePlayerNameInput")) $("#onlinePlayerNameInput").disabled = false;
  }

  function setMultiplayerServerState(state, detail = "") {
    multiplayerServerStatus = state;
    const root = $("#multiplayerServerState");
    if (!root) return;
    root.dataset.state = state;
    root.classList.toggle("is-connecting", state === "connecting" || state === "updating");
    root.classList.toggle("is-online", state === "online");
    root.classList.toggle("is-offline", state === "offline");
    const titleKey = state === "online"
      ? "online.serverOnline"
      : state === "offline"
        ? "online.serverOffline"
        : state === "updating"
          ? "online.updateRequired"
          : "online.serverConnecting";
    $("#multiplayerServerStateTitle").textContent = t(titleKey);
    $("#multiplayerServerStateDetail").textContent = detail || t(
      state === "online"
        ? "online.serverOnlineHint"
        : state === "offline"
          ? "online.serverOfflineHint"
          : state === "updating"
            ? "online.updatingClient"
            : "online.serverWakeHint"
    );
    $("#retryMultiplayerServerBtn")?.classList.toggle("hidden", state !== "offline");
    setMultiplayerControlsDisabled(multiplayerControlsLocked);
  }

  function compareAppVersions(left, right) {
    const parse = value => String(value || "").split(".").map(part => Number.parseInt(part, 10) || 0);
    const a = parse(left);
    const b = parse(right);
    for (let index = 0; index < Math.max(a.length, b.length, 3); index += 1) {
      if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) < (b[index] || 0) ? -1 : 1;
    }
    return 0;
  }

  function duelIsVisible() {
    return Boolean($("#battlePanel") && !$("#battlePanel").classList.contains("hidden"));
  }

  async function activateWaitingAppUpdateIfSafe() {
    if (duelIsVisible() || !("serviceWorker" in navigator)) return false;
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return false;
      await registration.update();
      let worker = registration.waiting;
      if (!worker && registration.installing) {
        worker = registration.installing;
        if (worker.state !== "installed") {
          await new Promise(resolve => {
            const timeout = window.setTimeout(resolve, 6000);
            const onStateChange = () => {
              if (!["installed", "redundant"].includes(worker.state)) return;
              window.clearTimeout(timeout);
              worker.removeEventListener("statechange", onStateChange);
              resolve();
            };
            worker.addEventListener("statechange", onStateChange);
          });
        }
        worker = registration.waiting || worker;
      }
      if (!worker || worker.state !== "installed") return false;
      worker.postMessage({ type: "ACTIVATE_UPDATE", safeToActivate: true });
      return true;
    } catch {
      return false;
    }
  }

  async function requestLatestAppVersion() {
    if (duelIsVisible()) {
      setMultiplayerServerState("updating", t("online.updateAfterDuel"));
      return;
    }
    if (multiplayerUpdateRequested) return;
    multiplayerUpdateRequested = true;
    setMultiplayerServerState("updating", t("online.updatingClient"));
    let activationRequested = false;
    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.update();
          let worker = registration.waiting;
          if (!worker && registration.installing) {
            worker = registration.installing;
            if (worker.state !== "installed") {
              await new Promise(resolve => {
                const timeout = window.setTimeout(resolve, 6000);
                const onStateChange = () => {
                  if (!["installed", "redundant"].includes(worker.state)) return;
                  window.clearTimeout(timeout);
                  worker.removeEventListener("statechange", onStateChange);
                  resolve();
                };
                worker.addEventListener("statechange", onStateChange);
              });
            }
            worker = registration.waiting || worker;
          }
          if (worker?.state === "installed" || registration.waiting === worker) {
            worker.postMessage({ type: "ACTIVATE_UPDATE", safeToActivate: true });
            activationRequested = true;
          }
        }
      }
    } catch {}
    window.setTimeout(() => {
      const duelActive = Boolean($("#battlePanel") && !$("#battlePanel").classList.contains("hidden"));
      if (!duelActive) location.reload();
    }, activationRequested ? 900 : 1000);
  }

  function scheduleMultiplayerServerRetry(delay = 4000) {
    if (multiplayerServerRetryTimer) window.clearTimeout(multiplayerServerRetryTimer);
    multiplayerServerRetryTimer = window.setTimeout(() => {
      multiplayerServerRetryTimer = null;
      checkMultiplayerServer({ force: true });
    }, delay);
  }

  function acceptMultiplayerCompatibility(payload) {
    const serverVersion = String(payload?.appVersion || "");
    const serverProtocol = Number(payload?.protocolVersion);
    const clientProtocol = Number(A.MULTIPLAYER_PROTOCOL_VERSION);
    if (serverVersion) multiplayerServerVersion = serverVersion;

    if (!Number.isFinite(serverProtocol)) {
      setMultiplayerServerState("offline");
      return false;
    }

    if (serverProtocol !== clientProtocol) {
      if (remoteRoomClient?.code) return true;
      if (serverProtocol > clientProtocol) {
        requestLatestAppVersion();
      } else {
        setMultiplayerServerState("connecting", t("online.serverUpdating"));
        scheduleMultiplayerServerRetry();
      }
      return false;
    }

    if (serverVersion && APP_VERSION && compareAppVersions(APP_VERSION, serverVersion) < 0) {
      requestLatestAppVersion();
      return false;
    }

    return true;
  }

  function handleMultiplayerCompatibilityError(error) {
    if (error?.code !== "VERSION_MISMATCH" && Number(error?.status) !== 426) return false;
    acceptMultiplayerCompatibility({
      appVersion: error.expectedVersion,
      protocolVersion: error.expectedProtocolVersion
    });
    return true;
  }

  async function checkMultiplayerServer(options = {}) {
    if (!multiplayerEnabled) {
      setMultiplayerServerState("offline", t("online.notConfigured"));
      return false;
    }
    if (multiplayerServerCheckPromise) return multiplayerServerCheckPromise;
    setMultiplayerServerState("connecting");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20000);
    multiplayerServerCheckPromise = fetch(`${A.MULTIPLAYER_API_URL}/health`, {
      cache: "no-store",
      signal: controller.signal
    })
      .then(async response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (!payload?.ok) throw new Error("Health check failed");
        if (!acceptMultiplayerCompatibility(payload)) return false;
        if (multiplayerServerRetryTimer) {
          window.clearTimeout(multiplayerServerRetryTimer);
          multiplayerServerRetryTimer = null;
        }
        setMultiplayerServerState("online");
        if ($("#multiplayerView")?.classList.contains("active")) refreshRoomBrowser();
        return true;
      })
      .catch(() => {
        setMultiplayerServerState("offline");
        return false;
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        multiplayerServerCheckPromise = null;
      });
    return multiplayerServerCheckPromise;
  }

  function syncMultiplayerAvailability() {
    $$(".multiplayer-nav").forEach(tab => tab.classList.toggle("hidden", !multiplayerEnabled));
    if (!multiplayerEnabled) setMultiplayerServerState("offline", t("online.notConfigured"));
  }

  function saveRemoteRoom() {
    if (!remoteRoomClient?.code) return localStorage.removeItem("arcane.remoteRoom");
    localStorage.setItem("arcane.remoteRoom", JSON.stringify({
      code: remoteRoomClient.code, token: remoteRoomClient.token, side: remoteRoomClient.side,
      sequence: remoteRoomClient.sequence, checksum: remoteRoomClient.checksum,
      startedAt: remoteMatchStartedAt || null
    }));
  }

  function stopRemoteTimers() {
    clearInterval(remoteRoomPoll);
    clearInterval(remoteHeartbeatTimer);
    remoteRoomPoll = null;
    remoteHeartbeatTimer = null;
  }

  function clearRemoteSession() {
    stopRemoteTimers();
    remoteRoomClient = null;
    lastRemoteRoomState = null;
    remoteRenderedSnapshotKey = "";
    remoteMatchStartedAt = null;
    remoteDuelActive = false;
    remoteBattleSuspendedToMenu = false;
    remoteLifecycleStatus = "idle";
    saveRemoteRoom();
    renderRecoverableMatch();
    $("#remoteDisconnectOverlay")?.classList.add("hidden");
  }

  function remoteResultLabel(lifecycle) {
    if (!lifecycle || lifecycle.status !== "finished" || !remoteRoomClient?.side) return "";
    if (!lifecycle.winner) return t("result.draw");
    return lifecycle.winner === remoteRoomClient.side ? t("result.victory") : t("result.defeat");
  }

  function renderRecoverableMatch(response = lastRemoteRoomState) {
    const root = $("#onlineRecoverableMatch");
    if (!root) return;
    const visible = Boolean(remoteRoomClient?.code && response);
    root.classList.toggle("hidden", !visible);
    if (!visible) return;
    const lifecycle = response.lifecycle || {};
    if ($("#onlineRecoverableMatchTitle")) {
      $("#onlineRecoverableMatchTitle").textContent = response.name || `${t("online.room")} ${response.code || remoteRoomClient.code}`;
    }
    if ($("#onlineRecoverableMatchStatus")) {
      $("#onlineRecoverableMatchStatus").textContent = lifecycle.status === "finished"
        ? remoteResultLabel(lifecycle)
        : lifecycle.status === "disconnected"
          ? t("online.opponentDisconnected")
          : t("online.activeMatchReady");
    }
    const button = $("#resumeOnlineMatchBtn");
    if (button) button.textContent = lifecycle.status === "finished" ? t("online.closeMatch") : t("online.resumeMatch");
  }

  function applyRemoteLifecycle(response) {
    if (!response) return;
    lastRemoteRoomState = response;
    const lifecycle = response.lifecycle || {};
    remoteLifecycleStatus = lifecycle.status || (response.ready ? "active" : "waiting");
    renderRecoverableMatch(response);

    const overlay = $("#remoteDisconnectOverlay");
    const title = $("#remoteDisconnectTitle");
    const detail = $("#remoteDisconnectDetail");
    const countdown = $("#remoteDisconnectCountdown");
    const returnButton = $("#remoteDisconnectReturnBtn");

    if (remoteLifecycleStatus === "finished") {
      if (remoteRoomClient?.side) {
        const result = lifecycle.winner === remoteRoomClient.side
          ? "win"
          : lifecycle.winner
            ? "loss"
            : "draw";
        A.recordProfileMatch?.(profile, {
          matchId: response.matchId || `room:${response.code || remoteRoomClient.code}`,
          mode: "multiplayer",
          result,
          durationMs: remoteMatchStartedAt ? Date.now() - remoteMatchStartedAt : null
        });
        profile = A.loadProfile();
        renderPlayerProfile();
      }
      if (overlay && remoteDuelActive) overlay.classList.remove("hidden");
      if (title) title.textContent = remoteResultLabel(lifecycle) || t("online.matchFinished");
      if (detail) detail.textContent = lifecycle.reason === "forfeit"
        ? t("online.matchFinishedForfeit")
        : lifecycle.reason === "disconnect_timeout"
          ? t("online.matchFinishedDisconnect")
          : t("online.matchFinished");
      if (countdown) countdown.textContent = "";
      returnButton?.classList.remove("hidden");
      return;
    }

    if (remoteLifecycleStatus !== "disconnected") {
      overlay?.classList.add("hidden");
      returnButton?.classList.add("hidden");
      return;
    }

    if (overlay && remoteDuelActive) overlay.classList.remove("hidden");
    if (title) title.textContent = t("online.opponentDisconnected");
    if (detail) detail.textContent = t("online.waitingReconnect");
    const remainingSeconds = lifecycle.remainingMs == null ? null : Math.ceil(Number(lifecycle.remainingMs) / 1000);
    if (countdown) countdown.textContent = remainingSeconds == null
      ? ""
      : t("online.disconnectCountdown", { seconds: remainingSeconds });
    returnButton?.classList.toggle("hidden", !lifecycle.canReturnToMenu);
  }

  async function heartbeatRemoteRoom() {
    if (!remoteRoomClient?.code || !remoteRoomClient?.token) return;
    try {
      const response = await remoteRoomClient.heartbeat();
      applyRemoteLifecycle({ ...(lastRemoteRoomState || {}), lifecycle: response.lifecycle });
    } catch {}
  }

  function hideRemoteBattleToMultiplayer() {
    remoteBattleSuspendedToMenu = true;
    remoteDuelActive = false;
    engine = null;
    busy = false;
    $("#battlePanel")?.classList.add("hidden");
    $("#setupPanel")?.classList.remove("hidden");
    $("#remoteDisconnectOverlay")?.classList.add("hidden");
    pauseBackgroundMusic();
    switchView("multiplayer");
    renderRemoteLobby(lastRemoteRoomState, { deferBattle: true });
    renderRecoverableMatch();
  }

  function clearRemoteRoomPreview() {
    inspectedRemoteRoomCode = "";
    inspectedRemoteRoomSettings = null;
    $("#onlineJoinRoomInfo")?.classList.add("hidden");
    $("#onlineJoinSpecializationField")?.classList.add("hidden");
    if ($("#onlineJoinRoomMode")) $("#onlineJoinRoomMode").textContent = "—";
  }

  function roomModeLabel(settings) {
    const mode = spellbookModeLabel(settings?.spellbookDistribution || "arcane");
    const specializations = settings?.specializationsEnabled
      ? t("online.specializationsEnabled")
      : t("online.specializationsDisabled");
    return `${mode} · ${specializations}`;
  }

  function roomStatusLabel(status) {
    return t(`online.roomStatus.${status || "waiting"}`);
  }

  function renderRoomBrowser(rooms = []) {
    const root = $("#onlineRoomBrowserList");
    if (!root) return;
    root.innerHTML = "";
    if (!rooms.length) {
      const empty = document.createElement("div");
      empty.className = "multiplayer-room-empty";
      empty.textContent = t("online.noRooms");
      root.appendChild(empty);
      return;
    }
    rooms.forEach(room => {
      const row = document.createElement("article");
      row.className = "multiplayer-room-entry";
      const copy = document.createElement("div");
      copy.className = "multiplayer-room-entry-copy";
      const title = document.createElement("strong");
      title.textContent = room.name || `${t("online.room")} ${room.code}`;
      const meta = document.createElement("span");
      meta.textContent = `${room.hostName || t("online.waitingPlayer")} · ${roomModeLabel(room.settings)}`;
      const status = document.createElement("small");
      status.className = `multiplayer-room-entry-status is-${room.status || "waiting"}`;
      status.textContent = roomStatusLabel(room.status);
      copy.append(title, meta, status);
      row.appendChild(copy);
      const action = document.createElement("button");
      action.type = "button";
      action.className = "classic-stone-button";
      action.textContent = room.joinable ? t("online.join") : t("online.inProgress");
      action.disabled = !room.joinable;
      if (room.joinable) {
        action.addEventListener("click", async () => {
          const input = $("#onlineRoomCode");
          if (input) input.value = room.code;
          clearRemoteRoomPreview();
          const preview = await inspectRemoteRoom(room.code, { force: true });
          if (preview) $("#joinOnlineRoomBtn")?.click();
        });
      }
      row.appendChild(action);
      root.appendChild(row);
    });
  }

  async function refreshRoomBrowser() {
    if (multiplayerServerStatus !== "online") return false;
    try {
      const response = await createRemoteRoomClient().listRooms({
        availableOnly: $("#showAvailableRoomsOnly")?.checked !== false
      });
      renderRoomBrowser(response.rooms || []);
      return true;
    } catch (error) {
      if (!handleMultiplayerCompatibilityError(error)) renderRoomBrowser([]);
      return false;
    }
  }

  function beginRoomBrowserPolling() {
    clearInterval(roomBrowserPoll);
    roomBrowserPoll = setInterval(() => {
      if ($("#multiplayerView")?.classList.contains("active")) refreshRoomBrowser();
    }, 5000);
  }

  function renderRemoteRoomPreview(code, info) {
    inspectedRemoteRoomCode = code;
    inspectedRemoteRoomSettings = info?.settings || null;
    $("#onlineJoinRoomInfo")?.classList.remove("hidden");
    if ($("#onlineJoinRoomMode")) $("#onlineJoinRoomMode").textContent = roomModeLabel(inspectedRemoteRoomSettings);
    $("#onlineJoinSpecializationField")?.classList.toggle("hidden", !inspectedRemoteRoomSettings?.specializationsEnabled);
  }

  async function inspectRemoteRoom(code, options = {}) {
    const normalized = String(code || "").trim().toUpperCase();
    if (normalized.length !== 6) {
      clearRemoteRoomPreview();
      return null;
    }
    if (!options.force && inspectedRemoteRoomCode === normalized && inspectedRemoteRoomSettings) {
      return { code: normalized, settings: inspectedRemoteRoomSettings };
    }
    if (multiplayerServerStatus !== "online" && !await checkMultiplayerServer({ force: true })) return null;
    try {
      const info = await createRemoteRoomClient().inspect(normalized);
      renderRemoteRoomPreview(normalized, info);
      if ($("#onlineFormMessage")) $("#onlineFormMessage").textContent = "";
      return info;
    } catch (error) {
      clearRemoteRoomPreview();
      if (handleMultiplayerCompatibilityError(error)) return null;
      if (!options.silent && $("#onlineFormMessage")) $("#onlineFormMessage").textContent = error.message || t("online.error");
      return null;
    }
  }

  function renderRemoteLobby(response, options = {}) {
    const suspended = Boolean(response && remoteBattleSuspendedToMenu);
    $("#onlineLobbyActions")?.classList.toggle("hidden", Boolean(response) && !suspended);
    $("#onlineLobbyStatus")?.classList.toggle("hidden", !response || suspended);
    if (!response) {
      renderRecoverableMatch();
      setMultiplayerControlsDisabled(false);
      return;
    }
    applyRemoteLifecycle(response);
    if ($("#onlineRoomCodeLabel")) $("#onlineRoomCodeLabel").textContent = response.code || remoteRoomClient?.code || "";
    if ($("#onlineConnectionMessage")) $("#onlineConnectionMessage").textContent = t(response.ready ? "online.ready" : "online.waiting");
    const names = response.playerNames || {};
    if ($("#onlinePlayerOneName")) $("#onlinePlayerOneName").textContent = normalizedPlayerName(names.player, t("online.waitingPlayer"));
    if ($("#onlinePlayerTwoName")) $("#onlinePlayerTwoName").textContent = names.enemy
      ? normalizedPlayerName(names.enemy, t("online.waitingPlayer"))
      : t("online.waitingPlayer");
    setMultiplayerControlsDisabled(true);
    if (response.ready && !options.deferBattle && !remoteBattleSuspendedToMenu && response.lifecycle?.status !== "finished") showRemoteBattle(response);
  }

  function orientRemoteSnapshot(snapshot, side) {
    const oriented = A.deepClone(snapshot);
    if (side !== "enemy") return oriented;
    [oriented.state.player, oriented.state.enemy] = [oriented.state.enemy, oriented.state.player];
    const phaseSwap = {
      [A.PHASES.PLAYER_SELECT]: A.PHASES.ENEMY_PLAY,
      [A.PHASES.PLAYER_TARGET]: A.PHASES.ENEMY_PLAY,
      [A.PHASES.PLAYER_ATTACK]: A.PHASES.ENEMY_ATTACK,
      [A.PHASES.ENEMY_THINK]: A.PHASES.PLAYER_SELECT,
      [A.PHASES.ENEMY_PLAY]: A.PHASES.PLAYER_SELECT,
      [A.PHASES.ENEMY_ATTACK]: A.PHASES.PLAYER_ATTACK
    };
    oriented.state.phase = phaseSwap[oriented.state.phase] || oriented.state.phase;
    oriented.state.activeSide = oriented.state.activeSide === "player" ? "enemy" : "player";
    if (oriented.state.winner === "player") oriented.state.winner = "enemy";
    else if (oriented.state.winner === "enemy") oriented.state.winner = "player";
    return oriented;
  }

  function orientRemotePresentation(value) {
    const clone = A.deepClone(value);
    if (remoteRoomClient?.side !== "enemy") return clone;
    const swap = item => {
      if (item === "player") return "enemy";
      if (item === "enemy") return "player";
      if (Array.isArray(item)) return item.map(swap);
      if (item && typeof item === "object") {
        Object.keys(item).forEach(key => { item[key] = swap(item[key]); });
      }
      return item;
    };
    return swap(clone);
  }

  function loadRemoteEngine(snapshot) {
    engine = A.GameEngine.fromSnapshot(
      orientRemoteSnapshot(snapshot, remoteRoomClient.side),
      sessionSets["astral-original"]
    );
    remoteDuelActive = true;
    activeSchool = engine.state.player.talent;
    enemySchool = engine.state.enemy.talent;
  }

  function remoteSnapshotKey(response) {
    if (!response?.state || !remoteRoomClient) return "";
    return [
      response.code || remoteRoomClient.code || "",
      remoteRoomClient.side || "",
      Number(response.sequence || 0),
      response.checksum || ""
    ].join("|");
  }

  function updateRemoteBattleIdentity(response) {
    const names = response.playerNames || {};
    currentPlayerName = remoteRoomClient.side === "enemy"
      ? normalizedPlayerName(names.enemy, t("ui.player"))
      : normalizedPlayerName(names.player, t("ui.player"));
    currentOpponentName = remoteRoomClient.side === "enemy"
      ? normalizedPlayerName(names.player, t("ui.opponent"))
      : normalizedPlayerName(names.enemy, t("ui.opponent"));
    tournamentMatch = false;
  }

  function showRemoteBattle(response, options = {}) {
    clearPersistedLocalDuel();
    if (!response?.state || response.lifecycle?.status === "finished") {
      applyRemoteLifecycle(response);
      return false;
    }
    remoteBattleSuspendedToMenu = false;
    applyRemoteLifecycle(response);
    const snapshotKey = remoteSnapshotKey(response);
    if (!options.force && snapshotKey && snapshotKey === remoteRenderedSnapshotKey) return false;
    const enteringRemoteBattle = !remoteDuelActive;
    remoteRenderedSnapshotKey = snapshotKey;
    loadRemoteEngine(response.state);
    if (!remoteMatchStartedAt) remoteMatchStartedAt = Date.now();
    updateRemoteBattleIdentity(response);
    if (enteringRemoteBattle) presentationLog = [];
    inspectedCardId = engine.state.player.hand.find(card => !card.hidden)?.id || inspectedCardId || null;
    inspectedCardSide = "player";
    switchView("game");
    $("#setupPanel").classList.add("hidden");
    $("#battlePanel").classList.remove("hidden");
    navigation?.setActive("multiplayer");
    $("#seedBadge").textContent = `online · ${response.code || remoteRoomClient.code} · #${response.sequence}`;
    renderGame();
    if (engine.state.gameOver) {
      A.recordProfileMatch?.(profile, {
        matchId: response.matchId || `room:${response.code || remoteRoomClient.code}`,
        mode: "multiplayer",
        result: engine.state.winner === "player" ? "win" : engine.state.winner === "enemy" ? "loss" : "draw",
        durationMs: remoteMatchStartedAt ? Date.now() - remoteMatchStartedAt : null
      });
      profile = A.loadProfile();
      renderPlayerProfile();
    }
    return true;
  }

  async function presentRemoteCommandResponse(response) {
    if (!response?.state) return false;
    if (response.stale) {
      showRemoteBattle(response, { force: true });
      return false;
    }
    if (!engine || !remoteDuelActive || !response.result) {
      showRemoteBattle(response, { force: true });
      return false;
    }

    const before = captureHealthState();
    const command = orientRemotePresentation(response.command || {});
    const result = orientRemotePresentation(response.result);
    const type = command.type || response.command?.type;
    const actor = command.actor || "enemy";
    const slot = command.payload?.slot ?? null;

    loadRemoteEngine(response.state);

    if (type === A.MULTIPLAYER_COMMANDS.PLAY && result?.ok && result.card) {
      if (result.card.type === "spell") spellSound(result.card);
      if (result.card.type === "creature") playOriginalSound("summon2", 0.36);
      await animateCardPlay(result, actor, slot, before);
      await presentResolutionBeforeUpdate(result, before);
      renderGame();
      showResolutionAfterUpdate(result);
      recordCardResolution(result);
      await sleep(reducedMotion ? 0 : 100);
      return true;
    }

    if (type === A.MULTIPLAYER_COMMANDS.ATTACK_NEXT && result?.ok && !result.done && !result.skipped) {
      const healingShown = showHealingChanges(before, result);
      const triggeredDamageEvents = (result.events || []).filter(event =>
        ["astralHeroDamage", "astralCreatureDamage", "heroDamage", "creatureDamage"].includes(event.type)
        && event.sourceKind === "effect"
      );
      if (triggeredDamageEvents.length) showResolvedEffectDamage({ events: triggeredDamageEvents });
      if (healingShown > 0 || triggeredDamageEvents.length > 0) await sleep(reducedMotion ? 0 : 460);
      const hasAttackDamage = Number(result.event?.damage || 0) > 0;
      if (hasAttackDamage) {
        await animateAttack(result.event);
        showDamage(result.event);
      }
      showCollateralDamage(result.events);
      showResolutionDeaths(result);
      if (hasAttackDamage || triggeredDamageEvents.length > 0) await sleep(reducedMotion ? 0 : 520);
      renderGame();
      showResolutionAfterUpdate(result);
      const structuredDamage = (result.events || []).find(event =>
        ["astralHeroDamage", "astralCreatureDamage"].includes(event.type)
        && event.sourceKind === "creature"
      );
      pushPresentationLog("log.attack", {
        sourceCardId: structuredDamage?.sourceId,
        sourceName: result.event?.attackerName,
        ...(result.event?.type === "directAttack"
          ? { targetSide: result.event?.enemySide }
          : { targetCardId: structuredDamage?.targetId, targetName: result.event?.targetName }),
        amount: result.event?.damage
      });
      recordAttackSecondaryEffects(result);
      recordAttackRegeneration(result);
      await sleep(reducedMotion ? 0 : 260);
      return true;
    }

    if (type === A.MULTIPLAYER_COMMANDS.FINISH_ATTACK && result?.ok) {
      const healingShown = showHealingChanges(before, result);
      const powerShown = showPowerValueChanges(before);
      const attackShown = showUnitAttackChanges(before);
      if (healingShown + powerShown + attackShown > 0) await sleep(reducedMotion ? 0 : 460);
      renderGame();
      return true;
    }

    if (type === A.MULTIPLAYER_COMMANDS.PASS && result?.ok) {
      pushPresentationLog("log.pass", { actorSide: actor });
      showTurnBanner(t("turn.passed"), actor, 700);
    }
    renderGame();
    return true;
  }

  async function presentRemoteActions(response) {
    const actions = Array.isArray(response?.actions) ? response.actions : [];
    if (!actions.length || !engine || !remoteDuelActive) {
      showRemoteBattle(response);
      return;
    }
    for (const action of actions) {
      await presentRemoteCommandResponse({
        ...response,
        sequence: action.sequence,
        command: action.command,
        result: action.result,
        state: action.state
      });
    }
    showRemoteBattle(response, { force: true });
  }

  async function refreshRemoteRoom() {
    if (!remoteRoomClient || remoteRefreshBusy || busy) return;
    remoteRefreshBusy = true;
    try {
      let state = await remoteRoomClient.reconnect();
      if (state.stale) return;
      setMultiplayerServerState("online");
      applyRemoteLifecycle(state);
      const animateMissedActions = Boolean(
        state.ready
        && state.lifecycle?.status === "active"
        && remoteDuelActive
        && engine
        && state.actions?.length
      );
      renderRemoteLobby(state, { deferBattle: animateMissedActions || remoteBattleSuspendedToMenu || state.lifecycle?.status === "finished" });
      if (animateMissedActions && !remoteBattleSuspendedToMenu) {
        busy = true;
        try {
          await presentRemoteActions(state);
        } finally {
          busy = false;
        }
      }
      if (state.ready && state.lifecycle?.status === "active" && !remoteBattleSuspendedToMenu && remoteRoomClient.side === "enemy" && state.state?.state?.phase === A.PHASES.ENEMY_THINK) {
        state = await remoteRoomClient.submit(A.MULTIPLAYER_COMMANDS.BEGIN_PLAY);
        showRemoteBattle(state);
      }
      saveRemoteRoom();
    }
    catch (error) {
      const staleRoom = [401, 404, 410].includes(Number(error?.status));
      if (staleRoom) {
        stopRemoteTimers();
        remoteRoomClient = null;
        remoteRenderedSnapshotKey = "";
        remoteMatchStartedAt = null;
        saveRemoteRoom();
        renderRemoteLobby(null);
        setMultiplayerServerState("online");
        if ($("#onlineFormMessage")) $("#onlineFormMessage").textContent = error.message || t("online.error");
        return;
      }
      setMultiplayerServerState("offline");
    }
    finally { remoteRefreshBusy = false; }
  }

  function beginRemotePolling() {
    clearInterval(remoteRoomPoll);
    clearInterval(remoteHeartbeatTimer);
    remoteRoomPoll = setInterval(refreshRemoteRoom, 1200);
    remoteHeartbeatTimer = setInterval(heartbeatRemoteRoom, 5000);
    heartbeatRemoteRoom();
  }

  function resumeRemoteSynchronization() {
    if (!remoteRoomClient?.code || !remoteRoomClient?.token) return;
    beginRemotePolling();
    refreshRemoteRoom();
  }

  async function resolveRemoteMove(type, payload = {}) {
    if (remoteLifecycleStatus && remoteLifecycleStatus !== "active") {
      setMessage(remoteLifecycleStatus === "disconnected" ? t("online.waitingReconnect") : t("online.matchFinished"));
      return null;
    }
    clearInterval(remoteRoomPoll);
    remoteRoomPoll = null;
    busy = true;
    try {
      let response = await remoteRoomClient.submit(type, payload);
      trackOwnCommandResult(type, response.result, remoteRoomClient.side === "enemy" ? "player" : "enemy");
      await presentRemoteCommandResponse(response);
      while (response.state?.state?.phase === (remoteRoomClient.side === "player" ? A.PHASES.PLAYER_ATTACK : A.PHASES.ENEMY_ATTACK)) {
        response = await remoteRoomClient.submit(A.MULTIPLAYER_COMMANDS.ATTACK_NEXT);
        trackOwnCommandResult(A.MULTIPLAYER_COMMANDS.ATTACK_NEXT, response.result, remoteRoomClient.side === "enemy" ? "player" : "enemy");
        await presentRemoteCommandResponse(response);
        if (response.result?.done) {
          response = await remoteRoomClient.submit(A.MULTIPLAYER_COMMANDS.FINISH_ATTACK);
          trackOwnCommandResult(A.MULTIPLAYER_COMMANDS.FINISH_ATTACK, response.result, remoteRoomClient.side === "enemy" ? "player" : "enemy");
          await presentRemoteCommandResponse(response);
          break;
        }
      }
      saveRemoteRoom();
      showRemoteBattle(response, { force: true });
      return response;
    } catch (error) {
      setMessage(error.message);
      await refreshRemoteRoom();
      return null;
    } finally {
      busy = false;
      beginRemotePolling();
    }
  }

  function profileDamageFromResult(result, opponentSide = "enemy") {
    const events = result?.events || [];
    const structured = events
      .filter(event => ["astralHeroDamage", "heroDamage"].includes(event.type))
      .filter(event => (event.targetSide || event.side) === opponentSide)
      .reduce((sum, event) => sum + Math.max(0, Number(event.amount || event.damage || 0)), 0);
    if (structured > 0) return structured;
    return result?.event?.type === "directAttack" && result.event.enemySide === opponentSide
      ? Math.max(0, Number(result.event.damage || 0))
      : 0;
  }

  function profileDrainFromResult(result) {
    return (result?.events || [])
      .filter(event => event.type === "astralVampireHeal")
      .reduce((sum, event) => sum + Math.max(0, Number(event.amount || 0)), 0);
  }

  function trackOwnCommandResult(type, result, opponentSide = "enemy") {
    if (!result?.ok) return;
    if (type === A.MULTIPLAYER_COMMANDS.PLAY && result.card) {
      A.recordProfileCardPlay?.(profile, result.card);
    }
    const damage = profileDamageFromResult(result, opponentSide);
    const lifeDrained = profileDrainFromResult(result);
    if (damage || lifeDrained) {
      currentTurnDamage += damage;
      A.recordProfileCombat?.(profile, { damage, lifeDrained });
    }
    if (type === A.MULTIPLAYER_COMMANDS.FINISH_ATTACK) {
      A.recordProfileCombat?.(profile, { turnDamage: currentTurnDamage });
      currentTurnDamage = 0;
    }
    profile = A.loadProfile();
  }

  function issueDuelCommand(actor, type, payload = {}) {
    if (!duelCommandSession) return { ok: false, reason: "Sessione del duello non disponibile." };
    const command = duelCommandSession.createCommand(actor, type, payload);
    const outcome = duelCommandSession.dispatch(command);
    if (outcome.ok && !remoteDuelActive) {
      if (actor === "player") trackOwnCommandResult(type, outcome.result);
      persistLocalDuelState();
    }
    return outcome.ok ? outcome.result : { ok: false, reason: outcome.reason };
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
    $(`#${name}View`)?.classList.add("active");
    navigation?.setActive(name);
    if (name === "multiplayer") {
      checkMultiplayerServer().then(online => { if (online) refreshRoomBrowser(); });
      beginRoomBrowserPolling();
    } else {
      clearInterval(roomBrowserPoll);
      roomBrowserPoll = null;
    }
    if (name === "tournament") renderTournament();
    if (name === "cards") renderCollectionPage();
    if (name === "profile") renderPlayerProfile();
    if (name === "rules") renderRuleset();
  }

  navigation = A.UINavigation?.create({ onViewChange: switchView, onReturnToGame: () => { if (!engine) restartDuel(); } });

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
    const now = ctx.currentTime + Math.max(0, Number(options.delay || 0));
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

  function playSpellFxSound(card, phase = "cast") {
    const cues = spellFxProfile(card)?.sfx?.[phase];
    if (!Array.isArray(cues) || cues.length === 0) return false;
    let played = false;
    cues.forEach(cue => {
      if (playSyntheticCue(cue)) played = true;
    });
    return played;
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

  function menuClickControlFromEvent(target) {
    const control = target?.closest?.("button, summary");
    if (!control) return null;
    if (control.disabled || control.getAttribute("aria-disabled") === "true") return null;
    if (control.matches("#endTurnBtn, .unit, .slot, .game-card, .collection-tile, .revealed-chip")) return null;
    if (control.closest(".classic-board-column, .classic-hand-grid, .classic-enemy-book, .page-grid")) return null;
    return control;
  }

  document.addEventListener("click", event => {
    if (!menuClickControlFromEvent(event.target)) return;
    playSchoolSelectionSound();
  }, true);

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

  function spellSound(card = null) {
    if (playSpellFxSound(card, "cast")) return;
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

  function specializationLabel(choice) {
    if (choice === "random") return `🎲 ${t("menu.randomSpecialization")}`;
    const spec = A.getAstralSpecialization?.(choice);
    return spec ? t(`specialization.${spec.id}`) : t("menu.randomSpecialization");
  }

  function specializationIconMarkup(choice, className = "school-icon-svg specialization-school-icon") {
    if (choice === "random") return '<span class="specialization-random-icon" aria-hidden="true">🎲</span>';
    const spec = A.getAstralSpecialization?.(choice);
    return spec?.talent ? schoolIconMarkup(spec.talent, className) : "";
  }

  function syncSpecializationSelectIcon(select) {
    if (!select) return;
    let control = select.closest(".specialization-select-control");
    if (!control) {
      control = document.createElement("div");
      control.className = "specialization-select-control";
      select.parentNode?.insertBefore(control, select);
      control.appendChild(select);
    }
    let icon = control.querySelector(".specialization-select-icon");
    if (!icon) {
      icon = document.createElement("span");
      icon.className = "specialization-select-icon";
      icon.setAttribute("aria-hidden", "true");
      control.insertBefore(icon, select);
    }
    const choice = select.value || "random";
    icon.classList.toggle("is-random", choice === "random");
    icon.innerHTML = specializationIconMarkup(choice);
  }

  function populateSpecializationSelect(select, fallback = "random") {
    if (!select) return;
    const current = select.value;
    select.innerHTML = [
      `<option value="random">🎲 ${t("menu.randomSpecialization")}</option>`,
      ...A.ASTRAL_SPECIALIZATIONS.map(item => `<option value="${item.id}">${t(`specialization.${item.id}`)}</option>`)
    ].join("");
    const valid = current === "random" || A.ASTRAL_SPECIALIZATIONS.some(item => item.id === current);
    select.value = valid ? current : fallback;
    syncSpecializationSelectIcon(select);
    if (!select.dataset.specializationIconBound) {
      select.dataset.specializationIconBound = "true";
      select.addEventListener("change", () => syncSpecializationSelectIcon(select));
    }
  }

  function resolveSpecializationChoice(choice, seed, side, fallback = "battlemage") {
    if (choice && choice !== "random") return A.getAstralSpecialization?.(choice)?.id || fallback;
    const available = A.ASTRAL_SPECIALIZATIONS || [];
    if (!available.length) return fallback;
    const rng = A.createRng(`${seed}-specialization-${side}`);
    return rng.pick(available)?.id || fallback;
  }

  function renderTalentChoices() {
    const root = $("#talentChoices");
    const distribution = normalizeSpellbookMode($("#duelModeSelect")?.value);
    const withSpecializations = $("#duelSpecializationsSelect")?.value === "on";
    root.innerHTML = "";
    updateDuelModeDescription();
    $("#talentChoiceHeading").textContent = t("menu.startDuel");
    $("#astralLeagueLabel")?.classList.toggle("hidden", !withSpecializations);
    $("#playerSpecializationLabel")?.classList.toggle("hidden", !withSpecializations);
    $("#enemySpecializationLabel")?.classList.toggle("hidden", !withSpecializations);

    const button = document.createElement("button");
    button.className = "talent";
    button.innerHTML = `<span>⚔️</span><strong>${t("menu.startDuel")}</strong><small>${spellbookModeDescription(distribution)}</small>`;
    button.addEventListener("click", () => {
      const playerChoice = withSpecializations ? ($("#playerSpecializationSelect")?.value || "random") : null;
      startDuel("fire", false, playerChoice, distribution);
    });
    root.appendChild(button);
  }

  function setupDifficultyOptions() {
    const select = $("#difficultySelect");
    const selected = select.value || "advanced";
    select.innerHTML = Object.values(A.DIFFICULTIES)
      .map(item => `<option value="${item.id}">${t(`difficulty.${item.id}`)}</option>`)
      .join("");
    select.value = A.DIFFICULTIES[selected] ? selected : "advanced";
  }

  function setupAstralSpecializationOptions() {
    populateSpecializationSelect($("#playerSpecializationSelect"), "random");
    populateSpecializationSelect($("#enemySpecializationSelect"), "random");
    populateSpecializationSelect($("#onlineSpecializationSelect"), "random");
    populateSpecializationSelect($("#onlineJoinSpecializationSelect"), "random");
  }

  function syncOnlineDuelMode() {
    const specialized = $("#onlineSpecializationsSelect")?.value === "on";
    $("#onlineSpecializationField")?.classList.toggle("hidden", !specialized);
  }

  function onlineDuelOptions() {
    const spellbookDistribution = normalizeSpellbookMode($("#onlineDuelModeSelect")?.value);
    const specializationsEnabled = $("#onlineSpecializationsSelect")?.value === "on";
    const result = {
      spellbookDistribution,
      specializationsEnabled,
      duelMode: specializationsEnabled ? "specializations" : "normal",
      roomName: String($("#onlineRoomNameInput")?.value || "").trim(),
      visibility: $("#onlineRoomVisibilitySelect")?.value === "private" ? "private" : "public"
    };
    if (!specializationsEnabled) return result;
    const specializationChoice = $("#onlineSpecializationSelect")?.value || "random";
    const specialization = specializationChoice === "random"
      ? null
      : A.getAstralSpecialization?.(specializationChoice);
    return {
      ...result,
      playerSpecialization: specialization?.id || specializationChoice,
      ...(specialization?.talent ? { playerTalent: specialization.talent } : {})
    };
  }

  function createDuelSeed() {
    if (globalThis.crypto?.getRandomValues) {
      const values = new Uint32Array(2);
      globalThis.crypto.getRandomValues(values);
      return `duel-${Date.now().toString(36)}-${values[0].toString(36)}${values[1].toString(36)}`;
    }
    return `duel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  function startDuel(playerTalent, fromTournament, selectedSpecialization, requestedMode, seedOverride = null, enemySpecializationOverride = null) {
    const setId = "astral-original";
    const spellbookDistribution = fromTournament
      ? normalizeSpellbookMode(tournament?.spellbookDistribution)
      : normalizeSpellbookMode(requestedMode || $("#duelModeSelect")?.value);
    const withSpecializations = fromTournament
      ? Boolean(tournament?.specializationsEnabled)
      : Boolean(selectedSpecialization);
    const opponent = fromTournament ? tournament.opponents[tournament.currentMatch] : null;
    const requestedSeed = $("#seedInput").value.trim();
    const seed = fromTournament
      ? `${tournament.seed}-match-${tournament.currentMatch + 1}`
      : (seedOverride || requestedSeed || createDuelSeed());
    const difficulty = fromTournament ? opponent.difficulty : $("#difficultySelect").value;
    currentPlayerName = savePlayerName();
    currentOpponentName = fromTournament
      ? normalizedPlayerName(opponent?.name, t("ui.opponent"))
      : normalizedPlayerName(t(`difficulty.${difficulty}`), t("ui.opponent"));

    const playerSpecializationChoice = withSpecializations
      ? (fromTournament ? tournament?.specialization : (selectedSpecialization || "random"))
      : undefined;
    const enemySpecializationChoice = withSpecializations
      ? (fromTournament
        ? opponent?.specialization
        : (enemySpecializationOverride || $("#enemySpecializationSelect")?.value || "random"))
      : undefined;
    const playerSpecialization = withSpecializations
      ? resolveSpecializationChoice(playerSpecializationChoice, seed, "player", "battlemage")
      : undefined;
    const enemySpecialization = withSpecializations
      ? resolveSpecializationChoice(enemySpecializationChoice, seed, "enemy", "stormmage")
      : undefined;
    const specializationRecord = playerSpecialization && A.getAstralSpecialization
      ? A.getAstralSpecialization(playerSpecialization, playerTalent)
      : null;
    const enemySpecializationRecord = enemySpecialization && A.getAstralSpecialization
      ? A.getAstralSpecialization(enemySpecialization, opponent?.talent || "water")
      : null;
    const effectivePlayerTalent = specializationRecord?.talent || playerTalent || "fire";
    const effectiveEnemyTalent = enemySpecializationRecord?.talent || opponent?.talent;

    tournamentMatch = Boolean(fromTournament);
    matchRecorded = false;
    matchStartedAt = Date.now();
    currentTurnDamage = 0;
    presentationLog = [];
    activeSchool = effectivePlayerTalent;
    const originalMode = setId === "astral-original";
    const duelRules = originalMode
      ? { ...A.ASTRAL_ORIGINAL_RULESET }
      : { startingHp: setId === "arcane" ? 30 : A.DEFAULT_RULESET.startingHp };
    engine = new A.GameEngine({
      cards: sessionSets[setId],
      seed,
      playerTalent: effectivePlayerTalent,
      enemyTalent: effectiveEnemyTalent,
      playerPassives: fromTournament && tournament?.evolutionEnabled ? tournament.selectedPassives : [],
      enemyPassives: fromTournament ? (A.getTournamentOpponentPassives?.(tournament, tournament.currentMatch) || []) : [],
      rules: duelRules,
      aiDifficulty: difficulty,
      astralMode: fromTournament ? "tournament" : "duel",
      spellbookDistribution,
      astralLeague: originalMode
        ? (fromTournament ? A.getTournamentLeagueForMatch(tournament, tournament.currentMatch) : ($("#astralLeagueSelect")?.value || "starting"))
        : undefined,
      playerSpecialization,
      enemySpecialization,
      playerAstralAbilities: withSpecializations ? undefined : [],
      enemyAstralAbilities: withSpecializations ? undefined : []
    });
    engine.aiDifficulty = difficulty;
    duelCommandSession = new A.CommandSession(engine, { matchId: `local:${seed}` });
    currentDuelLaunch = {
      playerTalent: effectivePlayerTalent,
      fromTournament: Boolean(fromTournament),
      selectedSpecialization: playerSpecializationChoice,
      enemySpecializationChoice,
      requestedMode: spellbookDistribution,
      seed
    };
    enemySchool = engine.state.enemy.talent;
    inspectedCardId = engine.state.player.hand[0]?.id || allAstralCards()[0]?.id || null;
    inspectedCardSide = "player";
    inspectedCardInstanceId = null;
    $("#setupPanel").classList.add("hidden");
    $("#battlePanel").classList.remove("hidden");
    const generation = engine.state.generationDiagnostics?.[0];
    $("#seedBadge").textContent = generation ? `seed: ${seed} · grimorio: ${generation.generationAttempt} tentativi` : `seed: ${seed}`;
    $("#duelSessionActions")?.classList.add("hidden");
    $("#duelMenuBtn")?.setAttribute("aria-expanded", "false");
    busy = false;
    clearFxLayer();
    switchView("game");
    setMessage("");
    renderGame();
    persistLocalDuelState();
    resumeBackgroundMusic();
    showTurnBanner(t("turn.yours"), "player", 900);
  }

  function restartDuel() {
    clearPersistedLocalDuel();
    engine = null;
    duelCommandSession = null;
    remoteDuelActive = false;
    busy = false;
    tournamentMatch = false;
    matchStartedAt = null;
    currentTurnDamage = 0;
    $("#battlePanel").classList.add("hidden");
    $("#setupPanel").classList.remove("hidden");
    clearFxLayer();
    setMessage("");
    pauseBackgroundMusic();
    activateWaitingAppUpdateIfSafe();
  }

  function pauseSubtitle() {
    if (remoteDuelActive) return t("pause.multiplayerSubtitle", { opponent: currentOpponentName || t("ui.opponent") });
    return tournamentMatch
      ? t("pause.tournamentSubtitle", { opponent: currentOpponentName || t("ui.opponent") })
      : t("pause.duelSubtitle", { opponent: currentOpponentName || t("ui.opponent") });
  }

  function reopenPauseAfterCancelledAction() {
    pauseMenu?.open({ tournamentMode: tournamentMatch, onlineMode: remoteDuelActive, subtitle: pauseSubtitle() });
  }

  async function abandonCurrentDuel() {
    const online = remoteDuelActive;
    if (!confirm(t(online ? "pause.confirmAbandonOnline" : "pause.confirmAbandonDuel"))) return reopenPauseAfterCancelledAction();
    if (online) {
      stopRemoteTimers();
      await remoteRoomClient?.forfeit().catch(() => {});
      clearRemoteSession();
    }
    restartDuel();
    switchView(online ? "multiplayer" : "game");
    if (online) renderRemoteLobby(null);
  }

  function abandonTournamentEncounter() {
    if (!tournamentMatch || !tournament || matchRecorded) return;
    if (!confirm(t("pause.confirmAbandonMatch"))) return reopenPauseAfterCancelledAction();
    matchRecorded = true;
    A.recordTournamentDuel(profile, tournament, false, A.calculateTournamentScore(false, engine?.state?.player?.hp, engine?.state?.round));
    profile = A.loadProfile();
    tournament = A.loadTournament();
    restartDuel();
    renderTournament();
    renderPlayerProfile();
    switchView("tournament");
  }

  pauseMenu = A.UIPauseMenu?.create({
    root: $("#duelSessionActions"),
    onToggle: open => $("#duelMenuBtn")?.setAttribute("aria-expanded", String(open)),
    onRestart: () => {
      if (!currentDuelLaunch || busy) return;
      const launch = currentDuelLaunch;
      startDuel(launch.playerTalent, launch.fromTournament, launch.selectedSpecialization, launch.requestedMode, launch.seed, launch.enemySpecializationChoice);
    },
    onNewDuel: () => { restartDuel(); switchView("game"); },
    onOptions: syncDuelPauseOptions,
    onAbandonDuel: abandonCurrentDuel,
    onAbandonTournamentMatch: abandonTournamentEncounter
  });
  $("#duelMenuBtn")?.addEventListener("click", () => pauseMenu?.toggle({ tournamentMode: tournamentMatch, onlineMode: remoteDuelActive, subtitle: pauseSubtitle() }));

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

  function spellActorSide(result) {
    const spellEvent = (result?.events || []).find(event => event.type === "spell" || event.type === "cardPlayed");
    return spellEvent?.side === "enemy" ? "enemy" : "player";
  }

  function spellHeroAnchor(side) {
    return $(`#${side}HpBattle`)?.parentElement || null;
  }

  function spellElementCenter(element) {
    if (!element?.getBoundingClientRect) return null;
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height
    };
  }

  function addSpellMarker(element, className, duration = 900, index = 0) {
    if (reducedMotion || !element) return null;
    const layer = $("#duelFxLayer");
    const point = spellElementCenter(element);
    if (!layer || !point) return null;
    const marker = document.createElement("div");
    marker.className = `spell-identity-marker ${className}`;
    marker.style.left = `${point.x}px`;
    marker.style.top = `${point.y}px`;
    marker.style.width = `${Math.max(44, point.width)}px`;
    marker.style.height = `${Math.max(44, point.height)}px`;
    marker.style.setProperty("--spell-index", String(index));
    layer.appendChild(marker);
    setTimeout(() => marker.remove(), fxDuration(duration) || 40);
    return marker;
  }

  function addSpellLine(from, to, className, duration = 900) {
    if (reducedMotion) return null;
    const layer = $("#duelFxLayer");
    const a = from?.x !== undefined ? from : spellElementCenter(from);
    const b = to?.x !== undefined ? to : spellElementCenter(to);
    if (!layer || !a || !b) return null;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const line = document.createElement("div");
    line.className = `spell-identity-line ${className}`;
    line.style.left = `${a.x}px`;
    line.style.top = `${a.y}px`;
    line.style.width = `${Math.max(1, Math.hypot(dx, dy))}px`;
    line.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    layer.appendChild(line);
    setTimeout(() => line.remove(), fxDuration(duration) || 40);
    return line;
  }

  function addSoulWisp(fromElement, toElement, index = 0) {
    if (reducedMotion) return null;
    const layer = $("#duelFxLayer");
    const from = spellElementCenter(fromElement);
    const to = spellElementCenter(toElement);
    if (!layer || !from || !to) return null;
    const wisp = document.createElement("div");
    wisp.className = "spell-soul-wisp";
    wisp.style.left = `${from.x}px`;
    wisp.style.top = `${from.y}px`;
    wisp.style.setProperty("--soul-dx", `${to.x - from.x}px`);
    wisp.style.setProperty("--soul-dy", `${to.y - from.y}px`);
    wisp.style.setProperty("--spell-index", String(index));
    layer.appendChild(wisp);
    setTimeout(() => wisp.remove(), fxDuration(1250) || 40);
    return wisp;
  }

  function showSpellResolutionIdentityFx(result) {
    const profile = spellFxProfile(result?.card);
    if (!profile) return false;
    playSpellFxSound(result.card, "impact");
    if (reducedMotion) return false;

    const events = result?.events || [];
    const side = spellActorSide(result);
    const enemySide = side === "player" ? "enemy" : "player";
    const ownHero = spellHeroAnchor(side);
    const enemyHero = spellHeroAnchor(enemySide);
    let shown = false;

    const damageTargets = events
      .filter(event => ["astralCreatureDamage", "creatureDamage"].includes(event.type))
      .map(event => $(`#${event.targetSide || event.side}Board [data-slot="${event.slot}"]`))
      .filter(Boolean);

    if (profile.vfx === "fire-spikes") {
      damageTargets.forEach((target, index) => {
        if (addSpellMarker(target, "spell-fire-spikes-marker", 880, index)) shown = true;
      });
    } else if (profile.vfx === "cure") {
      if (addSpellMarker(ownHero, "spell-cure-marker", 1050)) shown = true;
    } else if (profile.vfx === "lightning") {
      const target = enemyHero;
      const targetPoint = spellElementCenter(target);
      if (targetPoint) {
        const origin = { x: targetPoint.x + Math.min(90, window.innerWidth * 0.08), y: Math.max(18, targetPoint.y - 190) };
        if (addSpellLine(origin, targetPoint, "spell-lightning-line", 720)) shown = true;
        addSpellMarker(target, "spell-lightning-marker", 760);
      }
    } else if (profile.vfx === "tornado") {
      const death = events.find(event => event.type === "astralDeath" && (event.side === enemySide || !event.side));
      const target = death ? $(`#${death.side || enemySide}Board [data-slot="${death.slot}"]`) : damageTargets[0];
      if (addSpellMarker(target, "spell-tornado-marker", 1150)) shown = true;
    } else if (profile.vfx === "drain-life") {
      if (addSpellLine(enemyHero, ownHero, "spell-drain-life-line", 1050)) shown = true;
      addSpellMarker(enemyHero, "spell-drain-source-marker", 900);
      addSpellMarker(ownHero, "spell-drain-target-marker", 1050);
    } else if (profile.vfx === "drain-souls") {
      const deaths = events.filter(event => event.type === "astralDeath");
      deaths.forEach((event, index) => {
        const target = $(`#${event.side}Board [data-slot="${event.slot}"]`);
        if (addSoulWisp(target, ownHero, index)) shown = true;
        addSpellMarker(target, "spell-soul-source-marker", 900, index);
      });
      addSpellMarker(ownHero, "spell-soul-target-marker", 1250);
    }

    return shown;
  }

  function stageSummonedUnitBeforeResolution(result, side, slot) {
    const card = result?.card;
    if (!card || card.type !== "creature" || slot === null) return;
    const cell = $(`#${side}Board [data-slot="${slot}"]`);
    if (!cell) return;
    const startingHealth = Math.max(1, Number(card.health || card.hp || 1));
    const existingHealth = cell.querySelector(".unit-health");
    if (existingHealth) {
      existingHealth.innerHTML = `<span aria-hidden="true">♥</span>${startingHealth}`;
      return;
    }
    const startingAttack = Math.max(0, Math.trunc(Number(card.attack || 0)));
    cell.className = `unit school-${card.school} transient-summon`;
    cell.innerHTML = `<div class="unit-art"></div>
      <div class="unit-stats"><strong class="unit-attack" title="${escapeHtml(t("ui.attack"))}"><span aria-hidden="true">⚔</span>${startingAttack}</strong><strong class="unit-health" title="${escapeHtml(t("ui.life"))}"><span aria-hidden="true">♥</span>${startingHealth}</strong></div>`;
    const art = cell.querySelector(".unit-art");
    art.appendChild(buildArtBlock(card, "board"));
    const name = document.createElement("small");
    name.textContent = cardName(card);
    art.appendChild(name);
  }

  async function animateCardPlay(result, side, slot = null, before = null) {
    if (!result?.card) return;
    const card = result.card;
    // The engine has already placed a summoned creature. Render that lane now
    // so the unit is visible beneath the cast presentation instead of only
    // appearing after the whole automatic turn flow has completed.
    if (card.type === "creature" && slot !== null) {
      renderBoard(side, before?.[side]);
      stageSummonedUnitBeforeResolution(result, side, slot);
    }
    const layer = $("#duelFxLayer");
    if (!reducedMotion && layer) {
      const cast = document.createElement("div");
      const identityFx = card.type === "spell" ? spellFxProfile(card) : null;
      cast.className = `cast-card school-${card.school} ${card.type === "spell" ? "spell-cast" : "creature-cast"} side-${side}${identityFx ? ` spell-identity-${identityFx.vfx}` : ""}`;
      const art = document.createElement("div");
      art.className = "cast-card-art";
      art.appendChild(buildArtBlock(card, "cast"));
      const label = document.createElement("strong");
      label.textContent = cardName(card);
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
    // Complete the card preview before damage/healing feedback is allowed to
    // enter the battlefield. The cast removes itself at 820ms.
    await sleep(reducedMotion ? 0 : 860);
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
      [A.PHASES.PLAYER_SELECT]: t("phase.playerSelect"),
      [A.PHASES.PLAYER_TARGET]: t("phase.playerTarget"),
      [A.PHASES.PLAYER_ATTACK]: t("phase.playerAttack"),
      [A.PHASES.ENEMY_THINK]: t("phase.enemyThink"),
      [A.PHASES.ENEMY_PLAY]: t("phase.enemyPlay"),
      [A.PHASES.ENEMY_ATTACK]: t("phase.enemyAttack"),
      [A.PHASES.ROUND_END]: t("phase.roundEnd"),
      [A.PHASES.GAME_OVER]: t("phase.gameOver")
    })[phase] || phase;
  }

  function displayedUnitAttack(side, unit) {
    if (!unit) return 0;
    const attack = typeof A.astralCombatAttack === "function"
      ? A.astralCombatAttack(engine, side, unit)
      : unit.attack;
    return Math.max(0, Math.trunc(Number(attack) || 0));
  }

  function createBoardUnitCell(side, unit, slot) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "unit school-" + unit.school;
    cell.dataset.slot = String(slot);
    cell.dataset.instanceId = String(unit.instanceId || "");
    cell.dataset.cardId = String(unit.id || "");
    cell.style.setProperty("--slot-index", slot);

    const art = document.createElement("div");
    art.className = "unit-art";
    art.appendChild(buildArtBlock(unit, "board"));
    const name = document.createElement("small");
    name.textContent = cardName(unit);
    art.appendChild(name);

    const stats = document.createElement("div");
    stats.className = "unit-stats";
    stats.innerHTML = '<strong class="unit-attack" title="' + escapeHtml(t("ui.attack")) + '"><span aria-hidden="true">⚔</span>0</strong><strong class="unit-health" title="' + escapeHtml(t("ui.life")) + '"><span aria-hidden="true">♥</span>0</strong>';
    cell.appendChild(art);
    cell.appendChild(stats);

    const inspectUnit = () => {
      const currentUnit = engine?.state?.[side]?.board?.[slot];
      if (!currentUnit) return;
      inspectedCardId = currentUnit.id;
      inspectedCardSide = side;
      inspectedCardInstanceId = currentUnit.instanceId;
      renderCollectionPanels();
    };
    cell.addEventListener("mouseenter", inspectUnit);
    cell.addEventListener("focus", inspectUnit);
    cell.addEventListener("pointerdown", event => {
      const currentUnit = engine?.state?.[side]?.board?.[slot];
      if (currentUnit) startMobileHoldPreview(event, currentUnit, side);
    });
    cell.addEventListener("click", () => {
      inspectUnit();
      const currentUnit = engine?.state?.[side]?.board?.[slot];
      if (currentUnit && !isMobileDuelLayout()) openDuelCardZoom(currentUnit, side);
    });
    return cell;
  }

  function syncBoardUnitBadge(cell, className, enabled, title, ariaLabel, html) {
    let badge = cell.querySelector("." + className);
    if (!enabled) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = className;
      cell.insertBefore(badge, cell.querySelector(".unit-stats") || null);
    }
    badge.title = title;
    badge.setAttribute("aria-label", ariaLabel);
    badge.innerHTML = html;
  }

  function updateBoardUnitCell(cell, side, unit, slot, visualSnapshot = null) {
    const previousUnit = visualSnapshot?.units?.[slot];
    const preservePreviousStats = previousUnit?.instanceId === unit.instanceId;
    const currentAttack = preservePreviousStats ? previousUnit.attack : displayedUnitAttack(side, unit);
    const currentHealth = preservePreviousStats ? previousUnit.health : Math.max(0, unit.currentHealth);
    const isMultiTargetAttacker = Boolean(A.ASTRAL_CARD_AI_METADATA?.[unit.id]?.multiTarget);
    const hasSummoningSickness = typeof engine.isUnitSummoningSick === "function" && engine.isUnitSummoningSick(unit, side);

    cell.type = "button";
    cell.dataset.slot = String(slot);
    cell.dataset.instanceId = String(unit.instanceId || "");
    cell.dataset.cardId = String(unit.id || "");
    cell.style.setProperty("--slot-index", slot);
    cell.classList.add("unit");
    cell.classList.remove("slot");
    [...cell.classList].filter(name => name.startsWith("school-")).forEach(name => cell.classList.remove(name));
    cell.classList.add("school-" + unit.school);
    cell.classList.toggle("multi-target-attacker", isMultiTargetAttacker);
    cell.classList.toggle("summoning-sick", hasSummoningSickness);

    let art = cell.querySelector(".unit-art");
    if (!art) {
      art = document.createElement("div");
      art.className = "unit-art";
      cell.insertBefore(art, cell.firstChild);
    }
    if (!art.querySelector(".art-media")) art.prepend(buildArtBlock(unit, "board"));
    const artImage = art.querySelector(".art-image");
    if (artImage) artImage.alt = cardName(unit);
    let unitName = [...art.children].find(child => child.tagName === "SMALL");
    if (!unitName) {
      unitName = document.createElement("small");
      art.appendChild(unitName);
    }
    unitName.textContent = cardName(unit);

    syncBoardUnitBadge(cell, "multi-target-badge", isMultiTargetAttacker, "Attacca tutti i nemici", "Attacco multiplo", "⚔×");
    syncBoardUnitBadge(cell, "summoning-sickness-badge", hasSummoningSickness, "Debolezza da evocazione — potrà attaccare dal prossimo turno", "Debolezza da evocazione — potrà attaccare dal prossimo turno", '<span aria-hidden="true">Zz</span>');

    let stats = cell.querySelector(".unit-stats");
    if (!stats) {
      stats = document.createElement("div");
      stats.className = "unit-stats";
      cell.appendChild(stats);
    }
    let attack = stats.querySelector(".unit-attack");
    if (!attack) {
      attack = document.createElement("strong");
      attack.className = "unit-attack";
      stats.appendChild(attack);
    }
    attack.title = t("ui.attack");
    attack.innerHTML = '<span aria-hidden="true">⚔</span>' + currentAttack;
    let health = stats.querySelector(".unit-health");
    if (!health) {
      health = document.createElement("strong");
      health.className = "unit-health";
      stats.appendChild(health);
    }
    health.title = t("ui.life");
    health.innerHTML = '<span aria-hidden="true">♥</span>' + currentHealth;
  }

  function createBoardSlotCell(side, slot) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "slot";
    cell.dataset.slot = String(slot);
    cell.style.setProperty("--slot-index", slot);
    if (side === "player") cell.addEventListener("click", () => onPlayerSlot(slot));
    return cell;
  }

  function updateBoardSlotCell(cell, side, slot) {
    cell.type = "button";
    cell.className = "slot";
    cell.dataset.slot = String(slot);
    delete cell.dataset.instanceId;
    delete cell.dataset.cardId;
    cell.style.setProperty("--slot-index", slot);
    const pendingCard = side === "player" ? engine.getCard("player", engine.state.pendingCardId) : null;
    const isValidTarget = side === "player" && engine.state.phase === A.PHASES.PLAYER_TARGET && pendingCard?.type === "creature";
    cell.textContent = isValidTarget ? "Evoca qui" : String(slot + 1);
    cell.classList.toggle("valid-target", isValidTarget);
  }

  function renderBoard(side, visualSnapshot = null) {
    const root = $("#" + side + "Board");
    const fighter = engine.state[side];
    // A lane is part of the authoritative game state. Never compact occupied
    // enemy lanes for presentation: doing so makes a surviving unit appear to
    // move when a lower-numbered lane becomes empty.
    const entries = fighter.board.map((unit, slot) => ({ unit, slot }));

    entries.forEach((entry, displayIndex) => {
      const { unit, slot } = entry;
      const existing = root.children[displayIndex] || null;
      const sameUnit = Boolean(unit
        && existing?.classList.contains("unit")
        && existing.dataset.instanceId === String(unit.instanceId || "")
        && existing.dataset.cardId === String(unit.id || "")
        && existing.dataset.slot === String(slot));
      const sameEmptySlot = Boolean(!unit && existing?.classList.contains("slot"));

      if (sameUnit) {
        updateBoardUnitCell(existing, side, unit, slot, visualSnapshot);
        return;
      }
      if (sameEmptySlot) {
        updateBoardSlotCell(existing, side, slot);
        return;
      }

      const next = unit ? createBoardUnitCell(side, unit, slot) : createBoardSlotCell(side, slot);
      if (unit) updateBoardUnitCell(next, side, unit, slot, visualSnapshot);
      else updateBoardSlotCell(next, side, slot);
      if (existing) existing.replaceWith(next);
      else root.appendChild(next);
    });
    while (root.children.length > entries.length) root.lastElementChild?.remove();
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
      if (!root) return;
      A.SCHOOLS.forEach(item => {
        let button = root.querySelector(`[data-school-id="${item.id}"]`);
        if (!button) {
          button = document.createElement("button");
          button.type = "button";
          button.dataset.schoolId = item.id;
          bindTapAction(button, () => {
            const selectedSchool = button.dataset.schoolId;
            if (side === "player") {
              if (activeSchool === selectedSchool) return;
              activeSchool = selectedSchool;
              playSchoolSelectionSound();
              renderSchoolButtons();
              renderHand();
              return;
            }
            const changed = enemySchool !== selectedSchool;
            enemySchool = selectedSchool;
            if (changed) playSchoolSelectionSound();
            renderSchoolButtons();
            renderEnemyRevealed();
            if (isMobileEnemyBookLayout()) toggleEnemyRevealedModal(true);
            else closeEnemyRevealedModal();
          });
          root.appendChild(button);
        }
        const fighter = engine.state[side];
        const selected = side === "player" ? activeSchool : enemySchool;
        const powerValue = fighter.power[item.id];
        button.className = `school-status school-${item.id} ${selected === item.id ? "active" : ""}`;
        button.setAttribute("aria-label", `${schoolName(item.id)}: ${powerValue}`);
        button.title = side === "enemy"
          ? `${schoolName(item.id)} · ${powerValue} · ${t("cards.revealed")}`
          : `${schoolName(item.id)} · ${powerValue}`;
        button.innerHTML = `<span class="school-power-icon" aria-hidden="true">${schoolIconMarkup(item.id, "school-icon-svg school-power-svg")}</span><strong>${powerValue}</strong><small>${formatGain(fighter.powerGain[item.id])}</small>`;
      });
    };
    updateSide(playerRoot, "player");
    updateSide(enemyRoot, "enemy");
    const selectedLabel = $("#activeSchoolLabel");
    if (selectedLabel) {
      selectedLabel.textContent = schoolName(activeSchool);
      selectedLabel.className = `active-school-label school-${activeSchool}`;
    }
  }

  function formatGain(value) {
    const number = Number(value || 0);
    return `${number >= 0 ? "+" : ""}${number}/turno`;
  }

  function getCardImageCandidates(card) {
    const id = card?.id || "";
    if (!id) return [];
    const candidates = [];
    if (cardArtStyle === "new" && ["fire", "water", "air", "nature", "death"].includes(card.school)) {
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
    wrapper.addEventListener("contextmenu", event => event.preventDefault());
    wrapper.addEventListener("dragstart", event => event.preventDefault());

    const img = document.createElement("img");
    img.className = "art-image";
    img.alt = cardName(card);
    img.loading = "eager";
    img.decoding = "async";
    img.draggable = false;
    img.setAttribute("draggable", "false");

    const fallback = document.createElement("div");
    fallback.className = "art-fallback";
    fallback.innerHTML = `<span>${card.art ? escapeHtml(card.art) : schoolIconMarkup(card.school, "school-icon-svg art-fallback-school-icon")}</span><small>${card.type === "spell" ? "MAGIA" : "CREATURA"}</small>`;

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
    return { fire: 13, water: 13, air: 13, earth: 13, death: 13 };
  }

  function getIllustratedTotal() {
    return Object.values(getIllustratedSchoolCounts()).reduce((a, b) => a + b, 0);
  }

  function getInspectedCard() {
    const cards = allAstralCards();
    return cards.find(card => card.id === inspectedCardId) || null;
  }

  function getInspectedBoardUnit() {
    if (!engine || !inspectedCardSide || !inspectedCardInstanceId) return null;
    return engine.state[inspectedCardSide]?.board?.find(unit =>
      unit?.instanceId === inspectedCardInstanceId && unit.id === inspectedCardId
    ) || null;
  }

  function currentCardPreview(card, side = inspectedCardSide) {
    if (!engine || !side || !card) return null;
    return A.astralPreviewCardValue?.(engine, side, card) || null;
  }

  function currentValueData(card, side = inspectedCardSide) {
    const preview = currentCardPreview(card, side);
    if (!preview || !Number.isFinite(Number(preview.effective))) return null;
    return { ...preview, effective: Number(preview.effective) };
  }

  function currentValueHtml(card, side = inspectedCardSide) {
    const value = currentValueData(card, side);
    if (!value) return "";
    return `<span class="current-value-highlight"><span>${escapeHtml(t("ui.currentValue"))}</span><strong>${escapeHtml(value.effective)}</strong></span>`;
  }

  function integrateCurrentValue(raw, preview) {
    if (!preview || !Number.isFinite(Number(preview.effective))) return raw;
    const formulaMatch = raw.match(/\(([^)]+)\)/);
    if (!formulaMatch) return raw;
    const afterFormula = raw.slice(formulaMatch.index + formulaMatch[0].length);
    const unitMatch = afterFormula.match(/^\s+(danni|punti vita|damage|life)\b/i);
    if (!unitMatch) return raw;
    const formula = formulaMatch[1]
      .replace(/\s*([+*×-])\s*/g, " $1 ")
      .replace(/\s+/g, " ")
      .trim();
    const beforeFormula = raw.slice(0, formulaMatch.index).trimEnd();
    const remaining = afterFormula.slice(unitMatch[0].length);
    return `${beforeFormula} ${preview.effective} ${unitMatch[1]} (${formula})${remaining}`;
  }

  function localizedSide(side) {
    return side === "player" ? t("ui.player") : t("ui.opponent");
  }

  function localizedCardNameById(id, fallback = "") {
    const card = allAstralCards().find(item => item.id === id);
    return card ? cardName(card) : fallback;
  }

  function pushPresentationLog(key, vars) {
    const previous = presentationLog[presentationLog.length - 1];
    const next = { key, vars };
    if (previous && previous.key === next.key && JSON.stringify(previous.vars) === JSON.stringify(next.vars)) return;
    presentationLog.push(next);
    presentationLog = presentationLog.slice(-30);
    renderPresentationLog();
  }

  function presentationVars(vars = {}) {
    const localized = { ...vars };
    if (vars.actorSide) localized.actor = localizedSide(vars.actorSide);
    if (vars.targetSide) localized.target = localizedSide(vars.targetSide);
    if (vars.cardId) localized.card = localizedCardNameById(vars.cardId, vars.cardName);
    if (vars.sourceCardId) localized.source = localizedCardNameById(vars.sourceCardId, vars.sourceName);
    else if (vars.sourceName) localized.source = vars.sourceName;
    if (vars.targetCardId) localized.target = localizedCardNameById(vars.targetCardId, vars.targetName);
    else if (vars.targetName) localized.target = vars.targetName;
    if (vars.schoolId) localized.school = schoolName(vars.schoolId);
    return localized;
  }

  function renderPresentationLog() {
    const root = $("#combatLog");
    if (root) {
      root.innerHTML = presentationLog.map(item => `<div>${escapeHtml(t(item.key, presentationVars(item.vars)))}</div>`).join("");
      root.scrollTop = root.scrollHeight;
    }
  }

  function recordCardResolution(result) {
    if (!result?.ok || !result.card) return;
    const actorSide = result.events?.find(event => event.sourceSide || event.side)?.sourceSide
      || result.events?.find(event => event.side)?.side
      || "player";
    pushPresentationLog(result.card.type === "spell" ? "log.cast" : "log.summon", {
      actorSide,
      cardId: result.card.id,
      cardName: result.card.name
    });
    (result.events || []).forEach(event => {
      if (event.type === "astralHeroDamage") {
        const vars = {
          sourceCardId: result.card.id,
          sourceName: result.card.name,
          targetSide: event.targetSide,
          amount: event.amount,
          gross: event.modifiedAmount
        };
        pushPresentationLog(event.modifiedAmount > event.resolvedAmount ? "log.damageHeroReduced" : "log.damageHero", vars);
      } else if (event.type === "astralCreatureDamage") {
        if (event.reason === "astral_nets") return;
        pushPresentationLog("log.damageCreature", {
          sourceCardId: result.card.id,
          sourceName: result.card.name,
          targetCardId: event.targetId,
          targetName: event.targetId,
          amount: event.amount
        });
      } else if (event.type === "astralHealHero") {
        const reactiveSourceIds = {
          wall_of_souls: "astral_death_09",
          souldrinker: null,
          healing_aura: null
        };
        pushPresentationLog("log.healHero", {
          sourceCardId: Object.hasOwn(reactiveSourceIds, event.reason) ? reactiveSourceIds[event.reason] : result.card.id,
          sourceName: event.reason === "souldrinker" ? t("effect.souldrinker")
            : event.reason === "healing_aura" ? t("effect.healingAura")
              : result.card.name,
          targetSide: event.side,
          amount: event.amount
        });
      } else if (event.type === "astralDeath") {
        pushPresentationLog("log.death", {
          targetCardId: event.cardId,
          targetName: event.cardName
        });
      } else if (event.type === "astralPhoenixRebirth") {
        pushPresentationLog("log.rebirth", {
          targetCardId: event.cardId,
          amount: event.health
        });
      } else if (event.type === "astralPowerReduction") {
        pushPresentationLog("log.powerReduction", {
          targetSide: event.side,
          amount: event.amount
        });
      } else if (event.type === "astralPowerChange") {
        pushPresentationLog(event.delta > 0 ? "log.powerGain" : "log.powerLoss", {
          sourceCardId: event.reason || result.card.id,
          sourceName: result.card.name,
          targetSide: event.side,
          schoolId: event.school,
          amount: Math.abs(event.delta)
        });
      } else if (event.type === "astralVampireHeal") {
        pushPresentationLog("log.vampireHeal", {
          sourceCardId: "astral_death_11",
          amount: event.amount
        });
      } else if (event.type === "astralNets") {
        pushPresentationLog("log.astralNets", {
          targetCardId: event.targetId,
          amount: event.amount
        });
      } else if (event.type === "astralDeathKeeper") {
        pushPresentationLog("log.deathKeeper", {
          actorSide: event.side,
          amount: event.amount
        });
      } else if (event.type === "astralUnitHeal") {
        pushPresentationLog("log.healCreature", {
          sourceCardId: event.reason,
          sourceName: result.card.name,
          targetCardId: event.cardId,
          amount: event.amount
        });
      }
    });
  }

  function recordAttackSecondaryEffects(result) {
    (result?.events || []).forEach(event => {
      if (event.type === "astralVampireHeal") {
        pushPresentationLog("log.vampireHeal", { sourceCardId: "astral_death_11", amount: event.amount });
      } else if (event.type === "astralDeath") {
        pushPresentationLog("log.death", { targetCardId: event.cardId, targetName: event.cardName });
      } else if (event.type === "astralPhoenixRebirth") {
        pushPresentationLog("log.rebirth", { targetCardId: event.cardId, amount: event.health });
      } else if (event.type === "astralDeathKeeper") {
        pushPresentationLog("log.deathKeeper", { actorSide: event.side, amount: event.amount });
      } else if (event.type === "astralHealHero") {
        const sourceCardId = event.reason === "wall_of_souls" ? "astral_death_09" : null;
        const sourceName = event.reason === "souldrinker" ? t("effect.souldrinker")
          : event.reason === "healing_aura" ? t("effect.healingAura") : event.reason;
        pushPresentationLog("log.healHero", { sourceCardId, sourceName, targetSide: event.side, amount: event.amount });
      } else if (event.type === "astralFireAura") {
        pushPresentationLog("log.fireAura", { targetCardId: event.sourceId, amount: event.amount });
      }
    });
  }

  function recordAttackRegeneration(result) {
    (result?.events || []).filter(event => event.type === "astralUnitHeal").forEach(event => {
      pushPresentationLog("log.regenerate", {
        sourceCardId: event.reason,
        targetCardId: event.cardId,
        amount: event.amount
      });
    });
  }

  function visibleCardKeyword(card) {
    const value = String(card?.keyword || "").trim();
    return /^originale$/i.test(value) ? "" : value;
  }

  function cardDescription(card, side = inspectedCardSide) {
    const raw = cardText(card) || visibleCardKeyword(card) || t("ui.selectCardForDetails");
    const dynamic = integrateCurrentValue(raw, currentCardPreview(card, side));
    const separated = dynamic.startsWith("+")
      ? dynamic.replace(/\s+([+-]\d+\b)/g, ". $1")
      : dynamic.replace(/\s+(-\d+\b)/g, ". $1");
    const base = /[.!?]$/.test(separated) ? separated : `${separated}.`;
    return base;
  }

  function cardDescriptionHtml(card, side = inspectedCardSide) {
    const text = cardDescription(card, side);
    const preview = currentCardPreview(card, side);
    if (!preview || !Number.isFinite(Number(preview.effective))) return escapeHtml(text);
    const marker = String(Number(preview.effective));
    const markerWithSpace = marker + " ";
    const index = text.indexOf(markerWithSpace);
    if (index < 0) return escapeHtml(text);
    return `${escapeHtml(text.slice(0, index))}<strong class="inline-current-value">${escapeHtml(marker)}</strong> ${escapeHtml(text.slice(index + markerWithSpace.length))}`;
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

  function ensureCollectionCardVisible(cards) {
    if (!cards.length) return;
    if (!cards.some(card => card.id === collectionSelectedCardId)) {
      collectionSelectedCardId = cards[0].id;
    }
  }

  function getCollectionSelectedCard() {
    return allAstralCards().find(card => card.id === collectionSelectedCardId) || null;
  }

  function renderInspectPanel() {
    const card = getInspectedCard();
    const target = $("#inspectPreview");
    if (!target) return;
    if (!card) {
      target.innerHTML = `<p>${escapeHtml(t("ui.noCard"))}</p>`;
      $("#inspectCardTitle").textContent = t("ui.noCard");
      $("#inspectCardAbility").textContent = t("ui.selectCardForDetails");
      $("#inspectCardDetails").innerHTML = "";
      $("#inspectCardMeta").innerHTML = "";
      return;
    }
    const inspectedUnit = getInspectedBoardUnit();
    const displayedCard = inspectedUnit || card;
    const displayedAttack = inspectedUnit ? displayedUnitAttack(inspectedCardSide, inspectedUnit) : card.attack;
    renderPreviewInto(target, displayedCard, inspectedUnit ? inspectedCardSide : null);
    const inspectedUnitIsSick = inspectedUnit && typeof engine.isUnitSummoningSick === "function" && engine.isUnitSummoningSick(inspectedUnit, inspectedCardSide);
    if (inspectedUnitIsSick) {
      const status = document.createElement("div");
      status.className = "summoning-sickness-preview";
      status.setAttribute("role", "status");
      status.textContent = t("status.summoningSickness");
      target.appendChild(status);
    }
    $("#inspectCardTitle").textContent = cardName(card);
    $("#inspectCardAbility").innerHTML = cardDescriptionHtml(card, inspectedCardSide);
    const combatDetails = card.type === "spell" ? "" : `
      <span class="detail-combat-stat detail-attack"><small><i aria-hidden="true">⚔</i> ${t("ui.attack")}</small><b>${escapeHtml(displayedAttack)}</b></span>
      <span class="detail-combat-stat detail-health"><small><i aria-hidden="true">♥</i> ${t("ui.life")}</small><b>${escapeHtml(displayedCard.currentHealth ?? displayedCard.health)}</b></span>`;
    $("#inspectCardDetails").innerHTML = `
      <span class="detail-school"><small>${t("ui.school")}</small><b>${escapeHtml(schoolName(card.school))}</b></span>
      <span class="detail-type"><small>${t("ui.type")}</small><b>${card.type === "spell" ? t("ui.spell") : t("ui.creature")}</b></span>
      <span class="detail-cost"><small>${t("ui.cost")}</small><b>${escapeHtml(card.level)}</b></span>
      ${combatDetails}`;
    const previewCombatMeta = card.type === "spell" ? "" : `
        <div><small>${t("ui.attack")}</small><strong>${escapeHtml(displayedAttack)}</strong></div>
        <div><small>${t("cards.health")}</small><strong>${escapeHtml(displayedCard.currentHealth ?? displayedCard.health)}</strong></div>`;
    const rarity = card.level >= 8 ? t("cards.legendary") : card.level >= 6 ? t("cards.rare") : t("cards.common");
    $("#inspectCardMeta").innerHTML = `
      <div class="inspect-meta-grid">
        <div><small>${t("ui.school")}</small><strong>${schoolName(card.school)}</strong></div>
        <div><small>${t("ui.type")}</small><strong>${t(card.type === "spell" ? "ui.spell" : "ui.creature")}</strong></div>
        <div><small>${t("cards.level")}</small><strong>${card.level}</strong></div>
        <div><small>${t("cards.rarity")}</small><strong>${rarity}</strong></div>
        ${previewCombatMeta}
      </div>
      <div class="inspect-ability-block">${visibleCardKeyword(card) ? `<small>${t("ui.ability")}</small><p><strong>${escapeHtml(visibleCardKeyword(card))}</strong></p>` : ""}<p>${escapeHtml(cardText(card))}</p></div>`;
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
    const schoolFilters = [{ id: "all", label: t("cards.allFeminine") }, ...A.SCHOOLS.map(item => ({ id: item.id, label: schoolIconMarkup(item.id, "school-icon-svg school-filter-icon") }))];
    const typeFilters = [{ id: "all", label: t("cards.allMasculine") }, { id: "creature", label: t("ui.creature") }, { id: "spell", label: t("ui.spell") }];
    const levelFilters = [{ id: "all", label: t("cards.allMasculine") }, ...Array.from({ length: 13 }, (_, i) => ({ id: String(i + 1), label: String(i + 1) }))];
    renderFilterGroup("#collectionSchoolFilters", "school", schoolFilters);
    renderFilterGroup("#collectionTypeFilters", "type", typeFilters);
    renderFilterGroup("#collectionLevelFilters", "level", levelFilters);
    renderFilterGroup("#collectionPageSchoolFilters", "school", [{ id: "all", label: t("cards.allFeminine") }, ...A.SCHOOLS.map(item => ({ id: item.id, label: `${schoolIconMarkup(item.id, "school-icon-svg school-filter-icon")} ${escapeHtml(schoolName(item.id))}` }))]);
    renderFilterGroup("#collectionPageTypeFilters", "type", typeFilters);
    renderFilterGroup("#collectionPageLevelFilters", "level", [{ id: "all", label: t("cards.allMasculine") }, ...Array.from({ length: 13 }, (_, i) => ({ id: String(i + 1), label: `${t("cards.level")} ${i + 1}` }))]);
  }

  function buildCollectionTile(card, compact = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `collection-tile school-${card.school} type-${card.type} ${compact ? "compact" : ""} ${collectionSelectedCardId === card.id ? "active" : ""}`;
    const art = document.createElement("div");
    art.className = "collection-tile-art";
    art.appendChild(buildArtBlock(card, compact ? "collectionCompact" : "collection"));
    const body = document.createElement("div");
    body.className = "collection-tile-body";
    body.innerHTML = `<strong>${escapeHtml(cardName(card))}</strong><small>Lv. ${card.level}</small>`;
    button.appendChild(art);
    button.appendChild(body);
    button.addEventListener("click", () => {
      collectionSelectedCardId = card.id;
      renderCollectionPanels();
    });
    return button;
  }

  function renderCollectionPanels() {
    const allCards = allAstralCards();
    buildCollectionFilterButtons();
    const filtered = applyCollectionFilters(allCards);
    ensureCollectionCardVisible(filtered.length ? filtered : allCards);
    const quick = $("#collectionQuickList");
    const grid = $("#collectionGrid");
    const status = $("#collectionStatus");
    if (status) status.textContent = t("cards.shown", { shown: filtered.length, total: allCards.length });
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
    const root = $("#cardsContent");
    if (!root) return;
    const allCards = allAstralCards();
    const filtered = applyCollectionFilters(allCards);
    root.innerHTML = `
      <div class="collection-page-filters collection-page-filters-top ornate-subpanel classic-config-grid">
        <div class="collection-page-filter-row">
          <span>${t("ui.school")}</span>
          <div id="collectionPageSchoolFilters" class="mini-filter-grid horizontal-school-filters"></div>
        </div>
        <div class="collection-page-filter-row">
          <span>${t("cards.filters")}</span>
          <div id="collectionPageTypeFilters" class="mini-filter-grid"></div>
          <div id="collectionPageLevelFilters" class="mini-filter-grid level-filters wide"></div>
        </div>
        <div class="collection-page-filter-search">
          <label class="search-label">${t("cards.search")}<input id="collectionPageSearch" type="search" placeholder="${t("cards.searchPlaceholder")}"></label>
          <p id="collectionPageStatus" class="collection-page-count">${t("cards.shown", { shown: filtered.length, total: allCards.length })}</p>
        </div>
      </div>
      <div class="collection-page-layout">
        <aside class="collection-page-inspector ornate-subpanel">
          <div class="collection-page-featured" id="collectionPageFeatured"></div>
          <div class="collection-page-card-copy">
            <div class="collection-page-card-heading">
              <div><h3 id="collectionPageCardTitle">${t("cards.detail")}</h3><p id="collectionPageCardKind"></p></div>
              <strong id="collectionPageCardLevel"></strong>
            </div>
            <div id="collectionPageMeta"></div>
          </div>
        </aside>
        <section class="collection-page-main">
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
    const card = getCollectionSelectedCard();
    const featured = $("#collectionPageFeatured");
    const meta = $("#collectionPageMeta");
    if (card && featured && meta) {
      featured.replaceChildren(buildArtBlock(card, "collectionFeatured"));
      $("#collectionPageCardTitle").textContent = cardName(card);
      $("#collectionPageCardKind").innerHTML = `${schoolIconMarkup(card.school, "school-icon-svg collection-school-svg")} ${escapeHtml(schoolName(card.school))} · ${escapeHtml(t(card.type === "spell" ? "ui.spell" : "ui.creature"))}`;
      $("#collectionPageCardLevel").textContent = `${t("cards.level")} ${card.level}`;
      const combatDetails = card.type === "spell" ? "" : `
          <div><small>${t("ui.attack")}</small><strong>${card.attack}</strong></div>
          <div><small>${t("cards.health")}</small><strong>${card.health}</strong></div>`;
      meta.innerHTML = `
        <div class="inspect-meta-grid collection-page-stats">
          ${combatDetails}
          ${visibleCardKeyword(card) ? `<div><small>${t("cards.keyword")}</small><strong>${escapeHtml(visibleCardKeyword(card))}</strong></div>` : ""}
        </div>
        <div class="inspect-ability-block"><small>${t("cards.cardText")}</small><p>${escapeHtml(cardText(card))}</p></div>`;
    }
    const pageGrid = $("#collectionPageGrid");
    if (pageGrid) {
      pageGrid.innerHTML = "";
      filtered.forEach(card => pageGrid.appendChild(buildCollectionTile(card, false)));
    }
  }

  let renderedHandSignature = "";
  let renderedHandEngine = null;
  let mobileHandGesture = null;
  let mobileHoldGesture = null;

  function isMobileDuelLayout() {
    return window.matchMedia?.("(max-width: 820px)").matches && !$("#battlePanel")?.classList.contains("hidden");
  }

  function hideMobileCardInspect() {
    const inspect = $("#mobileCardInspect");
    inspect?.classList.add("hidden");
    inspect?.setAttribute("aria-hidden", "true");
  }

  function showMobileCardInspect(card, side = "player") {
    const inspect = $("#mobileCardInspect");
    if (!inspect || !card) return;
    $("#mobileCardInspectArt")?.replaceChildren(buildArtBlock(card, "mobileInspect"));
    $("#mobileCardInspectName").textContent = cardName(card);
    $("#mobileCardInspectKind").innerHTML = `${schoolIconMarkup(card.school, "school-icon-svg mobile-inspect-school-icon")}<span>${escapeHtml(schoolName(card.school))} · ${escapeHtml(card.type === "spell" ? t("ui.spell") : t("ui.creature"))}</span>`;
    $("#mobileCardInspectText").textContent = cardDescription(card, side);

    const cost = engine && side ? engine.effectiveCost(side, card) : card.level;
    const attack = side && card.instanceId && card.type !== "spell"
      ? displayedUnitAttack(side, card)
      : card.attack;
    const health = card.currentHealth ?? card.health ?? 0;
    const stats = $("#mobileCardInspectStats");
    if (stats) {
      stats.innerHTML = card.type === "creature"
        ? `<span class="mobile-inspect-stat mobile-inspect-cost"><small>${escapeHtml(t("ui.cost"))}</small><b>${escapeHtml(cost)}</b></span>
           <span class="mobile-inspect-stat mobile-inspect-attack"><small>⚔ ${escapeHtml(t("ui.attack"))}</small><b>${escapeHtml(attack)}</b></span>
           <span class="mobile-inspect-stat mobile-inspect-health"><small>♥ ${escapeHtml(t("ui.life"))}</small><b>${escapeHtml(health)}</b></span>`
        : `<span class="mobile-inspect-stat mobile-inspect-cost"><small>${escapeHtml(t("ui.cost"))}</small><b>${escapeHtml(cost)}</b></span>`;
    }
    const currentValue = currentValueData(card, side);
    const currentValueNode = $("#mobileCardInspectCurrentValue");
    if (currentValueNode) {
      currentValueNode.classList.toggle("hidden", !currentValue);
      currentValueNode.innerHTML = currentValue
        ? `<span>${escapeHtml(t("ui.currentValue"))}</span><strong>${escapeHtml(currentValue.effective)}</strong>`
        : "";
    }
    inspect.classList.remove("hidden");
    inspect.setAttribute("aria-hidden", "false");
  }

  function clearMobileHoldPreview() {
    const gesture = mobileHoldGesture;
    if (!gesture) {
      hideMobileCardInspect();
      return;
    }
    clearTimeout(gesture.holdTimer);
    document.removeEventListener("pointermove", gesture.move);
    document.removeEventListener("pointerup", gesture.end);
    document.removeEventListener("pointercancel", gesture.cancel);
    hideMobileCardInspect();
    mobileHoldGesture = null;
  }

  function startMobileHoldPreview(event, card, side = "player") {
    if (!isMobileDuelLayout() || event.button !== 0 || mobileHoldGesture || mobileHandGesture || !card) return;
    event.preventDefault();
    const gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      previewing: false,
      moved: false,
      holdTimer: null,
      move: null,
      end: null,
      cancel: clearMobileHoldPreview
    };
    gesture.holdTimer = setTimeout(() => {
      if (mobileHoldGesture !== gesture || gesture.moved) return;
      gesture.previewing = true;
      showMobileCardInspect(card, side);
    }, 300);
    gesture.move = moveEvent => {
      if (moveEvent.pointerId !== gesture.pointerId) return;
      const distance = Math.hypot(moveEvent.clientX - gesture.startX, moveEvent.clientY - gesture.startY);
      if (distance < 12 || gesture.previewing) return;
      gesture.moved = true;
      clearTimeout(gesture.holdTimer);
    };
    gesture.end = endEvent => {
      if (endEvent.pointerId !== gesture.pointerId) return;
      clearMobileHoldPreview();
    };
    mobileHoldGesture = gesture;
    document.addEventListener("pointermove", gesture.move, { passive: false });
    document.addEventListener("pointerup", gesture.end);
    document.addEventListener("pointercancel", gesture.cancel);
  }

  function clearMobileHandGesture() {
    const gesture = mobileHandGesture;
    if (!gesture) {
      hideMobileCardInspect();
      return;
    }
    clearTimeout(gesture.holdTimer);
    document.removeEventListener("pointermove", gesture.move);
    document.removeEventListener("pointerup", gesture.end);
    document.removeEventListener("pointercancel", gesture.cancel);
    $$("#playerBoard .mobile-drop-hover").forEach(node => node.classList.remove("mobile-drop-hover"));
    $("#battlePanel")?.classList.remove("mobile-drag-creature", "mobile-drag-spell");
    $("#mobileDragGhost")?.classList.add("hidden");
    hideMobileCardInspect();
    mobileHandGesture = null;
  }

  function startMobileHandGesture(event, card, playable) {
    if (!isMobileDuelLayout() || event.button !== 0 || mobileHandGesture) return;
    event.preventDefault();
    const ghost = $("#mobileDragGhost");
    const panel = $("#battlePanel");
    const gesture = {
      pointerId: event.pointerId,
      cardId: card.id,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      previewing: false,
      canDrag: Boolean(playable),
      holdTimer: null,
      move: null,
      end: null,
      cancel: clearMobileHandGesture
    };
    gesture.holdTimer = setTimeout(() => {
      if (mobileHandGesture !== gesture || gesture.dragging) return;
      gesture.previewing = true;
      showMobileCardInspect(card, "player");
    }, 300);
    gesture.move = moveEvent => {
      if (moveEvent.pointerId !== gesture.pointerId) return;
      const distance = Math.hypot(moveEvent.clientX - gesture.startX, moveEvent.clientY - gesture.startY);
      if (!gesture.dragging && distance < 11) return;
      moveEvent.preventDefault();
      if (gesture.previewing && !gesture.canDrag) return;
      clearTimeout(gesture.holdTimer);
      if (!gesture.canDrag) return;
      if (gesture.previewing) {
        gesture.previewing = false;
        hideMobileCardInspect();
      }
      if (!gesture.dragging) {
        gesture.dragging = true;
        hideMobileCardInspect();
        ghost?.replaceChildren(buildArtBlock(card, "mobileDrag"));
        ghost?.classList.remove("hidden");
        panel?.classList.add(card.type === "spell" ? "mobile-drag-spell" : "mobile-drag-creature");
      }
      if (ghost) {
        ghost.style.left = `${moveEvent.clientX}px`;
        ghost.style.top = `${moveEvent.clientY}px`;
      }
      $$("#playerBoard .mobile-drop-hover").forEach(node => node.classList.remove("mobile-drop-hover"));
      if (card.type === "creature") {
        document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)
          ?.closest("#playerBoard .slot")?.classList.add("mobile-drop-hover");
      }
    };
    gesture.end = async endEvent => {
      if (endEvent.pointerId !== gesture.pointerId) return;
      const wasDragging = gesture.dragging;
      const wasPreviewing = gesture.previewing;
      const canDrag = gesture.canDrag;
      const x = endEvent.clientX;
      const y = endEvent.clientY;
      const slotCell = card.type === "creature"
        ? document.elementFromPoint(x, y)?.closest("#playerBoard .slot")
        : null;
      const battlefield = $(".classic-battlefield")?.getBoundingClientRect();
      const insideBattlefield = battlefield && x >= battlefield.left && x <= battlefield.right
        && y >= battlefield.top && y <= battlefield.bottom;
      clearMobileHandGesture();
      if (!engine || !isMobileDuelLayout()) return;

      // Hearthstone-like mobile interaction: hold = preview until release, drag = play.
      if (wasPreviewing) return;
      if (!wasDragging) {
        inspectedCardId = card.id;
        inspectedCardSide = "player";
        inspectedCardInstanceId = null;
        renderCollectionPanels();
        return;
      }
      if (busy || !canDrag) return;
      if (card.type === "creature") {
        if (!slotCell) return;
        const slot = Number(slotCell.dataset.slot);
        if (!Number.isInteger(slot) || engine.state.player.board[slot]) return;
        await onPlayerCard(card.id);
        if (engine.state.pendingCardId === card.id && engine.state.phase === A.PHASES.PLAYER_TARGET) {
          await onPlayerSlot(slot);
        }
      } else if (insideBattlefield) {
        await onPlayerCard(card.id);
        if (!remoteDuelActive && engine.state.pendingCardId === card.id
          && engine.state.phase === A.PHASES.PLAYER_TARGET) await onPlayerCard(card.id);
      }
    };
    mobileHandGesture = gesture;
    document.addEventListener("pointermove", gesture.move, { passive: false });
    document.addEventListener("pointerup", gesture.end);
    document.addEventListener("pointercancel", gesture.cancel);
  }

  function renderHand() {
    const root = $("#playerHand");
    const template = $("#smallCardTemplate");
    const cards = engine.state.player.hand
      .map((card, originalIndex) => ({ card, originalIndex }))
      .filter(item => item.card.school === activeSchool)
      .sort((a, b) => engine.effectiveCost("player", a.card) - engine.effectiveCost("player", b.card)
        || a.originalIndex - b.originalIndex)
      .map(item => item.card);
    const signature = JSON.stringify({
      school: activeSchool,
      phase: engine.state.phase,
      pending: engine.state.pendingCardId,
      art: cardArtStyle,
      cards: cards.map(card => [card.id, engine.effectiveCost("player", card), engine.getPlayability("player", card).ok])
    });
    if (engine === renderedHandEngine && signature === renderedHandSignature) return;
    clearMobileHandGesture();
    renderedHandEngine = engine;
    renderedHandSignature = signature;
    root.style.setProperty("--hand-steps", Math.max(1, cards.length - 1));
    root.dataset.cardCount = String(cards.length);
    const fragment = document.createDocumentFragment();
    cards.forEach((card, cardIndex) => {
      const clone = template.content.firstElementChild.cloneNode(true);
      const selected = engine.state.pendingCardId === card.id;
      const cost = engine.effectiveCost("player", card);
      const playability = engine.getPlayability("player", card);
      const playable = playability.ok;
      clone.dataset.cardId = card.id;
      clone.dataset.playable = playable ? "true" : "false";
      clone.style.setProperty("--card-index", cardIndex);
      const position = cards.length > 1 ? cardIndex / (cards.length - 1) * 2 - 1 : 0;
      clone.style.setProperty("--fan-angle", `${(position * 8).toFixed(1)}deg`);
      clone.style.setProperty("--fan-drop", `${(Math.abs(position) * 2).toFixed(1)}px`);
      clone.style.setProperty("--fan-z", cardIndex + 1);
      clone.classList.add(`school-${card.school}`, `type-${card.type}`);
      clone.classList.toggle("selected", selected);
      clone.classList.toggle("unplayable", !playable && !selected);
      if (!playable && playability.reason) clone.title = playability.reason;
      clone.querySelector(".cost").textContent = cost;
      clone.querySelector(".school").innerHTML = `${schoolIconMarkup(card.school, "school-icon-svg card-school-svg")} ${escapeHtml(schoolName(card.school))}`;
      const artNode = clone.querySelector(".art");
      artNode.innerHTML = "";
      artNode.appendChild(buildArtBlock(card, "hand"));
      clone.querySelector(".name").textContent = cardName(card);
      clone.querySelector(".text").textContent = cardText(card);
      clone.querySelector(".keyword").textContent = visibleCardKeyword(card);
      clone.querySelector(".stats").textContent = card.type === "spell" ? `Lv ${card.level}` : `Lv ${card.level} · ⚔ ${card.attack} · ♥ ${card.health}`;
      const inspectHandCard = () => { inspectedCardId = card.id; inspectedCardSide = "player"; inspectedCardInstanceId = null; renderCollectionPanels(); };
      clone.addEventListener("mouseenter", inspectHandCard);
      clone.addEventListener("focus", inspectHandCard);
      clone.addEventListener("pointerdown", event => startMobileHandGesture(event, card, playable));
      clone.addEventListener("contextmenu", event => { if (isMobileDuelLayout()) event.preventDefault(); });
      clone.addEventListener("dragstart", event => event.preventDefault());
      clone.addEventListener("click", event => {
        if (isMobileDuelLayout() && event.detail > 0) { event.preventDefault(); return; }
        if (!playable) {
          inspectHandCard();
          openDuelCardZoom(card, "player");
          return;
        }
        onPlayerCard(card.id);
      });
      fragment.appendChild(clone);
    });
    root.replaceChildren(fragment);
    $("#handSummary").textContent = `${cards.length} · ${schoolName(activeSchool)}`;
    const pending = engine.state.pendingCardId ? engine.getCard("player", engine.state.pendingCardId) : null;
    $("#selectedCardHint").textContent = pending
      ? (pending.type === "creature"
        ? t("status.pendingCreature", { card: cardName(pending) })
        : t("status.pending", { card: cardName(pending), state: t(pending.type === "spell" && !supportsHoverPreview ? "status.prepared" : "status.selected") }))
      : "";
  }

  function renderEnemyRevealed() {
    if (!engine) return;
    const root = $("#enemyRevealedCards");
    const modalRoot = $("#enemyRevealedModalContent");
    const summary = $("#enemySchoolSummary");
    const modalSummary = $("#enemyRevealedModalSummary");
    const hand = engine.state.enemy.hand.filter(card => card.school === enemySchool);
    const revealedIds = new Set(engine.state.enemy.revealedCards || []);
    const allCards = allAstralCards();
    const revealed = [...revealedIds]
      .map(id => hand.find(card => card.id === id) || allCards.find(card => card.id === id))
      .filter(card => card?.school === enemySchool);
    const summaryText = `${schoolName(enemySchool)} · ${revealed.length}`;
    if (summary) summary.textContent = summaryText;
    if (modalSummary) modalSummary.textContent = `${schoolName(enemySchool)} · ${t("cards.revealed")}: ${revealed.length}`;

    const createChip = card => {
      const chip = document.createElement("button");
      chip.className = `revealed-chip school-${card.school} type-${card.type}`;
      chip.type = "button";
      const art = document.createElement("div");
      art.className = "revealed-chip-art";
      art.appendChild(buildArtBlock(card, "enemyBook"));
      const label = document.createElement("span");
      label.className = "enemy-card-cost";
      label.textContent = engine.effectiveCost("enemy", card);
      const name = document.createElement("strong");
      name.className = "enemy-card-name";
      name.textContent = cardName(card);
      chip.appendChild(art);
      chip.appendChild(label);
      chip.appendChild(name);
      const inspect = () => {
        inspectedCardId = card.id;
        inspectedCardSide = "enemy";
        inspectedCardInstanceId = null;
        renderCollectionPanels();
      };
      chip.addEventListener("mouseenter", inspect);
      chip.addEventListener("focus", inspect);
      chip.addEventListener("pointerdown", event => startMobileHoldPreview(event, card, "enemy"));
      chip.addEventListener("click", () => {
        inspect();
        if (!isMobileDuelLayout()) openDuelCardZoom(card, "enemy");
      });
      return chip;
    };

    const buildFragment = includeHidden => {
      const fragment = document.createDocumentFragment();
      revealed.forEach(card => fragment.appendChild(createChip(card)));
      if (!revealed.length) {
        const empty = document.createElement("span");
        empty.className = "revealed-empty";
        empty.textContent = "—";
        fragment.appendChild(empty);
      }
      if (includeHidden) {
        for (let i = revealed.length; i < hand.length; i += 1) {
          const hidden = document.createElement("span");
          hidden.className = "hidden-card-chip";
          hidden.setAttribute("aria-label", t("cards.hiddenEnemy"));
          fragment.appendChild(hidden);
        }
      }
      return fragment;
    };

    if (modalRoot) modalRoot.replaceChildren(buildFragment(false));
    if (isMobileEnemyBookLayout()) {
      if (root) root.replaceChildren();
      return;
    }
    if (root) root.replaceChildren(buildFragment(false));
  }

  function renderGame() {
    if (!engine) return;
    const state = engine.state;
    $("#playerNameBattle").textContent = currentPlayerName || t("ui.player");
    $("#enemyNameBattle").textContent = currentOpponentName || t("ui.opponent");
    $("#playerNameBattle").title = currentPlayerName || t("ui.player");
    $("#enemyNameBattle").title = currentOpponentName || t("ui.opponent");
    $("#mobileSpellDropTarget").textContent = t("mobile.castSpell");
    updatePhaseVisual(state);
    $("#enemyHpBattle").textContent = `${state.enemy.hp} ♥`;
    $("#playerHpBattle").textContent = `${state.player.hp} ♥`;
    $("#phaseLabel").textContent = phaseLabel(state.phase);
    $("#roundLabel").textContent = t("ui.round", { value: state.round });
    const abilitiesEnabled = (state.player.astralAbilityIds || []).length > 0 || (state.enemy.astralAbilityIds || []).length > 0;
    const playerSpec = abilitiesEnabled && state.playerSpecialization && A.getAstralSpecialization ? A.getAstralSpecialization(state.playerSpecialization) : null;
    const enemySpec = abilitiesEnabled && state.enemySpecialization && A.getAstralSpecialization ? A.getAstralSpecialization(state.enemySpecialization) : null;
    const playerAbilityNames = state.player.astralAbilities?.map(item => item.name).join(" · ");
    const enemyAbilityNames = state.enemy.astralAbilities?.map(item => item.name).join(" · ");
    $("#playerTalentLabel").textContent = playerSpec ? `${playerSpec.name}: ${playerAbilityNames || t("status.noAbility")}` : `${t("status.talent")}: ${schoolName(state.player.talent)}`;
    $("#enemyTalentLabel").textContent = enemySpec ? `${enemySpec.name}: ${enemyAbilityNames || t("status.noAbility")}` : `${t("status.talent")}: ${schoolName(state.enemy.talent)}`;
    $("#endTurnBtn").disabled = busy || ![A.PHASES.PLAYER_SELECT, A.PHASES.PLAYER_TARGET].includes(state.phase);
    renderPresentationLog();
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
  $("#enemyRevealedModal")?.addEventListener("click", event => {
    if (event.target === event.currentTarget) closeEnemyRevealedModal();
  });
  window.addEventListener("resize", () => {
    renderEnemyRevealed();
    if (engine) renderBoard("enemy");
  });
  $("#battlePanel")?.addEventListener("contextmenu", event => {
    if (event.target.closest(".game-card, .art-media, .unit, .mobile-card-inspect, .mobile-drag-ghost")) event.preventDefault();
  }, true);
  $("#battlePanel")?.addEventListener("dragstart", event => event.preventDefault(), true);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && enemyRevealedModalOpen) closeEnemyRevealedModal();
  });

  async function onPlayerCard(cardId) {
    inspectedCardId = cardId;
    inspectedCardSide = "player";
    inspectedCardInstanceId = null;
    renderCollectionPanels();
    if (!engine || busy) return;
    if (remoteDuelActive) {
      const card = engine.getCard("player", cardId);
      if (!card) return;
      if (card.type === "creature") {
        if (engine.state.pendingCardId === cardId && engine.state.phase === A.PHASES.PLAYER_TARGET) {
          return setMessage(t("status.selectSlot", { card: cardName(card) }));
        }
        const selected = engine.selectCard(cardId);
        if (!selected.ok) return setMessage(selected.reason);
        renderGame();
        return setMessage(t("status.selectSlot", { card: cardName(card) }));
      }
      await resolveRemoteMove(A.MULTIPLAYER_COMMANDS.PLAY, { cardId, slot: null });
      return;
    }

    const pendingCard = engine.getCard("player", cardId);
    const isSpellConfirmTap = pendingCard?.type === "spell"
      && !supportsHoverPreview
      && engine.state.phase === A.PHASES.PLAYER_TARGET
      && engine.state.pendingCardId === cardId;

    if (isSpellConfirmTap) {
      const healthBefore = captureHealthState();
      const play = issueDuelCommand("player", A.MULTIPLAYER_COMMANDS.PLAY, { cardId, slot: null });
      if (play.ok) {
        spellSound(play.card);
        await animateCardPlay(play, "player", null, healthBefore);
        await presentResolutionBeforeUpdate(play, healthBefore);
        renderGame();
        showResolutionAfterUpdate(play);
        recordCardResolution(play);
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
      if (sameCard && pendingCard?.type === "creature") {
        setMessage(t("status.selectSlot", { card: cardName(pendingCard) }));
        return;
      }
      issueDuelCommand("player", A.MULTIPLAYER_COMMANDS.CANCEL_SELECTION);
      if (sameCard) {
        setMessage(t("status.selectionCancelled"));
        renderGame();
        return;
      }
    }

    if (engine.state.phase !== A.PHASES.PLAYER_SELECT) return;
    const result = issueDuelCommand("player", A.MULTIPLAYER_COMMANDS.SELECT, { cardId });
    if (!result.ok) {
      setMessage(result.reason);
      renderGame();
      return;
    }
    renderGame();

    if (result.requiresSlot) {
      setMessage(t("status.selectSlot", { card: cardName(result.card) }));
      return;
    }

    playCardReadySound();

    if (supportsHoverPreview) {
      setMessage(t("status.cast", { card: cardName(result.card) }));
      const healthBefore = captureHealthState();
      const play = issueDuelCommand("player", A.MULTIPLAYER_COMMANDS.PLAY, { cardId, slot: null });
      if (play.ok) {
        spellSound(play.card);
        await animateCardPlay(play, "player", null, healthBefore);
        await presentResolutionBeforeUpdate(play, healthBefore);
        renderGame();
        showResolutionAfterUpdate(play);
        recordCardResolution(play);
        await sleep(120);
        await resolveAttackFlow("player");
      }
    } else {
      setMessage(t("status.pending", { card: cardName(result.card), state: t(result.card.type === "spell" ? "status.prepared" : "status.selected") }));
    }
  }

  async function onPlayerSlot(slot) {
    if (!engine || busy || engine.state.phase !== A.PHASES.PLAYER_TARGET) return;
    const pendingCard = engine.getCard("player", engine.state.pendingCardId);
    if (pendingCard?.type !== "creature" || engine.state.player.board[slot]) return;
    if (remoteDuelActive) {
      const cardId = engine.state.pendingCardId;
      if (cardId) await resolveRemoteMove(A.MULTIPLAYER_COMMANDS.PLAY, { cardId, slot });
      return;
    }
    const healthBefore = captureHealthState();
    const result = issueDuelCommand("player", A.MULTIPLAYER_COMMANDS.PLAY, {
      cardId: engine.state.pendingCardId,
      slot
    });
    if (!result.ok) {
      setMessage(result.reason);
      renderGame();
      return;
    }
    playOriginalSound("summon2", 0.4);
    await animateCardPlay(result, "player", slot, healthBefore);
    await presentResolutionBeforeUpdate(result, healthBefore);
    renderGame();
    showResolutionAfterUpdate(result);
    recordCardResolution(result);
    await sleep(80);
    await resolveAttackFlow("player");
  }

  $("#endTurnBtn").addEventListener("click", async () => {
    if (!engine || busy) return;
    if (remoteDuelActive) {
      await resolveRemoteMove(A.MULTIPLAYER_COMMANDS.PASS);
      return;
    }
    const result = issueDuelCommand("player", A.MULTIPLAYER_COMMANDS.PASS);
    if (!result.ok) return setMessage(result.reason);
    playOriginalSound("click", 0.35);
    showTurnBanner(t("turn.passed"), "neutral", 700);
    pushPresentationLog("log.pass", { actorSide: "player" });
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
    cue.className = `combat-cue side-${event.side}${event.multiTarget ? " multi-target" : ""}${event.forcedByEffect ? " forced-attack" : ""}`;
    const target = event.multiTarget ? "tutti i nemici" : (event.targetName || "eroe avversario");
    cue.textContent = `${event.forcedByEffect ? `${t("effect.forcedAttack")} · ` : ""}${event.attackerName || "Creatura"} → ${target}`;
    layer.appendChild(cue);
    requestAnimationFrame(() => cue.classList.add("show"));
    setTimeout(() => cue.remove(), fxDuration(760) || 40);
  }

  function appendDamageBadge(parent, amount, options = {}) {
    if (!parent || (amount <= 0 && !options.lethal)) return;
    const badge = document.createElement("span");
    badge.className = `damage-number${options.lethal ? " lethal" : ""}${options.hero ? " hero-damage" : ""}${options.collateral ? " collateral" : ""}`;
    badge.textContent = options.lethal
      ? (amount > 0 ? `−${amount} · KO` : "KO")
      : options.hero ? `−${amount} ♥` : `−${amount}`;
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

  function showResolvedEffectDamage(result) {
    const events = result?.events || [];
    const schoolId = result?.card?.school || "generic";
    events.forEach(event => {
      let parent = null;
      let options = { collateral: true };
      if (event.type === "astralCreatureDamage") {
        parent = $(`#${event.targetSide}Board [data-slot="${event.slot}"]`);
        options.lethal = event.health <= 0;
      } else if (event.type === "astralHeroDamage") {
        parent = $(`#${event.targetSide}HpBattle`)?.parentElement;
        options.hero = true;
        options.lethal = event.hp <= 0;
      } else if (event.type === "creatureDamage") {
        parent = $(`#${event.side}Board [data-slot="${event.slot}"]`);
        options.lethal = Boolean(event.died);
      } else if (event.type === "heroDamage") {
        parent = $(`#${event.side}HpBattle`)?.parentElement;
        options.hero = true;
      } else {
        return;
      }
      if (!parent || Number(event.amount || 0) <= 0) return;
      parent.classList.add("effect-damage-hit", `effect-school-${schoolId}`);
      appendDamageBadge(parent, Number(event.amount), options);
      setTimeout(() => parent.classList.remove("effect-damage-hit", `effect-school-${schoolId}`), fxDuration(720) || 40);
    });
  }

  function showResolutionDeaths(result) {
    const events = result?.events || [];
    const damagedSlots = new Set(events
      .filter(event => ["astralCreatureDamage", "creatureDamage"].includes(event.type))
      .map(event => `${event.targetSide || event.side}:${event.slot}`));
    if (events.some(event => event.type === "astralFireAura") && result?.event?.slot !== undefined) {
      damagedSlots.add(`${result.event.side}:${result.event.slot}`);
    }
    events.filter(event => event.type === "astralDeath").forEach(event => {
      if (damagedSlots.has(`${event.side}:${event.slot}`)) return;
      const parent = $(`#${event.side}Board [data-slot="${event.slot}"]`);
      if (!parent) return;
      parent.classList.add("effect-damage-hit", "effect-death-hit");
      appendDamageBadge(parent, 0, { lethal: true });
      setTimeout(() => parent.classList.remove("effect-damage-hit", "effect-death-hit"), fxDuration(900) || 40);
    });
  }

  function showResolutionAfterUpdate(result) {
    (result?.events || []).filter(event => event.type === "astralPhoenixRebirth").forEach(event => {
      const parent = $(`#${event.side}Board [data-slot="${event.slot}"]`);
      if (!parent) return;
      parent.classList.add("effect-rebirth-hit");
      const badge = document.createElement("span");
      badge.className = "effect-status-number rebirth";
      badge.textContent = `↻ +${event.health}`;
      parent.appendChild(badge);
      setTimeout(() => {
        badge.remove();
        parent.classList.remove("effect-rebirth-hit");
      }, fxDuration(1500) || 40);
    });
  }

  function showPowerGainChanges(before) {
    if (!before || !engine) return;
    ["player", "enemy"].forEach(side => A.SCHOOLS.forEach(school => {
      const previous = Number(before[side]?.powerGain?.[school.id] || 0);
      const current = Number(engine.state[side].powerGain?.[school.id] || 0);
      if (current !== previous) showPowerGainChange(side, school.id, current - previous);
    }));
  }

  function showPowerValueChanges(before) {
    if (!before || !engine) return 0;
    let shown = 0;
    ["player", "enemy"].forEach(side => A.SCHOOLS.forEach(school => {
      const previous = Number(before[side]?.power?.[school.id] || 0);
      const current = Number(engine.state[side].power?.[school.id] || 0);
      if (current !== previous && showPowerChange(side, school.id, current - previous)) shown += 1;
    }));
    return shown;
  }

  function showPowerGainChange(side, schoolId, amount) {
    const root = side === "player" ? $("#schoolFilters") : $("#enemySchoolMenu");
    const parent = root?.querySelector(`[data-school-id="${schoolId}"]`);
    if (!parent || !amount) return false;
    parent.classList.add("effect-power-change", amount > 0 ? "power-gain" : "power-loss");
    const badge = document.createElement("span");
    badge.className = `effect-power-number rate ${amount > 0 ? "gain" : "loss"}`;
    badge.textContent = `${amount > 0 ? "+" : "−"}${Math.abs(amount)}/${t("effect.turnShort")}`;
    parent.appendChild(badge);
    setTimeout(() => {
      badge.remove();
      parent.classList.remove("effect-power-change", "power-gain", "power-loss");
    }, fxDuration(1650) || 40);
    return true;
  }

  function showPowerChange(side, schoolId, amount) {
    if (!amount) return false;
    const root = side === "player" ? $("#schoolFilters") : $("#enemySchoolMenu");
    const parent = root?.querySelector(`[data-school-id="${schoolId}"]`);
    if (!parent) return false;
    parent.classList.add("effect-power-change", amount > 0 ? "power-gain" : "power-loss");
    const badge = document.createElement("span");
    badge.className = `effect-power-number ${amount > 0 ? "gain" : "loss"}`;
    badge.textContent = `${amount > 0 ? "+" : "−"}${Math.abs(amount)}`;
    parent.appendChild(badge);
    setTimeout(() => {
      badge.remove();
      parent.classList.remove("effect-power-change", "power-gain", "power-loss");
    }, fxDuration(1500) || 40);
    return true;
  }

  function showResolutionPowerChanges(result, before) {
    let shown = 0;
    (result?.events || []).forEach(event => {
      if (event.type === "astralPowerChange") {
        if (showPowerChange(event.side, event.school, Number(event.delta || 0))) shown += 1;
      } else if (event.type === "astralPowerReduction") {
        A.SCHOOLS.forEach(school => {
          const delta = Number(event.changes?.[school.id] ?? 0);
          if (showPowerChange(event.side, school.id, delta)) shown += 1;
        });
      } else if (event.type === "astralDeathKeeper") {
        if (showPowerChange(event.side, "death", Number(event.amount || 0))) shown += 1;
      } else if (event.type === "powerChange") {
        if (showPowerChange(event.side, event.school, Number(event.amount || 0))) shown += 1;
      }
    });
    const beforeRates = ["player", "enemy"].flatMap(side => A.SCHOOLS.map(school =>
      Number(before?.[side]?.powerGain?.[school.id] || 0) !== Number(engine.state[side].powerGain?.[school.id] || 0)
    )).filter(Boolean).length;
    showPowerGainChanges(before);
    return shown + beforeRates;
  }

  function showUnitAttackChanges(before) {
    if (!before || !engine) return 0;
    let shown = 0;
    ["player", "enemy"].forEach(side => engine.state[side].board.forEach((unit, slot) => {
      const previous = before[side]?.units?.[slot];
      if (!unit || !previous || previous.instanceId !== unit.instanceId) return;
      const delta = displayedUnitAttack(side, unit) - Number(previous.attack || 0);
      if (!delta) return;
      const parent = $(`#${side}Board [data-slot="${slot}"]`);
      if (!parent) return;
      const badge = document.createElement("span");
      badge.className = `effect-status-number attack ${delta > 0 ? "gain" : "loss"}`;
      badge.textContent = `⚔ ${delta > 0 ? "+" : "−"}${Math.abs(delta)}`;
      parent.appendChild(badge);
      setTimeout(() => badge.remove(), fxDuration(1500) || 40);
      shown += 1;
    }));
    return shown;
  }

  async function presentResolutionBeforeUpdate(result, before) {
    const spellIdentityShown = showSpellResolutionIdentityFx(result);
    showResolvedEffectDamage(result);
    showResolutionDeaths(result);
    (result?.events || []).filter(event => event.type === "astralFireAura").forEach(event => {
      const parent = $(`#${event.side}Board [data-slot="${result?.event?.slot}"]`);
      if (!parent) return;
      parent.classList.add("effect-damage-hit", "effect-fire-aura-hit");
      appendDamageBadge(parent, Number(event.amount || 0), { lethal: Boolean(result?.event?.retaliation?.died), collateral: true });
      setTimeout(() => parent.classList.remove("effect-damage-hit", "effect-fire-aura-hit"), fxDuration(900) || 40);
    });
    (result?.events || []).filter(event => event.type === "astralNets").forEach(event => {
      const damage = (result.events || []).find(item => item.type === "astralCreatureDamage" && item.reason === "astral_nets" && item.targetSide === event.targetSide);
      const parent = damage ? $(`#${event.targetSide}Board [data-slot="${damage.slot}"]`) : null;
      parent?.classList.add("effect-nets-hit");
      setTimeout(() => parent?.classList.remove("effect-nets-hit"), fxDuration(1100) || 40);
    });
    const healingShown = showHealingChanges(before, result);
    const powerShown = showResolutionPowerChanges(result, before);
    const attackShown = showUnitAttackChanges(before);
    const hasVisibleEffect = spellIdentityShown || healingShown + powerShown + attackShown > 0 || (result?.events || []).some(event => [
      "astralCreatureDamage", "astralHeroDamage", "creatureDamage", "heroDamage", "astralDeath", "astralFireAura", "astralNets"
    ].includes(event.type));
    if (hasVisibleEffect) await sleep(reducedMotion ? 0 : 620);
  }

  function captureHealthState() {
    if (!engine) return null;
    return Object.fromEntries(["player", "enemy"].map(side => [side, {
      hp: Number(engine.state[side].hp || 0),
      power: { ...engine.state[side].power },
      powerGain: { ...engine.state[side].powerGain },
      units: engine.state[side].board.map(unit => unit ? {
        instanceId: unit.instanceId,
        health: Number(unit.currentHealth || 0),
        attack: displayedUnitAttack(side, unit)
      } : null)
    }]));
  }

  function showHealingNumber(parent, amount) {
    if (!parent || amount <= 0) return false;
    const layer = $("#duelFxLayer");
    if (!layer) return false;
    const rect = parent.getBoundingClientRect();
    const badge = document.createElement("span");
    badge.className = "healing-number";
    badge.textContent = `+${amount}`;
    badge.style.left = `${rect.left + rect.width / 2}px`;
    badge.style.top = `${rect.top + rect.height / 2}px`;
    layer.appendChild(badge);
    setTimeout(() => badge.remove(), fxDuration(1450) || 40);
    return true;
  }

  function showHealingChanges(before, result = null) {
    if (!before || !engine) return 0;
    const targets = new Map();
    const add = (key, amount, locate) => {
      if (amount <= 0) return;
      const current = targets.get(key);
      targets.set(key, { amount: Number(current?.amount || 0) + amount, locate });
    };
    (result?.events || []).forEach(event => {
      if (event.type === "astralHealHero" || event.type === "heroHeal") {
        add(`hero:${event.side}`, Number(event.amount || 0), () => $(`#${event.side}HpBattle`)?.parentElement);
      } else if (event.type === "astralUnitHeal") {
        add(`unit:${event.side}:${event.slot}`, Number(event.amount || 0), () => $(`#${event.side}Board [data-slot="${event.slot}"]`));
      } else if (event.type === "astralVampireHeal") {
        add(`instance:${event.sourceId}`, Number(event.amount || 0), () =>
          $$("#playerBoard [data-instance-id], #enemyBoard [data-instance-id]").find(node => node.dataset.instanceId === event.sourceId));
      } else if (event.type === "statChange" && event.stat === "health" && Number(event.delta || 0) > 0) {
        add(`unit:${event.side}:${event.slot}`, Number(event.delta), () => $(`#${event.side}Board [data-slot="${event.slot}"]`));
      }
    });
    if (targets.size === 0) {
      ["player", "enemy"].forEach(side => {
        const currentFighter = engine.state[side];
        add(`hero:${side}`, Number(currentFighter.hp || 0) - before[side].hp, () => $(`#${side}HpBattle`)?.parentElement);
        currentFighter.board.forEach((unit, slot) => {
          const previous = before[side].units[slot];
          if (!unit || !previous || previous.instanceId !== unit.instanceId) return;
          add(`unit:${side}:${slot}`, Number(unit.currentHealth || 0) - previous.health, () => $(`#${side}Board [data-slot="${slot}"]`));
        });
      });
    }
    let shown = 0;
    targets.forEach(target => { if (showHealingNumber(target.locate(), target.amount)) shown += 1; });
    return shown;
  }

  async function resolveAttackFlow(side) {
    busy = true;
    renderGame();
    while (!engine.state.gameOver) {
      const healthBefore = captureHealthState();
      const step = issueDuelCommand(side, A.MULTIPLAYER_COMMANDS.ATTACK_NEXT);
      if (!step.ok || step.done) break;
      if (step.skipped) continue;
      const healingShown = showHealingChanges(healthBefore, step);
      const triggeredDamageEvents = (step.events || []).filter(event =>
        ["astralHeroDamage", "astralCreatureDamage", "heroDamage", "creatureDamage"].includes(event.type)
        && event.sourceKind === "effect"
      );
      if (triggeredDamageEvents.length) showResolvedEffectDamage({ events: triggeredDamageEvents });
      if (healingShown > 0 || triggeredDamageEvents.length > 0) await sleep(reducedMotion ? 0 : 460);
      const hasAttackDamage = Number(step.event?.damage || 0) > 0;
      if (hasAttackDamage) {
        await animateAttack(step.event);
        showDamage(step.event);
      }
      showCollateralDamage(step.events);
      showResolutionDeaths(step);
      if (hasAttackDamage || triggeredDamageEvents.length > 0) await sleep(reducedMotion ? 0 : 520);
      renderGame();
      showResolutionAfterUpdate(step);
      const structuredDamage = (step.events || []).find(event =>
        ["astralHeroDamage", "astralCreatureDamage"].includes(event.type)
        && event.sourceKind === "creature"
      );
      pushPresentationLog("log.attack", {
        sourceCardId: structuredDamage?.sourceId,
        sourceName: step.event.attackerName,
        ...(step.event.type === "directAttack"
          ? { targetSide: step.event.enemySide }
          : { targetCardId: structuredDamage?.targetId, targetName: step.event.targetName }),
        amount: step.event.damage
      });
      recordAttackSecondaryEffects(step);
      recordAttackRegeneration(step);
      await sleep(260);
    }
    const finishHealthBefore = captureHealthState();
    issueDuelCommand(side, A.MULTIPLAYER_COMMANDS.FINISH_ATTACK);
    const finishHealingShown = showHealingChanges(finishHealthBefore);
    const finishPowerShown = showPowerValueChanges(finishHealthBefore);
    const finishAttackShown = showUnitAttackChanges(finishHealthBefore);
    if (finishHealingShown + finishPowerShown + finishAttackShown > 0) await sleep(reducedMotion ? 0 : 460);
    renderGame();

    if (engine.state.gameOver) {
      busy = false;
      await finalizeMatch();
      return;
    }

    if (side === "player") {
      setMessage(t("turn.enemyThinking"));
      showTurnBanner(t("turn.enemy"), "enemy", 760);
      await sleep(420);
      issueDuelCommand("enemy", A.MULTIPLAYER_COMMANDS.BEGIN_PLAY);
      renderGame();
      const useRecoveredAi = engine.state.rulesetId === A.ASTRAL_ORIGINAL_RULESET?.id;
      const move = useRecoveredAi
        ? A.chooseRecoveredAstralMove(engine, "enemy", engine.aiDifficulty || "advanced")
        : A.chooseAiMove(engine, "enemy", engine.aiDifficulty || "advanced");
      const healthBefore = captureHealthState();
      const result = move.type === "pass"
        ? issueDuelCommand("enemy", A.MULTIPLAYER_COMMANDS.PASS)
        : issueDuelCommand("enemy", A.MULTIPLAYER_COMMANDS.PLAY, { cardId: move.cardId, slot: move.slot ?? null });
      if (result.ok && result.card?.type === "spell") spellSound(result.card);
      if (result.ok && result.card?.type === "creature") playOriginalSound("summon2", 0.36);
      if (result.ok && result.card) await animateCardPlay(result, "enemy", move?.slot ?? null, healthBefore);
      if (result.ok) {
        await presentResolutionBeforeUpdate(result, healthBefore);
        renderGame();
        showResolutionAfterUpdate(result);
      }
      if (result.ok) recordCardResolution(result);
      await sleep(100);
      await resolveAttackFlow("enemy");
    } else {
      busy = false;
      showTurnBanner(t("turn.roundYours", { round: engine.state.round }), "player", 900);
      setMessage(t("turn.chooseOrPass", { round: engine.state.round }));
      renderGame();
    }
  }

  async function finalizeMatch() {
    clearPersistedLocalDuel();
    const winner = engine.state.winner;
    if (winner === "player") playOriginalSound("winner", 0.5);
    if (winner === "enemy") playOriginalSound("looser", 0.5);
    const resultText = winner === "player" ? t("result.victory") : winner === "enemy" ? t("result.defeat") : t("result.draw");
    showTurnBanner(resultText, winner === "player" ? "player" : winner === "enemy" ? "enemy" : "neutral", 1800);
    setMessage(winner === "player" ? t("result.victoryMessage") : winner === "enemy" ? t("result.defeatMessage") : t("result.drawMessage"));
    A.recordProfileMatch?.(profile, {
      matchId: duelCommandSession?.matchId || `local:${engine.state.seed}`,
      mode: "singlePlayer",
      result: winner === "player" ? "win" : winner === "enemy" ? "loss" : "draw",
      durationMs: matchStartedAt ? Date.now() - matchStartedAt : null
    });
    profile = A.loadProfile();
    renderPlayerProfile();
    if (tournamentMatch && !matchRecorded) {
      matchRecorded = true;
      const won = winner === "player";
      const score = A.calculateTournamentScore(won, engine.state.player.hp, engine.state.round);
      A.recordTournamentDuel(profile, tournament, won, score);
      profile = A.loadProfile();
      tournament = A.loadTournament();
      renderTournament();
      renderPlayerProfile();
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
    title.textContent = cardName(card);
    article.appendChild(title);

    const subtitle = document.createElement("div");
    subtitle.className = "preview-subtitle";
    subtitle.innerHTML = `${schoolIconMarkup(card.school, "school-icon-svg preview-school-svg")}<span>${escapeHtml(schoolName(card.school))} · ${escapeHtml(card.type === "spell" ? t("ui.spell") : t("ui.creature"))}</span>`;
    article.appendChild(subtitle);

    const meta = document.createElement("div");
    meta.className = "preview-meta";
    const attack = side && card.instanceId && card.type !== "spell"
      ? displayedUnitAttack(side, card)
      : card.attack;
    const blocks = [
      { key: "cost", value: cost, label: t("cards.levelCost") },
      { key: "attack", value: card.type === "spell" ? "—" : attack, label: t("ui.attack") },
      { key: "health", value: card.type === "spell" ? "—" : (card.currentHealth ?? card.health ?? 0), label: t("ui.life") }
    ];
    blocks.forEach(item => {
      const stat = document.createElement("div");
      stat.className = `preview-stat preview-stat-${item.key}`;
      stat.innerHTML = `<strong>${escapeHtml(item.value)}</strong><br><small>${escapeHtml(item.label)}</small>`;
      meta.appendChild(stat);
    });
    article.appendChild(meta);

    const text = document.createElement("p");
    text.innerHTML = cardDescriptionHtml(card, side || inspectedCardSide);
    article.appendChild(text);

    target.appendChild(article);
  }

  function openDuelCardZoom(card, side = null) {
    if (isMobileDuelLayout()) return;
    const overlay = $("#duelCardZoom");
    const content = $("#duelCardZoomContent");
    if (!overlay || !content || !card) return;
    renderPreviewInto(content, card, side);
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
  }

  function closeDuelCardZoom() {
    const overlay = $("#duelCardZoom");
    if (!overlay) return;
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
  }

  $("#closeDuelCardZoom")?.addEventListener("click", closeDuelCardZoom);
  $("#duelCardZoom")?.addEventListener("click", event => {
    if (event.target === event.currentTarget) closeDuelCardZoom();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeDuelCardZoom();
  });

  function renderTournament() {
    const root = $("#tournamentContent");
    const newButton = $("#newTournamentBtn");
    const abandonButton = $("#abandonTournamentBtn");
    const context = {
      tournament, t, school, schoolName, schoolIconMarkup, escapeHtml, abilityName, abilityDescription, spellbookModeLabel,
      specializations: A.ASTRAL_SPECIALIZATIONS,
      specialization: id => A.getAstralSpecialization?.(id),
      specializationName: id => t(`specialization.${A.getAstralSpecialization?.(id)?.id || id}`),
      leagueLabel: id => t(`league.${id}`),
      difficultyLabel: id => t(`difficulty.${id}`),
      tournamentModeLabel: id => t(`tournament.mode.${id || "league"}`)
    };
    newButton?.classList.toggle("hidden", !tournament);
    abandonButton?.classList.toggle("hidden", !tournament || tournament.completed);

    if (!tournament) {
      root.innerHTML = A.UITournamentView.renderEmpty(context);

      const selectedTournamentRules = () => {
        const tournamentMode = $("#tournamentModeSelect")?.value || "league";
        return A.getTournamentModeRules?.(tournamentMode, {
          spellbookDistribution: $("#tournamentCustomDistribution")?.value || "arcane",
          specializationsEnabled: $("#tournamentCustomSpecializations")?.value !== "off",
          evolutionEnabled: $("#tournamentCustomEvolution")?.value === "on"
        }) || {
          tournamentMode,
          spellbookDistribution: "arcane",
          specializationsEnabled: true,
          evolutionEnabled: tournamentMode === "evolution"
        };
      };

      const syncTournamentCreate = () => {
        const rules = selectedTournamentRules();
        const mode = rules.tournamentMode || "league";
        $("#tournamentCustomRules")?.classList.toggle("hidden", mode !== "custom");
        $("#tournamentSpecializationField")?.classList.toggle("hidden", !rules.specializationsEnabled);
        if ($("#tournamentModeDescription")) $("#tournamentModeDescription").textContent = t(`tournament.mode.${mode}.description`);
        const tournamentSelect = $("#tournamentTalentSelect");
        syncSpecializationSelectIcon(tournamentSelect);
        const preview = $("#tournamentSpecializationPreview");
        if (preview) {
          const selectedSpecialization = tournamentSelect?.value || "random";
          preview.innerHTML = rules.specializationsEnabled
            ? (selectedSpecialization === "random"
              ? `<p class="tournament-random-specialization">🎲 ${escapeHtml(t("menu.randomSpecialization"))}</p>`
              : A.UITournamentView.specializationProgression(selectedSpecialization, context))
            : `<p>${t("tournament.noSpecializationDescription")}</p>`;
        }
      };

      ["#tournamentModeSelect", "#tournamentCustomDistribution", "#tournamentCustomSpecializations", "#tournamentCustomEvolution", "#tournamentTalentSelect"]
        .forEach(selector => $(selector)?.addEventListener("change", syncTournamentCreate));
      syncTournamentCreate();

      $("#createTournamentConfirm")?.addEventListener("click", () => {
        const rules = selectedTournamentRules();
        tournament = A.startTournament(profile, {
          tournamentMode: rules.tournamentMode,
          spellbookDistribution: rules.spellbookDistribution,
          specializationsEnabled: rules.specializationsEnabled,
          evolutionEnabled: rules.evolutionEnabled,
          specialization: rules.specializationsEnabled ? $("#tournamentTalentSelect")?.value : undefined,
          seed: $("#tournamentSeedInput")?.value,
          setId: "astral-original"
        });
        profile = A.loadProfile();
        renderPlayerProfile();
        renderTournament();
      });
      return;
    }

    root.innerHTML = tournament.completed
      ? A.UITournamentView.renderCompleted(context)
      : A.UITournamentView.renderActive(context);

    const actions = $("#tournamentActions");
    if (tournament.pendingPassiveChoice && actions) {
      actions.innerHTML = `<h3>${t("tournament.choosePowerup")}</h3><div class="passive-choice-grid">${tournament.offeredPassives.map(id => {
        const p = A.getPassive(id);
        return `<button class="passive-choice" data-passive="${id}"><strong>${escapeHtml(p?.name || id)}</strong><small>${escapeHtml(p?.description || "")}</small></button>`;
      }).join("")}</div>`;
      actions.querySelectorAll("[data-passive]").forEach(button => button.addEventListener("click", () => {
        A.selectTournamentPassive(tournament, button.dataset.passive);
        A.saveTournament(tournament);
        renderTournament();
      }));
    } else if (tournament.completed) {
      $("#archiveTournamentBtn")?.addEventListener("click", () => {
        tournament = null;
        A.saveTournament(null);
        renderTournament();
      });
    } else {
      $("#continueTournamentBtn")?.addEventListener("click", () => {
        const spec = tournament.specialization ? A.getAstralSpecialization?.(tournament.specialization) : null;
        startDuel(spec?.talent || "fire", true, tournament.specialization, tournament.spellbookDistribution);
      });
    }
  }

  $("#newTournamentBtn")?.addEventListener("click", () => {
    if (tournament && !confirm(t("tournament.confirmNew"))) return;
    tournament = null;
    A.saveTournament(null);
    renderTournament();
  });
  $("#abandonTournamentBtn")?.addEventListener("click", () => {
    if (!tournament || !confirm(t("tournament.confirmAbandon"))) return;
    tournament = null;
    A.saveTournament(null);
    renderTournament();
  });

  function formatProfileDuration(ms) {
    const value = Number(ms);
    if (!Number.isFinite(value) || value <= 0) return "—";
    const totalSeconds = Math.max(1, Math.round(value / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function achievementProgress(achievement) {
    const stats = profile.stats || {};
    switch (achievement.id) {
      case "multi-5-wins": return { value: Number(stats.multiplayer?.wins || 0), target: 5 };
      case "single-5-wins": return { value: Number(stats.singlePlayer?.wins || 0), target: 5 };
      case "water-30-cards": return { value: Number(stats.cardsBySchool?.water || 0), target: 30 };
      case "turn-20-damage": return { value: Number(stats.maxTurnDamage || 0), target: 20 };
      case "speed-5-min": {
        const values = [stats.singlePlayer?.fastestWinMs, stats.multiplayer?.fastestWinMs].filter(value => Number.isFinite(Number(value)) && Number(value) > 0);
        return { value: values.length ? Math.min(...values.map(Number)) : null, target: 5 * 60 * 1000, duration: true };
      }
      case "drain-100-life": return { value: Number(stats.lifeDrained || 0), target: 100 };
      default: return { value: 0, target: achievement.target || 1 };
    }
  }

  function renderPlayerProfile() {
    const root = $("#playerProfileContent");
    if (!root) return;
    profile = A.loadProfile();
    const stats = profile.stats || {};
    const single = stats.singlePlayer || {};
    const multi = stats.multiplayer || {};
    const storedName = profile.playerName || localStorage.getItem("arcane.playerName") || t("ui.player");
    const achievements = A.PROFILE_ACHIEVEMENTS || [];
    root.innerHTML = `
      <section class="profile-identity-card ornate-subpanel classic-config-grid">
        <label><span>${t("profile.playerName")}</span><input id="profilePlayerNameInput" type="text" maxlength="24" autocomplete="nickname" value="${escapeHtml(storedName)}"></label>
        <button id="saveProfileNameBtn" type="button" class="classic-stone-button">${t("profile.saveName")}</button>
      </section>
      <div class="profile-mode-grid">
        <article class="profile-mode-card"><span>${t("profile.singlePlayer")}</span><strong>${t("profile.record", { wins: single.wins || 0, losses: single.losses || 0 })}</strong><small>${t("profile.gamesPlayed", { value: single.played || 0 })}</small><small>${t("profile.fastestWin")}: ${formatProfileDuration(single.fastestWinMs)}</small></article>
        <article class="profile-mode-card"><span>${t("nav.multiplayer")}</span><strong>${t("profile.record", { wins: multi.wins || 0, losses: multi.losses || 0 })}</strong><small>${t("profile.gamesPlayed", { value: multi.played || 0 })}</small><small>${t("profile.fastestWin")}: ${formatProfileDuration(multi.fastestWinMs)}</small></article>
      </div>
      <section class="profile-fun-stats ornate-subpanel">
        <h3>${t("profile.stats")}</h3>
        <div class="profile-stat-grid">
          <div><small>${t("profile.creaturesPlayed")}</small><strong>${Number(stats.creaturesPlayed || 0)}</strong></div>
          <div><small>${t("profile.spellsPlayed")}</small><strong>${Number(stats.spellsPlayed || 0)}</strong></div>
          <div><small>${t("profile.damageDealt")}</small><strong>${Number(stats.damageDealt || 0)}</strong></div>
          <div><small>${t("profile.maxTurnDamage")}</small><strong>${Number(stats.maxTurnDamage || 0)}</strong></div>
          <div><small>${t("profile.lifeDrained")}</small><strong>${Number(stats.lifeDrained || 0)}</strong></div>
          <div><small>${t("profile.cardsPlayed")}</small><strong>${Number(stats.cardsPlayed || 0)}</strong></div>
        </div>
        <div class="profile-school-stats">
          ${A.SCHOOLS.map(item => `<span><b>${schoolIconMarkup(item.id, "school-icon-svg profile-school-icon")}</b><small>${schoolName(item.id)}</small><strong>${Number(stats.cardsBySchool?.[item.id] || 0)}</strong></span>`).join("")}
        </div>
      </section>
      <section class="profile-trophies ornate-subpanel">
        <div class="profile-section-heading"><div><h3>${t("profile.trophies")}</h3><p>${t("profile.trophiesIntro")}</p></div><strong>${(profile.achievements || []).length}/${achievements.length}</strong></div>
        <div class="trophy-grid">
          ${achievements.map(item => {
            const earned = (profile.achievements || []).includes(item.id);
            const progress = achievementProgress(item);
            const progressText = progress.duration
              ? (progress.value === null ? "— / 5:00" : `${formatProfileDuration(progress.value)} / 5:00`)
              : `${Math.min(progress.value, progress.target)}/${progress.target}`;
            return `<article class="trophy-badge ${earned ? "earned" : "locked"}"><span class="trophy-icon" aria-hidden="true">${earned ? "★" : "◇"}</span><div><strong>${t(`achievement.${item.id}.title`)}</strong><p>${t(`achievement.${item.id}.description`)}</p><small>${earned ? t("profile.unlocked") : progressText}</small></div></article>`;
          }).join("")}
        </div>
      </section>
      <div class="profile-secondary-actions">
        <button class="classic-stone-button" type="button" data-view-jump="rules">${t("nav.howToPlay")}</button>
        <button class="classic-stone-button" type="button" data-view-jump="diagnostics">${t("nav.options")}</button>
      </div>`;
    $("#saveProfileNameBtn")?.addEventListener("click", () => {
      const name = normalizedPlayerName($("#profilePlayerNameInput")?.value, t("ui.player"));
      profile.playerName = name;
      A.saveProfile(profile);
      localStorage.setItem("arcane.playerName", name);
      if ($("#playerNameInput")) $("#playerNameInput").value = name;
      if ($("#onlinePlayerNameInput")) $("#onlinePlayerNameInput").value = name;
      renderPlayerProfile();
    });
    root.querySelectorAll("[data-view-jump]").forEach(button => {
      button.addEventListener("click", () => switchView(button.dataset.viewJump));
    });
  }

  $("#resetProfileBtn").addEventListener("click", () => {
    if (!confirm(t("options.confirmResetProgress"))) return;
    A.resetProgress();
    profile = A.loadProfile();
    tournament = null;
    renderPlayerProfile();
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
    const technical = navigation?.developerMode ? `<details class="technical-rules"><summary>${t("help.technical")}</summary><div class="ruleset-grid">${Object.entries(A.ASTRAL_ORIGINAL_RULESET || A.DEFAULT_RULESET).map(([key, value]) => `<div><code>${escapeHtml(key)}</code><strong>${escapeHtml(value)}</strong></div>`).join("")}</div></details>` : "";
    $("#rulesetContent").innerHTML = `<div class="player-help-grid">
      <article><span>1</span><h3>${t("help.goalTitle")}</h3><p>${t("help.goalText")}</p></article>
      <article><span>2</span><h3>${t("help.powerTitle")}</h3><p>${t("help.powerText")}</p></article>
      <article><span>3</span><h3>${t("help.cardsTitle")}</h3><p>${t("help.cardsText")}</p></article>
      <article><span>4</span><h3>${t("help.combatTitle")}</h3><p>${t("help.combatText")}</p></article>
    </div>
    <section class="help-round-flow"><h3>${t("help.roundTitle")}</h3><div><span>${t("help.select")}</span><b>→</b><span>${t("help.resolve")}</span><b>→</b><span>${t("help.attack")}</span><b>→</b><span>${t("help.enemy")}</span></div></section>
    <section class="help-tournament"><h3>${t("help.tournamentTitle")}</h3><p>${t("help.tournamentText")}</p></section>${technical}`;
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
    localStorage.setItem("arcane.animationSpeed", String(event.target.value));
    document.body.dataset.animationSpeed = animationSpeed >= 1.4 ? "slow" : animationSpeed < 1 ? "fast" : "normal";
    // keep menu selector in sync if present
    try { const m = $("#animationSpeedMenu"); if (m && m.value !== String(event.target.value)) m.value = String(event.target.value); } catch (e) {}
    const optionsSpeed = $("#optionsAnimationSpeed");
    if (optionsSpeed && optionsSpeed.value !== String(event.target.value)) optionsSpeed.value = String(event.target.value);
    const duelSpeed = $("#duelOptionsAnimationSpeed");
    if (duelSpeed && duelSpeed.value !== String(event.target.value)) duelSpeed.value = String(event.target.value);
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
      localStorage.setItem("arcane.animationSpeed", v);
      document.body.dataset.animationSpeed = animationSpeed >= 1.4 ? "slow" : animationSpeed < 1 ? "fast" : "normal";
    });
  }
  // If on narrow screens, default to slow animations
  try {
    const isMobile = window.matchMedia && window.matchMedia('(max-width:760px)').matches;
    const hasSavedAnimationSpeed = window.localStorage.getItem("arcane.animationSpeed") !== null;
    if (isMobile && !hasSavedAnimationSpeed) {
      const slowVal = '1.5';
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
    document.body.dataset.animationSpeed = animationSpeed >= 1.4 ? "slow" : animationSpeed < 1 ? "fast" : "normal";
  } catch (e) {}

  // Background music support
  let bgmAudio = null;
  let bgmEnabled = false;
  // subtle default so music is present but not intrusive
  let bgmVolume = 0.12;

  function setBackgroundMusicEnabled(enabled) {
    bgmEnabled = Boolean(enabled);
    try {
      window.localStorage.setItem('bgmEnabled', bgmEnabled ? '1' : '0');
    } catch (e) {}
    const battleToggle = document.querySelector('#bgmEnabled');
    const optionsToggle = document.querySelector('#optionsBgmEnabled');
    const duelToggle = document.querySelector('#duelOptionsBgmEnabled');
    if (battleToggle) battleToggle.checked = bgmEnabled;
    if (optionsToggle) optionsToggle.checked = bgmEnabled;
    if (duelToggle) duelToggle.checked = bgmEnabled;
  }

  function startBackgroundMusic() {
    if (!bgmEnabled || !soundEnabled || UI_MODE === "essential") return;
    if (!engine || $("#battlePanel")?.classList.contains("hidden")) return;
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
          setBackgroundMusicEnabled(false);
          pauseBackgroundMusic();
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
        const duelVolume = $("#duelOptionsBgmVolume");
        const duelValue = $("#duelOptionsBgmVolumeValue");
        if (duelVolume && duelVolume.value !== String(Math.round(bgmVolume * 100))) duelVolume.value = String(Math.round(bgmVolume * 100));
        if (duelValue) duelValue.textContent = `${Math.round(bgmVolume * 100)}%`;
      });
    }

    if (bgmCheckbox) {
      bgmCheckbox.checked = bgmEnabled;
      bgmCheckbox.addEventListener('change', e => {
        setBackgroundMusicEnabled(e.target.checked);
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

  function setBoardCreatureNames(enabled, { persist = true } = {}) {
    boardCreatureNames = Boolean(enabled);
    document.body.dataset.boardCreatureNames = boardCreatureNames ? "show" : "hide";
    if (persist) {
      try { localStorage.setItem("arcane.boardCreatureNames", boardCreatureNames ? "1" : "0"); } catch (e) {}
    }
    if ($("#optionsBoardCreatureNames")) $("#optionsBoardCreatureNames").checked = boardCreatureNames;
    if ($("#duelOptionsBoardCreatureNames")) $("#duelOptionsBoardCreatureNames").checked = boardCreatureNames;
  }

  function syncOptionsPage() {
    if ($("#optionsPlayerNameInput")) $("#optionsPlayerNameInput").value = selectedPlayerName();
    if ($("#optionsLanguageSelect")) $("#optionsLanguageSelect").value = A.i18n?.getLanguage?.() || "it";
    if ($("#optionsAnimationSpeed")) $("#optionsAnimationSpeed").value = String(animationSpeed);
    if ($("#optionsCardArtStyle")) $("#optionsCardArtStyle").value = cardArtStyle;
    if ($("#optionsSoundEnabled")) $("#optionsSoundEnabled").checked = soundEnabled;
    if ($("#optionsBgmEnabled")) $("#optionsBgmEnabled").checked = bgmEnabled;
    if ($("#optionsParchmentSpells")) $("#optionsParchmentSpells").checked = parchmentSpellFrames;
    if ($("#optionsBoardCreatureNames")) $("#optionsBoardCreatureNames").checked = boardCreatureNames;
    if ($("#optionsBgmVolume")) $("#optionsBgmVolume").value = String(Math.round(bgmVolume * 100));
  }

  function syncDuelPauseOptions() {
    if ($("#duelOptionsAnimationSpeed")) $("#duelOptionsAnimationSpeed").value = String(animationSpeed);
    if ($("#duelOptionsSoundEnabled")) $("#duelOptionsSoundEnabled").checked = soundEnabled;
    if ($("#duelOptionsBgmEnabled")) $("#duelOptionsBgmEnabled").checked = bgmEnabled;
    if ($("#duelOptionsParchmentSpells")) $("#duelOptionsParchmentSpells").checked = parchmentSpellFrames;
    if ($("#duelOptionsBoardCreatureNames")) $("#duelOptionsBoardCreatureNames").checked = boardCreatureNames;
    const volume = String(Math.round(bgmVolume * 100));
    if ($("#duelOptionsBgmVolume")) $("#duelOptionsBgmVolume").value = volume;
    if ($("#duelOptionsBgmVolumeValue")) $("#duelOptionsBgmVolumeValue").textContent = `${volume}%`;
  }

  $("#optionsPlayerNameInput")?.addEventListener("change", event => savePlayerName(event.currentTarget));
  $("#optionsLanguageSelect")?.addEventListener("change", event => {
    A.i18n?.setLanguage(event.target.value);
    if ($("#languageSelect")) $("#languageSelect").value = event.target.value;
  });
  $("#optionsAnimationSpeed")?.addEventListener("change", event => {
    $("#animationSpeed").value = event.target.value;
    $("#animationSpeed").dispatchEvent(new Event("change"));
  });
  $("#optionsCardArtStyle")?.addEventListener("change", event => {
    $("#cardArtStyleSelect").value = event.target.value;
    $("#cardArtStyleSelect").dispatchEvent(new Event("change"));
  });
  $("#optionsSoundEnabled")?.addEventListener("change", event => {
    $("#soundEnabled").checked = event.target.checked;
    $("#soundEnabled").dispatchEvent(new Event("change"));
  });
  $("#optionsBgmEnabled")?.addEventListener("change", event => {
    const battleToggle = $("#bgmEnabled");
    battleToggle.checked = event.target.checked;
    battleToggle.dispatchEvent(new Event("change"));
  });
  function setParchmentSpellFrames(enabled) {
    parchmentSpellFrames = Boolean(enabled);
    localStorage.setItem("arcane.parchmentSpellFrames", parchmentSpellFrames ? "1" : "0");
    document.body.dataset.spellFrame = parchmentSpellFrames ? "parchment" : "arcane";
    if ($("#optionsParchmentSpells")) $("#optionsParchmentSpells").checked = parchmentSpellFrames;
    if ($("#duelOptionsParchmentSpells")) $("#duelOptionsParchmentSpells").checked = parchmentSpellFrames;
  }
  $("#optionsParchmentSpells")?.addEventListener("change", event => setParchmentSpellFrames(event.target.checked));
  $("#duelOptionsParchmentSpells")?.addEventListener("change", event => setParchmentSpellFrames(event.target.checked));
  $("#optionsBoardCreatureNames")?.addEventListener("change", event => setBoardCreatureNames(event.target.checked));
  $("#duelOptionsBoardCreatureNames")?.addEventListener("change", event => setBoardCreatureNames(event.target.checked));
  $("#optionsBgmVolume")?.addEventListener("input", event => {
    const battleVolume = $("#bgmVolume");
    battleVolume.value = event.target.value;
    battleVolume.dispatchEvent(new Event("input"));
  });
  $("#duelOptionsAnimationSpeed")?.addEventListener("change", event => {
    const mainSpeed = $("#animationSpeed");
    mainSpeed.value = event.target.value;
    mainSpeed.dispatchEvent(new Event("change"));
  });
  $("#duelOptionsSoundEnabled")?.addEventListener("change", event => {
    const soundToggle = $("#soundEnabled");
    soundToggle.checked = event.target.checked;
    soundToggle.dispatchEvent(new Event("change"));
  });
  $("#duelOptionsBgmEnabled")?.addEventListener("change", event => {
    const musicToggle = $("#bgmEnabled");
    musicToggle.checked = event.target.checked;
    musicToggle.dispatchEvent(new Event("change"));
  });
  $("#duelOptionsBgmVolume")?.addEventListener("input", event => {
    const musicVolume = $("#bgmVolume");
    musicVolume.value = event.target.value;
    musicVolume.dispatchEvent(new Event("input"));
  });
  $("#resetPreferencesBtn")?.addEventListener("click", () => {
    localStorage.removeItem("arcane.animationSpeed");
    localStorage.removeItem("arcane.cardArtStyle");
    localStorage.removeItem("arcane.soundEnabled");
    localStorage.removeItem("arcaneLanguage");
    localStorage.removeItem("bgmEnabled");
    localStorage.removeItem("bgmVolume");
    localStorage.removeItem("arcane.parchmentSpellFrames");
    localStorage.removeItem("arcane.boardCreatureNames");
    animationSpeed = 1.2;
    cardArtStyle = "new";
    soundEnabled = true;
    bgmEnabled = false;
    bgmVolume = 0.12;
    parchmentSpellFrames = false;
    $("#animationSpeed").value = "1.2";
    $("#animationSpeed").dispatchEvent(new Event("change"));
    $("#cardArtStyleSelect").value = "new";
    $("#cardArtStyleSelect").dispatchEvent(new Event("change"));
    $("#soundEnabled").checked = true;
    $("#soundEnabled").dispatchEvent(new Event("change"));
    $("#bgmEnabled").checked = false;
    $("#bgmEnabled").dispatchEvent(new Event("change"));
    $("#bgmVolume").value = "12";
    $("#bgmVolume").dispatchEvent(new Event("input"));
    setParchmentSpellFrames(false);
    setBoardCreatureNames(defaultBoardCreatureNames, { persist: false });
    A.i18n?.setLanguage("it");
    syncOptionsPage();
  });
  syncOptionsPage();

  $("#collectionSearch")?.addEventListener("input", event => { collectionState.search = event.target.value; renderCollectionPanels(); const other = $("#collectionPageSearch"); if (other && other.value !== event.target.value) other.value = event.target.value; });
  $("#soundEnabled").addEventListener("change", event => {
    soundEnabled = event.target.checked;
    localStorage.setItem("arcane.soundEnabled", soundEnabled ? "1" : "0");
    if ($("#optionsSoundEnabled")) $("#optionsSoundEnabled").checked = soundEnabled;
    if ($("#duelOptionsSoundEnabled")) $("#duelOptionsSoundEnabled").checked = soundEnabled;
    if (soundEnabled) { ensureAudio(); if (bgmEnabled) startBackgroundMusic(); } else { pauseBackgroundMusic(); }
  });
  $("#languageSelect")?.addEventListener("change", event => A.i18n?.setLanguage(event.target.value));
  $("#retryMultiplayerServerBtn")?.addEventListener("click", () => checkMultiplayerServer({ force: true }));
  $("#refreshRoomBrowserBtn")?.addEventListener("click", refreshRoomBrowser);
  $("#showAvailableRoomsOnly")?.addEventListener("change", refreshRoomBrowser);
  $("#resumeOnlineMatchBtn")?.addEventListener("click", async () => {
    if (!remoteRoomClient || !lastRemoteRoomState) return;
    if (lastRemoteRoomState.lifecycle?.status === "finished") {
      clearRemoteSession();
      renderRemoteLobby(null);
      return;
    }
    remoteBattleSuspendedToMenu = false;
    await refreshRemoteRoom();
    if (lastRemoteRoomState?.state) showRemoteBattle(lastRemoteRoomState, { force: true });
  });
  $("#remoteDisconnectReturnBtn")?.addEventListener("click", () => {
    if (remoteLifecycleStatus === "finished") {
      clearRemoteSession();
      restartDuel();
      switchView("multiplayer");
      renderRemoteLobby(null);
      return;
    }
    if (lastRemoteRoomState?.lifecycle?.canReturnToMenu) hideRemoteBattleToMultiplayer();
  });
  $("#onlinePlayerNameInput")?.addEventListener("change", event => savePlayerName(event.currentTarget));
  $("#onlineDuelModeSelect")?.addEventListener("change", syncOnlineDuelMode);
  $("#onlineSpecializationsSelect")?.addEventListener("change", syncOnlineDuelMode);
  $("#onlineRoomCode")?.addEventListener("input", event => {
    const allowed = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    const normalized = String(event.currentTarget.value || "").toUpperCase().split("").filter(char => allowed.includes(char)).join("").slice(0, 6);
    event.currentTarget.value = normalized;
    window.clearTimeout(remoteRoomInspectTimer);
    clearRemoteRoomPreview();
    if (normalized.length === 6) {
      remoteRoomInspectTimer = window.setTimeout(() => inspectRemoteRoom(normalized, { silent: true }), 250);
    }
  });
  $("#createOnlineRoomBtn")?.addEventListener("click", async () => {
    if (!await checkMultiplayerServer({ force: true })) return;
    if ($("#onlineFormMessage")) $("#onlineFormMessage").textContent = "";
    setMultiplayerControlsDisabled(true);
    try {
      remoteRoomClient = createRemoteRoomClient();
      remoteRenderedSnapshotKey = "";
      remoteBattleSuspendedToMenu = false;
      remoteLifecycleStatus = "waiting";
      lastRemoteRoomState = null;
      remoteMatchStartedAt = null;
      const response = await remoteRoomClient.create({
        ...onlineDuelOptions(),
        playerName: savePlayerName($("#onlinePlayerNameInput"))
      });
      saveRemoteRoom(); renderRemoteLobby(response); beginRemotePolling();
    } catch (error) {
      remoteRoomClient = null;
      saveRemoteRoom();
      renderRemoteLobby(null);
      if (handleMultiplayerCompatibilityError(error)) return;
      if ($("#onlineFormMessage")) $("#onlineFormMessage").textContent = error.message || t("online.error");
      setMultiplayerControlsDisabled(false);
    }
  });
  $("#joinOnlineRoomBtn")?.addEventListener("click", async () => {
    if (!await checkMultiplayerServer({ force: true })) return;
    const roomCode = $("#onlineRoomCode")?.value.trim().toUpperCase();
    if (!roomCode) {
      if ($("#onlineFormMessage")) $("#onlineFormMessage").textContent = t("online.codeRequired");
      return;
    }
    if ($("#onlineFormMessage")) $("#onlineFormMessage").textContent = "";
    const previewWasReady = inspectedRemoteRoomCode === roomCode && Boolean(inspectedRemoteRoomSettings);
    const preview = previewWasReady
      ? { code: roomCode, settings: inspectedRemoteRoomSettings }
      : await inspectRemoteRoom(roomCode, { force: true });
    if (!preview) return;
    const specializedRoom = Boolean(preview.settings?.specializationsEnabled);
    if (specializedRoom && !previewWasReady) {
      if ($("#onlineFormMessage")) $("#onlineFormMessage").textContent = t("online.chooseSpecializationBeforeJoin");
      return;
    }

    setMultiplayerControlsDisabled(true);
    try {
      remoteRoomClient = createRemoteRoomClient();
      remoteRenderedSnapshotKey = "";
      remoteBattleSuspendedToMenu = false;
      remoteLifecycleStatus = "waiting";
      lastRemoteRoomState = null;
      remoteMatchStartedAt = null;
      const joinOptions = {
        playerName: savePlayerName($("#onlinePlayerNameInput"))
      };
      if (specializedRoom) joinOptions.playerSpecialization = $("#onlineJoinSpecializationSelect")?.value || "battlemage";
      const response = await remoteRoomClient.join(roomCode, joinOptions);
      clearRemoteRoomPreview();
      saveRemoteRoom(); renderRemoteLobby(response); beginRemotePolling();
    } catch (error) {
      remoteRoomClient = null;
      saveRemoteRoom();
      renderRemoteLobby(null);
      if (handleMultiplayerCompatibilityError(error)) return;
      if ($("#onlineFormMessage")) $("#onlineFormMessage").textContent = error.message || t("online.error");
      setMultiplayerControlsDisabled(false);
    }
  });
  $("#leaveOnlineRoomBtn")?.addEventListener("click", async () => {
    stopRemoteTimers();
    await remoteRoomClient?.leave().catch(() => {});
    clearRemoteSession();
    renderRemoteLobby(null);
    clearRemoteRoomPreview();
    refreshRoomBrowser();
    if ($("#onlineFormMessage")) $("#onlineFormMessage").textContent = "";
  });
  window.addEventListener("arcane:languagechange", () => {
    const playerNameInput = $("#playerNameInput");
    if (playerNameInput && ["Giocatore", "Player"].includes(playerNameInput.value.trim())) playerNameInput.value = t("ui.player");
    const onlinePlayerNameInput = $("#onlinePlayerNameInput");
    if (onlinePlayerNameInput && ["Giocatore", "Player"].includes(onlinePlayerNameInput.value.trim())) onlinePlayerNameInput.value = t("ui.player");
    if ($("#multiplayerServerState")) setMultiplayerServerState(multiplayerServerStatus === "idle" ? "connecting" : multiplayerServerStatus);
    if (["Giocatore", "Player"].includes(String(currentPlayerName || "").trim())) currentPlayerName = t("ui.player");
    syncOptionsPage();
    setupDifficultyOptions();
    setupAstralSpecializationOptions();
    syncOnlineDuelMode();
    if (inspectedRemoteRoomSettings && inspectedRemoteRoomCode) {
      renderRemoteRoomPreview(inspectedRemoteRoomCode, { settings: inspectedRemoteRoomSettings });
    }
    renderTalentChoices();
    renderCollectionPanels();
    renderTournament();
    renderPlayerProfile();
    renderRuleset();
    if (pauseMenu?.isOpen()) $("#duelPauseSubtitle").textContent = pauseSubtitle();
    if (engine) renderGame();
  });

  syncMultiplayerAvailability();
  setupDifficultyOptions();
  if ($("#playerNameInput") || $("#onlinePlayerNameInput") || $("#optionsPlayerNameInput")) {
    const storedPlayerName = localStorage.getItem("arcane.playerName") || profile?.playerName;
    const resolvedPlayerName = ["Giocatore", "Player"].includes(String(storedPlayerName || "").trim())
      ? t("ui.player")
      : normalizedPlayerName(storedPlayerName, t("ui.player"));
    if ($("#playerNameInput")) $("#playerNameInput").value = resolvedPlayerName;
    if ($("#optionsPlayerNameInput")) $("#optionsPlayerNameInput").value = resolvedPlayerName;
    if ($("#onlinePlayerNameInput")) $("#onlinePlayerNameInput").value = resolvedPlayerName;
  }
  setupLocalServerLifecycle();
  setupAstralSpecializationOptions();
  syncOnlineDuelMode();
  $("#duelModeSelect").addEventListener("change", renderTalentChoices);
  $("#duelSpecializationsSelect")?.addEventListener("change", renderTalentChoices);
  $("#astralLeagueSelect")?.addEventListener("change", renderTalentChoices);
  $("#cardArtStyleSelect").addEventListener("change", event => {
    cardArtStyle = event.target.value === "new" ? "new" : "original";
    localStorage.setItem("arcane.cardArtStyle", cardArtStyle);
    if ($("#optionsCardArtStyle")) $("#optionsCardArtStyle").value = cardArtStyle;
    document.body.dataset.cardArtStyle = cardArtStyle;
    renderCollectionPanels();
  });
  $("#cardArtStyleSelect").value = cardArtStyle;
  localStorage.setItem("arcane.cardArtStyle", "new");
  $("#animationSpeed").value = String(animationSpeed);
  $("#soundEnabled").checked = soundEnabled;
  document.body.dataset.cardArtStyle = cardArtStyle;
  document.body.dataset.spellFrame = parchmentSpellFrames ? "parchment" : "arcane";
  renderTalentChoices();
  populateEditor();
  renderTournament();
  renderPlayerProfile();
  renderRuleset();
  inspectedCardId = allAstralCards()[0]?.id || null;
  collectionSelectedCardId = inspectedCardId;
  renderCollectionPanels();
  switchView("game");
  let restoredRemoteRoom = false;
  try {
    const savedRoom = JSON.parse(localStorage.getItem("arcane.remoteRoom") || "null");
    if (multiplayerEnabled && savedRoom?.code && savedRoom?.token) {
      restoredRemoteRoom = true;
      remoteRoomClient = createRemoteRoomClient();
      remoteRenderedSnapshotKey = "";
      Object.assign(remoteRoomClient, savedRoom);
      remoteBattleSuspendedToMenu = true;
      remoteMatchStartedAt = Number(savedRoom.startedAt || 0) || null;
      checkMultiplayerServer().then(async online => {
        if (!online) return;
        await refreshRemoteRoom();
        beginRemotePolling();
        renderRecoverableMatch();
      });
    }
  } catch { localStorage.removeItem("arcane.remoteRoom"); }
  if (urlParams.get("qa") === "duel") {
    clearPersistedLocalDuel();
    setTimeout(() => startDuel("fire", false, null, "arcane"), 30);
  } else if (!restoredRemoteRoom) {
    restorePersistedLocalDuel();
  }

  window.addEventListener("pageshow", event => {
    clearMobileHandGesture();
    clearMobileHoldPreview();
    $("#battlePanel")?.classList.remove("mobile-drag-creature", "mobile-drag-spell");
    $("#mobileDragGhost")?.classList.add("hidden");
    if (event.persisted) {
      closeDuelCardZoom();
      closeEnemyRevealedModal();
    }
    if (engine && !remoteDuelActive && [A.PHASES.PLAYER_SELECT, A.PHASES.PLAYER_TARGET].includes(engine.state.phase)) {
      busy = false;
      renderGame();
    }
    resumeRemoteSynchronization();
  });
  window.addEventListener("pagehide", () => {
    clearMobileHandGesture();
    clearMobileHoldPreview();
    persistLocalDuelState();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      clearMobileHandGesture();
      clearMobileHoldPreview();
      persistLocalDuelState();
      return;
    }
    if (engine && !remoteDuelActive && [A.PHASES.PLAYER_SELECT, A.PHASES.PLAYER_TARGET].includes(engine.state.phase)) {
      busy = false;
      renderGame();
    }
    resumeRemoteSynchronization();
  });
})(window.Arcane = window.Arcane || {});
