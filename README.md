# Radar ADS-B 1090 MHz (offline)

Rastreo local de aviones con una antena **AirNav Radar ADS-B 1090 MHz**: **API** (REST + WebSocket)
y **mapa web** que funciona **sin internet**, con **radio de detección configurable**
(3, 5, 8, 15, 20, 30 km o cualquier valor entre 0,5 y 400 km).

> **Hardware necesario:** la antena sola no basta, también hace falta un **receptor SDR USB**
> (p. ej. AirNav FlightStick) y un decodificador (readsb/dump1090).
> Lee **[docs/HARDWARE.md](docs/HARDWARE.md)**.

## Funciones

- Mapa claro a pantalla completa con los aviones en vivo. Cada icono apunta según el rumbo y se colorea
  por altitud; las emergencias se ven en rojo.
- Radio de detección: **3, 5, 8, 15, 20 o 30 km**, en la barra superior.
- Botones a la derecha:
  - **Mi ubicación:** solicita una posición nueva del dispositivo y la guarda como ubicación fijada de la antena. Úsala estando junto al receptor. Muestra la precisión estimada; si el error supera 1 km, conserva la posición anterior y avisa.
  - **Centrar:** vuelve a encuadrar la antena guardada sin cambiar sus coordenadas.
  - **Captura:** descarga un PNG con el vuelo seleccionado marcado y una ficha. La ficha lleva el
    callsign, el ICAO, las coordenadas del avión y el lugar más cercano, la altitud y la velocidad,
    desde dónde se tomó (coordenadas y lugar), la fecha, la hora con zona horaria y una marca de agua.
  - **Alarma:** sirena que **suena mientras haya un avión dentro del radio**. "Silenciar" la calla para
    los que ya están dentro; si entra otro, vuelve a sonar.
  - **Ajustes.**
- Listado de aviones y de entradas/salidas: **plegado por defecto** (botón "Aviones" abajo a la
  derecha), con buscador.
- Ubicación de la antena automática (decodificador o dispositivo).
- Datos del receptor mediante `readsb` (`aircraft.json`, por defecto) o `sbs` (TCP 30003).
- Mapa offline (OpenStreetMap/Protomaps en un solo archivo `.pmtiles`).
- Se usa desde el PC, el móvil o la tablet de tu red local.

> Los navegadores no dejan sonar audio hasta que tocas la página. La alarma queda activa tras el primer
> clic o la primera tecla.

## Inicio rápido

Requisitos: **Node.js ≥ 20.12** (probado con 24), antena 1090 MHz, receptor SDR y un decodificador
en funcionamiento. Configura el hardware siguiendo **[docs/HARDWARE.md](docs/HARDWARE.md)**.

```bash
npm install
cp .env.example .env          # en PowerShell: Copy-Item .env.example .env
```

En `.env`, configura la conexión al decodificador. Para readsb/dump1090 con salida JSON:

```ini
SOURCE=readsb
READSB_URL=http://127.0.0.1:8080/data/aircraft.json
```

Para dump1090 en Windows con salida SBS:

```ini
SOURCE=sbs
SBS_HOST=127.0.0.1
SBS_PORT=30003
```

Si el decodificador está en otro equipo, usa su IP en lugar de `127.0.0.1`.
Arranca el decodificador y después la aplicación:

```bash
npm run dev                   # API :4000 + web con recarga en caliente :5173
```

Abre **http://localhost:5173**. Verás los aviones con posición recibidos por la antena.
Si el decodificador no está disponible, la interfaz muestra **Receptor sin datos** y el mapa queda
sin aviones al arrancar. La aplicación reintenta la conexión automáticamente.
Confirma **la ubicación de la antena** en *Ajustes* o configura `RECEIVER_LAT/RECEIVER_LON` como valores
iniciales si el decodificador no proporciona su posición.

### Producción (un solo proceso, todo en el puerto 4000)

```bash
npm run build
npm start                     # http://localhost:4000
```

### Mapa offline de Colombia (una vez, con internet)

```bash
npm run map:colombia
```

Si ya lo descargaste antes, baja también los iconos del tema claro (rápido, sin volver a bajar el mapa):
`npm run map:download -- --skip-tiles`.

Descarga en `data/map/` un único archivo `region.pmtiles` con toda Colombia (incluye San Andrés y
Providencia, zoom máximo 13), más las tipografías y los iconos. Usa la herramienta `go-pmtiles`, que el
script baja de GitHub. Puede tardar bastante y pesar de cientos de MB a más de 1 GB; al terminar muestra
el tamaño. Después, recarga la web.

Otras opciones:

```bash
npm run map:download -- --region colombia --maxzoom 12      # más liviano, menos detalle
npm run map:download -- --region colombia --maxzoom 14      # detalle de calles (mucho más pesado)
npm run map:download -- --bbox -75.8,3.9,-73.5,5.6          # solo una zona: oeste,sur,este,norte
npm run map:download -- --lat 4.70 --lon -74.14 --radius 80 # círculo alrededor de un punto
```

### Ubicación de la antena: automática

No tienes que escribir coordenadas. La posición del receptor, desde la que se miden todas las
distancias, se detecta sola. Si llegan varias, gana la de mayor prioridad:

| Prioridad | Origen | Cuándo |
|---|---|---|
| 1 | **Manual** (Ajustes) | Solo si la escribes tú para corregirla. "Volver a detección automática" la descarta |
| 2 | **Decodificador** | Al conectarse, la API lee `receiver.json` de readsb/dump1090-fa (se configura una vez en el decodificador; ver docs/HARDWARE.md). Se revisa cada 5 min |
| 3 | **Dispositivo** | Si todavía no hay ninguna, la web pide la ubicación del PC o el móvil una sola vez y la guarda (solo funciona en `localhost` o por https) |
| 4 | Por defecto | `RECEIVER_LAT/LON` del `.env`, hasta que llegue una de las anteriores |

La posición queda guardada en `data/settings.json`, así que funciona offline después de detectarla.
La barra superior indica de dónde salió.

> El FlightStick no tiene GPS: la antena por sí sola no puede saber dónde está. Por eso se usa la
> ubicación configurada en el decodificador o la del dispositivo.

## Uso con la antena

1. Instala el decodificador (Raspberry Pi o Windows): ver [docs/HARDWARE.md](docs/HARDWARE.md).
2. En `.env`:
   ```ini
   SOURCE=readsb
   READSB_URL=http://127.0.0.1:8080/data/aircraft.json
   # o bien:  SOURCE=sbs  SBS_HOST=127.0.0.1  SBS_PORT=30003
   ```
3. Ejecuta `npm run build` y luego `npm start`. La ubicación se toma del decodificador; si no la tiene,
   se solicita la del dispositivo. Confirma que corresponde al lugar donde está instalada la antena.

## API

Documentación completa en **[docs/API.md](docs/API.md)**. Resumen:

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Estado del servidor y de la fuente |
| GET/PATCH | `/api/settings` | Radio de detección y posición del receptor |
| GET | `/api/aircraft?inRange=true&radiusKm=5` | Aviones (filtrables) |
| GET | `/api/aircraft/:hex` | Detalle + estela |
| GET | `/api/events` | Entradas/salidas del radio |
| GET | `/api/map/status` | Recursos del mapa offline disponibles |
| WS | `/ws` | Snapshot en vivo cada segundo + eventos |

## Estructura

```
packages/shared/   Tipos, constantes y geodesia (haversine, rumbos, círculos) — con tests
apps/server/       API Fastify: fuentes (readsb / SBS), tracker, REST + WebSocket
apps/web/          React 19 + Vite + MapLibre GL + PMTiles
scripts/           download-map.mjs (mapa offline)
docs/              Hardware, API, docker-compose del decodificador
data/              settings.json (ajustes persistidos) y map/ (mapa offline) — fuera de git
```

### Rendimiento (Vercel React Best Practices aplicadas)

- **Sin re-renders por posición:** los datos en vivo se escriben directamente en la fuente GeoJSON de
  MapLibre (`liveStore.subscribe` → `setData`). React solo vuelve a pintar la barra lateral.
  (`rerender-use-ref-transient-values`, `advanced-event-handler-refs`)
- **Carga en paralelo y bajo demanda:** MapLibre va en un chunk separado (`React.lazy` + `Suspense`).
  `/api/map/status` se pide en paralelo, y el código del mapa base solo se descarga si existe el
  `.pmtiles`. (`bundle-dynamic-imports`, `async-parallel`, `bundle-conditional`)
- **Store externo** con `useSyncExternalStore` y selectores; el WebSocket se abre una sola vez por carga
  de la app. (`advanced-init-once`)
- **Lista:** `useDeferredValue` en el buscador, filas `memo`, `content-visibility: auto` y un solo
  recorrido para filtrar. (`rerender-use-deferred-value`, `rerender-memo`,
  `rendering-content-visibility`, `js-combine-iterations`)
- **Estado derivado en el render** (radio en borrador frente al del servidor), `useTransition` en el
  guardado, `localStorage` versionado con try/catch, JSX estático elevado y `Intl` cacheado.
- **Servidor:** el snapshot se serializa una vez por tick para todos los clientes, el SBS se procesa por
  lotes, se valida con zod, se escribe a disco de forma atómica y el token es opcional (comparación en
  tiempo constante).

## Scripts

| Comando | |
|---|---|
| `npm run dev` | API + web en desarrollo |
| `npm run build` / `npm start` | Compilación y servidor de producción |
| `npm test` | Tests (vitest): geodesia, parsers SBS/readsb, tracker |
| `npm run typecheck` | TypeScript estricto en todos los paquetes |
| `npm run map:colombia` | Descarga el mapa offline de Colombia |
| `npm run map:download` | Descarga el mapa offline de otra zona (`--bbox`, `--lat/--lon`) |

## Licencias de datos

Mapa © colaboradores de [OpenStreetMap](https://www.openstreetmap.org/copyright), teselas de
[Protomaps](https://protomaps.com).
