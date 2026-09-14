import { NativeModules, Platform } from 'react-native';

const { BadgeSync } = NativeModules;

export interface IBadgeSyncBridge {
    setBase(count: number): Promise<void>;
    getBase(): Promise<number | null>;
}

export const BadgeSyncBridge: IBadgeSyncBridge = {
    /**
     * Persists the web's authoritative badge total into native storage so a later background push
     * can increment from the true value instead of from zero.
     *
     * Android only: on iOS the base is captured natively in AppDelegate from the live icon badge
     * (which the app process can read but a Notification Service Extension cannot), so there is
     * nothing for JS to push there and this call is a no-op.
     */
    setBase: async (count: number): Promise<void> => {
        if (Platform.OS !== 'android') return;

        if (!BadgeSync) {
            console.warn('BadgeSync native module is not registered.');
            return;
        }

        await BadgeSync.setBase(count);
    },

    /**
     * Reads the shared counter back, or `null` when this platform/build cannot answer.
     *
     * `null` rather than 0 is the whole point: 0 is a valid badge count, so answering it for
     * "unknown" would let a consumer compare against a value that means nothing. iOS has no shared
     * counter reachable from JS (its base is captured natively from the live icon badge) and an
     * older shell has no module at all — both are unknown, not zero (ADR-0075).
     */
    getBase: async (): Promise<number | null> => {
        if (Platform.OS !== 'android' || !BadgeSync?.getBase) return null;

        try {
            const base = await BadgeSync.getBase();
            return typeof base === 'number' ? base : null;
        } catch {
            return null;
        }
    },
};
