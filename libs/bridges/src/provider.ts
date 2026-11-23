import { MessageQueue } from './common';
import { BRIDGE_VERSION } from './version';
import { NativeBridgeAdapter, WebBridgeClient } from './web';
import type { IWebBridgeClient } from './web';

export const webClient: IWebBridgeClient = new WebBridgeClient({
    adapter: new NativeBridgeAdapter(),
    version: BRIDGE_VERSION,
    timeoutMs: 15000,
    pendingBuffer: new MessageQueue<any>(),
});
