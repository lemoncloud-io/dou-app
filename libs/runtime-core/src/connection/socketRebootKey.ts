import type { SocketBindingConfig } from '@chatic/transport';

export const socketRebootKey = (config?: SocketBindingConfig): string =>
    config ? `${config.url}|${config.deviceId}|${config.wssType ?? ''}` : '';
