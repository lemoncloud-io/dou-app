import type { AppMessageDataMap, WebMessageData, WebMessageType } from '@chatic/app-messages';
import type { ShellReply } from '@chatic/fake-shell';

/**
 * The app's bridge contract as the shell's method table: each web → app message with its params and
 * the payload of the reply the contract pairs it with. Renaming a message or changing its reply in
 * `@chatic/app-messages` fails the config and the handlers to compile.
 */
export type DouMethods = {
    [K in WebMessageType]: { params: WebMessageData<K>['data']; result: ShellReply<K> | void };
};

/** The app → web messages, by name. */
export type DouEvents = AppMessageDataMap;
