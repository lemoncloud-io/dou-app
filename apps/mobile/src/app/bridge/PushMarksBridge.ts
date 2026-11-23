import { NativeModules } from 'react-native';

const { PushMarks } = NativeModules;

export interface PushMarkRecord {
    cid?: string;
    uid?: string;
    channelId?: string;
    sid?: string;
    channelName?: string;
}

export interface IPushMarksBridge {
    drain(): Promise<PushMarkRecord[]>;
}

export const PushMarksBridge: IPushMarksBridge = {
    drain: async (): Promise<PushMarkRecord[]> => {
        if (!PushMarks) {
            console.warn('PushMarks native module is not registered.');
            return [];
        }

        return await PushMarks.drain();
    },
};
