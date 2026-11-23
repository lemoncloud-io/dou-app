export const PAIRING_CODE_LENGTH = 8;

export const formatPairingCode = (code: string): string =>
    code.length === PAIRING_CODE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code;

export const formatRemaining = (ms: number): string => {
    const total = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export const normalizePairingCode = (raw: string): string => raw.replace(/\D/g, '').slice(0, PAIRING_CODE_LENGTH);
