/**
 * `mock/observed-users.ts`
 */
export type Presence = 'green' | 'yellow' | 'red';

export interface ObservedDevice {
    id: string;
    name: string;
    platform: string;
    status: Presence;
    tick: number;
    viewing: string | null;
    viewingFor: number | null;
    lastActiveAt: number;
}

export interface ObservedUser {
    id: string;
    name: string;
    code: string;
    presence: Presence;
    devices: ObservedDevice[];
}

export type UserSearchType = 'id' | 'name';
