import type { ChannelView } from '@lemoncloud/chatic-socials-api';

import type { ChannelState } from './channelTypes';
import { isReactNativeWebView, sortChannelsByLatest } from './channelTypes';
import { IndexedDBChannelAdapter } from '../../chats/storages/IndexedDBChannelAdapter';

// ── Singleton State ──────────────────────────────────────────────────────────

let state: ChannelState = { status: 'idle', channels: [], retryCount: 0 };
const listeners: Set<() => void> = new Set();

let globalEmitAuthenticated: ((msg: object) => void) | null = null;
let globalProfileId = '';

export const getState = (): ChannelState => state;
export const getProfileId = (): string => globalProfileId;
export const getEmitAuthenticated = (): ((msg: object) => void) | null => globalEmitAuthenticated;

export const setEmitAuthenticated = (fn: (msg: object) => void) => {
    globalEmitAuthenticated = fn;
};

export const setProfileId = (id: string) => {
    globalProfileId = id;
};

// ── Listener Management ──────────────────────────────────────────────────────

const notifyListeners = () => listeners.forEach(l => l());

export const addListener = (listener: () => void) => {
    listeners.add(listener);
};

export const removeListener = (listener: () => void) => {
    listeners.delete(listener);
};

// ── Persistence ──────────────────────────────────────────────────────────────

const persistChannels = (userId: string, channels: ChannelView[]) => {
    if (userId && !isReactNativeWebView()) {
        IndexedDBChannelAdapter.saveAll(userId, channels).catch(console.error);
    }
};

const removePersistedChannel = (userId: string, channelId: string) => {
    if (userId && !isReactNativeWebView()) {
        IndexedDBChannelAdapter.remove(userId, channelId).catch(console.error);
    }
};

// ── State Transitions ────────────────────────────────────────────────────────

/**
 * FSM transition rules:
 *   idle → cached        : cache hydration success
 *   idle → loading       : bootstrap without cache
 *   cached → ready       : mine response received (channels replaced silently)
 *   loading → ready      : mine response received
 *   loading → error      : timeout after max retries
 *   error → loading      : manual retry
 *   ready → ready        : background update (channels replaced silently)
 *
 * Key invariant: once status is 'cached' or 'ready', isLoading never becomes true
 */

export const transition = (next: Partial<ChannelState> & { channels?: ChannelView[] }, { saveToDb = false } = {}) => {
    const channels = next.channels !== undefined ? sortChannelsByLatest(next.channels) : state.channels;
    state = {
        status: next.status ?? state.status,
        channels,
        retryCount: next.retryCount ?? state.retryCount,
    };
    notifyListeners();

    if (saveToDb) {
        persistChannels(globalProfileId, state.channels);
    }
};

/** Update channels without changing status — prevents skeleton flash */
export const updateChannelsSilently = (channels: ChannelView[], saveToDb = false) => {
    transition({ status: 'ready', channels, retryCount: 0 }, { saveToDb });
};

export const setChannels = (updater: ChannelView[] | ((prev: ChannelView[]) => ChannelView[])) => {
    const next = typeof updater === 'function' ? updater(state.channels) : updater;
    transition({ channels: next });
};

export const removeChannel = (channelId: string) => {
    updateChannelsSilently(
        state.channels.filter(ch => ch.id !== channelId),
        true
    );
    removePersistedChannel(globalProfileId, channelId);
};

// ── Bootstrap ────────────────────────────────────────────────────────────────

const BOOTSTRAP_TIMEOUT_MS = 10_000;
const MAX_BOOTSTRAP_RETRIES = 2;
let isBootstrapped = false;
let bootstrapTimeoutId: ReturnType<typeof setTimeout> | null = null;

const clearBootstrapTimeout = () => {
    if (bootstrapTimeoutId) {
        clearTimeout(bootstrapTimeoutId);
        bootstrapTimeoutId = null;
    }
};

export const emitMineRequest = () => {
    if (globalEmitAuthenticated) {
        globalEmitAuthenticated({ type: 'chat', action: 'mine', payload: { detail: true } });
    }
};

const scheduleBootstrapTimeout = () => {
    clearBootstrapTimeout();
    bootstrapTimeoutId = setTimeout(() => {
        if (state.status !== 'loading') return;
        const retryCount = state.retryCount + 1;
        if (retryCount <= MAX_BOOTSTRAP_RETRIES) {
            console.log(`[Channels] Bootstrap timeout, retrying (${retryCount}/${MAX_BOOTSTRAP_RETRIES})`);
            transition({ retryCount });
            emitMineRequest();
            scheduleBootstrapTimeout();
        } else {
            transition({ status: 'error', retryCount });
        }
    }, BOOTSTRAP_TIMEOUT_MS);
};

export const bootstrap = (loadCachedChannels: (userId: string) => void) => {
    if (isBootstrapped) return;
    isBootstrapped = true;

    loadCachedChannels(globalProfileId);

    // Only show loading skeleton when no channels are displayed
    if (state.channels.length === 0) {
        transition({ status: 'loading', retryCount: 0 });
    }

    emitMineRequest();
    scheduleBootstrapTimeout();
};

export const resetBootstrap = () => {
    isBootstrapped = false;
    clearBootstrapTimeout();
};

export const handleMineResponse = (channels: ChannelView[]) => {
    clearBootstrapTimeout();
    updateChannelsSilently(channels, true);
};

export const handleMineError = () => {
    clearBootstrapTimeout();
    transition({ status: 'error', channels: [], retryCount: 0 });
};

export const retryMine = () => {
    if (!globalEmitAuthenticated) return;
    transition({ status: 'loading', channels: [], retryCount: 0 });
    emitMineRequest();
};
