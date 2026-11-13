import type { IWebBridgeClient } from '@chatic/bridges';

/**
 * What the native cache adapters need of a bridge: one request, one answer. A page passes its WebView
 * bridge client; a runtime inside the app passes a client that answers the same messages in its own
 * process, through the handlers the WebView's are built from — so the adapters never know which side
 * of the bridge they run on.
 *
 * Like the WebView client, `request` rejects when the answer is `success: false`.
 */
export type CacheBridgeClient = Pick<IWebBridgeClient, 'request'>;
