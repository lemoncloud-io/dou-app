import { logger } from '@chatic/bridges';

import { socketFailureReporter } from './socketFailureReporter';
import { RELAY_SLOT, slotKeyOf } from './utils/slotKey';

/** Slots are keyed by the cloud they serve; these are the relay's and one fixture cloud's. */
const RELAY = RELAY_SLOT;
const CLOUD = slotKeyOf('cloud-1');

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
        socketFailureReporter.recordFailure(RELAY, 'request', 'join.get', serverError('404 NOT FOUND - join.get'));

        expect(error).toHaveBeenCalledTimes(1);
        expect(error.mock.calls[0][0]).toBe('SOCKET');
        expect(error.mock.calls[0][1]).toBe('404 socket request failed — relay.request(join.get)');
        expect((error.mock.calls[0][2] as { data: Record<string, unknown> }).data).toEqual({
            kind: 'relay',
            cid: RELAY,
            action: 'request',
            type: 'join.get',
            code: 404,
        });
    });

    it('errorCode를 들고 온 에러는 그 값을 쓴다', () => {
        const carried = Object.assign(new Error('nope'), { errorCode: 403 });
        socketFailureReporter.recordFailure(CLOUD, 'request', 'chat.feed', carried);

        expect(error.mock.calls[0][1]).toContain('403');
    });

    it('상태를 못 읽는 실패도 버리지 않는다', () => {
        socketFailureReporter.recordFailure(RELAY, 'request', 'invite.get', serverError('socket request failed'));

        expect(error).toHaveBeenCalledTimes(1);
        expect(error.mock.calls[0][1]).toContain('unclassified');
    });

    it('예외 객체를 error 필드에 담는다 — data 안에 묻지 않는다', () => {
        const boom = serverError('500 INTERNAL - chat.post');
        socketFailureReporter.recordFailure(CLOUD, 'request', 'chat.post', boom);

        expect((error.mock.calls[0][2] as { error: unknown }).error).toBe(boom);
    });
});

describe('an answer that a row is absent is not a failure', () => {
    const missingProfile = () => serverError('404 NOT FOUND - not found @doGet(profiles/s1@u2) - profile.get:error');

    it('records profile.get 404 at info, not error', () => {
        socketFailureReporter.recordFailure(CLOUD, 'request', 'profile.get', missingProfile());

        expect(error).not.toHaveBeenCalled();
        expect(info).toHaveBeenCalledTimes(1);
        expect(info.mock.calls[0][1]).toBe('404 socket request found nothing — cloud.request(profile.get)');
        expect((info.mock.calls[0][2] as { data: Record<string, unknown> }).data).toMatchObject({
            type: 'profile.get',
            code: 404,
        });
    });

    it('keeps any other profile.get status an error', () => {
        socketFailureReporter.recordFailure(CLOUD, 'request', 'profile.get', serverError('403 FORBIDDEN'));
        socketFailureReporter.recordFailure(CLOUD, 'request', 'profile.get', serverError('500 INTERNAL'));

        expect(error).toHaveBeenCalledTimes(2);
        expect(info).not.toHaveBeenCalled();
    });

    it('keeps a 404 on any other request type an error', () => {
        socketFailureReporter.recordFailure(CLOUD, 'request', 'channel.get', serverError('404 NOT FOUND'));

        expect(error).toHaveBeenCalledTimes(1);
    });

    it('still ends an unavailable streak, because the server answered', () => {
        socketFailureReporter.recordFailure(CLOUD, 'request', 'join.get', serverError('503 SOCKET NOT CONNECTED'));
        socketFailureReporter.recordFailure(CLOUD, 'request', 'profile.get', missingProfile());
        socketFailureReporter.recordSuccess(CLOUD);

        // Only the absence entry: the streak was reset by the 404, so the success has nothing to end.
        expect(info).toHaveBeenCalledTimes(1);
    });
});

describe('타임아웃은 거절과 다른 사건이다', () => {
    it('408은 warn으로 남긴다', () => {
        socketFailureReporter.recordFailure(
            RELAY,
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
            RELAY,
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
        socketFailureReporter.recordFailure(CLOUD, 'request', 'chat.feed', serverError('503 SOCKET NOT CONNECTED'));

        expect(warn).toHaveBeenCalledTimes(2);
    });

    // Two clouds are two independent connections — one down says nothing about the other. Unlike the
    // relay/cloud case above (different KINDS), this pins the actual key: the streak map is keyed by
    // SlotKey, not by kindOf(key), so two clouds sharing the same kind must still not share a streak.
    it('클라우드가 둘이면 각자 별도의 스트릭을 갖는다 — 한쪽의 실패가 다른 쪽을 리셋하거나 진행시키지 않는다', () => {
        const cloudA = slotKeyOf('cloud-a');
        const cloudB = slotKeyOf('cloud-b');
        const failUnavailable = (key: typeof cloudA) =>
            socketFailureReporter.recordFailure(key, 'request', 'chat.feed', serverError('503 SOCKET NOT CONNECTED'));

        failUnavailable(cloudA);
        failUnavailable(cloudA);
        failUnavailable(cloudA); // cloudA's streak is 3 — only the first-failure warn fired so far
        warn.mockClear();

        // cloudB has never failed before. If streaks were shared across clouds, this would be its
        // 4th failure (silent); because they are separate, it is cloudB's OWN first — a fresh warn.
        failUnavailable(cloudB);
        expect(warn).toHaveBeenCalledTimes(1);
        expect((warn.mock.calls[0][2] as { data: Record<string, unknown> }).data).toMatchObject({
            cid: cloudB,
            streak: 1,
        });
        warn.mockClear();

        // cloudA resumes from where IT left off (streak 4) — cloudB's failure neither reset it back
        // to 1 nor advanced it past 4 into the shared-map's accidental 5th (threshold).
        failUnavailable(cloudA);
        expect(warn).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();

        // cloudA's own 5th failure — and only now — hits its threshold.
        failUnavailable(cloudA);
        expect(error).toHaveBeenCalledTimes(1);
        expect((error.mock.calls[0][2] as { data: Record<string, unknown> }).data).toMatchObject({
            cid: cloudA,
            streak: 5,
        });
    });

    it('복구는 한 번만 남기고, 스트릭이 없으면 아무것도 남기지 않는다', () => {
        lost(503);
        lost(503);
        socketFailureReporter.recordSuccess(RELAY);

        expect(info).toHaveBeenCalledTimes(1);
        expect((info.mock.calls[0][2] as { data: Record<string, unknown> }).data).toMatchObject({
            observation: 'socket-unavailable-streak',
            afterFailures: 2,
        });

        socketFailureReporter.recordSuccess(RELAY);
        expect(info).toHaveBeenCalledTimes(1);
    });

    it('건강한 기기는 아무것도 만들지 않는다', () => {
        socketFailureReporter.recordSuccess(RELAY);
        socketFailureReporter.recordSuccess(CLOUD);

        expect(info).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
    });

    // A 403 coming back is proof the socket is alive — counting it as "still dead" would let the
    // streak survive forever, so neither a recovery entry nor the next first-failure warn would ever fire.
    it('서버가 답한 실패는 스트릭을 끊는다', () => {
        lost(503);
        socketFailureReporter.recordFailure(RELAY, 'request', 'join.get', serverError('403 FORBIDDEN'));
        lost(503);

        expect(warn).toHaveBeenCalledTimes(2);
        expect((warn.mock.calls[1][2] as { data: Record<string, unknown> }).data).toMatchObject({ streak: 1 });
    });
});

describe('a slot that is gone takes its streak with it', () => {
    const lost = (key: typeof RELAY) =>
        socketFailureReporter.recordFailure(key, 'request', 'join.get', serverError('503 SOCKET NOT CONNECTED'));

    it('starts the next slot for the same cloud from a first failure, not from the old count', () => {
        for (let i = 0; i < 4; i += 1) lost(CLOUD);
        expect(warn).toHaveBeenCalledTimes(1);

        socketFailureReporter.forget(CLOUD);
        lost(CLOUD);

        // A fresh first failure warns again, and nothing reaches the threshold the old slot was near.
        expect(warn).toHaveBeenCalledTimes(2);
        expect(error).not.toHaveBeenCalled();
    });

    it("leaves the other slots' streaks alone", () => {
        lost(RELAY);
        lost(CLOUD);
        socketFailureReporter.forget(CLOUD);

        socketFailureReporter.recordSuccess(RELAY);

        // Relay's streak survived the forget, so its recovery is still reported.
        expect(info).toHaveBeenCalledWith('SOCKET', expect.stringContaining('recovered'), expect.anything());
    });
});
