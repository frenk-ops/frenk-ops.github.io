const fs = require("fs");
const path = require("path");
const vm = require("vm");

global.window = global;
const root = path.resolve(__dirname, "..");
[
  "src/core/constants.js",
  "src/core/rng.js",
  "src/data/cards.js",
  "src/data/original-cards.js",
  "src/core/card-schema.js",
  "src/data/astral-ai-card-metadata.js",
  "src/core/original-rules.js",
  "src/core/generator.js",
  "src/core/astral-spellbook-re.js"
].forEach(file => vm.runInThisContext(fs.readFileSync(path.join(root, file), "utf8"), { filename: file }));

const A = global.Arcane;
const cards = A.getCardSet("astral-original");
const iterations = Number(process.argv[2] || 100);
const attempts = [];
const timings = [];
const failures = [];

for (let i = 0; i < iterations; i += 1) {
  const seed = `stress-${i}`;
  const started = Date.now();
  try {
    const result = A.generateRecoveredAstralHands(cards, { seed, enemyDifficulty: "novice" });
    const player = result.diagnostics[0];
    const ids = result.player.map(card => card.id);
    const valid = result.player.length === 20
      && new Set(ids).size === 20
      && result.player.filter(card => card.level === 12).length === 1
      && result.player.every(card => card.level <= 12)
      && Object.values(player.bySchool).every(count => count >= 3 && count <= 5);
    if (!valid) failures.push({ seed, reason: "vincoli finali non rispettati" });
    attempts.push(player.generationAttempt);
    timings.push(Date.now() - started);
  } catch (error) {
    failures.push({ seed, reason: error.message });
  }
}

const sorted = [...attempts].sort((a, b) => a - b);
const percentile = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || null;
const report = {
  iterations,
  passed: iterations - failures.length,
  failed: failures.length,
  attempts: {
    min: sorted[0] || null,
    median: percentile(0.5),
    p90: percentile(0.9),
    p99: percentile(0.99),
    max: sorted.at(-1) || null,
    average: attempts.length ? Math.round(attempts.reduce((a, b) => a + b, 0) / attempts.length) : null
  },
  timingMs: {
    min: timings.length ? Math.min(...timings) : null,
    median: timings.length ? [...timings].sort((a, b) => a - b)[Math.floor(timings.length / 2)] : null,
    max: timings.length ? Math.max(...timings) : null,
    average: timings.length ? Math.round(timings.reduce((a, b) => a + b, 0) / timings.length) : null
  },
  failures
};

console.log(JSON.stringify(report, null, 2));
process.exitCode = failures.length ? 1 : 0;
