import type { WebMessageData, WebMessageHandlerResponse } from '@chatic/bridge-messages';
import type { IAppBridgeHost } from '@chatic/bridges';
import { createRuntimeBridgeHost } from '@chatic/runtime-mobile';
import type { RuntimeHostAnswer, RuntimePayloadSample } from '@chatic/runtime-mobile';

import { provider } from '../provider';
import { nativeRuntimeHost } from './nativeRuntime';

/** A body at or over this size is logged, so the large ones show up before anything hits the cap. */
const LARGE_PAYLOAD = 256 * 1024;

type RuntimeMessage = 'RuntimeHello' | 'RuntimeCall' | 'RuntimeSubscribe' | 'RuntimeUnsubscribe';

const RESPONSE_TYPE = {
    RuntimeHello: 'OnRuntimeHello',
    RuntimeCall: 'OnRuntimeCall',
    RuntimeSubscribe: 'OnRuntimeSubscribe',
    RuntimeUnsubscribe: 'OnRuntimeUnsubscribe',
} as const;

const reply = <K extends RuntimeMessage>(type: K, answer: RuntimeHostAnswer<unknown>): WebMessageHandlerResponse<K> =>
    ('failure' in answer
        ? { type: RESPONSE_TYPE[type], success: false, error: answer.failure }
        : { type: RESPONSE_TYPE[type], success: true, data: answer.value }) as WebMessageHandlerResponse<K>;

const reportPayload = ({ kind, name, size }: RuntimePayloadSample): void => {
    if (size < LARGE_PAYLOAD) return;
    provider.logService.warn('bridge.runtime_payload_large', 'A large runtime body crossed the bridge', {
        kind,
        name: name ?? null,
        size,
    });
};

/**
 * The four runtime requests of one WebView's bridge, answered by a `RuntimeBridgeHost` over the app's
 * runtime. One per bridge, because a host keeps that page's subscriptions; the runtime itself is the
 * process's, started by the first hello (`nativeRuntimeHost.start`).
 *
 * This module loads the whole runtime, so it is required only on a launch the app's runtime owns.
 */
export const createAppRuntimeBridge = (bridge: IAppBridgeHost) => {
    const host = createRuntimeBridgeHost({
        engine: () => nativeRuntimeHost.start(),
        send: {
            event: data => bridge.pushEvent({ type: 'OnRuntimeEvent', success: true, data }),
            sessionChanged: data => bridge.pushEvent({ type: 'OnRuntimeSessionChanged', success: true, data }),
        },
        onPayload: reportPayload,
    });
    return {
        handlers: {
            RuntimeHello: async (message: WebMessageData<'RuntimeHello'>) =>
                reply('RuntimeHello', await host.hello(message.data)),
            RuntimeCall: async (message: WebMessageData<'RuntimeCall'>) =>
                reply('RuntimeCall', await host.call(message.data)),
            RuntimeSubscribe: async (message: WebMessageData<'RuntimeSubscribe'>) =>
                reply('RuntimeSubscribe', await host.subscribe(message.data)),
            RuntimeUnsubscribe: async (message: WebMessageData<'RuntimeUnsubscribe'>) =>
                reply('RuntimeUnsubscribe', host.unsubscribe(message.data)),
        },
        dispose: () => host.dispose(),
    };
};

export type AppRuntimeBridge = ReturnType<typeof createAppRuntimeBridge>;
