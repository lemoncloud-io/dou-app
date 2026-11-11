import { sessionStores } from '@chatic/session';
import { getRelaySessionUser, getSessionAuthSnapshot } from '@chatic/session/store/contextStore';
import { sessionSignal } from '@chatic/session/store/signal';
import { MemoryStore } from '@chatic/storage';

import { logger } from '@chatic/logger';

import { foregroundPlatform } from '../session/foreground';
import { PushRegistration } from './pushRegistration';
import type { DeviceTokenDelegate, PushDeviceIds } from './pushRegistration';

jest.mock('@chatic/session/store/contextStore', () => ({
    ...jest.requireActual('@chatic/session/store/contextStore'),
    getSessionAuthSnapshot: jest.fn(),
    getRelaySessionUser: jest.fn(),
}));
jest.mock('@chatic/logger', () => ({
    ...jest.requireActual('@chatic/logger'),
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
const mockRegisterDevice = jest.fn();
jest.mock('@chatic/transport/http/gateways', () => ({
    ...jest.requireActual('@chatic/transport/http/gateways'),
    userGateway: () => ({
        registerDevice: (body: Record<string, unknown>, options: { force?: boolean }) =>
            mockRegisterDevice({ ...body, ...options }),
    }),
}));

const mockGetRelaySessionUser = getRelaySessionUser as jest.Mock;
const mockAuthSnapshot = getSessionAuthSnapshot as jest.Mock;

const mockFetchDeviceToken = jest.fn();

let nowMs = 0;
let deviceIds: PushDeviceIds = { deviceId: 'device-1', firebaseInstallationId: 'fid-dyn' };
let visible = true;
let notifyForeground: () => void = () => undefined;

const makeDelegate = (overrides: Partial<DeviceTokenDelegate> = {}): DeviceTokenDelegate => ({
    fetchDeviceToken: mockFetchDeviceToken,
    platform: 'ios',
    installId: 'install-1',
    ...overrides,
});

/** Lets the fetch → register promise chain run. */
const flush = () => new Promise(resolve => setImmediate(resolve));

let authenticated = true;
const setAuthenticated = (next: boolean) => {
    authenticated = next;
};

/** Every launch a test made, stopped after it — the session signal and the port outlive a test. */
const launched: Array<{ stop: () => void }> = [];
afterEach(() => launched.splice(0).forEach(launch => launch.stop()));

/** One app launch: a fresh registration (the record persists in storage), started with `delegate`. */
const launch = (delegate: DeviceTokenDelegate) => {
    const registration = new PushRegistration({ delegate: () => delegate, deviceIds: () => deviceIds });
    const stop = registration.start();
    const handle = { registration, stop };
    launched.push(handle);
    return handle;
};

/** A sign-out and a sign-in, as the session signal announces them. */
const signOutAndIn = () => {
    setAuthenticated(false);
    sessionSignal.emit('relay:token');
    setAuthenticated(true);
    sessionSignal.emit('relay:token');
};

/** The app returns to the foreground — a visibility change the port reports. */
const returnToForeground = () => notifyForeground();

beforeEach(() => {
    jest.clearAllMocks();
    // The registration record persists in storage on purpose — a fresh store per case starts it as a
    // fresh install rather than inheriting the previous one's "already registered".
    sessionStores.configure({ secret: new MemoryStore(), plain: new MemoryStore() });
    nowMs = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
    setAuthenticated(true);
    mockAuthSnapshot.mockImplementation(() => ({ isAuthenticated: authenticated, isInitialized: true }));
    deviceIds = { deviceId: 'device-1', firebaseInstallationId: 'fid-dyn' };
    mockGetRelaySessionUser.mockReturnValue({ id: 'relay-uid' });
    mockRegisterDevice.mockResolvedValue({});
    mockFetchDeviceToken.mockResolvedValue('tok-1');
    visible = true;
    foregroundPlatform.configure({
        read: () => visible,
        subscribe: listener => {
            notifyForeground = listener;
            return () => {
                notifyForeground = () => undefined;
            };
        },
    });
});

afterEach(() => {
    (Date.now as jest.Mock).mockRestore();
});

describe('PushRegistration — registering the device token', () => {
    it('does nothing while the delegate it reads is null', async () => {
        const registration = new PushRegistration({ delegate: () => null, deviceIds: () => deviceIds });
        launched.push({ stop: registration.start() });
        await flush();

        expect(mockFetchDeviceToken).not.toHaveBeenCalled();
        expect(mockRegisterDevice).not.toHaveBeenCalled();
    });

    it('미인증 상태에서는 토큰을 가져오지 않는다', async () => {
        setAuthenticated(false);

        launch(makeDelegate());
        await flush();

        expect(mockFetchDeviceToken).not.toHaveBeenCalled();
        expect(mockRegisterDevice).not.toHaveBeenCalled();
    });

    it('인증되면 최신 토큰을 받아 force로 등록한다', async () => {
        launch(makeDelegate());
        await flush();

        expect(mockFetchDeviceToken).toHaveBeenCalledTimes(1);
        expect(mockRegisterDevice).toHaveBeenCalledWith({
            deviceId: 'device-1',
            deviceToken: 'tok-1',
            platform: 'ios',
            installId: 'install-1',
            application: 'chatic',
            stage: undefined,
            force: true,
        });
    });

    it("registers with the device ids' Firebase id when the delegate has no installId", async () => {
        launch(makeDelegate({ installId: undefined }));
        await flush();

        expect(mockRegisterDevice).toHaveBeenCalledWith(expect.objectContaining({ installId: 'fid-dyn' }));
    });

    it('delegate의 application이 있으면 기본값 대신 그것을 쓴다', async () => {
        launch(makeDelegate({ application: 'custom-app' }));
        await flush();

        expect(mockRegisterDevice).toHaveBeenCalledWith(expect.objectContaining({ application: 'custom-app' }));
    });

    it('delegate의 stage를 body에 실어 보낸다 — 없으면 브로커가 자기 기본값(dev)으로 등록한다', async () => {
        launch(makeDelegate({ stage: 'prod' }));
        await flush();

        expect(mockRegisterDevice).toHaveBeenCalledWith(expect.objectContaining({ stage: 'prod' }));
    });

    describe('once per install', () => {
        it('등록에 성공하면 기록이 남아 다음 실행에서는 등록하지 않는다', async () => {
            const first = launch(makeDelegate());
            await flush();
            expect(mockRegisterDevice).toHaveBeenCalledTimes(1);
            first.stop();

            // Same install, next launch: the token is still fetched (that is how rotation is caught)
            // but the record matches, so no call goes out.
            launch(makeDelegate());
            await flush();

            expect(mockFetchDeviceToken).toHaveBeenCalledTimes(2);
            expect(mockRegisterDevice).toHaveBeenCalledTimes(1);
        });

        it('기록이 있으면 포그라운드 복귀에서 토큰 fetch조차 하지 않는다', async () => {
            launch(makeDelegate());
            await flush();
            expect(mockFetchDeviceToken).toHaveBeenCalledTimes(1);

            nowMs += 61_000;
            returnToForeground();
            await flush();
            nowMs += 61_000;
            returnToForeground();
            await flush();

            expect(mockFetchDeviceToken).toHaveBeenCalledTimes(1);
            expect(mockRegisterDevice).toHaveBeenCalledTimes(1);
        });

        it('기록이 없으면 포그라운드 복귀로 등록한다 — 알림 권한을 나중에 허용한 경우', async () => {
            mockFetchDeviceToken.mockResolvedValue(null);
            launch(makeDelegate());
            await flush();
            expect(mockRegisterDevice).not.toHaveBeenCalled();

            mockFetchDeviceToken.mockResolvedValue('tok-late');
            returnToForeground();
            await flush();

            expect(mockRegisterDevice).toHaveBeenCalledWith(expect.objectContaining({ deviceToken: 'tok-late' }));
        });

        it('토큰이 로테이션되면 다음 실행에서 재등록하고 기록을 갱신한다', async () => {
            const first = launch(makeDelegate());
            await flush();
            first.stop();

            mockFetchDeviceToken.mockResolvedValue('tok-2');
            const second = launch(makeDelegate());
            await flush();
            expect(mockRegisterDevice).toHaveBeenLastCalledWith(expect.objectContaining({ deviceToken: 'tok-2' }));
            second.stop();

            // The refreshed record now covers tok-2.
            launch(makeDelegate());
            await flush();
            expect(mockRegisterDevice).toHaveBeenCalledTimes(2);
        });

        it('계정이 바뀌면 재등록한다', async () => {
            const first = launch(makeDelegate());
            await flush();
            first.stop();

            mockGetRelaySessionUser.mockReturnValue({ id: 'other-uid' });
            launch(makeDelegate());
            await flush();

            expect(mockRegisterDevice).toHaveBeenCalledTimes(2);
        });

        it('디바이스 id가 바뀌면 재등록한다', async () => {
            const first = launch(makeDelegate());
            await flush();
            first.stop();

            deviceIds = { deviceId: 'device-2', firebaseInstallationId: 'fid-dyn' };
            launch(makeDelegate());
            await flush();

            expect(mockRegisterDevice).toHaveBeenCalledTimes(2);
        });

        it('relay uid를 uid 필드로 실어보내는 토큰에서도 계정을 식별한다', async () => {
            mockGetRelaySessionUser.mockReturnValue({ uid: 'uid-shaped' });

            const first = launch(makeDelegate());
            await flush();
            first.stop();

            launch(makeDelegate());
            await flush();

            expect(mockRegisterDevice).toHaveBeenCalledTimes(1);
        });

        it('등록이 실패하면 기록을 남기지 않아 다음 실행에서 다시 시도한다', async () => {
            mockRegisterDevice.mockRejectedValueOnce(new Error('network'));

            const first = launch(makeDelegate());
            await flush();
            expect(mockRegisterDevice).toHaveBeenCalledTimes(1);
            first.stop();

            launch(makeDelegate());
            await flush();

            expect(mockRegisterDevice).toHaveBeenCalledTimes(2);
        });

        // The `jest.fn` generics spell out `NativeRecordMirror`'s signatures. Left to inference a
        // fake reads as zero-arg returning `Promise<null>`, which makes `write.mock.calls[0][0]` an
        // index into an empty tuple and refuses `read.mockResolvedValue(<a string>)`.
        it('네이티브 미러가 있으면 등록 성공 시 그쪽에도 기록한다', async () => {
            const nativeRecordMirror = {
                read: jest.fn<Promise<string | null>, []>(() => Promise.resolve(null)),
                write: jest.fn<Promise<void>, [string]>(() => Promise.resolve()),
            };

            launch(makeDelegate({ nativeRecordMirror }));
            await flush();

            expect(mockRegisterDevice).toHaveBeenCalledTimes(1);
            expect(nativeRecordMirror.write).toHaveBeenCalledWith(expect.stringContaining('tok-1'));
        });

        it('웹 저장소가 비었어도 네이티브 기록이 있으면 등록하지 않는다 — webview 캐시 삭제', async () => {
            const nativeRecordMirror = {
                read: jest.fn<Promise<string | null>, []>(() => Promise.resolve(null)),
                write: jest.fn<Promise<void>, [string]>(() => Promise.resolve()),
            };

            const first = launch(makeDelegate({ nativeRecordMirror }));
            await flush();
            expect(mockRegisterDevice).toHaveBeenCalledTimes(1);
            const persisted = nativeRecordMirror.write.mock.calls[0][0];
            first.stop();

            // The webview's own storage is wiped; only the native tier survives.
            sessionStores.configure({ secret: new MemoryStore(), plain: new MemoryStore() });
            nativeRecordMirror.read.mockResolvedValue(persisted);

            launch(makeDelegate({ nativeRecordMirror }));
            await flush();
            await flush();

            expect(mockRegisterDevice).toHaveBeenCalledTimes(1);
        });

        it('네이티브 미러가 거부해도 등록은 성공으로 남는다 — 구버전 앱', async () => {
            const nativeRecordMirror = {
                read: jest.fn<Promise<string | null>, []>(() => Promise.resolve(null)),
                write: jest.fn<Promise<void>, [string]>(() => Promise.reject(new Error('PREF_KEY_NOT_WRITABLE'))),
            };

            const first = launch(makeDelegate({ nativeRecordMirror }));
            await flush();
            expect(mockRegisterDevice).toHaveBeenCalledTimes(1);
            first.stop();

            // Web storage still holds the record, so the next launch stays quiet.
            launch(makeDelegate({ nativeRecordMirror }));
            await flush();

            expect(mockRegisterDevice).toHaveBeenCalledTimes(1);
        });

        it('uid를 얻지 못하면 기록 없이 등록하되 60초 floor로 폭주를 막는다', async () => {
            mockGetRelaySessionUser.mockReturnValue(null);

            launch(makeDelegate());
            await flush();
            expect(mockRegisterDevice).toHaveBeenCalledTimes(1);

            // No record can be keyed, so the register-every-time fallback stands: focus registers again,
            // but only once the burst floor has elapsed.
            nowMs += 30_000;
            returnToForeground();
            await flush();
            expect(mockRegisterDevice).toHaveBeenCalledTimes(1);

            nowMs += 31_000;
            returnToForeground();
            await flush();
            expect(mockRegisterDevice).toHaveBeenCalledTimes(2);
        });
    });

    it('토큰이 비어 있으면 등록하지 않고 다음 트리거에서 즉시 재시도한다', async () => {
        mockFetchDeviceToken.mockResolvedValue(null);

        launch(makeDelegate());
        await flush();
        expect(mockRegisterDevice).not.toHaveBeenCalled();

        // Failure resets the throttle: the very next trigger (still inside the
        // 60s window) fetches again — covers "permission granted later".
        mockFetchDeviceToken.mockResolvedValue('tok-late');
        nowMs += 1_000;
        returnToForeground();
        await flush();

        expect(mockRegisterDevice).toHaveBeenCalledWith(expect.objectContaining({ deviceToken: 'tok-late' }));
    });

    it('등록 API 실패 시 스로틀을 리셋해 다음 트리거에서 즉시 재시도한다', async () => {
        mockRegisterDevice.mockRejectedValueOnce(new Error('network'));

        launch(makeDelegate());
        await flush();
        expect(mockRegisterDevice).toHaveBeenCalledTimes(1);

        nowMs += 1_000;
        returnToForeground();
        await flush();

        expect(mockRegisterDevice).toHaveBeenCalledTimes(2);
    });

    it('다른 계정으로 재로그인하면 스로틀과 무관하게 즉시 재등록한다', async () => {
        launch(makeDelegate());
        await flush();
        expect(mockRegisterDevice).toHaveBeenCalledTimes(1);

        nowMs += 1_000;
        mockGetRelaySessionUser.mockReturnValue({ id: 'other-uid' });
        signOutAndIn();
        await flush();

        expect(mockRegisterDevice).toHaveBeenCalledTimes(2);
    });

    it('같은 계정으로 재로그인하면 재등록하지 않는다', async () => {
        launch(makeDelegate());
        await flush();
        expect(mockRegisterDevice).toHaveBeenCalledTimes(1);

        nowMs += 1_000;
        signOutAndIn();
        await flush();

        expect(mockRegisterDevice).toHaveBeenCalledTimes(1);
    });

    it('등록이 진행 중이면 겹치는 트리거를 무시한다', async () => {
        let resolveFetch: (token: string) => void = () => undefined;
        mockFetchDeviceToken.mockImplementation(() => new Promise<string>(resolve => (resolveFetch = resolve)));

        launch(makeDelegate());
        // Let the attempt's first tick pass before counting.
        await flush();
        expect(mockFetchDeviceToken).toHaveBeenCalledTimes(1);

        // In-flight fetch: a concurrent focus trigger must not start a second one.
        nowMs += 61_000;
        returnToForeground();
        await flush();
        expect(mockFetchDeviceToken).toHaveBeenCalledTimes(1);

        resolveFetch('tok-1');
        await flush();
        expect(mockRegisterDevice).toHaveBeenCalledTimes(1);
    });

    describe('subscribeTokenChange — 셸이 알려주는 토큰 로테이션', () => {
        it('새 토큰을 알리면 기록이 있어도 즉시 재등록한다', async () => {
            let notify: () => void = () => undefined;
            const subscribeTokenChange = jest.fn((onChange: () => void) => {
                notify = onChange;
                return () => undefined;
            });

            launch(makeDelegate({ subscribeTokenChange }));
            await flush();
            expect(mockRegisterDevice).toHaveBeenCalledTimes(1);

            // Inside the burst floor and with a record present — neither may block a rotation.
            mockFetchDeviceToken.mockResolvedValue('tok-rotated');
            nowMs += 1_000;
            notify();
            await flush();

            expect(mockRegisterDevice).toHaveBeenLastCalledWith(
                expect.objectContaining({ deviceToken: 'tok-rotated' })
            );
        });

        it('토큰이 실제로 그대로면 알림이 와도 등록하지 않는다', async () => {
            let notify: () => void = () => undefined;
            const subscribeTokenChange = jest.fn((onChange: () => void) => {
                notify = onChange;
                return () => undefined;
            });

            launch(makeDelegate({ subscribeTokenChange }));
            await flush();

            nowMs += 1_000;
            notify();
            await flush();

            expect(mockRegisterDevice).toHaveBeenCalledTimes(1);
        });

        it('its stop unsubscribes', async () => {
            const unsubscribe = jest.fn();
            const subscribeTokenChange = jest.fn(() => unsubscribe);

            const { stop } = launch(makeDelegate({ subscribeTokenChange }));
            await flush();
            expect(subscribeTokenChange).toHaveBeenCalledTimes(1);

            stop();

            expect(unsubscribe).toHaveBeenCalledTimes(1);
        });

        it('delegate가 제공하지 않으면 구독하지 않는다', async () => {
            launch(makeDelegate());
            await flush();

            // Nothing to assert beyond "it did not throw" — the absence of the optional hook must not
            // break the mount path for mobile, which never supplies it.
            expect(mockRegisterDevice).toHaveBeenCalledTimes(1);
        });
    });

    describe('as a class the host starts and stops', () => {
        it('registers on a sign-in after the signal, not inside it', async () => {
            setAuthenticated(false);
            launch(makeDelegate());
            await flush();
            expect(mockFetchDeviceToken).not.toHaveBeenCalled();

            setAuthenticated(true);
            sessionSignal.emit('relay:token');
            expect(mockFetchDeviceToken).not.toHaveBeenCalled();

            await flush();
            expect(mockRegisterDevice).toHaveBeenCalledTimes(1);
        });

        // React StrictMode starts, stops and starts the same registration before the first attempt is back.
        it('a stop and a start on one registration join the attempt in flight', async () => {
            let resolveFetch: (token: string) => void = () => undefined;
            mockFetchDeviceToken.mockImplementation(() => new Promise<string>(resolve => (resolveFetch = resolve)));
            const delegate = makeDelegate();
            const registration = new PushRegistration({ delegate: () => delegate, deviceIds: () => deviceIds });

            registration.start()();
            launched.push({ stop: registration.start() });
            await flush();

            expect(mockFetchDeviceToken).toHaveBeenCalledTimes(1);
            resolveFetch('tok-1');
            await flush();
            expect(mockRegisterDevice).toHaveBeenCalledTimes(1);
        });

        it('ignores a foreground notice while the app is not in front, or once stopped', async () => {
            mockFetchDeviceToken.mockResolvedValue(null);
            const { registration, stop } = launch(makeDelegate());
            await flush();
            mockFetchDeviceToken.mockResolvedValue('tok-late');

            visible = false;
            registration.notifyForeground();
            await flush();
            expect(mockRegisterDevice).not.toHaveBeenCalled();

            visible = true;
            stop();
            registration.notifyForeground();
            await flush();
            expect(mockRegisterDevice).not.toHaveBeenCalled();
        });
    });

    describe('the edges of a start', () => {
        it('logs a registration that failed, and is quieter about a token the shell does not have yet', async () => {
            mockRegisterDevice.mockRejectedValueOnce(new Error('503'));
            launch(makeDelegate());
            await flush();

            expect(logger.warn).toHaveBeenCalledWith(
                'NOTIFICATION',
                '[PushRegistration] registration did not go through',
                expect.objectContaining({ data: { reason: 'auth', platform: 'ios' } })
            );

            (logger.warn as jest.Mock).mockClear();
            mockFetchDeviceToken.mockResolvedValue(null);
            nowMs += 1_000;
            returnToForeground();
            await flush();

            expect(logger.warn).not.toHaveBeenCalled();
            expect(logger.debug).toHaveBeenCalledWith(
                'NOTIFICATION',
                '[PushRegistration] no device token yet',
                expect.anything()
            );
        });

        it('a session signal that leaves the account signed in registers nothing more', async () => {
            launch(makeDelegate());
            await flush();
            mockFetchDeviceToken.mockClear();

            sessionSignal.emit('cloud:token');
            await flush();

            expect(mockFetchDeviceToken).not.toHaveBeenCalled();
        });

        it('a sign-in followed by a stop before its turn registers nothing', async () => {
            setAuthenticated(false);
            const { stop } = launch(makeDelegate());

            setAuthenticated(true);
            sessionSignal.emit('relay:token');
            stop();
            await flush();

            expect(mockFetchDeviceToken).not.toHaveBeenCalled();
        });

        it('stopping one start leaves another start of the same registration listening', async () => {
            mockFetchDeviceToken.mockResolvedValue(null);
            const delegate = makeDelegate();
            const registration = new PushRegistration({ delegate: () => delegate, deviceIds: () => deviceIds });
            const stopFirst = registration.start();
            launched.push({ stop: registration.start() });
            await flush();
            mockFetchDeviceToken.mockResolvedValue('tok-late');

            stopFirst();
            registration.notifyForeground();
            await flush();

            expect(mockRegisterDevice).toHaveBeenCalledWith(expect.objectContaining({ deviceToken: 'tok-late' }));
        });

        it('a start on an unwired runtime throws and leaves no subscription behind', async () => {
            const spy = jest.spyOn(foregroundPlatform, 'ports').mockImplementation(() => {
                throw new Error('not configured');
            });
            const registration = new PushRegistration({ delegate: () => makeDelegate(), deviceIds: () => deviceIds });

            expect(() => registration.start()).toThrow('not configured');
            spy.mockRestore();

            setAuthenticated(false);
            sessionSignal.emit('relay:token');
            setAuthenticated(true);
            sessionSignal.emit('relay:token');
            await flush();
            expect(mockFetchDeviceToken).not.toHaveBeenCalled();
        });
    });
});
