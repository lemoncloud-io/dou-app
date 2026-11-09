import {
    isValidMobileNumber,
    LEGACY_PHONE_COUNTRY_KEY,
    migrateLegacyPhoneCountry,
    listPhoneCountries,
    phoneCountryDialCode,
    readInternationalInput,
    readLocaleCountry,
    readMobileNumber,
    rememberCountry,
    resolveDefaultCountry,
    toE164,
} from './phoneNumber';

/** The web medium an entry point passes in, as a plain map. */
class MemoryMedium {
    private readonly map = new Map<string, string>();
    get(key: string): string | null {
        return this.map.get(key) ?? null;
    }
    set(key: string, value: string): void {
        this.map.set(key, value);
    }
    remove(key: string): void {
        this.map.delete(key);
    }
}

// A stand-in for the settings facade: the pick is the `ui.phoneCountry` setting now. Like the real one,
// it mirrors a `local` write into the storage it was given (`mockLocal`), unless that write is dropped.
const mockSettings = new Map<string, unknown>();
const mockSetResult = { ok: true, storageWriteLands: true };
const mockLocal: { current: MemoryMedium | null } = { current: null };
jest.mock('@chatic/config', () => ({
    storageKeyFor: (key: string) => `@chatic/config.${key}`,
    config: {
        get: (key: string) => mockSettings.get(key),
        set: (key: string, value: unknown) => {
            if (!mockSetResult.ok) return { ok: false, reason: 'notWritable' };
            mockSettings.set(key, value);
            if (mockSetResult.storageWriteLands) mockLocal.current?.set(`@chatic/config.${key}`, JSON.stringify(value));
            return { ok: true };
        },
    },
}));

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
        mockSettings.clear();
        setLanguage('en-US');
    });

    it('takes a preferred country over the locale, but not over the last pick', () => {
        setLanguage('en-US');
        expect(resolveDefaultCountry('KR')).toBe('KR');

        rememberCountry('JP');
        expect(resolveDefaultCountry('KR')).toBe('JP');
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
        mockSettings.set('ui.phoneCountry', 'ZZ');
        expect(resolveDefaultCountry()).toBe('KR');
    });

    it('keeps the pick in the ui.phoneCountry setting', () => {
        rememberCountry('JP');
        expect(mockSettings.get('ui.phoneCountry')).toBe('JP');
    });
});

describe('migrateLegacyPhoneCountry', () => {
    let legacy: MemoryMedium;
    beforeEach(() => {
        legacy = new MemoryMedium();
        mockLocal.current = legacy;
    });
    afterEach(() => {
        mockSettings.clear();
        mockSetResult.ok = true;
        mockSetResult.storageWriteLands = true;
        mockLocal.current = null;
    });

    it('carries a pick from the old key into the setting and drops the old key', () => {
        legacy.set(LEGACY_PHONE_COUNTRY_KEY, 'JP');
        migrateLegacyPhoneCountry(legacy);
        expect(mockSettings.get('ui.phoneCountry')).toBe('JP');
        expect(legacy.get(LEGACY_PHONE_COUNTRY_KEY)).toBeNull();
    });

    it('keeps a pick already in the setting and still drops the old key', () => {
        mockSettings.set('ui.phoneCountry', 'KR');
        legacy.set(LEGACY_PHONE_COUNTRY_KEY, 'JP');
        migrateLegacyPhoneCountry(legacy);
        expect(mockSettings.get('ui.phoneCountry')).toBe('KR');
        expect(legacy.get(LEGACY_PHONE_COUNTRY_KEY)).toBeNull();
    });

    it('drops an old value that is not a supported country without writing it', () => {
        legacy.set(LEGACY_PHONE_COUNTRY_KEY, 'ZZ');
        migrateLegacyPhoneCountry(legacy);
        expect(mockSettings.has('ui.phoneCountry')).toBe(false);
        expect(legacy.get(LEGACY_PHONE_COUNTRY_KEY)).toBeNull();
    });

    it('leaves the old key for the next boot when the setting did not take the write', () => {
        mockSetResult.ok = false;
        legacy.set(LEGACY_PHONE_COUNTRY_KEY, 'JP');
        migrateLegacyPhoneCountry(legacy);
        expect(legacy.get(LEGACY_PHONE_COUNTRY_KEY)).toBe('JP');
    });

    it('leaves the old key when the setting answered ok but its storage write was dropped', () => {
        mockSetResult.storageWriteLands = false;
        legacy.set(LEGACY_PHONE_COUNTRY_KEY, 'JP');
        migrateLegacyPhoneCountry(legacy);
        expect(legacy.get(LEGACY_PHONE_COUNTRY_KEY)).toBe('JP');
    });

    it('does nothing when there is no old key', () => {
        migrateLegacyPhoneCountry(legacy);
        expect(mockSettings.size).toBe(0);
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

describe('readMobileNumber', () => {
    it('answers the E.164, the country and both display forms in one read', () => {
        expect(readMobileNumber('010-1234-5678', 'KR')).toEqual({
            country: 'KR',
            e164: '+821012345678',
            national: '010-1234-5678',
            international: '+82 10 1234 5678',
        });
    });

    it('reads a + number in its own country, whatever country is passed', () => {
        expect(readMobileNumber('+1 415 555 0123', 'KR')).toMatchObject({ country: 'US', e164: '+14155550123' });
    });

    it('lands both Korean international shapes on the same number', () => {
        expect(readMobileNumber('+82 10-1234-5678', 'KR')?.e164).toBe('+821012345678');
        expect(readMobileNumber('+82 010-1234-5678', 'KR')?.e164).toBe('+821012345678');
    });

    it('is null for a landline, a malformed number, or no country to read in', () => {
        expect(readMobileNumber('02-123-4567', 'KR')).toBeNull();
        expect(readMobileNumber('+81 3-1234-5678', 'KR')).toBeNull();
        expect(readMobileNumber('+1 555 0100', 'KR')).toBeNull();
        expect(readMobileNumber('010-1234-5678', null)).toBeNull();
    });
});

describe('readLocaleCountry', () => {
    afterEach(() => setLanguage('en-US'));

    it("answers the locale's region, and nothing for a region-less locale", () => {
        setLanguage('ja-JP');
        expect(readLocaleCountry()).toBe('JP');
        setLanguage('ko');
        expect(readLocaleCountry()).toBeNull();
    });
});
