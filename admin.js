const express = require('express');
const crypto = require('node:crypto');
const db = require('./lib/db');
const {
  getConfiguredCredentials,
  verifyCredentials,
  createSessionToken,
  getSessionFromRequest,
  setSessionCookie,
  clearSessionCookie,
  requireAdmin
} = require('./lib/auth');

const router = express.Router();

function sanitizeCustomFields(rawFields) {
  if (!Array.isArray(rawFields)) return [];
  const allowedTypes = new Set(['text', 'number', 'select', 'textarea', 'checkbox', 'url']);
  return rawFields
    .filter((f) => f && typeof f.label === 'string' && f.label.trim().length > 0)
    .map((f, index) => {
      const type = allowedTypes.has(f.type) ? f.type : 'text';
      const options = Array.isArray(f.options)
        ? f.options.map((o) => String(o).trim()).filter(Boolean)
        : typeof f.options === 'string'
        ? f.options
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean)
        : [];
      return {
        id:
          typeof f.id === 'string' && f.id.trim()
            ? f.id.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
            : `cf_${index + 1}_${crypto.randomBytes(2).toString('hex')}`,
        label: f.label.trim().slice(0, 80),
        type,
        required: Boolean(f.required),
        placeholder: typeof f.placeholder === 'string' ? f.placeholder.trim().slice(0, 140) : '',
        helpText: typeof f.helpText === 'string' ? f.helpText.trim().slice(0, 180) : '',
        options
      };
    });
}

function buildTournamentPayload(body) {
  const minElo = Math.max(100, Math.min(3500, Number(body.minElo) || 100));
  const maxElo = Math.max(minElo, Math.min(3500, Number(body.maxElo) || 3500));
  const maxPlayers = Math.max(2, Math.min(2048, Number(body.maxPlayers) || 64));
  const rounds = Math.max(1, Math.min(30, Number(body.rounds) || 5));

  return {
    title: String(body.title || '').trim().slice(0, 120),
    subtitle: String(body.subtitle || '').trim().slice(0, 160),
    description: String(body.description || '').trim().slice(0, 1500),
    venue: String(body.venue || 'Online Arena').trim().slice(0, 140),
    format: ['Swiss', 'Arena', 'Knockout', 'Round Robin'].includes(body.format)
      ? body.format
      : 'Swiss',
    rounds,
    timeControl: String(body.timeControl || '10+5 Rapid').trim().slice(0, 60),
    platform: String(body.platform || 'Chess.com').trim().slice(0, 60),
    startDate: body.startDate ? new Date(body.startDate).toISOString() : new Date().toISOString(),
    registrationOpenAt: body.registrationOpenAt ? new Date(body.registrationOpenAt).toISOString() : '',
    registrationCloseAt: body.registrationCloseAt ? new Date(body.registrationCloseAt).toISOString() : '',
    minElo,
    maxElo,
    eloRequirementType: ['peak', 'current', 'either'].includes(body.eloRequirementType)
      ? body.eloRequirementType
      : 'peak',
    maxPlayers,
    allowWaitlist: body.allowWaitlist !== undefined ? Boolean(body.allowWaitlist) : true,
    autoApprove: body.autoApprove !== undefined ? Boolean(body.autoApprove) : true,
    entryFee: String(body.entryFee || 'Free Entry').trim().slice(0, 40),
    prizePool: String(body.prizePool || 'Championship Trophy').trim().slice(0, 80),
    requireFideId: Boolean(body.requireFideId),
    requireRealName: body.requireRealName !== undefined ? Boolean(body.requireRealName) : true,
    requireEmail: body.requireEmail !== undefined ? Boolean(body.requireEmail) : true,
    requireCountry: Boolean(body.requireCountry),
    rulesText: String(body.rulesText || '').trim().slice(0, 2500),
    status: ['Draft', 'Open', 'Closed', 'Live', 'Completed'].includes(body.status)
      ? body.status
      : 'Open',
    customFields: sanitizeCustomFields(body.customFields)
  };
}

// Public Admin Session Check & Auth Routes
router.get('/session', async (req, res) => {
  try {
    const session = getSessionFromRequest(req);
    const { usingPreviewDefaults } = getConfiguredCredentials();
    const dbStatus = await db.getDbStatus();

    if (!session) {
      return res.json({
        authenticated: false,
        usingPreviewDefaults,
        dbStatus
      });
    }

    return res.json({
      authenticated: true,
      admin: session.sub,
      usingPreviewDefaults,
      dbStatus
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!verifyCredentials(username, password)) {
    return res.status(401).json({
      error: 'Invalid credentials',
      message: 'Admin username or password does not match configured environment credentials.'
    });
  }

  const token = createSessionToken(String(username).trim());
  setSessionCookie(res, token, req);
  return res.json({
    ok: true,
    admin: String(username).trim(),
    token
  });
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res, req);
  return res.json({ ok: true });
});

// Everything below requires valid Admin authentication
router.use(requireAdmin);

// Overview & System Telemetry
router.get('/overview', async (_req, res) => {
  try {
    const [tournaments, registrations, matches, wheelSpins, dbStatus] = await Promise.all([
      db.listTournaments(),
      db.listRegistrations(),
      db.listMatches(),
      db.listWheelSpins(),
      db.getDbStatus()
    ]);

    const confirmedCount = registrations.filter((r) => r.status === 'Confirmed').length;
    const pendingCount = registrations.filter((r) => r.status === 'Pending').length;
    const waitlistCount = registrations.filter((r) => r.status === 'Waitlisted').length;
    const openTournaments = tournaments.filter((t) => t.status === 'Open' || t.status === 'Live').length;

    return res.json({
      dbStatus,
      stats: {
        totalTournaments: tournaments.length,
        openTournaments,
        totalRegistrations: registrations.length,
        confirmedCount,
        pendingCount,
        waitlistCount,
        totalMatches: matches.length,
        wheelDrawsCount: wheelSpins.length
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Tournaments CRUD & Full Control
router.get('/tournaments', async (_req, res) => {
  try {
    const [tournaments, registrations, matches] = await Promise.all([
      db.listTournaments(),
      db.listRegistrations(),
      db.listMatches()
    ]);

    const enriched = tournaments.map((t) => {
      const tRegs = registrations.filter((r) => r.tournamentId === t.id);
      const tMatches = matches.filter((m) => m.tournamentId === t.id);
      return {
        ...t,
        counts: {
          total: tRegs.length,
          confirmed: tRegs.filter((r) => r.status === 'Confirmed').length,
          waitlisted: tRegs.filter((r) => r.status === 'Waitlisted').length,
          pending: tRegs.filter((r) => r.status === 'Pending').length,
          matches: tMatches.length
        }
      };
    });

    return res.json({ tournaments: enriched });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/tournaments', async (req, res) => {
  try {
    const payload = buildTournamentPayload(req.body || {});
    if (!payload.title) {
      return res.status(400).json({ error: 'Tournament title is required.' });
    }
    const created = await db.createTournament(payload);
    return res.status(201).json({ tournament: created });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.put('/tournaments/:id', async (req, res) => {
  try {
    const existing = await db.getTournamentById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Tournament not found.' });
    }
    const payload = buildTournamentPayload({ ...existing, ...(req.body || {}) });
    if (!payload.title) {
      return res.status(400).json({ error: 'Tournament title is required.' });
    }
    const updated = await db.updateTournament(req.params.id, payload);
    return res.json({ tournament: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/tournaments/:id/status', async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!['Draft', 'Open', 'Closed', 'Live', 'Completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value.' });
    }
    const updated = await db.updateTournament(req.params.id, { status });
    if (!updated) {
      return res.status(404).json({ error: 'Tournament not found.' });
    }
    return res.json({ tournament: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/tournaments/:id/duplicate', async (req, res) => {
  try {
    const source = await db.getTournamentById(req.params.id);
    if (!source) {
      return res.status(404).json({ error: 'Source tournament not found.' });
    }
    const { id: _oldId, createdAt: _oldCreated, ...rest } = source;
    const cloned = await db.createTournament({
      ...rest,
      title: `${source.title} (Copy)`,
      status: 'Draft'
    });
    return res.status(201).json({ tournament: cloned });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/tournaments/:id', async (req, res) => {
  try {
    const deleted = await db.deleteTournament(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Tournament not found.' });
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Registrations Management
router.get('/registrations', async (req, res) => {
  try {
    const { tournamentId, status, search } = req.query;
    const [regs, tournaments] = await Promise.all([
      db.listRegistrations({
        tournamentId: tournamentId || undefined,
        status: status || undefined
      }),
      db.listTournaments()
    ]);

    const tMap = new Map(tournaments.map((t) => [t.id, t.title]));
    let list = regs.map((r) => ({
      ...r,
      tournamentTitle: tMap.get(r.tournamentId) || 'Unknown Tournament'
    }));

    if (search && String(search).trim()) {
      const q = String(search).trim().toLowerCase();
      list = list.filter(
        (r) =>
          (r.username || '').toLowerCase().includes(q) ||
          (r.fullName || '').toLowerCase().includes(q) ||
          (r.email || '').toLowerCase().includes(q) ||
          (r.confirmationCode || '').toLowerCase().includes(q)
      );
    }

    return res.json({ registrations: list });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/registrations/:id', async (req, res) => {
  try {
    const existing = await db.getRegistrationById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Registration not found.' });
    }
    const updates = {};
    const body = req.body || {};

    if (['Confirmed', 'Waitlisted', 'Pending', 'Rejected', 'Withdrawn'].includes(body.status)) {
      updates.status = body.status;
    }
    if (body.seed !== undefined) {
      updates.seed = Math.max(1, Number(body.seed) || 1);
    }
    if (body.peakElo !== undefined) {
      updates.peakElo = Math.max(100, Math.min(3500, Number(body.peakElo) || existing.peakElo));
    }
    if (body.currentElo !== undefined) {
      updates.currentElo = Math.max(100, Math.min(3500, Number(body.currentElo) || existing.currentElo));
    }
    if (body.adminNote !== undefined) {
      updates.adminNote = String(body.adminNote).slice(0, 300);
    }

    const updated = await db.updateRegistration(req.params.id, updates);
    return res.json({ registration: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/registrations/:id', async (req, res) => {
  try {
    const ok = await db.deleteRegistration(req.params.id);
    if (!ok) {
      return res.status(404).json({ error: 'Registration not found.' });
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/registrations/:tournamentId/export', async (req, res) => {
  try {
    const regs = await db.listRegistrations({ tournamentId: req.params.tournamentId });
    const headers = [
      'ConfirmationCode',
      'Username',
      'FullName',
      'Email',
      'Country',
      'Platform',
      'PeakElo',
      'CurrentElo',
      'FideId',
      'Seed',
      'Status',
      'CreatedAt'
    ];
    const escapeCsv = (val) => {
      const str = String(val === undefined || val === null ? '' : val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const rows = regs.map((r) =>
      [
        r.confirmationCode,
        r.username,
        r.fullName,
        r.email,
        r.country,
        r.platform,
        r.peakElo,
        r.currentElo,
        r.fideId,
        r.seed,
        r.status,
        r.createdAt
      ]
        .map(escapeCsv)
        .join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="roster-${req.params.tournamentId}.csv"`
    );
    return res.send(csv);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Matches & Standings Publishing
router.get('/matches/:tournamentId', async (req, res) => {
  try {
    const [matches, standings] = await Promise.all([
      db.listMatches(req.params.tournamentId),
      db.getStandings(req.params.tournamentId)
    ]);
    return res.json({ matches, standings });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/matches', async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.tournamentId || !body.whiteUsername) {
      return res.status(400).json({ error: 'Tournament ID and White player username are required.' });
    }
    const allowedOutcomes = ['1-0', '0-1', '0.5-0.5', 'BYE', 'PENDING'];
    const outcome = allowedOutcomes.includes(body.outcome) ? body.outcome : 'PENDING';
    const match = await db.saveMatch({
      id: body.id || undefined,
      tournamentId: String(body.tournamentId),
      round: Math.max(1, Number(body.round) || 1),
      board: Math.max(1, Number(body.board) || 1),
      whiteUsername: String(body.whiteUsername).trim(),
      blackUsername: outcome === 'BYE' ? 'BYE' : String(body.blackUsername || '').trim(),
      outcome,
      pgnNote: String(body.pgnNote || '').trim().slice(0, 140)
    });
    const standings = await db.getStandings(match.tournamentId);
    return res.status(201).json({ match, standings });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/matches/:tournamentId/auto-pair', async (req, res) => {
  try {
    const tournamentId = req.params.tournamentId;
    const [standings, existingMatches] = await Promise.all([
      db.getStandings(tournamentId),
      db.listMatches(tournamentId)
    ]);

    if (standings.length < 2) {
      return res
        .status(400)
        .json({ error: 'At least 2 confirmed players are required to generate pairings.' });
    }

    const maxRound = existingMatches.reduce((acc, m) => Math.max(acc, Number(m.round) || 0), 0);
    const nextRound = Number(req.body?.round) || maxRound + 1;

    // Track already-played opponent pairs
    const playedPairs = new Set();
    for (const m of existingMatches) {
      if (m.whiteUsername && m.blackUsername && m.blackUsername !== 'BYE') {
        playedPairs.add(`${m.whiteUsername}::${m.blackUsername}`);
        playedPairs.add(`${m.blackUsername}::${m.whiteUsername}`);
      }
    }

    const pool = [...standings];
    const pairings = [];
    const used = new Set();
    let board = 1;

    for (let i = 0; i < pool.length; i += 1) {
      const p1 = pool[i];
      if (used.has(p1.username)) continue;

      let opponentIndex = -1;
      for (let j = i + 1; j < pool.length; j += 1) {
        const p2 = pool[j];
        if (used.has(p2.username)) continue;
        if (!playedPairs.has(`${p1.username}::${p2.username}`)) {
          opponentIndex = j;
          break;
        }
      }
      if (opponentIndex === -1) {
        for (let j = i + 1; j < pool.length; j += 1) {
          if (!used.has(pool[j].username)) {
            opponentIndex = j;
            break;
          }
        }
      }

      if (opponentIndex !== -1) {
        const p2 = pool[opponentIndex];
        used.add(p1.username);
        used.add(p2.username);
        const swapColors = nextRound % 2 === 0;
        pairings.push({
          tournamentId,
          round: nextRound,
          board: board++,
          whiteUsername: swapColors ? p2.username : p1.username,
          blackUsername: swapColors ? p1.username : p2.username,
          outcome: 'PENDING',
          pgnNote: `Round ${nextRound} Auto-Pairing`
        });
      } else {
        used.add(p1.username);
        pairings.push({
          tournamentId,
          round: nextRound,
          board: board++,
          whiteUsername: p1.username,
          blackUsername: 'BYE',
          outcome: 'BYE',
          pgnNote: 'Full-point bye'
        });
      }
    }

    const created = await db.saveManyMatches(pairings);
    const updatedStandings = await db.getStandings(tournamentId);
    return res.status(201).json({ round: nextRound, matches: created, standings: updatedStandings });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/matches/:id', async (req, res) => {
  try {
    const ok = await db.deleteMatch(req.params.id);
    if (!ok) {
      return res.status(404).json({ error: 'Match not found.' });
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.put('/standings/:tournamentId/recalculate', async (req, res) => {
  try {
    const standings = await db.recalculateStandings(req.params.tournamentId);
    return res.json({ standings });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ADMIN-ONLY PRIVATE FREE WHEEL ENGINE
// Strictly protected by requireAdmin middleware; never exposed to public endpoints or UI.
router.get('/wheel/history', async (req, res) => {
  try {
    const spins = await db.listWheelSpins(req.query.tournamentId || undefined);
    return res.json({ spins });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/wheel/spin', async (req, res) => {
  try {
    const { tournamentId, mode, slices } = req.body || {};
    if (!Array.isArray(slices) || slices.length < 2) {
      return res.status(400).json({
        error: 'At least 2 wheel segments are required to perform an admin draw.'
      });
    }

    const normalized = slices
      .filter((s) => s && String(s.label || '').trim().length > 0)
      .map((s, idx) => ({
        id: String(s.id || `slice_${idx}`),
        label: String(s.label).trim().slice(0, 80),
        weight: Math.max(1, Math.min(100, Math.round(Number(s.weight) || 1))),
        color: String(s.color || '#C4F536')
      }));

    if (normalized.length < 2) {
      return res.status(400).json({ error: 'At least 2 valid labeled segments are required.' });
    }

    const totalWeight = normalized.reduce((sum, s) => sum + s.weight, 0);
    const ticket = crypto.randomInt(0, totalWeight);
    let cursor = 0;
    let winnerIndex = 0;

    for (let i = 0; i < normalized.length; i += 1) {
      cursor += normalized[i].weight;
      if (ticket < cursor) {
        winnerIndex = i;
        break;
      }
    }

    const winner = normalized[winnerIndex];
    const spinRecord = await db.logWheelSpin({
      tournamentId: tournamentId || 'custom_draw',
      mode: mode || 'Admin Private Draw',
      segmentCount: normalized.length,
      winnerLabel: winner.label,
      winnerId: winner.id,
      spunBy: req.adminUser
    });

    return res.json({
      winnerIndex,
      winner,
      spinRecord
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/wheel/history', async (req, res) => {
  try {
    await db.clearWheelSpins(req.query.tournamentId || undefined);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ADMIN-ONLY DATABASE MANAGEMENT
router.get('/database/summary', async (_req, res) => {
  try {
    const summary = await db.getDatabaseSummary();
    return res.json(summary);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/database/export', async (_req, res) => {
  try {
    const snapshot = await db.exportDatabaseSnapshot();
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="grandmaster-arena-backup-${stamp}.json"`);
    return res.send(JSON.stringify(snapshot, null, 2));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/database/import', async (req, res) => {
  try {
    const snapshot = req.body;
    const summary = await db.importDatabaseSnapshot(snapshot);
    return res.json({ ok: true, ...summary });
  } catch (err) {
    const isClientError = /invalid backup format/i.test(err.message);
    return res.status(isClientError ? 400 : 500).json({ error: err.message });
  }
});

router.post('/database/purge', async (req, res) => {
  try {
    const { scope, confirm } = req.body || {};
    if (confirm !== true) {
      return res.status(400).json({ error: 'Explicit confirmation is required before purging data.' });
    }
    const validScopes = ['demo', 'wheel', 'matches', 'registrations', 'all'];
    if (!validScopes.includes(scope)) {
      return res.status(400).json({ error: 'Invalid purge scope.' });
    }
    const summary = await db.purgeDatabaseScope(scope);
    return res.json({ ok: true, scope, ...summary });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
