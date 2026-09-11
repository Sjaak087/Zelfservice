// instellingen.js
// Beheerpagina voor een restaurant-eigenaar: tafels/banken en producten instellen,
// inclusief de vaste opmerkingen per product die in de zelfservice verschijnen.

let huidigRestaurantId = null;

document.addEventListener('DOMContentLoaded', () => {
  const idVeld = document.getElementById('restaurant-id-veld');
  const idUitUrl = getQueryParam('restaurant');
  if (idUitUrl) idVeld.value = idUitUrl;

  document.getElementById('restaurant-laden-knop').addEventListener('click', laadOfMaakRestaurant);
  document.getElementById('tafel-toevoegen-knop').addEventListener('click', voegTafelToe);
  document.getElementById('product-toevoegen-knop').addEventListener('click', voegProductToe);
  document.getElementById('link-kopieren-knop').addEventListener('click', kopieerLink);

  if (idUitUrl) laadOfMaakRestaurant();
});

async function laadOfMaakRestaurant() {
  const meldingEl = document.getElementById('melding-algemeen');
  const id = document.getElementById('restaurant-id-veld').value.trim();
  const naamInvoer = document.getElementById('restaurant-naam-veld').value.trim();

  if (!id) {
    toonMelding(meldingEl, 'Vul eerst een restaurant-ID in.', 'fout');
    return;
  }

  huidigRestaurantId = id;
  verbergMelding(meldingEl);

  try {
    const snap = await restaurantRef(id).once('value');

    if (!snap.exists()) {
      await restaurantRef(id).set({
        naam: naamInvoer || id,
        tafels: {},
        producten: {}
      });
      toonMelding(meldingEl, 'Nieuw restaurant "' + (naamInvoer || id) + '" aangemaakt.', 'ok');
    } else if (naamInvoer && naamInvoer !== snap.val().naam) {
      await restaurantRef(id).child('naam').set(naamInvoer);
    }

    document.getElementById('beheer-blok').classList.remove('verborgen');
    const link = window.location.origin + window.location.pathname.replace('instellingen.html', 'zelfservice.html') + '?restaurant=' + encodeURIComponent(id);
    document.getElementById('zelfservice-link-veld').value = link;

    laadTafels();
    laadProducten();
  } catch (fout) {
    console.error(fout);
    toonMelding(meldingEl, 'Kon het restaurant niet laden of aanmaken.', 'fout');
  }
}

function kopieerLink() {
  const veld = document.getElementById('zelfservice-link-veld');
  veld.select();
  navigator.clipboard && navigator.clipboard.writeText(veld.value).catch(() => {});
}

// ---------- Tafels ----------

function laadTafels() {
  restaurantRef(huidigRestaurantId).child('tafels').on('value', (snap) => {
    const tafels = objectNaarArray(snap.val());
    const lijstEl = document.getElementById('tafel-lijst');

    if (tafels.length === 0) {
      lijstEl.innerHTML = '<p class="leeg-staat">Nog geen tafels of banken toegevoegd.</p>';
      return;
    }

    lijstEl.innerHTML = '';
    tafels.forEach((tafel) => {
      const rij = document.createElement('div');
      rij.className = 'lijst-item';
      rij.innerHTML =
        '<span>' +
          '<div class="lijst-item-titel">' + escapeHtml(tafel.naam || tafel.id) + '</div>' +
          '<div class="lijst-item-sub">' + escapeHtml(tafel.type || 'tafel') + '</div>' +
        '</span>' +
        '<button class="klein-knop verwijder" data-id="' + tafel.id + '">Verwijderen</button>';
      rij.querySelector('.verwijder').addEventListener('click', () => verwijderTafel(tafel.id));
      lijstEl.appendChild(rij);
    });
  });
}

async function voegTafelToe() {
  const naam = document.getElementById('nieuwe-tafel-naam').value.trim();
  const type = document.getElementById('nieuwe-tafel-type').value;

  if (!naam) return;

  await restaurantRef(huidigRestaurantId).child('tafels').push({ naam, type });
  document.getElementById('nieuwe-tafel-naam').value = '';
}

function verwijderTafel(id) {
  restaurantRef(huidigRestaurantId).child('tafels').child(id).remove();
}

// ---------- Producten ----------

function laadProducten() {
  restaurantRef(huidigRestaurantId).child('producten').on('value', (snap) => {
    const producten = objectNaarArray(snap.val());
    const lijstEl = document.getElementById('product-lijst');

    if (producten.length === 0) {
      lijstEl.innerHTML = '<p class="leeg-staat">Nog geen producten toegevoegd.</p>';
      return;
    }

    lijstEl.innerHTML = '';
    producten.forEach((product) => {
      const opmerkingenTekst = Array.isArray(product.opmerkingen) && product.opmerkingen.length > 0
        ? 'Opmerkingen: ' + product.opmerkingen.join(', ')
        : 'Geen vaste opmerkingen';

      const rij = document.createElement('div');
      rij.className = 'lijst-item';
      rij.innerHTML =
        '<span>' +
          '<div class="lijst-item-titel">' + escapeHtml(product.naam || '') + ' — ' + formatPrijs(product.prijs) + '</div>' +
          '<div class="lijst-item-sub">' + escapeHtml(product.categorie || 'Overig') + ' · ' + escapeHtml(opmerkingenTekst) + '</div>' +
        '</span>' +
        '<button class="klein-knop verwijder" data-id="' + product.id + '">Verwijderen</button>';
      rij.querySelector('.verwijder').addEventListener('click', () => verwijderProduct(product.id));
      lijstEl.appendChild(rij);
    });
  });
}

async function voegProductToe() {
  const naam = document.getElementById('nieuw-product-naam').value.trim();
  const prijs = parseFloat(document.getElementById('nieuw-product-prijs').value);
  const categorie = document.getElementById('nieuw-product-categorie').value.trim() || 'Overig';
  const omschrijving = document.getElementById('nieuw-product-omschrijving').value.trim();
  const opmerkingenRuw = document.getElementById('nieuw-product-opmerkingen').value.trim();

  if (!naam || isNaN(prijs)) return;

  const opmerkingen = opmerkingenRuw
    ? opmerkingenRuw.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const product = { naam, prijs, categorie };
  if (omschrijving) product.omschrijving = omschrijving;
  if (opmerkingen.length > 0) product.opmerkingen = opmerkingen;

  await restaurantRef(huidigRestaurantId).child('producten').push(product);

  document.getElementById('nieuw-product-naam').value = '';
  document.getElementById('nieuw-product-prijs').value = '';
  document.getElementById('nieuw-product-categorie').value = '';
  document.getElementById('nieuw-product-omschrijving').value = '';
  document.getElementById('nieuw-product-opmerkingen').value = '';
}

function verwijderProduct(id) {
  restaurantRef(huidigRestaurantId).child('producten').child(id).remove();
}
