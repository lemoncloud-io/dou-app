import { attachWebCrashSentinel } from './webCrashSentinel';

const LEGACY_QUEUE_KEY = '@chatic/web.log.queue';
const ALIVE_KEY = '@chatic/web.log.alive';

describe('attachWebCrashSentinel', () => {
    let teardown: (() => void) | undefined;

    beforeEach(() => {
        sessionStorage.clear();
    });

    afterEach(() => {
        teardown?.();
        teardown = undefined;
    });

    it('첫 부팅은 크래시 아님으로 판정하고 alive 센티널을 세운다', () => {
        const result = attachWebCrashSentinel();
        teardown = result.teardown;

        expect(result.crashedLastSession).toBe(false);
        expect(sessionStorage.getItem(ALIVE_KEY)).toBe('1');
    });

    it('pagehide(정상 종료)가 센티널을 지워 다음 부팅이 크래시로 오판하지 않는다', () => {
        const result = attachWebCrashSentinel();
        teardown = result.teardown;

        window.dispatchEvent(new Event('pagehide'));

        expect(sessionStorage.getItem(ALIVE_KEY)).toBeNull();
    });

    it('센티널이 남은 채 재부팅하면 크래시로 판정한다', () => {
        sessionStorage.setItem(ALIVE_KEY, '1');

        const result = attachWebCrashSentinel();
        teardown = result.teardown;

        expect(result.crashedLastSession).toBe(true);
    });

    // Nothing uses this key anymore now that reports stopped attaching logs. Leaving it behind would
    // let a tab reloaded on an old version sit there with stale logs still in place.
    it('구버전이 남긴 로그 큐 키를 부팅 때 지운다', () => {
        sessionStorage.setItem(LEGACY_QUEUE_KEY, JSON.stringify([{ message: 'stale' }]));

        const result = attachWebCrashSentinel();
        teardown = result.teardown;

        expect(sessionStorage.getItem(LEGACY_QUEUE_KEY)).toBeNull();
    });

    it('탭이 백그라운드로 가면 센티널을 내리고 돌아오면 다시 세운다', () => {
        const result = attachWebCrashSentinel();
        teardown = result.teardown;

        const visibility = jest.spyOn(document, 'visibilityState', 'get');

        visibility.mockReturnValue('hidden');
        document.dispatchEvent(new Event('visibilitychange'));
        expect(sessionStorage.getItem(ALIVE_KEY)).toBeNull();

        visibility.mockReturnValue('visible');
        document.dispatchEvent(new Event('visibilitychange'));
        expect(sessionStorage.getItem(ALIVE_KEY)).toBe('1');

        visibility.mockRestore();
    });
});
