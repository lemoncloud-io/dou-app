/**
 * `api/userApi.ts`
 * - 관측 유저 목록(실데이터). chatic-sockets-api: GET /skt-d1/users/0/list?detail
 *   params: limit, page, id(uid), keyword(name) → ListResult<UserView> + UserView.Devices + presence.
 * - signed REST(webTransport) — 로그인 토큰으로 인증(WS와 무관). 조회 전용.
 */
import { webTransport } from '@chatic/web-core';

import type { ObservedDevice, ObservedUser, Presence, UserSearchType } from '../mock/observed-users';

/** 서버 UserView.Devices 항목(0.26.525엔 타입 미포함 → 로컬 정의, 방어적 optional). */
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

/** users API base = VITE_BACKEND_ENDPOINT에서 stage suffix(/d1) 제거 후 /skt-d1 경로(deviceApi와 동일 패턴). */
const getUsersEndpoint = (): string => `${import.meta.env.VITE_BACKEND_ENDPOINT ?? ''}`.replace('/d1', '');

const mapDevice = (d: DeviceViewRaw, now: number): ObservedDevice => ({
    id: `${d.id ?? ''}`,
    name: d.name || `${d.id ?? 'device'}`,
    platform: d.platform || '-',
    status: d.status ?? 'green',
    tick: d.tick ?? 0,
    viewing: d.viewingType === 'channel' && d.viewingId ? `#${d.viewingId}` : null,
    lastActiveAt: d.updatedAt ? Math.max(0, Math.round((now - d.updatedAt) / 1000)) : 0,
});

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

/** 관측 유저 목록 조회(디바이스/presence 포함). type=id→param id(uid), type=name→param keyword. */
export const fetchObservedUsers = async ({ type = 'id', query = '', page = 0, limit = 10 }: FetchObservedUsersParams = {}): Promise<UserSearchPage> => {
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

/** 단일 유저 디바이스/presence 조회 — GET /skt-d1/users/<id>/presence. 추가/reload 시 사용. */
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
