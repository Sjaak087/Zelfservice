Zelfservice

Firebase structuur verwacht:
restaurants/{restaurantId}/selfservicecode
restaurants/{restaurantId}/floorplan/tables/{firebaseTableKey}
restaurants/{restaurantId}/products/{productId}

De app leest floorplan/tables en products rechtstreeks met aparte Firebase listeners.
