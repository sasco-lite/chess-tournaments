const express = require('express');
const crypto = require('node:crypto');
const db = require('./lib/db');

const router = express.Router();

function isWindowOpen(tournament) {
  const now = Date.now();
  if (tournament.registrationOpenAt) {
    const openMs = new Date(tournament.registrationOpenAt).getTime();
    if (!Number.isNaN(openMs) && now < openMs) {
      return { ok: false, reason: 'Registration window has not opened yet.' };
    }
  }
  if (tournament.registrationCloseAt) {
    const closeMs = new Date(tournament.registrationCloseAt).getTime();
    if (!Number.isNaN(closeMs) && now > closeMs) {
      return { ok: false, reason: 'Registration deadline has passed.' };
    }
  }
  return { ok: true };
}

// List public tournaments (excluding Draft)
router.get('/tournaments', async (_req, res) => {
  try {
    const [tournaments, registrations] = await Promise.all([
      db.listTournaments(),
      db.listRegistrations()
    ]);

    const visible = tournaments
      .filter((t) => t.status !== 'Draft')
      .map((t) => {
        const tRegs = registrations.filter((r) => r.tournamentId === t.id);
        const confirmed = tRegs.filter((r) => r.status === 'Confirmed').length;
        const waitlisted = tRegs.filter((r) => r.status === 'Waitlisted').length;
        const pending = tRegs.filter((r) => r.status === 'Pending').length;
        return {
          ...t,
          slotsUsed: confirmed,
          slotsRemaining: Math.max(0, t.maxPlayers - confirmed),
          waitlistCount: waitlisted,
          pendingCount: pending
        };
      });

    return res.json({ tournaments: visible });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Single tournament detail + public masked roster
router.get('/tournaments/:id', async (req, res) => {
  try {
    const tournament = await db.getTournamentById(req.params.id);
    if (!tournament || tournament.status === 'Draft') {
      return res.status(404).json({ error: 'Tournament not found.' });
    }
    const regs = await db.listRegistrations({ tournamentId: tournament.id });
    const confirmed = regs.filter((r) => r.status === 'Confirmed');
    const waitlisted = regs.filter((r) => r.status === 'Waitlisted');

    const publicParticipants = confirmed
      .sort((a, b) => (a.seed || 999) - (b.seed || 999) || b.peakElo - a.peakElo)
      .map((r, idx) => ({
        seed: r.seed || idx + 1,
        username: r.username,
        platform: r.platform,
        peakElo: r.peakElo,
        currentElo: r.currentElo,
        country: r.country || ''
      }));

    return res.json({
      tournament: {
        ...tournament,
        slotsUsed: confirmed.length,
        slotsRemaining: Math.max(0, tournament.maxPlayers - confirmed.length),
        waitlistCount: waitlisted.length
      },
      participants: publicParticipants
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Submit player registration
router.post('/submit', async (req, res) => {
  try {
    const body = req.body || {};
    const tournamentId = String(body.tournamentId || '').trim();
    if (!tournamentId) {
      return res.status(400).json({ error: 'Please select a tournament.' });
    }

    const tournament = await db.getTournamentById(tournamentId);
    if (!tournament || tournament.status === 'Draft') {
      return res.status(404).json({ error: 'Tournament not found.' });
    }

    if (tournament.status !== 'Open') {
      return res.status(400).json({
        error: `Registration is currently unavailable because this tournament is ${tournament.status}.`
      });
    }

    const windowCheck = isWindowOpen(tournament);
    if (!windowCheck.ok) {
      return res.status(400).json({ error: windowCheck.reason });
    }

    const username = String(body.username || '').trim();
    if (username.length < 2 || username.length > 32) {
      return res.status(400).json({ error: 'Chess username must be between 2 and 32 characters.' });
    }

    const peakElo = Number(body.peakElo);
    const currentElo = Number(body.currentElo !== undefined && body.currentElo !== '' ? body.currentElo : body.peakElo);

    if (!Number.isFinite(peakElo) || peakElo < 100 || peakElo > 3500) {
      return res.status(400).json({ error: 'Peak Elo must be a valid rating between 100 and 3500.' });
    }
    if (!Number.isFinite(currentElo) || currentElo < 100 || currentElo > 3500) {
      return res.status(400).json({ error: 'Current Elo must be a valid rating between 100 and 3500.' });
    }

    // Check Elo requirements
    const eloType = tournament.eloRequirementType || 'peak';
    const checkVal =
      eloType === 'current'
        ? currentElo
        : eloType === 'either'
        ? Math.max(peakElo, currentElo)
        : peakElo;

    if (checkVal < tournament.minElo || checkVal > tournament.maxElo) {
      return res.status(400).json({
        error: `Elo rating (${checkVal}) falls outside this tournament's bracket (${tournament.minElo}–${tournament.maxElo}).`
      });
    }

    const fullName = String(body.fullName || '').trim().slice(0, 100);
    const email = String(body.email || '').trim().slice(0, 140);
    const country = String(body.country || '').trim().slice(0, 60);
    const fideId = String(body.fideId || '').trim().slice(0, 30);
    const platform = String(body.platform || tournament.platform || 'Chess.com').trim().slice(0, 40);

    if (tournament.requireRealName && !fullName) {
      return res.status(400).json({ error: 'Full name is required for this tournament.' });
    }
    if (tournament.requireEmail) {
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'A valid email address is required.' });
      }
    }
    if (tournament.requireCountry && !country) {
      return res.status(400).json({ error: 'Country / Federation is required.' });
    }
    if (tournament.requireFideId && !fideId) {
      return res.status(400).json({ error: 'FIDE / National ID is required for this event.' });
    }

    // Validate admin-defined custom fields
    const customResponses = {};
    const incomingCustom = body.customResponses && typeof body.customResponses === 'object' ? body.customResponses : {};
    for (const field of tournament.customFields || []) {
      const rawVal = incomingCustom[field.id];
      if (field.type === 'checkbox') {
        const checked = Boolean(rawVal);
        if (field.required && !checked) {
          return res.status(400).json({ error: `Please confirm: ${field.label}` });
        }
        customResponses[field.id] = checked;
      } else {
        const strVal = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : '';
        if (field.required && !strVal) {
          return res.status(400).json({ error: `${field.label} is required.` });
        }
        if (field.type === 'number' && strVal && Number.isNaN(Number(strVal))) {
          return res.status(400).json({ error: `${field.label} must be a numeric value.` });
        }
        customResponses[field.id] = strVal.slice(0, 500);
      }
    }

    const existingRegs = await db.listRegistrations({ tournamentId });
    const duplicate = existingRegs.find(
      (r) =>
        r.username.toLowerCase() === username.toLowerCase() &&
        r.status !== 'Rejected' &&
        r.status !== 'Withdrawn'
    );
    if (duplicate) {
      return res.status(409).json({
        error: `Username "${username}" is already registered in this tournament.`
      });
    }

    const confirmedCount = existingRegs.filter((r) => r.status === 'Confirmed').length;
    let status = 'Confirmed';

    if (confirmedCount >= tournament.maxPlayers) {
      if (tournament.allowWaitlist) {
        status = 'Waitlisted';
      } else {
        return res.status(400).json({ error: 'This tournament has reached maximum player capacity.' });
      }
    } else if (!tournament.autoApprove) {
      status = 'Pending';
    }

    const confirmationCode = `GMA-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const created = await db.createRegistration({
      tournamentId,
      username,
      fullName,
      email,
      country,
      platform,
      peakElo: Math.round(peakElo),
      currentElo: Math.round(currentElo),
      fideId,
      customResponses,
      seed: confirmedCount + 1,
      status,
      confirmationCode
    });

    return res.status(201).json({
      registration: {
        id: created.id,
        tournamentId: created.tournamentId,
        tournamentTitle: tournament.title,
        username: created.username,
        peakElo: created.peakElo,
        currentElo: created.currentElo,
        platform: created.platform,
        status: created.status,
        seed: created.seed,
        confirmationCode: created.confirmationCode,
        createdAt: created.createdAt
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Lookup registration receipt
router.get('/lookup', async (req, res) => {
  try {
    const code = String(req.query.code || '').trim().toUpperCase();
    const username = String(req.query.username || '').trim().toLowerCase();
    const tournamentId = String(req.query.tournamentId || '').trim();

    if (!code && !username) {
      return res.status(400).json({ error: 'Enter a confirmation code or username to look up.' });
    }

    const [regs, tournaments] = await Promise.all([
      db.listRegistrations(tournamentId ? { tournamentId } : {}),
      db.listTournaments()
    ]);
    const tMap = new Map(tournaments.map((t) => [t.id, t.title]));

    const found = regs.find((r) => {
      if (code && (r.confirmationCode || '').toUpperCase() === code) return true;
      if (username && r.username.toLowerCase() === username) return true;
      return false;
    });

    if (!found) {
      return res.status(404).json({ error: 'No matching registration entry found.' });
    }

    return res.json({
      entry: {
        confirmationCode: found.confirmationCode,
        tournamentId: found.tournamentId,
        tournamentTitle: tMap.get(found.tournamentId) || 'Tournament',
        username: found.username,
        platform: found.platform,
        peakElo: found.peakElo,
        currentElo: found.currentElo,
        status: found.status,
        seed: found.seed,
        createdAt: found.createdAt
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
