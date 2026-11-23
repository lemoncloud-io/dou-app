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

    it('falls back to the relay partition when only cid is empty', () => {
        expect(resolveBaseScope(providerFor({ uid: 'me' }))).toEqual({ cid: 'default', uid: 'me' });
    });

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

    it('invitecloud uses the global partition even with no session', () => {
        expect(resolveScopedContext('invitecloud', providerFor({}))).toEqual({
            cid: 'global',
            uid: 'global',
        });
    });
});
