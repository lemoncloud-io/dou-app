import type { ChannelView } from '@lemoncloud/chatic-socials-api';

// ── FSM State ────────────────────────────────────────────────────────────────

export type ChannelLoadStatus = 'idle' | 'cached' | 'loading' | 'ready' | 'error';

export interface ChannelState {
    status: ChannelLoadStatus;
    channels: ChannelView[];
    retryCount: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export const isReactNativeWebView = (): boolean =>
    !!(window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView;

const getChannelSortTime = (channel: ChannelView): number =>
    channel.lastChat$?.createdAt ?? channel.updatedAt ?? channel.createdAt ?? 0;

export const sortChannelsByLatest = (channels: ChannelView[]): ChannelView[] =>
    [...channels].sort((a, b) => getChannelSortTime(b) - getChannelSortTime(a));

export const deduplicateById = (channels: ChannelView[]): ChannelView[] => {
    const seen = new Set<string>();
    return channels.filter(ch => {
        if (!ch.id || seen.has(ch.id)) return false;
        seen.add(ch.id);
        return true;
    });
};
