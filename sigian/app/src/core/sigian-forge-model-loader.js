(function (A) {
  "use strict";
  if (typeof document !== "undefined") A.SIGIAN_FORGE_STATIC_RUNTIME = true;
  let state = { status:"idle", error:null, core:null };
  let pending = null;
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    return value;
  }
  async function digest(value) {
    if (!globalThis.crypto?.subtle) throw new Error("Verifica del modello non disponibile: apri il gioco tramite HTTPS o localhost.");
    const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
    return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
  }
  A.getSigianForgeModelState = () => ({ status:state.status, error:state.error, modelId:state.core?.modelId || null });
  A.getPreparedSigianForgeMathCore = function () {
    if (state.status !== "ready") throw new Error(state.error || "Preparazione Forgia in corso.");
    return state.core;
  };
  A.prepareSigianForgeMath = function () {
    if (pending) return pending;
    state = { status:"loading", error:null, core:null };
    pending = (async () => {
      const config = A.SIGIAN_FORGE_MODEL_CONFIG;
      if (!config?.url || !/^[a-f0-9]{64}$/.test(config.modelId || "") || !/^[a-f0-9]{64}$/.test(config.sourceFingerprint || ""))
        throw new Error("Configurazione del modello Forgia mancante o incompatibile.");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      let artifact;
      try {
        const response = await fetch(config.url, { signal:controller.signal });
        if (!response.ok) throw new Error("Modello Forgia non disponibile (HTTP " + response.status + ").");
        artifact = await response.json();
      } finally { clearTimeout(timeout); }
      const { modelId, ...payload } = artifact;
      if (artifact.artifactSchemaVersion !== 1 || modelId !== config.modelId || artifact.sourceFingerprint !== config.sourceFingerprint
        || await digest(payload) !== config.modelId || await digest(artifact.sourceManifest) !== config.sourceFingerprint)
        throw new Error("Modello Forgia non aggiornato o danneggiato. Ricarica il gioco.");
      const restored = A.restoreSigianForgeStaticModel(artifact.model);
      state = { status:"ready", error:null, core:{ ...restored, modelId, sampleCount:restored.calibration.sampleCount } };
      return state.core;
    })().catch(error => {
      state = { status:"error", error:error.name === "AbortError" ? "Caricamento del modello Forgia scaduto. Riprova." : String(error.message || error), core:null };
      throw new Error(state.error);
    });
    return pending;
  };
  A.retrySigianForgeMath = function () {
    if (state.status !== "error") return A.prepareSigianForgeMath();
    pending = null;
    return A.prepareSigianForgeMath();
  };
})(window.Arcane = window.Arcane || {});
