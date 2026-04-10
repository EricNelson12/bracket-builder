const nameInput = document.getElementById('t-name');
const teamsInput = document.getElementById('t-teams');
const createBtn = document.getElementById('create-btn');
const errorMsg = document.getElementById('error-msg');
const bracketHint = document.getElementById('bracket-hint');
const list = document.getElementById('tournament-list');

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

  const created = await res.json();
  nameInput.value = '';
  teamsInput.value = '';
  bracketHint.textContent = '';
  // Navigate directly to the new tournament's config page
  window.location.href = `/config/${created.id}`;
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
          <a class="btn-secondary btn-sm" href="/config/${t.id}">Edit</a>
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

// ── Utils ──

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

loadTournaments();
