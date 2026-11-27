import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startAlarm } from './lib/alarm';
import { startAutoLocate } from './lib/auto-locate';
import { startLive } from './lib/live-store';
import './styles.css';

// Arranque único: WebSocket en vivo, georreferenciación automática
// (y /api/map/status, iniciado al importar lib/api).
startLive();
startAutoLocate();
startAlarm();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
