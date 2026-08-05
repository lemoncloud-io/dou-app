import {
    isValidMobileNumber,
    listPhoneCountries,
    phoneCountryDialCode,
    readInternationalInput,
    rememberCountry,
    resolveDefaultCountry,
    toE164,
    toFlagEmoji,
} from './phoneNumber';

const COUNTRY_STORAGE_KEY = 'dou.phoneInput.country.v1';

/** jsdom fixes `navigator.language` at `en-US`; the locale branch needs to move it. */
const setLanguage = (value: string) => {
    Object.defineProperty(window.navigator, 'language', { value, configurable: true });
};

describe('isValidMobileNumber — 국가별 모바일 검증', () => {
    it('accepts a local mobile number in its own country', () => {
        expect(isValidMobileNumber('01012345678', 'KR')).toBe(true);
        expect(isValidMobileNumber('09012345678', 'JP')).toBe(true);
        expect(isValidMobileNumber('2015550123', 'US')).toBe(true);
        expect(isValidMobileNumber('07400123456', 'GB')).toBe(true);
    });

    it('rejects a Korean landline — the flow delivers by SMS', () => {
        // The whole reason for the `/mobile` metadata: `/min` calls this valid.
        expect(isValidMobileNumber('0212345678', 'KR')).toBe(false);
    });

    it('rejects a number that belongs to a different country', () => {
        expect(isValidMobileNumber('09012345678', 'KR')).toBe(false);
    });

    it('rejects incomplete input and garbage', () => {
        expect(isValidMobileNumber('0101234', 'KR')).toBe(false);
        expect(isValidMobileNumber('', 'KR')).toBe(false);
        expect(isValidMobileNumber('abc', 'KR')).toBe(false);
    });

    it('is false without a country rather than throwing', () => {
        expect(isValidMobileNumber('01012345678', null)).toBe(false);
    });
});

describe('toE164 — wire 값 · 로컬 초대 이력 키', () => {
    it('renders the same number identically whatever the local form was', () => {
        expect(toE164('01012345678', 'KR')).toBe('+821012345678');
        expect(toE164('010-1234-5678', 'KR')).toBe('+821012345678');
    });

    it('separates numbers whose local forms would collide', () => {
        expect(toE164('09012345678', 'JP')).toBe('+819012345678');
        expect(toE164('09012345678', 'JP')).not.toBe(toE164('01012345678', 'KR'));
    });

    it('degrades to raw digits (not E.164) when the input cannot be parsed — an unreachable path in production, since callers gate on isValidMobileNumber first', () => {
        expect(toE164('abc', 'KR')).toBe('');
        expect(toE164('', 'KR')).toBe('');
        expect(toE164('01012345678', null)).toBe('01012345678');
    });
});

describe('readInternationalInput — 붙여넣은 국제 표기', () => {
    it('reads a pasted +number as a country plus its local form', () => {
        expect(readInternationalInput('+819012345678')).toEqual({ country: 'JP', national: '09012345678' });
    });

    it('recovers +82, which the Korean-only validator rejected outright', () => {
        expect(readInternationalInput('+821012345678')).toEqual({ country: 'KR', national: '01012345678' });
    });

    it('returns null when there is nothing to read', () => {
        expect(readInternationalInput('01012345678')).toBeNull();
        expect(readInternationalInput('+8')).toBeNull();
        expect(readInternationalInput('')).toBeNull();
    });
});

describe('resolveDefaultCountry — 기본 국가 3분기', () => {
    afterEach(() => {
        localStorage.clear();
        setLanguage('en-US');
    });

    it('prefers the last explicit pick over the locale', () => {
        setLanguage('ja-JP');
        rememberCountry('KR');
        expect(resolveDefaultCountry()).toBe('KR');
    });

    it("falls back to the locale's region subtag", () => {
        setLanguage('ko-KR');
        expect(resolveDefaultCountry()).toBe('KR');
    });

    it('answers null when the locale carries no region', () => {
        setLanguage('en');
        expect(resolveDefaultCountry()).toBeNull();
    });

    it('ignores a stored value that is not a supported country', () => {
        setLanguage('ko-KR');
        localStorage.setItem(COUNTRY_STORAGE_KEY, 'ZZ');
        expect(resolveDefaultCountry()).toBe('KR');
    });
});

describe('listPhoneCountries — 선택 목록', () => {
    it('covers the whole metadata with a dial code on every row', () => {
        const list = listPhoneCountries('ko');
        expect(list.length).toBeGreaterThan(200);
        expect(list.every(item => item.dialCode.startsWith('+') && item.dialCode.length > 1)).toBe(true);
        expect(list.find(item => item.code === 'KR')?.dialCode).toBe('+82');
    });

    it('localizes the names and sorts by them', () => {
        const ko = listPhoneCountries('ko');
        expect(ko.find(item => item.code === 'KR')?.name).toBe('대한민국');
        expect(listPhoneCountries('en').find(item => item.code === 'KR')?.name).toBe('South Korea');

        const collator = new Intl.Collator('ko');
        const names = ko.map(item => item.name);
        expect(names).toEqual([...names].sort(collator.compare));
    });

    it('memoizes per language', () => {
        expect(listPhoneCountries('ko')).toBe(listPhoneCountries('ko'));
        expect(listPhoneCountries('ko')).not.toBe(listPhoneCountries('en'));
    });
});

describe('phoneCountryDialCode', () => {
    it('answers the dial code, or null for a code the metadata does not know', () => {
        expect(phoneCountryDialCode('KR')).toBe('+82');
        expect(phoneCountryDialCode('JP')).toBe('+81');
        expect(phoneCountryDialCode('ZZ')).toBeNull();
    });
});

describe('toFlagEmoji', () => {
    it('maps an ISO code onto its regional-indicator pair', () => {
        expect(toFlagEmoji('KR')).toBe('🇰🇷');
        expect(toFlagEmoji('jp')).toBe('🇯🇵');
    });
});
