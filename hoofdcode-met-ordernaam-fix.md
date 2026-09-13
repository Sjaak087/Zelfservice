```
// ==================== Setup & toegang ====================
const params = new URLSearchParams(window.location.search);
const restaurantId = params.get('id');

function getMyRestaurants() {
  try { return JSON.parse(localStorage.getItem('mijnRestaurants')) || []; }
  catch (e) { return []; }
}

// Beheerdersmodus: toegankelijk via het admin-paneel, staat los van of dit
// apparaat zelf lid is van het restaurant. Geeft volledige eigenaar-rechten
// zonder dat er een eigen ledenrecord wordt aangemaakt.
const isAdminMode = params.get('admin') === '1' && sessionStorage.getItem('isRestaurantAdmin') === '1';

const deviceUsername = getUsername();

const mijnEntry = getMyRestaurants().find(r => r.id === restaurantId);
if (!restaurantId || (!mijnEntry && !isAdminMode) || (!deviceUsername && !isAdminMode)) {
  alert('Dit restaurant is niet bekend op dit apparaat. Join het eerst met een code.');
  window.location.href = 'index.html';
}

const isOwner = isAdminMode ? true : (!!mijnEntry && mijnEntry.rol === 'eigenaar');
const backUrl = isAdminMode ? 'admin.html' : 'index.html';

const restRef = db.ref('restaurants/' + restaurantId);

window.addEventListener('usernameChanged', event => {
  if (isAdminMode || !myMemberId || !event.detail || !event.detail.username) return;
  restRef.child('leden/' + myMemberId + '/naam').set(event.detail.username).catch(err => {
    console.error('Username synchroniseren mislukt:', err);
  });
});

// ==================== Waarschuwing van systeembeheer ====================
// Persoonlijke waarschuwingen worden centraal via access-control.js opgehaald.
// Daardoor krijgt iedere gebruiker zijn waarschuwing zodra de restaurantsite
// geopend/joined wordt, ongeacht of hij eigenaar of gewoon lid is.
// De oude restaurant-waarschuwing blijft alleen voor het bestaande
// restaurant-specifieke waarschuwingstype.
if (isOwner && !isAdminMode) {
  restRef.child('warning').once('value').then(snap => {
    const warning = snap.val();
    if (warning && warning.text) {
      const textEl = document.getElementById('owner-warning-text');
      if (textEl) textEl.textContent = warning.text;
      openModal('modal-owner-warning');
    }
  });
}
const ownerWarningOk = document.getElementById('owner-warning-ok');
if (ownerWarningOk) ownerWarningOk.addEventListener('click', () => {
  closeModal('modal-owner-warning');
  restRef.child('warning').remove();
});

// ==================== Automatische verwijdertimer ====================
// Sitebeheer kan per restaurant instellen na hoeveel tijd het automatisch
// verwijderd wordt (restaurants/{id}/autoDelete/deleteAt). Zolang deze
// pagina open staat, tonen we bovenin een aftellende timer en verwijdert
// dit apparaat het restaurant zelf zodra de tijd om is (meerdere apparaten
// kunnen dit tegelijk proberen; .remove() op een al verwijderd pad is
// onschuldig).
const deleteTimerBadge = document.getElementById('delete-timer-badge');
let deleteTimerInterval = null;
let autoDeleteAt = null;
let autoDeleteHandled = false;

function formatResterendeTijd(ms) {
  const totaalMin = Math.max(0, Math.round(ms / 60000));
  const uren = Math.floor(totaalMin / 60);
  const minuten = totaalMin % 60;
  if (uren > 0) return `${uren}u ${minuten}m`;
  return `${minuten}m`;
}

async function verwijderRestaurantAutomatisch() {
  if (autoDeleteHandled) return;
  autoDeleteHandled = true;
  try {
    const codeSnap = await restRef.child('code').once('value');
    const code = codeSnap.val();
    await restRef.remove();
    if (code) await db.ref('restaurantCodes/' + code).remove();
  } catch (e) {
    console.error(e);
    autoDeleteHandled = false;
    return;
  }
  if (!isAdminMode) {
    const list = getMyRestaurants().filter(r => r.id !== restaurantId);
    saveMyRestaurantsLocal(list);
  }
  alert('Dit restaurant is automatisch verwijderd (verwijdertimer is verlopen).');
  window.location.href = backUrl;
}

function tickDeleteTimer() {
  if (!autoDeleteAt) return;
  const resterend = autoDeleteAt - Date.now();
  if (resterend <= 0) {
    deleteTimerBadge.textContent = '⏱ Wordt nu verwijderd...';
    verwijderRestaurantAutomatisch();
    return;
  }
  deleteTimerBadge.textContent = `⏱ Verwijderd over ${formatResterendeTijd(resterend)}`;
}

restRef.child('autoDelete').on('value', (snap) => {
  const autoDelete = snap.val();
  if (deleteTimerInterval) { clearInterval(deleteTimerInterval); deleteTimerInterval = null; }

  if (!autoDelete || !autoDelete.deleteAt) {
    autoDeleteAt = null;
    deleteTimerBadge.style.display = 'none';
    return;
  }

  autoDeleteAt = autoDelete.deleteAt;
  deleteTimerBadge.style.display = '';
  tickDeleteTimer();
  deleteTimerInterval = setInterval(tickDeleteTimer, 15000);
});

const backLink = document.getElementById('back-link');
if (backLink) {
  backLink.href = backUrl;
  if (isAdminMode) backLink.textContent = '← Beheer';
}
if (isAdminMode) {
  const badge = document.getElementById('my-name-badge');
  if (badge) badge.textContent = '🔧 Beheerdersmodus';
}

function saveMyRestaurantsLocal(list) {
  localStorage.setItem('mijnRestaurants', JSON.stringify(list));
}

// ==================== Leden & rechten per tabblad ====================
const ALL_TABS = ['notities', 'bestellen', 'gereed', 'bar', 'keuken', 'voorraad', 'historie', 'instellingen'];
const TAB_LABELS = { bestellen: 'Bestellen', notities: 'Notities', voorraad: 'Voorraad', keuken: 'Keuken', bar: 'Bar', gereed: 'Gereed', historie: 'Historie', instellingen: 'Instellingen' };

function genLidId() {
  return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
async function genUniqueCode() {
  for (let i = 0; i < 20; i++) {
    const code = genCode();
    const snap = await db.ref('restaurantCodes/' + code).get();
    if (!snap.exists()) return code;
  }
  throw new Error('Kon geen unieke code genereren');
}

// Zorg dat dit apparaat een lid-id heeft. Bestaande memberships (van vóór deze functie,
// of als de join-schrijfactie ooit mislukte) krijgen bij het eerste bezoek gewoon alle
// tabbladen, zodat niemand onverwacht wordt buitengesloten.
let myMemberId = isAdminMode ? null : mijnEntry.memberId;
if (!isAdminMode && !myMemberId) {
  myMemberId = genLidId();
  const list = getMyRestaurants();
  const idx = list.findIndex(r => r.id === restaurantId);
  if (idx > -1) { list[idx].memberId = myMemberId; saveMyRestaurantsLocal(list); }
}
function applyTabPermissions(tabs) {
  tabs = tabs || {};
  let firstVisible = null;
  ALL_TABS.forEach(t => {
    const btn = document.querySelector(`.tab-btn[data-tab="${t}"]`);
    if (!btn) return;
    // Veiligheidsklep: de eigenaar behoudt altijd toegang tot Instellingen, anders zou
    // die zichzelf per ongeluk kunnen buitensluiten van het ledenbeheer.
    // Ontbreekt een tabblad helemaal in het ledenrecord (bijv. "bar", toegevoegd nadat dit
    // lid al bestond), dan tellen we dat als toegestaan i.p.v. verborgen — anders zou een
    // nieuw tabblad onzichtbaar blijven voor iedereen die al langer lid was.
    const allowed = (isOwner && t === 'instellingen') || tabs[t] === true || tabs[t] === undefined;
    btn.style.display = allowed ? '' : 'none';
    if (allowed && !firstVisible) firstVisible = t;
  });
  const activeBtn = document.querySelector('.tab-btn.active');
  if (firstVisible && (!activeBtn || activeBtn.style.display === 'none')) {
    document.querySelector(`.tab-btn[data-tab="${firstVisible}"]`).click();
  }
}

if (isAdminMode) {
  // Beheerder is geen echt lid van dit restaurant: geen ledenrecord aanmaken
  // of beluisteren. Alle tabbladen blijven gewoon zichtbaar (standaard uit de
  // HTML) en de rechten hieronder (isOwner === true) geven volledige toegang.
} else {
  // Eerst checken of het RESTAURANT ZELF nog bestaat, vóórdat we concluderen
  // dat alleen ons eigen ledenrecord nog aangemaakt moet worden. Zonder deze
  // check zou een verwijderd restaurant (bijv. door de automatische
  // verwijdertimer) per ongeluk weer helemaal opnieuw aangemaakt worden
  // zodra iemand met een oude link/bladwijzer terugkomt — met een lege naam
  // ("Restaurant") en onszelf als "Naamloos" lid.
  restRef.once('value').then(restSnap => {
    if (!restSnap.exists()) {
      const list = getMyRestaurants().filter(r => r.id !== restaurantId);
      saveMyRestaurantsLocal(list);
      alert('Dit restaurant bestaat niet meer.');
      window.location.href = backUrl;
      return null;
    }
    return restRef.child('leden/' + myMemberId).once('value').then(snap => {
      if (!snap.exists()) {
        const tabs = {};
        ALL_TABS.forEach(t => { tabs[t] = true; });
        const data = { rol: isOwner ? 'eigenaar' : 'gejoined', userId: window.BESTELSYSTEEM_USER_ID || '', naam: mijnEntry.mijnNaam || getUsername() || 'Naamloos', tabs: tabs, canAanmaken: true, toegevoegdOp: Date.now() };
        return restRef.child('leden/' + myMemberId).set(data).then(() => tabs);
      }
      return snap.val().tabs;
    });
  }).then(tabs => {
    if (!tabs) return; // restaurant bestond niet meer, hierboven al afgehandeld
    applyTabPermissions(tabs);
    if (isOwner) {
      // Zorg dat de eigenaar zichzelf meteen in de ledenlijst ziet, ook nog vóórdat
      // het live-abonnement op /leden zijn eerste update heeft binnengekregen.
      LEDEN_STATE[myMemberId] = LEDEN_STATE[myMemberId] || { rol: 'eigenaar', tabs: tabs, canAanmaken: true, toegevoegdOp: Date.now() };
      renderLedenList();
    }
    // Pas ná het aanmaken/ophalen van dit lid-record live gaan luisteren, anders kan het
    // even (foutief) lijken alsof je bent gekickt terwijl het record nog geschreven wordt.
    restRef.child('leden/' + myMemberId).on('value', snap => {
      if (!snap.exists()) {
        alert('Je bent verwijderd uit dit restaurant.');
        const list = getMyRestaurants().filter(r => r.id !== restaurantId);
        saveMyRestaurantsLocal(list);
        window.location.href = 'index.html';
        return;
      }
      const lid = snap.val();
      if (window.BESTELSYSTEEM_USER_ID && lid.userId !== window.BESTELSYSTEEM_USER_ID) {
        restRef.child('leden/' + myMemberId + '/userId').set(window.BESTELSYSTEEM_USER_ID);
      }
      const username = getUsername();
      if (username && lid.naam !== username) {
        restRef.child('leden/' + myMemberId + '/naam').set(username);
      }
      applyTabPermissions(lid.tabs);
      updateMyNameBadge(lid.customNaam || lid.naam, lid.rolNaam);
    });
  });
}

// ==================== Eigen naam bovenaan ====================
function updateMyNameBadge(naam, rolNaam) {
  const username = getUsername() || naam || '';
  const badge = document.getElementById('my-name-badge');
  const label = document.getElementById('my-username-label');
  if (label) label.textContent = username;
  else if (badge) badge.textContent = username ? `👤 ${username}${rolNaam ? ' · ' + rolNaam : ''}` : '';
  if (badge) badge.title = username ? 'Klik om je username te wijzigen' : '';
  const infoEl = document.getElementById('info-mijn-naam');
  if (infoEl) infoEl.textContent = username || '—';
}

if (isAdminMode) {
  // Beheerder heeft geen eigen ledenrecord in dit restaurant, dus deze rij is
  // hier niet van toepassing.
  const row = document.getElementById('row-mijn-naam');
  if (row) row.style.display = 'none';
} else {
  document.getElementById('btn-rename-mijn-naam').addEventListener('click', () => {
    document.getElementById('rename-mijn-naam-input').value = getUsername();
    document.getElementById('rename-mijn-naam-error').textContent = '';
    openModal('modal-rename-mijn-naam');
  });
}
document.getElementById('rename-mijn-naam-confirm').addEventListener('click', async () => {
  const input = document.getElementById('rename-mijn-naam-input');
  const errorEl = document.getElementById('rename-mijn-naam-error');
  const username = input.value.trim();
  if (!username) { errorEl.textContent = 'Vul een username in.'; return; }
  if (username.length > 15) { errorEl.textContent = 'Je username mag maximaal 15 tekens lang zijn.'; return; }

  const btn = document.getElementById('rename-mijn-naam-confirm');
  btn.disabled = true;
  try {
    setUsername(username);
    await restRef.child('leden/' + myMemberId + '/naam').set(username);
    closeModal('modal-rename-mijn-naam');
    await openUsernameWarning();
  } catch (err) {
    console.error(err);
    errorEl.textContent = 'Er ging iets mis, probeer opnieuw.';
  } finally {
    btn.disabled = false;
  }
});

// ---- Ledenlijst (alleen zichtbaar/bewerkbaar voor de eigenaar) ----
let LEDEN_STATE = {};
if (!isOwner) {
  document.getElementById('subtab-btn-leden').style.display = 'none';
} else {
  restRef.child('leden').on('value', snap => {
    LEDEN_STATE = snap.val() || {};
    renderLedenList();
  });
}

function renderLedenList() {
  const list = document.getElementById('leden-list');
  const entries = Object.entries(LEDEN_STATE).sort((a, b) => (a[1].toegevoegdOp || 0) - (b[1].toegevoegdOp || 0));
  if (entries.length === 0) {
    list.innerHTML = '<div class="empty-msg">Nog geen leden gevonden.</div>';
    return;
  }
  list.innerHTML = '';
  entries.forEach(([mid, lid]) => {
    const isEigenaarRow = lid.rol === 'eigenaar';
    const isMe = mid === myMemberId;
    const icon = isEigenaarRow ? '👑' : '👤';
    const naam = `${icon} ${lid.customNaam || lid.naam || 'Naamloos'}`;
    const tabs = lid.tabs || {};
    const row = document.createElement('div');
    row.className = 'lid-row';
    const tabsHtml = ALL_TABS.map(t => {
      const checked = tabs[t] !== false ? 'checked' : '';
      return `<label class="lid-tab-toggle"><input type="checkbox" data-mid="${mid}" data-tab="${t}" ${checked}> ${TAB_LABELS[t]}</label>`;
    }).join('');
    row.innerHTML = `
      <div class="lid-row-head">
        <span class="lid-row-name">${escapeHtml(naam)}${isMe ? ' <span class="lid-me-tag">(jij)</span>' : ''}${lid.rolNaam ? ` <span class="ice-badge">🏷️ ${escapeHtml(lid.rolNaam)}</span>` : ''}</span>
        <span class="settings-product-actions">
          <button type="button" class="mini-btn edit" data-role="${mid}">Lid beheren</button>
          ${isEigenaarRow ? '' : `<button type="button" class="mini-btn danger" data-kick="${mid}">Verwijderen</button>`}
        </span>
      </div>
      <div class="lid-tabs">${tabsHtml}</div>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      restRef.child(`leden/${cb.dataset.mid}/tabs/${cb.dataset.tab}`).set(cb.checked);
    });
  });
  list.querySelectorAll('[data-kick]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Weet je zeker dat je dit lid wilt verwijderen? De join-code wordt daarna automatisch vernieuwd.')) return;
      kickLid(btn.dataset.kick, btn);
    });
  });
  list.querySelectorAll('[data-role]').forEach(btn => {
    btn.addEventListener('click', () => openMemberRoleModal(btn.dataset.role));
  });
}

// Verzamelt alle al eerder gebruikte rollen (over alle leden heen), zodat je
// die bij een ander lid kunt hergebruiken zonder opnieuw te typen.
function allKnownRoles() {
  const map = new Map();
  Object.values(LEDEN_STATE).forEach(lid => {
    const naam = lid.rolNaam && lid.rolNaam.trim();
    if (naam && !map.has(naam.toLowerCase())) map.set(naam.toLowerCase(), naam);
  });
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'nl'));
}

let editingRoleMemberId = null;

function openMemberRoleModal(mid) {
  editingRoleMemberId = mid;
  const lid = LEDEN_STATE[mid] || {};
  document.getElementById('member-manage-modal-title').textContent = `Lid beheren: ${lid.naam || 'lid'}`;
  document.getElementById('member-role-input').value = lid.rolNaam || '';
  document.getElementById('member-custom-name-input').value = lid.customNaam || '';
  document.getElementById('member-can-create-input').checked = lid.canAanmaken === true;
  document.getElementById('member-role-error').textContent = '';
  renderExistingRolesPicker();
  const removeBtn = document.getElementById('member-manage-remove');
  removeBtn.style.display = lid.rol === 'eigenaar' ? 'none' : '';
  openModal('modal-member-manage');
}

function renderExistingRolesPicker() {
  const wrap = document.getElementById('member-manage-existing');
  if (!wrap) return;
  const known = allKnownRoles();
  if (known.length === 0) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = '<div class="modal-label" style="margin-top:0;">Al bestaande rollen (klik om te kiezen)</div>';
  const row = document.createElement('div');
  row.className = 'product-options-list';
  known.forEach(naam => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'product-option-chip existing';
    chip.textContent = naam;
    chip.addEventListener('click', () => { document.getElementById('member-role-input').value = naam; });
    row.appendChild(chip);
  });
  wrap.appendChild(row);
}

async function saveMemberManagement() {
  if (!editingRoleMemberId) return;
  const role = document.getElementById('member-role-input').value.trim();
  const customNaam = document.getElementById('member-custom-name-input').value.trim();
  const canAanmaken = document.getElementById('member-can-create-input').checked === true;
  const err = document.getElementById('member-role-error');
  const lid = LEDEN_STATE[editingRoleMemberId] || {};
  const updates = {};
  if (role) updates[`leden/${editingRoleMemberId}/rolNaam`] = role;
  else updates[`leden/${editingRoleMemberId}/rolNaam`] = null;
  if (customNaam) updates[`leden/${editingRoleMemberId}/customNaam`] = customNaam;
  else updates[`leden/${editingRoleMemberId}/customNaam`] = null;
  // Expliciet opslaan: false is de standaard voor bestaande én nieuwe leden.
  updates[`leden/${editingRoleMemberId}/canAanmaken`] = canAanmaken;
  try {
    await restRef.update(updates);
    closeModal('modal-member-manage');
  } catch (e) {
    console.error(e);
    err.textContent = 'Opslaan mislukt, probeer opnieuw.';
  }
}

document.getElementById('member-role-confirm').addEventListener('click', saveMemberManagement);

document.getElementById('member-role-clear').addEventListener('click', () => {
  if (!editingRoleMemberId) return;
  document.getElementById('member-role-input').value = '';
});

document.getElementById('member-manage-remove').addEventListener('click', () => {
  if (!editingRoleMemberId) return;
  if (!confirm('Weet je zeker dat je dit lid uit het restaurant wilt verwijderen? De join-code wordt daarna automatisch vernieuwd.')) return;
  kickLid(editingRoleMemberId, document.getElementById('member-manage-remove'));
  closeModal('modal-member-manage');
});

async function kickLid(mid, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Bezig...'; }
  try {
    const huidigeCodeSnap = await restRef.child('code').once('value');
    const huidigeCode = huidigeCodeSnap.val();
    const nieuweCode = await genUniqueCode();
    await restRef.update({ ['leden/' + mid]: null, code: nieuweCode });
    if (huidigeCode) await db.ref('restaurantCodes/' + huidigeCode).remove();
    await db.ref('restaurantCodes/' + nieuweCode).set(restaurantId);
  } catch (err) {
    console.error(err);
    alert('Er ging iets mis bij het verwijderen van dit lid.');
    if (btn) { btn.disabled = false; btn.textContent = 'Verwijderen'; }
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}
function formatPrice(p) {
  const n = Number(p) || 0;
  return '€ ' + n.toFixed(2).replace('.', ',');
}
function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

// ==================== Restaurantinfo ====================
restRef.child('naam').on('value', snap => {
  const naam = snap.val() || 'Restaurant';
  document.getElementById('restaurant-title').textContent = naam;
  document.getElementById('info-naam').textContent = naam;
  const idx = getMyRestaurants().findIndex(r => r.id === restaurantId);
  if (idx > -1) {
    const list = getMyRestaurants();
    list[idx].naam = naam;
    localStorage.setItem('mijnRestaurants', JSON.stringify(list));
  }
});

restRef.child('selfserviceCode').on('value', snap => {
  selfserviceCode = snap.val() || "";
  const el = document.getElementById('info-ss-code');
  if (el) el.textContent = selfserviceCode || "—";
});
restRef.child('code').on('value', snap => {
  document.getElementById('info-code').textContent = snap.val() || '—';
});

// ==================== Tabs ====================
let activeTab = 'notities';
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    document.getElementById('panel-' + activeTab).classList.add('active');
  });
});

// ==================== Rechten voor leden: aanmaken ====================
// Alleen de eigenaar of een lid met canAanmaken=true mag nieuwe onderdelen aanmaken.
let canAanmaken = isOwner;
if (!isAdminMode && !isOwner) {
  restRef.child('leden/' + myMemberId + '/canAanmaken').on('value', snap => {
    canAanmaken = snap.val() === true;
    applyCreatePermissions();
  });
}
function applyCreatePermissions() {
  if (isOwner || isAdminMode || canAanmaken) return;
  ['btn-add-product','btn-add-category','btn-add-service','tool-add-area','tool-add-table','tool-add-bank','tool-add-bar','tool-add-keuken'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  ['producten-readonly-note','categorieen-readonly-note','services-readonly-note'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'block';
  });
}

// ==================== Rechten (alleen eigenaar mag plattegrond/producten aanpassen) ====================
if (!isOwner) {
  document.getElementById('tool-add-area').style.display = 'none';
  document.getElementById('tool-add-table').style.display = 'none';
  document.getElementById('tool-add-bank').style.display = 'none';
  document.getElementById('tool-add-bar').style.display = 'none';
  document.getElementById('tool-add-keuken').style.display = 'none';
  document.getElementById('tool-delete').style.display = 'none';
  document.getElementById('fp-gridsize-row').style.display = 'none';
  document.getElementById('fp-hint').textContent = 'Alleen de eigenaar kan de plattegrond aanpassen.';
  document.getElementById('btn-add-product').style.display = 'none';
  document.getElementById('producten-readonly-note').style.display = 'block';
  document.getElementById('btn-add-category').style.display = 'none';
  document.getElementById('categorieen-readonly-note').style.display = 'block';
  document.getElementById('btn-add-service').style.display = 'none';
  document.getElementById('services-readonly-note').style.display = 'block';
} else {
  document.getElementById('btn-rename-restaurant').style.display = '';
  document.getElementById('btn-header-color').style.display = '';
  document.getElementById('btn-title-color').style.display = '';
  document.getElementById('btn-bg-pattern').style.display = '';
  document.getElementById('btn-font').style.display = '';
  document.getElementById('row-join-code').style.display = '';
  document.getElementById('join-code-hint').style.display = 'block';
}

// Een lid met de instelling 'Producten en alles kunnen aanmaken' mag de
// aanmaakacties gebruiken. Layout-aanpassingen blijven verder alleen voor de eigenaar.
function refreshCreateControlsForMember() {
  if (isOwner || isAdminMode || !canAanmaken) return;
  ['btn-add-product','btn-add-category','btn-add-service'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = '';
  });
  ['producten-readonly-note','categorieen-readonly-note','services-readonly-note'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  ['tool-add-area','tool-add-table','tool-add-bank','tool-add-bar','tool-add-keuken'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = '';
  });
  const hint = document.getElementById('fp-hint');
  if (hint) hint.textContent = 'Je hebt toestemming om onderdelen aan te maken.';
}

const _oldApplyCreatePermissions = applyCreatePermissions;
applyCreatePermissions = function() {
  _oldApplyCreatePermissions();
  refreshCreateControlsForMember();
};
applyCreatePermissions();

// ==================== Restaurant verlaten ====================
if (isAdminMode) {
  document.getElementById('btn-leave-restaurant').textContent = '🗑 Restaurant verwijderen';
  document.getElementById('leave-restaurant-hint').textContent = 'Als beheerder verwijder je hiermee dit hele restaurant definitief, inclusief alle leden, tafels, producten en geschiedenis.';
} else {
  document.getElementById('leave-restaurant-hint').textContent = isOwner
    ? 'Let op: als eigenaar wordt bij het verlaten het hele restaurant definitief verwijderd, inclusief alle leden, tafels, producten en geschiedenis.'
    : 'Je verliest hierna de toegang tot dit restaurant op dit apparaat.';
}

document.getElementById('btn-leave-restaurant').addEventListener('click', async () => {
  const btn = document.getElementById('btn-leave-restaurant');
  if (isAdminMode) {
    const naamHuidig = document.getElementById('info-naam').textContent.trim();
    if (!confirm(`Weet je zeker dat je "${naamHuidig}" wilt verwijderen? Dit verwijdert het HELE restaurant definitief, inclusief alle leden, tafels, producten en geschiedenis. Dit kan niet ongedaan gemaakt worden.`)) return;
    btn.disabled = true;
    try {
      const codeSnap = await restRef.child('code').once('value');
      const code = codeSnap.val();
      await restRef.remove();
      if (code) await db.ref('restaurantCodes/' + code).remove();
      window.location.href = backUrl;
    } catch (e) {
      console.error(e);
      btn.disabled = false;
      alert('Er ging iets mis, probeer het opnieuw.');
    }
  } else if (isOwner) {
    const naamHuidig = document.getElementById('info-naam').textContent.trim();
    if (!confirm(`Weet je zeker dat je "${naamHuidig}" wilt verlaten? Dit verwijdert het HELE restaurant definitief, inclusief alle leden, tafels, producten en geschiedenis. Dit kan niet ongedaan gemaakt worden.`)) return;
    btn.disabled = true;
    try {
      const codeSnap = await restRef.child('code').once('value');
      const code = codeSnap.val();
      await restRef.remove();
      if (code) await db.ref('restaurantCodes/' + code).remove();
      const list = getMyRestaurants().filter(r => r.id !== restaurantId);
      saveMyRestaurantsLocal(list);
      window.location.href = backUrl;
    } catch (e) {
      console.error(e);
      btn.disabled = false;
      alert('Er ging iets mis, probeer het opnieuw.');
    }
  } else {
    if (!confirm('Weet je zeker dat je dit restaurant wilt verlaten?')) return;
    btn.disabled = true;
    try {
      await restRef.child('leden/' + myMemberId).remove();
      const list = getMyRestaurants().filter(r => r.id !== restaurantId);
      saveMyRestaurantsLocal(list);
      window.location.href = 'index.html';
    } catch (e) {
      console.error(e);
      btn.disabled = false;
      alert('Er ging iets mis, probeer het opnieuw.');
    }
  }
});

document.getElementById('btn-rename-restaurant').addEventListener('click', () => {
  document.getElementById('rename-restaurant-input').value = document.getElementById('info-naam').textContent.trim();
  document.getElementById('rename-restaurant-error').textContent = '';
  openModal('modal-rename-restaurant');
});
document.getElementById('rename-restaurant-confirm').addEventListener('click', () => {
  const naam = document.getElementById('rename-restaurant-input').value.trim();
  const errorEl = document.getElementById('rename-restaurant-error');
  if (!naam) { errorEl.textContent = 'Vul een naam in.'; return; }
  const btn = document.getElementById('rename-restaurant-confirm');
  btn.disabled = true;
  restRef.child('naam').set(naam).then(() => {
    btn.disabled = false;
    closeModal('modal-rename-restaurant');
  }).catch(err => {
    console.error(err);
    btn.disabled = false;
    errorEl.textContent = 'Er ging iets mis, probeer opnieuw.';
  });
});
// ==================== Kleur bovenbalk ====================
const HEADER_COLORS = [
  '#171310', '#211a14', '#3a2f24', '#5c4a34', '#8c3a3a',
  '#6e2c2c', '#a8482f', '#c9793a', '#c9a24b', '#e0b84a',
  '#6f8f5c', '#3f6b4f', '#2f6e6e', '#356b8c', '#2c4a75',
  '#3a3a75', '#5c3a75', '#7a3a63', '#8c4a63', '#b05f7a',
  '#4a4438', '#5a5a5a', '#787066', '#2a2115', '#f2e8d5',
  '#1a2f4d', '#4b2e83', '#7c1f3d', '#1f4d3a', '#b8895c',
  '#12343b', '#284b63', '#3b5b92', '#6b4e71', '#8a5a7d',
  '#9b3d5a', '#b85c5c', '#d17a5a', '#d6a04d', '#e2c15a'
];

function hexToRgb(hex) {
  const clean = (hex || '').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}
function mix(hex, target, amt) {
  const c = hexToRgb(hex);
  const t = hexToRgb(target);
  const r = Math.round(c.r + (t.r - c.r) * amt);
  const g = Math.round(c.g + (t.g - c.g) * amt);
  const b = Math.round(c.b + (t.b - c.b) * amt);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}
function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const norm = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * norm[0] + 0.7152 * norm[1] + 0.0722 * norm[2];
}

function applyHeaderColor(color) {
  const root = document.documentElement.style;
  const bg = color || '#171310';
  const isLight = relativeLuminance(bg) > 0.5;
  root.setProperty('--bg', bg);
  root.setProperty('--bg-elevated', mix(bg, isLight ? '#000000' : '#ffffff', 0.08));
  root.setProperty('--card', mix(bg, isLight ? '#000000' : '#ffffff', 0.16));
  root.setProperty('--line', mix(bg, isLight ? '#000000' : '#ffffff', 0.32));
  root.setProperty('--ink', isLight ? '#241c12' : '#f3ead9');
  root.setProperty('--muted', isLight ? '#5a4c38' : '#a99a83');
  const preview = document.getElementById('info-header-color');
  if (preview) preview.style.background = bg;
}

const colorPaletteEl = document.getElementById('color-palette');
if (colorPaletteEl) {
  colorPaletteEl.innerHTML = HEADER_COLORS.map(c =>
    `<button type="button" class="color-swatch" data-color="${c}" style="background:${c};"></button>`
  ).join('');
  colorPaletteEl.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      const color = sw.dataset.color;
      restRef.child('headerColor').set(color).then(() => {
        closeModal('modal-header-color');
      }).catch(err => {
        console.error(err);
        alert('Er ging iets mis bij het opslaan van de kleur.');
      });
    });
  });
}

const headerColorDefaultBtn = document.getElementById('header-color-default');
if (headerColorDefaultBtn) {
  headerColorDefaultBtn.addEventListener('click', () => {
    restRef.child('headerColor').remove().then(() => {
      closeModal('modal-header-color');
    }).catch(err => {
      console.error(err);
      alert('Er ging iets mis bij het opslaan van de kleur.');
    });
  });
}

restRef.child('headerColor').on('value', snap => {
  const color = snap.val();
  applyHeaderColor(color);
  if (colorPaletteEl) {
    colorPaletteEl.querySelectorAll('.color-swatch').forEach(sw => {
      sw.classList.toggle('selected', !!color && sw.dataset.color.toLowerCase() === String(color).toLowerCase());
    });
  }
  if (headerColorDefaultBtn) {
    headerColorDefaultBtn.classList.toggle('selected', !color);
  }
});

const btnHeaderColor = document.getElementById('btn-header-color');
if (btnHeaderColor) {
  btnHeaderColor.addEventListener('click', () => openModal('modal-header-color'));
}

// ==================== Kleur restaurantnaam ====================
const TITLE_COLORS = [
  '#f3ead9', '#ffffff', '#e0b84a', '#c9a24b', '#f2e2ac',
  '#e8c88a', '#ff8c69', '#e8734a', '#c9793a', '#a8482f',
  '#ff6b6b', '#e05c5c', '#8c3a3a', '#d46a9c', '#e08cc0',
  '#c084d4', '#9d6fd8', '#7a7ae0', '#6f9fe0', '#5cc8e0',
  '#5ce0c8', '#6fe0a8', '#8fe06f', '#b8e05c', '#e0d85c',
  '#e0a85c', '#d9d9d9', '#a0a0a0', '#7ec9e8', '#f2b8d4'
];

function applyTitleColor(color) {
  const title = document.getElementById('restaurant-title');
  const preview = document.getElementById('info-title-color');
  const badge = document.getElementById('my-name-badge');
  if (title) {
    if (color) {
      title.style.background = 'none';
      title.style.webkitTextFillColor = color;
      title.style.color = color;
    } else {
      title.style.background = '';
      title.style.webkitTextFillColor = '';
      title.style.color = '';
    }
  }
  if (preview) {
    preview.style.background = color || 'linear-gradient(100deg, var(--gold-soft) 20%, var(--gold) 45%, var(--gold-soft) 70%)';
  }
  if (badge) {
    badge.style.color = color || '';
    badge.style.opacity = color ? '1' : '';
  }
}

const titleColorPaletteEl = document.getElementById('title-color-palette');
if (titleColorPaletteEl) {
  titleColorPaletteEl.innerHTML = TITLE_COLORS.map(c =>
    `<button type="button" class="color-swatch" data-color="${c}" style="background:${c};"></button>`
  ).join('');
  titleColorPaletteEl.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      const color = sw.dataset.color;
      restRef.child('titleColor').set(color).then(() => {
        closeModal('modal-title-color');
      }).catch(err => {
        console.error(err);
        alert('Er ging iets mis bij het opslaan van de kleur.');
      });
    });
  });
}

const titleColorDefaultBtn = document.getElementById('title-color-default');
if (titleColorDefaultBtn) {
  titleColorDefaultBtn.addEventListener('click', () => {
    restRef.child('titleColor').remove().then(() => {
      closeModal('modal-title-color');
    }).catch(err => {
      console.error(err);
      alert('Er ging iets mis bij het opslaan van de kleur.');
    });
  });
}

restRef.child('titleColor').on('value', snap => {
  const color = snap.val();
  applyTitleColor(color);
  if (titleColorPaletteEl) {
    titleColorPaletteEl.querySelectorAll('.color-swatch').forEach(sw => {
      sw.classList.toggle('selected', !!color && sw.dataset.color.toLowerCase() === String(color).toLowerCase());
    });
  }
  if (titleColorDefaultBtn) {
    titleColorDefaultBtn.classList.toggle('selected', !color);
  }
});

const btnTitleColor = document.getElementById('btn-title-color');
if (btnTitleColor) {
  btnTitleColor.addEventListener('click', () => openModal('modal-title-color'));
}

// ==================== Lettertype ====================
// 15 keuzes die gelden voor ALLE tekst in het restaurant (koppen én gewone tekst).
// Codes/tijden (--font-mono) blijven bewust monospace voor de leesbaarheid.
const FONT_OPTIONS = [
  { label: 'Playfair Display', family: '"Playfair Display", Georgia, serif' },
  { label: 'Merriweather', family: '"Merriweather", Georgia, serif' },
  { label: 'Cormorant Garamond', family: '"Cormorant Garamond", Georgia, serif' },
  { label: 'Lora', family: '"Lora", Georgia, serif' },
  { label: 'Crimson Text', family: '"Crimson Text", Georgia, serif' },
  { label: 'Roboto Slab', family: '"Roboto Slab", Georgia, serif' },
  { label: 'Poppins', family: '"Poppins", "Helvetica Neue", Arial, sans-serif' },
  { label: 'Montserrat', family: '"Montserrat", "Helvetica Neue", Arial, sans-serif' },
  { label: 'Raleway', family: '"Raleway", "Helvetica Neue", Arial, sans-serif' },
  { label: 'Josefin Sans', family: '"Josefin Sans", "Helvetica Neue", Arial, sans-serif' },
  { label: 'Oswald', family: '"Oswald", "Arial Narrow", sans-serif' },
  { label: 'Bebas Neue', family: '"Bebas Neue", "Arial Narrow", sans-serif' },
  { label: 'Abril Fatface', family: '"Abril Fatface", Georgia, serif' },
  { label: 'Caveat', family: '"Caveat", cursive' },
  { label: 'Dancing Script', family: '"Dancing Script", cursive' },
  { label: 'Nunito', family: '"Nunito", sans-serif' },
  { label: 'DM Sans', family: '"DM Sans", sans-serif' },
  { label: 'Quicksand', family: '"Quicksand", sans-serif' },
  { label: 'Libre Baskerville', family: '"Libre Baskerville", Georgia, serif' },
  { label: 'Space Grotesk', family: '"Space Grotesk", sans-serif' }
];
const FONT_SAMPLE_TEXT = 'Voorbeeld';

function applyFont(family) {
  const root = document.documentElement.style;
  const info = document.getElementById('info-font');
  if (family) {
    root.setProperty('--font-body', family);
    root.setProperty('--font-display', family);
  } else {
    root.removeProperty('--font-body');
    root.removeProperty('--font-display');
  }
  if (info) {
    const match = FONT_OPTIONS.find(f => f.family === family);
    info.textContent = match ? match.label : 'Standaard';
    info.style.fontFamily = family || '';
  }
}

const fontPaletteEl = document.getElementById('font-palette');
if (fontPaletteEl) {
  fontPaletteEl.innerHTML = FONT_OPTIONS.map(f => {
    // Belangrijk: f.family bevat zelf aanhalingstekens (bijv. "Playfair Display", Georgia, serif).
    // Die MOETEN als &quot; geschreven worden zodra ze in een HTML-attribuut (style="...") komen,
    // anders breekt de aanhalingstekens het attribuut open en valt de browser terug op het
    // algemene lettertype — waardoor alle voorbeelden hetzelfde lettertype tonen.
    const familyAttr = f.family.replace(/"/g, '&quot;');
    return `<button type="button" class="font-swatch" data-family="${familyAttr}" style="font-family:${familyAttr};">
      <span class="font-swatch-sample" style="font-family:${familyAttr};">${FONT_SAMPLE_TEXT}</span>
      <span class="font-swatch-label">${f.label}</span>
    </button>`;
  }).join('');
  fontPaletteEl.querySelectorAll('.font-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      const family = sw.dataset.family;
      restRef.child('font').set(family).then(() => {
        closeModal('modal-font');
      }).catch(err => {
        console.error(err);
        alert('Er ging iets mis bij het opslaan van het lettertype.');
      });
    });
  });
}

const fontDefaultBtn = document.getElementById('font-default');
if (fontDefaultBtn) {
  fontDefaultBtn.addEventListener('click', () => {
    restRef.child('font').remove().then(() => {
      closeModal('modal-font');
    }).catch(err => {
      console.error(err);
      alert('Er ging iets mis bij het opslaan van het lettertype.');
    });
  });
}

restRef.child('font').on('value', snap => {
  const family = snap.val();
  applyFont(family);
  if (fontPaletteEl) {
    fontPaletteEl.querySelectorAll('.font-swatch').forEach(sw => {
      sw.classList.toggle('selected', !!family && sw.dataset.family === family);
    });
  }
  if (fontDefaultBtn) {
    fontDefaultBtn.classList.toggle('selected', !family);
  }
});

const btnFont = document.getElementById('btn-font');
if (btnFont) {
  btnFont.addEventListener('click', () => openModal('modal-font'));
}

document.querySelectorAll('.subtab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.subtab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('subpanel-' + btn.dataset.subtab).classList.add('active');
  });
});

// ==================== Modal helpers ====================
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
  });
});

// ==================== Producten (live) ====================
let PRODUCTS_STATE = {}; // key -> {label, emoji, price, opties?: string[], ice?: legacy}

restRef.child('products').on('value', snap => {
  PRODUCTS_STATE = snap.val() || {};
  renderSettingsProducts();
  renderOrderModalIfOpen();
  renderVoorraadProducts();
  renderVoorraadOpmerkingen();
  renderKitchen();
  renderReady();
  syncSelfserviceConfig();
});

function productList() {
  return Object.entries(PRODUCTS_STATE).map(([key, p]) => ({ key, ...p }));
}

// Geeft de lijst met aanvink-opmerkingen voor een product terug, als objecten
// {label, emoji}. Ondersteunt ook nog producten die met de oude opzet zijn
// aangemaakt (opties als losse strings in plaats van objecten).
function productOptions(p) {
  if (!p) return [];
  if (Array.isArray(p.opties) && p.opties.length > 0) {
    return p.opties.map(o => typeof o === 'string' ? { label: o, emoji: null } : { label: o.label, emoji: o.emoji || null });
  }
  return [];
}

// Verzamelt alle al eerder gebruikte opmerkingen (over alle producten heen),
// zodat je die bij een ander product kunt hergebruiken zonder opnieuw te typen.
function allKnownOptions() {
  const map = new Map();
  productList().forEach(p => {
    productOptions(p).forEach(o => {
      if (o.label && !map.has(o.label.toLowerCase())) {
        map.set(o.label.toLowerCase(), o);
      }
    });
  });
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'nl'));
}

// ---- Emoji-picker opbouwen ----
let selectedEmoji = null;
function buildEmojiPicker() {
  const picker = document.getElementById('emoji-picker');
  picker.innerHTML = '';
  EMOJI_CATEGORIES.forEach(cat => {
    const catEl = document.createElement('div');
    catEl.className = 'emoji-cat';
    catEl.innerHTML = `<div class="emoji-cat-label">${cat.label}</div>`;
    const grid = document.createElement('div');
    grid.className = 'emoji-grid';
    cat.emojis.forEach(em => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emoji-opt';
      btn.textContent = em;
      btn.addEventListener('click', () => {
        selectedEmoji = em;
        picker.querySelectorAll('.emoji-opt').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
      grid.appendChild(btn);
    });
    catEl.appendChild(grid);
    picker.appendChild(catEl);
  });
}
buildEmojiPicker();

function markEmojiSelected(em) {
  selectedEmoji = em;
  document.querySelectorAll('.emoji-opt').forEach(b => {
    b.classList.toggle('selected', b.textContent === em);
  });
}

// ---- Product toevoegen/bewerken modal ----
let editingProductKey = null;
let editingProductOptions = []; // array van {label, emoji}

// ---- Bestemming van een product (keuken of bar) ----
let selectedBestemming = 'keuken';
function setBestemmingSelection(bestemming) {
  selectedBestemming = bestemming === 'bar' ? 'bar' : 'keuken';
  document.querySelectorAll('#product-bestemming-options .fp-shape-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.bestemming === selectedBestemming);
  });
}
document.querySelectorAll('#product-bestemming-options .fp-shape-btn').forEach(btn => {
  btn.addEventListener('click', () => setBestemmingSelection(btn.dataset.bestemming));
});

// Klein vast setje emoji's om een opmerking mee te markeren.
const OPTION_EMOJIS = ['🧊', '🧴', '🥛', '🌶️', '🍋', '➕', '🚫', '✨'];
let selectedOptionEmoji = null;

function buildOptionEmojiPicker() {
  const picker = document.getElementById('option-emoji-picker');
  if (!picker) return;
  picker.innerHTML = '';
  OPTION_EMOJIS.forEach(em => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-opt';
    btn.textContent = em;
    btn.addEventListener('click', () => {
      selectedOptionEmoji = (selectedOptionEmoji === em) ? null : em;
      picker.querySelectorAll('.emoji-opt').forEach(b => b.classList.toggle('selected', b === btn && selectedOptionEmoji === em));
    });
    picker.appendChild(btn);
  });
}
buildOptionEmojiPicker();

function renderProductOptionsEditor() {
  const list = document.getElementById('product-options-list');
  list.innerHTML = '';
  editingProductOptions.forEach((opt, i) => {
    const chip = document.createElement('span');
    chip.className = 'product-option-chip' + (i === editingOptionIndex ? ' editing' : '');
    chip.innerHTML = `<span></span><button type="button" class="edit-opt" title="Bewerken">✎</button><button type="button" class="del-opt" title="Verwijderen">✕</button>`;
    chip.querySelector('span').textContent = `${opt.emoji ? opt.emoji + ' ' : ''}${opt.label}`;
    chip.querySelector('.edit-opt').addEventListener('click', () => startEditOption(i));
    chip.querySelector('.del-opt').addEventListener('click', () => {
      editingProductOptions.splice(i, 1);
      if (editingOptionIndex === i) cancelEditOption();
      else if (editingOptionIndex !== null && i < editingOptionIndex) editingOptionIndex--;
      renderProductOptionsEditor();
      renderExistingOptionsPicker();
    });
    list.appendChild(chip);
  });
}

// Toont de al eerder gebruikte opmerkingen (van andere producten) als klikbare
// chips, zodat je ze in één klik kunt hergebruiken zonder opnieuw te typen.
function renderExistingOptionsPicker() {
  const wrap = document.getElementById('product-option-existing');
  if (!wrap) return;
  const known = allKnownOptions().filter(o => !editingProductOptions.some(e => e.label.toLowerCase() === o.label.toLowerCase()));
  if (known.length === 0) {
    wrap.innerHTML = '';
    return;
  }
  wrap.innerHTML = '<div class="modal-label" style="margin-top:0;">Al bestaande opmerkingen (klik om toe te voegen)</div>';
  const row = document.createElement('div');
  row.className = 'product-options-list';
  known.forEach(o => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'product-option-chip existing';
    chip.textContent = `${o.emoji ? o.emoji + ' ' : ''}${o.label}`;
    chip.addEventListener('click', () => {
      editingProductOptions.push({ label: o.label, emoji: o.emoji || null });
      renderProductOptionsEditor();
      renderExistingOptionsPicker();
    });
    row.appendChild(chip);
  });
  wrap.appendChild(row);
}

function resetOptionEmojiPicker() {
  selectedOptionEmoji = null;
  const picker = document.getElementById('option-emoji-picker');
  if (picker) picker.querySelectorAll('.emoji-opt').forEach(b => b.classList.remove('selected'));
}

function selectOptionEmoji(em) {
  selectedOptionEmoji = em;
  const picker = document.getElementById('option-emoji-picker');
  if (picker) picker.querySelectorAll('.emoji-opt').forEach(b => b.classList.toggle('selected', b.textContent === em));
}

// Zet de opmerking-editor in "bewerken"-stand voor opmerking i: vult het
// invoerveld en de emoji vooraf in, en verandert de knop naar "Opslaan wijziging".
let editingOptionIndex = null;
let editingOptionOriginal = null; // { label, emoji } zoals de opmerking was vóór het bewerken

function startEditOption(i) {
  const opt = editingProductOptions[i];
  if (!opt) return;
  editingOptionIndex = i;
  editingOptionOriginal = { label: opt.label, emoji: opt.emoji || null };
  document.getElementById('product-option-input').value = opt.label;
  selectOptionEmoji(opt.emoji || null);
  document.getElementById('product-option-picker').style.display = 'block';
  document.getElementById('product-option-add-btn').textContent = '✓ Opslaan wijziging';
  document.getElementById('product-option-cancel-edit-btn').style.display = 'inline-block';
  renderProductOptionsEditor();
  document.getElementById('product-option-input').focus();
}

function cancelEditOption() {
  editingOptionIndex = null;
  editingOptionOriginal = null;
  document.getElementById('product-option-input').value = '';
  resetOptionEmojiPicker();
  document.getElementById('product-option-add-btn').textContent = '+ Toevoegen';
  document.getElementById('product-option-cancel-edit-btn').style.display = 'none';
  renderProductOptionsEditor();
}

document.getElementById('product-option-cancel-edit-btn').addEventListener('click', cancelEditOption);

// Past een bewerkte opmerking direct toe op alle andere producten die dezelfde
// opmerking (op naam, hoofdletterongevoelig) hebben, en schrijft dat meteen naar
// Firebase — zodat de wijziging overal synchroon is, ook zonder die producten
// zelf te openen en op te slaan.
function syncOptionRenameAcrossProducts(oldLabel, newOpt, excludeKey) {
  const oldLower = oldLabel.toLowerCase();
  Object.entries(PRODUCTS_STATE).forEach(([key, p]) => {
    if (key === excludeKey) return;
    const opts = productOptions(p);
    const idx = opts.findIndex(o => o.label.toLowerCase() === oldLower);
    if (idx === -1) return;
    const updated = opts.slice();
    updated[idx] = { label: newOpt.label, emoji: newOpt.emoji || null };
    restRef.child('products/' + key + '/opties').set(updated.map(o => ({ label: o.label, emoji: o.emoji || null })));
  });
}

function addProductOption() {
  const input = document.getElementById('product-option-input');
  const val = input.value.trim();
  if (!val) return;

  if (editingOptionIndex !== null) {
    const dup = editingProductOptions.some((o, idx) => idx !== editingOptionIndex && o.label.toLowerCase() === val.toLowerCase());
    if (dup) { input.value = ''; return; }
    const newOpt = { label: val, emoji: selectedOptionEmoji };
    const original = editingOptionOriginal;
    editingProductOptions[editingOptionIndex] = newOpt;
    if (original && (original.label.toLowerCase() !== newOpt.label.toLowerCase() || (original.emoji || null) !== (newOpt.emoji || null))) {
      syncOptionRenameAcrossProducts(original.label, newOpt, editingProductKey);
    }
    cancelEditOption();
    renderExistingOptionsPicker();
    return;
  }

  if (editingProductOptions.some(o => o.label.toLowerCase() === val.toLowerCase())) {
    input.value = '';
    return;
  }
  editingProductOptions.push({ label: val, emoji: selectedOptionEmoji });
  input.value = '';
  resetOptionEmojiPicker();
  renderProductOptionsEditor();
  renderExistingOptionsPicker();
  input.focus();
}

document.getElementById('product-option-add-btn').addEventListener('click', addProductOption);
document.getElementById('product-option-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addProductOption(); }
});

document.getElementById('product-option-open-btn').addEventListener('click', () => {
  const panel = document.getElementById('product-option-picker');
  const opening = panel.style.display === 'none';
  panel.style.display = opening ? 'block' : 'none';
  if (opening) renderExistingOptionsPicker();
});

document.getElementById('btn-add-product').addEventListener('click', () => {
  if (!canAanmaken && !isOwner && !isAdminMode) { alert('Je hebt geen toestemming om producten aan te maken.'); return; }
  editingProductKey = null;
  document.getElementById('product-modal-title').textContent = 'Nieuw product';
  document.getElementById('product-name-input').value = '';
  document.getElementById('product-price-input').value = '';
  populateCategorySelect();
  document.getElementById('product-category-select').value = '';
  setBestemmingSelection('keuken');
  document.getElementById('product-option-input').value = '';
  editingProductOptions = [];
  editingOptionIndex = null;
  document.getElementById('product-option-add-btn').textContent = '+ Toevoegen';
  document.getElementById('product-option-cancel-edit-btn').style.display = 'none';
  resetOptionEmojiPicker();
  document.getElementById('product-option-picker').style.display = 'none';
  renderProductOptionsEditor();
  document.getElementById('product-error').textContent = '';
  markEmojiSelected(null);
  openModal('modal-product');
});

function openEditProduct(key) {
  const p = PRODUCTS_STATE[key];
  if (!p) return;
  editingProductKey = key;
  document.getElementById('product-modal-title').textContent = 'Product bewerken';
  document.getElementById('product-name-input').value = p.label || '';
  document.getElementById('product-price-input').value = p.price != null ? p.price : '';
  populateCategorySelect();
  document.getElementById('product-category-select').value = p.categorie || '';
  setBestemmingSelection(p.bestemming || 'keuken');
  document.getElementById('product-option-input').value = '';
  editingProductOptions = productOptions(p).map(o => ({ label: o.label, emoji: o.emoji || null }));
  editingOptionIndex = null;
  document.getElementById('product-option-add-btn').textContent = '+ Toevoegen';
  document.getElementById('product-option-cancel-edit-btn').style.display = 'none';
  resetOptionEmojiPicker();
  document.getElementById('product-option-picker').style.display = 'none';
  renderProductOptionsEditor();
  document.getElementById('product-error').textContent = '';
  markEmojiSelected(p.emoji || null);
  openModal('modal-product');
}

document.getElementById('product-confirm').addEventListener('click', () => {
  const naam = document.getElementById('product-name-input').value.trim();
  const prijsRaw = document.getElementById('product-price-input').value;
  const errorEl = document.getElementById('product-error');

  if (!naam) { errorEl.textContent = 'Vul een naam in.'; return; }
  if (!selectedEmoji) { errorEl.textContent = 'Kies een emoji.'; return; }
  const prijs = prijsRaw === '' ? 0 : Number(prijsRaw);
  if (isNaN(prijs) || prijs < 0) { errorEl.textContent = 'Vul een geldige prijs in.'; return; }

  const categorie = document.getElementById('product-category-select').value;
  const data = { label: naam, emoji: selectedEmoji, price: prijs, opties: editingProductOptions.slice(), bestemming: selectedBestemming };
  if (categorie) data.categorie = categorie;

  const key = editingProductKey || restRef.child('products').push().key;
  restRef.child('products/' + key).set(data).then(() => {
    closeModal('modal-product');
  }).catch(err => {
    console.error(err);
    errorEl.textContent = 'Er ging iets mis, probeer opnieuw.';
  });
});

function renderSettingsProducts() {
  const list = document.getElementById('settings-product-list');
  const items = productList();
  if (items.length === 0) {
    list.innerHTML = '<div class="empty-msg">Nog geen producten. Voeg er één toe.</div>';
    return;
  }
  list.innerHTML = '';
  items.forEach(p => {
    const row = document.createElement('div');
    row.className = 'settings-product-row';
    const opties = productOptions(p);
    row.innerHTML = `
      <div class="settings-product-main">
        <span class="settings-product-emoji">${p.emoji}</span>
        <span class="settings-product-name">${escapeHtml(p.label)}</span>
        <span class="menu-dots"></span>
        <span class="settings-product-price">${formatPrice(p.price)}</span>
        ${p.categorie && CATEGORIES_STATE[p.categorie] ? `<span class="ice-badge">🏷️ ${escapeHtml(CATEGORIES_STATE[p.categorie].naam)}</span>` : ''}
        <span class="ice-badge">${p.bestemming === 'bar' ? '🍸 Bar' : '🔔 Keuken'}</span>
        ${opties.map(o => `<span class="ice-badge">${o.emoji || '📝'} ${escapeHtml(o.label)}</span>`).join('')}
      </div>
      ${isOwner ? `<div class="settings-product-actions">
        <button type="button" class="mini-btn edit" data-key="${p.key}">Bewerken</button>
        <button type="button" class="mini-btn danger" data-key="${p.key}">Verwijderen</button>
      </div>` : ''}
    `;
    if (isOwner) {
      const [editBtn, delBtn] = row.querySelectorAll('.mini-btn');
      editBtn.addEventListener('click', () => openEditProduct(p.key));
      delBtn.addEventListener('click', () => {
        if (!confirm(`"${p.label}" verwijderen?`)) return;
        restRef.child('products/' + p.key).remove();
      });
    }
    list.appendChild(row);
  });
}

// ==================== Categorieën (live) ====================
let CATEGORIES_STATE = {}; // key -> {naam, plaats}

restRef.child('categories').on('value', snap => {
  CATEGORIES_STATE = snap.val() || {};
  renderSettingsCategories();
  renderSettingsProducts();
  populateCategorySelect();
  renderOrderModalIfOpen();
  renderHistory();
  syncSelfserviceConfig();
});

// Sorteert op plaats (1 boven, 255 onder). Bij gelijke plaats alfabetisch.
function categoryList() {
  return Object.entries(CATEGORIES_STATE)
    .map(([key, c]) => ({ key, ...c }))
    .sort((a, b) => (a.plaats ?? 999) - (b.plaats ?? 999) || (a.naam || '').localeCompare(b.naam || '', 'nl'));
}

// Verdeelt een lijst producten in groepen per categorie, gesorteerd op plaats.
// Producten zonder (bestaande) categorie komen in een groep "Overig" aan het
// einde. Zolang er nog geen categorieën zijn ingesteld, komt er geen enkele
// kop te staan en blijft de lijst plat, zoals voorheen.
function groupProductsByCategory(items) {
  const cats = categoryList();
  if (cats.length === 0) return [{ naam: null, items }];
  const groups = cats.map(c => ({ key: c.key, naam: c.naam, items: [] }));
  const overig = { key: null, naam: 'Overig', items: [] };
  items.forEach(p => {
    const g = groups.find(g => g.key === p.categorie);
    (g || overig).items.push(p);
  });
  const result = groups.filter(g => g.items.length > 0);
  if (overig.items.length > 0) result.push(overig);
  return result;
}

function renderSettingsCategories() {
  const list = document.getElementById('settings-category-list');
  if (!list) return;
  const items = categoryList();
  if (items.length === 0) {
    list.innerHTML = '<div class="empty-msg">Nog geen categorieën. Voeg er één toe.</div>';
    return;
  }
  list.innerHTML = '';
  items.forEach(c => {
    const row = document.createElement('div');
    row.className = 'settings-product-row';
    row.innerHTML = `
      <div class="settings-product-main">
        <span class="settings-product-name">${escapeHtml(c.naam)}</span>
        <span class="menu-dots"></span>
        <span class="ice-badge">Plaats: ${escapeHtml(String(c.plaats))}</span>
      </div>
      ${isOwner ? `<div class="settings-product-actions">
        <button type="button" class="mini-btn edit" data-key="${c.key}">Bewerken</button>
        <button type="button" class="mini-btn danger" data-key="${c.key}">Verwijderen</button>
      </div>` : ''}
    `;
    if (isOwner) {
      const [editBtn, delBtn] = row.querySelectorAll('.mini-btn');
      editBtn.addEventListener('click', () => openEditCategory(c.key));
      delBtn.addEventListener('click', () => {
        if (!confirm(`Categorie "${c.naam}" verwijderen?`)) return;
        restRef.child('categories/' + c.key).remove();
      });
    }
    list.appendChild(row);
  });
}

let editingCategoryKey = null;

document.getElementById('btn-add-category').addEventListener('click', () => {
  if (!canAanmaken && !isOwner && !isAdminMode) { alert('Je hebt geen toestemming om categorieën aan te maken.'); return; }
  editingCategoryKey = null;
  document.getElementById('category-modal-title').textContent = 'Nieuwe categorie';
  document.getElementById('category-name-input').value = '';
  document.getElementById('category-plaats-input').value = '';
  document.getElementById('category-error').textContent = '';
  openModal('modal-category');
});

function openEditCategory(key) {
  const c = CATEGORIES_STATE[key];
  if (!c) return;
  editingCategoryKey = key;
  document.getElementById('category-modal-title').textContent = 'Categorie bewerken';
  document.getElementById('category-name-input').value = c.naam || '';
  document.getElementById('category-plaats-input').value = c.plaats != null ? c.plaats : '';
  document.getElementById('category-error').textContent = '';
  openModal('modal-category');
}

document.getElementById('category-confirm').addEventListener('click', () => {
  const naam = document.getElementById('category-name-input').value.trim();
  const plaatsRaw = document.getElementById('category-plaats-input').value;
  const errorEl = document.getElementById('category-error');

  if (!naam) { errorEl.textContent = 'Vul een naam in.'; return; }
  const plaats = Number(plaatsRaw);
  if (plaatsRaw === '' || isNaN(plaats) || !Number.isInteger(plaats) || plaats < 1 || plaats > 255) {
    errorEl.textContent = 'Vul een plaats in van 1 t/m 255.';
    return;
  }
  const dubbel = categoryList().some(c => c.plaats === plaats && c.key !== editingCategoryKey);
  if (dubbel) {
    errorEl.textContent = `Plaats ${plaats} is al in gebruik door een andere categorie. Kies een andere plaats.`;
    return;
  }

  const data = { naam, plaats };
  const key = editingCategoryKey || restRef.child('categories').push().key;
  restRef.child('categories/' + key).set(data).then(() => {
    closeModal('modal-category');
  }).catch(err => {
    console.error(err);
    errorEl.textContent = 'Er ging iets mis, probeer opnieuw.';
  });
});

// ==================== Services (live) — instelbare lijst die klanten via
// zelfservice kunnen aanvragen bij hun tafel (alleen een titel nodig) ====
let SERVICES_STATE = {}; // key -> {titel}

restRef.child('services').on('value', snap => {
  SERVICES_STATE = snap.val() || {};
  renderSettingsServices();
});

function renderSettingsServices() {
  const list = document.getElementById('settings-service-list');
  if (!list) return;
  const items = Object.entries(SERVICES_STATE).map(([key, s]) => ({ key, ...s }));
  if (items.length === 0) {
    list.innerHTML = '<div class="empty-msg">Nog geen services. Voeg er één toe.</div>';
    return;
  }
  list.innerHTML = '';
  items.forEach(s => {
    const row = document.createElement('div');
    row.className = 'settings-product-row';
    row.innerHTML = `
      <div class="settings-product-main">
        <span class="settings-product-name">🛎️ ${escapeHtml(s.titel)}</span>
      </div>
      ${isOwner ? `<div class="settings-product-actions">
        <button type="button" class="mini-btn edit" data-key="${s.key}">Bewerken</button>
        <button type="button" class="mini-btn danger" data-key="${s.key}">Verwijderen</button>
      </div>` : ''}
    `;
    if (isOwner) {
      const [editBtn, delBtn] = row.querySelectorAll('.mini-btn');
      editBtn.addEventListener('click', () => openEditService(s.key));
      delBtn.addEventListener('click', () => {
        if (!confirm(`Service "${s.titel}" verwijderen?`)) return;
        restRef.child('services/' + s.key).remove();
      });
    }
    list.appendChild(row);
  });
}

let editingServiceKey = null;

document.getElementById('btn-add-service').addEventListener('click', () => {
  if (!canAanmaken && !isOwner && !isAdminMode) { alert('Je hebt geen toestemming om services aan te maken.'); return; }
  editingServiceKey = null;
  document.getElementById('service-modal-title').textContent = 'Nieuwe service';
  document.getElementById('service-title-input').value = '';
  document.getElementById('service-error').textContent = '';
  openModal('modal-service');
});

function openEditService(key) {
  const s = SERVICES_STATE[key];
  if (!s) return;
  editingServiceKey = key;
  document.getElementById('service-modal-title').textContent = 'Service bewerken';
  document.getElementById('service-title-input').value = s.titel || '';
  document.getElementById('service-error').textContent = '';
  openModal('modal-service');
}

document.getElementById('service-confirm').addEventListener('click', () => {
  const titel = document.getElementById('service-title-input').value.trim();
  const errorEl = document.getElementById('service-error');
  if (!titel) { errorEl.textContent = 'Vul een titel in.'; return; }

  const key = editingServiceKey || restRef.child('services').push().key;
  restRef.child('services/' + key).set({ titel }).then(() => {
    closeModal('modal-service');
  }).catch(err => {
    console.error(err);
    errorEl.textContent = 'Er ging iets mis, probeer opnieuw.';
  });
});

// ==================== Serviceaanvragen (live) — door klanten via
// zelfservice aangevraagd, per tafel ====
let SERVICE_REQUESTS_STATE = {}; // pushId -> {tableNumber, titel, tijd}

function serviceRequestsForTable(number) {
  return Object.entries(SERVICE_REQUESTS_STATE).filter(([, s]) => s.tableNumber === number);
}

restRef.child('serviceRequests').on('value', snap => {
  SERVICE_REQUESTS_STATE = snap.val() || {};
  renderOrderCanvas();
  // Als het tafel-keuzemenu of het service-overzicht open staat voor de
  // tafel waarvoor net iets veranderde, houden we die live in sync.
  if (window.pendingChoiceTable) {
    const aantal = serviceRequestsForTable(window.pendingChoiceTable.number).length;
    const btn = document.getElementById('choice-view-service');
    if (btn) btn.style.display = aantal > 0 ? '' : 'none';
  }
  if (window.openServiceTable && document.getElementById('modal-table-service').classList.contains('open')) {
    renderTableServiceModal(window.openServiceTable);
  }
});

function openServiceModalForTable(table) {
  window.openServiceTable = table;
  document.getElementById('table-service-title').textContent = `Service — ${kindWoord(table)} ${table.number}`;
  renderTableServiceModal(table);
  openModal('modal-table-service');
}

function renderTableServiceModal(table) {
  const list = document.getElementById('table-service-list');
  const requests = serviceRequestsForTable(table.number).sort((a, b) => (a[1].tijd || 0) - (b[1].tijd || 0));
  if (requests.length === 0) {
    list.innerHTML = '<div class="empty-msg">Geen openstaande serviceaanvragen.</div>';
    closeModal('modal-table-service');
    return;
  }
  list.innerHTML = '';
  requests.forEach(([id, s]) => {
    const row = document.createElement('div');
    row.className = 'settings-product-row';
    row.innerHTML = `
      <div class="settings-product-main">
        <span class="settings-product-name">🛎️ ${escapeHtml(s.titel)}</span>
      </div>
      <div class="settings-product-actions">
        <button type="button" class="mini-btn edit" data-id="${id}">✅ Gedaan</button>
      </div>
    `;
    row.querySelector('.mini-btn').addEventListener('click', () => {
      restRef.child('serviceRequests/' + id).remove();
    });
    list.appendChild(row);
  });
}

// Vult de categorie-dropdown in het product-modal, en probeert de al eerder
// geselecteerde waarde te behouden als die nog bestaat.
function populateCategorySelect() {
  const select = document.getElementById('product-category-select');
  if (!select) return;
  const current = select.value;
  const items = categoryList();
  select.innerHTML = '<option value="">Geen categorie</option>' +
    items.map(c => `<option value="${c.key}">${escapeHtml(c.naam)}</option>`).join('');
  if (items.some(c => c.key === current)) select.value = current;
}

// ==================== Plattegrond (live data) ====================
let AREAS_STATE = {};  // id -> {name, x, y, w, h}
let TABLES_STATE = {}; // id -> {number, x, y}

// ---- Grootte van de plattegrond (aantal vierkantjes) ----
const GRID_MIN = 10;
const GRID_MAX = 40;
const GRID_STEP = 1;
const GRID_DEFAULT = 20; // komt overeen met de oorspronkelijke vaste 24px-vierkantjes
let currentGridSize = GRID_DEFAULT;

function applyGridSize(size) {
  const n = Math.max(GRID_MIN, Math.min(GRID_MAX, size || GRID_DEFAULT));
  currentGridSize = n;
  const cellPct = 100 / n;
  const scale = Math.max(0.45, Math.min(1.8, GRID_DEFAULT / n));
  [document.getElementById('order-canvas'), document.getElementById('edit-canvas')].forEach(canvasEl => {
    if (!canvasEl) return;
    canvasEl.style.backgroundSize = `${cellPct}% ${cellPct}%`;
    canvasEl.style.setProperty('--fp-scale', scale);
  });
  const valueEl = document.getElementById('grid-size-value');
  if (valueEl) valueEl.textContent = `${n} × ${n}`;
  const minusBtn = document.getElementById('grid-size-minus');
  const plusBtn = document.getElementById('grid-size-plus');
  if (minusBtn) minusBtn.disabled = n <= GRID_MIN;
  if (plusBtn) plusBtn.disabled = n >= GRID_MAX;
}
applyGridSize(GRID_DEFAULT);

restRef.child('floorplan/gridSize').on('value', snap => {
  applyGridSize(snap.val() || GRID_DEFAULT);
});

const gridSizeMinusBtn = document.getElementById('grid-size-minus');
if (gridSizeMinusBtn) {
  gridSizeMinusBtn.addEventListener('click', () => {
    changeGridSize(Math.max(GRID_MIN, currentGridSize - GRID_STEP));
  });
}
const gridSizePlusBtn = document.getElementById('grid-size-plus');
if (gridSizePlusBtn) {
  gridSizePlusBtn.addEventListener('click', () => {
    changeGridSize(Math.min(GRID_MAX, currentGridSize + GRID_STEP));
  });
}

// Past de opgeslagen grootte van alle gebieden proportioneel aan zodat er, relatief
// gezien, precies zoveel tafels in een gebied blijven passen als voorheen: als de
// vierkantjes kleiner worden (meer vierkantjes), krimpen de gebieden mee in dezelfde
// verhouding als de tafels. De linkerbovenhoek van een gebied blijft vast. Tafels die
// binnen een gebied liggen, verschuiven mee op exact dezelfde relatieve plek in dat
// gebied, zodat ze nooit over de rand heen schuiven.
function changeGridSize(nextN) {
  if (nextN === currentGridSize) return;
  const ratio = currentGridSize / nextN;
  const updates = { 'floorplan/gridSize': nextN };
  const oldAreas = AREAS_STATE;
  const appliedRatios = {}; // id -> { rw, rh } (de werkelijk toegepaste verhouding, na begrenzing aan de rand van de plattegrond)

  Object.entries(oldAreas).forEach(([id, area]) => {
    const maxW = Math.max(3, 100 - area.x);
    const maxH = Math.max(3, 100 - area.y);
    const newW = Math.max(3, Math.min(area.w * ratio, maxW));
    const newH = Math.max(3, Math.min(area.h * ratio, maxH));
    updates['floorplan/areas/' + id + '/w'] = newW;
    updates['floorplan/areas/' + id + '/h'] = newH;
    appliedRatios[id] = { rw: newW / area.w, rh: newH / area.h };
  });

  Object.entries(TABLES_STATE).forEach(([tid, table]) => {
    const entry = Object.entries(oldAreas).find(([, a]) =>
      table.x >= a.x && table.x <= a.x + a.w && table.y >= a.y && table.y <= a.y + a.h
    );
    if (!entry) return;
    const [areaId, area] = entry;
    const r = appliedRatios[areaId];
    const newX = area.x + (table.x - area.x) * r.rw;
    const newY = area.y + (table.y - area.y) * r.rh;
    updates['floorplan/tables/' + tid + '/x'] = Math.max(0, Math.min(100, newX));
    updates['floorplan/tables/' + tid + '/y'] = Math.max(0, Math.min(100, newY));
  });

  restRef.update(updates);
}

restRef.child('floorplan/areas').on('value', snap => {
  AREAS_STATE = snap.val() || {};
  renderEditCanvas();
  renderOrderCanvas();
});
restRef.child('floorplan/tables').on('value', snap => {
  TABLES_STATE = snap.val() || {};
  renderEditCanvas();
  renderOrderCanvas();
  syncSelfserviceConfig();
});

// ---- Actieve tafel-status (bezet = heeft open bestelling) ----
let ACTIEVE_TAFELS = new Set(); // table numbers met status nieuw of klaar

function herbereken_actieve_tafels() {
  // Een tafel is bezet zolang er nog niet-afgerekende bestellingen voor die tafel bestaan
  // (in welke keukenstatus dan ook). Zodra is afgerekend, verdwijnt de bestelling uit
  // ALLE_ORDERS (verplaatst naar de historie), dus dan is de tafel automatisch weer vrij.
  ACTIEVE_TAFELS = new Set();
  Object.values(ALLE_ORDERS).forEach(o => ACTIEVE_TAFELS.add(o.tableNumber));
  renderOrderCanvas();
}

// ---- Canvas renderen (algemene functie) ----
function renderCanvas(canvasEl, { editable, onTableClick }) {
  canvasEl.innerHTML = '';

  Object.entries(AREAS_STATE).forEach(([id, area]) => {
    const el = document.createElement('div');
    el.className = 'fp-area';
    el.style.left = area.x + '%';
    el.style.top = area.y + '%';
    el.style.width = area.w + '%';
    el.style.height = area.h + '%';
    el.innerHTML = `<div class="fp-area-label">${escapeHtml(area.name)}</div>`;
    if (editable) {
      el.dataset.type = 'area';
      el.dataset.id = id;
      // Twee sleepgrepen: linksboven én rechtsonder, zodat een gebied aan beide
      // kanten vergroot/verkleind kan worden (niet alleen naar rechtsonder toe).
      const handleTl = document.createElement('div');
      handleTl.className = 'fp-resize-handle tl';
      handleTl.dataset.corner = 'tl';
      el.appendChild(handleTl);
      const handleBr = document.createElement('div');
      handleBr.className = 'fp-resize-handle br';
      handleBr.dataset.corner = 'br';
      el.appendChild(handleBr);
    }
    canvasEl.appendChild(el);
  });

  Object.entries(TABLES_STATE).forEach(([id, table]) => {
    const kind = table.kind || 'tafel';
    const shape = table.shape || 'rond';
    const orientation = table.orientation || 'horizontaal';
    const isOrderable = kind === 'tafel' || kind === 'bank';
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'fp-table fp-kind-' + kind
      + (kind === 'tafel' ? ' fp-shape-' + shape : '')
      + (kind === 'bank' ? ' fp-orientation-' + orientation : '');
    if (!editable && isOrderable && ACTIEVE_TAFELS.has(table.number)) el.classList.add('bezet');
    el.style.left = table.x + '%';
    el.style.top = table.y + '%';

    if (isOrderable) {
      el.textContent = table.number;
      if (kind === 'tafel') {
        const typeLabel = document.createElement('span');
        typeLabel.className = 'fp-table-type-label';
        typeLabel.textContent = '🍽️';
        el.appendChild(typeLabel);
      } else if (kind === 'bank') {
        const bankLabel = document.createElement('span');
        bankLabel.className = 'fp-building-label';
        bankLabel.textContent = 'Bank';
        el.appendChild(bankLabel);
      }
      if (!editable) {
        const serviceAantal = serviceRequestsForTable(table.number).length;
        if (serviceAantal > 0) {
          const serviceBadge = document.createElement('span');
          serviceBadge.className = 'fp-service-badge';
          serviceBadge.textContent = serviceAantal;
          serviceBadge.title = 'Service aangevraagd';
          el.appendChild(serviceBadge);
        }
      }
    } else {
      const icon = document.createElement('span');
      icon.className = 'fp-building-icon';
      icon.textContent = kind === 'bar' ? '🍸' : '🧑‍🍳';
      el.appendChild(icon);
      const label = document.createElement('span');
      label.className = 'fp-building-label';
      label.textContent = table.name || (kind === 'bar' ? 'Bar' : 'Keuken');
      el.appendChild(label);
    }

    if (editable) {
      el.dataset.type = 'table';
      el.dataset.id = id;
      el.dataset.kind = kind;
    } else if (onTableClick && (isOrderable || kind === 'bar')) {
      el.addEventListener('click', () => onTableClick(table));
    }
    canvasEl.appendChild(el);
  });
}

// ---- Woord/label helpers voor tafel vs. bank ----
function kindWoord(table) {
  const bank = (table && table.kind === 'bank');
  return localStorage.getItem('appLanguage') === 'en' ? (bank ? 'Bench' : 'Table') : (bank ? 'Bank' : 'Tafel');
}
function tableKindByNumber(number) {
  const found = Object.values(TABLES_STATE).find(t =>
    (t.kind === 'tafel' || t.kind === 'bank' || !t.kind) && t.number === number
  );
  return found ? (found.kind || 'tafel') : 'tafel';
}
function kindWoordByNumber(number) {
  return localStorage.getItem('appLanguage') === 'en' ? (tableKindByNumber(number) === 'bank' ? 'Bench' : 'Table') : (tableKindByNumber(number) === 'bank' ? 'Bank' : 'Tafel');
}
function kindIconByNumber(number) {
  return tableKindByNumber(number) === 'bank' ? '🛋️' : '🪑';
}

function renderOrderCanvas() {
  const canvas = document.getElementById('order-canvas');
  renderCanvas(canvas, {
    editable: false,
    onTableClick: (item) => {
      if (item.kind === 'bar') { openOrderModalForBar(item); return; }
      handleTableClick(item);
    }
  });
  document.getElementById('order-no-tables').style.display =
    Object.keys(TABLES_STATE).length === 0 ? 'block' : 'none';
}

// ---- Klik op tafel: kies tussen bestelling opnemen of bestelde dingen bekijken ----
function tableOrders(number) {
  return Object.entries(ALLE_ORDERS).filter(([, o]) => o.tableNumber === number);
}

function handleTableClick(table) {
  const heeftBestellingen = tableOrders(table.number).length > 0;
  const heeftService = serviceRequestsForTable(table.number).length > 0;

  if (!heeftBestellingen && !heeftService) {
    openOrderModalForTable(table);
    return;
  }
  window.pendingChoiceTable = table;
  document.getElementById('table-choice-title').textContent = `${kindWoord(table)} ${table.number}`;
  document.getElementById('choice-view-bill').style.display = heeftBestellingen ? '' : 'none';
  document.getElementById('choice-view-service').style.display = heeftService ? '' : 'none';
  openModal('modal-table-choice');
}

document.getElementById('choice-new-order').addEventListener('click', () => {
  closeModal('modal-table-choice');
  openOrderModalForTable(window.pendingChoiceTable);
});
document.getElementById('choice-view-bill').addEventListener('click', () => {
  closeModal('modal-table-choice');
  openBillModal(window.pendingChoiceTable);
});
document.getElementById('choice-view-service').addEventListener('click', () => {
  closeModal('modal-table-choice');
  openServiceModalForTable(window.pendingChoiceTable);
});

function renderEditCanvas() {
  const canvas = document.getElementById('edit-canvas');
  renderCanvas(canvas, { editable: true });
  attachEditHandlers();
}

// ==================== Plattegrond bewerken (Instellingen) ====================
const editCanvas = document.getElementById('edit-canvas');
let pendingMode = null; // null | 'area-corner1' | 'area-corner2' | 'table'
let areaCorner1 = null;
let deleteMode = false;
const fpHint = document.getElementById('fp-hint');
const defaultHint = fpHint.textContent;

document.getElementById('tool-add-area').addEventListener('click', () => {
  deleteMode = false;
  document.getElementById('tool-delete').classList.remove('active');
  pendingMode = 'area-corner1';
  areaCorner1 = null;
  fpHint.textContent = 'Klik op de plattegrond om de eerste hoek van het gebied te plaatsen.';
});

document.getElementById('tool-add-table').addEventListener('click', () => {
  deleteMode = false;
  document.getElementById('tool-delete').classList.remove('active');
  pendingMode = 'table';
  fpHint.textContent = 'Klik op de plattegrond om een tafel te plaatsen.';
});

document.getElementById('tool-add-bank').addEventListener('click', () => {
  deleteMode = false;
  document.getElementById('tool-delete').classList.remove('active');
  pendingMode = 'bank';
  fpHint.textContent = 'Klik op de plattegrond om een bank te plaatsen.';
});

document.getElementById('tool-add-bar').addEventListener('click', () => {
  deleteMode = false;
  document.getElementById('tool-delete').classList.remove('active');
  pendingMode = 'bar';
  fpHint.textContent = 'Klik op de plattegrond om de bar te plaatsen.';
});

document.getElementById('tool-add-keuken').addEventListener('click', () => {
  deleteMode = false;
  document.getElementById('tool-delete').classList.remove('active');
  pendingMode = 'keuken';
  fpHint.textContent = 'Klik op de plattegrond om de keuken te plaatsen.';
});

// ---- Vormkeuze voor tafels (rond / vierkant / rechthoekig) ----
let selectedTableShape = 'rond';
function setTableShapeSelection(shape) {
  selectedTableShape = shape;
  document.querySelectorAll('#table-shape-options .fp-shape-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.shape === shape);
  });
}
document.querySelectorAll('#table-shape-options .fp-shape-btn').forEach(btn => {
  btn.addEventListener('click', () => setTableShapeSelection(btn.dataset.shape));
});

// ---- Richtingkeuze voor banken (horizontaal / verticaal) ----
let selectedBankOrientation = 'horizontaal';
function setBankOrientationSelection(orientation) {
  selectedBankOrientation = orientation;
  document.querySelectorAll('#bank-orientation-options .fp-shape-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.orientation === orientation);
  });
}
document.querySelectorAll('#bank-orientation-options .fp-shape-btn').forEach(btn => {
  btn.addEventListener('click', () => setBankOrientationSelection(btn.dataset.orientation));
});

document.getElementById('tool-delete').addEventListener('click', (e) => {
  deleteMode = !deleteMode;
  pendingMode = null;
  e.target.classList.toggle('active', deleteMode);
  fpHint.textContent = deleteMode ? 'Klik op een tafel of gebied om het te verwijderen.' : defaultHint;
});

function getPercentPos(clientX, clientY) {
  const rect = editCanvas.getBoundingClientRect();
  let x = ((clientX - rect.left) / rect.width) * 100;
  let y = ((clientY - rect.top) / rect.height) * 100;
  x = Math.max(0, Math.min(100, x));
  y = Math.max(0, Math.min(100, y));
  return { x, y };
}

editCanvas.addEventListener('click', (e) => {
  // Zodra we in een plaatsingsmodus zitten, telt elke klik binnen de plattegrond (ook
  // bovenop een bestaand gebied/tafel) als plaatsing — sleep-handlers slaan zichzelf
  // in die modus over (zie onDragStart), dus hier is geen speciale e.target-check nodig.
  if (pendingMode === 'area-corner1') {
    areaCorner1 = getPercentPos(e.clientX, e.clientY);
    pendingMode = 'area-corner2';
    fpHint.textContent = 'Klik nu op de andere hoek om het gebied af te maken.';
    return;
  }
  if (pendingMode === 'area-corner2') {
    const corner2 = getPercentPos(e.clientX, e.clientY);
    const x = Math.min(areaCorner1.x, corner2.x);
    const y = Math.min(areaCorner1.y, corner2.y);
    const w = Math.max(6, Math.abs(corner2.x - areaCorner1.x));
    const h = Math.max(6, Math.abs(corner2.y - areaCorner1.y));
    pendingMode = null;
    fpHint.textContent = defaultHint;
    document.getElementById('area-name-input').value = '';
    openModal('modal-area-name');
    window.pendingAreaRect = { x, y, w, h };
    return;
  }
  if (pendingMode === 'table' || pendingMode === 'bank') {
    const pos = getPercentPos(e.clientX, e.clientY);
    const kind = pendingMode === 'table' ? 'tafel' : 'bank';
    pendingMode = null;
    fpHint.textContent = defaultHint;
    window.pendingTableKind = kind;
    window.pendingTablePos = pos;
    document.getElementById('table-number-input').value = '';
    document.getElementById('table-number-error').textContent = '';
    document.getElementById('table-number-modal-title').textContent = kind === 'bank' ? 'Banknummer' : 'Tafelnummer';
    document.getElementById('table-shape-row').style.display = kind === 'tafel' ? '' : 'none';
    document.getElementById('bank-orientation-row').style.display = kind === 'bank' ? '' : 'none';
    setTableShapeSelection('rond');
    setBankOrientationSelection('horizontaal');
    openModal('modal-table-number');
    return;
  }
  if (pendingMode === 'bar' || pendingMode === 'keuken') {
    const pos = getPercentPos(e.clientX, e.clientY);
    const kind = pendingMode;
    pendingMode = null;
    fpHint.textContent = defaultHint;
    window.pendingBuildingKind = kind;
    window.pendingBuildingPos = pos;
    document.getElementById('building-name-input').value = '';
    document.getElementById('building-name-error').textContent = '';
    document.getElementById('building-name-modal-title').textContent = kind === 'bar' ? 'Naam van de bar' : 'Naam van de keuken';
    openModal('modal-building-name');
    return;
  }
});

document.getElementById('area-name-confirm').addEventListener('click', () => {
  const naam = document.getElementById('area-name-input').value.trim();
  if (!naam) return;
  const rect = window.pendingAreaRect;
  restRef.child('floorplan/areas').push({ name: naam, ...rect });
  closeModal('modal-area-name');
});

document.getElementById('table-number-confirm').addEventListener('click', () => {
  const raw = document.getElementById('table-number-input').value.trim();
  const errorEl = document.getElementById('table-number-error');
  if (!raw) { errorEl.textContent = 'Vul een nummer in.'; return; }
  const nummer = Number(raw);
  if (isNaN(nummer) || nummer <= 0) { errorEl.textContent = 'Ongeldig nummer.'; return; }
  const bestaatAl = Object.values(TABLES_STATE).some(t => t.number === nummer);
  if (bestaatAl) { errorEl.textContent = 'Dit nummer bestaat al.'; return; }

  const pos = window.pendingTablePos;
  const kind = window.pendingTableKind || 'tafel';
  const data = { kind, number: nummer, x: pos.x, y: pos.y };
  if (kind === 'tafel') data.shape = selectedTableShape;
  if (kind === 'bank') data.orientation = selectedBankOrientation;
  restRef.child('floorplan/tables').push(data);
  closeModal('modal-table-number');
});

document.getElementById('building-name-confirm').addEventListener('click', () => {
  const naam = document.getElementById('building-name-input').value.trim();
  const errorEl = document.getElementById('building-name-error');
  if (!naam) { errorEl.textContent = 'Vul een naam in.'; return; }

  const pos = window.pendingBuildingPos;
  const kind = window.pendingBuildingKind;
  restRef.child('floorplan/tables').push({ kind, name: naam, x: pos.x, y: pos.y });
  closeModal('modal-building-name');
});

// ---- Slepen (verplaatsen) en resizen ----
function attachEditHandlers() {
  if (!isOwner) return;
  editCanvas.querySelectorAll('.fp-table, .fp-area').forEach(el => {
    el.addEventListener('pointerdown', onDragStart);
  });
  editCanvas.querySelectorAll('.fp-resize-handle').forEach(handle => {
    handle.addEventListener('pointerdown', onResizeStart);
  });
}

function itemDeleteLabel(item) {
  const kind = (item && item.kind) || 'tafel';
  const en = localStorage.getItem('appLanguage') === 'en';
  if (kind === 'bank') return `${en ? 'bench' : 'bank'} ${item.number}`;
  if (kind === 'bar') return `${en ? 'bar' : 'bar'} "${item.name}"`;
  if (kind === 'keuken') return `${en ? 'kitchen' : 'keuken'} "${item.name}"`;
  return `${en ? 'table' : 'tafel'} ${item.number}`;
}

function onDragStart(e) {
  if (pendingMode) return; // laat de klik doorgaan naar het plaatsen van een nieuw gebied/tafel
  if (e.target.classList.contains('fp-resize-handle')) return;
  const el = e.currentTarget;
  const type = el.dataset.type;
  const id = el.dataset.id;

  if (deleteMode) {
    e.stopPropagation();
    const label = type === 'table' ? itemDeleteLabel(TABLES_STATE[id]) : `gebied "${AREAS_STATE[id].name}"`;
    if (confirm(`Weet je zeker dat je ${label} wilt verwijderen?`)) {
      restRef.child('floorplan/' + (type === 'table' ? 'tables' : 'areas') + '/' + id).remove();
    }
    return;
  }

  e.preventDefault();
  e.stopPropagation();
  el.setPointerCapture(e.pointerId);

  // Onthoud waar precies gepakt werd t.o.v. de linkerbovenhoek, zodat het element
  // niet ineens onder de cursor "springt" bij het eerste contact.
  const startData = type === 'table' ? TABLES_STATE[id] : AREAS_STATE[id];
  const grabPos = getPercentPos(e.clientX, e.clientY);
  const offsetX = grabPos.x - startData.x;
  const offsetY = grabPos.y - startData.y;

  const move = (ev) => {
    const pos = getPercentPos(ev.clientX, ev.clientY);
    el.style.left = Math.max(0, Math.min(100, pos.x - offsetX)) + '%';
    el.style.top = Math.max(0, Math.min(100, pos.y - offsetY)) + '%';
  };
  const up = (ev) => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    const pos = getPercentPos(ev.clientX, ev.clientY);
    const path = type === 'table' ? 'tables' : 'areas';
    restRef.child('floorplan/' + path + '/' + id).update({
      x: Math.max(0, Math.min(100, pos.x - offsetX)),
      y: Math.max(0, Math.min(100, pos.y - offsetY))
    });
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
}

function onResizeStart(e) {
  if (pendingMode) return;
  e.preventDefault();
  e.stopPropagation();
  const handle = e.currentTarget;
  const corner = handle.dataset.corner; // 'tl' of 'br'
  const areaEl = handle.parentElement;
  const id = areaEl.dataset.id;
  handle.setPointerCapture(e.pointerId);

  // De hoek tegenover de sleepgreep blijft vast op zijn plek tijdens het slepen.
  const start = AREAS_STATE[id];
  const fixedRight = start.x + start.w;
  const fixedBottom = start.y + start.h;

  function computeRect(pos) {
    if (corner === 'tl') {
      const x = Math.max(0, Math.min(pos.x, fixedRight - 6));
      const y = Math.max(0, Math.min(pos.y, fixedBottom - 6));
      return { x, y, w: fixedRight - x, h: fixedBottom - y };
    }
    // 'br': linkerbovenhoek blijft vast, zoals voorheen
    const w = Math.max(6, pos.x - start.x);
    const h = Math.max(6, pos.y - start.y);
    return { x: start.x, y: start.y, w, h };
  }

  const move = (ev) => {
    const pos = getPercentPos(ev.clientX, ev.clientY);
    const r = computeRect(pos);
    areaEl.style.left = r.x + '%';
    areaEl.style.top = r.y + '%';
    areaEl.style.width = r.w + '%';
    areaEl.style.height = r.h + '%';
  };
  const up = (ev) => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', up);
    const pos = getPercentPos(ev.clientX, ev.clientY);
    const r = computeRect(pos);
    restRef.child('floorplan/areas/' + id).update(r);
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', up);
}

// ==================== Bestellen: tafel -> producten kiezen ====================
let currentOrderTable = null;
let currentOrderBar = null;   // gevuld i.p.v. currentOrderTable wanneer er bij de bar besteld wordt
let pendingBarOrder = null;   // items/opties/opmerking die klaarstaan om na betaling te versturen
let orderCounts = {};      // key -> aantal
let orderItemOptions = {}; // key -> array (per besteld stuk) van gekozen opmerkingen
let stockStatus = {};      // productKey -> uitverkocht?
let optionStockStatus = {}; // optieLabel (lowercase) -> uitverkocht?

restRef.child('stock').on('value', snap => {
  stockStatus = snap.val() || {};
  renderOrderModalIfOpen();
  renderVoorraadProducts();
});

restRef.child('stockOpties').on('value', snap => {
  optionStockStatus = snap.val() || {};
  renderOrderModalIfOpen();
  renderVoorraadOpmerkingen();
});

function isOptionUitverkocht(label) {
  return !!optionStockStatus[String(label).toLowerCase()];
}

// ==================== Voorraad ====================
function renderVoorraadProducts() {
  const list = document.getElementById('voorraad-product-list');
  if (!list) return;
  const items = productList();
  if (items.length === 0) {
    list.innerHTML = '<div class="empty-msg">Nog geen producten. Voeg ze toe via Instellingen → Producten.</div>';
    return;
  }
  list.innerHTML = '';
  items.forEach(p => {
    const isOut = !!stockStatus[p.key];
    const row = document.createElement('div');
    row.className = 'voorraad-row' + (isOut ? ' uitverkocht' : '');
    row.innerHTML = `
      <div class="voorraad-row-main">
        <span>${p.emoji}</span>
        <span class="voorraad-row-name">${escapeHtml(p.label)}</span>
        <span class="price-tag">${formatPrice(p.price)}</span>
        ${isOut ? '<span class="uitverkocht-tag">Uitverkocht</span>' : ''}
      </div>
      <button type="button" class="mini-btn ${isOut ? 'edit' : 'danger'}" data-key="${p.key}">${isOut ? 'Op voorraad zetten' : 'Uitverkocht zetten'}</button>
    `;
    row.querySelector('button').addEventListener('click', () => {
      if (isOut) restRef.child('stock/' + p.key).remove();
      else restRef.child('stock/' + p.key).set(true);
    });
    list.appendChild(row);
  });
}

function renderVoorraadOpmerkingen() {
  const list = document.getElementById('voorraad-optie-list');
  if (!list) return;
  const opties = allKnownOptions();
  if (opties.length === 0) {
    list.innerHTML = '<div class="empty-msg">Nog geen opmerkingen ingesteld bij producten.</div>';
    return;
  }
  list.innerHTML = '';
  opties.forEach(o => {
    const lkey = o.label.toLowerCase();
    const isOut = isOptionUitverkocht(o.label);
    const row = document.createElement('div');
    row.className = 'voorraad-row' + (isOut ? ' uitverkocht' : '');
    row.innerHTML = `
      <div class="voorraad-row-main">
        <span>${o.emoji || '📝'}</span>
        <span class="voorraad-row-name">${escapeHtml(o.label)}</span>
        ${isOut ? '<span class="uitverkocht-tag">Uitverkocht</span>' : ''}
      </div>
      <button type="button" class="mini-btn ${isOut ? 'edit' : 'danger'}" data-lkey="${lkey}">${isOut ? 'Op voorraad zetten' : 'Uitverkocht zetten'}</button>
    `;
    row.querySelector('button').addEventListener('click', () => {
      if (isOut) restRef.child('stockOpties/' + lkey).remove();
      else restRef.child('stockOpties/' + lkey).set(true);
    });
    list.appendChild(row);
  });
}

function openOrderModalForTable(table) {
  currentOrderTable = table;
  currentOrderBar = null;
  pendingBarOrder = null;
  orderCounts = {};
  orderItemOptions = {};
  productList().forEach(p => { orderCounts[p.key] = 0; orderItemOptions[p.key] = []; });
  document.getElementById('order-modal-title').textContent = `${kindWoord(table)} ${table.number}`;
  document.getElementById('order-note').value = '';
  document.getElementById('order-error').textContent = '';
  document.getElementById('order-bar-confirm').style.display = 'none';
  document.getElementById('order-default-actions').style.display = '';
  document.getElementById('order-confirm').textContent = 'Bestelling sturen naar keuken';
  renderOrderProducts();
  openModal('modal-order');
}

// Bij de bar wordt eerst de bestelling samengesteld zoals normaal, maar in
// plaats van meteen naar de keuken te sturen moet er eerst worden afgerekend
// (zie order-confirm hieronder). Pas na bevestigde betaling gaat de
// bestelling alsnog naar de keuken, met "Bar" in plaats van een tafelnummer.
function openOrderModalForBar(barItem) {
  currentOrderTable = null;
  currentOrderBar = barItem;
  pendingBarOrder = null;
  orderCounts = {};
  orderItemOptions = {};
  productList().forEach(p => { orderCounts[p.key] = 0; orderItemOptions[p.key] = []; });
  document.getElementById('order-modal-title').textContent = `🍸 ${barItem.name || 'Bar'}`;
  document.getElementById('order-note').value = '';
  document.getElementById('order-error').textContent = '';
  document.getElementById('order-bar-confirm').style.display = 'none';
  document.getElementById('order-default-actions').style.display = '';
  document.getElementById('order-confirm').textContent = 'Doorgaan naar betalen';
  renderOrderProducts();
  openModal('modal-order');
}

function renderOrderModalIfOpen() {
  if (document.getElementById('modal-order').classList.contains('open')) {
    renderOrderProducts();
  }
}

function renderOrderProducts() {
  const container = document.getElementById('order-products');
  const items = productList();
  if (items.length === 0) {
    container.innerHTML = '<div class="empty-msg">Nog geen producten ingesteld. Voeg producten toe via Instellingen.</div>';
    return;
  }
  container.innerHTML = '';
  items.forEach(p => {
    if (orderCounts[p.key] === undefined) { orderCounts[p.key] = 0; orderItemOptions[p.key] = []; }
  });

  groupProductsByCategory(items).forEach(group => {
    if (group.naam) {
      const heading = document.createElement('div');
      heading.className = 'category-heading';
      heading.textContent = group.naam;
      container.appendChild(heading);
    }
    group.items.forEach(p => {
      const isOut = !!stockStatus[p.key];
      const card = document.createElement('div');
      card.className = 'product-card' + (isOut ? ' out-of-stock' : '');
      card.id = `order-card-${p.key}`;
      card.innerHTML = `
        <div class="name"><span class="menu-name-text">${p.emoji} ${escapeHtml(p.label)}</span><span class="menu-dots"></span><span class="price-tag">${formatPrice(p.price)}</span></div>
        <div class="product-row-main">
          <div class="stepper">
            <button type="button" class="min-btn" data-key="${p.key}" ${isOut ? 'disabled' : ''}>−</button>
            <span class="count" id="order-${p.key}-count">${orderCounts[p.key]}</span>
            <button type="button" class="plus-btn" data-key="${p.key}" ${isOut ? 'disabled' : ''}>+</button>
          </div>
          ${isOut ? '<span class="uitverkocht-tag">Uitverkocht</span>' : ''}
        </div>
        <div class="ice-toggles" id="order-opts-${p.key}"></div>
      `;
      container.appendChild(card);
    });
  });

  container.querySelectorAll('.plus-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      orderCounts[key]++;
      document.getElementById(`order-${key}-count`).textContent = orderCounts[key];
      renderOrderOptionToggles(key);
    });
  });
  container.querySelectorAll('.min-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      if (orderCounts[key] > 0) orderCounts[key]--;
      document.getElementById(`order-${key}-count`).textContent = orderCounts[key];
      renderOrderOptionToggles(key);
    });
  });

  items.forEach(p => renderOrderOptionToggles(p.key));
}

function renderOrderOptionToggles(key) {
  const p = PRODUCTS_STATE[key];
  const container = document.getElementById(`order-opts-${key}`);
  if (!container) return;
  container.innerHTML = '';
  const opties = productOptions(p);
  if (!p) return;

  const n = orderCounts[key] || 0;
  if (!orderItemOptions[key]) orderItemOptions[key] = [];
  while (orderItemOptions[key].length < n) orderItemOptions[key].push([]);
  while (orderItemOptions[key].length > n) orderItemOptions[key].pop();

  orderItemOptions[key].forEach((selected, i) => {
    const row = document.createElement('div');
    row.className = 'option-unit-row';
    if (n > 1) {
      const tag = document.createElement('span');
      tag.className = 'option-unit-tag';
      tag.textContent = `#${i + 1}`;
      row.appendChild(tag);
    }

    opties.forEach(opt => {
      const active = selected.includes(opt.label);
      const isOptOut = isOptionUitverkocht(opt.label);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'ice-chip' + (active ? ' met' : '') + (isOptOut ? ' uitverkocht' : '');
      chip.textContent = `${active ? '✅ ' : (opt.emoji ? opt.emoji + ' ' : '')}${opt.label}${isOptOut ? ' (uitverkocht)' : ''}`;
      if (isOptOut) chip.disabled = true;
      chip.addEventListener('click', () => {
        if (isOptionUitverkocht(opt.label)) return;
        const idx = orderItemOptions[key][i].indexOf(opt.label);
        if (idx === -1) orderItemOptions[key][i].push(opt.label);
        else orderItemOptions[key][i].splice(idx, 1);
        renderOrderOptionToggles(key);
      });
      row.appendChild(chip);
    });
    container.appendChild(row);
  });
}

// Splitst items (en bijbehorende itemOpties) van één bestelling op in een
// keuken-groep en een bar-groep, op basis van de bestemming die is ingesteld
// bij elk product. Zo komt bijv. bij "2x Fanta, 1x Pizza" de Fanta gewoon in
// de Bar-tab terecht en de Pizza in de Keuken-tab, ook al werden ze in één
// keer besteld.
function splitItemsByBestemming(items, itemOpties) {
  const groepen = { keuken: { items: {}, itemOpties: {} }, bar: { items: {}, itemOpties: {} } };
  Object.entries(items).forEach(([key, aantal]) => {
    const p = PRODUCTS_STATE[key];
    const bestemming = (p && p.bestemming === 'bar') ? 'bar' : 'keuken';
    groepen[bestemming].items[key] = aantal;
    if (itemOpties && itemOpties[key]) groepen[bestemming].itemOpties[key] = itemOpties[key];
  });
  return groepen;
}

// Rekent het totaalbedrag uit van een items-object (key -> aantal), op basis
// van de huidige productprijzen.
function computeItemsTotal(items) {
  return Object.entries(items).reduce((sum, [key, aantal]) => {
    const p = PRODUCTS_STATE[key];
    return sum + (p ? p.price : 0) * aantal;
  }, 0);
}

document.getElementById('order-confirm').addEventListener('click', () => {
  const errorEl = document.getElementById('order-error');
  const items = {};
  Object.entries(orderCounts).forEach(([key, aantal]) => {
    if (aantal > 0 && !stockStatus[key]) items[key] = aantal;
  });
  if (Object.keys(items).length === 0) {
    errorEl.textContent = 'Kies eerst iets.';
    return;
  }
  errorEl.textContent = '';

  const itemOpties = {};
  Object.keys(items).forEach(key => {
    const opts = orderItemOptions[key] || [];
    if (opts.some(sel => sel.length > 0)) itemOpties[key] = opts.map(sel => sel.slice());
  });
  const opmerking = document.getElementById('order-note').value.trim();

  if (currentOrderBar) {
    // Bij de bar wordt er eerst afgerekend, en pas daarna naar de keuken gestuurd.
    pendingBarOrder = { items, itemOpties, opmerking };
    document.getElementById('order-bar-confirm-amount').textContent = formatPrice(computeItemsTotal(items));
    document.getElementById('order-default-actions').style.display = 'none';
    document.getElementById('order-bar-confirm').style.display = 'block';
    return;
  }

  const nu = Date.now();
  const groepen = splitItemsByBestemming(items, itemOpties);
  const bestemmingen = ['keuken', 'bar'].filter(b => Object.keys(groepen[b].items).length > 0);
  // Alleen een gedeelde groupId nodig als de bestelling écht in meerdere
  // tickets wordt opgesplitst; zo telt de wachtrijpositie (in zelfservice)
  // dit straks als één bestelling in plaats van als twee.
  const groupId = bestemmingen.length > 1 ? restRef.child('orders').push().key : null;
  const updates = {};
  bestemmingen.forEach(bestemming => {
    const groepItems = groepen[bestemming].items;
    const id = restRef.child('orders').push().key;
    const orderData = {
      tableNumber: currentOrderTable.number,
      items: groepItems,
      status: 'nieuw',
      tijd: nu
    };
    if (opmerking) orderData.opmerking = opmerking;
    if (Object.keys(groepen[bestemming].itemOpties).length > 0) orderData.itemOpties = groepen[bestemming].itemOpties;
    if (groupId) orderData.orderGroupId = groupId;
    updates['orders/' + id] = orderData;
  });

  restRef.update(updates).then(() => {
    closeModal('modal-order');
  }).catch(err => {
    console.error(err);
    errorEl.textContent = 'Er ging iets mis, probeer opnieuw.';
  });
});

document.getElementById('order-bar-confirm-cancel').addEventListener('click', () => {
  document.getElementById('order-bar-confirm').style.display = 'none';
  document.getElementById('order-default-actions').style.display = '';
});

document.getElementById('order-bar-confirm-pay').addEventListener('click', () => {
  if (!pendingBarOrder || !currentOrderBar) return;
  const btn = document.getElementById('order-bar-confirm-pay');
  btn.disabled = true;

  const nu = Date.now();
  const groepen = splitItemsByBestemming(pendingBarOrder.items, pendingBarOrder.itemOpties);
  const bestemmingen = ['keuken', 'bar'].filter(b => Object.keys(groepen[b].items).length > 0);
  const groupId = bestemmingen.length > 1 ? restRef.child('orders').push().key : null;
  const updates = {};
  bestemmingen.forEach(bestemming => {
    const groepItems = groepen[bestemming].items;
    const id = restRef.child('orders').push().key;
    const orderData = {
      bar: true,
      barName: currentOrderBar.name || 'Bar',
      tableNumber: null,
      items: groepItems,
      status: 'nieuw',
      tijd: nu,
      betaaldOp: nu
    };
    if (pendingBarOrder.opmerking) orderData.opmerking = pendingBarOrder.opmerking;
    if (Object.keys(groepen[bestemming].itemOpties).length > 0) orderData.itemOpties = groepen[bestemming].itemOpties;
    if (groupId) orderData.orderGroupId = groupId;
    // Meteen zowel naar de keuken/bar (orders) als in de historie (al betaald) zetten.
    updates['orders/' + id] = orderData;
    updates['history/' + id] = orderData;
  });

  restRef.update(updates).then(() => {
    btn.disabled = false;
    pendingBarOrder = null;
    closeModal('modal-order');
    speelBetaalGeluid();
  }).catch(err => {
    console.error(err);
    btn.disabled = false;
    document.getElementById('order-bar-confirm').style.display = 'none';
    document.getElementById('order-default-actions').style.display = '';
    document.getElementById('order-error').textContent = 'Er ging iets mis, probeer opnieuw.';
  });
});

// ==================== Rekening & betalen ====================
function openBillModal(table) {
  window.currentBillTable = table;
  document.getElementById('bill-modal-title').textContent = `Rekening — ${kindWoord(table)} ${table.number}`;
  document.getElementById('bill-error').textContent = '';
  document.getElementById('bill-confirm').style.display = 'none';
  document.getElementById('bill-pay-btn').style.display = '';

  const orders = tableOrders(table.number);
  const merged = {}; // key -> aantal
  orders.forEach(([, order]) => {
    Object.entries(order.items || {}).forEach(([key, aantal]) => {
      merged[key] = (merged[key] || 0) + aantal;
    });
  });

  const container = document.getElementById('bill-items');
  container.innerHTML = '';
  let total = 0;
  const keys = Object.keys(merged);
  if (keys.length === 0) {
    container.innerHTML = '<div class="empty-msg">Geen openstaande bestellingen.</div>';
  } else {
    keys.forEach(key => {
      const p = PRODUCTS_STATE[key];
      const aantal = merged[key];
      const label = p ? p.label : '(verwijderd product)';
      const prijs = p ? p.price : 0;
      total += prijs * aantal;
      const row = document.createElement('div');
      row.className = 'settings-product-row';
      row.innerHTML = `
        <div class="settings-product-main">
          <span class="settings-product-emoji">${p ? p.emoji : '❓'}</span>
          <span class="settings-product-name">${aantal}x ${escapeHtml(label)}</span>
        </div>
        <span class="settings-product-price">${formatPrice(prijs * aantal)}</span>
      `;
      container.appendChild(row);
    });
  }

  window.currentBillTotal = total;
  document.getElementById('bill-total').textContent = `Totaal: ${formatPrice(total)}`;
  openModal('modal-bill');
}

document.getElementById('bill-pay-btn').addEventListener('click', () => {
  document.getElementById('bill-confirm-amount').textContent = formatPrice(window.currentBillTotal || 0);
  document.getElementById('bill-confirm-table').textContent = window.currentBillTable.number;
  document.getElementById('bill-confirm-kind').textContent = kindWoord(window.currentBillTable).toLowerCase();
  document.getElementById('bill-confirm').style.display = 'block';
  document.getElementById('bill-pay-btn').style.display = 'none';
});
document.getElementById('bill-pay-cancel').addEventListener('click', () => {
  document.getElementById('bill-confirm').style.display = 'none';
  document.getElementById('bill-pay-btn').style.display = '';
});
document.getElementById('bill-pay-confirm').addEventListener('click', () => {
  const table = window.currentBillTable;
  const orders = tableOrders(table.number);
  const nu = Date.now();
  const updates = {};
  orders.forEach(([id, order]) => {
    updates['history/' + id] = { ...order, betaaldOp: nu };
    updates['orders/' + id] = null;
  });
  const btn = document.getElementById('bill-pay-confirm');
  btn.disabled = true;
  restRef.update(updates).then(() => {
    btn.disabled = false;
    closeModal('modal-bill');
    speelBetaalGeluid();
  }).catch(err => {
    console.error(err);
    btn.disabled = false;
    document.getElementById('bill-error').textContent = 'Er ging iets mis, probeer opnieuw.';
  });
});

// ==================== Keuken & Gereed (live orders) ====================
let ALLE_ORDERS = {}; // id -> order

function productLabel(key, order) {
  const p = PRODUCTS_STATE[key];
  if (p && p.label) return p.label;
  const detail = order && order.itemDetails && order.itemDetails[key];
  if (detail && detail.label) return detail.label;
  return key;
}

// Zoekt de huidige emoji van een opmerking bij een product op (op naam,
// hoofdletterongevoelig), zodat de keuken altijd de actuele emoji ziet i.p.v.
// een vast opmerking-icoontje.
function optionEmoji(productKey, label) {
  const p = PRODUCTS_STATE[productKey];
  const opt = productOptions(p).find(o => o.label.toLowerCase() === label.toLowerCase());
  return (opt && opt.emoji) ? opt.emoji : '📝';
}

function itemsToLinesHtml(order) {
  return Object.entries(order.items).map(([key, aantal]) => {
    const label = productLabel(key, order);
    const keuzes = order.itemOpties && order.itemOpties[key];
    const ijs = order.itemIce && order.itemIce[key];
    if (keuzes && keuzes.length > 0) {
      return keuzes.map((selected, unitIndex) => {
        const extras = [];
        if (selected && selected.length > 0) extras.push(selected.map(o => `${optionEmoji(key, o)} ${escapeHtml(o)}`).join(', '));
        if (ijs?.[unitIndex]) extras.push('🧊 IJsklontjes');
        const suffix = extras.length ? ` — ${extras.join(', ')}` : '';
        return `<div class="item-line">1x ${escapeHtml(label)}${suffix}</div>`;
      }).join('');
    }
    const iceFlags = Array.isArray(ijs) ? ijs.slice(0, aantal).map(Boolean) : [];
    const iceCount = iceFlags.filter(Boolean).length;
    if (aantal > 1 && iceFlags.length === aantal) {
      return iceFlags.map((hasIce, unitIndex) =>
        `<div class="item-line">${unitIndex + 1}. 1x ${escapeHtml(label)}${hasIce ? ' — 🧊 IJsklontjes' : ''}</div>`
      ).join('');
    }
    const iceSuffix = iceCount ? ` — 🧊 IJsklontjes: ${iceCount}/${aantal}` : '';
    return `<div class="item-line">${aantal}x ${escapeHtml(label)}${iceSuffix}</div>`;
  }).join('');
}

// ---- Meldingsgeluid ----
// Instelbaar per restaurant: geen geluid, het standaardgeluid, of een zelf
// geüpload geluid (max 400 KB, als base64 data-URL opgeslagen in Firebase).
const meldingGeluidStandaard = new Audio('melding%20geluid.mp3');
const meldingGeluid2 = new Audio('melding%20geluid%202.mp3');
const betaalGeluid = new Audio('betaal%20geluid.mp3');
function speelBetaalGeluid() {
  try {
    betaalGeluid.currentTime = 0;
    betaalGeluid.play().catch(() => {});
  } catch (e) { /* geluid niet beschikbaar */ }
}
let customGeluidAudio = null; // Audio-object voor het geüploade geluid (lazy)
let soundSettings = { mode: 'default' };
const paginaGeladenOp = Date.now();

restRef.child('settings/notificationSound').on('value', snap => {
  soundSettings = snap.val() || { mode: 'default' };
  if (soundSettings.mode === 'custom' && soundSettings.data) {
    customGeluidAudio = new Audio(soundSettings.data);
  } else {
    customGeluidAudio = null;
  }
  renderSoundSettingsUi();
});

function speelMeldingGeluid() {
  try {
    if (soundSettings.mode === 'none') return;
    if (soundSettings.mode === 'custom' && customGeluidAudio) {
      customGeluidAudio.currentTime = 0;
      customGeluidAudio.play().catch(() => {});
      return;
    }
    const audio = soundSettings.mode === 'second' ? meldingGeluid2 : meldingGeluidStandaard;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch (e) { /* geluid niet beschikbaar */ }
}

// ---- Instellingen: meldingsgeluid kiezen/uploaden (alleen eigenaar) ----
const MAX_SOUND_BYTES = 400 * 1024;

function renderSoundSettingsUi() {
  const mode = soundSettings.mode || 'default';
  const hasCustom = !!soundSettings.data;
  const btnNone = document.getElementById('sound-choice-none');
  const btnDefault = document.getElementById('sound-choice-default');
  const btnSecond = document.getElementById('sound-choice-second');
  const btnCustom = document.getElementById('sound-choice-custom');
  const previewCustom = document.getElementById('sound-preview-custom');
  const removeBtn = document.getElementById('sound-upload-remove');
  const customLabel = document.getElementById('sound-custom-label');
  if (!btnNone || !btnDefault || !btnCustom) return;

  btnNone.classList.toggle('selected', mode === 'none');
  btnDefault.classList.toggle('selected', mode === 'default');
  btnCustom.classList.toggle('selected', mode === 'custom');
  if (btnSecond) btnSecond.classList.toggle('selected', mode === 'second');
  btnCustom.disabled = !hasCustom;
  customLabel.textContent = hasCustom
    ? `🎵 ${soundSettings.name || 'Mijn geüploade geluid'}`
    : '🎵 Mijn geüploade geluid (nog niets geüpload)';
  if (previewCustom) previewCustom.style.display = hasCustom ? '' : 'none';
  if (removeBtn) removeBtn.style.display = hasCustom ? '' : 'none';
}

// Keuze van meldingsgeluid: eigenaar kan kiezen. We bepalen de eigenaar robuust via de
// bestaande restaurantleden-data; als isOwner nog niet geïnitialiseerd is, wachten we kort
// en initialiseren de knoppen alsnog zodra de pagina klaar is.
function initSoundChoiceControls() {
  const none = document.getElementById('sound-choice-none');
  const def = document.getElementById('sound-choice-default');
  const second = document.getElementById('sound-choice-second');
  const custom = document.getElementById('sound-choice-custom');
  const uploadRow = document.getElementById('sound-upload-row');
  const note = document.getElementById('sound-readonly-note');
  if (!none || !def || !second || !custom) return;

  const owner = (typeof isOwner !== 'undefined') ? !!isOwner : false;
  [none, def, second, custom].forEach(btn => { btn.disabled = !owner; });
  if (uploadRow) uploadRow.style.display = owner ? 'flex' : 'none';
  if (note) note.style.display = owner ? 'none' : 'block';

  if (!owner) return;
  if (none.dataset.soundBound) return;
  none.dataset.soundBound = def.dataset.soundBound = second.dataset.soundBound = custom.dataset.soundBound = '1';

  none.addEventListener('click', () => restRef.child('settings/notificationSound/mode').set('none'));
  def.addEventListener('click', () => restRef.child('settings/notificationSound/mode').set('default'));
  second.addEventListener('click', () => restRef.child('settings/notificationSound/mode').set('second'));
  custom.addEventListener('click', () => {
    if (!soundSettings.data) return;
    restRef.child('settings/notificationSound/mode').set('custom');
  });

  // De knop 'Beluisteren' zit binnen de keuze-knop. Stop de klik hier,
  // zodat luisteren niet tegelijk de meldingsgeluid-keuze verandert.
  const previewDefault = document.getElementById('sound-preview-default');
  const previewSecond = document.getElementById('sound-preview-second');
  const previewCustom = document.getElementById('sound-preview-custom');
  const playPreview = (audio, event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    audio.play().catch(() => {});
  };
  if (previewDefault && !previewDefault.dataset.previewBound) {
    previewDefault.dataset.previewBound = '1';
    previewDefault.addEventListener('click', e => playPreview(meldingGeluidStandaard, e));
  }
  if (previewSecond && !previewSecond.dataset.previewBound) {
    previewSecond.dataset.previewBound = '1';
    previewSecond.addEventListener('click', e => playPreview(meldingGeluid2, e));
  }
  if (previewCustom && !previewCustom.dataset.previewBound) {
    previewCustom.dataset.previewBound = '1';
    previewCustom.addEventListener('click', e => {
      if (!soundSettings.data) return playPreview(null, e);
      if (!customGeluidAudio) customGeluidAudio = new Audio(soundSettings.data);
      playPreview(customGeluidAudio, e);
    });
  }
}

initSoundChoiceControls();
setTimeout(initSoundChoiceControls, 250);
setTimeout(initSoundChoiceControls, 1000);

// Bepaalt of een bestelling in de Keuken- of de Bar-tab thuishoort. Een
// bestelling gaat alleen naar de Bar als ÁL zijn producten daar besteld
// moeten worden; zit er ook maar één keuken-product bij, dan gaat de hele
// bestelling (net als vroeger) naar de Keuken.
function orderBestemming(order) {
  if (order && order.bestemming === 'bar') return 'bar';
  if (order && order.bestemming === 'keuken') return 'keuken';
  const keys = Object.keys(order.items || {});
  if (keys.length === 0) return 'keuken';
  const allesBar = keys.every(key => {
    const p = PRODUCTS_STATE[key];
    const detail = order.itemDetails && order.itemDetails[key];
    return (p && p.bestemming === 'bar') || (!p && detail && detail.bestemming === 'bar');
  });
  return allesBar ? 'bar' : 'keuken';
}

function uiText(nl, en) {
  return (window.I18N && localStorage.getItem('appLanguage') === 'en') ? en : nl;
}

function kindLabel(kind, number) {
  const en = localStorage.getItem('appLanguage') === 'en';
  const label = kind === 'bar' ? (en ? 'Bar' : 'Bar') : kind === 'keuken' ? (en ? 'Kitchen' : 'Keuken') : (en ? 'Table' : 'Tafel');
  return `${label} ${number}`;
}

function renderOrderCardHtml(id, order, actionHtml) {
  const noteHtml = order.opmerking ? `<div class="note-line">"${escapeHtml(order.opmerking)}"</div>` : '';
  const badgeHtml = order.bar
    ? `🍸 ${escapeHtml(order.barName || 'Bar')}`
    : `${kindIconByNumber(order.tableNumber)} ${kindLabel(kindWoordByNumber(order.tableNumber), order.tableNumber)}`;
  return `
    <div class="table-badge">${badgeHtml}</div>
    <div class="items-block">${itemsToLinesHtml(order)}</div>
    ${noteHtml}
    <div class="time-line">${uiText('Binnengekomen om','Received at')} ${formatTime(order.tijd)}</div>
    ${actionHtml}
  `;
}

// Rendert de "Binnengekomen" / "In bereiding" kolommen voor Keuken of Bar.
// bestemming is 'keuken' of 'bar' en bepaalt zowel welke bestellingen worden
// getoond als in welke DOM-elementen (kitchen-* voor Keuken, bar-* voor Bar).
function renderPrepTab(bestemming) {
  const idPrefix = bestemming === 'bar' ? 'bar' : 'kitchen';
  const nieuwList = document.getElementById(idPrefix + '-list-nieuw');
  const bereidenList = document.getElementById(idPrefix + '-list-bereiden');
  const countEl = document.getElementById(idPrefix + '-count');
  const badgeEl = document.getElementById('tab-badge-' + bestemming);
  if (!nieuwList || !bereidenList || !countEl) return;

  const relevant = Object.entries(ALLE_ORDERS).filter(([, o]) => orderBestemming(o) === bestemming);
  const nieuw = relevant.filter(([, o]) => o.status === 'nieuw').sort((a, b) => a[1].tijd - b[1].tijd);
  const bereiden = relevant.filter(([, o]) => o.status === 'bereiden').sort((a, b) => a[1].tijd - b[1].tijd);

  countEl.textContent = (nieuw.length === 0 && bereiden.length === 0)
    ? uiText('Nieuwe bestellingen worden hier automatisch getoond.', 'New orders will appear here automatically.')
    : `${nieuw.length} ${uiText('nieuw','new')} · ${bereiden.length} ${uiText('in bereiding','preparing')}`;

  if (badgeEl) {
    const totaal = nieuw.length + bereiden.length;
    badgeEl.textContent = totaal > 0 ? totaal : '';
  }

  if (nieuw.length === 0) {
    nieuwList.innerHTML = `<div class="empty-msg">${uiText('Nog geen nieuwe bestellingen','No new orders yet')}</div>`;
  } else {
    nieuwList.innerHTML = '';
    nieuw.forEach(([id, order]) => {
      const card = document.createElement('div');
      card.className = 'order-card nieuw';
      card.innerHTML = renderOrderCardHtml(id, order, `<div class="actions"><button class="chip-btn prepare" data-id="${id}">${window.I18N ? window.I18N.t('Start bereiden') : 'Start bereiden'}</button></div>`);
      nieuwList.appendChild(card);
    });
    nieuwList.querySelectorAll('.chip-btn.prepare').forEach(btn => {
      btn.addEventListener('click', () => {
        restRef.child('orders/' + btn.dataset.id + '/status').set('bereiden');
      });
    });
  }

  if (bereiden.length === 0) {
    bereidenList.innerHTML = `<div class="empty-msg">${uiText('Nog niets in bereiding','Nothing being prepared yet')}</div>`;
  } else {
    bereidenList.innerHTML = '';
    bereiden.forEach(([id, order]) => {
      const card = document.createElement('div');
      card.className = 'order-card bereiden';
      card.innerHTML = renderOrderCardHtml(id, order, `<div class="actions"><button class="chip-btn ready" data-id="${id}">${window.I18N ? window.I18N.t('Klaar') : 'Klaar'}</button></div>`);
      bereidenList.appendChild(card);
    });
    bereidenList.querySelectorAll('.chip-btn.ready').forEach(btn => {
      btn.addEventListener('click', () => {
        restRef.child('orders/' + btn.dataset.id + '/status').set('klaar');
      });
    });
  }
}

function renderKitchen() {
  renderPrepTab('keuken');
  renderPrepTab('bar');
}

function renderReady() {
  const readyList = document.getElementById('ready-list');
  const readyCount = document.getElementById('ready-count');

  const klaar = Object.entries(ALLE_ORDERS).filter(([, o]) => o.status === 'klaar').sort((a, b) => a[1].tijd - b[1].tijd);

  const readyBadge = document.getElementById('tab-badge-gereed');
  if (readyBadge) readyBadge.textContent = klaar.length > 0 ? klaar.length : '';

  if (klaar.length === 0) {
    readyList.innerHTML = `<div class="empty-msg">${uiText('Geen klaargemaakte bestellingen','No prepared orders')}</div>`;
    readyCount.textContent = uiText('Klaargemaakte bestellingen wachtend op bezorging.', 'Prepared orders waiting for delivery.');
    return;
  }
  readyCount.textContent = `${klaar.length} ${uiText('klaar voor bezorging','ready for delivery')}`;
  readyList.innerHTML = '';

  klaar.forEach(([id, order]) => {
    const card = document.createElement('div');
    card.className = 'order-card';
    card.innerHTML = renderOrderCardHtml(id, order, `<div class="actions"><button class="chip-btn delivered" data-id="${id}">${window.I18N ? window.I18N.t('Bezorgd') : 'Bezorgd'}</button></div>`);
    readyList.appendChild(card);
  });

  readyList.querySelectorAll('.chip-btn.delivered').forEach(btn => {
    btn.addEventListener('click', () => {
      const order = ALLE_ORDERS[btn.dataset.id];
      if (order && order.bar) {
        // Een bar-bestelling is al betaald (staat al in de historie), dus
        // die hoeft na bezorging niet meer op een rekening te blijven staan.
        restRef.child('orders/' + btn.dataset.id).remove();
        return;
      }
      // Bezorgd, maar nog niet afgerekend: blijft meetellen op de rekening van de tafel
      // totdat er via "Bestelde dingen" -> "Betalen" wordt afgerekend.
      restRef.child('orders/' + btn.dataset.id + '/status').set('bezorgd');
    });
  });
}

// ==================== Historie (afgerekende bestellingen, alle tafels) ====================
let HISTORY_STATE = {};

restRef.child('history').on('value', snap => {
  HISTORY_STATE = snap.val() || {};
  renderHistory();
});

function renderHistory() {
  const list = document.getElementById('history-list');
  const countEl = document.getElementById('history-count');
  const summaryEl = document.getElementById('history-summary');

  const entries = Object.entries(HISTORY_STATE).sort((a, b) => (b[1].betaaldOp || b[1].tijd || 0) - (a[1].betaaldOp || a[1].tijd || 0));

  if (entries.length === 0) {
    list.innerHTML = `<div class="empty-msg">${uiText('Nog geen historie','No history yet')}</div>`;
    countEl.textContent = uiText('Alle afgerekende bestellingen verschijnen hier.', 'All paid orders appear here.');
    summaryEl.innerHTML = '';
    return;
  }

  countEl.textContent = `${entries.length} ${uiText(entries.length === 1 ? 'afgerekende bestelling' : 'afgerekende bestellingen', entries.length === 1 ? 'paid order' : 'paid orders')}`;
  list.innerHTML = '';
  let totaalOmzet = 0;
  const perProduct = {};
  const perCategory = {}; // catKey ('__overig__' voor zonder categorie) -> {naam, aantal}

  entries.forEach(([id, order]) => {
    const card = document.createElement('div');
    card.className = 'order-card';
    const noteHtml = order.opmerking ? `<div class="note-line">"${escapeHtml(order.opmerking)}"</div>` : '';
    const betaaldHtml = order.betaaldOp ? ` · ${uiText('betaald om','paid at')} ${formatTime(order.betaaldOp)}` : '';
    const badgeHtml = order.bar
      ? `🍸 ${escapeHtml(order.barName || 'Bar')}`
      : `${kindIconByNumber(order.tableNumber)} ${kindLabel(kindWoordByNumber(order.tableNumber), order.tableNumber)}`;
    card.innerHTML = `
      <div class="table-badge">${badgeHtml}</div>
      <div class="items-block">${itemsToLinesHtml(order)}</div>
      ${noteHtml}
      <div class="time-line">${uiText('Besteld om','Ordered at')} ${formatTime(order.tijd)}${betaaldHtml}</div>
    `;
    list.appendChild(card);

    Object.entries(order.items || {}).forEach(([key, aantal]) => {
      const p = PRODUCTS_STATE[key];
      const prijs = p ? p.price : 0;
      totaalOmzet += prijs * aantal;
      if (!perProduct[key]) perProduct[key] = { label: p ? p.label : '(verwijderd product)', aantal: 0 };
      perProduct[key].aantal += aantal;

      const catKey = (p && p.categorie && CATEGORIES_STATE[p.categorie]) ? p.categorie : '__overig__';
      if (!perCategory[catKey]) {
        const catNaam = catKey === '__overig__' ? 'Overig' : CATEGORIES_STATE[catKey].naam;
        perCategory[catKey] = { naam: catNaam, aantal: 0 };
      }
      perCategory[catKey].aantal += aantal;
    });
  });

  let summaryHtml = `<div class="history-summary-title">${uiText('Totaaloverzicht','Summary')}</div>`;
  Object.values(perProduct).sort((a, b) => b.aantal - a.aantal).forEach(p => {
    summaryHtml += `<div class="history-summary-row"><span>${escapeHtml(p.label)}</span><span>${p.aantal}x</span></div>`;
  });
  summaryHtml += `<div class="history-summary-row"><span>${uiText('Totale omzet','Total revenue')}</span><span>${formatPrice(totaalOmzet)}</span></div>`;

  if (Object.keys(CATEGORIES_STATE).length > 0) {
    summaryHtml += `<div class="history-summary-title" style="margin-top:16px;">${uiText('Per categorie','By category')}</div>`;
    Object.values(perCategory).sort((a, b) => b.aantal - a.aantal).forEach(c => {
      summaryHtml += `<div class="history-summary-row"><span>${escapeHtml(c.naam)}</span><span>${c.aantal}x</span></div>`;
    });
  }
  summaryEl.innerHTML = summaryHtml;
}

document.getElementById('btn-reset-history').addEventListener('click', () => {
  if (!confirm('Weet je zeker dat je de hele historie wilt wissen? Dit kan niet ongedaan worden gemaakt.')) return;
  restRef.child('history').remove();
});

const ordersRef = restRef.child('orders');

ordersRef.on('child_added', snap => {
  const order = snap.val();
  const isNew = order.status === 'nieuw' && order.tijd && order.tijd > paginaGeladenOp && !ALLE_ORDERS[snap.key];
  ALLE_ORDERS[snap.key] = order;
  renderKitchen();
  renderReady();
  herbereken_actieve_tafels();
  syncOrdersMirror();
  if (isNew && (activeTab === 'keuken' || activeTab === 'bar') && orderBestemming(order) === activeTab) speelMeldingGeluid();
});
ordersRef.on('child_changed', snap => {
  const vorige = ALLE_ORDERS[snap.key];
  const nieuwe = snap.val();
  const werdKlaar = vorige && vorige.status !== 'klaar' && nieuwe.status === 'klaar';
  ALLE_ORDERS[snap.key] = nieuwe;
  renderKitchen();
  renderReady();
  herbereken_actieve_tafels();
  syncOrdersMirror();
  if (werdKlaar && activeTab === 'gereed') speelMeldingGeluid();
});
ordersRef.on('child_removed', snap => {
  delete ALLE_ORDERS[snap.key];
  renderKitchen();
  renderReady();
  herbereken_actieve_tafels();
  syncOrdersMirror();
});

// ==================== Mirror voor externe systemen ====================
function sanitizeMirrorKey(s) {
  return String(s || '').replace(/[.#$[\]/]/g, '_');
}

function syncSelfserviceConfig() {
  if (typeof db === 'undefined' || !restaurantId) return;

  // Sync Producten
  const productsMirror = {};
  Object.entries(PRODUCTS_STATE).forEach(([id, p]) => {
    if (!p.label) return;
    const k = sanitizeMirrorKey(p.label);
    productsMirror[k] = {
      originalId: id,
      label: p.label,
      emoji: p.emoji || '',
      price: p.price || 0,
      bestemming: p.bestemming || 'keuken',
      categorie: (p.categorie && CATEGORIES_STATE[p.categorie]) ? CATEGORIES_STATE[p.categorie].naam : 'Overig',
      opties: productOptions(p)
    };
  });
  restRef.child('selfserviceconfig/producten').set(productsMirror);

  // Sync Plattegrond
  const fpMirror = {};
  Object.entries(TABLES_STATE).forEach(([id, t]) => {
    const isOrderable = t.kind === 'tafel' || t.kind === 'bank';
    if (!isOrderable) return;

    const kindWoord = t.kind === 'bank' ? 'Bank' : 'Tafel';
    const label = kindWoord + ' ' + (t.number || 'Onbekend');
    const k = sanitizeMirrorKey(label);

    fpMirror[k] = {
      originalId: id,
      label: label,
      number: t.number || 0,
      kind: t.kind,
      x: t.x,
      y: t.y
    };
  });
  restRef.child('selfserviceconfig/plattegrond').set(fpMirror);
}

function syncOrdersMirror() {
  if (typeof db === 'undefined' || !restaurantId) return;

  const kitchen = {};
  const bar = {};
  const ready = {};

  Object.entries(ALLE_ORDERS).forEach(([id, o]) => {
    const dest = orderBestemming(o);
    // Voeg extra info toe voor de spiegel
    const mirrorOrder = {
      ...o,
      orderId: id,
      bestemming: dest,
      kind: kindWoordByNumber(o.tableNumber),
      icon: kindIconByNumber(o.tableNumber)
    };

    if (o.status === 'klaar') {
      ready[id] = mirrorOrder;
    } else if (o.status === 'nieuw' || o.status === 'bereiden') {
      if (dest === 'bar') bar[id] = mirrorOrder;
      else kitchen[id] = mirrorOrder;
    }
  });

  const mirror = {
    bar: bar,
    keuken: kitchen,
    gereed: ready
  };

  // Sla op onder de gevraagde namen
  restRef.child('bestelde bestellingen').set(mirror);
  restRef.child('selfserviceconfig/bestelde bestellingen').set(mirror);
}

// ==================== Zelfservice QR ====================
let selfserviceCode = "";

function getSelfserviceUrl() {
  // Gebruik de live web-URL in plaats van de lokale file:/// URL.
  // Hierdoor opent de browser van de klant direct de website via de QR-code.
  const baseUrl = "https://sjaak087.github.io/Zelfservice";
  let url = baseUrl + '?id=' + encodeURIComponent(restaurantId);
  if (selfserviceCode) url += '&code=' + encodeURIComponent(selfserviceCode);
  return url;
}

function renderSelfserviceQr() {
  const box = document.getElementById('selfservice-qr');
  const urlEl = document.getElementById('selfservice-url');
  const ssCodeEl = document.getElementById('info-ss-code');
  if (!box || !urlEl) return;

  const url = getSelfserviceUrl();
  urlEl.textContent = url;
  if (ssCodeEl) ssCodeEl.textContent = selfserviceCode || '—';

  box.innerHTML = '';
  if (window.QRCode) {
    new QRCode(box, { text: url, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
  }
}

const selfserviceSubtabBtn = document.querySelector('[data-subtab="zelfservice"]');
if (selfserviceSubtabBtn) {
  selfserviceSubtabBtn.addEventListener('click', () => setTimeout(renderSelfserviceQr, 0));
}
document.getElementById('btn-selfservice-scan')?.addEventListener('click', () => {
  window.open(getSelfserviceUrl(), '_blank', 'noopener');
});
document.getElementById('btn-selfservice-pdf')?.addEventListener('click', () => {
  const url = getSelfserviceUrl();
  if (!window.jspdf) { alert('PDF-module kon niet worden geladen. Controleer je internetverbinding.'); return; }
  const QRCanvas = document.querySelector('#selfservice-qr canvas');
  if (!QRCanvas) { renderSelfserviceQr(); setTimeout(() => document.getElementById('btn-selfservice-pdf').click(), 150); return; }
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const title = document.getElementById('restaurant-title')?.textContent || 'Restaurant';
  pdf.setFontSize(24);
  pdf.text(title, 105, 35, { align: 'center' });
  pdf.setFontSize(16);
  pdf.text('Scan om zelf te bestellen', 105, 50, { align: 'center' });
  pdf.addImage(QRCanvas.toDataURL('image/png'), 'PNG', 55, 65, 100, 100);
  pdf.setFontSize(10);
  pdf.text('Kies je tafel, bestel je producten en volg je bestelling.', 105, 180, { align: 'center' });
  pdf.save('zelfservice-qr-' + (restaurantId || 'restaurant') + '.pdf');
});

// ==================== Notities ====================
// Vrij te typen notities (max 750 tekens), gedeeld met het hele restaurant.
// Enter voegt een nieuw vinkje toe; afvinken verwijdert de notitie na 5 sec.
const notesInput = document.getElementById('notes-input');
const notesListEl = document.getElementById('notes-list');
const notesRef = restRef.child('notities');

// Elk apparaat plant zijn eigen verwijder-timer bij een afgevinkte notitie,
// zodat de notitie ook verdwijnt als het apparaat dat 'm afvinkte de app
// intussen sluit (een ander open apparaat handelt de verwijdering dan af).
// .remove() op een al verwijderd pad is onschuldig, dus dubbele timers
// vanaf meerdere apparaten geven geen problemen.
const geplandeNotitieVerwijderingen = new Set();

function scheduleNoteRemoval(id, afgevinktOp) {
  if (geplandeNotitieVerwijderingen.has(id)) return;
  geplandeNotitieVerwijderingen.add(id);
  const resterendeTijd = Math.max(0, 5000 - (Date.now() - (afgevinktOp || Date.now())));
  setTimeout(() => {
    notesRef.child(id).remove();
    geplandeNotitieVerwijderingen.delete(id);
  }, resterendeTijd);
}

if (notesInput) {
  notesInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const tekst = notesInput.value.trim().slice(0, 750);
    if (!tekst) return;
    notesRef.push({ tekst, tijd: firebase.database.ServerValue.TIMESTAMP, afgevinkt: false });
    notesInput.value = '';
  });
}

if (notesListEl) {
  notesListEl.addEventListener('change', (e) => {
    const cb = e.target.closest('.note-checkbox');
    if (!cb) return;
    const id = cb.dataset.id;
    if (!id) return;
    if (cb.checked) {
      const afgevinktOp = Date.now();
      notesRef.child(id).update({ afgevinkt: true, afgevinktOp });
    } else {
      notesRef.child(id).update({ afgevinkt: false, afgevinktOp: null });
    }
  });
}

const MAX_NOTITIES = 20;

notesRef.on('value', (snap) => {
  const notities = snap.val() || {};
  const entries = Object.entries(notities).sort(([a], [b]) => (a < b ? -1 : 1));

  // Max 20 notities: de oudste (eerste in de oplopende volgorde) worden
  // verwijderd zodra dit aantal overschreden wordt. Elk apparaat dat de
  // update ontvangt probeert dit, maar .remove() op een al verwijderd pad
  // is onschuldig, dus dubbele pogingen vanaf meerdere apparaten zijn geen
  // probleem.
  if (entries.length > MAX_NOTITIES) {
    entries.slice(0, entries.length - MAX_NOTITIES).forEach(([id]) => {
      notesRef.child(id).remove();
    });
  }
  const zichtbareEntries = entries.slice(-MAX_NOTITIES);

  if (zichtbareEntries.length === 0) {
    notesListEl.innerHTML = '<div class="empty-msg">Nog geen notities</div>';
    return;
  }

  notesListEl.innerHTML = zichtbareEntries.map(([id, n]) => {
    const afgevinkt = !!n.afgevinkt;
    const tekst = escapeHtml(n.tekst || '');
    return `
      <div class="note-row${afgevinkt ? ' afgevinkt' : ''}">
        <input type="checkbox" class="note-checkbox" data-id="${id}" ${afgevinkt ? 'checked' : ''}>
        <span class="note-text">${tekst}</span>
      </div>
    `;
  }).join('');

  // Zorg dat afgevinkte notities die al (deels) hun 5 sec hebben gehad
  // alsnog verwijderd worden, ook als dit apparaat de melding pas nu ontvangt
  // (bijv. bij openen van het tabblad of na herverbinden).
  zichtbareEntries.forEach(([id, n]) => {
    if (n.afgevinkt) scheduleNoteRemoval(id, n.afgevinktOp);
  });
});

// ==================== Achtergrondpatronen ====================
const BG_PATTERNS = [
  {id:'cupcakes',label:'🧁 Cupcakes',bg:'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI3MCIgdmlld0JveD0iMCAwIDgwIDcwIj48ZyBvcGFjaXR5PSIwLjMyIiBzdHJva2U9Im5vbmUiPjxwYXRoIGQ9Ik0xOCAyOWMwLTcgNi0xMiAxMy0xMiAzLTUgOS02IDEzLTEgNy0xIDEyIDQgMTIgMTEgMCA2LTUgOS0xMSA5SDI5Yy02IDAtMTEtMi0xMS03eiIgZmlsbD0iI2YzYTZjNyIvPjxwYXRoIGQ9Ik0yMiAzNmgzNGwtNSAyMEgyN3oiIGZpbGw9IiNkNzhmNjIiLz48cGF0aCBkPSJNMjYgNDFoMjZNMjggNDdoMjJNMzAgNTNoMTgiIHN0cm9rZT0iIzhmNWQ0MiIgc3Ryb2tlLXdpZHRoPSIyIiBmaWxsPSJub25lIi8+PC9nPjwvc3ZnPg==")',size:'80px 70px'},
  {id:'coffee',label:'☕ Koffie',bg:'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI3MCIgdmlld0JveD0iMCAwIDgwIDcwIj48ZyBvcGFjaXR5PSIwLjMyIiBzdHJva2U9Im5vbmUiPjxwYXRoIGQ9Ik0yMCAyMGgzNHYyNWMwIDgtNyAxMy0xNyAxM1MyMCA1MyAyMCA0NXoiIGZpbGw9IiNjNThhNTgiLz48cGF0aCBkPSJNNTQgMjdoN2M2IDAgOCA1IDggOXMtMyA5LTkgOWgtNnYtNmg1YzIgMCAzLTEgMy0zcy0xLTMtMy0zaC01eiIgZmlsbD0iIzlhNjg0NSIvPjxwYXRoIGQ9Ik0yNiAxNWMtMy01IDMtNiAwLTExTTM3IDE1Yy0zLTUgMy02IDAtMTFNNDggMTVjLTMtNSAzLTYgMC0xMSIgc3Ryb2tlPSIjZWFkOGJkIiBzdHJva2Utd2lkdGg9IjMiIGZpbGw9Im5vbmUiLz48L2c+PC9zdmc+")',size:'80px 70px'},
  {id:'pizza',label:'🍕 Pizza',bg:'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI3MCIgdmlld0JveD0iMCAwIDgwIDcwIj48ZyBvcGFjaXR5PSIwLjMyIiBzdHJva2U9Im5vbmUiPjxwYXRoIGQ9Ik0xOCAxNWMyMCAyIDM5IDEzIDQ3IDI5TDMxIDU3eiIgZmlsbD0iI2U4YjM0ZiIvPjxwYXRoIGQ9Ik0xOCAxNWMxOSAxIDM3IDEwIDQ3IDI5IiBzdHJva2U9IiNkODViNDMiIHN0cm9rZS13aWR0aD0iNyIgZmlsbD0ibm9uZSIvPjxjaXJjbGUgY3g9IjM0IiBjeT0iMjkiIHI9IjQiIGZpbGw9IiNiOTRkM2UiLz48Y2lyY2xlIGN4PSI0NiIgY3k9IjM1IiByPSI0IiBmaWxsPSIjYjk0ZDNlIi8+PGNpcmNsZSBjeD0iMzgiIGN5PSI0MyIgcj0iNCIgZmlsbD0iI2I5NGQzZSIvPjwvZz48L3N2Zz4=")',size:'80px 70px'},
  {id:'hearts',label:'♥ Hartjes',bg:'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI3MCIgdmlld0JveD0iMCAwIDgwIDcwIj48ZyBvcGFjaXR5PSIwLjMyIiBzdHJva2U9Im5vbmUiPjxwYXRoIGQ9Ik00MCA1NUMzNSA1MCAxNSAzOCAxNSAyNWMwLTcgOS0xMSAxNS01IDQtNyAxNS00IDE1IDQgMCAxMy0yMCAyNi01IDMxeiIgZmlsbD0iI2Q0Nzc4YyIvPjwvZz48L3N2Zz4=")',size:'80px 70px'},
  {id:'stars',label:'✦ Sterren',bg:'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI3MCIgdmlld0JveD0iMCAwIDgwIDcwIj48ZyBvcGFjaXR5PSIwLjMyIiBzdHJva2U9Im5vbmUiPjxwYXRoIGQ9Ik00MCAxMGw2IDIwIDIxIDAtMTcgMTIgNyAyMS0xNy0xMy0xNyAxMyA3LTIxLTE3LTEyaDIxeiIgZmlsbD0iI2Q5YWQ0ZiIvPjwvZz48L3N2Zz4=")',size:'80px 70px'},
  {id:'flowers',label:'✿ Bloemen',bg:'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI3MCIgdmlld0JveD0iMCAwIDgwIDcwIj48ZyBvcGFjaXR5PSIwLjMyIiBzdHJva2U9Im5vbmUiPjxjaXJjbGUgY3g9IjQwIiBjeT0iMzUiIHI9IjgiIGZpbGw9IiNlM2IwNWUiLz48Y2lyY2xlIGN4PSI0MCIgY3k9IjIwIiByPSIxMCIgZmlsbD0iI2Q5OWFiMyIvPjxjaXJjbGUgY3g9IjU1IiBjeT0iMzUiIHI9IjEwIiBmaWxsPSIjZDk5YWIzIi8+PGNpcmNsZSBjeD0iNDAiIGN5PSI1MCIgcj0iMTAiIGZpbGw9IiNkOTlhYjMiLz48Y2lyY2xlIGN4PSIyNSIgY3k9IjM1IiByPSIxMCIgZmlsbD0iI2Q5OWFiMyIvPjwvZz48L3N2Zz4=")',size:'80px 70px'},
  {id:'leaves',label:'🍃 Bladeren',bg:'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI3MCIgdmlld0JveD0iMCAwIDgwIDcwIj48ZyBvcGFjaXR5PSIwLjMyIiBzdHJva2U9Im5vbmUiPjxwYXRoIGQ9Ik0xOCA1MGM0LTI1IDI0LTM0IDQ1LTM0LTMgMjItMTggMzgtNDUgMzR6IiBmaWxsPSIjNzVhNTZkIi8+PHBhdGggZD0iTTIwIDQ4YzEzLTExIDI1LTE5IDQwLTI4IiBzdHJva2U9IiM0NTZhNDEiIHN0cm9rZS13aWR0aD0iMyIgZmlsbD0ibm9uZSIvPjwvZz48L3N2Zz4=")',size:'80px 70px'},
  {id:'dots',label:'• Stippen',bg:'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI3MCIgdmlld0JveD0iMCAwIDgwIDcwIj48ZyBvcGFjaXR5PSIwLjMyIiBzdHJva2U9Im5vbmUiPjxjaXJjbGUgY3g9IjIwIiBjeT0iMjAiIHI9IjUiIGZpbGw9IiNkOWI4NmEiLz48Y2lyY2xlIGN4PSI2MCIgY3k9IjUwIiByPSI1IiBmaWxsPSIjZDliODZhIi8+PGNpcmNsZSBjeD0iNTUiIGN5PSIxNSIgcj0iMyIgZmlsbD0iI2Q5Yjg2YSIvPjxjaXJjbGUgY3g9IjI1IiBjeT0iNTUiIHI9IjMiIGZpbGw9IiNkOWI4NmEiLz48L2c+PC9zdmc+")',size:'80px 70px'},
  {id:'burger',label:'🍔 Burgers',bg:'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI3MCIgdmlld0JveD0iMCAwIDgwIDcwIj48ZyBvcGFjaXR5PSIwLjMyIiBzdHJva2U9Im5vbmUiPjxyZWN0IHg9IjE4IiB5PSIyNSIgd2lkdGg9IjQ0IiBoZWlnaHQ9IjEwIiByeD0iNSIgZmlsbD0iI2Q3YTA1YiIvPjxyZWN0IHg9IjIwIiB5PSIzNiIgd2lkdGg9IjQwIiBoZWlnaHQ9IjYiIHJ4PSIyIiBmaWxsPSIjNmI4ZjRlIi8+PHJlY3QgeD0iMjAiIHk9IjQzIiB3aWR0aD0iNDAiIGhlaWdodD0iNyIgcng9IjIiIGZpbGw9IiNhOTRmM2UiLz48cGF0aCBkPSJNMTggMjNjMi0xMSAxMi0xNiAyMi0xNnMyMCA1IDIyIDE2eiIgZmlsbD0iI2Q3YTA1YiIvPjxyZWN0IHg9IjIyIiB5PSI1MSIgd2lkdGg9IjM2IiBoZWlnaHQ9IjYiIHJ4PSIyIiBmaWxsPSIjZTRiZDY1Ii8+PC9nPjwvc3ZnPg==")',size:'80px 70px'},
  {id:'fries',label:'🍟 Friet',bg:'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI3MCIgdmlld0JveD0iMCAwIDgwIDcwIj48ZyBvcGFjaXR5PSIwLjMyIiBzdHJva2U9Im5vbmUiPjxwYXRoIGQ9Ik0yNSAxN2w0IDI3TTM0IDE0bDMgMzBNNDMgMTRsLTEgMzBNNTIgMTdsLTQgMjciIHN0cm9rZT0iI2U0YmQ1ZSIgc3Ryb2tlLXdpZHRoPSI2IiBmaWxsPSJub25lIi8+PHBhdGggZD0iTTIyIDM3aDM2bC01IDIySDI3eiIgZmlsbD0iI2M4NWI0ZSIvPjwvZz48L3N2Zz4=")',size:'80px 70px'}
];
const BG_COLORS_EXTRA = ['#171310','#2a1c18','#17231d','#1b2430','#29201a','#30251e','#221b2d','#14272a','#31221d','#f0e5d1'];
function applyBgPattern(pattern){
  const root=document.documentElement.style, body=document.body;
  if(!pattern){ root.removeProperty('--bg-pattern'); body.classList.remove('pattern-active'); document.getElementById('info-bg-pattern')?.replaceChildren(document.createTextNode('Geen')); return; }
  const p=BG_PATTERNS.find(x=>x.id===pattern.id)||BG_PATTERNS.find(x=>x.id===pattern); if(!p)return;
  root.setProperty('--bg-pattern',p.bg); root.setProperty('--bg-pattern-size',p.size); body.style.backgroundSize=p.size; body.classList.add('pattern-active');
  const info=document.getElementById('info-bg-pattern'); if(info) info.textContent=p.label;
}
const patternPaletteEl=document.getElementById('pattern-palette');
if(patternPaletteEl){ patternPaletteEl.innerHTML=BG_PATTERNS.map(p=>`<button type="button" class="pattern-swatch" data-pattern="${p.id}" style="background-image:${p.bg};background-size:${p.size};"><span class="pattern-label">${p.label}</span></button>`).join(''); patternPaletteEl.querySelectorAll('.pattern-swatch').forEach(b=>b.addEventListener('click',()=>restRef.child('backgroundPattern').set(b.dataset.pattern).then(()=>closeModal('modal-bg-pattern')))); }
const patternDefault=document.getElementById('pattern-default'); if(patternDefault) patternDefault.addEventListener('click',()=>restRef.child('backgroundPattern').remove().then(()=>closeModal('modal-bg-pattern')));
restRef.child('backgroundPattern').on('value',snap=>{const v=snap.val(); applyBgPattern(v); patternPaletteEl?.querySelectorAll('.pattern-swatch').forEach(b=>b.classList.toggle('selected',b.dataset.pattern===v)); patternDefault?.classList.toggle('selected',!v);});
const btnBgPattern=document.getElementById('btn-bg-pattern'); if(btnBgPattern) btnBgPattern.addEventListener('click',()=>openModal('modal-bg-pattern'));

```