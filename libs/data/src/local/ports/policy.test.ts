import { resolveBaseScope, resolveScopedContext } from './policy';
import type { DataContext, DataContextProvider } from '../../repositories/types';

const providerFor = (context: DataContext): DataContextProvider => ({
    getContext: () => context,
    setContext: () => undefined,
});

describe('resolveBaseScope — uid does not fall back', () => {
    it('returns {cid, uid} as is when there is a session', () => {
        expect(resolveBaseScope(providerFor({ cid: 'cloud-a', uid: 'me' }))).toEqual({
            cid: 'cloud-a',
            uid: 'me',
        });
    });

    // `'default'` for cid is a partition that really exists (the relay), so falling back is right. There is no counterpart for uid.
    it('falls back to the relay partition when only cid is empty', () => {
        expect(resolveBaseScope(providerFor({ uid: 'me' }))).toEqual({ cid: 'default', uid: 'me' });
    });

    /**
     * The incident this track is named for. A relay logout nulls the uid, and the old code filled that
     * with `'default'` and then read and wrote in a ghost partition. Logging in returns to the real uid,
     * so the rows and sync cursors written in between were never read again.
     */
    it('null when uid is absent — there is no partition to fall back to', () => {
        expect(resolveBaseScope(providerFor({ cid: 'cloud-a' }))).toBeNull();
        expect(resolveBaseScope(providerFor({ cid: 'cloud-a', uid: '' }))).toBeNull();
        expect(resolveBaseScope(providerFor({}))).toBeNull();
    });

    it("does not fill uid with 'default'", () => {
        expect(resolveBaseScope(providerFor({ cid: 'default' }))).not.toEqual({
            cid: 'default',
            uid: 'default',
        });
    });
});

describe('resolveScopedContext — the domain policy', () => {
    it('propagates null when there is no session', () => {
        expect(resolveScopedContext('channel', providerFor({ cid: 'cloud-a' }))).toBeNull();
        expect(resolveScopedContext('meta', providerFor({}))).toBeNull();
    });

    // Whoever opened an invite link may not be logged in yet. A fixed partition has a clear destination with no session.
    it('invitecloud uses the global partition even with no session', () => {
        expect(resolveScopedContext('invitecloud', providerFor({}))).toEqual({
            cid: 'global',
            uid: 'global',
        });
    });
});
