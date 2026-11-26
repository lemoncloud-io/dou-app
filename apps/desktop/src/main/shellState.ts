import type { AppBridgeHost } from '@chatic/bridges';

export const shellState: { isQuitting: boolean; mainHost: AppBridgeHost | null } = {
    isQuitting: false,
    mainHost: null,
};
