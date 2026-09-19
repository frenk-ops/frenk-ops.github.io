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

  const showEntry = () => {
    if (!isStandalone()) entry.hidden = false;
  };

  const hideEntry = () => {
    entry.hidden = true;
  };

  const openInstructions = () => {
    overlay.hidden = false;
    document.body.classList.add("pwa-install-dialog-open");
  };

  const closeInstructions = () => {
    overlay.hidden = true;
    document.body.classList.remove("pwa-install-dialog-open");
  };

  if (isStandalone()) {
    hideEntry();
    return;
  }

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

  button.addEventListener("click", async () => {
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
    if (event.key === "Escape" && !overlay.hidden) closeInstructions();
  });
})();
