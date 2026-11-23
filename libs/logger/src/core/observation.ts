export type ObservationKind =
    | 'badge-divergence'
    | 'unread-divergence'
    | 'member-divergence'
    | 'cloud-name-divergence'
    | 'foreign-drop'
    | 'sync-streak'
    | 'socket-unavailable-streak'
    | 'sync-cursor-retired'
    | 'queue-loss'
    | 'contacts-shape';

export interface ObservationData {
    observation: ObservationKind;
    [field: string]: unknown;
}
