# Zelfservice

Gebruikt de Firebase-structuur met de tabs/roots:
- `restaurant-selfserviceconfig`
- `restaurant-selfserviceconfig-plattegrond`
- `restaurant-selfserviceconfig-producten`
- `restaurant-selfserviceconfig-bestellingen`

De 5-cijferige `selfservicecode` wordt uit `restaurant-selfserviceconfig` gezocht. Daarna worden de plattegrond en producten uit de overeenkomstige tabs geladen.
