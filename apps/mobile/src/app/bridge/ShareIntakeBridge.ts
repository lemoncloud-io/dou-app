import { NativeModules } from 'react-native';
import type { OnFetchShareIntakePayload } from '@chatic/app-messages';

/**
 * ShareIntake — what another app shared to Dou through the OS share sheet (Swift `ShareIntake` over
 * the Share Extension's inbox, Kotlin `ShareIntakeModule` over the `ACTION_SEND` intents).
 *
 * The native side copies the shared items out of the other app's hands before the web asks — Android
 * into `attach-pick` as the intent arrives, iOS into the App Group inbox from the extension, moved into
 * `attach-pick` at the first `FetchShareIntake` — so the items are where the upload can read them: an
 * OS share grant does not outlive the screen that received it, and the send runs later.
 *
 * A native build without the module has `isAvailable` false and the router leaves the messages
 * unregistered, so the web gets `NOT_FOUND` and its share page goes home instead of waiting.
 */
const { ShareIntake } = NativeModules;

export interface IShareIntakeBridge {
    /** Whether this build has the native module. */
    readonly isAvailable: boolean;
    /**
     * The share's items, refusals and text. Resolves once every copy is written — Android may still
     * be copying when the page asks. Rejects with `GONE` for a share it does not hold.
     */
    fetch(id: string): Promise<OnFetchShareIntakePayload>;
    /** Forgets the share; with `discard`, deletes its copies too. */
    release(id: string, discard: boolean): Promise<void>;
}

const unavailable = (): Promise<never> =>
    Promise.reject(Object.assign(new Error('ShareIntake native module is not available'), { code: 'INTERNAL' }));

export const ShareIntakeBridge: IShareIntakeBridge = {
    isAvailable: !!ShareIntake,
    fetch: id => (ShareIntake ? ShareIntake.fetch(id) : unavailable()),
    release: (id, discard) => (ShareIntake ? ShareIntake.release(id, discard) : unavailable()),
};
