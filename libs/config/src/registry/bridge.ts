import type { ConfigRegistryModule } from '../types';

/**
 * Bridge timing. `request.timeoutMs` is `'restart'`: `WebBridgeClient`'s constructor captures it
 * into an instance field (`this.timeoutMs = config.timeoutMs ?? 10000`), so a changed value has no
 * effect until the client is rebuilt — and its own default disagreed with `provider.ts`'s `15000`
 * before this key existed, so which one was live depended on whether a call went through the
 * provider. One key now settles it.
 */
export const bridgeModule: ConfigRegistryModule = {
    'bridge.request.timeoutMs': {
        title: '브릿지 요청 타임아웃',
        description: '셸에 보낸 요청이 이만큼 지나면 응답 없음으로 처리한다.',
        type: 'number',
        defaultValue: 15_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'restart',
    },
    'bridge.handshake.waitTimeoutMs': {
        title: '브릿지 핸드셰이크 대기 시간',
        description: '셸의 준비 신호를 이만큼 기다리다 포기한다.',
        type: 'number',
        defaultValue: 10_000,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
};
