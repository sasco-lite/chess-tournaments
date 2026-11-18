(function () {
  const { escapeHtml, renderIcons, formatDate, renderStatusBadge, toast, apiJson } = ArenaUI;

  let tournaments = [];
  let customFieldsDraft = [];
  let wheelSlices = [
    { id: 'w1', label: 'White Pieces Priority', weight: 1, color: '#c4f536' },
    { id: 'w2', label: 'Wildcard Seed #1', weight: 1, color: '#38bdf8' },
    { id: 'w3', label: 'Bye Advantage Rd 1', weight: 1, color: '#a855f7' },
    { id: 'w4', label: 'Bonus Bounty +$100', weight: 1, color: '#f59e0b' },
    { id: 'w5', label: 'Feature Stream Board', weight: 1, color: '#22c55e' },
    { id: 'w6', label: 'Re-Roll Selection', weight: 1, color: '#f43f5e' }
  ];
  let wheelAngle = 0;
  let isSpinning = false;
  let pendingBackupSnapshot = null;
  let pendingPurgeScope = null;

  const WHEEL_COLORS = ['#c4f536', '#38bdf8', '#f59e0b', '#22c55e', '#a855f7', '#fb7185', '#e2e8f0'];

  const PURGE_MESSAGES = {
    demo: 'Remove the 3 seeded demo tournaments, seeded players, and seeded matches?',
    wheel: 'Delete all recorded admin private wheel draw logs?',
    matches: 'Delete all match pairings and reset player scores to 0?',
    registrations: 'Delete all player registrations, matches, and standings?',
    all: 'Permanently wipe ALL tournaments, registrations, matches, standings, and wheel logs?'
  };

  function toLocalInputValue(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function switchTab(tabName) {
    document.querySelectorAll('[data-admin-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.adminTab === tabName);
    });
    document.querySelectorAll('.admin-tab-panel').forEach((panel) => {
      panel.style.display = panel.id === `tab-${tabName}` ? 'block' : 'none';
    });
    if (tabName === 'wheel') {
      drawWheel();
      loadWheelHistory();
    } else if (tabName === 'database') {
      loadDatabaseSummary().catch((err) => toast(err.message, 'error'));
    }
  }

  async function refreshOverview() {
    const data = await apiJson('/api/admin/overview');
    const s = data.stats;
    document.getElementById('admStatEvents').textContent = String(s.totalTournaments);
    document.getElementById('admStatConfirmed').textContent = String(s.confirmedCount);
    document.getElementById('admStatQueue').textContent = String(s.pendingCount + s.waitlistCount);
    document.getElementById('admStatSpins').textContent = String(s.wheelDrawsCount);

    const dbLabel =
      data.dbStatus.mode === 'mongodb'
        ? 'MongoDB Connected'
        : data.dbStatus.mode === 'local-preview'
        ? 'Local Preview Fallback Store (Set MONGODB_URI in Vercel for Atlas)'
        : 'Database Connection Warning';

    document.getElementById('adminEnvMeta').innerHTML = `
      <span>Persistence: <strong>${escapeHtml(dbLabel)}</strong></span>
      <span class="meta-sep">·</span>
      <span>Node.js 24.x Express Runtime</span>
    `;
  }

  function populateTournamentSelects() {
    const optionsHtml = tournaments
      .map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.title)} (${escapeHtml(t.status)})</option>`)
      .join('');

    const rosterSel = document.getElementById('rosterTournamentFilter');
    const prevRoster = rosterSel.value;
    rosterSel.innerHTML = `<option value="">All Tournaments</option>${optionsHtml}`;
    if (prevRoster) rosterSel.value = prevRoster;

    const resSel = document.getElementById('resultsAdminTournamentSelect');
    const prevRes = resSel.value;
    resSel.innerHTML = optionsHtml || '<option value="">No tournaments</option>';
    if (prevRes && tournaments.some((t) => t.id === prevRes)) {
      resSel.value = prevRes;
    }

    const wheelSel = document.getElementById('wheelTournamentSelect');
    const prevWheel = wheelSel.value;
    wheelSel.innerHTML = optionsHtml || '<option value="">No tournaments</option>';
    if (prevWheel && tournaments.some((t) => t.id === prevWheel)) {
      wheelSel.value = prevWheel;
    }
  }

  function renderCustomFieldsEditor() {
    const list = document.getElementById('customFieldsList');
    if (customFieldsDraft.length === 0) {
      list.innerHTML =
        '<p class="muted" style="margin:0;font-size:0.86rem;">No custom fields added yet. Core fields (Username, Platform, Peak Elo, Current Elo) are always included.</p>';
      return;
    }

    list.innerHTML = customFieldsDraft
      .map(
        (f, idx) => `
        <div class="glass-panel" style="padding:14px;display:flex;flex-direction:column;gap:10px;box-shadow:none;">
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
            <input
              type="text"
              class="input"
              style="flex:2;min-width:160px;min-height:38px;"
              value="${escapeHtml(f.label)}"
              placeholder="Field Label"
              data-cf-idx="${idx}"
              data-cf-prop="label"
            />
            <select
              class="select"
              style="flex:1;min-width:120px;min-height:38px;"
              data-cf-idx="${idx}"
              data-cf-prop="type"
            >
              <option value="text" ${f.type === 'text' ? 'selected' : ''}>Text</option>
              <option value="number" ${f.type === 'number' ? 'selected' : ''}>Number</option>
              <option value="select" ${f.type === 'select' ? 'selected' : ''}>Select Dropdown</option>
              <option value="textarea" ${f.type === 'textarea' ? 'selected' : ''}>Long Text</option>
              <option value="checkbox" ${f.type === 'checkbox' ? 'selected' : ''}>Checkbox Pledge</option>
              <option value="url" ${f.type === 'url' ? 'selected' : ''}>Profile URL</option>
            </select>
            <label style="display:inline-flex;align-items:center;gap:6px;font-size:0.82rem;white-space:nowrap;">
              <input type="checkbox" ${f.required ? 'checked' : ''} data-cf-idx="${idx}" data-cf-prop="required" />
              <span>Required</span>
            </label>
            <button type="button" class="btn btn-secondary btn-sm" data-cf-move="${idx}:-1" title="Move Up">
              <i data-lucide="arrow-up" style="width:14px;height:14px;"></i>
            </button>
            <button type="button" class="btn btn-secondary btn-sm" data-cf-move="${idx}:1" title="Move Down">
              <i data-lucide="arrow-down" style="width:14px;height:14px;"></i>
            </button>
            <button type="button" class="btn btn-danger btn-sm" data-cf-del="${idx}" title="Remove">
              <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
            </button>
          </div>
          <div class="grid-2" style="gap:8px;">
            <input
              type="text"
              class="input"
              style="min-height:36px;font-size:0.85rem;"
              value="${escapeHtml(f.placeholder || '')}"
              placeholder="Placeholder or checkbox description"
              data-cf-idx="${idx}"
              data-cf-prop="placeholder"
            />
            <input
              type="text"
              class="input"
              style="min-height:36px;font-size:0.85rem;${f.type === 'select' ? '' : 'opacity:0.45;'}"
              value="${escapeHtml((f.options || []).join(', '))}"
              placeholder="Dropdown options (comma separated)"
              data-cf-idx="${idx}"
              data-cf-prop="options"
            />
          </div>
        </div>
      `
      )
      .join('');

    renderIcons(list);

    list.querySelectorAll('[data-cf-prop]').forEach((el) => {
      const handler = () => {
        const idx = Number(el.dataset.cfIdx);
        const prop = el.dataset.cfProp;
        if (prop === 'required') {
          customFieldsDraft[idx].required = el.checked;
        } else if (prop === 'options') {
          customFieldsDraft[idx].options = el.value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        } else {
          customFieldsDraft[idx][prop] = el.value;
          if (prop === 'type') renderCustomFieldsEditor();
        }
      };
      el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', handler);
    });

    list.querySelectorAll('[data-cf-move]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [idxStr, dirStr] = btn.dataset.cfMove.split(':');
        const idx = Number(idxStr);
        const target = idx + Number(dirStr);
        if (target < 0 || target >= customFieldsDraft.length) return;
        const copy = [...customFieldsDraft];
        const [item] = copy.splice(idx, 1);
        copy.splice(target, 0, item);
        customFieldsDraft = copy;
        renderCustomFieldsEditor();
      });
    });

    list.querySelectorAll('[data-cf-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.cfDel);
        customFieldsDraft.splice(idx, 1);
        renderCustomFieldsEditor();
      });
    });
  }

  function resetTournamentBuilder() {
    document.getElementById('trnId').value = '';
    document.getElementById('builderFormTitle').textContent = 'Create New Tournament Registration';
    document.getElementById('saveTournamentBtn').innerHTML =
      '<i data-lucide="save" style="width:16px;height:16px;"></i><span>Publish Tournament</span>';
    document.getElementById('tournamentForm').reset();
    document.getElementById('trnRounds').value = 7;
    document.getElementById('trnMinElo').value = 1000;
    document.getElementById('trnMaxElo').value = 2800;
    document.getElementById('trnMaxPlayers').value = 64;
    document.getElementById('trnAutoApprove').checked = true;
    document.getElementById('trnAllowWaitlist').checked = true;
    document.getElementById('trnReqName').checked = true;
    document.getElementById('trnReqEmail').checked = true;
    customFieldsDraft = [];
    renderCustomFieldsEditor();
    renderIcons(document.getElementById('saveTournamentBtn'));
  }

  function loadTournamentIntoBuilder(t) {
    document.getElementById('trnId').value = t.id;
    document.getElementById('builderFormTitle').textContent = `Editing: ${t.title}`;
    document.getElementById('saveTournamentBtn').innerHTML =
      '<i data-lucide="check" style="width:16px;height:16px;"></i><span>Save Changes</span>';
    document.getElementById('trnTitle').value = t.title || '';
    document.getElementById('trnSubtitle').value = t.subtitle || '';
    document.getElementById('trnDescription').value = t.description || '';
    document.getElementById('trnFormat').value = t.format || 'Swiss';
    document.getElementById('trnRounds').value = t.rounds || 7;
    document.getElementById('trnTimeControl').value = t.timeControl || '10+5 Rapid';
    document.getElementById('trnPlatform').value = t.platform || 'Chess.com';
    document.getElementById('trnVenue').value = t.venue || 'Online Arena';
    document.getElementById('trnStatus').value = t.status || 'Open';
    document.getElementById('trnMinElo').value = t.minElo || 100;
    document.getElementById('trnMaxElo').value = t.maxElo || 3500;
    document.getElementById('trnEloType').value = t.eloRequirementType || 'peak';
    document.getElementById('trnMaxPlayers').value = t.maxPlayers || 64;
    document.getElementById('trnEntryFee').value = t.entryFee || 'Free Entry';
    document.getElementById('trnPrizePool').value = t.prizePool || '';
    document.getElementById('trnStartDate').value = toLocalInputValue(t.startDate);
    document.getElementById('trnOpenAt').value = toLocalInputValue(t.registrationOpenAt);
    document.getElementById('trnCloseAt').value = toLocalInputValue(t.registrationCloseAt);
    document.getElementById('trnAutoApprove').checked = Boolean(t.autoApprove);
    document.getElementById('trnAllowWaitlist').checked = Boolean(t.allowWaitlist);
    document.getElementById('trnReqName').checked = Boolean(t.requireRealName);
    document.getElementById('trnReqEmail').checked = Boolean(t.requireEmail);
    document.getElementById('trnReqCountry').checked = Boolean(t.requireCountry);
    document.getElementById('trnReqFide').checked = Boolean(t.requireFideId);
    document.getElementById('trnRules').value = t.rulesText || '';
    customFieldsDraft = JSON.parse(JSON.stringify(t.customFields || []));
    renderCustomFieldsEditor();
    renderIcons(document.getElementById('saveTournamentBtn'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderAdminEvents() {
    const container = document.getElementById('adminEventsList');
    if (tournaments.length === 0) {
      container.innerHTML = '<p class="muted">No tournaments created yet.</p>';
      return;
    }

    container.innerHTML = tournaments
      .map(
        (t) => `
        <div class="surface-inset" style="padding:16px;display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
            <div>
              <strong style="font-size:1rem;">${escapeHtml(t.title)}</strong>
              <div class="meta-line" style="margin-top:4px;">
                <span>${escapeHtml(t.format)}</span>
                <span class="meta-sep">·</span>
                <span class="num">${t.counts?.confirmed || 0}/${t.maxPlayers} Filled</span>
                <span class="meta-sep">·</span>
                <span>${(t.customFields || []).length} Custom Fields</span>
              </div>
            </div>
            ${renderStatusBadge(t.status)}
          </div>

          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
            <select class="select" style="width:130px;min-height:34px;font-size:0.82rem;" data-quick-status="${escapeHtml(t.id)}">
              ${['Draft', 'Open', 'Live', 'Closed', 'Completed']
                .map((st) => `<option value="${st}" ${t.status === st ? 'selected' : ''}>${st}</option>`)
                .join('')}
            </select>
            <button type="button" class="btn btn-secondary btn-sm" data-edit-trn="${escapeHtml(t.id)}">Edit</button>
            <button type="button" class="btn btn-secondary btn-sm" data-dup-trn="${escapeHtml(t.id)}">Clone</button>
            <button type="button" class="btn btn-secondary btn-sm" data-copy-link="${escapeHtml(t.id)}">Copy Link</button>
            <button type="button" class="btn btn-danger btn-sm" data-del-trn="${escapeHtml(t.id)}">Delete</button>
          </div>
        </div>
      `
      )
      .join('');

    renderIcons(container);

    container.querySelectorAll('[data-quick-status]').forEach((sel) => {
      sel.addEventListener('change', async () => {
        try {
          await apiJson(`/api/admin/tournaments/${encodeURIComponent(sel.dataset.quickStatus)}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: sel.value })
          });
          toast('Status updated', 'success');
          await loadAdminTournaments();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });

    container.querySelectorAll('[data-edit-trn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = tournaments.find((x) => x.id === btn.dataset.editTrn);
        if (target) loadTournamentIntoBuilder(target);
      });
    });

    container.querySelectorAll('[data-dup-trn]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await apiJson(`/api/admin/tournaments/${encodeURIComponent(btn.dataset.dupTrn)}/duplicate`, {
            method: 'POST'
          });
          toast('Tournament cloned as Draft', 'success');
          await loadAdminTournaments();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });

    container.querySelectorAll('[data-copy-link]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const url = `${window.location.origin}/registration?tournament=${encodeURIComponent(btn.dataset.copyLink)}`;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(url);
          toast('Registration link copied', 'success');
        }
      });
    });

    container.querySelectorAll('[data-del-trn]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await apiJson(`/api/admin/tournaments/${encodeURIComponent(btn.dataset.delTrn)}`, {
            method: 'DELETE'
          });
          toast('Tournament removed', 'success');
          await loadAdminTournaments();
          await loadAdminRoster();
          await loadAdminMatches();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  async function loadAdminTournaments() {
    const data = await apiJson('/api/admin/tournaments');
    tournaments = data.tournaments || [];
    populateTournamentSelects();
    renderAdminEvents();
    await refreshOverview();
  }

  async function loadAdminRoster() {
    const tid = document.getElementById('rosterTournamentFilter').value;
    const status = document.getElementById('rosterStatusFilter').value;
    const search = document.getElementById('rosterSearchInput').value.trim();

    const params = new URLSearchParams();
    if (tid) params.set('tournamentId', tid);
    if (status) params.set('status', status);
    if (search) params.set('search', search);

    const data = await apiJson(`/api/admin/registrations?${params.toString()}`);
    const list = data.registrations || [];
    const tbody = document.getElementById('adminRosterBody');

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted">No matching registrations found.</td></tr>';
      return;
    }

    tbody.innerHTML = list
      .map(
        (r) => `
        <tr>
          <td class="num">${escapeHtml(r.confirmationCode)}</td>
          <td>
            <div style="font-weight:700;">${escapeHtml(r.username)}</div>
            <div class="subtle" style="font-size:0.78rem;">${escapeHtml(r.fullName || r.email || r.platform)}</div>
          </td>
          <td style="font-size:0.85rem;">${escapeHtml(r.tournamentTitle)}</td>
          <td class="right num">${r.peakElo} / ${r.currentElo}</td>
          <td>
            <input
              type="number"
              class="input num"
              style="width:72px;min-height:34px;padding:4px 8px;"
              value="${r.seed || 1}"
              data-reg-seed="${escapeHtml(r.id)}"
            />
          </td>
          <td>
            <select class="select" style="width:130px;min-height:34px;font-size:0.82rem;" data-reg-status="${escapeHtml(r.id)}">
              ${['Confirmed', 'Pending', 'Waitlisted', 'Rejected', 'Withdrawn']
                .map((st) => `<option value="${st}" ${r.status === st ? 'selected' : ''}>${st}</option>`)
                .join('')}
            </select>
          </td>
          <td class="right">
            <button type="button" class="btn btn-danger btn-sm" data-reg-del="${escapeHtml(r.id)}">Remove</button>
          </td>
        </tr>
      `
      )
      .join('');

    tbody.querySelectorAll('[data-reg-status]').forEach((sel) => {
      sel.addEventListener('change', async () => {
        try {
          await apiJson(`/api/admin/registrations/${encodeURIComponent(sel.dataset.regStatus)}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: sel.value })
          });
          toast('Player status updated', 'success');
          await refreshOverview();
          await loadAdminMatches();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });

    tbody.querySelectorAll('[data-reg-seed]').forEach((inp) => {
      inp.addEventListener('change', async () => {
        try {
          await apiJson(`/api/admin/registrations/${encodeURIComponent(inp.dataset.regSeed)}`, {
            method: 'PATCH',
            body: JSON.stringify({ seed: Number(inp.value) || 1 })
          });
          toast('Seed updated', 'success');
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });

    tbody.querySelectorAll('[data-reg-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await apiJson(`/api/admin/registrations/${encodeURIComponent(btn.dataset.regDel)}`, {
            method: 'DELETE'
          });
          toast('Registration removed', 'success');
          await loadAdminRoster();
          await loadAdminTournaments();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    });
  }

  async function loadAdminMatches() {
    const tid = document.getElementById('resultsAdminTournamentSelect').value;
    const tbody = document.getElementById('adminMatchesBody');
    const previewBody = document.getElementById('adminStandingsPreview');

    if (!tid) {
      tbody.innerHTML = '<tr><td colspan="4" class="muted">Select a tournament.</td></tr>';
      previewBody.innerHTML = '';
      return;
    }

    const data = await apiJson(`/api/admin/matches/${encodeURIComponent(tid)}`);
    const matches = data.matches || [];
    const standings = data.standings || [];

    if (matches.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="4" class="muted">No pairings yet. Use Auto-Pair Next Round or add a manual board.</td></tr>';
    } else {
      tbody.innerHTML = matches
        .slice()
        .reverse()
        .map(
          (m) => `
          <tr>
            <td class="num">R${m.round} · B${m.board || 1}</td>
            <td>
              <strong>${escapeHtml(m.whiteUsername)}</strong>
              <span class="muted">vs</span>
              <strong>${escapeHtml(m.blackUsername || 'BYE')}</strong>
              ${m.pgnNote ? `<div class="subtle" style="font-size:0.76rem;">${escapeHtml(m.pgnNote)}</div>` : ''}
            </td>
            <td class="num" style="font-weight:700;color:var(--accent-lime-text);">${escapeHtml(m.outcome)}</td>
            <td class="right">
              <div style="display:inline-flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;">
                <button type="button" class="btn btn-secondary btn-sm" data-score="${escapeHtml(m.id)}:1-0">1-0</button>
                <button type="button" class="btn btn-secondary btn-sm" data-score="${escapeHtml(m.id)}:0.5-0.5">0.5</button>
                <button type="button" class="btn btn-secondary btn-sm" data-score="${escapeHtml(m.id)}:0-1">0-1</button>
                <button type="button" class="btn btn-danger btn-sm" data-del-match="${escapeHtml(m.id)}">Del</button>
              </div>
            </td>
          </tr>
        `
        )
        .join('');

      tbody.querySelectorAll('[data-score]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const [matchId, outcome] = btn.dataset.score.split(':');
          const match = matches.find((x) => x.id === matchId);
          if (!match) return;
          try {
            await apiJson('/api/admin/matches', {
              method: 'POST',
              body: JSON.stringify({ ...match, outcome })
            });
            toast(`Result saved (${outcome})`, 'success');
            await loadAdminMatches();
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      });

      tbody.querySelectorAll('[data-del-match]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            await apiJson(`/api/admin/matches/${encodeURIComponent(btn.dataset.delMatch)}`, {
              method: 'DELETE'
            });
            toast('Match removed', 'success');
            await loadAdminMatches();
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      });
    }

    if (standings.length === 0) {
      previewBody.innerHTML = '<tr><td colspan="4" class="muted">No ranked players yet.</td></tr>';
    } else {
      previewBody.innerHTML = standings
        .map(
          (s) => `
          <tr>
            <td class="num">#${s.rank}</td>
            <td style="font-weight:600;">${escapeHtml(s.username)}</td>
            <td class="right num" style="color:var(--accent-lime-text);font-weight:700;">${s.points}</td>
            <td class="right num">${s.buchholz}</td>
          </tr>
        `
        )
        .join('');
    }
  }

  // ADMIN-ONLY PRIVATE FREE WHEEL ENGINE
  function drawWheel() {
    const canvas = document.getElementById('adminWheelCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const radius = cx - 10;

    ctx.clearRect(0, 0, size, size);

    if (wheelSlices.length === 0) {
      ctx.fillStyle = '#141923';
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 15px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Add at least 2 segments', cx, cy);
      return;
    }

    const totalWeight = wheelSlices.reduce((sum, s) => sum + (Number(s.weight) || 1), 0);
    let startAngle = wheelAngle - Math.PI / 2;

    for (let i = 0; i < wheelSlices.length; i += 1) {
      const slice = wheelSlices[i];
      const arc = ((Number(slice.weight) || 1) / totalWeight) * Math.PI * 2;
      const endAngle = startAngle + arc;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = slice.color || WHEEL_COLORS[i % WHEEL_COLORS.length];
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#090b10';
      ctx.stroke();

      // Label
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(startAngle + arc / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#090b10';
      ctx.font = '700 13px Plus Jakarta Sans, sans-serif';
      const labelText = slice.label.length > 20 ? `${slice.label.slice(0, 18)}..` : slice.label;
      ctx.fillText(labelText, radius - 18, 5);
      ctx.restore();

      startAngle = endAngle;
    }

    // Center Hub
    ctx.beginPath();
    ctx.arc(cx, cy, 24, 0, Math.PI * 2);
    ctx.fillStyle = '#090b10';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#c4f536';
    ctx.stroke();
  }

  function renderWheelSlicesList() {
    const list = document.getElementById('wheelSlicesList');
    document.getElementById('sliceCountLabel').textContent = `${wheelSlices.length} segments`;
    if (wheelSlices.length === 0) {
      list.innerHTML = '<p class="muted" style="margin:0;font-size:0.85rem;">No wheel slices.</p>';
      drawWheel();
      return;
    }

    list.innerHTML = wheelSlices
      .map(
        (s, idx) => `
        <div class="surface-inset" style="padding:8px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <div style="display:flex;align-items:center;gap:8px;min-width:0;">
            <span style="width:12px;height:12px;border-radius:3px;border:1px solid #000;background:${escapeHtml(s.color)};flex-shrink:0;"></span>
            <span style="font-size:0.88rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(s.label)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
            <span class="num muted" style="font-size:0.78rem;">w:${s.weight}</span>
            <button type="button" class="btn btn-danger btn-sm" style="min-height:28px;padding:3px 8px;" data-del-slice="${idx}">
              <i data-lucide="x" style="width:13px;height:13px;"></i>
            </button>
          </div>
        </div>
      `
      )
      .join('');

    renderIcons(list);
    list.querySelectorAll('[data-del-slice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        wheelSlices.splice(Number(btn.dataset.delSlice), 1);
        renderWheelSlicesList();
      });
    });
    drawWheel();
  }

  async function loadWheelHistory() {
    const list = document.getElementById('wheelHistoryList');
    try {
      const data = await apiJson('/api/admin/wheel/history');
      const spins = data.spins || [];
      if (spins.length === 0) {
        list.innerHTML = '<p class="muted" style="margin:0;font-size:0.85rem;">No private spins logged yet.</p>';
        return;
      }
      list.innerHTML = spins
        .map(
          (sp) => `
          <div class="surface-inset" style="padding:10px 12px;font-size:0.84rem;">
            <div style="display:flex;justify-content:space-between;gap:8px;">
              <strong style="color:var(--accent-lime-text);">${escapeHtml(sp.winnerLabel)}</strong>
              <span class="num muted">${formatDate(sp.spunAt)}</span>
            </div>
            <div class="subtle">${escapeHtml(sp.mode)} · ${sp.segmentCount} slices</div>
          </div>
        `
        )
        .join('');
    } catch (err) {
      list.innerHTML = `<p style="color:var(--error-text);">${escapeHtml(err.message)}</p>`;
    }
  }

  async function triggerAdminWheelSpin() {
    if (isSpinning) return;
    if (wheelSlices.length < 2) {
      toast('Add at least 2 segments before spinning', 'error');
      return;
    }

    isSpinning = true;
    const spinBtn = document.getElementById('spinWheelBtn');
    spinBtn.disabled = true;

    try {
      const tid = document.getElementById('wheelTournamentSelect').value || 'custom_draw';
      const res = await apiJson('/api/admin/wheel/spin', {
        method: 'POST',
        body: JSON.stringify({
          tournamentId: tid,
          mode: 'Admin Private Draw',
          slices: wheelSlices
        })
      });

      const winnerIdx = res.winnerIndex;
      const totalWeight = wheelSlices.reduce((sum, s) => sum + (Number(s.weight) || 1), 0);
      let accum = 0;
      for (let i = 0; i < winnerIdx; i += 1) {
        accum += Number(wheelSlices[i].weight) || 1;
      }
      const winnerWeight = Number(wheelSlices[winnerIdx].weight) || 1;
      const sliceCenterFraction = (accum + winnerWeight / 2) / totalWeight;
      // Target angle so sliceCenterFraction lands at top pointer (-PI/2, where startAngle begins at wheelAngle - PI/2)
      const targetMod = (1 - sliceCenterFraction) * Math.PI * 2;
      const currentMod = ((wheelAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const delta = (targetMod - currentMod + Math.PI * 2) % (Math.PI * 2);
      const extraSpins = 6 * Math.PI * 2;
      const startAngle = wheelAngle;
      const finalDelta = extraSpins + delta;
      const duration = 3400;
      const startTime = performance.now();

      await new Promise((resolve) => {
        function frame(now) {
          const elapsed = now - startTime;
          const t = Math.min(1, elapsed / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          wheelAngle = startAngle + finalDelta * eased;
          drawWheel();
          if (t < 1) {
            requestAnimationFrame(frame);
          } else {
            resolve();
          }
        }
        requestAnimationFrame(frame);
      });

      document.getElementById('wheelWinnerBanner').style.display = 'block';
      document.getElementById('wheelWinnerLabel').textContent = res.winner.label;
      document.getElementById('wheelWinnerTime').textContent = new Date().toLocaleTimeString();
      toast(`Wheel selected: ${res.winner.label}`, 'success');

      if (document.getElementById('wheelRemoveWinner').checked) {
        wheelSlices.splice(winnerIdx, 1);
        renderWheelSlicesList();
      }

      await loadWheelHistory();
      await refreshOverview();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      isSpinning = false;
      spinBtn.disabled = false;
    }
  }

  function showLoginGate() {
    document.getElementById('adminLoginGate').style.display = 'block';
    document.getElementById('adminWorkspace').style.display = 'none';
    document.getElementById('adminLogoutBtn').style.display = 'none';
    document.getElementById('adminPublicCta').style.display = 'inline-flex';
  }

  async function enterWorkspace() {
    document.getElementById('adminLoginGate').style.display = 'none';
    document.getElementById('adminWorkspace').style.display = 'block';
    document.getElementById('adminLogoutBtn').style.display = 'inline-flex';
    document.getElementById('adminPublicCta').style.display = 'none';

    renderCustomFieldsEditor();
    renderWheelSlicesList();
    try {
      await loadAdminTournaments();
      await loadAdminRoster();
      await loadAdminMatches();
    } catch (err) {
      toast(err.message, 'error');
      if (/unauthorized/i.test(err.message)) {
        ArenaUI.setAdminToken(null);
        showLoginGate();
      }
    }
  }

  async function checkSession() {
    try {
      const data = await apiJson('/api/admin/session');
      if (data.authenticated) {
        await enterWorkspace();
      } else {
        showLoginGate();
        if (data.usingPreviewDefaults) {
          document.getElementById('loginPreviewHint').style.display = 'block';
        }
      }
    } catch (err) {
      toast(err.message, 'error');
      showLoginGate();
    }
  }

  // Event Bindings
  document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('loginError');
    errEl.style.display = 'none';
    try {
      const res = await apiJson('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({
          username: document.getElementById('loginUser').value.trim(),
          password: document.getElementById('loginPass').value
        })
      });
      if (res.token) {
        ArenaUI.setAdminToken(res.token);
      }
      toast('Authenticated as Organizer', 'success');
      await enterWorkspace();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    }
  });

  document.getElementById('adminLogoutBtn').addEventListener('click', async () => {
    try {
      await apiJson('/api/admin/logout', { method: 'POST' });
    } catch {
      // Ignore logout network error
    }
    ArenaUI.setAdminToken(null);
    showLoginGate();
    toast('Signed out of Organizer Console', 'info');
  });

  document.querySelectorAll('[data-admin-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.adminTab));
  });

  document.getElementById('addCustomFieldBtn').addEventListener('click', () => {
    customFieldsDraft.push({
      id: `cf_${Date.now()}`,
      label: 'New Custom Field',
      type: 'text',
      required: false,
      placeholder: '',
      options: []
    });
    renderCustomFieldsEditor();
  });

  document.getElementById('resetBuilderBtn').addEventListener('click', resetTournamentBuilder);
  document.getElementById('refreshEventsBtn').addEventListener('click', async () => {
    try {
      await loadAdminTournaments();
      toast('Events refreshed', 'info');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('tournamentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('trnId').value;
    const payload = {
      title: document.getElementById('trnTitle').value.trim(),
      subtitle: document.getElementById('trnSubtitle').value.trim(),
      description: document.getElementById('trnDescription').value.trim(),
      format: document.getElementById('trnFormat').value,
      rounds: Number(document.getElementById('trnRounds').value) || 5,
      timeControl: document.getElementById('trnTimeControl').value.trim(),
      platform: document.getElementById('trnPlatform').value,
      venue: document.getElementById('trnVenue').value.trim(),
      status: document.getElementById('trnStatus').value,
      minElo: Number(document.getElementById('trnMinElo').value) || 100,
      maxElo: Number(document.getElementById('trnMaxElo').value) || 3500,
      eloRequirementType: document.getElementById('trnEloType').value,
      maxPlayers: Number(document.getElementById('trnMaxPlayers').value) || 64,
      entryFee: document.getElementById('trnEntryFee').value.trim(),
      prizePool: document.getElementById('trnPrizePool').value.trim(),
      startDate: document.getElementById('trnStartDate').value
        ? new Date(document.getElementById('trnStartDate').value).toISOString()
        : new Date().toISOString(),
      registrationOpenAt: document.getElementById('trnOpenAt').value
        ? new Date(document.getElementById('trnOpenAt').value).toISOString()
        : '',
      registrationCloseAt: document.getElementById('trnCloseAt').value
        ? new Date(document.getElementById('trnCloseAt').value).toISOString()
        : '',
      autoApprove: document.getElementById('trnAutoApprove').checked,
      allowWaitlist: document.getElementById('trnAllowWaitlist').checked,
      requireRealName: document.getElementById('trnReqName').checked,
      requireEmail: document.getElementById('trnReqEmail').checked,
      requireCountry: document.getElementById('trnReqCountry').checked,
      requireFideId: document.getElementById('trnReqFide').checked,
      rulesText: document.getElementById('trnRules').value.trim(),
      customFields: customFieldsDraft
    };

    try {
      if (id) {
        await apiJson(`/api/admin/tournaments/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        toast('Tournament updated', 'success');
      } else {
        await apiJson('/api/admin/tournaments', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        toast('Tournament created & published', 'success');
      }
      resetTournamentBuilder();
      await loadAdminTournaments();
      await loadAdminMatches();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('rosterTournamentFilter').addEventListener('change', () => {
    loadAdminRoster().catch((err) => toast(err.message, 'error'));
  });
  document.getElementById('rosterStatusFilter').addEventListener('change', () => {
    loadAdminRoster().catch((err) => toast(err.message, 'error'));
  });
  document.getElementById('rosterSearchInput').addEventListener('input', () => {
    loadAdminRoster().catch((err) => toast(err.message, 'error'));
  });

  document.getElementById('exportCsvBtn').addEventListener('click', async () => {
    const tid =
      document.getElementById('rosterTournamentFilter').value || (tournaments[0] && tournaments[0].id);
    if (!tid) {
      toast('Select a tournament to export CSV', 'error');
      return;
    }
    try {
      const token = ArenaUI.getAdminToken();
      const res = await fetch(`/api/admin/registrations/${encodeURIComponent(tid)}/export`, {
        credentials: 'same-origin',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Unable to export CSV');
      }
      const csvText = await res.text();
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `roster-${tid}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast('CSV exported', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('resultsAdminTournamentSelect').addEventListener('change', () => {
    loadAdminMatches().catch((err) => toast(err.message, 'error'));
  });

  document.getElementById('autoPairBtn').addEventListener('click', async () => {
    const tid = document.getElementById('resultsAdminTournamentSelect').value;
    if (!tid) return;
    try {
      const res = await apiJson(`/api/admin/matches/${encodeURIComponent(tid)}/auto-pair`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      toast(`Round ${res.round} pairings generated`, 'success');
      await loadAdminMatches();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('recalcStandingsBtn').addEventListener('click', async () => {
    const tid = document.getElementById('resultsAdminTournamentSelect').value;
    if (!tid) return;
    try {
      await apiJson(`/api/admin/standings/${encodeURIComponent(tid)}/recalculate`, { method: 'PUT' });
      toast('Standings & Buchholz recalculated', 'success');
      await loadAdminMatches();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('manualMatchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tid = document.getElementById('resultsAdminTournamentSelect').value;
    if (!tid) return;
    try {
      await apiJson('/api/admin/matches', {
        method: 'POST',
        body: JSON.stringify({
          tournamentId: tid,
          round: Number(document.getElementById('matchRound').value) || 1,
          board: Number(document.getElementById('matchBoard').value) || 1,
          whiteUsername: document.getElementById('matchWhite').value.trim(),
          blackUsername: document.getElementById('matchBlack').value.trim() || 'BYE',
          outcome: document.getElementById('matchOutcome').value,
          pgnNote: document.getElementById('matchNote').value.trim()
        })
      });
      toast('Match recorded & standings updated', 'success');
      document.getElementById('matchWhite').value = '';
      document.getElementById('matchBlack').value = '';
      document.getElementById('matchNote').value = '';
      await loadAdminMatches();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  // Wheel Controls
  document.getElementById('spinWheelBtn').addEventListener('click', triggerAdminWheelSpin);

  document.getElementById('addSliceForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const label = document.getElementById('newSliceLabel').value.trim();
    const weight = Math.max(1, Math.min(100, Number(document.getElementById('newSliceWeight').value) || 1));
    if (!label) return;
    wheelSlices.push({
      id: `sl_${Date.now()}`,
      label,
      weight,
      color: WHEEL_COLORS[wheelSlices.length % WHEEL_COLORS.length]
    });
    document.getElementById('newSliceLabel').value = '';
    document.getElementById('newSliceWeight').value = 1;
    renderWheelSlicesList();
  });

  document.getElementById('shuffleSlicesBtn').addEventListener('click', () => {
    for (let i = wheelSlices.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [wheelSlices[i], wheelSlices[j]] = [wheelSlices[j], wheelSlices[i]];
    }
    renderWheelSlicesList();
  });

  document.getElementById('loadWheelPlayersBtn').addEventListener('click', async () => {
    const tid = document.getElementById('wheelTournamentSelect').value;
    if (!tid) return;
    try {
      const data = await apiJson(`/api/admin/registrations?tournamentId=${encodeURIComponent(tid)}&status=Confirmed`);
      const regs = data.registrations || [];
      if (regs.length < 2) {
        toast('Need at least 2 confirmed players in selected event', 'error');
        return;
      }
      wheelSlices = regs.map((r, idx) => ({
        id: r.id,
        label: r.username,
        weight: 1,
        color: WHEEL_COLORS[idx % WHEEL_COLORS.length]
      }));
      renderWheelSlicesList();
      toast(`Loaded ${regs.length} confirmed players onto wheel`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('loadWheelPrizesBtn').addEventListener('click', () => {
    wheelSlices = [
      { id: 'p1', label: 'White Pieces Priority', weight: 1, color: '#c4f536' },
      { id: 'p2', label: 'Wildcard Seed #1', weight: 1, color: '#38bdf8' },
      { id: 'p3', label: 'Bye Advantage Rd 1', weight: 1, color: '#a855f7' },
      { id: 'p4', label: 'Bonus Bounty +$100', weight: 1, color: '#f59e0b' },
      { id: 'p5', label: 'Feature Stream Board', weight: 1, color: '#22c55e' },
      { id: 'p6', label: 'Free Next Entry Pass', weight: 1, color: '#fb7185' }
    ];
    renderWheelSlicesList();
    toast('Loaded prize preset slices', 'info');
  });

  document.getElementById('clearWheelHistoryBtn').addEventListener('click', async () => {
    try {
      await apiJson('/api/admin/wheel/history', { method: 'DELETE' });
      await loadWheelHistory();
      await refreshOverview();
      toast('Draw history cleared', 'info');
    } catch (err) {
      toast(err.message, 'error');
      if (/unauthorized/i.test(err.message)) {
        showLoginGate();
      }
    }
  });

  // DATABASE MANAGEMENT
  function applyDatabaseSummary(data) {
    const counts = data.counts || {};
    const status = data.dbStatus || {};
    document.getElementById('dbCountTournaments').textContent = String(counts.tournaments || 0);
    document.getElementById('dbCountRegistrations').textContent = String(counts.registrations || 0);
    document.getElementById('dbCountMatches').textContent = String(counts.matches || 0);
    document.getElementById('dbCountStandings').textContent = String(counts.standings || 0);
    document.getElementById('dbCountWheel').textContent = `${counts.wheelSpins || 0} wheel logs`;

    const badgeEl = document.getElementById('dbTabModeBadge');
    const textEl = document.getElementById('dbTabStatusText');
    if (status.mode === 'mongodb' && status.connected) {
      badgeEl.innerHTML = renderStatusBadge('Open').replace('Open', 'MongoDB');
      textEl.textContent = 'Connected to MONGODB_URI cluster';
    } else if (status.mode === 'local-preview') {
      badgeEl.innerHTML = renderStatusBadge('Waitlisted').replace('Waitlisted', 'Local Preview');
      textEl.textContent = 'Using local JSON fallback (.data/chess-arena-db.json)';
    } else {
      badgeEl.innerHTML = renderStatusBadge('Closed').replace('Closed', 'Error');
      textEl.textContent = status.error || 'Database connection warning';
    }
  }

  async function loadDatabaseSummary() {
    try {
      const data = await apiJson('/api/admin/database/summary');
      applyDatabaseSummary(data);
    } catch (err) {
      if (/unauthorized/i.test(err.message)) {
        ArenaUI.setAdminToken(null);
        showLoginGate();
      }
      throw err;
    }
  }

  document.getElementById('refreshDbBtn').addEventListener('click', async () => {
    try {
      await loadDatabaseSummary();
      toast('Database counts refreshed', 'info');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('exportDbBtn').addEventListener('click', async () => {
    try {
      const token = ArenaUI.getAdminToken();
      const res = await fetch('/api/admin/database/export', {
        credentials: 'same-origin',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Unable to export backup');
      }
      const jsonText = await res.text();
      const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `grandmaster-arena-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast('JSON backup downloaded', 'success');
    } catch (err) {
      toast(err.message, 'error');
      if (/unauthorized/i.test(err.message)) {
        ArenaUI.setAdminToken(null);
        showLoginGate();
      }
    }
  });

  document.getElementById('importBackupFile').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    const previewEl = document.getElementById('importPreviewText');
    const restoreBtn = document.getElementById('restoreDbBtn');
    pendingBackupSnapshot = null;
    restoreBtn.disabled = true;

    if (!file) {
      previewEl.style.display = 'none';
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const cols = parsed && parsed.collections;
      if (
        !cols ||
        !Array.isArray(cols.tournaments) ||
        !Array.isArray(cols.registrations) ||
        !Array.isArray(cols.matches)
      ) {
        throw new Error('Invalid snapshot structure');
      }
      pendingBackupSnapshot = parsed;
      previewEl.textContent = `Ready: ${cols.tournaments.length} tournaments, ${cols.registrations.length} registrations, ${cols.matches.length} matches`;
      previewEl.style.display = 'block';
      restoreBtn.disabled = false;
    } catch (err) {
      previewEl.textContent = `Error: ${err.message}`;
      previewEl.style.display = 'block';
      toast('Invalid JSON backup file', 'error');
    }
  });

  document.getElementById('restoreDbBtn').addEventListener('click', async () => {
    if (!pendingBackupSnapshot) return;
    const restoreBtn = document.getElementById('restoreDbBtn');
    restoreBtn.disabled = true;
    try {
      const data = await apiJson('/api/admin/database/import', {
        method: 'POST',
        body: JSON.stringify(pendingBackupSnapshot)
      });
      applyDatabaseSummary(data);
      pendingBackupSnapshot = null;
      document.getElementById('importBackupFile').value = '';
      document.getElementById('importPreviewText').style.display = 'none';
      await loadAdminTournaments();
      await loadAdminRoster();
      await loadAdminMatches();
      await loadWheelHistory();
      toast('Backup snapshot restored', 'success');
    } catch (err) {
      restoreBtn.disabled = false;
      toast(err.message, 'error');
      if (/unauthorized/i.test(err.message)) {
        ArenaUI.setAdminToken(null);
        showLoginGate();
      }
    }
  });

  document.querySelectorAll('[data-purge-scope]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pendingPurgeScope = btn.dataset.purgeScope;
      document.getElementById('dbPurgeConfirmMsg').textContent =
        PURGE_MESSAGES[pendingPurgeScope] || 'Confirm database purge?';
      document.getElementById('dbPurgeConfirmBox').style.display = 'block';
    });
  });

  document.getElementById('cancelPurgeBtn').addEventListener('click', () => {
    pendingPurgeScope = null;
    document.getElementById('dbPurgeConfirmBox').style.display = 'none';
  });

  document.getElementById('confirmPurgeBtn').addEventListener('click', async () => {
    if (!pendingPurgeScope) return;
    const confirmBtn = document.getElementById('confirmPurgeBtn');
    confirmBtn.disabled = true;
    try {
      const data = await apiJson('/api/admin/database/purge', {
        method: 'POST',
        body: JSON.stringify({ scope: pendingPurgeScope, confirm: true })
      });
      applyDatabaseSummary(data);
      document.getElementById('dbPurgeConfirmBox').style.display = 'none';
      pendingPurgeScope = null;
      await loadAdminTournaments();
      await loadAdminRoster();
      await loadAdminMatches();
      await loadWheelHistory();
      toast('Database purge completed', 'success');
    } catch (err) {
      toast(err.message, 'error');
      if (/unauthorized/i.test(err.message)) {
        ArenaUI.setAdminToken(null);
        showLoginGate();
      }
    } finally {
      confirmBtn.disabled = false;
    }
  });

  document.addEventListener('DOMContentLoaded', checkSession);
})();
