# Restaurant zelfservice

GitHub Pages app voor de zelfservice.

## Firebase structuur

De app verwacht per restaurant:

```text
restaurants/
  <restaurantId>/
    selfservicecode: "12345"
    naam: "Restaurantnaam"
    floorplan/
      tables/
        <firebaseTableKey>/
          kind: "tafel"
          number: 1
          shape: "rond"
          x: 19.46
          y: 21.37
    products/
      <productId>/
        naam: "..."
        prijs: 12.50
        categorie: "..."
```

De QR-link moet een 5-cijferige `selfservicecode` bevatten. De app zoekt daarmee het restaurant op. Er is geen restaurantkeuze.

## GitHub Pages

Zet deze bestanden in de root van de repository:

- `index.html`
- `zelfservice.html`
- `404.html`
- `css/style.css`
- `js/firebase-config.js`
- `js/common.js`
- `js/index.js`
- `js/zelfservice.js`
