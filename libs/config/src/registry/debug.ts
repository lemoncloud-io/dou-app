import type { ConfigRegistryModule } from '../types';

/**
 * The debug panel's own controls.
 *
 * `overlayEnabled` and `entryCode` are `meta: true` for the same reason `system.*` is — they gate
 * entry to the panel itself, so the generic panel does not render them and the unlock check does
 * not apply to them (ADR-0080 decision 6). `overlayEnabled`'s `byStage` is what removes the 10-tap
 * friction in LOCAL/DEV while PROD stays exactly as strict as today.
 *
 * `entryCode` is sourced from `VITE_DEBUG_CODE` and from nothing else — `writableBy: []` means no
 * lane can supply it, so the build is the only answer. An unset secret leaves it at `defaultValue`
 * (`''`), which is the fail-closed the gate already relies on: no code, no dialog (ADR-0092 decision 2).
 *
 * The web-address switcher the draft put here (`webviewBaseUrl`/`environmentSettings`) is NOT a key
 * — it was dropped rather than allow-listed, because a list still cannot close PROD, so it would
 * have meant building a list, validation and a fallback for a feature that stays closed anyway
 * (ADR-0080 decision 13). `env.webviewBaseUrl` (read-only) is what is left of it here.
 *
 * The app half of decision 13 has since landed too (`4b80a76b7`, 2026-09-10): the shell's
 * `EnvironmentSettingsScreen` is gone and the custom-zip loader moved to the web. The registry never
 * gave the switcher a writable key either — see `ConfigKvService`'s docblock for what keeps the
 * shell lane from reaching it.
 */
export const debugModule: ConfigRegistryModule = {
    'debug.overlayEnabled': {
        title: 'Debug overlay',
        description: 'Opens access to the debug screen. PROD requires 10 taps plus an entry code.',
        type: 'boolean',
        defaultValue: false,
        byStage: { LOCAL: true, DEV: true },
        surface: 'dev',
        writableBy: ['shell', 'local'],
        persist: 'session',
        meta: true,
    },
    'debug.entryCode': {
        title: 'Debug entry code',
        description: 'The code entered to open the debug overlay in PROD.',
        type: 'string',
        defaultValue: '',
        envDefaultKey: 'VITE_DEBUG_CODE',
        surface: 'dev',
        writableBy: [],
        persist: 'none',
        meta: true,
    },
    'debug.mockService.mode': {
        title: 'Mock service mode',
        description: 'Uses local or fixture responses instead of the real server.',
        type: 'enum',
        values: ['off', 'local', 'fixture'],
        defaultValue: 'off',
        surface: 'dev',
        writableBy: ['shell'],
        persist: 'shell',
    },
    'debug.mockService.baseUrl': {
        title: 'Mock service address',
        description: "The server address used when mock service mode is 'local'.",
        type: 'string',
        defaultValue: '',
        surface: 'dev',
        writableBy: ['shell'],
        persist: 'shell',
    },
    'debug.overlay.backdropOpacity': {
        title: 'Overlay backdrop opacity',
        description: 'The opacity of the backdrop behind the debug overlay.',
        type: 'number',
        defaultValue: 0.35,
        surface: 'dev',
        writableBy: ['shell'],
        persist: 'shell',
    },
    'debug.overlay.contentOpacity': {
        title: 'Overlay content opacity',
        description: 'The opacity of the debug overlay itself.',
        type: 'number',
        defaultValue: 1,
        surface: 'dev',
        writableBy: ['shell'],
        persist: 'shell',
    },
};
