export {
    isValidMobileNumber,
    LEGACY_PHONE_COUNTRY_KEY,
    listPhoneCountries,
    migrateLegacyPhoneCountry,
    phoneCountryDialCode,
    readInternationalInput,
    readLocaleCountry,
    readMobileNumber,
    rememberCountry,
    resolveDefaultCountry,
    toE164,
    type InternationalPhoneInput,
    type MobileNumber,
    type PhoneCountry,
    type PhoneCountryOption,
} from '@chatic/format/phone';
export * from './useOtpExpiryCountdown';
