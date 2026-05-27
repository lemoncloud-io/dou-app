# Spec: hot-cold-cache-hardening

## Meta

- **Created**: 2026-05-27
- **Type**: dev
- **Status**: approved (work record)
- **Related PR**: lemoncloud-io/dou-app#286 (`docs/specs/cache/hot-cold-cache-strategy.md`)
- **Approved by**: aiden
- **Approved at**: 2026-05-27
- **External-facing docs (앱팀 공유용)**: `docs/specs/cache/hot-cold-cache-hardening/` (overview.md / interfaces.md / decisions.md)

## Goal

PR #286의 Hot/Cold 2-Tier 캐시 명세에 대한 자기검증 결과 도출된 4개 보완 항목을 구현 가능한 단일 스펙으로 정리하여, `DynamicCacheStorage` 본 구현 착수 전에 명세를 보강하고 후속 PR로 연결한다.

## Non-goals

- TTL 처리 정책 전반 (PR #286 9절에서 향후 확장으로 명시됨)
- NativeDBAdapter의 bridge retry/에러 분류 (어댑터 자체 책임, `db-adapter-refactoring.md` 소관)
- 앱 시작 시 전체 warm-up / schema versioning (PR #286 9절 향후 확장)
- `DynamicCacheStorage` 본체의 기본 read/write/delete 흐름 (PR #286에 이미 명세됨)
- 웹 브라우저 환경 (`IndexedDbOnlyStrategy`)의 동작 (변경 없음)

## Confirmed Goal

App WebView 환경의 `DynamicCacheStorage(hot=IndexedDB, cold=NativeDB)`에 대해 아래 4개 항목을 명세화한다:

1. **chat loadAll partial hit 방어** — `Hot 결과 > 0` 조건이 페이지네이션 쿼리에서 incomplete page를 반환하는 문제 해결
2. **default readPolicy 재분류** — delete 빈도 있는 타입을 cold-first로 재분류해 PR #286 5절의 stale mitigation을 default와 정합화
3. **Warm-up stampede 가드** — 동일 키 in-flight warm-up Promise 캐싱으로 중복 Cold 읽기 방지
4. **Hot eviction 정책** — IndexedDB quota 보호용 cleanup 정책 명시 (출시 전 필수)

완료 기준: spec.md에 4개 항목 각각이 Decision → Requirements (GWT) → Tasks로 분해되어 구현 착수 가능한 상태가 되고, 사용자 승인을 받음.

## Research

### PR #286 명세 인용 (자기검증 근거)

- 명세 본문: `docs/specs/cache/hot-cold-cache-strategy.md`
- loadAll hot-first 분기 조건 "Hot 결과 > 0": L268–270
- defaultLoadAllPolicies (`chat: 'hot-first'`): L350–357
- defaultReadPolicies (모든 타입 `'hot-first'`): L341–348
- Stale 데이터 mitigation ("stale 민감 타입: cold-first로 Hot 우회"): L660–663
- warm-up fire-and-forget (in-flight 가드 없음): L275, L281, L283
- Hot 무효화 await best-effort (실패 시 reporter 기록, 삼킴): L321–327
- 향후 확장 (TTL, pre-load warm-up, schema versioning): L1023–1025

### 기존 코드 위치

- `IndexedDBAdapter` 클래스: `libs/data/src/data/local/storages/IndexedDBAdapter.ts:15`
    - `save`: line 53, `saveAll`: line 59, `loadAll`: line 81, `delete`: line 93
    - `__cacheMeta`/`expiresAt` 주입 (`createTtlMeta`): line 36–37
- `NativeDBAdapter` 클래스: `libs/data/src/data/local/storages/NativeDBAdapter.ts:25`
    - `save`: line 34, `saveAll`: line 49, `loadAll`: line 80, `delete`: line 101
- `ChatQueryExecutor` 클래스: `libs/data/src/data/local/databases/ChatQueryExecutor.ts:9`
    - `execute` (cursor 기반 페이지네이션, IDBKeyRange 사용): line 10–39
    - `CHAT_PAGINATION_INDEX` 사용: line 3, 33
- `CHAT_PAGINATION_INDEX` 정의: `libs/data/src/data/local/databases/IndexedDBDatabase.ts:8`
- `localFactory.ts`: `apps/web/src/app/shared/data/localFactory.ts`
    - `isNativeApp()`: line 18–24, `getCacheStorage()`: line 36–55
- `CACHE_TTL_MS` 정의: `libs/data/src/data/local/storages/utils.ts:9–16`
    - `chat`: 100년, `channel/join/site/user`: 30분, `invitecloud`: 100년
- `RepositoryCachePolicy` 타입: `libs/data/src/data/repositories/types.ts:24`
    - 4종: `'cache-first' | 'network-only' | 'cache-only' | 'cache-and-network'`
- `ChatRepository.cachePolicy` 기본값 `'cache-first'`: `libs/data/src/data/repositories/ChatRepository.ts:126`

### 기존 캐시 cleanup/eviction 현황

- `IndexedDBStorageAdapter` (레거시 chat 저장소): `apps/web/src/app/features/chats/storages/IndexedDBStorageAdapter.ts`
    - 명시적 cleanup/eviction 로직 **없음**. 수동 `clear`만 존재 (line 97–102)
- `IndexedDBAdapter` (현행 도메인 어댑터): TTL 메타는 주입하지만 자동 만료 cleanup 로직 **없음**
- 결론: 기존 코드 어디에도 eviction 정책이 없음 → 본 spec에서 신규 정의 필요

## Decisions

> **방향**: 본 spec은 **인터페이스 설계**를 정의하고, 도메인 정책 수치(cap 크기, type별 readPolicy 분류)는 **앱팀의 후속 결정**으로 위임한다. 백엔드/플랫폼 책임 = "정책을 표현하고 주입할 자리", 앱팀 책임 = "그 자리에 채울 값".

### D1: chat loadAll의 cursorNo 기반 policy 분기

- **Status**: resolved
- **Rationale**: PR #286은 chat을 `loadAllPolicy='hot-first'`로 일괄 설정하나, ChatQueryExecutor의 cursor 페이지네이션 쿼리에서 Hot의 partial data가 incomplete page를 반환하는 버그가 있다. `DynamicCacheStorage.loadAll(options)`는 **`options.cursorNo` (PagingMeta의 정식 필드명)** 가 truthy하면 강제 cold-first로 우회, 없으면 PolicyResolver의 loadAllPolicy 적용.
    - 정식 필드명 `cursorNo` 사용 근거: `libs/data/...` 내 `PagingMeta` 정의(탐색 결과). `cursor`라는 별칭 필드 추가 금지 — 단일 진실 원천 유지.
    - 분기 위치: `DynamicCacheStorage.loadAll` 진입부에서 `options?.cursorNo != null` 체크 → true면 강제 cold-first.

    대안 "Hot length<limit 시 Cold fallback"은 마지막 페이지 정상 케이스에서도 Cold 호출; chat loadAll 전면 cold-first는 hot-first 이점 포기. cursor 분기가 정확성+성능 균형. **인터페이스 영역**.

### D2: EvictionStrategy 인터페이스 (3개 훅 + 호출 계약)

- **Status**: resolved
- **Rationale**: Eviction 정책 자체는 도메인 결정이므로 본 spec은 **훅 인터페이스 + 호출 계약**만 정의. 구현체는 앱팀이 별도 PR로 작성·주입.

    ```typescript
    interface EvictionStrategy {
        /** Startup TTL sweep 등. DCS 생성 직후 1회 호출 */
        onStartup(hot: CacheStorage<any>): Promise<void>;
        /** per-type cap 검사 등. items 전체 전달 → CapacityPolicy.getGroupKey 호출 가능 */
        onAfterWrite<T extends CacheType>(type: T, items: CacheModelOf<T>[], hot: CacheStorage<T>): Promise<void>;
        /** 비상 cleanup. Hot 에러가 QuotaExceededError류일 때 호출 */
        onQuotaExceeded(type: CacheType, hot: CacheStorage<any>): Promise<void>;
    }
    ```

    **호출 계약 (누가 언제, 순서 보장):**
    | 훅 | 호출 주체 | 시점 | 동기/비동기 |
    |------|-----------|------|--------------|
    | `onStartup` | factory (`getCacheStorage`) | DCS 생성 직후 1회 | fire-and-forget (background) |
    | `onAfterWrite` | DCS | Cold.save 성공 → **Hot.save 완료 await → onAfterWrite 호출** (순차) | Promise chain (await 안 함, 단 Hot.save 후) |
    | `onQuotaExceeded` | DCS | Hot 에러 catch 시 `QuotaExceededError` 류로 판정되면 호출 | fire-and-forget |

    **순서 보장 근거**: onAfterWrite가 Hot.save 완료 후 호출되어야 cap 검사 대상 items가 실제 Hot에 반영된 상태. 둘이 병렬이면 cap 검사 시점에 신규 item이 아직 미반영되어 중복 평가 또는 미평가 발생 가능. DCS는 `coldSave.then(() => hotSave).then(() => onAfterWrite)` chain 사용.

    **빈 items 처리**: `items.length === 0`이면 onAfterWrite 호출 생략 (DCS 책임).

    **다중 호출 race 안전성**: 동시 saveAll 여러 개 발생 시 onAfterWrite도 동시 실행 가능. **EvictionStrategy 구현체가 자체 직렬화 보장** (예: 내부 mutex/queue). DCS는 다중 onAfterWrite를 큐잉/직렬화하지 않음 — 책임 분산. 이유: DCS가 직렬화하면 cap 검사 지연으로 일시적 over-cap 상태 발생; 구현체별 LRU/FIFO 전략에 따라 직렬화 필요 강도가 달라 한 곳에 강제하기 부적절.

    **CapacityPolicy 결합**: 구현체 생성자에서 주입 (`new MyEviction({ capacityPolicy, ... })`). 본 spec은 인터페이스 계약만 정의, 결합은 구현체 자유.

    **Eviction 트랜잭션 권장사항** (D8 연계): EvictionStrategy 구현체는 단일 항목 또는 batch 삭제를 IDB transaction 단위로 묶어 partial state 노출 최소화. 본 spec은 권장만, 강제 아님 (구현체 자유).

    대안 "단일 evict() 메서드"는 시점 정보 손실; "정책 직접 명세"는 도메인 결정 강요; "ids만 전달"은 grouping/LRU 판단 불가. 3-훅 + items 전체 전달 + 순차 chain이 정확.

### D3: CapacityPolicy 인터페이스 (cap + grouping 추상화, type-safe)

- **Status**: resolved
- **Rationale**: type별 cap 수치/그룹핑 키도 도메인 결정이므로 **조회 인터페이스만** 정의. Generic으로 type-safety 강화.
    ```typescript
    interface CapacityPolicy {
        /** 해당 type의 최대 항목 수. null이면 cap 없음 */
        getLimit(type: CacheType, groupKey?: string): number | null;
        /** item을 그룹 키로 매핑. undefined면 전체 LRU. Generic으로 item 타입 안전 보장 */
        getGroupKey<T extends CacheType>(type: T, item: CacheModelOf<T>): string | undefined;
    }
    ```
    `EvictionStrategy` 구현체가 내부에서 사용. chat의 per-channel 정책도 getGroupKey만 다르게 구현하면 표현 가능. 대안 "item: unknown"은 구현체에서 강제 캐스팅으로 type 안전성 상실; "type별 Record<CacheType, number>"는 그룹핑 표현 불가; "EvictionStrategy 안에 통합"은 단일 책임 위배.

### D4: Stampede 가드 — DCS 인스턴스별 in-flight Map (TTL 포함)

- **Status**: resolved
- **Rationale**: `DynamicCacheStorage` 인스턴스별로 `Map<queryKey, { promise, startedAt }>` 보유. load + loadAll 두 메서드에 가드 적용. save/delete는 fire-and-forget 또는 caller-driven mutation이라 가드 불필요. **Long-pending 누수 방지**: 항목별 `startedAt` 기록, 매 가드 등록 시 또는 주기 정리 시 `now - startedAt > STAMPEDE_TIMEOUT_MS`(기본 **5000ms**, bridge 통신 ms 단위 기준)인 항목은 강제 제거(reject 시도 → caller에는 timeout error).

    **에러 식별 — `StampedeTimeoutError` 클래스 정의**:

    ```typescript
    export class StampedeTimeoutError extends Error {
        readonly name = 'StampedeTimeoutError';
        constructor(
            public readonly queryKey: string,
            public readonly elapsedMs: number
        ) {
            super(`Stampede timeout: ${queryKey} (${elapsedMs}ms)`);
        }
    }
    ```

    caller는 `error instanceof StampedeTimeoutError`로 구분 가능. 일반 Cold/Hot error와 별개 처리 경로 확보. Reporter(D9)에는 `tier='stampede', operation='stampede-timeout'`로 기록.

    대안 30000ms는 이미 실패한 요청; 1000ms 미만은 정상 long query도 실패. 5000ms가 합리적 baseline (TBD-6에서 실측 후 조정). "type별 싱글톤 가드"는 cid/uid 스코프 충돌; "load 제외"는 단건 동시 호출 보호 누락. DCS는 type별 1개 생성 → 인스턴스별 = type별 + 스코프 보장.

### D5: PolicyResolver 인터페이스 (type별 readPolicy 주입 가능)

- **Status**: resolved
- **Rationale**: PR #286의 `defaultReadPolicies` 하드코딩 대신 **주입 가능한 resolver 인터페이스**로 추상화. 도메인 분류는 앱팀이 구현체 작성.

    ```typescript
    interface PolicyResolver {
        resolveReadPolicy(type: CacheType): CacheReadPolicy;
        resolveLoadAllPolicy(type: CacheType): CacheReadPolicy;
    }
    ```

    본 spec은 기본 구현체(`DefaultPolicyResolver`)를 제공하되, **type별 분류값은 일괄 TBD(앱팀 확정)** — baseline 권장값을 명시하지 않는다. (특정 type만 권장하면 위임 원칙과 비대칭) `DefaultPolicyResolver`는 주입 없을 때 안전한 fallback으로 **모든 type을 `cold-first`로 반환** (PR #286의 hot-first 일괄과 정반대지만 정합성 우선).

    **⚠️ Default fallback 운영 경고 + Runtime assertion**:
    cold-first 일괄은 PR #286의 hot-first가 제공하던 chat의 bridge 절감 이점을 완전히 잃는다. **앱팀 정책 미주입 운영은 금지** — factory(`getCacheStorage`)에서 PolicyResolver 미주입을 다음과 같이 처리:

    ```typescript
    // factory 내부
    if (!options.policyResolver) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error(
                '[DynamicCacheStorage] PolicyResolver 필수. DefaultPolicyResolver는 dev/test 전용 fallback.'
            );
        }
        console.warn(
            '[DynamicCacheStorage] PolicyResolver 미주입 — DefaultPolicyResolver(cold-first 일괄) 사용. 운영 전 PolicyResolver 주입 필수.'
        );
    }
    ```

    build-time 체크가 아닌 **runtime assertion** 채택 — 번들러 플러그인 추가 없이 즉시 적용 가능, prod 빌드 시 첫 factory 호출에서 즉시 throw → CI 통합 테스트가 catch. 안전 fallback은 "구현 늦어도 dev 동작은 함" 수준이지 운영 default가 아님.

    도메인 정합/성능 trade-off는 앱팀이 구현체 재정의로 결정. 대안 "Record 상수 export"는 교체 시 import 변경 필요; "DCS 옵션에 직접 매핑 받기"는 type 추가/제거 시 옵션 시그니처 변경. resolver 인터페이스가 OCP 만족.

### D6: Warm-up 실패 처리 — DataLoader 패턴 (settled 즉시 해제)

- **Status**: resolved
- **Rationale**: settled(reject 포함) 시 in-flight Map에서 즉시 제거 → 다음 호출은 새 Promise 생성. back-off는 NativeDBAdapter 내부 책임으로 분리 (본 spec Non-goals와 일치). 대안 "negative caching/back-off"는 Cold가 로컬 SQLite+bridge라 외부 장애와 달리 일시적 미준비가 대부분; 짧은 back-off도 사용자 체감 회복 지연. 레이어 분리 검증 통과: DCS는 retry 모름, 어댑터는 가드 모름. **인터페이스 영역**.

### D7: query key 생성 — stable hash 인터페이스 + 충돌 정책 + options 제약

- **Status**: resolved
- **Rationale**: `loadAll(options)`의 options를 키 정렬 후 JSON 직렬화 → 해시. load(id)는 id 그대로. 본 spec은 `stableHash(value: unknown): string` 유틸 함수로 분리하여 구현 교체 가능하게 한다.
    - **MVP 구현**: sorted-key JSON 그 자체를 key로 사용 (해시 함수 없이 string 직접 비교). 충돌 0 보장 (단 key 길이가 김).
    - **options 제약 (Constraint 추가)**: options는 **JSON-serializable primitive (string/number/boolean/null/배열/plain object)만 허용**. `undefined`/`Date`/`Map`/`Set`/`Function`/circular ref 금지. `undefined` 필드는 정렬 전에 제거(missing key와 동치화). 위반 시 stableHash가 throw → caller가 인지 가능.
    - **충돌 정책**: sorted-key JSON 방식은 정확히 같은 options만 같은 key → 의도된 stampede 통합. 별도 hash(예: SHA-256 truncated) 도입 시 충돌 가능성 발생하지만 본 spec MVP는 hash 미사용으로 충돌 0.
    - **교체 시점**: 운영 중 key 길이로 인한 Map 메모리 부담 측정되면 SHA-256 교체 검토. 충돌 감지·대응은 별도 spec.

    대안 단순 `JSON.stringify(options)`는 키 순서 차이; 명시적 필드 추출은 type별 schema 분기. **인터페이스 영역**.

### D8: Eviction 중 active read 충돌 — 관대적 처리 + transaction 가이드

- **Status**: resolved
- **Rationale**: 명세 이미 보장: eviction으로 Hot에서 제거 → 후속 read miss → Cold fallback → background warm-up. DCS 레이어에서 별도 동시성 제어 불필요.

    **EvictionStrategy 구현 가이드 (필수)**: batch 삭제는 **단일 IDB transaction**으로 묶을 것. 이유: transaction 외부에서 partial state(절반만 삭제된 상태)가 read 결과로 노출되면 사용자가 인지하는 데이터 불일치 발생. 단일 transaction이면 read 입장에선 "삭제 전" 또는 "삭제 후"만 관찰 가능 (IDB의 transaction isolation).

    대안 "DCS에 동시성 제어 추가"는 throughput 저하; "evict candidate 마킹"은 메타 오버헤드. Hot=파생캐시 원칙(PR #286 핵심원칙 2)에 위배되지 않음.

### D9: Eviction 자체 실패 — reporter 인터페이스 통합 + save 성공 처리

- **Status**: resolved
- **Rationale**: Hot eviction이 IDB transaction abort 등으로 실패해도 save는 성공으로 처리. Hot=파생캐시 원칙과 일관. quota event fallback(D2 `onQuotaExceeded` 훅)으로 우회 가능.

    **Reporter 인터페이스 정의 (PR #286 보강)**: PR #286은 "reporter 기록"이라는 표현만 사용하고 인터페이스 미정의. 본 spec에서 통합 정의:

    ```typescript
    type CacheErrorOperation =
        | 'load'
        | 'loadAll'
        | 'save'
        | 'saveAll'
        | 'delete'
        | 'deleteAll'
        | 'clearAll'
        | 'eviction'
        | 'stampede-timeout';
    type CacheErrorTier = 'hot' | 'cold' | 'eviction' | 'stampede';

    interface CacheErrorReporter {
        (
            error: unknown,
            context: {
                tier: CacheErrorTier;
                operation: CacheErrorOperation;
                type?: CacheType;
            }
        ): void;
    }
    ```

    - PR #286의 `onHotError` 콜백은 이 인터페이스의 `tier='hot'` 케이스로 흡수.
    - Eviction 실패는 `tier='eviction', operation='eviction'`로 기록.
    - Stampede TTL timeout은 `tier='stampede', operation='stampede-timeout'`로 기록.
    - 미주입 시 default = `console.warn` (PR #286 7.3 현재 구현 유지).

    **호출 보호 명세 (필수)**:
    - Reporter는 **sync 시그니처** (Promise 반환 안 함). 비동기 작업 필요 시 Reporter 구현체 내부에서 fire-and-forget.
    - Reporter 구현체는 **throw 금지**. 단, 방어 차원에서 **DCS는 Reporter 호출을 try/catch로 보호**하여 Reporter 자체 오류가 DCS 동작에 영향 주지 않도록 보장:
        ```typescript
        private safeReport(error: unknown, context: CacheErrorContext): void {
            try {
                this.reporter?.(error, context);
            } catch {
                // 의도적 무시 — reporter 오류는 silent
            }
        }
        ```
    - 호출 빈도가 높을 수 있으므로 Reporter 내부에서 자체 throttle/sampling은 구현체 책임.

    대안 "save 실패 처리"는 Cold/Hot 비대칭; "즉시 quota fallback 강제"는 과잉 보호; "PR #286 onHotError 그대로 유지"는 eviction/stampede 에러 통로 없음.

### D10: \_\_cacheMeta 확장 — lastAccessedAt + batch update 전략

- **Status**: resolved
- **Rationale**: `createTtlMeta()`를 확장해 `lastAccessedAt` 필드 추가. `EvictionStrategy` 구현체가 LRU 판단에 사용. 본 spec은 **메타 필드 + 갱신 전략**만 정의, 정확한 cap 운영은 구현체 자유.

    **Write amplification 회피 — batch update**: load마다 IDB write를 하면 chat 1000개 채널 read 시 1000개 항목 write 발생. 비현실적. 대신:
    - **In-memory pending Map**: `Map<itemKey, lastAccessedAt>` (DCS 인스턴스별)
    - **load 시점**: pending Map에만 timestamp 기록 (IDB write 없음, O(1) 메모리만)
    - **flush 시점 우선순위** (단일 flush job, 중복 방지):
        1. **Trigger A — onAfterWrite 직전 (primary)**: 항상 flush 시도, 단 진행 중 flush가 있으면 skip (그 flush가 최신 pending 포함).
        2. **Trigger B — idle timer (fallback)**: A가 일정 시간(예: 60초) 동안 발생하지 않으면 idle flush 1회. A 발생 시 timer reset.
        3. **Trigger C — visibility hidden / beforeunload (last resort)**: 페이지 이탈 시 동기적 flush 시도. 실패 허용.
    - **중복 방지 메커니즘**: `isFlushing: boolean` 플래그. flush 진행 중 trigger 발생 시 skip. flush 완료 시 plug 해제.
    - **EvictionStrategy가 LRU 판정 시**: IDB의 `lastAccessedAt` 우선 + pending Map의 최신값으로 병합 (in-memory가 더 신선).
    - **앱 재시작 시 소실**: pending Map만 소실, IDB에 flush된 값은 남음. 일부 부정확하지만 LRU 근사로 수용.

    Trigger A가 주력, B는 read-only 상태(write 없음)에서 안전망, C는 최후 보루. A 단독 운영도 가능 (B, C는 선택적). 셋이 동시 발생 시 중복 방지 플래그가 보호.

    대안 "load마다 write 즉시"는 비용 폭증; "FIFO(lastSyncedAt 활용)"는 빈번한 read 항목도 삭제 가능; "메모리 Map만"은 앱 재시작 시 모두 소실. batch 전략이 비용·정확성 균형.

### D11: 정책 주입 시점 — DCS 생성 시점 + 읽기 전용 inspector

- **Status**: resolved
- **Rationale**: **Mutation은 DCS 생성 시점만**: `DynamicCacheStorageOptions`에 `evictionStrategy?`, `capacityPolicy?`, `policyResolver?` 주입. factory(`getCacheStorage`)에서 환경별로 다른 구현체 선택. per-call options에서는 정책 override 불가.
    - **Default fallback**: 세 정책 모두 선택적 주입(`?`). 미주입 시 spec이 제공하는 default 구현체(`DefaultEvictionStrategy`=no-op, `DefaultCapacityPolicy`=무한, `DefaultPolicyResolver`=전부 cold-first) 사용. → 앱팀이 구현 늦어도 동작은 함(보수적 안전 fallback).
    - **테스트 inspector**: `DynamicCacheStorage`에 read-only getter 노출 (`getPolicyResolver(): Readonly<PolicyResolver>`, `getCapacityPolicy(): Readonly<CapacityPolicy>`, `getEvictionStrategy(): Readonly<EvictionStrategy>`). TypeScript `Readonly<T>` 반환으로 호출자가 메서드 호출만 가능 + 객체 mutation 차단. 런타임 강제는 `Object.freeze` 옵션(테스트 환경 한정). 테스트에서 주입된 정책 검증 가능, 단 mutation은 여전히 생성 시점만.

    대안 "per-call override"는 API 표면 증가 + 호출자 책임 분산; "inspector 미제공"은 테스트에서 정책 동작 검증 시 mock 어댑터로 우회해야 해 비용 증가. 강제 신선 데이터 필요 시 Repository의 `cachePolicy='network-only'`로 우회.

## Constraints

- 본 spec은 **App WebView 환경(`HotColdCacheStorageStrategy`)에만 적용**. 웹 브라우저(`IndexedDbOnlyCacheStorageStrategy`)는 변경 없음.
- 기존 `CacheStorage<TType>` 인터페이스(PR #286 정의)는 **변경 금지**. 본 spec의 추가 인터페이스는 모두 `DynamicCacheStorageOptions`를 통해 주입.
- `IndexedDBAdapter`/`NativeDBAdapter`의 public API는 **변경 금지**. `__cacheMeta` 필드 확장은 어댑터 내부 변경.
- PR #286이 명시한 핵심 원칙 5가지(Cold=SoT, Hot=파생캐시, 전략 객체로 조립, 인터페이스 투명성, 삭제는 stale 방지 우선)는 유지.
- `src/cores/` 하위 수정 금지 (프로젝트 lemon-rules).
- **CacheQueryOf<TType> options 제약 (D7)**: 모든 `CacheQueryOf` 타입 필드는 JSON-serializable primitive (string/number/boolean/null/배열/plain object)만 허용. `undefined` 필드는 missing key와 동치 처리. `Date`/`Map`/`Set`/`Function`/circular ref 금지. 기존 `ChatQueryOptions` 등 검증 후 위반 시 정규화.
- **PolicyResolver 미주입 운영 금지 (D5)**: factory에서 PolicyResolver 미주입 + production 빌드는 build-time error. dev는 console.warn 1회.
- **인터페이스 freeze**: 본 spec 승인 시점에 D2/D3/D5/D7/D9의 인터페이스 시그니처는 freeze. 변경 필요 시 별도 spec.

## Known Gaps

> 본 spec의 인터페이스만 정의되고 **구체 값/구현은 앱팀이 후속 PR로 결정**해야 할 항목:

- **TBD-1: type별 capacity cap 수치** — `CapacityPolicy.getLimit(type)` 구현체에서 결정 (예: chat 채널당 N개, channel/user 전체 N개). 앱팀 도메인 판단.
- **TBD-2: type별 readPolicy/loadAllPolicy 분류** — `PolicyResolver` 구현체에서 결정. 본 spec은 baseline 권장값 없음 — 일괄 위임 (L2 critic 피드백 반영). 단 사용자 정보: join.readNo는 자주 변경됨(앱팀 분류 시 참고용).
- **TBD-3: chat의 per-channel 그룹핑 키 추출** — `CapacityPolicy.getGroupKey(type='chat', item)` 구현체 (예: `item.channelId`).
- **TBD-4: Startup TTL sweep 실행 타이밍** — `EvictionStrategy.onStartup` 구현체 (DCS 생성자 직후 background, `requestIdleCallback`, 또는 첫 read 직전 lazy 등). 호출 시점은 factory(D2 호출 계약 표) 고정, 내부 실행 방식만 자유.
- **TBD-5: Quota event 감지 방식** — `QuotaExceededError` 외에 Native bridge 응답에서 quota 신호도 잡을지 여부 (구현 결정).
- **TBD-6: STAMPEDE_TIMEOUT_MS 기본 30000의 적정성** — 운영 측정 후 조정 (D4).
- **L2 inversion: cold-first 다발 type의 성능 영향** — 본 spec 책임 아님(PolicyResolver 주입이라 앱팀이 결정). 단 cold-first 채택 시 stampede 가드(D4)의 효과가 더 중요해진다는 점 명시.
- **L2 critic: 인터페이스 freeze 기준** — 본 spec 승인 후 인터페이스 변경 시 앱팀 영향. 승인 후 freeze, 변경 필요 시 별도 spec.

## Requirements

### R0: Hot/Cold 캐시 명세 보강 (Goal-level)

#### R0.1: 4건 보완 항목이 모두 DynamicCacheStorage 구현체에 반영

- **Given**: PR #286 명세를 받은 앱팀이 본 spec을 함께 받음
- **When**: DynamicCacheStorage를 신규 구현
- **Then**: D1~D11이 모두 코드에 반영되어 `DynamicCacheStorage.test.ts`의 핵심 시나리오(R1~R5)가 통과

---

### R1: chat loadAll partial hit 방어 (D1 fulfills)

#### R1.1: cursorNo가 양수일 때 cold-first 강제

- **Given**: DCS가 type='chat'으로 생성, PolicyResolver.resolveLoadAllPolicy('chat')가 'hot-first' 반환
- **When**: `dcs.loadAll({ channelId: 'ch-1', cursorNo: 500, limit: 50 })` 호출
- **Then**: Hot.loadAll **호출되지 않음**, Cold.loadAll만 호출, 결과 반환 후 background warm-up(Hot.saveAll) 발생

#### R1.2: cursorNo === 0도 cold-first (의도된 명시)

- **Given**: 동일 PolicyResolver 설정
- **When**: `dcs.loadAll({ channelId: 'ch-1', cursorNo: 0, limit: 50 })` 호출
- **Then**: `cursorNo != null` 평가 → true → cold-first 분기 진입 (cursorNo가 명시되면 페이지네이션 의도로 간주)

#### R1.3: cursorNo 없으면 PolicyResolver의 loadAllPolicy 적용

- **Given**: PolicyResolver.resolveLoadAllPolicy('chat') = 'hot-first'
- **When**: `dcs.loadAll({ channelId: 'ch-1', limit: 50 })` 호출 (cursorNo 없음)
- **Then**: Hot.loadAll 먼저 호출 (PR #286 명세 그대로 동작)

---

### R2: Eviction 인터페이스 + 호출 계약 (D2, D3, D8, D10 fulfills)

#### R2.1: EvictionStrategy 인터페이스 export

- **Given**: 앱팀이 `import { EvictionStrategy } from '@chatic/data'`
- **When**: TypeScript 컴파일
- **Then**: 3-훅 시그니처(`onStartup`, `onAfterWrite<T>(type, items, hot)`, `onQuotaExceeded`) 노출, items는 `CacheModelOf<T>[]` 타입 (generic 보장)

#### R2.2: CapacityPolicy 인터페이스 export (generic type-safe)

- **Given**: 앱팀이 CapacityPolicy 구현체 작성
- **When**: `getGroupKey<'chat'>('chat', item)` 호출
- **Then**: item이 `CacheModelOf<'chat'>` 타입으로 추론, 강제 캐스팅 불필요

#### R2.3: onStartup은 factory가 DCS 생성 직후 1회 호출

- **Given**: factory(`getCacheStorage('chat', context)`) 호출, evictionStrategy 주입됨
- **When**: factory 내부에서 DCS 인스턴스 생성 직후
- **Then**: `evictionStrategy.onStartup(hot)` fire-and-forget 호출, 결과를 await 안 함 (앱 시작 지연 방지)

#### R2.4: onAfterWrite는 Cold.save → Hot.save 완료 후 chain

- **Given**: DCS에 evictionStrategy 주입됨
- **When**: `dcs.saveAll([item1, item2])` 호출 → Cold.saveAll 성공 → Hot.saveAll 성공
- **Then**: Hot.saveAll 완료된 다음 `evictionStrategy.onAfterWrite('chat', [item1, item2], hot)` 호출 (병렬 dispatch 아님)

#### R2.5: 빈 items면 onAfterWrite 호출 생략

- **Given**: DCS, evictionStrategy 주입됨
- **When**: `dcs.saveAll([])` 호출
- **Then**: onAfterWrite **호출되지 않음** (DCS 책임)

#### R2.6: onQuotaExceeded는 Hot 에러가 QuotaExceededError류일 때 호출

- **Given**: Hot.save가 `DOMException('QuotaExceededError')` reject
- **When**: DCS.save 진행 중 Hot 에러 catch
- **Then**: `evictionStrategy.onQuotaExceeded('chat', hot)` 호출, Reporter에 `tier='hot'` 기록, save 자체는 성공 처리 (Cold는 이미 완료), **`onAfterWrite`는 호출되지 않음** (Hot에 반영 안 됐으므로 cap 검사 무의미)

#### R2.6.1: Hot.save 실패 시 onAfterWrite 호출 생략

- **Given**: Cold.save 성공, Hot.save가 임의의 에러(QuotaExceededError 외 포함)로 reject
- **When**: DCS.saveAll 진행
- **Then**: Reporter에 `tier='hot'` 기록, **`onAfterWrite` 호출되지 않음** (cap 검사 대상이 실제로 Hot에 들어가지 않았기 때문), DCS.saveAll은 정상 resolve (Hot=파생캐시 원칙)

#### R2.7: \_\_cacheMeta에 lastAccessedAt 추가, load 시점 pending Map 기록

- **Given**: IndexedDBAdapter 확장됨, `createTtlMeta()` 결과에 `lastAccessedAt` 포함
- **When**: `dcs.load('item-1')` 호출 (Hot hit)
- **Then**: in-memory pending Map에 `{ 'item-1': now }` 기록, **IDB write는 발생하지 않음**

#### R2.8: pending Map flush — Trigger A (onAfterWrite 직전)

- **Given**: pending Map에 N개 항목 누적, `isFlushing = false`
- **When**: 다음 onAfterWrite 호출 직전
- **Then**: pending Map의 N개 항목을 IDB에 batch write, `isFlushing` 토글로 중복 진입 방지

#### R2.9: Eviction 자체 실패 = save 성공으로 처리

- **Given**: evictionStrategy.onAfterWrite가 throw (IDB transaction abort 등)
- **When**: DCS.saveAll에서 catch
- **Then**: Reporter에 `tier='eviction'` 기록, DCS.saveAll은 정상 resolve (Cold 성공이 우선)

#### R2.10: Eviction 중 active read 충돌 = Hot miss → Cold fallback (D8 fulfills)

- **Given**: evictionStrategy가 Hot에서 chat 채널의 오래된 100개 batch 삭제 진행 중
- **When**: 동시에 `dcs.load('msg-old')` 호출 (방금 evict된 id)
- **Then**: Hot.load는 null 반환 (이미 삭제됨), DCS가 Cold.load fallback → 결과 반환 → background warm-up. 별도 race 처리 코드 없음 (기존 Hot/Cold fallback 흐름이 동시성을 자연 처리)

---

### R3: Stampede 가드 (D4, D6 fulfills)

#### R3.1: 동시 loadAll 시 in-flight Promise 공유

- **Given**: DCS 인스턴스, 빈 in-flight Map
- **When**: `Promise.all([dcs.loadAll(opts), dcs.loadAll(opts)])` 동시 호출 (같은 opts)
- **Then**: Cold.loadAll(또는 Hot.loadAll)이 **1회만** 호출, 두 caller 모두 같은 Promise 결과 받음

#### R3.2: settled(reject 포함) 시 in-flight Map에서 즉시 제거

- **Given**: in-flight Map에 `{ key1: { promise, startedAt } }` 있음, promise reject
- **When**: 다음 동일 opts loadAll 호출
- **Then**: 새 Promise 생성, Cold.loadAll 다시 호출 (재시도 허용)

#### R3.3: STAMPEDE_TIMEOUT_MS 경과 시 강제 timeout

- **Given**: in-flight Map에 `{ promise, startedAt: now-6000 }` (timeout=5000ms 초과)
- **When**: 새 loadAll 호출 또는 주기 정리 tick
- **Then**: 해당 Promise 강제 제거, caller는 `StampedeTimeoutError` reject 받음

#### R3.4: StampedeTimeoutError가 caller에 식별 가능하게 전파

- **Given**: STAMPEDE_TIMEOUT_MS 초과 발생
- **When**: caller가 `dcs.loadAll(opts)` await 후 catch
- **Then**: `err instanceof StampedeTimeoutError === true`, `err.queryKey` 및 `err.elapsedMs` 접근 가능

#### R3.5: save/delete는 stampede 가드 적용 없음

- **Given**: DCS, 같은 id로 동시 save 2회
- **When**: `Promise.all([dcs.save('1', a), dcs.save('1', b)])`
- **Then**: Cold.save가 2회 호출됨 (가드 없음, mutation은 caller 책임)

---

### R4: Policy 주입 + 조회 (D5, D7, D11 fulfills)

#### R4.1: factory가 prod에서 PolicyResolver 미주입 시 throw

- **Given**: `process.env.NODE_ENV === 'production'`
- **When**: `getCacheStorage('chat', context)` 호출 (PolicyResolver 옵션 미주입)
- **Then**: Error throw, 메시지에 "PolicyResolver 필수" 포함

#### R4.2: factory가 dev에서 PolicyResolver 미주입 시 warn + DefaultPolicyResolver 사용

- **Given**: `process.env.NODE_ENV !== 'production'`
- **When**: 동일 호출
- **Then**: console.warn 1회 출력, DCS 생성 성공, `DefaultPolicyResolver.resolveReadPolicy(any)` = `'cold-first'`

#### R4.3: PolicyResolver 주입 시 type별 정책 적용

- **Given**: 커스텀 PolicyResolver 주입 (chat='hot-first', join='cold-first')
- **When**: `dcs.load('id')` (type='chat') vs `dcs.load('id')` (type='join')
- **Then**: 각각 PolicyResolver가 반환한 정책에 따라 분기

#### R4.4: DCS inspector는 Readonly 반환

- **Given**: 정책 주입된 DCS
- **When**: `dcs.getPolicyResolver().resolveReadPolicy('chat')`
- **Then**: 정상 반환, TypeScript 컴파일러가 mutation 시도(`dcs.getPolicyResolver() = ...`) 차단

#### R4.5: stableHash는 sorted-key JSON 생성

- **Given**: opts1 = `{ a: 1, b: 2 }`, opts2 = `{ b: 2, a: 1 }`
- **When**: `stableHash(opts1)` vs `stableHash(opts2)`
- **Then**: 동일한 string 반환 (key 정렬 후 직렬화)

#### R4.6: 비-serializable options 시 throw

- **Given**: `opts = { date: new Date() }`
- **When**: `dcs.loadAll(opts)` 호출 → 내부 stableHash 호출
- **Then**: Error throw, caller가 인지 가능

---

### R5: 에러 처리 통합 — CacheErrorReporter (D9 fulfills)

#### R5.1: Reporter 인터페이스 export

- **Given**: 앱팀이 `import type { CacheErrorReporter } from '@chatic/data'`
- **When**: TypeScript 컴파일
- **Then**: sync 시그니처 `(error, context) => void` 노출, `context.tier` 4종 (hot/cold/eviction/stampede), `operation` 9종

#### R5.2: Hot 에러 시 reporter 호출

- **Given**: reporter 주입됨, Hot.load가 throw
- **When**: `dcs.load('1')` 호출
- **Then**: `reporter(err, { tier: 'hot', operation: 'load', type: 'chat' })` 호출, Cold fallback 진행

#### R5.3: Reporter 자체가 throw해도 DCS 동작 영향 없음

- **Given**: reporter가 throw하는 잘못된 구현체
- **When**: Hot 에러 발생 → reporter 호출
- **Then**: DCS 내부 try/catch로 reporter 오류 흡수, Cold fallback 정상 진행, caller는 정상 결과 받음

#### R5.4: Eviction/Stampede 에러도 같은 인터페이스로 기록

- **Given**: reporter 주입됨
- **When**: (a) onAfterWrite throw, (b) stampede timeout 발생
- **Then**: 각각 `tier='eviction', operation='eviction'`, `tier='stampede', operation='stampede-timeout'`로 reporter 호출

## Tasks

> **사전 컨벤션**: 본 spec의 다수 Task는 `DynamicCacheStorage.ts`(PR #286 신규 작성 파일)를 공동 수정한다. 동일 파일은 commit 분리하되 단일 PR로 묶기 권장. T8(테스트)은 각 task의 acceptance를 보장하기 위해 task별 부속 테스트를 함께 작성하는 것을 베이스라인으로 하고, T8은 통합/통합 시나리오에 집중.

### T1: 공통 타입·Error class 정의 [infra, horizontal]

- **Fulfills**: R2.1, R2.2, R5.1 (인터페이스 export)
- **Depends on**: (none — PR #286 머지 후 시작)
- **변경 파일**:
    - `libs/data/src/data/local/storages/dynamicCacheTypes.ts` (신규)
- **내용**:
    - `EvictionStrategy` interface (3-훅, generic items)
    - `CapacityPolicy` interface (getLimit, getGroupKey generic)
    - `PolicyResolver` interface
    - `CacheErrorReporter` type + `CacheErrorOperation`/`CacheErrorTier` union
    - `StampedeTimeoutError` class
    - `DynamicCacheStorageOptions` 확장 시그니처 (4개 옵션 추가)

### T2: Default 구현체 + stableHash 유틸 [infra, horizontal]

- **Fulfills**: R4.5, R4.6 (stableHash 부분) + Default fallback (R4.2 일부)
- **Depends on**: T1
- **변경 파일**:
    - `libs/data/src/data/local/storages/defaultPolicies.ts` (신규)
    - `libs/data/src/data/local/storages/stableHash.ts` (신규)
- **내용**:
    - `DefaultPolicyResolver` — 모든 type 'cold-first' 반환
    - `DefaultEvictionStrategy` — 3-훅 모두 no-op
    - `DefaultCapacityPolicy` — `getLimit()` null, `getGroupKey()` undefined
    - `stableHash(value: unknown): string` — sorted-key JSON 직렬화, 비-serializable throw

### T3: \_\_cacheMeta + lastAccessedAt 확장 [adapter, horizontal]

- **Fulfills**: R2.7의 메타 필드 부분 (DCS pending Map 동작은 T6에서)
- **Depends on**: (none) — DCS와 무관, 어댑터 단독 변경
- **변경 파일**:
    - `libs/data/src/data/local/storages/utils.ts` (`createTtlMeta` 확장)
    - `libs/data/src/data/local/storages/IndexedDBAdapter.ts` (저장/조회 시 메타 처리)
    - `libs/data/src/data/local/storages/types.ts` (`CacheTtlMeta` 타입에 `lastAccessedAt: number`)
- **내용**:
    - `createTtlMeta(type)` → `{ lastSyncedAt, expiresAt, lastAccessedAt: now }`
    - IndexedDBAdapter는 메타를 그대로 read/write (기존 동작 + 필드 추가만)

### T4: DCS: cursorNo 분기 + Stampede 가드 [DCS internal]

- **Fulfills**: R1.1, R1.2, R1.3, R3.1, R3.2, R3.3, R3.4, R3.5
- **Depends on**: T1, T2 (StampedeTimeoutError + stableHash)
- **변경 파일**:
    - `libs/data/src/data/local/storages/DynamicCacheStorage.ts`
- **내용**:
    - `loadAll(options)` 진입부에서 `options?.cursorNo != null` → cold-first 강제 분기
    - 인스턴스별 `private inflight: Map<string, { promise, startedAt }>`
    - load: id를 key, loadAll: `stableHash(options)`를 key
    - settled finally 시 Map 삭제 (DataLoader 패턴)
    - 등록 시 + 별도 timer로 `now - startedAt > 5000`인 항목 강제 timeout
    - timeout 시 `StampedeTimeoutError` reject + Reporter 호출
    - save/delete는 가드 적용 안 함 (R3.5)

### T5: DCS: PolicyResolver 주입 + inspector [DCS options]

- **Fulfills**: R4.1, R4.2, R4.3, R4.4
- **Depends on**: T1, T2
- **변경 파일**:
    - `libs/data/src/data/local/storages/DynamicCacheStorage.ts` (constructor + getter)
- **내용**:
    - `DynamicCacheStorageOptions`에 `policyResolver?`, `evictionStrategy?`, `capacityPolicy?`, `reporter?` 수용 (시그니처 T1)
    - constructor에서 미주입 시 Default\* 구현체 적용
    - `getPolicyResolver(): Readonly<PolicyResolver>` 등 4개 inspector getter
    - 기존 hard-coded `defaultReadPolicies/defaultLoadAllPolicies` 제거, PolicyResolver 위임

### T6: DCS: Eviction 호출 계약 + Reporter 통합 + pending Map [DCS internal]

- **Fulfills**: R2.3 (factory 호출은 T7), R2.4, R2.5, R2.6, R2.6.1, R2.7 (pending Map 동작), R2.8, R2.9, R2.10, R5.2, R5.3, R5.4
- **Depends on**: T1, T3 (lastAccessedAt 메타), T5 (옵션 수용)
- **변경 파일**:
    - `libs/data/src/data/local/storages/DynamicCacheStorage.ts` (save/saveAll/load 흐름)
- **내용**:
    - save/saveAll: `coldSave → hotSave (성공 시) → onAfterWrite(items, hot)` chain
    - Hot 실패 시 `onAfterWrite` 호출 X (R2.6.1)
    - Hot 에러가 `QuotaExceededError`류면 `onQuotaExceeded` 호출
    - load: hit 시 in-memory `pendingAccess: Map<id, timestamp>` 기록
    - Trigger A: onAfterWrite 직전 `isFlushing` 플래그 보호된 batch flush
    - 모든 reporter 호출은 `safeReport(err, context)` 헬퍼로 try/catch 보호
    - 빈 items면 `onAfterWrite` 생략

### T7: Factory: runtime assertion + onStartup 호출 [factory]

- **Fulfills**: R4.1 (assertion), R4.2 (warn + default), R2.3 (factory의 onStartup 호출)
- **Depends on**: T1, T2, T5
- **변경 파일**:
    - `apps/web/src/app/shared/data/localFactory.ts`
    - `apps/web/src/app/shared/data/cacheStorageStrategies.ts`
- **내용**:
    - `HotColdCacheStorageStrategy.create`에서 PolicyResolver 미주입 + prod이면 throw, dev이면 console.warn 1회 + Default 적용
    - DCS 인스턴스 생성 직후 `evictionStrategy.onStartup(hot)` fire-and-forget 호출
    - onStartup 실패 시 Reporter 호출 (tier='eviction', operation='eviction')

### T8: 단위 테스트 [test]

- **Fulfills**: R0, R1~R5 통합 검증 (각 task의 acceptance를 종합)
- **Depends on**: T1, T2, T3, T4, T5, T6, T7
- **변경 파일**:
    - `libs/data/src/data/local/storages/DynamicCacheStorage.test.ts` (신규)
    - `libs/data/src/data/local/storages/stableHash.test.ts` (신규)
- **내용**:
    - **stableHash.test.ts**: sorted-key 일관성, 비-serializable throw 케이스
    - **DynamicCacheStorage.test.ts**:
        - PR #286 7.2의 R1~R8, W1~W3, D1~D4, I1~I5 시나리오 (기존 명세)
        - 본 spec 추가 시나리오:
            - R1.1~R1.3 (cursorNo 분기)
            - R2.4~R2.6.1, R2.7~R2.10 (eviction 호출 계약 + 메타 + 충돌)
            - R3.1~R3.5 (stampede)
            - R4.1~R4.6 (factory assertion, inspector)
            - R5.2~R5.4 (reporter)
    - Mock: `MockCacheStorage`(PR #286 패턴), `MockEvictionStrategy`, `MockCapacityPolicy`, `MockPolicyResolver`, `MockReporter`(jest.fn)
    - **각 task별 부속 테스트는 해당 task PR에 포함**: T4 cursor/stampede만 검증하는 mini-test, T7 factory assertion 단독 test 등. T8은 통합 시나리오.

### T9: 문서 [docs, horizontal]

- **Fulfills**: 외부 가시성 (Known Gaps "인터페이스 freeze" 항목)
- **Depends on**: (none) — 병렬
- **변경 파일**:
    - `docs/specs/cache/hot-cold-cache-hardening.md` (신규 — 본 spec.md 복사)
    - `docs/specs/cache/hot-cold-cache-strategy.md` (PR #286 9절 업데이트)
- **내용**:
    - 본 spec 파일을 `docs/specs/cache/` 아래로 복사하여 PR로 공유 가능하게
    - PR #286 9절 "향후 확장"에서 본 spec이 다룬 항목(TTL, eviction, stampede) 마커 추가: "→ hot-cold-cache-hardening.md 참조"
    - PR 본문에 본 spec 링크 + 앱팀에게 TBD-1~6 후속 PR 요청

## External Dependencies

### Pre-work

- PR #286 (`docs/specs/cache/hot-cold-cache-strategy.md` + 기본 `DynamicCacheStorage.ts` skeleton) 머지 완료. 본 spec은 그 위에 build.
- 명세에 동의한 앱팀(shy-lemon) 일정 협의: 본 spec 인터페이스 freeze 후 구현체(PolicyResolver, EvictionStrategy, CapacityPolicy) 작성 PR 일정 합의.

### Post-work

- **앱팀에 구현체 작성 PR 요청**: TBD-1(cap 수치), TBD-2(type별 정책), TBD-3(getGroupKey for chat), TBD-4(onStartup 실행 방식). 본 spec의 TBD-1~6이 후속 PR 범위.
- **운영 모니터링 연동**: 현재 Reporter default = `console.warn`. Sentry/DataDog 등 외부 수집기 연동은 별도 spec.
- **PR #286 명세 문서 업데이트**: 본 spec 승인 후 PR #286의 `hot-cold-cache-strategy.md` 9절(향후 확장)에서 본 spec이 다룬 항목 제거 및 본 spec 링크 추가.
- **NativeDBAdapter bridge 안정성** (Non-goals 항목): 별도 spec으로 분리. 본 spec D6에서 책임 분리 명시했으나 실제 retry 구현은 미정.
