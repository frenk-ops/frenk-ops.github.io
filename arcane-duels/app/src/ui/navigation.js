(function (A) {
  "use strict";

  function createNavigation(options = {}) {
    const tabs = [...document.querySelectorAll(".tab[data-view]")];
    const jumps = [...document.querySelectorAll("[data-view-jump]")];
    const mobileMoreButton = document.querySelector("[data-mobile-more]");
    const mobileMoreBackdrop = document.querySelector("[data-mobile-more-backdrop]");
    const mobileMoreClose = document.querySelector("[data-mobile-more-close]");
    const params = new URLSearchParams(window.location.search);
    const developerMode = params.get("dev") === "1";

    document.body.classList.toggle("developer-mode", developerMode);
    document.querySelectorAll(".dev-only").forEach(node => node.classList.toggle("hidden", !developerMode));

    function setMobileMoreOpen(open) {
      if (!mobileMoreBackdrop || !mobileMoreButton) return;
      mobileMoreBackdrop.classList.toggle("hidden", !open);
      mobileMoreBackdrop.setAttribute("aria-hidden", open ? "false" : "true");
      mobileMoreButton.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.classList.toggle("mobile-more-open", open);
      if (open) mobileMoreClose?.focus();
    }

    tabs.forEach(tab => tab.addEventListener("click", () => {
      setMobileMoreOpen(false);
      options.onViewChange?.(tab.dataset.view);
    }));

    jumps.forEach(control => control.addEventListener("click", () => {
      const view = control.dataset.viewJump;
      setMobileMoreOpen(false);
      if (view === "game") options.onReturnToGame?.();
      options.onViewChange?.(view);
    }));

    mobileMoreButton?.addEventListener("click", () => {
      setMobileMoreOpen(mobileMoreButton.getAttribute("aria-expanded") !== "true");
    });
    mobileMoreClose?.addEventListener("click", () => setMobileMoreOpen(false));
    mobileMoreBackdrop?.addEventListener("click", event => {
      if (event.target === mobileMoreBackdrop) setMobileMoreOpen(false);
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && mobileMoreButton?.getAttribute("aria-expanded") === "true") {
        setMobileMoreOpen(false);
        mobileMoreButton.focus();
      }
    });

    return Object.freeze({
      developerMode,
      setActive(viewName) {
        tabs.forEach(tab => {
          const active = tab.dataset.view === viewName;
          tab.classList.toggle("active", active);
          if (active) tab.setAttribute("aria-current", "page");
          else tab.removeAttribute("aria-current");
        });

        if (mobileMoreButton) {
          const moreActive = ["rules", "diagnostics", "editor"].includes(viewName);
          mobileMoreButton.classList.toggle("active", moreActive);
          if (moreActive) mobileMoreButton.setAttribute("aria-current", "page");
          else mobileMoreButton.removeAttribute("aria-current");
        }
      }
    });
  }

  A.UINavigation = Object.freeze({ create: createNavigation });
})(window.Arcane = window.Arcane || {});
