const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { generateBracket, propagateWinner, resetFromMatch } = require('../lib/bracket');

// ── Helpers ──────────────────────────────────────────────────────────────────

function teams(n) {
  return Array.from({ length: n }, (_, i) => `T${i + 1}`);
}

// ── generateBracket ───────────────────────────────────────────────────────────

describe('generateBracket - structure', () => {
  test('4 teams → 2 rounds, correct match counts', () => {
    const rounds = generateBracket(teams(4));
    assert.equal(rounds.length, 2);
    assert.equal(rounds[0].matches.length, 2); // QF
    assert.equal(rounds[1].matches.length, 1); // Final
  });

  test('8 teams → 3 rounds', () => {
    const rounds = generateBracket(teams(8));
    assert.equal(rounds.length, 3);
    assert.equal(rounds[0].matches.length, 4); // QF
    assert.equal(rounds[1].matches.length, 2); // SF
    assert.equal(rounds[2].matches.length, 1); // Final
  });

  test('2 teams → 1 round (just a final)', () => {
    const rounds = generateBracket(teams(2));
    assert.equal(rounds.length, 1);
    assert.equal(rounds[0].matches.length, 1);
  });
});

describe('generateBracket - bye seeding', () => {
  test('5 teams: first two teams in the list play each other in R1', () => {
    const rounds = generateBracket(['T1', 'T2', 'T3', 'T4', 'T5']);
    const r1 = rounds[0].matches;
    // Input order is preserved — first match is T1 vs T2
    assert.equal(r1[0].team1, 'T1');
    assert.equal(r1[0].team2, 'T2');
  });

  test('5 teams [A,B,C,D,E]: A vs B is first match, not D vs E', () => {
    // Regression: old algorithm put bottom seeds first, so D vs E appeared first.
    const rounds = generateBracket(['A', 'B', 'C', 'D', 'E']);
    const first = rounds[0].matches[0];
    assert.equal(first.team1, 'A');
    assert.equal(first.team2, 'B');
  });

  test('5 teams: no BYE vs BYE in any round', () => {
    const rounds = generateBracket(['T1', 'T2', 'T3', 'T4', 'T5']);
    for (const round of rounds) {
      for (const match of round.matches) {
        const bothBye = match.team1 === 'BYE' && match.team2 === 'BYE';
        assert.equal(bothBye, false, `Round ${round.round} has BYE vs BYE`);
      }
    }
  });

  test('5 teams: last 3 teams get byes and auto-advance to R2', () => {
    const rounds = generateBracket(['T1', 'T2', 'T3', 'T4', 'T5']);
    const r1 = rounds[0].matches;
    // T3, T4, T5 each face a BYE and auto-advance
    const byeMatches = r1.filter(m => m.team1 === 'BYE' || m.team2 === 'BYE');
    assert.equal(byeMatches.length, 3);
    for (const m of byeMatches) {
      assert.notEqual(m.winner, null, 'Bye match should auto-resolve');
      assert.notEqual(m.winner, 'BYE', 'Winner should not be BYE');
    }
  });

  test('5 teams: R2 is (T1/T2 winner) vs T3, and T4 vs T5', () => {
    const rounds = generateBracket(['T1', 'T2', 'T3', 'T4', 'T5']);
    const r2 = rounds[1].matches;
    assert.equal(r2.length, 2);
    // R2m1: slot for T1/T2 winner (null until played) vs T3 (bye auto-advance)
    assert.equal(r2[0].team1, null);
    assert.equal(r2[0].team2, 'T3');
    // R2m2: T4 vs T5 (both had byes)
    assert.equal(r2[1].team1, 'T4');
    assert.equal(r2[1].team2, 'T5');
  });

  test('3 teams: T1 vs T2 play R1, T3 gets a bye', () => {
    const rounds = generateBracket(['T1', 'T2', 'T3']);
    const r1 = rounds[0].matches;
    assert.equal(r1[0].team1, 'T1');
    assert.equal(r1[0].team2, 'T2');
    // T3 bye match auto-resolves
    const byeMatch = r1.find(m => m.team1 === 'BYE' || m.team2 === 'BYE');
    assert.equal(byeMatch.winner, 'T3');
  });

  test('6 teams: no BYE vs BYE', () => {
    const rounds = generateBracket(teams(6));
    for (const round of rounds) {
      for (const match of round.matches) {
        assert.equal(
          match.team1 === 'BYE' && match.team2 === 'BYE',
          false
        );
      }
    }
  });
});

// ── propagateWinner ───────────────────────────────────────────────────────────

describe('propagateWinner - advancement', () => {
  test('win R1 match → appear in R2 slot', () => {
    const rounds = generateBracket(teams(8));
    propagateWinner(rounds, 'r1m1', 'T1');
    assert.equal(rounds[1].matches[0].team1, 'T1');
  });

  test('T1 wins the quarterfinal and appears in the semifinal', () => {
    const rounds = generateBracket(teams(8));
    propagateWinner(rounds, 'r1m1', 'T1');
    const sf = rounds[1].matches[0];
    assert.equal(sf.team1, 'T1');
  });

  test('T1 wins the semifinal and appears in the final', () => {
    const rounds = generateBracket(teams(8));
    propagateWinner(rounds, 'r1m1', 'T1');
    propagateWinner(rounds, 'r1m2', 'T3');
    propagateWinner(rounds, 'r2m1', 'T1');
    const final = rounds[2].matches[0];
    assert.equal(final.team1, 'T1');
  });

  test('top-half R1 winner → team1 slot of next match', () => {
    const rounds = generateBracket(teams(8));
    // r1m1 is index 0 (even) → feeds team1
    propagateWinner(rounds, 'r1m1', 'T1');
    assert.equal(rounds[1].matches[0].team1, 'T1');
  });

  test('bottom-half R1 winner → team2 slot of next match', () => {
    const rounds = generateBracket(teams(8));
    // r1m2 is index 1 (odd) → feeds team2
    propagateWinner(rounds, 'r1m2', 'T3');
    assert.equal(rounds[1].matches[0].team2, 'T3');
  });

  test('unknown matchId → returns false', () => {
    const rounds = generateBracket(teams(4));
    const result = propagateWinner(rounds, 'r99m99', 'T1');
    assert.equal(result, false);
  });

  test('winning the final sets the champion', () => {
    const rounds = generateBracket(teams(4));
    propagateWinner(rounds, 'r1m1', 'T1');
    propagateWinner(rounds, 'r1m2', 'T3');
    propagateWinner(rounds, 'r2m1', 'T1');
    const final = rounds[rounds.length - 1].matches[0];
    assert.equal(final.winner, 'T1');
  });
});

describe('regression: T5 must not auto-advance to the final in a 5-team bracket', () => {
  // Bug: old code padded [T1,T2,T3,T4,T5,BYE,BYE,BYE], causing T5 to face BYE
  // in R1, then the "BYE winner" to face T5 in R2, cascading T5 to the final
  // before any matches were played.
  test('no team is pre-placed in the final at bracket creation', () => {
    const rounds = generateBracket(['T1', 'T2', 'T3', 'T4', 'T5']);
    const final = rounds[rounds.length - 1].matches[0];
    assert.equal(final.team1, null, 'final team1 should be empty at start');
    assert.equal(final.team2, null, 'final team2 should be empty at start');
    assert.equal(final.winner, null, 'final should have no winner at start');
  });

  test('T5 is in R2 (via bye) but not the final at bracket creation', () => {
    // T5 gets a bye and legitimately auto-advances to R2 — that's correct.
    // The bug was T5 cascading all the way to the final without playing.
    const rounds = generateBracket(['T1', 'T2', 'T3', 'T4', 'T5']);
    const final = rounds[rounds.length - 1].matches[0];
    assert.equal(final.team1, null, 'final team1 should be empty at start');
    assert.equal(final.team2, null, 'final team2 should be empty at start');
    assert.equal(final.winner, null, 'final should have no winner at start');
  });

  test('T1 can reach the final only by winning R1 then R2', () => {
    const rounds = generateBracket(['T1', 'T2', 'T3', 'T4', 'T5']);
    // T1 wins R1m1 (T1 vs T2)
    propagateWinner(rounds, 'r1m1', 'T1');
    // T1 should now be in R2m1 team1, not the final yet
    assert.equal(rounds[1].matches[0].team1, 'T1');
    assert.equal(rounds[rounds.length - 1].matches[0].winner, null);
  });
});

describe('propagateWinner - BYE cascade', () => {
  test('3 teams: T1 wins R1, advances to final against T3 (who had a bye)', () => {
    // R1m1: T1 vs T2. R1m2: T3 vs BYE → T3 auto. Final: T1 vs T3.
    const rounds = generateBracket(['T1', 'T2', 'T3']);
    propagateWinner(rounds, 'r1m1', 'T1');
    const final = rounds[1].matches[0];
    assert.equal(final.team1, 'T1');
    assert.equal(final.team2, 'T3'); // T3 already placed via bye
  });

  test('winner facing a BYE-filled slot does not cascade incorrectly', () => {
    // With 5 teams, after T1 wins R1m1, R2m1.team2 is T3 (real team, not BYE)
    // so no cascade should fire — T1 simply fills team1 and stops.
    const rounds = generateBracket(['T1', 'T2', 'T3', 'T4', 'T5']);
    propagateWinner(rounds, 'r1m1', 'T1');
    assert.equal(rounds[1].matches[0].team1, 'T1');
    assert.equal(rounds[1].matches[0].winner, null); // match not auto-resolved
  });
});

// ── resetFromMatch ────────────────────────────────────────────────────────────

describe('resetFromMatch - basic', () => {
  test('clears the winner of the specified match', () => {
    const rounds = generateBracket(teams(4));
    propagateWinner(rounds, 'r1m1', 'T1');
    resetFromMatch(rounds, 'r1m1');
    assert.equal(rounds[0].matches[0].winner, null);
  });

  test('clears the propagated slot in the next round', () => {
    const rounds = generateBracket(teams(4));
    propagateWinner(rounds, 'r1m1', 'T1');
    resetFromMatch(rounds, 'r1m1');
    // R2m1 team1 was set by propagation — should now be null
    assert.equal(rounds[1].matches[0].team1, null);
  });

  test('unknown matchId → returns false', () => {
    const rounds = generateBracket(teams(4));
    assert.equal(resetFromMatch(rounds, 'r99m99'), false);
  });

  test('cannot reset a BYE match → returns false', () => {
    // With 3 teams, R1m2 is T1 vs BYE (auto-resolved)
    const rounds = generateBracket(teams(3));
    assert.equal(resetFromMatch(rounds, 'r1m2'), false);
  });
});

describe('resetFromMatch - cascade', () => {
  // Scenario: "I accidentally clicked T2 as winner but T1 actually won"
  test('resetting R1 winner cascades: R2 winner and slot are also cleared', () => {
    const rounds = generateBracket(teams(8));
    propagateWinner(rounds, 'r1m1', 'T1');
    propagateWinner(rounds, 'r1m2', 'T3');
    propagateWinner(rounds, 'r2m1', 'T1'); // T1 wins the SF
    // Now reset the QF — T1's SF win should also be cleared
    resetFromMatch(rounds, 'r1m1');
    assert.equal(rounds[0].matches[0].winner, null, 'QF winner cleared');
    assert.equal(rounds[1].matches[0].team1, null, 'SF slot cleared');
    assert.equal(rounds[1].matches[0].winner, null, 'SF winner cleared');
  });

  // Scenario: "The wrong team was recorded as winning R2 — everything downstream is now wrong"
  test('resetting an SF match clears only that branch, not the other', () => {
    const rounds = generateBracket(teams(8));
    propagateWinner(rounds, 'r1m1', 'T1');
    propagateWinner(rounds, 'r1m2', 'T3');
    propagateWinner(rounds, 'r1m3', 'T5');
    propagateWinner(rounds, 'r1m4', 'T7');
    propagateWinner(rounds, 'r2m1', 'T1');
    propagateWinner(rounds, 'r2m2', 'T5');
    // Reset SF1 (r2m1) — only r3m1.team1 + winner should clear
    resetFromMatch(rounds, 'r2m1');
    assert.equal(rounds[1].matches[0].winner, null, 'SF1 winner cleared');
    assert.equal(rounds[2].matches[0].team1, null, 'Final team1 cleared');
    // SF2 result should be untouched
    assert.equal(rounds[1].matches[1].winner, 'T5', 'SF2 winner intact');
    assert.equal(rounds[2].matches[0].team2, 'T5', 'Final team2 intact');
  });

  // Scenario: "We need to change the R1 winner but the bracket has fully played out"
  test('change winner: reset then re-propagate gives correct downstream result', () => {
    const rounds = generateBracket(teams(4));
    propagateWinner(rounds, 'r1m1', 'T2'); // accidental pick
    propagateWinner(rounds, 'r1m2', 'T3');
    propagateWinner(rounds, 'r2m1', 'T2'); // downstream result also wrong
    // Correct it: reset R1m1, pick the right winner
    resetFromMatch(rounds, 'r1m1');
    propagateWinner(rounds, 'r1m1', 'T1');
    assert.equal(rounds[1].matches[0].team1, 'T1', 'correct winner in final slot');
    // Final winner was cleared by the reset cascade — needs to be re-played
    assert.equal(rounds[1].matches[0].winner, null, 'final result cleared, awaiting replay');
  });
});
