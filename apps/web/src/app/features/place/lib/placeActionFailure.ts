import { getSocketErrorCode } from '../../../utils/errors';

export type PlaceActionFailure = 'denied' | 'network' | 'other';

const NO_ANSWER_CODES = new Set([408, 503]);

export const placeActionFailure = (error: unknown): PlaceActionFailure => {
    const code = getSocketErrorCode(error);
    if (code === 403) return 'denied';
    if (code !== undefined && NO_ANSWER_CODES.has(code)) return 'network';
    return 'other';
};
