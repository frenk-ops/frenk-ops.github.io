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
  const ANIMATION_SPEEDS = Object.freeze([0.55, 0.8, 1.2, 1.5, 2]);
  const normalizeAnimationSpeed = value => {
    const parsed = Number(value);
    if (parsed === 1.15) return 1.2;
    if (parsed === 2.75) return 1.5;
    return ANIMATION_SPEEDS.includes(parsed) ? parsed : 1.5;
  };
  const animationSpeedMode = value => {
    const speed = Number(value);
    if (speed <= 0.55) return "minimal";
    if (speed <= 0.8) return "very-fast";
    if (speed <= 1.2) return "fast";
    if (speed <= 1.5) return "standard";
    return "slow";
  };
  const presentationDuration = ms => {
    const value = Math.max(0, Number(ms || 0));
    if (reducedMotion || animationSpeed <= 0.55) return Math.min(150, Math.max(55, value * 0.16));
    return value * animationSpeed;
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
  let animationSpeed = normalizeAnimationSpeed(preference("animationSpeed", "1.5"));
  let cardArtStyle = "new";
  let parchmentSpellFrames = preference("parchmentSpellFrames", "0") === "1";
  let soundEnabled = preference("soundEnabled", "1") !== "0";
  let boardCreatureNames = preference("boardCreatureNames", defaultBoardCreatureNames ? "1" : "0") !== "0";
  let busy = false;
  let audioContext = null;
  const originalSoundCache = new Map();
  const activeOriginalSounds = new Set();

  // UI-only card identity registry. Engine events remain the source of truth;
  // these profiles only decide how a resolved card is presented.
  const CARD_FX_REGISTRY = Object.freeze({
    astral_fire_01: Object.freeze({
      vfx: "scorching-orbs",
      sfx: Object.freeze({
        cast: Object.freeze([
          { type: "triangle", frequency: 360, secondFrequency: 980, duration: 0.26, volume: 0.050 },
          { type: "sine", frequency: 720, secondFrequency: 1480, duration: 0.18, volume: 0.024, delay: 0.06 }
        ]),
        impact: Object.freeze([
          { type: "noise", filterType: "bandpass", filterFrequency: 1450, filterEndFrequency: 620, duration: 0.18, volume: 0.030 },
          { type: "triangle", frequency: 980, secondFrequency: 310, duration: 0.16, volume: 0.042 }
        ])
      })
    }),
    astral_fire_03: Object.freeze({
      vfx: "fire-ritual",
      sfx: Object.freeze({
        cast: Object.freeze([
          { type: "sine", frequency: 118, secondFrequency: 196, duration: 0.62, volume: 0.040 },
          { type: "triangle", frequency: 392, secondFrequency: 784, duration: 0.34, volume: 0.027, delay: 0.12 }
        ]),
        impact: Object.freeze([
          { type: "sine", frequency: 523, secondFrequency: 1046, duration: 0.34, volume: 0.036 },
          { type: "noise", filterType: "highpass", filterFrequency: 1800, filterEndFrequency: 2800, duration: 0.18, volume: 0.016, delay: 0.05 }
        ])
      })
    }),
    astral_fire_04: Object.freeze({
      vfx: "rising-flames",
      sfx: Object.freeze({
        impact: Object.freeze([
          { type: "noise", filterType: "lowpass", filterFrequency: 1350, filterEndFrequency: 520, duration: 0.34, volume: 0.034 },
          { type: "sawtooth", frequency: 250, secondFrequency: 82, duration: 0.28, volume: 0.042 }
        ])
      })
    }),
    astral_fire_06: Object.freeze({
      vfx: "rising-flames",
      sfx: Object.freeze({
        cast: Object.freeze([
          { type: "noise", filterType: "bandpass", filterFrequency: 900, filterEndFrequency: 1650, duration: 0.46, volume: 0.030 },
          { type: "sawtooth", frequency: 145, secondFrequency: 540, duration: 0.42, volume: 0.045 }
        ]),
        impact: Object.freeze([
          { type: "noise", filterType: "lowpass", filterFrequency: 1800, filterEndFrequency: 420, duration: 0.35, volume: 0.038 },
          { type: "triangle", frequency: 740, secondFrequency: 180, duration: 0.22, volume: 0.026, delay: 0.05 }
        ])
      })
    }),
    astral_fire_08: Object.freeze({
      vfx: "rising-flames",
      sfx: Object.freeze({
        cast: Object.freeze([
          { type: "noise", filterType: "lowpass", filterFrequency: 1100, filterEndFrequency: 260, duration: 0.62, volume: 0.050 },
          { type: "sawtooth", frequency: 110, secondFrequency: 470, duration: 0.48, volume: 0.052 }
        ]),
        impact: Object.freeze([
          { type: "sawtooth", frequency: 280, secondFrequency: 58, duration: 0.38, volume: 0.060 },
          { type: "noise", filterType: "lowpass", filterFrequency: 980, filterEndFrequency: 180, duration: 0.46, volume: 0.046, delay: 0.03 }
        ])
      })
    }),
    astral_fire_09: Object.freeze({
      battleCry: Object.freeze({
        textKey: "battleCry.astral_fire_09",
        pitch: 0.72,
        rate: 0.90,
        sfx: Object.freeze([
          { type: "triangle", frequency: 150, secondFrequency: 92, duration: 0.34, volume: 0.036 }
        ])
      })
    }),
    astral_fire_10: Object.freeze({
      vfx: "rising-flames",
      sfx: Object.freeze({
        impact: Object.freeze([
          { type: "noise", filterType: "lowpass", filterFrequency: 920, filterEndFrequency: 210, duration: 0.48, volume: 0.050 },
          { type: "sawtooth", frequency: 170, secondFrequency: 65, duration: 0.42, volume: 0.054 }
        ])
      }),
      battleCry: Object.freeze({
        textKey: "battleCry.astral_fire_10",
        pitch: 0.68,
        rate: 0.88,
        sfx: Object.freeze([
          { type: "noise", filterType: "bandpass", filterFrequency: 760, filterEndFrequency: 390, duration: 0.36, volume: 0.030 }
        ])
      })
    }),
    astral_fire_11: Object.freeze({
      vfx: "armageddon",
      sfx: Object.freeze({
        cast: Object.freeze([
          { type: "sine", frequency: 92, secondFrequency: 46, duration: 0.82, volume: 0.060 },
          { type: "noise", filterType: "lowpass", filterFrequency: 780, filterEndFrequency: 170, duration: 0.78, volume: 0.052, delay: 0.05 }
        ]),
        impact: Object.freeze([
          { type: "sawtooth", frequency: 190, secondFrequency: 42, duration: 0.55, volume: 0.072 },
          { type: "noise", filterType: "lowpass", filterFrequency: 1300, filterEndFrequency: 120, duration: 0.72, volume: 0.060 }
        ])
      })
    }),
    astral_fire_12: Object.freeze({
      battleCry: Object.freeze({
        kind: "roar",
        sfx: Object.freeze([
          { type: "noise", filterType: "lowpass", filterFrequency: 720, filterEndFrequency: 180, duration: 0.72, volume: 0.058 },
          { type: "sawtooth", frequency: 108, secondFrequency: 54, duration: 0.62, volume: 0.050 }
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
          { type: "sine", frequency: 620, secondFrequency: 1180, duration: 0.42, volume: 0.045 },
          { type: "noise", filterType: "highpass", filterFrequency: 2400, filterEndFrequency: 3600, duration: 0.22, volume: 0.012 }
        ])
      })
    }),
    astral_water_03: Object.freeze({
      vfx: "justice",
      sfx: Object.freeze({
        cast: Object.freeze([
          { type: "triangle", frequency: 440, secondFrequency: 660, duration: 0.30, volume: 0.034 },
          { type: "sine", frequency: 880, secondFrequency: 1320, duration: 0.42, volume: 0.026, delay: 0.08 }
        ]),
        impact: Object.freeze([
          { type: "triangle", frequency: 1320, secondFrequency: 420, duration: 0.24, volume: 0.048 },
          { type: "sine", frequency: 660, secondFrequency: 330, duration: 0.38, volume: 0.026, delay: 0.04 }
        ])
      })
    }),
    astral_water_05: Object.freeze({
      vfx: "ice-bolt",
      sfx: Object.freeze({
        cast: Object.freeze([
          { type: "sine", frequency: 820, secondFrequency: 1760, duration: 0.26, volume: 0.040 },
          { type: "triangle", frequency: 1320, secondFrequency: 2360, duration: 0.19, volume: 0.024, delay: 0.05 }
        ]),
        impact: Object.freeze([
          { type: "noise", filterType: "highpass", filterFrequency: 2600, filterEndFrequency: 4800, duration: 0.18, volume: 0.022 },
          { type: "triangle", frequency: 1900, secondFrequency: 520, duration: 0.22, volume: 0.046 }
        ])
      })
    }),
    astral_water_08: Object.freeze({
      vfx: "acid-rain",
      sfx: Object.freeze({
        cast: Object.freeze([
          { type: "noise", filterType: "highpass", filterFrequency: 2200, filterEndFrequency: 1600, duration: 0.62, volume: 0.030 },
          { type: "sine", frequency: 310, secondFrequency: 240, duration: 0.48, volume: 0.020 }
        ]),
        impact: Object.freeze([
          { type: "noise", filterType: "bandpass", filterFrequency: 1750, filterEndFrequency: 980, duration: 0.58, volume: 0.042 },
          { type: "square", frequency: 210, secondFrequency: 130, duration: 0.22, volume: 0.018, delay: 0.12 }
        ])
      })
    }),
    astral_water_10: Object.freeze({
      battleCry: Object.freeze({
        textKey: "battleCry.astral_water_10",
        pitch: 0.86,
        rate: 0.90,
        sfx: Object.freeze([
          { type: "noise", filterType: "bandpass", filterFrequency: 1150, filterEndFrequency: 520, duration: 0.42, volume: 0.025 }
        ])
      })
    }),
    astral_air_05: Object.freeze({
      vfx: "hypnosis",
      sfx: Object.freeze({
        cast: Object.freeze([
          { type: "sine", frequency: 248, secondFrequency: 372, duration: 0.78, volume: 0.032 },
          { type: "sine", frequency: 372, secondFrequency: 248, duration: 0.78, volume: 0.020, delay: 0.09 }
        ]),
        impact: Object.freeze([
          { type: "triangle", frequency: 620, secondFrequency: 310, duration: 0.46, volume: 0.028 },
          { type: "noise", filterType: "bandpass", filterFrequency: 1200, filterEndFrequency: 680, duration: 0.36, volume: 0.014 }
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
          { type: "noise", filterType: "highpass", filterFrequency: 3200, filterEndFrequency: 1100, duration: 0.15, volume: 0.032 },
          { type: "square", frequency: 260, secondFrequency: 72, duration: 0.25, volume: 0.060 }
        ])
      })
    }),
    astral_air_08: Object.freeze({
      vfx: "chain-lightning",
      sfx: Object.freeze({
        cast: Object.freeze([
          { type: "square", frequency: 980, secondFrequency: 1960, duration: 0.14, volume: 0.026 },
          { type: "square", frequency: 1220, secondFrequency: 2440, duration: 0.12, volume: 0.024, delay: 0.10 },
          { type: "square", frequency: 1460, secondFrequency: 2920, duration: 0.10, volume: 0.022, delay: 0.20 }
        ]),
        impact: Object.freeze([
          { type: "noise", filterType: "highpass", filterFrequency: 2800, filterEndFrequency: 900, duration: 0.24, volume: 0.030 },
          { type: "triangle", frequency: 820, secondFrequency: 205, duration: 0.26, volume: 0.034, delay: 0.08 }
        ])
      })
    }),
    astral_air_09: Object.freeze({
      vfx: "tornado",
      sfx: Object.freeze({
        cast: Object.freeze([
          { type: "noise", filterType: "bandpass", filterFrequency: 680, filterEndFrequency: 1650, duration: 0.72, volume: 0.038 },
          { type: "sawtooth", frequency: 120, secondFrequency: 720, duration: 0.52, volume: 0.042 }
        ]),
        impact: Object.freeze([
          { type: "noise", filterType: "lowpass", filterFrequency: 960, filterEndFrequency: 280, duration: 0.46, volume: 0.030 },
          { type: "triangle", frequency: 760, secondFrequency: 160, duration: 0.40, volume: 0.045 }
        ])
      })
    }),
    astral_air_10: Object.freeze({
      battleCry: Object.freeze({
        textKey: "battleCry.astral_air_10",
        pitch: 1.02,
        rate: 0.92,
        sfx: Object.freeze([
          { type: "noise", filterType: "highpass", filterFrequency: 1300, filterEndFrequency: 2600, duration: 0.34, volume: 0.020 }
        ])
      })
    }),
    astral_air_12: Object.freeze({
      battleCry: Object.freeze({
        textKey: "battleCry.astral_air_12",
        pitch: 1.08,
        rate: 0.88,
        sfx: Object.freeze([
          { type: "sine", frequency: 523, secondFrequency: 1046, duration: 0.52, volume: 0.032 }
        ])
      })
    }),
    astral_air_13: Object.freeze({
      battleCry: Object.freeze({
        textKey: "battleCry.astral_air_13",
        pitch: 0.62,
        rate: 0.84,
        sfx: Object.freeze([
          { type: "noise", filterType: "lowpass", filterFrequency: 620, filterEndFrequency: 160, duration: 0.48, volume: 0.034 },
          { type: "sawtooth", frequency: 124, secondFrequency: 62, duration: 0.44, volume: 0.036 }
        ])
      })
    }),
    astral_earth_04: Object.freeze({
      vfx: "nature-ritual",
      sfx: Object.freeze({
        cast: Object.freeze([
          { type: "noise", filterType: "bandpass", filterFrequency: 880, filterEndFrequency: 1320, duration: 0.62, volume: 0.018 },
          { type: "sine", frequency: 294, secondFrequency: 588, duration: 0.54, volume: 0.030 }
        ]),
        impact: Object.freeze([
          { type: "triangle", frequency: 392, secondFrequency: 784, duration: 0.46, volume: 0.032 },
          { type: "noise", filterType: "highpass", filterFrequency: 1900, filterEndFrequency: 2800, duration: 0.26, volume: 0.012 }
        ])
      })
    }),
    astral_earth_06: Object.freeze({
      vfx: "rejuvenation",
      sfx: Object.freeze({
        cast: Object.freeze([
          { type: "sine", frequency: 196, secondFrequency: 392, duration: 0.62, volume: 0.032 },
          { type: "triangle", frequency: 392, secondFrequency: 988, duration: 0.48, volume: 0.024, delay: 0.08 }
        ]),
        impact: Object.freeze([
          { type: "sine", frequency: 330, secondFrequency: 660, duration: 0.56, volume: 0.034 },
          { type: "noise", filterType: "bandpass", filterFrequency: 1050, filterEndFrequency: 1650, duration: 0.34, volume: 0.014 }
        ])
      })
    }),
    astral_earth_10: Object.freeze({
      vfx: "stone-rain",
      sfx: Object.freeze({
        cast: Object.freeze([
          { type: "noise", filterType: "bandpass", filterFrequency: 520, filterEndFrequency: 1080, duration: 0.58, volume: 0.032 },
          { type: "sine", frequency: 180, secondFrequency: 110, duration: 0.46, volume: 0.022 }
        ]),
        impact: Object.freeze([
          { type: "noise", filterType: "lowpass", filterFrequency: 820, filterEndFrequency: 180, duration: 0.42, volume: 0.050 },
          { type: "sawtooth", frequency: 130, secondFrequency: 58, duration: 0.28, volume: 0.045, delay: 0.06 }
        ])
      })
    }),
    astral_earth_11: Object.freeze({
      battleCry: Object.freeze({
        textKey: "battleCry.astral_earth_11",
        pitch: 0.70,
        rate: 0.82,
        sfx: Object.freeze([
          { type: "noise", filterType: "lowpass", filterFrequency: 520, filterEndFrequency: 130, duration: 0.46, volume: 0.032 }
        ])
      })
    }),
    astral_earth_12: Object.freeze({
      battleCry: Object.freeze({
        kind: "roar",
        sfx: Object.freeze([
          { type: "noise", filterType: "bandpass", filterFrequency: 540, filterEndFrequency: 180, duration: 0.66, volume: 0.054 },
          { type: "sawtooth", frequency: 136, secondFrequency: 72, duration: 0.50, volume: 0.042 }
        ])
      })
    }),
    astral_death_03: Object.freeze({
      vfx: "curse",
      sfx: Object.freeze({
        cast: Object.freeze([
          { type: "noise", filterType: "bandpass", filterFrequency: 820, filterEndFrequency: 420, duration: 0.62, volume: 0.020 },
          { type: "sine", frequency: 310, secondFrequency: 124, duration: 0.58, volume: 0.034 }
        ]),
        impact: Object.freeze([
          { type: "triangle", frequency: 262, secondFrequency: 92, duration: 0.42, volume: 0.036 },
          { type: "noise", filterType: "lowpass", filterFrequency: 620, filterEndFrequency: 180, duration: 0.34, volume: 0.024, delay: 0.06 }
        ])
      })
    }),
    astral_death_08: Object.freeze({
      vfx: "drain-life",
      sfx: Object.freeze({
        cast: Object.freeze([
          { type: "sine", frequency: 430, secondFrequency: 138, duration: 0.52, volume: 0.038 },
          { type: "triangle", frequency: 760, secondFrequency: 260, duration: 0.38, volume: 0.022, delay: 0.07 }
        ]),
        impact: Object.freeze([
          { type: "noise", filterType: "bandpass", filterFrequency: 840, filterEndFrequency: 360, duration: 0.56, volume: 0.026 },
          { type: "sine", frequency: 170, secondFrequency: 610, duration: 0.58, volume: 0.044 }
        ])
      })
    }),
    astral_death_12: Object.freeze({
      vfx: "drain-souls",
      sfx: Object.freeze({
        cast: Object.freeze([
          { type: "noise", filterType: "bandpass", filterFrequency: 430, filterEndFrequency: 180, duration: 0.82, volume: 0.036 },
          { type: "sine", frequency: 105, secondFrequency: 58, duration: 0.62, volume: 0.052 }
        ]),
        impact: Object.freeze([
          { type: "sine", frequency: 92, secondFrequency: 230, duration: 0.66, volume: 0.055 },
          { type: "noise", filterType: "highpass", filterFrequency: 1300, filterEndFrequency: 3200, duration: 0.54, volume: 0.022, delay: 0.10 }
        ])
      })
    }),
    astral_death_13: Object.freeze({
      battleCry: Object.freeze({
        textKey: "battleCry.astral_death_13",
        pitch: 0.56,
        rate: 0.84,
        sfx: Object.freeze([
          { type: "noise", filterType: "lowpass", filterFrequency: 540, filterEndFrequency: 115, duration: 0.52, volume: 0.038 },
          { type: "sine", frequency: 120, secondFrequency: 62, duration: 0.48, volume: 0.030 }
        ])
      })
    })
  });

  function cardFxProfile(card) {
    return card?.id ? CARD_FX_REGISTRY[card.id] || null : null;
  }

  function spellFxProfile(card) {
    return card?.type === "spell" ? cardFxProfile(card) : null;
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
  let collectionPreviewMode = "full";
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false;
  let turnBannerTimer = null;
  let presentationLog = [];
  let currentDuelLaunch = null;
  let remoteRoomClient = null;
  let remoteRoomPoll = null;
  let remoteHeartbeatTimer = null;
  let remoteTurnTimerTicker = null;
  let remoteLastAnnouncedTurnSide = null;
  let roomBrowserPoll = null;
  let remoteQuickChatToastTimer = null;
  let remoteSeenMessageIds = new Set();
  let remoteMessagesInitialized = false;
  let muteRemoteLobbyChat = preference("muteRemoteLobbyChat", "0") === "1";
  let muteRemoteQuickPhrases = preference("muteRemoteQuickPhrases", "0") === "1";
  let remoteRecordedMatchId = "";
  let remoteDuelActive = false;
  let remoteBattleSuspendedToMenu = false;
  let remoteLifecycleStatus = "idle";
  let remoteTransportIssueSince = null;
  let remoteDisconnectObservedAt = null;
  const REMOTE_SOFT_RECONNECT_MS = 5000;
  const REMOTE_DISCONNECT_OVERLAY_DELAY_MS = 4000;
  let lastRemoteRoomState = null;
  let remoteRenderedSnapshotKey = "";
  let remoteRefreshBusy = false;
  let multiplayerServerStatus = "idle";
  let multiplayerServerVersion = "";
  let multiplayerServerCheckPromise = null;
  let multiplayerServerRetryTimer = null;
  let multiplayerControlsLocked = false;
  let multiplayerUpdateRequested = false;
  let multiplayerUpdateReady = false;
  let inspectedRemoteRoomCode = "";
  let inspectedRemoteRoomSettings = null;
  let remoteRoomInspectTimer = null;
  let rankedTicket = "";
  let rankedPoll = null;
  let rankedSearchStartedAt = 0;
  let multiplayerEntryMode = preference("multiplayerEntryMode", "free") === "ranked" ? "ranked" : "free";
  let onlineAccountSnapshot = A.onlineAccount?.snapshot?.() || { configured: false, ready: false };
  let currentPlayerName = "";
  let currentOpponentName = "";
  let matchStartedAt = null;
  let remoteMatchStartedAt = null;
  let currentTurnDamage = 0;
  let navigation = null;
  let pauseMenu = null;
  const collectionState = { school: "all", type: "all", level: "all", search: "" };
  let forgeSession = null;
  let forgeInventoryPreviewCardId = null;
  let forgeSelectedSigilSlotId = null;
  let forgeCardEditorSection = null;
  let forgeTargetCost = "auto";
  let forgeMathMode = "simple";
  const ACTIVE_LOCAL_DUEL_KEY = "arcane.activeLocalDuel.v1";
  const ACTIVE_VIEW_KEY = "arcane.ui.activeView.v1";
  const RESTORABLE_VIEWS = new Set(["game", "multiplayer", "tournament", "cards", "inventory", "forge", "uiLab", "profile", "rules", "diagnostics"]);

  function rememberedView() {
    try {
      const requested = new URLSearchParams(window.location.search).get("view") || "";
      if (RESTORABLE_VIEWS.has(requested)) return requested;
      const value = sessionStorage.getItem(ACTIVE_VIEW_KEY) || "";
      return RESTORABLE_VIEWS.has(value) ? value : "game";
    } catch {
      return "game";
    }
  }

  function rememberView(name) {
    if (!RESTORABLE_VIEWS.has(name)) return;
    try { sessionStorage.setItem(ACTIVE_VIEW_KEY, name); } catch {}
  }

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
      warmVisibleDuelArt();
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
    return new Promise(resolve => setTimeout(resolve, presentationDuration(ms)));
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
      protocolVersion: A.MULTIPLAYER_PROTOCOL_VERSION,
      identityTokenProvider: async () => A.onlineAccount?.accessToken?.() || ""
    });
  }


  function stopRankedPolling() {
    if (rankedPoll) window.clearInterval(rankedPoll);
    rankedPoll = null;
  }

  function renderMultiplayerEntryMode() {
    const ranked = multiplayerEntryMode === "ranked";
    $("#multiplayerFreePanel")?.classList.toggle("hidden", ranked);
    $("#rankedPanel")?.classList.toggle("hidden", !ranked);
    $$("[data-multiplayer-entry-mode]").forEach(button => {
      const active = button.dataset.multiplayerEntryMode === multiplayerEntryMode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
      button.disabled = Boolean(rankedTicket) && button.dataset.multiplayerEntryMode !== "ranked";
    });
  }

  function setMultiplayerEntryMode(mode, options = {}) {
    const next = mode === "ranked" ? "ranked" : "free";
    if (rankedTicket && next !== "ranked") return false;
    multiplayerEntryMode = next;
    if (options.persist !== false) {
      try { localStorage.setItem("arcane.multiplayerEntryMode", next); } catch {}
    }
    renderMultiplayerEntryMode();
    if (next === "ranked") {
      initializeOnlineAccount().then(() => refreshRankedLeaderboard()).catch(() => {});
    }
    return true;
  }

  function renderOnlineAccountState() {
    const snapshot = onlineAccountSnapshot || {};
    const accountState = $("#rankedAccountState");
    const findButton = $("#findRankedMatchBtn");
    const ratingBadge = $("#rankedRatingBadge");
    const progression = snapshot.progression || {};
    const rating = snapshot.rating || {};
    if (ratingBadge) ratingBadge.textContent = String(Number(rating.rating || 1000));
    const avatarRoot = $("#onlinePlayerAvatar");
    if (avatarRoot) {
      avatarRoot.innerHTML = profileAvatarMarkup(
        snapshot.profile?.avatar_url || localStorage.getItem("arcane.profileAvatar") || "",
        snapshot.profile?.display_name || selectedPlayerName(),
        "profile-avatar"
      );
    }
    if (accountState) {
      if (!snapshot.configured) accountState.textContent = t("ranked.accountUnavailable");
      else if (snapshot.error) accountState.textContent = t("ranked.accountError");
      else if (!snapshot.user) accountState.textContent = t("ranked.accountPreparing");
      else accountState.textContent = t("ranked.accountReady", {
        level: Number(progression.level || 1),
        games: Number(progression.games_played || 0)
      });
    }
    if (findButton) {
      findButton.disabled = Boolean(rankedTicket) || multiplayerServerStatus !== "online" || !snapshot.configured || !snapshot.user || Boolean(snapshot.error);
    }
    renderMultiplayerEntryMode();
  }

  async function initializeOnlineAccount(options = {}) {
    if (!A.onlineAccount) return null;
    onlineAccountSnapshot = await A.onlineAccount.initialize(selectedPlayerName());
    if (onlineAccountSnapshot?.user && onlineAccountSnapshot?.profile) {
      const localName = selectedPlayerName();
      const remoteName = String(onlineAccountSnapshot.profile.display_name || "");
      const localAvatar = normalizeProfileAvatar(localStorage.getItem("arcane.profileAvatar") || "");
      const shouldSyncName = localName && remoteName === "Giocatore" && localName !== "Giocatore" && localName !== "Player";
      const shouldSyncAvatar = localAvatar && !normalizeProfileAvatar(onlineAccountSnapshot.profile.avatar_url || "");
      if (shouldSyncName || shouldSyncAvatar) {
        try {
          await A.onlineAccount.updateProfile({
            ...(shouldSyncName ? { displayName: localName } : {}),
            ...(shouldSyncAvatar ? { avatarUrl: localAvatar } : {})
          });
          onlineAccountSnapshot = A.onlineAccount.snapshot();
        } catch {}
      }
    }
    renderOnlineAccountState();
    if (options.renderProfile) renderPlayerProfile();
    return onlineAccountSnapshot;
  }

  function renderRankedSearchState(message = "") {
    const root = $("#rankedSearchState");
    if (!root) return;
    root.classList.toggle("hidden", !rankedTicket);
    if ($("#rankedSearchDetail")) {
      const elapsed = rankedSearchStartedAt ? Math.max(0, Math.round((Date.now() - rankedSearchStartedAt) / 1000)) : 0;
      $("#rankedSearchDetail").textContent = message || t("ranked.searchingDetail", { seconds: elapsed });
    }
    renderOnlineAccountState();
  }

  function adoptRankedRoom(response) {
    const room = response?.room;
    if (!room || !remoteRoomClient) return false;
    stopRankedPolling();
    rankedTicket = "";
    rankedSearchStartedAt = 0;
    remoteRenderedSnapshotKey = "";
    remoteBattleSuspendedToMenu = false;
    remoteLifecycleStatus = "waiting";
    lastRemoteRoomState = null;
    remoteMatchStartedAt = null;
    remoteSeenMessageIds = new Set();
    remoteMessagesInitialized = false;
    remoteRecordedMatchId = "";
    saveRemoteRoom();
    renderRankedSearchState();
    renderRemoteLobby(room);
    beginRemotePolling();
    return true;
  }

  async function pollRankedSearch() {
    if (!rankedTicket || !remoteRoomClient) return;
    try {
      const response = await remoteRoomClient.rankedStatus(rankedTicket);
      if (response?.status === "matched") {
        adoptRankedRoom(response);
        return;
      }
      renderRankedSearchState();
    } catch (error) {
      stopRankedPolling();
      rankedTicket = "";
      rankedSearchStartedAt = 0;
      renderRankedSearchState();
      if ($("#onlineFormMessage")) $("#onlineFormMessage").textContent = error.message || t("online.error");
    }
  }

  async function startRankedSearch() {
    setMultiplayerEntryMode("ranked");
    if (!await checkMultiplayerServer({ force: true })) return;
    if (remoteRoomClient?.code) {
      if ($("#onlineFormMessage")) $("#onlineFormMessage").textContent = t("ranked.finishCurrentRoom");
      return;
    }
    onlineAccountSnapshot = await initializeOnlineAccount();
    if (!onlineAccountSnapshot?.user || onlineAccountSnapshot?.error) {
      if ($("#onlineFormMessage")) $("#onlineFormMessage").textContent = t("ranked.accountRequired");
      return;
    }
    if ($("#onlineFormMessage")) $("#onlineFormMessage").textContent = "";
    remoteRoomClient = createRemoteRoomClient();
    try {
      const response = await remoteRoomClient.queueRanked("classic", savePlayerName($("#onlinePlayerNameInput")));
      rankedTicket = String(response.ticket || "");
      rankedSearchStartedAt = Date.now();
      if (response.status === "matched") {
        adoptRankedRoom(response);
        return;
      }
      renderRankedSearchState();
      stopRankedPolling();
      rankedPoll = window.setInterval(pollRankedSearch, 1500);
    } catch (error) {
      remoteRoomClient = null;
      rankedTicket = "";
      rankedSearchStartedAt = 0;
      renderRankedSearchState();
      if ($("#onlineFormMessage")) $("#onlineFormMessage").textContent = error.message || t("online.error");
    }
  }

  async function cancelRankedSearch() {
    if (!rankedTicket || !remoteRoomClient) return;
    const ticket = rankedTicket;
    stopRankedPolling();
    try { await remoteRoomClient.cancelRanked(ticket); } catch {}
    rankedTicket = "";
    rankedSearchStartedAt = 0;
    if (!remoteRoomClient.code) remoteRoomClient = null;
    renderRankedSearchState();
  }

  function renderRankedLeaderboard(payload = {}) {
    const root = $("#rankedLeaderboardList");
    if (!root) return;
    root.innerHTML = "";
    const season = payload.season || null;
    if ($("#rankedSeasonLabel")) $("#rankedSeasonLabel").textContent = season?.name || t("ranked.preseason");
    const entries = Array.isArray(payload.entries) ? payload.entries : [];
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "multiplayer-room-empty";
      empty.textContent = t("ranked.noPlayers");
      root.appendChild(empty);
      return;
    }
    entries.forEach(entry => {
      const row = document.createElement("article");
      row.className = "multiplayer-room-entry";
      const rank = document.createElement("strong");
      rank.textContent = `#${Number(entry.rank || 0)}`;
      const copy = document.createElement("div");
      copy.className = "multiplayer-room-entry-copy";
      const title = document.createElement("strong");
      title.textContent = entry.displayName || "Incantatore";
      const meta = document.createElement("span");
      meta.textContent = entry.playerTag
        ? `#${entry.playerTag} · ${t("ranked.gamesShort", { games: Number(entry.gamesPlayed || 0) })}`
        : t("ranked.gamesShort", { games: Number(entry.gamesPlayed || 0) });
      copy.append(title, meta);
      const rating = document.createElement("strong");
      rating.textContent = String(Number(entry.rating || 1000));
      row.append(rank, copy, rating);
      root.appendChild(row);
    });
  }

  async function refreshRankedLeaderboard() {
    const root = $("#rankedLeaderboardList");
    if (!onlineAccountSnapshot?.configured || !onlineAccountSnapshot?.user || onlineAccountSnapshot?.error || multiplayerServerStatus !== "online") {
      if (root) renderRankedLeaderboard({ entries: [] });
      return false;
    }
    try {
      const payload = await createRemoteRoomClient().rankedLeaderboard("classic", 20);
      renderRankedLeaderboard(payload);
      return true;
    } catch {
      renderRankedLeaderboard({ entries: [] });
      return false;
    }
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
    renderOnlineAccountState();
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
    const retryButton = $("#retryMultiplayerServerBtn");
    if (retryButton) {
      const visible = state === "offline" || state === "updating";
      retryButton.classList.toggle("hidden", !visible);
      retryButton.textContent = state === "updating" ? t("online.updateNow") : t("online.retry");
    }
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

  async function waitForInstalledAppWorker(registration) {
    if (!registration) return null;
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
      worker = registration.waiting || (worker.state === "installed" ? worker : null);
    }
    return worker?.state === "installed" ? worker : registration.waiting || null;
  }

  async function activateWaitingAppUpdateIfSafe(options = {}) {
    if (!options.explicit || duelIsVisible() || !("serviceWorker" in navigator)) return false;
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return false;
      const worker = await waitForInstalledAppWorker(registration);
      if (!worker) return false;
      rememberView("multiplayer");
      let reloaded = false;
      const reload = () => {
        if (reloaded) return;
        reloaded = true;
        location.reload();
      };
      navigator.serviceWorker.addEventListener("controllerchange", reload, { once: true });
      worker.postMessage({ type: "ACTIVATE_UPDATE", safeToActivate: true });
      window.setTimeout(reload, 1800);
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
    if (multiplayerUpdateRequested) {
      if (multiplayerUpdateReady) setMultiplayerServerState("updating", t("online.updateReady"));
      return;
    }
    multiplayerUpdateRequested = true;
    setMultiplayerServerState("updating", t("online.updatingClient"));
    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        multiplayerUpdateReady = Boolean(await waitForInstalledAppWorker(registration));
      }
    } catch {
      multiplayerUpdateReady = false;
    }
    setMultiplayerServerState(
      "updating",
      multiplayerUpdateReady ? t("online.updateReady") : t("online.updatingClient")
    );
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
      sequence: remoteRoomClient.sequence, matchNumber: remoteRoomClient.matchNumber || 0, checksum: remoteRoomClient.checksum,
      startedAt: remoteMatchStartedAt || null
    }));
  }

  function stopRemoteTimers() {
    clearInterval(remoteRoomPoll);
    clearInterval(remoteHeartbeatTimer);
    clearInterval(remoteTurnTimerTicker);
    remoteRoomPoll = null;
    remoteHeartbeatTimer = null;
    remoteTurnTimerTicker = null;
    remoteLastAnnouncedTurnSide = null;
    renderRemoteTurnTimer(null);
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
    remoteTransportIssueSince = null;
    remoteDisconnectObservedAt = null;
    remoteSeenMessageIds = new Set();
    remoteMessagesInitialized = false;
    remoteRecordedMatchId = "";
    window.clearTimeout(remoteQuickChatToastTimer);
    remoteQuickChatToastTimer = null;
    $("#duelQuickChat")?.classList.add("hidden");
    $("#duelQuickChatToast")?.classList.add("hidden");
    $("#onlineConnectionQuality")?.classList.add("hidden");
    saveRemoteRoom();
    renderRecoverableMatch();
    $("#remoteDisconnectOverlay")?.classList.add("hidden");
  }

  function renderRemoteTurnTimer(response = lastRemoteRoomState) {
    const root = $("#onlineTurnTimer");
    if (!root) return;
    const timer = response?.turnTimer;
    const active = Boolean(remoteDuelActive && response?.lifecycle?.status === "active" && timer?.actorSide && timer?.deadlineAt);
    root.classList.toggle("hidden", !active);
    if (!active) {
      remoteLastAnnouncedTurnSide = null;
      root.classList.remove("is-own-turn", "is-opponent-turn", "is-warning", "is-danger");
      return;
    }
    const remainingMs = Math.max(0, Number(timer.deadlineAt) - Date.now());
    const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const streak = Number(timer.streaks?.[timer.actorSide] || 0);
    const max = Number(timer.maxConsecutiveTimeouts || 3);
    const ownTurn = timer.actorSide === remoteRoomClient?.side;
    const opponentName = currentOpponentName || t("ui.opponent");
    const baseLabel = ownTurn
      ? t("online.yourTurnTimer", { seconds })
      : t("online.opponentTurnTimer", { name: opponentName, seconds });
    root.textContent = streak > 0 ? `${baseLabel} · ${streak}/${max}` : baseLabel;
    const afkWarning = ownTurn && streak >= Math.max(2, max - 1);
    root.classList.toggle("is-own-turn", ownTurn);
    root.classList.toggle("is-opponent-turn", !ownTurn);
    root.classList.toggle("is-warning", seconds <= 15 || afkWarning);
    root.classList.toggle("is-danger", seconds <= 5);
    if (afkWarning) root.textContent = `⚠ ${baseLabel} · ${streak}/${max}`;
    root.title = streak > 0 ? `${t("online.afkWarning")} ${streak}/${max}` : t("online.turnTimer");

    if (remoteLastAnnouncedTurnSide !== timer.actorSide) {
      const previousSide = remoteLastAnnouncedTurnSide;
      remoteLastAnnouncedTurnSide = timer.actorSide;
      if (previousSide) {
        if (ownTurn) {
          playCardReadySound();
          showTurnBanner(t("online.yourTurn"), "player", 800);
        } else {
          showTurnBanner(t("online.opponentTurn", { name: opponentName }), "enemy", 700);
        }
      }
    }
  }

  function renderRemoteConnectionQuality() {
    const root = $("#onlineConnectionQuality");
    if (!root) return;
    const visible = Boolean(remoteDuelActive && remoteRoomClient);
    root.classList.toggle("hidden", !visible);
    if (!visible) return;

    root.classList.remove("is-good", "is-warning", "is-poor", "is-reconnecting");
    root.title = "";
    const metrics = remoteRoomClient.connectionMetrics?.() || {};
    if (remoteTransportIssueSince) {
      const elapsed = Date.now() - remoteTransportIssueSince;
      root.classList.add("is-reconnecting");
      root.textContent = elapsed >= REMOTE_SOFT_RECONNECT_MS
        ? t("online.connectionUnstable")
        : t("online.reconnecting");
      return;
    }
    if (remoteLifecycleStatus === "disconnected") {
      root.classList.add("is-reconnecting");
      root.textContent = t("online.opponentReconnecting");
      return;
    }

    const latency = Number(metrics.latencyMs);
    if (!Number.isFinite(latency)) {
      root.textContent = t("online.connectionOnline");
      root.classList.add("is-good");
      return;
    }
    const rounded = Math.max(0, Math.round(latency));
    root.textContent = `● ${rounded} ms`;
    root.title = t("online.connectionPing", { latency: rounded });
    if (rounded < 150) root.classList.add("is-good");
    else if (rounded < 350) root.classList.add("is-warning");
    else root.classList.add("is-poor");
  }

  function noteRemoteTransportSuccess() {
    remoteTransportIssueSince = null;
    if (multiplayerServerStatus !== "online") setMultiplayerServerState("online");
    renderRemoteConnectionQuality();
  }

  function noteRemoteTransportFailure() {
    if (!remoteTransportIssueSince) remoteTransportIssueSince = Date.now();
    if (Date.now() - remoteTransportIssueSince >= REMOTE_SOFT_RECONNECT_MS) {
      setMultiplayerServerState("offline");
    }
    renderRemoteConnectionQuality();
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
    renderRemoteTurnTimer(response);
    const lifecycle = response.lifecycle || {};
    remoteLifecycleStatus = lifecycle.status || (response.ready ? "active" : "waiting");
    renderRecoverableMatch(response);

    const overlay = $("#remoteDisconnectOverlay");
    const title = $("#remoteDisconnectTitle");
    const detail = $("#remoteDisconnectDetail");
    const countdown = $("#remoteDisconnectCountdown");
    const returnButton = $("#remoteDisconnectReturnBtn");

    renderRemoteConnectionQuality();

    if (remoteLifecycleStatus === "finished") {
      remoteDisconnectObservedAt = null;
      if (response?.ranked && A.onlineAccount?.configured?.()) {
        window.setTimeout(async () => {
          try {
            onlineAccountSnapshot = await A.onlineAccount.refreshData();
            renderOnlineAccountState();
            refreshRankedLeaderboard().catch(() => {});
            if ($("#profileView")?.classList.contains("active")) renderPlayerProfile();
          } catch {}
        }, 500);
      }
      const finishedMatchId = response.matchId || `room:${response.code || remoteRoomClient?.code || "online"}:match:${response.matchNumber || 1}`;
      if (remoteRoomClient?.side && remoteRecordedMatchId !== finishedMatchId) {
        const result = lifecycle.winner === remoteRoomClient.side
          ? "win"
          : lifecycle.winner
            ? "loss"
            : "draw";
        A.recordProfileMatch?.(profile, {
          matchId: finishedMatchId,
          mode: "multiplayer",
          result,
          durationMs: remoteMatchStartedAt ? Date.now() - remoteMatchStartedAt : null
        });
        remoteRecordedMatchId = finishedMatchId;
        profile = A.loadProfile();
        renderPlayerProfile();
      }
      overlay?.classList.add("hidden");
      if (countdown) countdown.textContent = "";
      returnButton?.classList.add("hidden");
      return;
    }

    if (remoteLifecycleStatus !== "disconnected") {
      remoteDisconnectObservedAt = null;
      overlay?.classList.add("hidden");
      returnButton?.classList.add("hidden");
      return;
    }

    if (!remoteDisconnectObservedAt) remoteDisconnectObservedAt = Date.now();
    const showDisconnectOverlay = Date.now() - remoteDisconnectObservedAt >= REMOTE_DISCONNECT_OVERLAY_DELAY_MS;
    if (overlay) overlay.classList.toggle("hidden", !remoteDuelActive || !showDisconnectOverlay);
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
      noteRemoteTransportSuccess();
      applyRemoteLifecycle({
        ...(lastRemoteRoomState || {}),
        lifecycle: response.lifecycle,
        turnTimer: response.turnTimer || lastRemoteRoomState?.turnTimer
      });
    } catch {
      noteRemoteTransportFailure();
    }
  }

  function hideRemoteBattleToMultiplayer(response = lastRemoteRoomState) {
    if (response) lastRemoteRoomState = response;
    remoteBattleSuspendedToMenu = true;
    remoteDuelActive = false;
    engine = null;
    busy = false;
    remoteRenderedSnapshotKey = "";
    $("#battlePanel")?.classList.add("hidden");
    $("#setupPanel")?.classList.remove("hidden");
    $("#remoteDisconnectOverlay")?.classList.add("hidden");
    $("#duelQuickChat")?.classList.add("hidden");
    $("#onlineConnectionQuality")?.classList.add("hidden");
    remoteDisconnectObservedAt = null;
    renderRemoteTurnTimer(null);
    switchView("multiplayer");
    navigation?.setActive("multiplayer");
    renderRemoteLobby(lastRemoteRoomState, { deferBattle: true });
    renderRecoverableMatch();
    syncBackgroundMusicScene();
    if (multiplayerUpdateRequested) requestLatestAppVersion();
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

  function setRemoteMutePreference(key, value) {
    try { localStorage.setItem(`arcane.${key}`, value ? "1" : "0"); } catch {}
  }

  function syncRemoteMuteControls() {
    const chatToggle = $("#muteOnlineChatCheckbox");
    const phraseToggle = $("#muteOnlinePhrasesCheckbox");
    if (chatToggle) chatToggle.checked = muteRemoteLobbyChat;
    if (phraseToggle) phraseToggle.checked = muteRemoteQuickPhrases;
  }

  function remoteMessageMuted(message) {
    if (!message || message.side === remoteRoomClient?.side) return false;
    if (message.kind === "text") return muteRemoteLobbyChat;
    if (message.kind === "phrase") return muteRemoteQuickPhrases;
    return false;
  }

  function remotePhraseLabel(phraseId) {
    const key = `online.phrase.${String(phraseId || "")}`;
    const translated = t(key);
    return translated === key ? String(phraseId || "") : translated;
  }

  function showRemotePhraseToast(message, response) {
    if (!message || message.side === remoteRoomClient?.side || message.kind !== "phrase" || !remoteDuelActive || muteRemoteQuickPhrases) return;
    const toast = $("#duelQuickChatToast");
    if (!toast) return;
    const senderName = normalizedPlayerName(response?.playerNames?.[message.side], t("ui.opponent"));
    toast.textContent = `💬 ${senderName}: ${remotePhraseLabel(message.phraseId)}`;
    toast.classList.remove("hidden");
    window.clearTimeout(remoteQuickChatToastTimer);
    remoteQuickChatToastTimer = window.setTimeout(() => toast.classList.add("hidden"), 2600);
  }

  function renderRemoteMessages(response) {
    const messages = Array.isArray(response?.messages) ? response.messages : [];
    if (!remoteMessagesInitialized) {
      messages.forEach(message => { if (message?.id) remoteSeenMessageIds.add(message.id); });
      remoteMessagesInitialized = true;
    } else {
      for (const message of messages) {
        if (!message?.id || remoteSeenMessageIds.has(message.id)) continue;
        showRemotePhraseToast(message, response);
        remoteSeenMessageIds.add(message.id);
      }
    }
    syncRemoteMuteControls();
    const root = $("#onlineLobbyChatMessages");
    if (!root) return;
    const names = response?.playerNames || {};
    const visibleMessages = messages.filter(message => !remoteMessageMuted(message));
    root.innerHTML = visibleMessages.map(message => {
      const own = message.side === remoteRoomClient?.side;
      const sender = normalizedPlayerName(names[message.side], own ? t("ui.player") : t("ui.opponent"));
      const body = message.kind === "phrase" ? remotePhraseLabel(message.phraseId) : String(message.text || "");
      return `<div class="multiplayer-chat-line${own ? " is-own" : ""}"><small>${escapeHtml(sender)}</small>${escapeHtml(body)}</div>`;
    }).join("");
    root.scrollTop = root.scrollHeight;
  }

  function renderRemoteSessionHistory(response) {
    const root = $("#onlineSessionHistory");
    const itemsRoot = $("#onlineSessionHistoryItems");
    if (!root || !itemsRoot) return;
    const history = Array.isArray(response?.sessionHistory) ? response.sessionHistory.slice(-5) : [];
    root.classList.toggle("hidden", !history.length);
    if (!history.length) {
      itemsRoot.innerHTML = "";
      return;
    }
    const ownSide = remoteRoomClient?.side || "player";
    itemsRoot.innerHTML = history.map(entry => {
      const winner = entry?.winner;
      const result = !winner ? "draw" : winner === ownSide ? "win" : "loss";
      const label = t(`online.history.${result}`);
      const matchNumber = Math.max(1, Number(entry?.matchNumber || 1));
      return `<span class="multiplayer-session-history-chip is-${result}" title="#${matchNumber}">${escapeHtml(label)}</span>`;
    }).join("");
  }

  function syncLobbySpecializationVisibility() {
    const hostSpecialized = $("#onlineLobbySpecializationsSelect")?.value === "on";
    $("#onlineLobbyHostSpecializationField")?.classList.toggle("hidden", !hostSpecialized);
  }

  function renderRemoteLobbyControls(response) {
    const isHost = remoteRoomClient?.side === "player";
    const settings = response?.settings || {};
    const finished = response?.lifecycle?.status === "finished";
    const waiting = response?.lifecycle?.status === "waiting";
    const ranked = Boolean(response?.ranked);
    const editable = !ranked && (finished || waiting);
    $("#onlineHostLobbySettings")?.classList.toggle("hidden", !isHost || ranked);
    $("#onlineGuestLobbySettings")?.classList.toggle("hidden", isHost && !ranked);
    if ($("#onlineLobbyRole")) $("#onlineLobbyRole").textContent = t(isHost ? "online.host" : "online.guest");

    const mode = normalizeSpellbookMode(settings.spellbookDistribution || "arcane");
    if ($("#onlineLobbyModeSelect")) {
      $("#onlineLobbyModeSelect").value = mode;
      $("#onlineLobbyModeSelect").disabled = !editable;
    }
    if ($("#onlineLobbySpecializationsSelect")) {
      $("#onlineLobbySpecializationsSelect").value = settings.specializationsEnabled ? "on" : "off";
      $("#onlineLobbySpecializationsSelect").disabled = !editable;
    }
    if ($("#onlineLobbyHostSpecializationSelect")) {
      $("#onlineLobbyHostSpecializationSelect").value = settings.playerSpecialization || "random";
      $("#onlineLobbyHostSpecializationSelect").disabled = !editable || !settings.specializationsEnabled;
    }
    syncLobbySpecializationVisibility();

    if ($("#onlineLobbyGuestRules")) $("#onlineLobbyGuestRules").textContent = roomModeLabel(settings);
    $("#onlineLobbyGuestSpecializationField")?.classList.toggle("hidden", isHost || !settings.specializationsEnabled);
    if ($("#onlineLobbyGuestSpecializationSelect")) {
      $("#onlineLobbyGuestSpecializationSelect").value = settings.playerSpecialization || "random";
      $("#onlineLobbyGuestSpecializationSelect").disabled = !editable || !settings.specializationsEnabled;
    }

    const result = $("#onlinePostMatchResult");
    if (result) {
      result.classList.toggle("hidden", !finished);
      if (!finished) {
        result.textContent = "";
      } else if (response.lifecycle?.reason === "afk_timeout") {
        result.textContent = response.lifecycle?.winner === remoteRoomClient?.side
          ? t("online.afkVictory")
          : t("online.afkDefeat");
      } else {
        const baseResult = remoteResultLabel(response.lifecycle) || t("online.matchFinished");
        const reason = response.lifecycle?.reason === "disconnect_timeout"
          ? t("online.matchFinishedDisconnect")
          : response.lifecycle?.reason === "forfeit"
            ? t("online.matchFinishedForfeit")
            : "";
        result.textContent = reason ? `${baseResult} · ${reason}` : baseResult;
      }
    }

    const sessionScore = response?.sessionScore || {};
    const scoreRoot = $("#onlineSessionScore");
    scoreRoot?.classList.toggle("hidden", !response?.roomPresence?.enemy);
    if ($("#onlinePlayerOneScore")) $("#onlinePlayerOneScore").textContent = String(Math.max(0, Number(sessionScore.player || 0)));
    if ($("#onlinePlayerTwoScore")) $("#onlinePlayerTwoScore").textContent = String(Math.max(0, Number(sessionScore.enemy || 0)));
    renderRemoteSessionHistory(response);

    const lobbyReady = response?.lobbyReady || {};
    const opponentPresent = remoteRoomClient?.side === "player"
      ? response?.roomPresence?.enemy !== false
      : response?.roomPresence?.player !== false;
    const ownReady = Boolean(lobbyReady?.[remoteRoomClient?.side]);
    const showInitialReady = waiting && Boolean(response?.roomPresence?.enemy) && opponentPresent;
    const readyRoot = $("#onlineInitialReadyActions");
    readyRoot?.classList.toggle("hidden", !showInitialReady);
    const readyButton = $("#toggleOnlineReadyBtn");
    if (readyButton) {
      readyButton.disabled = !showInitialReady;
      readyButton.textContent = t(ownReady ? "online.cancelReady" : "online.markReady");
      readyButton.classList.toggle("is-ready", ownReady);
    }
    const readyHint = $("#onlineReadyHint");
    if (readyHint) {
      const opponentSide = remoteRoomClient?.side === "player" ? "enemy" : "player";
      readyHint.textContent = lobbyReady?.[opponentSide]
        ? t(ownReady ? "online.bothReadyStarting" : "online.opponentReady")
        : t(ownReady ? "online.waitingOpponentReady" : "online.readyHint");
    }
    const playerOneReady = $("#onlinePlayerOneReady");
    const playerTwoReady = $("#onlinePlayerTwoReady");
    [[playerOneReady, "player"], [playerTwoReady, "enemy"]].forEach(([node, side]) => {
      if (!node) return;
      const visible = waiting && Boolean(response?.roomPresence?.[side]);
      node.classList.toggle("hidden", !visible);
      node.classList.toggle("is-ready", Boolean(lobbyReady?.[side]));
      node.textContent = t(lobbyReady?.[side] ? "online.playerReady" : "online.playerNotReady");
    });

    const proposal = response?.rematch?.proposal || null;
    const pending = proposal?.status === "pending";
    const declined = proposal?.status === "declined";
    $("#onlineRematchHostActions")?.classList.toggle("hidden", ranked || !isHost || !finished || pending || !response?.rematch?.canPropose);
    const pendingRoot = $("#onlineRematchPending");
    pendingRoot?.classList.toggle("hidden", !finished || (!pending && !declined));
    if (pendingRoot && (pending || declined)) {
      const title = $("#onlineRematchPendingTitle");
      const detail = $("#onlineRematchPendingDetail");
      if (declined) {
        if (title) title.textContent = t("online.proposal.declined");
        if (detail) detail.textContent = "";
      } else {
        if (title) title.textContent = t(proposal.mode === "same" ? "online.proposal.same" : "online.proposal.new");
        if (detail) detail.textContent = isHost ? t("online.proposal.waiting") : "";
      }
    }
    $("#onlineRematchGuestActions")?.classList.toggle("hidden", ranked || !finished || isHost || !response?.rematch?.canRespond);
    const sessionManagement = $("#onlineSessionManagement");
    sessionManagement?.classList.toggle("hidden", ranked || !isHost || !opponentPresent || (!finished && !waiting));
    $("#resetOnlineSessionBtn")?.classList.toggle("hidden", !finished);
    const chatInput = $("#onlineLobbyChatInput");
    const chatButton = $("#onlineLobbyChatForm button[type='submit']");
    if (chatInput) chatInput.disabled = !opponentPresent;
    if (chatButton) chatButton.disabled = !opponentPresent;
  }

  async function updateRemoteLobbySettings(payload) {
    if (!remoteRoomClient) return null;
    try {
      const response = await remoteRoomClient.updateSettings(payload);
      lastRemoteRoomState = response;
      renderRemoteLobby(response, { deferBattle: true });
      saveRemoteRoom();
      return response;
    } catch (error) {
      if ($("#onlineFormMessage")) $("#onlineFormMessage").textContent = error.message || t("online.error");
      return null;
    }
  }

  async function manageRemoteSession(action) {
    if (!remoteRoomClient || remoteRoomClient.side !== "player") return null;
    const resetButton = $("#resetOnlineSessionBtn");
    const opponentButton = $("#newOnlineOpponentBtn");
    if (resetButton) resetButton.disabled = true;
    if (opponentButton) opponentButton.disabled = true;
    try {
      const response = await remoteRoomClient.sessionAction(action);
      lastRemoteRoomState = response;
      remoteDuelActive = false;
      remoteBattleSuspendedToMenu = false;
      remoteRenderedSnapshotKey = "";
      remoteMatchStartedAt = null;
      remoteRecordedMatchId = "";
      remoteLastAnnouncedTurnSide = null;
      engine = null;
      renderRemoteLobby(response, { deferBattle: true });
      saveRemoteRoom();
      beginRemotePolling();
      refreshRoomBrowser();
      return response;
    } catch (error) {
      if ($("#onlineFormMessage")) $("#onlineFormMessage").textContent = error.message || t("online.error");
      return null;
    } finally {
      if (lastRemoteRoomState) renderRemoteLobbyControls(lastRemoteRoomState);
    }
  }

  function renderRemoteLobby(response, options = {}) {
    $("#onlineLobbyActions")?.classList.toggle("hidden", Boolean(response));
    $("#onlineLobbyStatus")?.classList.toggle("hidden", !response);
    if (!response) {
      renderRecoverableMatch();
      setMultiplayerControlsDisabled(false);
      return;
    }
    applyRemoteLifecycle(response);
    renderRemoteMessages(response);
    renderRemoteLobbyControls(response);
    if ($("#onlineRoomCodeLabel")) $("#onlineRoomCodeLabel").textContent = response.code || remoteRoomClient?.code || "";
    if ($("#onlineConnectionMessage")) {
      const opponentPresent = remoteRoomClient?.side === "player"
        ? response?.roomPresence?.enemy !== false
        : response?.roomPresence?.player !== false;
      const waitingWithOpponent = response.lifecycle?.status === "waiting"
        && Boolean(response?.roomPresence?.enemy);
      $("#onlineConnectionMessage").textContent = !opponentPresent && response.playerNames?.enemy
        ? t("online.opponentLeftRoom")
        : response.lifecycle?.status === "finished"
          ? t("online.matchFinished")
          : t(response.ready ? "online.ready" : waitingWithOpponent ? "online.readyPrompt" : "online.waiting");
    }
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
      Number(response.matchNumber || 1),
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
    if (response?.lifecycle?.status === "finished") {
      applyRemoteLifecycle(response);
      hideRemoteBattleToMultiplayer(response);
      return false;
    }
    if (!response?.state) {
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
    $("#duelQuickChat")?.classList.remove("hidden");
    renderRemoteTurnTimer(response);
    renderRemoteConnectionQuality();
    syncBackgroundMusicScene();
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
      await sleep(100);
      return true;
    }

    if (type === A.MULTIPLAYER_COMMANDS.ATTACK_NEXT && result?.ok && !result.done && !result.skipped) {
      const healingShown = showHealingChanges(before, result);
      const triggeredDamageEvents = (result.events || []).filter(event =>
        ["astralHeroDamage", "astralCreatureDamage", "heroDamage", "creatureDamage"].includes(event.type)
        && event.sourceKind === "effect"
      );
      if (triggeredDamageEvents.length) showResolvedEffectDamage({ events: triggeredDamageEvents });
      if (healingShown > 0 || triggeredDamageEvents.length > 0) await sleep(460);
      const hasAttackDamage = Number(result.event?.damage || 0) > 0;
      if (hasAttackDamage) {
        await animateAttack(result.event);
        showDamage(result.event);
      }
      showCollateralDamage(result.events);
      showResolutionDeaths(result);
      if (hasAttackDamage || triggeredDamageEvents.length > 0) await sleep(520);
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
      await sleep(260);
      return true;
    }

    if (type === A.MULTIPLAYER_COMMANDS.FINISH_ATTACK && result?.ok) {
      const healingShown = showHealingChanges(before, result);
      const powerShown = showPowerGrowthFeedback(result, before);
      const attackShown = showUnitAttackChanges(before);
      if (healingShown + powerShown + attackShown > 0) await sleep(520);
      renderGame();
      recordPowerGrowth(result);
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
      const previousMatchNumber = Number(lastRemoteRoomState?.matchNumber || 0);
      let state = await remoteRoomClient.reconnect();
      if (state.stale) return;
      const newMatchStarted = Boolean(
        state.lifecycle?.status === "active"
        && Number(state.matchNumber || 0) > previousMatchNumber
        && previousMatchNumber > 0
      );
      if (newMatchStarted) {
        remoteBattleSuspendedToMenu = false;
        remoteDuelActive = false;
        remoteRenderedSnapshotKey = "";
        remoteMatchStartedAt = Date.now();
        currentTurnDamage = 0;
        presentationLog = [];
      }
      noteRemoteTransportSuccess();
      applyRemoteLifecycle(state);
      renderRemoteMessages(state);
      const animateMissedActions = Boolean(
        ["active", "finished"].includes(state.lifecycle?.status)
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
      } else if (state.lifecycle?.status === "finished" && remoteDuelActive) {
        hideRemoteBattleToMultiplayer(state);
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
        remoteDuelActive = false;
        remoteTransportIssueSince = null;
        remoteDisconnectObservedAt = null;
        $("#onlineConnectionQuality")?.classList.add("hidden");
        saveRemoteRoom();
        renderRemoteLobby(null);
        setMultiplayerServerState("online");
        if ($("#onlineFormMessage")) $("#onlineFormMessage").textContent = error.message || t("online.error");
        return;
      }
      if (error?.network) noteRemoteTransportFailure();
      else setMultiplayerServerState("offline");
    }
    finally { remoteRefreshBusy = false; }
  }

  function beginRemotePolling() {
    clearInterval(remoteRoomPoll);
    clearInterval(remoteHeartbeatTimer);
    clearInterval(remoteTurnTimerTicker);
    remoteRoomPoll = setInterval(refreshRemoteRoom, 1200);
    remoteHeartbeatTimer = setInterval(heartbeatRemoteRoom, 5000);
    remoteTurnTimerTicker = setInterval(() => {
      renderRemoteTurnTimer(lastRemoteRoomState);
      renderRemoteConnectionQuality();
      if (lastRemoteRoomState?.lifecycle?.status === "disconnected") applyRemoteLifecycle(lastRemoteRoomState);
    }, 250);
    heartbeatRemoteRoom();
    renderRemoteTurnTimer(lastRemoteRoomState);
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
    name = RESTORABLE_VIEWS.has(name) ? name : "game";
    if (name !== "uiLab") A.ForgeUiLab?.suspendMotion?.();
    document.querySelectorAll(".view").forEach(view => view.classList.remove("active"));
    $(`#${name}View`)?.classList.add("active");
    navigation?.setActive(name);
    rememberView(name);
    if (name === "multiplayer") {
      renderMultiplayerEntryMode();
      checkMultiplayerServer().then(online => {
        if (!online) return;
        refreshRoomBrowser();
        initializeOnlineAccount().then(() => refreshRankedLeaderboard()).catch(() => {});
      });
      beginRoomBrowserPolling();
    } else {
      clearInterval(roomBrowserPoll);
      roomBrowserPoll = null;
    }
    if (name === "tournament") renderTournament();
    if (name === "cards") A.SigianArchiveBrowser?.render?.($("#cardsContent"), "collection");
    if (name === "inventory") A.SigianArchiveBrowser?.render?.($("#inventoryContent"), "inventory");
    if (name === "forge") renderForgePage();
    if (name === "uiLab") {
      A.ForgeUiLab?.resetSession?.();
      A.ForgeUiLab?.render?.($("#forgeUiLabContent"));
      const backButton = $("#forgeLabBackBtn");
      if (backButton) backButton.onclick = () => switchView("forge");
    }
    if (name === "profile") {
      renderPlayerProfile();
      initializeOnlineAccount({ renderProfile: true }).catch(() => {});
    }
    if (name === "rules") renderRuleset();
    syncBackgroundMusicScene();
  }

  navigation = A.UINavigation?.create({ onViewChange: switchView, onReturnToGame: () => { if (!engine) restartDuel(); } });
  window.addEventListener("sigian:forge-draft-updated", () => {
    forgeSession = null;
  });

  window.addEventListener("sigian:archive-scope-request", event => {
    const scope = event.detail?.scope === "inventory" ? "inventory" : "collection";
    switchView(scope === "inventory" ? "inventory" : "cards");
  });

  window.addEventListener("sigian:inventory-forge-request", event => {
    const cardId = String(event.detail?.cardId || "");
    const formula = A.getSigianInventoryFormula?.(cardId);
    if (!formula) return;
    const catalog = A.buildSigianBaseRecipeCatalog?.(allAstralCards());
    const recipe = catalog?.byId?.[cardId];
    if (!recipe) return;
    forgeInventoryPreviewCardId = cardId;
    forgeSelectedSigilSlotId = null;
    forgeSession = A.createSigianForgeSession?.({ draft:{ recipe } }) || null;
    switchView("forge");
  });

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
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + Math.min(0.02, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    if (options.type === "noise") {
      const frameCount = Math.max(1, Math.ceil(ctx.sampleRate * duration));
      const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
      const channel = buffer.getChannelData(0);
      for (let index = 0; index < frameCount; index += 1) channel[index] = Math.random() * 2 - 1;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = options.filterType || "bandpass";
      const initialFrequency = Math.max(40, Number(options.filterFrequency || 1200));
      const finalFrequency = Math.max(40, Number(options.filterEndFrequency || initialFrequency));
      filter.frequency.setValueAtTime(initialFrequency, now);
      if (finalFrequency !== initialFrequency) {
        filter.frequency.exponentialRampToValueAtTime(finalFrequency, now + duration * 0.82);
      }
      filter.Q.setValueAtTime(Math.max(0.1, Number(options.filterQ || 0.8)), now);
      source.connect(filter).connect(gain).connect(ctx.destination);
      source.start(now);
      source.stop(now + duration + 0.01);
      return true;
    }

    const osc = ctx.createOscillator();
    osc.type = options.type || "sine";
    osc.frequency.setValueAtTime(options.frequency || 440, now);
    if (options.secondFrequency) {
      osc.frequency.exponentialRampToValueAtTime(options.secondFrequency, now + duration * 0.65);
    }
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.01);
    return true;
  }

  function battleCryProfile(card) {
    return cardFxProfile(card)?.battleCry || null;
  }

  function localizedBattleCry(card) {
    const profile = battleCryProfile(card);
    return profile?.textKey ? t(profile.textKey) : "";
  }

  function speakBattleCry(card) {
    const profile = battleCryProfile(card);
    const line = localizedBattleCry(card);
    if (!profile || !line || !soundEnabled || UI_MODE === "essential" || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return false;
    try {
      const language = A.i18n?.getLanguage?.() === "en" ? "en-US" : "it-IT";
      const utterance = new SpeechSynthesisUtterance(line);
      utterance.lang = language;
      utterance.volume = 0.72;
      utterance.rate = Math.max(0.65, Math.min(1.2, Number(profile.rate || 0.92)));
      utterance.pitch = Math.max(0.45, Math.min(1.4, Number(profile.pitch || 0.9)));
      const voices = window.speechSynthesis.getVoices?.() || [];
      const matchingVoice = voices.find(voice => String(voice.lang || "").toLowerCase().startsWith(language.slice(0,2).toLowerCase()));
      if (matchingVoice) utterance.voice = matchingVoice;
      window.speechSynthesis.speak(utterance);
      return true;
    } catch (error) {
      return false;
    }
  }

  function showBattleCry(card, side, slot = null) {
    const profile = battleCryProfile(card);
    if (!profile || card?.type !== "creature") return false;
    (profile.sfx || []).forEach(cue => playSyntheticCue(cue));

    const target = Number.isInteger(slot) ? $`#${side}Board [data-slot="${slot}"]` : null;
    target?.classList.add("battle-cry-pulse");
    setTimeout(() => target?.classList.remove("battle-cry-pulse"), fxDuration(900) || 40);

    const line = localizedBattleCry(card);
    if (line) {
      const layer = $("#duelFxLayer");
      const point = spellElementCenter(target || spellHeroAnchor(side));
      if (layer && point) {
        const bubble = document.createElement("div");
        bubble.className = `battle-cry-bubble side-${side}`;
        bubble.style.left = `${point.x}px`;
        bubble.style.top = `${Math.max(42, point.y - point.height * 0.38)}px`;
        bubble.textContent = line;
        layer.appendChild(bubble);
        setTimeout(() => bubble.remove(), fxDuration(1800) || 40);
      }
    }
    speakBattleCry(card);
    return true;
  }

  function playCardFxSound(card, phase = "cast") {
    const cues = cardFxProfile(card)?.sfx?.[phase];
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
      const release = () => activeOriginalSounds.delete(sound);
      sound.addEventListener("ended", release, { once: true });
      sound.addEventListener("error", release, { once: true });
      activeOriginalSounds.add(sound);
      const playPromise = sound.play();
      playPromise?.catch(() => {
        try { sound.pause(); } catch (e) {}
        release();
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

  function attackSound({ direct = false, multiTarget = false } = {}) {
    if (!soundEnabled || UI_MODE === "essential") return;
    // Layered physical strike: short air slash, body impact and a restrained low hit.
    // This replaces the old generic card-move samples for every creature attack.
    playSyntheticCue({
      type: "noise",
      filterType: "bandpass",
      filterFrequency: multiTarget ? 3200 : 2700,
      filterEndFrequency: 760,
      filterQ: 0.72,
      duration: multiTarget ? 0.24 : 0.19,
      volume: multiTarget ? 0.038 : 0.032
    });
    playSyntheticCue({
      type: "triangle",
      frequency: direct ? 390 : 520,
      secondFrequency: direct ? 82 : 108,
      duration: 0.22,
      volume: direct ? 0.052 : 0.046,
      delay: 0.16
    });
    playSyntheticCue({
      type: "noise",
      filterType: "lowpass",
      filterFrequency: direct ? 720 : 980,
      filterEndFrequency: 150,
      duration: direct ? 0.25 : 0.20,
      volume: direct ? 0.038 : 0.030,
      delay: 0.20
    });
    if (multiTarget) {
      playSyntheticCue({
        type: "noise",
        filterType: "highpass",
        filterFrequency: 2200,
        filterEndFrequency: 4200,
        duration: 0.18,
        volume: 0.018,
        delay: 0.075
      });
    }
  }
  function spellSound(card = null) {
    if (playCardFxSound(card, "cast")) return;
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
    if (choice === "random") return t("menu.randomSpecialization");
    const spec = A.getAstralSpecialization?.(choice);
    return spec ? t(`specialization.${spec.id}`) : t("menu.randomSpecialization");
  }

  function arcaneWizardIconMarkup(className = "school-icon-svg specialization-school-icon") {
    return `<svg class="${className} specialization-wizard-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"></path>
      <path d="M5 3v4M3 5h4M19 17v4M17 19h4"></path>
    </svg>`;
  }

  function specializationIconMarkup(choice, className = "school-icon-svg specialization-school-icon") {
    if (choice === "random") return '<span class="specialization-random-icon" aria-hidden="true">🎲</span>';
    const spec = A.getAstralSpecialization?.(choice);
    if (spec?.id === "wizard") return arcaneWizardIconMarkup(className);
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
    icon.classList.toggle("is-wizard", choice === "wizard");
    icon.innerHTML = specializationIconMarkup(choice);
  }

  function populateSpecializationSelect(select, fallback = "random") {
    if (!select) return;
    const current = select.value;
    select.innerHTML = [
      `<option value="random">${t("menu.randomSpecialization")}</option>`,
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
    populateSpecializationSelect($("#onlineLobbyHostSpecializationSelect"), "random");
    populateSpecializationSelect($("#onlineLobbyGuestSpecializationSelect"), "random");
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
    warmVisibleDuelArt();
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
    syncBackgroundMusicScene();
    if (multiplayerUpdateRequested) requestLatestAppVersion();
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
    if (online) {
      stopRemoteTimers();
      await remoteRoomClient?.forfeit().catch(() => {});
      await remoteRoomClient?.leave().catch(() => {});
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
    onNewDuel: () => {
      if (!currentDuelLaunch || busy || remoteDuelActive || tournamentMatch) return;
      const launch = currentDuelLaunch;
      startDuel(
        launch.playerTalent,
        false,
        launch.selectedSpecialization,
        launch.requestedMode,
        createDuelSeed(),
        launch.enemySpecializationChoice
      );
    },
    onOptions: syncDuelPauseOptions,
    onAbandonDuel: abandonCurrentDuel,
    onAbandonTournamentMatch: abandonTournamentEncounter
  });
  $("#duelMenuBtn")?.addEventListener("click", () => pauseMenu?.toggle({ tournamentMode: tournamentMatch, onlineMode: remoteDuelActive, subtitle: pauseSubtitle() }));

  function fxDuration(ms) {
    return presentationDuration(ms);
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

  function createAttackTrail(attacker, target, side, options = {}) {
    if (!attacker || !target) return null;
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
    trail.className = `attack-trail side-${side}${options.multiTarget ? " multi-target" : ""}`;
    trail.style.setProperty("--trail-delay", `${Math.max(0, Number(options.index || 0)) * 28}ms`);
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

  function spellPowerAnchor(side, schoolId) {
    const root = side === "player" ? $("#schoolFilters") : $("#enemySchoolMenu");
    return root?.querySelector(`[data-school-id="${schoolId}"]`) || null;
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
    if (!element) return null;
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

  function addScorchingOrb(fromElement, toElement, index = 0) {
    const layer = $("#duelFxLayer");
    const from = spellElementCenter(fromElement);
    const to = spellElementCenter(toElement);
    if (!layer || !from || !to) return null;
    const orb = document.createElement("div");
    orb.className = "spell-scorching-orb";
    orb.style.left = `${from.x}px`;
    orb.style.top = `${from.y}px`;
    orb.style.setProperty("--spell-dx", `${to.x - from.x}px`);
    orb.style.setProperty("--spell-dy", `${to.y - from.y}px`);
    orb.style.setProperty("--spell-index", String(index));
    layer.appendChild(orb);
    setTimeout(() => orb.remove(), fxDuration(900) || 40);
    return orb;
  }

  function addIceBolt(fromElement, toElement) {
    const layer = $("#duelFxLayer");
    const from = spellElementCenter(fromElement);
    const to = spellElementCenter(toElement);
    if (!layer || !from || !to) return null;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const bolt = document.createElement("div");
    bolt.className = "spell-ice-bolt";
    bolt.style.left = `${from.x}px`;
    bolt.style.top = `${from.y}px`;
    bolt.style.setProperty("--spell-dx", `${dx}px`);
    bolt.style.setProperty("--spell-dy", `${dy}px`);
    bolt.style.setProperty("--spell-angle", `${Math.atan2(dy, dx)}rad`);
    layer.appendChild(bolt);
    setTimeout(() => bolt.remove(), fxDuration(880) || 40);
    return bolt;
  }

  function addDrainMote(fromElement, toElement, index = 0) {
    const layer = $("#duelFxLayer");
    const from = spellElementCenter(fromElement);
    const to = spellElementCenter(toElement);
    if (!layer || !from || !to) return null;
    const spreadX = [-18, 10, -8, 20, 4, -14, 14][index % 7];
    const spreadY = [-12, 14, 5, -5, 17, -17, 0][index % 7];
    const mote = document.createElement("div");
    mote.className = "spell-drain-mote";
    mote.style.left = `${from.x + spreadX}px`;
    mote.style.top = `${from.y + spreadY}px`;
    mote.style.setProperty("--spell-dx", `${to.x - from.x - spreadX}px`);
    mote.style.setProperty("--spell-dy", `${to.y - from.y - spreadY}px`);
    mote.style.setProperty("--spell-index", String(index));
    layer.appendChild(mote);
    setTimeout(() => mote.remove(), fxDuration(1300) || 40);
    return mote;
  }

  function addSoulWisp(fromElement, toElement, index = 0) {
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

  function showCardResolutionIdentityFx(result) {
    const profile = cardFxProfile(result?.card);
    if (!profile) return false;
    playCardFxSound(result.card, "impact");
    if (!profile.vfx) return false;

    const events = result?.events || [];
    const side = spellActorSide(result);
    const enemySide = side === "player" ? "enemy" : "player";
    const ownHero = spellHeroAnchor(side);
    const enemyHero = spellHeroAnchor(enemySide);
    const ownBoard = $`#${side}Board` || ownHero;
    const battlePanel = $("#battlePanel");
    let shown = false;

    const damageTargets = events
      .filter(event => ["astralCreatureDamage", "creatureDamage"].includes(event.type))
      .map(event => $`#${event.targetSide || event.side}Board [data-slot="${event.slot}"]`)
      .filter(Boolean);
    const uniqueDamageTargets = [...new Set(damageTargets)];
    const enemyHeroDamaged = events.some(event =>
      ["astralHeroDamage", "heroDamage"].includes(event.type)
      && (event.targetSide || event.side || enemySide) === enemySide
    );

    if (profile.vfx === "scorching-orbs") {
      uniqueDamageTargets.forEach((target, index) => {
        if (addScorchingOrb(ownBoard, target, index)) shown = true;
        addSpellMarker(target, "spell-scorching-impact-marker", 820, index);
      });
    } else if (profile.vfx === "rising-flames") {
      uniqueDamageTargets.forEach((target, index) => {
        if (addSpellMarker(target, "spell-rising-flames-marker", 920, index)) shown = true;
      });
      if (enemyHeroDamaged && addSpellMarker(enemyHero, "spell-rising-flames-marker spell-rising-flames-hero", 920, uniqueDamageTargets.length)) shown = true;
    } else if (profile.vfx === "fire-ritual") {
      if (addSpellMarker(spellPowerAnchor(side, "fire"), "spell-fire-ritual-marker", 1150)) shown = true;
      if (addSpellMarker(spellPowerAnchor(enemySide, "water"), "spell-fire-ritual-drain-marker", 1050, 1)) shown = true;
    } else if (profile.vfx === "armageddon") {
      if (addSpellMarker(battlePanel, "spell-armageddon-overlay", 1250)) shown = true;
      uniqueDamageTargets.forEach((target, index) => addSpellMarker(target, "spell-armageddon-impact-marker", 1040, index));
      if (enemyHeroDamaged) addSpellMarker(enemyHero, "spell-armageddon-impact-marker spell-armageddon-hero", 1080, uniqueDamageTargets.length);
    } else if (profile.vfx === "cure") {
      if (addSpellMarker(ownHero, "spell-cure-marker", 1050)) shown = true;
    } else if (profile.vfx === "justice") {
      uniqueDamageTargets.forEach((target, index) => {
        if (addSpellMarker(target, "spell-justice-marker", 980, index)) shown = true;
      });
    } else if (profile.vfx === "ice-bolt") {
      if (addIceBolt(ownBoard, enemyHero)) shown = true;
      addSpellMarker(enemyHero, "spell-ice-impact-marker", 880);
    } else if (profile.vfx === "acid-rain") {
      if (addSpellMarker(battlePanel, "spell-acid-rain-overlay", 1180)) shown = true;
      uniqueDamageTargets.forEach((target, index) => addSpellMarker(target, "spell-acid-burn-marker", 980, index));
      A.SCHOOLS.forEach((school, index) => addSpellMarker(spellPowerAnchor(enemySide, school.id), "spell-acid-power-marker", 1000, index));
    } else if (profile.vfx === "hypnosis") {
      const ranked = [...(engine?.state?.[enemySide]?.board || [])]
        .map((unit, slot) => ({ unit, slot, attack: unit ? displayedUnitAttack(enemySide, unit) : -1 }))
        .filter(entry => entry.unit && entry.unit.currentHealth > 0)
        .sort((a, b) => b.attack - a.attack || a.slot - b.slot)
        .slice(0, 2);
      ranked.forEach((entry, index) => {
        const target = $`#${enemySide}Board [data-slot="${entry.slot}"]`;
        if (addSpellMarker(target, "spell-hypnosis-marker", 1120, index)) shown = true;
        if (target && enemyHero) addSpellLine(target, enemyHero, "spell-hypnosis-line", 900);
      });
      addSpellMarker(enemyHero, "spell-hypnosis-hero-marker", 960);
    } else if (profile.vfx === "lightning") {
      const targetPoint = spellElementCenter(enemyHero);
      if (targetPoint) {
        const origin = { x: targetPoint.x + Math.min(90, window.innerWidth * 0.08), y: Math.max(18, targetPoint.y - 190) };
        if (addSpellLine(origin, targetPoint, "spell-lightning-line", 720)) shown = true;
        addSpellMarker(enemyHero, "spell-lightning-marker", 760);
      }
    } else if (profile.vfx === "chain-lightning") {
      const targets = [...uniqueDamageTargets];
      if (enemyHeroDamaged && enemyHero) targets.push(enemyHero);
      let previous = ownBoard;
      targets.forEach((target, index) => {
        if (previous && target && addSpellLine(previous, target, "spell-chain-lightning-line", 860 + index * 45)) shown = true;
        addSpellMarker(target, "spell-chain-lightning-marker", 820, index);
        previous = target;
      });
    } else if (profile.vfx === "tornado") {
      const death = events.find(event => event.type === "astralDeath" && (event.side === enemySide || !event.side));
      const target = death ? $`#${death.side || enemySide}Board [data-slot="${death.slot}"]` : uniqueDamageTargets[0];
      if (addSpellMarker(target, "spell-tornado-marker", 1150)) shown = true;
    } else if (profile.vfx === "nature-ritual") {
      if (addSpellMarker(ownHero, "spell-nature-ritual-marker spell-nature-ritual-hero", 1180)) shown = true;
      [...(ownBoard?.querySelectorAll?.(".unit") || [])].forEach((target, index) => addSpellMarker(target, "spell-nature-ritual-marker", 1080, index));
    } else if (profile.vfx === "rejuvenation") {
      if (addSpellMarker(ownHero, "spell-rejuvenation-marker", 1220)) shown = true;
    } else if (profile.vfx === "stone-rain") {
      if (addSpellMarker(battlePanel, "spell-stone-rain-overlay", 1150)) shown = true;
      uniqueDamageTargets.forEach((target, index) => addSpellMarker(target, "spell-stone-impact-marker", 980, index));
    } else if (profile.vfx === "curse") {
      if (addSpellMarker(enemyHero, "spell-curse-marker", 1120)) shown = true;
      A.SCHOOLS.forEach((school, index) => addSpellMarker(spellPowerAnchor(enemySide, school.id), "spell-curse-power-marker", 1050, index));
    } else if (profile.vfx === "drain-life") {
      for (let index = 0; index < 7; index += 1) {
        if (addDrainMote(enemyHero, ownHero, index)) shown = true;
      }
      addSpellMarker(enemyHero, "spell-drain-source-marker", 1000);
      addSpellMarker(ownHero, "spell-drain-target-marker", 1180);
    } else if (profile.vfx === "drain-souls") {
      const deaths = events.filter(event => event.type === "astralDeath");
      deaths.forEach((event, index) => {
        const target = $`#${event.side}Board [data-slot="${event.slot}"]`;
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
    syncSigianCombatPresentation(cell, card);
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
    if (layer) {
      const cast = document.createElement("div");
      const identityFx = card.type === "spell" ? spellFxProfile(card) : null;
      cast.className = `cast-card cast-splash school-${card.school} ${card.type === "spell" ? "spell-cast" : "creature-cast"} side-${side}${identityFx ? ` spell-identity-${identityFx.vfx}` : ""}`;
      const art = document.createElement("div");
      art.className = "cast-card-art cast-splash-art";
      art.appendChild(buildArtBlock(card, "cast"));
      const chrome = document.createElement("div");
      chrome.className = "cast-splash-chrome";
      const schoolBadge = document.createElement("span");
      schoolBadge.className = "cast-splash-school";
      schoolBadge.innerHTML = schoolIconMarkup(card.school, "school-icon-svg cast-splash-school-icon");
      const copy = document.createElement("div");
      copy.className = "cast-splash-copy";
      const label = document.createElement("strong");
      label.className = "cast-splash-name";
      label.textContent = cardName(card);
      const kind = document.createElement("small");
      kind.className = "cast-splash-kind";
      kind.textContent = t(card.type === "spell" ? "ui.spell" : "ui.creature");
      copy.appendChild(label);
      copy.appendChild(kind);
      chrome.appendChild(schoolBadge);
      chrome.appendChild(copy);
      cast.appendChild(art);
      cast.appendChild(chrome);
      decorateSigianSpellCast(cast, card);
      layer.appendChild(cast);
      requestAnimationFrame(() => cast.classList.add("active"));
      if (card.type === "creature" && battleCryProfile(card)) {
        setTimeout(() => showBattleCry(card, side, slot), fxDuration(160) || 0);
      }
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
    await sleep(860);
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

  function multiTargetAttackIconMarkup() {
    return `<svg class="multi-target-attack-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path class="multi-target-stem" d="M12 20V8"></path>
      <path d="m8.8 10.7 3.2-3.8 3.2 3.8"></path>
      <path d="M12 15 5.8 9.1"></path>
      <path d="m5.8 9.1 4.1.2"></path>
      <path d="m5.8 9.1.4 4"></path>
      <path d="M12 15 18.2 9.1"></path>
      <path d="m18.2 9.1-4.1.2"></path>
      <path d="m18.2 9.1-.4 4"></path>
      <circle cx="12" cy="20" r="1.4"></circle>
    </svg>`;
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

    syncBoardUnitBadge(cell, "multi-target-badge", isMultiTargetAttacker, t("ability.multiAttack"), t("ability.multiAttackDescription"), multiTargetAttackIconMarkup());
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
    syncSigianCombatPresentation(cell, unit);
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

  const cardArtPreloadCache = new Map();

  function remasteredCardImage(card) {
    const id = card?.id || "";
    if (!id || cardArtStyle !== "new") return "";
    if (!["fire", "water", "air", "earth", "nature", "death"].includes(card.school)) return "";
    return `assets/cards/remastered/${id}.png`;
  }

  function originalCardImage(card) {
    return card?.id ? `assets/cards/original/${card.id}.png` : "";
  }

  function getCardImageCandidates(card) {
    const id = card?.id || "";
    if (!id) return [];
    return [
      remasteredCardImage(card),
      originalCardImage(card),
      window.ArcaneCardArt?.[id],
      `assets/cards/${id}.webp`,
      `assets/cards/${id}.png`,
      `assets/cards/${id}.svg`,
      `../shared/assets/cards/${id}.webp`,
      `../shared/assets/cards/${id}.svg`,
      `../shared/assets/cards/${id}.png`
    ].filter(Boolean);
  }

  function preloadCardArt(card) {
    const src = remasteredCardImage(card);
    if (!src) return Promise.resolve("");
    if (cardArtPreloadCache.has(src)) return cardArtPreloadCache.get(src);
    const promise = new Promise(resolve => {
      const preload = new Image();
      preload.decoding = "async";
      preload.onload = async () => {
        try { await preload.decode?.(); } catch (e) {}
        resolve(src);
      };
      preload.onerror = () => resolve("");
      preload.src = src;
    });
    cardArtPreloadCache.set(src, promise);
    return promise;
  }

  function warmVisibleDuelArt() {
    if (!engine) return;
    const cards = [
      ...(engine.state.player?.hand || []),
      ...(engine.state.player?.board || []).filter(Boolean),
      ...(engine.state.enemy?.board || []).filter(Boolean)
    ];
    const unique = [...new Map(cards.filter(Boolean).map(card => [card.id, card])).values()];
    unique.slice(0, 14).forEach(card => { preloadCardArt(card); });
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
    fallback.innerHTML = card.__forgePreview
      ? `<span class="forge-art-placeholder-sigil">${schoolIconMarkup(card.school, "school-icon-svg art-fallback-school-icon")}</span><small>${escapeHtml(t("forge.artPlaceholder"))}</small>`
      : `<span>${card.art ? escapeHtml(card.art) : schoolIconMarkup(card.school, "school-icon-svg art-fallback-school-icon")}</span><small>${card.type === "spell" ? "MAGIA" : "CREATURA"}</small>`;

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

    const originalSrc = originalCardImage(card);
    const candidates = getCardImageCandidates(card).filter(src => src !== remasteredCardImage(card) && src !== originalSrc);
    let fallbackIndex = 0;

    const markLoaded = () => {
      wrapper.classList.add("has-image");
      wrapper.classList.remove("art-error");
      status.textContent = "";
    };
    const loadFallbackCandidate = () => {
      if (fallbackIndex >= candidates.length) {
        if (card.__forgePreview) {
          wrapper.classList.remove("art-error");
          wrapper.classList.add("art-placeholder");
          status.textContent = "";
        } else {
          wrapper.classList.add("art-error");
          status.textContent = "Errore caricamento immagine";
        }
        return;
      }
      img.onload = markLoaded;
      img.onerror = loadFallbackCandidate;
      img.src = candidates[fallbackIndex++];
    };

    if (originalSrc) {
      img.onload = markLoaded;
      img.onerror = loadFallbackCandidate;
      img.src = originalSrc;
    } else {
      loadFallbackCandidate();
    }

    preloadCardArt(card).then(highRes => {
      if (!highRes || !img.isConnected || cardArtStyle !== "new") return;
      img.onload = markLoaded;
      img.onerror = () => {};
      img.src = highRes;
    });
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

  function printedCardAttack(card) {
    if (!card || card.type === "spell") return 0;
    const printedCard = allAstralCards().find(item => item.id === card.id);
    const value = printedCard?.attack ?? card.attack ?? 0;
    return Math.max(0, Math.trunc(Number(value) || 0));
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

  function groupedPowerGrowthSources(growthEvent) {
    const groups = new Map();
    (growthEvent?.sources || []).forEach(source => {
      const amount = Number(source?.amount || 0);
      if (!amount || !source?.sourceCardId || !source?.school) return;
      const key = `${source.sourceSide || ""}|${source.sourceCardId}|${source.targetSide || growthEvent.side || ""}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          sourceSide: source.sourceSide,
          sourceCardId: source.sourceCardId,
          targetSide: source.targetSide || growthEvent.side,
          schools: {}
        };
        groups.set(key, group);
      }
      group.schools[source.school] = Number(group.schools[source.school] || 0) + amount;
    });
    return [...groups.values()];
  }

  function recordPowerGrowth(result) {
    const events = result?.events || [];
    const growth = events.find(event => event.type === "astralPowerGrowth");
    if (!growth) return;

    const baseGain = Number(growth.baseGain || 0);
    if (baseGain) {
      pushPresentationLog("log.powerGrowthBase", {
        targetSide: growth.side,
        amount: Math.abs(baseGain)
      });
    }

    groupedPowerGrowthSources(growth).forEach(group => {
      const nonZero = A.SCHOOLS
        .map(school => ({ schoolId: school.id, amount: Number(group.schools[school.id] || 0) }))
        .filter(item => item.amount !== 0);
      const allSame = nonZero.length === A.SCHOOLS.length
        && new Set(nonZero.map(item => item.amount)).size === 1;
      if (allSame) {
        const amount = nonZero[0].amount;
        pushPresentationLog(amount > 0 ? "log.powerGrowthSourceAllGain" : "log.powerGrowthSourceAllLoss", {
          sourceCardId: group.sourceCardId,
          amount: Math.abs(amount)
        });
        return;
      }
      nonZero.forEach(item => {
        pushPresentationLog(item.amount > 0 ? "log.powerGrowthSourceGain" : "log.powerGrowthSourceLoss", {
          sourceCardId: group.sourceCardId,
          schoolId: item.schoolId,
          amount: Math.abs(item.amount)
        });
      });
    });

    events.filter(event => event.type === "astralHealHero").forEach(event => {
      pushPresentationLog("log.healHero", {
        sourceName: event.reason === "healing_aura" ? t("effect.healingAura") : event.reason,
        targetSide: event.side,
        amount: event.amount
      });
    });
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
      if (["astralHeroDamage", "heroDamage"].includes(event.type)) {
        const amount = Number(event.amount ?? event.damage ?? 0);
        const gross = Number(event.modifiedAmount ?? amount);
        const resolved = Number(event.resolvedAmount ?? amount);
        const vars = {
          sourceCardId: result.card.id,
          sourceName: result.card.name,
          targetSide: event.targetSide || event.side,
          amount,
          gross
        };
        pushPresentationLog(gross > resolved ? "log.damageHeroReduced" : "log.damageHero", vars);
      } else if (["astralCreatureDamage", "creatureDamage"].includes(event.type)) {
        if (event.reason === "astral_nets") return;
        pushPresentationLog("log.damageCreature", {
          sourceCardId: result.card.id,
          sourceName: result.card.name,
          targetCardId: event.targetId,
          targetName: event.targetId,
          amount: Number(event.amount ?? event.damage ?? 0)
        });
      } else if (["astralHealHero", "heroHeal"].includes(event.type)) {
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
      if (["astralHeroDamage", "heroDamage"].includes(event.type) && event.sourceKind === "effect") {
        pushPresentationLog("log.damageHero", {
          sourceCardId: event.sourceId || event.reason,
          sourceName: event.sourceName || event.reason,
          targetSide: event.targetSide || event.side,
          amount: Number(event.amount ?? event.damage ?? 0)
        });
      } else if (["astralCreatureDamage", "creatureDamage"].includes(event.type) && event.sourceKind === "effect" && event.reason !== "astral_nets") {
        pushPresentationLog("log.damageCreature", {
          sourceCardId: event.sourceId || event.reason,
          sourceName: event.sourceName || event.reason,
          targetCardId: event.targetId,
          targetName: event.targetId,
          amount: Number(event.amount ?? event.damage ?? 0)
        });
      } else if (event.type === "astralVampireHeal") {
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

  function sigianRecipeForUi(card) {
    if (!card?.id) return null;
    if (card.formulaRecipe && typeof A.createFormulaRecipe === "function") {
      try {
        const recipe = A.createFormulaRecipe(card.formulaRecipe);
        return A.validateFormulaRecipe?.(recipe)?.valid ? recipe : null;
      } catch (error) {}
    }
    if (typeof A.buildSigianBaseRecipeCatalog === "function") {
      try {
        return A.buildSigianBaseRecipeCatalog([card])?.byId?.[card.id] || null;
      } catch (error) {}
    }
    return null;
  }

  function sigianEffectIconMarkup(effect, className = "") {
    const common = '<circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="32" cy="32" r="19" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".42"/>';
    const path = ({
      [A.SIGIAN_EFFECTS?.DAMAGE]: '<path d="M36 11 21 34h10l-4 19 17-27H34l2-15Z" fill="currentColor"/>',
      [A.SIGIAN_EFFECTS?.HEAL]: '<path d="M28 17h8v11h11v8H36v11h-8V36H17v-8h11Z" fill="currentColor"/>',
      [A.SIGIAN_EFFECTS?.POWER]: '<path d="m32 12 7 12 13 8-13 8-7 12-7-12-13-8 13-8Z" fill="currentColor"/>',
      [A.SIGIAN_EFFECTS?.POWER_ALL]: '<path d="m32 11 5 10 11-3-3 11 9 6-11 4 1 12-12-6-12 6 1-12-11-4 9-6-3-11 11 3Z" fill="currentColor"/>',
      [A.SIGIAN_EFFECTS?.POWER_GROWTH]: '<path d="m18 39 14-17 14 17h-9v10H27V39Z" fill="currentColor"/>',
      [A.SIGIAN_EFFECTS?.FORCE_ATTACK]: '<path d="M12 32s7-12 20-12 20 12 20 12-7 12-20 12S12 32 12 32Zm20-7a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z" fill="currentColor"/>',
      [A.SIGIAN_EFFECTS?.RESURRECT]: '<path d="M31 45c-8-5-11-12-7-19 2 5 5 6 7 2 2-4 1-8 0-12 8 5 13 12 10 20-1 4-5 8-10 9Z" fill="currentColor"/><path d="M45 20a19 19 0 0 1 3 19M48 39l-6-3m6 3-2 6M19 44a19 19 0 0 1-3-19M16 25l6 3m-6-3 2-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
      [A.SIGIAN_EFFECTS?.DESTROY]: '<path d="m20 17 12 8 12-8-5 14 9 7-13 1-3 12-4-12-13-1 10-7Z" fill="currentColor"/>',
      [A.SIGIAN_EFFECTS?.DRAIN]: '<path d="M32 13c7 10 13 17 13 25a13 13 0 0 1-26 0c0-8 6-15 13-25Z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M22 35c5 5 15 5 20 0M40 31l3 4-4 3" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/>',
      [A.SIGIAN_EFFECTS?.EMIT]: '<circle cx="32" cy="32" r="7" fill="currentColor"/><path d="M32 13v8M32 43v8M13 32h8M43 32h8M19 19l6 6M39 39l6 6M45 19l-6 6M25 39l-6 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
      [A.SIGIAN_EFFECTS?.ATTACK_FROM_POWER]: '<path d="M14 39c9-1 12-8 18-16 5 8 9 14 18 16M18 45c7-2 10-6 14-12 4 6 7 10 14 12" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
      [A.SIGIAN_EFFECTS?.ATTACK_ALL]: '<path d="M32 48V20m0 0-7 8m7-8 7 8M20 42 12 31m8 11-10-1m10 1-3-9M44 42l8-11m-8 11 10-1m-10 1 3-9" fill="none" stroke="currentColor" stroke-width="3.3" stroke-linecap="round" stroke-linejoin="round"/>',
      [A.SIGIAN_EFFECTS?.ATTACK_MULTIPLIER]: '<path d="M17 45 43 19M17 19l26 26M13 49l9-2-7-7-2 9ZM51 15l-9 2 7 7 2-9Z" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>',
      [A.SIGIAN_EFFECTS?.SPELL_DAMAGE_MULTIPLIER]: '<path d="m32 12 5 14 15 1-12 9 4 15-12-9-12 9 4-15-12-9 15-1Z" fill="currentColor"/>',
      [A.SIGIAN_EFFECTS?.SPELL_DAMAGE_BONUS]: '<path d="m32 12 5 14 15 1-12 9 4 15-12-9-12 9 4-15-12-9 15-1Z" fill="currentColor"/>',
      [A.SIGIAN_EFFECTS?.DAMAGE_REDUCTION]: '<path d="M32 12 47 18v11c0 10-6 18-15 23-9-5-15-13-15-23V18l15-6Z" fill="none" stroke="currentColor" stroke-width="3.3"/><path d="m24 32 5 5 11-12" fill="none" stroke="currentColor" stroke-width="3.3" stroke-linecap="round" stroke-linejoin="round"/>',
      [A.SIGIAN_EFFECTS?.LIFESTEAL]: '<path d="M32 49S15 39 15 27c0-7 8-11 17-3 9-8 17-4 17 3 0 12-17 22-17 22Z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M23 35c6 3 12 3 18 0" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round"/>',
      [A.SIGIAN_EFFECTS?.SUMMON]: '<path d="M18 44c3-9 9-15 14-23 5 8 11 14 14 23M22 44h20M27 44V33h10v11" fill="none" stroke="currentColor" stroke-width="3.3" stroke-linecap="round" stroke-linejoin="round"/>'
    })[effect] || '<path d="M20 32h24M32 20v24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>';
    return `<svg class="${escapeHtml(className)}" viewBox="0 0 64 64" aria-hidden="true">${common}${path}</svg>`;
  }

  function sigianEffectLabel(effect) {
    return ({
      [A.SIGIAN_EFFECTS?.DAMAGE]: t("sigian.sigil.damage"),
      [A.SIGIAN_EFFECTS?.HEAL]: t("sigian.sigil.heal"),
      [A.SIGIAN_EFFECTS?.POWER]: t("sigian.sigil.power"),
      [A.SIGIAN_EFFECTS?.POWER_ALL]: t("sigian.sigil.power"),
      [A.SIGIAN_EFFECTS?.POWER_GROWTH]: t("sigian.sigil.growth"),
      [A.SIGIAN_EFFECTS?.FORCE_ATTACK]: t("sigian.sigil.control"),
      [A.SIGIAN_EFFECTS?.RESURRECT]: t("sigian.sigil.rebirth"),
      [A.SIGIAN_EFFECTS?.DESTROY]: t("sigian.sigil.destroy"),
      [A.SIGIAN_EFFECTS?.DRAIN]: t("sigian.sigil.drain"),
      [A.SIGIAN_EFFECTS?.EMIT]: t("sigian.sigil.ritual"),
      [A.SIGIAN_EFFECTS?.ATTACK_FROM_POWER]: t("sigian.sigil.channel"),
      [A.SIGIAN_EFFECTS?.ATTACK_ALL]: t("sigian.sigil.assault"),
      [A.SIGIAN_EFFECTS?.ATTACK_MULTIPLIER]: t("sigian.sigil.fury"),
      [A.SIGIAN_EFFECTS?.SPELL_DAMAGE_MULTIPLIER]: t("sigian.sigil.amplify"),
      [A.SIGIAN_EFFECTS?.SPELL_DAMAGE_BONUS]: t("sigian.sigil.amplify"),
      [A.SIGIAN_EFFECTS?.DAMAGE_REDUCTION]: t("sigian.sigil.guard"),
      [A.SIGIAN_EFFECTS?.LIFESTEAL]: t("sigian.sigil.lifesteal"),
      [A.SIGIAN_EFFECTS?.SUMMON]: t("sigian.sigil.summon"),
      [A.SIGIAN_EFFECTS?.PASSIVE]: t("sigian.trigger.passive")
    })[effect] || t("sigian.sigil.effect");
  }

  function sigianTriggerLabel(trigger) {
    return ({
      onSummon: t("sigian.trigger.summon"),
      onPlay: t("sigian.trigger.play"),
      passive: t("sigian.trigger.passive"),
      whileAlive: t("sigian.trigger.whileAlive"),
      onSelfDeath: t("sigian.modifier.onDeath"),
      onBeforeAttack: t("sigian.trigger.beforeAttack"),
      onAnyDeath: t("sigian.trigger.anyDeath")
    })[trigger] || trigger;
  }

  function sigianOperatorLabel(op) {
    return ({ gte:"≥", lte:"≤", gt:">", lt:"<", eq:"=", neq:"≠" })[op] || op;
  }

  function sigianTargetLabel(params = {}) {
    const side = params.side;
    const kind = params.kind;
    const selector = params.selector;
    const count = Number(params.count || 0);
    if (side === A.SIGIAN_TARGET_SIDES?.SELF && kind === A.SIGIAN_TARGET_KINDS?.HERO) return t("sigian.modifier.ownMage");
    if (side === A.SIGIAN_TARGET_SIDES?.ENEMY && kind === A.SIGIAN_TARGET_KINDS?.HERO) return t("sigian.modifier.enemyMage");
    if (side === A.SIGIAN_TARGET_SIDES?.BOTH && kind === A.SIGIAN_TARGET_KINDS?.CREATURES) return t("sigian.modifier.allCreatures");
    if (side === A.SIGIAN_TARGET_SIDES?.ENEMY && kind === A.SIGIAN_TARGET_KINDS?.CREATURES) {
      if (selector === "strongest-attack" && count > 0) return t("sigian.modifier.enemyCreaturesTopAttack", { count });
      return t("sigian.modifier.enemyCreatures");
    }
    if (side === A.SIGIAN_TARGET_SIDES?.ENEMY && kind === A.SIGIAN_TARGET_KINDS?.CREATURE) {
      if (selector === "strongest-health") return t("sigian.modifier.enemyCreatureMostHealth");
      return t("sigian.modifier.enemyCreature");
    }
    if (side === A.SIGIAN_TARGET_SIDES?.SELF && kind === A.SIGIAN_TARGET_KINDS?.CREATURES) return t("sigian.modifier.alliedCreatures");
    if (side === A.SIGIAN_TARGET_SIDES?.SELF && kind === A.SIGIAN_TARGET_KINDS?.SOURCE) return t("sigian.modifier.thisCreature");
    if (kind === A.SIGIAN_TARGET_KINDS?.POWER) {
      const base = `${t("sigian.modifier.power")} ${schoolName(params.school || "air")}`;
      return side === A.SIGIAN_TARGET_SIDES?.ENEMY ? `${base} · ${t("sigian.modifier.enemyShort")}` : base;
    }
    if (kind === A.SIGIAN_TARGET_KINDS?.POWERS) {
      return side === A.SIGIAN_TARGET_SIDES?.ENEMY ? t("sigian.modifier.enemyPowers") : t("sigian.modifier.ownPowers");
    }
    return t("sigian.modifier.target");
  }

  function sigianRatioLabel(numerator, denominator) {
    const n = Number(numerator ?? 1);
    const d = Math.max(1, Number(denominator ?? 1));
    if (n === 1 && d === 2) return "½";
    if (n === d) return "";
    return `${n}/${d} ×`;
  }

  function sigianScaleLabel(params = {}, effect = "") {
    const mode = params.mode;
    if (mode === A.SIGIAN_SCALE_MODES?.FULL_HEALTH) return t("sigian.modifier.fullHealth");
    if (mode === A.SIGIAN_SCALE_MODES?.CONSTANT) {
      const value = Number(params.value || 0);
      if (effect === A.SIGIAN_EFFECTS?.POWER_GROWTH) return `${value >= 0 ? "+" : ""}${value} ${t("sigian.modifier.perTurn")}`;
      if (effect === A.SIGIAN_EFFECTS?.SPELL_DAMAGE_BONUS) return `+${value} ${t("sigian.modifier.damage")}`;
      return `${value >= 0 ? "+" : ""}${value}`;
    }
    if (mode === A.SIGIAN_SCALE_MODES?.SOURCE_POWER) {
      const school = params.school || "air";
      const numerator = Number(params.numerator ?? 1);
      const denominator = Number(params.denominator ?? 1);
      const offset = Number(params.offset || 0);
      const coefficient = numerator === denominator ? "" : `${sigianRatioLabel(numerator, denominator)} `;
      const offsetLabel = offset === 0 ? "" : ` ${offset > 0 ? "+" : "−"} ${Math.abs(offset)}`;
      return `${coefficient}${t("sigian.modifier.power")} ${schoolName(school)}${offsetLabel}`;
    }
    if (mode === A.SIGIAN_SCALE_MODES?.TARGET_ATTACK) return t("sigian.modifier.targetAttack");
    if (mode === A.SIGIAN_SCALE_MODES?.DAMAGE_DEALT) {
      const ratio = sigianRatioLabel(params.numerator, params.denominator);
      return `${ratio ? `${ratio} ` : ""}${t("sigian.modifier.damageDealt")}`;
    }
    if (mode === A.SIGIAN_SCALE_MODES?.CREATURE_COUNT) {
      const multiplier = Number(params.multiplier ?? 1);
      return `${multiplier} × ${t("sigian.modifier.creaturesInPlay")}`;
    }
    return "";
  }

  function sigianConditionOperandLabel(value = {}) {
    if (value.kind === A.SIGIAN_TARGET_KINDS?.POWER) {
      const base = `${t("sigian.modifier.power")} ${schoolName(value.school || "air")}`;
      return value.side === A.SIGIAN_TARGET_SIDES?.ENEMY ? `${base} · ${t("sigian.modifier.enemyShort")}` : base;
    }
    if (Object.prototype.hasOwnProperty.call(value, "value")) return String(Number(value.value || 0));
    return "";
  }

  function sigianConditionLabel(params = {}) {
    const left = sigianConditionOperandLabel(params.left || {});
    const right = sigianConditionOperandLabel(params.right || {});
    if (!left || !right) return "";
    return `${left} ${sigianOperatorLabel(params.op)} ${right}`;
  }

  function sigianConfigLabel(params = {}, effect = "") {
    if (params.destination === "own-hero") return t("sigian.modifier.ownMage");
    if (params.school) return `${t("sigian.modifier.power")} ${schoolName(params.school)}`;
    if (params.healTarget === A.SIGIAN_TARGET_SIDES?.SELF && params.healKind === A.SIGIAN_TARGET_KINDS?.HERO) {
      return t("sigian.modifier.healFromDamage");
    }
    if (params.mode === "halve") {
      return params.targetKinds?.includes("hero")
        ? t("sigian.modifier.mageDamageHalf")
        : t("sigian.modifier.damageHalf");
    }
    if (params.mode === "subtract") {
      const value = Math.abs(Number(params.value || 0));
      const threshold = Number(params.threshold || 0);
      return t("sigian.modifier.damageReduction", { value, threshold });
    }
    if (effect === A.SIGIAN_EFFECTS?.ATTACK_MULTIPLIER && params.numerator && params.denominator) {
      return t("sigian.modifier.alliedAttackMultiplier", { ratio: `${params.numerator}/${params.denominator}` });
    }
    if (effect === A.SIGIAN_EFFECTS?.SPELL_DAMAGE_MULTIPLIER && params.numerator && params.denominator) {
      return t("sigian.modifier.spellDamageMultiplier", { ratio: `${params.numerator}/${params.denominator}` });
    }
    return "";
  }

  function sigianSigilUiModel(sigil) {
    const modifiers = [{ className:"trigger", text:sigianTriggerLabel(sigil.trigger), glyph:"✦" }];
    (sigil.modifiers || []).forEach(item => {
      const params = item.params || {};
      let textValue = "";
      let className = item.kind || "";
      let school = params.school || params.left?.school || null;
      if (item.kind === A.SIGIAN_MODIFIER_KINDS?.TARGET) {
        const implicitSelfRebirth = sigil.effect === A.SIGIAN_EFFECTS?.RESURRECT
          && params.side === A.SIGIAN_TARGET_SIDES?.SELF
          && params.kind === A.SIGIAN_TARGET_KINDS?.SOURCE;
        if (!implicitSelfRebirth) textValue = sigianTargetLabel(params);
      }
      if (item.kind === A.SIGIAN_MODIFIER_KINDS?.SCALE) textValue = sigianScaleLabel(params, sigil.effect);
      if (item.kind === A.SIGIAN_MODIFIER_KINDS?.CONDITION) textValue = sigianConditionLabel(params);
      if (item.kind === A.SIGIAN_MODIFIER_KINDS?.CONFIG) {
        textValue = sigianConfigLabel(params, sigil.effect);
      }
      if (!textValue) return;
      modifiers.push({
        className: `${className}${school ? ` school-${school}` : ""}`,
        text: textValue,
        school
      });
    });
    return {
      effect: sigil.effect,
      name: sigianEffectLabel(sigil.effect),
      iconMarkup: className => sigianEffectIconMarkup(sigil.effect, className),
      modifiers
    };
  }

  function sigianCanonicalSigilEffect(sigilId) {
    return ({
      damage: A.SIGIAN_EFFECTS?.DAMAGE,
      wave: A.SIGIAN_EFFECTS?.DAMAGE,
      backlash: A.SIGIAN_EFFECTS?.DAMAGE,
      retaliation: A.SIGIAN_EFFECTS?.DAMAGE,
      heal: A.SIGIAN_EFFECTS?.HEAL,
      restoration: A.SIGIAN_EFFECTS?.HEAL,
      regeneration: A.SIGIAN_EFFECTS?.HEAL,
      infusion: A.SIGIAN_EFFECTS?.POWER,
      subtraction: A.SIGIAN_EFFECTS?.POWER,
      channeling: A.SIGIAN_EFFECTS?.POWER_GROWTH,
      erosion: A.SIGIAN_EFFECTS?.POWER_GROWTH,
      tribute: A.SIGIAN_EFFECTS?.POWER_ALL,
      protection: A.SIGIAN_EFFECTS?.DAMAGE_REDUCTION,
      "arcane-amplification": A.SIGIAN_EFFECTS?.SPELL_DAMAGE_BONUS,
      "combat-fury": A.SIGIAN_EFFECTS?.ATTACK_MULTIPLIER,
      "total-assault": A.SIGIAN_EFFECTS?.ATTACK_ALL,
      "arcane-attack": A.SIGIAN_EFFECTS?.ATTACK_FROM_POWER,
      absorption: A.SIGIAN_EFFECTS?.LIFESTEAL,
      destruction: A.SIGIAN_EFFECTS?.DESTROY,
      annihilation: A.SIGIAN_EFFECTS?.DESTROY,
      rebirth: A.SIGIAN_EFFECTS?.RESURRECT,
      "eternal-rebirth": A.SIGIAN_EFFECTS?.RESURRECT,
      domination: A.SIGIAN_EFFECTS?.FORCE_ATTACK
    })[sigilId] || A.SIGIAN_EFFECTS?.PASSIVE;
  }

  function sigianCanonicalSigilIconMarkup(sigilId, className = "") {
    const common = '<circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="32" cy="32" r="19" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".36"/>';
    const path = ({
      damage: '<path d="M36 11 21 34h10l-4 19 17-27H34l2-15Z" fill="currentColor"/>',
      wave: '<path d="M13 25c6-6 12-6 19 0s13 6 19 0M13 34c6-6 12-6 19 0s13 6 19 0M13 43c6-6 12-6 19 0s13 6 19 0" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>',
      backlash: '<path d="M41 15 24 30h10l-7 19M18 19h13M18 19l6-6M18 19l6 6" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>',
      retaliation: '<path d="M18 20h22l-6-6m6 6-6 6M46 44H24l6 6m-6-6 6-6" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>',
      heal: '<path d="M28 17h8v11h11v8H36v11h-8V36H17v-8h11Z" fill="currentColor"/>',
      restoration: '<path d="M28 16h8v12h12v8H36v12h-8V36H16v-8h12Z" fill="currentColor"/><circle cx="15" cy="15" r="3" fill="currentColor"/><circle cx="49" cy="49" r="3" fill="currentColor"/>',
      regeneration: '<path d="M21 22a15 15 0 0 1 24 4M45 26v-9m0 9h-9M43 42a15 15 0 0 1-24-4M19 38v9m0-9h9" fill="none" stroke="currentColor" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M29 25h6v7h7v6h-7v7h-6v-7h-7v-6h7Z" fill="currentColor"/>',
      infusion: '<path d="m32 12 7 12 13 8-13 8-7 12-7-12-13-8 13-8Z" fill="currentColor"/><path d="M32 45V19m0 0-6 7m6-7 6 7" fill="none" stroke="#0b0b12" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
      subtraction: '<path d="m32 12 7 12 13 8-13 8-7 12-7-12-13-8 13-8Z" fill="currentColor"/><path d="M22 32h20" fill="none" stroke="#0b0b12" stroke-width="3" stroke-linecap="round"/>',
      channeling: '<path d="M32 50V18m0 0-8 10m8-10 8 10M18 44l14-14 14 14" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>',
      erosion: '<path d="M32 14v32m0 0-8-10m8 10 8-10M18 20l14 14 14-14" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>',
      tribute: '<path d="M18 19h28M22 26h20M26 33h12M32 39v11m0 0-6-7m6 7 6-7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>',
      protection: '<path d="M32 12 47 18v11c0 10-6 18-15 23-9-5-15-13-15-23V18l15-6Z" fill="none" stroke="currentColor" stroke-width="3.3"/><path d="m24 32 5 5 11-12" fill="none" stroke="currentColor" stroke-width="3.3" stroke-linecap="round" stroke-linejoin="round"/>',
      "arcane-amplification": '<path d="m32 11 5 13 14 1-11 9 4 14-12-8-12 8 4-14-11-9 14-1Z" fill="currentColor"/><circle cx="32" cy="32" r="4" fill="#0b0b12"/>',
      "combat-fury": '<path d="M17 45 43 19M17 19l26 26M13 49l9-2-7-7-2 9ZM51 15l-9 2 7 7 2-9Z" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>',
      "total-assault": '<path d="M32 48V20m0 0-7 8m7-8 7 8M20 42 12 31m8 11-10-1m10 1-3-9M44 42l8-11m-8 11 10-1m-10 1 3-9" fill="none" stroke="currentColor" stroke-width="3.3" stroke-linecap="round" stroke-linejoin="round"/>',
      "arcane-attack": '<path d="M18 46 42 22m-5-7 12 12M15 49l9-2-7-7-2 9Z" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="m24 18 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" fill="currentColor"/>',
      absorption: '<path d="M32 49S15 39 15 27c0-7 8-11 17-3 9-8 17-4 17 3 0 12-17 22-17 22Z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M21 31h22m0 0-6-6m6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/>',
      destruction: '<path d="m20 17 12 8 12-8-5 14 9 7-13 1-3 12-4-12-13-1 10-7Z" fill="currentColor"/>',
      annihilation: '<path d="m18 17 8 8 6-13 6 13 8-8-3 14 10 4-12 5 2 12-11-7-11 7 2-12-12-5 10-4Z" fill="currentColor"/>',
      rebirth: '<path d="M31 45c-8-5-11-12-7-19 2 5 5 6 7 2 2-4 1-8 0-12 8 5 13 12 10 20-1 4-5 8-10 9Z" fill="currentColor"/><path d="M45 20a19 19 0 0 1 3 19M48 39l-6-3m6 3-2 6M19 44a19 19 0 0 1-3-19M16 25l6 3m-6-3 2-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
      "eternal-rebirth": '<path d="M31 45c-8-5-11-12-7-19 2 5 5 6 7 2 2-4 1-8 0-12 8 5 13 12 10 20-1 4-5 8-10 9Z" fill="currentColor"/><path d="M13 32c0-10 8-18 18-18 7 0 13 4 16 10M51 32c0 10-8 18-18 18-7 0-13-4-16-10M47 15v10H37M17 49V39h10" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
      domination: '<path d="M12 32s7-12 20-12 20 12 20 12-7 12-20 12S12 32 12 32Zm20-7a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z" fill="currentColor"/><path d="M29 29h6v6h-6Z" fill="#0b0b12"/>'
    })[sigilId] || '<path d="M20 32h24M32 20v24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>';
    return `<svg class="${escapeHtml(className)}" viewBox="0 0 64 64" aria-hidden="true">${common}${path}</svg>`;
  }

  function sigianRomanGrade(value) {
    return ({ 1:"I", 2:"II", 3:"III", 4:"IV", 5:"V" })[Number(value)] || "";
  }

  function sigianV2ComponentBaseName(definitionId, fallback = "") {
    const key = `sigian.v2.${definitionId}`;
    const label = t(key);
    return label === key ? String(fallback || definitionId || "") : label;
  }

  function sigianV2ComponentDisplayName(component) {
    if (!component) return "";
    const parts = [sigianV2ComponentBaseName(component.definitionId, component.name)];
    if (component.school) parts.push(schoolName(component.school));
    if (component.grade != null) {
      const roman = sigianRomanGrade(component.grade);
      if (roman) parts.push(roman);
    }
    return parts.filter(Boolean).join(" ");
  }

  function sigianV2IconId(definitionId, kind = "sigil") {
    const id = String(definitionId || "");
    if (kind === "constraint") {
      if (/erosion/.test(id)) return "erosion";
      if (/tribute/.test(id)) return "tribute";
      if (/friendly-fire/.test(id)) return "retaliation";
      return "backlash";
    }
    if (/wave|tide/.test(id)) return "wave";
    if (/damage|abbattimento|justice/.test(id)) return "damage";
    if (/heal/.test(id)) return "heal";
    if (/recovery|vital-resonance/.test(id)) return "restoration";
    if (/regeneration/.test(id)) return "regeneration";
    if (/infusion/.test(id)) return "infusion";
    if (/subtraction/.test(id)) return "subtraction";
    if (/channeling|necromantic-resonance/.test(id)) return "channeling";
    if (/enemy-erosion/.test(id)) return "erosion";
    if (/protection|arcane-armor/.test(id)) return "protection";
    if (/spell-amplification/.test(id)) return "arcane-amplification";
    if (/allied-amplification/.test(id)) return "combat-fury";
    if (/total-assault/.test(id)) return "total-assault";
    if (/arcane-attack/.test(id)) return "arcane-attack";
    if (/life-drain|vampirism/.test(id)) return "absorption";
    if (/soul-harvest/.test(id)) return "annihilation";
    if (/uprooting/.test(id)) return "destruction";
    if (/eternal-rebirth/.test(id)) return "eternal-rebirth";
    if (/rebirth/.test(id)) return "rebirth";
    if (/domination/.test(id)) return "domination";
    return "damage";
  }

  function sigianV2ComponentUiModel(component) {
    if (!component) return null;
    const iconId = sigianV2IconId(component.definitionId, component.kind);
    return {
      kind:component.kind,
      definitionId:component.definitionId,
      sigilId:iconId,
      name:sigianV2ComponentDisplayName(component),
      school:component.school || null,
      grade:component.grade ?? null,
      detail:String(component.detail || ""),
      iconMarkup:className => sigianCanonicalSigilIconMarkup(iconId, className),
      modifiers:[]
    };
  }

  function sigianBaseCanonicalUiModel(card) {
    const components = A.getSigianBaseCanonicalComponents?.(card?.id) || [];
    if (!components.length) return null;
    const sigils = components
      .filter(component => component.kind === "sigil")
      .map(sigianV2ComponentUiModel)
      .filter(Boolean);
    const constraint = sigianV2ComponentUiModel(
      components.find(component => component.kind === "constraint") || null
    );
    return {
      source:"base-canonical-v2",
      recipe:null,
      formula:null,
      sigils,
      constraint,
      primary:sigils[0] || constraint || null
    };
  }

  function sigianRecipeConstraintUiModel(recipe) {
    const constraint = recipe?.constraint;
    if (!constraint?.definitionId) return null;
    return sigianV2ComponentUiModel({ kind:"constraint", ...constraint });
  }

  function sigianCanonicalSigilName(sigil) {
    const key = ({
      damage:"damage", wave:"wave", backlash:"backlash", retaliation:"retaliation",
      heal:"heal", restoration:"restoration", regeneration:"regeneration",
      infusion:"infusion", subtraction:"subtraction", channeling:"channeling",
      erosion:"erosion", tribute:"tribute", protection:"protection",
      "arcane-amplification":"arcaneAmplification", "combat-fury":"fury",
      "total-assault":"totalAssault", "arcane-attack":"arcaneAttack",
      absorption:"absorption", destruction:"destruction", annihilation:"annihilation",
      rebirth:"rebirth", "eternal-rebirth":"eternalRebirth", domination:"domination"
    })[sigil.sigilId];
    const label = key ? t(`sigian.canonical.${key}`) : sigil.sigilId;
    return label;
  }

  function sigianCanonicalValue(card, sigil) {
    if (sigil?.intensity != null && Number.isFinite(Number(sigil.intensity))) return Number(sigil.intensity);
    const raw = A.SIGIAN_BASE_RECIPE_SPECS?.[card?.id]?.values?.[sigil?.slotId];
    return Number.isFinite(Number(raw)) ? Number(raw) : null;
  }

  function sigianCanonicalPowerLabel(schoolId, side = "self") {
    const base = `${t("sigian.modifier.power")} ${schoolName(schoolId)}`;
    return side === "enemy" ? `${base} · ${t("sigian.modifier.enemyShort")}` : base;
  }

  function sigianCanonicalActivationLabel(modifier, card) {
    const params = modifier?.params || {};
    if (modifier?.id === "activation-on-any-death") return t("sigian.trigger.anyDeath");
    if (modifier?.id === "activation-power-threshold") {
      return `${sigianCanonicalPowerLabel(params.school || card.school, params.side)} ${sigianOperatorLabel(params.op || "gte")} ${Number(params.value || 0)}`;
    }
    if (modifier?.id === "activation-power-comparison") {
      const left = sigianCanonicalPowerLabel(params.leftSchool || card.school, params.leftSide);
      const right = sigianCanonicalPowerLabel(params.rightSchool || card.school, params.rightSide || "enemy");
      return `${left} ${sigianOperatorLabel(params.op || "lt")} ${right}`;
    }
    if (modifier?.id === "activation-critical-life") {
      return `${t("ui.life")} ${sigianOperatorLabel(params.op || "lt")} ${Number(params.value || 0)}`;
    }
    return "";
  }

  function sigianCanonicalScalingLabel(modifier, card, sigil, baseValue) {
    const params = modifier?.params || {};
    const schoolId = params.school || card.school;
    const offset = Number(baseValue || 0);
    const offsetLabel = offset === 0 ? "" : ` ${offset > 0 ? "+" : "−"} ${Math.abs(offset)}`;
    if (modifier?.id === "scale-power-half") return `½ × ${sigianCanonicalPowerLabel(schoolId)}${offsetLabel}`;
    if (modifier?.id === "scale-power") return `${sigianCanonicalPowerLabel(schoolId)}${offsetLabel}`;
    if (modifier?.id === "scale-power-double") return `2 × ${sigianCanonicalPowerLabel(schoolId)}${offsetLabel}`;
    if (modifier?.id === "scale-target-attack") return t("sigian.modifier.targetAttack");
    if (modifier?.id === "scale-full-health") return t("sigian.modifier.fullHealth");
    if (modifier?.id === "scale-creature-count") return `${Math.abs(offset)} × ${t("sigian.modifier.creaturesInPlay")}`;
    if (modifier?.id === "scale-damage-dealt") {
      const ratio = sigianRatioLabel(params.numerator, params.denominator);
      return `${ratio ? `${ratio} ` : ""}${t("sigian.modifier.damageDealt")}`;
    }
    return "";
  }

  function sigianCanonicalBaseConfigChips(card, sigil, value) {
    const config = sigil.config || {};
    const chips = [];
    const activation = (sigil.modifiers || []).find(item => A.getSigianAdvancedModifier?.(item.id)?.family === "activation");
    const advancedTiming = activation?.id === "activation-on-any-death";

    if (!advancedTiming && config.when) {
      const timingLabel = config.when === "onDeploy"
        ? (card.type === "spell" ? t("sigian.trigger.play") : t("sigian.trigger.summon"))
        : sigianTriggerLabel(config.when);
      chips.push({ className:"trigger", text:timingLabel, glyph:"✦" });
    }
    if (config.reaction === "damaged") {
      chips.push({ className:"trigger", text:t("sigian.trigger.damaged"), glyph:"✦" });
    }

    if (sigil.sigilId === "damage") {
      if (config.target === "enemy-hero") chips.push({ className:"target", text:t("sigian.modifier.enemyMage") });
      if (config.target === "enemy-creature") {
        const text = config.selector === "strongest-health"
          ? t("sigian.modifier.enemyCreatureMostHealth")
          : config.selector === "strongest-attack"
            ? t("sigian.modifier.enemyCreatureMostAttack")
            : t("sigian.modifier.enemyCreature");
        chips.push({ className:"target", text });
      }
    }

    if (sigil.sigilId === "wave") {
      chips.push({
        className:"target",
        text:config.scope === "front" ? t("sigian.scope.frontEnemies") : t("sigian.scope.enemyField")
      });
    }

    if (sigil.sigilId === "backlash") chips.push({ className:"target", text:t("sigian.modifier.ownMage") });
    if (sigil.sigilId === "retaliation") chips.push({ className:"target", text:t("sigian.modifier.eventSource") });

    if (sigil.sigilId === "heal") {
      if (config.target === "self-hero") chips.push({ className:"target", text:t("sigian.modifier.ownMage") });
    }
    if (sigil.sigilId === "restoration") {
      chips.push({
        className:"target",
        text:config.scope === "front" ? t("sigian.scope.alliedFront") : t("sigian.modifier.alliedCreatures")
      });
    }
    if (sigil.sigilId === "regeneration") chips.push({ className:"target", text:t("sigian.modifier.thisCreature") });

    if (sigil.sigilId === "infusion") {
      const schools = config.schools === "all" ? "all" : (Array.isArray(config.schools) ? config.schools : [card.school]);
      if (schools === "all") {
        chips.push({ className:"target", text:t("forge.option.allSchools") });
      } else {
        const names = schools.map(schoolName);
        chips.push({
          className:`target${schools.length === 1 ? ` school-${schools[0]}` : ""}`,
          text:names.join(" · "),
          school:schools.length === 1 ? schools[0] : null
        });
      }
    } else if (["subtraction","channeling","erosion","tribute"].includes(sigil.sigilId)) {
      const enemy = sigil.sigilId === "subtraction" || (sigil.sigilId === "erosion" && config.side === "enemy");
      const all = config.scope === "all-powers";
      const text = all
        ? (enemy ? t("sigian.modifier.enemyPowers") : t("sigian.modifier.ownPowers"))
        : sigianCanonicalPowerLabel(config.school || card.school, enemy ? "enemy" : "self");
      chips.push({ className:`target${!all ? ` school-${config.school || card.school}` : ""}`, text, school:all ? null : (config.school || card.school) });
    }

    if (sigil.sigilId === "protection") {
      if (config.mode === "halve") {
        chips.push({ className:"config", text:t("sigian.modifier.mageDamageHalf") });
      } else {
        chips.push({
          className:"config",
          text:t("sigian.modifier.damageReduction", { value:Math.abs(value || 0), threshold:Number(config.threshold ?? 1) })
        });
      }
      if (config.targetScope === "hero-and-creatures") chips.push({ className:"target", text:t("sigian.scope.alliedFront") });
    }

    if (sigil.sigilId === "arcane-amplification") {
      if (config.mode === "multiplier") {
        chips.push({ className:"config", text:t("sigian.modifier.spellDamageMultiplier", { ratio:`${config.numerator || 3}/${config.denominator || 2}` }) });
      } else if (value != null) {
        chips.push({ className:"scale", text:`+${Math.abs(value)} ${t("sigian.modifier.damage")}` });
      }
    }

    if (sigil.sigilId === "combat-fury") {
      chips.push({ className:"config", text:t("sigian.modifier.alliedAttackMultiplier", { ratio:`${config.numerator || 3}/${config.denominator || 2}` }) });
    }
    if (sigil.sigilId === "total-assault") chips.push({ className:"target", text:t("sigian.scope.frontEnemies") });
    if (sigil.sigilId === "arcane-attack") {
      const schoolId = config.school || card.school;
      chips.push({ className:`config school-${schoolId}`, text:t("sigian.modifier.attackEqualsPower", { school:schoolName(schoolId) }), school:schoolId });
    }
    if (sigil.sigilId === "absorption") {
      const numerator = Number(config.numerator ?? 1);
      const denominator = Number(config.denominator ?? 2);
      const ratio = sigianRatioLabel(numerator, denominator);
      chips.push({ className:"config", text:t("sigian.modifier.absorbDamage", { ratio:ratio || "1×" }) });
      if (config.healTarget === "self-hero") chips.push({ className:"target", text:t("sigian.modifier.ownMage") });
      else chips.push({ className:"target", text:t("sigian.modifier.thisCreature") });
    }
    if (sigil.sigilId === "destruction") chips.push({ className:"target", text:t("sigian.modifier.enemyCreature") });
    if (sigil.sigilId === "annihilation") {
      chips.push({ className:"target", text:config.scope === "all-field" ? t("sigian.modifier.allCreatures") : t("sigian.modifier.enemyCreatures") });
    }
    if (sigil.sigilId === "domination" && value != null) {
      chips.push({ className:"target", text:t("sigian.modifier.enemyCreaturesTopAttack", { count:Math.abs(value) }) });
    }

    return chips;
  }

  function sigianCanonicalSigilUiModel(card, sigil) {
    const value = sigianCanonicalValue(card, sigil);
    const collectible = sigil.collectibleId ? A.getSigianCollectibleSigil?.(sigil.collectibleId) : null;
    const effect = sigianCanonicalSigilEffect(sigil.sigilId);
    const modifiers = collectible ? [] : sigianCanonicalBaseConfigChips(card, sigil, value);
    const hiddenModifierFamilies = new Set(collectible?.hiddenModifierFamilies || []);
    const hasScaling = (sigil.modifiers || []).some(item => A.getSigianAdvancedModifier?.(item.id)?.family === "scaling");

    (sigil.modifiers || []).forEach(item => {
      const definition = A.getSigianAdvancedModifier?.(item.id);
      const family = definition?.family;
      if (hiddenModifierFamilies.has(family)) return;
      let textValue = "";
      let className = family || "modifier";
      let school = item.params?.school || null;

      if (family === "scaling") textValue = sigianCanonicalScalingLabel(item, card, sigil, value);
      if (family === "activation") textValue = sigianCanonicalActivationLabel(item, card);
      if (family === "constraint") {
        if (item.id === "constraint-friendly-fire") textValue = t("sigian.modifier.friendlyFire");
        if (item.id === "constraint-friendly-fire-power-threshold") {
          textValue = t("sigian.modifier.friendlyFireWhen", {
            condition:`${sigianCanonicalPowerLabel(item.params?.school || card.school)} ${sigianOperatorLabel(item.params?.op || "lt")} ${Number(item.params?.value || 0)}`
          });
          school = item.params?.school || card.school;
        }
      }
      if (family === "selector") {
        if (item.id === "selector-highest-life") textValue = t("sigian.modifier.highestLife");
        if (item.id === "selector-highest-attack") textValue = t("sigian.modifier.highestAttack");
      }
      if (!textValue) return;
      modifiers.push({
        className:`${className}${school ? ` school-${school}` : ""}`,
        text:textValue,
        school
      });
    });

    const fixedValueSigils = new Set([
      "damage","wave","backlash","heal","restoration","regeneration",
      "infusion","subtraction","channeling","erosion","tribute"
    ]);
    if (card?.__forgePreview && sigil.grade != null && !collectible) {
      modifiers.unshift({
        className:"grade",
        text:Number(sigil.grade) === 1 ? t("forge.gradeOne") : `Grado ${escapeHtml(sigil.grade)}`
      });
    }

    if (!hasScaling && value != null && fixedValueSigils.has(sigil.sigilId)) {
      const growth = ["channeling","erosion"].includes(sigil.sigilId);
      const sign = ["subtraction","erosion","tribute"].includes(sigil.sigilId) ? "−" : value > 0 ? "+" : "";
      modifiers.push({
        className:"scale",
        text:`${sign}${Math.abs(value)}${growth ? ` ${t("sigian.modifier.perTurn")}` : ""}`
      });
    }

    return {
      sigilId:sigil.sigilId,
      slotId:sigil.slotId || null,
      effect,
      name:collectible?.displayName || sigianCanonicalSigilName(sigil),
      iconMarkup:className => sigianCanonicalSigilIconMarkup(collectible?.baseSigilId || sigil.sigilId, className),
      modifiers
    };
  }

  function sigianCardUiModel(card) {
    const canonicalBase = sigianBaseCanonicalUiModel(card);
    if (canonicalBase) return canonicalBase;

    const recipe = sigianRecipeForUi(card);
    if (!recipe) return null;
    const sigils = (recipe.sigils || []).map(sigil => sigianCanonicalSigilUiModel(card, sigil));
    const constraint = sigianRecipeConstraintUiModel(recipe);
    if (!sigils.length && !constraint && !card?.__forgePreview) return null;
    return {
      source:"formula-recipe",
      recipe,
      formula:recipe,
      sigils,
      constraint,
      primary:sigils[0] || constraint || null
    };
  }

  function sigianModifierMarkup(item) {
    const schoolIcon = item.school ? schoolIconMarkup(item.school, "school-icon-svg sigian-modifier-school-icon") : `<span class="sigian-modifier-glyph" aria-hidden="true">${escapeHtml(item.glyph || "◆")}</span>`;
    return `<span class="sigian-modifier-chip ${escapeHtml(item.className)}">${schoolIcon}<span>${escapeHtml(item.text)}</span></span>`;
  }

  function buildSigianFullConstraintSlot(card, model) {
    const constraint = model?.constraint || null;
    const slot = document.createElement(constraint || card?.__forgePreview ? "button" : "span");
    if (slot.tagName === "BUTTON") slot.type = "button";
    slot.className = `sigian-full-constraint-slot ${constraint ? "is-filled" : "is-empty"} ${constraint?.school ? `school-${constraint.school}` : "is-neutral"}`;
    slot.dataset.sigianConstraintSlot = constraint?.definitionId || "";
    slot.setAttribute("aria-label", constraint
      ? t("sigian.constraint.inspect", { name:constraint.name })
      : t("sigian.constraint.emptySlot"));
    slot.title = constraint?.name || t("sigian.constraint.emptySlot");
    slot.innerHTML = `
      <span class="sigian-full-constraint-ring" aria-hidden="true">
        <span class="sigian-full-constraint-orb">${constraint ? '<span class="sigian-full-constraint-glyph">◇</span>' : ""}</span>
      </span>`;
    if (card?.__forgePreview) {
      slot.dataset.forgeCardEdit = "constraint";
    } else if (constraint) {
      slot.addEventListener("click", event => {
        event.stopPropagation();
        window.dispatchEvent(new CustomEvent("sigian:constraint-inspect", {
          detail:{
            cardId:card?.id || "",
            constraint:{
              definitionId:constraint.definitionId,
              name:constraint.name,
              school:constraint.school || null,
              grade:constraint.grade ?? null,
              detail:constraint.detail || ""
            }
          }
        }));
      });
    }
    return slot;
  }

  function buildSigianFullCard(card, side = null) {
    const model = sigianCardUiModel(card);
    if (!model) return null;
    const cost = engine && side ? engine.effectiveCost(side, card) : Number(card.cost ?? card.level ?? 0);
    const article = document.createElement("article");
    article.className = `sigian-full-card school-${card.school} type-${card.type} sigian-sigil-count-${model.sigils.length}`;
    if (card?.__forgePreview) article.classList.add("is-forge-editable");
    article.dataset.cardId = card.id;

    const top = document.createElement("header");
    top.className = "sigian-full-top";
    top.innerHTML = `
      <span class="sigian-full-cost" aria-label="${escapeHtml(t("ui.cost"))} ${escapeHtml(cost)}">${escapeHtml(cost)}</span>
      <span class="sigian-full-type">${escapeHtml(card.type === "spell" ? t("ui.spell") : t("ui.creature"))}</span>
      <strong class="sigian-full-name">${escapeHtml(cardName(card))}</strong>
      <span class="sigian-full-school" aria-label="${escapeHtml(schoolName(card.school))}">${schoolIconMarkup(card.school, "school-icon-svg sigian-full-school-icon")}</span>`;
    article.appendChild(top);

    if (card?.__forgePreview) {
      [
        [top.querySelector(".sigian-full-cost"), "cost", t("ui.cost")],
        [top.querySelector(".sigian-full-type"), "type", t("forge.type")],
        [top.querySelector(".sigian-full-name"), "name", t("forge.name")],
        [top.querySelector(".sigian-full-school"), "school", t("forge.school")]
      ].forEach(([node, section, label]) => {
        if (!node) return;
        node.dataset.forgeCardEdit = section;
        node.setAttribute("role", "button");
        node.setAttribute("tabindex", "0");
        node.title = label;
      });
    }

    const art = document.createElement("div");
    art.className = "sigian-full-art";
    art.appendChild(buildArtBlock(card, "sigianFull"));
    article.appendChild(art);

    if (card.type === "creature") {
      const attack = side && engine ? displayedUnitAttack(side, card) : printedCardAttack(card);
      const health = Math.max(0, Number(card.currentHealth ?? card.health ?? card.hp ?? 0));
      const stats = document.createElement("div");
      stats.className = "sigian-full-stats";
      stats.innerHTML = `
        <span class="sigian-full-stat sigian-full-attack" aria-label="${escapeHtml(t("ui.attack"))} ${escapeHtml(attack)}"><span aria-hidden="true">⚔</span><b>${escapeHtml(attack)}</b></span>
        <span class="sigian-full-stat sigian-full-health" aria-label="${escapeHtml(t("ui.life"))} ${escapeHtml(health)}"><span aria-hidden="true">♥</span><b>${escapeHtml(health)}</b></span>`;
      if (card?.__forgePreview) {
        const attackNode = stats.querySelector(".sigian-full-attack");
        const healthNode = stats.querySelector(".sigian-full-health");
        if (attackNode) {
          attackNode.dataset.forgeCardEdit = "attack";
          attackNode.setAttribute("role", "button");
          attackNode.setAttribute("tabindex", "0");
          attackNode.title = t("forge.attack");
        }
        if (healthNode) {
          healthNode.dataset.forgeCardEdit = "health";
          healthNode.setAttribute("role", "button");
          healthNode.setAttribute("tabindex", "0");
          healthNode.title = t("forge.health");
        }
      }
      article.appendChild(stats);
    }

    article.appendChild(buildSigianFullConstraintSlot(card, model));

    const sigilArea = document.createElement("section");
    sigilArea.className = `sigian-full-sigil-area ${card.type === "spell" ? "sigian-full-spell-sigil-area" : ""}`;
    const sigilMarkup = model.sigils.map((sigil, index) => {
      const modifiers = sigil.modifiers.map(sigianModifierMarkup).join("");
      const forgeSlot = card?.__forgePreview && sigil.slotId ? ` data-forge-sigil-slot="${escapeHtml(sigil.slotId)}" role="button" tabindex="0"` : "";
      const selected = card?.__forgePreview && sigil.slotId && sigil.slotId === forgeSelectedSigilSlotId ? " is-forge-selected" : "";
      return `<div class="sigian-sigil-entry ${index === 0 ? "is-primary" : "is-secondary"}${selected}"${forgeSlot}>
        <div class="sigian-sigil-medallion">${sigil.iconMarkup("sigian-sigil-icon")}</div>
        <div class="sigian-sigil-copy">
          <strong class="sigian-sigil-name">${escapeHtml(sigil.name)}</strong>
          <div class="sigian-modifier-row">${modifiers}</div>
        </div>
      </div>`;
    }).join("");
    sigilArea.innerHTML = `
      <div class="sigian-sigil-list">${sigilMarkup}</div>
      <p class="sigian-full-rules">${cardDescriptionHtml(card, side || inspectedCardSide)}</p>`;
    if (card?.__forgePreview) {
      sigilArea.dataset.forgeCardEdit = "sigils";
      sigilArea.setAttribute("role", "button");
      sigilArea.setAttribute("tabindex", "0");
      sigilArea.title = t("forge.sigils");
    }
    article.appendChild(sigilArea);
    return article;
  }

  function decorateSigianHandCard(cardNode, card) {
    if (!cardNode) return;
    const model = sigianCardUiModel(card);
    const enabled = Boolean(model);
    cardNode.classList.toggle("sigian-card-hand", enabled);
    cardNode.querySelector(".sigian-hand-sigil")?.remove();
    if (!enabled) return;
    const schoolNode = cardNode.querySelector(".school");
    if (schoolNode) {
      schoolNode.innerHTML = schoolIconMarkup(card.school, "school-icon-svg card-school-svg");
      schoolNode.setAttribute("aria-label", schoolName(card.school));
      schoolNode.title = schoolName(card.school);
    }
    const badge = document.createElement("span");
    badge.className = "sigian-hand-sigil";
    badge.title = model.primary.name;
    badge.innerHTML = model.primary.iconMarkup("sigian-sigil-icon");
    cardNode.appendChild(badge);
  }

  function syncSigianCombatPresentation(cell, unit) {
    if (!cell) return;
    const model = unit?.type === "creature" ? sigianCardUiModel(unit) : null;
    const enabled = Boolean(model);
    cell.classList.toggle("sigian-card-combat", enabled);
    let badge = cell.querySelector(".sigian-combat-sigil");
    if (!enabled) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "sigian-combat-sigil";
      cell.appendChild(badge);
    }
    badge.setAttribute("aria-label", model.primary.name);
    badge.title = model.primary.name;
    badge.innerHTML = model.primary.iconMarkup("sigian-sigil-icon");
  }

  function decorateSigianSpellCast(cast, card) {
    if (!cast || card?.type !== "spell") return;
    const model = sigianCardUiModel(card);
    if (!model) return;
    cast.classList.add("sigian-card-cast");
    const badge = document.createElement("span");
    badge.className = "sigian-spell-cast-sigil";
    badge.setAttribute("aria-label", model.primary.name);
    badge.title = model.primary.name;
    badge.innerHTML = model.primary.iconMarkup("sigian-sigil-icon");
    cast.appendChild(badge);
  }

  function ensureForgeSession() {
    if (forgeSession) return forgeSession;
    const persisted = A.loadSigianForgeDraft?.();
    forgeSession = A.createSigianForgeSession?.({ draft:persisted || undefined }) || null;
    return forgeSession;
  }

  function forgePreviewCard(recipe, analysis = null) {
    const stats = recipe.stats || {};
    const calculatedCost = Math.max(0, Number(analysis?.minimumLevel || 0));
    const requestedCost = forgeTargetCost === "auto" ? null : Math.max(1, Number(forgeTargetCost || 1));
    const displayedCost = requestedCost ?? calculatedCost;
    return {
      id:recipe.id,
      name:recipe.presentation?.name || t("forge.title"),
      school:recipe.school,
      type:recipe.type,
      attack:recipe.type === "creature" ? Number(stats.attack || 0) : 0,
      health:recipe.type === "creature" ? Number(stats.health || 1) : 0,
      hp:recipe.type === "creature" ? Number(stats.health || 1) : 0,
      level:displayedCost,
      cost:displayedCost,
      __forgeCalculatedCost:calculatedCost,
      __forgeRequestedCost:requestedCost,
      text:"",
      keyword:"",
      set:"custom",
      art:recipe.presentation?.art || "",
      imageKey:recipe.presentation?.imageKey ?? null,
      formulaRecipe:recipe,
      __forgePreview:true
    };
  }

  function forgeCollectibleSummary(definition) {
    const values = definition.intensityValues || [];
    if (values.length > 1) return `${t("forge.intensity")}: ${values.join(" · ")}`;
    if (values.length === 1 && Number(values[0]) !== 0) return `${t("forge.intensity")}: ${values[0]}`;
    if (definition.family?.includes("power") && values.length === 1 && Number(values[0]) === 0) {
      return t("forge.scalingBuiltIn");
    }
    return definition.atomic ? t("forge.atomicSigil") : "";
  }

  function forgeSigilTileMarkup(definition, disabled) {
    const baseSigilId = definition.baseSigilId || definition.id;
    const name = definition.displayName || sigianCanonicalSigilName({ sigilId:baseSigilId, grade:definition.grade || 1 });
    const dataAttribute = definition.baseSigilId
      ? `data-forge-add-collectible="${escapeHtml(definition.id)}"`
      : `data-forge-add-sigil="${escapeHtml(definition.id)}"`;
    return `<button type="button" class="forge-sigil-tile" ${dataAttribute} ${disabled ? "disabled" : ""}>
      <span class="forge-sigil-tile-icon">${sigianCanonicalSigilIconMarkup(baseSigilId, "sigian-sigil-icon")}</span>
      <span class="forge-sigil-tile-copy"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(forgeCollectibleSummary(definition))}</small></span>
      <span class="forge-sigil-tile-action">${escapeHtml(t("forge.imprint"))}</span>
    </button>`;
  }

  function forgeMathNumber(value, digits = 1) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "—";
    return numeric.toLocaleString("it-IT", {
      minimumFractionDigits:digits,
      maximumFractionDigits:digits
    });
  }

  function forgeSignedMath(value, digits = 1) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "—";
    const prefix = numeric > 0 ? "+" : "";
    return `${prefix}${forgeMathNumber(numeric, digits)}`;
  }

  function forgeSigilContribution(analysis, slotId) {
    return analysis?.math?.sigilContributions?.find(item => item.slotId === slotId) || null;
  }

  function forgeInteractionLabel(kind) {
    const key = ({
      "attack-x-total-assault":"forge.math.interaction.totalAssault",
      "durability-x-regeneration":"forge.math.interaction.regeneration",
      "protection-x-regeneration":"forge.math.interaction.protectionRegeneration",
      "arcane-attack-x-channeling":"forge.math.interaction.arcaneChanneling",
      "area-damage-x-absorption":"forge.math.interaction.areaAbsorption",
      "body-x-rebirth":"forge.math.interaction.rebirthBody",
      "stacking":"forge.math.interaction.stacking"
    })[kind];
    if (!key) return String(kind || "").replaceAll("-", " ");
    const label = t(key);
    return label === key ? String(kind || "").replaceAll("-", " ") : label;
  }

  function forgeMathBreakdownMarkup(analysis) {
    const math = analysis?.math;
    const breakdown = math?.breakdown;
    if (!math || !breakdown) return "";
    const rows = [
      [t("forge.math.body"), breakdown.body],
      [t("forge.math.sigils"), breakdown.sigilSubtotal],
      [t("forge.math.scope"), breakdown.scopeSubtotal],
      [t("forge.math.sameSchoolRefund"), breakdown.sameSchoolRefundSubtotal],
      [t("forge.math.interactions"), breakdown.interactionSubtotal],
      [t("forge.math.stacking"), breakdown.stacking?.total],
      [t("forge.math.schoolAdjustment"), breakdown.schoolAdjustment?.value],
      [t("forge.math.malusCredit"), -Number(breakdown.malusCredit?.total || 0)]
    ].filter(([,value]) => Number.isFinite(Number(value)) && Math.abs(Number(value)) > 0.0001);

    const interactions = [
      ...(breakdown.interactions || []),
      ...(breakdown.stacking?.details || [])
    ];

    return `<div class="forge-math-details">
      <div class="forge-math-breakdown">
        ${rows.map(([label,value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(forgeSignedMath(value))} AV</strong></div>`).join("")}
        <div class="forge-math-total"><span>${escapeHtml(t("forge.math.total"))}</span><strong>${escapeHtml(forgeMathNumber(math.arcaneValue))} AV</strong></div>
      </div>
      <div class="forge-math-interactions">
        <strong>${escapeHtml(t("forge.math.activeInteractions"))}</strong>
        ${interactions.length
          ? interactions.map(item => `<span>${escapeHtml(forgeInteractionLabel(item.kind))}<b>${escapeHtml(forgeSignedMath(item.value))} AV</b></span>`).join("")
          : `<small>${escapeHtml(t("forge.math.noInteractions"))}</small>`}
      </div>
      <small class="forge-math-provisional">${escapeHtml(t("forge.math.provisional"))}</small>
    </div>`;
  }

  function forgeBudgetMarkup(recipe, analysis) {
    const math = analysis?.math;
    if (!math) {
      return `<div class="forge-balance-status is-warning">
        <strong>${escapeHtml(t("forge.balancePending"))}</strong>
        ${analysis?.mathError ? `<span>${escapeHtml(analysis.mathError)}</span>` : ""}
        ${analysis?.sealBlockers?.includes("spell-requires-sigil") ? `<span>${escapeHtml(t("forge.spellNeedsSigil"))}</span>` : ""}
      </div>`;
    }

    const avPercent = Math.max(0, Math.min(100, Number(math.utilization || 0) * 100));
    const previousPercent = Math.max(0, Math.min(100, Number(math.previousMarker || 0) * 100));
    const target = forgeTargetCost === "auto" ? null : Math.max(1, Number(forgeTargetCost || 1));
    const targetCap = target ? Number(A.sigianForgeCapForLevel?.(target)) : null;
    const targetDelta = target && Number.isFinite(targetCap) ? targetCap - Number(math.arcaneValue) : null;
    const targetOptions = [
      `<option value="auto" ${forgeTargetCost === "auto" ? "selected" : ""}>${escapeHtml(t("forge.math.auto"))}</option>`,
      ...Array.from({ length:20 }, (_,index) => index + 1).map(level =>
        `<option value="${level}" ${Number(forgeTargetCost) === level ? "selected" : ""}>${escapeHtml(String(level))}</option>`
      )
    ].join("");

    return `<section class="forge-math-panel" aria-label="${escapeHtml(t("forge.math.title"))}">
      <div class="forge-math-head">
        <div class="forge-math-cost">
          <small>${escapeHtml(t("forge.math.calculatedCost"))}</small>
          <strong>${escapeHtml(math.minimumLevel)}</strong>
          <span>${escapeHtml(t("forge.math.powerRequired", { cost:math.resourceCost, school:schoolName(recipe.school) }))}</span>
        </div>
        <div class="forge-math-av">
          <small>${escapeHtml(t("forge.math.arcaneValue"))}</small>
          <strong>${escapeHtml(forgeMathNumber(math.arcaneValue))} <span>/ ${escapeHtml(forgeMathNumber(math.currentCap))}</span></strong>
          <span>${escapeHtml(t("forge.math.margin"))}: ${escapeHtml(forgeMathNumber(math.margin))} AV</span>
        </div>
        <label class="forge-math-target">
          <span>${escapeHtml(t("forge.math.targetCost"))}</span>
          <select id="forgeTargetCostSelect" data-forge-target-cost>${targetOptions}</select>
        </label>
      </div>

      <div class="forge-budget-track" aria-label="${escapeHtml(t("forge.math.budgetBar"))}">
        <div class="forge-budget-fill" style="width:${avPercent}%"></div>
        ${math.previousLevel ? `<span class="forge-budget-previous" style="left:${previousPercent}%"><i></i><small>Cap ${math.previousLevel}</small></span>` : ""}
        <span class="forge-budget-current" style="left:${avPercent}%"><i></i><small>AV ${escapeHtml(forgeMathNumber(math.arcaneValue))}</small></span>
      </div>

      <div class="forge-budget-thresholds">
        <span>${math.previousLevel ? `Cap ${math.previousLevel}: <b>${escapeHtml(forgeMathNumber(math.previousCap))}</b>` : "—"}</span>
        <span>Cap ${math.currentLevel}: <b>${escapeHtml(forgeMathNumber(math.currentCap))}</b></span>
        <span>Cap ${math.nextLevel}: <b>${escapeHtml(forgeMathNumber(math.nextCap))}</b></span>
      </div>

      ${target ? `<div class="forge-target-status ${targetDelta >= 0 ? "is-within" : "is-over"}">
        <strong>${escapeHtml(t("forge.math.targetCost"))} ${target}</strong>
        <span>${targetDelta >= 0
          ? escapeHtml(t("forge.math.targetRemaining", { value:forgeMathNumber(targetDelta) }))
          : escapeHtml(t("forge.math.targetExceeded", { value:forgeMathNumber(Math.abs(targetDelta)), cost:math.minimumLevel }))}</span>
      </div>` : ""}

      <div class="forge-math-mode">
        <button type="button" data-forge-math-mode="simple" class="${forgeMathMode === "simple" ? "active" : ""}">${escapeHtml(t("forge.math.simple"))}</button>
        <button type="button" data-forge-math-mode="detailed" class="${forgeMathMode === "detailed" ? "active" : ""}">${escapeHtml(t("forge.math.detailed"))}</button>
      </div>

      ${forgeMathMode === "detailed" ? forgeMathBreakdownMarkup(analysis) : ""}
      ${analysis?.sealBlockers?.includes("spell-requires-sigil") ? `<p class="forge-math-warning">${escapeHtml(t("forge.spellNeedsSigil"))}</p>` : ""}
    </section>`;
  }

  function forgeQuickBalanceMarkup(recipe, analysis) {
    const math = analysis?.math;
    const calculated = Math.max(0, Number(analysis?.minimumLevel || 0));
    const target = forgeTargetCost === "auto" ? null : Math.max(1, Number(forgeTargetCost || 1));
    return `<section class="forge-quick-balance" aria-label="${escapeHtml(t("forge.math.title"))}">
      <span><small>${escapeHtml(t("forge.math.calculatedCost"))}</small><strong>${escapeHtml(calculated)}</strong></span>
      <span><small>${escapeHtml(t("forge.math.arcaneValue"))}</small><strong>${math ? `${escapeHtml(forgeMathNumber(math.arcaneValue))} / ${escapeHtml(forgeMathNumber(math.currentCap))}` : "—"}</strong></span>
      <span><small>${escapeHtml(t("forge.math.targetCost"))}</small><strong>${target == null ? "Auto" : escapeHtml(target)}</strong></span>
    </section>`;
  }

  function forgeStructureSummaryMarkup(recipe, analysis, inventoryReadOnly, inventoryFormula) {
    const constraint = recipe.constraint;
    const canonicalSigils = inventoryReadOnly
      ? (inventoryFormula?.components || []).filter(item => item.kind === "sigil")
      : recipe.sigils;
    const canonicalConstraint = inventoryReadOnly
      ? (inventoryFormula?.components || []).find(item => item.kind === "constraint")
      : constraint;
    const rows = [
      [t("forge.name"), recipe.presentation?.name || t("forge.newFormula")],
      [t("forge.type"), recipe.type === "spell" ? t("ui.spell") : t("ui.creature")],
      [t("forge.school"), schoolName(recipe.school)],
      ...(recipe.type === "creature" ? [
        [t("forge.attack"), recipe.stats?.attack ?? 0],
        [t("forge.health"), recipe.stats?.health ?? 1]
      ] : []),
      [t("forge.sigils"), `${canonicalSigils.length} / ${A.SIGIAN_MAX_PRIMARY_SIGILS || 3}`],
      [t("sigian.constraint.global"), canonicalConstraint ? (canonicalConstraint.name || sigianV2ComponentDisplayName({ kind:"constraint", ...canonicalConstraint })) : t("sigian.constraint.none")]
    ];
    return `<div class="forge-structure-summary">
      ${rows.map(([label,value]) => `<div><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`).join("")}
      ${inventoryReadOnly ? "" : `<p class="forge-card-first-hint">Modifica la Formula direttamente toccando o cliccando gli elementi della carta.</p>`}
    </div>`;
  }

  function forgeSigilSlotsMarkup(recipe, analysis) {
    const max = A.SIGIAN_MAX_PRIMARY_SIGILS || 3;
    const slots = Array.from({ length:max }, (_,index) => {
      const sigil = recipe.sigils[index] || null;
      if (!sigil) {
        return `<button type="button" class="forge-context-sigil-slot is-empty" data-forge-empty-sigil-slot="${index}">
          <span aria-hidden="true">＋</span><strong>${escapeHtml(t("forge.imprint"))}</strong><small>${index + 1} / ${max}</small>
        </button>`;
      }
      const collectible = sigil.collectibleId ? A.getSigianCollectibleSigil?.(sigil.collectibleId) : null;
      const name = collectible?.displayName || sigianCanonicalSigilName(sigil);
      const contribution = forgeSigilContribution(analysis, sigil.slotId);
      return `<button type="button" class="forge-context-sigil-slot ${forgeSelectedSigilSlotId === sigil.slotId ? "is-selected" : ""}" data-forge-select-sigil="${escapeHtml(sigil.slotId)}">
        <span class="forge-context-sigil-icon">${sigianCanonicalSigilIconMarkup(collectible?.baseSigilId || sigil.sigilId, "sigian-sigil-icon")}</span>
        <strong>${escapeHtml(name)}</strong>
        <small>${Number(sigil.grade) ? `Grado ${sigianRomanGrade(Number(sigil.grade))}` : ""}${contribution ? ` · ${escapeHtml(forgeSignedMath(contribution.net))} AV` : ""}</small>
      </button>`;
    }).join("");
    return `<div class="forge-context-sigil-slots">${slots}</div>`;
  }

  function forgeConstraintSummaryMarkup(recipe) {
    const current = recipe.constraint || null;
    if (!current) {
      return `<button type="button" class="forge-context-constraint-empty" data-forge-open-constraint-picker>
        <span class="forge-context-constraint-orb is-neutral" aria-hidden="true">◇</span>
        <span><strong>＋ ${escapeHtml(t("archive.constraint"))}</strong><small>${escapeHtml(t("sigian.constraint.none"))}</small></span>
      </button>`;
    }
    const name = sigianV2ComponentDisplayName({ kind:"constraint", ...current });
    return `<div class="forge-context-constraint-current">
      <span class="forge-context-constraint-orb ${current.school ? `school-${escapeHtml(current.school)}` : "is-neutral"}" aria-hidden="true">◇</span>
      <span><strong>${escapeHtml(name)}</strong><small>${current.school ? escapeHtml(schoolName(current.school)) : escapeHtml(t("sigian.constraint.global"))}</small></span>
      <button type="button" class="classic-stone-button ghost" data-forge-remove-constraint>${escapeHtml(t("forge.remove"))}</button>
    </div>`;
  }

  function forgeSigilCatalogMarkup(activeSigils, atSigilLimit) {
    return `<div class="forge-catalog-section">
      <p class="forge-catalog-note">${escapeHtml(t("forge.catalogNotice"))}</p>
      ${atSigilLimit ? `<p class="forge-limit-note">${escapeHtml(t("forge.maxSigils"))}</p>` : ""}
      <div class="forge-sigil-grid">${activeSigils.map(definition => forgeSigilTileMarkup(definition, atSigilLimit)).join("")}</div>
    </div>`;
  }

  function forgeWorkspaceBodyMarkup(recipe, analysis, activeSigils, atSigilLimit) {
    if (forgeCardEditorSection === "sigils") {
      const selected = recipe.sigils.find(item => item.slotId === forgeSelectedSigilSlotId);
      if (selected) {
        return `<div class="forge-context-workspace-stack">
          <button type="button" class="forge-context-back" data-forge-close-modeler>← ${escapeHtml(t("forge.sigils"))}</button>
          ${forgeSigilModelerMarkup(recipe, selected, analysis)}
        </div>`;
      }
      return forgeSigilCatalogMarkup(activeSigils, atSigilLimit);
    }
    if (forgeCardEditorSection === "constraint") return forgeGlobalConstraintMarkup(recipe);
    if (forgeCardEditorSection === "cost") return forgeBudgetMarkup(recipe, analysis);
    return `<div class="forge-context-idle">
      <strong>Forgia card-first</strong>
      <p>Seleziona Nome, Scuola, Costo, Attacco, Vita, Sigilli o Vincolo direttamente sulla carta. Il tipo Creatura/Magia cambia con un singolo tocco.</p>
      ${forgeQuickBalanceMarkup(recipe, analysis)}
    </div>`;
  }

  function forgeCardEditorMarkup(recipe, analysis, activeSigils, atSigilLimit) {
    if (!forgeCardEditorSection) return "";
    if (recipe.type !== "creature" && (forgeCardEditorSection === "attack" || forgeCardEditorSection === "health")) {
      forgeCardEditorSection = null;
      return "";
    }

    const section = forgeCardEditorSection;
    const titleMap = {
      name:t("forge.name"),
      school:t("forge.school"),
      attack:t("forge.attack"),
      health:t("forge.health"),
      cost:t("ui.cost"),
      sigils:t("forge.sigils"),
      constraint:t("sigian.constraint.global")
    };
    const complex = section === "sigils" || section === "constraint";
    const header = `<div class="forge-card-editor-heading">
      <strong>${escapeHtml(titleMap[section] || section)}</strong>
      <button type="button" class="forge-card-editor-close" data-forge-card-editor-close aria-label="Chiudi">×</button>
    </div>`;

    let body = "";
    if (section === "name") {
      body = `<label class="forge-model-field forge-card-name-field"><span>${escapeHtml(t("forge.name"))}</span><input data-forge-name-input data-forge-autofocus type="text" maxlength="48" value="${escapeHtml(recipe.presentation?.name || "")}"></label>`;
    } else if (section === "school") {
      body = `<div class="forge-school-grid forge-card-editor-schools">${(A.listSigianSchools?.({ status:"active" }) || []).map(school => `
        <button type="button" class="forge-school-button ${recipe.school === school.id ? "active" : ""}" data-forge-school="${escapeHtml(school.id)}" aria-pressed="${recipe.school === school.id}">
          ${schoolIconMarkup(school.id, "school-icon-svg forge-school-icon")}
          <span>${escapeHtml(schoolName(school.id))}</span>
        </button>`).join("")}</div>`;
    } else if (section === "attack" || section === "health") {
      const key = section;
      const min = key === "attack" ? 0 : 1;
      const value = Number(recipe.stats?.[key] ?? min);
      body = `<div class="forge-card-stat-editor">
        <button type="button" data-forge-stat="${key}" data-delta="-1" aria-label="-1">−</button>
        <input data-forge-stat-input="${key}" data-forge-autofocus type="number" min="${min}" value="${escapeHtml(value)}" aria-label="${escapeHtml(titleMap[key])}">
        <button type="button" data-forge-stat="${key}" data-delta="1" aria-label="+1">+</button>
      </div>`;
    } else if (section === "cost") {
      const auto = forgeTargetCost === "auto";
      const target = auto ? Math.max(1, Number(analysis?.minimumLevel || 1)) : Math.max(1, Number(forgeTargetCost || 1));
      body = `<div class="forge-card-cost-editor">
        <div class="forge-cost-mode" role="group" aria-label="${escapeHtml(t("forge.math.targetCost"))}">
          <button type="button" data-forge-cost-mode="auto" class="${auto ? "active" : ""}">Auto</button>
          <button type="button" data-forge-cost-mode="target" class="${!auto ? "active" : ""}">Target</button>
        </div>
        ${auto ? `<div class="forge-cost-auto-value"><small>${escapeHtml(t("forge.math.calculatedCost"))}</small><strong>${escapeHtml(analysis?.minimumLevel ?? 0)}</strong></div>` : `
          <div class="forge-card-stat-editor forge-target-cost-stepper">
            <button type="button" data-forge-cost-step="-1" aria-label="-1">−</button>
            <input data-forge-cost-input data-forge-autofocus type="number" min="1" step="1" value="${escapeHtml(target)}">
            <button type="button" data-forge-cost-step="1" aria-label="+1">+</button>
          </div>`}
        ${forgeQuickBalanceMarkup(recipe, analysis)}
        <button type="button" class="forge-balance-details-toggle" data-forge-math-mode="${forgeMathMode === "detailed" ? "simple" : "detailed"}">${forgeMathMode === "detailed" ? "Nascondi dettagli" : "Dettagli bilanciamento"}</button>
        ${forgeMathMode === "detailed" ? forgeMathBreakdownMarkup(analysis) : ""}
      </div>`;
    } else if (section === "sigils") {
      body = `<div class="forge-card-sigil-editor">
        <div class="forge-current-sigils-heading"><strong>${escapeHtml(t("forge.sigils"))}</strong><small>${escapeHtml(t("forge.sigilCount", { count:recipe.sigils.length }))}</small></div>
        ${forgeSigilSlotsMarkup(recipe, analysis)}
      </div>`;
    } else if (section === "constraint") {
      body = forgeConstraintSummaryMarkup(recipe);
    }

    const mobileWorkspace = complex
      ? `<div class="forge-context-mobile-workspace">${forgeWorkspaceBodyMarkup(recipe, analysis, activeSigils, atSigilLimit)}</div>`
      : "";

    return `<section class="forge-card-editor ${complex ? "is-complex" : "is-compact"}" data-forge-card-editor="${escapeHtml(section)}">${header}<div class="forge-card-editor-body">${body}${mobileWorkspace}</div></section>`;
  }


  function forgeGlobalConstraintMarkup(recipe) {
    const current = recipe.constraint || null;
    const definitions = (A.listSigianCanonicalV2?.({ kind:"constraint" }) || [])
      .filter(item => item.status === "approved" && item.selectable !== false);
    const options = [
      `<option value="">${escapeHtml(t("sigian.constraint.none"))}</option>`,
      ...definitions.map(definition =>
        `<option value="${escapeHtml(definition.id)}" ${current?.definitionId === definition.id ? "selected" : ""}>${escapeHtml(sigianV2ComponentBaseName(definition.id, definition.name))}</option>`
      )
    ].join("");

    const definition = current ? A.getSigianCanonicalV2?.(current.definitionId) : null;
    const schoolBound = Boolean(definition && /<Scuola>/i.test(String(definition.name || "")));
    const gradeLess = Boolean(definition && /senza Gradi/i.test(String(definition.grades || "")));
    const schoolControl = current && schoolBound
      ? `<label class="forge-model-field">
          <span>${escapeHtml(t("forge.school"))}</span>
          <select data-forge-constraint-school>
            ${(A.listSigianSchools?.({ status:"active" }) || []).map(school =>
              `<option value="${escapeHtml(school.id)}" ${current.school === school.id ? "selected" : ""}>${escapeHtml(schoolName(school.id))}</option>`
            ).join("")}
          </select>
        </label>`
      : "";
    const gradeControl = current && !gradeLess
      ? `<label class="forge-model-field">
          <span>${escapeHtml(t("archive.grade"))}</span>
          <select data-forge-constraint-grade>
            ${[1,2,3,4,5].map(grade => `<option value="${grade}" ${Number(current.grade || 1) === grade ? "selected" : ""}>${sigianRomanGrade(grade)}</option>`).join("")}
          </select>
        </label>`
      : "";

    return `
      <section class="forge-global-constraint">
        <div class="forge-current-sigils-heading">
          <strong>${escapeHtml(t("sigian.constraint.global"))}</strong>
          <small>${current ? "1 / 1" : "0 / 1"}</small>
        </div>
        <p class="forge-constraint-hint">${escapeHtml(t("forge.constraintHint"))}</p>
        <label class="forge-model-field forge-constraint-select">
          <span>${escapeHtml(t("archive.constraint"))}</span>
          <select data-forge-constraint-select>${options}</select>
        </label>
        ${current ? `
          <div class="forge-constraint-current">
            <span class="forge-constraint-current-orb ${current.school ? `school-${escapeHtml(current.school)}` : "is-neutral"}" aria-hidden="true">◇</span>
            <span>
              <strong>${escapeHtml(sigianV2ComponentDisplayName({ kind:"constraint", ...current }))}</strong>
              <small>${escapeHtml(definition?.summary || current.detail || "")}</small>
            </span>
            <button type="button" class="classic-stone-button ghost" data-forge-remove-constraint>${escapeHtml(t("forge.remove"))}</button>
          </div>
          <div class="forge-constraint-controls">${schoolControl}${gradeControl}</div>
        ` : ""}
      </section>`;
  }

  function forgeCurrentSigilsMarkup(recipe, analysis) {
    if (!recipe.sigils.length) return `<p class="forge-empty-note">${escapeHtml(t("forge.emptySigils"))}</p>`;
    return recipe.sigils.map(sigil => {
      const collectible = sigil.collectibleId ? A.getSigianCollectibleSigil?.(sigil.collectibleId) : null;
      const name = collectible?.displayName || sigianCanonicalSigilName(sigil);
      const detail = collectible
        ? (sigil.intensity != null && Number(sigil.intensity) !== 0 ? `${t("forge.intensity")} ${sigil.intensity}` : forgeCollectibleSummary(collectible))
        : (Number(sigil.grade) === 1 ? t("forge.gradeOne") : `Grado ${sigil.grade}`);
      const contribution = forgeSigilContribution(analysis, sigil.slotId);
      return `
      <div class="forge-current-sigil ${forgeSelectedSigilSlotId === sigil.slotId ? "is-selected" : ""}"
           data-forge-select-sigil="${escapeHtml(sigil.slotId)}"
           role="button"
           tabindex="0"
           aria-pressed="${forgeSelectedSigilSlotId === sigil.slotId}">
        <span class="forge-current-sigil-icon">${sigianCanonicalSigilIconMarkup(collectible?.baseSigilId || sigil.sigilId, "sigian-sigil-icon")}</span>
        <span class="forge-current-sigil-copy">
          <strong>${escapeHtml(name)}</strong>
          <small>${escapeHtml(detail)}</small>
          ${contribution ? `<em>${escapeHtml(forgeSignedMath(contribution.net))} AV</em>` : ""}
        </span>
        <button type="button" class="classic-stone-button ghost forge-remove-sigil" data-forge-remove-sigil="${escapeHtml(sigil.slotId)}">${escapeHtml(t("forge.remove"))}</button>
      </div>
    `;
    }).join("");
  }

  function forgeModifierLabel(modifierId) {
    const keys = {
      "scale-power-half":"forge.mod.scalePowerHalf",
      "scale-power":"forge.mod.scalePower",
      "scale-power-double":"forge.mod.scalePowerDouble",
      "scale-target-attack":"forge.mod.scaleTargetAttack",
      "scale-full-health":"forge.mod.scaleFullHealth",
      "scale-creature-count":"forge.mod.scaleCreatureCount",
      "scale-damage-dealt":"forge.mod.scaleDamageDealt",
      "activation-power-threshold":"forge.mod.activationPowerThreshold",
      "activation-power-comparison":"forge.mod.activationPowerComparison",
      "activation-on-any-death":"forge.mod.activationAnyDeath",
      "constraint-friendly-fire":"forge.mod.friendlyFire",
      "constraint-friendly-fire-power-threshold":"forge.mod.friendlyFireThreshold",
      "selector-highest-life":"forge.mod.highestLife",
      "selector-highest-attack":"forge.mod.highestAttack"
    };
    const key = keys[modifierId];
    return key ? t(key) : String(modifierId || "").replaceAll("-", " ");
  }

  function forgeFamilyLabel(family) {
    const key = `forge.family.${family}`;
    const label = t(key);
    return label === key ? family : label;
  }

  function forgeOptionLabel(key, value, sigil) {
    if (key === "when") return sigianTriggerLabel(value);
    if (key === "reaction") return value === "damaged" ? t("sigian.trigger.damaged") : (value === "attacked" ? t("forge.option.attacked") : value);
    if (key === "school") return schoolName(value);
    if (key === "target") {
      return ({
        "enemy-hero":t("sigian.modifier.enemyMage"),
        "enemy-creature":t("sigian.modifier.enemyCreature"),
        "self-hero":t("sigian.modifier.ownMage"),
        "allied-creature":t("sigian.modifier.alliedCreatures"),
        "source":t("sigian.modifier.thisCreature"),
        "event-source":t("sigian.modifier.eventSource")
      })[value] || value;
    }
    if (key === "selector") return value === "strongest-attack" ? t("sigian.modifier.highestAttack") : t("sigian.modifier.highestLife");
    if (key === "scope") {
      if (value === "field") return sigil.sigilId === "restoration" ? t("sigian.modifier.alliedCreatures") : t("sigian.scope.enemyField");
      if (value === "front") return sigil.sigilId === "restoration" ? t("sigian.scope.alliedFront") : t("sigian.scope.frontEnemies");
      return ({
        "power":t("forge.option.onePower"),
        "all-powers":t("forge.option.allPowers"),
        "enemy-field":t("sigian.scope.enemyField"),
        "all-field":t("sigian.modifier.allCreatures")
      })[value] || value;
    }
    if (key === "side" || key.endsWith("Side")) return value === "enemy" ? t("forge.option.enemy") : t("forge.option.self");
    if (key === "op") return ({ lt:"<", lte:"≤", gt:">", gte:"≥", eq:"=", neq:"≠" })[value] || value;
    const labels = {
      halve:t("forge.option.halve"),
      subtract:t("forge.option.subtract"),
      multiplier:t("forge.option.multiplier"),
      flat:t("forge.option.flat"),
      "hero":t("forge.option.hero"),
      "hero-and-creatures":t("forge.option.heroAndCreatures"),
      "per-copy":t("forge.option.perCopy"),
      presence:t("forge.option.presence"),
      creature:t("forge.option.creature"),
      any:t("forge.option.any"),
      source:t("forge.option.source"),
      "self-hero":t("sigian.modifier.ownMage"),
      "own-hero":t("sigian.modifier.ownMage")
    };
    return labels[value] || String(value);
  }

  function forgeAffinityLabel(affinity) {
    if (!affinity) return t("forge.affinityLegacy");
    if (affinity.mode === "universal") return t("forge.affinityUniversal");
    const modeKey = `forge.affinity.${affinity.mode}`;
    const mode = t(modeKey) === modeKey ? affinity.mode : t(modeKey);
    const schools = (affinity.schools || []).map(schoolName).join(" · ");
    return schools ? `${mode} · ${schools}` : mode;
  }

  function forgeSchemaControlMarkup(sigil, key, schema, value, dataAttrs) {
    const labelKey = `forge.config.${key}`;
    const rawLabel = t(labelKey);
    const label = rawLabel === labelKey ? key : rawLabel;
    if (Array.isArray(schema)) {
      const options = schema.map(option => `<option value="${escapeHtml(option)}" ${String(value) === String(option) ? "selected" : ""}>${escapeHtml(forgeOptionLabel(key, option, sigil))}</option>`).join("");
      return `<label class="forge-model-field"><span>${escapeHtml(label)}</span><select ${dataAttrs}>${options}</select></label>`;
    }
    if (schema === "school") {
      const options = (A.listSigianSchools?.({ status:"active" }) || []).map(school =>
        `<option value="${escapeHtml(school.id)}" ${String(value) === String(school.id) ? "selected" : ""}>${escapeHtml(schoolName(school.id))}</option>`
      ).join("");
      return `<label class="forge-model-field"><span>${escapeHtml(label)}</span><select ${dataAttrs}>${options}</select></label>`;
    }
    if (schema === "schools") {
      const activeSchools = A.listSigianSchools?.({ status:"active" }) || [];
      const all = value === "all";
      const selected = all ? [] : (Array.isArray(value) ? value : []);
      const count = all ? "all" : String(Math.max(1, Math.min(3, selected.length || 1)));
      const countOptions = [
        ["1", t("forge.option.oneSchool")],
        ["2", t("forge.option.twoSchools")],
        ["3", t("forge.option.threeSchools")],
        ["all", t("forge.option.allSchools")]
      ].map(([option, optionLabel]) => `<option value="${option}" ${count === option ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`).join("");
      const schoolButtons = activeSchools.map(school => {
        const checked = all || selected.includes(school.id);
        return `<button type="button" class="forge-school-choice ${checked ? "active" : ""}" data-forge-school-choice="${escapeHtml(school.id)}" data-forge-slot="${escapeHtml(sigil.slotId)}" ${all ? "disabled" : ""}>${schoolIconMarkup(school.id, "school-icon-svg forge-school-choice-icon")}<span>${escapeHtml(schoolName(school.id))}</span></button>`;
      }).join("");
      return `<div class="forge-model-field forge-schools-field">
        <label><span>${escapeHtml(t("forge.config.scope"))}</span><select data-forge-schools-count data-forge-slot="${escapeHtml(sigil.slotId)}">${countOptions}</select></label>
        <div class="forge-school-choice-grid">${schoolButtons}</div>
      </div>`;
    }
    if (schema === "number") {
      return `<label class="forge-model-field"><span>${escapeHtml(label)}</span><input type="number" step="1" value="${value == null ? "" : escapeHtml(value)}" ${dataAttrs}></label>`;
    }
    return "";
  }

  function forgeSigilModelerMarkup(recipe, sigil, analysis) {
    if (!sigil) return "";
    const definition = A.getCanonicalSigil?.(sigil.sigilId);
    if (!definition) return "";
    const collectible = sigil.collectibleId ? A.getSigianCollectibleSigil?.(sigil.collectibleId) : null;
    const hiddenConfigKeys = new Set(collectible?.hiddenConfigKeys || []);
    const hiddenModifierFamilies = new Set(collectible?.hiddenModifierFamilies || []);
    const configFields = Object.entries(definition.configSchema || {}).filter(([key]) => !hiddenConfigKeys.has(key)).map(([key, schema]) =>
      forgeSchemaControlMarkup(
        sigil,
        key,
        schema,
        sigil.config?.[key],
        `data-forge-config-key="${escapeHtml(key)}" data-forge-slot="${escapeHtml(sigil.slotId)}"`
      )
    ).join("");

    const modifierFamilies = (definition.modifierFamilies || []).filter(family => !hiddenModifierFamilies.has(family)).map(family => {
      const allowed = (definition.modifierOptions?.[family] || []).filter(id => A.getSigianAdvancedModifier?.(id)?.status === "active");
      if (!allowed.length) return "";
      const current = (sigil.modifiers || []).find(item => A.getSigianAdvancedModifier?.(item.id)?.family === family) || null;
      const options = [
        `<option value="">${escapeHtml(t("forge.noModifier"))}</option>`,
        ...allowed.map(id => `<option value="${escapeHtml(id)}" ${current?.id === id ? "selected" : ""}>${escapeHtml(forgeModifierLabel(id))}</option>`)
      ].join("");
      const params = current ? Object.entries(A.getSigianAdvancedModifier(current.id)?.paramsSchema || {}).map(([key, schema]) =>
        forgeSchemaControlMarkup(
          sigil,
          key,
          schema,
          current.params?.[key],
          `data-forge-modifier-param="${escapeHtml(key)}" data-forge-modifier-family="${escapeHtml(family)}" data-forge-slot="${escapeHtml(sigil.slotId)}"`
        )
      ).join("") : "";

      return `<div class="forge-modifier-family">
        <label class="forge-model-field">
          <span>${escapeHtml(forgeFamilyLabel(family))}</span>
          <select data-forge-modifier-family="${escapeHtml(family)}" data-forge-slot="${escapeHtml(sigil.slotId)}">${options}</select>
        </label>
        ${params ? `<div class="forge-model-params">${params}</div>` : ""}
      </div>`;
    }).join("");

    const gradeOptions = definition.atomic
      ? `<option value="1" selected>${escapeHtml(t("forge.gradeOne"))}</option>`
      : [1,2,3].map(grade => `<option value="${grade}" ${Number(sigil.grade) === grade ? "selected" : ""}>Grado ${grade === 1 ? "I" : grade === 2 ? "II" : "III"}</option>`).join("");
    const intensityValues = collectible?.intensityValues || [];
    const currentContribution = forgeSigilContribution(analysis, sigil.slotId);
    const currentFormulaValue = Number(analysis?.math?.arcaneValue);

    const intensityMarkup = intensityValues.length > 1
      ? `<div class="forge-model-field forge-intensity-field">
          <span>${escapeHtml(t("forge.intensity"))}</span>
          <div class="forge-intensity-options">${intensityValues.map(value => {
            let deltaMarkup = "";
            if (Number.isFinite(currentFormulaValue) && Number(value) !== Number(sigil.intensity) && typeof A.previewSigianForgeIntensity === "function") {
              try {
                const preview = A.previewSigianForgeIntensity(recipe, sigil.slotId, value);
                const delta = Number(preview.arcaneValue) - currentFormulaValue;
                const costChanged = Number(preview.minimumLevel) !== Number(analysis?.minimumLevel);
                deltaMarkup = `<small>${escapeHtml(forgeSignedMath(delta))} AV${costChanged ? ` · C${analysis?.minimumLevel}→${preview.minimumLevel}` : ""}</small>`;
              } catch {}
            } else if (Number(value) === Number(sigil.intensity)) {
              deltaMarkup = `<small>${escapeHtml(t("forge.math.current"))}</small>`;
            }
            return `<button type="button" class="${Number(sigil.intensity) === Number(value) ? "active" : ""}" data-forge-intensity="${escapeHtml(value)}" data-forge-slot="${escapeHtml(sigil.slotId)}"><b>${escapeHtml(value)}</b>${deltaMarkup}</button>`;
          }).join("")}</div>
        </div>`
      : "";

    const modelName = collectible?.displayName || sigianCanonicalSigilName(sigil);
    const configSection = configFields
      ? `<div class="forge-model-section"><h4>${escapeHtml(t("forge.baseConfig"))}</h4><div class="forge-model-grid">${configFields}</div></div>`
      : "";
    const modifiersSection = modifierFamilies
      ? `<div class="forge-model-section"><h4>${escapeHtml(t("forge.advancedModifiers"))}</h4><div class="forge-modifier-list">${modifierFamilies}</div></div>`
      : `<div class="forge-model-section forge-model-section-empty"><h4>${escapeHtml(t("forge.advancedModifiers"))}</h4><span class="forge-model-none">${escapeHtml(t("forge.math.noCompatibleModifiers"))}</span></div>`;

    return `<section class="forge-sigil-modeler">
      <div class="forge-modeler-heading">
        <div class="forge-modeler-title">
          <span class="forge-modeler-icon">${sigianCanonicalSigilIconMarkup(collectible?.baseSigilId || sigil.sigilId, "sigian-sigil-icon")}</span>
          <div><small>${escapeHtml(t("forge.math.selectedSigil"))}</small><strong>${escapeHtml(modelName)}</strong></div>
        </div>
        <button type="button" class="classic-stone-button ghost" data-forge-close-modeler>${escapeHtml(t("forge.backToCatalog"))}</button>
      </div>
      <p class="forge-modeling-note">${escapeHtml(t("forge.modelingNotice"))}</p>

      ${currentContribution ? `<div class="forge-modeler-av">
        <span>${escapeHtml(t("forge.math.sigilContribution"))}</span>
        <strong>${escapeHtml(forgeSignedMath(currentContribution.net))} AV</strong>
        ${currentContribution.malusCredit > 0 ? `<small>${escapeHtml(t("forge.math.includesMalusCredit", { value:forgeMathNumber(currentContribution.malusCredit) }))}</small>` : ""}
      </div>` : ""}

      <div class="forge-model-meta">
        <label class="forge-model-field">
          <span>${escapeHtml(t("forge.grade"))}</span>
          ${collectible
            ? (collectible.atomic
              ? `<strong class="forge-locked-grade">${escapeHtml(t("forge.atomicSigil"))}</strong>`
              : `<strong class="forge-locked-grade">Grado ${sigil.grade === 1 ? "I" : sigil.grade === 2 ? "II" : "III"}</strong><small>${escapeHtml(t("forge.gradeLocked"))}</small>`)
            : `<select data-forge-grade data-forge-slot="${escapeHtml(sigil.slotId)}" ${definition.atomic ? "disabled" : ""}>${gradeOptions}</select>`}
        </label>
        <div class="forge-model-field forge-affinity-readonly">
          <span>${escapeHtml(t("forge.affinity"))}</span>
          <strong>${escapeHtml(forgeAffinityLabel(sigil.affinity))}</strong>
          <small>${escapeHtml(t("forge.affinityOwnedCopy"))}</small>
        </div>
      </div>

      ${intensityMarkup}
      ${configSection}
      ${modifiersSection}
    </section>`;
  }


  function forgeInventoryCanonicalComponentsMarkup(formula) {
    const components = formula?.components || [];
    if (!components.length) return `<p class="forge-empty-note">${escapeHtml(t("archive.noComponents"))}</p>`;
    return components.map((component, index) => {
      const name = sigianV2ComponentDisplayName(component);
      const kind = t(component.kind === "constraint" ? "archive.constraint" : "archive.sigil");
      const detail = A.i18n?.getLanguage?.() === "it" ? String(component.detail || "") : "";
      return `
        <div class="forge-current-sigil is-canonical" data-canonical-component="${escapeHtml(component.id || String(index + 1))}">
          <span class="forge-current-sigil-icon">${component.kind === "constraint" ? "◇" : "✦"}</span>
          <span class="forge-current-sigil-copy">
            <strong>${escapeHtml(name)}</strong>
            <small>${escapeHtml(kind)} · Canon</small>
            ${detail ? `<em>${escapeHtml(detail)}</em>` : ""}
          </span>
        </div>
      `;
    }).join("");
  }

  function renderForgePage() {
    const root = $("#forgeContent");
    const session = ensureForgeSession();
    if (!root || !session) return;

    const snapshot = session.snapshot();
    const recipe = snapshot.draft.recipe;
    const analysis = snapshot.analysis;
    const activeSigils = A.listSigianCollectibleSigils?.({ status:"active" })
      || A.listCanonicalSigils?.({ status:"active" })
      || [];
    const atSigilLimit = recipe.sigils.length >= (A.SIGIAN_MAX_PRIMARY_SIGILS || 3);
    const inventoryReadOnly = Boolean(forgeInventoryPreviewCardId);
    const inventoryFormula = inventoryReadOnly ? A.getSigianInventoryFormula?.(forgeInventoryPreviewCardId) : null;

    if (forgeSelectedSigilSlotId && !recipe.sigils.some(item => item.slotId === forgeSelectedSigilSlotId)) {
      forgeSelectedSigilSlotId = null;
    }

    const rightTitle = inventoryReadOnly
      ? t("forge.structure")
      : forgeCardEditorSection === "sigils"
        ? (forgeSelectedSigilSlotId ? "Modifica Sigillo" : t("forge.sigils"))
        : forgeCardEditorSection === "constraint"
          ? t("sigian.constraint.global")
          : forgeCardEditorSection === "cost"
            ? t("forge.math.title")
            : "Supporto Forgia";

    root.innerHTML = `
      ${inventoryReadOnly ? `<div class="forge-inventory-readonly-note"><div><strong>Formula canonica caricata dall’Inventario</strong><span>${escapeHtml(localizedCardNameById(forgeInventoryPreviewCardId, inventoryFormula?.name || recipe.presentation?.name || "Formula"))} · conversione canonica in sola lettura.</span></div><button type="button" class="classic-stone-button ghost" data-forge-exit-inventory-preview>Torna alla Forgia libera</button></div>` : ""}
      <div class="forge-workspace forge-card-first-workspace ${inventoryReadOnly ? "is-readonly" : ""} ${forgeCardEditorSection ? "has-context-editor" : ""}">
        <aside class="forge-panel forge-structure-panel forge-structure-summary-panel ornate-subpanel">
          <div class="forge-panel-heading">
            <span class="forge-panel-step">I</span>
            <h3>${escapeHtml(t("forge.structure"))}</h3>
          </div>
          ${forgeStructureSummaryMarkup(recipe, analysis, inventoryReadOnly, inventoryFormula)}
          ${inventoryReadOnly ? forgeInventoryCanonicalComponentsMarkup(inventoryFormula) : ""}
        </aside>

        <section class="forge-center-stage">
          <div class="forge-panel-heading forge-center-heading">
            <span class="forge-panel-step">II</span>
            <h3>${escapeHtml(t("forge.preview"))}</h3>
            <small id="forgeAutosaveStatus">${escapeHtml(t("forge.autosaved"))}</small>
          </div>
          <div id="forgePreviewStage" class="forge-preview-stage"></div>
          <div id="forgeContextEditorHost" class="forge-context-editor-host">
            ${!inventoryReadOnly ? forgeCardEditorMarkup(recipe, analysis, activeSigils, atSigilLimit) : ""}
          </div>
          ${forgeQuickBalanceMarkup(recipe, analysis)}
        </section>

        <aside class="forge-panel forge-context-workspace ${inventoryReadOnly ? "is-inventory" : ""} ornate-subpanel">
          <div class="forge-panel-heading">
            <span class="forge-panel-step">III</span>
            <h3>${escapeHtml(rightTitle)}</h3>
          </div>
          ${inventoryReadOnly ? `
            <div class="forge-catalog-section">
              <p class="forge-catalog-note"><strong>Conversione canonica completata.</strong> Questa Formula originale è in sola lettura.</p>
              <p class="forge-catalog-note">Sigilli e Vincoli canonici sono riepilogati nella colonna Struttura.</p>
            </div>
          ` : forgeWorkspaceBodyMarkup(recipe, analysis, activeSigils, atSigilLimit)}
        </aside>
      </div>
      ${!inventoryReadOnly && forgeCardEditorSection ? `<button type="button" class="forge-mobile-sheet-backdrop" data-forge-card-editor-close aria-label="Chiudi editor"></button>` : ""}`;

    const previewStage = $("#forgePreviewStage");
    const preview = buildSigianFullCard(forgePreviewCard(recipe, analysis), null);
    if (previewStage && preview) {
      previewStage.replaceChildren(preview);
      if (forgeCardEditorSection) {
        previewStage.querySelector(`[data-forge-card-edit="${forgeCardEditorSection}"]`)?.classList.add("is-editing");
      }
    }

    if (!inventoryReadOnly) {
      previewStage?.querySelectorAll("[data-forge-sigil-slot]").forEach(entry => {
        const selectSigilFromCard = event => {
          event.stopPropagation();
          forgeCardEditorSection = "sigils";
          forgeSelectedSigilSlotId = entry.dataset.forgeSigilSlot || null;
          renderForgePage();
        };
        entry.addEventListener("click", selectSigilFromCard);
        entry.addEventListener("keydown", event => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          selectSigilFromCard(event);
        });
      });

      previewStage?.querySelectorAll("[data-forge-card-edit]").forEach(zone => {
        const activate = event => {
          event.stopPropagation();
          const section = zone.dataset.forgeCardEdit;
          if (section === "type") {
            session.setType(recipe.type === "creature" ? "spell" : "creature");
            forgeCardEditorSection = null;
            renderForgePage();
            return;
          }
          if (forgeCardEditorSection === section) {
            forgeCardEditorSection = null;
            renderForgePage();
            return;
          }
          forgeCardEditorSection = section;
          if (section !== "sigils") forgeSelectedSigilSlotId = null;
          renderForgePage();
        };
        zone.addEventListener("click", event => {
          if (event.target.closest("[data-forge-sigil-slot]")) return;
          activate(event);
        });
        if (zone.tagName !== "BUTTON") {
          zone.addEventListener("keydown", event => {
            if (event.key !== "Enter" && event.key !== " ") return;
            if (event.target.closest("[data-forge-sigil-slot]")) return;
            event.preventDefault();
            activate(event);
          });
        }
      });

      root.querySelectorAll("[data-forge-card-editor-close]").forEach(control => control.addEventListener("click", event => {
        event.stopPropagation();
        forgeCardEditorSection = null;
        renderForgePage();
      }));

      root.onkeydown = event => {
        if (event.key !== "Escape" || !forgeCardEditorSection) return;
        forgeCardEditorSection = null;
        renderForgePage();
      };
    } else {
      root.onkeydown = null;
    }

    const newButton = $("#forgeNewBtn");
    const undoButton = $("#forgeUndoBtn");
    const redoButton = $("#forgeRedoBtn");
    const tryButton = $("#forgeTryBtn");
    const sealButton = $("#forgeSealBtn");
    const labButton = $("#forgeUiLabBtn");

    if (undoButton) undoButton.disabled = inventoryReadOnly || !snapshot.canUndo;
    if (redoButton) redoButton.disabled = inventoryReadOnly || !snapshot.canRedo;
    if (tryButton) {
      tryButton.disabled = true;
      tryButton.title = t("forge.math.provisional");
    }
    if (sealButton) {
      sealButton.disabled = true;
      sealButton.title = t("forge.math.sealingBlocked");
    }
    if (labButton) {
      labButton.disabled = inventoryReadOnly;
      labButton.onclick = inventoryReadOnly ? null : () => switchView("uiLab");
    }
    if (newButton) newButton.disabled = inventoryReadOnly;

    if (newButton && !inventoryReadOnly) newButton.onclick = () => {
      forgeSelectedSigilSlotId = null;
      forgeCardEditorSection = null;
      forgeTargetCost = "auto";
      session.reset({ type:"creature", stats:{ attack:1, health:5 }, presentation:{ name:t("forge.newFormula") } });
      renderForgePage();
    };

    if (inventoryReadOnly) {
      root.querySelectorAll(".forge-workspace input, .forge-workspace select, .forge-workspace textarea, .forge-workspace button").forEach(control => {
        control.disabled = true;
        control.setAttribute("aria-disabled", "true");
      });
    }

    root.querySelector("[data-forge-exit-inventory-preview]")?.addEventListener("click", () => {
      forgeInventoryPreviewCardId = null;
      forgeSelectedSigilSlotId = null;
      forgeCardEditorSection = null;
      forgeSession = A.createSigianForgeSession?.({
        type:"creature",
        stats:{ attack:1, health:5 },
        presentation:{ name:t("forge.newFormula") }
      }) || null;
      renderForgePage();
    });

    if (undoButton) undoButton.onclick = () => {
      session.undo();
      renderForgePage();
    };
    if (redoButton) redoButton.onclick = () => {
      session.redo();
      renderForgePage();
    };

    root.querySelectorAll("[data-forge-name-input]").forEach(input => input.addEventListener("input", event => {
      const value = event.currentTarget.value;
      session.setName(value);
      const cardNameNode = $("#forgePreviewStage .sigian-full-name");
      if (cardNameNode) cardNameNode.textContent = value.trim() || t("forge.newFormula");
    }));

    root.querySelectorAll("[data-forge-school]").forEach(button => button.addEventListener("click", () => {
      session.setSchool(button.dataset.forgeSchool);
      forgeCardEditorSection = null;
      renderForgePage();
    }));

    root.querySelectorAll("[data-forge-stat]").forEach(button => button.addEventListener("click", () => {
      const current = session.snapshot().draft.recipe;
      const key = button.dataset.forgeStat;
      const min = key === "attack" ? 0 : 1;
      const nextValue = Math.max(min, Number(current.stats[key] || min) + Number(button.dataset.delta || 0));
      session.setCreatureStats({ [key]:nextValue });
      renderForgePage();
    }));

    root.querySelectorAll("[data-forge-stat-input]").forEach(input => input.addEventListener("change", event => {
      const key = event.currentTarget.dataset.forgeStatInput;
      const min = key === "attack" ? 0 : 1;
      session.setCreatureStats({ [key]:Math.max(min, Number(event.currentTarget.value || min)) });
      renderForgePage();
    }));

    root.querySelectorAll("[data-forge-cost-mode]").forEach(button => button.addEventListener("click", () => {
      if (button.dataset.forgeCostMode === "auto") {
        forgeTargetCost = "auto";
      } else if (forgeTargetCost === "auto") {
        forgeTargetCost = String(Math.max(1, Number(session.snapshot().analysis?.minimumLevel || 1)));
      }
      renderForgePage();
    }));

    root.querySelectorAll("[data-forge-cost-step]").forEach(button => button.addEventListener("click", () => {
      const current = forgeTargetCost === "auto" ? Math.max(1, Number(analysis?.minimumLevel || 1)) : Math.max(1, Number(forgeTargetCost || 1));
      forgeTargetCost = String(Math.max(1, current + Number(button.dataset.forgeCostStep || 0)));
      renderForgePage();
    }));

    root.querySelectorAll("[data-forge-cost-input]").forEach(input => input.addEventListener("change", event => {
      forgeTargetCost = String(Math.max(1, Number(event.currentTarget.value || 1)));
      renderForgePage();
    }));

    root.querySelectorAll("[data-forge-target-cost]").forEach(control => control.addEventListener("change", event => {
      forgeTargetCost = event.currentTarget.value === "auto" ? "auto" : String(Math.max(1, Number(event.currentTarget.value || 1)));
      renderForgePage();
    }));

    root.querySelectorAll("[data-forge-constraint-select]").forEach(control => control.addEventListener("change", event => {
      const definitionId = String(event.currentTarget.value || "");
      if (definitionId) session.setConstraint(definitionId);
      else session.removeConstraint();
      forgeCardEditorSection = "constraint";
      renderForgePage();
    }));
    root.querySelectorAll("[data-forge-constraint-grade]").forEach(control => control.addEventListener("change", event => {
      session.setConstraintGrade(Number(event.currentTarget.value || 1));
      renderForgePage();
    }));
    root.querySelectorAll("[data-forge-constraint-school]").forEach(control => control.addEventListener("change", event => {
      session.setConstraintSchool(event.currentTarget.value);
      renderForgePage();
    }));
    root.querySelectorAll("[data-forge-remove-constraint]").forEach(button => button.addEventListener("click", event => {
      event.stopPropagation();
      session.removeConstraint();
      forgeCardEditorSection = "constraint";
      renderForgePage();
    }));
    root.querySelectorAll("[data-forge-open-constraint-picker]").forEach(button => button.addEventListener("click", () => {
      forgeCardEditorSection = "constraint";
      renderForgePage();
    }));

    root.querySelectorAll("[data-forge-empty-sigil-slot]").forEach(button => button.addEventListener("click", () => {
      forgeCardEditorSection = "sigils";
      forgeSelectedSigilSlotId = null;
      renderForgePage();
    }));

    root.querySelectorAll("[data-forge-add-collectible]").forEach(button => button.addEventListener("click", () => {
      if (button.disabled) return;
      const result = session.addCollectibleSigil(button.dataset.forgeAddCollectible);
      forgeCardEditorSection = "sigils";
      forgeSelectedSigilSlotId = result.draft.recipe.sigils.at(-1)?.slotId || null;
      renderForgePage();
    }));
    root.querySelectorAll("[data-forge-add-sigil]").forEach(button => button.addEventListener("click", () => {
      if (button.disabled) return;
      const result = session.addSigil(button.dataset.forgeAddSigil);
      forgeCardEditorSection = "sigils";
      forgeSelectedSigilSlotId = result.draft.recipe.sigils.at(-1)?.slotId || null;
      renderForgePage();
    }));

    root.querySelectorAll("[data-forge-select-sigil]").forEach(row => {
      const select = () => {
        forgeCardEditorSection = "sigils";
        forgeSelectedSigilSlotId = row.dataset.forgeSelectSigil;
        renderForgePage();
      };
      row.addEventListener("click", event => {
        if (event.target.closest("[data-forge-remove-sigil]")) return;
        select();
      });
      row.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (event.target.closest("[data-forge-remove-sigil]")) return;
        event.preventDefault();
        select();
      });
    });

    root.querySelectorAll("[data-forge-close-modeler]").forEach(button => button.addEventListener("click", () => {
      forgeCardEditorSection = "sigils";
      forgeSelectedSigilSlotId = null;
      renderForgePage();
    }));

    root.querySelectorAll("[data-forge-remove-sigil]").forEach(button => button.addEventListener("click", event => {
      event.stopPropagation();
      const slotId = button.dataset.forgeRemoveSigil;
      session.removeSigil(slotId);
      if (forgeSelectedSigilSlotId === slotId) forgeSelectedSigilSlotId = null;
      forgeCardEditorSection = "sigils";
      renderForgePage();
    }));

    root.querySelectorAll("[data-forge-grade]").forEach(control => control.addEventListener("change", () => {
      session.setSigilGrade(control.dataset.forgeSlot, Number(control.value));
      renderForgePage();
    }));
    root.querySelectorAll("[data-forge-intensity]").forEach(button => button.addEventListener("click", () => {
      session.setSigilIntensity(button.dataset.forgeSlot, Number(button.dataset.forgeIntensity));
      renderForgePage();
    }));
    root.querySelectorAll("[data-forge-math-mode]").forEach(button => button.addEventListener("click", () => {
      forgeMathMode = button.dataset.forgeMathMode === "detailed" ? "detailed" : "simple";
      renderForgePage();
    }));
    root.querySelectorAll("[data-forge-config-key]").forEach(control => control.addEventListener("change", () => {
      session.setSigilConfig(control.dataset.forgeSlot, control.dataset.forgeConfigKey, control.value);
      renderForgePage();
    }));
    root.querySelectorAll("[data-forge-schools-count]").forEach(control => control.addEventListener("change", () => {
      const slotId = control.dataset.forgeSlot;
      const recipeNow = session.snapshot().draft.recipe;
      const sigilNow = recipeNow.sigils.find(item => item.slotId === slotId);
      const requested = control.value;
      if (requested === "all") {
        session.setSigilConfig(slotId, "schools", "all");
      } else {
        const wanted = Math.max(1, Math.min(3, Number(requested || 1)));
        const activeIds = (A.listSigianSchools?.({ status:"active" }) || []).map(item => item.id);
        const current = sigilNow?.config?.schools === "all" ? [] : [...(sigilNow?.config?.schools || [])];
        const next = [...new Set(current.filter(id => activeIds.includes(id)))];
        if (!next.length && recipeNow.school) next.push(recipeNow.school);
        for (const id of activeIds) {
          if (next.length >= wanted) break;
          if (!next.includes(id)) next.push(id);
        }
        session.setSigilConfig(slotId, "schools", next.slice(0, wanted));
      }
      renderForgePage();
    }));
    root.querySelectorAll("[data-forge-school-choice]").forEach(button => button.addEventListener("click", () => {
      if (button.disabled) return;
      const slotId = button.dataset.forgeSlot;
      const schoolId = button.dataset.forgeSchoolChoice;
      const sigilNow = session.snapshot().draft.recipe.sigils.find(item => item.slotId === slotId);
      const current = sigilNow?.config?.schools === "all" ? [] : [...(sigilNow?.config?.schools || [])];
      const next = current.includes(schoolId) ? current.filter(id => id !== schoolId) : [...current, schoolId];
      if (next.length < 1 || next.length > 3) return;
      session.setSigilConfig(slotId, "schools", next);
      renderForgePage();
    }));
    root.querySelectorAll("select[data-forge-modifier-family]").forEach(control => control.addEventListener("change", () => {
      session.setSigilModifier(control.dataset.forgeSlot, control.dataset.forgeModifierFamily, control.value || null);
      renderForgePage();
    }));
    root.querySelectorAll("[data-forge-modifier-param]").forEach(control => control.addEventListener("change", () => {
      session.setSigilModifierParam(
        control.dataset.forgeSlot,
        control.dataset.forgeModifierFamily,
        control.dataset.forgeModifierParam,
        control.value
      );
      renderForgePage();
    }));

    window.requestAnimationFrame(() => {
      root.querySelector("[data-forge-autofocus]")?.focus?.({ preventScroll:true });
    });
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
    const printedAttack = printedCardAttack(card);
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
      <span class="detail-combat-stat detail-attack"><small><i aria-hidden="true">⚔</i> ${t("ui.attack")}</small><b>${escapeHtml(printedAttack)}</b></span>
      <span class="detail-combat-stat detail-health"><small><i aria-hidden="true">♥</i> ${t("ui.life")}</small><b>${escapeHtml(displayedCard.currentHealth ?? displayedCard.health)}</b></span>`;
    $("#inspectCardDetails").innerHTML = `
      <span class="detail-school"><small>${t("ui.school")}</small><b>${escapeHtml(schoolName(card.school))}</b></span>
      <span class="detail-type"><small>${t("ui.type")}</small><b>${card.type === "spell" ? t("ui.spell") : t("ui.creature")}</b></span>
      <span class="detail-cost"><small>${t("ui.cost")}</small><b>${escapeHtml(card.level)}</b></span>
      ${combatDetails}`;
    const previewCombatMeta = card.type === "spell" ? "" : `
        <div><small>${t("ui.attack")}</small><strong>${escapeHtml(printedAttack)}</strong></div>
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
    renderFilterGroup("#collectionPageLevelFilters", "level", [{ id: "all", label: t("cards.allMasculine") }, ...Array.from({ length: 13 }, (_, i) => ({ id: String(i + 1), label: String(i + 1) }))]);
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
    body.innerHTML = `<strong>${escapeHtml(cardName(card))}</strong><small>${escapeHtml(t("ui.cost"))} ${card.level}</small>`;
    const costBadge = document.createElement("span");
    costBadge.className = "collection-tile-cost";
    costBadge.textContent = card.level;
    costBadge.setAttribute("aria-label", `${t("ui.cost")} ${card.level}`);
    button.appendChild(art);
    button.appendChild(costBadge);
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
    if (!A.SigianArchiveBrowser) renderCollectionPage();
  }

  function buildCollectionHandPreview(card) {
    const template = $("#smallCardTemplate");
    if (!template?.content?.firstElementChild) return document.createElement("div");
    const clone = template.content.firstElementChild.cloneNode(true);
    clone.classList.add(`school-${card.school}`, `type-${card.type}`);
    clone.dataset.cardId = card.id;
    clone.dataset.playable = "true";
    clone.tabIndex = -1;
    clone.querySelector(".cost").textContent = Number(card.cost ?? card.level ?? 0);
    clone.querySelector(".school").innerHTML = `${schoolIconMarkup(card.school, "school-icon-svg card-school-svg")} ${escapeHtml(schoolName(card.school))}`;
    const artNode = clone.querySelector(".art");
    artNode.innerHTML = "";
    artNode.appendChild(buildArtBlock(card, "collectionHandPreview"));
    clone.querySelector(".name").textContent = cardName(card);
    clone.querySelector(".text").textContent = cardText(card);
    clone.querySelector(".keyword").textContent = visibleCardKeyword(card);
    clone.querySelector(".stats").textContent = card.type === "spell"
      ? `Lv ${card.level}`
      : `Lv ${card.level} · ⚔ ${card.attack} · ♥ ${card.health}`;
    decorateSigianHandCard(clone, card);

    const host = document.createElement("div");
    host.className = "sigian-preview-hand-host";
    host.appendChild(clone);
    return host;
  }

  function buildCollectionCombatPreview(card) {
    if (card.type === "spell") {
      const host = document.createElement("div");
      host.className = "sigian-preview-combat-host sigian-preview-cast-host";
      const cast = document.createElement("div");
      cast.className = `cast-card cast-splash school-${card.school} spell-cast sigian-preview-cast`;
      const art = document.createElement("div");
      art.className = "cast-card-art cast-splash-art";
      art.appendChild(buildArtBlock(card, "collectionCombatPreview"));
      const chrome = document.createElement("div");
      chrome.className = "cast-splash-chrome";
      const schoolBadge = document.createElement("span");
      schoolBadge.className = "cast-splash-school";
      schoolBadge.innerHTML = schoolIconMarkup(card.school, "school-icon-svg cast-splash-school-icon");
      const copy = document.createElement("div");
      copy.className = "cast-splash-copy";
      const label = document.createElement("strong");
      label.className = "cast-splash-name";
      label.textContent = cardName(card);
      const kind = document.createElement("small");
      kind.className = "cast-splash-kind";
      kind.textContent = t("ui.spell");
      copy.appendChild(label);
      copy.appendChild(kind);
      chrome.appendChild(schoolBadge);
      chrome.appendChild(copy);
      cast.appendChild(art);
      cast.appendChild(chrome);
      decorateSigianSpellCast(cast, card);
      cast.classList.add("active");
      host.appendChild(cast);
      return host;
    }

    const host = document.createElement("div");
    host.className = "sigian-preview-combat-host classic-board-column";
    const cell = document.createElement("button");
    cell.type = "button";
    cell.tabIndex = -1;
    cell.className = `unit school-${card.school}`;
    const art = document.createElement("div");
    art.className = "unit-art";
    art.appendChild(buildArtBlock(card, "collectionCombatPreview"));
    const name = document.createElement("small");
    name.textContent = cardName(card);
    art.appendChild(name);
    const stats = document.createElement("div");
    stats.className = "unit-stats";
    stats.innerHTML = `<strong class="unit-attack"><span aria-hidden="true">⚔</span>${escapeHtml(card.attack)}</strong><strong class="unit-health"><span aria-hidden="true">♥</span>${escapeHtml(card.health)}</strong>`;
    cell.appendChild(art);
    cell.appendChild(stats);
    syncSigianCombatPresentation(cell, card);
    host.appendChild(cell);
    return host;
  }

  function renderCollectionCardPreview(card) {
    const stage = $("#collectionPreviewStage");
    if (!stage || !card) return;
    stage.className = `collection-preview-stage mode-${collectionPreviewMode}`;
    stage.replaceChildren();

    if (collectionPreviewMode === "hand") {
      stage.appendChild(buildCollectionHandPreview(card));
    } else if (collectionPreviewMode === "combat") {
      stage.appendChild(buildCollectionCombatPreview(card));
    } else {
      renderPreviewInto(stage, card, null);
    }

    document.querySelectorAll("[data-collection-preview-mode]").forEach(button => {
      const active = button.dataset.collectionPreviewMode === collectionPreviewMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  function bindCollectionPreviewModes(card) {
    document.querySelectorAll("[data-collection-preview-mode]").forEach(button => {
      button.addEventListener("click", () => {
        collectionPreviewMode = button.dataset.collectionPreviewMode || "full";
        renderCollectionCardPreview(card);
      });
    });
  }

  function renderCollectionPage() {
    const root = $("#cardsContent");
    if (!root) return;
    const allCards = allAstralCards();
    const filtered = applyCollectionFilters(allCards);
    root.innerHTML = `
      <div class="collection-page-filters collection-page-filters-top ornate-subpanel classic-config-grid">
        <div class="collection-page-filter-row collection-page-filter-schools">
          <span>${t("ui.school")}</span>
          <div id="collectionPageSchoolFilters" class="mini-filter-grid horizontal-school-filters"></div>
        </div>
        <div class="collection-page-filter-row collection-page-filter-types">
          <span>${t("ui.type")}</span>
          <div id="collectionPageTypeFilters" class="mini-filter-grid collection-type-filters"></div>
        </div>
        <div class="collection-page-filter-row collection-page-filter-costs">
          <span>${t("ui.cost")}</span>
          <div id="collectionPageLevelFilters" class="mini-filter-grid level-filters wide"></div>
        </div>
        <div class="collection-page-filter-search">
          <label class="search-label">${t("cards.search")}<input id="collectionPageSearch" type="search" placeholder="${t("cards.searchPlaceholder")}"></label>
          <p id="collectionPageStatus" class="collection-page-count">${t("cards.shown", { shown: filtered.length, total: allCards.length })}</p>
        </div>
      </div>
      <div class="collection-page-layout collection-page-layout-v2">
        <aside class="collection-preview-panel">
          <div class="collection-preview-toolbar" role="tablist" aria-label="${escapeHtml(t("cards.previewModes"))}">
            <button type="button" data-collection-preview-mode="full" role="tab">${escapeHtml(t("cards.previewFull"))}</button>
            <button type="button" data-collection-preview-mode="combat" role="tab">${escapeHtml(t("cards.previewCombat"))}</button>
            <button type="button" data-collection-preview-mode="hand" role="tab">${escapeHtml(t("cards.previewHand"))}</button>
          </div>
          <div id="collectionPreviewStage" class="collection-preview-stage"></div>
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
    if (card) {
      renderCollectionCardPreview(card);
      bindCollectionPreviewModes(card);
    }

    const pageGrid = $("#collectionPageGrid");
    if (pageGrid) {
      pageGrid.innerHTML = "";
      filtered.forEach(item => pageGrid.appendChild(buildCollectionTile(item, false)));
    }
  }

  let renderedHandSignature = "";
  let renderedHandEngine = null;
  let mobileHandGesture = null;
  let mobileHoldGesture = null;
  const MOBILE_HOLD_PREVIEW_DELAY = 300;
  const MOBILE_DRAG_START_DISTANCE = 12;

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
    const sigianRoot = $("#mobileCardInspectContent");
    if (!inspect || !sigianRoot || !card) return;
    const fullCard = buildSigianFullCard(card, side);
    if (!fullCard) throw new Error(`Formula Sigian UI mancante per ${card.id || "carta-senza-id"}.`);
    sigianRoot.replaceChildren(fullCard);
    inspect.classList.remove("hidden");
    inspect.setAttribute("aria-hidden", "false");
  }

  function releaseMobilePointerCapture(gesture) {
    const target = gesture?.captureTarget;
    if (!target || !gesture?.pointerId || typeof target.releasePointerCapture !== "function") return;
    try {
      if (typeof target.hasPointerCapture !== "function" || target.hasPointerCapture(gesture.pointerId)) {
        target.releasePointerCapture(gesture.pointerId);
      }
    } catch (error) {}
  }

  function captureMobilePointer(event, gesture) {
    const target = event.currentTarget;
    if (!target || typeof target.setPointerCapture !== "function") return;
    try {
      target.setPointerCapture(event.pointerId);
      gesture.captureTarget = target;
    } catch (error) {}
  }

  function clearMobileHoldPreview() {
    const gesture = mobileHoldGesture;
    if (!gesture) {
      hideMobileCardInspect();
      return;
    }
    clearTimeout(gesture.holdTimer);
    document.removeEventListener("pointermove", gesture.move, true);
    document.removeEventListener("pointerup", gesture.end, true);
    document.removeEventListener("pointercancel", gesture.cancel, true);
    releaseMobilePointerCapture(gesture);
    hideMobileCardInspect();
    mobileHoldGesture = null;
  }

  function startMobileHoldPreview(event, card, side = "player") {
    if (!isMobileDuelLayout() || event.button !== 0 || !card) return;
    if (event.pointerType === "touch" && event.isPrimary === false) return;
    if (mobileHoldGesture) clearMobileHoldPreview();
    if (mobileHandGesture) return;
    event.preventDefault();
    const gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      previewing: false,
      moved: false,
      holdTimer: null,
      captureTarget: null,
      move: null,
      end: null,
      cancel: clearMobileHoldPreview
    };
    captureMobilePointer(event, gesture);
    gesture.holdTimer = setTimeout(() => {
      if (mobileHoldGesture !== gesture || gesture.moved) return;
      gesture.previewing = true;
      showMobileCardInspect(card, side);
    }, MOBILE_HOLD_PREVIEW_DELAY);
    gesture.move = moveEvent => {
      if (moveEvent.pointerId !== gesture.pointerId) return;
      const distance = Math.hypot(moveEvent.clientX - gesture.startX, moveEvent.clientY - gesture.startY);
      if (distance < MOBILE_DRAG_START_DISTANCE || gesture.previewing) return;
      gesture.moved = true;
      clearTimeout(gesture.holdTimer);
    };
    gesture.end = endEvent => {
      if (endEvent.pointerId !== gesture.pointerId) return;
      clearMobileHoldPreview();
    };
    mobileHoldGesture = gesture;
    document.addEventListener("pointermove", gesture.move, { passive: false, capture: true });
    document.addEventListener("pointerup", gesture.end, true);
    document.addEventListener("pointercancel", gesture.cancel, true);
  }

  function clearMobileHandGesture() {
    const gesture = mobileHandGesture;
    if (!gesture) {
      hideMobileCardInspect();
      return;
    }
    clearTimeout(gesture.holdTimer);
    document.removeEventListener("pointermove", gesture.move, true);
    document.removeEventListener("pointerup", gesture.end, true);
    document.removeEventListener("pointercancel", gesture.cancel, true);
    releaseMobilePointerCapture(gesture);
    $$("#playerBoard .mobile-drop-hover").forEach(node => node.classList.remove("mobile-drop-hover"));
    $("#battlePanel")?.classList.remove("mobile-drag-creature", "mobile-drag-spell");
    $("#mobileDragGhost")?.classList.add("hidden");
    hideMobileCardInspect();
    mobileHandGesture = null;
  }

  function beginMobileHandDrag(gesture, card, x, y) {
    if (!gesture?.canDrag || gesture.dragging) return false;
    gesture.previewing = false;
    gesture.dragging = true;
    clearTimeout(gesture.holdTimer);
    hideMobileCardInspect();
    const ghost = $("#mobileDragGhost");
    ghost?.replaceChildren(buildArtBlock(card, "mobileDrag"));
    ghost?.classList.remove("hidden");
    $("#battlePanel")?.classList.add(card.type === "spell" ? "mobile-drag-spell" : "mobile-drag-creature");
    if (ghost) {
      ghost.style.left = `${x}px`;
      ghost.style.top = `${y}px`;
    }
    return true;
  }

  function startMobileHandGesture(event, card, playable) {
    if (!isMobileDuelLayout() || event.button !== 0) return;
    if (event.pointerType === "touch" && event.isPrimary === false) return;
    // A fresh primary pointer always supersedes any stale gesture left by a
    // rerender/page lifecycle transition. This prevents the next card from
    // becoming undraggable after the previous play.
    if (mobileHandGesture) clearMobileHandGesture();
    if (mobileHoldGesture) clearMobileHoldPreview();

    event.preventDefault();
    const gesture = {
      pointerId: event.pointerId,
      cardId: card.id,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      previewing: false,
      canDrag: Boolean(playable),
      holdTimer: null,
      captureTarget: null,
      move: null,
      end: null,
      cancel: clearMobileHandGesture
    };
    captureMobilePointer(event, gesture);
    gesture.holdTimer = setTimeout(() => {
      if (mobileHandGesture !== gesture || gesture.dragging) return;
      gesture.previewing = true;
      showMobileCardInspect(card, "player");
    }, MOBILE_HOLD_PREVIEW_DELAY);

    gesture.move = moveEvent => {
      if (moveEvent.pointerId !== gesture.pointerId) return;
      const distance = Math.hypot(moveEvent.clientX - gesture.startX, moveEvent.clientY - gesture.startY);
      if (!gesture.dragging && distance < MOBILE_DRAG_START_DISTANCE) return;
      if (moveEvent.cancelable) moveEvent.preventDefault();
      clearTimeout(gesture.holdTimer);

      if (!gesture.canDrag) {
        gesture.moved = true;
        return;
      }

      // Hold is only a temporary inspection state. Once the finger travels
      // past the drag threshold, the same pointer seamlessly becomes a drag.
      if (!gesture.dragging) beginMobileHandDrag(gesture, card, moveEvent.clientX, moveEvent.clientY);

      const ghost = $("#mobileDragGhost");
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
      const x = endEvent.clientX;
      const y = endEvent.clientY;
      const releaseDistance = Math.hypot(x - gesture.startX, y - gesture.startY);

      // iOS can occasionally coalesce the last pointermove after a long hold.
      // Promote the release itself to a drag when it crossed the threshold.
      if (!gesture.dragging && gesture.canDrag && releaseDistance >= MOBILE_DRAG_START_DISTANCE) {
        beginMobileHandDrag(gesture, card, x, y);
      }

      const wasDragging = gesture.dragging;
      const wasPreviewing = gesture.previewing;
      const canDrag = gesture.canDrag;
      const slotCell = card.type === "creature"
        ? document.elementFromPoint(x, y)?.closest("#playerBoard .slot")
        : null;
      const battlefield = $(".classic-battlefield")?.getBoundingClientRect();
      const insideBattlefield = battlefield && x >= battlefield.left && x <= battlefield.right
        && y >= battlefield.top && y <= battlefield.bottom;

      clearMobileHandGesture();
      if (!engine || !isMobileDuelLayout()) return;

      // Hold without movement is inspection only. Hold + movement is drag.
      if (wasPreviewing && !wasDragging) return;
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
    document.addEventListener("pointermove", gesture.move, { passive: false, capture: true });
    document.addEventListener("pointerup", gesture.end, true);
    document.addEventListener("pointercancel", gesture.cancel, true);
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
      decorateSigianHandCard(clone, card);
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

  function attackHeroTarget(side) {
    const life = $(`#${side}HpBattle`);
    return life?.closest(".classic-player-head") || life;
  }

  async function animateAttack(event) {
    const attacker = $(`#${event.side}Board [data-slot="${event.slot}"]`);
    const primaryTarget = event.type === "laneAttack"
      ? $(`#${event.enemySide}Board [data-slot="${event.slot}"]`)
      : attackHeroTarget(event.enemySide);
    const multiTargets = event.multiTarget
      ? [...$$(`#${event.enemySide}Board .unit`), attackHeroTarget(event.enemySide)].filter(Boolean)
      : [primaryTarget].filter(Boolean);

    attacker?.classList.add("attacking");
    attacker?.classList.toggle("attacking-multi", Boolean(event.multiTarget));
    multiTargets.forEach((node, index) => {
      node.classList.add("target-locked");
      createAttackTrail(attacker, node, event.side, {
        multiTarget: Boolean(event.multiTarget),
        index
      });
    });
    $("#battlePanel")?.classList.toggle("multi-target-attack", Boolean(event.multiTarget));
    showCombatCue(event);
    attackSound({ direct: event.type === "directAttack", multiTarget: Boolean(event.multiTarget) });
    await sleep(event.multiTarget ? 430 : 300);
    attacker?.classList.remove("attacking", "attacking-multi");
    multiTargets.forEach(node => node.classList.add("hit"));
    await sleep(event.multiTarget ? 180 : 120);
    multiTargets.forEach(node => node.classList.remove("hit", "target-locked"));
    $("#battlePanel")?.classList.remove("multi-target-attack");
  }
  function showCombatCue(event) {
    const layer = $("#duelFxLayer");
    if (!layer || !event) return;
    const cue = document.createElement("div");
    cue.className = `combat-cue side-${event.side}${event.multiTarget ? " multi-target" : ""}${event.forcedByEffect ? " forced-attack" : ""}`;
    const target = event.multiTarget ? t("combat.allEnemies") : (event.targetName || t("combat.opposingMage"));
    cue.textContent = `${event.forcedByEffect ? `${t("effect.forcedAttack")} · ` : ""}${event.attackerName || t("ui.creature")} → ${target}`;
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

  function showPowerChange(side, schoolId, amount, options = {}) {
    if (!amount) return false;
    const root = side === "player" ? $("#schoolFilters") : $("#enemySchoolMenu");
    const parent = root?.querySelector(`[data-school-id="${schoolId}"]`);
    if (!parent) return false;
    parent.classList.add("effect-power-change", amount > 0 ? "power-gain" : "power-loss");
    const badge = document.createElement("span");
    badge.className = `effect-power-number ${amount > 0 ? "gain" : "loss"}${options.source ? " source-modifier" : ""}`;
    badge.style.setProperty("--power-badge-index", String(Number(options.index || 0)));
    badge.textContent = options.label || `${amount > 0 ? "+" : "−"}${Math.abs(amount)}`;
    if (options.sourceCardId) badge.dataset.sourceCardId = options.sourceCardId;
    parent.appendChild(badge);
    setTimeout(() => {
      badge.remove();
      if (!parent.querySelector(".effect-power-number")) {
        parent.classList.remove("effect-power-change", "power-gain", "power-loss");
      }
    }, fxDuration(options.duration || 1500) || 40);
    return true;
  }

  function showPowerGrowthFeedback(result, before) {
    const growth = (result?.events || []).find(event => event.type === "astralPowerGrowth");
    if (!growth) return showPowerValueChanges(before);

    const grouped = groupedPowerGrowthSources(growth);
    let shown = 0;
    A.SCHOOLS.forEach(school => {
      let index = 0;
      const baseGain = Number(growth.baseGain || 0);
      if (baseGain && showPowerChange(growth.side, school.id, baseGain, {
        index: index++,
        duration: 1650
      })) shown += 1;

      let sourceSum = 0;
      grouped.forEach(group => {
        const amount = Number(group.schools[school.id] || 0);
        if (!amount) return;
        sourceSum += amount;
        if (showPowerChange(growth.side, school.id, amount, {
          index: index++,
          duration: 1750,
          source: true,
          sourceCardId: group.sourceCardId,
          label: `${amount > 0 ? "+" : "−"}${Math.abs(amount)} ${schoolName(school.id)}`
        })) shown += 1;
      });

      const totalGain = Number(growth.gain?.[school.id] || 0);
      const residual = totalGain - baseGain - sourceSum;
      if (residual && showPowerChange(growth.side, school.id, residual, {
        index: index++,
        duration: 1650
      })) shown += 1;
    });
    return shown;
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
    return shown;
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
    let cardIdentityShown = false;
    try {
      cardIdentityShown = showCardResolutionIdentityFx(result);
    } catch (error) {
      console.warn("Card presentation effect failed", error);
    }
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
    const hasVisibleEffect = cardIdentityShown || healingShown + powerShown + attackShown > 0 || (result?.events || []).some(event => [
      "astralCreatureDamage", "astralHeroDamage", "creatureDamage", "heroDamage", "astralDeath", "astralFireAura", "astralNets"
    ].includes(event.type));
    if (hasVisibleEffect) await sleep(620);
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
      if (healingShown > 0 || triggeredDamageEvents.length > 0) await sleep(460);
      const hasAttackDamage = Number(step.event?.damage || 0) > 0;
      if (hasAttackDamage) {
        await animateAttack(step.event);
        showDamage(step.event);
      }
      showCollateralDamage(step.events);
      showResolutionDeaths(step);
      if (hasAttackDamage || triggeredDamageEvents.length > 0) await sleep(520);
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
    const finishResult = issueDuelCommand(side, A.MULTIPLAYER_COMMANDS.FINISH_ATTACK);
    const finishHealingShown = showHealingChanges(finishHealthBefore, finishResult);
    const finishPowerShown = showPowerGrowthFeedback(finishResult, finishHealthBefore);
    const finishAttackShown = showUnitAttackChanges(finishHealthBefore);
    if (finishHealingShown + finishPowerShown + finishAttackShown > 0) await sleep(520);
    renderGame();
    recordPowerGrowth(finishResult);

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
    const sigianCard = buildSigianFullCard(card, side);
    if (!sigianCard) throw new Error(`Formula Sigian UI mancante per ${card?.id || "carta-senza-id"}.`);
    target.replaceChildren(sigianCard);
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
    if (event.target.closest?.(".sigian-full-card, #closeDuelCardZoom")) return;
    closeDuelCardZoom();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeDuelCardZoom();
  });

  function renderTournament() {
    const root = $("#tournamentContent");
    const newButton = $("#newTournamentBtn");
    const abandonButton = $("#abandonTournamentBtn");
    const context = {
      tournament, t, school, schoolName, schoolIconMarkup, specializationIconMarkup, escapeHtml, abilityName, abilityDescription, spellbookModeLabel,
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

      const leagueButtons = [...root.querySelectorAll("[data-league-stage]")];
      const resetLeagueDisclosure = () => {
        leagueButtons.forEach(button => button.setAttribute("aria-expanded", "false"));
        const container = root.querySelector(".tournament-league-details");
        container?.classList.add("hidden");
        root.querySelectorAll("[data-league-detail]").forEach(panel => panel.classList.add("hidden"));
      };
      leagueButtons.forEach(button => button.addEventListener("click", () => {
        const stage = button.dataset.leagueStage;
        const container = root.querySelector(".tournament-league-details");
        const panel = root.querySelector(`[data-league-detail="${stage}"]`);
        if (!container || !panel) return;
        const closing = button.getAttribute("aria-expanded") === "true";
        resetLeagueDisclosure();
        if (closing) return;
        button.setAttribute("aria-expanded", "true");
        container.classList.remove("hidden");
        panel.classList.remove("hidden");
      }));

      const syncTournamentCreate = () => {
        const rules = selectedTournamentRules();
        const mode = rules.tournamentMode || "league";
        $("#tournamentCustomRules")?.classList.toggle("hidden", mode !== "custom");
        $("#tournamentSpecializationField")?.classList.toggle("hidden", !rules.specializationsEnabled);
        if ($("#tournamentModeDescription")) $("#tournamentModeDescription").textContent = t(`tournament.mode.${mode}.description`);

        const evolutionCaptions = Boolean(rules.evolutionEnabled);
        const captionKeys = evolutionCaptions
          ? { starting: "tournament.evolutionMatches12", advanced: "tournament.evolutionMatches34", major: "tournament.evolutionMatches57" }
          : { starting: "tournament.matches12", advanced: "tournament.matches34", major: "tournament.matches57" };
        root.querySelectorAll("[data-league-caption]").forEach(node => {
          const stage = node.dataset.leagueCaption;
          const key = captionKeys[stage];
          if (key) node.textContent = t(key);
        });
        const leagueStrip = root.querySelector(".tournament-league-strip");
        if (leagueStrip) leagueStrip.dataset.mode = evolutionCaptions ? "evolution" : "league";

        const tournamentSelect = $("#tournamentTalentSelect");
        syncSpecializationSelectIcon(tournamentSelect);
        const selectedSpecialization = tournamentSelect?.value || "random";
        const canInspectLeagues = rules.specializationsEnabled && selectedSpecialization !== "random";
        leagueStrip?.classList.toggle("hidden", !canInspectLeagues);

        const preview = $("#tournamentSpecializationPreview");
        if (preview) {
          preview.innerHTML = canInspectLeagues
            ? A.UITournamentView.specializationProgression(selectedSpecialization, context)
            : "";
          resetLeagueDisclosure();
          leagueButtons.forEach(button => {
            button.disabled = !canInspectLeagues;
            button.title = canInspectLeagues ? t("tournament.tapLeagueDetails") : t("tournament.chooseSpecializationForDetails");
          });
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

  function normalizeProfileAvatar(value) {
    const raw = String(value || "").trim();
    if (!raw.startsWith("card:")) return "";
    const id = raw.slice(5);
    return allAstralCards().some(card => card.id === id) ? `card:${id}` : "";
  }

  function profileAvatarCard(value) {
    const normalized = normalizeProfileAvatar(value);
    if (!normalized) return null;
    const id = normalized.slice(5);
    return allAstralCards().find(card => card.id === id) || null;
  }

  function profileAvatarChoices(selectedValue = "") {
    const creatures = allAstralCards().filter(card => card?.type === "creature");
    if (!creatures.length) return [];
    const target = Math.min(18, creatures.length);
    const picked = [];
    for (let index = 0; index < target; index += 1) {
      const card = creatures[Math.floor(index * creatures.length / target)];
      if (card && !picked.some(item => item.id === card.id)) picked.push(card);
    }
    const selected = profileAvatarCard(selectedValue);
    if (selected && !picked.some(card => card.id === selected.id)) picked.unshift(selected);
    return picked.slice(0, 18);
  }

  function profileAvatarImage(card) {
    return remasteredCardImage(card) || originalCardImage(card);
  }

  function profileAvatarMarkup(value, name = "", className = "profile-avatar") {
    const card = profileAvatarCard(value);
    const label = String(name || t("ui.player")).trim().charAt(0).toUpperCase() || "?";
    if (!card) return `<span class="${className}" aria-hidden="true">${escapeHtml(label)}</span>`;
    return `<span class="${className}" aria-hidden="true"><img src="${escapeHtml(profileAvatarImage(card))}" alt="" loading="lazy" draggable="false"></span>`;
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
    const online = onlineAccountSnapshot || {};
    const onlineProgress = online.progression || {};
    const onlineRating = online.rating || {};
    const onlineProfile = online.profile || {};
    const selectedAvatar = normalizeProfileAvatar(onlineProfile.avatar_url || localStorage.getItem("arcane.profileAvatar") || "");
    const avatarCards = profileAvatarChoices(selectedAvatar);
    let draftAvatar = selectedAvatar;
    const onlineCard = !online.configured
      ? ""
      : online.error
        ? `<section class="profile-online-card ornate-subpanel"><div><small>${t("profile.onlineAccount")}</small><strong>${t("ranked.accountError")}</strong></div></section>`
        : `<section class="profile-online-card ornate-subpanel">
            <div class="profile-online-heading">
              <div class="profile-online-identity">
                ${profileAvatarMarkup(selectedAvatar, onlineProfile.display_name || storedName, "profile-avatar profile-avatar-hero")}
                <div class="profile-online-identity-copy"><small>${t("profile.onlineAccount")}</small><strong>${escapeHtml(onlineProfile.display_name || storedName)}${onlineProfile.player_tag ? `<span class="profile-name-tag">#${escapeHtml(onlineProfile.player_tag)}</span>` : ""}</strong><span>${online.user?.isAnonymous ? t("profile.guestAccount") : escapeHtml(online.user?.email || "")}</span></div>
              </div>
              <div class="profile-online-rating"><small>${t("profile.rankedRating")}</small><strong>${Number(onlineRating.rating || 1000)}</strong><span>${t("ranked.classic")}</span></div>
            </div>
            <div class="profile-online-stats">
              <span><small>${t("profile.onlineLevel", { level: Number(onlineProgress.level || 1) })}</small><strong>${t("profile.onlineXp", { xp: Number(onlineProgress.xp || 0) })}</strong></span>
              <span><small>${Number(onlineProgress.games_played || 0)} ${t("profile.gamesPlayed", { value: "" }).replace(/^\s+|\s+$/g, "")}</small><strong>${t("profile.onlineRecord", { wins: Number(onlineProgress.wins || 0), losses: Number(onlineProgress.losses || 0), draws: Number(onlineProgress.draws || 0) })}</strong></span>
            </div>
          </section>`;
    root.innerHTML = `
      ${onlineCard}
      <section class="profile-customize-card ornate-subpanel">
        <div class="profile-section-heading"><div><h3>${t("profile.identityTitle")}</h3><p>${t("profile.identityIntro")}</p></div></div>
        <div class="profile-identity-editor">
          <label><span>${t("profile.playerName")}</span><input id="profilePlayerNameInput" type="text" maxlength="24" autocomplete="nickname" value="${escapeHtml(storedName)}"></label>
          ${online.configured && !online.error ? `<div class="profile-player-tag"><span>${t("profile.playerTag")}</span><strong>${onlineProfile.player_tag ? `#${escapeHtml(onlineProfile.player_tag)}` : "—"}</strong><small>${t("profile.playerTagHint")}</small></div>` : ""}
          <button id="saveProfileIdentityBtn" type="button" class="classic-stone-button">${t("profile.saveIdentity")}</button>
        </div>
        <div class="profile-avatar-editor">
          <div class="profile-avatar-editor-copy"><strong>${t("profile.avatar")}</strong><small>${t("profile.avatarHint")}</small></div>
          <div class="profile-avatar-grid" role="listbox" aria-label="${escapeHtml(t("profile.avatar"))}">
            <button class="profile-avatar-option ${selectedAvatar ? "" : "is-selected"}" type="button" data-profile-avatar="" title="${escapeHtml(t("profile.noAvatar"))}" aria-selected="${selectedAvatar ? "false" : "true"}"><span class="profile-avatar-initial">${escapeHtml(storedName.charAt(0).toUpperCase() || "?")}</span></button>
            ${avatarCards.map(card => {
              const value = `card:${card.id}`;
              const selected = selectedAvatar === value;
              return `<button class="profile-avatar-option ${selected ? "is-selected" : ""}" type="button" data-profile-avatar="${escapeHtml(value)}" title="${escapeHtml(cardName(card))}" aria-selected="${selected ? "true" : "false"}"><img src="${escapeHtml(profileAvatarImage(card))}" alt="" loading="lazy" draggable="false"></button>`;
            }).join("")}
          </div>
        </div>
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
    root.querySelectorAll("[data-profile-avatar]").forEach(button => {
      button.addEventListener("click", () => {
        draftAvatar = normalizeProfileAvatar(button.dataset.profileAvatar || "");
        root.querySelectorAll("[data-profile-avatar]").forEach(option => {
          const selected = normalizeProfileAvatar(option.dataset.profileAvatar || "") === draftAvatar;
          option.classList.toggle("is-selected", selected);
          option.setAttribute("aria-selected", selected ? "true" : "false");
        });
        const preview = root.querySelector(".profile-avatar-hero");
        if (preview) {
          const card = profileAvatarCard(draftAvatar);
          preview.innerHTML = card
            ? `<img src="${escapeHtml(profileAvatarImage(card))}" alt="" loading="eager" draggable="false">`
            : escapeHtml((($("#profilePlayerNameInput")?.value || storedName).trim().charAt(0).toUpperCase()) || "?");
        }
      });
    });
    $("#saveProfileIdentityBtn")?.addEventListener("click", async () => {
      const name = normalizedPlayerName($("#profilePlayerNameInput")?.value, t("ui.player"));
      profile.playerName = name;
      A.saveProfile(profile);
      localStorage.setItem("arcane.playerName", name);
      if (draftAvatar) localStorage.setItem("arcane.profileAvatar", draftAvatar);
      else localStorage.removeItem("arcane.profileAvatar");
      if ($("#playerNameInput")) $("#playerNameInput").value = name;
      if ($("#onlinePlayerNameInput")) $("#onlinePlayerNameInput").value = name;
      if (onlineAccountSnapshot?.user && A.onlineAccount?.configured?.()) {
        try {
          await A.onlineAccount.updateProfile({
            displayName: name,
            avatarUrl: draftAvatar
          });
          onlineAccountSnapshot = await A.onlineAccount.refreshData();
          renderOnlineAccountState();
        } catch (error) {
          if ($("#onlineFormMessage")) $("#onlineFormMessage").textContent = error.message || t("online.error");
        }
      }
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
    animationSpeed = normalizeAnimationSpeed(event.target.value);
    localStorage.setItem("arcane.animationSpeed", String(animationSpeed));
    document.body.dataset.animationSpeed = animationSpeedMode(animationSpeed);
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
      animationSpeed = normalizeAnimationSpeed(v);
      localStorage.setItem("arcane.animationSpeed", String(animationSpeed));
      document.body.dataset.animationSpeed = animationSpeedMode(animationSpeed);
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
    document.body.dataset.animationSpeed = animationSpeedMode(animationSpeed);
  } catch (e) {}

  // Central background-music manager. The saved preference is intentionally
  // separate from the browser's temporary autoplay permission.
  let bgmEnabled = false;
  let bgmVolume = 0.12;
  const MUSIC_FADE_OUT_MS = 520;
  const MUSIC_FADE_IN_MS = 720;
  let originalMenuThemeUrl = "";
  function createOriginalMenuThemeUrl() {
    if (originalMenuThemeUrl) return originalMenuThemeUrl;

    // Original 30-second fairytale-fantasy loop: soft celesta, harp-like arpeggio
    // and an airy pad. It is synthesized once, cached as a local Blob URL and
    // needs no network request, which keeps the installed PWA menu music offline-safe.
    const sampleRate = 16000;
    const duration = 30;
    const samples = new Float32Array(sampleRate * duration);
    const beat = 60 / 64;
    const midi = note => 440 * (2 ** ((note - 69) / 12));
    const addNote = (note, startBeat, lengthBeats, volume, voice = "bell") => {
      const start = Math.max(0, Math.floor(startBeat * beat * sampleRate));
      const length = Math.min(samples.length - start, Math.floor(lengthBeats * beat * sampleRate));
      const frequency = midi(note);
      for (let i = 0; i < length; i += 1) {
        const time = i / sampleRate;
        const progress = i / Math.max(1, length - 1);
        let envelope;
        let tone;
        if (voice === "pad") {
          envelope = Math.min(1, progress * 8) * Math.min(1, (1 - progress) * 5);
          tone = Math.sin(2 * Math.PI * frequency * time)
            + 0.24 * Math.sin(2 * Math.PI * frequency * 2 * time);
        } else if (voice === "harp") {
          envelope = (1 - Math.exp(-progress * 35)) * Math.exp(-progress * 5.2);
          tone = Math.sin(2 * Math.PI * frequency * time)
            + 0.20 * Math.sin(2 * Math.PI * frequency * 2 * time);
        } else {
          envelope = (1 - Math.exp(-progress * 45)) * Math.exp(-progress * 4.3);
          tone = Math.sin(2 * Math.PI * frequency * time)
            + 0.34 * Math.sin(2 * Math.PI * frequency * 2 * time)
            + 0.10 * Math.sin(2 * Math.PI * frequency * 4 * time);
        }
        samples[start + i] += tone * envelope * volume;
      }
    };

    const chords = [
      [50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55],
      [50, 53, 57], [55, 58, 62], [57, 61, 64], [50, 53, 57]
    ];
    const melody = [
      69, 72, 74, 77, 74, 72, 69, 65,
      67, 69, 72, 74, 72, 69, 67, 64,
      69, 72, 77, 76, 74, 72, 69, 67,
      65, 69, 72, 74, 72, 69, 65, 62
    ];

    chords.forEach((chord, bar) => {
      const barBeat = bar * 4;
      chord.forEach((note, index) => addNote(note, barBeat, 4.15, 0.020 - index * 0.002, "pad"));
      [0, 2, 1, 2, 0, 2, 1, 2].forEach((index, step) => {
        addNote(chord[index] + 12, barBeat + step * 0.5, 0.72, 0.030, "harp");
      });
      for (let step = 0; step < 4; step += 1) {
        addNote(melody[bar * 4 + step], barBeat + step, 1.35, 0.042, "bell");
      }
    });

    let peak = 0.0001;
    for (let i = 0; i < samples.length; i += 1) peak = Math.max(peak, Math.abs(samples[i]));
    const scale = Math.min(1, 0.72 / peak);
    const bytesPerSample = 2;
    const dataSize = samples.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeText = (offset, value) => {
      for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
    };
    writeText(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeText(8, "WAVE");
    writeText(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeText(36, "data");
    view.setUint32(40, dataSize, true);
    for (let i = 0; i < samples.length; i += 1) {
      const value = Math.max(-1, Math.min(1, samples[i] * scale));
      view.setInt16(44 + i * 2, Math.round(value * 32767), true);
    }
    originalMenuThemeUrl = URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
    return originalMenuThemeUrl;
  }

  const MUSIC_TRACKS = Object.freeze({
    // Menu is the loudness reference. Duel is deliberately attenuated because
    // its master has denser passages and otherwise sounds louder at the same slider value.
    menu: Object.freeze({ createSrc: createOriginalMenuThemeUrl, gain: 0.72, playbackRate: 1 }),
    duel: Object.freeze({ src: "assets/audio/bgm.ogg", gain: 0.55, playbackRate: 1 })
  });

  let musicUnlockListenersArmed = false;

  function armMusicUnlock() {
    if (musicUnlockListenersArmed) return;
    musicUnlockListenersArmed = true;
    window.addEventListener("pointerdown", unlockMusicFromGesture, true);
    window.addEventListener("touchstart", unlockMusicFromGesture, { capture: true, passive: true });
    window.addEventListener("click", unlockMusicFromGesture, true);
    window.addEventListener("keydown", unlockMusicFromGesture, true);
  }

  function disarmMusicUnlock() {
    if (!musicUnlockListenersArmed) return;
    musicUnlockListenersArmed = false;
    window.removeEventListener("pointerdown", unlockMusicFromGesture, true);
    window.removeEventListener("touchstart", unlockMusicFromGesture, true);
    window.removeEventListener("click", unlockMusicFromGesture, true);
    window.removeEventListener("keydown", unlockMusicFromGesture, true);
  }

  const musicManager = (() => {
    const channels = new Map();
    let activeScene = null;
    let unlocked = false;
    let suspended = document.visibilityState === "hidden";
    let transitionId = 0;
    let playRequestId = 0;
    let foregroundResumeTimer = 0;
    let foregroundRetryTimer = 0;
    let transitioningScene = null;

    function desiredScene() {
      const gameVisible = $("#gameView")?.classList.contains("active");
      const battleVisible = Boolean(engine && !$("#battlePanel")?.classList.contains("hidden"));
      return gameVisible && battleVisible ? "duel" : "menu";
    }

    function channelFor(scene) {
      const spec = MUSIC_TRACKS[scene];
      if (!spec) return null;
      if (!channels.has(scene)) {
        const source = spec.src || spec.createSrc?.();
        if (!source) return null;
        const audio = new Audio(source);
        audio.loop = true;
        audio.preload = "auto";
        audio.volume = 0;
        try {
          audio.playbackRate = spec.playbackRate || 1;
          if ("preservesPitch" in audio) audio.preservesPitch = true;
          if ("webkitPreservesPitch" in audio) audio.webkitPreservesPitch = true;
        } catch (e) {}
        channels.set(scene, { audio, spec });
      }
      return channels.get(scene);
    }

    function sceneVolume(scene) {
      const gain = Number(MUSIC_TRACKS[scene]?.gain ?? 1);
      return Math.max(0, Math.min(1, bgmVolume * gain));
    }

    function fade(channel, target, duration, token, onDone) {
      if (!channel) return;
      const audio = channel.audio;
      const from = Number(audio.volume || 0);
      const to = Math.max(0, Math.min(1, target));
      if (!duration || typeof requestAnimationFrame !== "function") {
        audio.volume = to;
        onDone?.();
        return;
      }
      const startedAt = performance.now();
      const step = now => {
        if (token !== transitionId) return;
        const progress = Math.min(1, Math.max(0, (now - startedAt) / duration));
        const eased = 0.5 - (Math.cos(Math.PI * progress) / 2);
        audio.volume = from + ((to - from) * eased);
        if (progress < 1) requestAnimationFrame(step);
        else onDone?.();
      };
      requestAnimationFrame(step);
    }

    function pauseChannels() {
      transitionId += 1;
      playRequestId += 1;
      transitioningScene = null;
      channels.forEach(({ audio }) => {
        try {
          if (!audio.paused) audio.pause();
          audio.volume = 0;
        } catch (e) {}
      });
    }

    function startScene(scene) {
      if (!bgmEnabled || UI_MODE === "essential" || suspended || document.visibilityState === "hidden") {
        pauseChannels();
        return;
      }
      if (!unlocked) {
        armMusicUnlock();
        return;
      }

      const next = channelFor(scene);
      if (!next) return;
      const sameScene = activeScene === scene;
      const previous = activeScene ? channels.get(activeScene) : null;
      if (transitioningScene === scene) return;
      if (sameScene && !next.audio.paused) {
        next.audio.volume = sceneVolume(scene);
        return;
      }

      const requestId = ++playRequestId;
      if (!sameScene) next.audio.volume = 0;
      let playPromise;
      try { playPromise = next.audio.play(); }
      catch (err) { playPromise = Promise.reject(err); }

      Promise.resolve(playPromise).then(() => {
        if (
          requestId !== playRequestId
          || !bgmEnabled
          || suspended
          || document.visibilityState === "hidden"
          || desiredScene() !== scene
        ) {
          if (activeScene !== scene) {
            try { next.audio.pause(); } catch (e) {}
          }
          return;
        }

        const token = ++transitionId;
        if (sameScene || !previous || previous === next) {
          activeScene = scene;
          transitioningScene = scene;
          fade(next, sceneVolume(scene), sameScene ? 220 : MUSIC_FADE_IN_MS, token, () => {
            if (token === transitionId) transitioningScene = null;
          });
          return;
        }

        // Bridge fade: the incoming track is already playing silently (important on iOS),
        // but it remains inaudible until the outgoing scene has faded away.
        transitioningScene = scene;
        next.audio.volume = 0;
        fade(previous, 0, MUSIC_FADE_OUT_MS, token, () => {
          if (token !== transitionId) return;
          try { previous.audio.pause(); } catch (e) {}
          activeScene = scene;
          fade(next, sceneVolume(scene), MUSIC_FADE_IN_MS, token, () => {
            if (token === transitionId) transitioningScene = null;
          });
        });
      }).catch(err => {
        if (requestId !== playRequestId) return;
        transitioningScene = null;
        if (err?.name === "NotAllowedError") {
          unlocked = false;
          armMusicUnlock();
        }
        console.warn("Background music play blocked or failed:", err);
      });
    }

    function sync() {
      suspended = document.visibilityState === "hidden";
      if (!bgmEnabled || UI_MODE === "essential" || suspended) {
        pauseChannels();
        return;
      }
      startScene(desiredScene());
    }

    return Object.freeze({
      sync,
      pause: pauseChannels,
      suspend() {
        suspended = true;
        window.clearTimeout(foregroundResumeTimer);
        window.clearTimeout(foregroundRetryTimer);
        pauseChannels();
      },
      resume() {
        suspended = document.visibilityState === "hidden";
        if (suspended) return;
        if (bgmEnabled && !unlocked) armMusicUnlock();

        // iOS may emit visibilitychange, pageshow and focus for the same foreground
        // transition. Collapse them into one resume sequence so overlapping play()
        // calls cannot fight each other.
        window.clearTimeout(foregroundResumeTimer);
        window.clearTimeout(foregroundRetryTimer);
        foregroundResumeTimer = window.setTimeout(() => {
          if (document.visibilityState === "hidden") return;
          sync();
          foregroundRetryTimer = window.setTimeout(() => {
            if (document.visibilityState !== "hidden") sync();
          }, 220);
        }, 70);
      },
      unlock() {
        unlocked = true;
        disarmMusicUnlock();
        sync();
      },
      setVolume() {
        const channel = activeScene ? channels.get(activeScene) : null;
        if (channel && !channel.audio.paused) channel.audio.volume = sceneVolume(activeScene);
      }
    });
  })();

  function syncBackgroundMusicScene() {
    musicManager.sync();
  }

  function setBackgroundMusicEnabled(enabled) {
    bgmEnabled = Boolean(enabled);
    try {
      window.localStorage.setItem("bgmEnabled", bgmEnabled ? "1" : "0");
    } catch (e) {}
    const battleToggle = document.querySelector("#bgmEnabled");
    const optionsToggle = document.querySelector("#optionsBgmEnabled");
    const duelToggle = document.querySelector("#duelOptionsBgmEnabled");
    if (battleToggle) battleToggle.checked = bgmEnabled;
    if (optionsToggle) optionsToggle.checked = bgmEnabled;
    if (duelToggle) duelToggle.checked = bgmEnabled;
    if (bgmEnabled) {
      armMusicUnlock();
      musicManager.sync();
    } else {
      disarmMusicUnlock();
      musicManager.pause();
    }
  }

  function startBackgroundMusic() {
    musicManager.sync();
  }

  function suspendTransientAudio() {
    try { window.speechSynthesis?.cancel?.(); } catch (e) {}
    activeOriginalSounds.forEach(sound => {
      try {
        sound.pause();
        sound.currentTime = 0;
      } catch (e) {}
    });
    activeOriginalSounds.clear();
    try {
      if (audioContext?.state === "running") audioContext.suspend();
    } catch (e) {}
  }

  function pauseBackgroundMusic() {
    suspendTransientAudio();
    musicManager.suspend();
  }

  function resumeBackgroundMusic() {
    musicManager.resume();
  }

  function handleBackgroundMusicVisibility() {
    if (document.visibilityState === "hidden") pauseBackgroundMusic();
    else resumeBackgroundMusic();
  }

  function unlockMusicFromGesture(event) {
    if (!event?.isTrusted) return;
    musicManager.unlock();
  }

  armMusicUnlock();

  try {
    const stored = window.localStorage.getItem("bgmEnabled");
    bgmEnabled = stored === null ? false : stored === "1";
    const bgmCheckbox = $("#bgmEnabled");
    const bgmSlider = $("#bgmVolume");

    const storedVol = window.localStorage.getItem("bgmVolume");
    if (storedVol !== null) {
      const n = Number(storedVol);
      if (!Number.isNaN(n)) bgmVolume = Math.max(0, Math.min(1, n / 100));
    }

    if (bgmSlider) {
      bgmSlider.value = Math.round(bgmVolume * 100);
      bgmSlider.addEventListener("input", e => {
        const v = Number(e.target.value || 0);
        bgmVolume = Math.max(0, Math.min(1, v / 100));
        window.localStorage.setItem("bgmVolume", String(Math.round(bgmVolume * 100)));
        musicManager.setVolume();
        const duelVolume = $("#duelOptionsBgmVolume");
        const duelValue = $("#duelOptionsBgmVolumeValue");
        if (duelVolume && duelVolume.value !== String(Math.round(bgmVolume * 100))) duelVolume.value = String(Math.round(bgmVolume * 100));
        if (duelValue) duelValue.textContent = Math.round(bgmVolume * 100) + "%";
      });
    }

    if (bgmCheckbox) {
      bgmCheckbox.checked = bgmEnabled;
      bgmCheckbox.addEventListener("change", e => setBackgroundMusicEnabled(e.target.checked));
    }
    document.addEventListener("visibilitychange", handleBackgroundMusicVisibility);
    window.addEventListener("pageshow", resumeBackgroundMusic);
    window.addEventListener("focus", resumeBackgroundMusic);
    // iOS/PWA can keep media alive briefly while the app switcher is open.
    // Suspend immediately on blur so audio is already stopped before the user
    // swipes the app away; pagehide/freeze remain additional safety nets.
    window.addEventListener("blur", pauseBackgroundMusic);
    window.addEventListener("pagehide", pauseBackgroundMusic);
    document.addEventListener("freeze", pauseBackgroundMusic);
    musicManager.sync();
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
    animationSpeed = 1.5;
    cardArtStyle = "new";
    soundEnabled = true;
    bgmEnabled = false;
    bgmVolume = 0.12;
    parchmentSpellFrames = false;
    $("#animationSpeed").value = "1.5";
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
    if (soundEnabled) ensureAudio();
  });
  $("#languageSelect")?.addEventListener("change", event => A.i18n?.setLanguage(event.target.value));
  async function proposeRemoteDuel(mode) {
    if (!remoteRoomClient || remoteRoomClient.side !== "player") return;
    try {
      const response = await remoteRoomClient.rematch("propose", mode);
      lastRemoteRoomState = response;
      renderRemoteLobby(response, { deferBattle: true });
      saveRemoteRoom();
    } catch (error) {
      if ($("#onlineFormMessage")) $("#onlineFormMessage").textContent = error.message || t("online.error");
    }
  }

  async function respondToRemoteDuel(action) {
    if (!remoteRoomClient || remoteRoomClient.side !== "enemy") return;
    try {
      const response = await remoteRoomClient.rematch(action);
      lastRemoteRoomState = response;
      if (action === "accept" && response.lifecycle?.status === "active") {
        remoteBattleSuspendedToMenu = false;
        remoteDuelActive = false;
        remoteRenderedSnapshotKey = "";
        remoteMatchStartedAt = Date.now();
        currentTurnDamage = 0;
        presentationLog = [];
      }
      renderRemoteLobby(response, { deferBattle: action !== "accept" });
      saveRemoteRoom();
      beginRemotePolling();
    } catch (error) {
      if ($("#onlineFormMessage")) $("#onlineFormMessage").textContent = error.message || t("online.error");
    }
  }

  async function syncHostLobbySettings() {
    if (remoteRoomClient?.side !== "player") return;
    const specializationsEnabled = $("#onlineLobbySpecializationsSelect")?.value === "on";
    syncLobbySpecializationVisibility();
    await updateRemoteLobbySettings({
      spellbookDistribution: normalizeSpellbookMode($("#onlineLobbyModeSelect")?.value),
      specializationsEnabled,
      ...(specializationsEnabled ? { playerSpecialization: $("#onlineLobbyHostSpecializationSelect")?.value || "random" } : {})
    });
  }

  $("#retryMultiplayerServerBtn")?.addEventListener("click", async () => {
    if (multiplayerServerStatus === "updating") {
      const activated = await activateWaitingAppUpdateIfSafe({ explicit: true });
      if (!activated) {
        rememberView("multiplayer");
        location.reload();
      }
      return;
    }
    checkMultiplayerServer({ force: true });
  });
  $("#refreshRoomBrowserBtn")?.addEventListener("click", refreshRoomBrowser);
  $("#showAvailableRoomsOnly")?.addEventListener("change", refreshRoomBrowser);
  $("#resumeOnlineMatchBtn")?.addEventListener("click", async () => {
    if (!remoteRoomClient || !lastRemoteRoomState) return;
    if (lastRemoteRoomState.lifecycle?.status === "finished") {
      hideRemoteBattleToMultiplayer(lastRemoteRoomState);
      return;
    }
    remoteBattleSuspendedToMenu = false;
    await refreshRemoteRoom();
    if (lastRemoteRoomState?.state) showRemoteBattle(lastRemoteRoomState, { force: true });
  });
  $("#remoteDisconnectReturnBtn")?.addEventListener("click", () => {
    if (lastRemoteRoomState?.lifecycle?.canReturnToMenu || remoteLifecycleStatus === "finished") {
      hideRemoteBattleToMultiplayer(lastRemoteRoomState);
    }
  });
  $("#onlineLobbyModeSelect")?.addEventListener("change", syncHostLobbySettings);
  $("#onlineLobbySpecializationsSelect")?.addEventListener("change", syncHostLobbySettings);
  $("#onlineLobbyHostSpecializationSelect")?.addEventListener("change", syncHostLobbySettings);
  $("#onlineLobbyGuestSpecializationSelect")?.addEventListener("change", event => {
    if (remoteRoomClient?.side !== "enemy") return;
    updateRemoteLobbySettings({ playerSpecialization: event.currentTarget.value || "random" });
  });
  $("#toggleOnlineReadyBtn")?.addEventListener("click", async () => {
    if (!remoteRoomClient || !lastRemoteRoomState) return;
    const side = remoteRoomClient.side;
    const currentlyReady = Boolean(lastRemoteRoomState?.lobbyReady?.[side]);
    try {
      const response = await remoteRoomClient.setReady(!currentlyReady);
      lastRemoteRoomState = response;
      renderRemoteLobby(response);
      saveRemoteRoom();
      beginRemotePolling();
    } catch (error) {
      if ($("#onlineFormMessage")) $("#onlineFormMessage").textContent = error.message || t("online.error");
    }
  });
  $("#resetOnlineSessionBtn")?.addEventListener("click", () => manageRemoteSession("reset"));
  $("#newOnlineOpponentBtn")?.addEventListener("click", () => manageRemoteSession("new_opponent"));
  $("#proposeSameCardsBtn")?.addEventListener("click", () => proposeRemoteDuel("same"));
  $("#proposeNewDuelBtn")?.addEventListener("click", () => proposeRemoteDuel("new"));
  $("#acceptRematchBtn")?.addEventListener("click", () => respondToRemoteDuel("accept"));
  $("#declineRematchBtn")?.addEventListener("click", () => respondToRemoteDuel("decline"));
  $("#muteOnlineChatCheckbox")?.addEventListener("change", event => {
    muteRemoteLobbyChat = Boolean(event.currentTarget.checked);
    setRemoteMutePreference("muteRemoteLobbyChat", muteRemoteLobbyChat);
    if (lastRemoteRoomState) renderRemoteMessages(lastRemoteRoomState);
  });
  $("#muteOnlinePhrasesCheckbox")?.addEventListener("change", event => {
    muteRemoteQuickPhrases = Boolean(event.currentTarget.checked);
    setRemoteMutePreference("muteRemoteQuickPhrases", muteRemoteQuickPhrases);
    if (muteRemoteQuickPhrases) {
      window.clearTimeout(remoteQuickChatToastTimer);
      remoteQuickChatToastTimer = null;
      $("#duelQuickChatToast")?.classList.add("hidden");
    }
    if (lastRemoteRoomState) renderRemoteMessages(lastRemoteRoomState);
  });
  $("#onlineLobbyChatForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const input = $("#onlineLobbyChatInput");
    const text = String(input?.value || "").trim();
    if (!text || !remoteRoomClient) return;
    try {
      const payload = await remoteRoomClient.sendMessage(text);
      if (input) input.value = "";
      if (lastRemoteRoomState) {
        lastRemoteRoomState = { ...lastRemoteRoomState, messages: payload.messages || lastRemoteRoomState.messages || [] };
        renderRemoteMessages(lastRemoteRoomState);
      }
    } catch (error) {
      if ($("#onlineFormMessage")) $("#onlineFormMessage").textContent = error.message || t("online.error");
    }
  });
  $$("[data-quick-phrase]").forEach(button => button.addEventListener("click", async () => {
    if (!remoteRoomClient || !remoteDuelActive) return;
    try {
      const payload = await remoteRoomClient.sendPhrase(button.dataset.quickPhrase);
      if (lastRemoteRoomState) {
        lastRemoteRoomState = { ...lastRemoteRoomState, messages: payload.messages || lastRemoteRoomState.messages || [] };
        renderRemoteMessages(lastRemoteRoomState);
      }
      $("#duelQuickChat")?.removeAttribute("open");
    } catch (error) {
      setMessage(error.message || t("online.error"));
    }
  }));
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
  $$("[data-multiplayer-entry-mode]").forEach(button => button.addEventListener("click", () => {
    setMultiplayerEntryMode(button.dataset.multiplayerEntryMode);
  }));
  $("#findRankedMatchBtn")?.addEventListener("click", startRankedSearch);
  $("#cancelRankedSearchBtn")?.addEventListener("click", cancelRankedSearch);
  $("#refreshRankedLeaderboardBtn")?.addEventListener("click", refreshRankedLeaderboard);
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
      remoteSeenMessageIds = new Set();
      remoteMessagesInitialized = false;
      remoteRecordedMatchId = "";
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
      remoteSeenMessageIds = new Set();
      remoteMessagesInitialized = false;
      remoteRecordedMatchId = "";
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
    const lifecycle = lastRemoteRoomState?.lifecycle?.status;
    if (["finished", "waiting"].includes(lifecycle)) {
      await remoteRoomClient?.leave().catch(() => {});
    } else {
      await remoteRoomClient?.forfeit().catch(() => {});
      await remoteRoomClient?.leave().catch(() => {});
    }
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
  renderMultiplayerEntryMode();
  initializeOnlineAccount().then(() => {
    if ($("#profileView")?.classList.contains("active")) renderPlayerProfile();
  }).catch(() => {});
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
  switchView(rememberedView());
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
  } else if (!restoredRemoteRoom && (!RESTORABLE_VIEWS.has(urlParams.get("view") || "") || urlParams.get("view") === "game")) {
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
