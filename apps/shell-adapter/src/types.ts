import type { AppMessageDataMap, WebMessageData, WebMessageType } from '@chatic/bridge-messages';
import type { ShellReply } from '@chatic/fake-shell';

export type DouMethods = {
    [K in WebMessageType]: { params: WebMessageData<K>['data']; result: ShellReply<K> | void };
};

export type DouEvents = AppMessageDataMap;
