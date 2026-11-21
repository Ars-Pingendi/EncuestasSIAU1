import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initData } from './state/data';
import { initEq } from './state/eq';
import { initLibrary } from './state/library';
import { initPlayer, restoreQueue } from './state/player';
import { initVideos } from './state/videos';
import './styles.css';

async function start() {
  await initData();
  await initLibrary();
  await initVideos();
  initPlayer();
  await restoreQueue();
  createRoot(document.getElementById('root')!).render(<App />);
  // Los dispositivos de audio se consultan después de mostrar la ventana.
  void initEq();
}

void start();
