import { describe, expect, it } from 'vitest';

import { classifyWireError, serverErrorText, socketErrorStatus } from './errors';

describe('classifyWireError', () => {
    it('reads the wire text the backend actually sends', () => {
        expect(classifyWireError('403 NOT ALLOWED - action[update] is invalid @doPut(channels/U:1001095)')).toBe(
            'denied'
        );
        expect(classifyWireError('400 INVALID - @code[invt:bogus] is invalid (not-found)')).toBe('notFound');
        expect(classifyWireError('400 INVALID - invite is expired')).toBe('expired');
        expect(classifyWireError('409 CONFLICT - already joined')).toBe('conflict');
        expect(classifyWireError('Network Error')).toBe('network');
        expect(classifyWireError('400 INVALID - bad input')).toBe('invalid');
    });

    it('reads a refusal the server answered as that refusal, whatever its wording', () => {
        expect(classifyWireError('400 INVALID - grace-timeout by invite[910024]')).toBe('invalid');
        expect(classifyWireError('timeout of 10000ms exceeded')).toBe('network');
        expect(classifyWireError('504 GATEWAY TIMEOUT')).toBe('network');
        expect(classifyWireError('503 Service Unavailable')).toBe('network');
    });

    it('matches status codes as whole numbers, not inside ids', () => {
        expect(classifyWireError('500 ERROR @doGet(channels/U:1000404)')).toBe('unknown');
    });
});

describe('socketErrorStatus', () => {
    it('reads the leading status of a socket rejection', () => {
        expect(socketErrorStatus(new Error('403 FORBIDDEN - wrong code'))).toBe(403);
        expect(socketErrorStatus(new Error('429 TOO MANY REQUESTS'))).toBe(429);
    });

    it('prefers a carried errorCode and gives up on text without a leading status', () => {
        expect(socketErrorStatus(Object.assign(new Error('x'), { errorCode: 409 }))).toBe(409);
        expect(socketErrorStatus(new Error('failed @doGet(channels/U:1000404)'))).toBeUndefined();
        expect(socketErrorStatus('nope')).toBeUndefined();
    });
});

describe('serverErrorText', () => {
    it('prefers the response body over the transport message', () => {
        const error = Object.assign(new Error('Request failed with status code 400'), {
            response: { data: { error: '400 INVALID - grace-timeout by invite[910024]' } },
        });
        expect(serverErrorText(error)).toBe('400 INVALID - grace-timeout by invite[910024]');
    });

    it('falls back to the message, and to nothing rather than a translated default', () => {
        expect(serverErrorText(new Error(' 403 FORBIDDEN '))).toBe('403 FORBIDDEN');
        expect(serverErrorText(undefined)).toBe('');
        expect(serverErrorText({})).toBe('');
    });

    it("appends a wrapped error's cause, so a stage name carries the server's reason", () => {
        const wrapped = new Error('auth.switch failed: server', {
            cause: new Error('403 NOT ALLOWED - device unlinked @auth.switch(-)'),
        });
        expect(serverErrorText(wrapped)).toBe(
            'auth.switch failed: server — 403 NOT ALLOWED - device unlinked @auth.switch(-)'
        );
    });

    it('does not repeat a cause the message already carries, and stops on a cyclic cause', () => {
        expect(serverErrorText(new Error('403 FORBIDDEN', { cause: new Error('403 FORBIDDEN') }))).toBe(
            '403 FORBIDDEN'
        );
        const loop: { message: string; cause?: unknown } = { message: 'a' };
        loop.cause = loop;
        expect(serverErrorText(loop)).toBe('a');
    });

    it("drops a proxy's error page and cuts a dump", () => {
        const page = Object.assign(new Error('Request failed with status code 502'), {
            response: { data: '<html><body>Bad Gateway</body></html>' },
        });
        expect(serverErrorText(page)).toBe('');
        expect(serverErrorText(new Error('x'.repeat(500)))).toHaveLength(301);
    });
});
