function nextPow2(n) {
  if (n < 2) return 2;
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

// teamMap: { [teamId]: teamObj } — built from tournament.teams
const BYE_SENTINEL = { id: 'BYE', name: 'BYE' };

function generateBracket(teams) {
  const n = teams.length;
  const size = nextPow2(n);

  // Same seeding algorithm as before:
  // First `playCount` teams play each other in R1; the rest get byes.
  //   e.g. 5 teams → padded: [T1, T2, T3, null, T4, null, T5, null]
  //   R1: T1vT2, T3vBYE→T3, T4vBYE→T4, T5vBYE→T5
  //   R2: (winner r1m1) vs (winner r1m2), (winner r1m3) vs (winner r1m4)
  const playCount = 2 * n - size;
  const playingTeams = teams.slice(0, playCount);
  const byeTeams = teams.slice(playCount);
  // null signals a BYE slot
  const padded = [...playingTeams, ...byeTeams.flatMap(t => [t, null])];

  const rounds = [];
  let prevRoundMatches = null;

  for (let r = 1; padded.length >= 2 || (prevRoundMatches && prevRoundMatches.length >= 2); r++) {
    const matches = [];

    if (r === 1) {
      for (let i = 0; i < padded.length; i += 2) {
        const team = padded[i];       // real team or null (BYE)
        const opponent = padded[i + 1]; // real team or null (BYE)

        const team1Source = team ? { type: 'team', teamId: team.id } : { type: 'bye' };
        const team2Source = opponent ? { type: 'team', teamId: opponent.id } : { type: 'bye' };

        // Pre-resolve BYE matches at generation time
        let result = null;
        let status = 'pending';
        if (!team && opponent) {
          result = { winner: opponent.id, method: 'bye' };
          status = 'complete';
        } else if (team && !opponent) {
          result = { winner: team.id, method: 'bye' };
          status = 'complete';
        }

        matches.push({
          id: `r${r}m${Math.floor(i / 2) + 1}`,
          team1Source,
          team2Source,
          team1Override: null,
          team2Override: null,
          result,
          status
        });
      }
    } else {
      // Generate source references from previous round matches
      for (let i = 0; i < prevRoundMatches.length; i += 2) {
        const m1 = prevRoundMatches[i];
        const m2 = prevRoundMatches[i + 1];
        matches.push({
          id: `r${r}m${Math.floor(i / 2) + 1}`,
          team1Source: { type: 'winner', matchId: m1.id },
          team2Source: { type: 'winner', matchId: m2.id },
          team1Override: null,
          team2Override: null,
          result: null,
          status: 'pending'
        });
      }
    }

    rounds.push({ round: r, matches });
    prevRoundMatches = matches;

    if (matches.length === 1) break;
  }

  return rounds;
}

// Pure function: resolve what team occupies a slot.
// source: { type: 'team'|'winner'|'loser'|'bye', teamId?, matchId? }
// override: teamId string or null
// allMatches: flat array of all matches
// teamMap: { [id]: teamObj }
// Returns a team object or null (unresolved/TBD).
function resolveTeam(source, override, allMatches, teamMap) {
  if (override != null) {
    return teamMap[override] || null;
  }
  if (!source) return null;

  switch (source.type) {
    case 'team':
      return teamMap[source.teamId] || null;

    case 'bye':
      return BYE_SENTINEL;

    case 'winner': {
      const match = allMatches.find(m => m.id === source.matchId);
      if (!match || !match.result) return null;
      return teamMap[match.result.winner] || null;
    }

    case 'loser': {
      const match = allMatches.find(m => m.id === source.matchId);
      if (!match || !match.result) return null;
      // Resolve both slots of the referenced match to find the loser
      const t1 = resolveTeam(match.team1Source, match.team1Override, allMatches, teamMap);
      const t2 = resolveTeam(match.team2Source, match.team2Override, allMatches, teamMap);
      if (t1 && t1.id === match.result.winner) return t2;
      if (t2 && t2.id === match.result.winner) return t1;
      return null;
    }

    default:
      return null;
  }
}

// Returns true if either slot resolves to the BYE sentinel.
function isByeMatch(match, allMatches, teamMap) {
  const t1 = resolveTeam(match.team1Source, match.team1Override, allMatches, teamMap);
  const t2 = resolveTeam(match.team2Source, match.team2Override, allMatches, teamMap);
  return !!(t1 && t1.id === 'BYE') || !!(t2 && t2.id === 'BYE');
}

// Clears a match's result. No cascade needed — downstream matches hold source
// references, not copied strings, so they naturally re-resolve to null (TBD).
function resetFromMatch(rounds, matchId) {
  for (const round of rounds) {
    const match = round.matches.find(m => m.id === matchId);
    if (!match) continue;

    // Don't allow resetting auto-resolved BYE matches
    if (match.result && match.result.method === 'bye') return false;

    match.result = null;
    match.status = 'pending';
    return true;
  }
  return false;
}

// Append a manually-injected match to an existing round.
// Teams are expressed directly as team sources (not overrides) so resolveTeam works without changes.
function addMatchToRound(rounds, roundIndex, teamId1, teamId2) {
  const round = rounds[roundIndex];
  if (!round) return null;
  const matchNum = round.matches.length + 1;
  const match = {
    id: `r${roundIndex + 1}m${matchNum}`,
    team1Source: { type: 'team', teamId: teamId1 },
    team2Source: { type: 'team', teamId: teamId2 },
    team1Override: null,
    team2Override: null,
    result: null,
    status: 'pending'
  };
  round.matches.push(match);
  return match;
}

// Re-assign all match IDs after a round is inserted or removed, and patch any
// winner/loser source references to point to the new IDs. Used server-side only.
function reindexRounds(rounds) {
  const idMap = {};
  rounds.forEach((round, ri) => {
    round.round = ri + 1;
    round.matches.forEach((match, mi) => {
      const newId = `r${ri + 1}m${mi + 1}`;
      if (match.id !== newId) idMap[match.id] = newId;
      match.id = newId;
    });
  });
  rounds.forEach(round => {
    round.matches.forEach(match => {
      if (match.team1Source?.matchId && idMap[match.team1Source.matchId]) {
        match.team1Source = { ...match.team1Source, matchId: idMap[match.team1Source.matchId] };
      }
      if (match.team2Source?.matchId && idMap[match.team2Source.matchId]) {
        match.team2Source = { ...match.team2Source, matchId: idMap[match.team2Source.matchId] };
      }
    });
  });
}

module.exports = { nextPow2, generateBracket, resolveTeam, isByeMatch, resetFromMatch, addMatchToRound, reindexRounds };
