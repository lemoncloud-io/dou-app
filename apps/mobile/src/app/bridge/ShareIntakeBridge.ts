import { NativeModules } from 'react-native';
import type { OnFetchShareIntakePayload } from '@chatic/bridge-messages';

const { ShareIntake } = NativeModules;

export interface IShareIntakeBridge {
    readonly isAvailable: boolean;
    fetch(id: string): Promise<OnFetchShareIntakePayload>;
    release(id: string, discard: boolean): Promise<void>;
}

const unavailable = (): Promise<never> =>
    Promise.reject(Object.assign(new Error('ShareIntake native module is not available'), { code: 'INTERNAL' }));

export const ShareIntakeBridge: IShareIntakeBridge = {
    isAvailable: !!ShareIntake,
    fetch: id => (ShareIntake ? ShareIntake.fetch(id) : unavailable()),
    release: (id, discard) => (ShareIntake ? ShareIntake.release(id, discard) : unavailable()),
};
