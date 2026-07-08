/**
 * `api/userApi.ts`
 * - 관측 유저 목록(실데이터).
 */
import { webTransport } from '@chatic/web-core';

import type { ObservedDevice, ObservedUser, Presence, UserSearchType } from '../mock/observed-users';

export interface DeviceViewRaw {
    id?: string;
    name?: string | null;
    platform?: string;
    status?: string;
    tick?: number;
    viewingType?: string;
    viewingId?: string;
    connId?: string;
    connectedAt?: number;
    lastActiveAt?: number;
    updatedAt?: number;
}
interface UserViewRaw {
    id?: string;
    name?: string;
    nick?: string;
    accountId?: string;
    presence?: Presence;
    Devices?: DeviceViewRaw[];
}
interface UsersListResponse {
    list?: UserViewRaw[];
    total?: number;
    page?: number;
    limit?: number;
}

export interface UserSearchPage {
    list: ObservedUser[];
    total: number;
    page: number;
}

export type UsersStage = 'd1' | 'v1';

const getUsersEndpoint = (): string => `${import.meta.env.VITE_BACKEND_ENDPOINT ?? ''}`.replace('/d1', '');

const getUsersBase = (stage: UsersStage): string => `${getUsersEndpoint()}/skt-${stage}`;

export const mapDeviceView = (d: DeviceViewRaw): ObservedDevice => {
    const status: Presence = d.status === 'red' || d.status === 'yellow' ? d.status : 'green';
    const viewing = status !== 'red' && d.viewingType === 'channel' && d.viewingId ? `${d.viewingId}` : null;
    return {
        id: `${d.id ?? ''}`,
        name: d.name || `${d.id ?? 'device'}`,
        platform: d.platform || '-',
        status,
        tick: d.tick ?? 0,
        viewing,
        viewingFor: null,
        lastActiveAt: d.lastActiveAt ?? d.updatedAt ?? 0,
    };
};

const mapUser = (u: UserViewRaw): ObservedUser => ({
    id: `${u.id ?? ''}`,
    name: u.name || u.nick || `${u.id ?? ''}`,
    code: u.accountId || '',
    presence: u.presence ?? 'green',
    devices: (u.Devices ?? []).map(mapDeviceView),
});

export interface FetchObservedUsersParams {
    type?: UserSearchType;
    query?: string;
    page?: number;
    limit?: number;
    stage?: UsersStage;
}

export const fetchObservedUsers = async ({
    type = 'id',
    query = '',
    page = 0,
    limit = 10,
    stage = 'd1',
}: FetchObservedUsersParams = {}): Promise<UserSearchPage> => {
    const q = query.trim();
    const search = q ? (type === 'name' ? { keyword: q } : { id: q }) : {};
    const { data } = await webTransport
        .buildSignedRequest({
            method: 'GET',
            baseURL: `${getUsersBase(stage)}/users/0/list`,
        })
        .setParams({ detail: 1, page, limit, ...search })
        .execute<UsersListResponse>();
    const list = (data?.list ?? []).map(mapUser);
    return { list, total: data?.total ?? list.length, page: data?.page ?? page };
};

interface PresenceResponse {
    presence?: Presence;
    Devices?: DeviceViewRaw[];
    devices?: DeviceViewRaw[];
}

export interface UserPresence {
    presence: Presence;
    devices: ObservedDevice[];
}

export const updateUserDevices = async (
    userId: string,
    deviceIds: string[],
    stage: UsersStage = 'd1'
): Promise<void> => {
    await webTransport
        .buildSignedRequest({
            method: 'PUT',
            baseURL: `${getUsersBase(stage)}/users/CN${userId}/admin`,
        })
        .setBody({ deviceIds })
        .execute();
};

export const fetchUserPresence = async (userId: string, stage: UsersStage = 'd1'): Promise<UserPresence> => {
    const { data } = await webTransport
        .buildSignedRequest({
            method: 'GET',
            baseURL: `${getUsersBase(stage)}/users/${userId}/presence`,
        })
        .execute<PresenceResponse>();
    const raw = data?.Devices ?? data?.devices ?? [];
    return { presence: data?.presence ?? 'green', devices: raw.map(mapDeviceView) };
};
