/**
 * `config/stageEndpoints.spec.ts`
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    openingStage,
    readStageEndpoint,
    relayOverrideFor,
    relayTargetFor,
    sessionRelayStage,
    stageEndpoint,
    stageEndpointKey,
} from './stageEndpoints';

describe('stageEndpointKey', () => {
    it('names the key by stage, then service', () => {
        expect(stageEndpointKey('relay', 'd1')).toBe('VITE_D1_RELAY_ENDPOINT');
        expect(stageEndpointKey('presence', 'v1')).toBe('VITE_V1_PRESENCE_ENDPOINT');
    });
});

describe('readStageEndpoint', () => {
    it('reads the key for that service and stage only', () => {
        const env: Record<string, string> = {
            VITE_D1_GOODS_ENDPOINT: 'https://dev.example.com/cgs-d1',
            VITE_V1_GOODS_ENDPOINT: 'https://prod.example.com/cgs-v1',
        };

        expect(readStageEndpoint(name => env[name], 'goods', 'd1')).toBe('https://dev.example.com/cgs-d1');
        expect(readStageEndpoint(name => env[name], 'goods', 'v1')).toBe('https://prod.example.com/cgs-v1');
    });

    it('trims whitespace and trailing slashes', () => {
        expect(readStageEndpoint(() => ' wss://ws.example.com/cht-d1// ', 'ws', 'd1')).toBe(
            'wss://ws.example.com/cht-d1'
        );
    });

    // No fallback to another key: the stages do not share a host, so a guess would be a wrong server.
    it('is empty when the key is unset, even if the other stage is set', () => {
        const env: Record<string, string> = { VITE_D1_ARCHIVE_ENDPOINT: 'https://dev.example.com/arc-d1' };
        expect(readStageEndpoint(name => env[name], 'archive', 'v1')).toBe('');
        expect(readStageEndpoint(() => '  ', 'archive', 'v1')).toBe('');
    });
});

describe('stageEndpoint', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('reads the build env', () => {
        vi.stubEnv('VITE_V1_RELAY_ENDPOINT', 'https://prod.example.com/dou-v1/');

        expect(stageEndpoint('relay', 'v1')).toBe('https://prod.example.com/dou-v1');
    });
});

describe('openingStage', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('opens a production build on production', () => {
        vi.stubEnv('VITE_ENV', 'PROD');
        expect(openingStage()).toBe('v1');
    });

    // The session signs in to production in every build; the opening stage does not follow it.
    it('opens every other build on development, whatever the session relay', () => {
        vi.stubEnv('VITE_DOU_ENDPOINT', 'https://prod.example.com/dou-v1');
        vi.stubEnv('VITE_ENV', 'DEV');
        expect(openingStage()).toBe('d1');
        vi.stubEnv('VITE_ENV', 'LOCAL');
        expect(openingStage()).toBe('d1');
    });
});

describe('session relay and overrides', () => {
    afterEach(() => vi.unstubAllEnvs());

    const stub = (session: string) => {
        vi.stubEnv('VITE_DOU_ENDPOINT', session);
        vi.stubEnv('VITE_D1_RELAY_ENDPOINT', 'https://dev.example.com/dou-d1');
        vi.stubEnv('VITE_V1_RELAY_ENDPOINT', 'https://prod.example.com/dou-v1');
    };

    it('reads the session stage off its relay, production only when it plainly says so', () => {
        stub('https://prod.example.com/dou-v1/');
        expect(sessionRelayStage()).toBe('v1');
        stub('https://relay.example.com');
        expect(sessionRelayStage()).toBe('d1');
    });

    it("leaves the session's stage alone and points the other at its own key", () => {
        stub('https://session.example.com/dou-v1');

        expect(relayOverrideFor('v1')).toBeUndefined();
        expect(relayOverrideFor('d1')).toBe('https://dev.example.com/dou-d1');
        expect(relayTargetFor('v1')).toBe('https://session.example.com/dou-v1');
        expect(relayTargetFor('d1')).toBe('https://dev.example.com/dou-d1');
    });

    it('throws, naming the key, when the other stage is not configured', () => {
        stub('https://session.example.com/dou-v1');
        vi.stubEnv('VITE_D1_RELAY_ENDPOINT', '');

        expect(() => relayOverrideFor('d1')).toThrow(/VITE_D1_RELAY_ENDPOINT is not set/);
        expect(relayTargetFor('d1')).toBe('');
    });
});
