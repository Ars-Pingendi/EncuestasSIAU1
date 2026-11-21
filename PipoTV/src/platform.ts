// Diferencias entre televisores: LG webOS (la app corre directo en el navegador de la TV) y
// Android TV / Google TV (la app corre dentro de Pipo para Android TV, que expone `PipoAndroid`).
//
// En Android TV la app nativa traduce las teclas del control (Atrás, multimedia) a los mismos
// códigos de webOS y avisa cuando la app pasa a segundo plano.

interface AndroidBridge {
  exit(): void;
  keepAwake(on: boolean): void;
  showKeyboard(): void;
  version(): string;
}

interface PipoWindow extends Window {
  PipoAndroid?: AndroidBridge;
  /** La app de Android TV llama esto con el código de tecla (de webOS) a simular. */
  __pipoKey?: (code: number) => void;
  /** La app de Android TV avisa: «stop» (pasó a segundo plano o se apagó la TV). */
  __pipoLifecycle?: (state: string) => void;
}

const w = window as PipoWindow;

export const isAndroidTv = !!w.PipoAndroid;

export function platformName(): string {
  if (!w.PipoAndroid) return 'LG webOS';
  let v = '';
  try {
    v = w.PipoAndroid.version();
  } catch {
    // versión desconocida
  }
  return `Android TV${v ? ` (app ${v})` : ''}`;
}

/** Marca en el registro de Android (logcat) para diagnóstico y para la prueba en el emulador. */
export function trace(message: string) {
  if (w.PipoAndroid) console.log(`pipo:${message}`);
}

export function exitApp() {
  if (w.PipoAndroid) w.PipoAndroid.exit();
  else window.close();
}

/** En Android TV el teclado en pantalla se abre al pulsar OK sobre un campo de texto. */
export function showKeyboard() {
  if (w.PipoAndroid) w.PipoAndroid.showKeyboard();
}

// Mientras suena música o un video la pantalla no se apaga (ni entra el protector de pantalla).
const playing = { audio: false, video: false };
let awake = false;
export function setPlaying(kind: 'audio' | 'video', on: boolean) {
  playing[kind] = on;
  const want = playing.audio || playing.video;
  if (want === awake || !w.PipoAndroid) return;
  awake = want;
  try {
    w.PipoAndroid.keepAwake(want);
  } catch {
    // sin puente
  }
}

/** Avisa a quien esté reproduciendo que la app pasó a segundo plano. */
export const STOP_EVENT = 'pipo:stop';

export function installPlatform(onStop: () => void) {
  if (!w.PipoAndroid) return;
  document.documentElement.className += ' android-tv';
  // Con el teclado en pantalla la ventana se achica: la interfaz acomoda lo que se está escribiendo.
  let kb = false;
  const onResize = () => {
    const open = window.innerHeight > 0 && window.innerHeight < 860;
    if (open === kb) return;
    kb = open;
    const html = document.documentElement;
    html.className = html.className.replace(/\s*kb-open/g, '') + (open ? ' kb-open' : '');
    console.log(`pipo:teclado ${open}`);
  };
  window.addEventListener('resize', onResize);
  onResize();
  w.__pipoKey = (code: number) => {
    const target = (document.activeElement as HTMLElement | null) || document.body;
    let e: KeyboardEvent;
    try {
      e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true });
    } catch {
      e = document.createEvent('KeyboardEvent');
      e.initEvent('keydown', true, true);
    }
    Object.defineProperty(e, 'keyCode', { get: () => code });
    Object.defineProperty(e, 'which', { get: () => code });
    target.dispatchEvent(e);
  };
  w.__pipoLifecycle = (state: string) => {
    if (state !== 'stop') return;
    onStop();
    try {
      window.dispatchEvent(new CustomEvent(STOP_EVENT));
    } catch {
      const ev = document.createEvent('CustomEvent');
      ev.initCustomEvent(STOP_EVENT, false, false, null);
      window.dispatchEvent(ev);
    }
  };
}
