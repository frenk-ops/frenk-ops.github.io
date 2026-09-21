"use strict";

(() => {
  const entry = document.getElementById("pwaInstallEntry");
  const button = document.getElementById("pwaInstallBtn");
  const overlay = document.getElementById("pwaInstallOverlay");
  const closeButtons = document.querySelectorAll("[data-pwa-install-close]");
  const intro = document.getElementById("pwaInstallIntro");
  const step1 = document.getElementById("pwaInstallStep1");
  const step2 = document.getElementById("pwaInstallStep2");

  if (!entry || !button || !overlay) return;

  let deferredPrompt = null;
  const userAgent = navigator.userAgent || "";

  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true;

  const isIOS =
    /iPad|iPhone|iPod/.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const isAndroid = /Android/i.test(userAgent);
  const isAndroidWebView = isAndroid && (
    /\bwv\b/i.test(userAgent) ||
    /Instagram|FBAN|FBAV|TikTok|Line\/|Twitter|WhatsApp/i.test(userAgent)
  );

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

  const setInstructionCopy = () => {
    if (!intro || !step1 || !step2) return;

    if (isIOS) {
      intro.textContent = "Su iPhone l’installazione richiede un passaggio nel menu Condividi.";
      step1.innerHTML = "Tocca <strong>Condividi</strong> in Safari.";
      step2.innerHTML = "Scegli <strong>Aggiungi alla schermata Home</strong>.";
      return;
    }

    if (isAndroidWebView) {
      intro.textContent = "Per installare Arcane Duels come app, apri questa pagina nel browser Chrome.";
      step1.innerHTML = "Apri il menu del browser e scegli <strong>Apri in Chrome</strong>.";
      step2.innerHTML = "In Chrome tocca <strong>⋮</strong> e scegli <strong>Installa app</strong>.";
      return;
    }

    if (isAndroid) {
      intro.textContent = "Arcane Duels può essere installato come app da Chrome.";
      step1.innerHTML = "Tocca <strong>⋮</strong> in alto a destra.";
      step2.innerHTML = "Scegli <strong>Installa app</strong>. Se il prompt è disponibile, usa direttamente il pulsante qui sopra.";
      return;
    }

    intro.textContent = "Installa Arcane Duels dal menu del browser.";
    step1.innerHTML = "Apri il menu principale del browser.";
    step2.innerHTML = "Scegli <strong>Installa app</strong> o <strong>Aggiungi alla schermata Home</strong>.";
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
    setInstructionCopy();
    overlay.hidden = false;
    overlay.style.display = "grid";
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("pwa-install-dialog-open");
  };

  hideEntry();
  closeInstructions();

  if (isStandalone()) return;

  // Keep the install affordance discoverable on Android even if the browser
  // does not expose beforeinstallprompt yet (first visit or in-app browser).
  if (isIOS || isAndroid) showEntry();

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

    // Android must always acknowledge the tap immediately. Keep these
    // instructions visible underneath the native prompt so a rejected or
    // broken browser prompt never looks like a dead button.
    if (isAndroid) openInstructions();

    const promptEvent = deferredPrompt;
    if (promptEvent) {
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice && choice.outcome === "accepted") {
          hideEntry();
          closeInstructions();
        }
      } catch (error) {
        console.warn("Prompt installazione PWA non disponibile:", error);
        openInstructions();
      } finally {
        if (deferredPrompt === promptEvent) deferredPrompt = null;
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
