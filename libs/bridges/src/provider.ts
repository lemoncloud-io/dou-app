import { MessageQueue } from './common';
import { BRIDGE_PROTOCOL_VERSION } from './version';
import { NativeBridgeAdapter, WebBridgeClient } from './web';
import type { IWebBridgeClient } from './web';

/**
 * The singleton bridge client instance, imported and shared across the web runtime.
 * By default it is bound to NativeBridgeAdapter for real device communication, and
 * during tests or when running against a mock environment, calling
 * webClient.setAdapter(new InMemoryAdapter()) swaps the transport channel at runtime.
 */
export const webClient: IWebBridgeClient = new WebBridgeClient({
    adapter: new NativeBridgeAdapter(),
    version: BRIDGE_PROTOCOL_VERSION,
    timeoutMs: 15000,
    pendingBuffer: new MessageQueue<any>(),
});
