#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const appRoot = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(appRoot, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(appRoot, 'styles.css'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(appRoot, 'assets/original-assets-manifest.json'), 'utf8'));
let failures = 0;

function check(condition, label) {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`);
  if (!condition) failures += 1;
}

for (const id of ['battlePanel', 'playerHand', 'playerBoard', 'enemyBoard', 'endTurnBtn', 'phaseLabel', 'roundLabel', 'cardArtStyleSelect', 'inspectCardAbility', 'inspectCardDetails', 'cardPreviewOverlay']) {
  const matches = html.match(new RegExp(`id=["']${id}["']`, 'g')) || [];
  check(matches.length === 1, `DOM id #${id} exists exactly once`);
}

check(/--hand-card-width:\s*124px/.test(css) && /--hand-card-height:\s*216px/.test(css), 'desktop hand cards have fixed dimensions');
check(/@media\s*\(max-width:\s*700px\)[\s\S]*?#playerHand[\s\S]*?flex-wrap:\s*nowrap/s.test(css), 'mobile spellbook uses a fixed-card strip');
check(/overflow-x:\s*hidden/.test(css), 'page explicitly prevents horizontal overflow');
check(/option value="2\.75">Slow/.test(html), 'Slow mode has a clearly distinct timing multiplier');
check(/hover-preview \.card-preview-modal[\s\S]*?overflow-y:\s*auto/.test(css), 'enemy hover preview is scrollable');
check(/\.classic-hand-grid\s*\{\s*grid-template-columns:repeat\(2,128px\)[^}]*grid-auto-rows:128px/.test(css), 'classic hand cards use the original square proportions');
check(/\.game-card \.school,[\s\S]*?\.game-card \.bottom-row\s*\{\s*display:\s*none/.test(css), 'classic hand cards expose only art and overlaid cost');
check(!html.includes('Libro Astrale creato:'), 'obsolete spellbook label is absent from the duel markup');
check(!html.includes('Libro degli incantesimi') && !html.includes('Libro avversario'), 'redundant hand labels are absent from the duel markup');
check(!css.includes('url("assets/ui/original-combat/pass.png")'), 'Pass button no longer uses the legacy bitmap');
const uiSource = fs.readFileSync(path.join(appRoot, 'src/ui/app.js'), 'utf8');
check(/art-media art-variant-\$\{variant\}/.test(uiSource), 'card art variants cannot collide with board layout classes');
check(/<option value="original" selected>Originale<\/option>[\s\S]*?<option value="new">Nuovo<\/option>/.test(html), 'duel setup exposes Originale and Nuovo card art styles');
check(/cardArtStyle === "new" && \["fire", "water", "air", "nature"\]\.includes\(card\.school\)/.test(uiSource), 'new art applies to the completed Fire, Water, Air and Earth remaster sets');
check(/return \{ fire: 13, water: 13, air: 13, earth: 13, death: 0 \}/.test(uiSource), 'collection progress reflects all four completed remaster sets');
check(!/chip\.addEventListener\("click", \(\) => openCardPreview/.test(uiSource), 'enemy cards do not open the legacy modal preview');
check(/engine\.state\.phase === A\.PHASES\.PLAYER_TARGET[\s\S]*?engine\.cancelSelection\(\)[\s\S]*?const result = engine\.selectCard/.test(uiSource), 'a different card can replace the pending selection');
check(/function showHealingChanges\(before\)/.test(uiSource) && /\.healing-number\s*\{/.test(css), 'healing changes have a dedicated floating-number animation');
check(/\.game-card\.type-spell/.test(css) && /\.revealed-chip\.type-spell/.test(css), 'spell cards use a distinct frame in both hands');
check(/grid-template-columns:46px minmax\(0,1fr\) 46px !important/.test(css), 'mobile battlefield is centered between equal school rails');
check(/grid-template-areas:"powersL field powersR" "hand hand hand" !important/.test(css), 'mobile schools flank the field and the hand stays below');
check(/grid-template-columns:minmax\(0,1fr\) 126px minmax\(0,1fr\)/.test(css), 'mobile duel header reserves a stable centered status column');
check(/\.classic-battlefield \{[\s\S]*?height:420px;[\s\S]*?min-height:420px/.test(css), 'mobile battlefield retains a readable fixed vertical canvas');
check(/\.classic-versus-header[\s\S]*?backdrop-filter:blur\(6px\)/.test(css), 'duel header uses translucent remastered chrome');
check(/\.classic-info-bar[\s\S]*?backdrop-filter:blur\(7px\)/.test(css), 'card information bar uses translucent remastered chrome');
check(/ASTRAL_CARD_AI_METADATA\?\.\[unit\.id\]\?\.multiTarget/.test(uiSource) && /multi-target-badge/.test(uiSource), 'multi-target icon is derived from combat metadata only while rendering field units');
check(/unit-attack/.test(css) && /unit-health/.test(css), 'field attack and life use dedicated high-contrast badges');
check(/detail-attack/.test(uiSource) && /detail-health/.test(uiSource), 'inspection details give attack and life dedicated icons');
check(/body\[data-card-art-style="new"\] #playerHand \.game-card\.type-spell/.test(css), 'extra parchment frame is restricted to new-style player spells');
check(/\.classic-hand-zone[\s\S]*?align-self:start !important;[\s\S]*?padding-top:28px/.test(css), 'desktop player and enemy books share the same raised vertical origin');
check(/\.classic-card-ability[\s\S]*?font-size:1\.08rem/.test(css), 'desktop card ability text has a prominent readable size');
check(/\.classic-portrait[\s\S]*?border-radius:50%/.test(css), 'desktop remaster uses circular gold-framed portraits');
check(/\.classic-info-bar::before,[\s\S]*?content:"❦"/.test(css), 'desktop information bar includes ornamental side flourishes');
check(/chrome\/header-player\.png/.test(css) && /chrome\/status-medallion\.png/.test(css) && /chrome\/info-footer\.png/.test(css), 'approved illustrated chrome kit is wired into the desktop duel');
check(/data-card-art-style="new"[\s\S]*?chrome\/spell-parchment\.png/.test(css), 'illustrated parchment is restricted to new-style spells');
check(/\.classic-player-copy[\s\S]*?flex:1 1 auto[\s\S]*?justify-items:center[\s\S]*?text-overflow:ellipsis/.test(css), 'desktop player names are centered inside their illustrated plaques');
check(/grid-template-columns:200px minmax\(0,1fr\) 200px/.test(css), 'desktop footer controls align with equal illustrated button wells');
check(/\.classic-footer-button[\s\S]*?width:178px[\s\S]*?first-child \{ justify-self:start; \}[\s\S]*?last-child \{ justify-self:end; \}/.test(css), 'footer hit areas stay inside the illustrated wells');
check(/type-spell \.cost[\s\S]*?z-index:5[\s\S]*?width:32px[\s\S]*?height:32px/.test(css), 'new-style spell cost sits beneath its illustrated medallion rim');
check(/aspect-ratio:2089 \/ 451/.test(css) && /width:min\(100%,clamp\(330px,31vw,480px\),calc\(\(100vw - 220px\)\/2 - 20px\)\)/.test(css), 'desktop player plaques preserve the native illustrated aspect ratio without colliding with versus');
check(/aspect-ratio:1932 \/ 449/.test(css) && /width:clamp\(220px,17vw,276px\)/.test(css), 'desktop versus medallion preserves the native illustrated aspect ratio');
check(/width:25\.8% !important[\s\S]*?aspect-ratio:1[\s\S]*?align-items:center[\s\S]*?justify-content:center/.test(css), 'card costs use one proportional optically centered circular badge');
check(/if \(activeSchool === selectedSchool\) return;[\s\S]*?renderSchoolButtons\(\);[\s\S]*?renderHand\(\);/.test(uiSource), 'player school changes update only school controls and hand');
check(/if \(enemySchool === selectedSchool\) return;[\s\S]*?renderSchoolButtons\(\);[\s\S]*?renderEnemyRevealed\(\);/.test(uiSource), 'enemy school changes update only school controls and enemy book');
check(/createDocumentFragment\(\)[\s\S]*?root\.replaceChildren\(fragment\)/.test(uiSource), 'school card swaps replace their DOM atomically');
check(/#playerHand::\-webkit-scrollbar,[\s\S]*?#enemyRevealedCards::\-webkit-scrollbar \{ display:none/.test(css), 'school card strips never flash native scrollbars');
check(/function cardDescriptionHtml\(card, side = inspectedCardSide\)/.test(uiSource) && /current-card-value/.test(uiSource) && /\.current-card-value strong/.test(css), 'dynamic current card values have a dedicated highlighted treatment');
check(/\.classic-card-details > span b \{ font-size:1\.04rem/.test(css) && /\.detail-attack b \{ color:#ffe477;font-size:1\.18rem/.test(css), 'footer card statistics use larger color-coded values');
check(/Footer containment: long rules text/.test(css) && /overflow-wrap:anywhere/.test(css) && /minmax\(118px,auto\)/.test(css), 'footer content has explicit wrapping and flexible-height containment');
check(/const combatDetails = card\.type === "spell" \? ""/.test(uiSource) && /const previewCombatMeta = card\.type === "spell" \? ""/.test(uiSource), 'spell inspection omits inapplicable attack and life statistics');
check(/event\.multiTarget[\s\S]*?attacking-multi[\s\S]*?multi-target-attack/.test(uiSource) && /multi-attacker-pulse/.test(css), 'multi-target creature attacks use a distinct battlefield animation');
check(/options\.lethal \? 1650 : 1350/.test(uiSource) && /fxDuration\(1450\)/.test(uiSource) && /\.healing-number \{ animation-duration:1\.45s/.test(css), 'damage and healing numbers remain visible for a readable interval');
check(/Fluid safe areas: content follows the illustrated openings/.test(css) && /padding-bottom:clamp\(22px,1\.75vw,32px\)/.test(css), 'desktop footer content respects a fluid illustrated safe area');
check(/grid-template-columns:[\s\S]*?clamp\(96px,7\.1vw,132px\)[\s\S]*?clamp\(220px,18\.6vw,274px\)/.test(css), 'desktop duel columns scale continuously instead of jumping between fixed widths');
check(/\.classic-mini-settings \{ overflow:hidden; \}/.test(css) && /overflow-wrap:anywhere/.test(css), 'secondary duel text cannot escape compact panels');
check(/id="restartSameSetsBtn"/.test(html) && /id="startNewDrawBtn"/.test(html), 'duel exposes same-set restart and fresh-draw actions');
check(/function createDuelSeed\(\)/.test(uiSource) && /seedOverride \|\| requestedSeed \|\| createDuelSeed\(\)/.test(uiSource), 'blank setup seed creates a fresh random duel seed');
check(/startDuel\(launch\.playerTalent, launch\.fromTournament, launch\.selectedSpecialization, launch\.requestedMode, launch\.seed\)/.test(uiSource), 'same-set restart reuses the exact duel seed');
check(/const nextSeed = createDuelSeed\(\)[\s\S]*?startDuel\(launch\.playerTalent, false, launch\.selectedSpecialization, launch\.requestedMode, nextSeed\)/.test(uiSource), 'new-match action forces a fresh spellbook draw');
check(/function setupLocalServerLifecycle\(\)/.test(uiSource) && /setInterval\(heartbeat, 2500\)/.test(uiSource), 'local app tabs maintain a lightweight server heartbeat');
check(/addEventListener\("pagehide"[\s\S]*?navigator\.sendBeacon\(endpoint\("close"\)/.test(uiSource), 'closing a game tab releases its local server client');
check(/\.player-head \.classic-player-copy span \{ order:1; \}[\s\S]*?\.player-head \.classic-player-copy strong \{ order:2; \}/.test(css), 'player header places life to the left of the name');
check(/\.enemy-head \.classic-player-copy strong \{ order:1; \}[\s\S]*?\.enemy-head \.classic-player-copy span \{ order:2; \}/.test(css), 'enemy header places the name to the left of life');
check(/\.classic-player-copy b[\s\S]*?font-size:1\.35rem/.test(css), 'hero life value is visually prominent');
check(/\.classic-combat-log \{ bottom:126px; \}/.test(css), 'desktop battle log clears the illustrated footer');
check(/\.classic-board-column \.slot::after[\s\S]*?content:"creature\\A slot"/.test(css), 'desktop empty slots omit the redundant empty label');
check(/\.classic-duel-status \{[\s\S]*?position:absolute;[\s\S]*?left:50%;[\s\S]*?transform:translate\(-50%,-50%\)/.test(css), 'desktop duel status is locked to the battlefield centerline');
check(/\.classic-portrait::after[\s\S]*?border:3px double #e2bc56/.test(css), 'desktop portrait artwork stays beneath a foreground circular rim');
check(/\.player-head \{ grid-column:1; \}[\s\S]*?\.enemy-head \{ grid-column:3; \}/.test(css), 'desktop combatants remain in the outer header columns');
check(/renderedHandSignature[\s\S]*?signature === renderedHandSignature/.test(uiSource), 'unchanged combat frames do not rebuild the player hand');
check(/raw\.replace\(\/\\s\+\(\[\+\-\]\\d\+\\b\)\/g, "\. \$1"\)/.test(uiSource), 'separate numeric card effects receive sentence punctuation');
check(/function showCombatCue\(event\)/.test(uiSource) && /\.combat-cue\.multi-target/.test(css), 'attacks announce their source and multi-target scope');
check(/function showCollateralDamage\(events\)/.test(uiSource) && /event\.reason === "multi_target"/.test(uiSource), 'multi-target creature damage is rendered on every affected lane');
check(/options\.lethal \? `−\$\{amount\} · KO`/.test(uiSource) && /\.damage-number\.lethal/.test(css), 'lethal damage has a distinct KO cue');
check(/\.classic-board-column \.slot:not\(\.valid-target\)[\s\S]*?animation:none/.test(css), 'routine board refreshes do not replay reveal animations');
check(/distinct beat before combat starts[\s\S]*?await sleep\(reducedMotion \? 0 : 760\)/.test(uiSource), 'card presentation completes before the following attack cue');
for (const asset of ['header-player.png', 'status-medallion.png', 'info-footer.png', 'spell-parchment.png']) {
  check(fs.existsSync(path.join(appRoot, 'assets/ui/remastered/chrome', asset)), `remastered chrome asset exists: ${asset}`);
}
const originalCardsDir = path.join(appRoot, 'assets/cards/original');
const originalCards = fs.existsSync(originalCardsDir) ? fs.readdirSync(originalCardsDir).filter(name => name.endsWith('.png')) : [];
check(originalCards.length === 65, 'all 65 decoded original card images are present');
const remasteredCardsDir = path.join(appRoot, 'assets/cards/remastered');
const remasteredFireCards = fs.existsSync(remasteredCardsDir) ? fs.readdirSync(remasteredCardsDir).filter(name => /^astral_fire_\d{2}\.png$/.test(name)) : [];
check(remasteredFireCards.length === 13, 'all 13 remastered Fire card images are present');
const remasteredWaterCards = fs.existsSync(remasteredCardsDir) ? fs.readdirSync(remasteredCardsDir).filter(name => /^astral_water_\d{2}\.png$/.test(name)) : [];
check(remasteredWaterCards.length === 13, 'all 13 remastered Water card images are present');
const remasteredAirCards = fs.existsSync(remasteredCardsDir) ? fs.readdirSync(remasteredCardsDir).filter(name => /^astral_air_\d{2}\.png$/.test(name)) : [];
check(remasteredAirCards.length === 13, 'all 13 remastered Air card images are present');
const remasteredEarthCards = fs.existsSync(remasteredCardsDir) ? fs.readdirSync(remasteredCardsDir).filter(name => /^astral_earth_\d{2}\.png$/.test(name)) : [];
check(remasteredEarthCards.length === 13, 'all 13 remastered Earth card images are present');
for (const asset of ['background.png', 'slot.png', 'pass.png', 'frame.png', 'frame-rgba.png']) {
  check(fs.existsSync(path.join(appRoot, 'assets/ui/original-combat', asset)), `decoded Combat asset exists: ${asset}`);
}
check(fs.existsSync(path.join(appRoot, 'assets/ui/remastered/astral-battlefield-v1.png')), 'remastered UI-only battlefield exists');
check(css.includes('url("assets/ui/remastered/astral-battlefield-v1.png")'), 'duel uses the independent remastered battlefield');
check(!css.includes('background-image:url("assets/ui/original-combat/background.png")'), 'static 800x600 board is not used as live layout');

for (const asset of manifest.assets) {
  const target = path.join(appRoot, 'assets', asset.path);
  const exists = fs.existsSync(target);
  check(exists, `asset exists: ${asset.path}`);
  if (exists) {
    const digest = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
    check(digest === asset.sha256, `asset hash matches: ${asset.path}`);
  }
}

console.log(`\nUI contract: ${failures ? 'FAILED' : 'PASSED'} (${failures} failures)`);
process.exitCode = failures ? 1 : 0;
