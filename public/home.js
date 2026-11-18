(function () {
  const { escapeHtml, renderIcons, formatDate, renderStatusBadge, apiJson } = ArenaUI;

  let allTournaments = [];
  let activeFilter = 'all';

  function renderKpis(tournaments, resultSummary) {
    const activeCount = tournaments.filter((t) => t.status === 'Open' || t.status === 'Live').length;
    const totalConfirmed = tournaments.reduce((sum, t) => sum + (Number(t.slotsUsed) || 0), 0);
    const totalMatches = resultSummary.reduce((sum, t) => sum + (Number(t.totalMatches) || 0), 0);
    const maxBracketElo = tournaments.reduce((max, t) => Math.max(max, Number(t.maxElo) || 0), 0);

    document.getElementById('kpiEvents').textContent = String(activeCount);
    document.getElementById('kpiPlayers').textContent = String(totalConfirmed);
    document.getElementById('kpiPeakElo').textContent = maxBracketElo ? String(maxBracketElo) : 'Open';
    document.getElementById('kpiMatches').textContent = String(totalMatches);
  }

  function renderCards() {
    const grid = document.getElementById('homeTournamentGrid');
    const filtered = allTournaments.filter((t) => {
      if (activeFilter === 'all') return true;
      return t.status === activeFilter;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="glass-panel" style="padding:32px;grid-column:1/-1;text-align:center;">
          <i data-lucide="calendar-x" style="width:32px;height:32px;color:var(--text-muted);margin:0 auto 10px;"></i>
          <h3 class="card-title">No tournaments match this filter</h3>
          <p class="muted" style="margin:6px 0 18px;">Switch filters or inspect completed results.</p>
          <button type="button" class="btn btn-secondary btn-sm" id="resetFilterBtn">Show All Events</button>
        </div>
      `;
      renderIcons(grid);
      const resetBtn = document.getElementById('resetFilterBtn');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => setFilter('all'));
      }
      return;
    }

    grid.innerHTML = filtered
      .map((t) => {
        const pct = Math.min(100, Math.round(((t.slotsUsed || 0) / Math.max(1, t.maxPlayers)) * 100));
        const canRegister = t.status === 'Open';
        return `
          <article class="glass-panel" style="padding:26px;display:flex;flex-direction:column;gap:16px;justify-content:space-between;">
            <div style="display:flex;flex-direction:column;gap:12px;">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
                <h3 class="card-title">${escapeHtml(t.title)}</h3>
                ${renderStatusBadge(t.status)}
              </div>

              <div class="meta-line">
                <span>${escapeHtml(t.format)}</span>
                <span class="meta-sep">·</span>
                <span>${escapeHtml(t.timeControl)}</span>
                <span class="meta-sep">·</span>
                <span>${escapeHtml(t.platform)}</span>
                <span class="meta-sep">·</span>
                <span class="num">Elo ${t.minElo}–${t.maxElo}</span>
              </div>

              <p class="muted" style="margin:0;font-size:0.92rem;">
                ${escapeHtml(t.description || t.subtitle || 'Structured chess championship event.')}
              </p>
            </div>

            <div style="display:flex;flex-direction:column;gap:14px;">
              <div style="display:flex;flex-direction:column;gap:6px;">
                <div style="display:flex;justify-content:space-between;font-size:0.83rem;">
                  <span class="muted">Confirmed Entrants</span>
                  <span class="num">${t.slotsUsed} / ${t.maxPlayers}</span>
                </div>
                <div class="slot-track">
                  <div class="slot-fill" style="width:${pct}%;"></div>
                </div>
              </div>

              <div class="meta-line" style="justify-content:space-between;">
                <span>Starts ${formatDate(t.startDate)}</span>
                <span class="num" style="color:var(--accent-lime-text);font-weight:700;">${escapeHtml(t.prizePool)}</span>
              </div>

              <div style="display:flex;flex-wrap:wrap;gap:10px;padding-top:4px;">
                ${
                  canRegister
                    ? `<a href="/registration?tournament=${encodeURIComponent(t.id)}" class="btn btn-primary btn-sm">
                         <i data-lucide="user-plus" style="width:15px;height:15px;"></i>
                         <span>Register Entry</span>
                       </a>`
                    : ''
                }
                <a href="/result?tournament=${encodeURIComponent(t.id)}" class="btn btn-secondary btn-sm">
                  <i data-lucide="list-ordered" style="width:15px;height:15px;"></i>
                  <span>Standings &amp; Pairings</span>
                </a>
              </div>
            </div>
          </article>
        `;
      })
      .join('');

    renderIcons(grid);
  }

  function setFilter(next) {
    activeFilter = next;
    document.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.filter === next);
    });
    renderCards();
  }

  async function loadHome() {
    try {
      const [regData, resData] = await Promise.all([
        apiJson('/api/registration/tournaments'),
        apiJson('/api/result/tournaments')
      ]);
      allTournaments = regData.tournaments || [];
      renderKpis(allTournaments, resData.tournaments || []);
      renderCards();
    } catch (err) {
      const grid = document.getElementById('homeTournamentGrid');
      grid.innerHTML = `
        <div class="glass-panel" style="padding:28px;grid-column:1/-1;">
          <p style="margin:0;color:var(--error-text);">Failed to load tournaments: ${escapeHtml(err.message)}</p>
        </div>
      `;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => setFilter(btn.dataset.filter));
    });
    loadHome();
  });
})();
