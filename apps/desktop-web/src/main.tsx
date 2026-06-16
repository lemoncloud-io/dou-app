import { StrictMode } from 'react';

import * as ReactDOM from 'react-dom/client';

import App from './app/app';

// Desktop persistent storage (localStorage) is configured centrally in
// libs/web-core/src/core/index.ts via usePersistentStorage, which the webCore
// factory, coreStorage adapter, and logout-clear all share. This file no longer
// overrides the adapter — doing so here ran AFTER webCore was already constructed.

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
    <StrictMode>
        <App />
    </StrictMode>
);
