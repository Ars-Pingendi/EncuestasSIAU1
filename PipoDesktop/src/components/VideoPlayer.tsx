// Visor de videos de YouTube (sin anuncios): imagen hasta 1080p y audio por separado, unidos con
// el mismo reproductor adaptativo que usa la app de la TV. Si eso falla, video con audio incluido.
// Si el video ya se descargó, se ve desde el archivo MP4, sin internet.
import { useEffect, useRef, useState } from 'react';
import type { Track } from '../../shared/types';
import { api } from '../api';
import { AdaptivePlayer, type AdaptiveSpec } from '../lib/adaptive';
import { errorText, request } from '../lib/net';
import { sendToTv, tvSharing } from '../lib/tv';
import { pausePlayback, playTracks } from '../state/player';
import { closeDialog, openDialog } from '../state/ui';
import { downloadVideo, videoDownloaded, videos as videoStore } from '../state/videos';
import { useStore } from '../lib/store';
import { Icon } from './Icon';

interface Plan {
  title: string;
  mode: 'adaptive' | 'direct';
  url: string;
  durationMs: number;
  info: string;
  adaptive?: AdaptiveSpec;
}

export function openVideo(track: Track) {
  if (!track.videoId) return;
  pausePlayback();
  openDialog(<VideoPlayer track={track} />);
}

function fetchPlan(videoId: string, forceDirect: boolean) {
  return request(`${api.ytVideoBase}/${videoId}/play?h=1080${forceDirect ? '&force=direct' : ''}`, { timeoutMs: 90_000, timeoutMessage: 'YouTube tardó demasiado en responder' });
}

export function VideoPlayer({ track }: { track: Track }) {
  const video = useRef<HTMLVideoElement>(null);
  const adaptive = useRef<AdaptivePlayer | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [status, setStatus] = useState<string | null>('Consultando a YouTube…');
  const [error, setError] = useState<string | null>(null);
  const [quality, setQuality] = useState(-1);
  const videoId = track.videoId!;
  const local = useRef(false);
  const downloaded = useStore(videoStore, (s) => s.downloads.get(videoId));
  const dl = useStore(videoStore, (s) => s.state[videoId]);

  useEffect(() => {
    let dead = false;
    const v = video.current!;
    const stopAdaptive = () => {
      adaptive.current?.destroy();
      adaptive.current = null;
    };
    // Reserva: el video con audio incluido (normalmente 360p).
    const fallback = async (why: string, at: number) => {
      stopAdaptive();
      setStatus('Probando con el video con audio incluido…');
      try {
        const r = await fetchPlan(videoId, true).promise;
        if (r.status !== 200) throw new Error(errorText(r));
        const p = JSON.parse(r.body as string) as Plan;
        if (dead) return;
        if (!p.url) throw new Error(why);
        setPlan(p);
        v.src = p.url;
        if (at > 0) v.addEventListener('loadedmetadata', () => (v.currentTime = at), { once: true });
        void v.play().catch(() => undefined);
      } catch (err) {
        if (!dead) setError(`No se pudo reproducir: ${why}${(err as Error).message !== why ? ` · ${(err as Error).message}` : ''}`);
      }
    };
    let req: ReturnType<typeof fetchPlan> | null = null;
    const stream = () => {
      if (local.current) setPlan(null);
      local.current = false;
      setStatus('Consultando a YouTube…');
      req = fetchPlan(videoId, false);
      req.promise
        .then((r) => {
          if (r.status !== 200) throw new Error(errorText(r) || `Error ${r.status}`);
          const p = JSON.parse(r.body as string) as Plan;
          if (dead) return;
          setPlan(p);
          if (p.mode === 'adaptive' && p.adaptive) {
            setStatus('Cargando imagen y audio…');
            const ap = new AdaptivePlayer(v, (path) => path, p.adaptive, p.durationMs / 1000, 0, (msg) => {
              if (!dead) void fallback(msg, v.currentTime || 0);
            });
            adaptive.current = ap;
            setQuality(p.adaptive.selected);
            ap.attach();
          } else {
            v.src = p.url;
          }
          void v.play().catch(() => undefined);
        })
        .catch((err: Error) => {
          if (!dead && err.message !== 'Cancelada') setError(err.message);
        });
    };
    const file = videoDownloaded(videoId);
    if (file) {
      // Descargado: se ve desde el MP4. Si el archivo ya no está (lo borraron), se pide a YouTube.
      local.current = true;
      setStatus('Abriendo el video descargado…');
      setPlan({ title: file.title, mode: 'direct', url: '', durationMs: file.durationMs, info: 'Descargado · sin internet' });
      v.addEventListener(
        'error',
        () => {
          if (!dead && local.current) stream();
        },
        { once: true },
      );
      v.src = `pipo://media/vfile/${encodeURIComponent(videoId)}`;
      void v.play().catch(() => undefined);
    } else stream();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) closeDialog();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      dead = true;
      req?.abort();
      window.removeEventListener('keydown', onKey);
      stopAdaptive();
      v.pause();
      v.removeAttribute('src');
      v.load();
    };
  }, [videoId]);

  const videos = plan?.mode === 'adaptive' ? plan.adaptive?.videos ?? [] : [];
  return (
    <div className="video-overlay" onMouseDown={(e) => e.target === e.currentTarget && closeDialog()}>
      <div className="video-box" role="dialog" aria-label={track.title}>
        <div className="video-head">
          <div className="grow">
            <div className="video-title">{plan?.title || track.title}</div>
            <div className="muted small">{track.artist}{plan?.info ? ` · ${plan.info}` : ''}</div>
          </div>
          <button type="button" className="video-close" aria-label="Cerrar" title="Cerrar (Esc)" onClick={() => closeDialog()}>
            <Icon name="close" size={22} />
          </button>
        </div>
        <div className="video-frame">
          <video
            ref={video}
            className="video-el"
            controls
            autoPlay
            onPlaying={() => setStatus(null)}
            onError={() => {
              if (!adaptive.current && !local.current && plan?.mode === 'direct' && plan.url) setError('No se pudo reproducir el video.');
            }}
          />
          {(status || error) && (
            <div className="video-status">
              {!error && <div className="spinner" />}
              <div>{error ?? status}</div>
            </div>
          )}
        </div>
        <div className="video-bar">
          {videos.length > 1 && (
            <label className="video-quality">
              Calidad{' '}
              <select
                value={quality}
                onChange={(e) => {
                  const i = Number(e.target.value);
                  setQuality(i);
                  void adaptive.current?.setQuality(i);
                }}
              >
                {videos.map((q, i) => (
                  <option key={q.height} value={i}>
                    {q.label}
                    {q.fps > 30 ? ` ${q.fps} fps` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="grow" />
          {downloaded ? (
            <button type="button" className="btn outline" title="Mostrar el archivo MP4 en la carpeta" onClick={() => void api.ytShowVideoInFolder(videoId)}>
              <Icon name="downloadDone" size={20} /> Descargado
            </button>
          ) : dl?.state === 'queued' || dl?.state === 'running' ? (
            <button type="button" className="btn outline" title="Cancelar la descarga" onClick={() => void api.ytCancelVideoDownload(videoId)}>
              <div className="spinner small" /> {dl.state === 'queued' ? 'En espera…' : `Descargando ${Math.round((dl.progress ?? 0) * 100)} %`}
            </button>
          ) : (
            <button type="button" className="btn outline" title="Guardar el video en MP4 (hasta 1080p) para verlo sin internet" onClick={() => downloadVideo(track)}>
              <Icon name="download" size={20} /> Descargar
            </button>
          )}
          {tvSharing() && (
            <button
              type="button"
              className="btn outline"
              onClick={() => {
                video.current?.pause();
                void sendToTv('video', [track]);
              }}
            >
              <Icon name="tv" size={20} /> Ver en la TV
            </button>
          )}
          <button
            type="button"
            className="btn outline"
            onClick={() => {
              closeDialog();
              playTracks([track]);
            }}
          >
            <Icon name="note" size={20} /> Solo audio
          </button>
        </div>
      </div>
    </div>
  );
}
