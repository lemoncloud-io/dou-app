import { useWebSocketV2Store } from '@chatic/socket';
import { cloudCore } from '@chatic/web-core';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

import {
    bootstrap,
    emitMineRequest,
    getEmitAuthenticated,
    getProfileId,
    handleMineError,
    handleMineResponse,
    removeChannel,
    resetBootstrap,
} from './channelState';
import { loadCachedChannels, resetCacheLoaded } from './channelCacheAdapter';

// ── Socket Message Subscription ──────────────────────────────────────────────

useWebSocketV2Store.subscribe(
    s => s.lastMessage,
    lastMessage => {
        const envelope = lastMessage as WSSEnvelope<{
            list: ChannelView[];
            sourceType?: string;
            userId?: string;
            channelId?: string;
            reason?: string;
        }> | null;
        if (!envelope) return;

        const profileId = getProfileId();

        // Channel member removed (leave/kick)
        if (envelope.type === 'model' && envelope.action === 'delete' && envelope.payload?.sourceType === 'join') {
            const { userId, channelId } = envelope.payload;
            if (userId === profileId && channelId) {
                removeChannel(channelId);
            }
            return;
        }

        // Channel deleted
        if (
            envelope.type === 'model' &&
            envelope.action === 'update' &&
            envelope.payload?.reason === 'channel-deleted'
        ) {
            const channelId = envelope.payload.channelId;
            if (channelId) {
                removeChannel(channelId);
            }
            return;
        }

        // Channel updated — background refresh
        if (envelope.action === 'update' && envelope.payload?.sourceType === 'channel') {
            emitMineRequest();
            return;
        }

        if (envelope.type !== 'chat') return;

        if (envelope.action === 'error') {
            handleMineError();
            return;
        }

        if (envelope.action === 'mine') {
            handleMineResponse(envelope.payload?.list ?? []);
        }
    }
);

// ── Lifecycle Subscriptions ──────────────────────────────────────────────────

useWebSocketV2Store.subscribe(
    s => s.isVerified,
    isVerified => {
        if (!isVerified || !getEmitAuthenticated()) return;
        const wssType = useWebSocketV2Store.getState().wssType;
        if (wssType === 'cloud' && !cloudCore.getSelectedPlaceId()) return;
        resetBootstrap();
        bootstrap(loadCachedChannels);
    }
);

useWebSocketV2Store.subscribe(
    s => s.isConnected,
    isConnected => {
        if (!isConnected) {
            resetBootstrap();
            resetCacheLoaded();
        }
    }
);

// ── Foreground Resync ────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
    window.addEventListener('foreground-resync', () => {
        if (!getEmitAuthenticated() || !getProfileId()) return;
        resetBootstrap();
        resetCacheLoaded();
        bootstrap(loadCachedChannels);
    });
}
