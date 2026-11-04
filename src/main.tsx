import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/bodoni-moda/opsz.css';
import '@fontsource-variable/bodoni-moda/opsz-italic.css';
import '@fontsource-variable/josefin-sans';
import './index.css';
import PlayerApp from './player/PlayerApp';
import TvApp from './tv/TvApp';

const isTv = window.location.pathname.replace(/\/+$/, '') === '/tv';

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isTv ? <TvApp /> : <PlayerApp />}</StrictMode>,
);
