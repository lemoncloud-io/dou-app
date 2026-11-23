export const CHANNEL_NAME_MIN = 2;
export const CHANNEL_NAME_MAX = 20;

export const isValidChannelName = (value: string): boolean => {
    const length = value.trim().length;
    return length >= CHANNEL_NAME_MIN && length <= CHANNEL_NAME_MAX;
};
