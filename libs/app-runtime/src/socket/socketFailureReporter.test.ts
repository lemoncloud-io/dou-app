import { logger } from '@chatic/bridges';

import { socketFailureReporter } from './socketFailureReporter';

/**
 * 실물 logger에 spy를 건다 — 부분 목은 같은 모듈을 간접 소비하는 쪽의 export를 잃게 만들어
 * 이 트랙에서 세 번 다른 스위트를 깨뜨렸다.
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
 * 소켓이 없는 동안에는 등록된 sync 타깃 수만큼 매 폴 주기마다 실패한다. 503은 send 시도마다,
 * 499는 소켓이 닫힐 때 in-flight·큐 전체에 한꺼번에 터진다 — 건별 로깅은 카탈로그가 프레임 단위
 * 로깅을 금지하는 바로 그 이유에 걸린다.
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

    // 403이 돌아왔다는 건 소켓이 살아 있다는 증거다 — 이걸 "아직 죽어 있다"로 세면 스트릭이
    // 영원히 살아남아 복구 엔트리도, 다음 첫 실패 warn도 나오지 않는다.
    it('서버가 답한 실패는 스트릭을 끊는다', () => {
        lost(503);
        socketFailureReporter.recordFailure('relay', 'request', 'join.get', serverError('403 FORBIDDEN'));
        lost(503);

        expect(warn).toHaveBeenCalledTimes(2);
        expect((warn.mock.calls[1][2] as { data: Record<string, unknown> }).data).toMatchObject({ streak: 1 });
    });
});
