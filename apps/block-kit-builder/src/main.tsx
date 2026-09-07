import { StrictMode } from 'react';

import * as ReactDOM from 'react-dom/client';

import { App } from './app/app';

// No `initAppRuntime()` here, unlike the other apps. The builder holds no session
// and sends nothing — booting the engine would open a socket for a tool that has
// no channel to talk to.
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
    <StrictMode>
        <App />
    </StrictMode>
);
