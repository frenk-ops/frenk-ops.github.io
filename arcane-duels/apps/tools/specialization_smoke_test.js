const fs = require('fs');
const path = require('path');
const vm = require('vm');
global.window = global;
global.localStorage = { getItem(){return null;}, setItem(){}, removeItem(){} };
const root = path.resolve(__dirname, '..');
[
  'src/core/constants.js','src/core/rng.js','src/data/cards.js','src/data/original-cards.js',
  'src/core/card-schema.js','src/data/astral-ai-card-metadata.js','src/core/original-rules.js',
  'src/core/generator.js','src/core/astral-abilities-re.js','src/core/astral-spellbook-re.js',
  'src/core/passives.js','src/core/effects.js','src/core/astral-card-effects-re.js',
  'src/core/game-engine.js','src/core/ai.js','src/core/astral-ai-re.js','src/core/tournament.js'
].forEach(file => vm.runInThisContext(fs.readFileSync(path.join(root,file),'utf8'),{filename:file}));

const rows=[];
for (const stage of ['starting','advanced','major']) {
  for (const spec of Arcane.ASTRAL_SPECIALIZATIONS) {
    const engine = new Arcane.GameEngine({
      cards: Arcane.getCardSet('astral-original'),
      rules: Arcane.ASTRAL_ORIGINAL_RULESET,
      seed: `v018-${stage}-${spec.id}`,
      playerSpecialization: spec.id,
      enemySpecialization: spec.id === 'stormmage' ? 'druid' : 'stormmage',
      astralLeague: stage,
      aiDifficulty: 'advanced'
    });
    engine.state.phase = Arcane.PHASES.ENEMY_PLAY;
    const move = Arcane.chooseRecoveredAstralMove(engine,'enemy','advanced',`ai-${stage}-${spec.id}`);
    const expected = Arcane.getAstralAbilityLoadout(spec.id,stage);
    const actual = engine.state.player.astralAbilityIds;
    if (JSON.stringify(expected)!==JSON.stringify(actual)) throw new Error(`${spec.id}/${stage}: loadout mismatch`);
    if (!engine.legalMoves('enemy').some(m=>m.type===move.type && m.cardId===move.cardId && m.slot===move.slot)) throw new Error(`${spec.id}/${stage}: illegal AI move`);
    rows.push({stage,specialization:spec.id,abilities:actual.join(','),cards:engine.state.player.hand.length,hp:engine.state.player.hp,powerTotal:Object.values(engine.state.player.power).reduce((a,b)=>a+b,0),growth:{...engine.state.player.powerGain},startingUnits:engine.state.player.board.filter(Boolean).map(u=>u.id),move:move.type==='pass'?'pass':move.cardId});
  }
}
const wizardTournament = new Arcane.GameEngine({cards:Arcane.getCardSet('astral-original'),rules:Arcane.ASTRAL_ORIGINAL_RULESET,seed:'v018-wizard-tournament',playerSpecialization:'wizard',enemySpecialization:'necromancer',astralLeague:'major',astralMode:'tournament',aiDifficulty:'grandmaster'});
if (wizardTournament.state.player.hand.length !== 28) throw new Error(`Wizard tournament book: ${wizardTournament.state.player.hand.length}`);
console.log(JSON.stringify({ok:true,cases:rows.length,wizardTournamentCards:wizardTournament.state.player.hand.length,rows},null,2));
