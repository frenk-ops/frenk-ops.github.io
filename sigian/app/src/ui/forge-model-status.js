(function (A) {
  "use strict";
  const jobs = new WeakMap();
  A.ensureForgeModelForView = function (root, onReady, isActive) {
    if (!A.SIGIAN_FORGE_STATIC_RUNTIME || A.getSigianForgeModelState?.().status === "ready") return true;
    if (!root) return false;
    function show() {
      const status = A.getSigianForgeModelState?.() || { status:"error", error:"Caricatore Forgia non disponibile." };
      const panel = document.createElement("section"); panel.className = "forge-panel ornate-subpanel";
      panel.dataset.forgeModelStatus = status.status;
      panel.setAttribute("role", status.status === "error" ? "alert" : "status");
      const heading = document.createElement("h3");
      heading.textContent = status.status === "error" ? "Forgia temporaneamente non disponibile" : "Preparazione Forgia…";
      const detail = document.createElement("p");
      detail.textContent = status.status === "error" ? status.error + " Le altre sezioni restano disponibili." : "Caricamento del modello di valutazione. La bozza salvata non viene modificata.";
      panel.append(heading, detail);
      if (status.status === "error" && A.retrySigianForgeMath) {
        const retry = document.createElement("button"); retry.type = "button"; retry.className = "classic-stone-button"; retry.textContent = "Riprova";
        retry.onclick = () => { jobs.delete(root); A.retrySigianForgeMath().catch(() => {}); A.ensureForgeModelForView(root, onReady, isActive); };
        panel.append(retry);
      }
      root.replaceChildren(panel);
    }
    show();
    if (!jobs.has(root) && A.prepareSigianForgeMath && A.getSigianForgeModelState?.().status !== "error") {
      const job = A.prepareSigianForgeMath(); jobs.set(root, job);
      job.then(() => { if (jobs.get(root) === job && isActive()) onReady(); }, () => { if (jobs.get(root) === job && isActive()) show(); });
    }
    return false;
  };
})(window.Arcane = window.Arcane || {});
