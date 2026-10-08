"use strict";

const BUILD_REVISION = "0.61.68-ece3806";
const SHELL_CACHE = `sigian-shell-${BUILD_REVISION}`;
const RUNTIME_CACHE = `sigian-runtime-${BUILD_REVISION}`;
const GENERATED_SHELL = ["./styles.css","./pwa.css","./forge-ui-lab.css","./forge-lab-designer.css","./forge-lab-magic.css","./src/core/constants.js","./src/core/rng.js","./src/data/cards.js","./src/data/original-cards.js","./src/i18n/en.js","./src/i18n/it.js","./src/i18n/ui-labels.js","./src/i18n/index.js","./src/core/card-schema.js","./src/core/sigian-foundation.js","./src/core/sigian-registry.js","./src/core/sigian-content-catalog.js","./src/core/sigian-progression-model.js","./src/core/account-progression.js","./src/core/academy-progression.js","./src/core/sigian-collectible-catalog.js","./src/core/sigian-recipe.js","./src/core/sigian-crafting.js","./src/core/sigian-component-design.js","./src/core/sigian-forge.js","./src/core/sigian-compiler.js","./src/data/astral-ai-card-metadata.js","./src/core/original-rules.js","./src/core/generator.js","./src/core/astral-abilities-re.js","./src/core/astral-spellbook-re.js","./src/core/passives.js","./src/core/effects.js","./src/core/astral-card-effects-re.js","./src/data/sigian-base-recipes.js","./src/data/sigian-base-canonical.js","./src/core/sigian-description-composer.js","./src/core/sigian-inventory.js","./src/core/sigian-component-instances.js","./src/core/sigian-formula-instances.js","./src/core/sigian-formula-compositions.js","./src/core/sigian-recipebook.js","./src/core/sigian-forge-commit.js","./src/core/sigian-grimoires.js","./src/data/sigian-formulas.js","./src/core/sigian-runtime.js","./src/core/game-engine.js","./src/core/multiplayer-protocol.js","./src/account/online-account.js","./src/multiplayer/remote-room-client.js","./src/core/ai.js","./src/core/astral-ai-re.js","./src/core/sigian-value-calibration.js","./src/core/sigian-value-atomic.js","./src/core/sigian-value-fit.js","./src/core/sigian-value-oracle.js","./src/core/sigian-value-candidate.js","./src/core/sigian-value-hybrid.js","./src/core/sigian-value-stress.js","./src/core/sigian-value-production.js","./src/core/sigian-forge-static-model.js","./src/core/sigian-forge-model-loader.js","./src/data/sigian-forge-model-config.js","./src/core/sigian-forge-math.js","./src/core/tournament.js","./tests/golden-replay-fixtures.js","./tests/test-suite.js","./src/ui/navigation.js","./src/ui/pause-menu.js","./src/ui/tournament-view.js","./src/ui/forge-lab-approved-design.js","./src/ui/forge-lab-designer.js","./src/ui/forge-lab-magic.js","./src/ui/forge-model-status.js","./src/ui/forge-ui-lab.js","./src/data/sigian-chronicles.js","./src/ui/archive-browser.js","./src/ui/app.js","./pwa-install-v2.js","./src/data/sigian-forge-static-model.json"];
const SHELL_INTEGRITY = {"./index.html":"4eb5a181cd3e9e80170de78d12f4d9532eb5a31b23ae7e96ef436a97e1ac197d","./styles.css":"fa0ff831e15cbda3d497f633d41a140e19c5e1fbc8df30dcd7eac0578712235c","./pwa.css":"f6b41f2504f8ec0b5eaf4115c585072783ec2297a837e75a9c2b5d3a0c978c18","./forge-ui-lab.css":"6fd52bc3838a2ead8237908fbd388e8f126a0b53dcfdff98e874fd8b281ddcc2","./forge-lab-designer.css":"705ce48386777d078477001f8925065b556d293992656fc447657adbade95461","./forge-lab-magic.css":"13af822d92f1867984c9e6567a95defaddb6bb21fb57c46b2b91cbb93421b6b9","./src/core/constants.js":"f115899b0fa8be2abb90ac382cb4a65477a5e1aee9d3333cff268b1cf5f7a993","./src/core/rng.js":"947a4332ef65cc3c51c94b7507092b21f20e6a17edbe0bebdbb2cfc6275a2d37","./src/data/cards.js":"4cb308d4b53cee8fb4e1f3c35beebb8d413d05dfb9067659f9baf58464ff9ab3","./src/data/original-cards.js":"f702b142f482c9785a7e02cb75deb2897e62843b59848187d2fafdfd6ff347bb","./src/i18n/en.js":"90c4298c1313481c6e07ae59eb1eaa6ea79a6a866af8690f30c52b259ec15607","./src/i18n/it.js":"5e42d2254449e71c1ab259ab38461a4e21ba8c1d0f85364ec9bf9f045493b892","./src/i18n/ui-labels.js":"8cac679d73a9d4e478cc652ad2961015b339a106a3614bdea2660ac0d97e0165","./src/i18n/index.js":"6ae2b78af5605bb532e9bf0d0fcbe619691ec1fd1053ee3a289d33c1a4e0a20e","./src/core/card-schema.js":"3343bb71955163b88a07b7138399f0aaf652d853f340a1009ace211ddd989803","./src/core/sigian-foundation.js":"ffedd046b4d171fb49d7608eb3fb8d53ebf923ee0d8891a0cb396c7346002c98","./src/core/sigian-registry.js":"33e185a38fecdb0761dd2a56129dc850a9be68f4a9580330d3e90efec700f5e4","./src/core/sigian-content-catalog.js":"57a462262d192f2aa19a29ef97f3bffd29ac60e3fd7514a6fbaa88729ee15049","./src/core/sigian-progression-model.js":"3dd9b236f97b34926f4c7de31537afa11510cc5e14d52107b8d2e56589307f43","./src/core/account-progression.js":"70d37f03b6d5330980209fa0cdae5fe8f8200f842bc7ae53805dd118c6399a66","./src/core/academy-progression.js":"99b502eeca9a7e4ca9078af518433b274fdf3c298065d5b51e5cc1ecc6e981e7","./src/core/sigian-collectible-catalog.js":"a3ae2daea231d9f468602b51572a2cbe0e756a834289f88958637f2c167bb113","./src/core/sigian-recipe.js":"226d0cf3adf6cf29134538285f738d26c3030cc1a4f9335d68f2333f9facaf0a","./src/core/sigian-crafting.js":"ee28ed55c9f888a8a02bc2358fded7bd4222022e044e339f8b3fbb9d9d715fd4","./src/core/sigian-component-design.js":"a409d31ea54d0cfb0b49c06811bb3ec840a8b5908d817705bd0ec2d6b0fed4ea","./src/core/sigian-forge.js":"567d3f0118a52751632160aaf914026dfb2c809a9fa008b5cb70191e30793dd1","./src/core/sigian-compiler.js":"c806b59686e4530be50e537a6c0df930077a44ed2f97bc56679fa94a8e97c2e8","./src/data/astral-ai-card-metadata.js":"772814249d2b7716d496ade928e39db94f43132e489f16cac4bb477b7452c80c","./src/core/original-rules.js":"bccc2c7b5f038f5c2369d971f55d3deec52f8b6407ea481ec79ccf6385816999","./src/core/generator.js":"3e71bd5bcfa04f2374aa70736f0713f22db567aa2e4b64e5783fbbda7abbebcf","./src/core/astral-abilities-re.js":"e82078ca231f13eddacc7c58bdbcc8c9d2eec921dd07f965208eb83f3a3dd2fb","./src/core/astral-spellbook-re.js":"8baedad5347f1ead5937625dfdd1e35bb003c9aeacecb86543c632c56f92c80d","./src/core/passives.js":"0894840ef27baf5979d9729cc82bb1ce7cbdbb9bae7819b0595a40312e3e7f50","./src/core/effects.js":"1d1182821f09dfdd6b9f0dc2c2021215f083aa69e80cf06983c5f4cb87e0e440","./src/core/astral-card-effects-re.js":"3aa8eac6bb464b4c1fbd1a8199a525f9781183ce44af24aa9398f8e57bec390e","./src/data/sigian-base-recipes.js":"6abbf9467929941ff695c46bfaa57d032f8a4cc3d438d47cd1ff34ff1ddd71e4","./src/data/sigian-base-canonical.js":"2ddf4a72df99c42b0a8d406d3d24d098184e05b874b9f44e3b64022581692a03","./src/core/sigian-description-composer.js":"f735c7e6444aef8c72be0ee7fa920c0796d52047dd9900763cb1c916b75597a9","./src/core/sigian-inventory.js":"3fba8dade38083cf54c69eebcfcf1997ab762c63a107dcabc1f40758d09a8aba","./src/core/sigian-component-instances.js":"fdcc235b661b6e6e548cb7e3d091ab3cc1bb120377d21da11bf434eab0e5bfc1","./src/core/sigian-formula-instances.js":"b2163f7d530b55ec28bb675e990c2319d1fe3e53c94d8606e46545d37a662576","./src/core/sigian-formula-compositions.js":"0b51cc626903d699dc9dac2b9a73655005dd55b980da612e1066a352679611b9","./src/core/sigian-recipebook.js":"d081b0054f67a966fd51815c174671ec300b390c3fa891a5c7b2ee0ec47ef264","./src/core/sigian-forge-commit.js":"4596d622993b3dfad90a3148eb5fbc3d7bb800a205097b3673e35f136dc7ce9e","./src/core/sigian-grimoires.js":"2259abf102200da69f92fb3206b6e9d1b86f1b0bc3b8d794eb7170727df591f5","./src/data/sigian-formulas.js":"36355c6589c605797a2fde6136bd9ff5fb5740e70ae31fa02c9dea4b0976dd87","./src/core/sigian-runtime.js":"1a961290bfa40c4686389a1617ae8fb97d637e6d7dff148693fc3c3f130c93d7","./src/core/game-engine.js":"a238885ae7f338a1ff9c4d2b476f65877583e034e45a5785430941f1d9a03040","./src/core/multiplayer-protocol.js":"32bce522985245da3987b35e808fbca10333f4fbbb977529847cef06fcbdea6f","./src/account/online-account.js":"71c7b876897b9f32f000be4ea4e0345793628ac751e5e4b3d2736a34f0efa91f","./src/multiplayer/remote-room-client.js":"397b99f13df34319e1ec6dda30cf30ac18c55d26180ccfa3bdf2bd0480704e55","./src/core/ai.js":"d56082929f5b6153c27498cb62f42161e8d87f484f54a6cc1e37ccaf534aa163","./src/core/astral-ai-re.js":"216d3178da990122a542f9c6ccba964587299a03d528831f76b947add0170672","./src/core/sigian-value-calibration.js":"9e3250a64b3766f4dc0855b38a9bb7c12c47b6e3f8129f603d45198afa546ad6","./src/core/sigian-value-atomic.js":"cbf54ee88b248bec98afbd2da2cb74655191e6387e51d3fecb12c300caa206c2","./src/core/sigian-value-fit.js":"a92b50cf63347b69b514d06e8c54275f2c3a537495696730ff7539f27cc3940d","./src/core/sigian-value-oracle.js":"355107a2da44fd0360123dfad7ec1f07c63164d32a3b32f8a571449ad52cbf89","./src/core/sigian-value-candidate.js":"33e08562a4192548eda17eae1b5bed30dc8c846fbd3ca552dd04e657d233ed4d","./src/core/sigian-value-hybrid.js":"c780f3452bd7193d00102cc0115cc0f98bb75d5cbbf2eb9597940755c02d76b6","./src/core/sigian-value-stress.js":"bf510309e41c2056ccdd1a2267e992c1e9c166fd0f3818675aa5ef1d7fe0fefc","./src/core/sigian-value-production.js":"a8a02a0c61c5e9b9cbd5d6856bea7364a08f37ddcb0802ecd37a2c48531f804b","./src/core/sigian-forge-static-model.js":"30f31279a029c38408a60a2aa2527edcba63e03cf525adb691a9b775e059deeb","./src/core/sigian-forge-model-loader.js":"a385d7d4b560178bebf62174433de49817f9b0982fec5a277ef54b04d6c759f5","./src/data/sigian-forge-model-config.js":"e1b1bcf2b04925039f160b1f36b7ffbad4d36b61fe84f3904167bfd6a8ab1cfe","./src/core/sigian-forge-math.js":"6a6d96a11a38eaa3420291aa5f60968b28118e6124c7bfda4de95104b0b30ac0","./src/core/tournament.js":"2c53c933f46187a3f345bd435a35d8f5803600ffb18ee0dfe0213f3f67b6e62a","./tests/golden-replay-fixtures.js":"e454b58a809b63be232b3e2e71ebcdb2eb5a23a217b7432f92ecbc57868a8f11","./tests/test-suite.js":"0d935bbb0fb9a3426ca950431ad67b03a90c4fe33077cc796e892621bfd5286b","./src/ui/navigation.js":"fcc950f927fa1737f267a718c3e56de93181117c5a9df783f3ff1cd2ccc3d17c","./src/ui/pause-menu.js":"f3b2284478fb2c6387516c6853b18cf89a94524302d08de9c0bff0e6950910fb","./src/ui/tournament-view.js":"edd1f55d2f4a668081a5f30e32d5123fc7aca1dd971fa21c3a0f5372e685a61e","./src/ui/forge-lab-approved-design.js":"c96fa3c5ed6709bcc050300f01a9777ee259a7bb0d9033baf059cefc5a41fd9c","./src/ui/forge-lab-designer.js":"03ed85c2856ee1aeda15a3a44d3e939723e82e9c9318e86c20cc4e79c73522ad","./src/ui/forge-lab-magic.js":"1f460028a48de1b655d31364b5b6086c0eecee3b28f36ce3169b3a61d29b0403","./src/ui/forge-model-status.js":"ad5143bc792ce53b9372427b6b97a0c02f88652dfc49ac1b7248074c551537ce","./src/ui/forge-ui-lab.js":"de75577f578cdc4d0183717833324a39138742a68009d18a68aaab78e9856b79","./src/data/sigian-chronicles.js":"baa18d51f71eb5dfd984493e0c00e61822b5afd7c629a5fc28bd660fcb224721","./src/ui/archive-browser.js":"3992671b0dab54d844f467655f54c9eda1be2117439c83774fa1c57ba5d72c45","./src/ui/app.js":"04706ae9c2c56ca95476d2b1ab7b36f58e9d84cc3ea1d3b75cb57c271bfef9d1","./pwa-install-v2.js":"e69df0e9ddb9b3d35ef92db6ea11393b93afa073e3617148d3a7a071742486b7","./src/data/sigian-forge-static-model.json":"86516499621f645a3cb9630a977b61ece0ecb00c916e4cce6f35280b92c273f1"};
const CLIENT_REVISIONS = new Map();

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./pwa.css",
  "./forge-ui-lab.css",
  "./forge-lab-designer.css",
  "./forge-lab-magic.css",
  "./assets/ui/forge-lab/magic-cloud.svg",
  "./assets/ui/forge-lab/magic-filament.svg",
  "./assets/ui/forge-lab/magic-arc.svg",
  "./pwa-install-v2.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./assets/ui/academy/academy-campus-map.webp",
  "./assets/ui/academy/academy-campus-map.svg",
  "./assets/ui/remastered/astral-battlefield-v1.png",
  "./src/core/constants.js",
  "./src/core/rng.js",
  "./src/data/cards.js",
  "./src/data/original-cards.js",
  "./src/i18n/en.js",
  "./src/i18n/it.js",
  "./src/i18n/ui-labels.js",
  "./src/i18n/index.js",
  "./src/core/card-schema.js",
  "./src/core/sigian-foundation.js",
  "./src/core/sigian-content-catalog.js",
  "./src/core/account-progression.js",
  "./src/core/academy-progression.js",
  "./src/core/sigian-crafting.js",
  "./src/core/sigian-component-design.js",
  "./src/core/sigian-description-composer.js",
  "./src/core/sigian-component-instances.js",
  "./src/core/sigian-formula-instances.js",
  "./src/core/sigian-formula-compositions.js",
  "./src/core/sigian-recipebook.js",
  "./src/core/sigian-forge-commit.js",
  "./src/core/sigian-registry.js",
  "./src/core/sigian-progression-model.js",
  "./src/core/sigian-collectible-catalog.js",
  "./src/core/sigian-recipe.js",
  "./src/core/sigian-forge.js",
  "./src/core/sigian-compiler.js",
  "./src/data/sigian-base-recipes.js",
  "./src/data/sigian-base-canonical.js",
  "./src/core/sigian-inventory.js",
  "./src/core/sigian-grimoires.js",
  "./src/data/astral-ai-card-metadata.js",
  "./src/core/original-rules.js",
  "./src/core/generator.js",
  "./src/core/astral-abilities-re.js",
  "./src/core/astral-spellbook-re.js",
  "./src/core/passives.js",
  "./src/core/effects.js",
  "./src/core/astral-card-effects-re.js",
  "./src/data/sigian-formulas.js",
  "./src/core/sigian-runtime.js",
  "./src/core/game-engine.js",
  "./src/core/multiplayer-protocol.js",
  "./src/account/online-account.js",
  "./src/multiplayer/remote-room-client.js",
  "./src/core/ai.js",
  "./src/core/astral-ai-re.js",
  "./src/core/sigian-value-calibration.js",
  "./src/core/sigian-value-fit.js",
  "./src/core/sigian-value-oracle.js",
  "./src/core/sigian-value-candidate.js",
  "./src/core/sigian-value-hybrid.js",
  "./src/core/sigian-value-atomic.js",
  "./src/core/sigian-value-stress.js",
  "./src/core/sigian-value-production.js",
  "./src/core/sigian-forge-math.js",
  "./src/core/sigian-forge-static-model.js",
  "./src/core/sigian-forge-model-loader.js",
  "./src/data/sigian-forge-model-config.js",
  "./src/data/sigian-forge-static-model.json",
  "./src/ui/forge-model-status.js",
  "./src/core/tournament.js",
  "./tests/test-suite.js",
  "./tests/golden-replay-fixtures.js",
  "./src/ui/navigation.js",
  "./src/ui/pause-menu.js",
  "./src/ui/tournament-view.js",
  "./src/ui/forge-ui-lab.js",
  "./src/ui/forge-lab-designer.js",
  "./src/ui/forge-lab-magic.js",
  "./src/ui/forge-lab-approved-design.js",
  "./src/data/sigian-chronicles.js",
  "./src/ui/archive-browser.js",
  "./src/ui/app.js"
];

function revisionedShellUrl(url) {
  if (/\.(?:js|css)$/.test(url) || url.endsWith("sigian-forge-static-model.json")) return `${url}?v=${encodeURIComponent(BUILD_REVISION)}`;
  return url;
}

async function installShell() {
  const urls = [...new Set([...APP_SHELL, ...GENERATED_SHELL])];
  // The large embedded artwork fallback is for local source launches only.
  if (!GENERATED_SHELL.length) urls.push("./src/ui/card-art-manifest.js");
  // Validate all responses before touching the cache. A partial deployment must
  // never replace a working shell, even when a development revision is reused.
  const entries = await Promise.all(urls.map(async url => {
    const response = await fetch(new Request(new URL(revisionedShellUrl(url), self.registration.scope), { cache: "reload" }));
    if (!response.ok) throw new Error(`Shell unavailable: ${url}`);
    const bytes = await response.arrayBuffer();
    const expected = SHELL_INTEGRITY[url === "./" ? "./index.html" : url];
    if (expected) {
      const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join("");
      if (hash !== expected) throw new Error(`Shell integrity mismatch: ${url}`);
    }
    return [revisionedShellUrl(url), new Response(bytes, { status: response.status, headers: response.headers })];
  }));
  const cache = await caches.open(SHELL_CACHE);
  await Promise.all(entries.map(([url, response]) => cache.put(url, response)));
}

async function cleanUnusedCaches() {
  // A waiting update owns a shell too. The active worker must not sweep it
  // while old documents report their revision before explicit activation.
  if (self.registration.installing || self.registration.waiting) return;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  // Unknown/older clients are conservative leases: don't discard their assets.
  if (windows.some(client => !CLIENT_REVISIONS.has(client.id))) return;
  const live = new Set(windows.map(client => client.id));
  for (const id of CLIENT_REVISIONS.keys()) if (!live.has(id)) CLIENT_REVISIONS.delete(id);
  const retained = new Set([BUILD_REVISION, ...CLIENT_REVISIONS.values()]);
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => /^sigian-(?:shell|runtime)-/.test(key)
    && ![...retained].some(revision => key === `sigian-shell-${revision}` || key === `sigian-runtime-${revision}`))
    .map(key => caches.delete(key)));
}

self.addEventListener("install", event => {
  event.waitUntil(
    installShell()
  );
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    await cleanUnusedCaches();
    await self.clients.claim();
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    windows.forEach(client => client.postMessage({ type: "SIGIAN_SW_ACTIVATED", revision: BUILD_REVISION }));
  })());
});

self.addEventListener("message", event => {
  if (event.data?.type === "ACTIVATE_UPDATE" && event.data?.safeToActivate === true) self.skipWaiting();
  if (event.data?.type === "SIGIAN_CLIENT_REVISION" && event.source?.id
      && typeof event.data.revision === "string" && /^[\w.-]{1,100}$/.test(event.data.revision)) {
    CLIENT_REVISIONS.set(event.source.id, event.data.revision);
    event.waitUntil(cleanUnusedCaches());
  }
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
      caches.open(SHELL_CACHE).then(cache => cache.match("./index.html"))
        .then(cached => cached || new Response("Shell non disponibile: riaprire online.", { status: 503 }))
    );
    return;
  }

  event.respondWith(
    (async () => {
      const relative = `./${url.pathname.slice(new URL(self.registration.scope).pathname.length)}`;
      const critical = Object.hasOwn(SHELL_INTEGRITY, relative) || /\.(?:js|css)$/.test(relative)
        || relative.endsWith("sigian-forge-static-model.json");
      const revision = url.searchParams.get("v") || BUILD_REVISION;
      if (critical) {
        if (!/^[\w.-]{1,100}$/.test(revision)) return new Response("Revisione non valida", { status: 409 });
        const cache = await caches.open(`sigian-shell-${revision}`);
        const cached = await cache.match(request);
        if (cached) return cached;
        // Pre-M4 workers used the revisioned runtime cache for some core/model
        // files. Keep those exact URLs available to their already-open tabs.
        const legacy = await caches.open(`sigian-runtime-${revision}`);
        return await legacy.match(request) || new Response("Asset della revisione non disponibile: riaprire online.", { status: 503 });
      }
      const cached = await caches.match(request);
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response && response.ok && response.type === "basic") {
          const clone = response.clone();
          event.waitUntil(caches.open(RUNTIME_CACHE).then(cache => cache.put(request, clone)).catch(() => {}));
        }
        return response;
      }).catch(() => new Response("Risorsa offline non disponibile", { status: 503 }));
    })()
  );
});
