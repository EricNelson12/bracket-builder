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

async function loadTournaments() {
  const res = await fetch('/api/tournaments');
  const tournaments = await res.json();

  if (tournaments.length === 0) {
    list.innerHTML = '<li><p class="empty-state">No tournaments yet.</p></li>';
    return;
  }

  list.innerHTML = tournaments.map(t => {
    const totalRounds = t.rounds.length;
    const totalMatches = t.rounds.reduce((sum, r) => sum + r.matches.length, 0);
    let metaStr;
    if (totalRounds === 0) {
      metaStr = 'No rounds yet';
    } else {
      metaStr = `${totalRounds} round${totalRounds !== 1 ? 's' : ''}, ${totalMatches} match${totalMatches !== 1 ? 'es' : ''}`;
    }
    return `
      <li data-id="${t.id}">
        <div>
          <div class="t-name">${escHtml(t.name)}</div>
          <div class="t-meta">${metaStr}</div>
        </div>
        <div class="t-actions">
          <a class="btn-secondary btn-sm" href="/config/${t.id}">Edit</a>
          <button class="btn-danger btn-sm" onclick="deleteTournament('${escHtml(t.id)}')">Delete</button>
        </div>
      </li>`;
  }).join('');
}

async function deleteTournament(id) {
  if (!confirm('Delete this tournament?')) return;
  await fetch(`/api/tournaments/${id}`, { method: 'DELETE' });
  await loadTournaments();
}

loadTournaments();
