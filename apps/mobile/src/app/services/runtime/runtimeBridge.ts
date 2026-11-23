import type { WebMessageData, WebMessageHandlerResponse } from '@chatic/bridge-messages';
import type { IAppBridgeHost } from '@chatic/bridges';
import { createRuntimeBridgeHost } from '@chatic/runtime-mobile';
import type { RuntimeHostAnswer, RuntimePayloadSample } from '@chatic/runtime-mobile';

import { provider } from '../provider';
import { recordAnsweredSessionOwner } from './launchSessionOwner';
import { nativeRuntimeHost } from './nativeRuntime';

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
            RuntimeHello: async (message: WebMessageData<'RuntimeHello'>) => {
                const answer = await host.hello(message.data);
                if (!('failure' in answer)) {
                    recordAnsweredSessionOwner(answer.value.sessionOwner === 'native' ? 'native' : 'web');
                }
                return reply('RuntimeHello', answer);
            },
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
