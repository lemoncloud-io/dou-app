import { describe, expect, it } from 'vitest';

import { expiresAtForPreset } from './webhookExpiry';

describe('expiresAtForPreset', () => {
    it('is 0 for never — the value the server reads as no expiry', () => {
        expect(expiresAtForPreset('never', 1_000)).toBe(0);
    });

    it('is now plus the preset days', () => {
        expect(expiresAtForPreset('7', 1_000)).toBe(1_000 + 7 * 86_400_000);
        expect(expiresAtForPreset('90', 0)).toBe(90 * 86_400_000);
    });
});
