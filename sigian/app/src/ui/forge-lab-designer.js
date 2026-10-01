(function (A) {
  "use strict";

  // Presentation data only: never holds or mutates a FormulaRecipe/session.
  const KEY = "sigian.forge-lab.design.v1";
  const APPLIED_KEY = "sigian.forge-lab.design.applied.v2";
  const SAVED_KEY = "sigian.forge-lab.design.saved.v2";
  const entries = [
    ["paper", "Pergamena · struttura", ".forge-lab-card-frame", null, 0],
    ["art", "Art · cornice / immagine", ".forge-lab-art-anchor", ".forge-lab-art-layer", 60],
    ["name", "Fascia Nome", ".forge-lab-name-anchor", ".forge-lab-nameplate", 60],
    ["nameText", "Testo Nome / safe area", ".forge-lab-nameplate span", null, 0],
    ["cost", "Costo · medaglione", ".forge-lab-cost-anchor", ".forge-lab-cost", 60],
    ["costText", "Costo · valore", ".forge-lab-cost strong", null, 0],
    ["type", "Tipo · placca", ".forge-lab-type-anchor", ".forge-lab-type", 60],
    ["school", "Scuola · medaglione", ".forge-lab-school-anchor", ".forge-lab-school", 60],
    ["schoolIcon", "Scuola · simbolo", ".forge-lab-school-icon", null, 0],
    ["attack", "ATT · gruppo", ".forge-lab-stat.attack", null, 60],
    ["attackIcon", "ATT · spade", ".forge-lab-stat-emblem.is-attack", null, 0],
    ["attackText", "ATT · valore", ".forge-lab-stat.attack strong", null, 0],
    ["health", "VITA · gruppo", ".forge-lab-stat.health", null, 60],
    ["healthIcon", "VITA · scudo", ".forge-lab-stat-emblem.is-health", null, 0],
    ["healthText", "VITA · valore", ".forge-lab-stat.health strong", null, 0],
    ["sigils", "Sigilli · gruppo impresso", ".forge-lab-sigils", null, 2],
    ["sigil1", "Sigillo 1", ".forge-lab-sigil-row:nth-child(1)", null, 2],
    ["sigil2", "Sigillo 2", ".forge-lab-sigil-row:nth-child(2)", null, 2],
    ["sigil3", "Sigillo 3", ".forge-lab-sigil-row:nth-child(3)", null, 2],
    ["socket", "Vincolo · socket strutturale", ".forge-lab-constraint-bank", ".forge-lab-constraint-socket", 0],
    ["orb", "Vincolo · sfera", ".forge-lab-constraint-orb", null, 24],
    ["light", "Bagliore della Scuola", ".forge-lab-school-light", null, 0]
  ].map(([id, label, selector, visual, depth]) => ({ id, label, selector, visual, depth }));
  const limits = { x:[-100,100], y:[-100,100], scaleX:[25,200], scaleY:[25,200], rotation:[-45,45], depth:[0,60], opacity:[0,100], fontSize:[8,48], glow:[0,24] };
  const defaults = () => ({ x:0, y:0, scaleX:100, scaleY:100, rotation:0, depth:0, opacity:100, fontSize:null, color:null, glow:0 });
  const artDefaults = () => ({ frame:"pigment", zoom:100, imageX:50, imageY:30, panX:0, panY:0 });
  const empty = () => ({ version:2, kind:"sigian-formula-presentation", baseRevision:"0318007", coordinates:"card-percent", pose:{ tiltX:6, tiltY:0, tiltZ:0, depth:92 }, presets:{ unstable:{ elements:{}, art:artDefaults() }, sealed:{ elements:{}, art:artDefaults() } } });
  const copy = value => JSON.parse(JSON.stringify(value));
  let config = empty(), active = false, preset = "unstable", selected = "art", viewport = "forge";
  let undo = [], redo = [], root = null, context = null, abort = null, observer = null, frame = 0, drag = null, pending = null;
  let inspectorOpen = null;
  let projection = "perspective", applied = empty(), saved = null;
  let artEditing = "frame";
  const baseline = new Map();
  const nativeFilters = new Map();
  const record = id => config.presets[preset].elements[id] || defaults();

  function validate(input) {
    if (!input || ![1,2].includes(input.version) || !input.presets) throw new Error("Formato non compatibile: serve un progetto Formula v1 o v2.");
    if (input.kind && input.kind !== "sigian-formula-presentation") throw new Error("Tipo progetto non valido.");
    if (input.baseRevision && input.baseRevision !== "0318007") throw new Error("Preset riferito a una base grafica diversa: serve una migrazione esplicita.");
    const result = empty();
    if (input.pose) for (const [key,min,max] of [["tiltX",-30,30],["tiltY",-30,30],["tiltZ",-20,20],["depth",0,100]]) {
      const value=input.pose[key];
      if (typeof value!=="number" || !Number.isFinite(value) || value<min || value>max) throw new Error("Prospettiva non valida: "+key);
      result.pose[key]=value;
    }
    for (const mode of ["unstable", "sealed"]) {
      const art = input.presets[mode]?.art;
      if (art) {
        if (!["pigment","soft","runic"].includes(art.frame)) throw new Error("Cornice Art non valida.");
        for (const [key,min,max] of [["zoom",25,300],["imageX",0,100],["imageY",0,100]]) {
          if (typeof art[key]!=="number" || !Number.isFinite(art[key]) || art[key]<min || art[key]>max) throw new Error("Ritaglio Art non valido: "+key);
        }
        result.presets[mode].art={ ...artDefaults(), frame:art.frame, zoom:art.zoom, imageX:art.imageX, imageY:art.imageY };
        for (const key of ["panX","panY"]) {
          if (art[key] == null) continue; // Existing v2 files retain their original crop.
          if (typeof art[key] !== "number" || !Number.isFinite(art[key]) || Math.abs(art[key]) > 100) throw new Error("Spostamento Art non valido: "+key);
          result.presets[mode].art[key] = art[key];
        }
      }
      const values = input.presets[mode]?.elements;
      if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("Preset incompleto.");
      for (const item of entries) {
        if (!Object.prototype.hasOwnProperty.call(values, item.id)) continue;
        const value = values[item.id];
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Elemento non valido.");
        const clean = defaults();
        for (const [key, [min, max]] of Object.entries(limits)) {
          if (key === "fontSize" && value[key] == null) continue;
          if (typeof value[key] !== "number" || !Number.isFinite(value[key]) || value[key] < min || value[key] > max) throw new Error("Parametro fuori intervallo: " + key);
          clean[key] = key === "depth" ? Math.min(item.depth, value[key]) : value[key];
        }
        if (value.color != null && !/^#[a-f0-9]{6}$/i.test(value.color)) throw new Error("Colore non valido.");
        clean.color = value.color || null;
        result.presets[mode].elements[item.id] = clean;
      }
    }
    return result;
  }

  if (A.ForgeLabApprovedDesign) config = validate(A.ForgeLabApprovedDesign);
  applied = copy(config);
  try { const value = window.localStorage.getItem(KEY); if (value) config = validate(JSON.parse(value)); } catch { /* Invalid drafts never block the Lab. */ }
  try { const value = window.localStorage.getItem(APPLIED_KEY); if (value) applied = validate(JSON.parse(value)); } catch { /* Keep the approved fallback. */ }
  try { const value = window.localStorage.getItem(SAVED_KEY); if (value) saved = validate(JSON.parse(value)); } catch { /* Explicit save is optional. */ }

  function status(message) { const output = root?.querySelector("[data-design-status]"); if (output) output.textContent = message; }
  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(config)); status("Bozza aggiornata sul browser · Salva progetto per un checkpoint; Applica per usarla nella Forgia."); }
    catch { status("Salvataggio locale non disponibile: esporta il JSON per conservare il progetto."); }
  }
  function commit(before) {
    if (!before || JSON.stringify(before) === JSON.stringify(config)) return;
    undo.push(before); if (undo.length > 60) undo.shift(); redo = []; save(); updatePanel();
  }
  function finishInput() { const before = pending; pending = null; commit(before); if (active) drawSelection(); }
  function targets(item) {
    const element = root?.querySelector(item.selector);
    return { element, visual:element && (item.visual ? element.querySelector(item.visual) : element) };
  }
  function remember(element, property) {
    if (!baseline.has(element)) baseline.set(element, {});
    const saved = baseline.get(element);
    if (!Object.prototype.hasOwnProperty.call(saved, property)) saved[property] = { value:element.style.getPropertyValue(property), priority:element.style.getPropertyPriority(property) };
  }
  function style(element, property, value) {
    property = property.replace(/[A-Z]/g, letter => "-" + letter.toLowerCase());
    remember(element, property);
    element.style.setProperty(property, value, property === "rotate" ? "important" : "");
  }
  function apply() {
    if (!root) return;
    for (const [element, values] of baseline) for (const [key, saved] of Object.entries(values)) element.style.setProperty(key, saved.value, saved.priority);
    const card = root.querySelector(".forge-lab-card");
    if (!card) return;
    const current = active ? config : applied, mode = active ? preset : "unstable";
    if (active) context.onPose?.(current.pose);
    card.dataset.labDesignPreset = mode;
    card.dataset.labDesignGeometry = "shared";
    card.style.setProperty("--lab-design-unit", card.offsetWidth / 310 + "px");
    const art = current.presets[mode].art;
    card.dataset.labArtFrame = art.frame;
    card.dataset.labArtAdjusted = String(art.zoom < 100 || art.panX !== 0 || art.panY !== 0);
    const cardWidth = card.offsetWidth, cardHeight = card.offsetHeight;
    const layer = card.querySelector(".forge-lab-art-layer");
    const artWidth = layer?.offsetWidth || 0, artHeight = layer?.offsetHeight || 0;
    const image = card.querySelector("[data-lab-art-image]");
    if (image) {
      style(image,"objectPosition",`${art.imageX}% ${art.imageY}%`); style(image,"transformOrigin",`${art.imageX}% ${art.imageY}%`); style(image,"scale",String(art.zoom/100));
      style(image,"translate",`${art.panX * artWidth / 100}px ${art.panY * artHeight / 100}px`);
    }
    for (const item of entries) {
      const value = current.presets[mode].elements[item.id];
      const { element, visual } = targets(item);
      if (!value || !element) continue;
      style(element, "translate", `${value.x * cardWidth / 100}px ${value.y * cardHeight / 100}px ${value.depth}px`);
      style(element, "scale", `${value.scaleX / 100} ${value.scaleY / 100}`);
      style(element, "rotate", `${value.rotation}deg`);
      style(element, "opacity", String(value.opacity / 100));
      if (item.id === "art") style(element, "transformOrigin", "50% 29%");
      if (value.fontSize != null) {
        const texts = item.id === "name" ? element.querySelectorAll(".forge-lab-nameplate span") :
          element.matches("strong, span") ? [element] : element.querySelectorAll("strong, .forge-lab-chip, .forge-lab-type");
        for (const text of texts) style(text, "fontSize", value.fontSize + "px");
      }
      if (value.color) {
        style(element, "color", value.color);
        for (const text of element.querySelectorAll("strong, .forge-lab-chip, .forge-lab-nameplate span")) style(text, "color", value.color);
      }
      if (value.glow && visual) style(visual, "filter", `${nativeFilters.get(visual) || ""} drop-shadow(0 0 ${value.glow}px ${value.color || "var(--lab-school-bright)"})`);
    }
    schedule();
  }
  function schedule() {
    if (frame || !active) return;
    frame = window.requestAnimationFrame(() => { frame = 0; drawSelection(); });
  }
  function drawSelection() {
    A.ForgeLabMagic?.fitName(root);
    const box = root?.querySelector("[data-design-box]");
    const visual = selected === "art" && artEditing === "image" ? root.querySelector("[data-lab-art-image]") : targets(entries.find(item => item.id === selected)).visual;
    if (!box || !visual) { if (box) box.hidden = true; return; }
    const stageElement = root.querySelector(".forge-lab-stage"), stage = stageElement.getBoundingClientRect(), rect = visual.getBoundingClientRect();
    const zoom = stage.width / Math.max(1, stageElement.offsetWidth);
    box.hidden = false;
    Object.assign(box.style, { left:(rect.left - stage.left) / zoom + "px", top:(rect.top - stage.top) / zoom + "px", width:rect.width / zoom + "px", height:rect.height / zoom + "px" });
    // Keep the touch handle reachable even when the user enlarges Art beyond
    // the mobile canvas. The outline still shows the actual, unclipped bounds.
    box.querySelector("[data-design-resize]").style.right = (Math.max(0, rect.right - window.innerWidth + 26) - 20) / zoom + "px";
    box.dataset.designSelected = selected;
    box.setAttribute("aria-label", selected === "art" && artEditing === "image" ? "Art · immagine interna" : entries.find(item => item.id === selected).label);
  }
  function updatePanel() {
    if (!root || !active) return;
    const item = entries.find(entry => entry.id === selected), value = record(selected), { element } = targets(item);
    const select = root.querySelector("[data-design-element]");
    if (select) select.value = selected;
    root.querySelectorAll("[data-design-prop]").forEach(control => {
      const key = control.dataset.designProp;
      control.disabled = !element || (selected === "art" && artEditing === "image") || (key === "depth" && item.depth === 0);
      if (key === "fontSize" && element && !element.matches("strong, .forge-lab-nameplate span") && !element.querySelector("strong, .forge-lab-type, .forge-lab-chip")) control.disabled = true;
      if (key === "depth") control.max = item.depth;
      if (document.activeElement !== control) control.value = key === "color" ? (value.color || "#a94416") :
        key === "fontSize" ? (value.fontSize || Math.round(parseFloat(element ? getComputedStyle(element).fontSize : 16))) : Math.round(value[key] * 100) / 100;
    });
    root.querySelector("[data-design-undo]").disabled = undo.length === 0;
    root.querySelector("[data-design-redo]").disabled = redo.length === 0;
    root.querySelector("[data-design-load-saved]").disabled = !saved;
    root.querySelector("[data-design-reset]").textContent = selected === "art" && artEditing === "image" ? "Reset immagine interna" : "Reset elemento";
    const art=config.presets[preset].art;
    root.querySelector("[data-design-art-editing]").value = artEditing;
    root.querySelectorAll("[data-design-art]").forEach(control=>{ if(document.activeElement!==control) control.value=art[control.dataset.designArt]; });
    root.querySelectorAll("[data-design-pose]").forEach(control=>{ if(document.activeElement!==control) control.value=config.pose[control.dataset.designPose]; });
    const notice = root.querySelector("[data-design-element-note]");
    notice.textContent = selected === "art" && artEditing === "image" ? "Trascina l’immagine dentro la cornice; la maniglia ↘ regola lo zoom. La cornice resta ferma. Sotto il 100% può emergere la pergamena." : !element ? "Non presente: ATT/VITA richiedono Creatura, la sfera richiede un Vincolo occupato." :
      item.depth === 0 ? "Struttura o sottoelemento: profondità legata al piano padre." : item.depth === 2 ? "Sigillo impresso: profondità limitata a 2 px." : "Elemento sospeso: profondità aggiuntiva regolabile.";
    schedule();
  }
  function choose(id) { finishInput(); selected = id; updatePanel(); }
  function field(key, label, step) {
    const [min, max] = limits[key];
    return `<label>${label}<input type="number" data-design-prop="${key}" min="${min}" max="${max}" step="${step || 1}"></label>`;
  }
  function panelMarkup() {
    return `<section class="forge-lab-designer-panel" aria-label="Progetta Formula">
      <p>Trascina o usa la maniglia ↘; coordinate in % della carta. Su mobile richiudi il pannello per manipolarla. La bozza non cambia la Forgia finché non premi Applica.</p>
      <p>“Sigillata” è solo un’anteprima grafica: non sigilla la Formula, non consuma componenti e non modifica il gioco.</p>
      <div class="forge-lab-designer-controls">
        <label>Preset<select data-design-preset><option value="unstable">Forgia instabile</option><option value="sealed">Formula sigillata · preview</option></select></label>
        <label>Anteprima<select data-design-viewport><option value="forge">Forgia attuale · 1:1</option><option value="mobile">Mobile</option><option value="desktop">Desktop</option><option value="game">Gioco · 60%</option></select></label>
        <label class="is-wide">Vista<select data-design-projection><option value="perspective">Prospettiva Forgia · congelata</option><option value="flat">Frontale · senza prospettiva</option></select></label>
        <label>Inclinazione X (°)<input type="number" data-design-pose="tiltX" min="-30" max="30" step=".5"></label>
        <label>Inclinazione Y (°)<input type="number" data-design-pose="tiltY" min="-30" max="30" step=".5"></label>
        <label>Rotazione carta (°)<input type="number" data-design-pose="tiltZ" min="-20" max="20" step=".5"></label>
        <label>Profondità carta (px)<input type="number" data-design-pose="depth" min="0" max="100"></label>
        <label class="is-wide">Vincolo nella preview<select data-design-orb-mode><option value="canonical">Vincolo attuale</option><option value="occupied">Esempio occupato</option><option value="empty">Esempio vuoto</option></select></label>
        <label class="is-wide">Elemento<select data-design-element>${entries.map(item => `<option value="${item.id}">${item.label}</option>`).join("")}</select></label>
        ${field("x", "Sposta X (%)", .25)}${field("y", "Sposta Y (%)", .25)}
        ${field("scaleX", "Larghezza (%)")}${field("scaleY", "Altezza (%)")}
        ${field("rotation", "Rotazione (°)", .5)}${field("depth", "Profondità extra (px)")}
        ${field("fontSize", "Testo (px)")}${field("opacity", "Opacità (%)")}
        ${field("glow", "Bagliore (px)")}<label>Colore override<input type="color" data-design-prop="color"></label>
        <label class="is-wide">Fusione / cornice Art<select data-design-art="frame"><option value="pigment">Pigmento · bordo irregolare</option><option value="soft">Evocazione · dissolvenza morbida</option><option value="runic">Evocazione · cerchio runico</option></select></label>
        <label class="is-wide">Trascinamento Art<select data-design-art-editing><option value="frame">Cornice · sposta / ridimensiona</option><option value="image">Immagine interna · sposta / zoom</option></select></label>
        <label>Zoom immagine (%)<input type="number" data-design-art="zoom" min="25" max="300" step="1"></label>
        <label>Sposta immagine X (%)<input type="number" data-design-art="panX" min="-100" max="100" step=".25"></label>
        <label>Sposta immagine Y (%)<input type="number" data-design-art="panY" min="-100" max="100" step=".25"></label>
        <label>Ritaglio sorgente X (%)<input type="number" data-design-art="imageX" min="0" max="100"></label>
        <label>Ritaglio sorgente Y (%)<input type="number" data-design-art="imageY" min="0" max="100"></label>
        <p class="is-wide">Sposta immagine funziona anche quando il ritaglio sorgente non cambia, per esempio con un’immagine delle stesse proporzioni della cornice.</p>
      </div>
      <p data-design-element-note></p>
      <div class="forge-lab-designer-actions">
        <button type="button" data-design-undo>Annulla</button><button type="button" data-design-redo>Ripristina</button>
        <button type="button" data-design-reset>Reset elemento</button><button type="button" data-design-copy>Copia nell’altro preset</button>
        <button type="button" data-design-reset-style>Reset stile, conserva posizione</button>
        <button type="button" data-design-save>Salva progetto · browser</button><button type="button" data-design-load-saved>Riapri progetto salvato</button>
        <button type="button" data-design-apply>Applica alla Forgia Lab</button>
        <button type="button" data-design-export>Esporta progetto da condividere</button><label class="forge-lab-designer-import">Importa JSON<input type="file" accept=".json,application/json" data-design-import></label>
      </div>
      <details class="forge-lab-designer-json"><summary>Configurazione da copiare / incollare</summary><textarea data-design-json aria-label="Configurazione visuale JSON" spellcheck="false"></textarea><button type="button" data-design-import-text>Applica JSON</button></details>
      <p data-design-status role="status" aria-live="polite">Modifiche solo grafiche. Salvataggio automatico su questo browser.</p>
    </section>`;
  }
  function mount(target, options) {
    abort?.abort(); observer?.disconnect(); if (frame) window.cancelAnimationFrame(frame); frame = 0;
    baseline.clear(); nativeFilters.clear(); root = target; context = options; drag = null; pending = null;
    for (const item of entries) { const { visual } = targets(item); if (visual) { const filter = getComputedStyle(visual).filter; nativeFilters.set(visual, filter === "none" ? "" : filter); } }
    abort = new AbortController();
    const on = (element, name, fn, capture = false) => element?.addEventListener(name, fn, { signal:abort.signal, capture });
    const toolbar = document.createElement("div"); toolbar.className = "forge-lab-designer-toolbar";
    toolbar.innerHTML = `<button type="button" data-design-toggle aria-pressed="${active}">${active ? "Termina · senza applicare" : "Progetta Formula"}</button><span>${active ? "Editor grafico · le azioni della Forgia sono sospese" : "Seleziona, sposta e ridimensiona i componenti della Formula"}</span>`;
    root.prepend(toolbar); root.classList.toggle("is-designing", active);
    root.dataset.designViewport = viewport;
    root.dataset.designProjection = projection;
    context.onPose?.((active ? config : applied).pose);
    on(toolbar.querySelector("button"), "click", () => { finishInput(); active = !active; context.onModeChange(active); });
    if (!active) { root.removeAttribute("tabindex"); preset = "unstable"; apply(); toolbar.querySelector("span").textContent="Forgia Lab: ultimo progetto applicato · la bozza resta disponibile in Progetta Formula"; return; }
    const inspector = document.createElement("details"); inspector.className = "forge-lab-designer-inspector";
    inspector.open = inspectorOpen ?? window.matchMedia("(min-width: 981px)").matches;
    inspector.innerHTML = '<summary>Regola elemento selezionato</summary>' + panelMarkup();
    root.querySelector(".forge-lab-tuning").replaceWith(inspector);
    on(inspector, "toggle", () => { inspectorOpen = inspector.open; });
    const stage = root.querySelector(".forge-lab-stage");
    const overlay = document.createElement("div"); overlay.className = "forge-lab-designer-overlay";
    overlay.innerHTML = '<div class="forge-lab-designer-center" aria-hidden="true"></div><div data-design-box hidden><span>Elemento selezionato</span><button type="button" data-design-resize aria-label="Ridimensiona elemento selezionato">↘</button></div>';
    stage.append(overlay);
    root.querySelector("[data-design-preset]").value = preset;
    root.querySelector("[data-design-viewport]").value = viewport;
    root.querySelector("[data-design-projection]").value = projection;
    root.querySelector("[data-design-orb-mode]").value = options.constraintPreview || "canonical";
    on(root.querySelector("[data-design-orb-mode]"), "change", event => { finishInput(); context.onConstraintPreview(event.target.value); });
    on(root.querySelector("[data-design-preset]"), "change", event => { finishInput(); preset = event.target.value; apply(); updatePanel(); });
    on(root.querySelector("[data-design-viewport]"), "change", event => { viewport = event.target.value; root.dataset.designViewport = viewport; apply(); });
    on(root.querySelector("[data-design-projection]"),"change",event=>{ projection=event.target.value; root.dataset.designProjection=projection; apply(); });
    root.querySelectorAll("[data-design-pose]").forEach(control=>{
      on(control,"input",()=>{ if(control.value==="" || !Number.isFinite(Number(control.value))) return; pending ||= copy(config); config.pose[control.dataset.designPose]=Math.max(Number(control.min),Math.min(Number(control.max),Number(control.value))); context.onPose?.(config.pose); schedule(); });
      on(control,"change",finishInput); on(control,"blur",finishInput);
    });
    root.querySelectorAll("[data-design-art]").forEach(control=>{
      on(control,"input",()=>{ pending ||= copy(config); const key=control.dataset.designArt; if(key==="frame") config.presets[preset].art.frame=control.value; else if(control.value!=="" && Number.isFinite(Number(control.value))) config.presets[preset].art[key]=Math.max(Number(control.min),Math.min(Number(control.max),Number(control.value))); apply(); });
      on(control,"change",()=>{ finishInput(); updatePanel(); }); on(control,"blur",finishInput);
    });
    on(root.querySelector("[data-design-art-editing]"), "change", event => { finishInput(); artEditing = event.target.value; choose("art"); });
    on(root.querySelector("[data-design-element]"), "change", event => choose(event.target.value));
    on(root, "click", event => { if (event.target.closest(".forge-lab-card, [data-design-resize]")) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
    on(root, "pointerdown", event => {
      const resize = event.target.closest("[data-design-resize]");
      if (!resize && !event.target.closest(".forge-lab-card")) return;
      if (event.button !== 0 || event.isPrimary === false) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!resize) {
        const candidates = entries.filter(item => targets(item).element?.contains(event.target));
        const item = candidates.sort((a, b) => targets(a).element.contains(targets(b).element) ? 1 : -1)[0];
        choose(item?.id || "paper");
      }
      root.focus({ preventScroll:true });
      const card = root.querySelector(".forge-lab-card");
      if (selected === "art" && artEditing === "image") {
        const image = root.querySelector("[data-lab-art-image]"), layer = root.querySelector(".forge-lab-art-layer");
        if (!image || image.classList.contains("is-error")) { status("Art non disponibile: scegli un’immagine caricata prima di regolarla."); return; }
        const value = copy(config.presets[preset].art), old = image.style.translate;
        const localX = value.panX * layer.offsetWidth / 100, localY = value.panY * layer.offsetHeight / 100;
        const at = () => { const r = image.getBoundingClientRect(); return { x:r.left+r.width/2, y:r.top+r.height/2 }; }, origin = at();
        image.style.translate = `${localX+1}px ${localY}px`; const px = at();
        image.style.translate = `${localX}px ${localY+1}px`; const py = at(); image.style.translate = old;
        const a=px.x-origin.x,b=py.x-origin.x,c=px.y-origin.y,d=py.y-origin.y,det=a*d-b*c;
        const rect = image.getBoundingClientRect();
        drag = { image:true, pointer:event.pointerId, x:event.clientX, y:event.clientY, before:copy(config), value, resize:Boolean(resize), width:rect.width, height:rect.height, card:{width:layer.offsetWidth,height:layer.offsetHeight}, inverse:Math.abs(det)>.00001 ? {a:d/det,b:-b/det,c:-c/det,d:a/det}:null };
        root.setPointerCapture(event.pointerId); return;
      }
      const rect = targets(entries.find(item => item.id === selected)).visual?.getBoundingClientRect();
      // Sample a local-to-screen Jacobian once per gesture. This includes the
      // frozen perspective, nesting, scale and zoom without a continuous loop.
      const { element, visual }=targets(entries.find(item=>item.id===selected)), value=copy(record(selected));
      const old=element.style.translate, localX=value.x*card.offsetWidth/100, localY=value.y*card.offsetHeight/100;
      const at=()=>{ const r=visual.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; }, origin=at();
      element.style.translate=`${localX+1}px ${localY}px ${value.depth}px`; const px=at();
      element.style.translate=`${localX}px ${localY+1}px ${value.depth}px`; const py=at(); element.style.translate=old;
      const a=px.x-origin.x,b=py.x-origin.x,c=px.y-origin.y,d=py.y-origin.y,det=a*d-b*c;
      drag = { pointer:event.pointerId, x:event.clientX, y:event.clientY, before:copy(config), value, resize:Boolean(resize), width:rect?.width || 1, height:rect?.height || 1, card:{width:card.offsetWidth,height:card.offsetHeight}, inverse:Math.abs(det)>.00001 ? {a:d/det,b:-b/det,c:-c/det,d:a/det}:null };
      root.setPointerCapture(event.pointerId);
    }, true);
    on(root, "pointermove", event => {
      if (!drag || drag.pointer !== event.pointerId) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const value = copy(drag.value), dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (drag.image) {
        if (drag.resize) value.zoom = Math.max(25, Math.min(300, drag.value.zoom * (1 + (dx / drag.width + dy / drag.height) / 2)));
        else {
          const localX=drag.inverse ? drag.inverse.a*dx+drag.inverse.b*dy : dx, localY=drag.inverse ? drag.inverse.c*dx+drag.inverse.d*dy : dy;
          value.panX = Math.max(-100, Math.min(100, drag.value.panX + localX / drag.card.width * 100));
          value.panY = Math.max(-100, Math.min(100, drag.value.panY + localY / drag.card.height * 100));
        }
        config.presets[preset].art = value; apply(); updatePanel(); return;
      }
      if (drag.resize) {
        value.scaleX = Math.max(25, Math.min(200, drag.value.scaleX * (drag.width + dx) / drag.width));
        value.scaleY = Math.max(25, Math.min(200, drag.value.scaleY * (drag.height + dy) / drag.height));
      } else {
        const localX=drag.inverse ? drag.inverse.a*dx+drag.inverse.b*dy : dx, localY=drag.inverse ? drag.inverse.c*dx+drag.inverse.d*dy : dy;
        value.x = Math.max(-100, Math.min(100, drag.value.x + localX / drag.card.width * 100));
        value.y = Math.max(-100, Math.min(100, drag.value.y + localY / drag.card.height * 100));
      }
      config.presets[preset].elements[selected] = value; apply(); updatePanel();
    }, true);
    const finishDrag = (event, cancel) => {
      if (!drag || drag.pointer !== event.pointerId) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const before = drag.before; drag = null;
      if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
      if (cancel) { config = before; apply(); updatePanel(); } else commit(before);
    };
    on(root, "pointerup", event => finishDrag(event, false), true);
    on(root, "pointercancel", event => finishDrag(event, true), true);
    on(root, "lostpointercapture", event => { if (drag) finishDrag(event, true); }, true);
    root.querySelectorAll("[data-design-prop]").forEach(control => {
      on(control, "input", () => {
        pending ||= copy(config);
        const key = control.dataset.designProp, item = entries.find(entry => entry.id === selected), value = copy(record(selected));
        if (key === "color") value.color = control.value;
        else {
          const [min, max] = limits[key], number = Number(control.value);
          if (control.value === "" || !Number.isFinite(number)) return;
          value[key] = Math.max(min, Math.min(key === "depth" ? item.depth : max, number));
        }
        config.presets[preset].elements[selected] = value; apply();
      });
      on(control, "change", () => { finishInput(); updatePanel(); });
      on(control, "blur", finishInput);
    });
    on(root.querySelector("[data-design-undo]"), "click", () => { finishInput(); if (!undo.length) return; redo.push(copy(config)); config = undo.pop(); apply(); save(); updatePanel(); });
    on(root.querySelector("[data-design-redo]"), "click", () => { finishInput(); if (!redo.length) return; undo.push(copy(config)); config = redo.pop(); apply(); save(); updatePanel(); });
    on(root.querySelector("[data-design-save]"),"click",()=>{ finishInput(); try { window.localStorage.setItem(SAVED_KEY,JSON.stringify(config)); saved=copy(config); updatePanel(); status("Progetto salvato su questo browser. Esporta per consegnarlo o conservarlo fuori dal browser."); } catch(_) { status("Salvataggio non disponibile: esporta il progetto."); } });
    on(root.querySelector("[data-design-load-saved]"),"click",()=>{ if(!saved) return; finishInput(); const before=copy(config); config=copy(saved); context.onPose?.(config.pose); apply(); commit(before); updatePanel(); status("Checkpoint salvato riaperto. La Forgia non cambia finché non premi Applica."); });
    on(root.querySelector("[data-design-apply]"),"click",()=>{ finishInput(); try { window.localStorage.setItem(APPLIED_KEY,JSON.stringify(config)); } catch(_) { status("Impossibile conservare il progetto applicato: esporta prima il JSON."); return; } applied=copy(config); active=false; context.onModeChange(false); });
    on(root.querySelector("[data-design-reset]"), "click", () => { finishInput(); const before = copy(config); if (selected === "art" && artEditing === "image") Object.assign(config.presets[preset].art, {zoom:100,panX:0,panY:0}); else delete config.presets[preset].elements[selected]; apply(); commit(before); updatePanel(); });
    on(root.querySelector("[data-design-reset-style]"), "click", () => { finishInput(); const before = copy(config), value = copy(record(selected)); Object.assign(value, { fontSize:null, color:null, glow:0, opacity:100 }); config.presets[preset].elements[selected] = value; apply(); commit(before); updatePanel(); });
    on(root.querySelector("[data-design-copy]"), "click", () => { finishInput(); const before = copy(config); config.presets[preset === "unstable" ? "sealed" : "unstable"] = copy(config.presets[preset]); commit(before); status("Copiato nell’altro preset · puoi annullare questa operazione."); });
    const importText = text => { try { finishInput(); const next = validate(JSON.parse(text)), before = copy(config); config = next; apply(); commit(before); updatePanel(); status("Configurazione importata. Le regole della Formula non sono cambiate."); } catch (error) { status("Importazione rifiutata: " + error.message); } };
    on(root.querySelector("[data-design-export]"), "click", () => {
      finishInput(); const json = JSON.stringify(config, null, 2); root.querySelector("[data-design-json]").value = json;
      const url = URL.createObjectURL(new Blob([json], { type:"application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = "sigian-formula-design-v2.json"; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000); status("JSON esportato; disponibile anche nel riquadro da copiare.");
    });
    on(root.querySelector("[data-design-import-text]"), "click", () => importText(root.querySelector("[data-design-json]").value));
    on(root.querySelector("[data-design-import]"), "change", async event => {
      const input = event.target, file = input.files[0]; if (!file) return;
      try { if (file.size > 100000) status("File troppo grande (limite 100 KB)."); else importText(await file.text()); }
      catch (_) { status("Impossibile leggere il file. La configurazione non è cambiata."); }
      finally { input.value = ""; }
    });
    on(window, "resize", () => apply()); on(window, "scroll", schedule, true);
    on(root, "keydown", event => {
      if (event.target.matches("input, select, textarea, button")) return;
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      if (selected === "art" && artEditing === "image") {
        event.preventDefault(); const before = copy(config), art = config.presets[preset].art, step = event.shiftKey ? 1 : .25;
        const key = ["ArrowLeft", "ArrowRight"].includes(event.key) ? "panX" : "panY";
        art[key] = Math.max(-100, Math.min(100, art[key] + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -step : step)));
        apply(); commit(before); return;
      }
      event.preventDefault(); const before = copy(config), value = copy(record(selected)), step = event.shiftKey ? 1 : .25;
      const key = ["ArrowLeft", "ArrowRight"].includes(event.key) ? "x" : "y";
      value[key] = Math.max(-100, Math.min(100, value[key] + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -step : step)));
      config.presets[preset].elements[selected] = value; apply(); commit(before);
    });
    root.tabIndex = 0;
    observer = new ResizeObserver(() => { apply(); }); observer.observe(root.querySelector(".forge-lab-card"));
    apply(); updatePanel();
  }
  A.ForgeLabDesigner = Object.freeze({ mount, isActive:() => active, validate, snapshot:() => copy(config),
    suspend() { abort?.abort(); observer?.disconnect(); if (frame) window.cancelAnimationFrame(frame); frame = 0; drag = null; }
  });
})(window.Arcane = window.Arcane || {});
