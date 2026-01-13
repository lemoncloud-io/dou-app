import { create } from 'zustand';

import type { ConnectionStatus } from '../types';

/**
 * Generic WebSocket message structure
 * - id: Used for message routing (DSH*, PROD*, ITEM*)
 * - data: Raw message data (each feature parses this independently)
 */
export interface WebSocketMessage {
    id: string;
    data: unknown;
}

/**
 * Subscriber callback function type
 * Each subscriber receives all WebSocket messages and filters them independently
 */
type MessageSubscriber = (message: WebSocketMessage) => void;

interface WebSocketState {
    id: string | null;
    isConnected: boolean;
    connectionStatus: ConnectionStatus;
    subscribers: Map<symbol, MessageSubscriber>;
}

interface WebSocketActions {
    setId: (id: string | null) => void;
    setConnectionStatus: (status: ConnectionStatus) => void;
    subscribe: (callback: MessageSubscriber) => () => void;
    broadcastMessage: (message: WebSocketMessage) => void;
    reset: () => void;
}

/**
 * Generic WebSocket store for managing connection state and message broadcasting
 * - Single WebSocket connection for all features (dashboard, prods, items)
 * - Broadcasts all messages to subscribers
 * - Each subscriber filters messages by ID pattern
 */
const store = create<WebSocketState & WebSocketActions>((set, get) => ({
    id: null,
    isConnected: false,
    connectionStatus: 'disconnected',
    subscribers: new Map(),

    setId: (id): void => set({ id }),

    setConnectionStatus: (status): void =>
        set({
            connectionStatus: status,
            isConnected: status === 'connected',
        }),

    /**
     * Subscribe to WebSocket messages
     * Returns an unsubscribe function
     *
     * @param callback - Function to call when a message is received
     * @returns Unsubscribe function
     *
     * @example
     * const unsubscribe = subscribe((message) => {
     *   if (message.id !== currentRequestId) return;
     *   updateState(message.state);
     * });
     */
    subscribe: (callback: MessageSubscriber): (() => void) => {
        const subscriberId = Symbol('subscriber');

        set(state => {
            const newSubscribers = new Map(state.subscribers);
            newSubscribers.set(subscriberId, callback);
            return { subscribers: newSubscribers };
        });

        return (): void => {
            set(state => {
                const newSubscribers = new Map(state.subscribers);
                newSubscribers.delete(subscriberId);
                return { subscribers: newSubscribers };
            });
        };
    },

    /**
     * Broadcast a message to all subscribers
     * Each subscriber is responsible for filtering messages it cares about
     *
     * @param message - WebSocket message to broadcast
     */
    broadcastMessage: (message: WebSocketMessage): void => {
        const { subscribers } = get();
        subscribers.forEach(callback => {
            try {
                callback(message);
            } catch (error) {
                console.error('[WebSocket] Subscriber error:', error);
            }
        });
    },

    reset: (): void =>
        set({
            id: null,
            isConnected: false,
            connectionStatus: 'disconnected',
            subscribers: new Map(),
        }),
}));

// Expose store in development for testing
if (import.meta.env.DEV) {
    (window as Window & { __WEBSOCKET_STORE__?: typeof store }).__WEBSOCKET_STORE__ = store;
}

export const useWebSocketStore = store;
