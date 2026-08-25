import {
    createLogUploadSwitch,
    isLogCollectionEnabled,
    isLogUploadHeld,
    LOG_UPLOAD_DISABLED_KEY,
    LOG_UPLOAD_FORCED_KEY,
    LOG_UPLOAD_HOLD_KEY,
} from './logUploadSwitch';

const appHold = window as unknown as { CHATIC_APP_LOG_UPLOAD_HOLD?: boolean };

beforeEach(() => {
    localStorage.clear();
    delete appHold.CHATIC_APP_LOG_UPLOAD_HOLD;
});

describe('createLogUploadSwitch', () => {
    it('기본값은 켜짐이다', () => {
        expect(createLogUploadSwitch()()).toBe(true);
    });

    it('빌드에서 끄면 꺼진다', () => {
        expect(createLogUploadSwitch(true)()).toBe(false);
    });

    it('기기별 opt-out이 가장 세다 — 문제 기기 하나를 즉시 멈추는 수단이다', () => {
        localStorage.setItem(LOG_UPLOAD_DISABLED_KEY, '1');
        localStorage.setItem(LOG_UPLOAD_FORCED_KEY, '1');

        expect(createLogUploadSwitch()()).toBe(false);
    });

    it('강제 플래그로 빌드 설정을 이길 수 있다', () => {
        localStorage.setItem(LOG_UPLOAD_FORCED_KEY, '1');

        expect(createLogUploadSwitch(true)()).toBe(true);
    });

    it('매 호출마다 다시 읽는다 — 껐다 켜는 데 리로드가 필요하면 안 된다', () => {
        const isEnabled = createLogUploadSwitch();
        expect(isEnabled()).toBe(true);

        localStorage.setItem(LOG_UPLOAD_DISABLED_KEY, '1');

        expect(isEnabled()).toBe(false);
    });

    it('스토리지를 못 읽어도 던지지 않는다', () => {
        const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });

        expect(() => createLogUploadSwitch()()).not.toThrow();

        getItem.mockRestore();
    });
});

describe('isLogCollectionEnabled', () => {
    it('기본값은 수집한다', () => {
        expect(isLogCollectionEnabled()).toBe(true);
    });

    it('기기 opt-out은 수집 자체를 멈춘다 — 전송만 멈추면 opt-out의 의미가 없다', () => {
        localStorage.setItem(LOG_UPLOAD_DISABLED_KEY, '1');

        expect(isLogCollectionEnabled()).toBe(false);
    });

    it('강제 플래그로도 기기 opt-out을 되돌릴 수 없다', () => {
        localStorage.setItem(LOG_UPLOAD_DISABLED_KEY, '1');
        localStorage.setItem(LOG_UPLOAD_FORCED_KEY, '1');

        expect(isLogCollectionEnabled()).toBe(false);
        expect(createLogUploadSwitch()()).toBe(false);
    });

    it('빌드 플래그는 수집을 멈추지 않는다 — 수집기 회복 후 보내야 한다', () => {
        expect(isLogCollectionEnabled()).toBe(true);
        expect(createLogUploadSwitch(true)()).toBe(false);
    });
});

describe('isLogUploadHeld', () => {
    it('기본값은 보류하지 않는다', () => {
        expect(isLogUploadHeld()).toBe(false);
        expect(createLogUploadSwitch()()).toBe(true);
    });

    it('웹 보류 키가 전송을 멈춘다', () => {
        localStorage.setItem(LOG_UPLOAD_HOLD_KEY, '1');

        expect(isLogUploadHeld()).toBe(true);
        expect(createLogUploadSwitch()()).toBe(false);
    });

    it('앱이 주입한 전역도 전송을 멈춘다 — 하이브리드에서 토글은 앱 메뉴에 있다', () => {
        appHold.CHATIC_APP_LOG_UPLOAD_HOLD = true;

        expect(isLogUploadHeld()).toBe(true);
        expect(createLogUploadSwitch()()).toBe(false);
    });

    it('보류는 강제 플래그를 이긴다 — 지면 디버깅 중인 기기에서만 토글이 먹지 않는다', () => {
        localStorage.setItem(LOG_UPLOAD_FORCED_KEY, '1');
        localStorage.setItem(LOG_UPLOAD_HOLD_KEY, '1');

        expect(createLogUploadSwitch(true)()).toBe(false);
    });

    it('보류는 수집을 멈추지 않는다 — 큐가 채워져야 모니터링이 의미를 갖는다', () => {
        localStorage.setItem(LOG_UPLOAD_HOLD_KEY, '1');

        expect(isLogCollectionEnabled()).toBe(true);
    });

    it('opt-out과 동시에 켜지면 opt-out이 이긴다 — 큐를 버리는 쪽이 더 센 레버다', () => {
        localStorage.setItem(LOG_UPLOAD_HOLD_KEY, '1');
        localStorage.setItem(LOG_UPLOAD_DISABLED_KEY, '1');

        expect(isLogCollectionEnabled()).toBe(false);
        expect(createLogUploadSwitch()()).toBe(false);
    });

    it('매 호출마다 다시 읽는다 — 보류를 풀면 다음 flush가 쌓인 것을 보낸다', () => {
        const isEnabled = createLogUploadSwitch();
        localStorage.setItem(LOG_UPLOAD_HOLD_KEY, '1');
        expect(isEnabled()).toBe(false);

        localStorage.removeItem(LOG_UPLOAD_HOLD_KEY);

        expect(isEnabled()).toBe(true);
    });
});
