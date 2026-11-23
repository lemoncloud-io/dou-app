import type { RedactOptions } from './fingerprint';

export const SENSITIVE_KEYS = [
    'password',
    'token',
    'identitytoken',
    'accesstoken',
    'refreshtoken',
    'credential',
    'credentials',
    'accesskey',
    'accesskeyid',
    'secretkey',
    'secretaccesskey',
    'sessiontoken',
    'signature',
    'authorization',
    'x-lemon-identity',
    'xlemonidentity',
    'pwd',
    'otp',
    'code',
    'alias',
    'secret',
    'email',
    'phone',
    'receipt',
    'messagebody',
    'pushbody',
    'pushtitle',
    'notificationbody',
    'notificationtitle',
];

export const SAFE_KEYS = [
    'errorcode',
    'statuscode',
    'httpcode',
    'resultcode',
    'reasoncode',
    'closecode',
    'responsecode',
    'httpstatus',
    'countrycode',
    'langcode',
    'languagecode',
    'localecode',
    'currencycode',
    'postalcode',
    'zipcode',
    'areacode',
    'codeversion',
    'codelength',
    'emailverified',
    'phoneverified',
    'phonetype',
    'receiptstatus',
];

const PIPELINE_ONLY_SAFE_KEYS = ['responsecode', 'httpstatus'];

export const REDACTED = '[REDACTED]';

const lower = (key: string): string => key.toLowerCase();

const isSafeKey = (key: string, options?: RedactOptions): boolean => {
    const lowered = lower(key);
    return SAFE_KEYS.some(
        safe =>
            (lowered === safe || lowered.endsWith(safe)) && !(options?.strict && PIPELINE_ONLY_SAFE_KEYS.includes(safe))
    );
};

const isPresenceFlag = (key: string, value: unknown): boolean =>
    typeof value === 'boolean' && /^(?:has|is|are|was|were|can|should|allows?|needs?)[A-Z_]/.test(key);

export const isSensitiveKey = (key: string, options?: RedactOptions): boolean => {
    if (isSafeKey(key, options)) return false;
    const lowered = lower(key);
    return SENSITIVE_KEYS.some(sensitive => lowered.includes(sensitive));
};

export const isSensitiveField = (key: string, value: unknown, options?: RedactOptions): boolean =>
    !isPresenceFlag(key, value) && isSensitiveKey(key, options);

export type SensitiveFamily = 'token' | 'email' | 'phone';

export const sensitiveFamilyOf = (key: string): SensitiveFamily | undefined => {
    if (isSafeKey(key)) return undefined;
    const lowered = lower(key);
    const matched = SENSITIVE_KEYS.filter(sensitive => lowered.includes(sensitive));
    if (!matched.length) return undefined;
    if (matched.every(name => name.includes('token'))) return 'token';
    if (matched.every(name => name === 'email')) return 'email';
    if (matched.every(name => name === 'phone')) return 'phone';
    return undefined;
};
