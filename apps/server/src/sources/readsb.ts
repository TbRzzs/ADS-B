import type { SourceStatus } from '@adsb/shared/types';
import { parseAircraftJson, parseReceiverJson, receiverJsonUrl } from './readsb-parse';
import {
  errorMessage,
  type AircraftSource,
  type PushUpdates,
  type SourceHooks,
  type SourceLogger,
} from './source';

/** Cada cuánto se vuelve a consultar la ubicación del receptor. */
const RECEIVER_REFRESH_MS = 5 * 60_000;

/** Lee periódicamente aircraft.json de readsb / dump1090-fa / tar1090 por HTTP. */
export class ReadsbJsonSource implements AircraftSource {
  readonly kind = 'readsb' as const;
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;
  private lastReceiverCheck = 0;
  private readonly st: SourceStatus;

  constructor(
    private readonly url: string,
    private readonly intervalMs: number,
    private readonly log: SourceLogger,
  ) {
    this.st = { kind: this.kind, target: url, connected: false, messages: 0 };
  }

  start(push: PushUpdates, hooks: SourceHooks = {}): void {
    this.stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(this.url, {
          signal: AbortSignal.timeout(Math.max(2000, this.intervalMs * 2)),
          headers: { accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        const updates = parseAircraftJson(await res.json(), Date.now());
        push(updates);
        if (!this.st.connected) {
          this.log.info(`readsb conectado: ${this.url}`);
          this.lastReceiverCheck = 0; // al (re)conectar se georreferencia de inmediato
        }
        this.st.connected = true;
        this.st.error = undefined;
        this.st.lastDataAt = Date.now();
        this.st.messages++;
        if (hooks.receiver) void this.checkReceiver(hooks.receiver);
      } catch (err) {
        const msg = errorMessage(err);
        if (this.st.connected || this.st.error !== msg) this.log.warn(`readsb: ${msg}`);
        this.st.connected = false;
        this.st.error = msg;
      } finally {
        if (!this.stopped) this.timer = setTimeout(poll, this.intervalMs);
      }
    };
    void poll();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  status(): SourceStatus {
    return { ...this.st };
  }

  private async checkReceiver(onReceiver: NonNullable<SourceHooks['receiver']>): Promise<void> {
    const now = Date.now();
    if (now - this.lastReceiverCheck < RECEIVER_REFRESH_MS) return;
    this.lastReceiverCheck = now;
    const url = receiverJsonUrl(this.url);
    if (!url) return;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return;
      const position = parseReceiverJson(await res.json());
      if (position) onReceiver(position);
      else this.log.info('receiver.json sin lat/lon: configura la ubicación en el decodificador o en la web');
    } catch {
      // Opcional: no todos los decodificadores publican receiver.json.
    }
  }
}
