import { describe, expect, it } from 'vitest';

import { linkedSignInOf } from './linkedSignIn';

describe('linkedSignInOf', () => {
    it('reads a guest from the relay user role, whatever link$ holds', () => {
        expect(linkedSignInOf({ userRole: 'guest', link$: { social: { provider: 'google' } } })).toEqual({
            kind: 'guest',
        });
    });

    it('is unknown when there is no relay user', () => {
        expect(linkedSignInOf(null)).toEqual({ kind: 'unknown' });
    });

    it('is unknown, not "none", when the server sent no link$ slot', () => {
        expect(linkedSignInOf({ userRole: 'user' })).toEqual({ kind: 'unknown' });
    });

    it('names the social provider and its hint first', () => {
        expect(
            linkedSignInOf({
                userRole: 'user',
                link$: { social: { provider: 'google', hint: 'a***@example.com' }, phone: { hint: '1234' } },
            })
        ).toEqual({ kind: 'social', provider: 'google', hint: 'a***@example.com' });
    });

    it('falls back to the phone when no social account is linked', () => {
        expect(linkedSignInOf({ userRole: 'user', link$: { phone: { hint: '1234' } } })).toEqual({
            kind: 'phone',
            hint: '1234',
        });
    });

    it('falls back to the email when neither a social account nor a phone is linked', () => {
        expect(linkedSignInOf({ userRole: 'user', link$: { email: { hint: 'a***@example.com' } } })).toEqual({
            kind: 'email',
            hint: 'a***@example.com',
        });
    });

    it('is none when the slot is there and empty', () => {
        expect(linkedSignInOf({ userRole: 'user', link$: {} })).toEqual({ kind: 'none' });
    });
});
