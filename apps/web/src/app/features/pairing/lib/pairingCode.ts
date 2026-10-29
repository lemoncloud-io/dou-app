/** The 8-digit pairing code as people read it: two groups of four, `0734-4168`. */
export const formatPairingCode = (code: string): string =>
    code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;

/** `m:ss` for the seconds left on a code; never negative. */
export const formatRemaining = (ms: number): string => {
    const total = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};
