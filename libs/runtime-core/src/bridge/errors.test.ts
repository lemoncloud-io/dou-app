import {
    RUNTIME_ERROR_CODE,
    RUNTIME_NOT_AVAILABLE_CODE,
    reviveRuntimeError,
    runtimeNotAvailableFailure,
    serializeRuntimeError,
    toRuntimeFailure,
} from './errors';

/** What a caller on the page gets for `error` thrown in the shell: serialized, sent as JSON, revived. */
const acrossTheBridge = (error: unknown): Error =>
    reviveRuntimeError(JSON.parse(JSON.stringify(toRuntimeFailure(error))));

describe('runtime errors across the bridge', () => {
    it('keeps the leading status a socket rejection writes into its message', () => {
        const revived = acrossTheBridge(new Error('408 REQUEST TIMEOUT - chat.feed'));

        expect(revived).toBeInstanceOf(Error);
        expect(revived.message).toBe('408 REQUEST TIMEOUT - chat.feed');
    });

    it('keeps the status a socket rejection carries as errorCode', () => {
        const thrown = Object.assign(new Error('@chatNo[999] is invalid'), { errorCode: 400 });

        expect(acrossTheBridge(thrown)).toMatchObject({ errorCode: 400 });
    });

    it('keeps an axios network failure readable as one', () => {
        const thrown = Object.assign(new Error('Network Error'), { name: 'AxiosError', code: 'ERR_NETWORK' });

        expect(acrossTheBridge(thrown)).toMatchObject({
            name: 'AxiosError',
            code: 'ERR_NETWORK',
            message: 'Network Error',
        });
    });

    it("keeps an HTTP failure's status and the server's body", () => {
        const thrown = Object.assign(new Error('Request failed with status code 409'), {
            status: 409,
            response: { status: 409, data: { error: 'already joined' }, headers: { 'x-trace': 't' } },
        });

        expect(acrossTheBridge(thrown)).toMatchObject({
            status: 409,
            response: { status: 409, data: { error: 'already joined' } },
        });
        expect((acrossTheBridge(thrown) as { response?: object }).response).not.toHaveProperty('headers');
    });

    it('drops a body that is not plain JSON instead of failing to send the error', () => {
        const body: Record<string, unknown> = {};
        body.self = body;
        const thrown = Object.assign(new Error('boom'), { response: { status: 500, data: body } });

        expect(serializeRuntimeError(thrown)).toEqual({ name: 'Error', message: 'boom', response: { status: 500 } });
    });

    it('revives only the allowed fields: no stack, prototype or mistyped status from the other side', () => {
        const crossed = JSON.parse(
            '{"code":"RUNTIME_ERROR","message":"boom","details":{"name":"Error","message":"boom","stack":"elsewhere","status":"409","__proto__":{"hijacked":true}}}'
        );

        const revived = reviveRuntimeError(crossed);

        expect(revived).toBeInstanceOf(Error);
        expect(revived.stack).not.toContain('elsewhere');
        expect(revived).not.toHaveProperty('status');
        expect(revived).not.toHaveProperty('hijacked');
    });

    it('never throws while serializing — an object with no prototype still gives a message', () => {
        expect(serializeRuntimeError(Object.create(null))).toEqual({ name: 'Error', message: 'Unknown error' });
    });

    it('never throws while serializing — a throwing getter still gives a message', () => {
        const hostile = Object.defineProperty(new Error('boom'), 'status', {
            get: () => {
                throw new Error('nope');
            },
        });

        expect(serializeRuntimeError(hostile)).toEqual({ name: 'Error', message: 'Error: boom' });
    });

    it.each([
        ['a string', 'boom', 'boom'],
        ['undefined', undefined, 'undefined'],
        ['an object without a message', { reason: 'x' }, '[object Object]'],
    ])('turns a thrown %s into an Error with a message', (_label, thrown, message) => {
        const revived = acrossTheBridge(thrown);

        expect(revived).toBeInstanceOf(Error);
        expect(revived.message).toBe(message);
    });

    it('answers a failed call with the runtime error code', () => {
        expect(toRuntimeFailure(new Error('boom'))).toEqual({
            code: RUNTIME_ERROR_CODE,
            message: 'boom',
            details: { name: 'Error', message: 'boom' },
        });
    });

    it("turns the bridge's own failure into an Error that carries its code", () => {
        const revived = reviveRuntimeError({ code: 'NOT_FOUND', message: 'RuntimeCall is not handled' });

        expect(revived).toMatchObject({ code: 'NOT_FOUND', message: 'RuntimeCall is not handled' });
    });

    it("reads the bridge's own timeout as the socket client's — a 408 at the front of the message", () => {
        const revived = reviveRuntimeError({ code: 'TIMEOUT', message: 'Request timed out after 10000ms' });

        expect(revived.message).toBe('408 REQUEST TIMEOUT - Request timed out after 10000ms');
        expect(revived).toMatchObject({ code: 'TIMEOUT' });
    });

    it('tells a method the installed runtime predates apart from one that failed', () => {
        const revived = reviveRuntimeError(JSON.parse(JSON.stringify(runtimeNotAvailableFailure('chat', 'pin'))));

        expect(revived).toMatchObject({
            code: RUNTIME_NOT_AVAILABLE_CODE,
            message: "chat.pin is not in this app's runtime",
        });
    });

    it('still gives an Error when there is no failure to read', () => {
        expect(reviveRuntimeError(undefined)).toMatchObject({
            code: RUNTIME_ERROR_CODE,
            message: 'The runtime call failed',
        });
    });
});
