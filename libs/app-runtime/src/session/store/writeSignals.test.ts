/**
 * 설계 원칙 8 — "쓰기 메서드는 예외 없이 자기 `SessionSignalKind`를 emit한다" (ADR-0076 결정 2).
 *
 * 세 스토어는 세션 상태의 **유일한 writer**인데 여기까지 직접 테스트가 없었다: 12개 스위트가 이
 * 모듈을 `jest.mock`으로 지우고 쓰기의 부수효과는 아무도 안 봤다. `signal.test.ts`는 시그널
 * **메커니즘**(종류별 구독·batch·중첩)만 검증하므로, "어느 쓰기가 어느 종류를 낸다"는 계약은
 * 문서에만 있었다. 그 매핑이 이 파일이 잠그는 것이다.
 *
 * 놓치면 조용하다는 게 요점이다. emit을 빠뜨린 쓰기는 저장까지는 정상이고 화면만 낡은 채로
 * 남는다 — 통지 하나가 빠졌다는 사실은 그 화면을 보는 사람이 새로고침을 누를 때까지 관측되지
 * 않는다. 반대로 필요 없는 emit은 팬아웃 폭주가 되는데, 그게 결정 2가 애초에 고친 문제다
 * (클라우드 전환 한 번이 8번 발화).
 *
 * 스토어 클래스는 export되지 않으므로(싱글턴만 나간다) 실물 싱글턴을 그대로 쓰고 시그널과
 * 저장소만 가짜로 바꾼다 — 프로덕션 표면을 테스트를 위해 넓히지 않는다.
 */
import type { SessionSignalKind } from './signal';

import { cloudStore } from './cloudStore';
import { identityStore } from './identityStore';
import { relayStore } from './relayStore';

const mockEmitted: SessionSignalKind[] = [];
/** 닫힌 batch들, 각각 그 안에서 나온 종류. 한 유스케이스가 한 번의 팬아웃이라는 계약을 여기서 센다. */
const mockBatches: SessionSignalKind[][] = [];
/** 현재 열린 batch 스택. 이게 없으면 batch가 끝난 뒤의 emit도 그 batch 것으로 집계된다 — 이
 *  파일의 첫 판이 그랬고, "emit을 batch 밖으로 옮긴다"는 뮤테이션을 놓쳤다. */
const mockOpen: SessionSignalKind[][] = [];

jest.mock('./signal', () => ({
    sessionSignal: {
        emit: (kind: SessionSignalKind) => {
            mockEmitted.push(kind);
            mockOpen[mockOpen.length - 1]?.push(kind);
        },
        batch: (run: () => void) => {
            const collected: SessionSignalKind[] = [];
            mockOpen.push(collected);
            try {
                run();
            } finally {
                mockOpen.pop();
                mockBatches.push(collected);
            }
        },
        subscribe: () => () => undefined,
    },
}));

// 실제 `storage`는 sessionStorage를 감싸고 프로젝트 접두사를 붙인다. 여기서 확인하는 것은 키가
// 아니라 통지이므로 인메모리로 충분하다.
const mockCells = new Map<string, string>();
jest.mock('@chatic/shared', () => ({
    storage: {
        get: (key: string) => mockCells.get(key) ?? null,
        set: (key: string, value: string) => {
            mockCells.set(key, value);
        },
        remove: (key: string) => {
            mockCells.delete(key);
        },
    },
}));

const TOKEN = { Token: { identityToken: 'id-token' } } as never;

beforeEach(() => {
    mockEmitted.length = 0;
    mockBatches.length = 0;
    mockOpen.length = 0;
    mockCells.clear();
});

/**
 * 쓰기 → 종류 매핑 전체. 표로 두는 이유는 새 쓰기 메서드가 생겼을 때 여기 줄을 안 더하면
 * 리뷰에서 눈에 띄기 때문이다 — 아래 인구조사 테스트가 그걸 강제한다.
 */
const WRITES: Array<{ name: string; write: () => void; kinds: SessionSignalKind[] }> = [
    {
        name: 'relayStore.saveSelectedSiteId',
        write: () => relayStore.saveSelectedSiteId('site-1'),
        kinds: ['selection'],
    },
    { name: 'relayStore.clearSelectedSite', write: () => relayStore.clearSelectedSite(), kinds: ['selection'] },
    { name: 'relayStore.saveRelayToken', write: () => relayStore.saveRelayToken(TOKEN), kinds: ['relay:token'] },
    { name: 'relayStore.clearToken', write: () => relayStore.clearToken(), kinds: ['relay:token'] },
    {
        name: 'cloudStore.saveDelegationToken',
        write: () => cloudStore.saveDelegationToken(TOKEN),
        kinds: ['cloud:token'],
    },
    { name: 'cloudStore.saveCloudToken', write: () => cloudStore.saveCloudToken(TOKEN), kinds: ['cloud:token'] },
    {
        name: 'cloudStore.saveSelectedCloudId',
        write: () => cloudStore.saveSelectedCloudId('cloud-1'),
        kinds: ['selection'],
    },
    {
        name: 'cloudStore.saveSelectedSiteId',
        write: () => cloudStore.saveSelectedSiteId('site-1'),
        kinds: ['selection'],
    },
    { name: 'cloudStore.clearSelectedSite', write: () => cloudStore.clearSelectedSite(), kinds: ['selection'] },
    {
        name: 'cloudStore.clearSession',
        write: () => cloudStore.clearSession(),
        // 토큰과 선택은 함께 사라진다 — 클라우드를 떠나는 것은 관측상 한 번의 변화다.
        kinds: ['cloud:token', 'selection'],
    },
    { name: 'identityStore.setDelegatorId', write: () => identityStore.setDelegatorId('deleg-1'), kinds: ['identity'] },
    // null은 삭제 경로다. 저장이 아니라 제거지만 상태가 움직였으므로 통지는 같다.
    {
        name: 'identityStore.setDelegatorId(null)',
        write: () => identityStore.setDelegatorId(null),
        kinds: ['identity'],
    },
    { name: 'identityStore.setDeviceId', write: () => identityStore.setDeviceId('device-1'), kinds: ['identity'] },
    { name: 'identityStore.setDeviceId(null)', write: () => identityStore.setDeviceId(null), kinds: ['identity'] },
];

describe('세션 스토어 — 쓰기마다 자기 종류를 통지한다 (원칙 8)', () => {
    it.each(WRITES)('$name → $kinds', ({ write, kinds }) => {
        write();

        expect(mockEmitted).toEqual(kinds);
    });
});

describe('세션 스토어 — 통지하지 않는 쓰기', () => {
    /**
     * 유일한 합법 예외이고, 예외인 이유가 이름에 있다: 세션 상태가 아니라 캐시다. 통지하면
     * 클라우드 전환마다 재파생이 한 번 더 붙는데 아무 구독자도 이 값을 읽지 않는다.
     */
    it('setCachedCloudTokens는 세션 상태가 아니라 캐시라 아무것도 emit하지 않는다', () => {
        cloudStore.setCachedCloudTokens('cloud-1', { cloudToken: TOKEN, delegationToken: TOKEN } as never);

        expect(mockEmitted).toEqual([]);
    });

    it('읽기는 통지하지 않는다 — 만료된 캐시 항목을 스스로 지우는 읽기까지', () => {
        // 만료된 항목을 심어두면 getCachedCloudTokens가 그 자리에서 지운다(쓰기를 한다). 그래도
        // 통지는 없어야 한다: 아무 상태도 움직이지 않았고, 만료는 이미 관측 가능한 사실이다.
        cloudStore.setCachedCloudTokens('cloud-1', {
            cloudToken: { Token: { credential: { Expiration: new Date(Date.now() - 1000).toISOString() } } },
            delegationToken: TOKEN,
        } as never);
        mockEmitted.length = 0;

        expect(cloudStore.getCachedCloudTokens('cloud-1')).toBeNull();
        expect(mockEmitted).toEqual([]);
    });
});

describe('세션 스토어 — 유스케이스 하나는 팬아웃 하나 (원칙 8 후반)', () => {
    it('clearSession의 두 종류는 한 batch 안에서 나온다', () => {
        cloudStore.clearSession();

        // 두 emit이 batch 밖에 있으면 관측자는 "토큰은 지워졌는데 선택은 남아 있는" 중간 상태를
        // 한 번 보게 된다 — 결정 2가 없앤 바로 그 상태.
        expect(mockBatches).toEqual([['cloud:token', 'selection']]);
    });

    it('단건 쓰기는 batch를 열지 않는다 — 경계는 유스케이스의 것이다', () => {
        relayStore.saveRelayToken(TOKEN);

        expect(mockBatches).toEqual([]);
    });
});

describe('세션 스토어 — 쓰기 인구조사', () => {
    /**
     * 위 표가 스토어의 쓰기 표면 전체를 덮는지 확인한다. 새 쓰기 메서드를 더하고 표를 안 고치면
     * 여기서 실패한다 — 그게 이 파일이 낡지 않게 만드는 장치다. 이름 규약(`save*`/`set*`/`clear*`)이
     * 판정 기준이고, 접두사를 따르지 않는 쓰기가 생기면 그것 자체가 리뷰거리다.
     */
    it('표가 세 스토어의 쓰기 메서드를 전부 덮는다', () => {
        const covered = new Set(
            WRITES.map(entry => entry.name.replace(/\(null\)$/, '')).concat([
                'cloudStore.setCachedCloudTokens', // 위의 예외 스위트가 덮는다
            ])
        );

        // 메서드는 인스턴스가 아니라 프로토타입에 있다 — `Object.keys(store)`는 0개를 돌려주고
        // 인구조사가 조용히 통과한다. 이 파일의 첫 판이 정확히 그렇게 통과했다.
        const methodsOf = (store: object, label: string): string[] =>
            Object.getOwnPropertyNames(Object.getPrototypeOf(store))
                .filter(key => key !== 'constructor')
                .map(key => `${label}.${key}`);

        const surface = [
            ...methodsOf(relayStore, 'relayStore'),
            ...methodsOf(cloudStore, 'cloudStore'),
            ...methodsOf(identityStore, 'identityStore'),
        ];
        const writes = surface.filter(name => /\.(save|set|clear)[A-Z]/.test(name));

        expect(writes.length).toBeGreaterThan(0);
        expect(writes.filter(name => !covered.has(name))).toEqual([]);
    });
});
