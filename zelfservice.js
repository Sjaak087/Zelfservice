(() => {
  let restaurantId = new URLSearchParams(location.search).get('restaurantId') || '';
  let selfserviceCode = new URLSearchParams(location.search).get('selfservicecode') || findFiveDigitCode();
  let gekozenTafel = null;
  let restaurant = null;
  let tafels = {};
  let producten = {};
  let mandje = [];
  let actiefProduct = null;
  let aantal = 1;
  let opmerkingPreset = null;
  let timers = [];

  const $ = (id) => document.getElementById(id);
  const tableName = (t) => {
    const n = t.number ?? t.nummer ?? t.tableNumber ?? t.label ?? t.naam ?? t.name;
    return n !== undefined && n !== null && n !== '' ? (String(n).toLowerCase().startsWith('tafel') ? String(n) : `Tafel ${n}`) : 'Tafel';
  };
  const tableInfo = (t) => [t.kind || t.type, t.shape ? `Vorm: ${t.shape}` : '', t.seats ? `Plaatsen: ${t.seats}` : ''].filter(Boolean).join(' • ');

  function error(title, text, extra='') {
    $('status-titel').textContent = title;
    $('status-tekst').textContent = text;
    $('diagnostiek').textContent = extra;
    $('diagnostiek').classList.toggle('verborgen', !extra);
  }
  function hideLoader() { $('laad-scherm').classList.add('verborgen'); }

  function showStep(step) {
    ['tafel','menu','klaar'].forEach(s => $('stap-'+s).classList.toggle('verborgen', s !== step));
    document.querySelectorAll('.route-knop').forEach(btn => {
      const s = btn.dataset.stap;
      btn.classList.toggle('actief', s === step);
      btn.disabled = s === 'menu' ? !gekozenTafel : s === 'klaar';
    });
    $('mandje-balk').classList.toggle('verborgen', step !== 'menu' || mandje.length === 0);
  }

  function renderTables() {
    const grid = $('tafel-grid');
    const list = values(tafels).filter(t => t && typeof t === 'object' && isVisibleValue(t.visible ?? true))
      .filter(t => !['bank','bench','stoel','chair','sofa','seat'].includes(String(t.kind || t.type || '').toLowerCase()))
      .sort((a,b) => (Number(a.number) || 999999) - (Number(b.number) || 999999));
    if (!list.length) {
      grid.innerHTML = '<p class="leeg-staat">Geen tafels gevonden onder floorplan/tables.</p>';
      return;
    }
    grid.innerHTML = '';
    for (const t of list) {
      const btn = document.createElement('button');
      btn.className = 'tafel-knop';
      btn.innerHTML = `<span class="naam">${esc(tableName(t))}</span><span class="type">${esc(tableInfo(t) || 'Tafel')}</span>`;
      btn.addEventListener('click', () => { gekozenTafel = t; renderMenu(); showStep('menu'); });
      grid.appendChild(btn);
    }
  }

  function renderMenu() {
    const list = $('menu-lijst');
    const arr = values(producten).filter(p => p && typeof p === 'object')
      .filter(p => p.actief !== false && p.active !== false && p.disabled !== true && p.hidden !== true);
    if (!arr.length) { list.innerHTML = '<p class="leeg-staat">Geen producten gevonden onder products.</p>'; return; }
    const groups = {};
    arr.forEach(p => { const c = p.categorie || p.category || p.categoryName || p.group || 'Overig'; (groups[c] ||= []).push(p); });
    list.innerHTML = '';
    for (const [cat, items] of Object.entries(groups)) {
      const h = document.createElement('div'); h.className = 'categorie-titel'; h.textContent = cat; list.appendChild(h);
      items.forEach(p => {
        const b = document.createElement('button'); b.className='product-rij';
        b.innerHTML = `<span><span class="product-naam">${esc(p.naam || p.name || p.title || 'Product')}</span>${p.omschrijving || p.description ? `<div class="product-omschrijving">${esc(p.omschrijving || p.description)}</div>` : ''}</span><span class="product-prijs">${price(p.prijs ?? p.price)}</span>`;
        b.addEventListener('click', () => openProduct(p)); list.appendChild(b);
      });
    }
  }

  function openProduct(p) {
    actiefProduct=p; aantal=1; opmerkingPreset=null;
    $('modaal-naam').textContent=p.naam || p.name || p.title || '';
    $('modaal-prijs').textContent=price(p.prijs ?? p.price);
    $('modaal-aantal').textContent='1'; $('modaal-opmerking-vrij').value='';
    const presets = Array.isArray(p.opmerkingen) ? p.opmerkingen.filter(Boolean) : [];
    const block = $('modaal-preset-blok'), chips = $('modaal-preset-chips'); chips.innerHTML='';
    block.classList.toggle('verborgen', !presets.length);
    presets.forEach(text => { const c=document.createElement('button'); c.className='chip'; c.type='button'; c.textContent=text; c.onclick=()=>{opmerkingPreset=opmerkingPreset===text?null:text; document.querySelectorAll('.chip').forEach(x=>x.setAttribute('aria-pressed','false')); c.setAttribute('aria-pressed', opmerkingPreset===text?'true':'false');}; chips.appendChild(c); });
    $('product-overlay').classList.remove('verborgen');
  }
  function closeProduct(){ $('product-overlay').classList.add('verborgen'); actiefProduct=null; }
  function addToCart(){
    if(!actiefProduct) return;
    const notes=[]; if(opmerkingPreset) notes.push(opmerkingPreset); const free=$('modaal-opmerking-vrij').value.trim(); if(free) notes.push(free);
    mandje.push({productId:actiefProduct.id, naam:actiefProduct.naam||actiefProduct.name||actiefProduct.title||'Product', prijs:Number(actiefProduct.prijs??actiefProduct.price)||0, aantal, opmerking:notes.join(' · ')});
    closeProduct(); updateCart();
  }
  function cartTotal(){ return mandje.reduce((s,i)=>s+i.prijs*i.aantal,0); }
  function cartCount(){ return mandje.reduce((s,i)=>s+i.aantal,0); }
  function updateCart(){ $('mandje-aantal').textContent=`${cartCount()} ${cartCount()===1?'item':'items'}`; $('mandje-totaal').textContent=price(cartTotal()); $('mandje-balk').classList.toggle('verborgen', cartCount()===0); }
  function openCart(){
    const box=$('mandje-items'); box.innerHTML='';
    mandje.forEach((i,idx)=>{ const row=document.createElement('div'); row.className='mandje-item'; row.innerHTML=`<span><div class="mandje-item-naam">${i.aantal}× ${esc(i.naam)}</div>${i.opmerking?`<div class="mandje-item-opmerking">${esc(i.opmerking)}</div>`:''}<button class="mandje-item-verwijder">Verwijderen</button></span><span class="mandje-item-prijs">${price(i.prijs*i.aantal)}</span>`; row.querySelector('button').onclick=()=>{mandje.splice(idx,1);updateCart();openCart();}; box.appendChild(row); });
    $('mandje-modaal-totaal').textContent=price(cartTotal()); $('bestelling-plaatsen-knop').disabled=!mandje.length; $('mandje-overlay').classList.remove('verborgen');
  }
  function closeCart(){ $('mandje-overlay').classList.add('verborgen'); }

  async function placeOrder(){
    if(!mandje.length || !gekozenTafel) return;
    const btn=$('bestelling-plaatsen-knop'); btn.disabled=true; btn.textContent='Bestelling plaatsen…';
    const order={tafelId:gekozenTafel.id, tafelNaam:tableName(gekozenTafel), items:mandje.map(i=>({productId:i.productId,naam:i.naam,prijs:i.prijs,aantal:i.aantal,opmerking:i.opmerking||''})), totaal:cartTotal(), status:'nieuw', tijdstip:firebase.database.ServerValue.TIMESTAMP};
    try { await restaurantRef(restaurantId).child('bestellingen').push(order); $('klaar-tekst').textContent=`Bestelling doorgestuurd voor ${tableName(gekozenTafel)}.`; mandje=[]; updateCart(); closeCart(); showStep('klaar'); }
    catch(e){ console.error(e); alert('Bestelling plaatsen mislukt. Controleer de Firebase-regels voor bestellingen.'); }
    finally { btn.disabled=false; btn.textContent='Bestelling plaatsen'; }
  }

  async function findRestaurantByCode(code) {
    const clean = normalizeCode(code);
    if (!clean) return null;

    // Query Firebase directly instead of reading the entire /restaurants tree.
    // This is important when Firebase rules do not allow a full collection read.
    const fieldNames = ['selfservicecode', 'selfServiceCode', 'selfserviceCode', 'selfServicecode'];
    for (const field of fieldNames) {
      try {
        const snap = await db.ref('restaurants')
          .orderByChild(field)
          .equalTo(clean)
          .limitToFirst(1)
          .once('value');
        if (snap.exists()) {
          const data = snap.val() || {};
          const first = Object.entries(data)[0];
          if (first) return { id: first[0], data: first[1] || {} };
        }
      } catch (e) {
        console.warn(`Query op ${field} failed`, e);
      }
    }

    // Fallback for databases where the code is stored as a number.
    const numeric = Number(clean);
    if (Number.isFinite(numeric)) {
      for (const field of fieldNames) {
        try {
          const snap = await db.ref('restaurants')
            .orderByChild(field)
            .equalTo(numeric)
            .limitToFirst(1)
            .once('value');
          if (snap.exists()) {
            const data = snap.val() || {};
            const first = Object.entries(data)[0];
            if (first) return { id: first[0], data: first[1] || {} };
          }
        } catch (e) {
          console.warn(`Numeric query ${field} failed`, e);
        }
      }
    }
    return null;
  }

  async function load() {
    $('diagnostiek').textContent = 'Verbinden met Firebase…';
    $('diagnostiek').classList.remove('verborgen');

    if (!restaurantId && selfserviceCode) {
      const found = await findRestaurantByCode(selfserviceCode);
      if (found) {
        restaurantId = found.id;
        restaurant = found.data;
      }
    }

    if (!restaurantId) {
      hideLoader();
      error(
        'Restaurant niet gevonden',
        selfserviceCode
          ? `Geen restaurant gevonden met selfservicecode ${selfserviceCode}.`
          : 'Geen 5-cijferige selfservicecode gevonden in de QR-link.',
        'Controleer dat de QR-link de 5-cijferige selfservicecode bevat en dat /restaurants/*/selfservicecode leesbaar is in Firebase.'
      );
      return;
    }

    const ref = restaurantRef(restaurantId);

    // Metadata is helpful but must never block the tables/menu listeners.
    try {
      const snap = await ref.once('value');
      if (snap.exists()) {
        restaurant = snap.val() || restaurant || {};
        $('restaurant-naam').textContent = restaurant.naam || restaurant.name || 'Zelfservice';
      }
    } catch (e) {
      console.warn('Restaurant metadata unavailable; continuing with child nodes.', e);
      $('restaurant-naam').textContent = 'Zelfservice';
    }

    // Tables: exact structure from the restaurant system:
    // /restaurants/{id}/floorplan/tables/{firebaseTableKey}
    ref.child('floorplan/tables').on('value', snap => {
      const raw = snap.val();
      tafels = raw || {};
      console.log('Zelfservice tables loaded:', raw);
      renderTables();
      hideLoader();
      $('diagnostiek').textContent = `${values(tafels).length} tafelobject(en) geladen.`;
      $('diagnostiek').classList.remove('verborgen');
    }, err => {
      console.error('tables', err);
      hideLoader();
      error('Tafels konden niet worden geladen', 'Firebase blokkeert de toegang tot floorplan/tables.', String(err));
    });

    // Products
    ref.child('products').on('value', snap => {
      producten = snap.val() || {};
      console.log('Zelfservice products loaded:', snap.val());
      if (gekozenTafel) renderMenu();
    }, err => {
      console.error('products', err);
      // Products may be unavailable while tables still work; do not keep the page loading.
      producten = {};
    });

    // Safety timeout so the page can never be stuck forever on the loader.
    setTimeout(() => {
      if (!$('laad-scherm').classList.contains('verborgen')) {
        hideLoader();
        error(
          'Laden duurt te lang',
          'Firebase antwoordt niet op tijd.',
          `Restaurant: ${restaurantId || 'onbekend'} • code: ${selfserviceCode || 'geen'}\nControleer Firebase Database Rules en de URL van de QR-code.`
        );
      }
    }, 8000);

    showStep('tafel');
  }

  function wire(){
    document.querySelectorAll('.route-knop').forEach(btn=>btn.onclick=()=>{ if(btn.dataset.stap==='tafel'){showStep('tafel');renderTables();} if(btn.dataset.stap==='menu'&&gekozenTafel){showStep('menu');renderMenu();} });
    $('modaal-sluiten').onclick=closeProduct; $('product-overlay').onclick=e=>{if(e.target.id==='product-overlay')closeProduct();};
    $('modaal-min').onclick=()=>{aantal=Math.max(1,aantal-1);$('modaal-aantal').textContent=aantal}; $('modaal-plus').onclick=()=>{$('modaal-aantal').textContent=++aantal}; $('modaal-toevoegen').onclick=addToCart;
    $('mandje-openen-knop').onclick=openCart; $('mandje-sluiten').onclick=closeCart; $('mandje-verder-knop').onclick=closeCart; $('mandje-overlay').onclick=e=>{if(e.target.id==='mandje-overlay')closeCart()}; $('bestelling-plaatsen-knop').onclick=placeOrder;
    $('nieuwe-bestelling-knop').onclick=()=>{showStep('menu');renderMenu();};
  }

  document.addEventListener('DOMContentLoaded', async()=>{
    try { wire(); await load(); }
    catch(e){ console.error(e); error('Startfout','De zelfservice kon niet starten.', String(e)); }
  });
})();
