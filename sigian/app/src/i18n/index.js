(function (A) {
  "use strict";
  const supported = ["it", "en"];
  const storageKey = "arcaneLanguage";
  const normalize = value => supported.includes(String(value || "").toLowerCase().split("-")[0])
    ? String(value).toLowerCase().split("-")[0] : null;
  const params = typeof location !== "undefined" ? new URLSearchParams(location.search) : null;
  const fromUrl = normalize(params?.get("lang"));
  const fromStorage = (() => { try { return normalize(localStorage.getItem(storageKey)); } catch (_) { return null; } })();
  const fromBrowser = normalize(typeof navigator !== "undefined" ? navigator.language : null);
  let language = fromUrl || fromStorage || fromBrowser || "en";

  function interpolate(value, vars) {
    return String(value).replace(/\{(\w+)\}/g, (_, key) => Object.hasOwn(vars || {}, key) ? vars[key] : `{${key}}`);
  }
  function t(key, vars, requestedLanguage = language) {
    const catalog = A.I18N_CATALOGS?.[requestedLanguage] || {};
    const fallback = A.I18N_CATALOGS?.en || {};
    const value = catalog[key] ?? fallback[key];
    if (value === undefined) {
      if (typeof console !== "undefined" && console.warn) console.warn(`[i18n] Missing key: ${key}`);
      return key;
    }
    return interpolate(value, vars);
  }
  function applyDocumentTranslations() {
    if (typeof document === "undefined") return;
    document.documentElement.lang = language;
    document.querySelectorAll("[data-i18n]").forEach(node => { node.textContent = t(node.dataset.i18n); });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(node => { node.placeholder = t(node.dataset.i18nPlaceholder); });
    document.querySelectorAll("[data-i18n-aria-label]").forEach(node => node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel)));
    const picker = document.querySelector("#languageSelect");
    if (picker) picker.value = language;
  }
  function setLanguage(next, options = {}) {
    const normalized = normalize(next);
    if (!normalized) return false;
    language = normalized;
    if (options.persist !== false) {
      try { localStorage.setItem(storageKey, language); } catch (_) {}
    }
    applyDocumentTranslations();
    if (typeof window !== "undefined" && typeof CustomEvent === "function") {
      window.dispatchEvent(new CustomEvent("arcane:languagechange", { detail: { language } }));
    }
    return true;
  }
  function card(cardOrId) {
    const id = typeof cardOrId === "string" ? cardOrId : cardOrId?.id;
    const source = typeof cardOrId === "object" ? cardOrId : null;
    return {
      name: t(`cards.${id}.name`) === `cards.${id}.name` ? (source?.name || id) : t(`cards.${id}.name`),
      description: t(`cards.${id}.description`) === `cards.${id}.description` ? (source?.text || "") : t(`cards.${id}.description`)
    };
  }
  A.i18n = Object.freeze({
    t, card, setLanguage, applyDocumentTranslations,
    getLanguage: () => language, supported: Object.freeze([...supported]), storageKey
  });
  if (typeof document !== "undefined") {
    applyDocumentTranslations();
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", applyDocumentTranslations, { once: true });
  }
})(window.Arcane = window.Arcane || {});
