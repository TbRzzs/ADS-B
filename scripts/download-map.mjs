#!/usr/bin/env node
/**
 * Descarga (UNA vez, con internet) todo lo necesario para el mapa offline:
 *   data/map/region.pmtiles   mapa vectorial OpenStreetMap recortado a tu zona (Protomaps)
 *   data/map/fonts/…          tipografías para etiquetas
 *   data/map/sprites/dark…    iconos del mapa base
 *
 * Uso:
 *   npm run map:download -- --region colombia            (país completo, zoom máx. 13)
 *   npm run map:download -- --bbox -75,4,-73,6           (caja: oeste,sur,este,norte)
 *   npm run map:download -- --lat 4.7 --lon -74.1 --radius 80 --maxzoom 14
 *   (sin región/caja/lat/lon: usa la posición guardada en data/settings.json o el .env)
 *
 * Opciones: --maxzoom N  --skip-tiles  --skip-assets  --force
 */
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { chmod, mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAP_DIR = join(ROOT, 'data', 'map');
const BIN_DIR = join(MAP_DIR, 'bin');
const ASSETS = 'https://protomaps.github.io/basemaps-assets';
const UA = { 'user-agent': 'adsb-radar-map-downloader' };

const FONT_STACKS = ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic'];
// Rangos Unicode 0–8447: latín, latín extendido (tildes, ñ), griego, cirílico, puntuación.
const FONT_RANGES = Array.from({ length: 33 }, (_, i) => `${i * 256}-${i * 256 + 255}`);
// Iconos del mapa base: tema claro (el que usa la web) y oscuro.
const SPRITE_FILES = ['light', 'dark'].flatMap((f) => [`${f}.json`, `${f}.png`, `${f}@2x.json`, `${f}@2x.png`]);

// ─── Argumentos ──────────────────────────────────────────────────────────
if (existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'));

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

const { values: args } = parseArgs({
  args: normalizeArgv(process.argv.slice(2)),
  options: {
    lat: { type: 'string' },
    lon: { type: 'string' },
    radius: { type: 'string', default: '80' },
    region: { type: 'string' },
    bbox: { type: 'string' },
    maxzoom: { type: 'string' },
    'skip-tiles': { type: 'boolean', default: false },
    'skip-assets': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
  },
});

function receiverFromConfig() {
  try {
    const s = JSON.parse(readFileSync(join(ROOT, 'data', 'settings.json'), 'utf8'));
    if (Number.isFinite(s?.receiver?.lat)) return s.receiver;
  } catch {}
  return { lat: Number(process.env.RECEIVER_LAT ?? 4.7016), lon: Number(process.env.RECEIVER_LON ?? -74.1469) };
}

/** Regiones predefinidas: [oeste, sur, este, norte]. */
const REGIONS = {
  // Colombia continental + San Andrés y Providencia.
  colombia: { box: [-81.9, -4.3, -66.8, 13.6], maxzoom: 13 },
};

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

/** Calcula la caja a recortar y una descripción legible. */
function resolveArea() {
  if (args.region) {
    const region = REGIONS[args.region.toLowerCase()];
    if (!region) fail(`Región desconocida "${args.region}". Disponibles: ${Object.keys(REGIONS).join(', ')}`);
    return { box: region.box, label: args.region, maxzoom: region.maxzoom };
  }
  if (args.bbox) {
    const box = args.bbox.split(',').map(Number);
    if (box.length !== 4 || !box.every(Number.isFinite)) fail('--bbox debe ser oeste,sur,este,norte (p. ej. -75,4,-73,6)');
    return { box, label: `caja ${box.join(', ')}`, maxzoom: 14 };
  }
  const fallback = receiverFromConfig();
  const lat = args.lat !== undefined ? Number(args.lat) : fallback.lat;
  const lon = args.lon !== undefined ? Number(args.lon) : fallback.lon;
  const radiusKm = Number(args.radius);
  if (![lat, lon, radiusKm].every(Number.isFinite)) {
    fail('Coordenadas inválidas: usa números, p. ej. --lat 4.7016 --lon -74.1469 (o --region colombia)');
  }
  return { box: bbox(lat, lon, radiusKm), label: `${radiusKm} km alrededor de ${lat}, ${lon}`, maxzoom: 14 };
}

// ─── Utilidades ──────────────────────────────────────────────────────────
async function download(url, dest) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

/** Ejecuta descargas con concurrencia limitada. */
async function pool(tasks, limit = 8) {
  let i = 0;
  let done = 0;
  const worker = async () => {
    while (i < tasks.length) {
      const task = tasks[i++];
      await task();
      done++;
      if (done % 20 === 0 || done === tasks.length) process.stdout.write(`\r  ${done}/${tasks.length}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  if (tasks.length) process.stdout.write('\n');
}

function bbox(lat, lon, km) {
  const dLat = km / 110.574;
  const dLon = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

// ─── 1. Tipografías y sprites ────────────────────────────────────────────
async function downloadAssets() {
  console.log('▸ Tipografías y sprites (Protomaps basemaps-assets)');
  const tasks = [];
  for (const stack of FONT_STACKS) {
    for (const range of FONT_RANGES) {
      const dest = join(MAP_DIR, 'fonts', stack, `${range}.pbf`);
      if (!args.force && existsSync(dest)) continue;
      tasks.push(() => download(`${ASSETS}/fonts/${encodeURIComponent(stack)}/${range}.pbf`, dest));
    }
  }
  for (const file of SPRITE_FILES) {
    const dest = join(MAP_DIR, 'sprites', file);
    if (!args.force && existsSync(dest)) continue;
    tasks.push(() => download(`${ASSETS}/sprites/v4/${file}`, dest));
  }
  await pool(tasks);
  console.log(tasks.length ? '  ✓ listo' : '  ✓ ya estaban descargados');
}

// ─── 2. Binario go-pmtiles ───────────────────────────────────────────────
async function ensurePmtilesBinary() {
  const exe = join(BIN_DIR, process.platform === 'win32' ? 'pmtiles.exe' : 'pmtiles');
  if (existsSync(exe)) return exe;

  console.log('▸ Descargando herramienta go-pmtiles (GitHub)');
  const res = await fetch('https://api.github.com/repos/protomaps/go-pmtiles/releases/latest', { headers: UA });
  if (!res.ok) throw new Error(`GitHub API: ${res.status}`);
  const release = await res.json();

  const os = { win32: 'windows', darwin: 'darwin', linux: 'linux' }[process.platform];
  const arch = { x64: 'x86_64', arm64: 'arm64' }[process.arch];
  if (!os || !arch) throw new Error(`Plataforma no soportada: ${process.platform}/${process.arch}`);

  const asset = release.assets.find((a) => {
    const n = a.name.toLowerCase();
    return n.includes(os) && n.includes(arch.toLowerCase()) && (n.endsWith('.zip') || n.endsWith('.tar.gz'));
  });
  if (!asset) throw new Error(`No hay binario go-pmtiles para ${os}/${arch} en ${release.tag_name}`);

  await mkdir(BIN_DIR, { recursive: true });
  const archive = join(BIN_DIR, asset.name);
  await download(asset.browser_download_url, archive);
  // bsdtar (incluido en Windows 10+, macOS y Linux) abre .zip y .tar.gz.
  // En Windows se fuerza el bsdtar del sistema: el GNU tar de Git Bash interpreta "C:" como host remoto.
  const winTar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  const tar = process.platform === 'win32' && existsSync(winTar) ? winTar : 'tar';
  await run(tar, ['-xf', archive, '-C', BIN_DIR]);
  await rm(archive);
  if (!existsSync(exe)) {
    const files = await readdir(BIN_DIR);
    throw new Error(`No se encontró el ejecutable tras extraer (${files.join(', ')})`);
  }
  if (process.platform !== 'win32') await chmod(exe, 0o755);
  console.log(`  ✓ ${release.tag_name}`);
  return exe;
}

// ─── 3. Recorte del mapa mundial de Protomaps ────────────────────────────
async function findLatestBuild() {
  const day = 24 * 3600 * 1000;
  for (let i = 0; i < 21; i++) {
    const d = new Date(Date.now() - i * day);
    const name = d.toISOString().slice(0, 10).replaceAll('-', '');
    const url = `https://build.protomaps.com/${name}.pmtiles`;
    const res = await fetch(url, { method: 'HEAD', headers: UA });
    if (res.ok) return url;
  }
  throw new Error('No se encontró ningún build reciente en build.protomaps.com');
}

async function downloadTiles(area) {
  const out = join(MAP_DIR, 'region.pmtiles');
  if (!args.force && existsSync(out)) {
    console.log('▸ region.pmtiles ya existe (usa --force para regenerarlo)');
    return;
  }
  const exe = await ensurePmtilesBinary();
  console.log('▸ Buscando el build más reciente del mapa mundial…');
  const source = await findLatestBuild();
  const maxzoom = args.maxzoom !== undefined ? Number(args.maxzoom) : area.maxzoom;
  const box = area.box.map((v) => v.toFixed(5));
  console.log(`  ${source}`);
  console.log(`▸ Recortando ${area.label} (zoom máx. ${maxzoom}). Puede tardar varios minutos…`);
  const tmp = `${out}.part`;
  await new Promise((resolve, reject) => {
    const child = execFile(
      exe,
      ['extract', source, tmp, `--bbox=${box.join(',')}`, `--maxzoom=${maxzoom}`],
      { maxBuffer: 1 << 26 },
      (err) => (err ? reject(err) : resolve()),
    );
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
  });
  await rm(out, { force: true });
  await rename(tmp, out);
  const { size } = await stat(out);
  console.log(`  ✓ ${out} (${(size / 1024 / 1024).toFixed(0)} MB)`);
}

// ─── Main ────────────────────────────────────────────────────────────────
// Se valida todo ANTES de descargar nada.
const area = args['skip-tiles'] ? null : resolveArea();
if (area && args.maxzoom !== undefined) {
  const z = Number(args.maxzoom);
  if (!Number.isInteger(z) || z < 1 || z > 15) fail('--maxzoom debe ser un entero entre 1 y 15');
}

try {
  await mkdir(MAP_DIR, { recursive: true });
  if (!args['skip-assets']) await downloadAssets();
  if (!args['skip-tiles']) await downloadTiles(area);
  console.log('\nMapa offline listo. Reinicia/recarga la web para usarlo.');
} catch (err) {
  console.error(`\n✗ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
