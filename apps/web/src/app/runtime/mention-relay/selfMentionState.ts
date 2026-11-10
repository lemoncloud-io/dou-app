import type { RelayScope } from './relay';

let scope: RelayScope | null = null;
const listeners = new Set<() => void>();

export const publishRelaySelfMention = (next: RelayScope | null): void => {
    scope = next;
    listeners.forEach(listener => listener());
};
export const subscribeRelaySelfMention = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};
export const relayAllowsSelfMention = (
    cloudId: string,
    channelId: string,
    userId: string | null | undefined
): boolean =>
    !!userId &&
    scope?.cloudId === cloudId &&
    scope.channelId === channelId &&
    scope.channelName === 'public' &&
    scope.viewerIds.includes(userId);
