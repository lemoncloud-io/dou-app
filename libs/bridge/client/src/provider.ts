import { BRIDGE_VERSION, MessageQueue } from '@chatic/bridge-host';

import { NativeBridgeAdapter, WebBridgeClient } from './web';
import type { IWebBridgeClient } from './web';

export const webClient: IWebBridgeClient = new WebBridgeClient({
    adapter: new NativeBridgeAdapter(),
    version: BRIDGE_VERSION,
    timeoutMs: 15000,
    pendingBuffer: new MessageQueue<any>(),
});
