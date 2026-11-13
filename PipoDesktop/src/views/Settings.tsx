import { useEffect, useState } from 'react';
import type { AppInfo, TvStatus, VideoStatus } from '../../shared/types';
import { api } from '../api';
import { Segmented, Switch, ViewTitle } from '../components/Common';
import { ConfirmDialog } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { plural } from '../lib/format';
import { useStore } from '../lib/store';
import { data, updateSettings, updateUser, type Theme } from '../state/data';
import { lib } from '../state/library';
import { navigate, openDialog, toast } from '../state/ui';

const SHORTCUTS: [string, string][] = [
  ['Espacio', 'Reproducir / pausar'],
  ['Ctrl + → / Ctrl + ←', 'Siguiente / anterior'],
  ['→ / ←', 'Adelantar / retroceder 5 s'],
  ['Ctrl + ↑ / Ctrl + ↓', 'Subir / bajar volumen'],
  ['M', 'Silenciar'],
  ['Ctrl + F', 'Buscar'],
  ['Ctrl + E', 'Ecualizador'],
  ['Alt + ←', 'Atrás'],
  ['Esc', 'Cerrar el reproductor o un menú'],
];

export function SettingsView() {
  const theme = useStore(data, (s) => s.settings.theme);
  const folders = useStore(lib, (s) => s.folders);
  const count = useStore(lib, (s) => s.tracks.length);
  const progress = useStore(lib, (s) => s.progress);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [ytVersion, setYtVersion] = useState('…');
  const [updating, setUpdating] = useState(false);
  const [tv, setTv] = useState<TvStatus | null>(null);
  const [video, setVideo] = useState<VideoStatus | null>(null);

  useEffect(() => {
    void api.appInfo().then(setInfo);
    void api.ytVersion().then(setYtVersion);
    void api.tvStatus().then(setTv);
    void api.videoStatus().then(setVideo);
    return api.onVideoProgress(setVideo);
  }, []);

  return (
    <div className="view settings">
      <ViewTitle title="Ajustes" />

      <section className="panel">
        <h2>Carpetas de música</h2>
        <p className="muted small">
          Pipo busca canciones en estas carpetas (y sus subcarpetas) y se actualiza solo cuando agregas o borras archivos. {plural(count, 'canción', 'canciones')} en tu biblioteca.
        </p>
        <div className="folder-settings">
          {folders.map((f) => (
            <div key={f} className="folder-setting">
              <Icon name="folder" size={22} />
              <span className="grow ellipsis" title={f}>{f}</span>
              <button
                type="button"
                className="btn text danger"
                onClick={() =>
                  openDialog(
                    <ConfirmDialog
                      title="Quitar carpeta"
                      text={`¿Dejar de buscar música en «${f}»? Los archivos no se borran.`}
                      confirm="Quitar"
                      onConfirm={() => void api.removeFolder(f)}
                    />,
                  )
                }
              >
                Quitar
              </button>
            </div>
          ))}
          {!folders.length && <div className="muted">No hay carpetas. Agrega una para empezar.</div>}
        </div>
        <div className="row-actions">
          <button type="button" className="btn filled" onClick={() => void api.addFolder()}>
            <Icon name="add" size={20} /> Agregar carpeta
          </button>
          <button type="button" className="btn outline" disabled={progress.scanning} onClick={() => void api.rescan().then(() => toast('Biblioteca actualizada'))}>
            <Icon name="refresh" size={20} /> {progress.scanning ? 'Buscando…' : 'Buscar música de nuevo'}
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Apariencia</h2>
        <div className="panel-row">
          <span className="grow">Tema</span>
          <Segmented<Theme>
            value={theme}
            onChange={(v) => updateSettings({ theme: v })}
            options={[
              { value: 'system', label: 'Como Windows' },
              { value: 'dark', label: 'Oscuro' },
              { value: 'light', label: 'Claro' },
            ]}
          />
        </div>
      </section>

      <section className="panel">
        <h2>Sonido</h2>
        <div className="panel-row">
          <span className="grow">Ecualizador, refuerzo de graves, sonido envolvente, amplificación y salida de audio</span>
          <button type="button" className="btn outline" onClick={() => navigate({ view: 'equalizer' })}>
            <Icon name="equalizer" size={20} /> Abrir ecualizador
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Pipo en la TV (LG webOS)</h2>
        <div className="panel-row">
          <div className="grow">
            <div>Compartir mi música con la TV</div>
            <div className="muted small">La app Pipo de la TV reproduce tu biblioteca, listas y favoritos desde este PC por la red de la casa (Wi-Fi o cable).</div>
          </div>
          <Switch checked={!!tv?.enabled} onChange={(on) => void api.tvSetEnabled(on).then(setTv)} label="Compartir mi música con la TV" />
        </div>
        {tv?.enabled && (
          <>
            {tv.running ? (
              <div className="tv-pair">
                <div>
                  <div className="muted small">En la TV, abre Pipo y escribe</div>
                  <div className="tv-big">{tv.addresses[0] ?? 'sin red'}{tv.port !== 37373 ? `:${tv.port}` : ''}</div>
                  {tv.addresses.length > 1 && <div className="muted small">Otras direcciones de este PC: {tv.addresses.slice(1).join(' · ')}</div>}
                </div>
                <div>
                  <div className="muted small">Código</div>
                  <div className="tv-big code">{tv.pin}</div>
                </div>
              </div>
            ) : (
              <div className="notice warn">No se pudo iniciar el servidor para la TV{tv.error ? `: ${tv.error}` : ''}.</div>
            )}
            <p className="muted small">El PC debe estar encendido y con Pipo abierto mientras escuchas en la TV. Si Windows pregunta, permite el acceso en <strong>redes privadas</strong>.</p>
            <div className="row-actions">
              <button type="button" className="btn outline" onClick={() => void api.tvNewPin().then(setTv)}>
                <Icon name="refresh" size={20} /> Cambiar código
              </button>
              <button type="button" className="btn text danger" disabled={!tv.paired} onClick={() => void api.tvUnpairAll().then((s) => (setTv(s), toast('Se olvidaron las TV emparejadas')))}>
                Olvidar TV emparejadas ({tv.paired})
              </button>
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <h2>Películas y series (para la TV)</h2>
        <p className="muted small">
          La app Pipo de la TV muestra los videos de estas carpetas (y sus subcarpetas) como películas y series, con sus subtítulos, pistas de audio y carátulas.
          Reconoce nombres como «Película (2021).mkv» y «Serie S01E02.mkv» o carpetas «Serie/Temporada 1». Para verlas, activa «Compartir mi música con la TV».
        </p>
        <div className="folder-settings">
          {(video?.folders ?? []).map((f) => (
            <div key={f} className="folder-setting">
              <Icon name="folder" size={22} />
              <span className="grow ellipsis" title={f}>{f}</span>
              <button type="button" className="btn text danger" onClick={() => void api.videoRemoveFolder(f).then(setVideo)}>
                Quitar
              </button>
            </div>
          ))}
          {video && !video.folders.length && <div className="muted">No hay carpetas de video. Agrega la que contiene tus películas y series.</div>}
        </div>
        <div className="panel-row">
          <div className="grow">
            {video?.scanning ? (
              <span className="muted">Analizando videos… {video.total ? `${video.done} de ${video.total}` : ''}</span>
            ) : (
              <span>
                {video ? `${plural(video.movies, 'película', 'películas')} · ${plural(video.series, 'serie', 'series')} (${plural(video.episodes, 'episodio', 'episodios')})` : ''}
              </span>
            )}
            {video && !video.ffmpeg && (
              <div className="notice warn">
                <Icon name="info" size={20} /> Falta ffmpeg: sin él Pipo no puede leer las pistas ni convertir videos que la TV no reproduce directamente.
              </div>
            )}
          </div>
        </div>
        <div className="row-actions">
          <button type="button" className="btn filled" onClick={() => void api.videoAddFolder().then((s) => s && setVideo(s))}>
            <Icon name="add" size={20} /> Agregar carpeta de video
          </button>
          <button type="button" className="btn outline" disabled={video?.scanning} onClick={() => void api.videoRescan().then(setVideo)}>
            <Icon name="refresh" size={20} /> Buscar videos de nuevo
          </button>
          <button type="button" className="btn text" onClick={() => void api.videoOpenLog()}>
            <Icon name="info" size={20} /> Ver registro de video
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>YouTube</h2>
        <div className="panel-row">
          <div className="grow">
            <div>Componente de YouTube (yt-dlp)</div>
            <div className="muted small">Versión {ytVersion}. Si YouTube deja de funcionar, actualízalo.</div>
          </div>
          <button
            type="button"
            className="btn outline"
            disabled={updating}
            onClick={async () => {
              setUpdating(true);
              try {
                toast(await api.ytUpdate());
                setYtVersion(await api.ytVersion());
              } catch (err) {
                toast(String((err as Error).message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
              } finally {
                setUpdating(false);
              }
            }}
          >
            <Icon name="refresh" size={20} /> {updating ? 'Actualizando…' : 'Actualizar componente de YouTube'}
          </button>
        </div>
        <div className="panel-row">
          <div className="grow">
            <div>Descargas</div>
            <div className="muted small ellipsis" title={info?.downloadsDir}>Se guardan dentro de la app: {info?.downloadsDir}</div>
          </div>
          <button type="button" className="btn outline" onClick={() => void api.openDownloadsFolder()}>
            <Icon name="folder" size={20} /> Abrir carpeta
          </button>
        </div>
        <div className="panel-row">
          <div className="grow">
            <div>Registro de errores de YouTube</div>
            <div className="muted small">Si algo de YouTube falla, aquí queda el detalle técnico.</div>
          </div>
          <button type="button" className="btn outline" onClick={() => void api.ytOpenLog()}>
            <Icon name="info" size={20} /> Ver registro
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Datos</h2>
        <div className="panel-row">
          <div className="grow">
            <div>Historial y estadísticas</div>
            <div className="muted small">Borra «Más reproducidas» y «Reproducidas recientemente». No toca tus listas ni favoritos.</div>
          </div>
          <button
            type="button"
            className="btn text danger"
            onClick={() =>
              openDialog(
                <ConfirmDialog title="Borrar historial" text="¿Borrar el historial de reproducción?" confirm="Borrar" onConfirm={() => (updateUser(() => ({ stats: {} })), toast('Historial borrado'))} />,
              )
            }
          >
            Borrar historial
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Atajos de teclado</h2>
        <div className="shortcuts">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="shortcut">
              <kbd>{k}</kbd>
              <span>{v}</span>
            </div>
          ))}
        </div>
        <p className="muted small">También funcionan las teclas multimedia del teclado, los controles de la barra de tareas y el panel multimedia de Windows.</p>
      </section>

      <section className="panel about">
        <img src="./icon.png" alt="" width={64} height={64} />
        <div>
          <h2>Pipo Music Player {info?.version}</h2>
          <div className="muted small">Para Windows 10 y 11 · Electron {info?.electron} · Licencia GPL-3.0</div>
          <div className="muted small">Tus datos (listas, favoritos, ecualizador) se guardan en {info?.userData}</div>
        </div>
      </section>
    </div>
  );
}
