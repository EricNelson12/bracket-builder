// Shared bracket utilities used by both config.js and presenter.js

const BYE_SENTINEL = { id: 'BYE', name: 'BYE' };

// Resolve what team occupies a slot.
// source: { type: 'team'|'winner'|'loser'|'bye', teamId?, matchId? }
// override: teamId string or null
// allMatches: flat array of all matches in the tournament
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

// Returns true if either slot of the match resolves to the BYE sentinel.
function isByeMatch(match, allMatches, teamMap) {
  const t1 = resolveTeam(match.team1Source, match.team1Override, allMatches, teamMap);
  const t2 = resolveTeam(match.team2Source, match.team2Override, allMatches, teamMap);
  return !!(t1 && t1.id === 'BYE') || !!(t2 && t2.id === 'BYE');
}


function nextPow2(n) {
  if (n < 2) return 2;
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

function bracketSizeInfo(teamCount) {
  const size = nextPow2(teamCount);
  const byes = size - teamCount;
  return { size, byes };
}

function roundName(roundIndex, totalRounds) {
  const remaining = totalRounds - roundIndex;
  if (remaining === 1) return 'Final';
  if (remaining === 2) return 'Semifinals';
  if (remaining === 3) return 'Quarterfinals';
  return `Round ${roundIndex + 1}`;
}
