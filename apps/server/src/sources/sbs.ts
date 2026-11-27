import { Socket } from 'node:net';
import type { AircraftUpdate, SourceStatus } from '@adsb/shared/types';
import { parseSbsLine } from './sbs-parse';
import { errorMessage, type AircraftSource, type PushUpdates, type SourceLogger } from './source';

const FLUSH_MS = 250;
const MAX_BACKOFF_MS = 30_000;
const IDLE_TIMEOUT_MS = 60_000;

/** Cliente TCP del flujo SBS-1/BaseStation (puerto 30003). Reconecta automáticamente. */
export class SbsSource implements AircraftSource {
  readonly kind = 'sbs' as const;
  private socket: Socket | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private flushTimer: NodeJS.Timeout | undefined;
  private backoffMs = 1000;
  private stopped = false;
  private buffer = '';
  private batch: AircraftUpdate[] = [];
  private readonly st: SourceStatus;

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly log: SourceLogger,
  ) {
    this.st = { kind: this.kind, target: `${host}:${port}`, connected: false, messages: 0 };
  }

  start(push: PushUpdates): void {
    this.stopped = false;
    // Los mensajes llegan a cientos por segundo: se agrupan para no saturar el tracker.
    this.flushTimer = setInterval(() => {
      if (this.batch.length === 0) return;
      const out = this.batch;
      this.batch = [];
      push(out);
    }, FLUSH_MS);
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.flushTimer);
    this.socket?.destroy();
  }

  status(): SourceStatus {
    return { ...this.st };
  }

  private connect(): void {
    const socket = new Socket();
    this.socket = socket;
    this.buffer = '';
    socket.setEncoding('ascii');
    socket.setKeepAlive(true, 10_000);
    socket.setTimeout(IDLE_TIMEOUT_MS);

    socket.on('connect', () => {
      this.backoffMs = 1000;
      this.st.connected = true;
      this.st.error = undefined;
      this.log.info(`SBS conectado: ${this.st.target}`);
    });

    socket.on('data', (chunk: string) => {
      this.buffer += chunk;
      let nl: number;
      const now = Date.now();
      while ((nl = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, nl).trim();
        this.buffer = this.buffer.slice(nl + 1);
        const update = parseSbsLine(line, now);
        if (update) {
          this.batch.push(update);
          this.st.messages++;
        }
      }
      this.st.lastDataAt = now;
      // Protección ante basura sin saltos de línea.
      if (this.buffer.length > 64 * 1024) this.buffer = '';
    });

    socket.on('timeout', () => socket.destroy(new Error('sin datos durante 60 s')));
    socket.on('error', (err) => {
      const msg = errorMessage(err);
      if (this.st.error !== msg) this.log.warn(`SBS ${this.st.target}: ${msg}`);
      this.st.error = msg;
    });
    socket.on('close', () => {
      this.st.connected = false;
      if (this.stopped) return;
      this.reconnectTimer = setTimeout(() => this.connect(), this.backoffMs);
      this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    });

    socket.connect(this.port, this.host);
  }
}
