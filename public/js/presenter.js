const tabsEl = document.getElementById('tabs');
const bracketArea = document.getElementById('bracket-area');
const popoverOverlay = document.getElementById('popover-overlay');
const popoverEl = document.getElementById('popover');

let tournaments = [];
let activeTournamentId = null;

// ── Data loading ──

async function loadData() {
  const res = await fetch('/api/tournaments');
  const fresh = await res.json();

  const freshIds = fresh.map(t => t.id);

  tournaments = fresh;

  // If active tournament was deleted, reset
  if (activeTournamentId && !freshIds.includes(activeTournamentId)) {
    activeTournamentId = null;
  }

  // Default to first tournament
  if (!activeTournamentId && tournaments.length > 0) {
    activeTournamentId = tournaments[0].id;
  }

  renderTabs();
  renderBracket();
}

// Poll every 5 seconds
setInterval(loadData, 5000);
loadData();

// ── Tabs ──

function renderTabs() {
  if (tournaments.length === 0) {
    tabsEl.innerHTML = '';
    return;
  }
  tabsEl.innerHTML = tournaments.map(t => `
    <button class="tab ${t.id === activeTournamentId ? 'active' : ''}" data-id="${t.id}">
      ${escHtml(t.name)}
    </button>
  `).join('');

  tabsEl.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTournamentId = btn.dataset.id;
      renderTabs();
      renderBracket();
    });
  });
}

// ── Bracket rendering ──

function renderBracket() {
  if (tournaments.length === 0) {
    bracketArea.innerHTML = '<p class="no-tournaments">No tournaments yet. <a href="/">Create one</a>.</p>';
    return;
  }

  const t = tournaments.find(t => t.id === activeTournamentId);
  if (!t) return;

  const rounds = t.rounds;
  const totalRounds = rounds.length;

  // Build HTML
  let html = '<div class="bracket">';

  rounds.forEach((round, ri) => {
    // Round column
    html += `<div class="round-col">`;
    html += `<div class="round-label">${roundName(ri, totalRounds)}</div>`;

    round.matches.forEach(match => {
      const isByeBye = match.team1 === 'BYE' && match.team2 === 'BYE';
      const isBye = match.team1 === 'BYE' || match.team2 === 'BYE';
      const isPlayable = !isBye && match.team1 && match.team2; // clickable whether won or not
      const classes = ['match'];
      if (isBye) classes.push('bye');
      if (isPlayable) classes.push('clickable');
      if (match.winner) classes.push('settled');

      const slot1Winner = match.winner && match.winner === match.team1;
      const slot2Winner = match.winner && match.winner === match.team2;

      // BYE vs BYE: render an invisible placeholder to preserve layout/connectors
      if (isByeBye) {
        html += `<div class="match-wrapper hidden"><div class="match"></div></div>`;
        return;
      }

      html += `<div class="match-wrapper">`;
      html += `<div class="${classes.join(' ')}" data-tournament="${t.id}" data-match="${match.id}" data-team1="${escAttr(match.team1 || '')}" data-team2="${escAttr(match.team2 || '')}">`;

      // Slot 1
      html += `<div class="match-slot ${slot1Winner ? 'winner' : ''} ${!match.team1 || match.team1 === 'BYE' ? 'tbd' : ''}">`;
      if (match.team1 === 'BYE') {
        html += `<span>BYE</span>`;
      } else if (match.team1) {
        html += escHtml(match.team1);
      } else {
        html += `<span class="tbd">TBD</span>`;
      }
      html += `</div>`;

      // Slot 2
      html += `<div class="match-slot ${slot2Winner ? 'winner' : ''} ${!match.team2 || match.team2 === 'BYE' ? 'tbd' : ''}">`;
      if (match.team2 === 'BYE') {
        html += `<span>BYE</span>`;
      } else if (match.team2) {
        html += escHtml(match.team2);
      } else {
        html += `<span class="tbd">TBD</span>`;
      }
      html += `</div>`;

      html += `</div>`; // .match
      html += `</div>`; // .match-wrapper
    });

    html += `</div>`; // .round-col

    // Connector between this round and next (skip after last round)
    if (ri < totalRounds - 1) {
      html += buildConnector(round.matches.length);
    }
  });

  // Champion display
  const lastRound = rounds[totalRounds - 1];
  const champion = lastRound && lastRound.matches[0] ? lastRound.matches[0].winner : null;
  html += `<div class="champion-col">
    <div class="champion-box">
      <div class="trophy">🏆</div>
      <div class="champion-label">Champion</div>
      ${champion
        ? `<div class="champion-name">${escHtml(champion)}</div>`
        : `<div class="champion-tbd">TBD</div>`
      }
    </div>
  </div>`;

  html += '</div>'; // .bracket

  bracketArea.innerHTML = html;

  // Attach click listeners to playable matches
  bracketArea.querySelectorAll('.match.clickable').forEach(el => {
    el.addEventListener('click', () => openPopover(el));
  });
}

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

// ── Winner popover ──

function openPopover(matchEl) {
  const tournamentId = matchEl.dataset.tournament;
  const matchId = matchEl.dataset.match;
  const team1 = matchEl.dataset.team1;
  const team2 = matchEl.dataset.team2;
  const isSettled = matchEl.classList.contains('settled');

  // Position popover near the match box
  const rect = matchEl.getBoundingClientRect();
  popoverEl.style.top = `${rect.bottom + 8}px`;
  popoverEl.style.left = `${rect.left}px`;

  const title = isSettled ? 'Change result' : 'Select winner';
  popoverEl.innerHTML = `<h4>${title}</h4>
    <button class="popover-option" data-winner="${escAttr(team1)}">${escHtml(team1)}</button>
    <button class="popover-option" data-winner="${escAttr(team2)}">${escHtml(team2)}</button>
    ${isSettled ? `<button class="popover-clear">Clear result</button>` : ''}`;

  popoverEl.querySelectorAll('.popover-option').forEach(btn => {
    btn.addEventListener('click', async () => {
      closePopover();
      await setWinner(tournamentId, matchId, btn.dataset.winner);
    });
  });

  const clearBtn = popoverEl.querySelector('.popover-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      closePopover();
      await clearResult(tournamentId, matchId);
    });
  }

  popoverOverlay.style.display = 'block';
  popoverEl.style.display = 'block';
  popoverOverlay.onclick = closePopover;
}

function closePopover() {
  popoverOverlay.style.display = 'none';
  popoverEl.style.display = 'none';
}

async function setWinner(tournamentId, matchId, winner) {
  const res = await fetch(`/api/tournaments/${tournamentId}/matches/${matchId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ winner })
  });
  if (res.ok) {
    const updated = await res.json();
    // Update in local state
    const idx = tournaments.findIndex(t => t.id === tournamentId);
    if (idx !== -1) tournaments[idx] = updated;
    renderBracket();
  }
}

async function clearResult(tournamentId, matchId) {
  const res = await fetch(`/api/tournaments/${tournamentId}/matches/${matchId}`, {
    method: 'DELETE'
  });
  if (res.ok) {
    const updated = await res.json();
    const idx = tournaments.findIndex(t => t.id === tournamentId);
    if (idx !== -1) tournaments[idx] = updated;
    renderBracket();
  }
}

// ── Utils ──

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}
