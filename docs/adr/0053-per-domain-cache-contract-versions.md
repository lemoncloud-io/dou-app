# ADR-0053: 캐시 배포 스큐 게이트를 도메인별 계약 버전으로 재설계

> 상태: Accepted · 결정일: 2026-08-14
> · [ADR-0051](0051-cache-storage-routing-simplification.md)이 만든 스큐 게이트의 판정 기준을 대체
> · [ADR-0051](0051-cache-storage-routing-simplification.md) 결정 1의 `createWebInviteCloudStorage` 존치를 대체
> · [ADR-0052](0052-invite-local-cache-and-native-table.md)가 그 게이트를 처음 통과시킨 뒤의 후속
> · [ADR-0030](0030-app-runtime-cold-db-migration-and-invite-cloud-recovery.md)의 웹→네이티브 이관 다리를 회수

## 맥락 (Context)

ADR-0051이 "이 캐시 타입은 어디에 저장되는가"를 [cacheStorageRouting.ts](../../libs/app-runtime/src/data/cacheStorageRouting.ts)
한 곳으로 모았고, 그 판정의 한 축인 배포 스큐 게이트를
[nativeCacheSupport.ts](../../libs/app-runtime/src/data/nativeCacheSupport.ts)가 담당한다. 현재
게이트는 **서로 다른 세 가지 메커니즘의 조합**이다:

- **`LEGACY_NATIVE_CACHE_TYPES`** — 이미 출시된 모든 앱이 저장 가능한 8종의 동결 집합. 보고보다
  먼저 검사되어, 미보고(구버전) 앱에서도 이 타입들은 네이티브로 간다.
- **`supportedCacheTypes`** — 앱이 핸드셰이크로 보내는 타입 **이름 목록**
  ([CacheCrudService.ts](../../apps/mobile/src/app/services/cache/CacheCrudService.ts)의
  `SUPPORTED_CACHE_TYPES`). legacy 집합에 없는 타입은 이 목록으로만 켜진다.
- **`cacheSchemaVersion` + `MIN_SCHEMA_VERSION_BY_TYPE`** — 앱이 보내는 **전역** SQLite
  `PRAGMA user_version` 목표치와, 웹이 타입별로 요구하는 그 전역값의 하한.

### 발단 — on → off → on 질문

"어떤 도메인(예: `profile`)을 캐시 타입에서 해제했다가 다음 버전에 다시 도입하면, 첫 버전에 머문
사용자가 최신 웹을 볼 때 웹이 '사용 가능'으로 판단해 수행하지 않느냐"는 질문에서 출발했다.
검토 결과 이 시나리오는 실재하며, 원인은 개별 버그가 아니라 판정 기준의 구조에 있다.

### 결함 1 — `supportedCacheTypes`는 미래를 향한 스위치지 과거를 향한 스위치가 아니다

v1 앱은 이미 사용자 손에 있고 앞으로도 영원히 "나 `profile` 지원해"라고 말한다. v2에서 목록을
어떻게 바꾸든 v1이 하는 말은 바뀌지 않는다. 그런데 도메인을 끄고 싶은 이유는 보통 **v1 자신의
네이티브 저장 로직이 틀렸기 때문**이다 — 앱 목록으로는 원리적으로 도달할 수 없는 대상이다.

목록에서 빼는 행위의 실제 효과는 의도와 정반대다. legacy 8종이면 웹이 보고를 보지 않으므로 off
신호가 전달조차 되지 않고, 그 사이 버전의 앱만 `CacheCrudService`의 `default:` 분기로 떨어져
`success: true` + `null`을 답한다 — 에러 없는 **영구 빈 캐시**다. legacy가 아닌 타입이면 off는
실제로 걸리지만, 재도입 시 v1과 v3이 보내는 문자열이 똑같은 `'profile'`이라 웹이 구별할 수 없다.

### 결함 2 — 판정 기준이 전역 카운터라 도메인에 대해 아무 의미도 담지 못한다

`MIN_SCHEMA_VERSION_BY_TYPE['profile'] = 12`에서 12는 profile과 무관한 숫자다. 다른 도메인의
마이그레이션 때문에 오른 값일 수 있다. `TARGET_VERSION`이
`Math.max(...Object.keys(MIGRATIONS)) + 1`([schema.ts:293](../../apps/mobile/src/app/database/sqlite/schema.ts))
이므로, 관계없는 변경이 모든 도메인의 기준값을 함께 밀어올린다.

파생 증상으로, 스키마 변경 없이 구버전 앱만 배제하고 싶을 때 **번호를 올리기 위한 no-op
마이그레이션**을 넣어야 한다. 게이트를 걸려고 물리 DB를 건드리는 셈이다.

### 결함 3 — 물리 DB 개념으로 논리 계약을 협상한다

`cacheSchemaVersion`은 문자 그대로 `PRAGMA user_version`이다. 그러나 실제로 묻고 싶은 것은
"이 앱이 profile을 웹이 기대하는 방식으로 다루는가"라는 **계약**이다. 둘은 다른 층위이고, 이
혼동이 다음 결함의 원인이기도 하다.

### 결함 4 — 앱의 보고가 정직하지 않다

[useBaseBridge.ts:27](../../apps/mobile/src/app/webview/hooks/useBaseBridge.ts)은 컴파일타임
상수를 보낸다:

```ts
cacheSchemaVersion: TARGET_VERSION,
```

한편 [SqliteDatabase.ts](../../apps/mobile/src/app/database/sqlite/SqliteDatabase.ts)의
`initTables`는 실패를 `catch`로 삼키고, 실제 `user_version`은 그 함수 밖으로 한 번도 나오지
않는다. 즉 마이그레이션이 실패해도 앱은 **도달한 버전이 아니라 의도한 버전**을 보고한다. 지금은
마이그레이션이 `CREATE TABLE IF NOT EXISTS`뿐이라 드러나지 않지만, 게이트가 이 값을 신뢰하는 한
잠재적 거짓말이다.

### 결함 5 — 게이트의 실패 모드가 도메인마다 같지 않다고 전제되어 있지 않다

현재 코드는 게이트의 오판을 안전하다고 본다 — _"an early read is never WRONG, only conservative"_.
게이트가 틀리면 네이티브 대신 웹 저장소로 우회할 뿐이고, 그 도메인은 서버 재동기화로 다시 채워지기
때문이다. **이 전제는 `invitecloud`에서만 거짓이다.**

`invitecloud`는 서버에 목록 API가 없어 **캐시가 곧 권위인 유일한 타입**이다
([invitedCloudDurability.ts:56](../../libs/app-runtime/src/data/invitedCloudDurability.ts) —
_"the only local-only cache type (no server list API)"_). 저장소를 옮기면 행이 채워지지 않고
**사라진다.** 복구 경로는 `issueCloudDelegationToken(cloudId)` 하나인데 그 `cloudId`가 잃어버린 행
안에 있었고, `recoverInvitedCloudIfMissing`은 푸시가 그 cid를 지목할 때만 도는 반응형이라 목록을
되살리지 못한다.

그래서 웹→네이티브 전환 때 `migrateInvitedCloudsIntoNativeStore`라는 **일회성 이관 다리**가 따로
필요했다. 즉 이 도메인에서 저장소 이동은 게이트가 알아서 흡수하는 사건이 아니라, 데이터를 들고
건너가는 별도 작업이 전제된 사건이다.

이 축이 없으면 판번호 정책을 도메인 무관하게 세우게 되고, `invitecloud`의 하한선을 무심코 올리는
순간 구버전 사용자의 초대 클라우드를 조용히 날린다.

### 이관 다리는 3주째 돌았고 이제 회수할 시점이다

시드 플래그(`chatic-invitecloud-cold-seeded`)가 처음 랜딩한 것은 `1ea458a1`(2026-07-24)이고, 이
마이그레이션은 앱 바이너리가 아니라 **웹 번들**에 있다 — 앱스토어 업데이트와 무관하게 사용자가 앱을
한 번 열기만 하면 실행된다. 3주간 활성 사용자는 사실상 모두 소진됐다고 본다.

### 지금이 바꾸기 가장 싼 시점이다

`MIN_SCHEMA_VERSION_BY_TYPE`는 **아직 비어 있다.** 프로덕션에서 버전 게이트를 건 전례가 0이라
이전할 기존 항목이 없다. ADR-0052로 `invite`가 막 추가되어 도메인이 계속 늘어날 참이므로,
지금 기준을 바꾸는 비용이 앞으로 중 가장 낮다.

## 결정 (Decision)

### 1. 앱은 도메인별 계약 버전을 보고한다

핸드셰이크 페이로드([system.ts](../../libs/app-messages/src/types/model/system.ts)의
`OnWebAppReadyPayload`)에 optional 필드를 추가한다.

```ts
// libs/app-messages — 타입만 공유한다. 값은 양쪽이 독립 선언한다.
export type CacheDomainVersions = Partial<Record<CacheType, number>>;

cacheDomainVersions?: CacheDomainVersions;
```

앱은 자신이 **구현한** 판을, 웹은 자신이 **요구하는** 판을 각각 선언한다. 같은 상수를 양쪽이
import하면 협상이 아니게 되므로 값은 공유하지 않는다.

### 2. 세 메커니즘을 비교 하나로 접는다

앱의 판번호는 **세 근거의 최댓값**으로 읽는다. 그래서 `supportedCacheTypes` 목록과 frozen 집합이
계약 버전 맵에 흡수되고, 전역 `cacheSchemaVersion` 기준 판정은 사라진다.

```ts
// frozen 8종은 1판이 보장된다. 이름만 보고하는 구버전 앱도 1판으로 읽는다.
const legacyVersion = (type: CacheType) => (LEGACY_NATIVE_CACHE_TYPES.has(type) ? 1 : 0);
const reportedByName = (type: CacheType) => (support?.types.has(type) ? 1 : 0);

const appVersion = (type: CacheType) =>
    Math.max(support?.domainVersions[type] ?? 0, reportedByName(type), legacyVersion(type));

export const isNativeCacheTypeUsable = (type: CacheType): boolean =>
    appVersion(type) >= (REQUIRED_DOMAIN_VERSION[type] ?? 1);
```

**`reportedByName`이 전환을 무해하게 만든다.** 웹이 앱보다 먼저 배포되므로, 새 웹이 마주치는 앱은
대부분 `cacheDomainVersions`를 보내지 않고 `supportedCacheTypes`만 보낸다. 새 필드만 읽으면 그
앱들의 `invite`가 0판으로 떨어져 이미 네이티브에 잘 쓰고 있던 도메인이 웹 저장소로 밀려난다 —
순수한 회귀다. 이름만 있는 보고를 1판으로 환산하면 전환 시점에 라우팅이 **한 건도 바뀌지 않는다.**

`LEGACY_NATIVE_CACHE_TYPES`도 **존치하고 의미가 바뀌지 않는다** — 미보고 시의 기본값이 아니라
**하한선(floor)**이다. 현재 코드가 legacy 집합을 보고보다 먼저 검사해 얻고 있는 보장,

> The report can only ever ADD types, never take one away.

를 `Math.max`가 그대로 유지한다. 배선 버그나 잘린 페이로드로 앱이 도메인을 빠뜨려도 legacy 8종은
네이티브에서 밀려나지 않는다. 결함 5에서 보듯 `invitecloud`에서 이 보장이 깨지면 우발적
미보고 한 번이 초대 클라우드 소실로 직결된다.

**초기 판번호는 전 도메인 1이다.** 판번호는 "이 도메인의 계약이 몇 번째 판인가"이지 도메인이
추가된 시점이나 전역 스키마 번호와 무관하다. `invite`가 가장 최근에 추가됐지만 그 계약은 아직 한
번도 바뀌지 않았으므로 1판이다. 2판은 실제로 계약이 바뀌어 구버전 앱을 배제해야 할 때 처음 등장한다.

### 3. 로컬 권위 도메인은 게이트 대상에서 제외한다

floor는 **우발적** 미보고를 막지만 **의도적** 하한 상향은 막지 못한다(floor 1에 required 2면
여전히 밀려난다). 서버 재구성이 불가능한 도메인을 따로 명시하고, 하한선을 두는 것 자체를 금지한다.

```ts
// 서버에 목록 API가 없어 캐시가 곧 권위인 도메인. 저장소를 옮기면 데이터가 사라지고
// 서버 재동기화로 복구되지 않는다 — 게이트로 이동시키지 않는다.
const LOCAL_AUTHORITY_CACHE_TYPES: ReadonlySet<CacheType> = new Set(['invitecloud']);
```

`invitecloud`의 판번호는 **1로 고정하며 올리지 않는다.** `REQUIRED_DOMAIN_VERSION`에 이 집합의
도메인이 등장하지 않는다는 것을 테스트로 고정한다.

도메인 분류는 다음과 같다.

| 구분             | 도메인                                                        | 게이트 오판 시               | 판번호 정책       |
| ---------------- | ------------------------------------------------------------- | ---------------------------- | ----------------- |
| 서버 재구성 가능 | channel · chat · user · join · site · profile · meta · invite | 내구성 하락, 재동기화로 복구 | 상향 가능         |
| 로컬 권위        | **invitecloud**                                               | **소실, 복구 불가**          | 1 고정, 상향 금지 |

`invite`는 ADR-0052가 stale-while-revalidate로 못박아 `invite.list`가 항상 재검증하므로 위쪽이다.
`meta`는 sync cursor라 잃어도 전체 재동기화 1회 비용으로 끝난다.

### 4. 로컬 권위 도메인의 저장소 이동은 이관 다리를 전제 조건으로 한다

그럼에도 옮겨야 한다면, `migrateInvitedCloudsIntoNativeStore` 같은 일회성 이관 다리가 **선행
조건**이다. 사후 보완이 아니다. 다리 없이 라우팅만 바꾸는 변경은 이 집합의 도메인에 대해 금지한다.

### 5. 웹→네이티브 이관 다리를 제거한다

맥락에 적은 대로 3주간 웹 번들로 배포되어 활성 사용자를 소진했다고 보고 회수한다.

**제거** — `migrateInvitedCloudsIntoNativeStore`, `useInvitedCloudMigration`, `SEED_FLAG_KEY`와
`hasSeeded`/`markSeeded`([invitedCloudDurability.ts](../../libs/app-runtime/src/data/invitedCloudDurability.ts)) ·
`createWebInviteCloudStorage`([localFactory.ts:70](../../libs/app-runtime/src/data/factories/localFactory.ts) —
유일 소비처가 사라지므로, ADR-0051 결정 1의 "존치"를 여기서 되돌린다) · 배럴 export
([index.ts:59](../../libs/app-runtime/src/index.ts)) · 호출처
([InvitedCloudDurabilityRunner.tsx:28](../../apps/web/src/app/runtime/InvitedCloudDurabilityRunner.tsx)) ·
`invitedCloudDurability.test.ts`의 해당 describe와 `public-surface.test.ts`의 export 목록.

**존치** — `recoverInvitedCloudIfMissing`, `syncInvitedCloudName`, `useInvitedCloudNameSync`.
마이그레이션이 아니라 상시 복구·동기화이고, 특히 `recoverInvitedCloudIfMissing`은 다리를 걷은 뒤
남는 **유일한 안전망**이라 중요도가 올라간다.

localStorage의 `chatic-invitecloud-cold-seeded` 값은 남지만 읽는 코드가 사라지므로 무해하다. 별도
청소를 하지 않는다 — 청소 코드가 곧 새로운 일회성 코드다.

이 제거의 결과로 **웹↔네이티브 이관 다리는 더 이상 존재하지 않는다.** 결정 4가 요구하는 다리는
앞으로 새로 작성해야 한다.

### 6. 판번호의 의미를 규정한다 — 올린다 = 구버전 웹과 호환된다

비교가 `>=` 단방향이므로 "이 판 이상"은 표현하지만 "너무 최신은 안 됨"은 표현하지 못한다. 웹이
앱보다 먼저 배포되는 구조상 앱이 더 최신인 상황은 드물지만(웹 롤백 시 발생), 기계로 막는 대신
규율로 고정한다:

> **판번호를 올리는 변경은 구버전 웹과 호환되어야 한다.** 구버전 웹을 깨는 변경이라면 판번호를
> 올리는 것이 아니라 새 `CacheType`을 만든다.

### 7. `SUPPORTED_CACHE_TYPES`(및 그 후신인 앱 측 버전 맵)는 추가 전용으로 다룬다

기존 도메인을 앱 목록에서 빼는 행위는 금지한다. 도메인 배제가 필요하면 **웹 측 레버**로만 한다
(단 결정 3의 로컬 권위 도메인은 어느 레버로도 배제하지 않는다):

- **정상 경로** — `REQUIRED_DOMAIN_VERSION[type]`을 올려 하한선을 긋는다. 단조 증가라 되돌릴 일이
  없고, on→off→on이라는 개념 자체가 성립하지 않는다.
- **긴급 경로** — `WEB_PINNED_CACHE_TYPES`. 앱 릴리스를 기다릴 수 없을 때 웹 배포만으로 전 버전
  즉시 off. `profile`이 네이티브 writer의 uid 덮어쓰기 버그 때 실제로 이 경로를 썼고, 고친 앱이
  나간 뒤 빠졌다. 임시방편으로만 유지한다(네이티브 내구성을 IndexedDB로 낮춘다).

### 8. 앱의 보고를 실측 기반으로 바꾼다

도메인 판번호는 마이그레이션이 **성공한 뒤 실제 DB 상태에서 도출한다.** 컴파일타임 상수를 그대로
내보내지 않는다. 도메인별로 쪼개면 판정 단위가 테이블이라 실측이 오히려 쉬워진다.

`cacheSchemaVersion`은 계속 보내되(디버깅·로깅 가치가 있다) **라우팅 판정에서는 읽지 않는다.**

### 9. 하위 호환 — 양방향 모두 챙긴다

**구버전 웹 + 신버전 앱** — 캐시된 구버전 웹 번들이 `supportedCacheTypes`/`cacheSchemaVersion`을
읽으므로 앱은 세 필드를 모두 송신한다. 구 필드 제거는 별건으로 다룬다.

**신버전 웹 + 구버전 앱** — 이쪽이 웹 선배포 구조에서 훨씬 흔한 조합이고, 결정 2의
`reportedByName`이 담당한다. 이름만 보고하는 앱을 1판으로 환산하므로 전환 시점의 라우팅 결과가
바뀌지 않는다. 이 무변화를 테스트로 고정한다 — 전환 전후 `resolveCacheBackend`의 전 타입 × 보고
형태 매트릭스가 동일해야 한다.

### 범위

**포함** — `CacheDomainVersions` 타입과 핸드셰이크 필드, `AppBridgeHost` 배선, 앱 측 도메인 버전
맵과 실측 도출, 웹 `REQUIRED_DOMAIN_VERSION`과 `isNativeCacheTypeUsable` 재작성(floor 의미 유지),
`LOCAL_AUTHORITY_CACHE_TYPES` 도입과 그 도메인이 게이트되지 않음을 고정하는 테스트,
`MIN_SCHEMA_VERSION_BY_TYPE` 제거, 웹→네이티브 이관 다리 제거(결정 5의 목록), 라우팅 테이블 테스트
갱신, [cache-storage-routing.md](../../libs/app-runtime/docs/data/cache-storage-routing.md)와
[invite-cloud-durability.md](../../libs/app-runtime/docs/data/invite-cloud-durability.md) 갱신.

**제외** — `supportedCacheTypes`/`cacheSchemaVersion` 필드의 제거(하위 호환 기간 종료 후),
`WEB_PINNED_CACHE_TYPES`의 존폐, SQLite 마이그레이션 실패 자체의 복구 전략(보고 정직성만 다룬다),
`invitecloud`의 서버 목록 API 신설(있다면 로컬 권위 분류 자체가 해소되지만 백엔드 작업이다),
ADR-0036 데이터 레이어 리팩토링과의 병합.

## 대안 (Alternatives)

- **현행 유지 — `MIN_SCHEMA_VERSION_BY_TYPE`로 충분하다** — 라우팅 **결과**는 동일하다. 이미
  도메인별 판정이고, 하한선을 그으면 구버전 앱을 배제할 수 있다. 그러나 기준값이 전역이라 숫자가
  의미를 담지 못하고, no-op 마이그레이션 꼼수가 남으며, 물리 DB 버전에 계약이 묶인 채로 있다.
  맵이 비어 있는 지금이 아니면 이전 비용만 커진다. 기각.
- **`SUPPORTED_CACHE_TYPES`에서 도메인을 제거해 끈다** — 이 ADR의 발단이 된 방식. 과거 앱에
  도달하지 못하고, legacy 타입에는 무효이며, 중간 버전에 영구 빈 캐시를 만든다. 기각.
- **`WEB_PINNED_CACHE_TYPES`로 껐다 켜기를 정규 경로로 삼는다** — 웹 단독 배포라 즉시 적용되고
  앱 스큐가 0이다. 그러나 신버전까지 함께 끄고 native 내구성을 포기하며, 부울 상태라 재도입 시
  구버전 구별 문제가 그대로 남는다. **긴급 킬스위치로만 부분 채택.**
- **도메인별로 min/max 범위를 보고한다** — `>=` 단방향의 한계를 기계로 막는다. 현재 규모에
  과설계이고, 규율(결정 6)로 같은 효과를 얻는다. 기각.
- **판번호를 `libs/app-messages`의 공유 상수로 둔다** — 드리프트가 없다. 양쪽이 같은 값을 보면
  협상이 성립하지 않는다(앱은 구현한 것을, 웹은 요구하는 것을 말해야 한다). 타입만 공유한다. 기각.
- **이름 재사용을 포기한다(`profile` → `profile2`)** — 가장 단순하고 실수 여지가 없다. `CacheType`
  유니온에 묘비가 쌓이고, 데이터 이관이 도메인마다 일회성 코드로 남는다. 판번호로 같은 효과를
  얻으므로 기각(단, 결정 6에 따라 **구버전 웹을 깨는 변경**에서는 여전히 이 경로가 정답이다).
- **`LEGACY_NATIVE_CACHE_TYPES`를 하한선이 아니라 미보고 시의 기본값으로 둔다** — 판번호 하나로
  모든 판정이 끝나 규칙이 가장 단순하다. 보고가 legacy 판정을 **낮출 수 있게** 되어, 배선 버그나
  잘린 페이로드 한 번이 `invitecloud`를 웹 저장소로 보내고 초대 클라우드를 소실시킨다. 현재 코드가
  legacy를 먼저 검사해 얻고 있는 보장을 잃는다. 기각 — 이 ADR의 초안이 택했다가 되돌린 안이다.
- **`invitecloud`도 다른 도메인과 같이 게이트 대상으로 둔다** — 예외 집합이 없어 규칙이 균일하다.
  게이트의 실패 모드가 이 도메인에서만 "복구 가능한 성능 하락"이 아니라 "복구 불가한 소실"이므로
  균일성이 곧 위험이다. 기각.
- **웹→네이티브 이관 다리를 존치한다** — 유지 비용이 effect 하나 + localStorage 읽기 하나로 거의
  0이고, 3주간 앱을 열지 않은 꼬리 집단을 계속 구제한다. 그러나 되살릴 계획 없는 일회성 코드가
  `createWebInviteCloudStorage`라는 라우팅 우회 경로를 함께 붙잡아 두고, 그 경로의 존재가 결정 3·4를
  흐린다. 활성 사용자가 소진됐다는 판단으로 회수한다 — 리스크는 결과 항목에 남긴다.

## 결과 (Consequences)

**얻는 것**

- on→off→on이라는 상태 전이가 사라진다. 단조 증가하는 판번호만 남아 재도입 위험이 원천 소멸한다.
- 판번호가 자기 설명적이 된다 — "profile 계약 2판"이지 "전역 12 이상"이 아니다. 관계없는 도메인의
  마이그레이션이 기준값을 밀어올리지 않는다.
- 게이트 메커니즘이 셋에서 하나로 준다. 신규 캐시 타입 추가 시 선언 지점이 한 곳이다.
- 게이트를 걸기 위해 no-op 마이그레이션을 넣을 필요가 없어진다 — 논리 계약이 물리 DB에서 분리된다.
- 마이그레이션 실패 시 앱이 거짓 보고하던 구멍이 함께 닫힌다(결정 8).
- **`invitecloud`의 특수성이 코드에 명시된다.** 지금까지 "캐시가 곧 권위"라는 사실은 주석과
  이관 다리의 존재로만 암시됐고, 게이트 정책에는 반영돼 있지 않았다. `LOCAL_AUTHORITY_CACHE_TYPES`와
  분류표가 그 지식을 리뷰 가능한 형태로 만든다.
- 죽은 일회성 코드(이관 다리)와 그것이 붙잡고 있던 라우팅 우회 경로(`createWebInviteCloudStorage`)가
  함께 사라져, "저장소는 `resolveCacheBackend`가 정한다"는 ADR-0051의 단일 결정 지점이 회복된다.

**감수할 트레이드오프**

- 핸드셰이크 필드가 한동안 셋으로 늘어난다(구 둘 + 신 하나). 하위 호환 기간 동안의 중복이다.
- 앱 측에 "판번호를 올릴지 말지"라는 판단이 매 변경마다 생긴다. 지금은 목록에 이름만 넣으면 됐다.
  결정 6의 규율이 문서와 리뷰로만 강제되고 타입으로는 강제되지 않는다.
- **이관 다리 제거는 되돌릴 수 없는 방향이다.** 3주간 앱을 열지 않은 사용자의 초대 클라우드는
  IndexedDB에 남은 채 읽히지 않는다. 코드를 되살리면 복구되지만, WebView IndexedDB가 OS에 의해
  비워지고 나면 그마저 불가능하다 — 애초에 네이티브로 옮긴 이유가 그 내구성 부족이다. 활성 사용자
  소진을 근거로 감수하되, 이 판단은 계측이 아니라 경과 기간에 기반한다.
- 다리를 걷은 뒤 `recoverInvitedCloudIfMissing`이 유일한 안전망으로 남는다. 푸시가 cid를 지목할
  때만 도는 반응형이라 목록 복구가 아니다 — 이 격차는 서버 목록 API가 생기기 전까지 해소되지 않는다.
- 실측 도출(결정 8)이 부팅 크리티컬 패스에 DB 조회를 더할 수 있다 — boot-optimization 4.4의
  "핸드셰이크 상수는 SQLite를 열지 않는다"는 현재 성질이 깨진다.

## 아직 정하지 않은 것

- **실측 도출의 구체적 방법과 비용.** 테이블 존재 확인(`PRAGMA table_info` 또는 `sqlite_master`
  조회)을 부팅마다 할지, `initTables` 결과를 메모해 재사용할지. 트레이드오프 마지막 항목과 직결된다.
- **마이그레이션 실패 시의 보고값.** 해당 도메인만 0으로 떨어뜨릴지, 직전 성공 판을 보고할지.
- **`WEB_PINNED_CACHE_TYPES`의 존폐.** 결정 7이 긴급 경로로 남기지만, 판번호 하한선으로 대부분
  대체 가능하다면 유지 근거가 약해진다. 로컬 권위 도메인에는 이 레버도 쓸 수 없다는 점을 반영해야
  한다(웹 저장소로 보내는 것 자체가 소실이다).
- **이관 다리 제거를 계측으로 뒷받침할지.** 지금 근거는 경과 기간(3주)뿐이다. 제거 전에 "옮길 행을
  찾았다"를 한 번 로깅해 0이 지속되는지 확인하는 선택지가 있고, ADR-0047 통합 로깅으로 저비용에
  가능하다. 확인 대기 vs 즉시 제거의 판단이 남아 있다.
- **`invitecloud` 서버 목록 API의 존재 가능성.** 있다면 로컬 권위 분류가 통째로 해소되고 결정 3·4가
  불필요해진다. 백엔드 확인이 필요하다.

## 다음 단계

[[dev-2_implement]] Phase A: 이 ADR을 입력으로 스펙 작성(핸드셰이크 페이로드 정의, 앱 측 버전 맵의
위치와 실측 도출 방식, floor 의미를 유지한 `isNativeCacheTypeUsable` 재작성,
`LOCAL_AUTHORITY_CACHE_TYPES` 도입과 게이트 제외 테스트, 이관 다리 제거 목록과 그에 따른
`invite-cloud-durability.md` 갱신, 도메인 × 보고 유무 × 판번호 조합 테스트 매트릭스).
