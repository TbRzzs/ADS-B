import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import type { MapStatus } from '@adsb/shared/types';

export const BACKGROUND = '#0b0f17';
export const PMTILES_SOURCE = 'protomaps';

/**
 * Estilo base oscuro. Todo se sirve desde el propio servidor (/map/…), así que funciona sin internet:
 *  - con region.pmtiles → mapa vectorial (calles, ríos, ciudades…)
 *  - sin él → fondo liso con anillos de alcance y aviones
 */
export async function buildBaseStyle(status: MapStatus): Promise<StyleSpecification> {
  const origin = window.location.origin;
  const style: StyleSpecification = {
    version: 8,
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': BACKGROUND } }],
  };
  if (status.glyphs) style.glyphs = `${origin}/map/fonts/{fontstack}/{range}.pbf`;
  if (!status.basemap) return style;

  // Solo se descarga el código del mapa base si de verdad hay teselas.
  const { layers, namedFlavor } = await import('@protomaps/basemaps');
  if (status.sprite) style.sprite = `${origin}/map/sprites/${status.sprite}`;
  style.sources[PMTILES_SOURCE] = {
    type: 'vector',
    url: `pmtiles://${origin}/map/region.pmtiles`,
    attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> · Protomaps',
  };
  let base: LayerSpecification[] = layers(PMTILES_SOURCE, namedFlavor('dark'), { lang: 'es' });
  // Sin tipografías las capas de texto fallarían: se omiten.
  if (!status.glyphs) base = base.filter((l) => l.type !== 'symbol');
  style.layers = base;
  return style;
}
