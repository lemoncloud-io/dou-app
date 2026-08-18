import { NativeModules } from 'react-native';

const { PushMarks } = NativeModules;

/**
 * Raw cross-cloud push mark hint (ADR-0056) as recorded natively — unparsed. `resolvePushCloudId`
 * on the web is the single place that interprets these fields (relay sentinel, empty-`cid` lookup).
 */
export interface PushMarkRecord {
    cid?: string;
    uid?: string;
    channelId?: string;
    sid?: string;
    channelName?: string;
}

export interface IPushMarksBridge {
    /** Reads every pending mark and clears native storage in the same call (drain — read-once). */
    drain(): Promise<PushMarkRecord[]>;
}

/**
 * Bridges the marks a background chat push recorded (iOS Notification Service Extension /
 * Android FCM service) back to the web on boot/foreground — the one path a backgrounded push's
 * cloud identity survives, since the socket that would otherwise cover it is suspended then.
 */
export const PushMarksBridge: IPushMarksBridge = {
    drain: async (): Promise<PushMarkRecord[]> => {
        if (!PushMarks) {
            console.warn('PushMarks native module is not registered.');
            return [];
        }

        return await PushMarks.drain();
    },
};
