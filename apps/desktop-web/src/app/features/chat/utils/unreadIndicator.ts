export type UnreadIndicator = 'none' | 'dot' | 'count';

interface UnreadIndicatorInput {
    unread: number | undefined;
    isDm: boolean;
    isActive: boolean;
}

export const unreadIndicator = ({ unread, isDm, isActive }: UnreadIndicatorInput): UnreadIndicator => {
    if (isActive) return 'none';
    if (!unread || unread <= 0) return 'none';
    return isDm ? 'count' : 'dot';
};
