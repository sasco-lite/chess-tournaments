const express = require('express');
const db = require('./lib/db');

const router = express.Router();

// Summary list of tournaments for Result selector
router.get('/tournaments', async (_req, res) => {
  try {
    const [tournaments, matches, registrations] = await Promise.all([
      db.listTournaments(),
      db.listMatches(),
      db.listRegistrations()
    ]);

    const visible = tournaments
      .filter((t) => t.status !== 'Draft')
      .map((t) => {
        const tMatches = matches.filter((m) => m.tournamentId === t.id);
        const completedRounds = tMatches.reduce(
          (max, m) => (m.outcome !== 'PENDING' ? Math.max(max, Number(m.round) || 0) : max),
          0
        );
        const confirmedPlayers = registrations.filter(
          (r) => r.tournamentId === t.id && r.status === 'Confirmed'
        ).length;

        return {
          id: t.id,
          title: t.title,
          subtitle: t.subtitle,
          format: t.format,
          timeControl: t.timeControl,
          platform: t.platform,
          rounds: t.rounds,
          status: t.status,
          prizePool: t.prizePool,
          startDate: t.startDate,
          confirmedPlayers,
          completedRounds,
          totalMatches: tMatches.length
        };
      });

    return res.json({ tournaments: visible });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Full tournament standings, podium, and round-by-round matches
router.get('/:tournamentId', async (req, res) => {
  try {
    const tournament = await db.getTournamentById(req.params.tournamentId);
    if (!tournament || tournament.status === 'Draft') {
      return res.status(404).json({ error: 'Tournament not found.' });
    }

    const [standings, matches] = await Promise.all([
      db.getStandings(tournament.id),
      db.listMatches(tournament.id)
    ]);

    const podium = standings.slice(0, 3);
    const roundsMap = new Map();
    for (const m of matches) {
      const rNum = Number(m.round) || 1;
      if (!roundsMap.has(rNum)) roundsMap.set(rNum, []);
      roundsMap.get(rNum).push(m);
    }

    const rounds = Array.from(roundsMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([round, games]) => ({
        round,
        games: games.sort((a, b) => (a.board || 1) - (b.board || 1))
      }));

    return res.json({
      tournament,
      standings,
      podium,
      rounds
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Individual player scorecard inside a tournament
router.get('/:tournamentId/player/:username', async (req, res) => {
  try {
    const tournamentId = req.params.tournamentId;
    const usernameLower = decodeURIComponent(req.params.username).toLowerCase();
    const [standings, matches] = await Promise.all([
      db.getStandings(tournamentId),
      db.listMatches(tournamentId)
    ]);

    const player = standings.find((s) => s.username.toLowerCase() === usernameLower);
    if (!player) {
      return res.status(404).json({ error: 'Player not found in tournament standings.' });
    }

    const playerMatches = matches.filter(
      (m) =>
        (m.whiteUsername || '').toLowerCase() === usernameLower ||
        (m.blackUsername || '').toLowerCase() === usernameLower
    );

    return res.json({ player, matches: playerMatches });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
