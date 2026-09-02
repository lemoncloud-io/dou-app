import { StrictMode } from 'react';

import * as ReactDOM from 'react-dom/client';

import { initAppRuntime } from '@chatic/app-runtime';

import App from './app/app';

// Boot the runtime before render. The console reads the session (its admin gate asks for the relay
// profile), and the session store refuses to resolve endpoints until this call wires them —
// previously it happened as a side effect of importing the session barrel (ADR-0070 5단계 follow-up).
// No data policies: the console uses the default repository and cache assembly.
initAppRuntime();

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
    <StrictMode>
        <App />
    </StrictMode>
);
