import { maskCredential, maskText, redactCredentials } from './redact';

describe('redactCredentials', () => {
    it('masks every credential field at any depth and leaves the rest alone', () => {
        const value = {
            result: { provider: 'google', idToken: 'eyJhbGciOi-123456', accessToken: 'ya29.abcdef' },
            headers: { Authorization: 'Bearer secret-value', Accept: 'json' },
            list: [{ refreshToken: 'r-token-1' }],
        };

        expect(redactCredentials(value)).toEqual({
            result: { provider: 'google', idToken: 'eyJhbG…(17)', accessToken: 'ya29.a…(11)' },
            headers: { Authorization: 'Bearer…(19)', Accept: 'json' },
            list: [{ refreshToken: 'r-toke…(9)' }],
        });
        expect(value.result.idToken).toBe('eyJhbGciOi-123456');
    });

    it('survives a value that refers to itself', () => {
        const value: Record<string, unknown> = { a: 1 };
        value['self'] = value;

        expect(redactCredentials(value)).toEqual({ a: 1, self: '[circular]' });
    });

    it('keeps the first six characters and the length', () => {
        expect(maskCredential('abcdefghij')).toBe('abcdef…(10)');
    });
});

describe('redactCredentials, beyond named fields', () => {
    const jwt = `eyJhbGciOiJSUzI1NiJ9.${'p'.repeat(40)}.${'s'.repeat(20)}`;

    it('masks a token inside free text, wherever the page put it', () => {
        expect(redactCredentials(['sending', `token=${jwt} done`, 'Authorization: Bearer abcdefghijklmnop'])).toEqual([
            'sending',
            `token=${maskCredential(jwt)} done`,
            'Authorization: Bearer …',
        ]);
    });

    it('masks any field whose name says it is a secret, not only the sign-in ones', () => {
        expect(
            redactCredentials({ password: 'hunter22', apiKey: 'k-123456', 'x-api-key': 'k-654321', nick: 'mina' })
        ).toEqual({
            password: 'hunter…(8)',
            apiKey: 'k-1234…(8)',
            'x-api-key': 'k-6543…(8)',
            nick: 'mina',
        });
    });

    it('keeps an error’s message and stack at any depth, masked', () => {
        const error = new Error(`refresh failed for ${jwt}`);

        expect(redactCredentials({ error })).toEqual({
            error: { name: 'Error', message: `refresh failed for ${maskCredential(jwt)}`, stack: expect.any(String) },
        });
    });

    it('names a DOM node instead of walking it, and stops walking deep values', () => {
        const deep: Record<string, unknown> = {};
        let cursor = deep;
        for (let i = 0; i < 20; i++) cursor = cursor['next'] = {};

        expect(redactCredentials(document.createElement('div'))).toBe('<div>');
        expect(JSON.stringify(redactCredentials(deep))).toContain('"[…]"');
    });
});

describe('maskText', () => {
    it('leaves text without a credential alone', () => {
        expect(maskText('slow load user 50ms')).toBe('slow load user 50ms');
    });
});
