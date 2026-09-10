import { createWebEnvAdapter } from './webEnvAdapter';

const readerOf = (values: Record<string, string | undefined>) => (name: string) => values[name];

describe('createWebEnvAdapter — buildStage', () => {
    it('유효한 값이면 그대로 쓴다', () => {
        expect(createWebEnvAdapter(readerOf({ VITE_ENV: 'PROD' })).buildStage()).toBe('PROD');
    });

    it('소문자도 받아들인다 — VITE_ENV는 값 자체가 실은 대문자지만 대비한다', () => {
        expect(createWebEnvAdapter(readerOf({ VITE_ENV: 'dev' })).buildStage()).toBe('DEV');
    });

    it('없거나 모르는 값이면 LOCAL로 떨어진다', () => {
        expect(createWebEnvAdapter(readerOf({})).buildStage()).toBe('LOCAL');
        expect(createWebEnvAdapter(readerOf({ VITE_ENV: 'STAGING' })).buildStage()).toBe('LOCAL');
    });
});

describe('createWebEnvAdapter — stage', () => {
    it('셸이 주입한 값이 빌드값을 이긴다', () => {
        const adapter = createWebEnvAdapter(readerOf({ VITE_ENV: 'PROD', CHATIC_APP_STAGE: 'local' }));

        expect(adapter.stage()).toBe('LOCAL');
    });

    it("CHATIC_APP_STAGE의 'stage'는 DEV로 정규화한다 — 두 어휘가 다르다(ADR-0079 결정 14)", () => {
        expect(createWebEnvAdapter(readerOf({ CHATIC_APP_STAGE: 'stage' })).stage()).toBe('DEV');
    });

    it('주입이 없으면 buildStage로 떨어진다', () => {
        expect(createWebEnvAdapter(readerOf({ VITE_ENV: 'DEV' })).stage()).toBe('DEV');
    });
});

describe('createWebEnvAdapter — platform', () => {
    it('주입된 플랫폼을 쓴다', () => {
        expect(createWebEnvAdapter(readerOf({ CHATIC_APP_PLATFORM: 'ios' })).platform()).toBe('ios');
    });

    it('없으면 web이다', () => {
        expect(createWebEnvAdapter(readerOf({})).platform()).toBe('web');
    });
});

describe('createWebEnvAdapter — raw', () => {
    it('없는 값은 undefined다', () => {
        expect(createWebEnvAdapter(readerOf({})).raw('VITE_HOST')).toBeUndefined();
    });

    it('project·region·host·oauth 두 엔드포인트는 소문자로 내린다 — web-config와 같다', () => {
        const adapter = createWebEnvAdapter(
            readerOf({
                VITE_PROJECT: 'CHATIC',
                VITE_REGION: 'AP-NORTHEAST-2',
                VITE_HOST: 'HTTP://LOCALHOST',
                VITE_OAUTH_ENDPOINT: 'HTTPS://OAUTH.EXAMPLE.COM',
                VITE_SOCIAL_OAUTH_ENDPOINT: 'HTTPS://SOCIAL.EXAMPLE.COM',
            })
        );

        expect(adapter.raw('VITE_PROJECT')).toBe('chatic');
        expect(adapter.raw('VITE_REGION')).toBe('ap-northeast-2');
        expect(adapter.raw('VITE_HOST')).toBe('http://localhost');
        expect(adapter.raw('VITE_OAUTH_ENDPOINT')).toBe('https://oauth.example.com');
        expect(adapter.raw('VITE_SOCIAL_OAUTH_ENDPOINT')).toBe('https://social.example.com');
    });

    it('경로를 담는 엔드포인트는 대소문자를 그대로 둔다 — 경로는 대소문자를 가린다', () => {
        const adapter = createWebEnvAdapter(
            readerOf({
                VITE_DOU_ENDPOINT: 'https://api.example.com/DOU-d1',
                VITE_WS_ENDPOINT: 'wss://wss.example.com/CHT-d1',
                VITE_IAP_ENDPOINT: 'https://api.example.com/IAP-d1',
            })
        );

        expect(adapter.raw('VITE_DOU_ENDPOINT')).toBe('https://api.example.com/DOU-d1');
        expect(adapter.raw('VITE_WS_ENDPOINT')).toBe('wss://wss.example.com/CHT-d1');
        expect(adapter.raw('VITE_IAP_ENDPOINT')).toBe('https://api.example.com/IAP-d1');
    });
});
