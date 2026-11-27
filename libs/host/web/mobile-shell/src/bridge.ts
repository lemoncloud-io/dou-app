import type { IWebBridgeClient } from '@chatic/bridges';

export type ShellBridge = Pick<IWebBridgeClient, 'post' | 'request' | 'onEvent'>;
