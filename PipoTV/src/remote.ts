// «Reproducir en la TV»: el teléfono Android manda órdenes (reproducir, a continuación, a la cola)
// y la TV las recibe preguntándole cada pocos segundos con una petición larga.
import { pollRemote, Unauthorized, type Connection, type RemoteCommand } from './api';
import { addToQueue, app, playNext, playTracks, releaseMusic, toast } from './state';
import { closeOverlay, openNowPlaying, switchMode } from './ui';
import { playVideo } from './views/player';
import { ytVideo } from './views/youtube';

let run = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function apply(c: RemoteCommand) {
  const tracks = c.tracks || [];
  if (!tracks.length) return;
  if (c.type === 'video') {
    // «Ver en la TV» desde el teléfono: se deja lo que hubiera y se abre el video de YouTube.
    const t = tracks[0];
    releaseMusic();
    closeOverlay(false);
    if (app.hasYoutube && app.mode !== 'video') switchMode('video', false);
    toast(`Desde el teléfono: «${t.title}»`);
    playVideo(ytVideo({ id: t.id, title: t.title, durationMs: t.durationMs }), { resume: false });
    return;
  }
  app.library.addExtra(tracks);
  if (c.type === 'play') {
    // Lo que se manda desde el teléfono tiene prioridad: se deja el video (si lo había) y se pasa a Música.
    closeOverlay(false);
    if (app.mode === 'video') switchMode('music', false);
    playTracks(tracks, Math.max(0, Math.min(c.start || 0, tracks.length - 1)), false);
    toast(`Desde el teléfono: «${tracks[Math.min(c.start || 0, tracks.length - 1)].title}»`);
    openNowPlaying();
  } else if (c.type === 'playNext') {
    playNext(tracks);
  } else {
    addToQueue(tracks);
  }
}

async function loop(conn: Connection, my: number) {
  let since = -1;
  let failures = 0;
  while (my === run) {
    try {
      const poll = await pollRemote(conn, since);
      if (my !== run) return;
      failures = 0;
      since = poll.seq;
      for (const c of poll.commands || []) apply(c);
    } catch (err) {
      if (my !== run || err instanceof Unauthorized) return;
      // Sin conexión (teléfono bloqueado o fuera del Wi-Fi): se reintenta y se vuelve a sincronizar.
      since = -1;
      failures++;
      await sleep(Math.min(15000, 1000 * failures));
    }
  }
}

/** Empieza a escuchar las órdenes del teléfono (solo si el equipo conectado lo ofrece). */
export function startRemote(conn: Connection) {
  const my = ++run;
  void loop(conn, my);
}

export function stopRemote() {
  run++;
}
