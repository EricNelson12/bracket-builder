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

// ── Bracket connector ──

function buildConnector(matchCount) {
  let html = `<div class="connector">`;
  for (let i = 0; i < matchCount; i += 2) {
    html += `<div class="connector-pair">
      <div class="conn-top"></div>
      <div class="conn-mid"></div>
      <div class="conn-bottom"></div>
    </div>`;
  }
  html += `</div>`;
  return html;
}

// ── Bracket renderer ──
// containerEl: DOM element to render into
// tournament: full tournament object
// options:
//   editable {boolean} — adds .editable class + pencil overlay, makes all matches clickable
//   onMatchClick {function} — called with the match element when clicked (presenter: openPopover, config: openMatchEditor)
function renderBracket(containerEl, tournament, options) {
  const { editable = false, onMatchClick } = options || {};

  if (!tournament) {
    containerEl.innerHTML = '';
    return;
  }

  const rounds = tournament.rounds;
  const totalRounds = rounds.length;
  const allMatches = rounds.flatMap(r => r.matches);
  const tm = Object.fromEntries(tournament.teams.map(team => [team.id, team]));

  let html = '<div class="bracket">';

  rounds.forEach((round, ri) => {
    html += `<div class="round-col">`;
    html += `<div class="round-label">${escHtml(round.name || roundName(ri, totalRounds))}</div>`;

    round.matches.forEach(match => {
      const team1 = resolveTeam(match.team1Source, match.team1Override, allMatches, tm);
      const team2 = resolveTeam(match.team2Source, match.team2Override, allMatches, tm);

      const isBye = isByeMatch(match, allMatches, tm);
      const isByeBye = (team1 && team1.id === 'BYE') && (team2 && team2.id === 'BYE');
      const isPlayable = !isBye && team1 && team2;
      const isSettled = !!match.result;

      const classes = ['match'];
      if (isBye) classes.push('bye');
      if (isSettled) classes.push('settled');
      if (editable) {
        classes.push('clickable', 'editable');
      } else if (isPlayable && onMatchClick) {
        classes.push('clickable');
      }

      const slot1Winner = isSettled && match.result.winner === team1?.id;
      const slot2Winner = isSettled && match.result.winner === team2?.id;

      if (isByeBye) {
        html += `<div class="match-wrapper hidden"><div class="match"></div></div>`;
        return;
      }

      const t1Id = escAttr(team1?.id);
      const t1Name = escAttr(team1?.name);
      const t2Id = escAttr(team2?.id);
      const t2Name = escAttr(team2?.name);

      html += `<div class="match-wrapper">`;
      html += `<div class="${classes.join(' ')}" `
            + `data-tournament="${escAttr(tournament.id)}" `
            + `data-match="${escAttr(match.id)}" `
            + `data-team1-id="${t1Id}" data-team1-name="${t1Name}" `
            + `data-team2-id="${t2Id}" data-team2-name="${t2Name}">`;

      if (editable) {
        html += `<div class="match-edit-icon" title="Edit match">&#x270E;</div>`;
      }

      // Slot 1
      const slot1Tbd = !team1 || team1.id === 'BYE';
      const slot1Dropped = team1 && team1.status === 'dropped';
      html += `<div class="match-slot`
            + `${slot1Winner ? ' winner' : ''}`
            + `${slot1Tbd ? ' tbd' : ''}`
            + `${slot1Dropped ? ' dropped' : ''}">`;
      if (team1 && team1.id === 'BYE') {
        html += `<span>BYE</span>`;
      } else if (team1) {
        html += escHtml(team1.name);
      } else {
        html += `<span class="tbd">TBD</span>`;
      }
      html += `</div>`;

      // Slot 2
      const slot2Tbd = !team2 || team2.id === 'BYE';
      const slot2Dropped = team2 && team2.status === 'dropped';
      html += `<div class="match-slot`
            + `${slot2Winner ? ' winner' : ''}`
            + `${slot2Tbd ? ' tbd' : ''}`
            + `${slot2Dropped ? ' dropped' : ''}">`;
      if (team2 && team2.id === 'BYE') {
        html += `<span>BYE</span>`;
      } else if (team2) {
        html += escHtml(team2.name);
      } else {
        html += `<span class="tbd">TBD</span>`;
      }
      html += `</div>`;

      html += `</div>`; // .match
      html += `</div>`; // .match-wrapper
    });

    html += `</div>`; // .round-col

    if (ri < totalRounds - 1) {
      html += buildConnector(round.matches.length);
    }
  });

  // Champion display
  const lastRound = rounds[totalRounds - 1];
  const finalMatch = lastRound && lastRound.matches[0];
  const championId = finalMatch?.result?.winner;
  const champion = championId ? tm[championId] : null;
  html += `<div class="champion-col">
    <div class="champion-box">
      <div class="trophy">&#x1F3C6;</div>
      <div class="champion-label">Champion</div>
      ${champion
        ? `<div class="champion-name">${escHtml(champion.name)}</div>`
        : `<div class="champion-tbd">TBD</div>`
      }
    </div>
  </div>`;

  html += '</div>'; // .bracket

  containerEl.innerHTML = html;

  if (onMatchClick) {
    containerEl.querySelectorAll('.match.clickable').forEach(el => {
      el.addEventListener('click', () => onMatchClick(el));
    });
  }
}
