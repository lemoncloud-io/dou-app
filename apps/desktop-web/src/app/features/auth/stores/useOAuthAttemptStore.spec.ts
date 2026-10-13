import { beforeEach, describe, expect, it } from 'vitest';

import { selectHeldLogin, useOAuthAttemptStore } from './useOAuthAttemptStore';

const store = () => useOAuthAttemptStore.getState();

describe('useOAuthAttemptStore', () => {
    beforeEach(() => useOAuthAttemptStore.setState({ attempt: null, failed: false, linkFailure: null }));

    it('holds Welcome only for a login begun signed out', () => {
        store().begin({ provider: 'google', intent: 'login', signedOutAtStart: true });
        expect(selectHeldLogin(store())).toBe(true);

        store().begin({ provider: 'google', intent: 'login', signedOutAtStart: false });
        expect(selectHeldLogin(store())).toBe(false);

        store().begin({ provider: 'google', intent: 'link', signedOutAtStart: false });
        expect(selectHeldLogin(store())).toBe(false);
    });

    it('records where the browser was sent, for an attempt that exists', () => {
        store().opened(1, 'n');
        expect(store().attempt).toBeNull();

        store().begin({ provider: 'google', intent: 'login', signedOutAtStart: true });
        store().opened(1, 'n');
        expect(store().attempt).toMatchObject({ startedAt: 1, nonce: 'n' });
    });

    it('marks a failure only on a pending attempt, and a new attempt starts clean', () => {
        store().fail();
        expect(store().failed).toBe(false);

        store().begin({ provider: 'google', intent: 'link', signedOutAtStart: false });
        store().fail();
        store().setLinkFailure('occupied');
        expect(store().failed).toBe(true);

        store().begin({ provider: 'google', intent: 'link', signedOutAtStart: false });
        expect(store().failed).toBe(false);
        expect(store().linkFailure).toBeNull();
    });
});
