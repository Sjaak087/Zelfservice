# Restaurant Zelfservice

De zelfservice vraagt de gebruiker nooit om een restaurant te kiezen.

De QR-code/link van het andere systeem moet een **join code** meegeven. De app zoekt die code op in de Firebase Realtime Database onder:

`restaurantCodes`

Daarna bepaalt de app automatisch welk restaurant bij die code hoort en leest de gegevens live uit:

`restaurants/<restaurantId>`

Ondersteunde join-code URL-vormen zijn onder andere:

- `https://jouwdomein.nl/zelfservice?joinCode=ABC123`
- `https://jouwdomein.nl/zelfservice?code=ABC123`
- `https://jouwdomein.nl/zelfservice?restaurantCode=ABC123`
- `https://jouwdomein.nl/zelfservice/ABC123`
- `https://jouwdomein.nl/zelfservice#ABC123`

De lookup is bewust flexibel opgezet zodat deze Firebase-structuren kunnen worden gebruikt:

- `restaurantCodes/ABC123 = restaurantId`
- `restaurantCodes/restaurantId = ABC123`
- `restaurantCodes/ABC123 = { restaurantId: "..." }`
- `restaurantCodes/restaurantId = { joinCode: "ABC123" }`

Producten, tafels, restaurantgegevens en bestellingen blijven rechtstreeks aan Firebase gekoppeld.
