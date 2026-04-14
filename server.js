const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'tournaments.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'presenter.html')));
app.get('/config', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/config/:id', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'tournament-config.html')));

// --- Persistence helpers ---

fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ tournaments: [] }, null, 2));
}

function readData() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (!('activeTournamentId' in data)) data.activeTournamentId = null;
  data.tournaments.forEach(t => {
    if (!t.settings) t.settings = { presenterControlsEnabled: true };
  });
  return data;
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function findTournament(data, id) {
  return data.tournaments.find(t => t.id === id);
}

function makeMatchId(rounds, roundIndex) {
  const count = rounds[roundIndex].matches.length;
  return `r${roundIndex + 1}m${count + 1}`;
}

// --- Tournament routes ---

// GET /api/tournaments
app.get('/api/tournaments', (_req, res) => {
  res.json(readData().tournaments);
});

// POST /api/tournaments
app.post('/api/tournaments', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Tournament name is required.' });
  }
  const data = readData();
  const tournament = {
    id: crypto.randomUUID(),
    name: name.trim(),
    settings: { presenterControlsEnabled: true },
    rounds: []
  };
  data.tournaments.push(tournament);
  writeData(data);
  res.status(201).json(tournament);
});

// GET /api/tournaments/:id
app.get('/api/tournaments/:id', (req, res) => {
  const data = readData();
  const t = findTournament(data, req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found.' });
  res.json(t);
});

// PUT /api/tournaments/:id
app.put('/api/tournaments/:id', (req, res) => {
  const { name, settings } = req.body;
  const data = readData();
  const t = findTournament(data, req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found.' });
  if (name !== undefined) t.name = name.trim() || t.name;
  if (settings !== undefined) t.settings = { ...t.settings, ...settings };
  writeData(data);
  res.json(t);
});

// DELETE /api/tournaments/:id
app.delete('/api/tournaments/:id', (req, res) => {
  const data = readData();
  const index = data.tournaments.findIndex(t => t.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Not found.' });
  data.tournaments.splice(index, 1);
  if (data.activeTournamentId === req.params.id) data.activeTournamentId = null;
  writeData(data);
  res.json({ ok: true });
});

// GET /api/active
app.get('/api/active', (_req, res) => {
  const data = readData();
  const t = data.activeTournamentId
    ? data.tournaments.find(x => x.id === data.activeTournamentId) || null
    : null;
  res.json({ activeTournamentId: data.activeTournamentId, tournament: t });
});

// PUT /api/active
app.put('/api/active', (req, res) => {
  const { tournamentId } = req.body;
  const data = readData();
  if (tournamentId !== null && !data.tournaments.find(t => t.id === tournamentId)) {
    return res.status(404).json({ error: 'Tournament not found.' });
  }
  data.activeTournamentId = tournamentId || null;
  writeData(data);
  const t = data.activeTournamentId
    ? data.tournaments.find(x => x.id === data.activeTournamentId)
    : null;
  res.json({ activeTournamentId: data.activeTournamentId, tournament: t });
});

// --- Round routes ---

// POST /api/tournaments/:id/rounds
app.post('/api/tournaments/:id/rounds', (req, res) => {
  const data = readData();
  const t = findTournament(data, req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found.' });
  const { name } = req.body;
  t.rounds.push({ round: t.rounds.length + 1, name: name || '', matches: [] });
  writeData(data);
  res.status(201).json(t);
});

// PATCH /api/tournaments/:id/rounds/:ri
app.patch('/api/tournaments/:id/rounds/:ri', (req, res) => {
  const ri = parseInt(req.params.ri, 10);
  const { name } = req.body;
  const data = readData();
  const t = findTournament(data, req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found.' });
  const round = t.rounds[ri];
  if (!round) return res.status(404).json({ error: 'Round not found.' });
  round.name = name !== undefined ? name : round.name;
  writeData(data);
  res.json(t);
});

// DELETE /api/tournaments/:id/rounds/:ri
app.delete('/api/tournaments/:id/rounds/:ri', (req, res) => {
  const ri = parseInt(req.params.ri, 10);
  const data = readData();
  const t = findTournament(data, req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found.' });
  if (!t.rounds[ri]) return res.status(404).json({ error: 'Round not found.' });
  t.rounds.splice(ri, 1);
  t.rounds.forEach((r, i) => { r.round = i + 1; });
  writeData(data);
  res.json(t);
});

// --- Match routes ---

// POST /api/tournaments/:id/rounds/:ri/matches
app.post('/api/tournaments/:id/rounds/:ri/matches', (req, res) => {
  const ri = parseInt(req.params.ri, 10);
  const data = readData();
  const t = findTournament(data, req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found.' });
  const round = t.rounds[ri];
  if (!round) return res.status(404).json({ error: 'Round not found.' });
  const match = {
    id: makeMatchId(t.rounds, ri),
    competitors: Array.isArray(req.body.competitors) ? req.body.competitors : [],
    winner: null
  };
  round.matches.push(match);
  writeData(data);
  res.status(201).json(t);
});

// PUT /api/tournaments/:id/rounds/:ri/matches/:matchId
app.put('/api/tournaments/:id/rounds/:ri/matches/:matchId', (req, res) => {
  const ri = parseInt(req.params.ri, 10);
  const { matchId } = req.params;
  const data = readData();
  const t = findTournament(data, req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found.' });
  const round = t.rounds[ri];
  if (!round) return res.status(404).json({ error: 'Round not found.' });
  const match = round.matches.find(m => m.id === matchId);
  if (!match) return res.status(404).json({ error: 'Match not found.' });

  if (req.body.competitors !== undefined) {
    match.competitors = Array.isArray(req.body.competitors) ? req.body.competitors : [];
  }
  if ('winner' in req.body) {
    const w = req.body.winner;
    // Clear winner if it's not in the competitors list
    match.winner = (w && match.competitors.includes(w)) ? w : null;
  }

  writeData(data);
  res.json(t);
});

// DELETE /api/tournaments/:id/rounds/:ri/matches/:matchId
app.delete('/api/tournaments/:id/rounds/:ri/matches/:matchId', (req, res) => {
  const ri = parseInt(req.params.ri, 10);
  const { matchId } = req.params;
  const data = readData();
  const t = findTournament(data, req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found.' });
  const round = t.rounds[ri];
  if (!round) return res.status(404).json({ error: 'Round not found.' });
  const idx = round.matches.findIndex(m => m.id === matchId);
  if (idx === -1) return res.status(404).json({ error: 'Match not found.' });
  round.matches.splice(idx, 1);
  writeData(data);
  res.json(t);
});

app.listen(PORT, () => {
  console.log(`Bracket builder running at http://localhost:${PORT}`);
});
