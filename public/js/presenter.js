const tabsEl = document.getElementById('tabs');
const bracketArea = document.getElementById('bracket-area');
const popoverOverlay = document.getElementById('popover-overlay');
const popoverEl = document.getElementById('popover');

let tournaments = [];
let activeTournamentId = null;

// ── Utilities ──

function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(str) {
  if (str == null) return '';
  return String(str).replace(/"/g, '&quot;');
}

// ── Data loading ──

async function loadData() {
  const res = await fetch('/api/tournaments');
  tournaments = await res.json();

  const freshIds = tournaments.map(t => t.id);
  if (activeTournamentId && !freshIds.includes(activeTournamentId)) {
    activeTournamentId = null;
  }
  if (!activeTournamentId && tournaments.length > 0) {
    activeTournamentId = tournaments[0].id;
  }

  renderTabs();
  renderCurrentBracket();
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
    <button class="tab ${t.id === activeTournamentId ? 'active' : ''}" data-id="${escAttr(t.id)}">
      ${escHtml(t.name)}
    </button>
  `).join('');

  tabsEl.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTournamentId = btn.dataset.id;
      renderTabs();
      renderCurrentBracket();
    });
  });
}

// ── Bracket rendering ──

function renderCurrentBracket() {
  if (tournaments.length === 0) {
    bracketArea.innerHTML = '<p class="no-tournaments">No tournaments yet. <a href="/config">Create one</a>.</p>';
    return;
  }

  const t = tournaments.find(t => t.id === activeTournamentId);
  if (!t) return;

  const controlsEnabled = t.settings?.presenterControlsEnabled !== false;
  renderBracket(bracketArea, t, {
    onMatchClick: controlsEnabled ? openPopover : null
  });
}

// ── Winner popover ──

function openPopover(matchEl) {
  const tId = matchEl.dataset.tournament;
  const matchId = matchEl.dataset.match;
  const ri = parseInt(matchEl.dataset.roundIndex, 10);

  const t = tournaments.find(x => x.id === tId);
  const match = t?.rounds[ri]?.matches.find(m => m.id === matchId);
  if (!match || match.competitors.length === 0) return;

  const isSettled = match.winner !== null;

  const rect = matchEl.getBoundingClientRect();
  const top = Math.min(rect.bottom + 8, window.innerHeight - 200);
  const left = Math.min(rect.left, window.innerWidth - 220);
  popoverEl.style.top = `${top}px`;
  popoverEl.style.left = `${left}px`;

  popoverEl.innerHTML = `
    <h4>${isSettled ? 'Change winner' : 'Select winner'}</h4>
    ${match.competitors.map(name => `
      <button class="popover-option${name === match.winner ? ' active' : ''}" data-name="${escAttr(name)}">
        ${escHtml(name)}
      </button>
    `).join('')}
    ${isSettled ? `<button class="popover-clear">Clear winner</button>` : ''}
  `;

  popoverEl.querySelectorAll('.popover-option').forEach(btn => {
    btn.addEventListener('click', async () => {
      closePopover();
      await setWinner(tId, ri, matchId, btn.dataset.name);
    });
  });

  const clearBtn = popoverEl.querySelector('.popover-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      closePopover();
      await setWinner(tId, ri, matchId, null);
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

async function setWinner(tId, roundIndex, matchId, winner) {
  const res = await fetch(`/api/tournaments/${tId}/rounds/${roundIndex}/matches/${matchId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ winner })
  });
  if (res.ok) {
    const updated = await res.json();
    const idx = tournaments.findIndex(t => t.id === tId);
    if (idx !== -1) tournaments[idx] = updated;
    renderCurrentBracket();
  }
}
