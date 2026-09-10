import { createLogUploadSwitch, isLogCollectionEnabled, isLogUploadHeld, setLogUploadHold } from './logUploadSwitch';

// A tiny fake resolver: defaults match the registry's own declared defaults
// (log.collection.enabled/log.upload.enabled: true, log.upload.hold: false), and `set` marks a key
// overridden the same way a real `local`-lane write would.
let values: Record<string, unknown> = {};
let overridden: Record<string, boolean> = {};

const DEFAULTS: Record<string, unknown> = {
    'log.collection.enabled': true,
    'log.upload.enabled': true,
    'log.upload.hold': false,
};

jest.mock('@chatic/config', () => ({
    config: {
        get: (key: string) => (key in values ? values[key] : DEFAULTS[key]),
        snapshot: (key: string) => ({
            value: key in values ? values[key] : DEFAULTS[key],
            isOverridden: !!overridden[key],
        }),
        set: (key: string, value: unknown) => {
            values[key] = value;
            overridden[key] = true;
        },
    },
}));

/** Simulates an override landing on a key — however it got there (local write, shell hydration). */
const setOverride = (key: string, value: unknown) => {
    values[key] = value;
    overridden[key] = true;
};

const appHold = window as unknown as { CHATIC_APP_LOG_UPLOAD_HOLD?: boolean };

beforeEach(() => {
    values = {};
    overridden = {};
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
        setOverride('log.collection.enabled', false);
        setOverride('log.upload.enabled', true);

        expect(createLogUploadSwitch()()).toBe(false);
    });

    it('강제(로컬 오버라이드)로 빌드 설정을 이길 수 있다', () => {
        setOverride('log.upload.enabled', true);

        expect(createLogUploadSwitch(true)()).toBe(true);
    });

    it('매 호출마다 다시 읽는다 — 껐다 켜는 데 리로드가 필요하면 안 된다', () => {
        const isEnabled = createLogUploadSwitch();
        expect(isEnabled()).toBe(true);

        setOverride('log.collection.enabled', false);

        expect(isEnabled()).toBe(false);
    });
});

describe('isLogCollectionEnabled', () => {
    it('기본값은 수집한다', () => {
        expect(isLogCollectionEnabled()).toBe(true);
    });

    it('기기 opt-out은 수집 자체를 멈춘다 — 전송만 멈추면 opt-out의 의미가 없다', () => {
        setOverride('log.collection.enabled', false);

        expect(isLogCollectionEnabled()).toBe(false);
    });

    it('강제 오버라이드로도 기기 opt-out을 되돌릴 수 없다', () => {
        setOverride('log.collection.enabled', false);
        setOverride('log.upload.enabled', true);

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
        setOverride('log.upload.hold', true);

        expect(isLogUploadHeld()).toBe(true);
        expect(createLogUploadSwitch()()).toBe(false);
    });

    it('앱이 주입한 전역도 전송을 멈춘다 — 하이브리드에서 토글은 앱 메뉴에 있다', () => {
        appHold.CHATIC_APP_LOG_UPLOAD_HOLD = true;

        expect(isLogUploadHeld()).toBe(true);
        expect(createLogUploadSwitch()()).toBe(false);
    });

    it('보류는 강제 오버라이드를 이긴다 — 지면 디버깅 중인 기기에서만 토글이 먹지 않는다', () => {
        setOverride('log.upload.enabled', true);
        setOverride('log.upload.hold', true);

        expect(createLogUploadSwitch(true)()).toBe(false);
    });

    it('보류는 수집을 멈추지 않는다 — 큐가 채워져야 모니터링이 의미를 갖는다', () => {
        setOverride('log.upload.hold', true);

        expect(isLogCollectionEnabled()).toBe(true);
    });

    it('opt-out과 동시에 켜지면 opt-out이 이긴다 — 큐를 버리는 쪽이 더 센 레버다', () => {
        setOverride('log.upload.hold', true);
        setOverride('log.collection.enabled', false);

        expect(isLogCollectionEnabled()).toBe(false);
        expect(createLogUploadSwitch()()).toBe(false);
    });

    it('매 호출마다 다시 읽는다 — 보류를 풀면 다음 flush가 쌓인 것을 보낸다', () => {
        const isEnabled = createLogUploadSwitch();
        setOverride('log.upload.hold', true);
        expect(isEnabled()).toBe(false);

        setOverride('log.upload.hold', false);

        expect(isEnabled()).toBe(true);
    });
});

describe('setLogUploadHold', () => {
    it('local 레인으로 log.upload.hold를 쓴다', () => {
        setLogUploadHold(true);

        expect(isLogUploadHeld()).toBe(true);
    });
});
