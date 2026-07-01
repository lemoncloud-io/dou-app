/**
 * `mock/observed-users.ts`
 * - Observe 워치리스트 도메인 타입. (실데이터는 `api/userApi.ts`의 fetchObservedUsers로 조회)
 * - 서버 `GET /dou-d1/users/0/list?detail` → ListResult<UserView> + UserView.Devices + presence.
 */
export type Presence = 'green' | 'yellow' | 'red';

export interface ObservedDevice {
    id: string;
    name: string;
    platform: string;
    status: Presence;
    tick: number;
    viewing: string | null; // 보는 중인 channelId (없으면 null)
    viewingFor: number | null; // 해당 채널 체류 시간(초). 미상 시 null
    lastActiveAt: number; // 마지막 활동 후 경과 초
}

export interface ObservedUser {
    id: string; // uid
    name: string; // 표시명(name||nick||id)
    code: string; // accountId
    presence: Presence; // 서버 집계 presence
    devices: ObservedDevice[];
}

export type UserSearchType = 'id' | 'name';
