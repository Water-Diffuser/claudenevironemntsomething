import '@fontsource-variable/fraunces';
import '@fontsource-variable/fraunces/wght-italic.css';
import '@fontsource-variable/nunito';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/playfair-display';
import '@fontsource/vt323';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
