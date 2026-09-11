# Zelfservice bestelsysteem

Een kant-en-klare website (puur HTML/CSS/JS, geen build-tools nodig) die je op
GitHub Pages kunt zetten. Gasten openen de link van hún restaurant, het systeem
herkent automatisch welk restaurant dat is, en ze kunnen daarna hun tafel of
bank kiezen en producten bestellen — inclusief opmerkingen. Tafels, producten,
opmerkingen en restaurantgegevens worden rechtstreeks en live uit Firebase
Realtime Database geladen. Er is geen lokale productlijst en geen instellingen-
of beheerpagina in de site; beheer doe je in Firebase.

## Bestanden

```
index.html             Startpunt: herkent het restaurant uit de link en stuurt door
zelfservice.html        De bestelflow zelf (tafel kiezen -> menu -> bestellen)
css/style.css            Alle opmaak
js/firebase-config.js     Jouw Firebase-gegevens (al ingevuld)
js/common.js               Gedeelde hulpfuncties
js/index.js                 Logica voor index.html
js/zelfservice.js           Logica voor zelfservice.html
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

De site leest dit rechtstreeks uit Firebase, dus zo moeten de gegevens erin
staan:

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

- **`opmerkingen`** op een product zijn de vaste keuzes (bijv. "Zonder ui").
  Ze verschijnen in de zelfservice alleen bij producten waar dit veld daadwerkelijk aanwezig is — een product zonder `opmerkingen` toont dat blok
  gewoon niet. Daarnaast kan de gast altijd zelf iets vrij typen; beide worden
  gecombineerd opgeslagen in `items[].opmerking`.
- **`bestellingen`** is precies de plek waar jouw keukensysteem naar kan
  luisteren (bijv. met `db.ref('restaurants/ID/bestellingen').on('child_added', ...)`).
  Deze website schrijft alleen weg naar dat pad — verder hoeft de zelfservice
  daar niets mee te doen, zoals gevraagd.

## Restaurant, tafels en producten toevoegen (via Firebase Console)

1. Open de [Firebase Console](https://console.firebase.google.com/) →
   je project (`restaurant-het-goedkoop`) → **Realtime Database**.
2. Maak onder `restaurants` een nieuw kind aan met het restaurant-ID dat je in
   de link wilt gebruiken, bijv. `restaurant-het-goedkoop`, met daarin een
   veld `naam`.
3. Voeg daaronder `tafels` toe: voor elke tafel/bank een nieuw kind met
   `naam` (bijv. "Tafel 4") en `type` (`tafel` of `bank`).
4. Voeg daaronder `producten` toe: voor elk product een nieuw kind met
   `naam`, `prijs`, `categorie`, optioneel `omschrijving`, en optioneel
   `opmerkingen` als lijst van teksten.
5. De link naar de zelfservice van dat restaurant is dan:
   `zelfservice.html?restaurant=restaurant-het-goedkoop`.

Je kunt dit ook sneller invoeren via de **Import JSON**-knop in de Firebase
Console (rechtsboven bij Realtime Database), waarmee je in één keer een heel
restaurant met tafels en producten kunt plakken volgens de structuur hierboven.

## Firebase-toegangsregels (belangrijk)

Met de meegeleverde `firebaseConfig` kan *iedereen die de website bezoekt* bij
de database. Voor een eerste test is dat prima, maar zet voordat je live
gaat op zijn minst regels die schrijven naar `bestellingen` toestaan, en
`tafels`/`producten` alleen laten lezen (niet schrijven) vanaf de website —
die beheer je toch al zelf via de Console. Een eenvoudig startpunt in de
Firebase-console onder **Realtime Database → Rules**:

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

Pas dit aan naar jouw situatie (bijvoorbeeld strenger op leesrechten, of met
authenticatie als je het beheer verder wilt afschermen).

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

- De keukenkant (het systeem dat `bestellingen` uitleest en verwerkt) valt
  buiten deze levering, zoals gevraagd — deze site schrijft alleen de juiste
  gegevens naar het juiste pad.
