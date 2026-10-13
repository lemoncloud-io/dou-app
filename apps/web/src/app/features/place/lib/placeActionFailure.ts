import { getSocketErrorCode } from '../../../utils/errors';

/**
 * What a failed `place.leave` (leaving, or removing a member) tells the user — three kinds, each
 * with its own sentence:
 * - `denied`: the server refused (`403`) — an owner leaving their own place, a non-owner removing
 *   someone, or anyone removing the owner. Trying again changes nothing.
 * - `network`: no answer came back — the socket client's own `408` (timed out) and `503` (not
 *   connected). Worth retrying once the connection is back.
 * - `other`: everything else, including a leave the server half finished (membership dropped, some
 *   channel clean-up failed). Pressing it again finishes the rest, so the sentence says "try again".
 *
 * Read from the status alone, never from the wording, which the server does not hold stable.
 */
export type PlaceActionFailure = 'denied' | 'network' | 'other';

const NO_ANSWER_CODES = new Set([408, 503]);

export const placeActionFailure = (error: unknown): PlaceActionFailure => {
    const code = getSocketErrorCode(error);
    if (code === 403) return 'denied';
    if (code !== undefined && NO_ANSWER_CODES.has(code)) return 'network';
    return 'other';
};
