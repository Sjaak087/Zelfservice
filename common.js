function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function normalizeCode(value) {
  return String(value ?? '').replace(/[^0-9A-Za-z]/g, '').trim();
}

function findFiveDigitCode() {
  const candidates = [];
  const params = new URLSearchParams(window.location.search);
  ['selfservicecode','selfServiceCode','code','joinCode','joincode','join','restaurantCode','restaurantcode','c'].forEach((key) => {
    const v = params.get(key);
    if (v) candidates.push(v);
  });
  candidates.push(window.location.hash || '');
  candidates.push(window.location.pathname || '');
  const segments = String(window.location.pathname || '').split('/').filter(Boolean);
  if (segments.length) candidates.push(segments[segments.length - 1]);
  candidates.push(window.location.search || '');
  for (const raw of candidates) {
    const match = String(raw).match(/(^|[^0-9])([0-9]{5})(?![0-9])/);
    if (match) return match[2];
  }
  return '';
}

function esc(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function price(value) {
  return '€ ' + (Number(value) || 0).toFixed(2).replace('.', ',');
}

function values(node) {
  if (!node) return [];
  if (Array.isArray(node)) {
    return node.map((value, index) => ({ id: String(index), ...(value && typeof value === 'object' ? value : { value }) }));
  }
  if (typeof node !== 'object') return [];
  return Object.entries(node).map(([id, value]) => ({ id, ...(value && typeof value === 'object' ? value : { value }) }));
}

function restaurantRef(id) {
  return db.ref(`restaurants/${id}`);
}

function isVisibleValue(value) {
  if (value === false || value === 0) return false;
  const s = String(value ?? '').toLowerCase();
  return !['false', '0', 'hidden', 'invisible', 'disabled'].includes(s);
}
