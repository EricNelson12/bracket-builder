const tournamentId = window.location.pathname.split('/').pop();

const tcTitle = document.getElementById('tc-title');
const tcSidebar = document.getElementById('tc-sidebar');
const tcBracketArea = document.getElementById('tc-bracket-area');
const matchEditorEl = document.getElementById('match-editor');
const meOverlayEl = document.getElementById('me-overlay');

let tournament = null;
let saveSettingsTimer = null;

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
  renderBracketEditor();
}

function renderBracketEditor() {
  if (!tournament) return;
  if (tournament.rounds.length === 0) {
    tcBracketArea.innerHTML = '<p class="empty-state">No rounds yet. Add a round in the sidebar.</p>';
    return;
  }
  renderBracket(tcBracketArea, tournament, {
    editable: true,
    onMatchClick: openMatchEditor
  });
}

function renderSidebar() {
  if (!tournament) return;
  const settings = tournament.settings || {};
  const controlsEnabled = settings.presenterControlsEnabled !== false;
  const startParts = settings.startTime ? splitDatetime(settings.startTime) : { date: '', time: '' };
  const cutoffParts = settings.registrationCutoff ? splitDatetime(settings.registrationCutoff) : { date: '', time: '' };

  tcSidebar.innerHTML = `
    <div class="sidebar-section">
      <h3>Settings</h3>
      <div class="settings-row">
        <label>Name</label>
        <input type="text" id="setting-name" value="${escAttr(tournament.name)}">
      </div>
      <div class="datetime-field">
        <div class="datetime-label">
          <label>Start time</label>
          ${startParts.date ? `<button class="datetime-clear" onclick="clearDatetime('startTime', 'start')" title="Clear">&times;</button>` : ''}
        </div>
        <div class="datetime-inputs">
          <input type="date" id="setting-start-date" value="${escAttr(startParts.date)}">
          <input type="time" id="setting-start-time" value="${escAttr(startParts.time)}" ${!startParts.date ? 'disabled' : ''}>
        </div>
      </div>
      <div class="datetime-field">
        <div class="datetime-label">
          <label>Reg cutoff</label>
          ${cutoffParts.date ? `<button class="datetime-clear" onclick="clearDatetime('registrationCutoff', 'cutoff')" title="Clear">&times;</button>` : ''}
        </div>
        <div class="datetime-inputs">
          <input type="date" id="setting-cutoff-date" value="${escAttr(cutoffParts.date)}">
          <input type="time" id="setting-cutoff-time" value="${escAttr(cutoffParts.time)}" ${!cutoffParts.date ? 'disabled' : ''}>
        </div>
      </div>
      <div class="settings-row settings-row-toggle">
        <label>Presenter controls</label>
        <label class="toggle-switch">
          <input type="checkbox" id="setting-controls" ${controlsEnabled ? 'checked' : ''}>
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
        </label>
      </div>
      <div class="settings-row">
        <label>Reg link</label>
        <div style="display:flex;gap:4px;flex:1;min-width:0">
          <input type="text" value="${escAttr(`${window.location.origin}/register/${tournamentId}`)}" readonly style="font-size:11px">
          <button class="btn-secondary btn-xs" onclick="copyRegLink(this)">Copy</button>
        </div>
      </div>
    </div>

    <div class="sidebar-section">
      <h3>Teams</h3>
      <ul class="tc-team-list">
        ${tournament.teams.map(t => `
          <li class="team-item${t.status === 'dropped' ? ' dropped' : ''}">
            ${t.picture
              ? `<img class="team-thumb" src="${escAttr(t.picture)}" alt="" loading="lazy">`
              : '<span class="team-thumb-placeholder"></span>'}
            <div class="team-item-details">
              <input class="team-name-input" value="${escAttr(t.name)}" data-team-id="${escAttr(t.id)}" title="Rename team">
              ${t.captain ? `<div class="team-captain">${escHtml(t.captain)}</div>` : ''}
            </div>
            <span class="team-status-badge ${t.status === 'dropped' ? 'dropped' : 'active'}">${t.status === 'dropped' ? 'out' : 'in'}</span>
            <button class="btn-icon btn-xs" onclick="toggleTeamStatus('${escAttr(t.id)}', '${t.status === 'dropped' ? 'active' : 'dropped'}')" title="${t.status === 'dropped' ? 'Restore team' : 'Mark as dropped'}">
              ${t.status === 'dropped' ? '&#x21A9;' : '&#x2715;'}
            </button>
            <button class="btn-icon btn-xs team-delete-btn" onclick="deleteTeam('${escAttr(t.id)}', '${escAttr(t.name)}')" title="Delete team">&#x1F5D1;</button>
          </li>
        `).join('')}
      </ul>
      <div class="add-team-form">
        <input type="text" id="add-team-input" placeholder="New team name">
        <button class="btn-primary btn-sm" onclick="addTeam()">Add</button>
      </div>
    </div>

    <div class="sidebar-section">
      <h3>Rounds</h3>
      ${tournament.rounds.length === 0
        ? '<p style="font-size:12px;color:#718096;margin-bottom:8px">No rounds yet.</p>'
        : tournament.rounds.map((round, ri) => `
          <div class="round-section">
            <div class="round-section-header">
              <input class="round-name-input"
                value="${escAttr(round.name || roundName(ri, tournament.rounds.length))}"
                data-round-index="${ri}"
                data-computed="${escAttr(roundName(ri, tournament.rounds.length))}"
                title="Rename round">
              <div class="round-section-actions">
                <button class="btn-secondary btn-xs" onclick="openAddMatchDialog(${ri})" title="Add match">+ Match</button>
                <button class="btn-icon btn-xs round-delete-btn" onclick="removeRound(${ri})" title="Remove round">&#x1F5D1;</button>
              </div>
            </div>
          </div>
        `).join('')
      }
      <button class="btn-secondary btn-sm tc-add-round" onclick="addRound()">+ Add Round</button>
      <button class="btn-regenerate" onclick="regenerateBracket()">Regenerate bracket</button>
    </div>
  `;

  // Settings event listeners
  document.getElementById('setting-name').addEventListener('change', e => {
    scheduleSave('name', e.target.value.trim());
  });
  // Split date+time field listeners
  ['start', 'cutoff'].forEach(key => {
    const settingKey = key === 'start' ? 'startTime' : 'registrationCutoff';
    const dateEl = document.getElementById(`setting-${key}-date`);
    const timeEl = document.getElementById(`setting-${key}-time`);

    dateEl.addEventListener('change', () => {
      if (dateEl.value) {
        timeEl.disabled = false;
        if (!timeEl.value) timeEl.value = '12:00';
      } else {
        timeEl.disabled = true;
        timeEl.value = '';
      }
      saveDatetime(settingKey, dateEl.value, timeEl.value);
      renderSidebar(); // refresh clear button visibility
    });
    timeEl.addEventListener('change', () => {
      saveDatetime(settingKey, dateEl.value, timeEl.value);
    });
  });
  document.getElementById('setting-controls').addEventListener('change', e => {
    patchSettings({ presenterControlsEnabled: e.target.checked });
  });

  // Team rename listeners
  tcSidebar.querySelectorAll('.team-name-input').forEach(input => {
    const originalValue = input.value;
    input.addEventListener('change', e => {
      const name = e.target.value.trim();
      if (!name) { e.target.value = originalValue; return; }
      renameTeam(e.target.dataset.teamId, name);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') e.target.blur();
      if (e.key === 'Escape') {
        e.target.value = originalValue;
        e.target.blur();
      }
    });
  });

  // Round rename listeners
  tcSidebar.querySelectorAll('.round-name-input').forEach(input => {
    input.addEventListener('change', e => {
      const ri = parseInt(e.target.dataset.roundIndex, 10);
      const val = e.target.value.trim();
      const computed = e.target.dataset.computed;
      // Treat restoring the computed name as clearing the custom name
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
}

// ── Settings persistence ──

function scheduleSave(key, value) {
  clearTimeout(saveSettingsTimer);
  saveSettingsTimer = setTimeout(() => {
    if (key === 'name') {
      fetch(`/api/tournaments/${tournamentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: value })
      }).then(r => r.ok ? r.json() : null).then(t => {
        if (t) { tournament = t; tcTitle.textContent = t.name; document.title = `${t.name} — Config`; }
      });
    } else {
      patchSettings({ [key]: value });
    }
  }, 600);
}

async function patchSettings(patch) {
  const res = await fetch(`/api/tournaments/${tournamentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings: patch })
  });
  if (res.ok) tournament = await res.json();
}

// ── Team management ──

async function deleteTeam(teamId, teamName) {
  if (!confirm(`Delete "${teamName}"? This cannot be undone.`)) return;
  const res = await fetch(`/api/tournaments/${tournamentId}/teams/${teamId}`, { method: 'DELETE' });
  if (res.ok) {
    tournament = await res.json();
    renderSidebar();
    renderBracketEditor();
  } else {
    const err = await res.json();
    alert(err.error || 'Could not delete team.');
  }
}

async function renameTeam(teamId, name) {
  const res = await fetch(`/api/tournaments/${tournamentId}/teams/${teamId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (res.ok) {
    tournament = await res.json();
    renderBracketEditor();
  }
}

async function toggleTeamStatus(teamId, newStatus) {
  const res = await fetch(`/api/tournaments/${tournamentId}/teams/${teamId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus })
  });
  if (res.ok) {
    tournament = await res.json();
    renderSidebar();
    renderBracketEditor();
  }
}

async function addTeam() {
  const input = document.getElementById('add-team-input');
  const name = input.value.trim();
  if (!name) return;
  const res = await fetch(`/api/tournaments/${tournamentId}/teams`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (res.ok) {
    tournament = await res.json();
    input.value = '';
    renderSidebar();
  }
}

// ── Round management ──

async function regenerateBracket() {
  const activeCount = tournament.teams.filter(t => t.status !== 'dropped').length;
  const msg = `Regenerate the bracket from all ${activeCount} active team${activeCount !== 1 ? 's' : ''}?\n\nThis will clear all results and remove any manually added rounds or matches.`;
  if (!confirm(msg)) return;
  const res = await fetch(`/api/tournaments/${tournamentId}/regenerate`, { method: 'POST' });
  if (res.ok) {
    tournament = await res.json();
    renderSidebar();
    renderBracketEditor();
  } else {
    const err = await res.json();
    alert(err.error || 'Could not regenerate bracket.');
  }
}

async function addRound() {
  const res = await fetch(`/api/tournaments/${tournamentId}/rounds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  if (res.ok) {
    tournament = await res.json();
    renderSidebar();
    renderBracketEditor();
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
    renderBracketEditor(); // update label in bracket view
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
    renderBracketEditor();
  } else {
    const err = await res.json();
    alert(err.error || 'Could not remove round.');
  }
}

function openAddMatchDialog(roundIndex) {
  const options = tournament.teams
    .map(t => `<option value="${escAttr(t.id)}">${escHtml(t.name)}${t.status === 'dropped' ? ' (dropped)' : ''}</option>`)
    .join('');

  matchEditorEl.innerHTML = `
    <div class="editor-header">
      <h3>Add Match — ${escHtml(roundName(roundIndex, tournament.rounds.length))}</h3>
      <button class="editor-close" onclick="closeMatchEditor()">&#x2715;</button>
    </div>
    <div class="editor-section">
      <div class="settings-row">
        <label>Team 1</label>
        <select id="add-match-t1" class="editor-select">${options}</select>
      </div>
      <div class="settings-row">
        <label>Team 2</label>
        <select id="add-match-t2" class="editor-select">${options}</select>
      </div>
    </div>
    <div class="editor-actions">
      <button class="btn-secondary" onclick="closeMatchEditor()">Cancel</button>
      <button class="btn-primary" onclick="submitAddMatch(${roundIndex})">Add Match</button>
    </div>
  `;

  showMatchEditorOverlay();
}

async function submitAddMatch(roundIndex) {
  const team1 = document.getElementById('add-match-t1').value;
  const team2 = document.getElementById('add-match-t2').value;
  if (team1 === team2) {
    alert('Please select two different teams.');
    return;
  }
  closeMatchEditor();
  const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${roundIndex}/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ team1, team2 })
  });
  if (res.ok) {
    tournament = await res.json();
    renderSidebar();
    renderBracketEditor();
  }
}

// ── Match editor ──

function openMatchEditor(matchEl) {
  const matchId = matchEl.dataset.match;
  const allMatches = tournament.rounds.flatMap(r => r.matches);
  const tm = Object.fromEntries(tournament.teams.map(t => [t.id, t]));
  const match = allMatches.find(m => m.id === matchId);
  if (!match) return;

  const roundIndex = tournament.rounds.findIndex(r => r.matches.some(m => m.id === matchId));

  const team1 = resolveTeam(match.team1Source, match.team1Override, allMatches, tm);
  const team2 = resolveTeam(match.team2Source, match.team2Override, allMatches, tm);
  const isSettled = !!match.result;
  const isBye = isByeMatch(match, allMatches, tm);

  const canPickWinner = team1 && team1.id !== 'BYE' && team2 && team2.id !== 'BYE';

  const winnerSection = canPickWinner ? `
    <div class="editor-section">
      <h4>${isSettled ? 'Change result' : 'Set winner'}</h4>
      <button class="editor-winner-btn${isSettled && match.result.winner === team1.id ? ' active' : ''}"
        onclick="setMatchWinner('${escAttr(matchId)}', '${escAttr(team1.id)}')">
        ${escHtml(team1.name)}${team1.status === 'dropped' ? ' <span class="dropped-badge">dropped</span>' : ''}
      </button>
      <button class="editor-winner-btn${isSettled && match.result.winner === team2.id ? ' active' : ''}"
        onclick="setMatchWinner('${escAttr(matchId)}', '${escAttr(team2.id)}')">
        ${escHtml(team2.name)}${team2.status === 'dropped' ? ' <span class="dropped-badge">dropped</span>' : ''}
      </button>
      ${isSettled ? `<button class="editor-clear-btn" onclick="clearMatchResult('${escAttr(matchId)}')">Clear result</button>` : ''}
    </div>` : (isSettled && !isBye ? `
    <div class="editor-section">
      <button class="editor-clear-btn" onclick="clearMatchResult('${escAttr(matchId)}')">Clear result</button>
    </div>` : '');

  const t1OverrideOpts = makeOverrideOpts(tournament.teams, match.team1Override);
  const t2OverrideOpts = makeOverrideOpts(tournament.teams, match.team2Override);
  const hasOverrides = match.team1Override || match.team2Override;

  matchEditorEl.innerHTML = `
    <div class="editor-header">
      <h3>Match ${escHtml(matchId)}</h3>
      <button class="editor-close" onclick="closeMatchEditor()">&#x2715;</button>
    </div>
    ${winnerSection}
    <div class="editor-section">
      <h4>Slot overrides</h4>
      <div class="settings-row">
        <label>Slot 1</label>
        <select id="override-t1" class="editor-select">
          <option value=""${!match.team1Override ? ' selected' : ''}>&#x2014; bracket source &#x2014;</option>
          ${t1OverrideOpts}
        </select>
      </div>
      <div class="settings-row">
        <label>Slot 2</label>
        <select id="override-t2" class="editor-select">
          <option value=""${!match.team2Override ? ' selected' : ''}>&#x2014; bracket source &#x2014;</option>
          ${t2OverrideOpts}
        </select>
      </div>
      <div class="editor-actions-row">
        <button class="btn-primary btn-sm" onclick="applyOverrides('${escAttr(matchId)}')">Apply</button>
        ${hasOverrides ? `<button class="editor-clear-btn btn-sm" onclick="clearOverrides('${escAttr(matchId)}')">Clear overrides</button>` : ''}
      </div>
    </div>
    ${!isSettled ? `
    <div class="editor-section editor-danger-section">
      <button class="editor-remove-match-btn" onclick="removeMatch(${roundIndex}, '${escAttr(matchId)}')">Remove match</button>
    </div>` : ''}
  `;

  showMatchEditorOverlay();
}

function makeOverrideOpts(teams, currentOverride) {
  return teams.map(t =>
    `<option value="${escAttr(t.id)}"${t.id === currentOverride ? ' selected' : ''}>${escHtml(t.name)}${t.status === 'dropped' ? ' (dropped)' : ''}</option>`
  ).join('');
}

function showMatchEditorOverlay() {
  meOverlayEl.style.display = 'block';
  matchEditorEl.style.display = 'block';
  meOverlayEl.onclick = closeMatchEditor;
}

function closeMatchEditor() {
  meOverlayEl.style.display = 'none';
  matchEditorEl.style.display = 'none';
}

async function setMatchWinner(matchId, winnerId) {
  closeMatchEditor();
  const res = await fetch(`/api/tournaments/${tournamentId}/matches/${matchId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ winner: winnerId })
  });
  if (res.ok) {
    tournament = await res.json();
    renderBracketEditor();
  }
}

async function clearMatchResult(matchId) {
  closeMatchEditor();
  const res = await fetch(`/api/tournaments/${tournamentId}/matches/${matchId}`, {
    method: 'DELETE'
  });
  if (res.ok) {
    tournament = await res.json();
    renderBracketEditor();
  }
}

async function applyOverrides(matchId) {
  const t1 = document.getElementById('override-t1').value || null;
  const t2 = document.getElementById('override-t2').value || null;
  closeMatchEditor();
  const res = await fetch(`/api/tournaments/${tournamentId}/matches/${matchId}/overrides`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ team1Override: t1, team2Override: t2 })
  });
  if (res.ok) {
    tournament = await res.json();
    renderBracketEditor();
  }
}

async function removeMatch(roundIndex, matchId) {
  closeMatchEditor();
  const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${roundIndex}/matches/${matchId}`, {
    method: 'DELETE'
  });
  if (res.ok) {
    tournament = await res.json();
    renderSidebar();
    renderBracketEditor();
  } else {
    const err = await res.json();
    alert(err.error || 'Could not remove match.');
  }
}

async function clearOverrides(matchId) {
  closeMatchEditor();
  const res = await fetch(`/api/tournaments/${tournamentId}/matches/${matchId}/overrides`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ team1Override: null, team2Override: null })
  });
  if (res.ok) {
    tournament = await res.json();
    renderBracketEditor();
  }
}

// ── Utilities ──

function splitDatetime(isoStr) {
  const d = new Date(isoStr);
  const pad = n => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
  };
}

function saveDatetime(settingKey, dateVal, timeVal) {
  if (!dateVal) {
    patchSettings({ [settingKey]: null });
    return;
  }
  const iso = new Date(`${dateVal}T${timeVal || '00:00'}`).toISOString();
  patchSettings({ [settingKey]: iso });
}

async function clearDatetime(settingKey, fieldKey) {
  const dateEl = document.getElementById(`setting-${fieldKey}-date`);
  const timeEl = document.getElementById(`setting-${fieldKey}-time`);
  if (dateEl) { dateEl.value = ''; }
  if (timeEl) { timeEl.value = ''; timeEl.disabled = true; }
  await patchSettings({ [settingKey]: null });
  renderSidebar();
}

function copyRegLink(btn) {
  const url = `${window.location.origin}/register/${tournamentId}`;
  navigator.clipboard.writeText(url).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
  });
}

// ── Init ──
loadTournament();
