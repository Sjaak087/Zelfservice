# Zelfservice bestelsysteem

Een kant-en-klare website (puur HTML/CSS/JS, geen build-tools nodig) die je op
GitHub Pages kunt zetten. Gasten openen de link van hún restaurant, het systeem
herkent automatisch welk restaurant dat is, en ze kunnen daarna hun tafel of
bank kiezen en producten bestellen — inclusief opmerkingen.

## Bestanden

```
index.html          Startpunt: herkent het restaurant uit de link en stuurt door
zelfservice.html     De bestelflow zelf (tafel kiezen -> menu -> bestellen)
instellingen.html    Beheerpagina: tafels/banken en producten instellen
css/style.css        Alle opmaak
js/firebase-config.js  Jouw Firebase-gegevens (al ingevuld)
js/common.js          Gedeelde hulpfuncties
js/index.js            Logica voor index.html
js/zelfservice.js      Logica voor zelfservice.html
js/instellingen.js     Logica voor instellingen.html
```

## Hoe de restaurant-herkenning werkt

Elke link naar een restaurant ziet er zo uit:

```
https://jouwgebruikersnaam.github.io/jouw-repo/?restaurant=restaurant-het-goedkoop
```

`index.html` leest het stukje `?restaurant=...` uit de link, zoekt dat ID op
in Firebase onder `restaurants/restaurant-het-goedkoop`, en stuurt de bezoeker
automatisch door naar:

```
zelfservice.html?restaurant=restaurant-het-goedkoop
```

Bestaat het restaurant niet, dan krijgt de bezoeker een duidelijke melding.
Wordt de site zonder `?restaurant=...` geopend, dan toont hij een lijstje van
alle restaurants die in Firebase staan (handig vangnet, bijvoorbeeld als je de
hoofdlink deelt in plaats van een specifieke restaurantlink).

Je kunt de link naar `zelfservice.html?restaurant=...` ook direct gebruiken
(bijvoorbeeld in een QR-code) — dat werkt net zo goed en is zelfs één stap
sneller.

## Databasestructuur (Firebase Realtime Database)

```
restaurants/
  restaurant-het-goedkoop/
    naam: "Restaurant Het Goedkoop"
    tafels/
      -Nabc123: { naam: "Tafel 1", type: "tafel" }
      -Nabc124: { naam: "Bank 1",  type: "bank" }
    producten/
      -Nabc200: {
        naam: "Cheeseburger",
        prijs: 8.5,
        categorie: "Hoofdgerecht",
        omschrijving: "Met friet en salade",
        opmerkingen: ["Zonder ui", "Extra kaas", "Goed doorbakken"]
      }
    bestellingen/
      -Nabc300: {
        tafelId: "-Nabc123",
        tafelNaam: "Tafel 1",
        items: [
          { productId: "-Nabc200", naam: "Cheeseburger", prijs: 8.5, aantal: 2, opmerking: "Zonder ui" }
        ],
        totaal: 17,
        status: "nieuw",
        tijdstip: 1234567890123
      }
```

- **`opmerkingen`** op een product zijn de vaste keuzes die je in
  **instellingen.html** instelt (bijv. "Zonder ui"). Ze verschijnen in de
  zelfservice alleen bij producten waar ze daadwerkelijk zijn ingesteld — een
  product zonder `opmerkingen` toont dat blok gewoon niet. Daarnaast kan de
  gast altijd zelf iets vrij typen; beide worden gecombineerd opgeslagen in
  `items[].opmerking`.
- **`bestellingen`** is precies de plek waar jouw keukensysteem naar kan
  luisteren (bijv. met `db.ref('restaurants/ID/bestellingen').on('child_added', ...)`).
  Deze website schrijft alleen weg naar dat pad — verder hoeft de zelfservice
  daar niets mee te doen, zoals gevraagd.

## Beheer: restaurant, tafels en producten instellen

Open `instellingen.html` (evt. met `?restaurant=restaurant-het-goedkoop` erbij
zodat het meteen invult):

1. Vul het restaurant-ID en de naam in en klik op **Laden / aanmaken**. Bestaat
   het ID nog niet in Firebase, dan wordt het automatisch aangemaakt.
2. Voeg tafels/banken toe onder **Tafels & banken**.
3. Voeg producten toe onder **Menu & producten**, met optioneel vaste
   opmerkingen (komma-gescheiden).
4. Bovenaan bij **Link naar de zelfservice** vind je de kant-en-klare link die
   je kunt delen of in een QR-code kunt zetten.

Deze pagina is bewust simpel gehouden (geen login) zodat je snel aan de slag
kunt. Zie de opmerking hieronder over toegang als je dit met meerdere mensen
of publiek gebruikt.

## Firebase-toegangsregels (belangrijk)

Met de meegeleverde `firebaseConfig` kan *iedereen die de website bezoekt* bij
de database. Voor een eerste test is dat prima, maar zet voordat je live
gaat op zijn minst regels die schrijven naar `bestellingen` toestaan, maar
`tafels`/`producten` alleen laten wijzigen door wie de beheerpagina mag
gebruiken (bijv. met Firebase Authentication) of houd die instellingen alvast
alleen bij jezelf. Een eenvoudig startpunt in de Firebase-console onder
**Realtime Database → Rules**:

```json
{
  "rules": {
    "restaurants": {
      "$restaurantId": {
        "bestellingen": {
          ".read": true,
          ".write": true
        },
        ".read": true,
        ".write": false
      }
    }
  }
}
```

Pas dit aan naar jouw situatie (bijvoorbeeld strenger, of met authenticatie
voor `instellingen.html`).

## Publiceren op GitHub Pages

1. Maak een nieuwe (of gebruik een bestaande) GitHub-repository en upload alle
   bestanden uit deze zip, met de mapstructuur intact.
2. Ga naar **Settings → Pages** in de repository.
3. Kies bij **Source** de branch (meestal `main`) en map `/ (root)`.
4. Sla op — na een minuutje is de site bereikbaar op
   `https://jouwgebruikersnaam.github.io/jouw-repo/`.
5. Maak per restaurant een link zoals hierboven beschreven en deel die (of zet
   hem in een QR-code op tafel).

## Kanttekeningen

- Er is geen inlog op `instellingen.html` — iedereen met de link kan tafels en
  producten aanpassen. Voeg gerust een wachtwoordscherm of Firebase
  Authentication toe als dat nodig is.
- De keukenkant (het systeem dat `bestellingen` uitleest en verwerkt) valt
  buiten deze levering, zoals gevraagd — deze site schrijft alleen de juiste
  gegevens naar het juiste pad.
