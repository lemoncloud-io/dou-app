import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

import { forgetInviteLogin, keepInviteLogin, readInviteLogin, resetInviteLogins } from './inviteLogins';
import { withoutToken } from './accountView';

const answer = (uid: string, cloudId?: string) =>
    ({ uid, cloudId, Token: { identityToken: `idt:${uid}` } }) as unknown as UserTokenView;

beforeEach(() => resetInviteLogins());

describe('invite logins', () => {
    it('hands back a handle and the cloud the answer names — never the token', () => {
        const login = keepInviteLogin(answer('invitee', 'aws-1'));

        expect(login).toEqual({ handle: expect.any(String), cloudId: 'aws-1' });
        expect(JSON.stringify(login)).not.toContain('idt:');
    });

    it('reads the answer by its handle, as often as a retried switch asks, until it is forgotten', () => {
        const kept = answer('invitee');
        const { handle } = keepInviteLogin(kept);

        expect(readInviteLogin(handle)).toBe(kept);
        expect(readInviteLogin(handle)).toBe(kept);

        forgetInviteLogin(handle);
        expect(readInviteLogin(handle)).toBeNull();
    });

    it('gives each answer its own handle', () => {
        const first = keepInviteLogin(answer('a'));
        const second = keepInviteLogin(answer('b'));

        expect(first.handle).not.toBe(second.handle);
        expect(readInviteLogin(first.handle)?.uid).toBe('a');
        expect(readInviteLogin(second.handle)?.uid).toBe('b');
    });

    it('forgets the oldest answers a flow never entered with, keeping only the last few', () => {
        const handles = ['a', 'b', 'c', 'd', 'e'].map(uid => keepInviteLogin(answer(uid)).handle);

        expect(readInviteLogin(handles[0])).toBeNull();
        expect(readInviteLogin(handles[4])?.uid).toBe('e');
    });

    it('is null for a handle it never gave', () => {
        expect(readInviteLogin('invite-login-404')).toBeNull();
    });

    it('gives handles a stale one cannot stand in for — a reset counter does not repeat them', () => {
        const first = keepInviteLogin(answer('a')).handle;
        resetInviteLogins();
        const second = keepInviteLogin(answer('b')).handle;

        expect(second).not.toBe(first);
        expect(readInviteLogin(first)).toBeNull();
    });
});

describe('withoutToken', () => {
    it("keeps the account's fields and drops the one that signs", () => {
        const view = {
            uid: 'u1',
            name: 'Me',
            createdAt: 1,
            Token: { identityToken: 'secret' },
        } as unknown as UserTokenView;

        expect(withoutToken(view)).toEqual({ uid: 'u1', name: 'Me', createdAt: 1 });
    });
});
