const nameInput = document.getElementById('t-name');
const createBtn = document.getElementById('create-btn');
const errorMsg = document.getElementById('error-msg');
const list = document.getElementById('tournament-list');

function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.display = 'block';
}

function clearError() {
  errorMsg.style.display = 'none';
}

createBtn.addEventListener('click', async () => {
  clearError();
  const name = nameInput.value.trim();
  if (!name) return showError('Please enter a tournament name.');

  const res = await fetch('/api/tournaments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });

  if (!res.ok) {
    const err = await res.json();
    return showError(err.error || 'Failed to create tournament.');
  }

  const created = await res.json();
  window.location.href = `/config/${created.id}`;
});

nameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') createBtn.click();
});

let activeId = null;

async function loadTournaments() {
  const [tRes, aRes] = await Promise.all([
    fetch('/api/tournaments'),
    fetch('/api/active')
  ]);
  const tournaments = await tRes.json();
  const { activeTournamentId } = await aRes.json();
  activeId = activeTournamentId;

  if (tournaments.length === 0) {
    list.innerHTML = '<li><p class="empty-state">No tournaments yet.</p></li>';
    return;
  }

  list.innerHTML = tournaments.map(t => {
    const isActive = t.id === activeId;
    const totalRounds = t.rounds.length;
    const totalMatches = t.rounds.reduce((sum, r) => sum + r.matches.length, 0);
    let metaStr;
    if (totalRounds === 0) {
      metaStr = 'No rounds yet';
    } else {
      metaStr = `${totalRounds} round${totalRounds !== 1 ? 's' : ''}, ${totalMatches} match${totalMatches !== 1 ? 'es' : ''}`;
    }
    return `
      <li data-id="${t.id}"${isActive ? ' class="active-tournament"' : ''}>
        <div>
          <div class="t-name">
            ${escHtml(t.name)}
            ${isActive ? '<span class="active-badge">on display</span>' : ''}
          </div>
          <div class="t-meta">${metaStr}</div>
        </div>
        <div class="t-actions">
          ${isActive
            ? ''
            : `<button class="btn-secondary btn-sm" onclick="setActive('${escHtml(t.id)}')">Set Active</button>`}
          <a class="btn-secondary btn-sm" href="/config/${t.id}">Edit</a>
          <button class="btn-danger btn-sm" onclick="deleteTournament('${escHtml(t.id)}')">Delete</button>
        </div>
      </li>`;
  }).join('');
}

async function setActive(id) {
  await fetch('/api/active', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tournamentId: id })
  });
  await loadTournaments();
}

async function deleteTournament(id) {
  if (!confirm('Delete this tournament?')) return;
  await fetch(`/api/tournaments/${id}`, { method: 'DELETE' });
  await loadTournaments();
}

loadTournaments();
