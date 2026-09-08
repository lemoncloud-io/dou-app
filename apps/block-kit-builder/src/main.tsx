import { StrictMode } from 'react';

import * as ReactDOM from 'react-dom/client';

import { ThemeProvider } from '@chatic/theme';

import { App } from './app/app';
// The payload editor's colours. index.html links `styles.css` itself so the panes
// never flash unstyled; this one has nothing to do with first paint, so it rides
// in with the bundle instead of costing a second blocking request.
import './syntax.css';

// No `initAppRuntime()` here, unlike the other apps. The builder holds no session
// and sends nothing — booting the engine would open a socket for a tool that has
// no channel to talk to.
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
    <StrictMode>
        {/* `system` matches what index.html resolves before first paint, so an
            untouched builder does not change theme once React takes over. The
            storage key is the other apps' too — one preference per machine. */}
        <ThemeProvider defaultTheme="system">
            <App />
        </ThemeProvider>
    </StrictMode>
);
