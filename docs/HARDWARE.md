# Hardware: ¿qué necesito además de la antena AirNav?

## Resumen

La **antena AirNav Radar ADS-B 1090 MHz** es **pasiva**: capta la señal pero no decodifica nada.
La cadena completa es:

```
 Antena 1090 MHz ──coax──▶ Receptor SDR USB ──USB──▶ PC / Raspberry Pi
 (la que compraste)        (FlightStick o RTL-SDR)     │
                                                        ├─ Decodificador: readsb / dump1090
                                                        │     ├─ HTTP  :8080/data/aircraft.json
                                                        │     └─ TCP   :30003 (SBS)
                                                        └─ ESTE PROYECTO (API :4000 + mapa)
```

| Pieza | ¿La tienes? | Recomendación |
|---|---|---|
| Antena 1090 MHz | ✅ (AirNav) | Lo más alta posible, exterior, con vista despejada al cielo |
| Receptor SDR | ❓ **Necesario** | **AirNav FlightStick 1090** (RTL2832U + R820T2 + LNA + filtro 1090 MHz) o FlightAware Pro Stick Plus. Un RTL-SDR genérico (RTL-SDR Blog V3/V4) también sirve |
| Cable coaxial | ❓ | Corto y de baja pérdida (LMR-240/400). Cada metro de cable malo pierde alcance |
| Adaptador de conector | ❓ | Revisa conectores: la antena suele ser **N hembra** o **SMA**, y el FlightStick **SMA** (los RTL-SDR baratos usan **MCX**) |
| Ordenador | ✅ | Tu PC con Windows sirve para empezar; para 24/7 conviene una Raspberry Pi 3/4/5 |

> Si compraste un kit que **ya incluye el FlightStick**, solo te falta el software.

## ¿Se pueden los radios de 3, 5, 8, 15, 20 y 30 km?

**Sí, sin problema.** Un receptor ADS-B en 1090 MHz con antena exterior suele recibir aviones a
**150–400 km** (limitado por la línea de vista y la altitud del avión). El "radio de detección" de este
proyecto es un **filtro por software** sobre la distancia calculada desde tu antena, así que
puedes elegir cualquier valor entre 0,5 y 400 km.

Consideraciones para radios **muy cortos (3–5 km)**:

- Aviones bajos (aproximación/despegue) pueden quedar tapados por edificios o terreno → coloca la
  antena alta.
- Un avión muy cercano puede **saturar** el receptor (señal demasiado fuerte). Usa ganancia
  automática (`--gain auto` / `READSB_GAIN=autogain`) o baja la ganancia.
- La **posición de la antena** debe ser precisa: un error de 500 m importa en un radio de 3 km. La
  ubicación del navegador en un PC (por Wi-Fi/IP) puede errar varios km; para radios cortos configura la
  posición en el decodificador o corrígela en Ajustes.
- Solo los aviones que transmiten **posición ADS-B** aparecen en el mapa. Algunos (militares,
  avionetas con transpondedor Modo S sin ADS-B) aparecen en la API sin posición.

## Opciones de software (decodificador)

Este proyecto **no habla con el USB directamente**: lee la salida de un decodificador estándar, igual que
hacen FlightAware, FR24 o AirNav. Así se aprovecha el mejor decodificador disponible y además puedes
seguir alimentando a AirNav Radar con `rbfeeder` si quieres.

### Opción A — Raspberry Pi o Linux (recomendada, 24/7)

Con Docker (ver [`docker-compose.decoder.yml`](./docker-compose.decoder.yml)):

```bash
docker compose -f docs/docker-compose.decoder.yml up -d
# Comprueba: http://IP-DE-LA-PI:8080  (mapa tar1090) y  http://IP-DE-LA-PI:8080/data/aircraft.json
```

O sin Docker, instalando `readsb` (script de wiedehopf):

```bash
sudo bash -c "$(wget -O - https://github.com/wiedehopf/adsb-scripts/raw/master/readsb-install.sh)"
sudo readsb-set-location <LAT> <LON>
sudo bash -c "$(wget -q -O - https://github.com/wiedehopf/adsb-scripts/raw/master/install-tar1090.sh)"   # opcional: mapa + /data/aircraft.json en :80
```

En el `.env` de este proyecto:

```ini
SOURCE=readsb
READSB_URL=http://IP-DE-LA-PI:8080/data/aircraft.json   # o http://IP/tar1090/data/aircraft.json
# alternativa:
# SOURCE=sbs
# SBS_HOST=IP-DE-LA-PI
# SBS_PORT=30003
```

### Opción B — Directamente en Windows

1. Instala el driver **WinUSB** para el stick con **Zadig** (selecciona "Bulk-In, Interface 0").
2. Usa un build de **dump1090 para Windows** (p. ej. el fork `gvanem/Dump1090`) con red activada:
   `dump1090 --net --interactive`
3. En `.env`: `SOURCE=sbs`, `SBS_HOST=127.0.0.1`, `SBS_PORT=30003`.
   (Si tu build expone `/data.json` o `/data/aircraft.json`, también puedes usar `SOURCE=readsb`
   apuntando a esa URL: se soportan el formato moderno y el antiguo.)

### Opción C — Windows con WSL2

`usbipd-win` permite pasar el USB a WSL2 y ejecutar `readsb` como en Linux. Funciona, pero es más
frágil que la opción A.

## Georreferenciación automática

El FlightStick **no tiene GPS**. La API toma la ubicación de la antena así, en orden de prioridad:
posición manual (Ajustes) → **decodificador** (`receiver.json`) → **dispositivo** (navegador) →
`.env`.

Para que sea automática y exacta, configura la ubicación **una sola vez en el decodificador** (es lo
mismo que piden AirNav/FR24/FlightAware para alimentar sus redes):

- readsb: `sudo readsb-set-location <LAT> <LON>`
- Docker ultrafeeder: `READSB_LAT` / `READSB_LON` en el compose
- dump1090-fa: `--lat <LAT> --lon <LON>`

Con eso readsb publica `/data/receiver.json` y la API se georreferencia en cuanto se conecta. Con
`SOURCE=sbs` no existe ese archivo; entonces se usa la ubicación del dispositivo.

## Verificación cuando llegue la antena

1. Conecta antena → stick → USB.
2. Arranca el decodificador y comprueba que ve aviones (su propia web o `aircraft.json`).
3. Cambia `SOURCE` en `.env` y reinicia `npm start`.
4. La web muestra 📍 "Ubicación del decodificador" (o "del dispositivo"). Solo si es imprecisa,
   corrígela en *Ajustes*.
5. El indicador superior debe mostrar la fuente en verde (no "sin datos").
