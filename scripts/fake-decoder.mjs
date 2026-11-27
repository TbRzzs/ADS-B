#!/usr/bin/env node
/**
 * Emulador de decodificador ADS-B (readsb/dump1090) para probar sin antena las fuentes
 * "readsb" y "sbs" de la API, tal como funcionarán con el receptor real.
 *
 *   HTTP  http://127.0.0.1:8080/data/aircraft.json   (formato readsb)
 *   TCP   127.0.0.1:30003                            (formato SBS-1 / BaseStation)
 *
 * Uso: node scripts/fake-decoder.mjs [--lat 4.7016] [--lon -74.1469] [--http 8080] [--sbs 30003]
 */
import { createServer as createHttp } from 'node:http';
import { createServer as createTcp } from 'node:net';
import { parseArgs } from 'node:util';

// parseArgs rechaza valores que empiezan por "-" (p. ej. --lon -74.1): se unen como --lon=-74.1.
const NEGATIVE_NUMBER = /^-\d/;
function normalizeArgv(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a.startsWith('--') && !a.includes('=') && next !== undefined && NEGATIVE_NUMBER.test(next)) {
      out.push(`${a}=${next}`);
      i++;
    } else out.push(a);
  }
  return out;
}

const { values } = parseArgs({
  args: normalizeArgv(process.argv.slice(2)),
  options: {
    lat: { type: 'string', default: process.env.RECEIVER_LAT ?? '4.7016' },
    lon: { type: 'string', default: process.env.RECEIVER_LON ?? '-74.1469' },
    http: { type: 'string', default: '8080' },
    sbs: { type: 'string', default: '30003' },
  },
});

const RX = { lat: Number(values.lat), lon: Number(values.lon) };
const R = 6371.0088;
const DEG = Math.PI / 180;

function destination(lat, lon, brg, km) {
  const d = km / R, t = brg * DEG, p1 = lat * DEG, l1 = lon * DEG;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [p2 / DEG, l2 / DEG];
}

// Aviones en órbitas circulares a distintas distancias (2–40 km) del receptor.
const planes = [2, 4, 7, 10, 14, 18, 25, 33, 40].map((km, i) => ({
  hex: (0xa00000 + i * 0x1111).toString(16),
  flight: `TST${100 + i}`,
  orbitKm: km,
  angle: i * 40,
  alt: 3000 + i * 4000,
  gs: 180 + i * 30,
  squawk: String(2000 + i),
}));

function step() {
  for (const p of planes) p.angle = (p.angle + (p.gs / 3600) * 1.852 / (2 * Math.PI * p.orbitKm) * 360) % 360;
}

function position(p) {
  const [lat, lon] = destination(RX.lat, RX.lon, p.angle, p.orbitKm);
  return { lat, lon, track: (p.angle + 90) % 360 };
}

setInterval(step, 1000);

// ─── HTTP aircraft.json ────────────────────────────────────────────────
createHttp((req, res) => {
  // Como readsb configurado con --lat/--lon: la API se georreferencia sola con esto.
  if (req.url?.startsWith('/data/receiver.json')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ version: 'fake-decoder', refresh: 1000, history: 0, lat: RX.lat, lon: RX.lon }));
    return;
  }
  if (!req.url?.startsWith('/data/aircraft.json')) {
    res.writeHead(404).end();
    return;
  }
  const aircraft = planes.map((p) => {
    const { lat, lon, track } = position(p);
    return {
      hex: p.hex, type: 'adsb_icao', flight: `${p.flight}  `, alt_baro: p.alt, gs: p.gs, track,
      baro_rate: 0, squawk: p.squawk, lat, lon, seen_pos: 0.3, seen: 0.1, rssi: -15, messages: 100,
    };
  });
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ now: Date.now() / 1000, messages: 1, aircraft }));
}).listen(Number(values.http), '127.0.0.1', () =>
  console.log(`aircraft.json → http://127.0.0.1:${values.http}/data/aircraft.json`),
);

// ─── TCP SBS-1 ─────────────────────────────────────────────────────────
const clients = new Set();
createTcp((sock) => {
  clients.add(sock);
  sock.on('close', () => clients.delete(sock));
  sock.on('error', () => clients.delete(sock));
}).listen(Number(values.sbs), '127.0.0.1', () => console.log(`SBS-1        → 127.0.0.1:${values.sbs}`));

const pad = (n) => String(n).padStart(2, '0');
setInterval(() => {
  if (clients.size === 0) return;
  const d = new Date();
  const date = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.000`;
  const head = (type, hex) => `MSG,${type},1,1,${hex.toUpperCase()},1,${date},${time},${date},${time}`;
  let out = '';
  for (const p of planes) {
    const { lat, lon, track } = position(p);
    out += `${head(1, p.hex)},${p.flight},,,,,,,,,,,\r\n`;
    out += `${head(3, p.hex)},,${p.alt},,,${lat.toFixed(5)},${lon.toFixed(5)},,,0,0,0,0\r\n`;
    out += `${head(4, p.hex)},,,${p.gs},${track.toFixed(1)},,,0,,,,,0\r\n`;
  }
  for (const c of clients) c.write(out);
}, 1000);
