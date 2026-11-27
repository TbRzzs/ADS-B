/** Preferencias locales del navegador (versionadas, mínimas y tolerantes a fallos). */
export interface Prefs {
  showOutOfRange: boolean;
  sound: boolean;
  apiToken: string;
}

const KEY = 'adsb-radar:prefs:v1';
const DEFAULTS: Prefs = { showOutOfRange: true, sound: true, apiToken: '' };

let cache: Prefs | null = null;

export function getPrefs(): Prefs {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULTS;
  } catch {
    cache = DEFAULTS;
  }
  return cache;
}

export function setPrefs(patch: Partial<Prefs>): Prefs {
  cache = { ...getPrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Modo privado o cuota agotada: se mantiene solo en memoria.
  }
  return cache;
}
