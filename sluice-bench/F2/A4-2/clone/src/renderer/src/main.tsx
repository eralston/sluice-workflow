import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/caveat/400.css';
import './styles.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './panels/ErrorBoundary';

const root = createRoot(document.getElementById('root')!);
// The art gallery loads only when main started in gallery mode (npm run gallery, dev builds only).
if (window.starChart.env.gallery) void import('./gallery/Gallery').then(({ Gallery }) => root.render(<Gallery />));
else root.render(<ErrorBoundary><App /></ErrorBoundary>);
