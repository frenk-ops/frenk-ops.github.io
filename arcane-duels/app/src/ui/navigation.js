(function (A) {
  "use strict";

  function createNavigation(options = {}) {
    const tabs = [...document.querySelectorAll(".tab[data-view]")];
    const jumps = [...document.querySelectorAll("[data-view-jump]")];
    const params = new URLSearchParams(window.location.search);
    const developerMode = params.get("dev") === "1";

    document.body.classList.toggle("developer-mode", developerMode);
    document.querySelectorAll(".dev-only").forEach(node => node.classList.toggle("hidden", !developerMode));

    tabs.forEach(tab => tab.addEventListener("click", () => options.onViewChange?.(tab.dataset.view)));
    jumps.forEach(control => control.addEventListener("click", () => {
      const view = control.dataset.viewJump;
      if (view === "game") options.onReturnToGame?.();
      options.onViewChange?.(view);
    }));

    return Object.freeze({
      developerMode,
      setActive(viewName) {
        tabs.forEach(tab => {
          const active = tab.dataset.view === viewName;
          tab.classList.toggle("active", active);
          if (active) tab.setAttribute("aria-current", "page");
          else tab.removeAttribute("aria-current");
        });
      }
    });
  }

  A.UINavigation = Object.freeze({ create: createNavigation });
})(window.Arcane = window.Arcane || {});
