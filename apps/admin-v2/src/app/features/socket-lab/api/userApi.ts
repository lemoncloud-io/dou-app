/**
 * `api/userApi.ts`
 * - 관측 유저 목록(실데이터).
 */
import { webTransport } from '@chatic/web-core';

import type { ObservedDevice, ObservedUser, Presence, UserSearchType } from '../mock/observed-users';

interface DeviceViewRaw {
    id?: string;
    name?: string | null;
    platform?: string;
    status?: Presence;
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

const getUsersEndpoint = (): string => `${import.meta.env.VITE_BACKEND_ENDPOINT ?? ''}`.replace('/d1', '');

const mapDevice = (d: DeviceViewRaw, now: number): ObservedDevice => {
    const viewing = d.viewingType === 'channel' && d.viewingId ? `${d.viewingId}` : null;
    const activeAt = d.lastActiveAt ?? d.updatedAt;
    return {
        id: `${d.id ?? ''}`,
        name: d.name || `${d.id ?? 'device'}`,
        platform: d.platform || '-',
        status: d.status ?? 'green',
        tick: d.tick ?? 0,
        viewing,
        viewingFor: null,
        lastActiveAt: activeAt ? Math.max(0, Math.round((now - activeAt) / 1000)) : 0,
    };
};

const mapUser = (u: UserViewRaw, now: number): ObservedUser => ({
    id: `${u.id ?? ''}`,
    name: u.name || u.nick || `${u.id ?? ''}`,
    code: u.accountId || '',
    presence: u.presence ?? 'green',
    devices: (u.Devices ?? []).map(d => mapDevice(d, now)),
});

export interface FetchObservedUsersParams {
    type?: UserSearchType;
    query?: string;
    page?: number;
    limit?: number;
}

export const fetchObservedUsers = async ({
    type = 'id',
    query = '',
    page = 0,
    limit = 10,
}: FetchObservedUsersParams = {}): Promise<UserSearchPage> => {
    const q = query.trim();
    const search = q ? (type === 'name' ? { keyword: q } : { id: q }) : {};
    const { data } = await webTransport
        .buildSignedRequest({
            method: 'GET',
            baseURL: `${getUsersEndpoint()}/skt-d1/users/0/list`,
        })
        .setParams({ detail: 1, page, limit, ...search })
        .execute<UsersListResponse>();
    const now = Date.now();
    const list = (data?.list ?? []).map(u => mapUser(u, now));
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

/** 유저 디바이스 목록 저장(전달한 deviceIds만 유지) — id는 'CN' prefix로 조립 */
export const updateUserDevices = async (userId: string, deviceIds: string[]): Promise<void> => {
    await webTransport
        .buildSignedRequest({
            method: 'PUT',
            baseURL: `${getUsersEndpoint()}/skt-d1/users/CN${userId}/admin`,
        })
        .setBody({ deviceIds })
        .execute();
};

export const fetchUserPresence = async (userId: string): Promise<UserPresence> => {
    const { data } = await webTransport
        .buildSignedRequest({
            method: 'GET',
            baseURL: `${getUsersEndpoint()}/skt-d1/users/${userId}/presence`,
        })
        .execute<PresenceResponse>();
    const now = Date.now();
    const raw = data?.Devices ?? data?.devices ?? [];
    return { presence: data?.presence ?? 'green', devices: raw.map(d => mapDevice(d, now)) };
};
