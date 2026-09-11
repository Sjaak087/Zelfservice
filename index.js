// index.js
// Dit is het startpunt. Elke restaurant-link wijst hierheen met ?restaurant=ID.
// Als het restaurant bestaat in Firebase, sturen we automatisch door naar de
// zelfservice van dat restaurant. Zonder (geldig) restaurant-ID tonen we een lijst.

document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');
  const substatusEl = document.getElementById('substatus');
  const lijstEl = document.getElementById('restaurant-lijst');

  const restaurantId = getQueryParam('restaurant');

  if (restaurantId) {
    try {
      const snap = await restaurantRef(restaurantId).once('value');
      if (snap.exists()) {
        // Restaurant gevonden via de link -> automatisch naar de zelfservice.
        window.location.replace('zelfservice.html?restaurant=' + encodeURIComponent(restaurantId));
        return;
      }
      statusEl.textContent = 'Restaurant niet gevonden';
      substatusEl.textContent = 'Deze link wijst naar een restaurant dat niet (meer) bestaat.';
    } catch (fout) {
      console.error(fout);
      statusEl.textContent = 'Kan geen verbinding maken';
      substatusEl.textContent = 'Controleer de internetverbinding en probeer het opnieuw.';
    }
    return;
  }

  // Geen restaurant in de link: toon een keuzelijst als vangnet.
  statusEl.textContent = 'Kies een restaurant';
  substatusEl.textContent = 'Open normaal gesproken de link van jouw restaurant om hier te komen.';

  try {
    const snap = await db.ref('restaurants').once('value');
    const restaurants = objectNaarArray(snap.val());
    lijstEl.classList.remove('verborgen');

    if (restaurants.length === 0) {
      lijstEl.innerHTML = '<p class="leeg-staat">Er zijn nog geen restaurants ingesteld in Firebase.</p>';
      return;
    }

    lijstEl.innerHTML = '';
    restaurants.forEach((restaurant) => {
      const a = document.createElement('a');
      a.className = 'restaurant-link';
      a.href = 'zelfservice.html?restaurant=' + encodeURIComponent(restaurant.id);
      a.textContent = restaurant.naam || restaurant.id;
      lijstEl.appendChild(a);
    });
  } catch (fout) {
    console.error(fout);
    substatusEl.textContent = 'Kon de lijst met restaurants niet ophalen.';
  }
});
