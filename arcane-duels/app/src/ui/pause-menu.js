(function (A) {
  "use strict";

  function createPauseMenu(options = {}) {
    const root = options.root;
    if (!root) return null;
    let tournamentMode = false;
    let onlineMode = false;

    const normalActions = root.querySelector("#normalDuelPauseActions");
    const normalAbandon = root.querySelector(".normal-pause-action");
    const tournamentAbandon = root.querySelector(".tournament-pause-action");
    const subtitle = root.querySelector("#duelPauseSubtitle");
    const primary = root.querySelector("#continueDuelBtn");
    const mainView = root.querySelector("#duelPauseMainView");
    const optionsView = root.querySelector("#duelPauseOptionsView");
    const optionsButton = root.querySelector("#openDuelOptionsBtn");
    const optionsTitle = root.querySelector("#duelPauseOptionsTitle");

    function showMain(focus = false) {
      mainView?.classList.remove("hidden");
      optionsView?.classList.add("hidden");
      root.setAttribute("aria-labelledby", "duelPauseTitle");
      if (focus) optionsButton?.focus({ preventScroll: true });
    }

    function showOptions() {
      mainView?.classList.add("hidden");
      optionsView?.classList.remove("hidden");
      root.setAttribute("aria-labelledby", "duelPauseOptionsTitle");
      options.onOptions?.();
      // Keep focus inside the dialog without triggering the native mobile select.
      if (optionsTitle) {
        optionsTitle.setAttribute("tabindex", "-1");
        optionsTitle.focus({ preventScroll: true });
      }
    }

    function close() {
      showMain(false);
      root.classList.add("hidden");
      root.setAttribute("aria-hidden", "true");
      document.body.classList.remove("duel-paused");
      options.onToggle?.(false);
    }

    function open(config = {}) {
      tournamentMode = Boolean(config.tournamentMode);
      onlineMode = Boolean(config.onlineMode);
      normalActions?.classList.toggle("hidden", tournamentMode || onlineMode);
      normalAbandon?.classList.toggle("hidden", tournamentMode);
      tournamentAbandon?.classList.toggle("hidden", !tournamentMode);
      if (subtitle) subtitle.textContent = config.subtitle || "";
      showMain(false);
      root.classList.remove("hidden");
      root.setAttribute("aria-hidden", "false");
      document.body.classList.add("duel-paused");
      options.onToggle?.(true);
      primary?.focus({ preventScroll: true });
    }

    function toggle(config = {}) {
      if (root.classList.contains("hidden")) open(config);
      else close();
    }

    root.querySelector("#continueDuelBtn")?.addEventListener("click", close);
    root.querySelector("#restartSameSetsBtn")?.addEventListener("click", () => { close(); options.onRestart?.(); });
    root.querySelector("#startNewDrawBtn")?.addEventListener("click", () => { close(); options.onNewDuel?.(); });
    optionsButton?.addEventListener("click", showOptions);
    root.querySelector("#backFromDuelOptionsBtn")?.addEventListener("click", () => showMain(true));
    root.querySelector("#continueFromDuelOptionsBtn")?.addEventListener("click", close);
    root.querySelector("#returnMainMenuBtn")?.addEventListener("click", () => { close(); options.onAbandonDuel?.(); });
    root.querySelector("#abandonTournamentMatchBtn")?.addEventListener("click", () => { close(); options.onAbandonTournamentMatch?.(); });
    root.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!optionsView?.classList.contains("hidden")) showMain(true);
        else close();
      }
    });

    return Object.freeze({
      open,
      close,
      toggle,
      isOpen: () => !root.classList.contains("hidden"),
      isOptionsOpen: () => !optionsView?.classList.contains("hidden"),
      isTournamentMode: () => tournamentMode,
      isOnlineMode: () => onlineMode
    });
  }

  A.UIPauseMenu = Object.freeze({ create: createPauseMenu });
})(window.Arcane = window.Arcane || {});
