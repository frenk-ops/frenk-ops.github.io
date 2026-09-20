"use strict";

const SHELL_CACHE = "arcane-duels-shell-v20";
const RUNTIME_CACHE = "arcane-duels-runtime-v20";

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./pwa.css",
  "./pwa-install-v2.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./src/core/constants.js",
  "./src/core/rng.js",
  "./src/data/cards.js",
  "./src/data/original-cards.js",
  "./src/i18n/en.js",
  "./src/i18n/it.js",
  "./src/i18n/index.js",
  "./src/core/card-schema.js",
  "./src/data/astral-ai-card-metadata.js",
  "./src/core/original-rules.js",
  "./src/core/generator.js",
  "./src/core/astral-abilities-re.js",
  "./src/core/astral-spellbook-re.js",
  "./src/core/passives.js",
  "./src/core/effects.js",
  "./src/core/astral-card-effects-re.js",
  "./src/core/game-engine.js",
  "./src/core/multiplayer-protocol.js",
  "./src/multiplayer/remote-room-client.js",
  "./src/core/ai.js",
  "./src/core/astral-ai-re.js",
  "./src/core/tournament.js",
  "./tests/test-suite.js",
  "./src/ui/navigation.js",
  "./src/ui/pause-menu.js",
  "./src/ui/tournament-view.js",
  "./src/ui/app.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => cache.addAll(APP_SHELL))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const upgrading = keys.some(key => key.startsWith("arcane-duels-shell-") && key !== SHELL_CACHE);
    await Promise.all(
      keys
        .filter(key => key.startsWith("arcane-duels-") && key !== SHELL_CACHE && key !== RUNTIME_CACHE)
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
    if (!upgrading) return;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    await Promise.all(windows.map(client => client.navigate(client.url).catch(() => null)));
  })());
});

self.addEventListener("message", event => {
  if (event.data?.type === "ACTIVATE_UPDATE" && event.data?.safeToActivate === true) self.skipWaiting();
});

function isDynamicOrMultiplayer(url) {
  return url.pathname.includes("/server/") ||
    url.pathname.includes("/api/") ||
    url.protocol === "ws:" ||
    url.protocol === "wss:";
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isDynamicOrMultiplayer(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(SHELL_CACHE).then(cache => cache.put("./index.html", clone));
          }
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        if (response && response.ok && response.type === "basic") {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(request, clone));
        }
        return response;
      });

      return cached || network.catch(() => cached);
    })
  );
});
