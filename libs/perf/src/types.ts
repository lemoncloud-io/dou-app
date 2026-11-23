export type PerfTraceName =
    | 'boot'
    | 'cloud_switch'
    | 'site_switch'
    | 'web_vitals'
    | 'chat_room_open'
    | 'chat_room_sync'
    | 'bridge_request'
    | 'chat_send'
    | 'socket_verify'
    | 'first_screen'
    | 'socket_request'
    | 'chat_send_media'
    | 'state_outbox'
    | 'invite_accept'
    | 'long_tasks'
    | 'api_request'
    | 'screen_render'
    | 'image_load'
    | 'image_refresh';

export interface PerfTraceStart {
    id: string;
    name: PerfTraceName;
}

export interface PerfTraceResult extends PerfTraceStart {
    sample?: boolean;
    endedAt?: number;
    durationMs: number;
    attributes: Record<string, string>;
    metrics: Record<string, number>;
}
