import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MediaProvider } from 'media-react';
import { App } from './App.js';
import './styles.css';

/**
 * The API key is read here and nowhere else in the app.
 *
 * From this point it lives inside the client's transport closure. No component,
 * hook or event payload can reach it. If a second file in this app ever
 * references `VITE_PEXELS_API_KEY`, that is the bug.
 */
const apiKey = import.meta.env['VITE_PEXELS_API_KEY'] as string | undefined;

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    {apiKey ? (
      <MediaProvider apiKey={apiKey} logEvents>
        <App />
      </MediaProvider>
    ) : (
      <main className="missing-key">
        <h1>Missing Pexels API key</h1>
        <p>
          Copy <code>.env.example</code> to <code>.env</code> at the repo root and set{' '}
          <code>VITE_PEXELS_API_KEY</code>. Free keys: <a href="https://www.pexels.com/api/">pexels.com/api</a>.
        </p>
      </main>
    )}
  </StrictMode>,
);
