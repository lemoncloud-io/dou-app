/**
 * The subscription pages speak in the formal polite register: "~합니다", "~했습니다", requests as
 * "~해 주세요". The softer "~해요" register is not used. A Korean sentence ending in "요" — other than a
 * "~세요" request — is the softer register slipping back in.
 *
 * Checks every key root of the subscription copy.
 */
import ko from './locales/subscription/ko.json';

type Messages = { [key: string]: string | Messages };

const CHECKED_ROOTS = ['common', 'entry', 'checkout', 'manage', 'billing'];

const SOFT_ENDING = /(?<!세)요(?=[.!?,]?(\s|$))/;

const sentences = (messages: Messages, prefix = ''): Array<[string, string]> =>
    Object.entries(messages).flatMap(([key, value]) =>
        typeof value === 'string'
            ? [[`${prefix}${key}`, value] as [string, string]]
            : sentences(value, `${prefix}${key}.`)
    );

describe('subscription copy register', () => {
    it.each(CHECKED_ROOTS)('subscription.%s uses the formal polite register', root => {
        const root_ = (ko.subscription as Messages)[root] as Messages;
        const soft = sentences(root_, `subscription.${root}.`).filter(([, value]) => SOFT_ENDING.test(value));
        expect(soft).toEqual([]);
    });

    it('recognises the softer register and lets requests through', () => {
        expect(SOFT_ENDING.test('로그아웃했어요')).toBe(true);
        expect(SOFT_ENDING.test('구독할 수 있어요.')).toBe(true);
        expect(SOFT_ENDING.test('다시 시도해 주세요.')).toBe(false);
        expect(SOFT_ENDING.test('로그아웃되었습니다')).toBe(false);
    });
});
