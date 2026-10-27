import { beforeEach, describe, expect, it } from 'vitest';

import { usePairingCodePageStore } from './usePairingCodePageStore';

describe('usePairingCodePageStore', () => {
    beforeEach(() => usePairingCodePageStore.getState().release());

    it('holds the page and remembers that this screen registered the guest', () => {
        usePairingCodePageStore.getState().hold(true);

        expect(usePairingCodePageStore.getState()).toMatchObject({ held: true, registeredGuest: true });
    });

    it('keeps the registered guest through a second hold, as a retry takes', () => {
        usePairingCodePageStore.getState().hold(true);
        usePairingCodePageStore.getState().hold(false);

        expect(usePairingCodePageStore.getState().registeredGuest).toBe(true);
    });

    it('clears everything on release', () => {
        usePairingCodePageStore.getState().hold(true);
        usePairingCodePageStore.getState().startLeaving();
        usePairingCodePageStore.getState().release();

        expect(usePairingCodePageStore.getState()).toMatchObject({
            held: false,
            registeredGuest: false,
            leaving: false,
        });
    });
});
