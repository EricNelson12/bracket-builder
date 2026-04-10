function nextPow2(n) {
  if (n < 2) return 2;
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

function generateBracket(teams) {
  const n = teams.length;
  const size = nextPow2(n);

  // Teams play in input order. The first `playCount` teams are paired for R1
  // matches; the remaining teams each get a bye (paired with BYE).
  // This avoids BYE vs BYE and preserves the user-specified order.
  //   e.g. 5 teams → [T1, T2, T3, BYE, T4, BYE, T5, BYE]
  //   R1: T1vT2, T3vBYE→T3, T4vBYE→T4, T5vBYE→T5
  //   R2: (T1/T2 winner) vs T3, T4 vs T5
  const playCount = 2 * n - size; // always even; teams that actually play in R1
  const playingTeams = teams.slice(0, playCount);
  const byeTeams = teams.slice(playCount);
  const padded = [...playingTeams, ...byeTeams.flatMap(t => [t, 'BYE'])];

  const rounds = [];
  let currentTeams = padded;

  for (let r = 1; currentTeams.length >= 2; r++) {
    const matches = [];
    for (let i = 0; i < currentTeams.length; i += 2) {
      const team1 = currentTeams[i];
      const team2 = currentTeams[i + 1];
      let winner = null;
      if (team1 === 'BYE' && team2 !== 'BYE') winner = team2;
      else if (team2 === 'BYE' && team1 !== 'BYE') winner = team1;
      // BYE vs BYE: winner stays null (shouldn't happen with proper seeding)
      matches.push({
        id: `r${r}m${Math.floor(i / 2) + 1}`,
        team1,
        team2,
        winner
      });
    }
    rounds.push({ round: r, matches });
    currentTeams = matches.map(m => m.winner);
  }

  return rounds;
}

function propagateWinner(rounds, matchId, winner) {
  for (let r = 0; r < rounds.length; r++) {
    const matchIndex = rounds[r].matches.findIndex(m => m.id === matchId);
    if (matchIndex === -1) continue;

    rounds[r].matches[matchIndex].winner = winner;

    // Cascade forward: keep propagating as long as the next match auto-resolves via BYE
    let curR = r;
    let curMatchIndex = matchIndex;
    let curWinner = winner;

    while (curR + 1 < rounds.length) {
      const nextMatchIndex = Math.floor(curMatchIndex / 2);
      const isTop = curMatchIndex % 2 === 0;
      const nextMatch = rounds[curR + 1].matches[nextMatchIndex];

      if (isTop) {
        nextMatch.team1 = curWinner;
      } else {
        nextMatch.team2 = curWinner;
      }

      // Auto-resolve if the other slot is a BYE
      if (nextMatch.team1 === 'BYE' && nextMatch.team2 && nextMatch.team2 !== 'BYE') {
        nextMatch.winner = nextMatch.team2;
      } else if (nextMatch.team2 === 'BYE' && nextMatch.team1 && nextMatch.team1 !== 'BYE') {
        nextMatch.winner = nextMatch.team1;
      } else {
        break;
      }

      curR = curR + 1;
      curMatchIndex = nextMatchIndex;
      curWinner = nextMatch.winner;
    }

    return true;
  }
  return false;
}

// Clears a match's winner and cascades nulls forward through any rounds that
// were derived from it. Stops when it reaches a match that had no winner yet
// (meaning nothing further was propagated from it).
function resetFromMatch(rounds, matchId) {
  for (let r = 0; r < rounds.length; r++) {
    const matchIndex = rounds[r].matches.findIndex(m => m.id === matchId);
    if (matchIndex === -1) continue;

    // Don't allow resetting auto-resolved BYE matches
    const match = rounds[r].matches[matchIndex];
    if (match.team1 === 'BYE' || match.team2 === 'BYE') return false;

    rounds[r].matches[matchIndex].winner = null;

    let curR = r;
    let curMatchIndex = matchIndex;

    while (curR + 1 < rounds.length) {
      const nextMatchIndex = Math.floor(curMatchIndex / 2);
      const isTop = curMatchIndex % 2 === 0;
      const nextMatch = rounds[curR + 1].matches[nextMatchIndex];
      const hadWinner = nextMatch.winner !== null;

      if (isTop) {
        nextMatch.team1 = null;
      } else {
        nextMatch.team2 = null;
      }
      nextMatch.winner = null;

      // Only keep cascading if the next match had a winner that was further propagated
      if (!hadWinner) break;

      curR = curR + 1;
      curMatchIndex = nextMatchIndex;
    }

    return true;
  }
  return false;
}

module.exports = { nextPow2, generateBracket, propagateWinner, resetFromMatch };
