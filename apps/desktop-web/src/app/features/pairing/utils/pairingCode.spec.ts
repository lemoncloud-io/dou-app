import { describe, expect, it } from 'vitest';

import { formatPairingCode, formatRemaining, normalizePairingCode } from './pairingCode';

describe('formatPairingCode', () => {
    it('splits eight digits into two groups of four', () => {
        expect(formatPairingCode('07344168')).toBe('0734-4168');
    });

    it('leaves a partial code as typed', () => {
        expect(formatPairingCode('0734')).toBe('0734');
        expect(formatPairingCode('')).toBe('');
    });
});

describe('formatRemaining', () => {
    it('reads minutes and zero-padded seconds, rounding a partial second up', () => {
        expect(formatRemaining(125_000)).toBe('2:05');
        expect(formatRemaining(400)).toBe('0:01');
    });

    it('never goes below zero', () => {
        expect(formatRemaining(-5_000)).toBe('0:00');
    });
});

describe('normalizePairingCode', () => {
    it('keeps the digits of a code pasted with a hyphen or spaces', () => {
        expect(normalizePairingCode('0734-4168')).toBe('07344168');
        expect(normalizePairingCode(' 0734 4168 ')).toBe('07344168');
    });

    it('keeps at most eight digits', () => {
        expect(normalizePairingCode('0734416899')).toBe('07344168');
    });

    it('drops anything that is not a digit', () => {
        expect(normalizePairingCode('ab12')).toBe('12');
    });
});
