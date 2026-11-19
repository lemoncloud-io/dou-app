import { StrictMode } from 'react';

import * as ReactDOM from 'react-dom/client';

import { logger } from '@chatic/bridges';
import { migrateLegacyPhoneCountry } from '@chatic/shared/phone';
import { startRuntime } from '@chatic/runtime-web';

import { desktopStores } from './config/adapters';
import { desktopWeb } from './config/desktop-web';
import { configureAppStores } from './app/storage';
import { applyAppearance, useAppearancePrefsStore } from './app/shared/stores/useAppearancePrefsStore';

import App from './app/app';

// The app's own features keep their state in the window's stores (`config/adapters/stores.ts`), the
// same objects the runtime and `@chatic/config` are handed.
configureAppStores({ device: desktopStores.device, tab: desktopStores.tab, plain: desktopStores.plain });

// Start the runtime the page declares (`config/desktop-web.ts`) before render. The start initialises
// `@chatic/config` from the declaration's ports first, publishes the host's ports before anything that
// renders could read one, loads the shell's vault when it keeps one, then builds each port and boots
// the runtime. This is the app's only boot call; nothing above reads the session.
//
// A failed start is logged under its own tag and thrown on, so it stays the uncaught error a boot
// failure always was, and the page does not render on a runtime that never came up.
try {
    await startRuntime(desktopWeb);
} catch (error) {
    logger.error('app.runtime_start_failed', '[desktop-web] the runtime did not start; the page is not rendered', {
        error,
    });
    throw error;
}

// The phone fields' last-picked country moved from its own key into the `ui.phoneCountry` setting;
// carried over once, now that the setting can be written.
migrateLegacyPhoneCountry(desktopStores.webLocal);

// Reading preferences go onto the document root before the first paint. The store hydrates from the
// device store (localStorage) synchronously, so a reader who picked a larger size never sees the
// default one flash.
applyAppearance(useAppearancePrefsStore.getState());

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
    <StrictMode>
        <App />
    </StrictMode>
);
