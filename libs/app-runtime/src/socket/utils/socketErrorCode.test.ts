import { getSocketErrorCode } from './socketErrorCode';

describe('getSocketErrorCode — 선행 status를 읽는다', () => {
    it('에러 객체가 들고 온 errorCode를 우선한다', () => {
        expect(getSocketErrorCode(Object.assign(new Error('nope'), { errorCode: 429 }))).toBe(429);
        expect(getSocketErrorCode(Object.assign(new Error('400 BAD REQUEST - stale'), { errorCode: 409 }))).toBe(409);
    });

    it('message 앞머리에서 status를 복원한다', () => {
        // The shape PendingRequestStore.settle produces: `${message.error} - ${message.type}`.
        expect(getSocketErrorCode(new Error('403 FORBIDDEN - auth.verify:error'))).toBe(403);
        expect(getSocketErrorCode(new Error('408 REQUEST TIMEOUT - invite.create[mid-1]'))).toBe(408);
        expect(getSocketErrorCode(new Error('503 SOCKET NOT CONNECTED - WebSocketTransport.send()'))).toBe(503);
        expect(getSocketErrorCode(new Error('499 CLIENT CLOSED REQUEST - socket closed'))).toBe(499);
    });

    /**
     * This is why annotateSocketError only ever **appends** — the status has to stay at the front.
     */
    it('호출자 이름이 덧붙어도 그대로 읽는다', () => {
        expect(getSocketErrorCode(new Error('404 NOT FOUND - join.get:error - relay.request(join.get)'))).toBe(404);
    });

    it('status가 없으면 undefined다', () => {
        expect(getSocketErrorCode(new Error('socket request failed - invite.get:error'))).toBeUndefined();
        expect(getSocketErrorCode(undefined)).toBeUndefined();
        expect(getSocketErrorCode(null)).toBeUndefined();
        // It's only a status when 1xx–5xx is at the very front.
        expect(getSocketErrorCode(new Error('2026 is not a status'))).toBeUndefined();
        expect(getSocketErrorCode(new Error('code 403 appears mid-sentence'))).toBeUndefined();
    });

    it('Error가 아닌 값도 삼키지 않는다', () => {
        expect(getSocketErrorCode('500 INTERNAL SERVER ERROR')).toBe(500);
    });
});
