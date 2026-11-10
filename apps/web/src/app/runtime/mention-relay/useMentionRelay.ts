import { useEffect, useSyncExternalStore } from 'react';
import { relayAllowsSelfMention, subscribeRelaySelfMention } from './selfMentionState';
import type { RelaySnapshot } from './relay';

declare const __DOU_MENTION_RELAY_ENABLED__: boolean;

export const isMentionRelayEnabled = (): boolean =>
    typeof __DOU_MENTION_RELAY_ENABLED__ !== 'undefined' && __DOU_MENTION_RELAY_ENABLED__;

/** The build gate precedes the dynamic import: ordinary builds never load or request the relay. */
export const useMentionRelay = (snapshot: RelaySnapshot): void => {
    useEffect(() => {
        if (typeof __DOU_MENTION_RELAY_ENABLED__ === 'undefined' || !__DOU_MENTION_RELAY_ENABLED__ || !snapshot.ready) {
            return;
        }
        let cancelled = false;
        void import('./devRelay')
            .then(module => {
                if (!cancelled) return module.offerMentionRelay(snapshot);
                return undefined;
            })
            .catch(() => console.info('[local mention relay] Unable to load local relay.'));
        return () => {
            cancelled = true;
        };
    }, [snapshot]);
};

const noSubscribe = () => () => undefined;

/** Only the exact successfully registered scope can expose the self-mention test candidate. */
export const useRelaySelfMention = (cloudId: string, channelId: string, userId: string | null | undefined): boolean => {
    const enabled = isMentionRelayEnabled();
    return useSyncExternalStore(
        enabled ? subscribeRelaySelfMention : noSubscribe,
        () => enabled && relayAllowsSelfMention(cloudId, channelId, userId),
        () => false
    );
};
