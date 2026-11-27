import type { ForegroundPort } from '@chatic/ports';

export const nodeForegroundPorts = (): ForegroundPort => ({
    read: () => true,
    subscribe: () => () => undefined,
});
