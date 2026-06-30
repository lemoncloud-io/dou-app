/**
 * `mock/observed-users.ts`
 * - Socket Monitor 워치리스트 목업. 디자인(dc.html)의 seed() 데이터/형태를 그대로 옮김.
 * - 서버가 `UserView.Devices?: DeviceView[]` + presence + viewing을 반환하기 전까지 사용.
 *   실연동 시 INITIAL_OBSERVED/SEARCH_POOL/reloadUserDevices를 web-core/소켓 구독으로 교체.
 */
export type Presence = 'green' | 'yellow' | 'red';

export interface ObservedDevice {
    id: string;
    name: string;
    platform: string;
    status: Presence;
    tick: number;
    viewing: string | null; // 예: '#ch-general' | null
    lastActiveAt: number; // 마지막 활동 후 경과 초
}

export interface ObservedUser {
    id: string; // uuid
    name: string; // 표시명(실데이터는 uuid일 수 있음)
    code: string;
    presence: Presence; // 디바이스 status 집계
    devices: ObservedDevice[];
}

/** 검색 풀 항목(가벼운 요약 — 추가 시 디바이스 합성). */
export interface SearchUser {
    id: string;
    display: string;
    code: string;
    presence: Presence;
    devCount: number;
}

export type UserSearchType = 'id' | 'name';

const mkDev = (
    id: string,
    platform: string,
    status: Presence,
    tick: number,
    viewing: string | null,
    last: number
): ObservedDevice => ({
    id,
    name: id,
    platform,
    status,
    tick,
    viewing,
    lastActiveAt: last,
});

/** 초기 워치리스트(이미 관측 중인 유저 3명). */
export const INITIAL_OBSERVED: ObservedUser[] = [
    {
        id: '06ceb2ec-9f3a-4c12-8e7d-1a2b3c4d5e6f',
        name: 'kim.dev',
        code: 'AB12CD34',
        presence: 'green',
        devices: [
            mkDev('device-zfuq3q', 'macos', 'green', 12, '#ch-general', 8),
            mkDev('device-0cfr9y', 'ios', 'yellow', 7, null, 46),
        ],
    },
    {
        id: 'a2d152fc-77b1-4e90-9a3c-6f0e2d1b8c44',
        name: 'a2d152fc…',
        code: 'KX3MZP2A',
        presence: 'yellow',
        devices: [mkDev('device-kp9wz1', 'web', 'green', 34, '#ch-support', 3)],
    },
    {
        id: 'e1390b7a-5c2d-41a8-b6f7-90ab3c1d2e55',
        name: 'e1390b7a…',
        code: 'QW8RT4YU',
        presence: 'green',
        devices: [
            mkDev('device-aa11bb', 'android', 'green', 58, '#ch-random', 12),
            mkDev('device-cc22dd', 'macos', 'red', 2, null, 140),
        ],
    },
];

/** 검색 모달이 필터링하는 유저 풀(16명). */
export const SEARCH_POOL: SearchUser[] = (
    [
        ['kim.dev', 'AB12CD34', 'green', 3],
        ['lee.ops', 'MN56PQ78', 'green', 2],
        ['park.qa', 'RS90TU12', 'yellow', 1],
        ['a2d152fc…', 'KX3MZP2A', 'yellow', 1],
        ['e1390b7a…', 'QW8RT4YU', 'green', 2],
        ['choi.dev', 'ZX34CV56', 'green', 4],
        ['jung.pm', 'BN78MK90', 'red', 1],
        ['9f02ab71…', 'LP12OI34', 'green', 2],
        ['han.test', 'UY56TR78', 'green', 1],
        ['c4d8e2f1…', 'GH90JK12', 'yellow', 3],
        ['oh.support', 'FD34SA56', 'green', 2],
        ['7b3c9d10…', 'VC78XZ90', 'green', 1],
        ['yoon.dev', 'EW12QA34', 'green', 2],
        ['shin.ops', 'TG56YH78', 'red', 1],
        ['1a2b3c4d…', 'NM90BV12', 'yellow', 2],
        ['kang.qa', 'PO34IU56', 'green', 3],
    ] as [string, string, Presence, number][]
).map((u, i) => ({
    id: u[0].includes('…') ? u[0].replace('…', '') + '-uuid' : '10012' + (15 + i),
    display: u[0],
    code: u[1],
    presence: u[2],
    devCount: u[3],
}));

const PLATFORMS = ['web', 'ios', 'macos', 'android'];

/** 검색 결과 → 관측 유저(devCount 기반 디바이스 합성). */
export const makeUserFromSearch = (u: SearchUser): ObservedUser => ({
    id: u.id,
    name: u.display,
    code: u.code,
    presence: u.presence,
    devices: Array.from({ length: u.devCount }, (_, i) => ({
        id: 'device-' + u.id.slice(0, 4) + i,
        name: 'device-' + u.id.slice(0, 6) + i,
        platform: PLATFORMS[i % 4],
        status: (i === 0 ? u.presence : 'green') as Presence,
        tick: Math.floor(Math.random() * 60),
        viewing: i === 0 ? '#ch-general' : null,
        lastActiveAt: Math.floor(Math.random() * 60),
    })),
});

/** 디바이스 목록 reload(mock 재조회) — tick/lastActive를 새로 샘플. */
export const reloadUserDevices = (devices: ObservedDevice[]): ObservedDevice[] =>
    devices.map(d => ({
        ...d,
        tick: d.status === 'red' ? d.tick : d.tick + Math.floor(Math.random() * 3),
        lastActiveAt:
            d.status === 'green' ? Math.floor(Math.random() * 10) : d.lastActiveAt + Math.floor(Math.random() * 20),
    }));
