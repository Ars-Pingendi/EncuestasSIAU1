// Peticiones al PC o al teléfono que se pueden cancelar de verdad.
//
// El navegador de la TV (Chromium 53 en webOS 4) no tiene AbortController: una petición con fetch que
// «vence» sigue abierta por debajo y ocupa una de las 6 conexiones que el navegador permite por
// equipo. Si se juntan varias, las siguientes quedan en cola y la app parece colgada. Con
// XMLHttpRequest sí se pueden cerrar (abort) al vencer el tiempo o al dejar de necesitarlas.

export interface NetResponse {
  status: number;
  /** Texto (respuestas normales) o bytes (si se pidió `binary`). */
  body: string | ArrayBuffer;
}

export interface NetRequest {
  promise: Promise<NetResponse>;
  abort(): void;
}

export interface NetOptions {
  method?: string;
  headers?: { [name: string]: string };
  body?: string;
  timeoutMs: number;
  binary?: boolean;
  timeoutMessage?: string;
}

export function request(url: string, o: NetOptions): NetRequest {
  const x = new XMLHttpRequest();
  let settled = false;
  let rejectFn: (e: Error) => void = () => undefined;
  const promise = new Promise<NetResponse>((resolve, reject) => {
    rejectFn = reject;
    x.open(o.method || 'GET', url, true);
    if (o.binary) x.responseType = 'arraybuffer';
    x.timeout = o.timeoutMs;
    const headers = o.headers || {};
    for (const k of Object.keys(headers)) x.setRequestHeader(k, headers[k]);
    x.onload = () => {
      settled = true;
      resolve({ status: x.status, body: o.binary ? (x.response as ArrayBuffer) : x.responseText });
    };
    x.onerror = () => {
      settled = true;
      reject(new Error('Sin conexión'));
    };
    x.ontimeout = () => {
      settled = true;
      reject(new Error(o.timeoutMessage || 'Tiempo agotado'));
    };
    x.send(o.body || null);
  });
  return {
    promise,
    abort: () => {
      if (settled) return;
      settled = true;
      try {
        x.abort();
      } catch {
        // ya cerrada
      }
      rejectFn(new Error('Cancelada'));
    },
  };
}

/** Mensaje de error que manda el equipo como JSON {"error": "…"} (o un resumen del texto). */
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
