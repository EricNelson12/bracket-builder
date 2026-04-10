const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generateBracket, propagateWinner, resetFromMatch } = require('./lib/bracket');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'tournaments.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'presenter.html')));
app.get('/config', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// --- Persistence helpers ---

// Ensure data directory and file exist on startup
fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ tournaments: [] }, null, 2));
}

function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// --- Routes ---

// GET /api/tournaments
app.get('/api/tournaments', (req, res) => {
  const data = readData();
  res.json(data.tournaments);
});

// POST /api/tournaments
app.post('/api/tournaments', (req, res) => {
  const { name, teams } = req.body;
  if (!name || !Array.isArray(teams) || teams.length < 2) {
    return res.status(400).json({ error: 'Name and at least 2 teams are required.' });
  }

  const data = readData();
  const tournament = {
    id: crypto.randomUUID(),
    name,
    teams,
    rounds: generateBracket(teams)
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

// PUT /api/tournaments/:id — edit name and/or teams
app.put('/api/tournaments/:id', (req, res) => {
  const { name, teams } = req.body;
  const data = readData();
  const tournament = data.tournaments.find(t => t.id === req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found.' });

  if (name !== undefined) tournament.name = name;

  if (teams !== undefined) {
    if (!Array.isArray(teams) || teams.length < 2) {
      return res.status(400).json({ error: 'At least 2 teams are required.' });
    }
    tournament.teams = teams;
    tournament.rounds = generateBracket(teams);
  }

  writeData(data);
  res.json(tournament);
});

// DELETE /api/tournaments/:id/matches/:matchId — clear winner and propagate nulls upstream
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
  const { winner } = req.body;
  if (!winner) return res.status(400).json({ error: 'winner is required.' });

  const data = readData();
  const tournament = data.tournaments.find(t => t.id === req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found.' });

  // If match already has a winner, reset downstream before setting the new one
  const existingMatch = tournament.rounds.flatMap(r => r.matches).find(m => m.id === req.params.matchId);
  if (existingMatch && existingMatch.winner) {
    resetFromMatch(tournament.rounds, req.params.matchId);
  }

  const found = propagateWinner(tournament.rounds, req.params.matchId, winner);
  if (!found) return res.status(404).json({ error: 'Match not found.' });

  writeData(data);
  res.json(tournament);
});


app.listen(PORT, () => {
  console.log(`Bracket builder running at http://localhost:${PORT}`);
});
