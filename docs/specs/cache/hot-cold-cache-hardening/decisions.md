# Hot/Cold Cache Hardening — Decisions & Rationale

> 본 spec의 11개 결정과 그 근거. 대안 비교 포함. 리뷰어/장기 관리자용.

---

## Constraints (전체 적용)

| #   | 제약                                                                   | 이유                                                                          |
| --- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| C1  | 본 spec은 **App WebView 환경(`HotColdCacheStorageStrategy`)에만 적용** | 웹 브라우저(`IndexedDbOnlyStrategy`)는 변경 없음                              |
| C2  | 기존 `CacheStorage<TType>` 인터페이스(PR #286)는 변경 금지             | 본 spec 추가 인터페이스는 `DynamicCacheStorageOptions`로 주입                 |
| C3  | `IndexedDBAdapter`/`NativeDBAdapter` public API 변경 금지              | `__cacheMeta` 필드 확장은 어댑터 내부 변경만                                  |
| C4  | PR #286 핵심 원칙 5가지 유지                                           | Cold=SoT, Hot=파생, 전략 객체 조립, 인터페이스 투명성, delete stale 방지 우선 |
| C5  | `src/cores/` 하위 수정 금지                                            | lemon-rules                                                                   |
| C6  | `CacheQueryOf<TType>` options는 JSON-serializable primitive만 허용     | stableHash가 throw 가능 (D7)                                                  |
| C7  | factory에서 PolicyResolver 미주입 + prod = throw                       | 안전 fallback의 운영 사용 금지 (D5)                                           |
| C8  | 본 spec 승인 시점에 D2/D3/D5/D7/D9 인터페이스 시그니처 freeze          | 앱팀 후속 PR 작업 안정성                                                      |

---

## Decisions

### D1: chat loadAll의 `cursorNo` 기반 policy 분기

**결정**: `DynamicCacheStorage.loadAll(options)`는 `options?.cursorNo != null`이면 PolicyResolver 결과 무시하고 강제 cold-first 분기. `cursorNo === 0`도 cold-first (페이지네이션 명시 의도).

**근거**: PR #286은 chat을 `loadAllPolicy='hot-first'`로 일괄 설정하나, ChatQueryExecutor의 cursor 페이지네이션 쿼리에서 Hot의 partial data가 incomplete page를 반환하는 버그 존재. 예: Hot에 chat_no 1~50만 있는데 cursor=500, limit=50 요청 시 Hot에서 1~50 반환(결과 > 0) → Cold fallback 안 함 → 실제 450~499 누락.

**필드명**: PagingMeta의 정식 필드명은 `cursorNo` (`cursor` 별칭 추가 금지 — 단일 진실 원천).

**대안 검토**:
| 대안 | 기각 사유 |
|------|-----------|
| chat loadAll 전면 cold-first | hot-first의 bridge 절감 이점 포기 |
| Hot length<limit 시 Cold fallback | 마지막 페이지 정상 케이스에서도 Cold 호출 발생 |

---

### D2: `EvictionStrategy` 3-훅 + 호출 계약

**결정**: 정책 자체는 도메인 결정이므로 본 spec은 훅 인터페이스 + 호출 계약만 정의. 구현체는 앱팀 PR.

**호출 계약**:
| 훅 | 호출 주체 | 시점 | 동기 패턴 |
|------|-----------|------|-----------|
| `onStartup` | factory | DCS 생성 직후 1회 | fire-and-forget |
| `onAfterWrite` | DCS | Cold.save 성공 → Hot.save 완료 await → 호출 (Promise chain) | 백그라운드 chain |
| `onQuotaExceeded` | DCS | Hot 에러가 QuotaExceededError류일 때 | fire-and-forget |

**순서 보장 근거**: onAfterWrite가 Hot.save 완료 후 호출돼야 cap 검사 대상이 실제 Hot에 반영된 상태. 병렬 dispatch면 신규 item 미반영 → 중복 평가 또는 미평가.

**Race 안전성**: DCS는 동시 onAfterWrite 직렬화 안 함. EvictionStrategy 구현체가 자체 mutex/queue로 보장. 이유: DCS 직렬화는 cap 검사 지연으로 일시적 over-cap; 구현체별 LRU/FIFO 전략에 따라 직렬화 필요 강도 달라 한 곳 강제 부적절.

**Eviction transaction 권장 (D8 연계)**: batch 삭제는 단일 IDB transaction으로 묶기. batch size 500/transaction 이하 (timeout 방지). 권장만, 강제 아님.

**대안 검토**:
| 대안 | 기각 사유 |
|------|-----------|
| 단일 `evict()` 메서드 | 시점 정보 손실 → 호출자가 매번 판단 |
| 정책 직접 명세 (TTL/LRU 등) | 도메인 결정 강요, 위임 원칙 위배 |
| `ids: string[]` 전달 | grouping/LRU 판단 불가 (item 전체 필요) |

---

### D3: `CapacityPolicy` (generic type-safe)

**결정**: type별 cap 수치/그룹핑 키 조회 인터페이스만 정의. `getGroupKey`는 generic으로 type-safe 보장.

**근거**: `item: unknown`은 구현체에서 강제 캐스팅 필요 → 버그 유발. `<T extends CacheType>(type: T, item: CacheModelOf<T>)`로 추론 보장.

**chat per-channel 표현**: `getGroupKey('chat', item)` = `item.channelId` 같은 형태로 한 채널이 cap 전체를 점유 못하게.

**대안 검토**:
| 대안 | 기각 사유 |
|------|-----------|
| `item: unknown` | type 안전성 상실 |
| `Record<CacheType, number>` | 그룹핑 표현 불가 |
| EvictionStrategy 안에 통합 | 단일 책임 위배 |

---

### D4: Stampede 가드 (DCS 인스턴스별 in-flight Map + TTL)

**결정**: `Map<queryKey, { promise, startedAt }>`을 DCS 인스턴스별 보유. load/loadAll만 가드, save/delete는 caller 책임. `STAMPEDE_TIMEOUT_MS = 5000` 기본값.

**Long-pending 누수 방지**: `now - startedAt > STAMPEDE_TIMEOUT_MS` 항목 강제 제거 → `StampedeTimeoutError` reject.

**Timeout 값 근거**: bridge 통신은 ms 단위. 30000ms는 사용자 체감 이미 실패; 1000ms 미만은 정상 long query 실패. 5000ms 합리적 baseline (TBD-6 실측 후 조정).

**대안 검토**:
| 대안 | 기각 사유 |
|------|-----------|
| Type별 싱글톤 가드 | 다른 cid/uid 스코프 충돌 |
| load 제외 | 단건 동시 호출 보호 누락 |
| save/delete 포함 | mutation은 caller 의도, 가드 의미 약함 |
| timeout 없음 | unhandled long-pending Promise 누수 |

---

### D5: `PolicyResolver` (Default = 전부 cold-first, runtime assertion)

**결정**: PR #286의 `defaultReadPolicies` 하드코딩 → 주입 가능한 resolver 인터페이스. baseline 권장값 없음(일괄 TBD). Default = 모든 type cold-first (정합성 우선 안전 fallback). 운영 미주입 시 prod throw.

**Runtime assertion 구현**:

```typescript
if (!options.policyResolver) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('[DynamicCacheStorage] PolicyResolver 필수.');
    }
    console.warn(
        '[DynamicCacheStorage] PolicyResolver 미주입 — DefaultPolicyResolver(cold-first 일괄) 사용. 운영 전 PolicyResolver 주입 필수.'
    );
}
```

build-time 체크 대신 runtime assertion 채택 — 번들러 플러그인 추가 없이 즉시 적용, prod 빌드 첫 factory 호출에서 throw → CI catch.

**baseline 권장값 없음 이유**: 특정 type만 권장하면 위임 원칙 비대칭 (L2 critic 피드백). 단 사용자 정보: `Join.readNo`는 자주 변경됨(앱팀 분류 시 참고).

**대안 검토**:
| 대안 | 기각 사유 |
|------|-----------|
| `Record<CacheType, CacheReadPolicy>` 상수 export | 교체 시 import 변경 필요, OCP 위배 |
| DCS 옵션에 직접 매핑 받기 | type 추가/제거 시 옵션 시그니처 변경 |
| Default = hot-first 일괄 | PR #286과 동일, stale 위험 |
| baseline = `join: cold-first`만 권장 | 비대칭, critic 지적 |
| build-time check | 번들러 의존, 환경별 설정 부담 |

---

### D6: Warm-up 실패 처리 — DataLoader 패턴 (settled 즉시 해제)

**결정**: in-flight Map의 Promise는 settled(reject 포함) 시 즉시 제거 → 다음 호출은 새 Promise 생성 (재시도 허용). back-off는 NativeDBAdapter 내부 책임으로 분리.

**레이어 분리 검증**:
| 레이어 | 책임 | 다른 레이어 모름 |
|--------|------|------------------|
| DynamicCacheStorage | Hot/Cold 오케스트레이션 + Stampede 가드 | bridge/retry 모름 ✓ |
| NativeDBAdapter (Cold) | Cold I/O + bridge 안정성 (retry/back-off) | DCS 가드 모름 ✓ |
| IndexedDBAdapter (Hot) | Hot I/O + IDB 오류 처리 | 동일 ✓ |
| Repository | 캐시 miss → 네트워크 결정 | 캐시 내부 모름 ✓ |

**대안 검토**:
| 대안 | 기각 사유 |
|------|-----------|
| Negative caching (실패 결과 캐싱) | Cold 회복 후 정상화 지연 |
| Exponential back-off | bridge 미준비는 짧은 일시적 실패가 대부분, back-off 과한 보호 |
| DCS 내부 retry | 레이어 책임 혼합 |

---

### D7: `stableHash` 유틸 + options serializability 제약

**결정**: options를 키 정렬 후 JSON 직렬화한 string을 그대로 key로 사용 (MVP). 비-serializable 시 throw. options는 JSON-serializable primitive만 허용.

**MVP 구현**: 별도 hash 함수 없이 sorted-key JSON 그 자체를 key. 충돌 0 보장 (단 key 길이 김).

**충돌 정책**: sorted-key JSON 방식은 정확히 같은 options만 같은 key → 의도된 stampede 통합. 별도 hash(SHA-256 등) 도입 시 충돌 가능성 발생.

**교체 시점**: 운영 중 key 길이로 인한 Map 메모리 부담 측정되면 SHA-256 truncated 검토. 충돌 감지·대응은 별도 spec.

**Options validation 책임**: stableHash가 throw하면 caller가 정상 error path로 받음. options validation은 caller (DCS 보다 위 레이어).

**대안 검토**:
| 대안 | 기각 사유 |
|------|-----------|
| 단순 `JSON.stringify(options)` | 키 순서 차이로 동일 쿼리 다른 key |
| 명시적 필드 추출 | type별 schema 분기 필요로 복잡 |
| SHA-256 from start | 충돌 처리 필요, MVP 과잉 |

---

### D8: Eviction 중 active read 충돌 — 관대적 처리 + transaction 권장

**결정**: DCS 레이어에서 별도 동시성 제어 없음. 기존 Hot miss → Cold fallback → background warm-up 흐름이 자연 처리. EvictionStrategy 구현체는 batch 삭제를 단일 IDB transaction으로 묶기 권장.

**근거**: eviction으로 Hot 항목 삭제 → 후속 read는 Hot miss → Cold hit → 결과 반환 + warm-up. 사용자가 인지하는 추가 지연만 존재 (정합성 손상 없음).

**Transaction 권장 이유**: transaction 외부에서 partial state(절반만 삭제된 상태)가 read 결과로 노출되면 데이터 불일치 인지 가능. 단일 transaction이면 IDB isolation으로 "삭제 전" 또는 "삭제 후"만 관찰.

**대안 검토**:
| 대안 | 기각 사유 |
|------|-----------|
| DCS 동시성 제어 추가 | throughput 저하, Hot=파생캐시 원칙 위배 |
| Evict candidate 메타 마킹 | 메타 오버헤드 |

---

### D9: `CacheErrorReporter` 통합 인터페이스 + 호출 보호

**결정**: PR #286의 `onHotError`는 일반화된 `CacheErrorReporter`로 흡수. 4-tier (hot/cold/eviction/stampede) + 9-operation 통합. sync 시그니처 + DCS의 try/catch 호출 보호.

**호출 보호**:

```typescript
private safeReport(error: unknown, context: CacheErrorContext): void {
    try {
        this.reporter?.(error, context);
    } catch {
        // 의도적 무시 — reporter 오류는 silent
    }
}
```

Reporter 구현체 throw 시 DCS 동작 영향 차단. 호출 빈도 높을 수 있으므로 throttle/sampling은 Reporter 내부 책임.

**Default**: `console.warn` (PR #286 7.3 유지).

**대안 검토**:
| 대안 | 기각 사유 |
|------|-----------|
| PR #286 `onHotError` 그대로 유지 | eviction/stampede 에러 통로 없음 |
| async Reporter | 비동기 ordering 복잡 |
| try/catch 보호 없음 | Reporter 구현 결함이 DCS 멈춤 야기 |

---

### D10: `__cacheMeta` 확장 — `lastAccessedAt` + batch update 전략

**결정**: `createTtlMeta()` 결과에 `lastAccessedAt: number` 필드 추가. load 시점 in-memory pending Map에만 기록 (IDB write 회피). 3가지 trigger 우선순위로 batch flush.

**Write amplification 회피**:

- **In-memory pending Map**: `Map<itemKey, lastAccessedAt>` (DCS 인스턴스별)
- **load 시점**: pending Map에만 기록 (IDB write 없음, O(1) 메모리)
- **flush 시점 우선순위** (단일 flush job, 중복 방지):

| Trigger             | 시점                             | 우선순위       | 비고                                 |
| ------------------- | -------------------------------- | -------------- | ------------------------------------ |
| **A (Primary)**     | onAfterWrite 직전                | 항상 시도      | `isFlushing` 플래그로 중복 진입 방지 |
| **B (Fallback)**    | idle timer (예: 60초)            | A 미발생 시    | A 발생 시 timer reset                |
| **C (Last Resort)** | visibility hidden / beforeunload | 페이지 이탈 시 | 동기적 flush 시도, 실패 허용         |

**중복 방지**: `isFlushing: boolean` 플래그. flush 진행 중 trigger 발생 시 skip.

**LRU 판정**: EvictionStrategy는 IDB의 `lastAccessedAt` 우선 + pending Map 최신값 병합 (in-memory가 더 신선).

**앱 재시작 시**: pending Map만 소실, IDB flush 값 유지. 일부 부정확하나 LRU 근사로 수용.

**대안 검토**:
| 대안 | 기각 사유 |
|------|-----------|
| load마다 IDB write 즉시 | chat 1000개 채널 read 시 1000개 write 비용 폭증 |
| FIFO (`lastSyncedAt` 활용) | 빈번한 read 항목도 오래되면 삭제 → hit rate 저하 |
| 메모리 Map만 | 앱 재시작 시 모두 소실 |

---

### D11: 정책 주입 = DCS 생성 시점 + `Readonly<T>` inspector

**결정**: `DynamicCacheStorageOptions`에 4개 옵션 주입. per-call options에서는 정책 override 불가. 테스트용 read-only inspector getter 제공.

**Default fallback**: 4개 옵션 모두 선택적(`?`). 미주입 시 spec 제공 default 구현체 사용 (D5는 prod throw, 나머지는 무한/no-op fallback).

**Inspector**:

```typescript
getPolicyResolver(): Readonly<PolicyResolver>;
getCapacityPolicy(): Readonly<CapacityPolicy>;
getEvictionStrategy(): Readonly<EvictionStrategy>;
getReporter(): Readonly<CacheErrorReporter> | undefined;
```

TypeScript `Readonly<T>` 반환 → 호출자가 메서드 호출만 가능 + 객체 mutation 차단. 런타임 강제는 `Object.freeze` (테스트 환경 한정, 선택).

**강제 신선 데이터 우회**: Repository의 `cachePolicy='network-only'`로 PolicyResolver 우회 가능.

**대안 검토**:
| 대안 | 기각 사유 |
|------|-----------|
| Per-call options override | API 표면 증가 + 호출자 책임 분산 |
| Override 전면 불허 | 테스트/특수 케이스 유연성 부족 |
| 전역 싱글톤 주입 | 테스트 격리 곤란 |
| Inspector 미제공 | 테스트에서 정책 동작 검증 시 mock 어댑터 우회 필요 |

---

## Known Gaps

본 spec의 인터페이스만 정의되고 **구체 값/구현은 앱팀 후속 PR로 결정**해야 할 항목:

| ID    | 위임 대상                            | 위임 인터페이스                                                               |
| ----- | ------------------------------------ | ----------------------------------------------------------------------------- |
| TBD-1 | type별 capacity cap 수치             | `CapacityPolicy.getLimit(type)`                                               |
| TBD-2 | type별 readPolicy/loadAllPolicy 분류 | `PolicyResolver` (baseline 권장값 없음, 단 `Join.readNo` 자주 변경 정보 참고) |
| TBD-3 | chat per-channel 그룹핑 키 추출      | `CapacityPolicy.getGroupKey('chat', item)`                                    |
| TBD-4 | Startup TTL sweep 실행 방식          | `EvictionStrategy.onStartup` (background / `requestIdleCallback` / lazy 등)   |
| TBD-5 | Quota event 감지 방식                | `QuotaExceededError` 외 Native bridge 응답 처리 여부                          |
| TBD-6 | `STAMPEDE_TIMEOUT_MS = 5000` 적정성  | 운영 측정 후 조정                                                             |

**L2 inversion에서 발견 (구현 책임이지만 명시)**:

- **cold-first 다발 type의 성능 영향**: 본 spec 책임 아님(PolicyResolver 주입 시 앱팀 결정). 단 cold-first 채택 시 stampede 가드(D4) 효과가 더 중요해진다는 점만 명시.

**L2 critic에서 발견**:

- **인터페이스 freeze 기준**: 본 spec 승인 후 인터페이스 변경 시 앱팀 영향. 승인 후 freeze, 변경 필요 시 별도 spec.

---

## Non-goals (본 spec 범위 밖)

| 항목                                                          | 이유                                               |
| ------------------------------------------------------------- | -------------------------------------------------- |
| TTL 처리 정책 전반                                            | PR #286 9절에서 향후 확장으로 명시됨               |
| NativeDBAdapter의 bridge retry/에러 분류                      | 어댑터 자체 책임, `db-adapter-refactoring.md` 소관 |
| 앱 시작 시 전체 warm-up / schema versioning                   | PR #286 9절 향후 확장                              |
| `DynamicCacheStorage` 본체의 기본 read/write/delete 흐름      | PR #286에 이미 명세됨                              |
| 웹 브라우저 환경 (`IndexedDbOnlyCacheStorageStrategy`)의 동작 | 변경 없음                                          |

---

## 관련 문서

- [`./overview.md`](./overview.md) — 책임 분리 + 앱팀 체크리스트
- [`./interfaces.md`](./interfaces.md) — 인터페이스 명세 (구현자용)
- [`../hot-cold-cache-strategy.md`](../hot-cold-cache-strategy.md) — PR #286 원본 명세
- 내부 작업 기록: `specs/hot-cold-cache-hardening/spec.md` (인터뷰/비판 과정)
