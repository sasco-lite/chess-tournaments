(function () {
  const { escapeHtml, renderIcons, formatDate, renderStatusBadge, toast, apiJson } = ArenaUI;

  let currentData = null;
  let selectedRound = 'all';

  function renderPodium(podium) {
    const grid = document.getElementById('podiumGrid');
    if (!podium || podium.length === 0) {
      grid.innerHTML = `
        <div class="surface-inset" style="padding:20px;grid-column:1/-1;">
          <p class="muted" style="margin:0;">No ranked players yet. Standings populate as players confirm and rounds conclude.</p>
        </div>
      `;
      return;
    }

    const icons = ['crown', 'award', 'medal'];
    const colors = ['var(--accent-lime-text)', 'var(--accent-sky)', 'var(--status-waitlist)'];
    const labels = ['1st Place', '2nd Place', '3rd Place'];

    grid.innerHTML = podium
      .map(
        (p, idx) => `
        <div class="surface-inset podium-card" style="border-color:${idx === 0 ? 'var(--border-lime-panel)' : 'var(--border-inset)'};">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span class="podium-rank" style="color:${colors[idx]};">
              <i data-lucide="${icons[idx]}" style="width:18px;height:18px;"></i>
              <span>${labels[idx]}</span>
            </span>
            <span class="num" style="font-weight:700;font-size:1.15rem;color:${colors[idx]};">${p.points} pts</span>
          </div>
          <div style="font-size:1.1rem;font-weight:700;">${escapeHtml(p.username)}</div>
          <div class="meta-line">
            <span class="num">Elo ${p.peakElo}</span>
            <span class="meta-sep">·</span>
            <span class="num">BH ${p.buchholz}</span>
            <span class="meta-sep">·</span>
            <span class="num">${p.wins}W-${p.draws}D-${p.losses}L</span>
          </div>
        </div>
      `
      )
      .join('');

    renderIcons(grid);
  }

  function renderStandingsTable() {
    const tbody = document.getElementById('standingsBody');
    if (!currentData) return;

    const q = document.getElementById('playerSearchInput').value.trim().toLowerCase();
    const sortBy = document.getElementById('standingsSortSelect').value;

    let rows = [...(currentData.standings || [])];
    if (q) {
      rows = rows.filter(
        (r) =>
          (r.username || '').toLowerCase().includes(q) ||
          (r.fullName || '').toLowerCase().includes(q)
      );
    }

    rows.sort((a, b) => {
      if (sortBy === 'points') return b.points - a.points || a.rank - b.rank;
      if (sortBy === 'peakElo') return b.peakElo - a.peakElo;
      if (sortBy === 'buchholz') return b.buchholz - a.buchholz || b.points - a.points;
      return a.rank - b.rank;
    });

    if (rows.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="8" class="muted">No matching players found in standings.</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map(
        (r) => `
        <tr>
          <td class="num" style="font-weight:700;">#${r.rank}</td>
          <td>
            <div style="font-weight:700;">${escapeHtml(r.username)}</div>
            ${r.country ? `<div class="subtle" style="font-size:0.78rem;">${escapeHtml(r.country)}</div>` : ''}
          </td>
          <td>${escapeHtml(r.platform)}</td>
          <td class="right num">${r.peakElo}</td>
          <td class="right num">${r.wins} / ${r.draws} / ${r.losses}</td>
          <td class="right num">${r.buchholz}</td>
          <td class="right num" style="font-weight:700;color:var(--accent-lime-text);">${r.points}</td>
          <td class="right">
            <button type="button" class="btn btn-secondary btn-sm" data-player-card="${escapeHtml(r.username)}">
              <i data-lucide="file-text" style="width:14px;height:14px;"></i>
              <span>Games</span>
            </button>
          </td>
        </tr>
      `
      )
      .join('');

    renderIcons(tbody);
    tbody.querySelectorAll('[data-player-card]').forEach((btn) => {
      btn.addEventListener('click', () => openPlayerScorecard(btn.dataset.playerCard));
    });
  }

  function renderRounds() {
    const tabsEl = document.getElementById('roundTabs');
    const container = document.getElementById('roundsContainer');
    const rounds = currentData?.rounds || [];

    if (rounds.length === 0) {
      tabsEl.innerHTML = '';
      container.innerHTML =
        '<p class="muted" style="margin:0;">No rounds have been paired or published for this event yet.</p>';
      return;
    }

    const tabButtons = [
      `<button type="button" class="segmented-btn ${selectedRound === 'all' ? 'active' : ''}" data-round="all">All Rounds</button>`,
      ...rounds.map(
        (r) =>
          `<button type="button" class="segmented-btn ${String(selectedRound) === String(r.round) ? 'active' : ''}" data-round="${r.round}">Round ${r.round}</button>`
      )
    ];
    tabsEl.innerHTML = tabButtons.join('');
    tabsEl.querySelectorAll('[data-round]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedRound = btn.dataset.round;
        renderRounds();
      });
    });

    const visibleRounds =
      selectedRound === 'all'
        ? rounds
        : rounds.filter((r) => String(r.round) === String(selectedRound));

    container.innerHTML = visibleRounds
      .map(
        (r) => `
        <div style="margin-bottom:20px;">
          <h3 style="font-size:1rem;font-weight:700;margin-bottom:10px;">Round ${r.round}</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th>Board</th>
                <th>White</th>
                <th>Black</th>
                <th>Outcome</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${r.games
                .map(
                  (g) => `
                  <tr>
                    <td class="num">#${g.board || 1}</td>
                    <td style="font-weight:600;">${escapeHtml(g.whiteUsername)}</td>
                    <td style="font-weight:600;">${escapeHtml(g.blackUsername || 'BYE')}</td>
                    <td class="num" style="font-weight:700;color:${g.outcome === 'PENDING' ? 'var(--text-muted)' : 'var(--accent-lime-text)'};">
                      ${escapeHtml(g.outcome)}
                    </td>
                    <td class="muted">${escapeHtml(g.pgnNote || '-')}</td>
                  </tr>
                `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `
      )
      .join('');
  }

  async function openPlayerScorecard(username) {
    if (!currentData) return;
    const modal = document.getElementById('scorecardModal');
    const body = document.getElementById('modalPlayerBody');
    document.getElementById('modalPlayerName').textContent = `${username} — Scorecard`;
    body.innerHTML = '<p class="muted">Loading match history...</p>';
    modal.classList.add('open');

    try {
      const data = await apiJson(
        `/api/result/${encodeURIComponent(currentData.tournament.id)}/player/${encodeURIComponent(username)}`
      );
      const p = data.player;
      const games = data.matches || [];
      body.innerHTML = `
        <div class="meta-line" style="margin-bottom:16px;">
          <span class="num">Rank #${p.rank}</span>
          <span class="meta-sep">·</span>
          <span class="num">${p.points} Points</span>
          <span class="meta-sep">·</span>
          <span class="num">Peak Elo ${p.peakElo}</span>
          <span class="meta-sep">·</span>
          <span class="num">Buchholz ${p.buchholz}</span>
        </div>
        ${
          games.length === 0
            ? '<p class="muted">No recorded games for this player yet.</p>'
            : `<table class="data-table">
                <thead>
                  <tr><th>Rd</th><th>White</th><th>Black</th><th>Result</th></tr>
                </thead>
                <tbody>
                  ${games
                    .map(
                      (m) => `
                      <tr>
                        <td class="num">R${m.round}</td>
                        <td>${escapeHtml(m.whiteUsername)}</td>
                        <td>${escapeHtml(m.blackUsername || 'BYE')}</td>
                        <td class="num" style="font-weight:700;">${escapeHtml(m.outcome)}</td>
                      </tr>
                    `
                    )
                    .join('')}
                </tbody>
              </table>`
        }
      `;
    } catch (err) {
      body.innerHTML = `<p style="color:var(--error-text);">${escapeHtml(err.message)}</p>`;
    }
  }

  async function loadTournamentResults(id) {
    if (!id) return;
    try {
      const data = await apiJson(`/api/result/${encodeURIComponent(id)}`);
      currentData = data;
      selectedRound = 'all';

      const t = data.tournament;
      document.getElementById('resTitle').textContent = t.title;
      document.getElementById('resStatus').innerHTML = renderStatusBadge(t.status);
      document.getElementById('resMeta').innerHTML = `
        <span>${escapeHtml(t.format)}</span>
        <span class="meta-sep">·</span>
        <span>${escapeHtml(t.timeControl)}</span>
        <span class="meta-sep">·</span>
        <span>${escapeHtml(t.platform)}</span>
        <span class="meta-sep">·</span>
        <span>${t.rounds} Rounds</span>
        <span class="meta-sep">·</span>
        <span>${formatDate(t.startDate)}</span>
      `;
      renderIcons(document.getElementById('resStatus'));
      renderPodium(data.podium);
      renderStandingsTable();
      renderRounds();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function initResults() {
    const select = document.getElementById('resultTournamentSelect');
    try {
      const data = await apiJson('/api/result/tournaments');
      const list = data.tournaments || [];
      if (list.length === 0) {
        select.innerHTML = '<option value="">No tournaments available</option>';
        return;
      }

      select.innerHTML = list
        .map(
          (t) =>
            `<option value="${escapeHtml(t.id)}">${escapeHtml(t.title)} (${escapeHtml(t.status)} · ${t.confirmedPlayers} players)</option>`
        )
        .join('');

      const params = new URLSearchParams(window.location.search);
      const requested = params.get('tournament');
      const initial =
        list.find((t) => t.id === requested) ||
        list.find((t) => t.status === 'Completed' || t.totalMatches > 0) ||
        list[0];

      if (initial) {
        select.value = initial.id;
        await loadTournamentResults(initial.id);
      }
    } catch (err) {
      toast(err.message, 'error');
    }

    select.addEventListener('change', () => loadTournamentResults(select.value));
    document.getElementById('playerSearchInput').addEventListener('input', renderStandingsTable);
    document.getElementById('standingsSortSelect').addEventListener('change', renderStandingsTable);
    document.getElementById('closeModalBtn').addEventListener('click', () => {
      document.getElementById('scorecardModal').classList.remove('open');
    });
    document.getElementById('scorecardModal').addEventListener('click', (e) => {
      if (e.target.id === 'scorecardModal') {
        e.target.classList.remove('open');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', initResults);
})();
