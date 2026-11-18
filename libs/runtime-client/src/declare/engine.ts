import type { EngineAdapter } from './types';

/**
 * `engine.core` — runtime-core's engine over the ports the declaration chose, every one of them built.
 * What every declaration without an `engine` slot runs, and the only engine a platform with a single
 * owner of its session needs. It settles nothing, so it hands back no `owner`.
 */
export const engineCore: EngineAdapter<unknown, never> = {
    id: 'engine.core',
    port: 'engine',
    create: async ({ core }) => ({ engine: await core() }),
};
