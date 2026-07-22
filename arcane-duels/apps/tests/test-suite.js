(function (A) {
  "use strict";

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function makeSimpleCards() {
    const cards = [];
    A.SCHOOLS.forEach((school, schoolIndex) => {
      for (let level = 1; level <= 10; level += 1) {
        cards.push(A.normalizeCard({
          id: `${school.id}-${level}`,
          name: `${school.name} ${level}`,
          school: school.id,
          level,
          type: "creature",
          attack: Math.max(1, level),
          health: Math.max(1, level + 1),
          art: school.icon
        }));
      }
    });
    return cards;
  }

  function engineWithHands() {
    const cards = makeSimpleCards();
    const hands = {
      player: cards.filter(c => c.school === "fire").slice(0, 4),
      enemy: cards.filter(c => c.school === "water").slice(0, 4),
      enemyTalent: "water",
      diagnostics: []
    };
    return new A.GameEngine({ cards, hands, seed: "test", playerTalent: "fire", enemyTalent: "water", rules: { startingHp: 20, initialPower: 10 } });
  }


  function astralEngine(playerIds, enemyIds, options) {
    const cards = A.getCardSet("astral-original");
    const byId = Object.fromEntries(cards.map(card => [card.id, card]));
    const fallbackPlayer = ["astral_fire_01", "astral_water_01", "astral_air_01", "astral_earth_01", "astral_death_01"];
    const fallbackEnemy = ["astral_fire_02", "astral_water_02", "astral_air_02", "astral_earth_02", "astral_death_02"];
    const hands = {
      player: (playerIds?.length ? playerIds : fallbackPlayer).map(id => byId[id]),
      enemy: (enemyIds?.length ? enemyIds : fallbackEnemy).map(id => byId[id]),
      enemyTalent: options?.enemyTalent || "water",
      playerPowers: options?.playerPowers,
      enemyPowers: options?.enemyPowers,
      diagnostics: []
    };
    const engine = new A.GameEngine({
      cards,
      hands,
      seed: options?.seed || "astral-card-engine-test",
      playerTalent: options?.playerTalent || "fire",
      enemyTalent: options?.enemyTalent || "water",
      playerPassives: options?.playerPassives || [],
      enemyPassives: options?.enemyPassives || [],
      playerAstralAbilities: options?.playerAstralAbilities,
      enemyAstralAbilities: options?.enemyAstralAbilities,
      playerSpecialization: options?.playerSpecialization,
      enemySpecialization: options?.enemySpecialization,
      astralLeague: options?.astralLeague,
      rules: A.ASTRAL_ORIGINAL_RULESET
    });
    ["player", "enemy"].forEach(side => A.SCHOOLS.forEach(school => {
      engine.state[side].power[school.id] = options?.[`${side}Power`]?.[school.id] ?? 20;
      if (!options?.preserveAbilitySetup) engine.state[side].powerGain[school.id] = 1;
    }));
    return engine;
  }

  function placeAstralUnit(engine, side, cardId, slot, health) {
    const card = A.getCardSet("astral-original").find(item => item.id === cardId);
    const unit = { ...A.deepClone(card), currentHealth: health ?? card.health, owner: side, instanceId: `${side}-test-${slot}-${card.id}`, astralPowerModifiers: [] };
    engine.state[side].board[slot] = unit;
    return unit;
  }

  const tests = [
    {
      name: "Generatore deterministico con seed",
      run() {
        const cards = makeSimpleCards();
        const a = A.generateHands(cards, { seed: "same", playerTalent: "fire", enemyTalent: "water" });
        const b = A.generateHands(cards, { seed: "same", playerTalent: "fire", enemyTalent: "water" });
        assert(JSON.stringify(a.player.map(c => c.id)) === JSON.stringify(b.player.map(c => c.id)), "Lo stesso seed deve produrre la stessa mano");
      }
    },
    {
      name: "Pool esclusivi",
      run() {
        const cards = makeSimpleCards();
        const result = A.generateHands(cards, { seed: "exclusive", playerTalent: "fire", enemyTalent: "water" });
        const playerIds = new Set(result.player.map(c => c.id));
        assert(!result.enemy.some(c => playerIds.has(c.id)), "Una carta è stata assegnata a entrambi");
      }
    },
    {
      name: "Almeno una carta iniziale per scuola quando disponibile",
      run() {
        const cards = makeSimpleCards();
        const result = A.generateHands(cards, { seed: "opening", playerTalent: "fire", enemyTalent: "water" });
        A.SCHOOLS.forEach(school => {
          assert(result.player.some(c => c.school === school.id && c.level <= A.DEFAULT_RULESET.initialPower), `Giocatore senza apertura ${school.id}`);
          assert(result.enemy.some(c => c.school === school.id && c.level <= A.DEFAULT_RULESET.initialPower), `IA senza apertura ${school.id}`);
        });
      }
    },
    {
      name: "Selezione carta porta alla fase bersaglio",
      run() {
        const engine = engineWithHands();
        const card = engine.state.player.hand[0];
        const result = engine.selectCard(card.id);
        assert(result.ok, "La carta doveva essere selezionabile");
        assert(engine.state.phase === A.PHASES.PLAYER_TARGET, "Fase non aggiornata");
      }
    },
    {
      name: "Una sola carta per turno",
      run() {
        const engine = engineWithHands();
        const card = engine.state.player.hand[0];
        engine.selectCard(card.id);
        const played = engine.playSelected(0);
        assert(played.ok, "Prima carta non giocata");
        assert(engine.state.phase === A.PHASES.PLAYER_ATTACK, "Il turno deve entrare in attacco");
        const second = engine.playMove("player", { type: "play", cardId: engine.state.player.hand[1].id, slot: 1 });
        assert(!second.ok, "Non deve essere possibile giocare una seconda carta");
      }
    },
    {
      name: "Il difensore non contrattacca",
      run() {
        const engine = engineWithHands();
        engine.state.player.board[0] = { ...engine.state.player.hand[0], currentHealth: 5, health: 5, attack: 3, instanceId: "p" };
        engine.state.enemy.board[0] = { ...engine.state.enemy.hand[0], currentHealth: 5, health: 5, attack: 9, instanceId: "e" };
        engine.state.phase = A.PHASES.PLAYER_ATTACK;
        const step = engine.attackNext("player");
        assert(step.event.targetHealth === 2, "Danno al difensore errato");
        assert(engine.state.player.board[0].currentHealth === 5, "L'attaccante ha subito un contrattacco");
      }
    },
    {
      name: "Il danno diretto aggiorna la vita dell'eroe",
      run() {
        const engine = engineWithHands();
        engine.state.player.board[0] = { ...engine.state.player.hand[0], currentHealth: 5, health: 5, attack: 4, instanceId: "p" };
        engine.state.phase = A.PHASES.PLAYER_ATTACK;
        const before = engine.state.enemy.hp;
        const step = engine.attackNext("player");
        assert(step.event.type === "directAttack", "Tipo evento errato");
        assert(engine.state.enemy.hp === before - 4, "Vita eroe non aggiornata");
      }
    },
    {
      name: "Fine attacco giocatore avvia il pensiero IA",
      run() {
        const engine = engineWithHands();
        engine.state.phase = A.PHASES.PLAYER_ATTACK;
        engine.finishAttack("player");
        assert(engine.state.phase === A.PHASES.ENEMY_THINK, "IA non avviata");
      }
    },
    {
      name: "Il round aumenta dopo il turno IA",
      run() {
        const engine = engineWithHands();
        const before = engine.state.player.power.fire;
        engine.state.phase = A.PHASES.ENEMY_ATTACK;
        engine.finishAttack("enemy");
        assert(engine.state.round === 2, "Round non incrementato");
        assert(engine.state.phase === A.PHASES.PLAYER_SELECT, "Turno non restituito al giocatore");
        assert(engine.state.player.power.fire === before + engine.state.player.powerGain.fire, "Potere non incrementato");
      }
    },
    {
      name: "L'IA produce una mossa legale a ogni difficoltà",
      run() {
        Object.keys(A.DIFFICULTIES).forEach(difficulty => {
          const engine = engineWithHands();
          engine.state.phase = A.PHASES.ENEMY_PLAY;
          const move = A.chooseAiMove(engine, "enemy", difficulty);
          const legal = engine.legalMoves("enemy");
          assert(legal.some(candidate => JSON.stringify(candidate) === JSON.stringify(move)), `Mossa illegale: ${difficulty}`);
        });
      }
    },
    {
      name: "Progressione torneo e ricompensa passiva",
      run() {
        const profile = A.createDefaultProfile();
        const tournament = A.createTournament({ seed: "cup", specialization: "fire" });
        A.recordTournamentDuel(profile, tournament, true, 100);
        A.recordTournamentDuel(profile, tournament, true, 100);
        assert(tournament.wins === 2, "Vittorie torneo errate");
        assert(tournament.pendingPassiveChoice, "Scelta passiva non proposta");
        const selected = A.selectTournamentPassive(tournament, tournament.offeredPassives[0]);
        assert(selected && tournament.selectedPassives.length === 1, "Passiva non salvata");
      }
    },
    {
      name: "Ciclo completo giocatore → IA → nuovo round senza stalli",
      run() {
        const engine = engineWithHands();
        for (let cycle = 0; cycle < 12 && !engine.state.gameOver; cycle += 1) {
          const playerMove = A.chooseAiMove(engine, "player", "advanced", `p-${cycle}`);
          let playerResult;
          if (playerMove.type === "pass") playerResult = engine.pass("player");
          else {
            engine.selectCard(playerMove.cardId);
            playerResult = engine.playSelected(playerMove.slot);
          }
          assert(playerResult.ok, `Mossa giocatore fallita al ciclo ${cycle}`);
          while (!engine.attackNext("player").done) { /* risoluzione */ }
          engine.finishAttack("player");
          if (engine.state.gameOver) break;
          assert(engine.state.phase === A.PHASES.ENEMY_THINK, "Fase ENEMY_THINK mancante");
          engine.beginEnemyPlay();
          const enemyMove = A.chooseAiMove(engine, "enemy", "advanced", `e-${cycle}`);
          const enemyResult = engine.playMove("enemy", enemyMove);
          assert(enemyResult.ok, `Mossa IA fallita al ciclo ${cycle}`);
          while (!engine.attackNext("enemy").done) { /* risoluzione */ }
          engine.finishAttack("enemy");
          if (!engine.state.gameOver) assert(engine.state.phase === A.PHASES.PLAYER_SELECT, `Turno bloccato in ${engine.state.phase}`);
        }
      }
    },
    {
      name: "Le mani rispettano la quantità configurata",
      run() {
        const cards = makeSimpleCards();
        const result = A.generateHands(cards, { seed: "counts", playerTalent: "fire", enemyTalent: "water" });
        const playerExpected = A.DEFAULT_RULESET.handSizePerSchool * 4 + A.DEFAULT_RULESET.talentHandSizePerSchool;
        const enemyExpected = playerExpected;
        assert(result.player.length === playerExpected, `Mano giocatore ${result.player.length}/${playerExpected}`);
        assert(result.enemy.length === enemyExpected, `Mano IA ${result.enemy.length}/${enemyExpected}`);
      }
    },
    {
      name: "Completare un torneo vincente assegna un trofeo",
      run() {
        const profile = A.createDefaultProfile();
        const tournament = A.createTournament({ seed: "champion", specialization: "air" });
        while (!tournament.completed) {
          A.recordTournamentDuel(profile, tournament, true, 100);
          if (tournament.pendingPassiveChoice) A.selectTournamentPassive(tournament, tournament.offeredPassives[0]);
        }
        assert(tournament.won, "Il torneo doveva risultare vinto");
        assert(profile.tournamentsWon === 1, "Contatore tornei non aggiornato");
        assert(profile.trophies.length === 1, "Trofeo non assegnato");
      }
    },
    {
      name: "Schema carte valido",
      run() {
        const validation = A.validateCardSet(A.getCardSet("classic"));
        assert(validation.valid, validation.errors.join("; "));
        assert(validation.cards.every(c => Number.isFinite(c.level)), "Livello carta mancante");
      }
    },
    {
      name: "Il set Astral contiene 65 carte e 65 record IA",
      run() {
        assert(A.getCardSet("astral-original").length === 65, "Numero carte Astral errato");
        assert(Object.keys(A.ASTRAL_CARD_AI_METADATA).length === 65, "Metadati IA incompleti");
      }
    },
    {
      name: "Curva vita originale tradotta senza approssimazioni",
      run() {
        const expected = [[5,400],[6,450],[10,650],[11,680],[20,900],[30,1050],[40,1150],[50,1200],[150,1300],[750,1600]];
        expected.forEach(([hp,value]) => assert(A.astralHeroLifeCurve(hp) === value, `Curva vita errata a ${hp}`));
      }
    },
    {
      name: "Fattori casuali delle cinque IA rispettano gli intervalli originali",
      run() {
        const ranges = { 1:[2,9], 2:[3,6], 3:[15,18], 4:[50,52], 5:[1,1] };
        Object.entries(ranges).forEach(([level,[min,max]]) => {
          for (let i=0;i<50;i+=1) {
            const rng=A.createRng(`factor-${level}-${i}`);
            const value=A.astralDifficultyRandomFactor(Number(level),rng);
            assert(value>=min && value<=max, `Fattore livello ${level}: ${value}`);
          }
        });
      }
    },
    {
      name: "Le leghe selezionano lo stadio abilità senza sovrascrivere i poteri",
      run() {
        const cards=A.getCardSet("astral-original");
        const hands={player:cards.slice(0,20),enemy:cards.slice(20,40),enemyTalent:"water",diagnostics:[]};
        const engine=new A.GameEngine({cards,hands,playerTalent:"fire",enemyTalent:"water",rules:A.ASTRAL_ORIGINAL_RULESET,seed:"league",playerAstralAbilities:[],enemyAstralAbilities:[]});
        const before=A.deepClone(engine.state.player.power);
        const league=A.applyAstralLeaguePowers(engine,"major");
        assert(league.abilityStage===3,"Stadio Major errato");
        assert(JSON.stringify(engine.state.player.power)===JSON.stringify(before),"La lega non deve sovrascrivere i poteri generati");
        assert(JSON.stringify(league.raw)===JSON.stringify([400,10,8,750]),"Record binario Major errato");
      }
    },
    {
      name: "L'IA recuperata produce una mossa legale a tutti i livelli",
      run() {
        Object.keys(A.DIFFICULTIES).forEach(difficulty => {
          const engine=engineWithHands();
          engine.state.phase=A.PHASES.ENEMY_PLAY;
          const move=A.chooseRecoveredAstralMove(engine,"enemy",difficulty,`legal-${difficulty}`);
          const comparable={type:move.type,cardId:move.cardId,slot:move.slot};
          assert(engine.legalMoves("enemy").some(candidate => candidate.type===comparable.type && candidate.cardId===comparable.cardId && candidate.slot===comparable.slot),`Mossa recuperata illegale: ${difficulty}`);
        });
      }
    },
    {
      name: "Archmage è deterministico a parità di stato e seed",
      run() {
        const a=engineWithHands(); a.state.phase=A.PHASES.ENEMY_PLAY;
        const b=a.clone();
        const ma=A.chooseRecoveredAstralMove(a,"enemy","grandmaster","same");
        const mb=A.chooseRecoveredAstralMove(b,"enemy","grandmaster","same");
        assert(JSON.stringify(ma)===JSON.stringify(mb),"Archmage non deterministico");
      }
    },
    {
      name: "Archmage simula tre fasi di attacco, le altre IA due",
      run() {
        const engine=engineWithHands(); engine.state.phase=A.PHASES.ENEMY_PLAY;
        const novice=A.scoreRecoveredAstralMoves(engine,"enemy","novice","horizon-n")[0];
        const archmage=A.scoreRecoveredAstralMoves(engine,"enemy","grandmaster","horizon-a")[0];
        assert(novice.simulatedAttackPhases===2,"Orizzonte Novice errato");
        assert(archmage.simulatedAttackPhases===3,"Orizzonte Archmage errato");
      }
    },
    {
      name: "Il libro Astral umano contiene 20 carte permanenti e un livello 12",
      run() {
        const cards=A.getCardSet("astral-original");
        const result=A.generateRecoveredAstralHands(cards,{seed:"spellbook-test",enemyDifficulty:"novice"});
        assert(result.player.length===20,`Libro umano: ${result.player.length}`);
        assert(new Set(result.player.map(card=>card.id)).size===20,"Duplicati nel libro umano");
        assert(result.player.filter(card=>card.level===12).length===1,"Il libro deve avere esattamente un livello 12");
        assert(result.player.every(card=>card.level<=12),"Un livello 13 è stato estratto casualmente");
      }
    },
    {
      name: "Le prime fasce garantiscono basso, medio e alto in ogni scuola",
      run() {
        const cards=A.getCardSet("astral-original");
        const result=A.generateRecoveredAstralHands(cards,{seed:"bands-test",enemyDifficulty:"novice"});
        A.ASTRAL_SPELLBOOK_RE.schoolOrder.forEach(school=>{
          const levels=result.player.filter(card=>card.school===school).map(card=>card.level);
          assert(levels.some(level=>level>=1&&level<=4),`Fascia bassa mancante: ${school}`);
          assert(levels.some(level=>level>=5&&level<=8),`Fascia media mancante: ${school}`);
          assert(levels.some(level=>level>=9&&level<=12),`Fascia alta mancante: ${school}`);
        });
      }
    },
    {
      name: "La difficoltà modifica il numero di carte dell'IA",
      run() {
        const expected={novice:15,intermediate:15,advanced:17,master:20,grandmaster:20};
        Object.entries(expected).forEach(([difficulty,count])=>{
          assert(A.getRecoveredAstralSpellbookCount({enemyDifficulty:difficulty},"enemy")===count,`Conteggio ${difficulty} errato`);
        });
        assert(A.getRecoveredAstralSpellbookCount({mode:"tournament",enemySpecialization:"wizard"},"enemy")===24,"Wizard non riceve 24 carte");
      }
    },
    {
      name: "Knowledge aggiunge elementali e livello 13 senza estrarli casualmente",
      run() {
        const cards=A.getCardSet("astral-original");
        const result=A.generateRecoveredAstralHands(cards,{seed:"knowledge-ability",enemyDifficulty:"novice",playerAbilities:[29,30]});
        const names=new Set(result.player.map(card=>card.name));
        ["Fire elemental","Water elemental","Air elemental","Earth elemental","Efreet"].forEach(name=>assert(names.has(name),`Carta Knowledge mancante: ${name}`));
        assert(result.player.length===25,`Conteggio dopo Knowledge: ${result.player.length}`);
      }
    },
    {
      name: "Le carte Terra sono collegate alla scuola interna Natura",
      run() {
        const cards=A.getCardSet("astral-original");
        const earthCards=cards.filter(card=>card.id.startsWith("astral_earth_"));
        assert(earthCards.length===13,"Set Terra incompleto");
        assert(earthCards.every(card=>card.school==="nature"),"Mappatura Earth/Nature incoerente");
        assert(A.validateCardSet(cards).valid,"Il set Astral deve essere valido nello schema interno");
      }
    },
    {
      name: "Il motore applica i poteri iniziali recuperati",
      run() {
        const engine=new A.GameEngine({cards:A.getCardSet("astral-original"),rules:A.ASTRAL_ORIGINAL_RULESET,seed:"foundation-001",aiDifficulty:"novice",playerTalent:"fire",enemyTalent:"water",playerAstralAbilities:[],enemyAstralAbilities:[]});
        const playerTotal=Object.values(engine.state.player.power).reduce((sum,value)=>sum+value,0);
        const enemyTotal=Object.values(engine.state.enemy.power).reduce((sum,value)=>sum+value,0);
        assert(playerTotal===20,`Somma poteri giocatore: ${playerTotal}`);
        assert(enemyTotal===19,`Somma poteri IA: ${enemyTotal}`);
      }
    },
    {
      name: "Le carte del libro restano disponibili dopo il lancio",
      run() {
        const cards=A.getCardSet("astral-original");
        const hands=A.generateRecoveredAstralHands(cards,{seed:"permanent-book",enemyDifficulty:"novice"});
        const engine=new A.GameEngine({cards,hands,rules:A.ASTRAL_ORIGINAL_RULESET,seed:"permanent-book",playerTalent:"fire",enemyTalent:"water"});
        Object.keys(engine.state.player.power).forEach(school=>{engine.state.player.power[school]=20;});
        const before=engine.state.player.hand.length;
        const move=engine.legalMoves("player").find(candidate=>candidate.type==="play");
        assert(Boolean(move),"Nessuna mossa giocabile");
        const result=engine.playMove("player",move);
        assert(result.ok,"Lancio non riuscito");
        assert(engine.state.player.hand.length===before,"La carta è stata rimossa dal libro");
        assert(engine.state.player.hand.some(card=>card.id===move.cardId),"La carta giocata non è più disponibile");
      }
    },
    {
      name: "Le formule Astral usano il potere prima di sottrarre il costo",
      run() {
        const engine = astralEngine(["astral_air_06"], ["astral_fire_02"]);
        engine.state.player.power.air = 10;
        const beforeHp = engine.state.enemy.hp;
        const result = engine.playMove("player", { type: "play", cardId: "astral_air_06", slot: null });
        assert(result.ok, "Lightning non giocata");
        assert(engine.state.enemy.hp === beforeHp - 15, `Danno Lightning: ${beforeHp - engine.state.enemy.hp}`);
        assert(engine.state.player.power.air === 4, `Potere Air residuo: ${engine.state.player.power.air}`);
      }
    },
    {
      name: "Fire Ritual produce il +2 netto originale",
      run() {
        const engine = astralEngine(["astral_fire_03"], ["astral_water_02"]);
        engine.state.player.power.fire = 3;
        engine.state.enemy.power.water = 8;
        const result = engine.playMove("player", { type: "play", cardId: "astral_fire_03" });
        assert(result.ok, "Fire Ritual non giocato");
        assert(engine.state.player.power.fire === 5, `Fuoco netto: ${engine.state.player.power.fire}`);
        assert(engine.state.enemy.power.water === 7, "Riduzione Acqua nemica non applicata");
      }
    },
    {
      name: "Dragon e Faerie modificano insieme il danno delle magie",
      run() {
        const engine = astralEngine(["astral_fire_01"], ["astral_fire_02"]);
        placeAstralUnit(engine, "player", "astral_fire_12", 1);
        placeAstralUnit(engine, "player", "astral_air_01", 2);
        const target = placeAstralUnit(engine, "enemy", "astral_fire_02", 0, 13);
        engine.playMove("player", { type: "play", cardId: "astral_fire_01" });
        assert(target.currentHealth === 8, `Danno potenziato errato, vita ${target.currentHealth}`);
      }
    },
    {
      name: "Warlord potenzia anche l'attacco dinamico dell'elementale",
      run() {
        const engine = astralEngine(["astral_fire_10"], ["astral_water_02"]);
        placeAstralUnit(engine, "player", "astral_fire_09", 0);
        placeAstralUnit(engine, "player", "astral_fire_10", 1);
        engine.state.player.power.fire = 10;
        engine.state.phase = A.PHASES.PLAYER_ATTACK;
        engine.state.attackCursor = 1;
        const before = engine.state.enemy.hp;
        const step = engine.attackNext("player");
        assert(step.event.damage === 15, `Attacco Elementale: ${step.event.damage}`);
        assert(engine.state.enemy.hp === before - 15, "Danno dinamico non applicato");
      }
    },
    {
      name: "Ice Guard e Elf Armorer riducono in sequenza il danno all'eroe",
      run() {
        const engine = astralEngine(["astral_fire_02"], ["astral_water_06", "astral_earth_02"]);
        const attacker = placeAstralUnit(engine, "player", "astral_earth_13", 0);
        attacker.attack = 10;
        placeAstralUnit(engine, "enemy", "astral_water_06", 1);
        placeAstralUnit(engine, "enemy", "astral_earth_02", 2);
        engine.state.phase = A.PHASES.PLAYER_ATTACK;
        const before = engine.state.enemy.hp;
        const step = engine.attackNext("player");
        assert(step.event.damage === 4, `Danno ridotto: ${step.event.damage}`);
        assert(engine.state.enemy.hp === before - 4, "Riduzione difensiva errata");
      }
    },
    {
      name: "Le creature multi-bersaglio colpiscono eroe e tutte le creature",
      run() {
        const engine = astralEngine(["astral_earth_03"], ["astral_fire_02", "astral_water_02"]);
        placeAstralUnit(engine, "player", "astral_earth_03", 0);
        const a = placeAstralUnit(engine, "enemy", "astral_fire_02", 1, 13);
        const b = placeAstralUnit(engine, "enemy", "astral_water_02", 3, 9);
        engine.state.phase = A.PHASES.PLAYER_ATTACK;
        const before = engine.state.enemy.hp;
        const step = engine.attackNext("player");
        assert(step.event.multiTarget, "Attacco non marcato multi-bersaglio");
        assert(a.currentHealth === 12 && b.currentHealth === 8, "Creature nemiche non colpite tutte");
        assert(engine.state.enemy.hp === before - 1, "Eroe nemico non colpito");
      }
    },
    {
      name: "Phoenix rinasce a vita piena con almeno 10 Fuoco",
      run() {
        const engine = astralEngine(["astral_air_07"], ["astral_fire_02"]);
        const phoenix = placeAstralUnit(engine, "player", "astral_air_07", 0, 5);
        engine.state.player.power.fire = 10;
        A.astralApplyUnitDamage(engine, "enemy", "player", 0, 20, { sourceKind: "creature" }, []);
        A.astralCleanupDeaths(engine, []);
        assert(engine.state.player.board[0] === phoenix, "Phoenix rimossa dal campo");
        assert(phoenix.currentHealth === phoenix.health, `Phoenix rinata a ${phoenix.currentHealth}`);
      }
    },
    {
      name: "Phoenix sostituisce la morte e non attiva i trigger di morte",
      run() {
        const engine = astralEngine(["astral_air_07", "astral_death_04", "astral_death_09"], ["astral_fire_02"]);
        placeAstralUnit(engine, "player", "astral_air_07", 0, 1);
        placeAstralUnit(engine, "player", "astral_death_04", 1);
        placeAstralUnit(engine, "player", "astral_death_09", 2);
        engine.state.player.power.fire = 10;
        engine.state.player.power.death = 4;
        engine.state.player.hp = 40;
        const events = [];
        A.astralApplyUnitDamage(engine, "enemy", "player", 0, 5, { sourceKind: "spell" }, events);
        A.astralCleanupDeaths(engine, events);
        assert(engine.state.player.board[0]?.id === "astral_air_07", "Phoenix non rinata");
        assert(engine.state.player.power.fire === 10, "La rinascita ha consumato Fuoco");
        assert(engine.state.player.power.death === 4, "Death Keeper ha contato una falsa morte");
        assert(engine.state.player.hp === 40, "Wall of Souls ha contato una falsa morte");
        assert(events.some(e => e.type === "astralPhoenixRebirth"), "Evento rinascita assente");
        assert(!events.some(e => e.type === "astralDeath" && e.cardId === "astral_air_07"), "Emesso evento morte per Phoenix rinata");
      }
    },
    {
      name: "Phoenix può rinascere più volte finché Fuoco resta almeno 10",
      run() {
        const engine = astralEngine(["astral_air_07"], ["astral_fire_02"]);
        const phoenix = placeAstralUnit(engine, "player", "astral_air_07", 0, 1);
        engine.state.player.power.fire = 10;
        for (let i = 0; i < 2; i += 1) {
          A.astralApplyUnitDamage(engine, "enemy", "player", 0, 99, { sourceKind: "spell" }, []);
          A.astralCleanupDeaths(engine, []);
          assert(engine.state.player.board[0] === phoenix, `Phoenix rimossa al ciclo ${i}`);
          assert(phoenix.currentHealth === phoenix.health, `Phoenix non a vita piena al ciclo ${i}`);
        }
      }
    },
    {
      name: "Phoenix sotto 10 Fuoco muore e attiva una volta i trigger",
      run() {
        const engine = astralEngine(["astral_air_07", "astral_death_04", "astral_death_09"], ["astral_fire_02"]);
        placeAstralUnit(engine, "player", "astral_air_07", 0, 1);
        placeAstralUnit(engine, "player", "astral_death_04", 1);
        placeAstralUnit(engine, "player", "astral_death_09", 2);
        engine.state.player.power.fire = 9;
        engine.state.player.power.death = 4;
        engine.state.player.hp = 40;
        A.astralApplyUnitDamage(engine, "enemy", "player", 0, 5, { sourceKind: "spell" }, []);
        A.astralCleanupDeaths(engine, []);
        assert(engine.state.player.board[0] === null, "Phoenix non rimossa sotto soglia");
        assert(engine.state.player.power.death === 5, "Death Keeper non attivato una volta");
        assert(engine.state.player.hp === 43, "Wall of Souls non attivato una volta");
      }
    },
    {
      name: "Death Keeper e Wall of Souls reagiscono alla morte di una creatura",
      run() {
        const engine = astralEngine(["astral_death_04", "astral_death_09"], ["astral_fire_02"]);
        placeAstralUnit(engine, "player", "astral_death_04", 0);
        placeAstralUnit(engine, "player", "astral_death_09", 1);
        placeAstralUnit(engine, "enemy", "astral_fire_02", 0, 2);
        engine.state.player.hp = 40;
        engine.state.player.power.death = 5;
        A.astralApplyUnitDamage(engine, "player", "enemy", 0, 5, { sourceKind: "spell" }, []);
        A.astralCleanupDeaths(engine, []);
        assert(engine.state.player.power.death === 6, "Death Keeper non attivato");
        assert(engine.state.player.hp === 43, "Wall of Souls non attivato");
      }
    },
    {
      name: "I modificatori permanenti scompaiono quando la creatura muore",
      run() {
        const engine = astralEngine(["astral_water_09"], ["astral_fire_02"]);
        engine.state.player.power.water = 20;
        const result = engine.playMove("player", { type: "play", cardId: "astral_water_09", slot: 0 });
        assert(result.ok, "Ocean Master non evocato");
        assert(engine.state.player.powerGain.water === 2, `Crescita propria: ${engine.state.player.powerGain.water}`);
        assert(engine.state.enemy.powerGain.water === 0, `Crescita nemica: ${engine.state.enemy.powerGain.water}`);
        engine.state.player.board[0].currentHealth = 0;
        A.astralCleanupDeaths(engine, []);
        assert(engine.state.player.powerGain.water === 1, "Bonus Water non rimosso");
        assert(engine.state.enemy.powerGain.water === 1, "Malus Water nemico non rimosso");
      }
    },
    {
      name: "A fine attacco cresce solo il potere del prossimo giocatore",
      run() {
        const engine = astralEngine(["astral_fire_01"], ["astral_water_01"]);
        engine.state.player.power.fire = 5;
        engine.state.enemy.power.fire = 5;
        engine.state.phase = A.PHASES.PLAYER_ATTACK;
        engine.finishAttack("player");
        assert(engine.state.player.power.fire === 5, "Il giocatore attivo è cresciuto troppo presto");
        assert(engine.state.enemy.power.fire === 6, "Il prossimo giocatore non è cresciuto");
      }
    },
    {
      name: "Drain Life cura in base al danno realmente inflitto",
      run() {
        const engine = astralEngine(["astral_death_08"], ["astral_water_06"]);
        placeAstralUnit(engine, "enemy", "astral_water_06", 1);
        engine.state.player.power.death = 10;
        engine.state.player.hp = 35;
        const enemyBefore = engine.state.enemy.hp;
        engine.playMove("player", { type: "play", cardId: "astral_death_08" });
        const dealt = enemyBefore - engine.state.enemy.hp;
        assert(dealt === 5, `Danno drenato dopo Ice Guard: ${dealt}`);
        assert(engine.state.player.hp === 40, `Cura drenata: ${engine.state.player.hp}`);
      }
    },
    {
      name: "Tutte le 65 carte attraversano il dispatcher senza errori",
      run() {
        const cards = A.getCardSet("astral-original");
        cards.forEach(card => {
          const engine = astralEngine([card.id], ["astral_fire_02", "astral_water_02", "astral_air_02"]);
          A.SCHOOLS.forEach(school => { engine.state.player.power[school.id] = 30; });
          placeAstralUnit(engine, "enemy", "astral_fire_02", 0);
          placeAstralUnit(engine, "enemy", "astral_water_02", 1);
          const result = engine.playMove("player", { type: "play", cardId: card.id, slot: card.type === "creature" ? 0 : null });
          assert(result.ok, `Dispatcher fallito per ${card.id}: ${result.reason || "errore"}`);
        });
      }
    }
,
    {
      name: "Il ruleset Astral non applica sconti alla scuola del talento",
      run() {
        const engine = astralEngine(["astral_fire_05"], ["astral_water_02"], { playerTalent: "fire" });
        engine.state.player.power.fire = 5;
        const card = engine.getCard("player", "astral_fire_05");
        assert(engine.effectiveCost("player", card) === 5, `Costo Minotaur: ${engine.effectiveCost("player", card)}`);
      }
    },
    {
      name: "Master Healer cura prima del proprio attacco",
      run() {
        const engine = astralEngine(["astral_earth_09"], ["astral_fire_02"]);
        const healer = placeAstralUnit(engine, "player", "astral_earth_09", 0, 20);
        const ally = placeAstralUnit(engine, "player", "astral_fire_02", 1, 8);
        engine.state.player.hp = 40;
        engine.state.phase = A.PHASES.PLAYER_ATTACK;
        engine.attackNext("player");
        assert(engine.state.player.hp === 42, "Eroe non curato prima dell'attacco");
        assert(healer.currentHealth === 22 && ally.currentHealth === 10, "Creature non curate correttamente");
      }
    },
    {
      name: "Sea Sprite danneggia il proprietario quando è indietro in Acqua",
      run() {
        const engine = astralEngine(["astral_water_04"], ["astral_fire_02"]);
        placeAstralUnit(engine, "player", "astral_water_04", 0);
        engine.state.player.power.water = 4;
        engine.state.enemy.power.water = 7;
        engine.state.phase = A.PHASES.PLAYER_ATTACK;
        const before = engine.state.player.hp;
        engine.attackNext("player");
        assert(engine.state.player.hp === before - 2, "Malus Sea Sprite non applicato");
      }
    },
    {
      name: "Vampire recupera metà del danno effettivo inflitto",
      run() {
        const engine = astralEngine(["astral_death_11"], ["astral_earth_02", "astral_fire_02"]);
        const vampire = placeAstralUnit(engine, "player", "astral_death_11", 0, 20);
        placeAstralUnit(engine, "enemy", "astral_fire_02", 0, 13);
        placeAstralUnit(engine, "enemy", "astral_earth_02", 1, 8);
        engine.state.phase = A.PHASES.PLAYER_ATTACK;
        const step = engine.attackNext("player");
        assert(step.event.damage === 7, `Danno Vampire dopo Armorer: ${step.event.damage}`);
        assert(vampire.currentHealth === 23, `Cura Vampire: ${vampire.currentHealth}`);
      }
    },
    {
      name: "Stone Rain rispetta la soglia di 12 Terra",
      run() {
        const low = astralEngine(["astral_earth_10"], ["astral_fire_02"]);
        low.state.player.power.nature = 10;
        const ownLow = placeAstralUnit(low, "player", "astral_fire_02", 0, 30);
        const enemyLow = placeAstralUnit(low, "enemy", "astral_fire_02", 0, 30);
        low.playMove("player", { type: "play", cardId: "astral_earth_10" });
        assert(ownLow.currentHealth === 10 && enemyLow.currentHealth === 10, "Stone Rain sotto soglia non ha colpito tutti");

        const high = astralEngine(["astral_earth_10"], ["astral_fire_02"]);
        high.state.player.power.nature = 12;
        const ownHigh = placeAstralUnit(high, "player", "astral_fire_02", 0, 30);
        const enemyHigh = placeAstralUnit(high, "enemy", "astral_fire_02", 0, 30);
        high.playMove("player", { type: "play", cardId: "astral_earth_10" });
        assert(ownHigh.currentHealth === 30 && enemyHigh.currentHealth === 10, "Stone Rain sopra soglia errata");
      }
    },
    {
      name: "Wyvern e Tornado scelgono la creatura con più vita attuale",
      run() {
        const wyvernEngine = astralEngine(["astral_air_04"], ["astral_fire_02", "astral_water_02"]);
        const high = placeAstralUnit(wyvernEngine, "enemy", "astral_fire_02", 0, 12);
        const low = placeAstralUnit(wyvernEngine, "enemy", "astral_water_02", 1, 8);
        wyvernEngine.playMove("player", { type: "play", cardId: "astral_air_04", slot: 0 });
        assert(high.currentHealth === 7 && low.currentHealth === 8, "Wyvern ha scelto il bersaglio sbagliato");

        const tornadoEngine = astralEngine(["astral_air_09"], ["astral_fire_02", "astral_water_02"]);
        placeAstralUnit(tornadoEngine, "enemy", "astral_fire_02", 0, 12);
        placeAstralUnit(tornadoEngine, "enemy", "astral_water_02", 1, 8);
        tornadoEngine.playMove("player", { type: "play", cardId: "astral_air_09" });
        assert(tornadoEngine.state.enemy.board[0] === null && tornadoEngine.state.enemy.board[1], "Tornado ha distrutto il bersaglio sbagliato");
      }
    },
    {
      name: "Drain Souls conta tutte le creature e consente la rinascita di Phoenix",
      run() {
        const engine = astralEngine(["astral_death_12", "astral_air_07"], ["astral_fire_02"]);
        placeAstralUnit(engine, "player", "astral_air_07", 0);
        placeAstralUnit(engine, "enemy", "astral_fire_02", 0);
        engine.state.player.power.fire = 10;
        engine.state.player.hp = 30;
        engine.playMove("player", { type: "play", cardId: "astral_death_12" });
        assert(engine.state.player.hp === 38, `Cura Drain Souls: ${engine.state.player.hp}`);
        assert(engine.state.player.board[0]?.id === "astral_air_07", "Phoenix non è rinata");
        assert(engine.state.enemy.board[0] === null, "Creatura nemica non distrutta");
      }
    },
    {
      name: "Mind Master e Astral Guard modificano tutte le crescite",
      run() {
        const mind = astralEngine(["astral_water_11"], ["astral_fire_02"]);
        mind.playMove("player", { type: "play", cardId: "astral_water_11", slot: 0 });
        assert(A.SCHOOLS.every(school => mind.state.player.powerGain[school.id] === 2), "Mind Master non aumenta tutte le scuole");
        mind.state.player.board[0].currentHealth = 0;
        A.astralCleanupDeaths(mind, []);
        assert(A.SCHOOLS.every(school => mind.state.player.powerGain[school.id] === 1), "Bonus Mind Master non rimosso");

        const guard = astralEngine(["astral_water_12"], ["astral_fire_02"]);
        guard.playMove("player", { type: "play", cardId: "astral_water_12", slot: 0 });
        assert(A.SCHOOLS.every(school => guard.state.enemy.powerGain[school.id] === 0), "Astral Guard non riduce tutte le scuole nemiche");
      }
    },
    {
      name: "Più Ice Guard dimezzano ripetutamente il danno",
      run() {
        const engine = astralEngine(["astral_fire_02"], ["astral_water_06"]);
        const attacker = placeAstralUnit(engine, "player", "astral_earth_13", 0);
        attacker.attack = 20;
        placeAstralUnit(engine, "enemy", "astral_water_06", 1);
        placeAstralUnit(engine, "enemy", "astral_water_06", 2);
        engine.state.phase = A.PHASES.PLAYER_ATTACK;
        const step = engine.attackNext("player");
        assert(step.event.damage === 5, `Doppio dimezzamento: ${step.event.damage}`);
      }
    }

    ,{
      name: "I gruppi di specializzazione sostituiscono il loadout tra le tre leghe",
      run() {
        assert(JSON.stringify(A.getAstralAbilityLoadout("battlemage", "starting")) === JSON.stringify([11,30]), "BattleMage Starting errato");
        assert(JSON.stringify(A.getAstralAbilityLoadout("battlemage", "advanced")) === JSON.stringify([1,23,30]), "BattleMage Advanced errato");
        assert(JSON.stringify(A.getAstralAbilityLoadout("battlemage", "major")) === JSON.stringify([6,1,23,30]), "BattleMage Major errato");
        const wizardMajor = A.getAstralAbilityLoadout("wizard", "major");
        assert(JSON.stringify(wizardMajor) === JSON.stringify([29,36,37]), "Wizard Major errato");
        assert(!wizardMajor.includes(35), "Meditation non deve restare nel Major loadout");
      }
    },
    {
      name: "Il GameEngine assegna automaticamente il loadout della lega",
      run() {
        const engine = astralEngine(["astral_fire_01"], ["astral_water_01"], {
          playerSpecialization: "stormmage",
          enemySpecialization: "druid",
          astralLeague: "advanced"
        });
        assert(JSON.stringify(engine.state.player.astralAbilityIds) === JSON.stringify([2,28,31]), "Loadout StormMage non assegnato");
        assert(JSON.stringify(engine.state.enemy.astralAbilityIds) === JSON.stringify([4,26,33]), "Loadout Druid non assegnato");
        assert(engine.state.player.passives.includes("astral_nets"), "Astral Nets non attivata");
        assert(engine.state.enemy.passives.includes("healing_aura"), "Healing Aura non attivata");
      }
    },
    {
      name: "I Lord aumentano a 2 la crescita della propria scuola",
      run() {
        const engine = astralEngine(["astral_fire_01"], ["astral_water_01"], {
          playerAstralAbilities: [6],
          enemyAstralAbilities: [7],
          preserveAbilitySetup: true
        });
        assert(engine.state.player.powerGain.fire === 2, `Fire Lord: ${engine.state.player.powerGain.fire}`);
        assert(engine.state.player.powerGain.water === 1, "Fire Lord ha modificato una scuola estranea");
        assert(engine.state.enemy.powerGain.water === 2, `Water Lord: ${engine.state.enemy.powerGain.water}`);
      }
    },
    {
      name: "Life Knowledge e Life Penalty modificano vita iniziale e massimo",
      run() {
        const engine = astralEngine(["astral_fire_01"], ["astral_water_01"], {
          playerAstralAbilities: [37],
          enemyAstralAbilities: [20]
        });
        assert(engine.state.player.hp === 70 && engine.state.player.maxHp === 70, "Life Knowledge non applicata");
        assert(engine.state.enemy.hp === 35 && engine.state.enemy.maxHp === 35, "Life Penalty non applicata");
      }
    },
    {
      name: "Skeleton Master e Faery Master schierano creature senza effetti di evocazione",
      run() {
        const engine = astralEngine(["astral_fire_01"], ["astral_water_01"], {
          playerAstralAbilities: [21],
          enemyAstralAbilities: [27]
        });
        assert(engine.state.player.board[0]?.id === "astral_death_01", "Skeleton iniziale mancante");
        assert(engine.state.enemy.board[0]?.id === "astral_air_01", "Faerie iniziale mancante");
        assert(engine.state.player.hp === 50, "Lo Skeleton iniziale non deve infliggere il danno di evocazione");
      }
    },
    {
      name: "Astral Nets infligge 3 danni alla creatura appena evocata",
      run() {
        const engine = astralEngine(["astral_fire_02"], ["astral_water_01"], {
          enemyAstralAbilities: [28]
        });
        const before = engine.getCard("player", "astral_fire_02").health;
        const result = engine.playMove("player", { type: "play", cardId: "astral_fire_02", slot: 0 });
        assert(result.ok, "Evocazione fallita");
        assert(engine.state.player.board[0].currentHealth === before - 3, `Astral Nets: ${engine.state.player.board[0].currentHealth}`);
      }
    },
    {
      name: "Healing Aura cura dopo la crescita dei poteri del turno",
      run() {
        const engine = astralEngine(["astral_fire_01"], ["astral_water_01"], {
          playerAstralAbilities: [26],
          preserveAbilitySetup: true
        });
        engine.state.player.hp = 40;
        engine.state.phase = A.PHASES.ENEMY_ATTACK;
        const beforePower = engine.state.player.power.fire;
        engine.finishAttack("enemy");
        assert(engine.state.player.power.fire === beforePower + 1, "Crescita potere non applicata");
        assert(engine.state.player.hp === 42, `Healing Aura: ${engine.state.player.hp}`);
      }
    },
    {
      name: "Knowledge aggiunge le carte extra al libro generato",
      run() {
        const cards = A.getCardSet("astral-original");
        const result = A.generateRecoveredAstralHands(cards, {
          seed: "knowledge-loadout",
          enemyDifficulty: "grandmaster",
          playerSpecialization: "wizard",
          enemySpecialization: "necromancer",
          playerAbilities: [29],
          enemyAbilities: [34]
        });
        const playerIds = new Set(result.player.map(card => card.id));
        ["astral_fire_10","astral_water_10","astral_air_10","astral_earth_11"].forEach(id => assert(playerIds.has(id), `Elementale mancante: ${id}`));
        assert(result.enemy.some(card => card.id === "astral_death_13"), "Greater Demon mancante");
      }
    }

    ,{
      name: "Gli ID delle abilità runtime vengono convertiti nei passivi corretti",
      run() {
        const keys=A.getAstralRuntimePassiveKeys([22,23,24,25,26,28]);
        assert(JSON.stringify(keys)===JSON.stringify(["souldrinker","fire_aura","battle_lord","stone_skin","healing_aura","astral_nets"]),`Passivi: ${keys.join(",")}`);
      }
    },
    {
      name: "Le morti simultanee partono dal campo opposto all'attore e seguono gli slot",
      run() {
        const engine = astralEngine(["astral_fire_02"], ["astral_water_07"]);
        const makeDead = (side, id, slot) => {
          const card = A.deepClone(A.getCardSet("astral-original").find(item => item.id === id));
          card.currentHealth = 0;
          card.instanceId = `${side}-${slot}-${id}`;
          engine.state[side].board[slot] = card;
        };
        makeDead("enemy", "astral_water_07", 0);
        makeDead("enemy", "astral_fire_02", 3);
        makeDead("player", "astral_fire_02", 1);
        makeDead("player", "astral_water_07", 4);
        const events = [];
        A.astralCleanupDeaths(engine, events, "player");
        const order = events.filter(event => event.type === "astralDeath").map(event => `${event.side}:${event.slot}`);
        assert(JSON.stringify(order) === JSON.stringify(["enemy:0", "enemy:3", "player:1", "player:4"]), `Ordine morti: ${order.join(", ")}`);
      }
    },
    {
      name: "Nel turno avversario le morti partono dal campo del giocatore",
      run() {
        const engine = astralEngine(["astral_fire_02"], ["astral_water_07"]);
        const makeDead = (side, id, slot) => {
          const card = A.deepClone(A.getCardSet("astral-original").find(item => item.id === id));
          card.currentHealth = 0;
          card.instanceId = `${side}-${slot}-${id}`;
          engine.state[side].board[slot] = card;
        };
        makeDead("player", "astral_fire_02", 0);
        makeDead("enemy", "astral_water_07", 0);
        const events = [];
        A.astralCleanupDeaths(engine, events, "enemy");
        const order = events.filter(event => event.type === "astralDeath").map(event => `${event.side}:${event.slot}`);
        assert(JSON.stringify(order) === JSON.stringify(["player:0", "enemy:0"]), `Ordine morti IA: ${order.join(", ")}`);
      }
    },

    {
      name: "Battle Lord e Stone Skin funzionano anche tramite ID abilità",
      run() {
        const battle=astralEngine(["astral_air_06"],["astral_fire_02"],{playerAstralAbilities:[24]});
        battle.state.player.power.air=20;
        battle.playMove("player",{type:"play",cardId:"astral_air_06"});
        assert(battle.state.enemy.hp===24,`Battle Lord danno: ${50-battle.state.enemy.hp}`);

        const skin=astralEngine(["astral_air_06"],["astral_fire_02"],{enemyAstralAbilities:[25]});
        skin.state.player.power.air=20;
        skin.playMove("player",{type:"play",cardId:"astral_air_06"});
        assert(skin.state.enemy.hp===26,`Stone Skin danno: ${50-skin.state.enemy.hp}`);
      }
    },
    {
      name: "Fuoco 01 — Fire Spikes infligge 3 a tutte le creature nemiche",
      run() {
        const engine=astralEngine(["astral_fire_01"],["astral_fire_02","astral_water_02"]);
        const a=placeAstralUnit(engine,"enemy","astral_fire_02",0,13);
        const b=placeAstralUnit(engine,"enemy","astral_water_02",1,9);
        engine.state.player.power.fire=1;
        engine.playMove("player",{type:"play",cardId:"astral_fire_01"});
        assert(a.currentHealth===10 && b.currentHealth===6,`Fire Spikes: ${a.currentHealth}/${b.currentHealth}`);
        assert(engine.state.enemy.hp===50,"Fire Spikes non deve colpire l'eroe");
      }
    },
    {
      name: "Fuoco 02 — Orc usa la soglia Terra 6 e il danno non è una magia",
      run() {
        const low=astralEngine(["astral_fire_02"],["astral_water_01"]);
        placeAstralUnit(low,"player","astral_fire_12",1);
        placeAstralUnit(low,"player","astral_air_01",2);
        low.state.player.power.nature=5;
        low.state.player.power.fire=2;
        low.playMove("player",{type:"play",cardId:"astral_fire_02",slot:0});
        assert(low.state.player.hp===46,`Orc sotto soglia: ${low.state.player.hp}`);
        const high=astralEngine(["astral_fire_02"],["astral_water_01"]);
        high.state.player.power.nature=6;
        high.state.player.power.fire=2;
        high.playMove("player",{type:"play",cardId:"astral_fire_02",slot:0});
        assert(high.state.player.hp===50,"Orc a Terra 6 non deve danneggiare il caster");
      }
    },
    {
      name: "Fuoco 03 — Fire Ritual applica +5 prima del costo e -1 Acqua nemica",
      run() {
        const engine=astralEngine(["astral_fire_03"],["astral_water_01"]);
        engine.state.player.power.fire=3;
        engine.state.enemy.power.water=1;
        engine.playMove("player",{type:"play",cardId:"astral_fire_03"});
        assert(engine.state.player.power.fire===5,`Fire Ritual netto: ${engine.state.player.power.fire}`);
        assert(engine.state.enemy.power.water===0,"Fire Ritual deve ridurre Acqua e fermarsi a zero");
      }
    },
    {
      name: "Fuoco 04 — Fire Wall infligge 3 a tutti i nemici senza bonus Dragon",
      run() {
        const engine=astralEngine(["astral_fire_04"],["astral_fire_02","astral_water_02"]);
        placeAstralUnit(engine,"player","astral_fire_12",1);
        placeAstralUnit(engine,"player","astral_air_01",2);
        const a=placeAstralUnit(engine,"enemy","astral_fire_02",0,13);
        const b=placeAstralUnit(engine,"enemy","astral_water_02",1,9);
        engine.state.player.power.fire=4;
        engine.playMove("player",{type:"play",cardId:"astral_fire_04",slot:0});
        assert(a.currentHealth===10 && b.currentHealth===6,`Fire Wall creature: ${a.currentHealth}/${b.currentHealth}`);
        assert(engine.state.enemy.hp===47,`Fire Wall eroe: ${engine.state.enemy.hp}`);
      }
    },
    {
      name: "Fuoco 05 — Minotaur riduce di 2 Terra nemica con minimo zero",
      run() {
        const engine=astralEngine(["astral_fire_05"],["astral_water_01"]);
        engine.state.player.power.fire=5;
        engine.state.enemy.power.nature=1;
        engine.playMove("player",{type:"play",cardId:"astral_fire_05",slot:0});
        assert(engine.state.enemy.power.nature===0,`Terra nemica: ${engine.state.enemy.power.nature}`);
      }
    },
    {
      name: "Fuoco 06 — Flame Wave usa il Fuoco pre-costo e colpisce solo creature",
      run() {
        const engine=astralEngine(["astral_fire_06"],["astral_fire_02"]);
        const target=placeAstralUnit(engine,"enemy","astral_fire_02",0,20);
        engine.state.player.power.fire=7;
        engine.playMove("player",{type:"play",cardId:"astral_fire_06"});
        assert(target.currentHealth===13,`Flame Wave danno: ${20-target.currentHealth}`);
        assert(engine.state.enemy.hp===50,"Flame Wave non deve colpire l'eroe");
        assert(engine.state.player.power.fire===1,`Costo Flame Wave: ${engine.state.player.power.fire}`);
      }
    },
    {
      name: "Fuoco 07 — Salamander colpisce tutti e riduce la crescita Fuoco finché vive",
      run() {
        const engine=astralEngine(["astral_fire_07"],["astral_fire_02","astral_water_02"]);
        engine.state.player.power.fire=7;
        const a=placeAstralUnit(engine,"enemy","astral_fire_02",0,13);
        const b=placeAstralUnit(engine,"enemy","astral_water_02",1,9);
        engine.playMove("player",{type:"play",cardId:"astral_fire_07",slot:0});
        assert(engine.state.player.powerGain.fire===0,`Crescita Fuoco: ${engine.state.player.powerGain.fire}`);
        engine.state.phase=A.PHASES.PLAYER_ATTACK;
        engine.state.attackCursor=0;
        const before=engine.state.enemy.hp;
        const step=engine.attackNext("player");
        assert(step.event.damage===2 && a.currentHealth===11 && b.currentHealth===7 && engine.state.enemy.hp===before-2,"Attacco multi-bersaglio Salamander errato");
        engine.state.player.board[0].currentHealth=0;
        A.astralCleanupDeaths(engine,[],"player");
        assert(engine.state.player.powerGain.fire===1,"La penalità Salamander deve sparire alla morte");
      }
    },
    {
      name: "Fuoco 08 — Inferno colpisce eroe e creature con formula pre-costo",
      run() {
        const engine=astralEngine(["astral_fire_08"],["astral_fire_02"]);
        const target=placeAstralUnit(engine,"enemy","astral_fire_02",0,20);
        engine.state.player.power.fire=9;
        engine.playMove("player",{type:"play",cardId:"astral_fire_08"});
        assert(target.currentHealth===12 && engine.state.enemy.hp===42,`Inferno: vita ${target.currentHealth}, eroe ${engine.state.enemy.hp}`);
        assert(engine.state.player.power.fire===1,`Costo Inferno: ${engine.state.player.power.fire}`);
      }
    },
    {
      name: "Fuoco 09 — Warlord parte da 4 interno e mostra 6 grazie alla propria aura",
      run() {
        const engine=astralEngine(["astral_fire_09"],["astral_water_01"]);
        const first=placeAstralUnit(engine,"player","astral_fire_09",0);
        assert(A.astralEffectiveAttack(engine,"player",first)===4,"Base interna Warlord deve essere 4");
        assert(A.astralCombatAttack(engine,"player",first)===6,`Warlord singolo: ${A.astralCombatAttack(engine,"player",first)}`);
        placeAstralUnit(engine,"player","astral_fire_09",1);
        assert(A.astralCombatAttack(engine,"player",first)===8,`Due Warlord: ${A.astralCombatAttack(engine,"player",first)}`);
      }
    },
    {
      name: "Fuoco 10 — Fire Elemental ha attacco dinamico, +1 crescita e danno entrata non magico",
      run() {
        const engine=astralEngine(["astral_fire_10"],["astral_fire_02"]);
        placeAstralUnit(engine,"player","astral_fire_12",1);
        placeAstralUnit(engine,"player","astral_air_01",2);
        const target=placeAstralUnit(engine,"enemy","astral_fire_02",0,20);
        engine.state.player.power.fire=10;
        engine.playMove("player",{type:"play",cardId:"astral_fire_10",slot:0});
        const unit=engine.state.player.board[0];
        assert(target.currentHealth===17 && engine.state.enemy.hp===47,"Danno entrata Elementale deve restare 3");
        assert(engine.state.player.powerGain.fire===2,"Elementale deve dare +1 crescita Fuoco");
        assert(A.astralEffectiveAttack(engine,"player",unit)===0,`L'attacco usa il Fuoco dopo il costo: ${A.astralEffectiveAttack(engine,"player",unit)}`);
      }
    },
    {
      name: "Fuoco 11 — Armageddon colpisce tutte le creature e solo l'eroe avversario",
      run() {
        const engine=astralEngine(["astral_fire_11"],["astral_fire_02"]);
        const own=placeAstralUnit(engine,"player","astral_fire_02",0,40);
        const enemy=placeAstralUnit(engine,"enemy","astral_fire_02",0,40);
        engine.state.player.power.fire=11;
        engine.playMove("player",{type:"play",cardId:"astral_fire_11"});
        assert(own.currentHealth===24 && enemy.currentHealth===24,"Armageddon deve infliggere 16 a entrambe le creature");
        assert(engine.state.player.hp===50 && engine.state.enemy.hp===34,"Armageddon deve colpire solo l'eroe avversario");
      }
    },
    {
      name: "Fuoco 12 — Dragon potenzia le magie ma non gli effetti di evocazione",
      run() {
        const spell=astralEngine(["astral_fire_01"],["astral_fire_02"]);
        placeAstralUnit(spell,"player","astral_fire_12",1);
        const target=placeAstralUnit(spell,"enemy","astral_fire_02",0,20);
        spell.state.player.power.fire=1;
        spell.playMove("player",{type:"play",cardId:"astral_fire_01"});
        assert(target.currentHealth===16,`Fire Spikes con Dragon: ${20-target.currentHealth}`);
        const summon=astralEngine(["astral_fire_13"],["astral_fire_02"]);
        placeAstralUnit(summon,"player","astral_fire_12",1);
        const summonedTarget=placeAstralUnit(summon,"enemy","astral_fire_02",0,30);
        summon.state.player.power.fire=13;
        summon.playMove("player",{type:"play",cardId:"astral_fire_13",slot:0});
        assert(summonedTarget.currentHealth===20,"Dragon non deve potenziare Efreet");
      }
    },
    {
      name: "Fuoco 13 — Efreet infligge 10 solo alle creature nemiche",
      run() {
        const engine=astralEngine(["astral_fire_13"],["astral_fire_02","astral_water_02"]);
        const a=placeAstralUnit(engine,"enemy","astral_fire_02",0,20);
        const b=placeAstralUnit(engine,"enemy","astral_water_02",1,20);
        engine.state.player.power.fire=13;
        engine.playMove("player",{type:"play",cardId:"astral_fire_13",slot:0});
        assert(a.currentHealth===10 && b.currentHealth===10,"Efreet deve infliggere 10 a tutte le creature nemiche");
        assert(engine.state.enemy.hp===50,"Efreet non deve colpire l'eroe");
      }
    }

  ];

  A.runFoundationTests = function runFoundationTests() {
    const results = [];
    tests.forEach(test => {
      const started = Date.now();
      try {
        test.run();
        results.push({ name: test.name, ok: true, duration: Date.now() - started });
      } catch (error) {
        results.push({ name: test.name, ok: false, error: error.message, duration: Date.now() - started });
      }
    });
    return {
      passed: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      total: results.length,
      results
    };
  };
})(window.Arcane = window.Arcane || {});
