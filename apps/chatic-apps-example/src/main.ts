import { ChaticAppsError, connect } from '@chatic/chatic-apps-sdk';
import { installChaticAppsMock, type MockPermission } from '@chatic/chatic-apps-sdk/mock';

import manifest from '../public/.well-known/chatic-app.json';
import { startApp } from './app';
import { mockData } from './mockData';
import './style.css';

const root = document.getElementById('app') as HTMLElement;

async function main() {
    // A stand-in for the app while the page is developed in a browser. The branch is always false in a
    // production build, so the bundler drops it and the mock with it — `chatic-apps check` confirms it.
    if (import.meta.env.DEV) {
        const app = installChaticAppsMock({ permissions: manifest.permissions as MockPermission[], data: mockData });
        Object.assign(window, { app }); // `app.pressBack()`, `app.changeCloud()` … in the console
    }
    try {
        startApp(await connect(), root);
    } catch (error) {
        // `UNSUPPORTED_PROTOCOL`: the app is newer than this library; the page needs an update.
        const needsUpdate = error instanceof ChaticAppsError && error.code === 'UNSUPPORTED_PROTOCOL';
        root.textContent = needsUpdate ? 'This page needs an update.' : 'This page could not start.';
        root.dataset.state = 'failed';
    }
}

void main();
