const TARGET_ACCURACY_M = 250;
const MAX_ACCURACY_M = 1000;
const TIMEOUT_MS = 20_000;

export function formatAccuracy(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.ceil(meters)} m`;
}

/** Pide datos nuevos y da tiempo al proveedor para mejorar una primera lectura aproximada. */
export function getFreshPosition(): Promise<GeolocationPosition> {
  if (!window.isSecureContext) {
    return Promise.reject(new Error('Abre el radar en localhost o por HTTPS para usar tu ubicación.'));
  }
  if (!navigator.geolocation) {
    return Promise.reject(new Error('Este navegador no permite obtener la ubicación.'));
  }

  return new Promise((resolve, reject) => {
    let best: GeolocationPosition | undefined;
    let watchId: number | undefined;
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      if (error) reject(error);
      else if (best && best.coords.accuracy <= MAX_ACCURACY_M) resolve(best);
      else reject(new Error(best
        ? `El dispositivo solo ofrece una ubicación aproximada (±${formatAccuracy(best.coords.accuracy)}). No se cambió la posición. Revisa el permiso de ubicación de Windows y del navegador, o fija las coordenadas en Ajustes.`
        : 'No se pudo obtener una ubicación nueva. Revisa el permiso de ubicación de Windows y del navegador.'));
    };
    const timer = window.setTimeout(() => finish(), TIMEOUT_MS);
    try {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
              !Number.isFinite(longitude) || Math.abs(longitude) > 180 ||
              !Number.isFinite(accuracy) || accuracy < 0) return;
          if (!best || accuracy < best.coords.accuracy) best = position;
          if (accuracy <= TARGET_ACCURACY_M) finish();
        },
        (error) => {
          if (error.code === 1) finish(new Error('Permiso de ubicación denegado. Actívalo para este sitio y en Configuración de Windows → Privacidad y seguridad → Ubicación.'));
          // Un error temporal no descarta la mejor lectura recibida.
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: TIMEOUT_MS },
      );
      if (finished) navigator.geolocation.clearWatch(watchId);
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
