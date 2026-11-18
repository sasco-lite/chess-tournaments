const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { MongoClient } = require('mongodb');

let mongoClientPromise = null;
let cachedDbMode = null;

function generateId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function getSeedData() {
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const deadline = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString();
  const nextMonth = new Date(now.getTime() + 18 * 24 * 60 * 60 * 1000).toISOString();
  const pastDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();

  const tournaments = [
    {
      id: 'trn_autumn_swiss',
      title: 'Autumn Grandmaster Swiss Open',
      subtitle: '7-Round FIDE-Calibrated Rapid Championship',
      description:
        'Flagship open rapid championship with anti-cheat verification, dynamic Swiss pairings, and full tiebreak tracking.',
      venue: 'Online Arena + Streamed Top Boards',
      format: 'Swiss',
      rounds: 7,
      timeControl: '15+10 Rapid',
      platform: 'Chess.com',
      startDate: nextWeek,
      registrationCloseAt: deadline,
      minElo: 1200,
      maxElo: 2900,
      eloRequirementType: 'peak',
      maxPlayers: 64,
      allowWaitlist: true,
      autoApprove: true,
      entryFee: 'Free Entry',
      prizePool: '$2,500 Prize Fund',
      requireFideId: false,
      requireRealName: true,
      requireEmail: true,
      requireCountry: true,
      rulesText:
        'Standard FIDE rapid rules apply. Zero engine assistance tolerated. Players must check in 15 minutes before Round 1.',
      status: 'Open',
      customFields: [
        {
          id: 'cf_title',
          label: 'Chess Title (if any)',
          type: 'select',
          required: false,
          placeholder: 'Select title',
          options: ['None', 'CM', 'FM', 'IM', 'GM', 'WFM', 'WIM', 'WGM']
        },
        {
          id: 'cf_club',
          label: 'Club or Federation',
          type: 'text',
          required: false,
          placeholder: 'e.g. Marshall Chess Club',
          options: []
        },
        {
          id: 'cf_repertoire',
          label: 'Favorite Opening',
          type: 'text',
          required: false,
          placeholder: 'e.g. Sicilian Najdorf',
          options: []
        },
        {
          id: 'cf_fairplay',
          label: 'Fair Play & Anti-Cheat Pledge',
          type: 'checkbox',
          required: true,
          placeholder: 'I agree to play strictly without engine or external assistance',
          options: []
        }
      ],
      createdAt: pastDate
    },
    {
      id: 'trn_midnight_bullet',
      title: 'Midnight Bullet Arena Cup',
      subtitle: 'High-Velocity 1+0 Knockout Qualifier',
      description:
        'Fast-paced 90-minute arena sprint followed by top-8 knockout bracket. Built for tactical specialists.',
      venue: 'Lichess Official Arena Room',
      format: 'Arena',
      rounds: 5,
      timeControl: '1+0 Bullet',
      platform: 'Lichess',
      startDate: nextMonth,
      registrationCloseAt: nextMonth,
      minElo: 1000,
      maxElo: 2500,
      eloRequirementType: 'current',
      maxPlayers: 128,
      allowWaitlist: true,
      autoApprove: true,
      entryFee: 'Free Entry',
      prizePool: 'Championship Trophy + Badge',
      requireFideId: false,
      requireRealName: false,
      requireEmail: true,
      requireCountry: false,
      rulesText:
        'No berserk restrictions. Disconnections over 45 seconds result in automatic forfeit.',
      status: 'Open',
      customFields: [
        {
          id: 'cf_discord',
          label: 'Discord Tag',
          type: 'text',
          required: true,
          placeholder: 'username#0000 or @handle',
          options: []
        }
      ],
      createdAt: pastDate
    },
    {
      id: 'trn_winter_invitational',
      title: 'Winter Invitational Finals',
      subtitle: '6-Player Classical Round Robin Masters',
      description:
        'Completed master invitational showcasing classical time controls, full round matrices, and Buchholz tiebreaks.',
      venue: 'Metro Chess Pavilion, Hall B',
      format: 'Round Robin',
      rounds: 5,
      timeControl: '90+30 Classical',
      platform: 'OTB / FIDE',
      startDate: pastDate,
      registrationCloseAt: pastDate,
      minElo: 2000,
      maxElo: 2900,
      eloRequirementType: 'peak',
      maxPlayers: 6,
      allowWaitlist: false,
      autoApprove: false,
      entryFee: '$50',
      prizePool: '$5,000 Guaranteed',
      requireFideId: true,
      requireRealName: true,
      requireEmail: true,
      requireCountry: true,
      rulesText: 'FIDE classical tournament regulations. Draw offers prohibited before move 30.',
      status: 'Completed',
      customFields: [],
      createdAt: pastDate
    }
  ];

  const registrations = [
    {
      id: 'reg_seed_1',
      tournamentId: 'trn_autumn_swiss',
      username: 'MagnusVanguard',
      fullName: 'Henrik Solberg',
      email: 'henrik.s@example.com',
      country: 'Norway',
      platform: 'Chess.com',
      peakElo: 2485,
      currentElo: 2430,
      fideId: '1503014',
      customResponses: {
        cf_title: 'IM',
        cf_club: 'Oslo Nord',
        cf_repertoire: 'Ruy Lopez',
        cf_fairplay: true
      },
      seed: 1,
      status: 'Confirmed',
      confirmationCode: 'GMA-8421A',
      createdAt: pastDate
    },
    {
      id: 'reg_seed_2',
      tournamentId: 'trn_autumn_swiss',
      username: 'QueenGambit_IND',
      fullName: 'Ananya Deshmukh',
      email: 'ananya.d@example.com',
      country: 'India',
      platform: 'Chess.com',
      peakElo: 2390,
      currentElo: 2355,
      fideId: '2509182',
      customResponses: {
        cf_title: 'WGM',
        cf_club: 'Pune Chess Academy',
        cf_repertoire: 'Catalan Opening',
        cf_fairplay: true
      },
      seed: 2,
      status: 'Confirmed',
      confirmationCode: 'GMA-7192B',
      createdAt: pastDate
    },
    {
      id: 'reg_seed_3',
      tournamentId: 'trn_autumn_swiss',
      username: 'KnightFork99',
      fullName: 'Daniel Kowalski',
      email: 'daniel.k@example.com',
      country: 'Poland',
      platform: 'Chess.com',
      peakElo: 2210,
      currentElo: 2180,
      fideId: '',
      customResponses: {
        cf_title: 'FM',
        cf_club: 'Warsaw Gambit',
        cf_repertoire: 'Sicilian Najdorf',
        cf_fairplay: true
      },
      seed: 3,
      status: 'Confirmed',
      confirmationCode: 'GMA-5519C',
      createdAt: pastDate
    },
    {
      id: 'reg_seed_4',
      tournamentId: 'trn_autumn_swiss',
      username: 'RookEndgamePro',
      fullName: 'Mateo Alvarez',
      email: 'mateo.a@example.com',
      country: 'Spain',
      platform: 'Chess.com',
      peakElo: 2095,
      currentElo: 2040,
      fideId: '',
      customResponses: {
        cf_title: 'CM',
        cf_club: 'Madrid Central',
        cf_repertoire: 'Caro-Kann',
        cf_fairplay: true
      },
      seed: 4,
      status: 'Confirmed',
      confirmationCode: 'GMA-3381D',
      createdAt: pastDate
    },
    {
      id: 'reg_seed_5',
      tournamentId: 'trn_winter_invitational',
      username: 'GM_TalReborn',
      fullName: 'Arturs Berzins',
      email: 'arturs@example.com',
      country: 'Latvia',
      platform: 'OTB / FIDE',
      peakElo: 2640,
      currentElo: 2618,
      fideId: '1160042',
      customResponses: {},
      seed: 1,
      status: 'Confirmed',
      confirmationCode: 'GMA-9901K',
      createdAt: pastDate
    },
    {
      id: 'reg_seed_6',
      tournamentId: 'trn_winter_invitational',
      username: 'BerlinWallGM',
      fullName: 'Lukas Weber',
      email: 'lukas@example.com',
      country: 'Germany',
      platform: 'OTB / FIDE',
      peakElo: 2580,
      currentElo: 2555,
      fideId: '2460199',
      customResponses: {},
      seed: 2,
      status: 'Confirmed',
      confirmationCode: 'GMA-9902M',
      createdAt: pastDate
    },
    {
      id: 'reg_seed_7',
      tournamentId: 'trn_winter_invitational',
      username: 'SofiaTactics',
      fullName: 'Sofia Petrova',
      email: 'sofia@example.com',
      country: 'Bulgaria',
      platform: 'OTB / FIDE',
      peakElo: 2515,
      currentElo: 2498,
      fideId: '2901824',
      customResponses: {},
      seed: 3,
      status: 'Confirmed',
      confirmationCode: 'GMA-9903N',
      createdAt: pastDate
    },
    {
      id: 'reg_seed_8',
      tournamentId: 'trn_winter_invitational',
      username: 'CairoBishop',
      fullName: 'Tariq Mansour',
      email: 'tariq@example.com',
      country: 'Egypt',
      platform: 'OTB / FIDE',
      peakElo: 2440,
      currentElo: 2410,
      fideId: '1060442',
      customResponses: {},
      seed: 4,
      status: 'Confirmed',
      confirmationCode: 'GMA-9904P',
      createdAt: pastDate
    }
  ];

  const matches = [
    {
      id: 'mat_seed_1',
      tournamentId: 'trn_autumn_swiss',
      round: 1,
      board: 1,
      whiteUsername: 'MagnusVanguard',
      blackUsername: 'KnightFork99',
      outcome: '1-0',
      pgnNote: 'Ruy Lopez, 42 moves',
      createdAt: pastDate
    },
    {
      id: 'mat_seed_2',
      tournamentId: 'trn_autumn_swiss',
      round: 1,
      board: 2,
      whiteUsername: 'QueenGambit_IND',
      blackUsername: 'RookEndgamePro',
      outcome: '1-0',
      pgnNote: 'Catalan, 36 moves',
      createdAt: pastDate
    },
    {
      id: 'mat_seed_3',
      tournamentId: 'trn_winter_invitational',
      round: 1,
      board: 1,
      whiteUsername: 'GM_TalReborn',
      blackUsername: 'CairoBishop',
      outcome: '1-0',
      pgnNote: 'Sicilian Sacrifice, 29 moves',
      createdAt: pastDate
    },
    {
      id: 'mat_seed_4',
      tournamentId: 'trn_winter_invitational',
      round: 1,
      board: 2,
      whiteUsername: 'BerlinWallGM',
      blackUsername: 'SofiaTactics',
      outcome: '0.5-0.5',
      pgnNote: 'Berlin Endgame, 54 moves',
      createdAt: pastDate
    },
    {
      id: 'mat_seed_5',
      tournamentId: 'trn_winter_invitational',
      round: 2,
      board: 1,
      whiteUsername: 'SofiaTactics',
      blackUsername: 'GM_TalReborn',
      outcome: '0-1',
      pgnNote: 'King Indian Attack, 48 moves',
      createdAt: pastDate
    },
    {
      id: 'mat_seed_6',
      tournamentId: 'trn_winter_invitational',
      round: 2,
      board: 2,
      whiteUsername: 'CairoBishop',
      blackUsername: 'BerlinWallGM',
      outcome: '0-1',
      pgnNote: 'Queen Gambit Declined, 41 moves',
      createdAt: pastDate
    },
    {
      id: 'mat_seed_7',
      tournamentId: 'trn_winter_invitational',
      round: 3,
      board: 1,
      whiteUsername: 'GM_TalReborn',
      blackUsername: 'BerlinWallGM',
      outcome: '0.5-0.5',
      pgnNote: 'Spanish Torture, 62 moves',
      createdAt: pastDate
    },
    {
      id: 'mat_seed_8',
      tournamentId: 'trn_winter_invitational',
      round: 3,
      board: 2,
      whiteUsername: 'SofiaTactics',
      blackUsername: 'CairoBishop',
      outcome: '1-0',
      pgnNote: 'London System, 33 moves',
      createdAt: pastDate
    }
  ];

  return {
    meta: { initialized: true },
    tournaments,
    registrations,
    matches,
    standings: [],
    wheelSpins: []
  };
}

function resolveLocalFilePath() {
  const preferredDir = path.join(process.cwd(), '.data');
  try {
    if (!fs.existsSync(preferredDir)) {
      fs.mkdirSync(preferredDir, { recursive: true });
    }
    const testPath = path.join(preferredDir, 'chess-arena-db.json');
    return testPath;
  } catch {
    return path.join('/tmp', 'chess-arena-db.json');
  }
}

let memoryStore = null;

function readLocalStore() {
  const filePath = resolveLocalFilePath();
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      memoryStore = parsed;
      return parsed;
    } catch {
      // Fall through to seed
    }
  }
  if (!memoryStore) {
    memoryStore = getSeedData();
    writeLocalStore(memoryStore);
    // Compute initial standings for seeded tournaments
    for (const t of memoryStore.tournaments) {
      const computed = computeStandingsFromLists(
        t.id,
        memoryStore.registrations.filter((r) => r.tournamentId === t.id),
        memoryStore.matches.filter((m) => m.tournamentId === t.id)
      );
      memoryStore.standings.push(...computed);
    }
    writeLocalStore(memoryStore);
  }
  return memoryStore;
}

function writeLocalStore(data) {
  memoryStore = data;
  try {
    const filePath = resolveLocalFilePath();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch {
    // Keep in-memory store if filesystem is strictly read-only
  }
}

async function getMongoDb() {
  const uri = (process.env.MONGODB_URI || '').trim();
  if (!uri) return null;

  if (!mongoClientPromise) {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10
    });
    mongoClientPromise = client.connect().catch((err) => {
      mongoClientPromise = null;
      throw err;
    });
  }

  const client = await mongoClientPromise;
  const db = client.db();
  cachedDbMode = 'mongodb';

  // Ensure initial seed only once
  const metaCol = db.collection('meta');
  const existingMeta = await metaCol.findOne({ key: 'seed_status' });
  if (!existingMeta) {
    const seed = getSeedData();
    const tCount = await db.collection('tournaments').countDocuments();
    if (tCount === 0) {
      await db.collection('tournaments').insertMany(seed.tournaments);
      await db.collection('registrations').insertMany(seed.registrations);
      await db.collection('matches').insertMany(seed.matches);
      const allStandings = [];
      for (const t of seed.tournaments) {
        const computed = computeStandingsFromLists(
          t.id,
          seed.registrations.filter((r) => r.tournamentId === t.id),
          seed.matches.filter((m) => m.tournamentId === t.id)
        );
        allStandings.push(...computed);
      }
      if (allStandings.length > 0) {
        await db.collection('standings').insertMany(allStandings);
      }
    }
    await metaCol.updateOne(
      { key: 'seed_status' },
      { $set: { key: 'seed_status', initialized: true, initializedAt: new Date().toISOString() } },
      { upsert: true }
    );
  }

  return db;
}

function computeStandingsFromLists(tournamentId, registrations, matches) {
  const playerMap = new Map();

  for (const reg of registrations) {
    if (reg.status !== 'Confirmed') continue;
    playerMap.set(reg.username, {
      id: `std_${tournamentId}_${reg.username}`,
      tournamentId,
      username: reg.username,
      fullName: reg.fullName || '',
      platform: reg.platform || 'Chess.com',
      peakElo: Number(reg.peakElo) || 1200,
      currentElo: Number(reg.currentElo) || Number(reg.peakElo) || 1200,
      country: reg.country || '',
      seed: Number(reg.seed) || 999,
      points: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      gamesPlayed: 0,
      buchholz: 0,
      opponents: []
    });
  }

  // Ensure any player appearing in matches is tracked even if manually added
  for (const m of matches) {
    if (m.whiteUsername && !playerMap.has(m.whiteUsername)) {
      playerMap.set(m.whiteUsername, {
        id: `std_${tournamentId}_${m.whiteUsername}`,
        tournamentId,
        username: m.whiteUsername,
        fullName: '',
        platform: 'Manual',
        peakElo: 1500,
        currentElo: 1500,
        country: '',
        seed: 999,
        points: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        gamesPlayed: 0,
        buchholz: 0,
        opponents: []
      });
    }
    if (m.blackUsername && m.blackUsername !== 'BYE' && !playerMap.has(m.blackUsername)) {
      playerMap.set(m.blackUsername, {
        id: `std_${tournamentId}_${m.blackUsername}`,
        tournamentId,
        username: m.blackUsername,
        fullName: '',
        platform: 'Manual',
        peakElo: 1500,
        currentElo: 1500,
        country: '',
        seed: 999,
        points: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        gamesPlayed: 0,
        buchholz: 0,
        opponents: []
      });
    }
  }

  for (const m of matches) {
    if (!m.outcome || m.outcome === 'PENDING') continue;
    const white = playerMap.get(m.whiteUsername);
    const black = m.blackUsername && m.blackUsername !== 'BYE' ? playerMap.get(m.blackUsername) : null;

    if (m.outcome === 'BYE' && white) {
      white.points += 1;
      white.wins += 1;
      white.gamesPlayed += 1;
      continue;
    }

    if (white && black) {
      white.gamesPlayed += 1;
      black.gamesPlayed += 1;
      white.opponents.push(black.username);
      black.opponents.push(white.username);

      if (m.outcome === '1-0') {
        white.points += 1;
        white.wins += 1;
        black.losses += 1;
      } else if (m.outcome === '0-1') {
        black.points += 1;
        black.wins += 1;
        white.losses += 1;
      } else if (m.outcome === '0.5-0.5') {
        white.points += 0.5;
        black.points += 0.5;
        white.draws += 1;
        black.draws += 1;
      }
    }
  }

  // Compute Buchholz tiebreak
  for (const p of playerMap.values()) {
    let bh = 0;
    for (const oppUsername of p.opponents) {
      const opp = playerMap.get(oppUsername);
      if (opp) bh += opp.points;
    }
    p.buchholz = Number(bh.toFixed(2));
  }

  const list = Array.from(playerMap.values()).map(({ opponents: _opponents, ...rest }) => rest);
  list.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.peakElo !== a.peakElo) return b.peakElo - a.peakElo;
    return a.username.localeCompare(b.username);
  });

  return list.map((item, idx) => ({
    ...item,
    rank: idx + 1
  }));
}

async function getDbStatus() {
  const uri = (process.env.MONGODB_URI || '').trim();
  if (!uri) {
    cachedDbMode = 'local-preview';
    return { mode: 'local-preview', connected: true };
  }
  try {
    await getMongoDb();
    return { mode: 'mongodb', connected: true };
  } catch (err) {
    return { mode: 'mongodb-error', connected: false, error: err.message };
  }
}

function stripMongoId(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
}

async function listTournaments() {
  const db = await getMongoDb();
  if (db) {
    const docs = await db.collection('tournaments').find({}).sort({ createdAt: -1 }).toArray();
    return docs.map(stripMongoId);
  }
  const store = readLocalStore();
  return [...store.tournaments].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getTournamentById(id) {
  const db = await getMongoDb();
  if (db) {
    const doc = await db.collection('tournaments').findOne({ id });
    return stripMongoId(doc);
  }
  const store = readLocalStore();
  return store.tournaments.find((t) => t.id === id) || null;
}

async function createTournament(data) {
  const record = {
    ...data,
    id: data.id || generateId('trn'),
    createdAt: new Date().toISOString()
  };
  const db = await getMongoDb();
  if (db) {
    await db.collection('tournaments').insertOne({ ...record });
    return record;
  }
  const store = readLocalStore();
  store.tournaments.unshift(record);
  writeLocalStore(store);
  return record;
}

async function updateTournament(id, updates) {
  const db = await getMongoDb();
  if (db) {
    await db.collection('tournaments').updateOne({ id }, { $set: updates });
    return getTournamentById(id);
  }
  const store = readLocalStore();
  const idx = store.tournaments.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  store.tournaments[idx] = { ...store.tournaments[idx], ...updates };
  writeLocalStore(store);
  return store.tournaments[idx];
}

async function deleteTournament(id) {
  const db = await getMongoDb();
  if (db) {
    const res = await db.collection('tournaments').deleteOne({ id });
    await db.collection('registrations').deleteMany({ tournamentId: id });
    await db.collection('matches').deleteMany({ tournamentId: id });
    await db.collection('standings').deleteMany({ tournamentId: id });
    return res.deletedCount > 0;
  }
  const store = readLocalStore();
  const prevLen = store.tournaments.length;
  store.tournaments = store.tournaments.filter((t) => t.id !== id);
  store.registrations = store.registrations.filter((r) => r.tournamentId !== id);
  store.matches = store.matches.filter((m) => m.tournamentId !== id);
  store.standings = store.standings.filter((s) => s.tournamentId !== id);
  writeLocalStore(store);
  return store.tournaments.length < prevLen;
}

async function listRegistrations(filter = {}) {
  const db = await getMongoDb();
  if (db) {
    const query = {};
    if (filter.tournamentId) query.tournamentId = filter.tournamentId;
    if (filter.status) query.status = filter.status;
    const docs = await db.collection('registrations').find(query).sort({ createdAt: -1 }).toArray();
    return docs.map(stripMongoId);
  }
  const store = readLocalStore();
  return store.registrations
    .filter((r) => {
      if (filter.tournamentId && r.tournamentId !== filter.tournamentId) return false;
      if (filter.status && r.status !== filter.status) return false;
      return true;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getRegistrationById(id) {
  const db = await getMongoDb();
  if (db) {
    const doc = await db.collection('registrations').findOne({ id });
    return stripMongoId(doc);
  }
  const store = readLocalStore();
  return store.registrations.find((r) => r.id === id) || null;
}

async function createRegistration(data) {
  const record = {
    ...data,
    id: data.id || generateId('reg'),
    createdAt: new Date().toISOString()
  };
  const db = await getMongoDb();
  if (db) {
    await db.collection('registrations').insertOne({ ...record });
  } else {
    const store = readLocalStore();
    store.registrations.unshift(record);
    writeLocalStore(store);
  }
  await recalculateStandings(record.tournamentId);
  return record;
}

async function updateRegistration(id, updates) {
  const db = await getMongoDb();
  let updated = null;
  if (db) {
    await db.collection('registrations').updateOne({ id }, { $set: updates });
    updated = await getRegistrationById(id);
  } else {
    const store = readLocalStore();
    const idx = store.registrations.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    store.registrations[idx] = { ...store.registrations[idx], ...updates };
    updated = store.registrations[idx];
    writeLocalStore(store);
  }
  if (updated) {
    await recalculateStandings(updated.tournamentId);
  }
  return updated;
}

async function deleteRegistration(id) {
  const existing = await getRegistrationById(id);
  if (!existing) return false;
  const db = await getMongoDb();
  if (db) {
    await db.collection('registrations').deleteOne({ id });
  } else {
    const store = readLocalStore();
    store.registrations = store.registrations.filter((r) => r.id !== id);
    writeLocalStore(store);
  }
  await recalculateStandings(existing.tournamentId);
  return true;
}

async function listMatches(tournamentId) {
  const db = await getMongoDb();
  if (db) {
    const query = tournamentId ? { tournamentId } : {};
    const docs = await db.collection('matches').find(query).sort({ round: 1, board: 1 }).toArray();
    return docs.map(stripMongoId);
  }
  const store = readLocalStore();
  return store.matches
    .filter((m) => (!tournamentId ? true : m.tournamentId === tournamentId))
    .sort((a, b) => a.round - b.round || a.board - b.board);
}

async function saveMatch(data) {
  const record = {
    ...data,
    id: data.id || generateId('mat'),
    createdAt: data.createdAt || new Date().toISOString()
  };
  const db = await getMongoDb();
  if (db) {
    await db.collection('matches').updateOne({ id: record.id }, { $set: record }, { upsert: true });
  } else {
    const store = readLocalStore();
    const idx = store.matches.findIndex((m) => m.id === record.id);
    if (idx >= 0) {
      store.matches[idx] = record;
    } else {
      store.matches.push(record);
    }
    writeLocalStore(store);
  }
  await recalculateStandings(record.tournamentId);
  return record;
}

async function saveManyMatches(matchList) {
  if (!matchList || matchList.length === 0) return [];
  const tournamentId = matchList[0].tournamentId;
  const records = matchList.map((m) => ({
    ...m,
    id: m.id || generateId('mat'),
    createdAt: m.createdAt || new Date().toISOString()
  }));
  const db = await getMongoDb();
  if (db) {
    await db.collection('matches').insertMany(records);
  } else {
    const store = readLocalStore();
    store.matches.push(...records);
    writeLocalStore(store);
  }
  await recalculateStandings(tournamentId);
  return records;
}

async function deleteMatch(id) {
  const db = await getMongoDb();
  let targetTournamentId = null;
  if (db) {
    const doc = await db.collection('matches').findOne({ id });
    if (!doc) return false;
    targetTournamentId = doc.tournamentId;
    await db.collection('matches').deleteOne({ id });
  } else {
    const store = readLocalStore();
    const existing = store.matches.find((m) => m.id === id);
    if (!existing) return false;
    targetTournamentId = existing.tournamentId;
    store.matches = store.matches.filter((m) => m.id !== id);
    writeLocalStore(store);
  }
  if (targetTournamentId) {
    await recalculateStandings(targetTournamentId);
  }
  return true;
}

async function recalculateStandings(tournamentId) {
  const [regs, matches] = await Promise.all([
    listRegistrations({ tournamentId }),
    listMatches(tournamentId)
  ]);
  const computed = computeStandingsFromLists(tournamentId, regs, matches);

  const db = await getMongoDb();
  if (db) {
    await db.collection('standings').deleteMany({ tournamentId });
    if (computed.length > 0) {
      await db.collection('standings').insertMany(computed);
    }
  } else {
    const store = readLocalStore();
    store.standings = store.standings.filter((s) => s.tournamentId !== tournamentId);
    store.standings.push(...computed);
    writeLocalStore(store);
  }
  return computed;
}

async function getStandings(tournamentId) {
  const db = await getMongoDb();
  if (db) {
    const docs = await db
      .collection('standings')
      .find({ tournamentId })
      .sort({ rank: 1 })
      .toArray();
    if (docs.length > 0) return docs.map(stripMongoId);
    return recalculateStandings(tournamentId);
  }
  const store = readLocalStore();
  const rows = store.standings.filter((s) => s.tournamentId === tournamentId).sort((a, b) => a.rank - b.rank);
  if (rows.length > 0) return rows;
  return recalculateStandings(tournamentId);
}

async function listWheelSpins(tournamentId) {
  const db = await getMongoDb();
  if (db) {
    const query = tournamentId ? { tournamentId } : {};
    const docs = await db.collection('wheel_spins').find(query).sort({ spunAt: -1 }).limit(50).toArray();
    return docs.map(stripMongoId);
  }
  const store = readLocalStore();
  return store.wheelSpins
    .filter((w) => (!tournamentId ? true : w.tournamentId === tournamentId))
    .sort((a, b) => new Date(b.spunAt) - new Date(a.spunAt))
    .slice(0, 50);
}

async function logWheelSpin(spinData) {
  const record = {
    ...spinData,
    id: generateId('spin'),
    spunAt: new Date().toISOString()
  };
  const db = await getMongoDb();
  if (db) {
    await db.collection('wheel_spins').insertOne({ ...record });
    return record;
  }
  const store = readLocalStore();
  store.wheelSpins.unshift(record);
  writeLocalStore(store);
  return record;
}

async function clearWheelSpins(tournamentId) {
  const db = await getMongoDb();
  if (db) {
    const query = tournamentId ? { tournamentId } : {};
    await db.collection('wheel_spins').deleteMany(query);
    return true;
  }
  const store = readLocalStore();
  store.wheelSpins = tournamentId ? store.wheelSpins.filter((w) => w.tournamentId !== tournamentId) : [];
  writeLocalStore(store);
  return true;
}

async function getDatabaseSummary() {
  const dbStatus = await getDbStatus();
  const db = dbStatus.mode === 'mongodb' ? await getMongoDb() : null;
  if (db) {
    const [tournaments, registrations, matches, standings, wheelSpins] = await Promise.all([
      db.collection('tournaments').countDocuments(),
      db.collection('registrations').countDocuments(),
      db.collection('matches').countDocuments(),
      db.collection('standings').countDocuments(),
      db.collection('wheel_spins').countDocuments()
    ]);
    return {
      dbStatus,
      counts: { tournaments, registrations, matches, standings, wheelSpins }
    };
  }
  const store = readLocalStore();
  return {
    dbStatus,
    counts: {
      tournaments: (store.tournaments || []).length,
      registrations: (store.registrations || []).length,
      matches: (store.matches || []).length,
      standings: (store.standings || []).length,
      wheelSpins: (store.wheelSpins || []).length
    }
  };
}

async function exportDatabaseSnapshot() {
  const dbStatus = await getDbStatus();
  const db = dbStatus.mode === 'mongodb' ? await getMongoDb() : null;
  if (db) {
    const [tournaments, registrations, matches, standings, wheelSpins] = await Promise.all([
      db.collection('tournaments').find({}).toArray(),
      db.collection('registrations').find({}).toArray(),
      db.collection('matches').find({}).toArray(),
      db.collection('standings').find({}).toArray(),
      db.collection('wheel_spins').find({}).toArray()
    ]);
    return {
      exportedAt: new Date().toISOString(),
      version: 1,
      mode: dbStatus.mode,
      collections: {
        tournaments: tournaments.map(stripMongoId),
        registrations: registrations.map(stripMongoId),
        matches: matches.map(stripMongoId),
        standings: standings.map(stripMongoId),
        wheelSpins: wheelSpins.map(stripMongoId)
      }
    };
  }
  const store = readLocalStore();
  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    mode: dbStatus.mode,
    collections: {
      tournaments: store.tournaments || [],
      registrations: store.registrations || [],
      matches: store.matches || [],
      standings: store.standings || [],
      wheelSpins: store.wheelSpins || []
    }
  };
}

async function importDatabaseSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.collections || typeof snapshot.collections !== 'object') {
    throw new Error('Invalid backup format: missing collections object.');
  }

  const { tournaments, registrations, matches, wheelSpins = [] } = snapshot.collections;
  if (!Array.isArray(tournaments) || !Array.isArray(registrations) || !Array.isArray(matches)) {
    throw new Error('Invalid backup format: tournaments, registrations, and matches must be arrays.');
  }
  if (!Array.isArray(wheelSpins)) {
    throw new Error('Invalid backup format: wheelSpins must be an array.');
  }

  const cleanTournaments = tournaments.map((t) => ({ ...stripMongoId(t), id: t.id || generateId('trn') }));
  const cleanRegistrations = registrations.map((r) => ({ ...stripMongoId(r), id: r.id || generateId('reg') }));
  const cleanMatches = matches.map((m) => ({ ...stripMongoId(m), id: m.id || generateId('mat') }));
  const cleanWheelSpins = wheelSpins.map((w) => ({ ...stripMongoId(w), id: w.id || generateId('spin') }));

  const db = await getMongoDb();
  if (db) {
    await Promise.all([
      db.collection('tournaments').deleteMany({}),
      db.collection('registrations').deleteMany({}),
      db.collection('matches').deleteMany({}),
      db.collection('standings').deleteMany({}),
      db.collection('wheel_spins').deleteMany({})
    ]);

    if (cleanTournaments.length > 0) await db.collection('tournaments').insertMany(cleanTournaments);
    if (cleanRegistrations.length > 0) await db.collection('registrations').insertMany(cleanRegistrations);
    if (cleanMatches.length > 0) await db.collection('matches').insertMany(cleanMatches);
    if (cleanWheelSpins.length > 0) await db.collection('wheel_spins').insertMany(cleanWheelSpins);

    await db.collection('meta').updateOne(
      { key: 'seed_status' },
      { $set: { key: 'seed_status', initialized: true, updatedAt: new Date().toISOString() } },
      { upsert: true }
    );
  } else {
    writeLocalStore({
      meta: { initialized: true },
      tournaments: cleanTournaments,
      registrations: cleanRegistrations,
      matches: cleanMatches,
      standings: [],
      wheelSpins: cleanWheelSpins
    });
  }

  for (const t of cleanTournaments) {
    await recalculateStandings(t.id);
  }

  return getDatabaseSummary();
}

async function purgeDatabaseScope(scope) {
  const validScopes = ['demo', 'wheel', 'matches', 'registrations', 'all'];
  if (!validScopes.includes(scope)) {
    throw new Error('Invalid purge scope.');
  }

  const db = await getMongoDb();

  if (scope === 'demo') {
    const seed = getSeedData();
    const seedTournamentIds = seed.tournaments.map((t) => t.id);
    const seedRegIds = seed.registrations.map((r) => r.id);
    const seedMatchIds = seed.matches.map((m) => m.id);

    if (db) {
      await Promise.all([
        db.collection('tournaments').deleteMany({ id: { $in: seedTournamentIds } }),
        db.collection('registrations').deleteMany({
          $or: [{ id: { $in: seedRegIds } }, { tournamentId: { $in: seedTournamentIds } }]
        }),
        db.collection('matches').deleteMany({
          $or: [{ id: { $in: seedMatchIds } }, { tournamentId: { $in: seedTournamentIds } }]
        }),
        db.collection('standings').deleteMany({ tournamentId: { $in: seedTournamentIds } }),
        db.collection('meta').updateOne(
          { key: 'seed_status' },
          { $set: { key: 'seed_status', initialized: true, updatedAt: new Date().toISOString() } },
          { upsert: true }
        )
      ]);
      const remaining = await db.collection('tournaments').find({}).toArray();
      for (const t of remaining) {
        await recalculateStandings(t.id);
      }
    } else {
      const store = readLocalStore();
      const tSet = new Set(seedTournamentIds);
      const rSet = new Set(seedRegIds);
      const mSet = new Set(seedMatchIds);
      store.tournaments = (store.tournaments || []).filter((t) => !tSet.has(t.id));
      store.registrations = (store.registrations || []).filter((r) => !rSet.has(r.id) && !tSet.has(r.tournamentId));
      store.matches = (store.matches || []).filter((m) => !mSet.has(m.id) && !tSet.has(m.tournamentId));
      store.standings = (store.standings || []).filter((s) => !tSet.has(s.tournamentId));
      store.meta = { ...(store.meta || {}), initialized: true };
      writeLocalStore(store);
      for (const t of store.tournaments) {
        await recalculateStandings(t.id);
      }
    }
    return getDatabaseSummary();
  }

  if (scope === 'wheel') {
    await clearWheelSpins();
    return getDatabaseSummary();
  }

  if (scope === 'matches') {
    if (db) {
      await db.collection('matches').deleteMany({});
      const remaining = await db.collection('tournaments').find({}).toArray();
      for (const t of remaining) {
        await recalculateStandings(t.id);
      }
    } else {
      const store = readLocalStore();
      store.matches = [];
      writeLocalStore(store);
      for (const t of store.tournaments || []) {
        await recalculateStandings(t.id);
      }
    }
    return getDatabaseSummary();
  }

  if (scope === 'registrations') {
    if (db) {
      await Promise.all([
        db.collection('registrations').deleteMany({}),
        db.collection('matches').deleteMany({}),
        db.collection('standings').deleteMany({})
      ]);
    } else {
      const store = readLocalStore();
      store.registrations = [];
      store.matches = [];
      store.standings = [];
      writeLocalStore(store);
    }
    return getDatabaseSummary();
  }

  // scope === 'all'
  if (db) {
    await Promise.all([
      db.collection('tournaments').deleteMany({}),
      db.collection('registrations').deleteMany({}),
      db.collection('matches').deleteMany({}),
      db.collection('standings').deleteMany({}),
      db.collection('wheel_spins').deleteMany({}),
      db.collection('meta').updateOne(
        { key: 'seed_status' },
        { $set: { key: 'seed_status', initialized: true, updatedAt: new Date().toISOString() } },
        { upsert: true }
      )
    ]);
  } else {
    writeLocalStore({
      meta: { initialized: true },
      tournaments: [],
      registrations: [],
      matches: [],
      standings: [],
      wheelSpins: []
    });
  }
  return getDatabaseSummary();
}

module.exports = {
  generateId,
  getDbStatus,
  listTournaments,
  getTournamentById,
  createTournament,
  updateTournament,
  deleteTournament,
  listRegistrations,
  getRegistrationById,
  createRegistration,
  updateRegistration,
  deleteRegistration,
  listMatches,
  saveMatch,
  saveManyMatches,
  deleteMatch,
  recalculateStandings,
  getStandings,
  listWheelSpins,
  logWheelSpin,
  clearWheelSpins,
  getDatabaseSummary,
  exportDatabaseSnapshot,
  importDatabaseSnapshot,
  purgeDatabaseScope,
  getCachedMode: () => cachedDbMode || ((process.env.MONGODB_URI || '').trim() ? 'mongodb' : 'local-preview')
};
