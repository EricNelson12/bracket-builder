const regSubtitle         = document.getElementById('reg-subtitle');
const regCard             = document.getElementById('reg-card');
const tournamentPickerGroup = document.getElementById('tournament-picker-group');
const regTournamentSelect = document.getElementById('reg-tournament');
const regCutoffHint       = document.getElementById('reg-cutoff-hint');
const regFormBody         = document.getElementById('reg-form-body');
const regSuccess          = document.getElementById('reg-success');
const regSuccessMsg       = document.getElementById('reg-success-msg');
const regAgainBtn         = document.getElementById('reg-again');
const regError            = document.getElementById('reg-error');
const regSubmit           = document.getElementById('reg-submit');

// Detect pre-selected tournament from URL path (/register/:id)
const pathParts = window.location.pathname.split('/').filter(Boolean);
const preselectedId = pathParts[0] === 'register' && pathParts[1] ? pathParts[1] : null;

let openTournaments = [];
let selectedTournamentId = null;

async function init() {
  let res;
  try {
    res = await fetch('/api/tournaments/open');
  } catch {
    regSubtitle.textContent = 'Could not load tournaments.';
    regCard.style.display = 'none';
    return;
  }

  openTournaments = await res.json();

  if (openTournaments.length === 0) {
    regSubtitle.textContent = 'No tournaments are currently open for registration.';
    regCard.style.display = 'none';
    return;
  }

  if (preselectedId) {
    const t = openTournaments.find(t => t.id === preselectedId);
    if (!t) {
      regSubtitle.textContent = 'This tournament is not open for registration.';
      regCard.style.display = 'none';
      return;
    }
    tournamentPickerGroup.style.display = 'none';
    selectTournament(t);
  } else {
    populatePicker(openTournaments);
  }
}

function populatePicker(tournaments) {
  regTournamentSelect.innerHTML =
    '<option value="">— Select a tournament —</option>' +
    tournaments.map(t =>
      `<option value="${escAttr(t.id)}">${escHtml(t.name)} (${t.teamCount} registered)</option>`
    ).join('');

  regTournamentSelect.addEventListener('change', () => {
    const t = openTournaments.find(t => t.id === regTournamentSelect.value);
    if (t) {
      selectTournament(t);
    } else {
      regFormBody.style.display = 'none';
      regCutoffHint.textContent = '';
      selectedTournamentId = null;
    }
  });
}

function selectTournament(t) {
  selectedTournamentId = t.id;
  regSubtitle.textContent = `Registering for: ${t.name}`;

  if (t.registrationCutoff) {
    const cutoff = new Date(t.registrationCutoff);
    const timeStr = cutoff.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = cutoff.toLocaleDateString([], { month: 'short', day: 'numeric' });
    regCutoffHint.textContent = `Registration closes ${dateStr} at ${timeStr}`;
  } else {
    regCutoffHint.textContent = '';
  }

  regFormBody.style.display = 'block';
}

regSubmit.addEventListener('click', async () => {
  regError.style.display = 'none';

  const name = document.getElementById('reg-team-name').value.trim();
  const captain = document.getElementById('reg-captain').value.trim();
  const pictureFile = document.getElementById('reg-picture').files[0];

  if (!name) {
    regError.textContent = 'Team name is required.';
    regError.style.display = 'block';
    return;
  }
  if (!selectedTournamentId) {
    regError.textContent = 'Please select a tournament.';
    regError.style.display = 'block';
    return;
  }

  const formData = new FormData();
  formData.append('name', name);
  if (captain) formData.append('captain', captain);
  if (pictureFile) formData.append('picture', pictureFile);

  regSubmit.disabled = true;
  regSubmit.textContent = 'Submitting\u2026';

  try {
    const res = await fetch(`/api/tournaments/${selectedTournamentId}/register`, {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      regError.textContent = err.error || 'Registration failed.';
      regError.style.display = 'block';
      return;
    }

    regCard.style.display = 'none';
    regSuccess.style.display = 'block';
    regSuccessMsg.textContent = `"${name}" has been registered! The organizer will confirm your spot.`;
  } finally {
    regSubmit.disabled = false;
    regSubmit.textContent = 'Register Team';
  }
});

regAgainBtn.addEventListener('click', () => {
  regSuccess.style.display = 'none';
  regCard.style.display = 'block';
  document.getElementById('reg-team-name').value = '';
  document.getElementById('reg-captain').value = '';
  document.getElementById('reg-picture').value = '';
  regError.style.display = 'none';
  selectedTournamentId = preselectedId || null;
});

function escHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;');
}

init();
