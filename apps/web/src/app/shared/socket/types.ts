import type { ClientSocketV2 } from '@lemoncloud/chatic-sockets-lib';

export type SocketCloudId = string;

export interface SocketBindingConfig {
    url: string;
    deviceId: string;
    wssType?: 'relay' | 'cloud';
}

export interface ManagedSocketRecord {
    client: ClientSocketV2;
    config: SocketBindingConfig;
}
