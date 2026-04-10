const nameInput = document.getElementById('t-name');
const teamsInput = document.getElementById('t-teams');
const createBtn = document.getElementById('create-btn');
const errorMsg = document.getElementById('error-msg');
const bracketHint = document.getElementById('bracket-hint');
const list = document.getElementById('tournament-list');

// Modal elements
const modalOverlay = document.getElementById('modal-overlay');
const editNameInput = document.getElementById('edit-name');
const editTeamsInput = document.getElementById('edit-teams');
const editBracketHint = document.getElementById('edit-bracket-hint');
const editErrorMsg = document.getElementById('edit-error-msg');
const modalSaveBtn = document.getElementById('modal-save-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');

let editingTournament = null; // the full tournament object being edited

// ── Create form ──

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.display = 'block';
}

function clearError() {
  errorMsg.style.display = 'none';
}

function parseTeams(raw) {
  return raw.split('\n').map(t => t.trim()).filter(Boolean);
}

function updateHint(teams, hintEl) {
  if (teams.length >= 2) {
    const { size, byes } = bracketSizeInfo(teams.length);
    hintEl.textContent = byes === 0
      ? `${teams.length} teams → ${size}-team bracket`
      : `${teams.length} teams → ${size}-team bracket with ${byes} bye${byes !== 1 ? 's' : ''}`;
  } else {
    hintEl.textContent = '';
  }
}

teamsInput.addEventListener('input', () => {
  updateHint(parseTeams(teamsInput.value), bracketHint);
});

document.getElementById('shuffle-btn').addEventListener('click', () => {
  const teams = parseTeams(teamsInput.value);
  if (teams.length < 2) return;
  for (let i = teams.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [teams[i], teams[j]] = [teams[j], teams[i]];
  }
  teamsInput.value = teams.join('\n');
  updateHint(teams, bracketHint);
});

createBtn.addEventListener('click', async () => {
  clearError();
  const name = nameInput.value.trim();
  const teams = parseTeams(teamsInput.value);

  if (!name) return showError('Please enter a tournament name.');
  if (teams.length < 2) return showError('Please enter at least 2 teams.');

  const res = await fetch('/api/tournaments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, teams })
  });

  if (!res.ok) {
    const err = await res.json();
    return showError(err.error || 'Failed to create tournament.');
  }

  nameInput.value = '';
  teamsInput.value = '';
  bracketHint.textContent = '';
  await loadTournaments();
});

// ── Tournament list ──

async function loadTournaments() {
  const res = await fetch('/api/tournaments');
  const tournaments = await res.json();

  if (tournaments.length === 0) {
    list.innerHTML = '<li><p class="empty-state">No tournaments yet.</p></li>';
    return;
  }

  list.innerHTML = tournaments.map(t => {
    const totalTeams = t.teams.length;
    const { size, byes } = bracketSizeInfo(totalTeams);
    const byeNote = byes > 0 ? `, ${byes} bye${byes !== 1 ? 's' : ''}` : '';
    return `
      <li data-id="${t.id}">
        <div>
          <div class="t-name">${escHtml(t.name)}</div>
          <div class="t-meta">${totalTeams} teams, ${size}-team bracket${byeNote}</div>
        </div>
        <div class="t-actions">
          <button class="btn-secondary btn-sm" onclick="openEditModal('${t.id}')">Edit</button>
          <button class="btn-danger btn-sm" onclick="deleteTournament('${t.id}')">Delete</button>
        </div>
      </li>`;
  }).join('');
}

async function deleteTournament(id) {
  if (!confirm('Delete this tournament?')) return;
  await fetch(`/api/tournaments/${id}`, { method: 'DELETE' });
  await loadTournaments();
}

// ── Edit modal ──

async function openEditModal(id) {
  const res = await fetch('/api/tournaments');
  const tournaments = await res.json();
  editingTournament = tournaments.find(t => t.id === id);
  if (!editingTournament) return;

  editNameInput.value = editingTournament.name;
  editTeamsInput.value = editingTournament.teams.join('\n');
  editBracketHint.textContent = '';
  editErrorMsg.style.display = 'none';
  updateHint(editingTournament.teams, editBracketHint);

  modalOverlay.style.display = 'flex';
  editNameInput.focus();
}

function closeModal() {
  modalOverlay.style.display = 'none';
  editingTournament = null;
}

modalCancelBtn.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

editTeamsInput.addEventListener('input', () => {
  updateHint(parseTeams(editTeamsInput.value), editBracketHint);
});

modalSaveBtn.addEventListener('click', async () => {
  if (!editingTournament) return;
  editErrorMsg.style.display = 'none';

  const newName = editNameInput.value.trim();
  const newTeams = parseTeams(editTeamsInput.value);

  if (!newName) {
    editErrorMsg.textContent = 'Please enter a tournament name.';
    editErrorMsg.style.display = 'block';
    return;
  }
  if (newTeams.length < 2) {
    editErrorMsg.textContent = 'Please enter at least 2 teams.';
    editErrorMsg.style.display = 'block';
    return;
  }

  const teamsChanged = JSON.stringify(newTeams) !== JSON.stringify(editingTournament.teams);

  if (teamsChanged) {
    const ok = confirm('Changing the team list will reset all match results. Continue?');
    if (!ok) return;
  }

  const body = { name: newName };
  if (teamsChanged) body.teams = newTeams;

  const res = await fetch(`/api/tournaments/${editingTournament.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json();
    editErrorMsg.textContent = err.error || 'Failed to save changes.';
    editErrorMsg.style.display = 'block';
    return;
  }

  closeModal();
  await loadTournaments();
});

// ── Utils ──

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

loadTournaments();
