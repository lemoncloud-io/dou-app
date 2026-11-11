import { createRuntime } from '@chatic/runtime-core';

import type { RuntimeConfig } from '@chatic/runtime-core';

/** What an app boots the runtime with — the platform's ports and its own policies. */
export type AppRuntimeConfig = RuntimeConfig;

/**
 * Boots the runtime. **Every app calls this once from its entry point, before render**, after its
 * logging wiring and before anything reads the session. The assembly itself is `createRuntime` in
 * `@chatic/runtime-core`; this is the name apps know it by.
 */
export const initAppRuntime = (config: AppRuntimeConfig): void => createRuntime(config);
