const bracketArea = document.getElementById('bracket-area');
const popoverOverlay = document.getElementById('popover-overlay');
const popoverEl = document.getElementById('popover');

let activeTournament = null;

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
  const res = await fetch('/api/active');
  const { tournament } = await res.json();
  activeTournament = tournament;
  renderBracketView();
}

setInterval(loadData, 5000);
loadData();

// ── Bracket rendering ──

function renderBracketView() {
  if (!activeTournament) {
    bracketArea.innerHTML = '<p class="no-tournaments">No bracket is active. <a href="/config">Set one up</a>.</p>';
    return;
  }

  const t = activeTournament;
  const controlsEnabled = t.settings?.presenterControlsEnabled !== false;

  // Build: heading + bracket wrapper
  bracketArea.innerHTML = `
    <h1 class="bracket-title">${escHtml(t.name)}</h1>
    <div class="bracket-scroll" id="bracket-scroll"></div>
  `;

  renderBracket(document.getElementById('bracket-scroll'), t, {
    onMatchClick: controlsEnabled ? openPopover : null
  });
}

// ── Winner popover ──

function openPopover(matchEl) {
  const tId = matchEl.dataset.tournament;
  const matchId = matchEl.dataset.match;
  const ri = parseInt(matchEl.dataset.roundIndex, 10);

  const match = activeTournament?.rounds[ri]?.matches.find(m => m.id === matchId);
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
    activeTournament = await res.json();
    renderBracketView();
  }
}
