import {
    createLogUploadSwitch,
    isLogCollectionEnabled,
    LOG_UPLOAD_DISABLED_KEY,
    LOG_UPLOAD_FORCED_KEY,
} from './logUploadSwitch';

beforeEach(() => {
    localStorage.clear();
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
