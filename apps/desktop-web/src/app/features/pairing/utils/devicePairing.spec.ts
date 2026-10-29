import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ flag: undefined as unknown, native: false, guest: false }));

vi.mock('@chatic/config', () => ({ config: { get: () => env.flag } }));
vi.mock('@chatic/bridges', () => ({ isNative: () => env.native }));
vi.mock('../../../shared/hooks/useRelayAccount', () => ({ isRelayGuest: () => env.guest }));

import { canApprovePairing, canRequestPairing, isDevicePairingEnabled } from './devicePairing';

describe('device pairing gates', () => {
    beforeEach(() => {
        env.flag = true;
        env.native = false;
        env.guest = false;
    });

    it('is off unless the registry key is exactly true', () => {
        for (const value of [undefined, false, 'true', 1]) {
            env.flag = value;
            expect(isDevicePairingEnabled()).toBe(false);
        }
        env.flag = true;
        expect(isDevicePairingEnabled()).toBe(true);
    });

    it('lets a plain browser request a code, never the desktop app', () => {
        expect(canRequestPairing()).toBe(true);
        env.native = true;
        expect(canRequestPairing()).toBe(false);
        env.native = false;
        env.flag = false;
        expect(canRequestPairing()).toBe(false);
    });

    it('lets only the desktop app approve, and not a session that was itself paired', () => {
        env.native = true;
        expect(canApprovePairing(false)).toBe(true);
        expect(canApprovePairing(true)).toBe(false);
        env.native = false;
        expect(canApprovePairing(false)).toBe(false);
        env.native = true;
        env.flag = false;
        expect(canApprovePairing(false)).toBe(false);
    });

    it('does not let a guest approve — it has no sign-in of its own to hand on', () => {
        env.native = true;
        env.guest = true;
        expect(canApprovePairing(false)).toBe(false);
    });
});
