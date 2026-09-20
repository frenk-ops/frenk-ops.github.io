(function (A) {
  "use strict";

  const portraitFor = index => index % 2 === 0 ? "assets/ui/portraits/alice.png" : "assets/ui/portraits/cooler.png";

  function specializationProgression(specId, context) {
    const { t, specialization, abilityName, abilityDescription, escapeHtml } = context;
    const spec = specialization(specId);
    if (!spec) return "";
    const stages = ["starting", "advanced", "major"];
    const panels = stages.map((league, index) => {
      const abilities = A.getAstralAbilityRecords?.(spec.groups[index] || []) || [];
      const names = abilities.map(ability => escapeHtml(abilityName(ability))).join(" · ");
      return `<details class="tournament-specialization-stage">
        <summary>
          <span><strong>${t(`league.${league}`)}</strong><small>${names}</small></span>
          <b aria-hidden="true">⌄</b>
        </summary>
        <div class="tournament-ability-details">
          ${abilities.map(ability => `<div><strong>${escapeHtml(abilityName(ability))}</strong><p>${escapeHtml(abilityDescription(ability))}</p></div>`).join("")}
        </div>
      </details>`;
    }).join("");
    return `<section class="tournament-specialization-progression">
      <div class="tournament-progression-heading">
        <h3>${t("tournament.specializationProgression")}</h3>
        <small>${t("tournament.progressionNote")}</small>
      </div>
      <div class="tournament-specialization-accordion">${panels}</div>
    </section>`;
  }

  function renderEmpty(context) {
    const { t, specializations, specializationName } = context;
    return `<div class="tournament-create tournament-create-redesigned classic-config-grid">
      <div class="tournament-intro">
        <strong>${t("tournament.introTitle")}</strong>
        <span>${t("tournament.intro")}</span>
      </div>

      <label class="tournament-mode-field">${t("tournament.mode")}
        <select id="tournamentModeSelect">
          <option value="league" selected>${t("tournament.mode.league")}</option>
          <option value="evolution">${t("tournament.mode.evolution")}</option>
          <option value="custom">${t("tournament.mode.custom")}</option>
        </select>
        <small id="tournamentModeDescription">${t("tournament.mode.league.description")}</small>
      </label>

      <div class="tournament-league-strip" aria-label="${t("tournament.path")}">
        <span class="tournament-league-chip"><b>${t("league.starting")}</b><small>${t("tournament.matches12")}</small></span>
        <span class="tournament-league-chip"><b>${t("league.advanced")}</b><small>${t("tournament.matches34")}</small></span>
        <span class="tournament-league-chip"><b>${t("league.major")}</b><small>${t("tournament.matches57")}</small></span>
      </div>

      <div id="tournamentCustomRules" class="classic-config-grid hidden">
        <label>${t("tournament.customDistribution")}
          <select id="tournamentCustomDistribution">
            <option value="arcane">${t("menu.arcaneDuel")}</option>
            <option value="free">${t("menu.freeDuel")}</option>
            <option value="mirror">${t("menu.mirrorDuel")}</option>
          </select>
        </label>
        <label>${t("tournament.customSpecializations")}
          <select id="tournamentCustomSpecializations">
            <option value="on" selected>${t("menu.specializationsOn")}</option>
            <option value="off">${t("menu.specializationsOff")}</option>
          </select>
        </label>
        <label>${t("tournament.customEvolution")}
          <select id="tournamentCustomEvolution">
            <option value="off" selected>${t("menu.specializationsOff")}</option>
            <option value="on">${t("menu.specializationsOn")}</option>
          </select>
        </label>
      </div>

      <label id="tournamentSpecializationField">${t("tournament.playerSpecialization")}
        <select id="tournamentTalentSelect">${specializations.map(item => `<option value="${item.id}">${item.icon} ${specializationName(item.id)}</option>`).join("")}</select>
      </label>

      <div id="tournamentSpecializationPreview"></div>

      <details class="tournament-advanced">
        <summary>${t("menu.advancedSettings")}</summary>
        <label>${t("tournament.seed")} <input id="tournamentSeedInput" placeholder="${t("tournament.randomSeed")}"></label>
      </details>
      <button id="createTournamentConfirm" class="classic-stone-button tournament-primary-action">${t("tournament.startNew")}</button>
    </div>`;
  }

  function opponentMedallion(opponent, index, currentIndex, t, escapeHtml) {
    const result = opponent.result || "pending";
    const current = index === currentIndex;
    const marker = result === "win" ? "✓" : result === "loss" ? "✕" : String(index + 1);
    return `<li class="tournament-opponent-medallion result-${result}${current ? " current" : ""}">
      <div class="tournament-opponent-portrait">${current || result !== "pending" ? `<img src="${portraitFor(index)}" alt="${escapeHtml(opponent.name)}">` : `<span aria-hidden="true">${escapeHtml(opponent.talent === "death" ? "☠" : "✦")}</span>`}<b>${marker}</b></div>
      <strong>${escapeHtml(opponent.name)}</strong><small>${t(`tournament.rank.${index}`)}</small>
    </li>`;
  }

  function activeAbilityChips(specId, league, context) {
    if (!specId) return `<span class="passive-chip">${context.t("tournament.noSpecialization")}</span>`;
    const spec = context.specialization(specId);
    const ids = A.getAstralAbilityLoadout?.(specId, league, spec?.talent) || [];
    const abilities = A.getAstralAbilityRecords?.(ids) || [];
    return abilities.map(ability => `<span class="passive-chip" title="${context.escapeHtml(context.abilityDescription(ability))}">${context.escapeHtml(context.abilityName(ability))}</span>`).join("");
  }

  function renderActive(context) {
    const { tournament, t, specialization, specializationName, leagueLabel, difficultyLabel, tournamentModeLabel, escapeHtml } = context;
    const current = tournament.opponents[tournament.currentMatch];
    const remainingWins = Math.max(0, tournament.winTarget - tournament.wins);
    const playerSpecialization = tournament.specialization ? specialization(tournament.specialization) : null;
    const opponentPowerups = A.getTournamentOpponentPassives?.(tournament, tournament.currentMatch) || [];
    return `<div class="tournament-hub">
      <aside class="tournament-next-opponent">
        <span>${t("tournament.nextOpponent")}</span>
        <div class="tournament-current-portrait"><img src="${portraitFor(tournament.currentMatch)}" alt="${escapeHtml(current.name)}"></div>
        <h3>${escapeHtml(current.name)}</h3>
        <p>${t(`tournament.rank.${tournament.currentMatch}`)} · ${leagueLabel(current.league)}</p>
        <small>${t("tournament.aiDifficulty")}: ${escapeHtml(difficultyLabel(current.difficulty))}</small>
        <small>${t("tournament.mode")}: ${escapeHtml(tournamentModeLabel(tournament.tournamentMode))}</small>
        ${tournament.evolutionEnabled ? `<small>${t("tournament.opponentPowerups")}: ${opponentPowerups.length}</small>` : ""}
        <button id="continueTournamentBtn" class="primary tournament-primary-action">${t("tournament.resume")}</button>
      </aside>
      <section class="tournament-progress-panel">
        <div class="tournament-summary">
          <div><small>${t("tournament.match")}</small><strong>${tournament.currentMatch + 1} / ${tournament.opponents.length}</strong></div>
          <div><small>${t("tournament.wins")}</small><strong>${tournament.wins} / ${tournament.winTarget}</strong></div>
          <div><small>${t("tournament.losses")}</small><strong>${tournament.losses}</strong></div>
          <div><small>${t("tournament.points")}</small><strong>${tournament.points}</strong></div>
          <div><small>${t("tournament.specialization")}</small><strong>${playerSpecialization ? `${playerSpecialization.icon} ${specializationName(tournament.specialization)}` : t("tournament.noSpecialization")}</strong></div>
        </div>

        <div class="passive-list">
          <h3>${t("tournament.activeAbilities")} · ${leagueLabel(current.league)}</h3>
          ${activeAbilityChips(tournament.specialization, current.league, context)}
        </div>

        <div class="tournament-path-heading"><h3>${t("tournament.path")}</h3><small>${t("tournament.winsNeeded", { value: remainingWins })}</small></div>
        <ol class="tournament-opponent-path">${tournament.opponents.map((opponent, index) => opponentMedallion(opponent, index, tournament.currentMatch, t, escapeHtml)).join("")}</ol>

        ${tournament.evolutionEnabled ? `<div class="passive-list"><h3>${t("tournament.powerups")}</h3>${tournament.selectedPassives.length ? tournament.selectedPassives.map(id => `<span class="passive-chip">${escapeHtml(A.getPassive(id)?.name || id)}</span>`).join("") : `<p>${t("tournament.noPowerups")}</p>`}</div>` : ""}
        <div id="tournamentActions"></div>
      </section>
    </div>`;
  }

  function renderCompleted(context) {
    const { tournament, t } = context;
    return `<div class="tournament-complete ${tournament.won ? "won" : "lost"}">
      <span class="tournament-trophy" aria-hidden="true">${tournament.won ? "♛" : "✦"}</span>
      <h3>${tournament.won ? t("tournament.won") : t("tournament.notWon")}</h3>
      <p>${t("tournament.result", { wins: tournament.wins, matches: tournament.opponents.length, points: tournament.points })}</p>
      <button id="archiveTournamentBtn" class="classic-stone-button">${t("tournament.archive")}</button>
    </div>`;
  }

  A.UITournamentView = Object.freeze({ renderEmpty, renderActive, renderCompleted, specializationProgression });
})(window.Arcane = window.Arcane || {});
