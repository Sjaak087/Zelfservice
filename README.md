# Restaurant Zelfservice

De zelfservice bepaalt het restaurant uitsluitend uit de geopende QR-link.

Ondersteunde links:
- `https://jouwdomein.nl/?restaurant=restaurant-id`
- `https://jouwdomein.nl/restaurant/restaurant-id`
- `https://jouwdomein.nl/zelfservice/restaurant-id`

Er is geen restaurantkeuze in de app. Producten, tafels en overige restaurantgegevens worden live uit Firebase Realtime Database gelezen onder `restaurants/<restaurant-id>`.
