/**
 * The one channel-name rule, shared by create and rename.
 *
 * They used to disagree: rename enforced 2–20 with a `maxLength`, create accepted
 * anything non-empty. A name created outside the range could then not be renamed
 * to itself, and the server's rejection was the first the user heard of it.
 */
export const CHANNEL_NAME_MIN = 2;
export const CHANNEL_NAME_MAX = 20;

export const isValidChannelName = (value: string): boolean => {
    const length = value.trim().length;
    return length >= CHANNEL_NAME_MIN && length <= CHANNEL_NAME_MAX;
};
