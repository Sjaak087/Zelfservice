# Restaurant zelfservice

De zelfservice gebruikt de 5-cijferige `selfservicecode` die per restaurant onder `restaurants` in Firebase staat.

Werking:
1. QR/link opent deze pagina.
2. De pagina haalt de 5-cijferige code uit query/hash/path/URL.
3. In `restaurants` wordt gezocht naar `selfservicecode` (ook varianten van de veldnaam).
4. Het gevonden restaurant wordt live geladen uit `restaurants/<restaurantId>`.
5. Producten, tafels en bestellingen komen rechtstreeks uit Firebase.

Een oude `restaurantCodes`-mapping blijft als fallback beschikbaar.
