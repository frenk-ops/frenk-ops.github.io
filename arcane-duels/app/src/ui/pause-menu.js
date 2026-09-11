(function (A) {
  "use strict";

  function createPauseMenu(options = {}) {
    const root = options.root;
    if (!root) return null;
    let tournamentMode = false;

    const normalActions = root.querySelector("#normalDuelPauseActions");
    const normalAbandon = root.querySelector(".normal-pause-action");
    const tournamentAbandon = root.querySelector(".tournament-pause-action");
    const subtitle = root.querySelector("#duelPauseSubtitle");
    const primary = root.querySelector("#continueDuelBtn");

    function close() {
      root.classList.add("hidden");
      root.setAttribute("aria-hidden", "true");
      document.body.classList.remove("duel-paused");
      options.onToggle?.(false);
    }

    function open(config = {}) {
      tournamentMode = Boolean(config.tournamentMode);
      normalActions?.classList.toggle("hidden", tournamentMode);
      normalAbandon?.classList.toggle("hidden", tournamentMode);
      tournamentAbandon?.classList.toggle("hidden", !tournamentMode);
      if (subtitle) subtitle.textContent = config.subtitle || "";
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
    root.querySelector("#openDuelOptionsBtn")?.addEventListener("click", () => { close(); options.onOptions?.(); });
    root.querySelector("#returnMainMenuBtn")?.addEventListener("click", () => { close(); options.onAbandonDuel?.(); });
    root.querySelector("#abandonTournamentMatchBtn")?.addEventListener("click", () => { close(); options.onAbandonTournamentMatch?.(); });
    root.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    });

    return Object.freeze({
      open,
      close,
      toggle,
      isOpen: () => !root.classList.contains("hidden"),
      isTournamentMode: () => tournamentMode
    });
  }

  A.UIPauseMenu = Object.freeze({ create: createPauseMenu });
})(window.Arcane = window.Arcane || {});
