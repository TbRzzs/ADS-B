# Radar ADS-B 1090 MHz (offline)

Rastreo local de aviones con una antena **AirNav Radar ADS-B 1090 MHz**: **API** (REST + WebSocket)
y **mapa web** que funciona **sin internet**, con **radio de detección configurable**
(3, 5, 8, 15, 20, 30 km o cualquier valor entre 0,5 y 400 km).

> **Sin la antena todavía:** el proyecto trae un **simulador** (modo por defecto) y un **emulador de
> decodificador**, así puedes desarrollar y probar todo desde ya.

> **Ojo con el hardware:** la antena sola no basta, también hace falta un **receptor SDR USB**
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
- Tres fuentes de datos: `simulator`, `readsb` (`aircraft.json`) y `sbs` (TCP 30003).
- Mapa offline (OpenStreetMap/Protomaps en un solo archivo `.pmtiles`).
- Se usa desde el PC, el móvil o la tablet de tu red local.

> Los navegadores no dejan sonar audio hasta que tocas la página. La alarma queda activa tras el primer
> clic o la primera tecla.

## Inicio rápido

Requisitos: **Node.js ≥ 20.12** (probado con 24).

```bash
npm install
cp .env.example .env          # en PowerShell: Copy-Item .env.example .env
npm run dev                   # API :4000 + web con recarga en caliente :5173
```

Abre **http://localhost:5173**. Verás aviones simulados alrededor de la posición del `.env`.
Pon **tu ubicación** en `RECEIVER_LAT/RECEIVER_LON` o desde *Ajustes* en la web.

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

## Probar el modo "real" sin antena

```bash
npm run decoder:fake          # emula readsb: :8080/data/aircraft.json y SBS :30003
# en otra terminal, con SOURCE=readsb (o SOURCE=sbs) en .env:
npm run dev
```

El emulador pone 9 aviones en órbita a 2, 4, 7, 10, 14, 18, 25, 33 y 40 km. Sirve para comprobar
cada radio. También publica `receiver.json`, así que con `SOURCE=readsb` la API se georreferencia sola
(`--lat`/`--lon` del emulador cambian esa ubicación).

## Cuando llegue la antena

1. Instala el decodificador (Raspberry Pi o Windows): ver [docs/HARDWARE.md](docs/HARDWARE.md).
2. En `.env`:
   ```ini
   SOURCE=readsb
   READSB_URL=http://127.0.0.1:8080/data/aircraft.json
   # o bien:  SOURCE=sbs  SBS_HOST=127.0.0.1  SBS_PORT=30003
   ```
3. `npm start`. La ubicación se toma del decodificador; si no la tiene, se usa la del dispositivo.

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
apps/server/       API Fastify: fuentes (simulador / readsb / SBS), tracker, REST + WebSocket
apps/web/          React 19 + Vite + MapLibre GL + PMTiles
scripts/           download-map.mjs (mapa offline), fake-decoder.mjs (emulador)
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
| `npm run decoder:fake` | Emulador de decodificador |

## Licencias de datos

Mapa © colaboradores de [OpenStreetMap](https://www.openstreetmap.org/copyright), teselas de
[Protomaps](https://protomaps.com).
