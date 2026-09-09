import type { ConfigRegistryModule } from '../types';

/**
 * Session, credential refresh and retry timing.
 *
 * `sdk.*` excludes `'server'` on purpose — a wrong remote value for refresh cadence can make every
 * device refresh at once, and undoing it remotely means writing this same value again while the
 * backend is already under the load it just caused. Only shell and local reach it.
 *
 * `sdk.*` is `'reconnect'`: `SocketManager` passes `AUTH_OPTIONS` to the SDK at socket construction,
 * so a changed value needs a reconnect to take effect.
 */
export const authModule: ConfigRegistryModule = {
    'auth.sdk.refreshRatio': {
        title: '인증 갱신 시점 비율',
        description: '자격증명 수명의 이 비율이 지나면 갱신을 시작한다.',
        type: 'number',
        defaultValue: 0.8,
        surface: 'dev',
        writableBy: ['local'],
        persist: 'session',
        appliesAt: 'reconnect',
    },
    'auth.sdk.maxFailures': {
        title: '인증 갱신 연속 실패 한도',
        description: '이 횟수를 넘겨 실패하면 세션을 만료로 판정한다.',
        type: 'number',
        defaultValue: 3,
        surface: 'dev',
        writableBy: ['local'],
        persist: 'session',
        appliesAt: 'reconnect',
    },
    'auth.sdk.refreshIntervalMs': {
        title: '인증 갱신 주기',
        description: '자격증명을 다시 확인하는 주기.',
        type: 'number',
        defaultValue: 300_000,
        surface: 'dev',
        writableBy: ['local'],
        persist: 'session',
        appliesAt: 'reconnect',
    },
    'auth.verify.timeoutMs': {
        title: '인증 확인 타임아웃',
        description: '소켓 인증 확인 요청이 이만큼 지나면 실패로 처리한다.',
        type: 'number',
        defaultValue: 10_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'auth.staleness.checkIntervalMs': {
        title: '세션 신선도 점검 주기',
        description: '세션이 여전히 유효한지 확인하는 주기.',
        type: 'number',
        defaultValue: 30_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'auth.staleness.forceRefreshCooldownMs': {
        title: '강제 갱신 최소 간격',
        description: '연속된 강제 갱신 사이에 두는 최소 간격. 갱신 폭주를 막는다.',
        type: 'number',
        defaultValue: 60_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'auth.init.maxRetries': {
        title: '세션 초기화 재시도 횟수',
        description: '부팅 시 세션 초기화가 실패했을 때 다시 시도하는 최대 횟수.',
        type: 'number',
        defaultValue: 3,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'auth.init.retryDelayMs': {
        title: '세션 초기화 재시도 간격',
        description: '세션 초기화 재시도 사이의 대기 시간.',
        type: 'number',
        defaultValue: 2_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'auth.keepAlive.retryFloorMs': {
        title: '세션 유지 재시도 최소 간격',
        description: '게스트 로그인 재시도 사이에 두는 최소 간격.',
        type: 'number',
        defaultValue: 5_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'auth.credential.retrySleepMs': {
        title: '자격증명 재발급 대기 시간',
        description: '클라우드 자격증명 재발급 실패 후 다시 시도하기까지 대기 시간.',
        type: 'number',
        defaultValue: 60_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
};
