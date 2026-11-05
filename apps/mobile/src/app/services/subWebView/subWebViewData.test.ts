import { fitsSubWebViewData, isSubWebViewAppId, isSubWebViewParams, SUB_WEBVIEW_DATA_LIMIT } from './subWebViewData';

describe('fitsSubWebViewData', () => {
    it.each([
        ['nothing', undefined],
        ['null', null],
        ['a number', 7],
        ['an object', { a: [1, 'b'] }],
        ['an object right at the limit', { s: 'x'.repeat(SUB_WEBVIEW_DATA_LIMIT - '{"s":""}'.length) }],
    ])('takes %s', (_label, value) => {
        expect(fitsSubWebViewData(value)).toBe(true);
    });

    it.each([
        ['an object one character over', { s: 'x'.repeat(SUB_WEBVIEW_DATA_LIMIT - '{"s":""}'.length + 1) }],
        ['a BigInt', BigInt(1)],
        ['a function', () => 1],
    ])('refuses %s', (_label, value) => {
        expect(fitsSubWebViewData(value)).toBe(false);
    });

    it('refuses a cycle', () => {
        const cycle: Record<string, unknown> = {};
        cycle.self = cycle;
        expect(fitsSubWebViewData(cycle)).toBe(false);
    });
});

describe('isSubWebViewParams', () => {
    it('takes a plain object', () => {
        expect(isSubWebViewParams({ orderId: 7 })).toBe(true);
    });

    it.each([
        ['an array', [1]],
        ['null', null],
        ['a string', 'x'],
    ])('refuses %s', (_label, value) => {
        expect(isSubWebViewParams(value)).toBe(false);
    });
});

describe('isSubWebViewAppId', () => {
    it.each(['quiz', 'dou-raise', 'a1', 'a'.repeat(63)])('takes %s', id => {
        expect(isSubWebViewAppId(id)).toBe(true);
    });

    it.each(['', 'Quiz', 'a.b', '-quiz', 'quiz-', 'quiz/level', 'a'.repeat(64), 7, undefined])('refuses %s', id => {
        expect(isSubWebViewAppId(id)).toBe(false);
    });
});
