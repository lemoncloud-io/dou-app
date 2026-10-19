import { describe, expect, it } from 'vitest';

import { RELAY_CLOUD_ID } from '@chatic/data';

import { pushCloudIdOf, RELAY_ORIGIN_CID } from './pushCloudId';

describe('pushCloudIdOf', () => {
    it("reads the relay sentinel as the relay's own cloud id", () => {
        expect(pushCloudIdOf(RELAY_ORIGIN_CID)).toBe(RELAY_CLOUD_ID);
    });

    it('keeps a real cloud id as it is', () => {
        expect(pushCloudIdOf('1000002')).toBe('1000002');
    });

    it('reads an empty or missing cid as no cloud', () => {
        expect(pushCloudIdOf('')).toBeUndefined();
        expect(pushCloudIdOf(undefined)).toBeUndefined();
        expect(pushCloudIdOf(42)).toBeUndefined();
    });
});
