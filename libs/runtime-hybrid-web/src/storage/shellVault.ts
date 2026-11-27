import { BridgeStorageChannel, webClient } from '@chatic/bridges';
import type { IWebBridgeClient } from '@chatic/bridges';
import { NativeSecureStore, WebStore } from '@chatic/storage';
import type { KeyValueStore } from '@chatic/storage';

export interface ShellVaultOptions {
    client?: IWebBridgeClient;
    fallback?: KeyValueStore;
}

export const createShellVault = ({
    client = webClient,
    fallback = WebStore.session(),
}: ShellVaultOptions = {}): NativeSecureStore =>
    new NativeSecureStore({ channel: new BridgeStorageChannel(client, 'nativeSecure'), fallback });
