// Órdenes de Pipo para Windows hacia la TV («Reproducir en la TV», «Ver en la TV»). La app de la
// TV no puede recibir conexiones: pregunta al PC con una petición larga («/pipo/remote») que se
// contesta en cuanto hay una orden nueva o, como mucho, a los 20 s. Que pregunte seguido es también
// lo que indica que hay una TV conectada. Mismo protocolo que Pipo para Android.

export interface RemoteCommand {
  seq: number;
  type: 'play' | 'playNext' | 'enqueue' | 'video';
  tracks: unknown[];
  start: number;
}

const KEEP_MS = 120_000;
const CONNECTED_MS = 45_000;

export class TvRemote {
  private seq = 0;
  private entries: { at: number; cmd: RemoteCommand }[] = [];
  private waiters = new Set<() => void>();
  private lastPoll = 0;

  connected(): boolean {
    return Date.now() - this.lastPoll < CONNECTED_MS;
  }

  /** Encola una orden; devuelve si hay una TV conectada que la recibirá ya. */
  send(type: RemoteCommand['type'], tracks: unknown[], start = 0): boolean {
    const now = Date.now();
    this.seq += 1;
    this.entries.push({ at: now, cmd: { seq: this.seq, type, tracks: tracks.slice(0, 200), start } });
    while (this.entries.length && now - this.entries[0].at > KEEP_MS) this.entries.shift();
    for (const w of [...this.waiters]) w();
    return this.connected();
  }

  /** Espera órdenes posteriores a [since]; con since < 0 solo informa de la posición actual. */
  poll(since: number, timeoutMs: number, onClose?: (cancel: () => void) => void): Promise<{ seq: number; commands: RemoteCommand[] }> {
    this.lastPoll = Date.now();
    if (since < 0) return Promise.resolve({ seq: this.seq, commands: [] });
    const fresh = () => this.entries.filter((e) => e.cmd.seq > since).map((e) => e.cmd);
    const now = fresh();
    if (now.length) return Promise.resolve({ seq: this.seq, commands: now });
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.waiters.delete(wake);
        this.lastPoll = Date.now();
        resolve({ seq: this.seq, commands: fresh() });
      };
      const wake = () => finish();
      const timer = setTimeout(finish, timeoutMs);
      this.waiters.add(wake);
      onClose?.(finish);
    });
  }
}
