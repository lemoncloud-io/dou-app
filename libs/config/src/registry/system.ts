import type { ConfigRegistryModule } from '../types';

/**
 * Resolver metadata — the two keys the lane machinery itself needs.
 *
 * `overridesUnlocked` opens the local lane (row 3). `remote.enabled` opens the two server rows.
 * Both use `meta: true`: they ARE the lock, so the generic panel does not render them and the
 * unlock gate does not apply to them (ADR-0079 결정 4·5).
 */
export const systemModule: ConfigRegistryModule = {
    'system.overridesUnlocked': {
        title: '오버라이드 잠금 해제',
        description: '웹 오버라이드 레인(3행)을 살린다. 10탭 + 입장 코드로 연다.',
        type: 'boolean',
        defaultValue: true,
        byStage: { PROD: false },
        surface: 'dev',
        writableBy: ['shell', 'local'],
        persist: 'session',
        meta: true,
    },
    'system.remote.enabled': {
        title: '원격 설정 스위치',
        description: '서버가 값을 내려줄 수 있게 한다. 꺼져 있으면 원격 레인은 항상 비어 있다.',
        type: 'boolean',
        defaultValue: false,
        surface: 'dev',
        writableBy: ['shell'],
        persist: 'shell',
        meta: true,
    },
};
