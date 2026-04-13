const tournamentId = window.location.pathname.split('/').pop();

const tcTitle = document.getElementById('tc-title');
const tcSidebar = document.getElementById('tc-sidebar');
const tcBracketArea = document.getElementById('tc-bracket-area');
const matchEditorEl = document.getElementById('match-editor');
const meOverlayEl = document.getElementById('me-overlay');

let tournament = null;
let saveNameTimer = null;
// Track which match is open in the editor so we can save-on-close
let editorRoundIndex = null;
let editorMatchId = null;

// ── Load & render ──

async function loadTournament() {
  const res = await fetch(`/api/tournaments/${tournamentId}`);
  if (!res.ok) {
    tcTitle.textContent = 'Tournament not found';
    tcSidebar.innerHTML = '<p class="empty-state">Tournament not found.</p>';
    tcBracketArea.innerHTML = '';
    return;
  }
  tournament = await res.json();
  tcTitle.textContent = tournament.name;
  document.title = `${tournament.name} — Config`;
  renderSidebar();
  renderBracketArea();
}

function renderBracketArea() {
  if (!tournament) return;
  renderBracket(tcBracketArea, tournament, {
    editable: true,
    onMatchClick: handleMatchClick
  });
}

function handleMatchClick(matchEl) {
  const ri = parseInt(matchEl.dataset.roundIndex, 10);
  const matchId = matchEl.dataset.match;
  openMatchEditor(ri, matchId);
}

function renderSidebar() {
  if (!tournament) return;
  const settings = tournament.settings || {};
  const controlsEnabled = settings.presenterControlsEnabled !== false;

  tcSidebar.innerHTML = `
    <div class="sidebar-section">
      <h3>Settings</h3>
      <div class="settings-row">
        <label>Name</label>
        <input type="text" id="setting-name" value="${escAttr(tournament.name)}">
      </div>
      <div class="settings-row settings-row-toggle">
        <label>Presenter controls</label>
        <label class="toggle-switch">
          <input type="checkbox" id="setting-controls" ${controlsEnabled ? 'checked' : ''}>
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
        </label>
      </div>
    </div>

    <div class="sidebar-section">
      <h3>Rounds</h3>
      ${tournament.rounds.length === 0
        ? '<p class="sidebar-empty">No rounds yet.</p>'
        : tournament.rounds.map((round, ri) => `
          <div class="round-section">
            <div class="round-section-header">
              <input class="round-name-input"
                value="${escAttr(round.name || roundName(ri, tournament.rounds.length))}"
                data-round-index="${ri}"
                data-computed="${escAttr(roundName(ri, tournament.rounds.length))}"
                placeholder="${escAttr(roundName(ri, tournament.rounds.length))}"
                title="Rename round">
              <div class="round-section-actions">
                <button class="btn-secondary btn-xs" data-add-match="${ri}">+ Match</button>
                <button class="btn-icon btn-xs round-delete-btn" data-remove-round="${ri}" title="Remove round">&#x1F5D1;</button>
              </div>
            </div>
          </div>
        `).join('')
      }
      <button class="btn-secondary btn-sm tc-add-round" id="add-round-btn">+ Add Round</button>
    </div>
  `;

  // Settings listeners
  document.getElementById('setting-name').addEventListener('input', e => {
    clearTimeout(saveNameTimer);
    saveNameTimer = setTimeout(() => saveName(e.target.value.trim()), 600);
  });
  document.getElementById('setting-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') e.target.blur();
  });
  document.getElementById('setting-controls').addEventListener('change', e => {
    patchSettings({ presenterControlsEnabled: e.target.checked });
  });

  // Add round
  document.getElementById('add-round-btn').addEventListener('click', addRound);

  // Round name inputs
  tcSidebar.querySelectorAll('.round-name-input').forEach(input => {
    input.addEventListener('change', e => {
      const ri = parseInt(e.target.dataset.roundIndex, 10);
      const val = e.target.value.trim();
      const computed = e.target.dataset.computed;
      renameRound(ri, val === computed ? '' : val);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') e.target.blur();
      if (e.key === 'Escape') {
        const ri = parseInt(e.target.dataset.roundIndex, 10);
        const round = tournament.rounds[ri];
        e.target.value = round.name || e.target.dataset.computed;
        e.target.blur();
      }
    });
  });

  // Add match buttons
  tcSidebar.querySelectorAll('[data-add-match]').forEach(btn => {
    btn.addEventListener('click', () => addMatch(parseInt(btn.dataset.addMatch, 10)));
  });

  // Remove round buttons
  tcSidebar.querySelectorAll('[data-remove-round]').forEach(btn => {
    btn.addEventListener('click', () => removeRound(parseInt(btn.dataset.removeRound, 10)));
  });
}

// ── Settings persistence ──

async function saveName(name) {
  if (!name) return;
  const res = await fetch(`/api/tournaments/${tournamentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (res.ok) {
    tournament = await res.json();
    tcTitle.textContent = tournament.name;
    document.title = `${tournament.name} — Config`;
  }
}

async function patchSettings(patch) {
  const res = await fetch(`/api/tournaments/${tournamentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings: patch })
  });
  if (res.ok) tournament = await res.json();
}

// ── Round management ──

async function addRound() {
  const res = await fetch(`/api/tournaments/${tournamentId}/rounds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  if (res.ok) {
    tournament = await res.json();
    renderSidebar();
    renderBracketArea();
  }
}

async function renameRound(roundIndex, name) {
  const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${roundIndex}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (res.ok) {
    tournament = await res.json();
    renderBracketArea();
  }
}

async function removeRound(roundIndex) {
  const round = tournament.rounds[roundIndex];
  if (!round) return;
  const label = round.name || roundName(roundIndex, tournament.rounds.length);
  if (!confirm(`Remove "${label}" and all its matches?`)) return;
  const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${roundIndex}`, {
    method: 'DELETE'
  });
  if (res.ok) {
    tournament = await res.json();
    renderSidebar();
    renderBracketArea();
  } else {
    const err = await res.json();
    alert(err.error || 'Could not remove round.');
  }
}

// ── Match management ──

async function addMatch(roundIndex) {
  const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${roundIndex}/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ competitors: [] })
  });
  if (!res.ok) return;
  tournament = await res.json();
  renderSidebar();
  renderBracketArea();
  // Open editor on the newly created match
  const round = tournament.rounds[roundIndex];
  const newMatch = round.matches[round.matches.length - 1];
  if (newMatch) openMatchEditor(roundIndex, newMatch.id);
}

async function removeMatch(roundIndex, matchId) {
  closeMatchEditor(false); // close without saving
  const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${roundIndex}/matches/${matchId}`, {
    method: 'DELETE'
  });
  if (res.ok) {
    tournament = await res.json();
    renderSidebar();
    renderBracketArea();
  } else {
    const err = await res.json();
    alert(err.error || 'Could not remove match.');
  }
}

// ── Match editor ──

function openMatchEditor(roundIndex, matchId) {
  const round = tournament.rounds[roundIndex];
  if (!round) return;
  const match = round.matches.find(m => m.id === matchId);
  if (!match) return;

  editorRoundIndex = roundIndex;
  editorMatchId = matchId;

  renderMatchEditor(match, roundIndex);
  meOverlayEl.style.display = 'block';
  matchEditorEl.style.display = 'block';
  meOverlayEl.onclick = () => closeMatchEditor(true);

  // Focus first input
  const first = matchEditorEl.querySelector('.competitor-input');
  if (first) setTimeout(() => first.focus(), 50);
}

function renderMatchEditor(match, roundIndex) {
  const competitors = match.competitors.length > 0 ? match.competitors : ['', ''];

  matchEditorEl.innerHTML = `
    <div class="editor-header">
      <h3>Edit Match</h3>
      <button class="editor-close" id="editor-close-btn">&#x2715;</button>
    </div>
    <div class="editor-section">
      <h4>Competitors</h4>
      <div id="competitor-list">
        ${competitors.map((name, i) => renderCompetitorRow(name, i)).join('')}
      </div>
      <button class="btn-secondary btn-sm" id="add-competitor-btn">+ Add Competitor</button>
    </div>
    <div class="editor-section">
      <h4>Winner</h4>
      <select id="winner-select" class="editor-select">
        <option value="">— no winner —</option>
        ${match.competitors.filter(Boolean).map(name =>
          `<option value="${escAttr(name)}"${name === match.winner ? ' selected' : ''}>${escHtml(name)}</option>`
        ).join('')}
      </select>
    </div>
    <div class="editor-section editor-danger-section">
      <button class="editor-remove-match-btn" id="remove-match-btn">Remove match</button>
    </div>
  `;

  // Wire up events
  document.getElementById('editor-close-btn').addEventListener('click', () => closeMatchEditor(true));

  document.getElementById('add-competitor-btn').addEventListener('click', () => {
    const list = document.getElementById('competitor-list');
    const idx = list.querySelectorAll('.competitor-row').length;
    const row = document.createElement('div');
    row.innerHTML = renderCompetitorRow('', idx);
    list.appendChild(row.firstElementChild);
    wireCompetitorRow(list.lastElementChild);
    list.lastElementChild.querySelector('.competitor-input').focus();
    rebuildWinnerDropdown();
  });

  document.getElementById('remove-match-btn').addEventListener('click', () => {
    if (confirm('Remove this match?')) {
      removeMatch(editorRoundIndex, editorMatchId);
    }
  });

  matchEditorEl.querySelectorAll('.competitor-row').forEach(row => wireCompetitorRow(row));
}

function renderCompetitorRow(name, index) {
  return `<div class="competitor-row" data-index="${index}">
    <input type="text" class="competitor-input" value="${escAttr(name)}" placeholder="Competitor name">
    <button class="competitor-remove-btn" title="Remove">&#x2715;</button>
  </div>`;
}

function wireCompetitorRow(row) {
  row.querySelector('.competitor-input').addEventListener('input', rebuildWinnerDropdown);
  row.querySelector('.competitor-remove-btn').addEventListener('click', () => {
    row.remove();
    rebuildWinnerDropdown();
  });
}

function rebuildWinnerDropdown() {
  const select = document.getElementById('winner-select');
  if (!select) return;
  const currentWinner = select.value;
  const names = getCompetitorNames();
  select.innerHTML = `<option value="">— no winner —</option>`
    + names.map(name =>
        `<option value="${escAttr(name)}"${name === currentWinner ? ' selected' : ''}>${escHtml(name)}</option>`
      ).join('');
}

function getCompetitorNames() {
  return [...matchEditorEl.querySelectorAll('.competitor-input')]
    .map(i => i.value.trim())
    .filter(Boolean);
}

function collectEditorState() {
  const competitors = getCompetitorNames();
  const winnerSelect = document.getElementById('winner-select');
  const winner = winnerSelect ? winnerSelect.value : '';
  return {
    competitors,
    winner: competitors.includes(winner) ? winner : null
  };
}

async function closeMatchEditor(save = true) {
  if (save && editorMatchId !== null) {
    const { competitors, winner } = collectEditorState();
    await fetch(`/api/tournaments/${tournamentId}/rounds/${editorRoundIndex}/matches/${editorMatchId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ competitors, winner })
    });
    const res = await fetch(`/api/tournaments/${tournamentId}`);
    if (res.ok) tournament = await res.json();
  }

  editorRoundIndex = null;
  editorMatchId = null;
  meOverlayEl.style.display = 'none';
  matchEditorEl.style.display = 'none';
  renderSidebar();
  renderBracketArea();
}

// ── Utilities ──

function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(str) {
  if (str == null) return '';
  return String(str).replace(/"/g, '&quot;');
}

function roundName(roundIndex, totalRounds) {
  const remaining = totalRounds - roundIndex;
  if (remaining === 1) return 'Final';
  if (remaining === 2) return 'Semifinals';
  if (remaining === 3) return 'Quarterfinals';
  return `Round ${roundIndex + 1}`;
}

// ── Init ──
loadTournament();
