import {
    getCountries,
    getCountryCallingCode,
    isSupportedCountry,
    isValidPhoneNumber,
    parsePhoneNumberFromString,
} from 'libphonenumber-js/mobile';
import type { CountryCode } from 'libphonenumber-js';

import { config, storageKeyFor } from '@chatic/config';

export type PhoneCountry = string;

export interface PhoneCountryOption {
    code: PhoneCountry;
    name: string;
    dialCode: string;
}

const COUNTRY_SETTING = 'ui.phoneCountry';

export const LEGACY_PHONE_COUNTRY_KEY = 'dou.phoneInput.country.v1';

const digitsOf = (value: string): string => value.replace(/\D/g, '');

const createRegionNamer = (lang: string): ((code: string) => string) => {
    let names: Intl.DisplayNames;
    try {
        names = new Intl.DisplayNames([lang], { type: 'region' });
    } catch {
        return code => code;
    }
    return code => {
        try {
            return names.of(code) ?? code;
        } catch {
            return code;
        }
    };
};

const listCache = new Map<string, PhoneCountryOption[]>();

export const listPhoneCountries = (lang: string): PhoneCountryOption[] => {
    const cached = listCache.get(lang);
    if (cached) return cached;

    const nameOf = createRegionNamer(lang);
    let collator: Intl.Collator;
    try {
        collator = new Intl.Collator(lang);
    } catch {
        collator = new Intl.Collator();
    }

    const list = getCountries()
        .map(code => ({ code, name: nameOf(code), dialCode: `+${getCountryCallingCode(code)}` }))
        .sort((a, b) => collator.compare(a.name, b.name));

    listCache.set(lang, list);
    return list;
};

export const phoneCountryDialCode = (country: PhoneCountry): string | null => {
    try {
        return isSupportedCountry(country) ? `+${getCountryCallingCode(country as CountryCode)}` : null;
    } catch {
        return null;
    }
};

export const isValidMobileNumber = (input: string, country: PhoneCountry | null): boolean => {
    if (!country) return false;
    try {
        return isValidPhoneNumber(input, country as CountryCode);
    } catch {
        return false;
    }
};

const parse = (input: string, country: PhoneCountry | null) => {
    if (!country) return undefined;
    try {
        return parsePhoneNumberFromString(input, country as CountryCode);
    } catch {
        return undefined;
    }
};

export const toE164 = (input: string, country: PhoneCountry | null): string => {
    const parsed = parse(input, country);
    return parsed ? parsed.number : digitsOf(input);
};

export interface MobileNumber {
    country: PhoneCountry;
    e164: string;
    national: string;
    international: string;
}

export const readMobileNumber = (input: string, country: PhoneCountry | null): MobileNumber | null => {
    const parsed = parse(input, country);
    if (!parsed?.country || !parsed.isValid()) return null;
    return {
        country: parsed.country,
        e164: parsed.number,
        national: parsed.formatNational(),
        international: parsed.formatInternational(),
    };
};

export interface InternationalPhoneInput {
    country: PhoneCountry;
    national: string;
}

export const readInternationalInput = (input: string): InternationalPhoneInput | null => {
    const trimmed = input.trim();
    if (!trimmed.startsWith('+')) return null;
    let parsed: ReturnType<typeof parsePhoneNumberFromString>;
    try {
        parsed = parsePhoneNumberFromString(trimmed);
    } catch {
        return null;
    }
    if (!parsed?.country) return null;
    return { country: parsed.country, national: digitsOf(parsed.formatNational()) };
};

const readStoredCountry = (): PhoneCountry | null => {
    const stored = config.get<string>(COUNTRY_SETTING);
    return stored && isSupportedCountry(stored) ? stored : null;
};

export const readLocaleCountry = (): PhoneCountry | null => {
    if (typeof navigator === 'undefined') return null;
    try {
        const region = new Intl.Locale(navigator.language).region;
        return region && isSupportedCountry(region) ? region : null;
    } catch {
        return null;
    }
};

export const resolveDefaultCountry = (preferred?: PhoneCountry | null): PhoneCountry | null =>
    readStoredCountry() ?? preferred ?? readLocaleCountry();

export const rememberCountry = (country: PhoneCountry): void => {
    config.set(COUNTRY_SETTING, country, { lane: 'local' });
};

export const migrateLegacyPhoneCountry = (local: {
    get(key: string): string | null;
    remove(key: string): void;
}): void => {
    const old = local.get(LEGACY_PHONE_COUNTRY_KEY);
    if (old === null) return;
    if (!readStoredCountry() && isSupportedCountry(old)) {
        if (!config.set(COUNTRY_SETTING, old, { lane: 'local' }).ok) return;
        if (local.get(storageKeyFor(COUNTRY_SETTING)) === null) return;
    }
    local.remove(LEGACY_PHONE_COUNTRY_KEY);
};
