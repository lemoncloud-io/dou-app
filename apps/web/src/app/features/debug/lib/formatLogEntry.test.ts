import type { AppLogInfo } from '@chatic/app-messages';

import { formatLogForCopy, formatTimestamp, hasErrorValue, stringifyValue } from './formatLogEntry';

describe('formatTimestamp', () => {
    it('값이 없으면 대시를 반환한다', () => {
        expect(formatTimestamp(undefined)).toBe('-');
        expect(formatTimestamp(0)).toBe('-');
    });

    it('초 단위와 밀리초 단위를 같은 시각으로 해석한다', () => {
        const seconds = 1_700_000_000;
        expect(formatTimestamp(seconds)).toBe(formatTimestamp(seconds * 1000));
    });
});

describe('stringifyValue', () => {
    it('문자열은 그대로, 객체는 JSON으로, Error는 name/message로 표현한다', () => {
        expect(stringifyValue('hello')).toBe('hello');
        expect(stringifyValue({ a: 1 })).toBe('{\n  "a": 1\n}');
        expect(stringifyValue(new Error('boom'))).toBe('Error: boom');
    });

    it('null/undefined는 빈 문자열, 순환 참조는 문자열로 폴백한다', () => {
        expect(stringifyValue(undefined)).toBe('');
        expect(stringifyValue(null)).toBe('');

        const circular: Record<string, unknown> = {};
        circular.self = circular;
        expect(stringifyValue(circular)).toBe('[object Object]');
    });
});

describe('hasErrorValue', () => {
    it('의미 있는 에러만 true로 판정한다', () => {
        expect(hasErrorValue(new Error('x'))).toBe(true);
        expect(hasErrorValue('failed')).toBe(true);
        expect(hasErrorValue({ code: 1 })).toBe(true);
    });

    it('비어있거나 "unknown error"류는 false로 판정한다', () => {
        expect(hasErrorValue(undefined)).toBe(false);
        expect(hasErrorValue(null)).toBe(false);
        expect(hasErrorValue('')).toBe(false);
        expect(hasErrorValue('  ')).toBe(false);
        expect(hasErrorValue('unknown error')).toBe(false);
        expect(hasErrorValue('Unknown Error.')).toBe(false);
    });
});

describe('formatLogForCopy', () => {
    const base: AppLogInfo = { level: 'info', tag: 'TAG', message: 'hello', timestamp: 1 };

    it('헤더·메시지·시각을 포함한다', () => {
        const text = formatLogForCopy(base);

        expect(text).toContain('[info] TAG');
        expect(text).toContain('hello');
        expect(text).toContain('at ');
    });

    it('data가 있으면 data 블록을 덧붙인다', () => {
        const text = formatLogForCopy({ ...base, data: { id: 1 } });

        expect(text).toContain('data:');
        expect(text).toContain('"id": 1');
    });

    it('의미 있는 error만 error 블록으로 포함한다', () => {
        const withError = formatLogForCopy({ ...base, level: 'error', error: new Error('boom') });
        expect(withError).toContain('error:');
        expect(withError).toContain('Error: boom');

        const withoutError = formatLogForCopy({ ...base, error: 'unknown error' });
        expect(withoutError).not.toContain('error:');
    });
});
