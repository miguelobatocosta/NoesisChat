import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Raleway, bundled locally by Vite (no CDN at runtime, BRAND.md §1).
import '@fontsource/raleway/400.css';
import '@fontsource/raleway/500.css';
import '@fontsource/raleway/600.css';
import '@fontsource/raleway/700.css';
import './styles/tokens.css';
import './styles/global.css';
import { App } from './app/App';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
