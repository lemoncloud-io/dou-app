/** A pairing code is always eight digits. */
export const PAIRING_CODE_LENGTH = 8;

/** The 8-digit pairing code as people read it: two groups of four, `0734-4168`. */
export const formatPairingCode = (code: string): string =>
    code.length === PAIRING_CODE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code;

/** `m:ss` for the time left on a code; never negative. */
export const formatRemaining = (ms: number): string => {
    const total = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * What the approval field keeps of what was typed or pasted: digits only, at most eight. People paste
 * the code as it is shown (`0734-4168`) or with spaces, and neither should cost them the code.
 */
export const normalizePairingCode = (raw: string): string => raw.replace(/\D/g, '').slice(0, PAIRING_CODE_LENGTH);
