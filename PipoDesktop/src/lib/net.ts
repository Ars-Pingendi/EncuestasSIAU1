// Peticiones cancelables para el visor de videos (misma forma que en la app de la TV, pero con
// fetch + AbortController, que el Chromium de la app sí tiene y que funciona con pipo://).

export interface NetResponse {
  status: number;
  body: string | ArrayBuffer;
}

export interface NetRequest {
  promise: Promise<NetResponse>;
  abort(): void;
}

export interface NetOptions {
  headers?: Record<string, string>;
  timeoutMs: number;
  binary?: boolean;
  timeoutMessage?: string;
}

export function request(url: string, o: NetOptions): NetRequest {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, o.timeoutMs);
  const promise = fetch(url, { headers: o.headers, signal: ctrl.signal })
    .then(async (res) => ({ status: res.status, body: o.binary ? await res.arrayBuffer() : await res.text() }))
    .catch((err: Error) => {
      if (timedOut) throw new Error(o.timeoutMessage || 'Tiempo agotado');
      if (err && err.name === 'AbortError') throw new Error('Cancelada');
      throw new Error('Sin conexión');
    })
    .finally(() => clearTimeout(timer));
  return { promise, abort: () => ctrl.abort() };
}

/** Mensaje de error que llega como JSON {"error": "…"} (o un resumen del texto). */
export function errorText(r: NetResponse): string {
  const body = typeof r.body === 'string' ? r.body : '';
  try {
    const msg = (JSON.parse(body) as { error?: string }).error;
    if (msg) return msg;
  } catch {
    // no es JSON
  }
  return body.slice(0, 120);
}
