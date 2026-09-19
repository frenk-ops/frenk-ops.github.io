"use strict";

(() => {
  const entry = document.getElementById("pwaInstallEntry");
  const button = document.getElementById("pwaInstallBtn");
  const overlay = document.getElementById("pwaInstallOverlay");
  const closeButtons = document.querySelectorAll("[data-pwa-install-close]");

  if (!entry || !button || !overlay) return;

  let deferredPrompt = null;

  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true;

  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const hideEntry = () => {
    entry.hidden = true;
    entry.style.display = "none";
  };

  const showEntry = () => {
    if (isStandalone()) {
      hideEntry();
      return;
    }
    entry.hidden = false;
    entry.style.display = "flex";
  };

  const closeInstructions = () => {
    overlay.hidden = true;
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("pwa-install-dialog-open");
  };

  const openInstructions = () => {
    if (isStandalone()) {
      closeInstructions();
      hideEntry();
      return;
    }
    overlay.hidden = false;
    overlay.style.display = "grid";
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("pwa-install-dialog-open");
  };

  // Fail-safe: the install UI must never be visible just because CSS failed
  // to load or an older stylesheet is still cached.
  hideEntry();
  closeInstructions();

  if (isStandalone()) return;
  if (isIOS) showEntry();

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredPrompt = event;
    showEntry();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    hideEntry();
    closeInstructions();
  });

  const standaloneMedia = window.matchMedia("(display-mode: standalone)");
  if (typeof standaloneMedia.addEventListener === "function") {
    standaloneMedia.addEventListener("change", () => {
      if (isStandalone()) {
        hideEntry();
        closeInstructions();
      }
    });
  }

  button.addEventListener("click", async () => {
    if (isStandalone()) {
      hideEntry();
      closeInstructions();
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      try {
        const choice = await deferredPrompt.userChoice;
        if (choice && choice.outcome === "accepted") hideEntry();
      } finally {
        deferredPrompt = null;
      }
      return;
    }

    openInstructions();
  });

  closeButtons.forEach(closeButton => {
    closeButton.addEventListener("click", closeInstructions);
  });

  overlay.addEventListener("click", event => {
    if (event.target === overlay) closeInstructions();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeInstructions();
  });

  window.addEventListener("pagehide", closeInstructions);
})();
