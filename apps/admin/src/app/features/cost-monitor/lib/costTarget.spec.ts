/**
 * `lib/cost-monitor/costTarget.spec.ts`
 */
import { describe, expect, it, vi } from 'vitest';

const env: Record<string, string | undefined> = {
    VITE_V1_GOODS_ENDPOINT: 'https://api.example.org/cgs-v1/',
    VITE_V1_RELAY_ENDPOINT: 'https://api.example.org/dou-v1',
};

vi.mock('../../../config/adapters', () => ({
    webConfigPorts: { env: { raw: (name: string) => env[name] } },
}));

const { costBasesFor, initialCostStage, isCostStage } = await import('./costTarget');

describe('costBasesFor', () => {
    it("reads each stage's own keys", () => {
        expect(costBasesFor('v1')).toEqual({
            goods: 'https://api.example.org/cgs-v1',
            relay: 'https://api.example.org/dou-v1',
        });
    });

    it('leaves an unset stage empty rather than guessing it', () => {
        expect(costBasesFor('d1')).toEqual({ goods: '', relay: '' });
    });
});

describe('initialCostStage', () => {
    it('opens on production only for a plain dou-v1 relay', () => {
        expect(initialCostStage('https://api.example.org/dou-v1/')).toBe('v1');
        expect(initialCostStage('https://api.example.org/dou-d1')).toBe('d1');
        expect(initialCostStage(undefined)).toBe('d1');
    });
});

describe('isCostStage', () => {
    it('accepts only the known stages', () => {
        expect(isCostStage('v1')).toBe(true);
        expect(isCostStage('v2')).toBe(false);
    });
});
