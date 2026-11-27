import type { Map as MapLibreMap, MapGeoJSONFeature } from 'maplibre-gl';
import { distanceKm } from '@adsb/shared/geo';
import type { Aircraft, LatLon } from '@adsb/shared/types';
import {
  compassPoint,
  displayName,
  formatAltitude,
  formatDegrees,
  formatDistance,
  formatSpeed,
} from '../lib/format';
import { BRAND } from '../lib/brand';

export interface ScreenshotInput {
  /** Se consulta justo al capturar el frame, para que datos e imagen coincidan. */
  getAircraft: () => Aircraft | undefined;
  receiver: LatLon;
  radiusKm: number;
}

const dateFmt = new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' });
const timeFmt = new Intl.DateTimeFormat('es-CO', { timeStyle: 'medium' });
const zoneFmt = new Intl.DateTimeFormat('es-CO', { timeZoneName: 'longOffset' });

const coord = (p: LatLon) => `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;

/** Espera a que el mapa termine de cargar teselas tras moverlo. */
function whenIdle(map: MapLibreMap): Promise<void> {
  return map.loaded() ? Promise.resolve() : new Promise((r) => map.once('idle', () => r()));
}

/**
 * Copia el canvas WebGL justo después de un frame (sin `preserveDrawingBuffer`,
 * que penaliza el rendimiento todo el tiempo).
 */
function grabFrame(map: MapLibreMap): Promise<HTMLCanvasElement> {
  return new Promise((resolve) => {
    map.once('render', () => {
      const src = map.getCanvas();
      const out = document.createElement('canvas');
      out.width = src.width;
      out.height = src.height;
      out.getContext('2d')!.drawImage(src, 0, 0);
      resolve(out);
    });
    map.triggerRepaint();
  });
}

/** Nombre del lugar (ciudad, barrio…) más cercano entre las etiquetas visibles del mapa base. */
function nearestPlace(features: readonly MapGeoJSONFeature[], p: LatLon): string | null {
  let best: string | null = null;
  let bestKm = Number.POSITIVE_INFINITY;
  for (const f of features) {
    if (f.sourceLayer !== 'places' || f.geometry.type !== 'Point') continue;
    const name = (f.properties['name:es'] ?? f.properties.name) as string | undefined;
    if (!name) continue;
    const [lon, lat] = f.geometry.coordinates as [number, number];
    const km = distanceKm(p.lat, p.lon, lat, lon);
    if (km < bestKm) {
      bestKm = km;
      best = name;
    }
  }
  return best;
}

function wrapLines(ctx: CanvasRenderingContext2D, lines: string[], maxWidth: number): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (ctx.measureText(line).width <= maxWidth) {
      out.push(line);
      continue;
    }
    let current = '';
    for (const word of line.split(' ')) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        out.push(current);
        current = word;
      } else current = test;
    }
    if (current) out.push(current);
  }
  return out;
}

/** Captura el mapa con el avión marcado, datos, fecha/hora/ubicación y marca de agua. */
export async function captureScreenshot(map: MapLibreMap, input: ScreenshotInput): Promise<Blob> {
  const { receiver } = input;

  // Asegura que el avión señalado salga en la imagen.
  const initial = input.getAircraft();
  if (initial?.lat !== undefined && initial.lon !== undefined && !map.getBounds().contains([initial.lon, initial.lat])) {
    map.jumpTo({ center: [initial.lon, initial.lat] });
  }
  await whenIdle(map);
  const frame = await grabFrame(map);
  // Datos del mismo instante que el frame (el avión se mueve mientras carga el mapa).
  const a = input.getAircraft();
  const takenAt = new Date();
  const planePos = a?.lat !== undefined && a.lon !== undefined ? { lat: a.lat, lon: a.lon } : null;

  const rendered = map.queryRenderedFeatures();
  const placeOfReceiver = nearestPlace(rendered, receiver);
  const placeOfPlane = planePos ? nearestPlace(rendered, planePos) : null;

  const dpr = frame.width / map.getCanvas().clientWidth;
  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(frame, 0, 0);

  // Marca sobre el avión.
  if (planePos) {
    const pt = map.project([planePos.lon, planePos.lat]);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath();
    ctx.arc(pt.x * dpr, pt.y * dpr, 26 * dpr, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Marca de agua diagonal repetida.
  const stamp = `${BRAND} · ${dateFmt.format(takenAt)} ${timeFmt.format(takenAt)}`;
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(-Math.PI / 7);
  ctx.font = `600 ${18 * dpr}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.09)';
  ctx.textAlign = 'center';
  const stepY = 120 * dpr;
  const span = Math.hypot(canvas.width, canvas.height);
  for (let y = -span / 2; y < span / 2; y += stepY) {
    for (let x = -span / 2; x < span / 2; x += ctx.measureText(stamp).width + 80 * dpr) {
      ctx.fillText(stamp, x, y);
    }
  }
  ctx.restore();

  // Ficha de datos.
  const title = a ? `${displayName(a)}${a.typeCode ? ` · ${a.typeCode}` : ''}` : BRAND;
  const lines: string[] = [];
  if (a) {
    lines.push(`ICAO ${a.hex.toUpperCase()}${a.registration ? ` · ${a.registration}` : ''}${a.squawk ? ` · Squawk ${a.squawk}` : ''}`);
    lines.push(
      planePos
        ? `Posición del avión: ${coord(planePos)}${placeOfPlane ? ` (cerca de ${placeOfPlane})` : ''}`
        : 'Posición del avión: no disponible',
    );
    lines.push(`Altitud ${formatAltitude(a)} · ${formatSpeed(a.groundSpeedKt)} · Rumbo ${formatDegrees(a.trackDeg)}`);
    if (a.distanceKm !== undefined) {
      lines.push(`A ${formatDistance(a.distanceKm)} del receptor, hacia el ${compassPoint(a.bearingDeg)} · radio ${input.radiusKm} km`);
    }
  }
  lines.push(`Tomada desde: ${coord(receiver)}${placeOfReceiver ? ` (${placeOfReceiver})` : ''}`);
  lines.push(`Fecha: ${dateFmt.format(takenAt)} · Hora: ${timeFmt.format(takenAt)} (${zoneFmt.format(takenAt).split(' ').pop()})`);

  const pad = 14 * dpr;
  const lineH = 19 * dpr;
  const boxW = Math.min(canvas.width - 2 * pad, 560 * dpr);
  ctx.font = `${13 * dpr}px system-ui, sans-serif`;
  const body = wrapLines(ctx, lines, boxW - 2 * pad);
  const boxH = pad * 2 + 24 * dpr + body.length * lineH;
  const x = pad;
  const y = canvas.height - boxH - pad;

  ctx.fillStyle = 'rgba(17, 24, 39, 0.92)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = dpr;
  ctx.beginPath();
  ctx.roundRect(x, y, boxW, boxH, 8 * dpr);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#f9fafb';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `600 ${16 * dpr}px system-ui, sans-serif`;
  ctx.fillText(title, x + pad, y + pad);
  ctx.font = `${13 * dpr}px system-ui, sans-serif`;
  ctx.fillStyle = '#d1d5db';
  body.forEach((line, i) => ctx.fillText(line, x + pad, y + pad + 24 * dpr + i * lineH));

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen'))), 'image/png'),
  );
}

export function screenshotFileName(a: Aircraft | undefined, at = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}`;
  const who = a ? displayName(a).replace(/[^\w-]+/g, '') : 'radar';
  return `captura_${who}_${stamp}.png`;
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
