(function (A) {
  "use strict";

  const VIEW_GROUPS = Object.freeze({
    play:"play",
    game:"play",
    multiplayer:"play",
    tournament:"play",
    cards:"archive",
    inventory:"archive",
    chronicles:"archive",
    forge:"forge",
    uiLab:"forge",
    academy:"academy",
    profile:"academy",
    rules:"utility",
    diagnostics:"utility"
  });

  function createNavigation(options = {}) {
    const tabs = [...document.querySelectorAll(".tab[data-view]")];
    const jumps = [...document.querySelectorAll("[data-view-jump]")];
    const modeTabs = [...document.querySelectorAll("[data-play-mode-navigation] [data-mode-view]")];
    const shellUtilities = [...document.querySelectorAll("[data-shell-utility][data-view-jump]")];
    const params = new URLSearchParams(window.location.search);
    const developerMode = params.get("dev") === "1";

    document.body.classList.toggle("developer-mode", developerMode);
    document.querySelectorAll(".dev-only").forEach(node => node.classList.toggle("hidden", !developerMode));

    tabs.forEach(tab => tab.addEventListener("click", () => {
      options.onViewChange?.(tab.dataset.view);
    }));

    jumps.forEach(control => control.addEventListener("click", () => {
      const view = control.dataset.viewJump;
      if (view === "game") options.onReturnToGame?.();
      options.onViewChange?.(view);
    }));

    modeTabs.forEach(control => control.addEventListener("click", () => {
      options.onViewChange?.(control.dataset.modeView);
    }));

    return Object.freeze({
      developerMode,
      setActive(viewName) {
        const group = VIEW_GROUPS[viewName] || null;
        tabs.forEach(tab => {
          const active = tab.dataset.view === viewName
            || Boolean(group && tab.dataset.navGroup === group);
          tab.classList.toggle("active", active);
          if (active) tab.setAttribute("aria-current", "page");
          else tab.removeAttribute("aria-current");
        });
        modeTabs.forEach(tab => {
          const active = tab.dataset.modeView === viewName;
          tab.classList.toggle("is-active", active);
          tab.setAttribute("aria-pressed", active ? "true" : "false");
        });
        shellUtilities.forEach(control => {
          const active = control.dataset.viewJump === viewName;
          control.classList.toggle("is-active", active);
          if (active) control.setAttribute("aria-current", "page");
          else control.removeAttribute("aria-current");
        });
      }
    });
  }

  A.UINavigation = Object.freeze({ create: createNavigation });
})(window.Arcane = window.Arcane || {});
