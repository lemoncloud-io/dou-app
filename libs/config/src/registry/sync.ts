import type { ConfigRegistryModule } from '../types';

/**
 * Socket and sync cadence. `profile.*` and `resume.*` include `'server'` — easing polling when the
 * backend is under load is the most legitimate use of that lane (ADR-0079 §2차 스윕).
 */
export const syncModule: ConfigRegistryModule = {
    'sync.profile.channelIntervalMs': {
        title: '채널 멤버 프로필 동기화 주기',
        description: '채널 멤버들의 닉네임·아바타를 다시 확인하는 주기.',
        type: 'number',
        defaultValue: 20_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'sync.profile.listIntervalMs': {
        title: 'DM 상대 프로필 동기화 주기',
        description: '목록 화면에서 DM 상대 프로필을 다시 확인하는 주기.',
        type: 'number',
        defaultValue: 60_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'sync.unregisterGraceMs': {
        title: '동기화 해제 유예 시간',
        description: '화면을 떠난 뒤 동기화 대상에서 실제로 빼기까지 기다리는 시간.',
        type: 'number',
        defaultValue: 30_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'sync.wake.kickThrottleMs': {
        title: '소켓 재개 최소 간격',
        description: '화면 복귀로 소켓을 깨우는 시도 사이의 최소 간격.',
        type: 'number',
        defaultValue: 5_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'sync.resume.initialCooldownMs': {
        title: '만료 후 재개 초기 대기',
        description: '소켓이 만료된 뒤 재개를 다시 시도하기까지 첫 대기 시간.',
        type: 'number',
        defaultValue: 30_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'sync.resume.maxCooldownMs': {
        title: '만료 후 재개 최대 대기',
        description: '반복 실패 시 재개 대기 시간이 늘어나는 상한.',
        type: 'number',
        defaultValue: 300_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
};
