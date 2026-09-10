import type { ConfigRegistryModule } from '../types';

/**
 * Cache TTLs. `cache.ttl.metaMs` is the flagship case for this whole registry: the source comment
 * calls it a temporary migration value that costs real server load and says to restore it once the
 * migration is done — today that restoration is a code change, a build and a deploy. As a key it
 * becomes one value change on the day the migration ends.
 */
export const cacheModule: ConfigRegistryModule = {
    'cache.ttl.defaultMs': {
        title: '캐시 기본 유지 시간',
        description: '채널·프로필 등 일반 캐시가 유효한 시간.',
        type: 'number',
        defaultValue: 1_800_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'cache.ttl.metaMs': {
        title: '동기화 커서 유지 시간',
        description: '이 시간을 넘겨 쉬면 델타 대신 전체 재동기화를 한다. 짧을수록 서버 부하가 커진다.',
        type: 'number',
        defaultValue: 300_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'cache.retiredGroupTtlMs': {
        title: '해제된 그룹 캐시 유지 시간',
        description: '더 이상 쓰지 않는 캐시 그룹을 완전히 지우기까지 기다리는 시간.',
        type: 'number',
        defaultValue: 60_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
};
