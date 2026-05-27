# Hot/Cold Cache Hardening — Interfaces

> 본 spec이 정의하는 5개 인터페이스 + 1개 Error class + 1개 유틸 함수의 명세. 앱팀 구현체는 이 시그니처를 따른다.

---

## 0. 한눈에 보기

```typescript
// 신규 인터페이스
export interface EvictionStrategy { ... }
export interface CapacityPolicy { ... }
export interface PolicyResolver { ... }
export type CacheErrorReporter = (...) => void;

// 신규 클래스/유틸
export class StampedeTimeoutError extends Error { ... }
export function stableHash(value: unknown): string;

// 기존 옵션 확장
export interface DynamicCacheStorageOptions<TType extends CacheType> {
    // ... PR #286 기존 필드 ...
    policyResolver?: PolicyResolver;
    evictionStrategy?: EvictionStrategy;
    capacityPolicy?: CapacityPolicy;
    reporter?: CacheErrorReporter;
}
```

전부 **선택적(`?`)** 주입. 미주입 시 Default 구현체로 fallback (단 prod에서 PolicyResolver 미주입은 throw — §6 참조).

---

## 1. `EvictionStrategy`

Hot 캐시 eviction 정책. 3개 훅으로 구성. 본 spec은 호출 시점/순서만 정의하고, 실제 TTL/LRU/FIFO 로직은 앱팀 구현체 자유.

### 시그니처

```typescript
import type { CacheType, CacheModelOf, CacheStorage } from '@chatic/data';

export interface EvictionStrategy {
    /** Startup TTL sweep 등. DCS 생성 직후 1회 호출 */
    onStartup(hot: CacheStorage<any>): Promise<void>;

    /** per-type cap 검사 등. items 전체 전달 → CapacityPolicy.getGroupKey 호출 가능 */
    onAfterWrite<T extends CacheType>(type: T, items: CacheModelOf<T>[], hot: CacheStorage<T>): Promise<void>;

    /** 비상 cleanup. Hot 에러가 QuotaExceededError류일 때 호출 */
    onQuotaExceeded(type: CacheType, hot: CacheStorage<any>): Promise<void>;
}
```

### 호출 계약 (누가 언제)

| 훅                | 호출 주체                                      | 시점                                                                             | 비동기 패턴                                          |
| ----------------- | ---------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `onStartup`       | factory (`HotColdCacheStorageStrategy.create`) | DCS 인스턴스 생성 직후 1회                                                       | **fire-and-forget** (await 안 함, 앱 시작 지연 방지) |
| `onAfterWrite`    | DCS                                            | `Cold.save` 성공 → **`Hot.save` 완료 await → onAfterWrite 호출** (Promise chain) | 백그라운드 chain                                     |
| `onQuotaExceeded` | DCS                                            | Hot 에러 catch 시 `QuotaExceededError`류로 판정되면                              | fire-and-forget                                      |

### 추가 명세

- **Hot.save 실패 시 `onAfterWrite` 호출 X** — Hot에 실제 반영 안 됐으므로 cap 검사 무의미
- **`items.length === 0`이면 `onAfterWrite` 호출 X** — DCS가 책임지고 생략
- **다중 호출 race 안전성**: DCS는 동시 saveAll에 대한 onAfterWrite를 직렬화하지 않음. **EvictionStrategy 구현체가 자체 mutex/queue로 안전성 보장**
- **Eviction 트랜잭션 권장**: batch 삭제는 단일 IDB transaction으로 묶을 것 (transaction 외부 partial state 노출 최소화). 권장 batch size 500/transaction 이하 (IDB transaction timeout 방지)
- **호출 실패 처리**: throw 시 DCS는 Reporter에 `tier='eviction'` 기록 후 save는 정상 resolve (Hot=파생캐시 원칙)

### Default 구현체

`DefaultEvictionStrategy`: 3-훅 모두 no-op. 주입 안 하면 eviction 없음 = Hot 무한 증가. 운영 사용 금지.

---

## 2. `CapacityPolicy`

Type별 cap 수치와 grouping 키 추출을 위한 조회 인터페이스. `EvictionStrategy` 구현체가 내부에서 사용 (DCS 직접 호출 안 함).

### 시그니처

```typescript
export interface CapacityPolicy {
    /** 해당 type의 최대 항목 수. null이면 cap 없음 */
    getLimit(type: CacheType, groupKey?: string): number | null;

    /**
     * item을 그룹 키로 매핑. undefined면 전체 LRU.
     * Generic으로 item 타입 안전 보장.
     */
    getGroupKey<T extends CacheType>(type: T, item: CacheModelOf<T>): string | undefined;
}
```

### 사용 예시 (앱팀 구현체 가이드)

```typescript
class AppCapacityPolicy implements CapacityPolicy {
    getLimit(type: CacheType, _groupKey?: string): number | null {
        switch (type) {
            case 'chat':
                return 1000; // 채널당 1000개
            case 'channel':
                return 500;
            case 'user':
                return 500;
            default:
                return null; // cap 없음
        }
    }

    getGroupKey<T extends CacheType>(type: T, item: CacheModelOf<T>): string | undefined {
        if (type === 'chat') return (item as CacheModelOf<'chat'>).channelId;
        return undefined; // chat 외에는 전체 LRU
    }
}
```

### Default 구현체

`DefaultCapacityPolicy`: `getLimit` = `null` (무한), `getGroupKey` = `undefined`. → 사실상 eviction 없음.

---

## 3. `PolicyResolver`

Type별 readPolicy/loadAllPolicy를 외부에서 주입 가능하게 추상화. PR #286의 `defaultReadPolicies` 하드코딩 대체.

### 시그니처

```typescript
import type { CacheReadPolicy, CacheType } from '@chatic/data';

export interface PolicyResolver {
    resolveReadPolicy(type: CacheType): CacheReadPolicy; // 'hot-first' | 'cold-first'
    resolveLoadAllPolicy(type: CacheType): CacheReadPolicy;
}
```

### 사용 예시

```typescript
class AppPolicyResolver implements PolicyResolver {
    resolveReadPolicy(type: CacheType): CacheReadPolicy {
        return type === 'join' ? 'cold-first' : 'hot-first'; // 예시
    }
    resolveLoadAllPolicy(type: CacheType): CacheReadPolicy {
        return type === 'chat' ? 'hot-first' : 'cold-first'; // 예시
    }
}
```

### chat loadAll cursorNo 분기 (Hard-coded, PolicyResolver 우회)

`DynamicCacheStorage.loadAll(options)`는 `options?.cursorNo != null`이면 **PolicyResolver 결과 무시하고 강제 cold-first**. cursor 페이지네이션 시 Hot의 partial data 반환 버그 방지. `cursorNo === 0`도 cold-first (페이지네이션 명시 의도).

### Default 구현체 + 운영 경고

`DefaultPolicyResolver`: **모든 type에 `'cold-first'` 반환** (PR #286의 hot-first 일괄과 정반대지만 정합성 우선 fallback).

> **⚠️ 운영 사용 금지**: factory(`HotColdCacheStorageStrategy.create`)에서 PolicyResolver 미주입 시:
>
> - `process.env.NODE_ENV === 'production'` → **throw** (CI/통합 테스트가 catch)
> - 그 외 (dev/test) → `console.warn` 1회 + `DefaultPolicyResolver` 적용

---

## 4. `CacheErrorReporter`

Hot/Cold/Eviction/Stampede 4개 tier의 에러를 단일 인터페이스로 통합. PR #286의 `onHotError`는 이 인터페이스의 `tier='hot'` 케이스로 흡수.

### 시그니처

```typescript
export type CacheErrorTier = 'hot' | 'cold' | 'eviction' | 'stampede';

export type CacheErrorOperation =
    | 'load'
    | 'loadAll'
    | 'save'
    | 'saveAll'
    | 'delete'
    | 'deleteAll'
    | 'clearAll'
    | 'eviction'
    | 'stampede-timeout';

export type CacheErrorReporter = (
    error: unknown,
    context: {
        tier: CacheErrorTier;
        operation: CacheErrorOperation;
        type?: CacheType;
    }
) => void; // sync, throw 금지
```

### 호출 계약

- **sync 시그니처** (Promise 반환 안 함). 비동기 작업 필요 시 Reporter 내부에서 fire-and-forget.
- **throw 금지** — 단, 방어 차원에서 **DCS는 Reporter 호출을 try/catch로 보호** (Reporter 자체 오류가 DCS 동작에 영향 주지 않음):
    ```typescript
    private safeReport(error: unknown, context: CacheErrorContext): void {
        try {
            this.reporter?.(error, context);
        } catch {
            // 의도적 무시 — reporter 오류는 silent
        }
    }
    ```
- 호출 빈도가 높을 수 있으므로 Reporter 내부 throttle/sampling은 구현체 책임.

### Default 구현체

`console.warn` (PR #286 7.3 현재 구현 유지).

### 4-tier 에러 발생 시나리오

| Tier       | 발생 상황                                                       | operation 예시       |
| ---------- | --------------------------------------------------------------- | -------------------- |
| `hot`      | Hot.load/save/delete throw                                      | 모든 CRUD operation  |
| `cold`     | Cold.\* throw (현재는 caller에 전파, reporter는 부가 기록)      | 모든 CRUD operation  |
| `eviction` | `EvictionStrategy.onStartup/onAfterWrite/onQuotaExceeded` throw | `'eviction'`         |
| `stampede` | in-flight Promise가 `STAMPEDE_TIMEOUT_MS` 초과                  | `'stampede-timeout'` |

---

## 5. `StampedeTimeoutError`

Stampede 가드의 timeout error를 caller가 식별할 수 있게 클래스로 분리.

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

- caller는 `error instanceof StampedeTimeoutError`로 구분 가능.
- Reporter에는 `{ tier: 'stampede', operation: 'stampede-timeout' }`로 기록.
- 기본 `STAMPEDE_TIMEOUT_MS = 5000` (운영 측정 후 조정 가능, TBD-6).

---

## 6. `stableHash(value)` 유틸

Stampede 가드의 query key 생성에 사용. options를 sorted-key JSON으로 직렬화한 string 반환.

### 시그니처

```typescript
export function stableHash(value: unknown): string;
```

### 동작

- 객체의 키를 정렬 후 JSON 직렬화 → 순서 무관 동치성 보장
- `undefined` 필드는 정렬 전에 제거 (missing key와 동치화)
- MVP: 별도 hash 함수 없이 sorted-key JSON 그 자체를 key로 사용 (충돌 0, 단 key 길이 김)
- 운영 중 메모리 부담 측정되면 SHA-256 truncated 등으로 교체 가능 (별도 spec)

### Options 제약 (중요)

본 spec의 모든 `CacheQueryOf<TType>` 필드는 다음 제약을 따라야 함:

| 허용                          | 금지                                   |
| ----------------------------- | -------------------------------------- |
| string, number, boolean, null | undefined (missing과 동치 처리됨)      |
| 배열, plain object            | Date, Map, Set, Function, circular ref |

위반 시 `stableHash`가 throw → caller가 인지 가능. options validation 책임은 caller (DCS 보다 위 레이어).

---

## 7. `DynamicCacheStorageOptions` 확장

PR #286의 옵션에 본 spec이 추가하는 4개 필드:

```typescript
export interface DynamicCacheStorageOptions<TType extends CacheType> {
    // ── PR #286 기존 ──
    type?: TType;
    readPolicy?: CacheReadPolicy;
    loadAllPolicy?: CacheReadPolicy;
    warmupChunkSize?: number;
    onHotError?: (error, context) => void; // → 본 spec의 reporter로 흡수 권장

    // ── 본 spec 추가 ──
    policyResolver?: PolicyResolver; // 미주입 + prod = throw
    evictionStrategy?: EvictionStrategy; // 미주입 = no-op
    capacityPolicy?: CapacityPolicy; // 미주입 = 무한
    reporter?: CacheErrorReporter; // 미주입 = console.warn
}
```

### DCS Inspector (테스트용 read-only)

```typescript
class DynamicCacheStorage<TType extends CacheType> {
    getPolicyResolver(): Readonly<PolicyResolver>;
    getCapacityPolicy(): Readonly<CapacityPolicy>;
    getEvictionStrategy(): Readonly<EvictionStrategy>;
    getReporter(): Readonly<CacheErrorReporter> | undefined;
}
```

- TypeScript `Readonly<T>` 반환으로 caller가 메서드 호출만 가능 + 객체 mutation 차단
- 런타임 강제는 `Object.freeze` (테스트 환경 한정, 선택)
- 테스트에서 주입된 정책 검증 가능, mutation은 생성 시점만

---

## 8. 인터페이스 freeze 정책

본 spec **승인 시점**에 위 5종(EvictionStrategy / CapacityPolicy / PolicyResolver / CacheErrorReporter / DynamicCacheStorageOptions 추가 필드) 시그니처는 freeze. 변경 필요 시 별도 spec.

이유: 앱팀이 후속 PR로 구현체 작성 중 인터페이스가 흔들리면 작업 중복 발생.

---

## 관련 문서

- [`./overview.md`](./overview.md) — 책임 분리 + 앱팀 체크리스트
- [`./decisions.md`](./decisions.md) — 각 인터페이스 결정의 rationale + 대안 비교
