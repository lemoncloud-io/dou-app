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

    it('lists every linked method, social first, then phone, then email', () => {
        expect(
            linkedSignInOf({
                userRole: 'user',
                link$: {
                    email: { hint: 'a***@example.com' },
                    phone: { hint: '1234' },
                    social: { provider: 'google', hint: 'a***@gmail.com' },
                },
            })
        ).toEqual({
            kind: 'linked',
            methods: [
                { kind: 'social', provider: 'google', hint: 'a***@gmail.com' },
                { kind: 'phone', hint: '1234' },
                { kind: 'email', hint: 'a***@example.com' },
            ],
        });
    });

    it('lists the phone alone when only a number is linked', () => {
        expect(linkedSignInOf({ userRole: 'user', link$: { phone: { hint: '1234' } } })).toEqual({
            kind: 'linked',
            methods: [{ kind: 'phone', hint: '1234' }],
        });
    });

    it('is none when the slot is there and empty', () => {
        expect(linkedSignInOf({ userRole: 'user', link$: {} })).toEqual({ kind: 'none' });
    });
});
