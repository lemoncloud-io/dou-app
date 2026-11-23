export type SocketCloseReason =
    | 'pong_timeout'
    | 'wake_recovery'
    | 'wake_probe'
    | 'service_restart'
    | 'destroyed'
    | 'server'
    | 'transport'
    | 'other';

export const APP_CLOSE_REASON = {
    wakeRecovery: 'wake-recovery',
    wakeProbe: 'wake-probe',
} as const;

const KNOWN_REASONS: Record<string, SocketCloseReason> = {
    'pong-timeout': 'pong_timeout',
    'service-restart': 'service_restart',
    [APP_CLOSE_REASON.wakeRecovery]: 'wake_recovery',
    [APP_CLOSE_REASON.wakeProbe]: 'wake_probe',
};

export interface SocketCloseEvent {
    code?: number;
    reason?: string;
    wasClean?: boolean;
}

export const classifySocketClose = (event: SocketCloseEvent | undefined, local: boolean): SocketCloseReason => {
    const known = event?.reason ? KNOWN_REASONS[event.reason] : undefined;
    if (known) return known;
    if (local) return 'other';
    if (!event || event.code === undefined || event.wasClean === false || event.code === 1006) return 'transport';
    return 'server';
};
