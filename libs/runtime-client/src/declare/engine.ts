import type { EngineAdapter } from './types';

export const engineCore: EngineAdapter<unknown, never> = {
    id: 'engine.core',
    port: 'engine',
    create: async ({ core }) => ({ engine: await core() }),
};
