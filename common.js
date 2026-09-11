// common.js
// Kleine hulpfuncties die op elke pagina worden gebruikt.

function getQueryParam(naam) {
  const params = new URLSearchParams(window.location.search);
  return params.get(naam);
}

function formatPrijs(bedrag) {
  const getal = Number(bedrag) || 0;
  return '€ ' + getal.toFixed(2).replace('.', ',');
}

function escapeHtml(tekst) {
  const div = document.createElement('div');
  div.textContent = tekst == null ? '' : String(tekst);
  return div.innerHTML;
}

// Zet een Firebase-object (of null) om naar een array van {id, ...waarden},
// op volgorde van eventueel aanwezig veld "volgorde", anders op naam.
function objectNaarArray(obj) {
  if (!obj) return [];
  return Object.keys(obj).map((id) => Object.assign({ id }, obj[id]));
}

function toonMelding(container, tekst, type) {
  if (!container) return;
  container.textContent = tekst;
  container.className = 'melding ' + (type === 'fout' ? 'fout' : 'ok');
  container.classList.remove('verborgen');
}

function verbergMelding(container) {
  if (!container) return;
  container.classList.add('verborgen');
}

// Referentie naar een restaurant in de database.
function restaurantRef(restaurantId) {
  return db.ref('restaurants/' + restaurantId);
}
