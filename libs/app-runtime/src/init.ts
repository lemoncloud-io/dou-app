import { logger } from '@chatic/logger';
import type { RuntimeEngine } from '@chatic/runtime-core';

let engine: RuntimeEngine | null = null;

/**
 * Hands the React surface its engine. **Every app calls this once from its entry point, before render**,
 * with the engine its platform built — `createWebRuntime(...)` from `@chatic/runtime-web` in a page.
 * Building the engine is what wires the runtime; this only tells the hooks and the hosts where to start
 * their lifecycle work from.
 *
 * Called once. A second call with a different engine replaces it, and says so: the hosts and hooks
 * already mounted keep what the first engine made, so the two would run side by side.
 */
export const initAppRuntime = (next: RuntimeEngine): void => {
    if (engine && engine !== next) {
        logger.warn('WEB_CORE', '[initAppRuntime] the engine was replaced — mounted hosts keep the previous one');
    }
    engine = next;
};

/**
 * The engine `initAppRuntime` was handed. Throws until then: there is no engine to fall back on, and a
 * host that mounted before the entry point booted the runtime would otherwise start nothing, silently.
 */
export const runtimeEngine = (): RuntimeEngine => {
    if (!engine) {
        throw new Error(
            '[app-runtime] the runtime engine was read before initAppRuntime(engine) — the entry point has to ' +
                'build one (createWebRuntime in a page) and hand it over before render.'
        );
    }
    return engine;
};

/** Tests only: back to no engine. */
export const resetRuntimeEngine = (): void => {
    engine = null;
};
