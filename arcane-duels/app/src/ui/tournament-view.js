(function (A) {
  "use strict";

  const portraitFor = index => index % 2 === 0 ? "assets/ui/portraits/alice.png" : "assets/ui/portraits/cooler.png";

  function renderEmpty(context) {
    const { t, specializations, specializationName } = context;
    return `<div class="tournament-create tournament-create-redesigned">
      <div class="tournament-intro"><strong>${t("tournament.introTitle")}</strong><span>${t("tournament.intro")}</span></div>
      <div class="tournament-rules-grid">
        <span><b>${t("league.starting")}</b><small>${t("tournament.matches12")}</small></span>
        <span><b>${t("league.advanced")}</b><small>${t("tournament.matches34")}</small></span>
        <span><b>${t("league.major")}</b><small>${t("tournament.matches57")}</small></span>
      </div>
      <label>${t("tournament.playerSpecialization")} <select id="tournamentTalentSelect">${specializations.map(item => `<option value="${item.id}">${item.icon} ${specializationName(item.id)}</option>`).join("")}</select></label>
      <details class="tournament-advanced"><summary>${t("menu.advancedSettings")}</summary><label>${t("tournament.seed")} <input id="tournamentSeedInput" placeholder="${t("tournament.randomSeed")}"></label></details>
      <button id="createTournamentConfirm" class="primary tournament-primary-action">${t("tournament.startNew")}</button>
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

  function renderActive(context) {
    const { tournament, t, specialization, specializationName, leagueLabel, difficultyLabel, escapeHtml } = context;
    const current = tournament.opponents[tournament.currentMatch];
    const remainingWins = Math.max(0, tournament.winTarget - tournament.wins);
    const playerSpecialization = specialization(tournament.specialization);
    return `<div class="tournament-hub">
      <aside class="tournament-next-opponent">
        <span>${t("tournament.nextOpponent")}</span>
        <div class="tournament-current-portrait"><img src="${portraitFor(tournament.currentMatch)}" alt="${escapeHtml(current.name)}"></div>
        <h3>${escapeHtml(current.name)}</h3>
        <p>${t(`tournament.rank.${tournament.currentMatch}`)} · ${leagueLabel(current.league)}</p>
        <small>${t("tournament.aiDifficulty")}: ${escapeHtml(difficultyLabel(current.difficulty))}</small>
        <button id="continueTournamentBtn" class="primary tournament-primary-action">${t("tournament.resume")}</button>
      </aside>
      <section class="tournament-progress-panel">
        <div class="tournament-summary">
          <div><small>${t("tournament.match")}</small><strong>${tournament.currentMatch + 1} / ${tournament.opponents.length}</strong></div>
          <div><small>${t("tournament.wins")}</small><strong>${tournament.wins} / ${tournament.winTarget}</strong></div>
          <div><small>${t("tournament.losses")}</small><strong>${tournament.losses}</strong></div>
          <div><small>${t("tournament.points")}</small><strong>${tournament.points}</strong></div>
          <div><small>${t("tournament.specialization")}</small><strong>${playerSpecialization?.icon || "✦"} ${specializationName(tournament.specialization)}</strong></div>
        </div>
        <div class="tournament-path-heading"><h3>${t("tournament.path")}</h3><small>${t("tournament.winsNeeded", { value: remainingWins })}</small></div>
        <ol class="tournament-opponent-path">${tournament.opponents.map((opponent, index) => opponentMedallion(opponent, index, tournament.currentMatch, t, escapeHtml)).join("")}</ol>
        <div class="passive-list"><h3>${t("tournament.passives")}</h3>${tournament.selectedPassives.length ? tournament.selectedPassives.map(id => `<span class="passive-chip">${escapeHtml(A.getPassive(id)?.name || id)}</span>`).join("") : `<p>${t("tournament.noPassives")}</p>`}</div>
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
      <button id="archiveTournamentBtn" class="ghost">${t("tournament.archive")}</button>
    </div>`;
  }

  A.UITournamentView = Object.freeze({ renderEmpty, renderActive, renderCompleted });
})(window.Arcane = window.Arcane || {});
