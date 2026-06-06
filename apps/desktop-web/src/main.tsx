import { StrictMode } from 'react';

import * as ReactDOM from 'react-dom/client';

import { setStorageAdapter } from '@chatic/web-core';

import App from './app/app';

// Desktop Shell runs in a persistent Electron window — use localStorage so the auth
// token (cloudCore) survives app restarts. web-core only auto-switches for RN WebView;
// the desktop shell (ChaticMessageHandler, not ReactNativeWebView) must opt in here.
// Must run before any webCore/cloudCore access (React hooks run after render).
if (typeof localStorage !== 'undefined') {
    setStorageAdapter(localStorage);
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
    <StrictMode>
        <App />
    </StrictMode>
);
