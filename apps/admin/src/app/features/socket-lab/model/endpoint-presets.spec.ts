/**
 * `model/endpoint-presets.spec.ts`
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { defaultWsUrl, endpointPresets } from './endpoint-presets';

const stubSockets = () => {
    vi.stubEnv('VITE_D1_WS_ENDPOINT', 'wss://dev.example.com/cht-d1');
    vi.stubEnv('VITE_V1_WS_ENDPOINT', 'wss://prod.example.com/cht-v1');
};

describe('endpointPresets', () => {
    afterEach(() => vi.unstubAllEnvs());

    it("offers each configured stage's socket with the v2 flag, development first", () => {
        stubSockets();

        expect(endpointPresets()).toEqual([
            { stage: 'd1', label: 'DEV (d1)', wsUrl: 'wss://dev.example.com/cht-d1?v2' },
            { stage: 'v1', label: 'PROD (v1)', wsUrl: 'wss://prod.example.com/cht-v1?v2' },
        ]);
    });

    it('leaves out a stage whose key is unset', () => {
        stubSockets();
        vi.stubEnv('VITE_D1_WS_ENDPOINT', '');

        expect(endpointPresets().map(preset => preset.stage)).toEqual(['v1']);
    });
});

describe('defaultWsUrl', () => {
    afterEach(() => vi.unstubAllEnvs());

    it("starts on the build's opening stage", () => {
        stubSockets();
        vi.stubEnv('VITE_ENV', 'PROD');
        expect(defaultWsUrl()).toBe('wss://prod.example.com/cht-v1?v2');

        vi.stubEnv('VITE_ENV', 'DEV');
        expect(defaultWsUrl()).toBe('wss://dev.example.com/cht-d1?v2');
    });

    it('falls back to the configured stage, then to an empty field', () => {
        vi.stubEnv('VITE_ENV', 'DEV');
        vi.stubEnv('VITE_D1_WS_ENDPOINT', '');
        vi.stubEnv('VITE_V1_WS_ENDPOINT', 'wss://prod.example.com/cht-v1');
        expect(defaultWsUrl()).toBe('wss://prod.example.com/cht-v1?v2');

        vi.stubEnv('VITE_V1_WS_ENDPOINT', '');
        expect(defaultWsUrl()).toBe('');
    });
});
