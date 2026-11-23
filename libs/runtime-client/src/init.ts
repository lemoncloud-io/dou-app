import { logger } from '@chatic/logger';
import type { RuntimeEngine } from '@chatic/runtime-core';

import { attachLogoutCallbacks } from './session/logoutCallbacks';

let engine: RuntimeEngine | null = null;

export const initAppRuntime = (next: RuntimeEngine): void => {
    if (engine && engine !== next) {
        logger.warn('WEB_CORE', '[initAppRuntime] the engine was replaced — mounted hosts keep the previous one');
    }
    engine = next;
    attachLogoutCallbacks(next);
};

export const runtimeEngine = (): RuntimeEngine => {
    if (!engine) {
        throw new Error(
            '[runtime] the runtime engine was read before initAppRuntime(engine) — the entry point has to ' +
                'start one (startRuntime with the app declaration) before render.'
        );
    }
    return engine;
};

export const resetRuntimeEngine = (): void => {
    engine = null;
};
