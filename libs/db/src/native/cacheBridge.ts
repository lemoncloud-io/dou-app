import type { IWebBridgeClient } from '@chatic/bridges';

export type CacheBridgeClient = Pick<IWebBridgeClient, 'request'>;
