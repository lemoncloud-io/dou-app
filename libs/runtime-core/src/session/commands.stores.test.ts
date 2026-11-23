import { relayStore, sessionStores, setSelectedSiteId } from '@chatic/session';
import { MemoryStore } from '@chatic/storage';

import { createCoreSessionCommands } from './commands';
import { createCoreSessionView } from './sessionView';

beforeEach(() => {
    sessionStores.configure({ secret: new MemoryStore(), plain: new MemoryStore() });
    relayStore.configureEndpoints({ backend: () => 'https://relay', wss: () => 'wss://relay' });
});

describe('a core command, once resolved', () => {
    const commands = createCoreSessionCommands();

    it('is in the session view — a profile patch', async () => {
        const view = createCoreSessionView();
        relayStore.saveRelayToken({ uid: 'u1', name: 'Before', Token: { identityToken: 'relay-u1' } } as never);
        expect(view.snapshot().relayUser?.name).toBe('Before');

        await commands.patchRelayUser({ name: 'After' });

        expect(view.snapshot().relayUser?.name).toBe('After');
    });

    it('is in the session view — a cleared place selection', async () => {
        const view = createCoreSessionView();
        setSelectedSiteId('site-1');
        expect(view.snapshot().context.relay.siteId).toBe('site-1');

        await commands.clearSiteSelection();

        expect(view.snapshot().context.relay.siteId).toBeNull();
    });
});
