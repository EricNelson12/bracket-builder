const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { generateBracket, resolveTeam, isByeMatch, resetFromMatch } = require('../lib/bracket');

// ── Helpers ──────────────────────────────────────────────────────────────────

function teams(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i + 1}`,
    name: `T${i + 1}`,
    seed: i + 1,
    status: 'active'
  }));
}

function teamMap(n) {
  return Object.fromEntries(teams(n).map(t => [t.id, t]));
}

function allMatches(rounds) {
  return rounds.flatMap(r => r.matches);
}

// ── generateBracket - structure ───────────────────────────────────────────────

describe('generateBracket - structure', () => {
  test('4 teams → 2 rounds, correct match counts', () => {
    const rounds = generateBracket(teams(4));
    assert.equal(rounds.length, 2);
    assert.equal(rounds[0].matches.length, 2);
    assert.equal(rounds[1].matches.length, 1);
  });

  test('8 teams → 3 rounds', () => {
    const rounds = generateBracket(teams(8));
    assert.equal(rounds.length, 3);
    assert.equal(rounds[0].matches.length, 4);
    assert.equal(rounds[1].matches.length, 2);
    assert.equal(rounds[2].matches.length, 1);
  });

  test('2 teams → 1 round (just a final)', () => {
    const rounds = generateBracket(teams(2));
    assert.equal(rounds.length, 1);
    assert.equal(rounds[0].matches.length, 1);
  });
});

// ── generateBracket - sources ─────────────────────────────────────────────────

describe('generateBracket - sources', () => {
  test('R1 matches use team sources with correct IDs', () => {
    const rounds = generateBracket(teams(4));
    const r1 = rounds[0].matches;
    assert.deepEqual(r1[0].team1Source, { type: 'team', teamId: 't1' });
    assert.deepEqual(r1[0].team2Source, { type: 'team', teamId: 't2' });
    assert.deepEqual(r1[1].team1Source, { type: 'team', teamId: 't3' });
    assert.deepEqual(r1[1].team2Source, { type: 'team', teamId: 't4' });
  });

  test('R2+ matches use winner sources pointing to R1 match IDs', () => {
    const rounds = generateBracket(teams(4));
    const r2 = rounds[1].matches;
    assert.deepEqual(r2[0].team1Source, { type: 'winner', matchId: 'r1m1' });
    assert.deepEqual(r2[0].team2Source, { type: 'winner', matchId: 'r1m2' });
  });

  test('all matches have override fields initialized to null', () => {
    const rounds = generateBracket(teams(4));
    for (const round of rounds) {
      for (const match of round.matches) {
        assert.equal(match.team1Override, null);
        assert.equal(match.team2Override, null);
      }
    }
  });

  test('non-bye R1 matches start with result null and status pending', () => {
    const rounds = generateBracket(teams(4));
    for (const match of rounds[0].matches) {
      assert.equal(match.result, null);
      assert.equal(match.status, 'pending');
    }
  });
});

// ── generateBracket - bye seeding ─────────────────────────────────────────────

describe('generateBracket - bye seeding', () => {
  test('5 teams: first two teams play each other in R1', () => {
    const rounds = generateBracket(teams(5));
    const r1m1 = rounds[0].matches[0];
    assert.deepEqual(r1m1.team1Source, { type: 'team', teamId: 't1' });
    assert.deepEqual(r1m1.team2Source, { type: 'team', teamId: 't2' });
  });

  test('5 teams: last 3 get bye sources and are pre-resolved at generation', () => {
    const rounds = generateBracket(teams(5));
    const r1 = rounds[0].matches;
    const byeMatches = r1.filter(m =>
      m.team1Source.type === 'bye' || m.team2Source.type === 'bye'
    );
    assert.equal(byeMatches.length, 3);
    for (const m of byeMatches) {
      assert.ok(m.result, 'BYE match should have a pre-set result');
      assert.equal(m.result.method, 'bye');
      assert.notEqual(m.result.winner, 'BYE');
      assert.equal(m.status, 'complete');
    }
  });

  test('5 teams: no BYE vs BYE in any round', () => {
    const rounds = generateBracket(teams(5));
    for (const round of rounds) {
      for (const match of round.matches) {
        const bothBye =
          match.team1Source.type === 'bye' && match.team2Source.type === 'bye';
        assert.equal(bothBye, false, `Round ${round.round} has BYE vs BYE`);
      }
    }
  });

  test('3 teams: T1 vs T2 in R1, T3 gets a bye that is pre-resolved', () => {
    const t = teams(3);
    const rounds = generateBracket(t);
    const r1 = rounds[0].matches;
    assert.deepEqual(r1[0].team1Source, { type: 'team', teamId: 't1' });
    assert.deepEqual(r1[0].team2Source, { type: 'team', teamId: 't2' });
    const byeMatch = r1.find(m =>
      m.team1Source.type === 'bye' || m.team2Source.type === 'bye'
    );
    assert.ok(byeMatch);
    assert.equal(byeMatch.result.winner, 't3');
    assert.equal(byeMatch.result.method, 'bye');
  });

  test('5 teams [A,B,C,D,E]: first match is A vs B (input order preserved)', () => {
    const t = ['A', 'B', 'C', 'D', 'E'].map((name, i) => ({
      id: `t${i + 1}`, name, seed: i + 1, status: 'active'
    }));
    const rounds = generateBracket(t);
    const first = rounds[0].matches[0];
    assert.deepEqual(first.team1Source, { type: 'team', teamId: 't1' });
    assert.deepEqual(first.team2Source, { type: 'team', teamId: 't2' });
  });
});

// ── regression: T5 must not pre-appear in the final ──────────────────────────

describe('regression: T5 must not auto-advance to the final in a 5-team bracket', () => {
  test('final uses winner sources, not pre-filled teams', () => {
    const rounds = generateBracket(teams(5));
    const final = rounds[rounds.length - 1].matches[0];
    assert.equal(final.team1Source.type, 'winner');
    assert.equal(final.team2Source.type, 'winner');
    assert.equal(final.result, null);
  });

  test('resolving final slots before any results returns null (TBD)', () => {
    const t = teams(5);
    const rounds = generateBracket(t);
    const matches = allMatches(rounds);
    const tm = teamMap(5);
    const final = rounds[rounds.length - 1].matches[0];
    // The semi-final sources have winner sources on BYE-resolved matches,
    // but the top half (t1/t2) is unplayed — should still be TBD
    const team1 = resolveTeam(final.team1Source, final.team1Override, matches, tm);
    assert.equal(team1, null, 'final team1 should be TBD until semi is played');
  });
});

// ── resolveTeam ───────────────────────────────────────────────────────────────

describe('resolveTeam', () => {
  test('resolves a team source to the correct team object', () => {
    const tm = teamMap(4);
    const result = resolveTeam({ type: 'team', teamId: 't2' }, null, [], tm);
    assert.equal(result.id, 't2');
    assert.equal(result.name, 'T2');
  });

  test('returns BYE sentinel for bye source', () => {
    const result = resolveTeam({ type: 'bye' }, null, [], {});
    assert.equal(result.id, 'BYE');
  });

  test('returns null for winner source when referenced match has no result', () => {
    const rounds = generateBracket(teams(4));
    const matches = allMatches(rounds);
    const tm = teamMap(4);
    const result = resolveTeam({ type: 'winner', matchId: 'r1m1' }, null, matches, tm);
    assert.equal(result, null);
  });

  test('returns winning team for winner source when match has a result', () => {
    const rounds = generateBracket(teams(4));
    const matches = allMatches(rounds);
    const tm = teamMap(4);
    // Simulate setting a winner
    matches.find(m => m.id === 'r1m1').result = { winner: 't1', method: null };
    const result = resolveTeam({ type: 'winner', matchId: 'r1m1' }, null, matches, tm);
    assert.equal(result.id, 't1');
  });

  test('returns non-winner for loser source', () => {
    const rounds = generateBracket(teams(4));
    const matches = allMatches(rounds);
    const tm = teamMap(4);
    // r1m1: t1 vs t2, t1 wins
    matches.find(m => m.id === 'r1m1').result = { winner: 't1', method: null };
    const result = resolveTeam({ type: 'loser', matchId: 'r1m1' }, null, matches, tm);
    assert.equal(result.id, 't2');
  });

  test('override takes precedence over source', () => {
    const tm = teamMap(4);
    // Source says t1, override says t3
    const result = resolveTeam({ type: 'team', teamId: 't1' }, 't3', [], tm);
    assert.equal(result.id, 't3');
  });

  test('returns null for winner source with unknown matchId', () => {
    const result = resolveTeam({ type: 'winner', matchId: 'r99m99' }, null, [], {});
    assert.equal(result, null);
  });
});

// ── isByeMatch ────────────────────────────────────────────────────────────────

describe('isByeMatch', () => {
  test('match with bye source returns true', () => {
    const match = {
      team1Source: { type: 'team', teamId: 't1' },
      team2Source: { type: 'bye' },
      team1Override: null,
      team2Override: null,
      result: null
    };
    assert.equal(isByeMatch(match, [], teamMap(4)), true);
  });

  test('match with two team sources returns false', () => {
    const match = {
      team1Source: { type: 'team', teamId: 't1' },
      team2Source: { type: 'team', teamId: 't2' },
      team1Override: null,
      team2Override: null,
      result: null
    };
    assert.equal(isByeMatch(match, [], teamMap(4)), false);
  });

  test('match with winner sources returns false even if unresolved', () => {
    const match = {
      team1Source: { type: 'winner', matchId: 'r1m1' },
      team2Source: { type: 'winner', matchId: 'r1m2' },
      team1Override: null,
      team2Override: null,
      result: null
    };
    assert.equal(isByeMatch(match, [], teamMap(4)), false);
  });
});

// ── resetFromMatch ────────────────────────────────────────────────────────────

describe('resetFromMatch', () => {
  test('clears result and sets status to pending on the target match', () => {
    const rounds = generateBracket(teams(4));
    const match = rounds[0].matches[0];
    match.result = { winner: 't1', method: null };
    match.status = 'complete';
    resetFromMatch(rounds, 'r1m1');
    assert.equal(match.result, null);
    assert.equal(match.status, 'pending');
  });

  test('does NOT affect any other matches (no cascade)', () => {
    const rounds = generateBracket(teams(8));
    // Simulate r1m1 and r2m1 both having results
    rounds[0].matches[0].result = { winner: 't1', method: null };
    rounds[0].matches[0].status = 'complete';
    rounds[1].matches[0].result = { winner: 't1', method: null };
    rounds[1].matches[0].status = 'complete';

    resetFromMatch(rounds, 'r1m1');

    // r1m1 cleared
    assert.equal(rounds[0].matches[0].result, null);
    // r2m1 untouched — it holds a source reference, not a copied string
    assert.ok(rounds[1].matches[0].result, 'r2m1 result should be untouched');
    assert.equal(rounds[1].matches[0].result.winner, 't1');
  });

  test('returns false for unknown matchId', () => {
    const rounds = generateBracket(teams(4));
    assert.equal(resetFromMatch(rounds, 'r99m99'), false);
  });

  test('returns false for BYE-resolved match (method: bye)', () => {
    const rounds = generateBracket(teams(3));
    // r1m2 is the BYE match (T3 vs BYE), pre-resolved at generation
    assert.equal(resetFromMatch(rounds, 'r1m2'), false);
  });

  test('returns true on successful reset', () => {
    const rounds = generateBracket(teams(4));
    rounds[0].matches[0].result = { winner: 't1', method: null };
    rounds[0].matches[0].status = 'complete';
    assert.equal(resetFromMatch(rounds, 'r1m1'), true);
  });
});
