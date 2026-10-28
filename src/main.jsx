import { createRoot } from 'react-dom/client';
import App from './App.jsx';

// Animasi CSS dibekukan selama dokumen tidak terlihat (tab latar belakang, panel pratinjau
// yang tidak pernah dapat fokus). Tanpa flag ini, iringan masuk yang dimulai dari opacity 0
// menahan seluruh laporan tetap transparan selamanya. Lihat aturan [data-motion='off'] di
// src/index.css dan tests/style-contract.test.mjs.
const root = document.documentElement;
let watched = false;

function syncMotion() {
  const visible = document.visibilityState === 'visible';
  root.dataset.motion = visible ? 'on' : 'off';
  if (visible && watched) {
    document.removeEventListener('visibilitychange', syncMotion);
    watched = false;
  }
}

syncMotion();
if (document.visibilityState !== 'visible') {
  watched = true;
  document.addEventListener('visibilitychange', syncMotion);
}

createRoot(document.getElementById('root')).render(<App />);
