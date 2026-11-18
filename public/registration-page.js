(function () {
  const { escapeHtml, renderIcons, formatDate, renderStatusBadge, toast, apiJson } = ArenaUI;

  let tournaments = [];
  let selectedTournament = null;

  function renderTournamentBrief(t) {
    const brief = document.getElementById('tournamentBrief');
    if (!t) {
      brief.style.display = 'none';
      return;
    }
    brief.style.display = 'block';
    document.getElementById('briefTitle').textContent = t.title;
    document.getElementById('briefStatus').innerHTML = renderStatusBadge(t.status);
    document.getElementById('briefMeta').innerHTML = `
      <span>${escapeHtml(t.format)}</span>
      <span class="meta-sep">·</span>
      <span>${escapeHtml(t.timeControl)}</span>
      <span class="meta-sep">·</span>
      <span class="num">${t.slotsUsed} / ${t.maxPlayers} Filled</span>
      <span class="meta-sep">·</span>
      <span class="num">Elo ${t.minElo}–${t.maxElo} (${escapeHtml(t.eloRequirementType || 'peak')})</span>
      <span class="meta-sep">·</span>
      <span>Starts ${formatDate(t.startDate)}</span>
      <span class="meta-sep">·</span>
      <span>${escapeHtml(t.entryFee)}</span>
    `;
    document.getElementById('briefRules').textContent =
      t.rulesText || t.description || 'Standard tournament rules apply.';
    document.getElementById('eloRangeHint').textContent =
      `Bracket requirement (${t.eloRequirementType || 'peak'} Elo): ${t.minElo}–${t.maxElo}`;
    document.getElementById('regPlatform').value = t.platform || 'Chess.com';

    const submitBtn = document.getElementById('submitRegBtn');
    const isOpen = t.status === 'Open';
    submitBtn.disabled = !isOpen;
    submitBtn.innerHTML = isOpen
      ? `<i data-lucide="send" style="width:16px;height:16px;"></i><span>Submit Registration</span>`
      : `<i data-lucide="lock" style="width:16px;height:16px;"></i><span>Registration ${escapeHtml(t.status)}</span>`;

    renderIcons(brief);
    renderIcons(submitBtn);
  }

  function renderDynamicFields(t) {
    const identityWrap = document.getElementById('conditionalIdentityFields');
    const customWrap = document.getElementById('dynamicCustomFields');

    const identityParts = [];
    if (t.requireRealName) {
      identityParts.push(`
        <div class="field-group">
          <label for="regFullName" class="field-label">
            <span>Full Name</span>
            <span class="field-req">Required</span>
          </label>
          <input id="regFullName" name="fullName" type="text" class="input" required placeholder="Your full name" />
        </div>
      `);
    } else {
      identityParts.push(`
        <div class="field-group">
          <label for="regFullName" class="field-label">
            <span>Full Name</span>
            <span class="field-help">Optional</span>
          </label>
          <input id="regFullName" name="fullName" type="text" class="input" placeholder="Your full name" />
        </div>
      `);
    }

    if (t.requireEmail) {
      identityParts.push(`
        <div class="field-group">
          <label for="regEmail" class="field-label">
            <span>Email Address</span>
            <span class="field-req">Required</span>
          </label>
          <input id="regEmail" name="email" type="email" class="input" required placeholder="player@example.com" />
        </div>
      `);
    } else {
      identityParts.push(`
        <div class="field-group">
          <label for="regEmail" class="field-label">
            <span>Email Address</span>
            <span class="field-help">Optional</span>
          </label>
          <input id="regEmail" name="email" type="email" class="input" placeholder="player@example.com" />
        </div>
      `);
    }

    if (t.requireCountry) {
      identityParts.push(`
        <div class="field-group">
          <label for="regCountry" class="field-label">
            <span>Country / Federation</span>
            <span class="field-req">Required</span>
          </label>
          <input id="regCountry" name="country" type="text" class="input" required placeholder="e.g. United States" />
        </div>
      `);
    }

    if (t.requireFideId) {
      identityParts.push(`
        <div class="field-group">
          <label for="regFideId" class="field-label">
            <span>FIDE / National ID</span>
            <span class="field-req">Required</span>
          </label>
          <input id="regFideId" name="fideId" type="text" class="input num" required placeholder="e.g. 1503014" />
        </div>
      `);
    }

    identityWrap.innerHTML = identityParts.join('');

    const fields = t.customFields || [];
    if (fields.length === 0) {
      customWrap.innerHTML = '';
      return;
    }

    customWrap.innerHTML = fields
      .map((f) => {
        const reqBadge = f.required
          ? '<span class="field-req">Required</span>'
          : '<span class="field-help">Optional</span>';
        const reqAttr = f.required ? 'required' : '';
        const inputId = `custom_${escapeHtml(f.id)}`;

        if (f.type === 'checkbox') {
          return `
            <label class="checkbox-row" for="${inputId}">
              <input id="${inputId}" data-custom-id="${escapeHtml(f.id)}" type="checkbox" ${reqAttr} />
              <div style="display:flex;flex-direction:column;gap:2px;">
                <span style="font-size:0.9rem;font-weight:600;">${escapeHtml(f.label)} ${f.required ? '*' : ''}</span>
                ${f.placeholder ? `<span class="field-help">${escapeHtml(f.placeholder)}</span>` : ''}
              </div>
            </label>
          `;
        }

        if (f.type === 'select') {
          const opts = (f.options || [])
            .map((opt) => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`)
            .join('');
          return `
            <div class="field-group">
              <label for="${inputId}" class="field-label">
                <span>${escapeHtml(f.label)}</span>
                ${reqBadge}
              </label>
              <select id="${inputId}" data-custom-id="${escapeHtml(f.id)}" class="select" ${reqAttr}>
                <option value="">${escapeHtml(f.placeholder || 'Select an option')}</option>
                ${opts}
              </select>
              ${f.helpText ? `<span class="field-help">${escapeHtml(f.helpText)}</span>` : ''}
            </div>
          `;
        }

        if (f.type === 'textarea') {
          return `
            <div class="field-group">
              <label for="${inputId}" class="field-label">
                <span>${escapeHtml(f.label)}</span>
                ${reqBadge}
              </label>
              <textarea id="${inputId}" data-custom-id="${escapeHtml(f.id)}" class="textarea" placeholder="${escapeHtml(f.placeholder)}" ${reqAttr}></textarea>
              ${f.helpText ? `<span class="field-help">${escapeHtml(f.helpText)}</span>` : ''}
            </div>
          `;
        }

        const inputType = f.type === 'number' ? 'number' : f.type === 'url' ? 'url' : 'text';
        return `
          <div class="field-group">
            <label for="${inputId}" class="field-label">
              <span>${escapeHtml(f.label)}</span>
              ${reqBadge}
            </label>
            <input
              id="${inputId}"
              data-custom-id="${escapeHtml(f.id)}"
              type="${inputType}"
              class="input ${f.type === 'number' ? 'num' : ''}"
              placeholder="${escapeHtml(f.placeholder)}"
              ${reqAttr}
            />
            ${f.helpText ? `<span class="field-help">${escapeHtml(f.helpText)}</span>` : ''}
          </div>
        `;
      })
      .join('');
  }

  async function loadTournamentDetail(id) {
    const tbody = document.getElementById('publicRosterBody');
    const countLabel = document.getElementById('rosterCount');
    if (!id) {
      renderTournamentBrief(null);
      tbody.innerHTML = '<tr><td colspan="3" class="muted">No tournament selected.</td></tr>';
      return;
    }

    try {
      const data = await apiJson(`/api/registration/tournaments/${encodeURIComponent(id)}`);
      selectedTournament = data.tournament;
      renderTournamentBrief(selectedTournament);
      renderDynamicFields(selectedTournament);

      const list = data.participants || [];
      countLabel.textContent = `${list.length} ${list.length === 1 ? 'player' : 'players'}`;
      if (list.length === 0) {
        tbody.innerHTML =
          '<tr><td colspan="3" class="muted">No confirmed players yet. Be the first to register.</td></tr>';
      } else {
        tbody.innerHTML = list
          .map(
            (p) => `
            <tr>
              <td class="num">#${p.seed}</td>
              <td>
                <div style="font-weight:600;">${escapeHtml(p.username)}</div>
                <div class="subtle" style="font-size:0.78rem;">${escapeHtml(p.platform)}${p.country ? ` · ${escapeHtml(p.country)}` : ''}</div>
              </td>
              <td class="right num">${p.peakElo}</td>
            </tr>
          `
          )
          .join('');
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function initPage() {
    const select = document.getElementById('tournamentSelect');
    try {
      const data = await apiJson('/api/registration/tournaments');
      tournaments = data.tournaments || [];
      if (tournaments.length === 0) {
        select.innerHTML = '<option value="">No tournaments available</option>';
        return;
      }

      select.innerHTML = tournaments
        .map(
          (t) =>
            `<option value="${escapeHtml(t.id)}">${escapeHtml(t.title)} — ${escapeHtml(t.status)} (${t.slotsUsed}/${t.maxPlayers})</option>`
        )
        .join('');

      const params = new URLSearchParams(window.location.search);
      const requestedId = params.get('tournament');
      const initial =
        tournaments.find((t) => t.id === requestedId) ||
        tournaments.find((t) => t.status === 'Open') ||
        tournaments[0];

      if (initial) {
        select.value = initial.id;
        await loadTournamentDetail(initial.id);
      }
    } catch (err) {
      select.innerHTML = '<option value="">Unable to load tournaments</option>';
      toast(err.message, 'error');
    }

    select.addEventListener('change', () => {
      document.getElementById('receiptBox').style.display = 'none';
      document.getElementById('formErrorBanner').style.display = 'none';
      loadTournamentDetail(select.value);
    });
  }

  document.getElementById('registrationForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('formErrorBanner');
    errBox.style.display = 'none';
    if (!selectedTournament) return;

    const btn = document.getElementById('submitRegBtn');
    btn.disabled = true;

    const customResponses = {};
    document.querySelectorAll('[data-custom-id]').forEach((el) => {
      const fid = el.getAttribute('data-custom-id');
      customResponses[fid] = el.type === 'checkbox' ? el.checked : el.value;
    });

    const payload = {
      tournamentId: selectedTournament.id,
      username: document.getElementById('regUsername').value.trim(),
      platform: document.getElementById('regPlatform').value,
      peakElo: Number(document.getElementById('regPeakElo').value),
      currentElo: document.getElementById('regCurrentElo').value
        ? Number(document.getElementById('regCurrentElo').value)
        : undefined,
      fullName: document.getElementById('regFullName')?.value.trim() || '',
      email: document.getElementById('regEmail')?.value.trim() || '',
      country: document.getElementById('regCountry')?.value.trim() || '',
      fideId: document.getElementById('regFideId')?.value.trim() || '',
      customResponses
    };

    try {
      const data = await apiJson('/api/registration/submit', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const reg = data.registration;
      const receiptBox = document.getElementById('receiptBox');
      receiptBox.style.display = 'block';
      document.getElementById('receiptCode').textContent = reg.confirmationCode;
      document.getElementById('receiptStatus').innerHTML = renderStatusBadge(reg.status);
      document.getElementById('receiptSummary').textContent =
        `${reg.username} (Peak Elo ${reg.peakElo}) entered into ${reg.tournamentTitle} at Seed #${reg.seed}.`;
      renderIcons(receiptBox);

      toast('Registration submitted successfully', 'success');
      e.target.reset();
      await loadTournamentDetail(selectedTournament.id);
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('copyCodeBtn').addEventListener('click', () => {
    const code = document.getElementById('receiptCode').textContent;
    if (code && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      toast('Confirmation code copied', 'success');
    }
  });

  document.getElementById('lookupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = document.getElementById('lookupQuery').value.trim();
    const out = document.getElementById('lookupResult');
    if (!q) return;

    const isCode = q.toUpperCase().startsWith('GMA-');
    const qs = isCode
      ? `code=${encodeURIComponent(q)}`
      : `username=${encodeURIComponent(q)}${selectedTournament ? `&tournamentId=${encodeURIComponent(selectedTournament.id)}` : ''}`;

    try {
      const data = await apiJson(`/api/registration/lookup?${qs}`);
      const entry = data.entry;
      out.innerHTML = `
        <div class="surface-inset" style="padding:14px;display:flex;flex-direction:column;gap:6px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <strong>${escapeHtml(entry.username)}</strong>
            ${renderStatusBadge(entry.status)}
          </div>
          <div class="meta-line">
            <span class="num">${escapeHtml(entry.confirmationCode)}</span>
            <span class="meta-sep">·</span>
            <span>Seed #${entry.seed}</span>
            <span class="meta-sep">·</span>
            <span class="num">Elo ${entry.peakElo}</span>
          </div>
          <span class="subtle">${escapeHtml(entry.tournamentTitle)}</span>
        </div>
      `;
      renderIcons(out);
    } catch (err) {
      out.innerHTML = `<p style="margin:0;color:var(--error-text);">${escapeHtml(err.message)}</p>`;
    }
  });

  document.addEventListener('DOMContentLoaded', initPage);
})();
