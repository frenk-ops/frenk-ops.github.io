(function (A) {
  "use strict";
  // Presentation only. No recipe mutations, particle generator or idle JS loop.
  const selectors = { school:"[data-lab-school-main]", art:".forge-lab-art-layer", attack:"[data-lab-control='attack']", health:"[data-lab-control='health']", cost:"[data-lab-control='cost']", type:"[data-lab-toggle-type]", name:"[data-lab-edit-name]" };
  let root = null, previous = null, abort = null, sequence = 0, lastArc = -Infinity;
  const animations = new Map(), recent = new Map();
  const escape = value => String(value).replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
  const reduced = () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  function nameMarkup(name) {
    const words = String(name).split(/\s+/), lines = [];
    if (name.length > 22 && words.length > 1) {
      let best = 1;
      for (let i=1;i<words.length;i++) if (Math.abs(words.slice(0,i).join(" ").length-words.slice(i).join(" ").length) < Math.abs(words.slice(0,best).join(" ").length-words.slice(best).join(" ").length)) best=i;
      lines.push(words.slice(0,best).join(" ")+" ", words.slice(best).join(" "));
    } else lines.push(String(name));
    const id = "lab-name-curve-" + ++sequence;
    return '<span class="forge-lab-curved-name"><svg viewBox="0 0 260 36" aria-hidden="true" focusable="false"><defs>' +
      lines.map((_,index) => '<path id="'+id+'-'+index+'" d="M 12 '+(lines.length===1?22:11+index*15)+' Q 130 '+(lines.length===1?31:20+index*15)+' 248 '+(lines.length===1?22:11+index*15)+'"/>').join("") + '</defs>' +
      lines.map((line,index) => '<text><textPath href="#'+id+'-'+index+'" startOffset="50%" text-anchor="middle">'+escape(line)+'</textPath></text>').join("") + '</svg></span>';
  }
  function fitName(target = root) {
    const span = target?.querySelector(".forge-lab-curved-name"), svg = span?.querySelector("svg");
    if (!svg || !span.clientWidth) return;
    // Match the viewBox to the actual safe-area aspect ratio: SVG's default
    // letterboxing would otherwise shrink the text again on narrow ribbons.
    const height = Math.max(1, svg.clientHeight * 260 / span.clientWidth);
    svg.setAttribute("viewBox", "0 0 260 " + height);
    const paths = [...svg.querySelectorAll("path")];
    paths.forEach((path,index) => {
      const y = height * (paths.length === 1 ? .64 : .43 + index * .45);
      path.setAttribute("d", "M 12 " + y + " Q 130 " + (y + height * .1) + " 248 " + y);
    });
    const desired = Math.min(parseFloat(getComputedStyle(span).fontSize) * 260 / span.clientWidth, height * (paths.length === 1 ? .65 : .42));
    svg.style.fontSize = desired + "px";
    const texts = [...svg.querySelectorAll("text")];
    const longest = Math.max(1, ...texts.map(text => text.getComputedTextLength?.() || 1));
    if (longest > 228) svg.style.fontSize = desired * 228 / longest + "px";
  }
  function cancel() { for (const animation of animations.values()) animation.cancel(); animations.clear(); }
  function suspend() { cancel(); abort?.abort(); abort = null; root = null; previous = null; recent.clear(); }
  function play(element, frames, duration) {
    if (!element?.isConnected || typeof element.animate !== "function") return;
    animations.get(element)?.cancel();
    const animation = element.animate(frames, { duration, easing:"ease-out" });
    animations.set(element, animation);
    animation.finished.then(() => { if (animations.get(element) === animation) animations.delete(element); }).catch(() => {});
  }
  function feedback(kind, value) {
    if (!root?.isConnected || root.classList.contains("is-designing") || document.hidden) return;
    if (previous && value != null) previous[kind] = String(value);
    const target = root.querySelector(selectors[kind]);
    if (!target) return;
    const now = performance.now();
    if (now - (recent.get(kind) ?? -Infinity) < 180) return;
    recent.set(kind, now);
    root.dataset.labMagicEvent = kind;
    if (reduced()) return; // Editing remains fully functional without pulses/flashes.
    const response = target.querySelector(".forge-lab-magic-response");
    play(response, [{opacity:0,transform:"scale(.82)"},{opacity:.75,offset:.25},{opacity:0,transform:"scale(1.16)"}],kind==="school"?900:600);
    if (kind === "school") play(root.querySelector(".forge-lab-magic-wave"),[{opacity:0,transform:"scale(.7)"},{opacity:.32,offset:.25},{opacity:0,transform:"scale(1.18)"}],1000);
    if (kind === "art") {
      const image = target.querySelector("img:not(.is-error)");
      const evoke = () => play(image,[{opacity:0},{opacity:1}],700);
      if (image?.complete && image.naturalWidth) evoke();
      else image?.addEventListener("load",evoke,{once:true,signal:abort.signal});
    }
    if (["school","art","attack"].includes(kind) && now-lastArc>1100 && !root.querySelector(".forge-lab-stage.no-atmosphere") && root.dataset.labMagicQuality !== "low") {
      lastArc=now;
      root.querySelectorAll(".forge-lab-magic-arc").forEach(element => play(element,[{opacity:0},{opacity:.62,offset:.2},{opacity:.3,offset:.48},{opacity:0}],850));
    }
  }
  function snapshot(target) {
    const card = target.querySelector(".forge-lab-card");
    return { school:[...card.classList].find(name=>name.startsWith("school-")), art:target.querySelector("[data-lab-art-image]")?.getAttribute("src") || "", attack:target.querySelector(selectors.attack+" strong")?.textContent || "", health:target.querySelector(selectors.health+" strong")?.textContent || "", cost:target.querySelector(selectors.cost+" strong")?.textContent || "", type:target.querySelector(selectors.type)?.textContent || "", name:target.querySelector("[data-lab-edit-name]")?.getAttribute("aria-label") || target.querySelector("[data-lab-name-inline-form] input")?.value || "" };
  }
  function mount(target) {
    cancel(); abort?.abort(); abort = new AbortController(); root=target;
    for (const [kind,selector] of Object.entries(selectors)) {
      const element = root.querySelector(selector); if (!element) continue;
      const response=document.createElement("i"); response.className="forge-lab-magic-response is-"+kind; response.setAttribute("aria-hidden","true"); element.append(response);
    }
    const frame=root.querySelector(".forge-lab-card-frame"), wave=document.createElement("i");
    wave.className="forge-lab-magic-wave"; wave.setAttribute("aria-hidden","true"); frame?.append(wave);
    const updateQuality=()=>{
      root.dataset.labMagicQuality=reduced() || window.navigator?.connection?.saveData || (window.navigator?.hardwareConcurrency && window.navigator.hardwareConcurrency<=4) ? "low" : window.matchMedia?.("(pointer: coarse)").matches ? "medium" : "high";
      root.classList.toggle("lab-magic-paused",document.hidden);
      if(document.hidden || reduced()) cancel();
    };
    const media=window.matchMedia?.("(prefers-reduced-motion: reduce)");
    media?.addEventListener?.("change",updateQuality,{signal:abort.signal});
    document.addEventListener("visibilitychange",updateQuality,{signal:abort.signal});
    window.addEventListener("resize",()=>fitName(),{signal:abort.signal});
    updateQuality(); fitName();
    refresh();
  }
  function refresh() {
    if (!root?.isConnected) return;
    const before = previous, current = snapshot(root); previous = current;
    if (!before || root.classList.contains("is-designing")) return;
    const changed=Object.keys(current).filter(key=>before[key]!==current[key]);
    if(changed.includes("school")) feedback("school");
    else if(changed.includes("art")) feedback("art");
    else if(changed.includes("type")) feedback("type");
    else for(const kind of changed) if(before[kind] && current[kind]) feedback(kind);
  }
  A.ForgeLabMagic=Object.freeze({mount,suspend,feedback,fitName,nameMarkup,refresh});
})(window.Arcane=window.Arcane||{});
