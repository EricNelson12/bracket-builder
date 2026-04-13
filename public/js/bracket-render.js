// ── HTML utilities ──

function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  if (str == null) return '';
  return String(str).replace(/"/g, '&quot;');
}

// ── Round label helper ──

function roundName(roundIndex, totalRounds) {
  const remaining = totalRounds - roundIndex;
  if (remaining === 1) return 'Final';
  if (remaining === 2) return 'Semifinals';
  if (remaining === 3) return 'Quarterfinals';
  return `Round ${roundIndex + 1}`;
}

// ── Bracket renderer ──
// containerEl: DOM element to render into
// tournament: full tournament object
// options:
//   editable {boolean} — adds .editable class + pencil overlay, makes all matches clickable
//   onMatchClick {function} — called with the match element when clicked
function renderBracket(containerEl, tournament, options) {
  const { editable = false, onMatchClick } = options || {};

  if (!tournament) {
    containerEl.innerHTML = '';
    return;
  }

  const rounds = tournament.rounds;
  const totalRounds = rounds.length;

  if (totalRounds === 0) {
    containerEl.innerHTML = '<p class="empty-state">No rounds yet. Add a round in the sidebar to get started.</p>';
    return;
  }

  let html = '<div class="bracket">';

  rounds.forEach((round, ri) => {
    html += `<div class="round-col">`;
    html += `<div class="round-label">${escHtml(round.name || roundName(ri, totalRounds))}</div>`;

    if (round.matches.length === 0) {
      html += `<div class="match-wrapper"><div class="match empty-match"><span class="tbd">No matches yet</span></div></div>`;
    }

    round.matches.forEach(match => {
      const isSettled = match.winner !== null;
      const isClickable = editable || onMatchClick;

      const classes = ['match'];
      if (isSettled) classes.push('settled');
      if (isClickable) classes.push('clickable');
      if (editable) classes.push('editable');

      html += `<div class="match-wrapper">`;
      html += `<div class="${classes.join(' ')}" `
            + `data-tournament="${escAttr(tournament.id)}" `
            + `data-match="${escAttr(match.id)}" `
            + `data-round-index="${ri}">`;

      if (editable) {
        html += `<div class="match-edit-icon" title="Edit match">&#x270E;</div>`;
      }

      if (match.competitors.length === 0) {
        html += `<div class="match-slot tbd"><span class="tbd">TBD</span></div>`;
      } else {
        match.competitors.forEach(name => {
          const isWinner = name === match.winner;
          html += `<div class="match-slot${isWinner ? ' winner' : ''}">`;
          html += escHtml(name);
          html += `</div>`;
        });
      }

      html += `</div>`; // .match
      html += `</div>`; // .match-wrapper
    });

    html += `</div>`; // .round-col
  });

  html += '</div>'; // .bracket

  containerEl.innerHTML = html;

  if (onMatchClick || editable) {
    containerEl.querySelectorAll('.match.clickable').forEach(el => {
      el.addEventListener('click', () => onMatchClick && onMatchClick(el));
    });
  }
}
