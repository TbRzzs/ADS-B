import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { use, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { bboxAround } from '@adsb/shared/geo';
import type { LatLon, MapStatus } from '@adsb/shared/types';
import { fetchAircraftDetail, mapStatusPromise } from '../lib/api';
import { liveStore } from '../lib/live-store';
import { useLatest } from '../lib/use-latest';
import { aircraftCollection, lineCollection, rangeGeometry } from './geojson';
import { addOverlay, LAYER, SRC } from './overlay';
import { captureScreenshot } from './screenshot';
import { buildBaseStyle } from './style';

// Inicialización única por carga de la app (no por montaje).
let protocolRegistered = false;
function registerPmtiles(): void {
  if (protocolRegistered) return;
  protocolRegistered = true;
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
}

/** Estado y estilo se resuelven una vez; `use()` suspende mientras tanto. */
const setupPromise = mapStatusPromise.then(async (status: MapStatus) => ({
  status,
  style: await buildBaseStyle(status),
}));

/** Acciones que la interfaz puede pedirle al mapa. */
export interface MapHandle {
  /** Vuelve a encuadrar el receptor y el radio de detección. */
  recenter: () => void;
  /** Captura PNG del mapa con el avión seleccionado y su ficha (null si el mapa no está listo). */
  screenshot: () => Promise<Blob | null>;
}

interface Props {
  ref?: Ref<MapHandle>;
  receiver: LatLon;
  radiusKm: number;
  showOutOfRange: boolean;
  selectedHex: string | null;
  onSelect: (hex: string | null) => void;
}

const FIT_PADDING = 48;

export default function MapView({ ref, receiver, radiusKm, showOutOfRange, selectedHex, onSelect }: Props) {
  const { status, style } = use(setupPromise);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);

  const onSelectRef = useLatest(onSelect);
  const selectedRef = useLatest(selectedHex);
  const viewRef = useLatest({ receiver, radiusKm });

  useImperativeHandle(
    ref,
    () => ({
      recenter() {
        const { receiver: rx, radiusKm: r } = viewRef.current;
        mapRef.current?.fitBounds(bboxAround(rx.lat, rx.lon, r), { padding: FIT_PADDING, duration: 500 });
      },
      async screenshot() {
        const map = mapRef.current;
        if (!map) return null;
        const { receiver: rx, radiusKm: r } = viewRef.current;
        const hex = selectedRef.current;
        const getAircraft = () =>
          hex ? liveStore.getState().snapshot?.aircraft.find((a) => a.hex === hex) : undefined;
        return captureScreenshot(map, { getAircraft, receiver: rx, radiusKm: r });
      },
    }),
    [viewRef, selectedRef],
  );
  // Valores de arranque leídos solo en la inicialización del mapa.
  const initialView = useRef({ receiver, radiusKm });
  // Estela del seleccionado: valor transitorio, no provoca renders.
  const trailRef = useRef<{ hex: string | null; coords: [number, number][] }>({ hex: null, coords: [] });

  // ─── Creación del mapa (una vez) ──────────────────────────────────────────
  useEffect(() => {
    registerPmtiles();
    const { receiver: rx, radiusKm: r } = initialView.current;
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style,
      bounds: bboxAround(rx.lat, rx.lon, r),
      fitBoundsOptions: { padding: FIT_PADDING },
      attributionControl: { compact: true },
      maxPitch: 0,
      dragRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      addOverlay(map, status.glyphs);
      setReady(true);
    });

    map.on('click', (e) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: [LAYER.aircraft] })[0];
      onSelectRef.current((hit?.properties?.hex as string | undefined) ?? null);
    });
    map.on('mouseenter', LAYER.aircraft, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', LAYER.aircraft, () => {
      map.getCanvas().style.cursor = '';
    });

    mapRef.current = map;
    // Solo en desarrollo: inspección desde la consola del navegador (window.__map).
    if (import.meta.env.DEV) (window as unknown as { __map?: MapLibreMap }).__map = map;
    return () => {
      setReady(false);
      mapRef.current = null;
      map.remove();
    };
  }, [style, status.glyphs, onSelectRef]);

  // ─── Anillos de alcance y receptor ────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const geo = rangeGeometry({ lat: receiver.lat, lon: receiver.lon }, radiusKm);
    (map.getSource(SRC.rings) as GeoJSONSource).setData(geo.rings);
    (map.getSource(SRC.ringLabels) as GeoJSONSource).setData(geo.labels);
    (map.getSource(SRC.area) as GeoJSONSource).setData(geo.area);
    (map.getSource(SRC.spokes) as GeoJSONSource).setData(geo.spokes);
    (map.getSource(SRC.receiver) as GeoJSONSource).setData(geo.receiver);
  }, [ready, receiver.lat, receiver.lon, radiusKm]);

  // Encuadra el área al cambiar el radio o el receptor (no en el primer render).
  const didFit = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (!didFit.current) {
      didFit.current = true;
      return;
    }
    map.fitBounds(bboxAround(receiver.lat, receiver.lon, radiusKm), {
      padding: FIT_PADDING,
      duration: 400,
    });
  }, [ready, receiver.lat, receiver.lon, radiusKm]);

  // ─── Mostrar/ocultar aviones fuera del radio ──────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setFilter(LAYER.aircraft, showOutOfRange ? null : ['==', ['get', 'inRange'], true]);
  }, [ready, showOutOfRange]);

  // ─── Datos en vivo: se escriben directo en MapLibre, sin pasar por React ──
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const aircraftSrc = map.getSource(SRC.aircraft) as GeoJSONSource;
    const trailSrc = map.getSource(SRC.trail) as GeoJSONSource;

    const update = () => {
      const snap = liveStore.getState().snapshot;
      if (!snap) return;
      aircraftSrc.setData(aircraftCollection(snap));

      const hex = selectedRef.current;
      const trail = trailRef.current;
      if (!hex || trail.hex !== hex) return;
      const ac = snap.aircraft.find((a) => a.hex === hex);
      if (ac?.lat === undefined || ac.lon === undefined) return;
      const last = trail.coords.at(-1);
      if (!last || last[0] !== ac.lon || last[1] !== ac.lat) {
        trail.coords.push([ac.lon, ac.lat]);
        trailSrc.setData(lineCollection(trail.coords));
      }
    };
    update();
    return liveStore.subscribe(update);
  }, [ready, selectedRef]);

  // ─── Selección: resalta, centra y carga la estela histórica ───────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setFilter(LAYER.selected, ['==', ['get', 'hex'], selectedHex ?? '']);
    const trailSrc = map.getSource(SRC.trail) as GeoJSONSource;
    trailRef.current = { hex: selectedHex, coords: [] };
    trailSrc.setData(lineCollection([]));
    if (!selectedHex) return;

    const ac = liveStore.getState().snapshot?.aircraft.find((a) => a.hex === selectedHex);
    if (ac?.lat !== undefined && ac.lon !== undefined) {
      const center: [number, number] = [ac.lon, ac.lat];
      if (!map.getBounds().contains(center)) map.easeTo({ center, duration: 500 });
    }

    const ctrl = new AbortController();
    fetchAircraftDetail(selectedHex, ctrl.signal)
      .then(({ trail }) => {
        const current = trailRef.current;
        if (current.hex !== selectedHex) return;
        const history = trail.map((p): [number, number] => [p.lon, p.lat]);
        current.coords = history.concat(current.coords);
        trailSrc.setData(lineCollection(current.coords));
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [ready, selectedHex]);

  return <div ref={containerRef} className="map" aria-label="Mapa de aviones" role="region" />;
}
