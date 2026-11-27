import { StrictMode } from 'react';

import * as ReactDOM from 'react-dom/client';

import { logger } from '@chatic/bridges';
import { migrateLegacyPhoneCountry } from '@chatic/shared/phone';
import { startRuntime } from '@chatic/runtime-hybrid-web';

import { desktopStores } from './config/adapters';
import { desktopWeb } from './config/desktop-web';
import { configureAppStores } from './app/storage';
import { applyAppearance, useAppearancePrefsStore } from './app/shared/stores/useAppearancePrefsStore';

import App from './app/app';

configureAppStores({ device: desktopStores.device, tab: desktopStores.tab, plain: desktopStores.plain });

try {
    await startRuntime(desktopWeb);
} catch (error) {
    logger.error('app.runtime_start_failed', '[desktop-web] the runtime did not start; the page is not rendered', {
        error,
    });
    throw error;
}

migrateLegacyPhoneCountry(desktopStores.webLocal);

applyAppearance(useAppearancePrefsStore.getState());

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
    <StrictMode>
        <App />
    </StrictMode>
);
