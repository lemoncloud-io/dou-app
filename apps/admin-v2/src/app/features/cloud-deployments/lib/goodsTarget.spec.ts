/**
 * `lib/cloud-deployments/goodsTarget.spec.ts`
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { describeGoodsTarget, douBaseFor, goodsBaseFor, initialGoodsStage } from './goodsTarget';

// The two stages on different hosts, as they are once the dev stage moved domain.
const stubStages = () => {
    vi.stubEnv('VITE_D1_GOODS_ENDPOINT', 'https://dev.example.com/cgs-d1');
    vi.stubEnv('VITE_V1_GOODS_ENDPOINT', 'https://prod.example.com/cgs-v1/');
    vi.stubEnv('VITE_D1_RELAY_ENDPOINT', 'https://dev.example.com/dou-d1');
    vi.stubEnv('VITE_V1_RELAY_ENDPOINT', 'https://prod.example.com/dou-v1');
};

describe('goodsBaseFor', () => {
    beforeEach(stubStages);
    afterEach(() => vi.unstubAllEnvs());

    it("takes each stage's goods service from its own key", () => {
        expect(goodsBaseFor('d1')).toBe('https://dev.example.com/cgs-d1');
        expect(goodsBaseFor('v1')).toBe('https://prod.example.com/cgs-v1');
    });

    it('is empty when that stage is not configured, so nothing is called', () => {
        vi.stubEnv('VITE_V1_GOODS_ENDPOINT', '');
        expect(goodsBaseFor('v1')).toBe('');
    });
});

describe('douBaseFor', () => {
    beforeEach(stubStages);
    afterEach(() => vi.unstubAllEnvs());

    it('pairs a goods stage with the relay of the same stage', () => {
        expect(douBaseFor('d1')).toBe('https://dev.example.com/dou-d1');
        expect(douBaseFor('v1')).toBe('https://prod.example.com/dou-v1');
    });

    it('is empty when that relay is not configured', () => {
        vi.stubEnv('VITE_D1_RELAY_ENDPOINT', '');
        expect(douBaseFor('d1')).toBe('');
    });
});

describe('describeGoodsTarget', () => {
    beforeEach(stubStages);
    afterEach(() => vi.unstubAllEnvs());

    it('marks the production goods service as prod', () => {
        expect(describeGoodsTarget('v1')).toEqual({
            endpoint: 'https://prod.example.com/cgs-v1',
            isProd: true,
            label: 'Production',
        });
        expect(describeGoodsTarget('d1')).toEqual({
            endpoint: 'https://dev.example.com/cgs-d1',
            isProd: false,
            label: 'Development',
        });
    });

    it('says the endpoint is not configured instead of naming an address', () => {
        vi.stubEnv('VITE_V1_GOODS_ENDPOINT', '');
        expect(describeGoodsTarget('v1').endpoint).toBe('(not configured)');
    });
});

describe('initialGoodsStage', () => {
    it('follows the relay stage the env names', () => {
        expect(initialGoodsStage('https://api.example.com/dou-v1')).toBe('v1');
        expect(initialGoodsStage('https://api.example.com/dou-v1/')).toBe('v1');
        expect(initialGoodsStage('https://api.example.com/dou-d1')).toBe('d1');
    });

    it('opens on development when the env names neither stage', () => {
        expect(initialGoodsStage(undefined)).toBe('d1');
        expect(initialGoodsStage('https://api.example.com/d1')).toBe('d1');
    });
});
