import type { ExpressionSpecification, Map as MapLibreMap } from 'maplibre-gl';
import { ACCENT, ALTITUDE_STOPS, EMERGENCY_COLOR, GROUND_COLOR } from './altitude-colors';
import { EMPTY_COLLECTION } from './geojson';
import { createPlaneImage, PLANE_ICON_ID, PLANE_PIXEL_RATIO } from './plane-icon';

export const SRC = {
  rings: 'range-rings',
  ringLabels: 'range-labels',
  area: 'range-area',
  spokes: 'range-spokes',
  receiver: 'receiver',
  trail: 'trail',
  aircraft: 'aircraft',
} as const;

export const LAYER = {
  aircraft: 'aircraft',
  selected: 'aircraft-selected',
} as const;

const FONT = ['Noto Sans Medium'];

const altitudeColor: ExpressionSpecification = [
  'case',
  ['get', 'emergency'],
  EMERGENCY_COLOR,
  ['<', ['get', 'alt'], 0],
  GROUND_COLOR,
  ['interpolate', ['linear'], ['get', 'alt'], ...ALTITUDE_STOPS.flat()],
];

const aircraftOpacity: ExpressionSpecification = [
  'case',
  ['get', 'stale'],
  0.45,
  ['get', 'inRange'],
  1,
  0.4,
];

/** Añade fuentes y capas propias (anillos, estela, aviones) sobre el estilo base. */
export function addOverlay(map: MapLibreMap, withLabels: boolean): void {
  if (!map.hasImage(PLANE_ICON_ID)) {
    map.addImage(PLANE_ICON_ID, createPlaneImage(), { sdf: true, pixelRatio: PLANE_PIXEL_RATIO });
  }
  for (const id of Object.values(SRC)) {
    map.addSource(id, { type: 'geojson', data: EMPTY_COLLECTION });
  }

  map.addLayer({
    id: 'range-area',
    type: 'fill',
    source: SRC.area,
    paint: { 'fill-color': ACCENT, 'fill-opacity': 0.08 },
  });
  map.addLayer({
    id: 'range-spokes',
    type: 'line',
    source: SRC.spokes,
    paint: { 'line-color': '#64748b', 'line-width': 1, 'line-dasharray': [2, 4], 'line-opacity': 0.6 },
  });
  map.addLayer({
    id: 'range-rings',
    type: 'line',
    source: SRC.rings,
    paint: {
      'line-color': ['case', ['get', 'active'], ACCENT, '#94a3b8'],
      'line-width': ['case', ['get', 'active'], 2.5, 1],
      'line-opacity': ['case', ['get', 'active'], 1, 0.5],
    },
  });
  map.addLayer({
    id: 'trail',
    type: 'line',
    source: SRC.trail,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#fbbf24', 'line-width': 2, 'line-opacity': 0.9, 'line-dasharray': [1, 1.5] },
  });
  map.addLayer({
    id: 'receiver',
    type: 'circle',
    source: SRC.receiver,
    paint: {
      'circle-radius': 5,
      'circle-color': '#ffffff',
      'circle-stroke-color': '#0b0f17',
      'circle-stroke-width': 2,
    },
  });
  map.addLayer({
    id: LAYER.selected,
    type: 'circle',
    source: SRC.aircraft,
    filter: ['==', ['get', 'hex'], ''],
    paint: {
      'circle-radius': 17,
      'circle-color': 'rgba(255, 255, 255, 0.1)',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  });
  map.addLayer({
    id: LAYER.aircraft,
    type: 'symbol',
    source: SRC.aircraft,
    layout: {
      'icon-image': PLANE_ICON_ID,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 6, 0.55, 12, 0.9],
      'icon-rotate': ['get', 'track'],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'symbol-sort-key': ['get', 'alt'],
      ...(withLabels
        ? {
            'text-field': ['get', 'label'],
            'text-font': FONT,
            'text-size': 11,
            'text-offset': [0, 1.5],
            'text-anchor': 'top',
            'text-optional': true,
          }
        : {}),
    },
    paint: {
      'icon-color': altitudeColor,
      'icon-opacity': aircraftOpacity,
      'icon-halo-color': '#000000',
      'icon-halo-width': 1,
      ...(withLabels
        ? {
            'text-color': '#f9fafb',
            'text-halo-color': '#000000',
            'text-halo-width': 1.5,
            'text-opacity': aircraftOpacity,
          }
        : {}),
    },
  });

  if (withLabels) {
    map.addLayer({
      id: 'range-labels',
      type: 'symbol',
      source: SRC.ringLabels,
      layout: {
        'text-field': ['get', 'label'],
        'text-font': FONT,
        'text-size': 11,
        'text-anchor': 'bottom',
        'text-offset': [0, -0.3],
      },
      paint: {
        'text-color': ['case', ['get', 'active'], ACCENT, '#9ca3af'],
        'text-halo-color': '#000000',
        'text-halo-width': 1.5,
      },
    });
  }
}
