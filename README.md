# Restaurant zelfservice

De zelfservice leest het restaurant via de 5-cijferige `selfservicecode` uit `/restaurants`.

Tafels worden gelezen uit:

`/restaurants/{restaurantId}/floorplan/tables/{interneTafelCode}`

Voorbeeld van een tafel:

- `kind: "tafel"`
- `number: 1`
- `shape: "rond"`
- `x`, `y`

De interne sleutel blijft alleen intern als unieke tafel-ID; in de interface wordt `number` als `Tafel 1` getoond.
