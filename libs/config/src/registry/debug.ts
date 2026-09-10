import type { ConfigRegistryModule } from '../types';

/**
 * The debug panel's own controls.
 *
 * `overlayEnabled` and `entryCode` are `meta: true` for the same reason `system.*` is — they gate
 * entry to the panel itself, so the generic panel does not render them and the unlock check does
 * not apply to them (ADR-0080 결정 6). `overlayEnabled`'s `byStage` is what removes the 10-tap
 * friction in LOCAL/DEV while PROD stays exactly as strict as today.
 *
 * `entryCode` is sourced from `VITE_DEBUG_CODE` and from nothing else — `writableBy: []` means no
 * lane can supply it, so the build is the only answer. An unset secret leaves it at `defaultValue`
 * (`''`), which is the fail-closed the gate already relies on: no code, no dialog (ADR-0034 결정 2).
 *
 * The web-address switcher the draft put here (`webviewBaseUrl`/`environmentSettings`) is NOT a key
 * — it was dropped rather than allow-listed, because a list still cannot close PROD, so it would
 * have meant building a list, validation and a fallback for a feature that stays closed anyway
 * (ADR-0080 결정 13). `env.webviewBaseUrl` (read-only) is what is left of it here.
 *
 * That says nothing about the app: 결정 13 also decided to delete the switcher itself, and that half
 * is still unimplemented (`apps/mobile/.../EnvironmentSettingsScreen.tsx`, 2026-09-10). The registry
 * simply never gave it a writable key — see `ConfigKvService`'s docblock for what actually keeps the
 * shell lane from reaching it.
 */
export const debugModule: ConfigRegistryModule = {
    'debug.overlayEnabled': {
        title: '디버그 오버레이',
        description: '디버그 화면 진입을 연다. PROD는 10탭 + 입장 코드가 필요하다.',
        type: 'boolean',
        defaultValue: false,
        byStage: { LOCAL: true, DEV: true },
        surface: 'dev',
        writableBy: ['shell', 'local'],
        persist: 'session',
        meta: true,
    },
    'debug.entryCode': {
        title: '디버그 입장 코드',
        description: 'PROD에서 디버그 오버레이를 열 때 입력하는 코드.',
        type: 'string',
        defaultValue: '',
        envDefaultKey: 'VITE_DEBUG_CODE',
        surface: 'dev',
        writableBy: [],
        persist: 'none',
        meta: true,
    },
    'debug.mockService.mode': {
        title: '모의 서비스 모드',
        description: '실제 서버 대신 로컬·픽스처 응답을 쓴다.',
        type: 'enum',
        values: ['off', 'local', 'fixture'],
        defaultValue: 'off',
        surface: 'dev',
        writableBy: ['shell'],
        persist: 'shell',
    },
    'debug.mockService.baseUrl': {
        title: '모의 서비스 주소',
        description: "모의 서비스 모드가 'local'일 때 사용할 서버 주소.",
        type: 'string',
        defaultValue: '',
        surface: 'dev',
        writableBy: ['shell'],
        persist: 'shell',
    },
    'debug.overlay.backdropOpacity': {
        title: '오버레이 배경 불투명도',
        description: '디버그 오버레이 뒤 배경의 불투명도.',
        type: 'number',
        defaultValue: 0.35,
        surface: 'dev',
        writableBy: ['shell'],
        persist: 'shell',
    },
    'debug.overlay.contentOpacity': {
        title: '오버레이 내용 불투명도',
        description: '디버그 오버레이 자체의 불투명도.',
        type: 'number',
        defaultValue: 1,
        surface: 'dev',
        writableBy: ['shell'],
        persist: 'shell',
    },
};
