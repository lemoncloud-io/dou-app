import type { IWebBridgeClient } from '@chatic/bridges';

export type DesktopShellBridge = Pick<IWebBridgeClient, 'post' | 'request' | 'onEvent'>;
