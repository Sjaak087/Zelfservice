// zelfservice.js
// De volledige bestelflow: tafel/bank kiezen -> product + opmerking kiezen -> bestellen.
// De bestelling wordt weggeschreven naar Firebase; het keukensysteem leest dat
// verderop uit. Daar hoeft deze pagina verder niets mee te doen.

let restaurantId = null;
let restaurant = null; // { naam, tafels: {...}, producten: {...} }
let gekozenTafel = null; // { id, naam, type }
let mandje = []; // [{ productId, naam, prijs, opmerking, aantal }]
let actieveModalProduct = null; // { id, naam, prijs, opmerkingen: [...] }
let modalAantal = 1;
let modalGekozenPreset = null;

document.addEventListener('DOMContentLoaded', async () => {
  restaurantId = getQueryParam('restaurant');

  if (!restaurantId) {
    window.location.replace('index.html');
    return;
  }

  try {
    const snap = await restaurantRef(restaurantId).once('value');
    if (!snap.exists()) {
      toonLaadFout('Dit restaurant bestaat niet (meer).');
      return;
    }
    restaurant = snap.val();
  } catch (fout) {
    console.error(fout);
    toonLaadFout('Kan geen verbinding maken met het restaurant.');
    return;
  }

  document.getElementById('restaurant-naam').textContent = restaurant.naam || 'Zelfservice';
  document.getElementById('laad-scherm').classList.add('verborgen');

  renderTafels();
  toonStap('tafel');
  koppelEvents();
});

function toonLaadFout(tekst) {
  const el = document.getElementById('laad-scherm');
  el.innerHTML = '<p>' + escapeHtml(tekst) + '</p>';
}

// ---------- Stappen / route ----------

function toonStap(stap) {
  ['tafel', 'menu', 'klaar'].forEach((naam) => {
    document.getElementById('stap-' + naam).classList.toggle('verborgen', naam !== stap);
  });
  document.querySelectorAll('.route [data-stap]').forEach((el) => {
    el.classList.toggle('actief', el.dataset.stap === stap);
  });
  document.getElementById('mandje-balk').classList.toggle('verborgen', !(stap === 'menu' && mandje.length > 0));
}

// ---------- Stap 1: tafel/bank ----------

function renderTafels() {
  const tafels = objectNaarArray(restaurant.tafels);
  const grid = document.getElementById('tafel-grid');

  if (tafels.length === 0) {
    grid.innerHTML = '<p class="leeg-staat">Er zijn nog geen tafels ingesteld voor dit restaurant.</p>';
    return;
  }

  grid.innerHTML = '';
  tafels.forEach((tafel) => {
    const btn = document.createElement('button');
    btn.className = 'tafel-knop';
    btn.innerHTML =
      '<span class="merk"></span>' +
      '<span class="naam">' + escapeHtml(tafel.naam || tafel.id) + '</span>' +
      '<span class="type">' + escapeHtml(tafel.type || 'tafel') + '</span>';
    btn.addEventListener('click', () => kiesTafel(tafel));
    grid.appendChild(btn);
  });
}

function kiesTafel(tafel) {
  gekozenTafel = tafel;
  renderMenu();
  toonStap('menu');
}

// ---------- Stap 2: menu ----------

function renderMenu() {
  const producten = objectNaarArray(restaurant.producten);
  const lijstEl = document.getElementById('menu-lijst');

  if (producten.length === 0) {
    lijstEl.innerHTML = '<p class="leeg-staat">Er staan nog geen producten op het menu.</p>';
    return;
  }

  // Groeperen per categorie, onbekende categorie onderaan onder "Overig".
  const groepen = {};
  producten.forEach((product) => {
    const categorie = product.categorie || 'Overig';
    if (!groepen[categorie]) groepen[categorie] = [];
    groepen[categorie].push(product);
  });

  lijstEl.innerHTML = '';
  Object.keys(groepen).forEach((categorie) => {
    const titel = document.createElement('div');
    titel.className = 'categorie-titel';
    titel.textContent = categorie;
    lijstEl.appendChild(titel);

    groepen[categorie].forEach((product) => {
      const rij = document.createElement('button');
      rij.className = 'product-rij';
      rij.innerHTML =
        '<span>' +
          '<span class="product-naam">' + escapeHtml(product.naam || '') + '</span>' +
          (product.omschrijving ? '<div class="product-omschrijving">' + escapeHtml(product.omschrijving) + '</div>' : '') +
        '</span>' +
        '<span class="product-prijs">' + formatPrijs(product.prijs) + '</span>';
      rij.addEventListener('click', () => openProductModal(product));
      lijstEl.appendChild(rij);
    });
  });
}

// ---------- Product modal ----------

function openProductModal(product) {
  actieveModalProduct = product;
  modalAantal = 1;
  modalGekozenPreset = null;

  document.getElementById('modaal-naam').textContent = product.naam || '';
  document.getElementById('modaal-prijs').textContent = formatPrijs(product.prijs);
  document.getElementById('modaal-opmerking-vrij').value = '';
  document.getElementById('modaal-aantal').textContent = '1';

  // Vooraf ingestelde opmerkingen (uit instellingen) alleen tonen als ze er zijn.
  const presetBlok = document.getElementById('modaal-preset-blok');
  const presetChips = document.getElementById('modaal-preset-chips');
  const presets = Array.isArray(product.opmerkingen) ? product.opmerkingen.filter(Boolean) : [];

  if (presets.length > 0) {
    presetBlok.classList.remove('verborgen');
    presetChips.innerHTML = '';
    presets.forEach((tekst) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = tekst;
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => {
        const alGekozen = modalGekozenPreset === tekst;
        modalGekozenPreset = alGekozen ? null : tekst;
        presetChips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
        if (!alGekozen) chip.setAttribute('aria-pressed', 'true');
      });
      presetChips.appendChild(chip);
    });
  } else {
    presetBlok.classList.add('verborgen');
  }

  document.getElementById('product-overlay').classList.remove('verborgen');
}

function sluitProductModal() {
  document.getElementById('product-overlay').classList.add('verborgen');
  actieveModalProduct = null;
}

function voegToeAanMandje() {
  if (!actieveModalProduct) return;

  const vrijeOpmerking = document.getElementById('modaal-opmerking-vrij').value.trim();
  const delen = [];
  if (modalGekozenPreset) delen.push(modalGekozenPreset);
  if (vrijeOpmerking) delen.push(vrijeOpmerking);

  mandje.push({
    productId: actieveModalProduct.id,
    naam: actieveModalProduct.naam || '',
    prijs: Number(actieveModalProduct.prijs) || 0,
    opmerking: delen.join(' · '),
    aantal: modalAantal
  });

  sluitProductModal();
  bijwerkenMandjeBalk();
}

// ---------- Mandje ----------

function mandjeTotaal() {
  return mandje.reduce((som, item) => som + item.prijs * item.aantal, 0);
}

function mandjeAantalItems() {
  return mandje.reduce((som, item) => som + item.aantal, 0);
}

function bijwerkenMandjeBalk() {
  const balk = document.getElementById('mandje-balk');
  const aantal = mandjeAantalItems();
  balk.classList.toggle('verborgen', aantal === 0);
  document.getElementById('mandje-aantal').textContent = aantal + (aantal === 1 ? ' item' : ' items');
  document.getElementById('mandje-totaal').textContent = formatPrijs(mandjeTotaal());
}

function openMandjeModal() {
  const itemsEl = document.getElementById('mandje-items');

  if (mandje.length === 0) {
    itemsEl.innerHTML = '<p class="leeg-staat">Je bestelling is nog leeg.</p>';
  } else {
    itemsEl.innerHTML = '';
    mandje.forEach((item, index) => {
      const rij = document.createElement('div');
      rij.className = 'mandje-item';
      rij.innerHTML =
        '<span>' +
          '<div class="mandje-item-naam">' + item.aantal + '× ' + escapeHtml(item.naam) + '</div>' +
          (item.opmerking ? '<div class="mandje-item-opmerking">' + escapeHtml(item.opmerking) + '</div>' : '') +
          '<button class="mandje-item-verwijder" data-index="' + index + '">Verwijderen</button>' +
        '</span>' +
        '<span class="mandje-item-prijs">' + formatPrijs(item.prijs * item.aantal) + '</span>';
      itemsEl.appendChild(rij);
    });
    itemsEl.querySelectorAll('.mandje-item-verwijder').forEach((btn) => {
      btn.addEventListener('click', () => {
        mandje.splice(Number(btn.dataset.index), 1);
        bijwerkenMandjeBalk();
        openMandjeModal();
      });
    });
  }

  document.getElementById('mandje-modaal-totaal').textContent = formatPrijs(mandjeTotaal());
  document.getElementById('bestelling-plaatsen-knop').disabled = mandje.length === 0;
  document.getElementById('mandje-overlay').classList.remove('verborgen');
}

function sluitMandjeModal() {
  document.getElementById('mandje-overlay').classList.add('verborgen');
}

async function plaatsBestelling() {
  if (mandje.length === 0) return;

  const knop = document.getElementById('bestelling-plaatsen-knop');
  knop.disabled = true;
  knop.textContent = 'Bezig met bestellen...';

  const bestelling = {
    tafelId: gekozenTafel ? gekozenTafel.id : null,
    tafelNaam: gekozenTafel ? (gekozenTafel.naam || gekozenTafel.id) : null,
    items: mandje.map((item) => ({
      productId: item.productId,
      naam: item.naam,
      prijs: item.prijs,
      aantal: item.aantal,
      opmerking: item.opmerking || ''
    })),
    totaal: mandjeTotaal(),
    status: 'nieuw',
    tijdstip: firebase.database.ServerValue.TIMESTAMP
  };

  try {
    await restaurantRef(restaurantId).child('bestellingen').push(bestelling);
    document.getElementById('klaar-tekst').textContent =
      'Je bestelling is doorgestuurd naar de keuken voor ' +
      (gekozenTafel ? (gekozenTafel.naam || gekozenTafel.id) : 'je plek') + '.';
    mandje = [];
    bijwerkenMandjeBalk();
    sluitMandjeModal();
    toonStap('klaar');
  } catch (fout) {
    console.error(fout);
    knop.disabled = false;
    knop.textContent = 'Bestelling plaatsen';
    alert('De bestelling kon niet worden verstuurd. Probeer het nog eens.');
  } finally {
    knop.textContent = 'Bestelling plaatsen';
  }
}

// ---------- Events ----------

function koppelEvents() {
  document.getElementById('modaal-sluiten').addEventListener('click', sluitProductModal);
  document.getElementById('product-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'product-overlay') sluitProductModal();
  });

  document.getElementById('modaal-min').addEventListener('click', () => {
    if (modalAantal > 1) modalAantal -= 1;
    document.getElementById('modaal-aantal').textContent = String(modalAantal);
  });
  document.getElementById('modaal-plus').addEventListener('click', () => {
    modalAantal += 1;
    document.getElementById('modaal-aantal').textContent = String(modalAantal);
  });
  document.getElementById('modaal-toevoegen').addEventListener('click', voegToeAanMandje);

  document.getElementById('mandje-openen-knop').addEventListener('click', openMandjeModal);
  document.getElementById('mandje-sluiten').addEventListener('click', sluitMandjeModal);
  document.getElementById('mandje-verder-knop').addEventListener('click', sluitMandjeModal);
  document.getElementById('mandje-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'mandje-overlay') sluitMandjeModal();
  });
  document.getElementById('bestelling-plaatsen-knop').addEventListener('click', plaatsBestelling);

  document.getElementById('nieuwe-bestelling-knop').addEventListener('click', () => {
    renderMenu();
    toonStap('menu');
  });
}
