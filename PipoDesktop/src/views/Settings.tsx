import { useEffect, useState } from 'react';
import type { AppInfo } from '../../shared/types';
import { api } from '../api';
import { Segmented, ViewTitle } from '../components/Common';
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

  useEffect(() => {
    void api.appInfo().then(setInfo);
    void api.ytVersion().then(setYtVersion);
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
