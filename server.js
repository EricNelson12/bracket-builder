const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { generateBracket, resetFromMatch, addMatchToRound } = require('./lib/bracket');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'tournaments.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'presenter.html')));
app.get('/config', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/config/:id', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'tournament-config.html')));
app.get('/register', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));
app.get('/register/:id', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));

// --- Persistence helpers ---

// Ensure data directory and file exist on startup
fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ tournaments: [] }, null, 2));
}
fs.mkdirSync(path.join(__dirname, 'public', 'uploads'), { recursive: true });

const upload = multer({
  dest: path.join(__dirname, 'public', 'uploads'),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) { cb(null, /^image\//.test(file.mimetype)); }
});

function readData() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  // Migration: ensure settings exists on all tournaments
  data.tournaments.forEach(t => {
    if (!t.settings) {
      t.settings = { presenterControlsEnabled: true, startTime: null, registrationCutoff: null };
    }
  });
  return data;
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function toTeamObjects(names) {
  return names.map((name, i) => ({
    id: crypto.randomUUID(),
    name,
    seed: i + 1,
    status: 'active'
  }));
}

// --- Routes ---

// GET /api/tournaments
app.get('/api/tournaments', (_req, res) => {
  const data = readData();
  res.json(data.tournaments);
});

// POST /api/tournaments
app.post('/api/tournaments', (req, res) => {
  const { name, teams } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Tournament name is required.' });
  }

  const teamList = Array.isArray(teams) ? teams : [];
  const teamObjects = toTeamObjects(teamList);
  const data = readData();
  const tournament = {
    id: crypto.randomUUID(),
    name,
    teams: teamObjects,
    rounds: teamObjects.length >= 2 ? generateBracket(teamObjects) : [],
    settings: { presenterControlsEnabled: true, startTime: null, registrationCutoff: null }
  };
  data.tournaments.push(tournament);
  writeData(data);
  res.status(201).json(tournament);
});

// DELETE /api/tournaments/:id
app.delete('/api/tournaments/:id', (req, res) => {
  const data = readData();
  const index = data.tournaments.findIndex(t => t.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Not found.' });
  data.tournaments.splice(index, 1);
  writeData(data);
  res.json({ ok: true });
});

// GET /api/tournaments/open — tournaments with registration open
app.get('/api/tournaments/open', (_req, res) => {
  const now = new Date();
  const open = readData().tournaments.filter(t => {
    const cutoff = t.settings?.registrationCutoff;
    return !cutoff || new Date(cutoff) > now;
  });
  res.json(open.map(t => ({
    id: t.id,
    name: t.name,
    teamCount: t.teams.length,
    registrationCutoff: t.settings?.registrationCutoff || null
  })));
});

// GET /api/tournaments/:id — fetch single tournament
app.get('/api/tournaments/:id', (req, res) => {
  const data = readData();
  const tournament = data.tournaments.find(t => t.id === req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Not found.' });
  res.json(tournament);
});

// PUT /api/tournaments/:id — edit name, teams, and/or settings
app.put('/api/tournaments/:id', (req, res) => {
  const { name, teams, settings } = req.body;
  const data = readData();
  const tournament = data.tournaments.find(t => t.id === req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found.' });

  if (name !== undefined) tournament.name = name;

  if (teams !== undefined) {
    if (!Array.isArray(teams)) {
      return res.status(400).json({ error: 'teams must be an array.' });
    }
    const teamObjects = toTeamObjects(teams);
    tournament.teams = teamObjects;
    tournament.rounds = teamObjects.length >= 2 ? generateBracket(teamObjects) : [];
  }

  if (settings !== undefined) {
    tournament.settings = { ...tournament.settings, ...settings };
  }

  writeData(data);
  res.json(tournament);
});

// DELETE /api/tournaments/:id/matches/:matchId — clear winner
app.delete('/api/tournaments/:id/matches/:matchId', (req, res) => {
  const data = readData();
  const tournament = data.tournaments.find(t => t.id === req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found.' });

  const cleared = resetFromMatch(tournament.rounds, req.params.matchId);
  if (!cleared) return res.status(404).json({ error: 'Match not found or cannot be cleared.' });

  writeData(data);
  res.json(tournament);
});

// PUT /api/tournaments/:id/matches/:matchId — set (or change) winner
app.put('/api/tournaments/:id/matches/:matchId', (req, res) => {
  const { winner, method } = req.body;
  if (!winner) return res.status(400).json({ error: 'winner is required.' });

  const data = readData();
  const tournament = data.tournaments.find(t => t.id === req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found.' });

  const validTeamId = tournament.teams.some(t => t.id === winner);
  if (!validTeamId) return res.status(400).json({ error: 'Invalid team id.' });

  const match = tournament.rounds.flatMap(r => r.matches).find(m => m.id === req.params.matchId);
  if (!match) return res.status(404).json({ error: 'Match not found.' });

  match.result = { winner, method: method || null };
  match.status = 'complete';

  writeData(data);
  res.json(tournament);
});


// PATCH /api/tournaments/:id/matches/:matchId/overrides — set or clear slot overrides
app.patch('/api/tournaments/:id/matches/:matchId/overrides', (req, res) => {
  const { team1Override, team2Override } = req.body;
  const data = readData();
  const tournament = data.tournaments.find(t => t.id === req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found.' });

  const match = tournament.rounds.flatMap(r => r.matches).find(m => m.id === req.params.matchId);
  if (!match) return res.status(404).json({ error: 'Match not found.' });

  if (team1Override !== undefined) {
    if (team1Override !== null && !tournament.teams.some(t => t.id === team1Override)) {
      return res.status(400).json({ error: 'Invalid team1Override.' });
    }
    match.team1Override = team1Override;
  }
  if (team2Override !== undefined) {
    if (team2Override !== null && !tournament.teams.some(t => t.id === team2Override)) {
      return res.status(400).json({ error: 'Invalid team2Override.' });
    }
    match.team2Override = team2Override;
  }

  writeData(data);
  res.json(tournament);
});

// PATCH /api/tournaments/:id/teams/:teamId — update team name and/or status
app.patch('/api/tournaments/:id/teams/:teamId', (req, res) => {
  const { status, name } = req.body;

  if (status !== undefined && !['active', 'dropped'].includes(status)) {
    return res.status(400).json({ error: 'status must be "active" or "dropped".' });
  }
  if (name !== undefined && (!name || !name.trim())) {
    return res.status(400).json({ error: 'Team name cannot be empty.' });
  }

  const data = readData();
  const tournament = data.tournaments.find(t => t.id === req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found.' });

  const team = tournament.teams.find(t => t.id === req.params.teamId);
  if (!team) return res.status(404).json({ error: 'Team not found.' });

  if (status !== undefined) team.status = status;
  if (name !== undefined) team.name = name.trim();

  writeData(data);
  res.json(tournament);
});

// DELETE /api/tournaments/:id/teams/:teamId — remove a team
app.delete('/api/tournaments/:id/teams/:teamId', (req, res) => {
  const data = readData();
  const tournament = data.tournaments.find(t => t.id === req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found.' });

  const teamIndex = tournament.teams.findIndex(t => t.id === req.params.teamId);
  if (teamIndex === -1) return res.status(404).json({ error: 'Team not found.' });

  const { teamId } = req.params;
  const allMatches = tournament.rounds.flatMap(r => r.matches);

  // Block if the team appears in any match source, override, or result
  const isReferenced = allMatches.some(m =>
    m.team1Source?.teamId === teamId ||
    m.team2Source?.teamId === teamId ||
    m.team1Override === teamId ||
    m.team2Override === teamId ||
    m.result?.winner === teamId
  );
  if (isReferenced) {
    return res.status(400).json({ error: 'Cannot delete a team that is referenced in the bracket. Regenerate the bracket first.' });
  }

  tournament.teams.splice(teamIndex, 1);
  writeData(data);
  res.json(tournament);
});

// POST /api/tournaments/:id/teams — add a team mid-event (no bracket regen)
app.post('/api/tournaments/:id/teams', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Team name is required.' });

  const data = readData();
  const tournament = data.tournaments.find(t => t.id === req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found.' });

  const team = {
    id: crypto.randomUUID(),
    name: name.trim(),
    seed: tournament.teams.length + 1,
    status: 'active'
  };
  tournament.teams.push(team);
  writeData(data);
  res.status(201).json(tournament);
});

// POST /api/tournaments/:id/register — public team registration (multipart/form-data)
app.post('/api/tournaments/:id/register', upload.single('picture'), (req, res) => {
  const { name, captain } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Team name is required.' });
  }

  const data = readData();
  const tournament = data.tournaments.find(t => t.id === req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found.' });

  const cutoff = tournament.settings?.registrationCutoff;
  if (cutoff && new Date(cutoff) < new Date()) {
    return res.status(400).json({ error: 'Registration is closed.' });
  }

  const team = {
    id: crypto.randomUUID(),
    name: name.trim(),
    seed: tournament.teams.length + 1,
    status: 'active',
    captain: captain ? captain.trim() : null,
    picture: req.file ? `/uploads/${req.file.filename}` : null
  };

  tournament.teams.push(team);
  writeData(data);
  res.status(201).json({ ok: true, team });
});

// POST /api/tournaments/:id/rounds/:roundIndex/matches — inject a match into a round
app.post('/api/tournaments/:id/rounds/:roundIndex/matches', (req, res) => {
  const { team1, team2 } = req.body;
  const roundIndex = parseInt(req.params.roundIndex, 10);

  if (!team1 || !team2) return res.status(400).json({ error: 'team1 and team2 are required.' });

  const data = readData();
  const tournament = data.tournaments.find(t => t.id === req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found.' });

  if (!tournament.teams.some(t => t.id === team1)) return res.status(400).json({ error: 'Invalid team1.' });
  if (!tournament.teams.some(t => t.id === team2)) return res.status(400).json({ error: 'Invalid team2.' });

  const match = addMatchToRound(tournament.rounds, roundIndex, team1, team2);
  if (!match) return res.status(404).json({ error: 'Round not found.' });

  writeData(data);
  res.status(201).json(tournament);
});

// POST /api/tournaments/:id/rounds — append a new empty round
app.post('/api/tournaments/:id/rounds', (req, res) => {
  const data = readData();
  const tournament = data.tournaments.find(t => t.id === req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found.' });

  tournament.rounds.push({ round: tournament.rounds.length + 1, matches: [] });
  writeData(data);
  res.status(201).json(tournament);
});

// POST /api/tournaments/:id/regenerate — rebuild bracket from current (non-dropped) teams
app.post('/api/tournaments/:id/regenerate', (req, res) => {
  const data = readData();
  const tournament = data.tournaments.find(t => t.id === req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found.' });

  const activeTeams = tournament.teams.filter(t => t.status !== 'dropped');
  if (activeTeams.length < 2) {
    return res.status(400).json({ error: 'At least 2 active teams are required to generate a bracket.' });
  }

  tournament.rounds = generateBracket(activeTeams);
  writeData(data);
  res.json(tournament);
});

// PATCH /api/tournaments/:id/rounds/:roundIndex — rename a round
app.patch('/api/tournaments/:id/rounds/:roundIndex', (req, res) => {
  const roundIndex = parseInt(req.params.roundIndex, 10);
  const { name } = req.body;

  const data = readData();
  const tournament = data.tournaments.find(t => t.id === req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found.' });

  const round = tournament.rounds[roundIndex];
  if (!round) return res.status(404).json({ error: 'Round not found.' });

  // null or empty string clears the custom name (falls back to computed name in UI)
  round.name = (name && name.trim()) ? name.trim() : undefined;
  if (round.name === undefined) delete round.name;

  writeData(data);
  res.json(tournament);
});

// DELETE /api/tournaments/:id/rounds/:roundIndex — remove a round
app.delete('/api/tournaments/:id/rounds/:roundIndex', (req, res) => {
  const roundIndex = parseInt(req.params.roundIndex, 10);

  const data = readData();
  const tournament = data.tournaments.find(t => t.id === req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found.' });

  const round = tournament.rounds[roundIndex];
  if (!round) return res.status(404).json({ error: 'Round not found.' });

  // Block if any match in this round has a result
  if (round.matches.some(m => m.status === 'complete')) {
    return res.status(400).json({ error: 'Cannot delete a round with completed matches.' });
  }

  // Block if any match in this round is referenced by matches in other rounds
  const matchIdsInRound = new Set(round.matches.map(m => m.id));
  const otherMatches = tournament.rounds
    .filter((_, i) => i !== roundIndex)
    .flatMap(r => r.matches);
  const isReferenced = otherMatches.some(m =>
    matchIdsInRound.has(m.team1Source?.matchId) ||
    matchIdsInRound.has(m.team2Source?.matchId)
  );
  if (isReferenced) {
    return res.status(400).json({ error: 'Cannot delete a round referenced by other rounds.' });
  }

  tournament.rounds.splice(roundIndex, 1);
  // Re-number the round field on remaining rounds
  tournament.rounds.forEach((r, i) => { r.round = i + 1; });

  writeData(data);
  res.json(tournament);
});

// DELETE /api/tournaments/:id/rounds/:roundIndex/matches/:matchId — remove an injected match
app.delete('/api/tournaments/:id/rounds/:roundIndex/matches/:matchId', (req, res) => {
  const roundIndex = parseInt(req.params.roundIndex, 10);
  const { matchId } = req.params;

  const data = readData();
  const tournament = data.tournaments.find(t => t.id === req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found.' });

  const round = tournament.rounds[roundIndex];
  if (!round) return res.status(404).json({ error: 'Round not found.' });

  const matchIndex = round.matches.findIndex(m => m.id === matchId);
  if (matchIndex === -1) return res.status(404).json({ error: 'Match not found.' });

  const match = round.matches[matchIndex];
  if (match.status !== 'pending') {
    return res.status(400).json({ error: 'Cannot delete a completed match.' });
  }

  const allMatches = tournament.rounds.flatMap(r => r.matches);
  const isReferenced = allMatches.some(m =>
    m.id !== matchId &&
    (m.team1Source?.matchId === matchId || m.team2Source?.matchId === matchId)
  );
  if (isReferenced) {
    return res.status(400).json({ error: 'Cannot delete a match referenced by other matches.' });
  }

  round.matches.splice(matchIndex, 1);
  writeData(data);
  res.json(tournament);
});

app.listen(PORT, () => {
  console.log(`Bracket builder running at http://localhost:${PORT}`);
});
