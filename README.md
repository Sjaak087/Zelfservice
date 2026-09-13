# Zelfservice – rijke donkere versie + ordertracking

## Wat is aangepast
- Donkere/rijke restaurantstijl blijft behouden.
- Productbestemming wordt bij het plaatsen live gelezen uit `restaurants/<restaurantId>/products/<productId>/bestemming`.
- Gemengde bestellingen worden gesplitst naar Bar en Keuken.
- Iedere order krijgt altijd een `orderGroupId`, zodat de klant één geplaatste bestelling kan volgen, ook als die over Bar en Keuken is gesplitst.
- Orders krijgen `itemDetails` met productnaam, emoji, prijs en bestemming als extra fallback.
- Nieuwe tab **Geplaatst** toont actieve bestellingen live vanuit `restaurants/<restaurantId>/orders`.
- Fases: **Binnengekomen → In bereiding → Gemaakt**.
- Zodra de hoofdsite de orderstatus wijzigt, werkt de geplaatste-bestellingenweergave automatisch mee.

## Productnaam in de Bar/Keuken
De hoofdsite had al een `productLabel()` die normaal uit `PRODUCTS_STATE` leest. Omdat een order kan binnenkomen voordat de productlistener klaar is, bevat de nieuwe zelfservice-order ook `itemDetails`.

Gebruik `hoofdcode-met-ordernaam-fix.md` voor de kleine wijziging in de hoofdwebsite. Daarmee valt de orderweergave terug op `order.itemDetails[key].label` en wordt de Keuken/Bar-weergave opnieuw getekend zodra `products` live binnenkomt.
