import type { ConfigRegistryModule } from '../types';

/**
 * Endpoints and HTTP retry. No endpoint key includes `'server'` in `writableBy`
 * (ADR-0079 결정 10) — a remote config must not be able to move where the app talks to.
 *
 * `relay.backend`/`relay.wss` are session-scoped QA overrides, matching what `env.ts`
 * already did: an override is a convenience, not something a stray link should pin forever.
 */
export const netModule: ConfigRegistryModule = {
    'net.relay.backend': {
        title: '릴레이 백엔드 오버라이드',
        description: 'QA가 딥링크로 다른 백엔드를 가리킬 때 쓴다. 탭을 닫으면 사라진다.',
        type: 'string',
        defaultValue: '',
        surface: 'dev',
        writableBy: ['local'],
        persist: 'session',
    },
    'net.relay.wss': {
        title: '릴레이 소켓 오버라이드',
        description: 'QA가 딥링크로 다른 웹소켓 주소를 가리킬 때 쓴다. 탭을 닫으면 사라진다.',
        type: 'string',
        defaultValue: '',
        surface: 'dev',
        writableBy: ['local'],
        persist: 'session',
    },
    'net.oauth.endpoint': {
        title: 'OAuth 엔드포인트',
        description: '소셜 로그인 교환 요청을 보내는 주소.',
        type: 'string',
        defaultValue: '',
        surface: 'internal',
        writableBy: [],
        persist: 'none',
    },
    'net.socialOauth.endpoint': {
        title: '소셜 OAuth 릴레이 주소',
        description: '소셜 로그인 인가 요청을 보내는 릴레이 주소.',
        type: 'string',
        defaultValue: '',
        surface: 'internal',
        writableBy: [],
        persist: 'none',
    },
    'net.iap.endpoint': {
        title: '인앱결제 엔드포인트',
        description: '인앱결제 영수증 검증 요청을 보내는 주소.',
        type: 'string',
        defaultValue: '',
        surface: 'internal',
        writableBy: [],
        persist: 'none',
    },
    'net.admin.backend': {
        title: '관리자 백엔드 주소',
        description: 'admin-v2가 호출하는 백엔드 주소.',
        type: 'string',
        defaultValue: '',
        surface: 'internal',
        writableBy: [],
        persist: 'none',
    },
    'net.policy.baseUrl': {
        title: '약관 페이지 기본 주소',
        description: '이용약관·개인정보처리방침 링크가 가리키는 기본 도메인.',
        type: 'string',
        defaultValue: 'https://app.chatic.io',
        byStage: { LOCAL: 'https://app-dev.chatic.io', DEV: 'https://app-dev.chatic.io' },
        surface: 'internal',
        writableBy: [],
        persist: 'none',
    },
    'net.deeplink.scheme': {
        title: '딥링크 스킴',
        description: '앱을 여는 커스텀 URL 스킴.',
        type: 'string',
        defaultValue: 'chatic',
        byStage: { DEV: 'chatic-dev' },
        surface: 'internal',
        writableBy: [],
        persist: 'none',
    },
    'net.deeplink.desktopProtocol': {
        title: '데스크톱 프로토콜 스킴',
        description: '데스크톱 앱을 여는 커스텀 프로토콜.',
        type: 'string',
        defaultValue: 'chatic',
        surface: 'internal',
        writableBy: [],
        persist: 'none',
    },
    'net.retry.maxRetries': {
        title: 'HTTP 재시도 횟수',
        description: '요청이 실패했을 때 다시 시도하는 최대 횟수.',
        type: 'number',
        defaultValue: 4,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'net.retry.baseDelayMs': {
        title: 'HTTP 재시도 기본 간격',
        description: '재시도 사이 대기 시간의 기준값. 시도할수록 두 배씩 늘어난다.',
        type: 'number',
        defaultValue: 1000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
};
