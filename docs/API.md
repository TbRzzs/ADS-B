# API

Base: `http://<host>:4000`. JSON en todas las respuestas. CORS configurable con `CORS_ORIGIN`.
Unidades: distancias en **km**, altitudes en **pies**, velocidad en **nudos**, rumbos en **grados**,
tiempos en **epoch ms**.

## REST

### `GET /api/health`
Estado del servidor y de la fuente de datos.
```json
{ "ok": true, "uptimeS": 12, "source": { "kind": "readsb", "target": "http://…/aircraft.json",
  "connected": true, "messages": 12, "lastDataAt": 1795147075306 },
  "stats": { "tracked": 30, "withPosition": 28, "inRange": 10 } }
```

### `GET /api/settings`
```json
{ "receiver": { "lat": 4.7016, "lon": -74.1469 }, "receiverSource": "decoder", "radiusKm": 15 }
```
`receiverSource`: `manual` > `decoder` > `device` > `default` (prioridad; una fuente automática nunca pisa
a una de mayor prioridad).

### `PATCH /api/settings`
Cambia el radio de detección y/o la posición del receptor. Se persiste en `data/settings.json` y se
difunde al instante a todas las pantallas. Si `API_TOKEN` está definido requiere
`Authorization: Bearer <token>`.
```bash
curl -X PATCH http://localhost:4000/api/settings \
  -H 'content-type: application/json' -d '{"radiusKm": 8}'
```
Validación: `radiusKm` ∈ [0.5, 400]; `lat` ∈ [-90, 90]; `lon` ∈ [-180, 180]. Error → `400`.

| Cuerpo | Efecto |
|---|---|
| `{"receiver": {…}}` | Posición manual (prioridad máxima) |
| `{"receiver": {…}, "receiverSource": "device"}` | Posición del dispositivo; se ignora si ya hay una del decodificador o manual |
| `{"receiverSource": "auto"}` | Descarta la manual y vuelve a la del decodificador (o a detectar) |

### `GET /api/aircraft`
Aviones rastreados, ordenados por distancia.

| Query | Descripción |
|---|---|
| `inRange=true\|false` | Solo dentro / fuera del radio |
| `radiusKm=5` | Usa este radio para `inRange` en vez del configurado (no lo cambia) |
| `withPosition=true` | Solo aviones con posición conocida |

```bash
curl "http://localhost:4000/api/aircraft?inRange=true&radiusKm=3"
```
```json
{ "now": 1795147075306, "receiver": {"lat": 4.7016, "lon": -74.1469}, "radiusKm": 3, "count": 1,
  "aircraft": [{ "hex": "a1b2c3", "flight": "AVA123", "lat": 4.71, "lon": -74.15,
    "altBaroFt": 8500, "groundSpeedKt": 210, "trackDeg": 135, "verticalRateFpm": -768,
    "squawk": "4213", "distanceKm": 1.8, "bearingDeg": 344, "inRange": true,
    "lastSeen": 1795147075000, "lastPos": 1795147075000, "source": "adsb", "rssi": -14.2 }] }
```

### `GET /api/aircraft/:hex`
Detalle + estela (hasta 300 puntos, uno cada ≥ 2 s). `404` si no se está recibiendo.
```json
{ "aircraft": { … }, "trail": [{ "lat": 4.7, "lon": -74.1, "altFt": 9000, "t": 1795147070000 }] }
```

### `GET /api/events?limit=50`
Entradas/salidas del radio de detección, más recientes primero.
```json
[{ "id": 15, "kind": "enter", "hex": "a1b2c3", "flight": "AVA123", "distanceKm": 7.9,
   "altFt": 9000, "at": 1795147075829 }]
```
`exit` también se genera cuando la posición queda obsoleta (`POSITION_STALE_S`) o se pierde el avión.

### `GET /api/map/status`
Qué recursos del mapa offline existen: `{ "basemap": true, "glyphs": true, "sprite": true }`.

## WebSocket `GET /ws`

Al conectar se recibe `{"type":"events","data":[…]}` (últimos 50 eventos) y el último snapshot.
Después, cada `BROADCAST_MS` (1 s por defecto):

```json
{ "type": "snapshot", "data": {
    "now": 1795147075306,
    "settings": { "receiver": {…}, "radiusKm": 15 },
    "source": { "kind": "sbs", "connected": true, … },
    "stats": { "tracked": 30, "withPosition": 28, "inRange": 10 },
    "aircraft": [ … todos los aviones, cada uno con inRange … ],
    "newEvents": [ … eventos desde el snapshot anterior … ] } }
```

Ejemplo de cliente:
```js
const ws = new WebSocket('ws://localhost:4000/ws');
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.type === 'snapshot') {
    for (const e of msg.data.newEvents) if (e.kind === 'enter') console.log('Entra', e.flight ?? e.hex);
  }
};
```

## Archivos estáticos
- `/` — interfaz web compilada (`apps/web/dist`).
- `/map/*` — mapa offline (`data/map`): `region.pmtiles` (con soporte HTTP Range), `fonts/`, `sprites/`.
