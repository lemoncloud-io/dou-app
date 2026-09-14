jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            getGlobalSessionContext: jest.fn(),
        },
    },
}));

import { runtime } from '@chatic/app-runtime';
import { logger, setLogContextProvider } from '@chatic/bridges';

import { attachLogContext, readLogContext, reportRunIdJoin, resetWebRunId } from './logContext';
import { recordRoute, resetRouteTrail } from '../../utils/routeTrail';

const mockSession = runtime.session.getGlobalSessionContext as jest.Mock;

const sessionState = (over: Record<string, unknown> = {}) => ({
    identity: { userId: 'u-1' },
    cloud: { cloudId: 'c-1', siteId: 's-1' },
    ...over,
});

beforeEach(() => {
    jest.clearAllMocks();
    resetWebRunId();
    resetRouteTrail();
    mockSession.mockReturnValue(sessionState());
    delete (window as Record<string, unknown>).CHATIC_APP_RUN_ID;
    delete (window as Record<string, unknown>).CHATIC_APP_CURRENT_VERSION;
    delete (window as Record<string, unknown>).CHATIC_APP_PLATFORM;
    delete (window as Record<string, unknown>).CHATIC_APP_DEVICE_MODEL;
    delete (window as Record<string, unknown>).ReactNativeWebView;
});

describe('readLogContext', () => {
    it('세션에서 uid·cid·sid를 읽는다', () => {
        expect(readLogContext()).toEqual(expect.objectContaining({ uid: 'u-1', cid: 'c-1', sid: 's-1' }));
    });

    it('현재 라우트를 싣는다 — 전용 NAV 엔트리 대신 모든 엔트리가 화면을 들고 다닌다', () => {
        recordRoute('/home');
        recordRoute('/chat/42');

        expect(readLogContext().route).toBe('/chat/42');
    });

    it('네이티브가 주입한 runId·기기 정보를 그대로 쓴다', () => {
        Object.assign(window, {
            CHATIC_APP_RUN_ID: 'native-run-1',
            CHATIC_APP_CURRENT_VERSION: '0.22.0',
            CHATIC_APP_PLATFORM: 'ios',
            CHATIC_APP_DEVICE_MODEL: 'iPhone17,1',
        });

        expect(readLogContext()).toEqual(
            expect.objectContaining({
                runId: 'native-run-1',
                appVersion: '0.22.0',
                os: 'ios',
                model: 'iPhone17,1',
            })
        );
    });

    it('주입이 없으면 웹이 runId를 발급한다 — 웹이 앱보다 먼저 배포된다', () => {
        const runId = readLogContext().runId;

        expect(runId).toEqual(expect.any(String));
        expect(runId).not.toBe('');
    });

    it('웹이 발급한 runId는 세션 내내 같다 — 한 실행을 묶는 축이다', () => {
        expect(readLogContext().runId).toBe(readLogContext().runId);
    });

    it('세션 스토어가 준비되기 전에도 던지지 않는다 (부팅·게스트)', () => {
        mockSession.mockImplementation(() => {
            throw new Error('session not ready');
        });

        expect(() => readLogContext()).not.toThrow();
        expect(readLogContext().uid).toBeUndefined();
    });

    it('세션이 바뀌면 다음 호출부터 새 값을 준다 — 캐시하면 큐가 오염된다', () => {
        expect(readLogContext().uid).toBe('u-1');

        mockSession.mockReturnValue(sessionState({ identity: { userId: 'u-2' } }));

        expect(readLogContext().uid).toBe('u-2');
    });
});

describe('attachLogContext', () => {
    afterEach(() => setLogContextProvider(undefined));

    it('코어에 프로바이더를 등록하고 teardown으로 뗀다', () => {
        const detach = attachLogContext();
        expect(typeof detach).toBe('function');

        detach();
    });
});

/**
 * `runId`는 하나의 실행을 묶는 유일한 축이고, 네이티브 엔트리를 웹 엔트리에 잇는 유일한 끈이다 —
 * 네이티브 쪽은 `uid`·`sid`·`cid`·`route`를 모른다. 그래서 주입이 없으면 공유 id만 잃는 게 아니라
 * **그 실행의 네이티브 엔트리 전부가 사용자로 되돌아갈 길을 잃는다.**
 */
describe('reportRunIdJoin — 조인이 깨진 실행을 말한다', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation();

    /** isNative()는 window 전역을 읽는다 — 목 없이 그대로 구동한다. */
    const insideTheApp = () => {
        (window as Record<string, unknown>).ReactNativeWebView = { postMessage: jest.fn() };
    };

    beforeEach(() => warn.mockClear());
    afterAll(() => warn.mockRestore());

    it('앱 안에서 주입이 없으면 warn 한 건을 남긴다', () => {
        insideTheApp();

        reportRunIdJoin();

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toBe('APP');
        expect(warn.mock.calls[0][1]).toContain('cannot be joined');
    });

    it('주입이 있으면 아무것도 남기지 않는다', () => {
        insideTheApp();
        (window as Record<string, unknown>).CHATIC_APP_RUN_ID = 'native-run-1';

        reportRunIdJoin();

        expect(warn).not.toHaveBeenCalled();
    });

    // 브라우저 단독 접속에는 이을 네이티브 절반이 자체가 없다 — 직접 발급한 id가 정답이다.
    it('앱 밖에서는 주입이 없어도 남기지 않는다', () => {
        reportRunIdJoin();

        expect(warn).not.toHaveBeenCalled();
    });
});
