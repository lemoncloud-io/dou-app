/**
 * `lib/cloud-deployments/goodsTarget.spec.ts`
 */
import { describe, expect, it } from 'vitest';

import { describeGoodsTarget, douBaseFor, goodsBaseFor, goodsHost, initialGoodsStage } from './goodsTarget';

describe('goodsHost', () => {
    it('strips the relay stage segment and any trailing slash', () => {
        expect(goodsHost('https://api.example.com/dou-d1')).toBe('https://api.example.com');
        expect(goodsHost(' https://api.example.com/dou-v1/ ')).toBe('https://api.example.com');
    });

    it('is empty when the endpoint is not configured', () => {
        expect(goodsHost(undefined)).toBe('');
        expect(goodsHost('  ')).toBe('');
    });
});

describe('goodsBaseFor', () => {
    it('puts the goods stage on the relay host', () => {
        expect(goodsBaseFor('https://api.example.com/dou-d1', 'd1')).toBe('https://api.example.com/cgs-d1');
        expect(goodsBaseFor('https://api.example.com/dou-d1', 'v1')).toBe('https://api.example.com/cgs-v1');
    });

    it('is empty when the endpoint is not configured, so nothing is called', () => {
        expect(goodsBaseFor(undefined, 'v1')).toBe('');
        expect(goodsBaseFor('', 'd1')).toBe('');
    });
});

describe('douBaseFor', () => {
    it('pairs a goods stage with the relay of the same stage', () => {
        expect(douBaseFor('https://api.example.com/dou-d1', 'v1')).toBe('https://api.example.com/dou-v1');
        expect(douBaseFor('https://api.example.com/dou-v1', 'd1')).toBe('https://api.example.com/dou-d1');
    });

    it('is empty when the endpoint is not configured', () => {
        expect(douBaseFor(undefined, 'v1')).toBe('');
    });
});

describe('describeGoodsTarget', () => {
    it('marks the production goods service as prod', () => {
        expect(describeGoodsTarget('https://api.example.com/dou-d1', 'v1')).toEqual({
            endpoint: 'https://api.example.com/cgs-v1',
            isProd: true,
            label: 'Production',
        });
        expect(describeGoodsTarget('https://api.example.com/dou-v1', 'd1')).toEqual({
            endpoint: 'https://api.example.com/cgs-d1',
            isProd: false,
            label: 'Development',
        });
    });

    it('says the endpoint is not configured instead of naming an address', () => {
        expect(describeGoodsTarget(undefined, 'v1').endpoint).toBe('(not configured)');
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
