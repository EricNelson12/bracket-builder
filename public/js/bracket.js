// Shared bracket utilities used by both config.js and presenter.js

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
