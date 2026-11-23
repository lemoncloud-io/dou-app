import { config } from '@chatic/config';

import { relayStore } from './relayStore';

export const configureSessionStore = (): void => {
    relayStore.configureEndpoints({
        backend: () => config.get<string>('net.relay.backend') ?? '',
        wss: () => config.get<string>('net.relay.wss') ?? '',
    });
};
