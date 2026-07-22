const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = global;
global.localStorage = (() => {
  const data = {};
  return { getItem:k => data[k] ?? null, setItem:(k,v) => { data[k]=String(v); }, removeItem:k => { delete data[k]; } };
})();

const root = path.resolve(__dirname, '..');
[
  'src/core/constants.js',
  'src/core/rng.js',
  'src/data/cards.js',
  'src/data/original-cards.js',
  'src/core/card-schema.js',
  'src/data/astral-ai-card-metadata.js',
  'src/core/original-rules.js',
  'src/core/generator.js',
  'src/core/astral-abilities-re.js',
  'src/core/astral-spellbook-re.js',
  'src/core/passives.js',
  'src/core/effects.js',
  'src/core/astral-card-effects-re.js',
  'src/core/game-engine.js',
  'src/core/ai.js',
  'src/core/astral-ai-re.js',
  'src/core/tournament.js',
  'tests/test-suite.js'
].forEach(file => vm.runInThisContext(fs.readFileSync(path.join(root, file), 'utf8'), { filename: file }));

const report = global.Arcane.runFoundationTests();
report.results.forEach(result => console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}${result.error ? ` — ${result.error}` : ''}`));
console.log(`\n${report.passed}/${report.total} test superati.`);
process.exitCode = report.failed ? 1 : 0;
