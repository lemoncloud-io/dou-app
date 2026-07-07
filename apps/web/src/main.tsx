import { StrictMode } from 'react';

import * as ReactDOM from 'react-dom/client';

import '@lemoncloud/page-transition-core/styles.css';

import App from './app/app';
import { pendingNavigationStore } from './app/bridge';
import { initWebVitals } from './app/utils';

// Initialize Web Vitals monitoring
initWebVitals();

// Capture native OnNavigate events before render: the native bridge flushes its
// buffered cold-start push tap on the first web→native message, which happens well
// before the router (and its navigation handler) mounts. Subscribing here guarantees
// the event is held instead of dropped. See pendingNavigationStore.
pendingNavigationStore.start();

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
    <StrictMode>
        <App />
    </StrictMode>
);
