const tabsEl = document.getElementById('tabs');
const bracketArea = document.getElementById('bracket-area');
const presenterInfoEl = document.getElementById('presenter-info');
const popoverOverlay = document.getElementById('popover-overlay');
const popoverEl = document.getElementById('popover');

let tournaments = [];
let activeTournamentId = null;
let countdownInterval = null;

// ── Data loading ──

async function loadData() {
  const res = await fetch('/api/tournaments');
  const fresh = await res.json();
  const freshIds = fresh.map(t => t.id);

  tournaments = fresh;

  if (activeTournamentId && !freshIds.includes(activeTournamentId)) {
    activeTournamentId = null;
  }

  if (!activeTournamentId && tournaments.length > 0) {
    activeTournamentId = tournaments[0].id;
  }

  renderTabs();
  renderCurrentBracket();
  renderInfo();
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
      renderInfo();
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

// ── Info bar (countdown + registration cutoff) ──

function renderInfo() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  const t = activeTournamentId ? tournaments.find(t => t.id === activeTournamentId) : null;

  if (!t || (!t.settings?.startTime && !t.settings?.registrationCutoff)) {
    presenterInfoEl.style.display = 'none';
    return;
  }

  function update() {
    const parts = [];

    if (t.settings.startTime) {
      const diff = new Date(t.settings.startTime) - Date.now();
      if (diff > 0) {
        const totalSec = Math.floor(diff / 1000);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        const hh = h > 0 ? `${h}h ` : '';
        const mm = String(m).padStart(2, '0');
        const ss = String(s).padStart(2, '0');
        parts.push(`<span class="countdown-badge">Starts in ${hh}${mm}:${ss}</span>`);
      }
    }

    if (t.settings.registrationCutoff) {
      const cutoff = new Date(t.settings.registrationCutoff);
      const isPast = cutoff < new Date();
      const timeStr = cutoff.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = cutoff.toLocaleDateString([], { month: 'short', day: 'numeric' });
      parts.push(`<span class="cutoff-badge${isPast ? ' past' : ''}">Registration ${isPast ? 'closed' : `closes ${dateStr} at ${timeStr}`}</span>`);
    }

    if (parts.length > 0) {
      presenterInfoEl.innerHTML = parts.join('');
      presenterInfoEl.style.display = 'flex';
    } else {
      presenterInfoEl.style.display = 'none';
    }
  }

  update();
  if (t.settings?.startTime && new Date(t.settings.startTime) > new Date()) {
    countdownInterval = setInterval(update, 1000);
  }
}

// ── Winner popover ──

function openPopover(matchEl) {
  const tournamentId = matchEl.dataset.tournament;
  const matchId = matchEl.dataset.match;
  const team1Id = matchEl.dataset.team1Id;
  const team1Name = matchEl.dataset.team1Name;
  const team2Id = matchEl.dataset.team2Id;
  const team2Name = matchEl.dataset.team2Name;
  const isSettled = matchEl.classList.contains('settled');

  const rect = matchEl.getBoundingClientRect();
  popoverEl.style.top = `${rect.bottom + 8}px`;
  popoverEl.style.left = `${rect.left}px`;

  const title = isSettled ? 'Change result' : 'Select winner';
  popoverEl.innerHTML = `<h4>${title}</h4>
    <button class="popover-option" data-winner="${escAttr(team1Id)}">${escHtml(team1Name)}</button>
    <button class="popover-option" data-winner="${escAttr(team2Id)}">${escHtml(team2Name)}</button>
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
    const idx = tournaments.findIndex(t => t.id === tournamentId);
    if (idx !== -1) tournaments[idx] = updated;
    renderCurrentBracket();
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
    renderCurrentBracket();
  }
}
