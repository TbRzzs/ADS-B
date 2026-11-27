// Silueta de avión (24×24, apuntando al norte) — se colorea en el mapa vía SDF.
const PLANE_PATH =
  'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z';

export const PLANE_ICON_ID = 'plane';
export const PLANE_PIXEL_RATIO = 2;

/** Genera el icono en un canvas: no depende de sprites externos (offline). */
export function createPlaneImage(sizePx = 56): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext('2d')!;
  const scale = sizePx / 24;
  ctx.scale(scale, scale);
  // El desenfoque genera un gradiente en el borde, necesario para un SDF limpio.
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = 1.2;
  ctx.fillStyle = '#fff';
  ctx.fill(new Path2D(PLANE_PATH));
  return ctx.getImageData(0, 0, sizePx, sizePx);
}
