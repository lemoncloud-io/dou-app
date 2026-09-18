import { logger } from '@chatic/bridges';

import { socketFailureReporter } from './socketFailureReporter';

/**
 * Spies on the real logger — a partial mock loses the exports of anything that indirectly consumes
 * the same module, and that broke three other suites in this track.
 */
const warn = jest.spyOn(logger, 'warn').mockImplementation();
const error = jest.spyOn(logger, 'error').mockImplementation();
const info = jest.spyOn(logger, 'info').mockImplementation();

const serverError = (message: string) => new Error(message);

beforeEach(() => {
    jest.clearAllMocks();
    socketFailureReporter.reset();
});

afterAll(() => {
    warn.mockRestore();
    error.mockRestore();
    info.mockRestore();
});

describe('서버가 답한 실패는 건별로 남는다', () => {
    it('상태 코드를 message 맨 앞에, 요청 타입과 함께 남긴다', () => {
        socketFailureReporter.recordFailure('relay', 'request', 'join.get', serverError('404 NOT FOUND - join.get'));

        expect(error).toHaveBeenCalledTimes(1);
        expect(error.mock.calls[0][0]).toBe('SOCKET');
        expect(error.mock.calls[0][1]).toBe('404 socket request failed — relay.request(join.get)');
        expect((error.mock.calls[0][2] as { data: Record<string, unknown> }).data).toEqual({
            kind: 'relay',
            action: 'request',
            type: 'join.get',
            code: 404,
        });
    });

    it('errorCode를 들고 온 에러는 그 값을 쓴다', () => {
        const carried = Object.assign(new Error('nope'), { errorCode: 403 });
        socketFailureReporter.recordFailure('cloud', 'request', 'chat.feed', carried);

        expect(error.mock.calls[0][1]).toContain('403');
    });

    it('상태를 못 읽는 실패도 버리지 않는다', () => {
        socketFailureReporter.recordFailure('relay', 'request', 'invite.get', serverError('socket request failed'));

        expect(error).toHaveBeenCalledTimes(1);
        expect(error.mock.calls[0][1]).toContain('unclassified');
    });

    it('예외 객체를 error 필드에 담는다 — data 안에 묻지 않는다', () => {
        const boom = serverError('500 INTERNAL - chat.post');
        socketFailureReporter.recordFailure('cloud', 'request', 'chat.post', boom);

        expect((error.mock.calls[0][2] as { error: unknown }).error).toBe(boom);
    });
});

describe('타임아웃은 거절과 다른 사건이다', () => {
    it('408은 warn으로 남긴다', () => {
        socketFailureReporter.recordFailure(
            'relay',
            'request',
            'invite.create',
            serverError('408 REQUEST TIMEOUT - invite.create[mid-1]')
        );

        expect(error).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][1]).toContain('timed out');
    });
});

/**
 * While the socket is gone, it fails once per poll cycle for every registered sync target. 503
 * happens on each send attempt; 499 fires all at once across the whole in-flight/queued set when the
 * socket closes — logging each one hits exactly the reason the catalog bans per-frame logging.
 */
describe('연결이 없어서 실패한 것은 스트릭으로 묶는다', () => {
    const lost = (code: 503 | 499) =>
        socketFailureReporter.recordFailure(
            'relay',
            'request',
            'join.get',
            serverError(
                code === 503 ? '503 SOCKET NOT CONNECTED - WebSocketTransport.send()' : '499 CLIENT CLOSED REQUEST'
            )
        );

    it('첫 실패만 warn이고 임계 전까지는 침묵한다', () => {
        lost(503);
        expect(warn).toHaveBeenCalledTimes(1);

        lost(503);
        lost(503);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(error).not.toHaveBeenCalled();
    });

    it('임계에 닿으면 error 한 건, 그 뒤로는 다시 침묵한다', () => {
        for (let i = 0; i < 5; i += 1) lost(503);
        expect(error).toHaveBeenCalledTimes(1);
        expect(error.mock.calls[0][1]).toContain('5 socket requests lost');

        for (let i = 0; i < 10; i += 1) lost(503);
        expect(error).toHaveBeenCalledTimes(1);
    });

    it('499도 같은 스트릭에 들어간다 — 둘 다 "소켓이 없다"는 말이다', () => {
        lost(503);
        lost(499);
        lost(499);

        expect(warn).toHaveBeenCalledTimes(1);
        expect((warn.mock.calls[0][2] as { data: Record<string, unknown> }).data).toMatchObject({
            observation: 'socket-unavailable-streak',
            streak: 1,
        });
    });

    it('슬롯별로 따로 센다 — relay가 죽고 cloud가 사는 건 실재하는 상태다', () => {
        lost(503);
        socketFailureReporter.recordFailure('cloud', 'request', 'chat.feed', serverError('503 SOCKET NOT CONNECTED'));

        expect(warn).toHaveBeenCalledTimes(2);
    });

    it('복구는 한 번만 남기고, 스트릭이 없으면 아무것도 남기지 않는다', () => {
        lost(503);
        lost(503);
        socketFailureReporter.recordSuccess('relay');

        expect(info).toHaveBeenCalledTimes(1);
        expect((info.mock.calls[0][2] as { data: Record<string, unknown> }).data).toMatchObject({
            observation: 'socket-unavailable-streak',
            afterFailures: 2,
        });

        socketFailureReporter.recordSuccess('relay');
        expect(info).toHaveBeenCalledTimes(1);
    });

    it('건강한 기기는 아무것도 만들지 않는다', () => {
        socketFailureReporter.recordSuccess('relay');
        socketFailureReporter.recordSuccess('cloud');

        expect(info).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
    });

    // A 403 coming back is proof the socket is alive — counting it as "still dead" would let the
    // streak survive forever, so neither a recovery entry nor the next first-failure warn would ever fire.
    it('서버가 답한 실패는 스트릭을 끊는다', () => {
        lost(503);
        socketFailureReporter.recordFailure('relay', 'request', 'join.get', serverError('403 FORBIDDEN'));
        lost(503);

        expect(warn).toHaveBeenCalledTimes(2);
        expect((warn.mock.calls[1][2] as { data: Record<string, unknown> }).data).toMatchObject({ streak: 1 });
    });
});
