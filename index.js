(() => {
  const status = document.getElementById('status');
  const substatus = document.getElementById('substatus');
  const debug = document.getElementById('debug');

  function fail(title, text) {
    status.textContent = title;
    substatus.textContent = text;
  }

  async function resolveRestaurant(code) {
    const normalized = normalizeCode(code);
    if (!normalized) return null;

    const restaurants = db.ref('restaurants');

    // Eerst gericht zoeken op de echte veldnaam uit het restaurantsysteem.
    const fields = ['selfservicecode', 'selfServiceCode', 'selfserviceCode', 'self_service_code', 'selfservice-code'];
    for (const field of fields) {
      try {
        const snap = await restaurants.orderByChild(field).equalTo(code).once('value');
        if (snap.exists()) {
          const data = snap.val() || {};
          const id = Object.keys(data)[0];
          if (id) return id;
        }
      } catch (e) {
        console.warn('Gerichte zoekactie mislukt voor', field, e);
      }
    }

    // Fallback: eenmalig alle restaurantkeys lezen. Hiermee blijft het werken
    // wanneer in Firebase nog geen index voor selfservicecode staat.
    const allSnap = await restaurants.once('value');
    const all = allSnap.val() || {};
    for (const [id, restaurant] of Object.entries(all)) {
      if (!restaurant || typeof restaurant !== 'object') continue;
      const possible = [
        restaurant.selfservicecode,
        restaurant.selfServiceCode,
        restaurant.selfserviceCode,
        restaurant.self_service_code,
        restaurant['selfservice-code']
      ];
      if (possible.some((v) => normalizeCode(v) === normalized)) return id;
    }
    return null;
  }

  async function start() {
    const code = findFiveDigitCode();
    if (!code) {
      fail('QR-code zonder code', 'Deze zelfservice verwacht een 5-cijferige selfservicecode in de QR-link.');
      return;
    }
    try {
      status.textContent = 'Restaurant zoeken…';
      substatus.textContent = `Code ${code} wordt gecontroleerd in Firebase.`;
      const id = await resolveRestaurant(code);
      if (!id) {
        fail('Restaurant niet gevonden', `Geen restaurant gevonden met selfservicecode ${code}.`);
        return;
      }
      const target = `zelfservice.html?selfservicecode=${encodeURIComponent(code)}&restaurantId=${encodeURIComponent(id)}`;
      window.location.replace(target);
    } catch (e) {
      console.error(e);
      fail('Firebase-fout', 'De restaurants konden niet worden gelezen. Controleer de Realtime Database-regels.');
    }
  }

  document.addEventListener('DOMContentLoaded', start);
})();
